---
title: Testing
description: TCA의 TestStore로 상태 변경과 Effect를 철저하게 테스트하고, 비철저 테스트와 테스트 타깃에서 자주 만나는 주의점을 다루는 방법을 설명합니다.
---

# Testing

Composable Architecture로 만든 기능을 포괄적이고 철저하게 테스트하는 방법을 알아봐요.

원문: [Testing](https://swiftpackageindex.com/pointfreeco/swift-composable-architecture/main/documentation/composablearchitecture/testing)

Composable Architecture로 만든 기능의 테스트 가능성은 이 라이브러리의 최우선 목표예요. Store에 액션을 보냈을 때 상태가 어떻게 바뀌는지만이 아니라, effect가 어떻게 실행되고 데이터를 시스템으로 되돌려 보내는지도 테스트할 수 있어야 해요.

## 목차

- [상태 변경 테스트](#상태-변경-테스트)
- [Effect 테스트](#effect-테스트)
- [비철저 테스트](#비철저-테스트)
- [테스트 주의점](#테스트-주의점)

## 상태 변경 테스트

라이브러리에는 기능을 간단하고 간결하게 테스트하도록 설계한 도구가 있어요. 이름은 `TestStore`이며, 기능의 초기 상태와 기능 로직을 실행하는 `Reducer`를 제공해 `Store`와 비슷하게 만들어요.

```swift
import Testing

@MainActor
struct CounterTests {
  @Test
  func basics() async {
    let store = TestStore(initialState: Feature.State(count: 0)) {
      Feature()
    }
  }
}
```

> 팁: 대부분의 `TestStore` 단언 도우미는 일시 중단될 수 있으므로 `TestStore`를 쓰는 테스트는 `async`로 표시해야 해요. 테스트가 메인 액터를 반드시 요구하지는 않지만, `TestStore`는 메인 액터에 격리되어 있으므로 테스트와 테스트 모음에 `@MainActor`를 붙이는 것을 권장해요.

TestStore에는 `TestStore/send(_:assert:fileID:file:line:column:)-8f2pl` 메서드가 있지만 Store나 view store와 다르게 동작해요. 시스템에 보낼 액션을 제공한 뒤, 액션을 보낸 후 기능 상태가 어떻게 바뀌었는지 설명하는 trailing closure도 제공해야 해요.

```swift
await store.send(.incrementButtonTapped) {
  // ...
}
```

이 closure에는 액션을 보내기 **전** 기능 상태를 나타내는 변경 가능한 변수가 전달돼요. 액션을 보낸 뒤 기대하는 상태 모양이 되도록 적절히 변경하는 일이 여러분의 몫이에요.

```swift
await store.send(.incrementButtonTapped) {
  $0.count = 1
}
```

> `TestStore/send(_:assert:fileID:file:line:column:)-8f2pl` 메서드가 `async`인 것은 당장은 신경 쓰지 않아도 되는 기술적 이유 때문이에요.

변경이 잘못되어 `Reducer`에서 실제로 발생한 변경과 다른 변경을 했다면, 상태 중 어느 부분이 일치하지 않는지 정확히 보여 주는 보기 좋은 형식의 테스트 실패를 얻어요.

```swift
await store.send(.incrementButtonTapped) {
  $0.count = 999
}
```

> ❌ 실패: 상태 변경이 기대와 일치하지 않아요. …
>
> ```diff
> - TestStoreTests.State(count: 999)
> + TestStoreTests.State(count: 1)
> ```
>
> (Expected: −, Actual: +)

여러 액션을 보내 사용자 액션 스크립트를 흉내 내고, 매 단계마다 상태가 어떻게 바뀌었는지 단언할 수도 있어요.

```swift
await store.send(.incrementButtonTapped) {
  $0.count = 1
}
await store.send(.incrementButtonTapped) {
  $0.count = 2
}
await store.send(.decrementButtonTapped) {
  $0.count = 1
}
```

> 팁: 기술적으로는 다음과 같이 변경 블록을 작성할 수도 있어요.
>
> ```swift
> await store.send(.incrementButtonTapped) {
>   $0.count += 1
> }
> await store.send(.decrementButtonTapped) {
>   $0.count -= 1
> }
> ```
>
> 이렇게 작성해도 테스트는 통과해요.
>
> 하지만 더 강한 단언은 아니에요. count가 1 증가했다는 점은 보이지만, 각 단계에서 `count`의 정확한 값을 알고 있다는 사실을 증명하지는 못해요.
>
> 일반적으로 `TestStore/send(_:assert:fileID:file:line:column:)-8f2pl`의 trailing closure에 로직이 적을수록 단언은 더 강해져요. 변경에는 단순한 하드코딩 데이터를 쓰는 편이 가장 좋아요.

TestStore는 `TestStore/state` 프로퍼티도 제공해요. 상태에 정의한 계산 프로퍼티를 단언할 때 유용해요. 예를 들어 `State`에 count가 소수인지 확인하는 계산 프로퍼티가 있다면 다음처럼 테스트할 수 있어요.

```swift
await store.send(.incrementButtonTapped) {
  $0.count = 3
}
XCTAssertTrue(store.state.isPrime)
```

하지만 `TestStore/send(_:assert:fileID:file:line:column:)-8f2pl`의 trailing closure 안에서 `TestStore/state` 프로퍼티는 액션을 보낸 **후**가 아니라 **전** 상태와 같아요. 따라서 다음처럼 상태 변경을 실제로 설명하지 않아도 되는 탈출구로 사용하지 못하게 해요.

```swift
await store.send(.incrementButtonTapped) {
  $0 = store.state  // ❌ store.state is the previous, not current, state.
}
```

## Effect 테스트

앞 절처럼 상태 변경을 테스트하는 일은 강력하지만, Composable Architecture로 만든 기능을 테스트하는 이야기의 절반일 뿐이에요. `Reducer`의 두 번째 책임은 액션으로 상태를 변경한 뒤 외부 세계에서 실행되는 작업 단위를 캡슐화하고 데이터를 시스템으로 돌려보내는 `Effect`를 반환하는 일이에요.

Effect는 기능 로직에서 큰 비중을 차지해요. 외부 서비스에 네트워크 요청을 보내고, 디스크에서 데이터를 읽고 저장하며, 타이머를 시작하고 멈추고, Core Location, Core Motion, Speech Recognition 같은 Apple 프레임워크와 상호작용하는 등 많은 일을 할 수 있어요.

간단한 예로 버튼을 탭하면 5에 도달할 때까지 count를 증가시키는 타이머를 시작한 뒤 멈추는 기능을 생각해 볼게요. 비동기 컨텍스트를 제공하고 시스템으로 여러 액션을 되돌려 보낼 수 있는 `Effect/run(priority:operation:catch:fileID:filePath:line:column:)` 도우미로 만들 수 있어요.

```swift
@Reducer
struct Feature {
  @ObservableState
  struct State: Equatable {
    var count = 0
  }
  enum Action {
    case startTimerButtonTapped
    case timerTick
  }
  var body: some Reducer<State, Action> {
    Reduce { state, action in
      switch action {
      case .startTimerButtonTapped:
        state.count = 0
        return .run { send in
          for _ in 1...5 {
            try await Task.sleep(for: .seconds(1))
            await send(.timerTick)
          }
        }

      case .timerTick:
        state.count += 1
        return .none
      }
    }
  }
}
```

이를 테스트하려면 상태 변경을 테스트한 [앞 절](#상태-변경-테스트)과 비슷하게 시작해요.

```swift
@MainActor
struct TimerTests {
  @Test
  func basics() async {
    let store = TestStore(initialState: Feature.State(count: 0)) {
      Feature()
    }
  }
}
```

기본 설정이 끝났으니 `.startTimerButtonTapped`처럼 시스템에서 발생할 일을 단언하는 액션을 보낼 수 있어요. 타이머를 시작할 때는 상태를 바꾸지 않으므로 처음에는 상태가 바뀔 것으로 기대하지 않아요. 따라서 이 경우 trailing closure를 생략할 수 있어요.

```swift
await store.send(.startTimerButtonTapped)
```

하지만 TestStore와 더 상호작용하지 않고 이 상태로 테스트를 실행하면 실패해요.

> ❌ 실패: 이 액션이 반환한 effect가 아직 실행 중이에요. 테스트가 끝나기 전에 완료되어야 해요. …

이것은 `TestStore`가 기능의 전체 시스템이 시간에 따라 어떻게 변하는지 철저하게 증명하도록 요구하기 때문이에요. 테스트가 끝날 때 effect가 아직 실행 중인데 TestStore가 실패하지 않는다면 잠재적인 버그를 숨길 수 있어요. effect가 실행 중이면 안 되는 상황이거나, 나중에 시스템에 넣는 데이터가 잘못됐을 수도 있어요. TestStore는 모든 effect가 끝나기를 요구해요.

테스트를 통과시키려면 effect가 시스템으로 다시 보내는 액션을 단언해야 해요. `TestStore/receive(_:timeout:assert:fileID:file:line:column:)-53wic` 메서드로 effect에서 받을 것으로 기대하는 액션과, 그 effect를 받은 뒤 상태가 어떻게 바뀌는지를 단언해요.

```swift
await store.receive(\.timerTick) {
  $0.count = 1
}
```

> 참고: 받을 액션 케이스를 지정하기 위해 `\.timerTick` 키 경로 문법을 사용해요. `ComposableArchitecture/Reducer()` 매크로가 `Action` enum에 `@CasePathable` 매크로를 자동 적용하기 때문에 가능해요. `@CasePathable`은 enum 케이스에 키 경로 문법을 가져오는 [CasePaths](http://github.com/pointfreeco/swift-case-paths) 라이브러리에서 제공해요.

하지만 이 테스트를 실행해도 실패해요. `timerTick` 액션을 받을 것이라고 단언했지만 잠시 기다린 후에도 액션을 받지 못했기 때문이에요.

> ❌ 실패: 0.1초 후에도 액션을 받을 것으로 기대했지만 아무 액션도 받지 못했어요.

타이머 간격이 1초인데 `TestStore/receive(_:timeout:assert:fileID:file:line:column:)-53wic`는 기본적으로 잠깐만 기다리기 때문이에요. 보통 effect에서 실제 시간 기반 비동기를 사용하지 말고, 테스트에서 속도를 높일 수 있는 clock처럼 제어 가능한 대상을 써야 해요. 잠시 뒤에 보여 드릴게요. 우선 timeout을 늘려 보세요.

```swift
await store.receive(\.timerTick, timeout: .seconds(2)) {
  $0.count = 1
}
```

이 단언은 통과하지만, 아직 받을 액션이 더 있으므로 전체 테스트는 여전히 실패해요. 타이머는 총 5번 tick해야 하므로 `receive` 단언도 다섯 개가 필요해요.

```swift
await store.receive(\.timerTick, timeout: .seconds(2)) {
  $0.count = 1
}
await store.receive(\.timerTick, timeout: .seconds(2)) {
  $0.count = 2
}
await store.receive(\.timerTick, timeout: .seconds(2)) {
  $0.count = 3
}
await store.receive(\.timerTick, timeout: .seconds(2)) {
  $0.count = 4
}
await store.receive(\.timerTick, timeout: .seconds(2)) {
  $0.count = 5
}
```

이제 전체 테스트 모음이 통과하고, 이 기능의 effect가 어떻게 실행되는지 철저하게 증명했어요. 미래에 effect 로직을 바꿔 5번이 아니라 10번 내보내도록 하면, 기능이 시간에 따라 어떻게 변하는지 제대로 단언하지 않았다는 테스트 실패를 즉시 얻어요.

하지만 이 기능 구조에는 이상적인 점이 하나 있어요. effect에서 실제 제어되지 않는 시간 기반 비동기를 한다는 점이에요.

```swift
return .run { send in
  for _ in 1...5 {
    try await Task.sleep(for: .seconds(1))  // ⬅️
    await send(.timerTick)
  }
}
```

이 말은 테스트가 타이머의 모든 액션을 받으려면 실제 세계의 5초가 지나기를 기다려야 한다는 뜻이에요. 테스트 모음이 너무 느려져요. 미래에 수백 번 또는 수천 번 내보내는 타이머 기능을 테스트해야 한다면 어떨까요? 기능 하나를 테스트하기 위해 테스트 모음을 수 분이나 수 시간 멈춰 둘 수는 없어요.

이를 해결하려면 시간 기반 비동기를 돕되 제어할 수 있는 의존성을 reducer에 추가해야 해요. 한 가지 방법은 clock을 reducer의 `@Dependency`로 추가하는 것이에요.

```swift
import Clocks

@Reducer
struct Feature {
  struct State { /* ... */ }
  enum Action { /* ... */ }
  @Dependency(\.continuousClock) var clock
  // ...
}
```

> 팁: 제어 가능한 clock을 사용하려면 Composable Architecture에 자동으로 포함되는 [Clocks](http://github.com/pointfreeco/swift-clocks) 라이브러리를 사용해야 해요.

그런 다음 reducer의 타이머 effect는 제어할 수 없는 `Task.sleep` 메서드에 직접 접근하는 대신 clock을 사용해 잠들 수 있어요.

```swift
return .run { send in
  for _ in 1...5 {
    try await self.clock.sleep(for: .seconds(1))
    await send(.timerTick)
  }
}
```

> 팁: `Clock`의 `sleep(for:)` 메서드는 [Swift Clocks](http://github.com/pointfreeco/swift-clocks) 라이브러리에서 제공해요.

기능에 clock을 의존성으로 두면, 테스트에서 잠들어도 전혀 일시 중단하지 않는 immediate clock 같은 제어 버전을 제공할 수 있어요.

```swift
let store = TestStore(initialState: Feature.State(count: 0)) {
  Feature()
} withDependencies: {
  $0.continuousClock = ImmediateClock()
}
```

이 작은 변경으로 `TestStore/receive(_:timeout:assert:fileID:file:line:column:)-53wic` 호출에서 timeout 인자를 뺄 수 있어요.

```swift
await store.receive(\.timerTick) {
  $0.count = 1
}
await store.receive(\.timerTick) {
  $0.count = 2
}
await store.receive(\.timerTick) {
  $0.count = 3
}
await store.receive(\.timerTick) {
  $0.count = 4
}
await store.receive(\.timerTick) {
  $0.count = 5
}
```

테스트는 여전히 통과하지만 이제 즉시 끝나요.

기능이 사용하는 의존성을 더 많이 제어할수록 기능 테스트를 더 쉽게 작성할 수 있어요. 의존성 설계와 활용 방법은 `DependencyManagement` 문서를 참고하세요.

## 비철저 테스트

앞 절에서는 시간이 흐르며 기능 전체가 어떻게 변하는지 철저하게 증명하는 Composable Architecture 테스트 작성법을 자세히 설명했어요. 모든 상태 조각이 어떻게 바뀌는지, 모든 effect가 어떻게 데이터를 시스템으로 되돌려 보내는지 단언해야 하고, TestStore가 해제되기 전까지 모든 effect가 완료되는지도 확인해야 해요. 강력하지만, 특히 많이 조합한 기능에서는 번거로울 수 있어요. 그래서 때로는 비철저한 스타일로 테스트하고 싶을 수 있어요.

> 팁: “비철저 TestStore”라는 개념은 [Krzysztof Zabłocki](https://www.merowing.info)가 [블로그 글](https://www.merowing.info/exhaustive-testing-in-tca/)과 [컨퍼런스 발표](https://vimeo.com/751173570)에서 처음 소개했고, 이후 핵심 라이브러리에 통합됐어요.

이 테스트 스타일은 여러 기능의 통합을 테스트하면서 동작의 특정 단면에만 집중하고 싶을 때 가장 유용해요. 기능 내부에서 일어나는 모든 일을 실제로 단언하고 싶은 leaf node 기능에는 철저 테스트가 여전히 중요해요.

예를 들어 탭 기반 앱의 세 번째 탭이 로그인 화면이라고 해 볼게요. 사용자는 화면에 데이터를 입력하고 “제출” 버튼을 탭해요. 그러면 사용자를 로그인시키는 일련의 이벤트가 일어나요. 로그인 후 세 번째 탭은 로그인 화면에서 프로필 화면으로 바뀌고, 선택한 탭은 활동 화면인 첫 번째 탭으로 전환돼요.

로그인 기능 자체를 테스트할 때는 운영 환경에서 기능이 어떻게 동작할지 정확히 증명하도록 철저한 스타일을 사용하고 싶어요. 하지만 사용자가 “로그인” 버튼을 탭한 뒤 최종적으로 선택한 탭이 첫 번째 탭으로 바뀐다는 점을 증명하는 통합 테스트를 작성하고 싶다고 해 볼게요.

이런 복잡한 흐름을 테스트하려면 여러 기능의 통합을 테스트해야 하므로 복잡하고 중첩된 상태와 effect를 다뤄야 해요. 사용자가 로그인하는 과정을 흉내 내는 액션을 보내고, 최종적으로 선택한 탭이 활동으로 바뀌었는지 단언할 수 있어요.

```swift
let store = TestStore(initialState: AppFeature.State()) {
  AppFeature()
}

// 1️⃣ Emulate user tapping on submit button.
await store.send(\.login.submitButtonTapped) {
  // 2️⃣ Assert how all state changes in the login feature
  $0.login?.isLoading = true
  // ...
}

// 3️⃣ Login feature performs API request to login, and
//    sends response back into system.
await store.receive(\.login.loginResponse.success) {
// 4️⃣ Assert how all state changes in the login feature
  $0.login?.isLoading = false
  // ...
}

// 5️⃣ Login feature sends a delegate action to let parent
//    feature know it has successfully logged in.
await store.receive(\.login.delegate.didLogin) {
  // 6️⃣ Assert how all of app state changes due to that action.
  $0.authenticatedTab = .loggedIn(
    Profile.State(...)
  )
  // ...
  // 7️⃣ *Finally* assert that the selected tab switches to activity.
  $0.selectedTab = .activity
}
```

철저 테스트로 작성하면 장황하고, 몇 가지 문제가 있어요.

- 로그인 기능의 상태가 어떻게 바뀌고 effect가 어떻게 데이터를 시스템으로 되돌리는지 아주 자세히 알아야 해요.
- 로그인 기능의 로직이 바뀌면, 실제로 테스트하려는 로직은 그 변경에 관심이 없어도 여기에서 테스트 실패가 날 수 있어요.
- 이 테스트는 매우 길어요. 비슷하지만 약간 다른 흐름도 테스트하고 싶다면 전체를 복사해 붙여 넣고 싶어져서, 중복이 많고 깨지기 쉬운 테스트가 늘어나요.

비철저 테스트를 사용하면 로그인 기능 내부에서 무슨 일이 일어나는지 걱정하지 않고도, 로그인으로 선택한 탭이 활동으로 바뀌는 고수준 흐름을 테스트할 수 있어요. TestStore에서 `TestStore/exhaustivity`를 끄고 관심 있는 내용만 단언하세요.

```swift
let store = TestStore(initialState: AppFeature.State()) {
  AppFeature()
}
store.exhaustivity = .off  // ⬅️

await store.send(\.login.submitButtonTapped)
await store.receive(\.login.delegate.didLogin) {
  $0.selectedTab = .activity
}
```

특히 로그인 상태가 어떻게 바뀌는지와 로그인 effect가 어떻게 데이터를 시스템으로 되돌리는지는 단언하지 않았어요. “제출” 버튼을 탭하면 결국 `didLogin` delegate 액션을 받고, 그 결과 선택한 탭이 활동으로 바뀐다는 것만 단언해요. 이제 이 통합 테스트에 영향 주지 않고 로그인 기능은 원하는 변경을 할 수 있어요.

`TestStore/exhaustivity`에 `Exhaustivity/off`를 사용하면 단언하지 않은 모든 변경은 알림 없이 통과해요. 실패를 실제로 일으키지 않으면서 어떤 테스트 실패가 억제되는지 보고 싶다면 `Exhaustivity/off(showSkippedAssertions:)`를 사용하세요.

```swift
let store = TestStore(initialState: AppFeature.State()) {
  AppFeature()
}
store.exhaustivity = .off(showSkippedAssertions: true)  // ⬅️

await store.send(\.login.submitButtonTapped)
await store.receive(\.login.delegate.didLogin) {
  $0.selectedTab = .activity
}
```

실행하면 변경을 완전히 단언하지 않은 각 단언에서 회색 정보 상자를 볼 수 있어요.

> ◽️ 예상된 실패: 상태 변경이 기대와 일치하지 않아요. …
>
> ```diff
>   AppFeature.State(
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
>   AppFeature.State(
> -   authenticatedTab: .loggedOut(…)
> +   authenticatedTab: .loggedIn(
> +     Profile.State(…)
> +   ),
>     …
>   )
> ```
>
> (Expected: −, Actual: +)

테스트는 계속 통과하고 이 알림들은 테스트 실패가 아니에요. 명시적으로 단언하지 않은 내용이 무엇인지 알려 줄 뿐이며, 운영 환경에서 발생하지만 현재 테스트로 감지되지 않는 버그를 추적할 때 유용해요.

#### 비철저 테스트 이해하기

비철저 테스트가 내부적으로 어떻게 동작하는지 이해하는 것이 중요할 수 있어요. 상태 변경을 단언하는 방법에 제약이 있기 때문이에요.

기본값인 **철저** TestStore를 만들면 `TestStore/send(_:assert:fileID:file:line:column:)-8f2pl` trailing closure 안의 `$0`은 액션을 보내기 **전** 상태를 나타내요.

```swift
let store = TestStore(/* ... */)
// ℹ️ "on" is the default so technically this is not needed
store.exhaustivity = .on

await store.send(.buttonTapped) {
  $0  // Represents the state *before* the action was sent
}
```

따라서 액션을 보낸 뒤 상태와 일치하도록 필요한 변경을 `$0`에 적용해야 해요.

비철저 TestStore는 이 동작을 반대로 해요. 이러한 TestStore에서 `send` trailing closure에 전달되는 `$0`은 액션을 보낸 **후** 상태를 나타내요.

```swift
let store = TestStore(/* ... */)
store.exhaustivity = .off

await store.send(.buttonTapped) {
  $0  // Represents the state *after* the action was sent
}
```

즉, `$0`을 전혀 변경하지 않아도 단언은 이미 통과해요. 하지만 변경한다면 이미 상태에 있는 값과 일치해야 하므로, 관심 있는 상태 변경만 단언할 수 있어요.

하지만 철저 모드와 비철저 모드에서 `TestStore`가 다르게 동작한다는 점은 `send` trailing closure에서 할 수 있는 변경 종류를 제한해요. 예를 들어 기능에 컬렉션 마지막 요소를 지우는 액션이 있다고 해 볼게요.

```swift
case .removeButtonTapped:
  state.values.removeLast()
  return .none
```

철저 TestStore에서는 다음처럼 작성해도 괜찮아요.

```swift
await store.send(.removeButtonTapped) {
  $0.values.removeLast()
}
```

`$0`이 액션을 보내기 전 상태이므로 reducer가 하는 것과 같은 작업을 증명하기 위해 마지막 요소를 제거할 수 있어요.

하지만 비철저 TestStore에서는 동작하지 않아요.

```swift
store.exhaustivity = .off
await store.send(.removeButtonTapped) {
  $0.values.removeLast()  // ❌
}
```

테스트가 실패하거나 테스트 모음이 충돌할 수도 있어요. 비철저 TestStore에서 `send` trailing closure의 `$0`은 액션을 보낸 뒤 상태를 나타내므로 마지막 요소가 이미 제거됐기 때문이에요. `$0.values.removeLast()`를 실행하면 끝에서 요소를 하나 더 제거하게 돼요.

따라서 비철저 TestStore에서는 단언에 “상대적” 변경을 쓸 수 없어요. `removeLast`, `append`처럼 변경을 점진적으로 적용하는 메서드로 변경할 수 없어요. 대신 컬렉션을 최종값으로 완전히 교체하는 “절대적” 변경을 해야 해요.

```swift
store.exhaustivity = .off
await store.send(.removeButtonTapped) {
  $0.values = []
}
```

또는 요소의 내용 대신 요소 수만 단언해 단언 강도를 낮출 수 있어요.

```swift
store.exhaustivity = .off
await store.send(.removeButtonTapped) {
  XCTAssertEqual($0.values.count, 0)
}
```

또한 `Exhaustivity/off(showSkippedAssertions:)`로 건너뛴 단언을 보여 주는 비철저 TestStore를 쓸 때는 또 다른 주의점이 있어요. 이런 TestStore에서는 `TestStore/send(_:assert:fileID:file:line:column:)-8f2pl`의 trailing closure를 TestStore가 **두 번** 호출해요. 먼저 액션을 보낸 뒤 상태를 나타내는 `$0`으로 실제 상태와 일치하지 않는지 확인하고, 그다음 액션을 보내기 전 상태를 나타내는 `$0`으로 다시 호출해 어떤 상태 단언이 건너뛰었는지 보여 줘요.

TestStore가 trailing assertion closure를 두 번 호출할 수 있으므로 closure가 side effect를 수행한다면 주의해야 해요. effect가 두 번 실행되기 때문이에요. 예를 들어 제어 가능한 `@Dependency(\.uuid)`로 UUID를 생성하는 도메인 모델이 있다고 해 볼게요.

```swift
struct Model: Equatable {
  let id: UUID
  init() {
    @Dependency(\.uuid) var uuid
    self.id = uuid()
  }
}
```

Composable Architecture에서 이 패턴을 채택하는 것은 완전히 괜찮지만, 비철저 TestStore에서 건너뛴 단언을 표시할 때 문제가 생겨요. 액션을 보낼 때 배열에 새 모델을 추가하는 간단한 reducer를 살펴볼게요.

```swift
@Reducer
struct Feature {
  struct State: Equatable {
    var values: [Model] = []
  }
  enum Action {
    case addButtonTapped
  }
  var body: some Reducer<State, Action> {
    Reduce { state, action in
      switch action {
      case .addButtonTapped:
        state.values.append(Model())
        return .none
      }
    }
  }
}
```

`addButtonTapped` 액션을 보내면 `values` 배열에 모델 하나가 추가됨을 단언하는 테스트를 작성하고 싶어요.

```swift
@Test
func add() async {
  let store = TestStore(initialState: Feature.State()) {
    Feature()
  } withDependencies: {
    $0.uuid = .incrementing
  }
  store.exhaustivity = .off(showSkippedAssertions: true)

  await store.send(.addButtonTapped) {
    $0.values = [Model()]
  }
}
```

이 단순한 테스트는 통과할 것 같지만 `showSkippedAssertions`가 `true`이면 실패해요.

> ❌ 실패: 상태 변경이 기대와 일치하지 않아요. …
>
> ```diff
>   TestStoreNonExhaustiveTests.Feature.State(
>     values: [
>       [0]: TestStoreNonExhaustiveTests.Model(
> -       id: UUID(00000000-0000-0000-0000-000000000001)
> +       id: UUID(00000000-0000-0000-0000-000000000000)
>       )
>     ]
>   )
> ```
>
> (Expected: −, Actual: +)

trailing closure가 두 번 호출되고, 처음 호출할 때 실행한 side effect가 두 번째 호출에 영향을 주기 때문에 발생해요.

특히 closure를 처음 평가하면 `Model()`을 만들고 내부적으로 다음 자동 증가 UUID를 생성해요. 그런 다음 closure를 다시 실행할 때 또 다른 `Model()`을 만들어 또 다른 자동 증가 UUID가 생성돼요. 이 값은 기대값과 일치하지 않아요.

`Exhaustivity/off(showSkippedAssertions:)`에 `showSkippedAssertions` 옵션을 사용하고 싶다면 모델 이니셜라이저에서 `@Dependency`를 직접 쓰는 것을 포함해 `send`에서 어떤 side effect도 수행하지 마세요. 대신 모델을 초기화하는 순간에 값을 제공하도록 강제하세요.

```swift
struct Model: Equatable {
  let id: UUID
  init(id: UUID) {
    self.id = id
  }
}
```

그런 다음 새 ID 생성 책임을 reducer로 옮기세요.

```swift
@Reducer
struct Feature {
  // ...
  @Dependency(\.uuid) var uuid
  var body: some Reducer<State, Action> {
    Reduce { state, action in
      switch action {
      case .addButtonTapped:
        state.values.append(Model(id: self.uuid()))
        return .none
      }
    }
  }
}
```

이제 ID를 명시적으로 제공해 테스트를 더 단순하게 작성할 수 있어요.

```swift
await store.send(.addButtonTapped) {
  $0.values = [
    Model(id: UUID(0))
  ]
}
```

액션을 여러 번 보내도 동작해요.

```swift
await store.send(.addButtonTapped) {
  $0.values = [
    Model(id: UUID(0))
  ]
}
await store.send(.addButtonTapped) {
  $0.values = [
    Model(id: UUID(0)),
    Model(id: UUID(1))
  ]
}
```

## 테스트 주의점

### 호스트 애플리케이션 테스트

잘 알려져 있지 않지만, 애플리케이션 타깃에서 테스트를 실행하면 실제로 simulator를 부팅하고 그 안에서 실제 앱 진입점을 실행해요. 즉, 테스트가 실행되는 동안 애플리케이션 코드도 별도로 실행돼요. 모르는 사이 네트워크 요청을 보내고, 분석 이벤트를 추적하고, 사용자 기본값이나 디스크에 데이터를 쓰는 등의 일이 일어날 수 있어 큰 주의점이에요.

대개 눈에 띄지 않아 이런 일이 일어나는지 알 수 없고 문제가 될 수 있어요. 하지만 이 라이브러리를 사용하고 의존성을 제어하기 시작하면 문제가 매우 뚜렷하게 드러날 수 있어요. 보통 테스트 컨텍스트에서 의존성을 재정의하지 않고 사용하면 테스트 실패가 발생해요. 이 때문에 테스트는 성공적으로 통과한 것 같은데, 알 수 없는 이유로 테스트 모음은 실패할 수 있어요. 이제 테스트 컨텍스트에서 앱 호스트 코드가 실행되고, 의존성 접근이 테스트 실패를 만들기 때문이에요.

이 문제는 simulator나 기기에서 앱을 실행하는 용도의 **애플리케이션 타깃**에서 테스트를 실행할 때만 일어나요. framework나 SPM 라이브러리 테스트에서는 일어나지 않으므로, 코드베이스를 모듈화해야 하는 또 하나의 이유예요.

하지만 지금 코드베이스를 모듈화할 수 없다면 빠른 해결책이 있어요. 이 라이브러리에 전이적으로 포함되는 [XCTest Dynamic Overlay](http://github.com/pointfreeco/xctest-dynamic-overlay) 라이브러리는 테스트 실행 여부를 확인할 수 있는 프로퍼티를 제공해요. 테스트 중이라면 앱의 전체 진입점을 생략할 수 있어요.

```swift
import SwiftUI
import ComposableArchitecture

@main
struct MyApp: App {
  var body: some Scene {
    WindowGroup {
      if TestContext.current == nil{
        // Your real root view
      }
    }
  }
}
```

이렇게 하면 실제 애플리케이션 코드가 간섭하지 않고 애플리케이션 타깃에서 테스트를 실행할 수 있어요.

### 테스트 타깃에 ComposableArchitecture 정적 링크하기

`ComposableArchitecture` 모듈을 테스트 타깃에 정적으로 링크하면 앱 자체에 정적으로 링크된 구현과 충돌할 수 있어요. 재정의했는데도 테스트에서 live dependency를 사용한다는 알 수 없는 테스트 실패로 가장 자주 드러나요.

이 경우 Xcode가 콘솔에 다음과 비슷한 경고를 여러 개 표시해요.

> Class _TtC12Dependencies[…] is implemented in both […] and […].
> One of the two will be used. Which one is undefined.

해결하려면 앱 자체를 통해 전이적으로 접근할 수 있으므로 테스트 타깃에서 `ComposableArchitecture` 정적 링크를 제거하세요. Xcode에서 “Build Phases”로 가서 “Link Binary With Libraries” 섹션에서 “ComposableArchitecture”를 제거하세요. SwiftPM을 쓴다면 `Package.swift`의 `testTarget` `dependencies` 배열에서 “ComposableArchitecture” 항목을 제거하세요.

### 오래 유지되는 TestStore

가능하면 TestStore는 테스트 클래스의 공유 인스턴스 변수 대신 각각의 테스트에서 만들어야 해요.

```diff
 @MainActor
 struct FeatureTests {
   // 👎 Don't do this:
-  let store = TestStore(initialState: Feature.State()) {
-    Feature()
-  }

   @Test
   func basics() async {
     // 👍 Do this:
+    let store = TestStore(initialState: Feature.State()) {
+      Feature()
+    }
     // ...
   }
 }
```

이렇게 하면 각 테스트를 매우 정확하게 만들 수 있어요. 아주 구체적인 상태에서 Store를 시작하고, 테스트가 관심 있는 의존성만 재정의할 수 있어요.

더 중요한 점은 테스트 클래스가 보관한 TestStore는 테스트 실행 중에 deinitialize되지 않으므로, deinitialization 중에 수행되는 여러 철저 단언이 실행되지 않는다는 점이에요. 예를 들어 단언해야 하는 미수신 액션이 있거나 완료되어야 하는 진행 중 effect가 있는지 확인하지 못해요.

테스트 끝에서 TestStore가 deinitialize되지 않는다면 철저한 범위를 유지하기 위해 테스트 끝에 `TestStore/finish(timeout:fileID:file:line:column:)-klnc`를 명시적으로 호출해야 해요.

```swift
await store.finish()
```
