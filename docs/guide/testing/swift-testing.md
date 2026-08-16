---
title: Swift로 이해하는 Swift Testing
description: Swift Testing의 @Test·@Suite, #expect·#require, parameterized test, trait, tag, async confirmation과 XCTest 전환 기준을 설명합니다.
pageType: doc-wide
outline: false
---

# Swift로 이해하는 Swift Testing

> **면접 답변 한 줄 요약:** Swift Testing은 macro로 test와 expectation을 선언하고 parameterization, trait와 기본 병렬 실행을 Swift 언어 기능에 맞게 제공해서, unit·integration test를 적은 반복 코드와 자세한 실패 정보로 작성하게 하는 framework예요.

XCTest에서는 `XCTestCase`를 상속하고 `test`로 시작하는 method를 만들어요. Swift Testing에서는 상속과 이름 규칙 대신 `@Test`, `@Suite`, `#expect` 같은 macro로 의도를 직접 표시해요.

```swift
import Testing

@Test
func halfProgress() {
  let goal = ReadingGoal(dailyMinutes: 30)

  #expect(goal.progress(completedMinutes: 15) == 0.5)
}
```

코드가 짧아진 것보다 중요한 변화는 test가 **일반 Swift 함수와 타입**에 가까워졌다는 점이에요. parameter를 받는 test function을 여러 입력으로 실행하고, trait로 실행 조건과 metadata를 선언하며, Swift concurrency를 기본 실행 모델로 사용해요.

이 문서에서는 Xcode 16과 Swift 6에서 함께 제공되기 시작한 Swift Testing을 기준으로 다음 내용을 배워요.

- `@Test`, `@Suite`와 test discovery
- `#expect`와 `#require`의 실패 흐름
- throws와 optional을 검증하는 방법
- parameterized test로 입력 조합을 표현하는 방법
- trait, tag와 test plan의 역할 차이
- 기본 병렬 실행과 shared state 격리
- async test와 `confirmation`
- XCTest와 함께 사용하고 점진적으로 옮기는 기준

## 먼저 알아둘 Swift Testing 용어

| 용어               | 쉬운 뜻                                                                                                                                                          |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| macro              | source code를 분석해 compiler가 추가 code를 만드는 Swift 기능이에요. `@Test`는 test declaration을 등록하고 `#expect`는 expression의 부분값을 실패 정보에 남겨요. |
| test function      | `@Test`가 붙은 Swift 함수예요. 이름이 `test`로 시작하거나 class method일 필요가 없어요.                                                                          |
| suite              | 관련 test function을 담은 type이나 type hierarchy예요. `@Suite`로 display name과 trait를 추가할 수 있어요.                                                       |
| expectation        | 실제 expression이 기대 조건을 만족하는지 검사한 결과예요. `#expect`와 `#require`가 만들어요.                                                                     |
| trait              | test나 suite의 실행 방식, 조건과 metadata를 선언하는 값이에요. `.enabled`, `.serialized`, `.tags`가 대표적이에요.                                                |
| tag                | 서로 다른 suite에 있는 test를 하나의 목적별 그룹으로 선택할 수 있게 붙이는 metadata예요.                                                                         |
| parameterized test | 같은 test logic을 여러 argument로 반복 실행하고 argument마다 독립적인 결과를 만드는 test예요.                                                                    |
| confirmation       | 직접 `await`할 수 없는 callback event가 정해진 횟수만큼 발생했는지 확인하는 Swift Testing API예요.                                                               |

## `@Test`는 이름 규칙 대신 의도를 선언해요

같은 독서 목표 type을 검증해 볼게요.

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

test function은 global function이나 type의 instance/static function으로 만들 수 있어요.

```swift
import Testing

@Test
func halfOfGoalReturnsHalfProgress() {
  let goal = ReadingGoal(dailyMinutes: 30)

  let progress = goal.progress(completedMinutes: 15)

  #expect(progress == 0.5)
}
```

함수 이름은 `test...`일 필요가 없고 sync, async, throws와 generic function처럼 Swift의 일반 함수 기능을 사용할 수 있어요. `@Test("목표의 절반을 계산해요")`처럼 test report에 보일 display name을 따로 줄 수도 있어요.

```swift
@Test("목표를 초과해도 진행률은 100%예요")
func clampsProgress() {
  let goal = ReadingGoal(dailyMinutes: 30)

  #expect(goal.progress(completedMinutes: 50) == 1)
}
```

Apple의 [Defining test functions](https://developer.apple.com/documentation/testing/definingtests)에서 test declaration과 지원하는 function 형태를 확인할 수 있어요.

## `#expect`는 expression의 어느 값이 달랐는지 보여 줘요

`#expect`는 Boolean expression을 그대로 받아요.

```swift
let completedMinutes = 15
let goal = ReadingGoal(dailyMinutes: 30)

#expect(
  goal.progress(completedMinutes: completedMinutes) == 0.5,
  "15분은 30분 목표의 절반이어야 해요."
)
```

macro는 `XCTAssertTrue`처럼 최종 Boolean만 보는 것이 아니라 왼쪽 계산 결과와 오른쪽 기대값을 분석해 실패 report에 보여 줄 수 있어요. custom message는 실패가 무엇을 의미하는지 domain 맥락을 더할 때 사용하고, code를 그대로 다시 읽는 문장은 반복하지 않아요.

`#expect`가 실패해도 test function은 다음 줄을 계속 실행해 추가 issue를 기록해요. 뒤 검증에 반드시 필요한 값이면 `#require`를 사용해요.

## `#require`는 실패하면 현재 흐름을 중단해요

optional을 먼저 벗겨야 이후 property를 안전하게 확인할 수 있어요.

```swift
struct ReadingSession {
  let title: String
  let minutes: Int
}

@Test
func firstSessionHasPositiveMinutes() throws {
  let sessions = [
    ReadingSession(title: "Swift", minutes: 20),
  ]

  let first = try #require(sessions.first)

  #expect(first.title == "Swift")
  #expect(first.minutes > 0)
}
```

`#require`는 조건이 false이거나 optional이 `nil`이면 `ExpectationFailedError`를 던져 현재 test를 멈춰요. 그래서 호출하는 test function을 `throws`로 선언해요.

| API        | 실패 뒤 흐름                    | 알맞은 상황                                                            |
| ---------- | ------------------------------- | ---------------------------------------------------------------------- |
| `#expect`  | 다음 검증을 계속해요.           | 서로 독립적인 여러 결과를 한 행동에서 확인해요.                        |
| `#require` | 오류를 던져 현재 흐름을 멈춰요. | optional value나 선행 조건 없이는 뒤 코드를 안전하게 실행할 수 없어요. |

실패 뒤 crash할 수 있는 force unwrap을 남기기보다 `#require`로 선행 조건을 문서화해요.

## throws는 예상하지 않은 오류와 예상한 오류를 나눠요

성공 경로에서 오류가 발생하면 안 되는 호출은 test function 밖으로 바로 던져도 돼요.

```swift
@Test
func loadsSavedMinutes() async throws {
  let repository = StubReadingRepository(result: .success(20))

  let minutes = try await repository.fetchCompletedMinutes()

  #expect(minutes == 20)
}
```

오류 자체가 기대 행동이면 `#expect(throws:)`를 사용해요.

```swift
enum ReadingError: Error, Equatable {
  case offline
}

@Test
func offlineRepositoryThrowsOfflineError() async {
  let repository = StubReadingRepository(
    result: .failure(.offline)
  )

  await #expect(throws: ReadingError.offline) {
    _ = try await repository.fetchCompletedMinutes()
  }
}
```

`#expect(throws:)`는 예상한 error type이나 value를 검증하고, 일치하면 error를 반환해서 추가 property도 확인할 수 있어요. 아무 error나 발생하면 통과시키기보다 domain error를 구체적으로 선언해요.

## `@Suite`는 관련 test와 공통 trait를 묶어요

Swift Testing에서 test function을 포함하는 type은 suite가 될 수 있어요. `@Suite`를 붙이면 display name과 trait를 명시할 수 있어요.

```swift
import Testing

@Suite("독서 목표 진행률")
struct ReadingGoalTests {
  @Test
  func halfProgress() {
    let goal = ReadingGoal(dailyMinutes: 30)
    #expect(goal.progress(completedMinutes: 15) == 0.5)
  }

  @Test
  func overGoalProgress() {
    let goal = ReadingGoal(dailyMinutes: 30)
    #expect(goal.progress(completedMinutes: 50) == 1)
  }
}
```

상속 hierarchy 대신 struct, enum, actor와 class를 사용할 수 있고 suite 안에 nested suite를 둘 수도 있어요. test report의 구조와 production domain의 구조를 비슷하게 유지하면 관련 실패를 찾기 쉬워요.

공통 fixture를 suite의 mutable stored property로 공유하면 병렬 실행에서 경쟁이 생길 수 있어요. 각 test에서 지역 fixture를 만들거나 immutable value를 suite property로 둬요. resource 생명주기가 필요하면 trait와 dependency를 검토하고 global singleton을 reset하는 방식은 피하세요.

## parameterized test는 같은 계약을 여러 입력에 적용해요

XCTest에서 경계값마다 method를 만들면 준비와 assertion이 반복돼요. Swift Testing은 `arguments`에 collection을 전달해 test function의 parameter로 하나씩 실행해요.

```swift
struct ProgressCase: Sendable, CustomTestStringConvertible {
  let completedMinutes: Int
  let expected: Double

  var testDescription: String {
    "\(completedMinutes)분 → \(expected)"
  }
}

@Test(
  "진행률 경계값",
  arguments: [
    ProgressCase(completedMinutes: -10, expected: 0),
    ProgressCase(completedMinutes: 0, expected: 0),
    ProgressCase(completedMinutes: 15, expected: 0.5),
    ProgressCase(completedMinutes: 30, expected: 1),
    ProgressCase(completedMinutes: 50, expected: 1),
  ]
)
func progressBoundary(testCase: ProgressCase) {
  let goal = ReadingGoal(dailyMinutes: 30)

  #expect(
    goal.progress(
      completedMinutes: testCase.completedMinutes
    ) == testCase.expected
  )
}
```

각 argument는 test report에서 독립 case로 나타나므로 실패한 입력만 다시 실행할 수 있어요. `CustomTestStringConvertible`로 report에 보일 설명을 domain 중심으로 바꿨어요.

두 collection을 `arguments: first, second`로 전달하면 모든 조합의 Cartesian product가 만들어져요. 위치가 같은 값끼리만 묶으려면 `zip`을 사용해요.

```swift
@Test(
  arguments: zip(
    [0, 15, 30],
    [0.0, 0.5, 1.0]
  )
)
func progressPair(
  completedMinutes: Int,
  expected: Double
) {
  let goal = ReadingGoal(dailyMinutes: 30)
  #expect(
    goal.progress(completedMinutes: completedMinutes)
      == expected
  )
}
```

argument가 너무 많아 case별 의도가 사라지면 여러 test로 다시 나눠요. parameterization은 서로 같은 계약과 실행 흐름을 가진 입력에만 사용해요.

## trait는 test의 실행 조건과 metadata를 code에 둬요

trait는 `@Test`나 `@Suite`의 argument로 전달해요.

```swift
@Test(
  "동기화 기능이 켜졌을 때 실행해요",
  .enabled(if: FeatureFlags.readingSync),
  .timeLimit(.minutes(1))
)
func syncReading() async throws {
  // 동기화 행동을 검증해요.
}
```

대표 trait의 역할은 다음과 같아요.

| trait                             | 역할                                                |
| --------------------------------- | --------------------------------------------------- |
| `.enabled(if:)`, `.disabled(if:)` | runtime 조건에 따라 실행 여부를 결정해요.           |
| `.tags(...)`                      | 목적별로 test를 검색하고 선택할 metadata를 붙여요.  |
| `.serialized`                     | 해당 test나 suite 범위의 case를 직렬로 실행해요.    |
| `.timeLimit(...)`                 | 너무 오래 실행되는 test를 timeout issue로 기록해요. |
| `.bug(...)`                       | test와 issue tracker의 bug 정보를 연결해요.         |

조건부 disable을 실패 회피 용도로 남발하지 않아요. 환경이 없어서 실행할 수 없는 조건인지, 실제 bug를 숨기는 것인지 구분해요. 알려진 bug는 `withKnownIssue`처럼 의도를 기록하고 수정 계획과 연결해요.

## tag는 파일 위치와 다른 관점으로 test를 묶어요

같은 기능의 test가 여러 suite에 흩어져 있어도 `fast`, `database`, `critical` 같은 공통 목적을 붙일 수 있어요.

```swift
extension Tag {
  @Tag static var critical: Self
  @Tag static var database: Self
}

@Test(.tags(.critical))
func calculatesDailyProgress() {
  let goal = ReadingGoal(dailyMinutes: 30)
  #expect(goal.progress(completedMinutes: 30) == 1)
}
```

suite는 source structure와 ownership을 나타내고 tag는 실행 선택 관점을 나타내요. feature별 suite 안에 있는 여러 test에 `critical` tag를 붙여 pull request에서 빠르게 실행할 수 있어요.

test plan은 Xcode에서 target, configuration, locale, sanitizer와 반복 횟수 같은 실행 환경을 정해요. tag는 source 안의 test metadata예요. 둘을 함께 사용해 “PR plan에서 critical tag test를 선택”하는 식으로 feedback path를 만들어요.

## Swift Testing은 기본적으로 test를 병렬 실행해요

Apple의 [Swift Testing](https://developer.apple.com/xcode/swift-testing/) 소개는 test가 기본적으로 병렬 실행된다고 설명해요. 순서에 의존하거나 같은 global state를 바꾸는 test는 실행마다 다른 결과를 낼 수 있어요.

```swift
// 피해야 할 공유 상태예요.
enum SharedFixture {
  static var completedMinutes = 0
}
```

다음 방법을 먼저 적용해요.

1. 각 test가 자기 SUT와 fixture를 만들어요.
2. 임시 file과 database 이름에 고유 ID를 사용해요.
3. clock, random, locale와 network를 dependency로 전달해요.
4. mutable global과 singleton reset을 없애요.
5. actor를 사용했다면 test에서 완료를 `await`해요.

외부 resource 때문에 정말 병렬 실행할 수 없다면 가장 작은 suite에 `.serialized`를 적용해요.

```swift
@Suite(.serialized)
struct LegacyDatabaseTests {
  // 이 suite의 test는 서로 직렬로 실행돼요.
}
```

`.serialized`는 경쟁 원인을 해결하지 않고 실행 순서만 제한해요. 새 test에는 격리된 저장 공간을 제공하고 legacy resource를 바꿀 수 없는 경우에만 제한적으로 사용해요.

## `async` 함수는 직접 await해요

Swift Testing은 Swift concurrency와 통합돼요.

```swift
@Test
func loadsReadingMinutes() async throws {
  let repository = StubReadingRepository(
    result: .success(20)
  )

  let minutes = try await repository.fetchCompletedMinutes()

  #expect(minutes == 20)
}
```

main actor에 격리된 ViewModel을 테스트하면 test나 suite에도 `@MainActor`를 붙여요.

```swift
@MainActor
@Test
func loadsDashboard() async throws {
  let model = ReadingDashboardModel(
    repository: StubReadingRepository(
      result: .success(20)
    )
  )

  try await model.load()

  #expect(model.completedMinutes == 20)
}
```

actor isolation을 맞추기 위해 `MainActor.run`을 여기저기 넣기보다 SUT가 요구하는 actor를 test declaration에 명시해요.

## callback event는 `confirmation`으로 횟수를 확인해요

직접 await할 수 없는 callback, delegate와 event handler에는 `confirmation`을 사용해요.

```swift
@Test
func legacyLoaderCallsCompletionOnce() async {
  let loader = LegacyReadingLoader()

  await confirmation(
    "독서 시간을 한 번 전달해요",
    expectedCount: 1
  ) { completed in
    loader.load { minutes in
      #expect(minutes == 20)
      completed()
    }

    await loader.waitUntilFinished()
  }
}
```

`confirmation`은 전달한 operation closure가 끝날 때 호출 횟수를 확인해요. XCTest expectation처럼 임의 timeout 동안 event를 기다리는 장치라고 생각하면 안 돼요. callback 작업이 끝나는 시점을 production API에서 await할 수 있게 만들거나 callback을 async adapter로 감싸는 것이 먼저예요.

Apple의 [Testing asynchronous code](https://developer.apple.com/documentation/testing/testing-asynchronous-code)는 직접 await할 수 있는 함수는 standard concurrency로 검증하고, 그럴 수 없는 event에 confirmation을 사용하도록 안내해요.

## Swift Testing과 XCTest는 같은 target에서 함께 실행할 수 있어요

Xcode는 하나의 test target에서 두 framework를 함께 build하고 실행할 수 있어요.

```swift
import Testing
import XCTest
```

기존 XCTest suite를 한 번에 바꾸지 않아도 돼요. 새 unit test는 Swift Testing으로 작성하고, 수정하는 XCTest부터 옮길 수 있어요.

| XCTest                  | Swift Testing                                    |
| ----------------------- | ------------------------------------------------ |
| `class ...: XCTestCase` | 일반 `struct`, `class`, `actor`, global function |
| `func testProgress()`   | `@Test func progress()`                          |
| `XCTAssertEqual(a, b)`  | `#expect(a == b)`                                |
| `XCTUnwrap(value)`      | `#require(value)`                                |
| `XCTestExpectation`     | 직접 `async/await`, 필요한 경우 `confirmation`   |
| test method 여러 개     | `@Test(arguments:)` parameterization             |
| class setup/teardown    | 각 test의 지역 fixture, suite와 custom trait     |

Apple의 [Migrating a test from XCTest](https://developer.apple.com/documentation/testing/migratingfromxctest)은 두 framework의 interoperability와 assertion, known issue, expectation 전환 방법을 설명해요.

## XCTest를 바로 대체하지 않는 영역도 있어요

Swift Testing은 unit과 integration test에 적합하지만 현재 Apple platform에서 다음 영역은 XCTest가 중심이에요.

- XCUIAutomation으로 실제 앱 UI를 조작하는 UI test
- `XCTMetric`과 baseline을 사용하는 performance test
- Objective-C test와 오래된 XCTest helper에 깊게 연결된 suite
- XCTest observation, attachment나 특수 API에 의존하는 infrastructure

따라서 framework 선택보다 검증할 경계를 먼저 정해요. 새 logic test는 Swift Testing, [UI workflow는 XCUITest](./xcuitest), performance regression은 XCTest measurement처럼 한 project에서 함께 사용할 수 있어요.

## 자주 생기는 오해를 정리해요

### 모든 입력을 하나의 parameterized test에 넣어요

실행 흐름과 기대 행동이 같은 input만 묶어요. 인증 오류와 형식 validation처럼 setup과 결과 의미가 다르면 별도 test로 이름을 드러내요.

### `.serialized`로 flaky test를 해결해요

병렬 실행에서만 드러난 global state 경쟁을 숨길 수 있어요. fixture와 resource를 격리한 뒤 불가피한 legacy 경계에만 적용해요.

### `confirmation`이 XCTest expectation처럼 기다려 줄 것이라 생각해요

confirmation은 operation이 반환되기 전에 발생한 event를 확인해요. 완료 신호 없이 background task만 시작하고 closure가 끝나면 event를 놓칠 수 있어요. 가능한 API를 `async`로 바꾸고 직접 await해요.

### `#expect`를 여러 줄의 production logic처럼 작성해요

expectation 안에 계산과 side effect가 섞이면 실패 원인을 읽기 어려워요. Act 결과를 지역 상수로 만든 뒤 단순한 비교 expression으로 검증해요.

### 기존 XCTest를 모두 변환해야 도입할 수 있어요

두 framework는 side by side로 실행돼요. 새 test와 변경이 잦은 suite부터 옮기고 UI·performance test는 XCTest에 유지해요.

## 언제 Swift Testing을 사용해야 하나요

다음 조건에서 좋은 기본 선택이에요.

- Swift로 새 unit·integration test를 작성해요.
- 같은 계약을 여러 argument로 검증해야 해요.
- async/await와 actor isolation을 자연스럽게 사용하고 싶어요.
- tag와 trait로 실행 조건과 metadata를 source에 가까이 두고 싶어요.
- XCTest codebase에 새 test부터 점진적으로 도입해요.

Objective-C 중심 target, UI automation, XCTest performance metric 또는 XCTest-specific infrastructure가 핵심이면 XCTest를 유지해요. framework를 섞는 비용보다 실제 feedback 품질이 좋아지는 범위부터 옮겨요.

## 적용 순서를 정리해요

1. Xcode와 Swift toolchain이 `Testing` module을 제공하는지 확인해요.
2. 새 test file에서 `import Testing`과 `@testable import`를 설정해요.
3. 가장 작은 행동을 `@Test`와 `#expect`로 검증해요.
4. 뒤 검증의 전제인 optional과 조건은 `#require`로 바꿔요.
5. 같은 계약의 경계값은 parameterized test로 모아요.
6. suite는 source 구조, tag는 실행 목적에 맞게 구성해요.
7. 병렬 실행에서도 각 test의 fixture와 resource가 독립적인지 확인해요.
8. async API는 직접 await하고 callback event만 confirmation으로 확인해요.
9. XCTest suite는 새 test와 변경하는 test부터 점진적으로 옮겨요.

## 면접에서 이어질 수 있는 질문

### `#expect`와 `#require`는 어떻게 다른가요?

`#expect`는 실패를 기록하고 다음 줄을 계속 실행해요. `#require`는 실패하면 오류를 던져 현재 test 흐름을 멈추고 optional을 안전하게 unwrap하는 데도 사용할 수 있어요.

### parameterized test의 장점은 무엇인가요?

같은 계약을 여러 argument에 적용하면서 setup과 assertion 중복을 줄여요. 각 argument가 독립 test case로 보고되므로 실패한 입력만 찾고 다시 실행할 수 있어요.

### Swift Testing test가 flaky해지는 대표 원인은 무엇인가요?

기본 병렬 실행 상태에서 global mutable state, 같은 file이나 database를 공유하는 것이 대표 원인이에요. `.serialized`부터 붙이기보다 각 test의 dependency와 resource를 격리해야 해요.

### XCTest를 모두 Swift Testing으로 바꿔야 하나요?

아니요. 같은 test target에서 함께 실행할 수 있어 점진적으로 옮길 수 있어요. UI automation과 XCTest performance metric처럼 아직 XCTest가 담당하는 영역도 유지해야 해요.

### suite와 tag는 어떻게 다른가요?

suite는 test를 source hierarchy로 묶는 구조이고 tag는 서로 다른 suite를 공통 실행 목적으로 선택하는 metadata예요. 예를 들어 feature별 suite의 핵심 test에 모두 `critical` tag를 붙일 수 있어요.

## 참고 자료

- [Apple Developer — Swift Testing](https://developer.apple.com/xcode/swift-testing/)
- [Apple Developer — Testing framework](https://developer.apple.com/documentation/testing)
- [Apple Developer — Defining test functions](https://developer.apple.com/documentation/testing/definingtests)
- [Apple Developer — Expectations and confirmations](https://developer.apple.com/documentation/testing/expectations)
- [Apple Developer — Implementing parameterized tests](https://developer.apple.com/documentation/testing/parameterizedtesting)
- [Apple Developer — Traits](https://developer.apple.com/documentation/testing/traits)
- [Apple Developer — Testing asynchronous code](https://developer.apple.com/documentation/testing/testing-asynchronous-code)
- [Apple Developer — Migrating a test from XCTest](https://developer.apple.com/documentation/testing/migratingfromxctest)
- [Swift Testing — Official GitHub repository](https://github.com/swiftlang/swift-testing)
- [Swift Evolution Vision — A New Direction for Testing in Swift](https://github.com/swiftlang/swift-evolution/blob/main/visions/swift-testing.md)
- [Swift-KR — Swift로 이해하는 XCTest 단위 테스트](./xctest-unit-testing)
- [Swift-KR — Swift로 이해하는 XCUITest](./xcuitest)
- [Swift-KR — Swift로 이해하는 TCA TestStore](./tca-test-store)
