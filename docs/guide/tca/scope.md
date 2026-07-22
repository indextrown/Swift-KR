---
title: Scope
description: TCA의 Scope로 부모 domain의 state와 action을 자식 domain으로 변환하고, struct·enum state에 자식 reducer를 안전하게 결합하는 방법을 설명합니다.
---

# Scope

부모 domain 안에 자식 reducer를 삽입해요.

원문: [Scope](https://swiftpackageindex.com/pointfreeco/swift-composable-architecture/main/documentation/composablearchitecture/scope)

`Scope`를 사용하면 부모 domain을 자식 domain으로 변환하고, 그 일부 domain에서 자식 reducer를 실행할 수 있어요. 큰 기능을 더 작은 단위로 나눈 뒤 다시 조립하는 데 중요한 도구예요. 작은 단위는 이해하고 테스트하기 쉬우며, 독립된 모듈로 패키징할 수도 있어요.

`Scope`가 동작하려면 세 가지 데이터를 전달해야 해요.

- 부모 state 안에서 자식 state를 식별하는 writable key path
- 부모 action 안에서 자식 action을 식별하는 case path
- 자식 domain에서 실행할 reducer를 설명하는 `@ReducerBuilder` closure

실행되면 전달되는 모든 자식 action을 가로채 자식 reducer에 보내고, 자식 reducer는 부모 state를 갱신하고 effect를 실행해요.

예를 들어 다음과 같은 자식 reducer의 기본 구조가 있다고 해 볼게요.

```swift
@Reducer
struct Child {
  struct State {
    // ...
  }
  enum Action {
    // ...
  }
  // ...
}
```

자식 domain을 보관하는 부모 domain은 `init(state:action:child:)`를 사용해 `Reducer/body`에 자식 reducer를 삽입할 수 있어요.

```swift
@Reducer
struct Parent {
  struct State {
    var child: Child.State
    // ...
  }

  enum Action {
    case child(Child.Action)
    // ...
  }

  var body: some Reducer<State, Action> {
    Scope(\.child, action: \.child) {
      Child()
    }
    Reduce { state, action in
      // Additional parent logic and behavior
    }
  }
}
```

## Enum state

`Scope` reducer는 struct뿐 아니라 enum으로 모델링한 state에서도 동작해요. 이때 `init(state:action:child:fileID:filePath:line:column:)`에 case path를 전달해 범위를 지정할 state case를 식별할 수 있어요.

예를 들어 state를 unloaded, loading, loaded enum으로 모델링했다면 loaded case로 범위를 좁혀 해당 case에서만 reducer를 실행할 수 있어요.

```swift
@Reducer
struct Feature {
  enum State {
    case unloaded
    case loading
    case loaded(Child.State)
  }
  enum Action {
    case child(Child.Action)
    // ...
  }

  var body: some Reducer<State, Action> {
    Scope(\.loaded, action: \.child) {
      Child()
    }
    Reduce { state, action in
      // Additional feature logic and behavior
    }
  }
}
```

`Scope`와 기능의 추가 로직을 결합하는 순서가 중요해요. `Scope`는 추가 로직보다 먼저 결합해야 해요. 순서가 반대라면 기능이 자식 action을 가로채 state를 다른 case로 바꿀 수 있고, 그 뒤 실행되는 자식 reducer는 더 이상 해당 action에 반응할 수 없어요. 미묘한 버그를 일으킬 수 있으므로 이런 상황에서는 runtime 경고와 테스트 실패가 발생해요.

State case path와 `Scope`를 사용하는 대신 결합 순서를 강제하고 싶다면 `ifCaseLet(_:action:then:fileID:filePath:line:column:)` operator를 사용할 수 있어요.

## API 목차

### Struct state

- `init(state:action:child:)-88vdx`

### Enum state

- `init(state:action:child:fileID:filePath:line:column:)-9g44g`

### 지원 중단된 API

- `ScopeDeprecations`
