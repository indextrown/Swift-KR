---
title: Store
description: TCA의 Store가 상태를 보관하고 액션을 reducer에 전달하며, 기능별 Store를 스코핑하는 방법을 설명합니다.
---

# Store

애플리케이션을 실제로 구동하는 런타임 객체입니다. 뷰는 `Store`를 통해 기능의 상태를 읽고, 사용자의 동작을 액션으로 보냅니다.

원문: [Store](https://swiftpackageindex.com/pointfreeco/swift-composable-architecture/main/documentation/composablearchitecture/store)

`Store<State, Action>`는 현재 상태와 reducer를 연결합니다. 액션을 받으면 reducer를 실행해 상태를 갱신하고, reducer가 반환한 `Effect`도 실행합니다. 따라서 뷰는 reducer를 직접 호출하거나 상태를 직접 변경하지 않고, Store 하나만 의존하면 됩니다.

## 선언

```swift
@dynamicMemberLookup
@MainActor
public final class Store<State, Action>
```

`Store`는 메인 액터에서 동작합니다. 또한 동적 멤버 조회를 지원하므로, 관찰 가능한 기능 상태의 속성을 `store.count`처럼 Store에서 바로 읽을 수 있습니다.

## 루트 Store 만들기

보통 앱의 진입점에서 루트 Store를 하나 만들고, 최상위 뷰에 전달합니다.

```swift
@main
struct MyApp: App {
  static let store = Store(initialState: AppFeature.State()) {
    AppFeature()
  }

  var body: some Scene {
    WindowGroup {
      RootView(store: Self.store)
    }
  }
}
```

`initialState`는 앱이 시작할 때 사용할 상태이고, `reducer`는 이 Store의 비즈니스 로직입니다. `withDependencies` 인자로 reducer가 접근할 의존성을 이 Store에 한해 재정의할 수도 있습니다.

```swift
let store = Store(initialState: AppFeature.State()) {
  AppFeature()
} withDependencies: {
  $0.date.now = Date(timeIntervalSince1970: 0)
}
```

> 참고: Xcode Preview는 앱 진입점을 생성해 실행합니다. 루트 Store를 일반 인스턴스 속성으로 만들면 Preview를 열 때 의존성이 예상보다 일찍 실행될 수 있습니다. 원문 권장처럼 `static let`으로 루트 Store를 보관하세요.

## 상태 읽기와 액션 보내기

기능의 상태에 `@ObservableState`를 적용했다면, 뷰는 Store에서 상태를 읽고 사용자 이벤트에 맞춰 액션을 보냅니다.

```swift
struct RootView: View {
  let store: StoreOf<AppFeature>

  var body: some View {
    Form {
      Text("\(store.count)")

      Button("증가") {
        store.send(.incrementButtonTapped)
      }
    }
  }
}
```

`send(_:)`는 액션을 Store로 보냅니다. Store는 reducer를 실행한 뒤 반환된 effect의 생명주기를 나타내는 `StoreTask`를 돌려줍니다.

```swift
@discardableResult
func send(_ action: Action) -> StoreTask
```

SwiftUI의 `task`와 연결하면 화면의 비동기 작업을 화면 생명주기에 맞춰 기다리거나 취소할 수 있습니다.

```swift
.task {
  await store.send(.task).finish()
}
```

`StoreTask`는 다음 기능을 제공합니다.

| API           | 설명                                                                   |
| ------------- | ---------------------------------------------------------------------- |
| `cancel()`    | 이 액션이 시작한 effect 작업을 취소합니다.                             |
| `finish()`    | effect 작업이 끝날 때까지 비동기로 기다립니다.                         |
| `isCancelled` | 작업이 취소됐는지 확인합니다. 취소된 작업은 다시 활성화할 수 없습니다. |

`send(_:animation:)`과 `send(_:transaction:)` 오버로드도 있지만 사용 중단 예정입니다. 애니메이션이나 트랜잭션이 필요하면 `withAnimation` 또는 `withTransaction`으로 `send` 호출을 감싸세요.

```swift
withAnimation {
  store.send(.incrementButtonTapped)
}
```

## Store 스코핑

`scope(_:action:)`은 전체 도메인을 다루는 Store에서 자식 기능의 상태와 액션만 다루는 Store를 만듭니다. 하위 뷰가 앱 전체 상태나 액션을 알 필요 없게 하므로, 기능을 독립적인 모듈로 나누는 데 중요합니다.

```swift
@Reducer
struct AppFeature {
  @ObservableState
  struct State {
    var activity = Activity.State()
    var search = Search.State()
    var profile = Profile.State()
  }

  enum Action {
    case activity(Activity.Action)
    case search(Search.Action)
    case profile(Profile.Action)
  }

  var body: some ReducerOf<Self> {
    Scope(state: \.activity, action: \.activity) { Activity() }
    Scope(state: \.search, action: \.search) { Search() }
    Scope(state: \.profile, action: \.profile) { Profile() }
  }
}
```

루트 Store를 각 탭의 Store로 스코핑해 전달할 수 있습니다.

```swift
struct AppView: View {
  let store: StoreOf<AppFeature>

  var body: some View {
    TabView {
      ActivityView(
        store: store.scope(\.activity, action: \.activity)
      )
      .tabItem { Text("활동") }

      SearchView(
        store: store.scope(\.search, action: \.search)
      )
      .tabItem { Text("검색") }

      ProfileView(
        store: store.scope(\.profile, action: \.profile)
      )
      .tabItem { Text("프로필") }
    }
  }
}
```

```swift
func scope<ChildState, ChildAction>(
  _ state: KeyPath<State, ChildState>,
  action: CaseKeyPath<Action, ChildAction>
) -> Store<ChildState, ChildAction>
```

첫 번째 인자는 부모 상태에서 자식 상태로 가는 키 경로이고, 두 번째 인자는 자식 액션을 부모 액션으로 감싸는 케이스 키 경로입니다. 스코핑한 Store에서 보낸 자식 액션은 부모 Store와 reducer로 전달되며, 자식 Store의 상태는 부모 상태에서 파생됩니다.

## 상태 관찰

`Store`는 `ObservableObject`를 준수하지만 `@ObservedObject`로 관찰하는 용도가 아닙니다. 이 준수는 Store를 SwiftUI의 `@StateObject`에 보관할 수 있게 하기 위한 것입니다.

현재 TCA에서는 Swift Observation을 사용합니다. 기능 상태에 `@ObservableState`를 적용하고, iOS 17 미만을 지원한다면 Perception 패키지를 함께 사용하세요. Combine 기반의 `store.publisher`는 사용 중단 예정이므로 새 코드에서는 Observation을 사용합니다.

```swift
@Reducer
struct CounterFeature {
  @ObservableState
  struct State {
    var count = 0
  }

  enum Action {
    case incrementButtonTapped
  }
}
```

## 타입 별칭

### `StoreOf`

`StoreOf`는 reducer의 `State`와 `Action`을 풀어 쓴 Store 타입의 편의 별칭입니다.

```swift
public typealias StoreOf<R: Reducer> = Store<R.State, R.Action>
```

아래 두 선언은 같습니다.

```swift
let store: Store<Feature.State, Feature.Action>
let store: StoreOf<Feature>
```

기능의 Store를 선언할 때는 보통 더 짧고, reducer와의 관계가 분명한 `StoreOf<Feature>`를 사용합니다.
