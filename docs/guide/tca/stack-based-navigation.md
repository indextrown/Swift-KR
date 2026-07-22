---
title: 스택 기반 내비게이션
description: TCA에서 StackState와 StackAction으로 내비게이션 스택을 모델링하고 기능을 추가·통합·해제·테스트하는 방법을 설명합니다.
---

# 스택 기반 내비게이션

컬렉션으로 모델링하는 스택 기반 내비게이션을 알아봅니다. 도메인을 모델링하고, 기능을 통합하고, 기능을 테스트하는 방법 등을 다룹니다.

원문: [Stack-based navigation](https://swiftpackageindex.com/pointfreeco/swift-composable-architecture/main/documentation/composablearchitecture/stackbasednavigation)

<!-- upstream-sync: pointfreeco/swift-composable-architecture@ead11e04e5011c437722c1990d22f80d87056978 | source: Sources/ComposableArchitecture/Documentation.docc/Articles/StackBasedNavigation.md -->

## 개요

스택 기반 내비게이션은 상태 컬렉션으로 내비게이션을 모델링하는 방식입니다. 평평한 데이터 컬렉션을 만들고 SwiftUI에 전달하기만 하면 앱의 어떤 상태로든 딥 링크할 수 있습니다. 나머지는 SwiftUI가 처리합니다. 앱에서 복잡하고 재귀적인 내비게이션 경로도 만들 수 있습니다.

- [기본](#기본)
- [기능을 스택에 push하기](#기능을-스택에-push하기)
- [통합](#통합)
- [해제](#해제)
- [테스트](#테스트)
- [StackState와 NavigationPath 비교](#stackstate와-navigationpath-비교)
- [UIKit](#uikit)

## 기본

이 방식의 내비게이션에 필요한 도구는 `StackState`, `StackAction`, `Reducer/forEach(_:action:destination:fileID:filePath:line:column:)-9svqb` 연산자입니다. 또한 일반 initializer처럼 동작하지만 The Composable Architecture에 맞춰진 `NavigationStack`의 `SwiftUI/NavigationStack/init(path:root:destination:fileID:filePath:line:column:)` initializer도 사용합니다.

기능을 내비게이션 스택에 통합하는 작업은 크게 두 단계로 나뉩니다. 기능의 도메인을 통합하고, 스택의 모든 뷰를 설명하는 store로 `NavigationStack`을 구성합니다. 보통은 도메인부터 통합합니다. 먼저 스택에 push할 수 있는 모든 기능의 도메인을 보관하는 새 reducer를 정의합니다. 보통 이 reducer의 이름은 `Path`입니다.

```swift
@Reducer
struct RootFeature {
  // ...

  @Reducer
  enum Path {
    case addItem(AddFeature)
    case detailItem(DetailFeature)
    case editItem(EditFeature)
  }
}
```

> 참고: `Path` reducer는 enum을 사용할 때 트리 기반 내비게이션용으로 만드는 `Destination` reducer와 같습니다. 자세한 내용은 [Enum 상태](./tree-based-navigation.md#enum-상태)를 참고하세요.

`Path` reducer를 정의했다면 내비게이션 스택을 관리하는 기능에서 `StackState`와 `StackAction`을 보관할 수 있습니다.

```swift
@Reducer
struct RootFeature {
  @ObservableState
  struct State {
    var path = StackState<Path.State>()
    // ...
  }
  enum Action {
    case path(StackActionOf<Path>)
    // ...
  }
}
```

> 팁: `StackAction`은 `Path` 도메인의 상태와 액션을 모두 제네릭으로 받습니다. 따라서 `StackActionOf` 타입 별칭으로 문법을 조금 단순하게 만들 수 있습니다. `Action` 하나만 제네릭으로 받는 `PresentationAction`과 다른 점입니다.

그다음 `Reducer/forEach(_:action:)` 메서드로 이동할 수 있는 모든 기능의 도메인을 부모 기능의 도메인에 통합해야 합니다.

```swift
@Reducer
struct RootFeature {
  // ...

  var body: some ReducerOf<Self> {
    Reduce { state, action in
      // 루트 기능의 핵심 로직
    }
    .forEach(\.path, action: \.path)
  }
}
```

> 참고: `@Reducer enum Path`에서 자동으로 추론할 수 있으므로 `forEach`의 trailing closure에서 `Path()`를 지정할 필요가 없습니다.

이것으로 내비게이션 스택을 위한 자식과 부모 기능 통합을 마쳤습니다.

다음으로 자식과 부모 뷰를 통합해야 합니다. 이 라이브러리의 특수 initializer인 `SwiftUI/NavigationStack/init(path:root:destination:fileID:filePath:line:column:)`를 사용하는 `NavigationStack`으로 통합합니다. 이 initializer는 세 인자를 받습니다. 도메인의 `StackState`와 `StackAction`에 초점을 맞춘 store 바인딩, 스택 루트 뷰를 위한 trailing view builder, 스택에 push할 수 있는 모든 뷰를 위한 trailing view builder입니다.

```swift
NavigationStack(
  path: // StackState와 StackAction에 초점을 맞춘 Store
) {
  // 내비게이션 스택의 루트 뷰
} destination: { store in
  // Path.State enum의 각 case를 위한 뷰
}
```

첫 번째 인자를 채우려면 루트 기능에 이미 있는 `path` 상태와 `path` 액션으로 store의 바인딩을 scope하면 됩니다.

```swift
struct RootView: View {
  @Bindable var store: StoreOf<RootFeature>

  var body: some View {
    NavigationStack(
      path: $store.scope(\.path, action: \.path)
    ) {
      // 내비게이션 스택의 루트 뷰
    } destination: { store in
      // Path.State enum의 각 case를 위한 뷰
    }
  }
}
```

루트 뷰에는 원하는 어떤 뷰든 사용할 수 있습니다. 보통은 도메인의 `StackState`에 새 데이터를 push하는 `NavigationLink`나 다른 버튼을 둡니다.

마지막 trailing closure에는 `Path` 도메인의 store가 전달됩니다. `Store/case` 계산 프로퍼티로 `Path`의 각 case를 분해하면 해당 case에만 초점을 맞춘 store를 얻을 수 있습니다.

```swift
} destination: { store in
  switch store.case {
  case .addItem(let store):
  case .detailItem(let store):
  case .editItem(let store):
  }
}
```

이 방식은 `Path.State` enum의 모든 case를 처리했다는 사실을 컴파일 타임에 보장합니다. 스택에 새 목적지 유형을 추가할 때 유용합니다.

각 case에서 원하는 모든 종류의 뷰를 반환할 수 있지만, 최종적으로는 store를 `Path.State` enum의 특정 case로 scope해야 합니다.

```swift
} destination: { store in
  switch store.case {
  case .addItem(let store):
    AddView(store: store)
  case .detailItem(let store):
    DetailView(store: store)
  case .editItem(let store):
    EditView(store: store)
  }
}
```

이것으로 여러 자식 기능을 간결하게 모델링한 도메인으로 내비게이션 스택에 통합했습니다. 이 단계를 마치면 `Path` reducer의 상태와 액션 enum에 새 case를 추가해 스택에 기능을 쉽게 더할 수 있습니다. 또한 부모에서 각 자식 기능에서 일어나는 일을 완전히 살펴볼 수 있습니다. 자세한 내용은 [통합](#통합)을 계속 읽어 보세요.

## 기능을 스택에 push하기

위에서 설명한 대로 도메인을 통합하고 뷰에 `NavigationStack`을 추가했다면, 기능을 스택에 push하는 대표적인 방법은 두 가지입니다. 가장 단순한 방법은 `NavigationLink`의 `SwiftUI/NavigationLink/init(state:label:fileID:filePath:line:column:)` initializer를 사용하는 것입니다. 이 initializer에는 스택에 push할 기능의 상태를 지정해야 합니다. `Path` reducer의 상태까지 거슬러 올라가는 전체 상태를 지정해야 합니다.

```swift
Form {
  NavigationLink(
    state: RootFeature.Path.State.detail(DetailFeature.State())
  ) {
    Text("Detail")
  }
}
```

링크를 탭하면 `StackAction/push(id:state:)` 액션이 전송됩니다. `path` 컬렉션이 변경되고 `.detail` 상태가 스택 끝에 추가됩니다.

이 방법은 화면으로 이동하는 가장 단순한 방법이지만 단점도 있습니다. 특히 `NavigationLink`를 가진 뷰는 `Path.State` 타입에 접근할 수 있어야 합니다. 즉 이동할 수 있는 _모든_ 기능을 포함하는 `Path` reducer 전체를 구성해야 하므로 모듈화가 어려워집니다.

이 때문에 스택에 표시할 수 있는 각 기능을 완전히 분리된 상태로 개별 구성할 수 없습니다. 모든 기능을 함께 구성해야 합니다. 기술적으로는 모든 기능의 `State` 타입만 별도 모듈로 옮길 수 있습니다. 그러면 모든 기능 reducer를 구성하지 않고도 기능이 그 모듈에만 의존하게 만들 수 있습니다.

다른 방법은 `NavigationLink`를 전혀 사용하지 않고, 자식 기능 도메인의 액션을 보내는 `Button`을 사용하는 것입니다.

```swift
Form {
  Button("Detail") {
    store.send(.detailButtonTapped)
  }
}
```

그러면 루트 기능은 이 액션을 수신하고 새 상태를 `path`에 추가해 내비게이션을 구동할 수 있습니다.

```swift
case .path(.element(id: _, action: .list(.detailButtonTapped))):
  state.path.append(.detail(DetailFeature.State()))
  return .none
```

## 통합

위 단계로 기능을 통합하면 부모 기능은 내비게이션 스택 내부에서 일어나는 모든 일에 즉시 접근할 수 있습니다. 이를 스택 요소 기능과 부모 기능의 로직을 통합하는 수단으로 활용할 수 있습니다. 예를 들어 편집 기능에서 `Save` 버튼을 탭했는지 감지하려면 해당 액션을 분해하면 됩니다. `StackAction`, `StackAction/element(id:action:)` 액션, 관심 있는 기능, 마지막으로 관심 있는 액션을 차례로 패턴 매칭합니다.

```swift
case let .path(.element(id: id, action: .editItem(.saveButtonTapped))):
  // ...
```

이 case 안에서는 기능 상태를 추출해 추가 로직을 수행할 수 있습니다. 예를 들어 `edit` 기능을 pop하고 수정한 항목을 데이터베이스에 저장할 수 있습니다.

```swift
case let .path(.element(id: id, action: .editItem(.saveButtonTapped))):
  guard let editItemState = state.path[id: id]?.editItem
  else { return .none }

  state.path.pop(from: id)
  return .run { _ in
    await self.database.save(editItemState.item)
  }
```

`StackAction/element(id:action:)` 액션을 분해하면 자식 도메인에서 발생한 액션뿐 아니라 스택 요소의 ID에도 접근할 수 있습니다. `StackState`는 스택에 추가하는 모든 기능의 ID를 자동으로 관리합니다. `StackState/subscript(id:fileID:filePath:line:column:)`으로 스택의 특정 요소를 조회하고, `StackState/pop(from:)`으로 스택에서 요소를 pop할 때 이 ID를 사용할 수 있습니다.

## 해제

스택의 기능을 해제하려면 `StackState/popLast()`, `StackState/pop(from:)` 같은 `StackState` 메서드로 상태를 변경하면 됩니다.

```swift
case .closeButtonTapped:
  state.path.popLast()
  return .none
```

하지만 이렇게 하려면 스택 상태에 접근할 수 있어야 하며, 보통은 부모만 접근할 수 있습니다. 그러나 부모와 명시적으로 통신하지 않고 자식 기능 안에 기능 해제 로직을 캡슐화하고 싶을 때가 많습니다.

SwiftUI는 자식 _뷰_가 부모와 명시적으로 통신하지 않고도 스스로 해제할 수 있는 훌륭한 도구를 제공합니다. `dismiss`라는 환경 값이며, 다음과 같이 사용할 수 있습니다.

```swift
struct ChildView: View {
  @Environment(\.dismiss) var dismiss
  var body: some View {
    Button("Close") { self.dismiss() }
  }
}
```

`self.dismiss()`를 호출하면 SwiftUI는 내비게이션 스택에서 표시된 가장 가까운 부모 뷰를 찾고, 스택을 구동하는 컬렉션에서 해당 상태를 제거합니다. 이는 매우 유용하지만 뷰 계층으로 한정됩니다. `dismiss`는 관찰 가능한 객체 같은 다른 곳에서는 사용할 수 없으므로 검증이나 비동기 작업처럼 세밀한 해제 로직을 구현할 수 없습니다.

TCA(The Composable Architecture)에도 비슷한 도구가 있습니다. 다만 기능의 다른 로직과 동작이 있는 reducer에서 사용하기에 알맞습니다. 라이브러리의 의존성 관리 시스템(`DependencyManagement` 참고)을 통해 `DismissEffect`로 접근합니다.

```swift
@Reducer
struct Feature {
  @ObservableState
  struct State { /* ... */ }
  enum Action {
    case closeButtonTapped
    // ...
  }
  @Dependency(\.dismiss) var dismiss
  var body: some Reducer<State, Action> {
    Reduce { state, action in
      switch action {
      case .closeButtonTapped:
        return .run { _ in await self.dismiss() }
      // ...
      }
    }
  }
}
```

> 참고: `DismissEffect` 함수는 비동기 함수이므로 reducer 안에서 직접 호출할 수 없습니다. 대신 `Effect/run(priority:operation:catch:fileID:filePath:line:column:)`에서 호출해야 합니다.

`self.dismiss()`를 호출하면 내비게이션 스택을 구동하는 `StackState`에서 해당 값을 제거합니다. 시스템에 `StackAction/popFrom(id:)` 액션을 다시 보내 기능 상태를 제거하는 방식입니다. 따라서 부모와 명시적으로 통신하지 않고 자식 도메인 안에 자식 기능을 해제하는 로직 전체를 캡슐화할 수 있습니다.

> 참고: 해제는 액션을 보내 처리하므로 `dismiss()`를 호출한 뒤에는 절대로 액션을 보내면 안 됩니다.
>
> ```swift
> return .run { send in
>   await self.dismiss()
>   await send(.tick)  // ⚠️
> }
> ```
>
> 이렇게 하면 더 이상 스택에 없는 기능에 액션을 보내게 됩니다. Xcode에서는 런타임 경고가 발생하고, 테스트를 실행하면 실패합니다.

> 주의: SwiftUI의 환경 값 `@Environment(\.dismiss)`와 TCA의 의존성 값 `@Dependency(\.dismiss)`는 비슷한 목적을 가지지만 완전히 다른 타입입니다. SwiftUI의 환경 값은 SwiftUI 뷰 안에서만 사용할 수 있고, TCA의 의존성 값은 reducer 안에서만 사용할 수 있습니다.

## 테스트

이 라이브러리 도구로 내비게이션 스택을 모델링하면 테스트가 매우 쉬워집니다. 또한 내비게이션을 테스트할 때는 몇 가지 상위 수준 세부 사항만 검증하고 모든 상태 변경과 effect를 검증할 필요가 없는 경우가 많으므로, 비완전 테스트(non-exhaustive testing, `TestingTCA#Non-exhaustive-testing` 참고)를 활용하면 좋습니다.

예를 들어 count가 5 이상이면 스스로 해제하려는 간단한 counter 기능을 살펴보겠습니다.

```swift
@Reducer
struct CounterFeature {
  @ObservableState
  struct State: Equatable {
    var count = 0
  }
  enum Action {
    case decrementButtonTapped
    case incrementButtonTapped
  }

  @Dependency(\.dismiss) var dismiss

  var body: some Reducer<State, Action> {
    Reduce { state, action in
      switch action {
      case .decrementButtonTapped:
        state.count -= 1
        return .none

      case .incrementButtonTapped:
        state.count += 1
        return state.count >= 5
          ? .run { _ in await self.dismiss() }
          : .none
      }
    }
  }
}
```

그런 다음 이 기능을 부모 기능에 포함합니다.

```swift
@Reducer
struct Feature {
  @ObservableState
  struct State: Equatable {
    var path = StackState<Path.State>()
  }
  enum Action {
    case path(StackActionOf<Path>)
  }

  @Reducer
  enum Path {
    case counter(CounterFeature)
  }

  var body: some ReducerOf<Self> {
    Reduce { state, action in
      // 핵심 기능의 로직과 동작
    }
    .forEach(\.path, action: \.path) { Path.body }
  }
}
```

이제 자식 counter 기능의 count가 5 이상이 되면 스스로 해제된다는 것을 증명하는 `Feature` reducer 테스트를 작성해 보겠습니다. counter가 하나만 스택에 있는 상태에서 시작하는 `Feature`용 `TestStore`를 만듭니다.

```swift
@Test
func dismissal() {
  let store = TestStore(
    initialState: Feature.State(
      path: StackState([
        .counter(CounterFeature.State(count: 3))
      ])
    )
  ) {
    Feature()
  }
}
```

그다음 스택 안의 counter 자식 기능에 `.incrementButtonTapped` 액션을 보내 count가 1 증가하는지 확인합니다. 이때 ID를 제공해야 합니다.

```swift
await store.send(\.path[id: ???].counter.incrementButtonTapped) {
  // ...
}
```

[통합](#통합)에서 설명했듯 `StackState`는 각 기능의 ID를 자동으로 관리하며, 이 ID는 외부에서는 대부분 불투명합니다. 하지만 테스트에서는 ID가 정수형이며 세대별로 관리됩니다. 즉 ID는 0에서 시작하고 스택에 push하는 기능마다 전역 ID가 하나씩 증가합니다.

따라서 요소 하나가 이미 스택에 있는 상태로 `TestStore`를 만들면 그 요소에는 ID 0이 부여됩니다. 이 ID로 액션을 보낼 수 있습니다.

```swift
await store.send(\.path[id: 0].counter.incrementButtonTapped) {
  // ...
}
```

다음으로 액션이 전송됐을 때 스택의 counter 기능이 어떻게 바뀌는지 검증해야 합니다. 여러 계층을 거쳐야 합니다. 먼저 ID로 subscript하고, 그 subscript가 반환하는 Optional 값을 unwrap하고, `Path.State` enum의 case를 패턴 매칭한 뒤 값을 변경합니다.

라이브러리는 이 모든 단계를 한 번에 수행하는 두 가지 도구를 제공합니다. 먼저 `XCTModify` helper를 사용할 수 있습니다.

```swift
await store.send(\.path[id: 0].counter.incrementButtonTapped) {
  XCTModify(&$0.path[id: 0], case: \.counter) {
    $0.count = 4
  }
}
```

`XCTModify` 함수는 첫 번째 인자로 `inout` enum 상태를 받고 두 번째 인자로 case path를 받습니다. case path로 해당 case의 payload를 추출하고, 값을 변경한 뒤, 데이터를 enum에 다시 넣습니다. 따라서 위 코드에서는 ID 0으로 subscript하고 `Path.State` enum의 `.counter` case를 분리한 뒤, 1 증가한 `count`를 4로 변경합니다. `$0.path[id: 0]`의 case가 case path와 일치하지 않으면 테스트가 실패합니다.

다른 방법은 `StackState/subscript(id:case:)-7gczr`로 스택의 ID와 path enum의 case를 동시에 subscript하는 것입니다.

```swift
await store.send(\.path[id: 0].counter.incrementButtonTapped) {
  $0.path[id: 0, case: \.counter]?.count = 4
}
```

상태에서 변경할 항목이 많다면 `XCTModify` 스타일이 좋고, 단순한 변경이라면 `StackState/subscript(id:case:)-7gczr` 스타일이 좋습니다.

테스트를 계속 진행해 count가 5가 되는지 확인하려면 한 번 더 액션을 보냅니다.

```swift
await store.send(\.path[id: 0].counter.incrementButtonTapped) {
  XCTModify(&$0.path[id: 0], case: \.counter) {
    $0.count = 5
  }
}
```

마지막으로 자식 기능이 스스로 해제되기를 기대합니다. 이 동작은 counter 기능을 스택에서 pop하기 위해 `StackAction/popFrom(id:)` 액션이 전송되는 것으로 나타납니다. `TestStore`의 `TestStore/receive(_:timeout:assert:fileID:file:line:column:)-53wic` 메서드로 이를 검증할 수 있습니다.

```swift
await store.receive(\.path.popFrom) {
  $0.path[id: 0] = nil
}
```

특정 자식 액션을 수신했는지 검증해야 한다면 요소 ID로 `\.path` case를 subscript해 특정 자식 요소 액션의 case key path를 만들 수 있습니다.

예를 들어 자식 기능이 `.response` 액션을 보내는 effect를 수행했다면, 수신 여부를 테스트할 수 있습니다.

```swift
await store.receive(\.path[id: 0].counter.response) {
  // ...
}
```

이 예제는 내비게이션 스택에서 부모와 자식 기능이 서로 어떻게 상호작용하는지에 관한 세밀한 테스트를 작성하는 방법을 보여 줍니다.

하지만 기능이 복잡해질수록 통합을 테스트하기도 더 번거로워집니다. 기본적으로 `TestStore`는 완전한 검증을 요구합니다. 모든 상태 변경, 모든 effect가 시스템에 데이터를 다시 전달하는 방식, 그리고 테스트가 끝날 때 모든 effect가 끝났는지를 검증해야 합니다(`TestingTCA` 참고).

하지만 `TestStore`는 실제로 관심 있는 기능 부분만 검증할 수 있는 비완전 테스트(non-exhaustive testing, `TestingTCA#Non-exhaustive-testing` 참고)도 지원합니다.

예를 들어 test store에서 exhaustivity를 끄면(`TestStore/exhaustivity` 참고), increment 버튼을 두 번 탭했을 때 결국 `StackAction/popFrom(id:)` 액션을 받는다는 사실을 상위 수준에서 검증할 수 있습니다.

```swift
@Test
func dismissal() {
  let store = TestStore(
    initialState: Feature.State(
      path: StackState([
        .counter(CounterFeature.State(count: 3))
      ])
    )
  ) {
    Feature()
  }
  store.exhaustivity = .off

  await store.send(\.path[id: 0].counter.incrementButtonTapped)
  await store.send(\.path[id: 0].counter.incrementButtonTapped)
  await store.receive(\.path.popFrom)
}
```

이는 앞선 테스트와 본질적으로 같은 내용을 증명하지만, 훨씬 적은 줄로 작성할 수 있고 특별히 관심 없는 기능의 향후 변경에도 더 견고합니다.

## StackState와 NavigationPath 비교

SwiftUI에는 내비게이션 스택의 데이터를 모델링하는 강력한 타입인 [`NavigationPath`][nav-path-docs]가 있습니다. 그렇다면 왜 `NavigationPath`를 활용하지 않고 `StackState`라는 자체 데이터 타입을 만들었는지 궁금할 수 있습니다.

`NavigationPath` 데이터 타입은 `NavigationStack`에 맞춰진 타입 소거 데이터 목록입니다. `Hashable`하기만 하면 어떤 종류의 데이터든 path에 추가할 수 있으므로 스택의 기능을 최대한 분리할 수 있습니다.

```swift
var path = NavigationPath()
path.append(1)
path.append("Hello")
path.append(false)
```

SwiftUI는 데이터 타입에 맞춰 스택에 push할 뷰를 설명해서 이 데이터를 해석합니다.

```swift
struct RootView: View {
  @State var path = NavigationPath()

  var body: some View {
    NavigationStack(path: self.$path) {
      Form {
        // ...
      }
      .navigationDestination(for: Int.self) { integer in
        // ...
      }
      .navigationDestination(for: String.self) { string in
        // ...
      }
      .navigationDestination(for: Bool.self) { bool in
        // ...
      }
    }
  }
}
```

이 방식은 강력하지만 단점도 있습니다. 기반 데이터가 타입 소거되어 있으므로 SwiftUI는 데이터 타입에 관한 API를 많이 노출하지 않습니다. 예를 들어 위에서 본 것처럼 path 끝에 데이터를 추가하거나, 끝에서 데이터를 제거할 수만 있습니다.

```swift
path.removeLast()
```

또는 path의 요소 수를 셀 수 있습니다.

```swift
path.count
```

이것이 전부입니다. 끝이 아닌 위치에는 요소를 넣거나 뺄 수 없으며, path를 순회할 수도 없습니다.

```swift
let path: NavigationPath = …
for element in path {  // 🛑
}
```

따라서 스택에 무엇이 있는지 분석하거나 스택 전체의 데이터를 집계하기가 매우 어려울 수 있습니다.

The Composable Architecture의 `StackState`는 `NavigationPath`와 비슷한 목적을 가지지만 trade-off가 다릅니다.

- `StackState`는 완전히 정적으로 타입이 지정되므로 어떤 종류의 데이터든 추가할 수는 없습니다.
- 하지만 `StackState`는 `Collection` 프로토콜(`RandomAccessCollection`, `RangeReplaceableCollection` 포함)을 준수합니다. 따라서 컬렉션을 조작하고 스택 내부를 살펴보는 다양한 메서드에 접근할 수 있습니다.
- 기능 데이터를 `StackState`에 넣기 위해 `Hashable`일 필요는 없습니다. 이 데이터 타입은 내부적으로 기능의 안정적인 식별자를 관리하고, 이 식별자에서 hash 값을 자동으로 파생합니다.

`StackState`는 런타임의 완전한 유연성과 정적인 컴파일 타임 보장 사이에서 좋은 균형을 제공하며, The Composable Architecture에서 내비게이션 스택을 모델링하는 데 적합한 도구라고 생각합니다.

[nav-path-docs]: https://developer.apple.com/documentation/swiftui/navigationpath

## UIKit

이 라이브러리는 UIKit의 `UINavigationController`를 상태 기반으로 사용할 수 있는 도구도 제공합니다. 위에서 설명한 대로 `StackState`로 도메인을 모델링했다면, 특수한 `NavigationStackController` 타입으로 스택용 view controller를 구현할 수 있습니다.

```swift
class AppController: NavigationStackController {
  private var store: StoreOf<AppFeature>!

  convenience init(store: StoreOf<AppFeature>) {
    @UIBindable var store = store

    self.init(path: $store.scope(\.path, action: \.path)) {
      RootViewController(store: store)
    } destination: { store in
      switch store.case {
      case .addItem(let store):
        AddViewController(store: store)
      case .detailItem(let store):
        DetailViewController(store: store)
      case .editItem(let store):
        EditViewController(store: store)
      }
    }

    self.store = store
  }
}
```
