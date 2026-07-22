---
title: SwiftUI 바인딩 사용하기
description: TCA 기능을 SwiftUI Binding에 연결하고 BindableAction·BindingReducer로 양방향 상태 변경 코드를 줄이는 방법을 설명합니다.
---

# SwiftUI 바인딩 사용하기

원문: [Working with SwiftUI bindings](https://swiftpackageindex.com/pointfreeco/swift-composable-architecture/main/documentation/composablearchitecture/bindings)

The Composable Architecture로 작성한 기능을 SwiftUI 바인딩에 연결하는 방법을 알아봅니다.

## 개요

SwiftUI의 많은 API는 애플리케이션 상태와 뷰가 양방향으로 통신하도록 바인딩을 사용합니다. The Composable Architecture는 Store와 이 통신을 연결하는 바인딩을 만들기 위한 여러 도구를 제공합니다.

### 임시(ad hoc) 바인딩

Store와 통신하는 바인딩을 만드는 가장 간단한 방법은 기능 상태의 일부를 바꾸는 전용 액션을 만드는 것입니다. 예를 들어 reducer의 도메인이 사용자의 햅틱 피드백 활성화 여부를 추적한다고 가정해 보겠습니다. 먼저 상태에 Boolean 프로퍼티를 정의합니다.

```swift
@Reducer
struct Settings {
  struct State: Equatable {
    var isHapticsEnabled = true
    // ...
  }

  // ...
}
```

그다음 Toggle처럼 외부에서 이 상태를 변경할 수 있도록, 업데이트를 받을 대응 액션을 정의합니다.

```swift
@Reducer
struct Settings {
  struct State: Equatable { /* ... */ }

  enum Action {
    case isHapticsEnabledChanged(Bool)
    // ...
  }

  // ...
}
```

Reducer가 이 액션을 처리할 때 상태를 업데이트할 수 있습니다.

```swift
@Reducer
struct Settings {
  struct State: Equatable { /* ... */ }
  enum Action { /* ... */ }

  var body: some Reducer<State, Action> {
    Reduce { state, action in
      switch action {
      case let .isHapticsEnabledChanged(isEnabled):
        state.isHapticsEnabled = isEnabled
        return .none
      // ...
      }
    }
  }
}
```

마지막으로 뷰에서 도메인으로부터 바인딩을 파생하면 Toggle이 TCA 기능과 통신할 수 있습니다. 먼저 Store를 바인딩 가능한 방식으로 보유해야 하며 SwiftUI의 `@Bindable` 프로퍼티 래퍼를 사용하면 됩니다.

```swift
struct SettingsView: View {
  @Bindable var store: StoreOf<Settings>
  // ...
}
```

> 중요: 이전 Apple 플랫폼(iOS 16, macOS 13, tvOS 16, watchOS 9 이하)을 지원한다면 `@Bindable` 프로퍼티 래퍼의 backport를 사용해야 합니다.
>
> ```diff
> -@Bindable var store: StoreOf<Settings>
> +@Perception.Bindable var store: StoreOf<Settings>
> ```

설정이 끝나면 변경될 때 액션을 보내는 상태 바인딩을 파생할 수 있습니다.

```swift
var body: some View {
  Form {
    Toggle(
      "Haptic feedback",
      isOn: $store.isHapticsEnabled.sending(\.isHapticsEnabledChanged)
    )

    // ...
  }
}
```

### Binding action과 reducer

임시 바인딩을 만들려면 수동 단계가 많아질 수 있으며, 여러 바인딩으로 여러 control을 구동하는 화면에서는 특히 번거롭습니다. 그래서 The Composable Architecture는 reducer의 도메인과 로직에 적용해 이 과정을 단순화하는 도구를 제공합니다.

예를 들어 설정 화면의 상태를 다음 struct로 모델링할 수 있습니다.

```swift
@Reducer
struct Settings {
  @ObservableState
  struct State {
    var digest = Digest.daily
    var displayName = ""
    var enableNotifications = false
    var isLoading = false
    var protectMyPosts = false
    var sendEmailNotifications = false
    var sendMobileNotifications = false
  }

  // ...
}
```

이 필드 대부분은 뷰에서 편집할 수 있어야 합니다. The Composable Architecture에서는 각 필드마다 Store에 업데이트를 보낼 대응 액션이 필요하며, 일반적으로 필드별 case를 가진 enum으로 표현합니다.

```swift
@Reducer
struct Settings {
  @ObservableState
  struct State { /* ... */ }

  enum Action {
    case digestChanged(Digest)
    case displayNameChanged(String)
    case enableNotificationsChanged(Bool)
    case protectMyPostsChanged(Bool)
    case sendEmailNotificationsChanged(Bool)
    case sendMobileNotificationsChanged(Bool)
  }

  // ...
}
```

여기서 끝나지 않습니다. Reducer는 각 액션을 처리해 해당 필드의 상태를 바꿔야 합니다.

```swift
@Reducer
struct Settings {
  @ObservableState
  struct State { /* ... */ }
  enum Action { /* ... */ }

  var body: some Reducer<State, Action> {
    Reduce { state, action in
      switch action {
      case let .digestChanged(digest):
        state.digest = digest
        return .none

      case let .displayNameChanged(displayName):
        state.displayName = displayName
        return .none

      case let .enableNotificationsChanged(isOn):
        state.enableNotifications = isOn
        return .none

      case let .protectMyPostsChanged(isOn):
        state.protectMyPosts = isOn
        return .none

      case let .sendEmailNotificationsChanged(isOn):
        state.sendEmailNotifications = isOn
        return .none

      case let .sendMobileNotificationsChanged(isOn):
        state.sendMobileNotifications = isOn
        return .none
      }
    }
  }
}
```

단순해야 할 일에 많은 boilerplate가 생깁니다. 다행히 `BindableAction`과 `BindingReducer`를 사용하면 이 boilerplate를 크게 줄일 수 있습니다.

먼저 개별 필드 변경 액션을 모두 `BindingAction`을 보관하는 단일 case로 합치고, 액션 타입을 `BindableAction`에 맞춥니다. `BindingAction`은 reducer 상태에 제네릭으로 적용됩니다.

```swift
@Reducer
struct Settings {
  @ObservableState
  struct State { /* ... */ }

  enum Action: BindableAction {
    case binding(BindingAction<State>)
  }

  // ...
}
```

그다음 필드 변경을 처리하는 `BindingReducer`를 추가해 Settings reducer를 단순화합니다.

```swift
@Reducer
struct Settings {
  @ObservableState
  struct State { /* ... */ }
  enum Action: BindableAction { /* ... */ }

  var body: some Reducer<State, Action> {
    BindingReducer()
  }
}
```

뷰에서는 SwiftUI의 `@Bindable` 프로퍼티 래퍼로 Store를 바인딩 가능하게 보유해야 합니다. 이전 플랫폼을 대상으로 한다면 backport 도구인 `@Perception.Bindable`을 사용합니다.

```swift
struct SettingsView: View {
  @Bindable var store: StoreOf<Settings>
  // ...
}
```

이제 익숙한 `$` 문법으로 Store에서 바인딩을 파생할 수 있습니다.

```swift
TextField("Display name", text: $store.displayName)
Toggle("Notifications", isOn: $store.enableNotifications)
// ...
```

바인딩에 추가 동작을 겹쳐야 한다면 reducer에서 특정 key path의 액션을 pattern match할 수 있습니다.

```swift
var body: some Reducer<State, Action> {
  BindingReducer()

  Reduce { state, action in
    switch action {
    case .binding(\.displayName):
      // Validate display name

    case .binding(\.enableNotifications):
      // Return an effect to request authorization from UNUserNotificationCenter

    // ...
    }
  }
}
```

또는 `BindingReducer`에 `Reducer.onChange(of:_:)`를 적용해 특정 필드 변경에 반응할 수 있습니다.

```swift
var body: some Reducer<State, Action> {
  BindingReducer()
    .onChange(of: \.displayName) { oldValue, newValue in
      // Validate display name
    }
    .onChange(of: \.enableNotifications) { oldValue, newValue in
      // Return an authorization request effect
    }

  // ...
}
```

Binding action은 일반 액션과 거의 같은 방식으로 테스트할 수 있습니다. `.displayNameChanged("Blob")`처럼 변경 내용을 표현하는 특정 액션을 보내는 대신, `\.displayName, "Blob"`처럼 어떤 key path를 어떤 값으로 설정하는지 설명하는 `BindingAction`을 보냅니다.

```swift
let store = TestStore(initialState: Settings.State()) {
  Settings()
}

store.send(\.binding.displayName, "Blob") {
  $0.displayName = "Blob"
}
store.send(\.binding.protectMyPosts, true) {
  $0.protectMyPosts = true
}
```
