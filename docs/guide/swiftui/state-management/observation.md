---
title: SwiftUI에서 이해하는 @Observable과 Observation
description: '@Observable 매크로의 프로퍼티 접근 기반 추적과 @State, @Bindable, @Environment 사용법, ObservableObject에서의 마이그레이션 기준을 설명합니다.'
pageType: doc-wide
outline: false
---

# SwiftUI에서 이해하는 @Observable과 Observation

> **면접 답변 한 줄 요약:** `@Observable`은 클래스에 Observation 추적 코드를 생성하는 매크로이며, SwiftUI는 `body`가 실제로 읽은 프로퍼티의 변경만 추적하고 소유 모델은 `@State`, 전달 모델은 일반 프로퍼티, Binding이 필요할 때는 `@Bindable`, 환경 공유에는 `@Environment(Type.self)`를 사용해요.

`ObservableObject`와 `@Published`로 만든 모델은 SwiftUI 상태 관리의 오랜 기본 방식이에요. 하지만 프로퍼티마다 `@Published`를 붙이고, 객체를 어디에서 얻는지에 따라 `@StateObject`, `@ObservedObject`, `@EnvironmentObject`를 선택해야 해요.

iOS 17부터 SwiftUI는 Swift Observation 프레임워크와 통합돼요. 모델 클래스에 `@Observable`을 붙이면 저장 프로퍼티에 별도의 `@Published`를 붙이지 않아도 되고, View는 `body`가 실제로 읽은 프로퍼티와 의존 관계를 만들어요.

이 문서는 다음 내용을 설명해요.

- `@Observable` 매크로가 모델에 추가하는 역할
- 프로퍼티 접근 기반 추적이 화면 갱신 범위를 줄이는 방법
- 소유 모델을 `@State`에 저장하는 이유
- 일반 프로퍼티와 `@Bindable`을 구분하는 기준
- `@Environment(Type.self)`로 모델을 공유하는 방법
- `@ObservationIgnored`로 추적에서 제외하는 방법
- `ObservableObject` 코드를 단계적으로 마이그레이션하는 방법

Observation의 SwiftUI 통합은 iOS 17, iPadOS 17, macOS 14, tvOS 17, watchOS 10부터 사용할 수 있어요. 더 낮은 OS를 지원한다면 [ObservableObject와 상태 객체 래퍼](./observable-object) 방식도 유지해야 해요.

## 먼저 알아둘 Observation 용어

| 용어                  | 쉬운 뜻                                                                                                                                                   |
| --------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Observation           | 특정 프로퍼티를 읽은 곳과 그 프로퍼티의 변경을 연결하는 Swift 관찰 시스템이에요. SwiftUI 밖에서도 사용할 수 있어요.                                       |
| `@Observable`         | 클래스의 저장 프로퍼티 접근과 변경을 추적하도록 코드를 생성하고 `Observable` 프로토콜 준수도 추가하는 attached 매크로예요.                                |
| `Observable`          | 타입이 Observation을 지원한다는 표시 프로토콜이에요. 프로토콜만 직접 채택해서는 추적 코드가 생기지 않으므로 모델에는 `@Observable`을 적용해야 해요.       |
| 접근 추적             | 관찰 범위를 미리 모든 프로퍼티로 정하지 않고 실행 중 실제로 읽은 프로퍼티를 기록하는 방식이에요.                                                          |
| source of truth       | 화면이 기준으로 삼는 상태의 원본이에요. SwiftUI가 모델 참조의 저장소를 관리해야 한다면 `@State`로 만들어요.                                               |
| `@Bindable`           | `Observable` 모델의 쓰기 가능한 프로퍼티에서 `Binding`을 만들게 해 주는 SwiftUI 프로퍼티 래퍼예요. 객체의 소유권을 만들지는 않아요.                       |
| `@Environment`        | View 계층의 환경에서 key path 또는 타입을 기준으로 값을 읽는 SwiftUI 프로퍼티 래퍼예요. Observation 모델은 타입 자체를 key처럼 사용할 수 있어요.          |
| `@ObservationIgnored` | 접근 가능한 프로퍼티를 Observation 추적 대상에서 제외하는 매크로예요. 캐시나 진단용 값처럼 화면 갱신과 무관한 저장 공간에 사용할 수 있어요.               |
| 매크로 확장           | `@Observable` 사용을 컴파일러가 일반 Swift 선언과 접근 코드로 펼치는 과정이에요. 매크로 기본 원리는 [Swift 매크로](../../swift/macros) 문서에서 설명해요. |

## ObservableObject 방식은 객체 단위로 변경을 알려요

먼저 기존 방식을 다시 볼게요. 독서 상태를 `ObservableObject`로 만들면 화면에 반영할 각 저장 프로퍼티에 `@Published`를 붙여요.

```swift
import Combine

@MainActor
final class ReadingStore: ObservableObject {
  @Published private(set) var completedMinutes = 0
  @Published var dailyGoal = 30
  @Published var note = ""

  func record(minutes: Int) {
    completedMinutes += max(minutes, 0)
  }
}
```

이 모델의 published 프로퍼티가 바뀌면 `objectWillChange`가 이벤트를 보내요. `@StateObject`, `@ObservedObject`, `@EnvironmentObject`로 모델을 관찰하는 View는 객체 수준의 이벤트를 받고 `body`를 다시 계산할 수 있어요.

예를 들어 한 View가 `completedMinutes`만 화면에 표시하더라도 같은 객체의 `note`가 `@Published` 변경을 보내면 그 객체를 관찰하는 View가 무효화될 수 있어요. 작은 모델에서는 문제가 되지 않지만 프로퍼티가 많고 여러 View가 나눠 읽는다면 변경 범위가 넓어질 수 있어요.

## Observable 매크로는 프로퍼티 추적 코드를 생성해요

같은 모델을 Observation으로 바꾸면 `ObservableObject` 준수와 `@Published`를 제거하고 클래스에 `@Observable`을 붙여요.

```swift
import Observation

@MainActor
@Observable
final class ReadingStore {
  private(set) var completedMinutes = 0
  var dailyGoal = 30
  var note = ""

  @ObservationIgnored
  var diagnosticMessage = ""

  var progress: Double {
    guard dailyGoal > 0 else { return 0 }

    return min(
      Double(completedMinutes) / Double(dailyGoal),
      1
    )
  }

  func record(minutes: Int) {
    completedMinutes += max(minutes, 0)
  }
}
```

`@Observable`은 런타임에 주기적으로 프로퍼티를 비교하는 객체가 아니에요. 컴파일할 때 모델의 프로퍼티 접근과 변경을 Observation registrar에 연결하는 코드를 생성하고 `Observable` 프로토콜 준수도 추가해요.

따라서 다음처럼 프로토콜만 직접 적는 것은 충분하지 않아요.

```swift
// 추적 코드를 생성하지 않으므로 이렇게 사용하지 않아요.
final class IncorrectStore: Observable {
  var completedMinutes = 0
}
```

Apple도 Observation 지원을 추가할 때 `Observable` 프로토콜만 직접 채택하지 말고 `@Observable` 매크로를 사용하라고 안내해요.

`@ObservationIgnored`를 붙인 `diagnosticMessage`는 읽고 바꿀 수 있지만 그 접근은 View의 Observation 의존성에 포함되지 않아요. 화면과 무관한 캐시, logger, 진단 카운터를 추적에서 제외할 수 있지만 실제 UI를 결정하는 값을 제외하면 화면이 갱신되지 않으므로 목적을 명확히 해야 해요.

## SwiftUI는 body가 실제로 읽은 프로퍼티를 추적해요

Observation의 핵심은 **객체 전체를 구독하는 대신 View 계산에서 접근한 프로퍼티를 기록한다**는 점이에요.

```swift
struct CompletedMinutesView: View {
  let store: ReadingStore

  var body: some View {
    Text("완료: \(store.completedMinutes)분")
  }
}

struct GoalView: View {
  let store: ReadingStore

  var body: some View {
    Text("목표: \(store.dailyGoal)분")
  }
}
```

각 View의 의존 관계를 나누면 다음과 같아요.

```text
CompletedMinutesView.body
└─ store.completedMinutes를 읽음
   └─ completedMinutes가 바뀔 때 갱신

GoalView.body
└─ store.dailyGoal을 읽음
   └─ dailyGoal이 바뀔 때 갱신
```

`store.note`가 바뀌어도 두 View의 `body`는 그 프로퍼티를 읽지 않았으므로 해당 변경만으로 갱신되지 않아요. 반대로 `Text(store.note)`를 추가하면 그 View는 `note`에도 의존하게 돼요.

이 추적은 프로퍼티 이름을 소스에서 단순 검색한 결과가 아니에요. `body`가 실행되는 동안 실제 접근을 기록해요. 조건에 따라 읽는 프로퍼티가 달라지거나 계산 프로퍼티가 다른 observable 프로퍼티를 읽는 경우에도 실행된 접근을 기준으로 관계를 만들어요.

```swift
struct ProgressViewCard: View {
  let store: ReadingStore

  var body: some View {
    VStack {
      Text("진행률")
      ProgressView(value: store.progress)
    }
  }
}
```

`progress` 계산 프로퍼티가 `completedMinutes`와 `dailyGoal`을 읽으므로 둘 중 하나가 바뀌면 `ProgressViewCard`가 갱신돼요.

SwiftUI 밖에서는 `withObservationTracking(_:onChange:)`이 같은 원리를 드러내요. `apply` 클로저에서 접근한 프로퍼티를 기록하고 참여한 값이 바뀌면 `onChange`를 호출해요. SwiftUI는 View 계산에 필요한 등록과 다시 계산하는 과정을 프레임워크 내부에서 처리하므로 일반적인 View 코드가 이 함수를 직접 호출할 필요는 없어요.

## 소유자가 만든 Observable 모델은 State에 저장해요

`ReadingDashboard`가 모델을 만들고 View identity 동안 유지해야 한다면 `@State`를 사용해요.

```swift
import SwiftUI

struct ReadingDashboard: View {
  @State private var store = ReadingStore()

  var body: some View {
    VStack(spacing: 16) {
      CompletedMinutesView(store: store)
      ProgressViewCard(store: store)

      Button("10분 기록") {
        store.record(minutes: 10)
      }

      GoalEditor(store: store)
    }
    .padding()
  }
}
```

`@State`는 `ReadingStore`의 참조를 SwiftUI가 관리하는 저장소에 연결해 source of truth를 만들어요. View 값이 다시 생성돼도 identity가 같으면 관리 중인 참조를 다시 제공해요. 모델이 `@Observable`이므로 SwiftUI는 참조 교체뿐 아니라 `body`가 읽은 내부 프로퍼티 변경도 추적해요.

여기서 `@StateObject`를 기계적으로 `@State`의 옛 이름이라고 이해하면 안 돼요.

- `@StateObject`는 Combine의 `ObservableObject`를 저장하고 객체 변경 publisher를 구독해요.
- `@State`는 일반 값의 저장소이며, `@Observable` 참조를 저장하면 Observation 접근 추적과 함께 동작해요.

`@State private var store = ReadingStore()`의 기본값 표현식은 View 값이 초기화될 때 평가될 수 있어요. 네트워크 요청, 파일 읽기, 무거운 객체 그래프 구성 같은 부수 효과를 모델 initializer에 넣지 마세요. 비동기 준비가 필요하면 optional 상태와 `.task` 등을 이용해 View가 나타난 뒤 명시적으로 실행하는 편이 좋아요.

## 전달받은 모델은 일반 프로퍼티로도 관찰돼요

Observation 모델은 자식 View에서 `@ObservedObject`로 감쌀 필요가 없어요. 참조를 일반 저장 프로퍼티로 받고 `body`에서 필요한 값을 읽으면 SwiftUI가 의존성을 추적해요.

```swift
struct ReadingSummary: View {
  let store: ReadingStore

  var body: some View {
    VStack {
      Text("오늘 \(store.completedMinutes)분")
      ProgressView(value: store.progress)
    }
  }
}
```

`ReadingSummary`는 모델을 소유하지 않고 부모가 전달한 참조를 사용해요. `let`이어도 클래스의 쓰기 가능한 프로퍼티는 모델이 허용하는 범위에서 변경할 수 있지만, 읽기 전용 화면이라면 `let`이 입력 의도를 더 잘 보여 줘요.

`@ObservedObject`는 generic constraint가 `ObservableObject`인 기존 시스템의 래퍼예요. `@Observable`만 적용한 모델을 `@ObservedObject`로 감싸면 필요한 프로토콜이 달라 컴파일 오류가 날 수 있어요.

## Binding이 필요할 때만 Bindable을 사용해요

버튼 action에서는 모델 참조만으로 프로퍼티를 바꿀 수 있어요.

```swift
struct QuickRecordButton: View {
  let store: ReadingStore

  var body: some View {
    Button("10분 기록") {
      store.record(minutes: 10)
    }
  }
}
```

하지만 `Stepper`, `TextField`, `Toggle`처럼 `Binding`을 요구하는 컨트롤에는 `$` 투영값이 필요해요. 이때 `@Bindable`로 observable 모델의 쓰기 가능한 프로퍼티에 Binding을 만들어요.

```swift
struct GoalEditor: View {
  @Bindable var store: ReadingStore

  var body: some View {
    Form {
      Stepper(
        "하루 목표: \(store.dailyGoal)분",
        value: $store.dailyGoal,
        in: 10...180,
        step: 10
      )

      TextField("메모", text: $store.note)
    }
  }
}
```

`@Bindable`의 책임은 소유권이나 수명 관리가 아니라 Binding 생성이에요. 이미 부모나 환경에서 받은 객체에 적용하며, `@State`를 대신해 모델을 소유한다고 생각하면 안 돼요.

View 입력은 일반 프로퍼티로 유지하고 `body`의 일부에서만 Binding이 필요하다면 지역 변수로 만들 수도 있어요.

```swift
struct InlineGoalEditor: View {
  let store: ReadingStore

  var body: some View {
    @Bindable var store = store

    Stepper(
      "하루 목표: \(store.dailyGoal)분",
      value: $store.dailyGoal,
      in: 10...180,
      step: 10
    )
  }
}
```

## 환경 공유에는 Environment와 environment를 사용해요

앱이나 상위 View가 만든 Observation 모델을 깊은 계층에 공유하려면 타입 기반 환경 값을 사용할 수 있어요.

```swift
@main
struct ReadingApp: App {
  @State private var store = ReadingStore()

  var body: some Scene {
    WindowGroup {
      ReadingRootView()
        .environment(store)
    }
  }
}
```

하위 View는 `@Environment`에 타입을 전달해 같은 인스턴스를 읽어요.

```swift
struct EnvironmentSummary: View {
  @Environment(ReadingStore.self)
  private var store

  var body: some View {
    Text("오늘 \(store.completedMinutes)분")
  }
}
```

대응 관계를 기존 시스템과 비교하면 다음과 같아요.

| ObservableObject 방식                 | Observation 방식                     |
| ------------------------------------- | ------------------------------------ |
| `.environmentObject(store)`           | `.environment(store)`                |
| `@EnvironmentObject var store: Store` | `@Environment(Store.self) var store` |

`@Environment(ReadingStore.self)`은 기본적으로 해당 타입의 non-optional 인스턴스가 조상 계층에 있다고 가정해요. 주입하지 않으면 View 평가 중 예외가 발생해요. 존재가 선택적이라면 타입을 optional로 선언할 수 있어요.

```swift
struct OptionalEnvironmentSummary: View {
  @Environment(ReadingStore.self)
  private var store: ReadingStore?

  var body: some View {
    if let store {
      Text("오늘 \(store.completedMinutes)분")
    } else {
      Text("독서 기록을 연결하지 않았어요.")
    }
  }
}
```

환경에서 받은 모델의 프로퍼티에 Binding이 필요하면 `body` 안에서 지역 `@Bindable`을 만들어요.

```swift
struct EnvironmentGoalEditor: View {
  @Environment(ReadingStore.self)
  private var store

  var body: some View {
    @Bindable var store = store

    Stepper(
      "하루 목표: \(store.dailyGoal)분",
      value: $store.dailyGoal,
      in: 10...180,
      step: 10
    )
  }
}
```

환경은 편리하지만 의존성이 initializer에 보이지 않는 비용은 그대로예요. 가까운 부모와 자식 사이에서는 일반 프로퍼티 전달을 우선하고, 여러 단계가 실제로 공유하는 모델에 환경을 사용하세요.

## ObservableObject에서 단계적으로 옮겨요

기존 앱 전체를 한 번에 바꿀 필요는 없어요. Apple은 두 관찰 시스템을 앱 안에서 함께 사용하며 모델 단위로 점진적으로 마이그레이션할 수 있다고 설명해요. 다만 하나의 모델을 바꿀 때는 선언과 그 모델을 보관·전달하는 View 코드를 함께 점검해야 해요.

| 기존 ObservableObject 코드               | 완전한 Observation 전환                    | 이유                                               |
| ---------------------------------------- | ------------------------------------------ | -------------------------------------------------- |
| `class Store: ObservableObject`          | `@Observable final class Store`            | 매크로가 추적 코드와 `Observable` 준수를 생성해요. |
| `@Published var goal = 30`               | `var goal = 30`                            | 접근 가능한 저장 프로퍼티를 기본으로 추적해요.     |
| 추적하지 않을 일반 프로퍼티              | `@ObservationIgnored var cache`            | 명시적으로 Observation 추적에서 제외해요.          |
| `@StateObject private var store`         | `@State private var store`                 | SwiftUI가 observable 참조의 저장소를 관리해요.     |
| `@ObservedObject var store`              | `let store: Store` 또는 `var store: Store` | `body`의 프로퍼티 접근을 자동으로 추적해요.        |
| `$store.goal`이 필요한 `@ObservedObject` | `@Bindable var store`                      | observable 프로퍼티의 Binding을 만들어요.          |
| `@EnvironmentObject var store: Store`    | `@Environment(Store.self) var store`       | 타입 기반 환경에서 Observation 모델을 읽어요.      |
| `.environmentObject(store)`              | `.environment(store)`                      | Observation 모델을 조상 환경에 넣어요.             |

### 1단계: 모델 선언을 바꿔요

```swift
// 변경 전
@MainActor
final class ReadingStore: ObservableObject {
  @Published var dailyGoal = 30
}

// 변경 후
@MainActor
@Observable
final class ReadingStore {
  var dailyGoal = 30
}
```

### 2단계: 소유자의 래퍼를 바꿔요

```swift
// 변경 전
@StateObject private var store = ReadingStore()

// 변경 후
@State private var store = ReadingStore()
```

### 3단계: 자식의 입력과 Binding을 구분해요

```swift
// 읽기만 하는 변경 전 코드
@ObservedObject var store: ReadingStore

// 읽기만 하는 변경 후 코드
let store: ReadingStore
```

```swift
// $store.dailyGoal이 필요한 변경 후 코드
@Bindable var store: ReadingStore
```

### 4단계: 환경 주입과 조회를 함께 바꿔요

```swift
// 변경 전
ReadingRootView()
  .environmentObject(store)

// 변경 후
ReadingRootView()
  .environment(store)
```

```swift
// 변경 전
@EnvironmentObject private var store: ReadingStore

// 변경 후
@Environment(ReadingStore.self)
private var store
```

모델 선언만 바꾸고 View의 모든 래퍼를 그대로 두거나, 환경을 넣는 쪽만 `.environment`로 바꾸고 읽는 쪽은 `@EnvironmentObject`로 남기면 두 시스템의 타입 요구사항이 맞지 않을 수 있어요. 컴파일 오류가 나는 지점뿐 아니라 View가 실제로 읽는 프로퍼티와 갱신 범위가 달라지는지도 테스트하세요.

## 두 관찰 시스템의 차이를 정리해요

| 비교 기준          | `ObservableObject`와 `@Published`                  | `@Observable`과 Observation                           |
| ------------------ | -------------------------------------------------- | ----------------------------------------------------- |
| 도입 버전          | iOS 13, `@StateObject`는 iOS 14                    | SwiftUI 통합은 iOS 17                                 |
| 모델 선언          | `ObservableObject` 프로토콜 준수                   | `@Observable` 매크로 적용                             |
| 프로퍼티 표시      | 변경을 알릴 값에 `@Published`                      | 접근 가능한 저장 프로퍼티를 기본 추적                 |
| 변경 전달 단위     | 객체의 `objectWillChange` publisher                | 관찰 중 접근한 프로퍼티                               |
| 소유 View          | `@StateObject`                                     | `@State`                                              |
| 직접 전달받는 View | `@ObservedObject`                                  | 일반 프로퍼티                                         |
| Binding 생성       | `$observedObject.property`                         | `@Bindable`의 `$property`                             |
| 환경 공유          | `.environmentObject`와 `@EnvironmentObject`        | `.environment`와 `@Environment(Type.self)`            |
| Combine publisher  | `objectWillChange`, `$publishedProperty` 사용 가능 | 기본 Observation 자체는 Combine publisher가 아니에요. |
| 최소 OS가 낮은 앱  | 기존 배포 대상에서 계속 사용 가능                  | availability 분기나 기존 방식 유지가 필요해요.        |

`@Observable`이 항상 더 좋은 정답은 아니에요. 최소 지원 OS가 iOS 16 이하이거나 Combine publisher 체인과 직접 연결된 모델이라면 `ObservableObject`를 유지하는 편이 단순할 수 있어요. 반대로 iOS 17 이상에서 새 모델을 만들고 View별 프로퍼티 접근 범위를 좁히고 싶다면 Observation이 자연스러운 기본 선택이에요.

## Observation은 실행 스레드를 자동으로 정하지 않아요

`@Observable`은 변경을 추적하는 코드를 만들지만 모든 mutation을 main actor로 보내지는 않아요. UI와 밀접한 모델을 여러 task에서 변경한다면 격리 규칙을 별도로 정해야 해요.

```swift
@MainActor
@Observable
final class ReadingStore {
  private(set) var completedMinutes = 0

  func record(minutes: Int) {
    completedMinutes += max(minutes, 0)
  }
}
```

`@MainActor`를 붙이면 모델 생성과 접근도 main actor 규칙을 따라요. 네트워크와 파일 처리를 모델 안에서 모두 main actor로 실행하라는 뜻은 아니에요. 무거운 작업은 별도 비동기 서비스에서 수행하고, 결과를 UI 모델에 반영하는 경계만 main actor로 가져오는 구조를 검토하세요.

## 테스트는 모델 결과와 View 의존 범위를 나눠요

모델의 비즈니스 규칙은 Observation 런타임을 직접 다루지 않고도 테스트할 수 있어요.

```swift
import Testing

@Test
@MainActor
func recordsProgressWithObservableStore() {
  let store = ReadingStore()

  store.record(minutes: 15)

  #expect(store.completedMinutes == 15)
  #expect(store.progress == 0.5)
}
```

View 수준에서는 다음을 추가로 확인하세요.

- 한 View가 읽지 않은 프로퍼티 변경 때문에 불필요하게 다시 계산되지 않는지 확인해요.
- `@Bindable`로 만든 `TextField`와 `Stepper` 변경이 원본 모델에 기록되는지 확인해요.
- 환경 기반 View의 Preview와 테스트 root에 `.environment(store)`를 넣어요.
- optional 환경을 사용한다면 모델이 없을 때의 대체 UI도 확인해요.
- 마이그레이션 전후에 화면 갱신 범위가 달라져 숨겨진 부수 효과가 사라지거나 동작이 누락되지 않는지 확인해요.

## 적용 순서를 정리해요

1. 앱의 최소 지원 OS가 Observation의 SwiftUI 통합 버전을 만족하는지 확인해요.
2. 클래스에 `@Observable`을 적용하고 `@Published`를 제거해요.
3. 화면 갱신과 무관한 접근 가능 프로퍼티에는 필요한 경우 `@ObservationIgnored`를 붙여요.
4. 모델을 만드는 View·App·Scene에는 `private @State`로 참조 저장소를 만들어요.
5. 읽기만 하는 자식은 모델을 일반 프로퍼티로 받아요.
6. 컨트롤에 Binding을 전달할 때만 `@Bindable`을 추가해요.
7. 깊은 계층이 공유하는 모델은 `.environment`와 `@Environment(Type.self)`로 함께 바꿔요.
8. 프로퍼티별 갱신, 환경 누락, actor 격리와 기존 Combine 연동을 테스트해요.

## 면접에서 이어질 수 있는 질문

### Observable 매크로와 Observable 프로토콜은 어떻게 다른가요?

`Observable`은 Observation을 지원한다는 표시 프로토콜이고, `@Observable`은 프로퍼티 접근·변경 추적 코드와 그 프로토콜 준수를 생성하는 매크로예요. 프로토콜만 직접 채택해서는 필요한 추적 코드가 생기지 않아요.

### Observable 모델을 자식 View에서 ObservedObject로 감싸지 않는 이유는 무엇인가요?

Observation 모델은 `body`가 프로퍼티를 읽으면 SwiftUI가 자동으로 의존성을 만들어요. `@ObservedObject`는 `ObservableObject` 제약을 가진 기존 Combine 기반 래퍼이므로 읽기만 하는 Observation 모델은 일반 프로퍼티로 전달하면 돼요.

### State와 Bindable은 어떤 역할 차이가 있나요?

`@State`는 소유 View의 identity에 연결된 모델 참조 저장소를 만들고, `@Bindable`은 이미 존재하는 observable 모델에서 프로퍼티 Binding을 만들어요. `@Bindable`은 source of truth나 객체 수명을 만들지 않아요.

### 접근 기반 추적의 장점은 무엇인가요?

View의 `body`가 읽지 않은 프로퍼티가 바뀌었을 때 그 View를 갱신 대상에서 제외할 수 있어요. 큰 모델을 여러 View가 나눠 읽을 때 객체 전체 알림보다 의존 범위를 구체적으로 만들 수 있어요.

### ObservableObject를 한 번에 모두 바꿔야 하나요?

아니요. 앱 안에서 기존 모델과 Observation 모델을 함께 사용할 수 있어 모델 단위로 옮길 수 있어요. 다만 바꾸는 모델의 소유 래퍼, 자식 입력, Binding과 환경 주입은 같은 관찰 시스템에 맞게 함께 점검해야 해요.

## 참고 자료

- [Apple Developer — Observation](https://developer.apple.com/documentation/observation)
- [Apple Developer — Observable()](<https://developer.apple.com/documentation/observation/observable()>)
- [Apple Developer — ObservationIgnored()](<https://developer.apple.com/documentation/observation/observationignored()>)
- [Apple Developer — withObservationTracking(_:onChange:)](<https://developer.apple.com/documentation/observation/withobservationtracking(_:onchange:)>)
- [Apple Developer — Managing model data in your app](https://developer.apple.com/documentation/swiftui/managing-model-data-in-your-app)
- [Apple Developer — Migrating from the Observable Object protocol to the Observable macro](https://developer.apple.com/documentation/swiftui/migrating-from-the-observable-object-protocol-to-the-observable-macro)
- [Apple Developer — State](https://developer.apple.com/documentation/swiftui/state)
- [Apple Developer — Bindable](https://developer.apple.com/documentation/swiftui/bindable)
- [Apple Developer — Environment](https://developer.apple.com/documentation/swiftui/environment)
- [Swift-KR — ObservableObject와 상태 객체 래퍼](./observable-object)
- [Swift-KR — Swift 매크로](../../swift/macros)
