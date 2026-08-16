---
title: Swift로 이해하는 XCTest 단위 테스트
description: XCTestCase, assertion, setup·teardown, async expectation, 테스트 대역, 성능 측정과 test plan을 독서 기록 예제로 설명합니다.
pageType: doc-wide
outline: false
---

# Swift로 이해하는 XCTest 단위 테스트

> **면접 답변 한 줄 요약:** XCTest 단위 테스트는 작은 코드 경계를 실제 앱 UI와 외부 환경에서 분리한 뒤 입력에 대한 결과나 상태 변화를 assertion으로 검증해서, 빠르고 재현 가능한 회귀 피드백을 만드는 테스트예요.

테스트를 처음 만들면 “함수마다 테스트 하나를 작성하면 되나요?”라는 질문부터 생겨요. 단위 테스트의 **단위(unit)**는 반드시 함수 하나나 타입 하나를 뜻하지 않아요. 테스트에서 빠르고 결정적으로 실행할 수 있도록 선택한 **행동의 경계**를 뜻해요.

예를 들어 독서 목표의 진행률을 계산하는 함수는 작은 단위예요. repository를 stub으로 바꾼 ViewModel의 로딩 행동도 하나의 단위로 검증할 수 있어요. 반면 실제 서버, 실제 날짜와 여러 화면을 한 테스트에 함께 넣으면 실패 원인이 넓어지고 실행 결과도 환경에 따라 달라져요.

이 문서에서는 Apple의 XCTest로 다음 내용을 배워요.

- unit, system under test와 assertion의 의미
- Xcode unit test target과 `@testable import`
- Arrange–Act–Assert로 첫 테스트를 만드는 방법
- `XCTestCase`의 setup과 teardown 생명주기
- `async throws`와 callback expectation을 구분하는 기준
- stub, fake, spy 같은 테스트 대역과 의존성 제어
- 성능 테스트, code coverage와 test plan의 역할
- XCTest, Swift Testing, XCUITest와 TCA `TestStore`의 경계

## 먼저 알아둘 테스트 용어

| 용어                   | 쉬운 뜻                                                                                                             |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------- |
| production code        | 실제 앱이나 framework에 포함되어 사용자 환경에서 실행되는 코드예요.                                                 |
| test target            | production target을 불러와 테스트 코드와 test runner를 빌드하는 별도 target이에요. 보통 이름이 `AppTests`로 끝나요. |
| system under test(SUT) | 현재 테스트가 직접 검증하는 대상이에요. 함수, 타입 또는 작은 기능 경계가 될 수 있어요.                              |
| test case              | 하나의 입력과 상황에서 기대 행동을 확인하는 실행 단위예요. XCTest에서는 `test`로 시작하는 instance method가 돼요.   |
| fixture                | 테스트를 실행하는 데 필요한 입력, 객체와 초기 상태의 묶음이에요.                                                    |
| assertion              | 실제 결과가 기대값과 같은지 확인하고 다르면 테스트 실패를 기록하는 명령이에요.                                      |
| deterministic          | 같은 코드와 입력으로 실행하면 시간, 순서나 외부 환경에 상관없이 같은 결과를 내는 성질이에요.                        |
| test double            | network, database, clock 같은 실제 의존성을 테스트에서 대신하는 구현이에요. stub, fake와 spy가 대표적이에요.        |
| regression             | 이미 동작하던 기능이 변경 뒤 다시 깨지는 문제예요. 테스트는 과거 버그와 약속을 자동으로 다시 확인해요.              |

## 단위 테스트는 구현 줄 수보다 관찰할 행동을 검증해요

독서 목표 진행률을 계산하는 가장 작은 타입부터 시작할게요.

```swift
struct ReadingGoal {
  let dailyMinutes: Int

  func progress(completedMinutes: Int) -> Double {
    guard dailyMinutes > 0 else { return 0 }

    return min(
      Double(max(completedMinutes, 0)) / Double(dailyMinutes),
      1
    )
  }
}
```

이 타입이 외부에서 관찰할 수 있는 약속은 다음과 같아요.

1. 목표의 절반을 읽으면 `0.5`를 반환해요.
2. 목표보다 많이 읽어도 진행률은 `1`을 넘지 않아요.
3. 음수 입력과 잘못된 목표는 안전한 값으로 처리해요.

내부에서 `min`을 호출했는지 검증할 필요는 없어요. 구현을 같은 의미의 다른 코드로 바꿔도 외부 행동이 유지되면 테스트는 통과해야 해요. private method 호출 순서처럼 구현 세부 사항에 묶인 테스트는 안전한 refactoring까지 방해할 수 있어요.

## Xcode에 unit test target을 연결해요

Xcode 16 이상에서 새 프로젝트를 만들 때 Testing System을 선택하면 unit test와 UI test target을 함께 만들 수 있어요. 기존 프로젝트에는 다음 순서로 추가해요.

1. **File > New > Target**을 선택해요.
2. **Unit Testing Bundle**을 선택해요.
3. testing system으로 XCTest를 선택해 test target을 만들어요.
4. app scheme의 Test action에 새 target이 포함됐는지 확인해요.
5. 테스트 파일에서 `import XCTest`와 `@testable import AppModule`을 작성해요.

```swift
import XCTest

@testable import ReadingApp
```

Swift access control에서 다른 module은 `internal` 선언에 접근할 수 없어요. `@testable import`는 **Enable Testability**로 빌드한 module의 `internal` API를 test target에서 볼 수 있게 해요. `private`까지 공개하거나 production API를 테스트 때문에 모두 `public`으로 바꾸는 기능은 아니에요.

Apple의 [Adding tests to your Xcode project](https://developer.apple.com/documentation/xcode/adding-tests-to-your-xcode-project)는 unit test가 작은 app logic을, integration test가 여러 component의 결합을 검증한다고 구분해요. 둘 다 같은 XCTest API를 사용할 수 있고 차이는 framework가 아니라 실제 code boundary의 크기예요.

## Arrange–Act–Assert로 첫 테스트를 작성해요

`XCTestCase`를 상속하고 이름이 `test`로 시작하는 instance method를 만들어요.

```swift
import XCTest

final class ReadingGoalTests: XCTestCase {
  func testHalfOfGoalReturnsHalfProgress() {
    // Arrange: 입력과 SUT를 준비해요.
    let goal = ReadingGoal(dailyMinutes: 30)

    // Act: 검증할 행동을 한 번 실행해요.
    let progress = goal.progress(completedMinutes: 15)

    // Assert: 관찰된 결과를 기대값과 비교해요.
    XCTAssertEqual(progress, 0.5, accuracy: 0.001)
  }
}
```

Arrange–Act–Assert(AAA)는 문법이 아니라 테스트의 읽기 순서예요.

| 단계    | 답하는 질문                               | 예제                           |
| ------- | ----------------------------------------- | ------------------------------ |
| Arrange | 어떤 상황과 입력인가요?                   | 30분 목표를 만들어요.          |
| Act     | 사용자가 기대하는 어떤 행동을 실행하나요? | 15분 완료의 진행률을 계산해요. |
| Assert  | 외부에서 어떤 결과가 보여야 하나요?       | 결과가 0.5인지 확인해요.       |

부동소수점 값은 계산 과정에서 아주 작은 오차가 생길 수 있으므로 `accuracy`를 함께 지정했어요. 모든 값을 무조건 정확한 `==`로 비교하는 대신 도메인이 허용하는 오차를 명시해요.

## 경계값은 서로 다른 행동으로 나눠 검증해요

happy path 하나만 확인하면 분기와 경계에서 생기는 버그를 놓치기 쉬워요.

```swift
final class ReadingGoalBoundaryTests: XCTestCase {
  func testProgressDoesNotExceedOne() {
    let goal = ReadingGoal(dailyMinutes: 30)

    let progress = goal.progress(completedMinutes: 50)

    XCTAssertEqual(progress, 1)
  }

  func testNegativeCompletedMinutesReturnsZero() {
    let goal = ReadingGoal(dailyMinutes: 30)

    let progress = goal.progress(completedMinutes: -10)

    XCTAssertEqual(progress, 0)
  }

  func testInvalidGoalReturnsZero() {
    let goal = ReadingGoal(dailyMinutes: 0)

    let progress = goal.progress(completedMinutes: 10)

    XCTAssertEqual(progress, 0)
  }
}
```

하나의 긴 테스트에서 세 상황을 연속으로 확인할 수도 있지만, 분리하면 어떤 계약이 깨졌는지 test name만 보고 알 수 있어요. 같은 계산을 많은 입력에 반복해야 한다면 [Swift Testing](./swift-testing)의 parameterized test가 중복을 줄이는 데 더 적합할 수 있어요.

## assertion은 실패 뒤 테스트를 계속할지 결정해요

XCTest는 값의 성격에 맞는 assertion을 제공해요.

| 목적           | 대표 API                                       |
| -------------- | ---------------------------------------------- |
| 두 값 비교     | `XCTAssertEqual`, `XCTAssertNotEqual`          |
| Boolean 조건   | `XCTAssertTrue`, `XCTAssertFalse`              |
| optional 검사  | `XCTAssertNil`, `XCTAssertNotNil`, `XCTUnwrap` |
| 오류 발생 여부 | `XCTAssertThrowsError`, `XCTAssertNoThrow`     |
| 즉시 실패      | `XCTFail`                                      |

optional 값이 없으면 뒤 검증을 실행할 수 없을 때는 `XCTUnwrap`이 유용해요.

```swift
func testFirstFinishedBook() throws {
  let titles = ["The Swift Programming Language"]

  let firstTitle = try XCTUnwrap(titles.first)

  XCTAssertEqual(firstTitle, "The Swift Programming Language")
}
```

`XCTAssertNotNil(titles.first)` 뒤에 force unwrap을 쓰면 실패를 이미 기록하고도 crash할 수 있어요. `XCTUnwrap`은 값이 없을 때 오류를 던져 현재 테스트 흐름을 중단하고, 값이 있으면 optional을 벗긴 타입으로 반환해요.

여러 assertion을 넣을 수 있지만 하나의 테스트가 하나의 **행동과 결과 묶음**을 설명하도록 유지해요. 저장 버튼을 눌렀을 때 loading이 끝나고 message가 바뀌는 것처럼 한 행동의 여러 관찰값은 함께 확인해도 괜찮아요.

## setup과 teardown은 각 테스트의 격리를 지켜야 해요

공통 객체를 매 test method 전에 새로 만들어야 할 때 setup을 사용할 수 있어요.

```swift
final class ReadingGoalSetupTests: XCTestCase {
  private var goal: ReadingGoal!

  override func setUpWithError() throws {
    try super.setUpWithError()
    goal = ReadingGoal(dailyMinutes: 30)
  }

  override func tearDownWithError() throws {
    goal = nil
    try super.tearDownWithError()
  }

  func testHalfProgress() {
    XCTAssertEqual(
      goal.progress(completedMinutes: 15),
      0.5,
      accuracy: 0.001
    )
  }
}
```

XCTest는 instance setup을 각 test method 전에, teardown을 각 test method 뒤에 실행해요. 현재 XCTest에는 `async throws` setup, `setUpWithError()`, `setUp()`이 있고 Apple의 [Set Up and Tear Down State in Your Tests](https://developer.apple.com/documentation/xctest/set-up-and-tear-down-state-in-your-tests)는 실행 순서와 cleanup 보장을 설명해요.

공통 setup이 항상 좋은 것은 아니에요. 위 예제처럼 한 줄짜리 값은 각 테스트 안에서 지역 상수로 만드는 편이 입력을 바로 볼 수 있고 implicit unwrapped optional도 없애요. setup은 다음 조건일 때 사용해요.

- 생성 비용과 준비 코드가 여러 테스트에서 의미 있게 반복돼요.
- 각 테스트 전에 완전히 새 instance를 만들 수 있어요.
- setup을 읽지 않아도 test method의 중요한 입력이 감춰지지 않아요.

database file, notification observer처럼 반드시 정리해야 하는 resource는 `addTeardownBlock`으로 생성 지점 가까이에 cleanup을 등록할 수 있어요. teardown은 테스트 성공과 실패 모두에서 실행되지만 process crash까지 복구하는 장치는 아니에요.

## 외부 의존성을 직접 사용하면 결과가 흔들려요

다음 service는 현재 시각의 network 상태에 따라 다른 결과를 만들 수 있어요.

```swift
struct LiveReadingRepository {
  func fetchCompletedMinutes() async throws -> Int {
    // 실제 앱에서는 server와 통신해요.
    20
  }
}

struct ReadingStatusService {
  private let repository = LiveReadingRepository()

  func status(goal: Int) async throws -> String {
    let minutes = try await repository.fetchCompletedMinutes()
    return minutes >= goal ? "목표 달성" : "독서 중"
  }
}
```

이 코드를 그대로 테스트하면 offline, server data와 인증 상태가 결과에 개입해요. 원하는 실패도 만들기 어렵고 test suite가 느려져요. repository의 필요한 동작을 protocol로 표현하고 외부에서 전달해요.

```swift
protocol ReadingRepository: Sendable {
  func fetchCompletedMinutes() async throws -> Int
}

struct ReadingStatusService {
  let repository: any ReadingRepository

  func status(goal: Int) async throws -> String {
    let minutes = try await repository.fetchCompletedMinutes()
    return minutes >= goal ? "목표 달성" : "독서 중"
  }
}
```

이 구조는 [의존성 주입](../design-patterns/dependency-injection)이에요. production에서는 live repository를, 테스트에서는 제어 가능한 대역을 전달해요.

## stub으로 async 결과와 오류를 고정해요

```swift
enum ReadingRepositoryError: Error, Equatable {
  case offline
}

private struct StubReadingRepository: ReadingRepository {
  let result: Result<Int, ReadingRepositoryError>

  func fetchCompletedMinutes() async throws -> Int {
    try result.get()
  }
}
```

성공과 실패를 실제 network 없이 만들 수 있어요.

```swift
final class ReadingStatusServiceTests: XCTestCase {
  func testCompletedGoalReturnsCompletedStatus() async throws {
    let repository = StubReadingRepository(
      result: .success(30)
    )
    let service = ReadingStatusService(repository: repository)

    let status = try await service.status(goal: 30)

    XCTAssertEqual(status, "목표 달성")
  }

  func testRepositoryErrorIsPropagated() async {
    let repository = StubReadingRepository(
      result: .failure(.offline)
    )
    let service = ReadingStatusService(repository: repository)

    do {
      _ = try await service.status(goal: 30)
      XCTFail("offline 오류가 발생해야 해요.")
    } catch {
      XCTAssertEqual(error as? ReadingRepositoryError, .offline)
    }
  }
}
```

Swift concurrency 함수를 검증할 때 test method를 `async` 또는 `async throws`로 만들고 production 호출을 직접 `await`해요. 예상하지 않은 오류라면 test method 밖으로 던져도 XCTest가 실패로 기록해요. `do-catch`는 특정 오류를 직접 비교해야 할 때 사용해요.

UI-bound object를 검증하면 test method나 test class에 `@MainActor`를 붙여 격리 위치를 명시해요. Apple의 [Asynchronous Tests and Expectations](https://developer.apple.com/documentation/xctest/asynchronous-tests-and-expectations)도 main actor가 필요하면 annotation을 추가하라고 안내해요.

## callback API는 expectation으로 완료를 알려요

`async` API가 아닌 delegate나 completion handler를 테스트할 때 `XCTestExpectation`을 사용해요.

```swift
func testLegacyLoadCallsCompletion() async {
  let completionCalled = expectation(
    description: "독서 시간을 전달해요."
  )
  let loader = LegacyReadingLoader()

  loader.load { minutes in
    XCTAssertEqual(minutes, 20)
    completionCalled.fulfill()
  }

  await fulfillment(
    of: [completionCalled],
    timeout: 1
  )
}
```

expectation은 “언젠가 되겠지”라고 일정 시간을 멈추는 sleep과 달라요. callback이 오면 즉시 테스트를 계속하고, 오지 않으면 명확한 timeout failure를 만들어요.

다음 기준으로 선택해요.

- 호출 API가 `async`이면 test method도 `async`로 만들고 직접 `await`해요.
- delegate, notification, callback처럼 직접 await할 수 없으면 expectation을 사용해요.
- callback 횟수나 순서가 계약이면 `expectedFulfillmentCount` 또는 `enforceOrder`를 명시해요.
- `Thread.sleep`과 임의 delay로 비동기를 기다리지 않아요.

## 테스트 대역은 검증 목적에 맞게 골라요

| 대역  | 하는 일                                           | 독서 앱 예                                           |
| ----- | ------------------------------------------------- | ---------------------------------------------------- |
| dummy | signature를 채우지만 실제로 사용되지 않아요.      | 현재 테스트가 읽지 않는 analytics를 전달해요.        |
| stub  | 준비된 값이나 오류를 반환해요.                    | 완료 시간이 항상 30분이라고 반환해요.                |
| fake  | 단순하지만 실제 규칙으로 동작해요.                | memory dictionary에 독서 기록을 저장해요.            |
| spy   | 호출된 값과 횟수를 기록해 나중에 확인해요.        | `save(minutes:)`가 30으로 한 번 호출됐는지 기록해요. |
| mock  | 기대 호출과 순서를 미리 정의하고 스스로 검증해요. | sync 뒤 analytics 호출 순서를 엄격하게 확인해요.     |

모든 대역을 mock이라고 부르면 테스트가 무엇을 확인하는지 읽기 어려워요. 반환값만 필요하면 stub, 저장 동작이 필요하면 fake, interaction을 확인해야 하면 spy처럼 목적을 이름에 드러내요.

interaction 검증도 최소화해요. 최종 state나 반환값으로 행동을 확인할 수 있다면 private collaboration 호출 횟수보다 결과를 검증하는 편이 refactoring에 강해요.

## 실제 시간을 기다리지 말고 clock을 주입해요

debounce나 timeout 코드가 `Task.sleep`을 직접 호출하면 테스트도 실제 시간을 기다려야 해요. sleep 동작을 protocol이나 `Clock` dependency로 주입하면 즉시 완료하거나 수동으로 시간을 전진시키는 구현을 사용할 수 있어요.

```swift
struct ReminderScheduler<C: Clock> where C.Duration == Duration {
  let clock: C

  func waitBeforeReminder() async throws {
    try await clock.sleep(for: .seconds(30))
  }
}
```

production에는 `ContinuousClock`, 테스트에는 제어 가능한 clock을 전달해요. 중요한 점은 timeout을 크게 늘리는 것이 아니라 **시간 자체를 테스트 입력으로 바꾸는 것**이에요.

## performance test는 회귀를 측정해요

동작의 정답이 아니라 실행 시간이나 resource 사용량의 회귀를 확인하려면 XCTest의 measurement API를 사용해요.

```swift
final class ReadingSummaryPerformanceTests: XCTestCase {
  func testSummaryPerformance() {
    let sessions = (0..<10_000).map { _ in 10 }

    measure {
      _ = sessions.reduce(0, +)
    }
  }
}
```

`measure`는 block을 반복 실행하고 기본적으로 wall-clock time을 기록해요. CPU, memory, storage, app launch 같은 다른 지표는 `XCTMetric` 계열을 사용해요. Apple의 [Writing and running performance tests](https://developer.apple.com/documentation/xcode/writing-and-running-performance-tests)는 release build, 고정된 device 조건과 baseline을 함께 관리하도록 안내해요.

performance test에서 code coverage와 sanitizer를 켜면 측정 자체의 overhead가 결과에 들어갈 수 있어요. 기능 테스트 설정과 성능 측정용 test plan을 분리해요.

## test plan은 실행 조합을 코드 밖에서 관리해요

test plan은 scheme의 Test action에서 어떤 test와 설정 조합을 실행할지 정의하는 `.xctestplan` 문서예요.

- 빠른 unit test만 실행하는 개발용 plan
- integration과 UI test까지 포함하는 pull request plan
- locale, appearance와 device 설정을 바꾸는 UI plan
- code coverage와 sanitizer를 켠 진단 plan
- release configuration으로 실행하는 performance plan

하나의 거대한 plan에 모든 설정을 섞기보다 피드백 목적에 따라 나눠요. `xcodebuild test -scheme ... -testPlan ...`으로 CI에서도 같은 구성을 재사용할 수 있어요.

code coverage는 실행된 code path의 비율이지 테스트 품질 점수가 아니에요. 높은 숫자를 만들기 위해 의미 없는 assertion을 추가하지 말고, 빠진 boundary와 중요한 실패 경로를 찾는 지도처럼 사용해요.

## flaky test는 production bug와 다르게 다뤄야 해요

같은 commit에서 통과와 실패를 반복하는 테스트를 flaky test라고 해요. 대표 원인은 다음과 같아요.

- 실제 network, 현재 날짜, locale와 random 값에 의존해요.
- 다른 테스트가 남긴 global state와 file을 읽어요.
- parallel test가 같은 singleton이나 database를 동시에 바꿔요.
- `sleep` 뒤 작업이 끝났다고 가정해요.
- callback이 오기 전에 테스트가 종료돼요.

timeout을 늘리거나 실패 시 무조건 재실행하면 증상을 숨길 수 있어요. 외부 입력을 dependency로 만들고, 각 테스트에 고유한 fixture와 저장 공간을 주고, 완료 조건을 직접 기다려요. 병렬 실행이 불가능한 shared resource가 있다면 먼저 격리 구조를 개선하고 정말 필요한 범위만 직렬화해요.

## 네 가지 테스트 도구는 검증 경계가 달라요

| 도구                              | 직접 조작하는 대상                   | 잘 찾는 문제                         | 비용                                                           |
| --------------------------------- | ------------------------------------ | ------------------------------------ | -------------------------------------------------------------- |
| XCTest 단위 테스트                | 함수, 객체와 dependency              | 계산, 상태 전이, 오류 처리           | 빠르지만 UI 연결은 보장하지 않아요.                            |
| [Swift Testing](./swift-testing)  | 함수와 module logic                  | 많은 입력, async logic, 표현식 실패  | UI automation과 XCTest 성능 metric은 대체하지 않아요.          |
| [XCUITest](./xcuitest)            | 실행 중인 앱의 accessibility element | 핵심 사용자 흐름, 화면 연결, 접근성  | 느리고 system state에 민감해요.                                |
| [TCA TestStore](./tca-test-store) | reducer의 action, state와 effect     | TCA feature의 모든 state·effect 단계 | TCA를 사용해야 하며 exhaustive test는 변화에 민감할 수 있어요. |

XCTest는 assertion framework 이름이고 unit test는 검증 범위예요. XCTest로 integration, UI와 performance test도 쓸 수 있고 Swift Testing으로 unit과 integration test를 작성할 수도 있어요.

## 언제 XCTest 단위 테스트를 사용해야 하나요

다음 조건에서 먼저 작성해요.

- 계산, validation과 state transition처럼 UI 없이 호출할 수 있는 행동이 있어요.
- 오류, 빈 값과 boundary를 빠르게 반복 검증해야 해요.
- dependency를 stub이나 fake로 바꿀 수 있어요.
- Objective-C와 XCTest helper가 많은 기존 codebase를 점진적으로 보호해야 해요.
- XCTest performance metric이나 UI testing과 같은 ecosystem을 사용해요.

반대로 실제 화면 연결과 accessibility element를 검증하려면 XCUITest가 필요하고, 여러 component의 실제 조합을 확인하려면 integration test로 경계를 넓혀요. 작은 private method마다 test를 만들기보다 사용자에게 중요한 public behavior부터 보호해요.

## 적용 순서를 정리해요

1. 변경되면 사용자에게 문제가 되는 행동을 한 문장으로 적어요.
2. 그 행동을 가장 작은 code boundary에서 직접 호출할 수 있는지 확인해요.
3. network, clock, database와 random 값을 dependency로 분리해요.
4. Arrange–Act–Assert로 happy path 하나를 작성해요.
5. 오류와 0, 빈 값, 최대값 같은 boundary를 별도 case로 추가해요.
6. async API는 직접 `await`하고 callback만 expectation으로 기다려요.
7. 각 테스트가 독립된 fixture를 만들고 순서 없이 실행되는지 확인해요.
8. 빠른 suite와 느린 integration·UI·performance suite를 test plan으로 나눠요.

## 면접에서 이어질 수 있는 질문

### 단위 테스트의 단위는 함수 하나인가요?

반드시 그렇지 않아요. 외부 환경을 제어한 상태에서 하나의 행동을 빠르고 결정적으로 검증할 수 있는 경계예요. 함수 하나일 수도 있고 dependency를 주입한 객체의 작은 use case일 수도 있어요.

### `setUp`에 모든 fixture를 만들면 좋은가요?

아니요. 중요한 입력이 test method 밖으로 숨고 공유 mutable state가 늘 수 있어요. 반복되는 준비 비용이 의미 있을 때만 사용하고 단순한 값은 각 테스트의 지역 상수로 만드는 편이 읽기 쉽고 격리하기 좋아요.

### async test에서 expectation과 `async/await` 중 무엇을 사용하나요?

production API가 `async`이면 test method도 `async`로 만들고 직접 `await`해요. callback, delegate와 notification처럼 직접 await할 수 없는 event에만 expectation을 사용해요.

### mock 호출 횟수보다 결과를 검증하라는 이유는 무엇인가요?

호출 순서와 private collaboration은 구현을 바꾸면 쉽게 달라져요. 반환값과 final state 같은 observable behavior를 검증하면 구현을 refactoring해도 같은 계약을 유지하는 한 테스트가 통과해요.

### code coverage가 100%면 테스트가 충분한가요?

아니요. coverage는 code가 실행됐다는 뜻이지 결과를 올바르게 검증했다는 뜻은 아니에요. 중요한 boundary, 오류와 사용자 흐름을 assertion했는지 별도로 판단해야 해요.

## 참고 자료

- [Apple Developer — XCTest](https://developer.apple.com/documentation/xctest)
- [Apple Developer — XCTestCase](https://developer.apple.com/documentation/xctest/xctestcase)
- [Apple Developer — Adding tests to your Xcode project](https://developer.apple.com/documentation/xcode/adding-tests-to-your-xcode-project)
- [Apple Developer — Asynchronous Tests and Expectations](https://developer.apple.com/documentation/xctest/asynchronous-tests-and-expectations)
- [Apple Developer — Set Up and Tear Down State in Your Tests](https://developer.apple.com/documentation/xctest/set-up-and-tear-down-state-in-your-tests)
- [Apple Developer — Improving code assessment by organizing tests into test plans](https://developer.apple.com/documentation/xcode/organizing-tests-to-improve-feedback)
- [Apple Developer — Writing and running performance tests](https://developer.apple.com/documentation/xcode/writing-and-running-performance-tests)
- [Swift-KR — Swift로 이해하는 의존성 주입](../design-patterns/dependency-injection)
- [Swift-KR — Swift로 이해하는 Swift Testing](./swift-testing)
- [Swift-KR — Swift로 이해하는 XCUITest](./xcuitest)
- [Swift-KR — Swift로 이해하는 TCA TestStore](./tca-test-store)
