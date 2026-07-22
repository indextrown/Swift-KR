---
title: 트리 기반 내비게이션
description: TCA에서 Optional과 enum 상태로 내비게이션을 모델링하고 기능을 통합·해제·테스트하는 방법을 설명합니다.
---

# 트리 기반 내비게이션

Optional과 enum으로 모델링하는 트리 기반 내비게이션을 알아봅니다. 도메인을 모델링하고, 기능을 통합하고, 기능을 테스트하는 방법 등을 다룹니다.

원문: [Tree-based navigation](https://swiftpackageindex.com/pointfreeco/swift-composable-architecture/main/documentation/composablearchitecture/treebasednavigation/)

<!-- upstream-sync: pointfreeco/swift-composable-architecture@ead11e04e5011c437722c1990d22f80d87056978 | source: Sources/ComposableArchitecture/Documentation.docc/Articles/TreeBasedNavigation.md -->

## 개요

트리 기반 내비게이션은 Optional과 enum 상태로 내비게이션을 모델링하는 방식입니다. 이 방식에서는 깊이 중첩된 상태를 만들고 SwiftUI에 전달하기만 하면, 앱의 어떤 상태로든 딥 링크할 수 있습니다. 나머지는 SwiftUI가 처리합니다.

- [기본](#기본)
- [Enum 상태](#enum-상태)
- [통합](#통합)
- [해제](#해제)
- [테스트](#테스트)

## 기본

이 방식의 내비게이션에 필요한 도구는 `Presents()` 매크로, `PresentationAction`, `Reducer/ifLet(_:action:destination:fileID:filePath:line:column:)-4ub6q` 연산자뿐입니다. 기능을 이 도구로 올바르게 통합하면 `sheet(item:)`, `popover(item:)` 등 SwiftUI가 제공하는 일반 내비게이션 뷰 수정자를 모두 사용할 수 있습니다.

내비게이션을 위해 두 기능을 통합하는 작업은 크게 두 단계로 나뉩니다. 먼저 기능의 도메인을 통합하고, 그다음 기능의 뷰를 통합합니다. 보통은 도메인부터 통합합니다. 부모에 자식의 상태와 액션을 추가한 뒤, reducer 연산자로 자식 reducer를 부모 reducer에 조합합니다.

예를 들어 항목 목록에서 새 항목을 추가하는 폼을 시트로 표시한다고 가정해 보겠습니다. `Presents()` 매크로와 `PresentationAction` 타입으로 상태와 액션을 통합할 수 있습니다.

```swift
@Reducer
struct InventoryFeature {
  @ObservableState
  struct State: Equatable {
    @Presents var addItem: ItemFormFeature.State?
    var items: IdentifiedArrayOf<Item> = []
    // ...
  }

  enum Action {
    case addItem(PresentationAction<ItemFormFeature.Action>)
    // ...
  }

  // ...
}
```

> 참고: `addItem` 상태는 Optional로 보관합니다. `nil`이 아닌 값은 해당 기능이 표시되고 있음을 뜻하고, `nil`은 해당 기능이 해제되었음을 뜻합니다.

다음으로 `Reducer/ifLet(_:action:destination:fileID:filePath:line:column:)-4ub6q` reducer 연산자로 부모와 자식 기능의 reducer를 통합합니다. 또한 부모 도메인에는 자식 상태를 채워 내비게이션을 구동하는 액션이 있어야 합니다.

```swift
@Reducer
struct InventoryFeature {
  @ObservableState
  struct State: Equatable { /* ... */ }
  enum Action { /* ... */ }

  var body: some ReducerOf<Self> {
    Reduce { state, action in
      switch action {
      case .addButtonTapped:
        // 이 상태를 채우면 내비게이션이 수행됩니다.
        state.addItem = ItemFormFeature.State()
        return .none

      // ...
      }
    }
    .ifLet(\.$addItem, action: \.addItem) {
      ItemFormFeature()
    }
  }
}
```

> 참고: `ifLet`에 사용하는 키 경로는 `$` 문법을 사용하므로 `@PresentationState`의 projected value에 초점을 맞춥니다. 또한 액션에는 키 경로와 비슷하지만 enum에 맞춘 [case path](http://github.com/pointfreeco/swift-case-paths)를 사용합니다.

이것으로 부모와 자식 기능의 도메인과 로직을 통합했습니다. 다음으로 기능의 뷰를 통합해야 합니다. store의 바인딩을 SwiftUI 뷰 수정자 중 하나에 전달하면 됩니다.

예를 들어 `InventoryFeature`의 `addItem` 상태에서 시트를 표시하려면, 프레젠테이션 상태와 액션에 초점을 맞춘 `Store`의 바인딩을 `sheet(item:)` 수정자 인자로 전달합니다.

```swift
struct InventoryView: View {
  @Bindable var store: StoreOf<InventoryFeature>

  var body: some View {
    List {
      // ...
    }
    .sheet(
      item: $store.scope(\.addItem, action: \.addItem)
    ) { store in
      ItemFormView(store: store)
    }
  }
}
```

> 참고: SwiftUI의 `@Bindable` 프로퍼티 래퍼로 store의 바인딩을 만들고, 이 바인딩은 `SwiftUI/Binding/scope(_:action:fileID:filePath:line:column:)`으로 다시 scope할 수 있습니다.

이 몇 단계를 마치면 부모와 자식 기능의 도메인 및 뷰가 통합됩니다. `addItem` 상태가 `nil`이 아닌 값으로 바뀌면 시트가 표시되고, `nil`로 바뀌면 시트가 해제됩니다.

이 예제에서는 `.sheet` 뷰 수정자를 사용하지만, SwiftUI가 제공하는 모든 뷰 수정자에 같은 방식으로 store를 전달할 수 있습니다. `popover(item:)`, `fullScreenCover(item:)`, `navigationDestination(item:)` 등이 여기에 포함됩니다. 따라서 Optional 상태로 SwiftUI 앱의 모든 형태의 내비게이션을 구동할 수 있습니다.

## Enum 상태

Optional 상태로 내비게이션을 구동하면 강력하지만, 도메인을 이상적으로 모델링하지 못할 수 있습니다. 특히 하나의 기능이 여러 화면으로 이동할 수 있다면 여러 Optional 값으로 모델링하고 싶어질 수 있습니다.

```swift
@ObservableState
struct State {
  @Presents var detailItem: DetailFeature.State?
  @Presents var editItem: EditFeature.State?
  @Presents var addItem: AddFeature.State?
  // ...
}
```

하지만 이렇게 하면 두 개 이상의 상태가 동시에 `nil`이 아닌 잘못된 상태가 생길 수 있고, 이는 많은 문제를 일으킵니다. 우선 SwiftUI는 하나의 뷰에서 여러 뷰를 동시에 표시하는 것을 지원하지 않습니다. 따라서 상태에서 이를 허용하면 SwiftUI와의 관계에서 앱을 일관되지 않은 상태로 만들 위험이 있습니다.

또한 실제로 어떤 기능이 표시 중인지 판단하기가 어려워집니다. 어떤 값이 `nil`이 아닌지 알기 위해 여러 Optional을 확인해야 합니다. 동시에 여러 상태가 `nil`이 아닐 때 이를 어떻게 해석할지도 결정해야 합니다.

이동할 수 있는 기능 수가 늘어날수록 잘못된 상태의 수도 기하급수적으로 늘어납니다. 예를 들어 Optional이 3개면 잘못된 상태가 4개, 4개면 11개, 5개면 26개가 됩니다.

이런 이유로 여러 Optional 대신 하나의 enum으로 기능의 여러 목적지를 모델링하는 편이 더 나을 수 있습니다. 위의 Optional 3개 예제는 enum으로 다음과 같이 리팩터링할 수 있습니다.

```swift
enum State {
  case addItem(AddFeature.State)
  case detailItem(DetailFeature.State)
  case editItem(EditFeature.State)
  // ...
}
```

이 방식은 한 번에 하나의 목적지만 활성화할 수 있다는 사실을 컴파일 타임에 보장합니다.

이 도메인 모델링 방식을 사용하려면 몇 단계를 더 거쳐야 합니다. 먼저 이동할 수 있는 모든 기능의 도메인과 동작을 감싸는 `destination` reducer를 모델링합니다. 보통 이 reducer는 내비게이션을 수행하는 기능 내부에 중첩하는 편이 좋습니다. `Reducer()` 매크로는 이동할 수 있는 기능을 간단히 설명하는 것만으로도 전체 reducer를 구현해 대부분의 작업을 처리해 줍니다.

```swift
@Reducer
struct InventoryFeature {
  // ...

  @Reducer
  enum Destination {
    case addItem(AddFeature)
    case detailItem(DetailFeature)
    case editItem(EditFeature)
  }
}
```

> 참고: `Reducer()` 매크로는 목적지 기능을 나타내는 단순한 enum 설명을 받아 각 기능 상태에 해당하는 case를 가진 enum 상태에서 동작하는 완전히 조합된 기능으로 확장합니다. Xcode에서 매크로 코드를 확장하면 자동으로 작성된 모든 코드를 볼 수 있습니다.

> 팁: `Reducer()` 매크로가 `State`와 `Action` 타입을 생성하므로, 이 타입에 프로토콜을 적용해야 한다면 extension에서 적용하면 됩니다.
>
> ```swift
> extension InventoryFeature.Destination.State: Equatable, Sendable {}
> ```

이제 `Presents()` 매크로를 사용해 기능에서 _하나의_ Optional 상태를 보관하고, `PresentationAction` 타입으로 목적지 액션을 보관할 수 있습니다.

```swift
@Reducer
struct InventoryFeature {
  @ObservableState
  struct State {
    @Presents var destination: Destination.State?
    // ...
  }
  enum Action {
    case destination(PresentationAction<Destination.Action>)
    // ...
  }

  // ...
}
```

그다음 `Reducer/ifLet(_:action:destination:fileID:filePath:line:column:)-4ub6q` 연산자로 목적지 도메인을 부모 기능의 도메인에 통합해야 합니다.

```swift
@Reducer
struct InventoryFeature {
  // ...

  var body: some ReducerOf<Self> {
    Reduce { state, action in
      // ...
    }
    .ifLet(\.$destination, action: \.destination)
  }
}
```

> 참고: `Reducer()` 매크로로 `Destination` enum을 정의한 방식 덕분에 타입을 자동으로 추론할 수 있으므로, `ifLet`의 trailing closure에서 `Destination`을 지정할 필요가 없습니다.

이것으로 자식과 부모 기능을 통합하는 단계를 마쳤습니다.

이제 특정 기능을 표시하려면 `destination` 상태를 해당 enum case로 채우기만 하면 됩니다.

```swift
case addButtonTapped:
  state.destination = .addItem(AddFeature.State())
  return .none
```

그리고 언제든 여러 Optional 값을 확인하는 대신 `destination` 상태 하나를 switch하거나 다른 방식으로 분해해서, 정확히 어떤 기능이 표시 중인지 알 수 있습니다.

마지막 단계는 라이브러리의 스코프 기능을 사용해 `Destination` 도메인에 초점을 맞추고, 점 표기 체이닝으로 상태와 액션 enum의 특정 case를 더 세밀하게 분리하는 것입니다.

예를 들어 `add` 화면은 시트로, `edit` 화면은 팝오버로, `detail` 화면은 드릴다운으로 표시한다고 가정해 보겠습니다. 그러면 SwiftUI의 `.sheet(item:)`, `.popover(item:)`, `.navigationDestination(item:)` 뷰 수정자를 사용해 목적지 enum의 각 case로 각 프레젠테이션 방식을 구동할 수 있습니다.

먼저 `@Bindable` 프로퍼티 래퍼로 store를 바인딩 가능한 형태로 보관해야 합니다.

```swift
struct InventoryView: View {
  @Bindable var store: StoreOf<InventoryFeature>
  // ...
}
```

그다음 뷰의 `body`에서 `SwiftUI/Binding/scope(_:action:fileID:filePath:line:column:)` 연산자를 사용해 `$store`에서 바인딩을 파생할 수 있습니다.

```swift
var body: some View {
  List {
    // ...
  }
  .sheet(
    item: $store.scope(\.destination, action: \.destination).addItem
  ) { store in
    AddFeatureView(store: store)
  }
  .popover(
    item: $store.scope(\.destination, action: \.destination).editItem
  ) { store in
    EditFeatureView(store: store)
  }
  .navigationDestination(
    item: $store.scope(\.destination, action: \.destination).detailItem
  ) { store in
    DetailFeatureView(store: store)
  }
}
```

이 단계를 마치면 도메인을 최대한 간결하게 모델링했음을 확신할 수 있습니다. `add` 항목 시트가 표시된 상태에서 `destination` 상태를 `.detailItem` case로 바꾸기로 했다면, 시트가 해제되고 드릴다운이 즉시 일어남을 보장할 수 있습니다.

### API 통합

트리 기반 내비게이션의 가장 좋은 특성 중 하나는 하나의 API 스타일로 모든 내비게이션 형태를 통합한다는 점입니다. 먼저 수행하려는 내비게이션 유형과 상관없이, `Reducer/ifLet(_:action:destination:fileID:filePath:line:column:)-4ub6q` 연산자 하나로 부모와 자식 기능을 통합할 수 있습니다. 이 API 하나가 Optional 기반 내비게이션의 모든 형태를 지원합니다.

또한 뷰에서 드릴다운, 시트, 알림, 사용자 지정 내비게이션 컴포넌트 중 무엇을 표시하려는지와 상관없이, `PresentationState`와 `PresentationAction`에 초점을 맞춘 store를 인자로 받는 API를 호출하기만 하면 됩니다. 그러면 API가 나머지를 처리합니다. 상태가 `nil`이 아니게 되면 자식 뷰를 표시하고, 다시 `nil`이 되면 해제합니다.

즉 하나의 뷰에서 시트, 팝오버, 드릴다운, 알림, 확인 대화상자를 모두 표시해야 하더라도 다양한 내비게이션을 표시하는 작업은 이처럼 간단해질 수 있습니다.

```swift
.sheet(
  item: $store.scope(\.addItem, action: \.addItem)
) { store in
  AddFeatureView(store: store)
}
.popover(
  item: $store.scope(\.editItem, action: \.editItem)
) { store in
  EditFeatureView(store: store)
}
.navigationDestination(
  item: $store.scope(\.detailItem, action: \.detailItem)
) { store in
  DetailFeatureView(store: store)
}
.alert(
  $store.scope(\.alert, action: \.alert)
)
.confirmationDialog(
  $store.scope(\.confirmationDialog, action: \.confirmationDialog)
)
```

각 경우에 프레젠테이션 도메인으로 scope한 store와, 해당 상태가 `nil`이 아닐 때 표시할 뷰를 전달합니다. 겉보기에는 서로 다른 수많은 내비게이션 형태를 하나의 API 스타일로 통합할 수 있다는 점은 매우 강력합니다.

#### 이전 OS 버전 지원

배포 대상에 따라 일부 API를 사용할 수 없을 수 있습니다. 예를 들어 iOS 16, macOS 13, tvOS 16, watchOS 9보다 이전 플랫폼을 대상으로 한다면 `navigationDestination`을 사용할 수 없습니다. 이 경우 `NavigationLink`를 사용할 수 있습니다. 다만 단순한 Boolean이 아닌 데이터 바인딩으로 내비게이션을 구동하는 보조 초기화 메서드를 정의해야 합니다. 아래 코드를 프로젝트에 추가하세요.

```swift
@available(iOS, introduced: 13, deprecated: 16)
@available(macOS, introduced: 10.15, deprecated: 13)
@available(tvOS, introduced: 13, deprecated: 16)
@available(watchOS, introduced: 6, deprecated: 9)
extension NavigationLink {
  public init<D, C: View>(
    item: Binding<D?>,
    onNavigate: @escaping (_ isActive: Bool) -> Void,
    @ViewBuilder destination: (D) -> C,
    @ViewBuilder label: () -> Label
  ) where Destination == C? {
    self.init(
      destination: item.wrappedValue.map(destination),
      isActive: Binding(
        get: { item.wrappedValue != nil },
        set: { isActive, transaction in
          onNavigate(isActive)
          if !isActive {
            item.transaction(transaction).wrappedValue = nil
          }
        }
      ),
      label: label
    )
  }
}
```

이 코드로 상태에서 `NavigationLink`를 구동할 수 있습니다. 링크를 탭하면 `onNavigate` 클로저가 호출되어 상태를 채울 수 있습니다. 기능이 해제되면 상태는 `nil`이 됩니다.

## 통합

위 단계로 기능을 통합하면 부모 기능은 자식 기능 내부에서 일어나는 모든 일에 즉시 접근할 수 있습니다. 이를 자식과 부모 기능의 로직을 통합하는 수단으로 활용할 수 있습니다. 예를 들어 편집 기능에서 `Save` 버튼을 탭했는지 감지하려면 해당 액션을 분해하면 됩니다. `PresentationAction`을 패턴 매칭하고, 이어서 `PresentationAction/presented(_:)` case, 관심 있는 기능, 마지막으로 관심 있는 액션을 패턴 매칭합니다.

```swift
case .destination(.presented(.editItem(.saveButtonTapped))):
  // ...
```

이 case 안에서는 기능 상태를 추출해 추가 로직을 수행할 수 있습니다. 예를 들어 `edit` 기능을 닫고 수정한 항목을 데이터베이스에 저장할 수 있습니다.

```swift
case .destination(.presented(.editItem(.saveButtonTapped))):
  guard case let .editItem(editItemState) = state.destination
  else { return .none }

  state.destination = nil
  return .run { _ in
    self.database.save(editItemState.item)
  }
```

## 해제

표시된 기능을 해제하려면 표시된 기능을 나타내는 상태를 `nil`로 만들기만 하면 됩니다.

```swift
case .closeButtonTapped:
  state.destination = nil
  return .none
```

프레젠테이션 상태를 `nil`로 만들려면 보통 그 상태에 접근할 수 있어야 합니다. 대개는 부모만 해당 상태에 접근할 수 있습니다. 하지만 부모와 명시적으로 통신하지 않으면서도 기능을 해제하는 로직을 자식 기능 안에 캡슐화하고 싶을 때가 많습니다.

SwiftUI는 자식 _뷰_가 부모와 명시적으로 통신하지 않고도 스스로 해제할 수 있는 훌륭한 도구를 제공합니다. `dismiss`라는 환경 값이며, 다음과 같이 사용할 수 있습니다.

```swift
struct ChildView: View {
  @Environment(\.dismiss) var dismiss
  var body: some View {
    Button("Close") { self.dismiss() }
  }
}
```

`self.dismiss()`를 호출하면 SwiftUI는 프레젠테이션이 있는 가장 가까운 부모 뷰를 찾고, 프레젠테이션을 구동하는 바인딩에 `false` 또는 `nil`을 써서 해제합니다. 이는 매우 유용하지만 뷰 계층으로 한정됩니다. `dismiss`는 관찰 가능한 객체 같은 다른 곳에서는 사용할 수 없으므로 검증이나 비동기 작업처럼 세밀한 해제 로직을 구현할 수 없습니다.

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
      }
    }
  }
}
```

> 참고: `DismissEffect` 함수는 비동기 함수이므로 reducer 안에서 직접 호출할 수 없습니다. 대신 `Effect/run(priority:operation:catch:fileID:filePath:line:column:)`에서 호출해야 합니다.

`self.dismiss()`를 호출하면 `PresentationAction/dismiss` 액션을 시스템에 다시 보내 표시된 기능의 상태를 `nil`로 만듭니다. 따라서 부모와 명시적으로 통신하지 않고 자식 도메인 안에 자식 기능을 해제하는 로직 전체를 캡슐화할 수 있습니다.

> 참고: 해제는 액션을 보내 처리하므로 `dismiss()`를 호출한 뒤에는 절대로 액션을 보내면 안 됩니다.
>
> ```swift
> return .run { send in
>   await self.dismiss()
>   await send(.tick)  // ⚠️
> }
> ```
>
> 이렇게 하면 상태가 `nil`인 기능에 액션을 보내게 됩니다. Xcode에서는 런타임 경고가 발생하고, 테스트를 실행하면 실패합니다.

> 주의: SwiftUI의 환경 값 `@Environment(\.dismiss)`와 TCA의 의존성 값 `@Dependency(\.dismiss)`는 비슷한 목적을 가지지만 완전히 다른 타입입니다. SwiftUI의 환경 값은 SwiftUI 뷰 안에서만 사용할 수 있고, TCA의 의존성 값은 reducer 안에서만 사용할 수 있습니다.

## 테스트

내비게이션을 위해 도메인을 올바르게 모델링하면 테스트도 매우 쉬워집니다. 또한 내비게이션을 테스트할 때는 몇 가지 상위 수준 세부 사항만 검증하고 모든 상태 변경과 effect를 검증할 필요가 없는 경우가 많으므로, 비완전 테스트(non-exhaustive testing, `TestingTCA#Non-exhaustive-testing` 참고)를 활용하면 좋습니다.

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

그런 다음 `Presents()` 매크로, `PresentationAction` 타입, `Reducer/ifLet(_:action:destination:fileID:filePath:line:column:)-4ub6q` 연산자로 이 기능을 부모 기능에 포함합니다.

```swift
@Reducer
struct Feature {
  @ObservableState
  struct State: Equatable {
    @Presents var counter: CounterFeature.State?
  }
  enum Action {
    case counter(PresentationAction<CounterFeature.Action>)
  }
  var body: some Reducer<State, Action> {
    Reduce { state, action in
      // 핵심 기능의 로직과 동작
    }
    .ifLet(\.$counter, action: \.counter) {
      CounterFeature()
    }
  }
}
```

이제 자식 counter 기능의 count가 5를 넘으면 스스로 해제된다는 것을 증명하는 `Feature` reducer 테스트를 작성해 보겠습니다. count가 이미 3으로 설정된 상태에서 시작하는 `TestStore`를 `Feature`용으로 만듭니다.

```swift
@Test
func dismissal() {
  let store = TestStore(
    initialState: Feature.State(
      counter: CounterFeature.State(count: 3)
    )
  ) {
    Feature()
  }
}
```

그다음 counter 자식 기능에 `.incrementButtonTapped` 액션을 보내 count가 1 증가하는지 확인합니다.

```swift
await store.send(\.counter.incrementButtonTapped) {
  $0.counter?.count = 4
}
```

한 번 더 보내 count가 5가 되는지 확인합니다.

```swift
await store.send(\.counter.incrementButtonTapped) {
  $0.counter?.count = 5
}
```

마지막으로 자식 기능이 스스로 해제되기를 기대합니다. 이 동작은 counter 상태를 `nil`로 만드는 `PresentationAction/dismiss` 액션이 전송되는 것으로 나타납니다. `TestStore`의 `TestStore/receive(_:timeout:assert:fileID:file:line:column:)-53wic` 메서드로 이를 검증할 수 있습니다.

```swift
await store.receive(\.counter.dismiss) {
  $0.counter = nil
}
```

이 예제는 부모와 자식 기능이 서로 어떻게 상호작용하는지에 관한 세밀한 테스트를 작성하는 방법을 보여 줍니다.

하지만 기능이 복잡해질수록 통합을 테스트하기도 더 번거로워집니다. 기본적으로 `TestStore`는 완전한 검증을 요구합니다. 모든 상태 변경, 모든 effect가 시스템에 데이터를 다시 전달하는 방식, 그리고 테스트가 끝날 때 모든 effect가 끝났는지를 검증해야 합니다(`TestingTCA` 참고).

하지만 `TestStore`는 실제로 관심 있는 기능 부분만 검증할 수 있는 비완전 테스트(non-exhaustive testing, `TestingTCA#Non-exhaustive-testing` 참고)도 지원합니다.

예를 들어 test store에서 exhaustivity를 끄면(`TestStore/exhaustivity` 참고), increment 버튼을 두 번 탭했을 때 결국 dismiss 액션을 받는다는 사실을 상위 수준에서 검증할 수 있습니다.

```swift
@Test
func dismissal() {
  let store = TestStore(
    initialState: Feature.State(
      counter: CounterFeature.State(count: 3)
    )
  ) {
    Feature()
  }
  store.exhaustivity = .off

  await store.send(\.counter.incrementButtonTapped)
  await store.send(\.counter.incrementButtonTapped)
  await store.receive(\.counter.dismiss)
}
```

이는 앞선 테스트와 본질적으로 같은 내용을 증명하지만, 훨씬 적은 줄로 작성할 수 있고 특별히 관심 없는 기능의 향후 변경에도 더 견고합니다.

여기까지가 테스트의 기본입니다. 하지만 여러 Optional 대신 enum으로 여러 목적지를 모델링하는 `TreeBasedNavigation#Enum-state`의 개념을 활용하면 조금 더 복잡해집니다. enum 상태를 사용할 때 상태 변경을 검증하려면 특정 case까지 체이닝해 값을 변경해야 합니다.

```swift
await store.send(\.destination.counter.incrementButtonTapped) {
  $0.destination?.counter?.count = 4
}
```
