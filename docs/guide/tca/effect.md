---
title: Effect
description: TCA의 Effect가 비동기 작업과 외부 세계의 결과를 액션으로 되돌리는 방식, 생성과 조합 방법을 설명합니다.
---

# Effect

reducer 밖에서 수행하는 작업을 나타내고, 그 결과를 다시 액션으로 보낼 수 있게 하는 값입니다.

원문: [Effect](https://swiftpackageindex.com/pointfreeco/swift-composable-architecture/main/documentation/composablearchitecture/effect)

`Effect<Action>`는 reducer가 즉시 끝낼 수 없는 일을 표현합니다. 네트워크 요청, 타이머, 위치 업데이트처럼 외부 세계와 통신하는 작업은 effect로 만들고, 작업 결과는 액션으로 Store에 되돌립니다. Store가 effect를 실행하므로 reducer는 상태 변경과 작업의 시작 조건을 한곳에서 결정할 수 있습니다.

## 선언

```swift
public struct Effect<Action>: Sendable
```

`Action`은 effect가 Store로 다시 보낼 수 있는 액션 타입입니다. reducer는 `Effect<Action>`을 반환하고, 작업이 없을 때는 `.none`을 반환합니다.

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

  var body: some ReducerOf<Self> {
    Reduce { state, action in
      switch action {
      case .incrementButtonTapped:
        state.count += 1
        return .none
      }
    }
  }
}
```

## Effect 만들기

### 아무 작업도 하지 않기: `.none`

`.none`은 즉시 완료되고 아무 액션도 보내지 않는 effect입니다. reducer가 `Effect`를 반환해야 하지만 추가 작업이 없을 때 사용합니다.

```swift
return .none
```

### 비동기 작업 실행하기: `.run`

`Effect.run`은 액션을 여러 번 보낼 수 있는 비동기 작업을 effect로 감쌉니다. 클로저가 받는 `send`로 작업 결과를 다시 시스템에 보냅니다.

```swift
@Reducer
struct SearchFeature {
  @ObservableState
  struct State {
    var results: [String] = []
  }

  enum Action {
    case searchButtonTapped
    case response([String])
  }

  @Dependency(\.searchClient) var searchClient

  var body: some ReducerOf<Self> {
    Reduce { state, action in
      switch action {
      case .searchButtonTapped:
        return .run { send in
          let results = try await searchClient.search()
          await send(.response(results))
        }

      case let .response(results):
        state.results = results
        return .none
      }
    }
  }
}
```

`run`의 작업은 `AsyncSequence`의 이벤트처럼 여러 값을 받아 그때마다 액션을 보낼 수도 있습니다.

```swift
return .run { send in
  for await event in eventsClient.events() {
    await send(.event(event))
  }
}
```

작업이 취소 오류가 아닌 오류를 던지면, 별도로 처리하지 않았을 때 실행 중 경고가 나오고 테스트에서는 실패합니다. `catch` 클로저를 전달하거나 클로저 안에서 `do`-`catch`로 오류를 명시적으로 처리하세요.

```swift
return .run { send in
  try await client.refresh()
  await send(.refreshSucceeded)
} catch: { error, send in
  await send(.refreshFailed(error.localizedDescription))
}
```

`priority`로 기본 작업 우선순위를 지정할 수 있으며, `name`으로 작업 이름을 부여할 수 있습니다. `priority`가 `nil`이면 현재 `Task`의 우선순위를 사용합니다.

### 즉시 액션 보내기: `.send`

`Effect.send`는 전달받은 액션을 즉시 내보내는 effect입니다.

```swift
return .send(.delegate(.didFinish))
```

공유 로직을 재사용하려고 `.send`를 연쇄하는 방식은 권장하지 않습니다. 원문은 자식 기능이 부모가 처리할 delegate 액션을 보내는 자식-부모 통신처럼, 도메인 경계를 넘는 용도로 한정해 사용하라고 안내합니다.

## `Send`로 액션 되돌리기

`Effect.run`의 `send` 인자는 `Send<Action>` 타입입니다. 함수처럼 호출해 effect 안에서 액션을 Store로 보냅니다.

```swift
return .run { send in
  await send(.started)

  for await event in eventsClient.events() {
    await send(.event(event))
  }

  await send(.finished)
}
```

애니메이션이나 트랜잭션을 함께 적용할 수도 있습니다.

```swift
await send(.started, animation: .spring())
await send(.finished, transaction: .init(animation: .default))
```

작업이 취소된 뒤에는 `Send`가 액션을 보내지 않습니다. 따라서 장기 실행 작업의 취소 상태와 액션 전달이 일관되게 유지됩니다.

## Effect 조합

### 동시에 실행하기: `merge`

`merge`는 여러 effect를 하나로 합쳐 동시에 실행합니다.

```swift
return .merge(
  .run { send in await send(.profileResponse(try await profileClient.fetch())) },
  .run { send in await send(.feedResponse(try await feedClient.fetch())) }
)
```

인스턴스 메서드 `merge(with:)`도 같은 역할을 합니다.

```swift
return profileEffect.merge(with: feedEffect)
```

### 순서대로 실행하기: `concatenate`

`concatenate`는 앞 effect가 완료되거나 취소된 뒤 다음 effect를 실행합니다.

```swift
return .concatenate(
  .send(.loadingStarted),
  .run { send in
    await send(.response(try await client.fetch()))
  }
)
```

다만 현재 API는 순차 작업을 `.run` 안에서 직접 작성하는 방식을 권장하며, `concatenate`와 `concatenate(with:)`는 사용 중단 예정입니다. 새 코드에서는 의존 작업을 한 `run` effect 안에서 순서대로 `await`하세요.

```swift
return .run { send in
  await send(.loadingStarted)
  let response = try await client.fetch()
  await send(.response(response))
}
```

### 액션 타입 바꾸기: `map`

`map(_:)`은 effect가 내보내는 모든 액션을 다른 액션 타입으로 변환합니다.

```swift
let childEffect: Effect<Child.Action> = // ...
let parentEffect = childEffect.map(Parent.Action.child)
```

하지만 새 코드에서 effect를 변환하는 방식은 피하는 것이 좋습니다. 현재 API는 기능에서 필요한 action 타입의 effect를 직접 만들도록 권장하며, `map(_:)`은 사용 중단 예정입니다.

## 타입 별칭

### `EffectOf`

`EffectOf`는 reducer의 액션 타입을 풀어 쓴 effect의 편의 별칭입니다.

```swift
public typealias EffectOf<R: Reducer> = Effect<R.Action>
```

아래 두 선언은 같습니다.

```swift
let effect: Effect<Feature.Action>
let effect: EffectOf<Feature>
```

### `SendOf`

`SendOf`는 reducer의 액션 타입에 맞춘 `Send`의 편의 별칭입니다.

```swift
public typealias SendOf<R: Reducer> = Send<R.Action>
```

`EffectOf`와 `SendOf`를 사용하면 제네릭 타입을 반복하지 않고도 effect와 비동기 작업의 액션 타입을 해당 reducer의 도메인에 맞출 수 있습니다.
