---
title: Swift로 이해하는 TCA TestStore
description: TCA 1.26의 TestStore로 reducer의 action·state·effect를 검증하고 dependency, clock, exhaustivity와 presentation 테스트 기준을 설명합니다.
pageType: doc-wide
outline: false
---

# Swift로 이해하는 TCA TestStore

> **면접 답변 한 줄 요약:** TCA `TestStore`는 reducer에 action을 보내고 그때의 state 변화, effect가 되돌려 보내는 action과 effect 완료까지 순서대로 assertion해서, feature의 전체 상태 전이를 deterministic하고 exhaustive하게 검증하는 test runtime이에요.

일반 unit test에서는 reducer를 직접 호출하고 바뀐 state만 비교할 수 있어요. 하지만 The Composable Architecture(TCA)의 feature는 action에 따라 state를 바꾸는 동시에 network, clock과 navigation 같은 effect를 반환해요. state만 확인하면 effect가 잘못된 action을 보내거나 끝나지 않는 문제를 놓칠 수 있어요.

`TestStore`는 production `Store`와 같은 initial state와 reducer로 시작하지만 테스트를 위한 더 엄격한 규칙을 적용해요.

```text
test가 action을 send
        │
        ▼
Reducer가 state를 변경하고 Effect를 반환
        │                         │
        │                         └─ effect가 action을 다시 send
        ▼                                      │
예상 state mutation과 비교                    ▼
                                  test가 receive로 action과 state를 검증
```

이 문서는 2026년 7월 공개된 **TCA 1.26.1**을 기준으로 해요. 해당 release의 package는 Swift tools 6.1, Swift language mode 6과 iOS 16 이상을 선언해요. TCA는 API 변화가 활발하므로 project가 고정한 version의 공식 documentation과 release note도 함께 확인하세요.

이 문서에서는 독서 기록 feature를 만들며 다음 내용을 배워요.

- reducer의 State, Action, Dependency와 Effect
- `TestStore` 생성과 `send` state assertion
- effect action을 `receive`로 빠짐없이 검증하는 방법
- `withDependencies`로 network와 오류를 고정하는 방법
- `TestClock`으로 실제 시간을 기다리지 않는 방법
- exhaustive와 non-exhaustive test의 차이
- presentation action과 dismissal을 검증하는 방법
- `TestStore`가 적합한 경계와 흔한 실패 원인

## 먼저 알아둘 TCA 테스트 용어

| 용어         | 쉬운 뜻                                                                                                                                         |
| ------------ | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| TCA          | The Composable Architecture의 줄임말이에요. app feature를 State, Action, Reducer, Store와 Dependency로 구성하는 Point-Free의 Swift library예요. |
| State        | feature가 현재 화면과 logic을 결정하는 데 필요한 value예요. 테스트는 action 전후의 state를 비교해요.                                            |
| Action       | 사용자 event, system event 또는 effect 결과를 나타내는 value예요. reducer에 들어가는 유일한 event vocabulary예요.                               |
| Reducer      | 현재 State와 Action을 받아 state를 변경하고 실행할 Effect를 반환하는 logic이에요.                                                               |
| Effect       | network, clock, database처럼 reducer 밖에서 비동기로 일한 뒤 Action을 store에 다시 보낼 수 있는 작업이에요.                                     |
| Dependency   | reducer가 외부 세계와 상호작용하는 기능이에요. production에는 live value, 테스트에는 제어 가능한 test value를 제공해요.                         |
| Store        | state를 보관하고 action을 reducer로 보내며 effect를 실행하는 runtime이에요.                                                                     |
| `TestStore`  | test 전용 Store로 action, state mutation, effect output과 완료를 assertion하게 해요.                                                            |
| exhaustivity | 관찰된 모든 state 변화, effect action과 실행 중 effect를 빠짐없이 확인하도록 요구하는 성질이에요.                                               |
| presentation | sheet, alert나 navigation destination처럼 optional state로 나타나는 자식 feature의 표시 생명주기예요.                                           |

## TCA feature는 state 변경과 effect를 함께 설명해요

독서 시간을 10분 더하고 서버에 동기화하는 feature를 만들게요. 먼저 외부 network 기능을 dependency로 정의해요.

```swift
import ComposableArchitecture

enum ReadingClientError: Error, Equatable, Sendable {
  case offline
}

struct ReadingClient: Sendable {
  var sync: @Sendable (Int) async throws -> String
}

private enum ReadingClientKey: DependencyKey {
  static let liveValue = ReadingClient { minutes in
    // 실제 앱에서는 server에 minutes를 저장해요.
    "\(minutes)분을 동기화했어요"
  }

  static let testValue = ReadingClient { _ in
    throw ReadingClientError.offline
  }
}

extension DependencyValues {
  var readingClient: ReadingClient {
    get { self[ReadingClientKey.self] }
    set { self[ReadingClientKey.self] = newValue }
  }
}
```

`liveValue`는 production runtime에서 사용하고 `testValue`는 override하지 않은 테스트 dependency의 기본값이에요. 실제 project에서는 `@DependencyClient` macro로 client boilerplate와 unimplemented endpoint를 관리할 수도 있어요. 여기서는 dependency boundary를 눈으로 볼 수 있도록 직접 작성했어요.

다음 reducer는 user action, loading state와 effect result를 한 domain에 모아요.

```swift
import ComposableArchitecture

@Reducer
struct ReadingFeature {
  @ObservableState
  struct State: Equatable {
    var completedMinutes = 0
    var isSyncing = false
    var message: String?
  }

  enum Action: Equatable, Sendable {
    case addTenMinutesButtonTapped
    case syncButtonTapped
    case syncResponse(
      Result<String, ReadingClientError>
    )
  }

  @Dependency(\.readingClient) var readingClient

  var body: some ReducerOf<Self> {
    Reduce { state, action in
      switch action {
      case .addTenMinutesButtonTapped:
        state.completedMinutes += 10
        return .none

      case .syncButtonTapped:
        state.isSyncing = true
        state.message = nil
        let minutes = state.completedMinutes

        return .run { send in
          do {
            let message = try await readingClient.sync(
              minutes
            )
            await send(
              .syncResponse(.success(message))
            )
          } catch {
            await send(
              .syncResponse(.failure(.offline))
            )
          }
        }

      case let .syncResponse(.success(message)):
        state.isSyncing = false
        state.message = message
        return .none

      case .syncResponse(.failure):
        state.isSyncing = false
        state.message = "연결을 확인해 주세요"
        return .none
      }
    }
  }
}
```

reducer의 sync action은 두 단계예요.

1. 즉시 `isSyncing`을 `true`로 바꾸고 effect를 시작해요.
2. effect가 client 결과를 `syncResponse` action으로 보내면 loading과 message를 바꿔요.

최종 message만 확인하면 중간 loading state와 effect action을 놓칠 수 있어요. `TestStore`는 이 전체 sequence를 검증해요.

## `TestStore`는 각 test 안에서 만들어요

TCA 1.26의 공식 문서는 Swift Testing과 `@MainActor` suite를 예제로 사용해요.

```swift
import ComposableArchitecture
import Testing

@testable import ReadingApp

@MainActor
struct ReadingFeatureTests {
  @Test
  func addsTenMinutes() async {
    let store = TestStore(
      initialState: ReadingFeature.State()
    ) {
      ReadingFeature()
    }

    await store.send(.addTenMinutesButtonTapped) {
      $0.completedMinutes = 10
    }
  }
}
```

`TestStore`는 main actor에 격리되어 있고 `send`와 `receive`는 suspend할 수 있으므로 suite에 `@MainActor`, test function에 `async`를 사용해요. XCTest를 사용한다면 `@MainActor final class ...: XCTestCase` 안에서도 같은 API를 쓸 수 있어요.

store를 suite의 shared property로 두지 않고 test function 안에서 만들어요.

- 각 test의 initial state와 override dependency가 바로 보여요.
- test 간 state와 in-flight effect가 공유되지 않아요.
- test가 끝날 때 store가 deinit되어 미수신 action과 끝나지 않은 effect를 검사해요.

공식 [Testing TCA](https://swiftpackageindex.com/pointfreeco/swift-composable-architecture/main/documentation/composablearchitecture/testingtca) 문서도 가능한 한 test별로 TestStore를 만들도록 안내해요.

## `send` closure는 기대하는 state를 만들어요

```swift
await store.send(.addTenMinutesButtonTapped) {
  $0.completedMinutes = 10
}
```

exhaustive mode에서 closure의 `$0`은 action을 보내기 **전 state copy**예요. test author가 expected mutation을 적용해 reducer 실행 후 실제 state와 같은 값을 만들어요.

```text
Initial State(completedMinutes: 0)
          │
          ├─ reducer actual: +10 → 10
          │
          └─ test expected:  =10 → 10
                              │
                         두 state를 diff
```

기대값에는 가능한 한 hard-coded final value를 사용해요.

```swift
// 더 강한 assertion이에요.
await store.send(.addTenMinutesButtonTapped) {
  $0.completedMinutes = 10
}

// reducer logic을 test에서 반복해 약해질 수 있어요.
await store.send(.addTenMinutesButtonTapped) {
  $0.completedMinutes += 10
}
```

두 번째 test도 “10을 더한다”는 규칙은 확인하지만 시작값과 최종값을 정확히 알고 있다는 보장은 약해요. production 계산을 expected closure에 그대로 복사하지 마세요.

state가 바뀌지 않는 action은 trailing closure를 생략할 수 있어요.

```swift
await store.send(.refreshButtonTapped)
```

## effect가 보낸 action은 `receive`로 검증해요

성공하는 sync dependency를 넣고 전체 흐름을 확인해요.

```swift
@Test
func syncsCompletedMinutes() async {
  let store = TestStore(
    initialState: ReadingFeature.State(
      completedMinutes: 20
    )
  ) {
    ReadingFeature()
  } withDependencies: {
    $0.readingClient.sync = { minutes in
      #expect(minutes == 20)
      return "20분을 동기화했어요"
    }
  }

  await store.send(.syncButtonTapped) {
    $0.isSyncing = true
  }

  await store.receive(
    .syncResponse(
      .success("20분을 동기화했어요")
    )
  ) {
    $0.isSyncing = false
    $0.message = "20분을 동기화했어요"
  }
}
```

`send`는 user나 parent가 넣은 action을, `receive`는 effect가 store에 되돌려 보낸 action을 assertion해요. action의 순서와 state 변화를 모두 명시하므로 다음 regression을 잡을 수 있어요.

- sync action이 잘못된 minutes를 client에 전달해요.
- loading이 시작되거나 끝나지 않아요.
- effect가 다른 response action을 보내요.
- success message가 state에 저장되지 않아요.
- effect가 끝나지 않고 test 종료 뒤에도 실행돼요.

action enum에 associated value가 많다면 reducer macro가 제공하는 case key path로 case만 matching할 수도 있어요.

```swift
await store.receive(\.syncResponse.success) {
  $0.isSyncing = false
  $0.message = "20분을 동기화했어요"
}
```

payload까지 정확히 계약이면 concrete action을 사용하고, 값 일부를 다른 assertion으로 확인할 이유가 있을 때 case key path를 사용해요.

## 오류도 dependency value로 직접 만들어요

```swift
@Test
func showsOfflineMessage() async {
  let store = TestStore(
    initialState: ReadingFeature.State(
      completedMinutes: 20
    )
  ) {
    ReadingFeature()
  } withDependencies: {
    $0.readingClient.sync = { _ in
      throw ReadingClientError.offline
    }
  }

  await store.send(.syncButtonTapped) {
    $0.isSyncing = true
  }

  await store.receive(
    .syncResponse(.failure(.offline))
  ) {
    $0.isSyncing = false
    $0.message = "연결을 확인해 주세요"
  }
}
```

실제 network를 끊거나 timeout을 기다리지 않아요. 원하는 dependency output을 즉시 만들기 때문에 빠르고 같은 결과를 반복해요.

dependency closure 안의 `#expect(minutes == 20)`은 reducer가 외부 기능에 전달한 값을 확인해요. 모든 호출을 spy로 만들기보다 해당 input이 domain contract일 때만 검증해요.

## clock을 dependency로 만들면 시간을 수동으로 전진시켜요

30초 뒤 reminder를 표시하는 effect가 `Task.sleep`을 직접 사용하면 test도 실제 30초를 기다려야 해요. TCA의 clock dependency를 사용해요.

```swift
import ComposableArchitecture

@Reducer
struct ReadingReminderFeature {
  @ObservableState
  struct State: Equatable {
    var isWaiting = false
    var message: String?
  }

  enum Action: Equatable {
    case reminderButtonTapped
    case reminderReady
  }

  @Dependency(\.continuousClock) var clock

  var body: some ReducerOf<Self> {
    Reduce { state, action in
      switch action {
      case .reminderButtonTapped:
        state.isWaiting = true

        return .run { send in
          try await clock.sleep(for: .seconds(30))
          await send(.reminderReady)
        }

      case .reminderReady:
        state.isWaiting = false
        state.message = "다시 읽을 시간이에요"
        return .none
      }
    }
  }
}
```

test에서는 `TestClock`을 주입하고 즉시 시간을 이동해요.

```swift
import Clocks
import ComposableArchitecture
import Testing

@MainActor
@Test
func reminderAfterThirtySeconds() async {
  let clock = TestClock()
  let store = TestStore(
    initialState: ReadingReminderFeature.State()
  ) {
    ReadingReminderFeature()
  } withDependencies: {
    $0.continuousClock = clock
  }

  await store.send(.reminderButtonTapped) {
    $0.isWaiting = true
  }

  await clock.advance(by: .seconds(30))

  await store.receive(.reminderReady) {
    $0.isWaiting = false
    $0.message = "다시 읽을 시간이에요"
  }
}
```

이 test는 30초를 기다리지 않아요. `advance`하기 전에는 action이 오지 않고, 정확히 30초를 이동한 뒤 `reminderReady`를 받는 계약을 검증해요.

`ImmediateClock`은 모든 sleep을 즉시 끝내지만 중간 시각별 state를 확인하기 어려워요. debounce, cancellation과 interval을 검증할 때는 `TestClock`으로 필요한 지점만 전진시켜요.

## effect가 끝나지 않으면 테스트가 실패해요

exhaustive TestStore는 test가 끝날 때 다음을 확인해요.

- effect가 보낸 모든 action을 `receive`했나요?
- 각 action의 state mutation을 확인했나요?
- 취소하거나 완료해야 하는 effect가 아직 실행 중인가요?

timer나 observation처럼 오래 실행되는 effect는 중지 action을 보내거나 cancellation ID로 취소하는 흐름까지 검증해야 해요.

```swift
await store.send(.timerStartButtonTapped) {
  $0.isTimerRunning = true
}

await store.send(.timerStopButtonTapped) {
  $0.isTimerRunning = false
}
```

store를 test scope 밖에 보관해야 하는 특수 상황이면 끝에서 `await store.finish()`로 모든 in-flight effect가 완료됐는지 명시적으로 기다릴 수 있어요. 기본은 test 안의 지역 store가 deinit 검사까지 수행하게 하는 것이에요.

## exhaustive test는 leaf feature에서 강한 보장을 줘요

TestStore는 기본적으로 exhaustive해요.

```text
빠진 state mutation  → 실패
받지 않은 effect action → 실패
끝나지 않은 effect → 실패
예상과 다른 action 순서 → 실패
```

작은 leaf feature에서는 이 엄격함이 큰 장점이에요. 화면 logic의 모든 state와 effect 경로를 정확히 알고 있다는 것을 증명해요. 새 state property나 effect action이 추가되면 관련 test가 어떤 계약을 갱신해야 하는지 알려 줘요.

하지만 여러 child feature를 조합한 app-level integration test에서 내부 변화까지 모두 나열하면 test가 목적보다 길어지고 child refactoring에도 자주 깨질 수 있어요.

## non-exhaustive mode는 관심 있는 변화만 확인해요

```swift
let store = TestStore(
  initialState: AppFeature.State()
) {
  AppFeature()
}
store.exhaustivity = .off(
  showSkippedAssertions: true
)

await store.send(\.login.submitButtonTapped)
await store.receive(\.login.delegate.didLogin) {
  $0.selectedTab = .activity
}
```

이 integration test는 login child의 loading과 response action을 모두 assertion하지 않고 최종 delegate와 tab 변화에 집중해요. `showSkippedAssertions: true`는 무시한 변화와 action을 informational issue로 보여 줘요.

exhaustivity에 따라 assertion closure의 `$0` 의미가 달라요.

| mode   | closure의 시작 state | 작성 방법                                                  |
| ------ | -------------------- | ---------------------------------------------------------- |
| `.on`  | action 전 state      | mutation을 적용해 전체 expected state를 만들어요.          |
| `.off` | action 후 실제 state | 관심 property를 final value로 덮어써 일치 여부를 확인해요. |

non-exhaustive closure에서는 `append`, `removeLast`, `+=` 같은 상대 mutation을 피하고 final value를 지정해요. 이미 action이 적용된 state에서 mutation을 한 번 더 실행할 수 있기 때문이에요.

```swift
store.exhaustivity = .off

await store.send(.clearButtonTapped) {
  $0.sessions = []
}
```

non-exhaustive mode는 편해서 켜는 option이 아니에요. leaf feature는 exhaustive, 여러 feature의 high-level integration에서는 목적에 맞는 partial assertion처럼 test boundary에 따라 선택해요.

## presentation action과 dismissal도 순서대로 검증해요

TCA는 sheet와 navigation destination을 `@Presents` optional state와 `PresentationAction`으로 모델링해요. parent TestStore에서 child action과 dismissal을 그대로 확인할 수 있어요.

```swift
await store.send(.showDetailButtonTapped) {
  $0.detail = ReadingDetailFeature.State(
    completedMinutes: 20
  )
}

await store.send(
  .detail(.presented(.closeButtonTapped))
)

await store.receive(.detail(.dismiss)) {
  $0.detail = nil
}
```

child가 `@Dependency(\.dismiss)`를 실행하면 presentation reducer가 `.dismiss` action을 parent domain으로 보내고 optional child state가 `nil`이 돼요. TestStore는 화면이 닫혔다는 visual result만 보는 대신 dismissal action과 state lifecycle을 검증해요.

parent가 직접 destination을 `nil`로 만드는 action이라면 그 `send` closure에서 state가 사라지는 것을 assertion해요. 누가 dismissal을 소유하는지 reducer design에 맞춰 expected sequence를 작성해요.

presentation test에서 child 내부의 모든 동작까지 반복할 필요는 없어요.

- child reducer의 세부 logic은 child TestStore에서 exhaustive하게 검증해요.
- parent test는 child 표시, delegate와 dismissal처럼 composition contract를 검증해요.

## TestStore의 state를 직접 읽는 것은 보조 수단이에요

```swift
#expect(store.state.completedMinutes == 20)
```

computed property나 여러 state를 조합한 결과를 추가로 확인할 때 `store.state`가 유용해요. 하지만 모든 action 뒤 state를 직접 읽기만 하면 TestStore의 state diff와 exhaustivity 장점을 사용하지 못해요.

`send` closure 안에서 `store.state`는 action 전 state이므로 다음처럼 expected state를 복사해 우회할 수도 없어요.

```swift
await store.send(.addTenMinutesButtonTapped) {
  $0 = store.state // action 후 state가 아니에요.
}
```

기본 state transition은 `send`와 `receive` closure에 쓰고 computed output만 직접 assertion해요.

## dependency override는 test마다 필요한 것만 써요

```swift
let store = TestStore(
  initialState: ReadingFeature.State()
) {
  ReadingFeature()
} withDependencies: {
  $0.readingClient.sync = { _ in "완료" }
  $0.date.now = Date(timeIntervalSince1970: 0)
  $0.uuid = .incrementing
}
```

TCA dependency system은 test context에서 live dependency를 실수로 사용하는 문제를 찾도록 설계돼요. 각 test는 자신이 실제 사용하는 endpoint만 override하고 입력을 고정해요.

거대한 공통 dependency fixture는 어떤 test가 무엇에 의존하는지 감춰요. 공통 생성 helper를 만들더라도 override 값이 test call site에서 보이도록 유지해요.

random UUID, current date와 locale도 외부 입력이에요. expected state에 이 값이 들어가면 `.incrementing`, fixed date와 고정 locale을 제공해 deterministic하게 만들어요.

## app target에서 실행할 때 host app 부작용을 조심해요

application target의 unit test는 simulator에서 host app entry point도 실행할 수 있어요. app 시작 code가 analytics, network나 database를 바로 실행하면 TestStore와 무관한 live dependency가 test 중 동작할 수 있어요.

TCA 공식 testing 문서는 다음 대응을 설명해요.

- feature logic을 framework나 Swift package로 분리해 host app 없이 test해요.
- app entry에서 test context를 확인해 실제 root와 startup side effect를 실행하지 않게 해요.
- dependency를 app 시작과 동시에 전역에서 사용하지 말고 feature action 뒤 실행해요.

이는 test를 통과시키기 위한 임시 분기보다 module boundary와 app lifecycle을 정리하라는 신호예요.

SwiftPM test target에서 `ComposableArchitecture`를 중복 static link하면 app module에 연결된 implementation과 충돌할 수 있다는 공식 gotcha도 있어요. test target dependency graph는 TCA의 현재 Testing 문서와 project module 구조를 기준으로 확인해요.

## TestStore와 일반 unit·UI test는 목적이 달라요

| 도구                 | 직접 검증하는 경계                         | 강점                                              | 놓칠 수 있는 것                                                  |
| -------------------- | ------------------------------------------ | ------------------------------------------------- | ---------------------------------------------------------------- |
| XCTest·Swift Testing | function과 object behavior                 | architecture와 무관한 logic을 빠르게 검증해요.    | TCA effect sequence를 자동으로 exhaustive 검사하지 않아요.       |
| TCA TestStore        | reducer action, state, effect와 dependency | feature state machine을 단계별로 강하게 검증해요. | 실제 SwiftUI rendering과 accessibility wiring은 보장하지 않아요. |
| XCUITest             | 실행 중인 app의 UI workflow                | store와 View가 연결된 사용자 결과를 검증해요.     | 느리고 reducer의 모든 branch를 확인하기 어려워요.                |

TestStore가 있다고 pure formatter와 parser까지 모두 reducer action으로 감싸지 않아도 돼요. architecture와 무관한 function은 일반 unit test가 더 단순해요. 반대로 effect와 presentation이 feature behavior의 핵심이면 TestStore가 더 정확한 failure를 제공해요.

## 흔한 실패와 원인을 정리해요

### “Received unexpected action”이 발생해요

effect가 action을 보냈지만 test에 `receive`가 없거나 순서가 달라요. production effect sequence를 확인하고 필요한 action과 state를 빠짐없이 assertion해요. 단지 통과시키려고 exhaustivity를 끄지 않아요.

### “Effect is still running”이 발생해요

timer, observation이나 request가 test 끝에도 실행 중이에요. clock을 전진시키고 결과를 receive하거나 stop action으로 cancellation을 검증해요.

### 실제 timeout을 늘려야 통과해요

uncontrolled network와 `Task.sleep`을 사용하고 있을 가능성이 커요. dependency와 `TestClock`으로 입력을 제어하고 실제 시간을 기다리지 않아요.

### state assertion을 고치면 계속 다른 field가 실패해요

leaf feature의 새 behavior라면 expected contract를 갱신해야 해요. app-level integration test가 child 내부 변화에 과도하게 묶인 상황이라면 그 test의 목적을 좁히고 non-exhaustive mode를 검토해요.

### test끼리 dependency와 state가 섞여요

TestStore를 suite property나 global로 공유했을 수 있어요. 각 test 안에서 initial state와 dependencies를 새로 만들어요.

## 언제 TestStore를 사용해야 하나요

다음 조건에서 중심 도구로 사용해요.

- production feature가 TCA Reducer로 구현되어 있어요.
- action에 따른 state transition을 정확히 보호해야 해요.
- effect output action과 cancellation까지 검증해야 해요.
- network, date, UUID와 clock을 dependency로 제어할 수 있어요.
- child presentation과 parent delegate contract를 확인해야 해요.

pure function 하나나 architecture 밖의 model은 Swift Testing이나 XCTest로 직접 검증해요. 실제 화면의 tap과 navigation wiring은 XCUITest를 추가해요. TestStore를 사용하기 위해 단순 logic을 억지로 reducer로 옮기지 마세요.

## 적용 순서를 정리해요

1. feature의 State, Action과 Reducer가 관찰할 behavior를 명확히 표현하는지 확인해요.
2. network, clock, date와 UUID를 TCA Dependency로 분리해요.
3. test마다 initial state와 TestStore를 지역 값으로 만들어요.
4. user action을 `send`하고 hard-coded final state mutation을 assertion해요.
5. effect가 보낸 action을 순서대로 `receive`하고 state를 확인해요.
6. success, failure와 cancellation마다 dependency output을 고정해요.
7. 실제 시간은 `TestClock`으로 필요한 시점만 advance해요.
8. leaf feature는 exhaustive하게, 큰 integration은 목적이 분명할 때 non-exhaustive를 검토해요.
9. presentation은 표시 state, child action과 dismissal sequence를 나눠 검증해요.
10. UI wiring의 핵심 흐름은 별도 XCUITest로 보완해요.

## 면접에서 이어질 수 있는 질문

### `send`와 `receive`는 어떻게 다른가요?

`send`는 사용자나 parent가 feature에 넣는 action과 그 즉시 state 변화를 검증해요. `receive`는 effect가 store로 되돌려 보낸 action과 그 action의 state 변화를 검증해요.

### TestStore가 exhaustive하다는 것은 무엇인가요?

모든 state mutation, effect가 보낸 action과 실행 중 effect의 완료를 빠짐없이 assertion해야 한다는 뜻이에요. 누락하면 test가 실패해서 feature의 숨은 behavior를 드러내요.

### non-exhaustive test는 언제 사용하나요?

여러 child feature를 조합한 integration에서 내부 구현보다 특정 delegate와 최종 parent state에 집중할 때 사용해요. 작은 leaf feature에서는 기본 exhaustive mode가 더 강한 보장을 줘요.

### `TestClock`이 필요한 이유는 무엇인가요?

실제 sleep을 기다리지 않고 debounce, timeout과 timer의 시간을 test가 직접 전진시키기 위해서예요. test가 빠르고 deterministic해지며 특정 시각 전후 action도 정확히 확인할 수 있어요.

### TestStore만 있으면 UI test가 필요 없나요?

아니요. TestStore는 reducer state machine을 검증하지만 SwiftUI View가 올바른 action을 보내고 state를 실제 accessibility UI로 표현하는지는 보장하지 않아요. 핵심 사용자 흐름은 XCUITest로 보완해요.

## 참고 자료

- [Point-Free — The Composable Architecture](https://github.com/pointfreeco/swift-composable-architecture)
- [Point-Free — TCA 1.26.1 release](https://github.com/pointfreeco/swift-composable-architecture/releases/tag/1.26.1)
- [TCA Documentation — Testing](https://swiftpackageindex.com/pointfreeco/swift-composable-architecture/main/documentation/composablearchitecture/testingtca)
- [TCA Documentation — TestStore](https://swiftpackageindex.com/pointfreeco/swift-composable-architecture/main/documentation/composablearchitecture/teststore)
- [TCA Documentation — Dependencies](https://swiftpackageindex.com/pointfreeco/swift-composable-architecture/main/documentation/composablearchitecture/dependencymanagement)
- [TCA Tutorial — Meet the Composable Architecture](https://swiftpackageindex.com/pointfreeco/swift-composable-architecture/main/tutorials/meetcomposablearchitecture)
- [Swift Dependencies — Official Documentation](https://swiftpackageindex.com/pointfreeco/swift-dependencies/main/documentation/dependencies/)
- [Swift Clocks — Official GitHub repository](https://github.com/pointfreeco/swift-clocks)
- [Swift-KR — Swift로 이해하는 XCTest 단위 테스트](./xctest-unit-testing)
- [Swift-KR — Swift로 이해하는 Swift Testing](./swift-testing)
- [Swift-KR — Swift로 이해하는 XCUITest](./xcuitest)
