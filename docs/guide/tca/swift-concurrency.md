---
title: Swift 동시성 적용하기
description: TCA Effect에서 Swift 구조적 동시성을 안전하게 사용하도록 상태와 의존성을 Sendable 값으로 캡처하는 방법을 설명합니다.
---

# Swift 동시성 적용하기

원문: [Adopting Swift concurrency](https://swiftpackageindex.com/pointfreeco/swift-composable-architecture/main/documentation/composablearchitecture/swiftconcurrency)

Swift의 구조적 동시성을 사용해 안전한 동시 Effect를 작성하는 방법을 알아봅니다.

Swift 5.6부터 동시 컨텍스트에서 스레드 안전하지 않은 타입과 함수를 사용할 때 많은 경고가 발생할 수 있습니다. 지금은 그 경고 중 다수를 무시할 수 있지만 Swift 6에서는 대부분(어쩌면 전부)이 오류가 됩니다. 따라서 타입이 동시성 환경에서 안전하다는 사실을 컴파일러에 증명하는 방법을 알아야 합니다.

라이브러리에서 `Effect`를 만드는 주된 방법은 `Effect.run(priority:operation:catch:fileID:filePath:line:column:)`입니다. 이 메서드는 `@Sendable` 비동기 클로저를 받으므로 Effect에 사용할 수 있는 클로저 타입이 제한됩니다. 특히 클로저는 `let`으로 바인딩한 `Sendable` 변수만 캡처할 수 있습니다. 가변 변수와 `Sendable`이 아닌 타입은 `@Sendable` 클로저에 전달할 수 없습니다.

The Composable Architecture로 기능을 만들 때 이 제한은 크게 두 경우에서 나타납니다. Effect 내부에서 상태에 접근할 때와 의존성에 접근할 때입니다.

## Effect에서 상태에 접근하기

Reducer는 가변 `inout` 상태 변수로 실행됩니다. 이런 변수는 `@Sendable` 클로저 안에서 접근할 수 없습니다.

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
        return .run { send in
          try await Task.sleep(for: .seconds(1))
          await send(.delayed(state.count))
          // 🛑 Mutable capture of 'inout' parameter 'state' is
          //    not allowed in concurrently-executing code
        }

        // ...
      }
    }
  }
}
```

이 문제를 해결하려면 클로저 범위에서 상태를 불변 값으로 명시적으로 캡처해야 합니다.

```swift
return .run { [state] send in
  try await Task.sleep(for: .seconds(1))
  await send(.delayed(state.count))  // ✅
}
```

Effect에 필요한 상태의 최소 부분만 새 이름으로 바인딩해 캡처할 수도 있습니다.

```swift
return .run { [count = state.count] send in
  try await Task.sleep(for: .seconds(1))
  await send(.delayed(count))  // ✅
}
```

## Effect에서 의존성에 접근하기

The Composable Architecture에서는 reducer가 외부 세계와 결정적이고 제어 가능한 방식으로 상호작용하도록 의존성을 제공합니다. 의존성은 비동기·동시 컨텍스트에서 사용할 수 있으므로 `Sendable`이어야 합니다.

의존성을 등록할 때 `Sendable`이 아니면 알림을 받습니다. 특히 `DependencyValues`를 확장해 계산 프로퍼티를 제공할 때 다음과 같습니다.

```swift
extension DependencyValues {
  var factClient: FactClient {
    get { self[FactClient.self] }
    set { self[FactClient.self] = newValue }
  }
}
```

어떤 이유로 `FactClient`가 `Sendable`이 아니라면 `get`, `set` 줄에서 다음 경고가 발생합니다.

```
⚠️ Type 'FactClient' does not conform to the 'Sendable' protocol
```

이를 해결하려면 각 의존성을 `Sendable`로 만들어야 합니다. 일반적으로 인터페이스 타입이 `Sendable` 데이터만 보유하게 하고, 특히 클로저 기반 endpoint에 `@Sendable`을 붙이면 됩니다.

```swift
struct FactClient {
  var fetch: @Sendable (Int) async throws -> String
}
```

이렇게 하면 `FactClient`를 만들 때 사용할 수 있는 클로저가 제한되고, 결과적으로 `FactClient` 전체가 `Sendable`이 됩니다.
