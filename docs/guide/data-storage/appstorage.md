---
title: SwiftUI로 이해하는 @AppStorage
description: '@AppStorage가 UserDefaults 값을 SwiftUI View 갱신과 Binding에 연결하는 방식, 지원 타입, custom store, SceneStorage와의 선택 기준을 설명합니다.'
pageType: doc-wide
outline: false
---

# SwiftUI로 이해하는 @AppStorage

> **면접 답변 한 줄 요약:** `@AppStorage`는 `UserDefaults`의 특정 key를 SwiftUI 프로퍼티로 연결해 값을 읽고 쓰며, 해당 설정이 바뀌면 View를 다시 계산하고 `$` projected value로 `Binding`까지 제공하는 프로퍼티 래퍼예요.

`UserDefaults`만으로 설정을 저장할 수 있지만 SwiftUI View에서 직접 사용하면 읽기, 쓰기, 변경 관찰, 화면 갱신 코드를 각각 연결해야 해요. [Apple의 AppStorage 문서](https://developer.apple.com/documentation/swiftui/appstorage)가 정의하듯 `@AppStorage`는 UserDefaults 값을 반영하고 그 값이 바뀌면 View를 무효화해, 작은 설정 하나를 View와 연결하는 반복을 줄여요.

이 문서에서는 독서 목표 앱의 설정 화면을 예로 들어 다음 내용을 설명해요.

- `@AppStorage`가 `UserDefaults`와 SwiftUI 사이에서 맡는 역할
- 기본값과 저장된 값이 선택되는 방식
- `$프로퍼티`로 `Binding`을 전달하는 방법
- 지원 타입과 `RawRepresentable` enum 저장
- 특정 `UserDefaults`와 `defaultAppStorage(_:)` 사용
- `@State`, `@SceneStorage`, `@Observable` 모델과의 선택 기준
- 테스트, App Group 공유, 개인정보 보호 주의점

## 먼저 알아둘 SwiftUI 저장 용어

| 용어                      | 쉬운 뜻                                                                                                                                                   |
| ------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 프로퍼티 래퍼             | 프로퍼티 저장과 접근 규칙을 `@이름` 문법으로 적용하는 Swift 기능이에요. 자세한 원리는 [Property Wrapper](../swift/property-wrappers)에서 설명해요.        |
| `UserDefaults`            | 작고 민감하지 않은 설정을 문자열 key와 property list 값으로 저장하는 Foundation API예요. 자세한 원리는 [UserDefaults](./userdefaults)에서 설명해요.       |
| View 무효화(invalidation) | View가 의존한 값이 바뀌었으니 SwiftUI가 `body`를 다시 계산해야 한다고 표시하는 과정이에요.                                                                |
| `Binding`                 | 값을 읽고 원래 저장 위치에 변경을 다시 기록하는 양방향 연결이에요. `@AppStorage`의 `$프로퍼티`가 `Binding`을 제공해요.                                    |
| dynamic property          | SwiftUI가 View의 외부 상태를 읽고 변경 시점을 추적할 수 있도록 갱신 주기에 참여하는 프로퍼티예요. `@State`와 `@AppStorage`가 대표적인 예예요.             |
| custom store              | `UserDefaults.standard` 대신 직접 지정한 `UserDefaults` 인스턴스예요. 테스트 suite나 App Group suite를 연결할 때 사용해요.                                |
| View identity             | SwiftUI가 이전 View와 새 View를 같은 화면 요소로 대응시키는 기준이에요. `@State` 수명에는 중요하지만 `@AppStorage` 값 자체는 UserDefaults key에 저장돼요. |

`@AppStorage`는 iOS 14, macOS 11, tvOS 14, watchOS 7부터 사용할 수 있어요.

## UserDefaults를 직접 쓰면 화면 갱신 연결이 필요해요

먼저 View의 계산 프로퍼티가 `UserDefaults`를 직접 읽게 만들어 볼게요.

```swift
import SwiftUI

struct ReadingGoalView: View {
  private let key = "reading.dailyGoal"

  private var dailyGoal: Int {
    UserDefaults.standard.integer(forKey: key)
  }

  var body: some View {
    VStack {
      Text("하루 목표: \(dailyGoal)분")

      Button("45분으로 변경") {
        UserDefaults.standard.set(45, forKey: key)
      }
    }
  }
}
```

Button이 값을 저장해도 SwiftUI는 `dailyGoal`이 외부 저장소에서 바뀌었다는 사실을 자동으로 의존성으로 관리하지 못해요. 우연히 다른 상태 때문에 `body`가 다시 계산되면 새 값을 읽을 수 있지만, 이 코드는 설정 변경과 View 갱신을 명시적으로 연결하지 않았어요.

notification을 구독하고 별도 `@State`에 복사할 수도 있지만 작은 설정 하나에 코드가 너무 많아져요.

## AppStorage는 key 하나를 View 상태처럼 연결해요

같은 설정을 `@AppStorage`로 바꿔 볼게요.

```swift
import SwiftUI

struct ReadingGoalView: View {
  @AppStorage("reading.dailyGoal")
  private var dailyGoal = 30

  var body: some View {
    VStack(spacing: 16) {
      Text("하루 목표: \(dailyGoal)분")

      Button("45분으로 변경") {
        dailyGoal = 45
      }
    }
  }
}
```

코드 한 줄에 세 역할이 연결돼요.

1. getter는 `reading.dailyGoal` key에 해당하는 값을 `UserDefaults`에서 읽어요.
2. `dailyGoal = 45`는 같은 key에 새 값을 기록해요.
3. key의 값이 바뀌면 SwiftUI가 이 프로퍼티를 읽는 View를 무효화하고 `body`를 다시 계산해요.

별도 store를 지정하지 않으면 View 계층의 기본 app storage를 사용하고, 기본값은 `UserDefaults.standard`예요.

### 선언의 초기값은 key가 없을 때 보여 줄 값이에요

```swift
@AppStorage("reading.dailyGoal")
private var dailyGoal = 30
```

여기서 `30`은 UserDefaults key에 값이 없을 때 래퍼가 사용할 초기 wrapped value예요. 이 선언만으로 앱 전체의 registration domain에 `30`이 등록되는 것은 아니에요. SwiftUI 밖의 코드도 같은 기본값을 읽어야 한다면 앱 시작 시 `register(defaults:)`를 별도로 호출해 저장 정책을 일치시켜요.

```swift
@main
struct ReadingApp: App {
  init() {
    UserDefaults.standard.register(defaults: [
      "reading.dailyGoal": 30,
    ])
  }

  var body: some Scene {
    WindowGroup {
      ReadingGoalView()
    }
  }
}
```

`@AppStorage` 초기값과 `register(defaults:)`의 값을 다르게 두면 화면 위치에 따라 기본값이 달라질 수 있어요. key와 기본값을 한 타입에 모아 중복을 줄이는 편이 안전해요.

## projected value는 원래 저장소로 쓰는 Binding이에요

`@AppStorage` 프로퍼티 앞에 `$`를 붙이면 `Binding<Value>`를 얻어요. SwiftUI control이 변경값을 원래 UserDefaults key에 다시 쓰게 연결할 수 있어요.

```swift
import SwiftUI

struct ReadingSettingsView: View {
  @AppStorage("reading.dailyGoal")
  private var dailyGoal = 30

  @AppStorage("reading.reminderEnabled")
  private var reminderEnabled = false

  var body: some View {
    Form {
      Stepper(
        "하루 목표: \(dailyGoal)분",
        value: $dailyGoal,
        in: 10...180,
        step: 10
      )

      Toggle(
        "리마인더 사용",
        isOn: $reminderEnabled
      )
    }
  }
}
```

`dailyGoal`은 현재 `Int` 값을 읽고, `$dailyGoal`은 `Binding<Int>`를 제공해요. `Stepper`가 Binding에 새 값을 쓰면 `@AppStorage`가 UserDefaults를 갱신하고 View도 다시 계산돼요.

`Binding`은 값의 복사본이 아니에요. 원래 저장 위치를 읽고 쓰는 연결이므로 별도 `@State`에 값을 복사해 둘 필요가 없어요.

## 지원 타입은 UserDefaults보다 의도적으로 좁아요

`UserDefaults`는 property list 배열과 딕셔너리도 저장할 수 있지만 `@AppStorage`는 SwiftUI가 명확하게 읽고 쓰며 변경을 비교할 수 있는 타입에 initializer를 제공해요.

현재 SDK의 주요 지원 타입은 다음과 같아요.

| 타입                                                   | 지원 기준                                                  |
| ------------------------------------------------------ | ---------------------------------------------------------- |
| `Bool`, `Int`, `Double`, `String`, `URL`, `Data`       | iOS 14 이상의 기본 `@AppStorage` 값으로 사용할 수 있어요.  |
| `Date`                                                 | iOS 18 이상에서 전용 initializer를 사용할 수 있어요.       |
| `RawRepresentable`이며 raw value가 `String` 또는 `Int` | enum 같은 사용자 정의 선택지를 저장할 때 사용할 수 있어요. |
| 위 기본 타입의 Optional                                | 저장값이 없음을 `nil`로 표현해야 할 때 사용할 수 있어요.   |

`Float`, 배열, 딕셔너리, 임의의 `Codable` 구조체는 `@AppStorage` 프로퍼티 타입으로 직접 사용할 수 없어요. 작은 enum은 `RawRepresentable`로 표현하고, 복잡한 모델은 전용 저장 계층을 선택해요.

## RawRepresentable enum은 raw value로 저장돼요

사용자가 독서 화면의 테마를 선택한다고 가정해 볼게요.

```swift
import SwiftUI

enum ReadingTheme: String, CaseIterable, Identifiable {
  case system
  case light
  case dark

  var id: Self { self }

  var title: String {
    switch self {
    case .system:
      "시스템 설정"
    case .light:
      "라이트"
    case .dark:
      "다크"
    }
  }
}

struct ThemeSettingsView: View {
  @AppStorage("reading.theme")
  private var theme = ReadingTheme.system

  var body: some View {
    Picker("테마", selection: $theme) {
      ForEach(ReadingTheme.allCases) { theme in
        Text(theme.title)
          .tag(theme)
      }
    }
  }
}
```

실제 UserDefaults에는 `"system"`, `"light"`, `"dark"` 같은 `String` raw value가 저장돼요. case 이름이나 raw value를 바꾸면 예전 앱이 저장한 값을 복원하지 못할 수 있으므로 저장 schema처럼 안정적으로 관리해야 해요.

## store를 지정하면 다른 UserDefaults를 사용할 수 있어요

`store` 인자에 `UserDefaults` 인스턴스를 전달하면 `standard` 대신 해당 저장소를 사용해요.

```swift
import SwiftUI

struct ReadingSettingsView: View {
  @AppStorage private var dailyGoal: Int

  init(store: UserDefaults = .standard) {
    _dailyGoal = AppStorage(
      wrappedValue: 30,
      "reading.dailyGoal",
      store: store
    )
  }

  var body: some View {
    Stepper(
      "하루 목표: \(dailyGoal)분",
      value: $dailyGoal,
      in: 10...180,
      step: 10
    )
  }
}
```

initializer에서 backing storage인 `_dailyGoal`을 직접 초기화해요. 기본 실행에서는 `.standard`를 사용하고 preview나 테스트에서는 별도 suite를 전달할 수 있어요.

```swift
#Preview {
  let suiteName = "ReadingSettingsPreview"
  let store = UserDefaults(suiteName: suiteName)!
  store.set(90, forKey: "reading.dailyGoal")

  return ReadingSettingsView(store: store)
}
```

preview를 여러 번 실행할 때 값이 남는 것이 싫다면 preview 전용 key를 사용하거나 실행 전에 persistent domain을 정리해요.

## defaultAppStorage는 하위 View의 기본 store를 바꿔요

여러 View가 같은 custom store를 사용한다면 모든 선언에 `store:`를 반복하는 대신 View나 Scene의 `defaultAppStorage(_:)`를 사용할 수 있어요.

```swift
import SwiftUI

enum SharedDefaults {
  static let appGroupID = "group.com.example.Reading"

  static let store: UserDefaults = {
    guard let store = UserDefaults(suiteName: appGroupID) else {
      preconditionFailure("App Group 설정을 확인하세요.")
    }

    return store
  }()
}

@main
struct ReadingApp: App {
  var body: some Scene {
    WindowGroup {
      ReadingSettingsView()
    }
    .defaultAppStorage(SharedDefaults.store)
  }
}
```

이 Scene 아래의 `@AppStorage`는 `store:`를 생략해도 `SharedDefaults.store`를 사용해요.

```swift
struct ReadingSettingsView: View {
  @AppStorage("reading.dailyGoal")
  private var dailyGoal = 30

  var body: some View {
    Text("하루 목표: \(dailyGoal)분")
  }
}
```

[`defaultAppStorage(_:)`](<https://developer.apple.com/documentation/swiftui/view/defaultappstorage(_:)>)는 environment처럼 View 계층에 기본 store를 전달해요. 코드만 보면 어떤 store를 사용하는지 숨겨질 수 있으므로 앱 전체가 같은 store를 쓰는 경계에서 적용하고, 서로 다른 suite가 섞이는 화면에서는 `store:`를 명시하는 편이 읽기 쉬울 수 있어요.

App Group store를 사용하려면 앱 target과 extension target 모두 같은 App Groups capability와 entitlement를 가져야 해요. 문자열만 같은 이름으로 만들었다고 접근 권한이 생기지는 않아요.

## AppStorage는 저장 위치와 View 연결을 모두 포함해요

`@State`와 비교하면 차이가 더 분명해요.

```swift
struct GoalEditor: View {
  @State private var draftGoal = 30
  @AppStorage("reading.dailyGoal")
  private var savedGoal = 30

  var body: some View {
    Form {
      Stepper(
        "편집 중: \(draftGoal)분",
        value: $draftGoal,
        in: 10...180,
        step: 10
      )

      Button("저장") {
        savedGoal = draftGoal
      }
    }
  }
}
```

- `draftGoal`은 View identity와 연결된 임시 편집 상태예요.
- `savedGoal`은 UserDefaults key와 연결된 영속 설정이에요.

사용자가 Cancel을 누를 수 있는 form이라면 모든 입력을 곧바로 `@AppStorage`에 쓰지 않고 `@State` 초안에 모았다가 Save 시점에 기록하는 편이 의도에 맞아요.

## State, SceneStorage, AppStorage의 수명이 달라요

| 도구            | 값이 연결되는 위치                  | 앱 재실행 후 기대                         | 적합한 예                                     |
| --------------- | ----------------------------------- | ----------------------------------------- | --------------------------------------------- |
| `@State`        | 현재 View identity의 SwiftUI 저장소 | 일반적으로 유지하지 않아요.               | sheet 표시 여부, 입력 중인 초안               |
| `@SceneStorage` | 특정 Scene의 상태 복원 저장소       | 시스템이 scene 복원을 시도해요.           | 창마다 다른 선택 탭, navigation 복원 단서     |
| `@AppStorage`   | UserDefaults의 key                  | persistent domain에 저장된 값을 유지해요. | 앱 전체 테마, 작은 사용자 설정                |
| 모델 저장소     | 파일이나 데이터베이스               | 저장 정책에 따라 유지해요.                | 책 목록, 기록 내역, 검색 가능한 관계형 데이터 |

`@SceneStorage`는 scene마다 값이 다르고 저장 시점이나 횟수를 시스템이 관리해요. `@AppStorage`는 같은 store와 key를 사용하는 곳이 하나의 설정을 공유해요.

## AppStorage는 앱의 전체 모델을 대신하지 않아요

화면에 저장 설정이 많다고 모든 프로퍼티를 `@AppStorage`로 선언하면 key 문자열과 저장 정책이 View 곳곳에 퍼져요.

```swift
struct ProfileView: View {
  @AppStorage("profile.name") private var name = ""
  @AppStorage("profile.age") private var age = 0
  @AppStorage("profile.avatar") private var avatar = Data()
  @AppStorage("profile.introduction") private var introduction = ""

  // 프로필 모델이 커질수록 View가 저장 schema까지 책임져요.
  var body: some View {
    Text(name)
  }
}
```

다음 상황에는 `@Observable` 모델과 전용 repository나 데이터베이스를 조합하는 편이 좋아요.

- 여러 값이 하나의 transaction처럼 함께 검증되고 저장돼야 해요.
- 비동기 I/O, 오류 처리, migration이 필요해요.
- 목록 검색, 정렬, 관계 표현이 필요해요.
- 저장 정책을 View와 분리해 unit test하고 싶어요.

`@AppStorage`는 **View가 직접 소비하는 작은 설정**에 가장 잘 맞아요.

## App Group과 Widget에서는 Binding보다 snapshot 흐름을 사용해요

App과 Widget extension이 같은 App Group suite를 사용하면 둘 다 같은 설정을 읽을 수 있어요. 하지만 Widget은 앱의 SwiftUI View와 같은 프로세스에서 계속 실행되지 않으므로 `$dailyGoal` Binding이 앱과 Widget 화면을 실시간으로 연결하지는 않아요.

앱은 공유 store에 값을 쓰고 `WidgetCenter`에 timeline reload를 요청해요. Widget provider는 새 timeline을 만들 때 shared defaults를 읽고 `TimelineEntry`에 값의 snapshot을 넣어요. 전체 코드는 [App Groups와 Widget 데이터 공유](./app-groups) 문서에서 설명해요.

## 개인정보 보호와 저장 기준은 UserDefaults와 같아요

`@AppStorage`의 저장소는 `UserDefaults`이므로 같은 주의점이 적용돼요.

- 민감하거나 개인을 식별하는 값을 저장하지 않아요.
- 큰 `Data`나 복잡한 모델을 편의상 넣지 않아요.
- 기기 간 동기화 기능으로 오해하지 않아요.
- `PrivacyInfo.xcprivacy`에 실제 UserDefaults 사용 범위와 맞는 required reason을 선언해요.
- App Group suite를 사용하면 같은 group 구성원 모두가 그 값을 읽을 수 있다는 점을 고려해요.

## 언제 AppStorage를 사용해야 하나요

다음 조건을 대부분 만족하면 적합해요.

- SwiftUI View가 직접 읽고 편집하는 작은 설정이에요.
- `Bool`, `Int`, `Double`, `String`, `URL`, `Data`, 지원 OS의 `Date`, 또는 `String`·`Int` raw value enum으로 표현돼요.
- 같은 key의 변경이 곧바로 화면 갱신으로 이어져야 해요.
- 별도 저장 오류 처리나 transaction이 필요하지 않아요.
- 값이 민감하지 않고 UserDefaults에 저장하기 적합해요.

## 적용 순서를 정리해요

1. 값이 UserDefaults에 적합한 작은 설정인지 확인해요.
2. key와 기본값을 한 위치에서 정의해 오타와 불일치를 줄여요.
3. 단일 View의 설정은 `@AppStorage(key)`로 시작해요.
4. control에는 `$프로퍼티` Binding을 전달해요.
5. 임시 편집값과 실제 저장값을 구분해야 하면 `@State` 초안을 둬요.
6. custom suite가 필요하면 `store:` 또는 상위 `defaultAppStorage(_:)`를 선택해요.
7. App Group 공유라면 모든 target의 entitlement와 Widget timeline reload를 함께 구성해요.
8. privacy manifest와 지원 OS별 initializer를 검토해요.

## 면접에서 이어질 수 있는 질문

### AppStorage와 UserDefaults는 어떤 관계인가요?

`@AppStorage`는 별도 데이터베이스가 아니라 UserDefaults key를 SwiftUI dynamic property로 감싼 API예요. 읽기와 쓰기에 UserDefaults를 사용하면서 변경 시 View 무효화와 `Binding` 제공까지 연결해요.

### AppStorage와 State는 어떻게 다른가요?

`@State`는 View identity에 연결된 UI 상태이고 `@AppStorage`는 UserDefaults key에 연결된 영속 설정이에요. 임시 입력과 취소 가능한 초안은 `@State`, 앱 재실행 뒤에도 유지할 작은 설정은 `@AppStorage`가 적합해요.

### AppStorage의 초기값은 register(defaults:)와 같은가요?

아니에요. 래퍼의 초기값은 해당 `@AppStorage`가 key를 찾지 못했을 때 사용할 wrapped value예요. 앱 전체의 registration domain에 fallback을 제공하려면 `UserDefaults.register(defaults:)`를 별도로 호출해야 해요.

### defaultAppStorage는 언제 사용하나요?

View 또는 Scene 계층 전체가 같은 custom `UserDefaults`를 사용해야 할 때 중복 `store:` 인자를 줄여요. 다만 저장소 선택이 계층 위에 숨겨지므로 서로 다른 suite가 섞이는 화면에서는 직접 지정하는 방식이 더 명확할 수 있어요.

### AppStorage를 Widget View에 선언하면 앱 변경이 즉시 보이나요?

같은 suite의 값을 읽을 수는 있지만 Widget은 별도 프로세스에서 timeline snapshot으로 렌더링돼요. 앱이 값을 쓴 뒤 `WidgetCenter`에 reload를 요청하고 provider가 새 entry를 만들게 해야 하며, 요청 시점에 즉시 렌더링된다는 보장도 없어요.

## 참고 자료

- [Apple Developer — AppStorage](https://developer.apple.com/documentation/swiftui/appstorage)
- [Apple Developer — defaultAppStorage(_:)](<https://developer.apple.com/documentation/swiftui/view/defaultappstorage(_:)>)
- [Apple Developer — SceneStorage](https://developer.apple.com/documentation/swiftui/scenestorage)
- [Apple Developer — UserDefaults](https://developer.apple.com/documentation/foundation/userdefaults)
- [Apple Developer — Configuring app groups](https://developer.apple.com/documentation/xcode/configuring-app-groups)
- [Swift-KR — 저장소와 데이터 경계](./storage-overview)
- [Swift-KR — UserDefaults](./userdefaults)
- [Swift-KR — App Groups와 Widget 데이터 공유](./app-groups)
- [Swift-KR — Property Wrapper](../swift/property-wrappers)
- [Swift-KR — @Observable과 Observation](../swiftui/state-management/observation)
