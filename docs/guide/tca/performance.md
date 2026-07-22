---
title: Performance
description: TCA 기능의 성능을 높이기 위해 액션으로 로직을 공유할 때의 비용, CPU 작업, 고빈도 액션, Store 스코핑을 다루는 방법을 설명합니다.
---

# Performance

Composable Architecture로 만든 기능의 성능을 개선하는 방법을 알아봐요.

원문: [Performance](https://swiftpackageindex.com/pointfreeco/swift-composable-architecture/main/documentation/composablearchitecture/performance)

기능과 애플리케이션이 커지면 reducer 실행이 느려지거나 SwiftUI 뷰 body가 예상보다 자주 실행되는 등의 성능 문제를 마주할 수 있어요. 이 글에서는 라이브러리로 기능을 개발할 때 흔히 겪는 몇 가지 함정과 해결 방법을 설명해요.

## 목차

- [액션으로 로직 공유하기](#액션으로-로직-공유하기)
- [CPU 집약적 계산](#cpu-집약적-계산)
- [고빈도 액션](#고빈도-액션)
- [Store 스코핑](#store-스코핑)

### 액션으로 로직 공유하기

reducer 여러 부분에서 로직을 공유하려고 액션을 사용하는 패턴이 흔해요. 하지만 로직을 공유하는 비효율적인 방식이에요. 액션 전송은 클래스의 메서드 호출처럼 가벼운 연산이 아니에요. 액션은 애플리케이션의 여러 계층을 통과하고, 각 계층의 reducer는 액션을 가로채 다른 의미로 해석할 수 있어요.

예를 들어 `Reducer` 준수 타입에 단순한 메서드를 정의해 로직을 공유하는 편이 훨씬 좋아요. 변경이 필요하다면 도우미 메서드가 `inout State`를 인자로 받을 수 있고, `Effect<Action>`을 반환할 수도 있어요. 따라서 불필요한 액션 전송 비용 없이 reducer 전체에서 로직을 공유할 수 있어요.

예를 들어 기능에 UI 컴포넌트가 세 개 있고, 어느 하나가 바뀌면 대응하는 상태 필드를 업데이트한 뒤 몇 가지 변경과 effect를 실행하고 싶다고 해 볼게요. 공통 변경과 effect를 별도 액션에 넣고, 각 사용자 액션이 이 공통 액션을 즉시 내보내는 effect를 반환하게 만들 수 있어요.

```swift
@Reducer
struct Feature {
  @ObservableState
  struct State { /* ... */ }
  enum Action { /* ... */ }

  var body: some Reducer<State, Action> {
    Reduce { state, action in
      switch action {
      case .buttonTapped:
        state.count += 1
        return .send(.sharedComputation)

      case .toggleChanged:
        state.isEnabled.toggle()
        return .send(.sharedComputation)

      case let .textFieldChanged(text):
        state.description = text
        return .send(.sharedComputation)

      case .sharedComputation:
        // Some shared work to compute something.
        return .run { send in
          // A shared effect to compute something
        }
      }
    }
  }
}
```

이 방법도 로직과 effect를 공유하는 한 방식이지만, 사용자는 하나의 액션만 수행했는데 이제 두 액션의 비용을 부담해요. 단일 액션만 보낼 때보다 효율적이지 않아요.

성능 문제 외에도 이 패턴을 따르지 말아야 할 이유가 두 가지 더 있어요. 첫째, 이 스타일은 로직 공유에 유연하지 않아요. 공유 로직을 별도 액션에 맡기므로 항상 초기 로직 뒤에 실행해야 해요. 핵심 로직 **전**에 공유 로직을 실행해야 한다면 이 스타일은 수용할 수 없어요.

둘째, 이 스타일은 테스트를 흐리게 해요. 사용자 액션을 보내면 공유 액션을 받는 것도 단언하고 상태가 어떻게 바뀌었는지도 단언해야 해요. 불필요한 내부 세부 사항으로 테스트가 부풀어 오르고, 테스트는 더 이상 사용자가 기능에서 수행하는 액션을 위에서 아래로 읽는 스크립트가 되지 않아요.

```swift
let store = TestStore(initialState: Feature.State()) {
  Feature()
}

store.send(.buttonTapped) {
  $0.count = 1
}
store.receive(\.sharedComputation) {
  // Assert on shared logic
}
store.send(.toggleChanged) {
  $0.isEnabled = true
}
store.receive(\.sharedComputation) {
  // Assert on shared logic
}
store.send(.textFieldChanged("Hello")) {
  $0.description = "Hello"
}
store.receive(\.sharedComputation) {
  // Assert on shared logic
}
```

따라서 로직 전용 액션을 만들고 동기 effect를 실행하는 방식으로 reducer에서 로직을 공유하는 것은 권장하지 않아요.

대신 기능 reducer에 정의한 메서드로 로직을 공유하는 것을 권장해요. 메서드는 모든 의존성에 완전히 접근할 수 있고, 상태 변경이 필요하면 `inout State`를 받을 수 있으며, effect 실행이 필요하면 `Effect<Action>`을 반환할 수 있어요.

앞의 예는 다음처럼 리팩터링할 수 있어요.

```swift
@Reducer
struct Feature {
  @ObservableState
  struct State { /* ... */ }
  enum Action { /* ... */ }

  var body: some Reducer<State, Action> {
    Reduce { state, action in
      switch action {
      case .buttonTapped:
        state.count += 1
        return self.sharedComputation(state: &state)

      case .toggleChanged:
        state.isEnabled.toggle()
        return self.sharedComputation(state: &state)

      case let .textFieldChanged(text):
        state.description = text
        return self.sharedComputation(state: &state)
      }
    }
  }

  func sharedComputation(state: inout State) -> Effect<Action> {
    // Some shared work to compute something.
    return .run { send in
      // A shared effect to compute something
    }
  }
}
```

이전과 사실상 같게 동작하지만, 이제 사용자 액션을 보내면 추가 액션을 보내지 않고 모든 로직이 한 번에 실행돼요. 앞에서 언급한 다른 문제도 해결해요.

예를 들어 핵심 로직 **전**에 공유 로직을 실행해야 한다면 쉽게 할 수 있어요.

```swift
case .buttonTapped:
  let sharedEffect = self.sharedComputation(state: &state)
  state.count += 1
  return sharedEffect
```

공유 로직을 어떻게, 언제, 어디에서 실행할지 완전히 유연하게 결정할 수 있어요.

또한 공유 액션 전송이라는 내부 세부 사항을 단언하지 않아도 되므로 테스트도 간결해져요. 테스트가 사용자가 기능에서 하는 일을 나타내는 사용자 스크립트처럼 읽혀요.

```swift
let store = TestStore(initialState: Feature.State()) {
  Feature()
}

store.send(.buttonTapped) {
  $0.count = 1
  // Assert on shared logic
}
store.send(.toggleChanged) {
  $0.isEnabled = true
  // Assert on shared logic
}
store.send(.textFieldChanged("Hello")) {
  $0.description = "Hello"
  // Assert on shared logic
}
```

##### 자식 기능에서 로직 공유하기

기능에서 로직을 공유하는 또 다른 흔한 상황은 부모 기능이 자식 기능의 로직을 호출하고 싶을 때예요. 부모에서 자식으로 액션을 보내 이를 구현할 수 있어요.

```swift
// Handling action from parent feature:
case .buttonTapped:
  // Send action to child to perform logic:
  return .send(.child(.refresh))
```

하지만 이 방식도 자식과 통신하는 가장 효율적인 방법은 아니라는 주의점이 같아요. 성능이 중요하다면 어느 도메인에서든 호출할 수 있는 도우미로 공유 로직을 추출하는 것을 고려하세요.

### CPU 집약적 계산

reducer는 메인 스레드에서 실행되므로 강도 높은 CPU 작업을 수행하기에 적합하지 않아요. CPU에 묶인 작업을 많이 해야 한다면 협력적 스레드 풀에서 동작하고 이후 시스템으로 액션을 보낼 수 있는 `Effect`를 사용하는 편이 더 적절해요. 또한 협력적 풀의 스레드를 너무 오래 막지 않도록 `Task.yield()`로 주기적으로 일시 중단해 CPU 집약적 작업을 협력적으로 수행해야 해요.

그러므로 reducer에서 다음처럼 강도 높은 작업을 수행하는 대신에요.

```swift
case .buttonTapped:
  var result = // ...
  for value in someLargeCollection {
    // Some intense computation with value
  }
  state.result = result
```

effect를 반환해 작업을 수행하고, 중간중간 yield를 섞은 뒤 결과를 액션으로 전달해야 해요.

```swift
case .buttonTapped:
  return .run { send in
    var result = // ...
    for (index, value) in someLargeCollection.enumerated() {
      // Some intense computation with value

      // Yield every once in awhile to cooperate in the thread pool.
      if index.isMultiple(of: 1_000) {
        await Task.yield()
      }
    }
    await send(.computationResponse(result))
  }

case let .computationResponse(result):
  state.result = result
```

이렇게 하면 CPU 집약적 작업이 reducer, 즉 메인 스레드에서 수행되지 않아요.

### 고빈도 액션

Composable Architecture 앱에서 액션 전송을 `ObservableObject` 준수 타입 등에 하는 단순한 클래스 메서드 호출로 생각하면 안 돼요. 액션을 시스템에 보내면 여러 기능 계층이 액션을 가로채 해석할 수 있고, 결과 상태 변경은 애플리케이션 전체에 파급될 수 있어요.

따라서 액션 전송에는 비용이 있어요. 애플리케이션의 중요한 로직과 effect 실행을 일으키는 “의미 있는” 액션만 시스템으로 보내는 것이 좋아요. 애플리케이션이 로직 구현에 그 정도의 액션 양을 실제로 필요로 하지 않는 한, 초당 수십 개처럼 고빈도 액션은 피해야 해요.

하지만 액션이 높은 빈도로 전송되는데 reducer는 실제로 그 정도의 정보를 필요로 하지 않는 경우가 많아요. 예를 들어 effect가 작업의 각 단계에서 진행률을 시스템에 보고하려 한다고 해 볼게요. 매 단계 진행률을 문자 그대로 모두 보낼 수 있어요.

```swift
case .startButtonTapped:
  return .run { send in
    var count = 0
    let max = await self.eventsClient.count()

    for await event in self.eventsClient.events() {
      defer { count += 1 }
      await send(.progress(Double(count) / Double(max)))
    }
  }
}
```

하지만 effect가 완료되려면 10,000단계 또는 100,000단계, 그 이상이 필요하다면 어떨까요? 0.0부터 1.0까지만 달라지는 진행률을 보고하려고 시스템에 100,000개 액션을 보내는 것은 엄청난 낭비예요.

대신 진행률을 가끔씩 보고하도록 선택할 수 있어요. 계산을 사용하면 진행률을 최대 100번만 보고하게 만들 수도 있어요.

```swift
case .startButtonTapped:
  return .run { send in
    var count = 0
    let max = await self.eventsClient.count()
    let interval = max / 100

    for await event in self.eventsClient.events() {
      defer { count += 1 }
      if count.isMultiple(of: interval) {
        await send(.progress(Double(count) / Double(max)))
      }
    }
  }
}
```

이렇게 하면 시스템으로 보내는 액션의 대역폭을 크게 줄여 액션 전송의 불필요한 비용을 부담하지 않아요.

자주 나오는 또 다른 예는 slider예요. 가장 직접적인 방식으로 Store에서 binding을 파생해 `Slider`에 전달하면요.

```swift
Slider(value: store.$opacity, in: 0...1)
```

slider를 조금씩 바꿀 때마다 시스템에 액션을 보내므로 사용자가 slider를 끌 때 수십 개 또는 수백 개의 액션이 생길 수 있어요. 이것이 문제가 된다면 대안을 고려할 수 있어요.

예를 들어 Slider와 함께 쓸 로컬 `@State`를 뷰에 보관한 뒤 trailing `onEditingChanged` closure를 사용해 Store로 액션을 보낼 수 있어요.

```swift
Slider(value: self.$opacity, in: 0...1) {
  self.store.send(.setOpacity(self.opacity))
}
```

이 방식에서는 사용자가 slider 이동을 멈춘 뒤에만 액션 하나를 보내요.

### Store 스코핑

라이브러리 1.5.6 릴리즈에서는 `Store/scope(_:action:)`을 성능 고려 사항에 더 민감하게 만드는 변경이 있었어요.

자식 기능의 경계를 따라 직접 스코핑하는 가장 흔한 방식은 가장 성능이 좋은 스코핑 형태이며, 의도한 scope 사용법이에요. 라이브러리는 Store에서 할 수 있는 scope가 결국 이 방식만 남는 상태로 천천히 발전하고 있어요.

가장 간단한 예는 자식 뷰에 전달할 자식 상태와 액션으로 직접 스코핑하는 것이에요.

```swift
ChildView(
  store: store.scope(\.child, action: \.child)
)
```

또한 `SwiftUI/View/sheet(store:onDismiss:content:)` 같은 라이브러리 내비게이션 뷰 modifier와 함께 자식 도메인으로 스코핑하는 것도 의도한 scope 사용에 속해요.

```swift
.sheet(store: store.scope(\.child, action: \.child)) { store in
  ChildView(store: store)
}
```

이 예들은 모두 `Store/scope(_:action:)`의 의도한 사용법이며, 이런 방식은 성능 걱정 없이 계속 사용해도 돼요.

성능 문제가 될 수 있는 지점은 단순 저장 필드가 아니라 **계산 프로퍼티**에 `scope`를 사용할 때예요. 예를 들어 부모 기능 상태에 자식 상태를 파생하는 계산 프로퍼티가 있다고 해 볼게요.

```swift
extension ParentFeature.State {
  var computedChild: ChildFeature.State {
    ChildFeature.State(
      // Heavy computation here...
    )
  }
}
```

그리고 뷰에서 이 계산 프로퍼티를 따라 스코핑한다고 해 볼게요.

```swift
ChildView(
  store: store.scope(\.computedChild, action: \.child)
)
```

이 프로퍼티의 계산이 무겁다면 1.5에서 바뀐 내용으로 문제가 더 심해지고, 스코핑 위치가 앱 루트에 가까울수록 더 악화돼요.

문제는 1.5 버전에서 scope된 Store가 로컬 상태를 직접 보관하지 않게 바뀌었고, 대신 애플리케이션 루트 Store의 참조를 보관한다는 점이에요. scope된 Store에서 상태에 접근하면 그때그때 루트 상태를 자식 상태로 변환해요.

이 변환에는 무거운 계산 프로퍼티가 포함되고, Store에서 여러 상태 조각에 접근해야 한다면 잠재적으로 여러 번 계산돼요. 1.5 이상 라이브러리를 의존하면서 성능 문제를 발견한다면 코드베이스에서 scope에 계산 프로퍼티를 사용하는 위치를 찾아보세요. 계산 프로퍼티에 `print` 문을 넣으면 앱을 실행할 때 실제로 몇 번 호출되는지도 직접 확인할 수 있어요.

이 문제를 해결하려면 `Store/scope(_:action:)`은 자식 기능의 저장 프로퍼티를 따라 사용할 것을 권장해요. 이런 키 경로는 단순 getter라 성능 문제가 없어요. scope에서 계산 프로퍼티를 쓴다면, 일반 저장 프로퍼티를 따라 수행하고 계산 로직을 자식 뷰로 옮길 수 없는지 다시 생각해 보세요. 계산을 애플리케이션의 leaf node 쪽으로 더 밀어낼수록 성능 문제는 줄어들어요.
