---
title: SwiftUI ObservableObject와 상태 객체 래퍼
description: ObservableObject와 @StateObject, @ObservedObject, @EnvironmentObject의 소유권·생명주기·전달 방식과 선택 기준을 SwiftUI 예제로 설명합니다.
pageType: doc-wide
outline: false
---

# SwiftUI ObservableObject와 상태 객체 래퍼

> **면접 답변 한 줄 요약:** `ObservableObject`는 변경 알림을 보내는 참조형 모델의 약속이고, `@StateObject`는 View가 모델을 생성해 소유할 때, `@ObservedObject`는 외부 모델을 직접 전달받을 때, `@EnvironmentObject`는 조상 View가 환경으로 주입한 모델을 읽을 때 사용해요.

SwiftUI 화면에서 여러 값이 함께 바뀌거나 여러 하위 View가 같은 데이터를 사용하면 상태를 클래스 하나에 모으고 싶을 수 있어요. 이때 `ObservableObject`, `@StateObject`, `@ObservedObject`, `@EnvironmentObject`가 한꺼번에 등장해요.

네 이름은 비슷하지만 같은 종류가 아니에요. `ObservableObject`는 모델이 변경 알림을 제공한다는 **프로토콜**이고, 나머지 세 개는 SwiftUI View가 그 모델을 어떤 경로로 얻고 관찰하는지 나타내는 **프로퍼티 래퍼**예요.

이 문서는 독서 목표를 기록하는 앱을 예로 들어 다음 질문에 답해요.

- 어떤 프로퍼티가 바뀌었다고 SwiftUI에 알리나요?
- View가 모델을 직접 만들었다면 어떤 래퍼로 수명을 유지하나요?
- 부모가 만든 모델을 자식이 받을 때는 무엇을 사용하나요?
- 여러 단계 아래의 View에 같은 모델을 전달하려면 어떻게 하나요?
- View identity가 바뀌거나 환경 주입을 빠뜨리면 무슨 일이 생기나요?
- iOS 17 이상의 `@Observable`과는 어떻게 다른가요?

## 먼저 알아둘 상태 관리 용어

| 용어              | 쉬운 뜻                                                                                                                                                  |
| ----------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 상태(state)       | 화면의 현재 모습을 결정하는 값이에요. 완료한 독서 시간이나 일일 목표가 달라지면 화면도 달라져요.                                                         |
| 단일 데이터 원천  | 같은 의미의 값을 여러 곳에 복사하지 않고 한 인스턴스를 기준값으로 삼는 원칙이에요.                                                                       |
| 참조 타입         | 클래스처럼 여러 변수가 같은 인스턴스를 가리킬 수 있는 타입이에요. 한 곳에서 프로퍼티를 바꾸면 같은 인스턴스를 가진 다른 곳에서도 바뀐 값을 읽어요.       |
| 관찰(observation) | 모델의 변경을 알아차리고 그 모델에 의존하는 화면을 다시 계산하게 연결하는 일이에요.                                                                      |
| publisher         | Combine에서 값이나 이벤트를 구독자에게 시간 순서대로 전달하는 타입이에요. `ObservableObject`는 변경 직전 이벤트를 publisher로 보내요.                    |
| 프로퍼티 래퍼     | 프로퍼티의 저장과 접근 규칙을 `@이름` 문법으로 적용하는 Swift 기능이에요. 기본 원리는 [Property Wrapper](../../swift/property-wrappers) 문서에서 다뤄요. |
| View identity     | SwiftUI가 이전 View와 새 View를 같은 화면 요소로 연결할 때 사용하는 정체성이에요. identity가 유지되면 SwiftUI가 관리하는 상태 저장소도 이어져요.         |
| 환경(environment) | 조상 View가 넣은 값을 여러 하위 View가 타입이나 key path로 찾을 수 있는 계층형 저장 공간이에요.                                                          |
| Binding           | 값을 읽을 뿐 아니라 원래 저장 위치에 변경을 다시 기록하는 양방향 연결이에요. `$`로 얻는 경우가 많아요.                                                   |
| 소유권            | 여기서는 모델 인스턴스를 누가 만들고 수명을 결정하는지 뜻해요. ARC의 강한 참조 소유권과 연결되지만, SwiftUI 상태 저장소의 책임에 초점을 맞춰 사용해요.   |

## body에서 모델을 만들면 화면 상태를 유지하기 어려워요

가장 먼저 피해야 할 코드는 `body`를 계산할 때마다 모델을 새로 만드는 방식이에요.

```swift
import SwiftUI

final class ReadingStore {
  var completedMinutes = 0

  func record(minutes: Int) {
    completedMinutes += minutes
  }
}

struct ReadingDashboard: View {
  var body: some View {
    let store = ReadingStore()

    VStack {
      Text("완료: \(store.completedMinutes)분")

      Button("10분 기록") {
        store.record(minutes: 10)
      }
    }
  }
}
```

이 코드에는 두 문제가 있어요.

1. `ReadingStore`는 값을 바꿔도 SwiftUI에 변경 이벤트를 보내지 않아요.
2. SwiftUI가 `body`를 다시 계산하면 새 `ReadingStore`를 만들 수 있어 기존 인스턴스의 상태를 화면 수명과 연결하지 못해요.

클래스의 프로퍼티가 바뀌었다는 사실만으로 SwiftUI가 자동으로 화면을 다시 계산하지는 않아요. 먼저 모델이 변경 알림을 제공하게 만들고, 그다음 View가 모델을 얻는 경로에 맞는 래퍼를 선택해야 해요.

## ObservableObject는 변경 알림을 제공하는 프로토콜이에요

`ObservableObject`는 Combine이 제공하는 클래스 전용 프로토콜이에요. 모델이 이 프로토콜을 따르면 `objectWillChange` publisher로 변경 직전 이벤트를 보낼 수 있어요.

독서 상태 모델을 `ObservableObject`로 바꿔 볼게요.

```swift
import Combine

@MainActor
final class ReadingStore: ObservableObject {
  @Published private(set) var completedMinutes = 0
  @Published var dailyGoal = 30

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

각 요소의 역할은 다음과 같아요.

- `ObservableObject`는 모델이 변경 알림을 제공한다는 약속이에요.
- `@Published`는 프로퍼티가 바뀌기 전에 `objectWillChange`가 이벤트를 보내도록 연결해요.
- `private(set)`은 화면이 `completedMinutes`를 읽을 수 있지만 기록은 `record(minutes:)`을 통해서만 하게 만들어요.
- `@MainActor`는 UI 모델의 프로퍼티 접근과 변경을 main actor에 격리해요. `ObservableObject` 자체가 main thread 실행을 자동으로 보장하는 것은 아니에요.

`@Published`는 클래스 프로퍼티에 사용하는 Combine 프로퍼티 래퍼예요. `$dailyGoal`은 값이 아니라 `Published.Publisher`를 제공해서 Combine 코드가 변화를 구독할 수 있게 해요.

```swift
let cancellable = store.$dailyGoal.sink { goal in
  print("새 목표:", goal)
}
```

`@Published` publisher는 `willSet` 시점에 새 값을 보내요. sink 안에서 전달받은 `goal`은 새 값이지만 같은 순간에 `store.dailyGoal`을 직접 읽으면 아직 이전 값일 수 있어요.

## StateObject는 View가 만든 모델의 수명을 관리해요

`ReadingDashboard`가 `ReadingStore`의 생성자라면 `@StateObject`를 사용해요.

```swift
import SwiftUI

struct ReadingDashboard: View {
  @StateObject private var store = ReadingStore()

  var body: some View {
    VStack(spacing: 16) {
      Text("완료: \(store.completedMinutes)분")

      ProgressView(value: store.progress)

      Button("10분 기록") {
        store.record(minutes: 10)
      }

      GoalEditor(store: store)
    }
    .padding()
  }
}
```

`@StateObject`는 View 구조체 안에 클래스 인스턴스를 단순히 저장하는 문법이 아니에요. SwiftUI가 View identity와 연결된 별도 저장소에서 인스턴스를 관리해요.

```text
ReadingDashboard 값이 다시 만들어짐
              │
              ▼
같은 View identity인가요?
       │              │
      예             아니요
       │              │
       ▼              ▼
기존 ReadingStore   새 ReadingStore
인스턴스 재사용      인스턴스 생성
```

부모 상태가 바뀌어 `ReadingDashboard` 값과 `body`가 여러 번 다시 계산돼도 identity가 같으면 `ReadingStore()` 초기값의 인스턴스를 계속 사용해요. 반대로 `.id(...)`, 조건 분기, 목록 identity 변화 등으로 View identity가 바뀌면 새 상태 객체를 만들 수 있어요.

Apple은 `@StateObject` 프로퍼티를 `private`으로 선언하라고 권장해요. 외부 memberwise initializer로 상태 객체를 교체하는 경로를 막아 SwiftUI가 관리하는 저장소와 충돌하지 않게 하기 위해서예요.

`ObservableObject`와 `@ObservedObject`는 iOS 13부터 사용할 수 있지만 `@StateObject`는 iOS 14부터 제공돼요. iOS 13까지 지원하는 코드에서는 상위 소유자가 모델을 만들고 하위 View가 `@ObservedObject`로 받는 구조 등을 별도로 설계해야 해요.

## StateObject의 초기값은 입력이 바뀔 때 자동으로 다시 만들어지지 않아요

상태 객체의 초기값이 View 입력에 의존한다면 backing storage인 `_store`를 명시적으로 초기화할 수 있어요.

```swift
struct GoalDashboard: View {
  @StateObject private var store: ReadingStore

  init(initialGoal: Int) {
    _store = StateObject(
      wrappedValue: ReadingStore(
        dailyGoal: initialGoal
      )
    )
  }

  var body: some View {
    Text("목표: \(store.dailyGoal)분")
  }
}
```

이 예제를 사용하려면 `ReadingStore`에 `init(dailyGoal:)`을 추가해야 해요. 중요한 점은 SwiftUI가 같은 View identity에서 상태 객체의 초기화 클로저를 **처음 한 번만** 사용한다는 것이에요.

부모가 `initialGoal`을 30에서 60으로 바꾸면 `GoalDashboard.init(initialGoal:)`은 다시 호출될 수 있지만 기존 `ReadingStore`의 `dailyGoal`이 자동으로 60이 되지는 않아요. 초기 입력이 해당 View identity 동안 변하지 않는 설정일 때만 이 방식을 사용하세요.

입력 변화에 따라 같은 모델을 갱신해야 한다면 부모가 모델을 소유하고 전달하거나 `onChange`에서 명시적으로 동기화하는 편이 의도가 분명해요. `.id(initialGoal)`로 identity를 바꾸면 상태 객체도 다시 만들 수 있지만, 그 View가 가진 `@State`, `@FocusState` 같은 다른 상태도 함께 초기화되고 불필요한 생성 비용이 생길 수 있어요.

## ObservedObject는 외부에서 받은 모델을 관찰해요

부모가 만든 `ReadingStore`를 자식 View가 직접 전달받는다면 `@ObservedObject`를 사용해요.

```swift
struct GoalEditor: View {
  @ObservedObject var store: ReadingStore

  var body: some View {
    Stepper(
      "하루 목표: \(store.dailyGoal)분",
      value: $store.dailyGoal,
      in: 10...180,
      step: 10
    )
  }
}
```

`GoalEditor`는 `ReadingStore`를 만들지 않아요. 부모의 `@StateObject`가 소유한 인스턴스를 입력으로 받고, 변경 알림을 구독해 화면을 갱신해요.

```text
ReadingDashboard
@StateObject store ── 생성·수명 관리
         │
         └── GoalEditor(store: store)
                 @ObservedObject ── 전달받아 관찰
```

`@ObservedObject`는 외부 입력을 위한 래퍼이므로 다음처럼 기본값으로 새 모델을 만들지 않는 편이 좋아요.

```swift
// 피해야 할 방식
struct UnstableEditor: View {
  @ObservedObject var store = ReadingStore()

  var body: some View {
    Text("\(store.dailyGoal)")
  }
}
```

이 View가 새 값으로 만들어질 때 `ReadingStore()`도 다시 평가돼요. `@ObservedObject`는 전달받은 객체를 구독하지만 그 객체의 안정적인 저장소를 View identity에 연결하는 역할은 하지 않아요. 직접 생성한 모델을 유지해야 한다면 `@StateObject`가 맞아요.

### $store.dailyGoal은 Binding이에요

앞의 `GoalEditor`에서 사용한 `$store.dailyGoal`은 `Binding<Int>`예요. `$store`는 `ObservedObject`의 projected value이고, dynamic member lookup으로 모델의 쓰기 가능한 프로퍼티에 Binding을 만들어요.

비슷해 보이는 두 표현을 구분하세요.

| 표현               | 만들어지는 값              | 사용하는 곳                             |
| ------------------ | -------------------------- | --------------------------------------- |
| `store.$dailyGoal` | `Published<Int>.Publisher` | Combine 구독과 연산자 체인              |
| `$store.dailyGoal` | `Binding<Int>`             | `Stepper`, `TextField`, `Toggle` 입력값 |

## EnvironmentObject는 조상 View가 주입한 모델을 찾아요

여러 단계 아래의 View가 같은 모델을 사용하고 중간 View가 그 모델을 전달할 이유가 없다면 환경에 넣을 수 있어요.

먼저 소유자가 모델을 만들고 하위 계층에 주입해요.

```swift
@main
struct ReadingApp: App {
  @StateObject private var store = ReadingStore()

  var body: some Scene {
    WindowGroup {
      ReadingDashboard()
        .environmentObject(store)
    }
  }
}
```

하위 View는 생성자 매개변수 없이 같은 타입의 객체를 읽어요.

```swift
struct ReadingSummary: View {
  @EnvironmentObject private var store: ReadingStore

  var body: some View {
    VStack {
      Text("오늘 \(store.completedMinutes)분")
      ProgressView(value: store.progress)
    }
  }
}
```

`@EnvironmentObject`가 객체를 소유하는 것은 아니에요. 조상 계층의 `.environmentObject(store)`가 제공한 인스턴스를 타입으로 찾고 관찰해요.

환경 주입은 매개변수 전달을 줄이지만 의존성이 View의 initializer에 보이지 않아요. 앱 전역 세션, 사용자 설정, 깊은 화면 계층이 공유하는 모델처럼 넓은 범위에서 실제로 공유하는 상태에 사용하고, 가까운 부모와 자식 사이에서는 명시적인 `@ObservedObject` 입력을 우선 검토하세요.

### 환경 객체를 주입하지 않으면 런타임 오류가 나요

`@EnvironmentObject private var store: ReadingStore`는 해당 타입의 객체가 조상에 반드시 있다고 가정해요. `.environmentObject(store)`를 빠뜨리면 컴파일은 되지만 View를 평가할 때 필요한 객체를 찾지 못해 런타임 오류가 발생해요.

Preview와 테스트도 별도의 View 계층이므로 직접 주입해야 해요.

```swift
#Preview {
  ReadingSummary()
    .environmentObject(ReadingStore())
}
```

같은 구체 타입의 환경 객체로 서로 다른 역할을 구분하려 하면 어떤 인스턴스를 읽는지 코드만 보고 이해하기 어려워요. 역할이 다르면 `UserSessionStore`, `ReadingSettingsStore`처럼 타입 자체를 나누는 편이 안전해요.

## 네 이름을 소유권과 전달 경로로 비교해요

| 이름                 | 종류                  | 객체를 누가 만드나요?           | View가 하는 일                       | 대표적인 사용 위치             |
| -------------------- | --------------------- | ------------------------------- | ------------------------------------ | ------------------------------ |
| `ObservableObject`   | Combine 프로토콜      | 이 프로토콜이 결정하지 않아요.  | 변경 publisher를 제공할 약속을 해요. | 모델 클래스 선언               |
| `@StateObject`       | SwiftUI 프로퍼티 래퍼 | 이 래퍼를 선언한 View·App·Scene | 객체 저장소를 만들고 관찰해요.       | 상태 모델의 소유자             |
| `@ObservedObject`    | SwiftUI 프로퍼티 래퍼 | 부모나 외부 조립 코드           | 전달받은 객체를 관찰해요.            | 직접 입력을 받는 자식 View     |
| `@EnvironmentObject` | SwiftUI 프로퍼티 래퍼 | 조상 View·App·Scene             | 환경에서 객체를 찾아 관찰해요.       | 깊은 계층이 공유하는 필수 모델 |

선택 순서는 객체의 타입보다 생성 책임에서 시작해요.

```text
이 View가 모델을 처음 만들고 수명을 관리하나요?
  ├─ 예  → @StateObject
  └─ 아니요
       ├─ 부모가 직접 인자로 전달하나요? → @ObservedObject
       └─ 조상 환경에서 찾나요?           → @EnvironmentObject
```

한 인스턴스를 두 군데에서 각각 `@StateObject`로 만들면 단일 데이터 원천이 두 개가 돼요. 한 곳만 소유자가 되고, 나머지는 `@ObservedObject` 또는 `@EnvironmentObject`로 같은 인스턴스를 관찰해야 해요.

## State에 ObservableObject를 넣는 것과는 달라요

다음 코드는 문법상 가능할 수 있지만 `ObservableObject` 모델의 내부 변경을 관찰하는 올바른 대체가 아니에요.

```swift
struct IncorrectDashboard: View {
  @State private var store = ReadingStore()

  var body: some View {
    Text("\(store.completedMinutes)")
  }
}
```

`@State`는 `store` 참조 자체가 다른 인스턴스로 바뀌는 것은 관리하지만, Combine 기반 객체의 `@Published` 변경을 구독하지 않아요. `ObservableObject`의 내부 프로퍼티 변경까지 화면에 반영하려면 소유자에서 `@StateObject`를 사용해야 해요.

iOS 17부터 Observation의 `@Observable`을 적용한 참조 타입은 `@State`에 저장할 수 있어요. 같은 `@State` 문법이라도 모델이 `ObservableObject`인지 Observation의 `Observable`인지에 따라 추적 방식이 다르므로 섞어서 외우지 마세요. 자세한 흐름은 [@Observable과 Observation](./observation) 문서에서 이어서 설명해요.

## 테스트에서는 모델과 View 연결을 나눠 확인해요

`ReadingStore`의 계산과 변경은 SwiftUI 없이 테스트할 수 있어요.

```swift
import Testing

@Test
@MainActor
func recordsReadingProgress() {
  let store = ReadingStore()

  store.record(minutes: 15)

  #expect(store.completedMinutes == 15)
  #expect(store.progress == 0.5)
}
```

View 테스트나 Preview에서는 다음 경계를 따로 확인하세요.

- 소유 View가 같은 identity에서 `@StateObject` 인스턴스를 유지하는지 확인해요.
- 자식이 부모와 같은 인스턴스를 `@ObservedObject`로 받는지 확인해요.
- `@EnvironmentObject`를 사용하는 모든 Preview와 테스트 root에 객체를 주입해요.
- 모델을 교체해야 하는 화면은 View identity 변경이 다른 로컬 상태까지 초기화하지 않는지 확인해요.

## 언제 어떤 방식을 사용해야 하나요

다음 기준으로 선택해 보세요.

1. 모델이 Combine의 `ObservableObject`를 따르는지 확인해요.
2. 모델 인스턴스를 처음 만드는 한 곳을 정해요.
3. SwiftUI View가 생성자라면 `private @StateObject`로 소유해요.
4. 가까운 자식에게는 같은 인스턴스를 `@ObservedObject`로 명시적으로 전달해요.
5. 많은 계층이 공유하고 중간 View가 알 필요 없는 모델만 환경에 주입해요.
6. Preview와 테스트의 환경 주입을 프로덕션 root와 함께 점검해요.
7. 최소 지원 OS가 iOS 17 이상이면 새로운 모델에 Observation을 사용할지도 비교해요.

짧은 View 하나에서 값 타입 몇 개만 관리한다면 `@State`와 `@Binding`으로 충분해요. 참조형 모델이 필요하지 않은데 모든 상태를 `ObservableObject` 클래스에 모으면 소유권과 변경 범위가 오히려 커질 수 있어요.

## 면접에서 이어질 수 있는 질문

### StateObject와 ObservedObject의 가장 큰 차이는 무엇인가요?

객체의 저장소와 수명을 누가 관리하는지가 달라요. `@StateObject`는 선언한 View의 identity에 연결해 인스턴스를 유지하고, `@ObservedObject`는 외부에서 전달된 인스턴스의 변경만 구독해요.

### ObservedObject에서 모델을 직접 생성하면 왜 문제가 되나요?

`@ObservedObject`는 인스턴스를 안정적으로 보관하는 소유 래퍼가 아니기 때문이에요. View 값이 다시 만들어질 때 기본값 표현식에서 새 객체가 생길 수 있으므로 직접 생성한 모델은 `@StateObject`에 두는 편이 맞아요.

### EnvironmentObject의 장점과 비용은 무엇인가요?

깊은 View 계층에서 중간 매개변수 전달을 줄일 수 있어요. 반면 initializer만 보고 의존성을 알기 어렵고, 주입을 빠뜨려도 컴파일 단계에서 잡히지 않아 런타임 오류가 날 수 있어요.

### Published와 ObservableObject는 어떤 관계인가요?

`ObservableObject`는 객체 수준의 변경 publisher를 제공하는 프로토콜이고, `@Published`는 프로퍼티 변경을 그 알림과 연결하는 Combine 프로퍼티 래퍼예요. 직접 `objectWillChange.send()`를 호출할 수도 있지만 일반적인 저장 프로퍼티에는 `@Published`가 반복 코드를 줄여 줘요.

### View identity가 StateObject에 왜 중요한가요?

SwiftUI는 `@StateObject` 저장소를 View 값 자체가 아니라 identity와 연결해요. identity가 유지되면 새 View 값에도 같은 객체를 제공하고, identity가 달라지면 새 객체를 만들며 같은 View의 다른 로컬 상태도 함께 초기화할 수 있어요.

## 참고 자료

- [Apple Developer — ObservableObject](https://developer.apple.com/documentation/combine/observableobject)
- [Apple Developer — Published](https://developer.apple.com/documentation/combine/published)
- [Apple Developer — StateObject](https://developer.apple.com/documentation/swiftui/stateobject)
- [Apple Developer — ObservedObject](https://developer.apple.com/documentation/swiftui/observedobject)
- [Apple Developer — EnvironmentObject](https://developer.apple.com/documentation/swiftui/environmentobject)
- [Apple Developer — environmentObject(_:)](<https://developer.apple.com/documentation/swiftui/view/environmentobject(_:)>)
- [Apple Developer — Managing user interface state](https://developer.apple.com/documentation/swiftui/managing-user-interface-state)
- [Swift-KR — Property Wrapper](../../swift/property-wrappers)
- [Swift-KR — @Observable과 Observation](./observation)
