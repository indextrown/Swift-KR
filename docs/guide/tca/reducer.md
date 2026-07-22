---
title: Reducer
description: TCA의 Reducer 프로토콜이 액션에 따라 상태를 변경하고 effect를 처리하는 방식, body 구성과 reducer 조합 방법을 설명합니다.
---

# Reducer

액션에 따라 상태를 변경하고 부수 효과를 처리하는 프로토콜입니다.

원문: [Reducer](https://swiftpackageindex.com/pointfreeco/swift-composable-architecture/main/documentation/composablearchitecture/reducer)

`Reducer`는 액션이 주어졌을 때 앱의 현재 상태를 다음 상태로 변경하는 방법과, 필요한 경우 나중에 `Store`가 실행할 `Effect`를 설명하는 프로토콜입니다.

## 프로토콜 선언

```swift
public protocol Reducer<State, Action> {
  associatedtype State
  associatedtype Action
  associatedtype Body

  @ReducerBuilder<State, Action>
  var body: Body { get }
}
```

## 연관 타입

### `State`

`associatedtype`

reducer의 현재 상태를 보관하는 타입입니다.

### `Action`

`associatedtype`

reducer의 `State`를 변경하거나, 외부 세계와 통신할 수 있는 부수 `Effect`를 시작하는 모든 가능한 액션을 보관하는 타입입니다.

### `Body`

`associatedtype`

이 reducer의 body를 나타내는 타입입니다. `body` 속성을 구현해 사용자 정의 reducer를 만들면 Swift는 반환하는 값에서 이 타입을 추론합니다. `reduce(into:action:)`을 구현해 사용자 정의 reducer를 만들면 Swift는 이 타입을 `Never`로 추론합니다.

## 속성

### `body`

`some ReducerOf<Self>`

다른 reducer를 조합한 reducer의 내용과 동작입니다. reducer의 body에서는 여러 reducer를 조합할 수 있으며, 이 reducer들은 위에서 아래 순서로 실행됩니다.

```swift
var body: some ReducerOf<Self> {
  Reduce { state, action in
    // 핵심 로직
  }
  .ifLet(\.child, action: \.child) {
    ChildFeature()
  }
  ._printChanges()

  Analytics()
}
```

이 속성을 직접 호출하지 마세요. `Store`가 호출합니다.

> 중요: reducer가 `reduce(into:action:)` 메서드를 구현하면 이 속성보다 우선하며, `Store`는 `reduce(into:action:)`만 호출합니다. 다른 reducer로 body를 조립하면서 시스템에 추가할 비즈니스 로직이 있다면, `Reduce` 또는 별도의 전용 conformance로 해당 로직을 body에 넣으세요.

## 메서드

### `reduce(into:action:)`

`(inout State, Action) -> Effect<Action>`

사용 중단된 메서드입니다. reducer를 직접 호출하지 마세요. reducer는 `Store`가 처리합니다. 자식 상태와 자식 액션을 바탕으로 자식 reducer를 실행해야 한다면, 대신 `send` effect를 사용하세요.

```diff
- return Child().reduce(&child.state, action: .childAction).map(Action.child)
+ return .send(.child(.childAction))
```

새 액션을 `Store`로 보내고 싶지 않다면 두 reducer가 모두 호출할 수 있는 helper를 추출하세요.

## 사용 방법

`Reducer` 프로토콜을 채택하고 `body` 속성을 구현해 reducer를 정의합니다.

```swift
@Reducer
struct Feature {
  struct State: Equatable {
    var count = 0
  }

  enum Action {
    case incrementButtonTapped
    case decrementButtonTapped
  }

  var body: some ReducerOf<Self> {
    Reduce { state, action in
      switch action {
      case .incrementButtonTapped:
        state.count += 1
        return .none
      case .decrementButtonTapped:
        state.count -= 1
        return .none
      }
    }
  }
}
```

## Reducer 조합

reducer 연산자를 사용해 `body` 안에서 reducer를 조합할 수 있습니다.

```swift
var body: some ReducerOf<Self> {
  Reduce { state, action in
    // 핵심 로직
  }
  .ifLet(\.child, action: \.child) {
    ChildFeature()
  }
  ._printChanges()

  Analytics()
}
```

## 타입 별칭

### `ReducerOf`

`typealias`

`Reducer` conformance에 제약을 지정할 때 쓰는 편의 타입 별칭입니다.

```swift
public typealias ReducerOf<R: Reducer> = Reducer<R.State, R.Action>
```

이 별칭을 사용하면 `Reducer` conformance의 `body`를 다음처럼 지정할 수 있습니다.

```swift
var body: some ReducerOf<Self> {
  // ...
}
```

더 장황한 아래 표현 대신 사용할 수 있어요.

```swift
var body: some Reducer<State, Action> {
  // ...
}
```
