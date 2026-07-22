---
title: TestStore
description: TCA reducer에 액션을 보내 상태 변화와 Effect 결과를 철저하거나 선택적으로 검증하는 TestStore의 동작 원리와 전체 API 목차를 설명합니다.
---

# TestStore

Reducer를 테스트할 수 있는 runtime이에요.

원문: [TestStore](https://swiftpackageindex.com/pointfreeco/swift-composable-architecture/main/documentation/composablearchitecture/teststore)

이 object는 Composable Architecture로 만든 기능을 표현력 있고 철저하게 테스트하도록 도와줘요. Store에 일련의 action을 보내고, 각 단계에서 state가 정확히 어떻게 바뀌었는지와 effect가 방출한 값이 시스템으로 어떻게 돌아왔는지를 단언할 수 있어요.

테스트에 관한 자세한 내용은 [Testing](./testing.md) 문서를 참고하세요.

## 철저한 테스트

기본적으로 `TestStore`는 사용자 action을 보내고 effect에서 action을 받는 동안 기능이 어떻게 변하는지 철저하게 증명하도록 요구해요. TestStore는 여러 방식으로 이를 강제해요.

- Action을 보낼 때마다 보내기 전과 후의 state가 정확히 어떻게 달라졌는지 설명해야 해요.

  아주 작은 데이터 하나라도 다르면 테스트가 실패해요. 시스템 state가 어떻게 바뀌는지 정확히 알고 있음을 보장해요.

- Action을 보내면 effect가 실행될 수 있고, 그 effect가 action을 시스템으로 되돌려 보내면 해당 action을 받을 것이라고 **명시적으로** 단언해야 해요. 그 결과 state가 어떻게 바뀌는지도 단언해야 해요.

  Effect action을 모두 처리하기 전에 다른 action을 보내면 테스트가 실패해요. Effect action을 실수로 잊지 않게 하고, 설명한 단계의 순서가 실제 애플리케이션의 동작을 그대로 따르도록 보장해요.

- Test case 실행이 끝날 때까지 모든 effect가 완료되고 모든 effect action을 단언해야 해요.

  단언이 끝났는데 실행 중인 effect나 받지 않은 action이 남아 있으면 실패해요. 어떤 effect가 실행 중인지 철저하게 증명하고, 이후 effect가 state를 더 바꾸지 않는다는 점까지 확인하게 해요.

예를 들어 간단한 counter reducer가 있다고 해 볼게요.

```swift
@Reducer
struct Counter {
  struct State: Equatable {
    var count = 0
  }

  enum Action {
    case decrementButtonTapped
    case incrementButtonTapped
  }

  var body: some Reducer<State, Action> {
    Reduce { state, action in
      switch action {
      case .decrementButtonTapped:
        state.count -= 1
        return .none

      case .incrementButtonTapped:
        state.count += 1
        return .none
      }
    }
  }
}
```

시간에 따른 동작을 다음과 같이 단언할 수 있어요.

```swift
@MainActor
struct CounterTests {
  @Test
  func basics() async {
    let store = TestStore(
      // Given: a counter state of 0
      initialState: Counter.State(count: 0),
    ) {
      Counter()
    }

    // When: the increment button is tapped
    await store.send(.incrementButtonTapped) {
      // Then: the count should be 1
      $0.count = 1
    }
  }
}
```

`.send(.incrementButtonTapped)`의 trailing closure에는 action을 보내기 전 state를 나타내는 변경 가능한 값 하나가 전달돼요. 이 값을 action을 보낸 뒤의 state와 일치하도록 변경해야 해요. 여기서는 `count` field를 `1`로 바꿔요.

Closure에서 만든 변경이 실제 동작과 다르면 무엇이 잘못됐는지 정확히 알려 주는 보기 좋은 테스트 실패 메시지를 얻어요.

```swift
await store.send(.incrementButtonTapped) {
  $0.count = 42
}
```

> ❌ 실패: 상태 변경이 기대와 일치하지 않아요. …
>
> ```diff
>  TestStoreFailureTests.State(
> -   count: 42
> +   count: 1
>  )
> ```
>
> (Expected: −, Actual: +)

더 복잡한 예로 clock과 cancel token을 사용해 request를 debounce하는 기본적인 검색 기능을 살펴볼게요.

```swift
@Reducer
struct Search {
  struct State: Equatable {
    var query = ""
    var results: [String] = []
  }

  enum Action {
    case queryChanged(String)
    case searchResponse(Result<[String], any Error>)
  }

  @Dependency(\.apiClient) var apiClient
  @Dependency(\.continuousClock) var clock
  private enum CancelID { case search }

  var body: some Reducer<State, Action> {
    Reduce { state, action in
      switch action {
      case let .queryChanged(query):
        state.query = query
        return .run { send in
          try await self.clock.sleep(for: 0.5)

          await send(.searchResponse(Result { try await self.apiClient.search(query) }))
        }
        .cancellable(id: CancelID.search, cancelInFlight: true)

      case let .searchResponse(.success(results)):
        state.results = results
        return .none

      case .searchResponse(.failure):
        // Do error handling here.
        return .none
      }
    }
  }
}
```

`apiClient`와 `continuousClock` 의존성을 완전히 제어할 수 있고 결정적인 값으로 재정의해 기능 전체를 테스트할 수 있어요.

```swift
// Create a test clock to control the timing of effects
let clock = TestClock()

let store = TestStore(initialState: Search.State()) {
  Search()
} withDependencies: {
  // Override the clock dependency with the test clock
  $0.continuousClock = clock

  // Simulate a search response with one item
  $0.apiClient.search = { _ in
    ["Composable Architecture"]
  }
)

// Change the query
await store.send(.searchFieldChanged("c") {
  // Assert that state updates accordingly
  $0.query = "c"
}

// Advance the clock by enough to get past the debounce
await clock.advance(by: 0.5)

// Assert that the expected response is received
await store.receive(\.searchResponse.success) {
  $0.results = ["Composable Architecture"]
}
```

이 테스트는 검색 query가 바뀌면 search response가 전달되고 state도 그에 따라 바뀐다는 것을 증명해요.

`searchResponse` action을 받았다고 단언하지 않으면 다음 테스트 실패가 발생해요.

> ❌ 실패: 이 action 뒤에 예상하지 못한 action 1개를 store가 받았어요. …
>
> ```
> Unhandled actions: [
>   [0]: Search.Action.searchResponse
> ]
> ```

기능에서 일어난 모든 일을 단언하지 않았고, 그 때문에 버그를 놓칠 수 있다는 사실을 명확하게 알려 줘요.

Effect action을 처리하기 전에 다른 action을 보내도 테스트가 실패해요.

> ❌ 실패: Action을 보내기 전에 받은 action 1개를 처리해야 해요. …
>
> ```
> Unhandled actions: [
>   [0]: Search.Action.searchResponse
> ]
> ```

이런 실패는 시스템에 action을 보낼 때 기능이 어떻게 변하는지 정확히 알고 있음을 증명하도록 도와줘요. 라이브러리가 이런 상황에서 실패를 만들지 않으면 코드의 미묘한 버그를 숨길 수 있어요.

예를 들어 사용자가 검색 query를 지우면 결과가 사라지고, query가 없으므로 검색 request도 실행되지 않기를 기대할 거예요. 다음과 같이 작성할 수 있어요.

```swift
await store.send(.queryChanged("")) {
  $0.query = ""
  $0.results = []
}

// No need to perform `store.receive` since we do not expect a search
// effect to execute.
```

나중에 버그가 생겨 빈 query에서도 검색 request를 실행하게 되면 단언하지 않은 새 effect가 생성되므로 테스트가 실패해요. 이것이 철저한 테스트의 힘이에요.

## 비철저 테스트

철저한 테스트는 강력하지만 여러 기능이 통합되는 방식을 테스트할 때는 번거로울 수 있어요. 이럴 때는 선택적으로 비철저한 방식의 테스트를 사용할 수 있어요.

> 팁: “비철저 TestStore”라는 개념은 [Krzysztof Zabłocki](https://www.merowing.info)가 [블로그 글](https://www.merowing.info/exhaustive-testing-in-tca/)과 [컨퍼런스 발표](https://vimeo.com/751173570)에서 처음 소개했고, 이후 핵심 라이브러리에 통합됐어요.

TestStore는 기본적으로 철저하게 동작해요. 모든 state 변경과 각 effect가 시스템으로 데이터를 되돌리는 방식을 단언하고 테스트가 끝나기 전에 모든 effect가 완료되게 해야 해요. 철저함을 끄려면 `exhaustivity`를 `Exhaustivity/off`로 설정하세요. 그러면 `TestStore`의 동작이 다음과 같이 바뀌어요.

- `send(_:assert:fileID:file:line:column:)`와 `receive(_:timeout:assert:fileID:file:line:column:)`의 trailing closure에서 모든 state 변경을 단언하지 않아도 돼요. 변경 중 원하는 일부만 단언할 수 있고, 잘못된 변경을 했을 때만 테스트 실패를 보고해요.
- Effect에서 받았지만 아직 단언하지 않은 action이 있어도 `send`와 `receive` 메서드를 호출할 수 있어요. 보류 중인 action은 모두 지워져요.
- 받았지만 단언하지 않은 action과 실행 중인 effect가 남아 있어도 테스트를 끝낼 수 있어요. 테스트 실패를 보고하지 않아요.

`Exhaustivity/off(showSkippedAssertions:)`를 사용하면 생략한 단언을 보고하도록 비철저 store를 구성할 수 있어요. `true`로 설정하면 명시적으로 단언하지 않은 변경이 생길 때마다 회색 정보 상자가 표시돼요. 실패를 일으키지 않으면서 무시하기로 한 정보를 확인할 수 있고, 운영 환경에서 발생하지만 현재 테스트로 발견하지 못하는 버그를 추적할 때 유용해요.

이 테스트 스타일은 여러 기능의 통합을 테스트하면서 동작의 특정 부분에만 집중할 때 가장 유용해요. 모든 동작을 실제로 단언하고 싶은 leaf node 기능에서는 여전히 철저한 테스트가 중요할 수 있어요.

예를 들어 세 번째 tab이 login 화면인 tab 기반 애플리케이션이 있다고 해 볼게요. 사용자는 화면에 데이터를 입력하고 “Submit” 버튼을 눌러 일련의 login event를 시작해요. Login이 끝나면 세 번째 tab은 login 화면에서 profile 화면으로 바뀌고, 선택한 tab은 activity 화면인 첫 번째 tab으로 바뀌어요.

Login 기능의 테스트는 운영 환경에서 정확히 어떻게 동작하는지 증명할 수 있도록 철저한 방식으로 작성하고 싶을 거예요. 하지만 사용자가 “Login” 버튼을 누른 뒤 선택한 tab이 첫 번째 tab으로 바뀐다는 사실만 증명하는 integration test를 작성한다고 해 볼게요.

이 복잡한 흐름을 테스트하려면 여러 기능의 통합을 다뤄야 하고, 복잡하고 중첩된 state와 effect를 처리해야 해요. 사용자의 login을 흉내 내는 action을 보내고 마지막에 선택한 tab이 activity로 바뀌었다고 단언할 수 있어요.

```swift
let store = TestStore(initialState: App.State()) {
  App()
}

// 1️⃣ Emulate user tapping on submit button.
//    (You can use case key path syntax to send actions to deeply nested features.)
await store.send(\.login.submitButtonTapped) {
  // 2️⃣ Assert how all state changes in the login feature
  $0.login?.isLoading = true
  …
}

// 3️⃣ Login feature performs API request to login, and
//    sends response back into system.
await store.receive(\.login.loginResponse.success) {
// 4️⃣ Assert how all state changes in the login feature
  $0.login?.isLoading = false
  …
}

// 5️⃣ Login feature sends a delegate action to let parent
//    feature know it has successfully logged in.
await store.receive(\.login.delegate.didLogin) {
// 6️⃣ Assert how all of app state changes due to that action.
  $0.authenticatedTab = .loggedIn(
    Profile.State(...)
  )
  …
  // 7️⃣ *Finally* assert that the selected tab switches to activity.
  $0.selectedTab = .activity
}
```

철저한 테스트로 작성하면 장황해지고 몇 가지 문제가 생겨요.

- Login 기능이 어떻게 동작하는지 속속들이 알아야 state가 어떻게 바뀌고 effect가 데이터를 시스템으로 어떻게 되돌리는지 단언할 수 있어요.
- Login 기능의 로직이 바뀌면 실제로 테스트하려는 로직이 그 변경과 무관하더라도 여기서 테스트가 실패할 수 있어요.
- 테스트가 매우 길어요. 비슷하지만 조금 다른 흐름을 테스트할 때 전체를 복사해 붙여 넣기 쉬우므로 중복되고 깨지기 쉬운 테스트가 많아져요.

비철저 테스트를 사용하면 login 때문에 선택한 tab이 activity로 바뀐다는 관심 흐름만 테스트하고 login 기능 내부에서 일어나는 일은 신경 쓰지 않아도 돼요. TestStore의 `exhaustivity`를 끄고 관심 있는 부분만 단언하세요.

```swift
let store = TestStore(App.State()) {
  App()
}
store.exhaustivity = .off  // ⬅️

await store.send(\.login.submitButtonTapped)
await store.receive(\.login.delegate.didLogin) {
  $0.selectedTab = .activity
}
```

Login state가 어떻게 바뀌는지나 login effect가 시스템으로 데이터를 어떻게 되돌리는지는 단언하지 않았어요. “Submit” 버튼을 탭했을 때 최종적으로 `didLogin` delegate action을 받고, 그 결과 선택한 tab이 activity로 바뀐다는 사실만 단언했어요. 이제 login 기능은 이 integration test에 영향을 주지 않고 원하는 대로 바뀔 수 있어요.

`TestStore/exhaustivity`에 `Exhaustivity/off`를 사용하면 단언하지 않은 모든 변경이 알림 없이 통과해요. 억제 중인 테스트 실패를 실제 실패 없이 확인하고 싶다면 `Exhaustivity/off(showSkippedAssertions:)`를 사용할 수 있어요.

```swift
let store = TestStore(initialState: App.State()) {
  App()
}
store.exhaustivity = .off(showSkippedAssertions: true)  // ⬅️

await store.send(\.login.submitButtonTapped)
await store.receive(\.login.delegate.didLogin) {
  $0.selectedTab = .profile
}
```

실행하면 일부 변경을 완전히 단언하지 않은 각 단언 옆에 회색 정보 상자가 나타나요.

> ◽️ 예상된 실패: 상태 변경이 기대와 일치하지 않아요. …
>
> ```diff
>   App.State(
>     authenticatedTab: .loggedOut(
>       Login.State(
> -       isLoading: false
> +       isLoading: true,
>         …
>       )
>     )
>   )
> ```
>
> Skipped receiving .login(.loginResponse(.success))
>
> 상태 변경이 기대와 일치하지 않아요. …
>
> ```diff
>   App.State(
> -   authenticatedTab: .loggedOut(…)
> +   authenticatedTab: .loggedIn(
> +     Profile.State(…)
> +   ),
>     …
>   )
> ```
>
> (Expected: −, Actual: +)

테스트는 계속 통과하고 알림도 테스트 실패가 아니에요. 명시적으로 단언하지 않는 항목을 알려 줄 뿐이며, 운영 환경에서 발생하지만 현재 테스트로 감지하지 못하는 버그를 추적할 때 유용해요.

## API 목차

### TestStore 만들기

- `init(initialState:reducer:withDependencies:fileID:file:line:column:)`
- `TestStoreOf`

### TestStore 구성하기

- `dependencies`
- `exhaustivity`
- `timeout`
- `useMainSerialExecutor`

### Reducer 테스트하기

- `send(_:assert:fileID:file:line:column:)-8f2pl`
- `send(_:assert:fileID:file:line:column:)-8877x`
- `send(_:_:assert:fileID:file:line:column:)`
- `receive(_:timeout:assert:fileID:file:line:column:)-8zqxk`
- `receive(_:timeout:assert:fileID:file:line:column:)-35638`
- `receive(_:timeout:assert:fileID:file:line:column:)-53wic`
- `receive(_:_:timeout:assert:fileID:file:line:column:)-9jd7x`
- `assert(_:fileID:file:line:column:)`
- `finish(timeout:fileID:file:line:column:)-klnc`
- `isDismissed`
- `TestStoreTask`

### Action과 Effect 건너뛰기

- `skipReceivedActions(strict:fileID:file:line:column:)`
- `skipInFlightEffects(strict:fileID:file:line:column:)`

### State 접근하기

TestStore의 state와 상호작용하는 가장 일반적인 방법은 `send`와 `receive` 메서드지만, 테스트 전체에서 직접 접근할 수도 있어요.

- `state`

### 지원 타입

- `TestStoreOf`

### 지원 중단된 API

- `TestStoreDeprecations`
