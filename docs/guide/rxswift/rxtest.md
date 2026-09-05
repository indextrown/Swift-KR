---
title: RxTest로 가상 시간 테스트하기
description: TestScheduler, hot·cold Observable, Recorded Event와 Subscription을 사용해 debounce·구독·폐기 시점을 실제 대기 없이 검증하는 방법을 설명합니다.
source: https://github.com/ReactiveX/RxSwift/blob/6.10.2/Documentation/UnitTests.md
reviewed: '2026-09-06'
---

# RxTest로 가상 시간 테스트하기

> **면접 답변 한 줄 요약:** RxTest는 TestScheduler의 가상 시계로 입력 사건과 구독·폐기 시간을 기록해 debounce, retry, timeout 같은 시간 기반 Rx 흐름을 실제 sleep 없이 결정적으로 검증해요.

비동기 테스트에서 실제로 300ms를 기다리면 테스트가 느리고 실행 환경에 따라 흔들릴 수 있어요. RxTest는 시간을 정수 tick으로 표현하고 예약된 사건만 순서대로 실행해 같은 결과를 재현해요.

## RxTest의 핵심 타입

| 타입                       | 역할                                                 |
| -------------------------- | ---------------------------------------------------- |
| `TestScheduler`            | 정수 tick 기반 가상 시간 Scheduler예요.              |
| `Recorded<Event<Element>>` | 특정 시각의 next·error·completed를 기록해요.         |
| `HotObservable`            | 구독 여부와 관계없이 절대 가상 시각에 사건을 보내요. |
| `ColdObservable`           | 각 구독 시점으로부터 상대 시각에 사건을 보내요.      |
| `TestableObserver`         | 받은 Event와 시각을 `events`에 기록해요.             |
| `Subscription`             | source가 구독되고 폐기된 가상 시각을 기록해요.       |

## TestScheduler의 기본 시각

`scheduler.start`의 기본값은 공식 구현에서 다음과 같아요.

| 단계        | 기본 tick |
| ----------- | --------- |
| source 생성 | 100       |
| 구독        | 200       |
| 폐기        | 1000      |

그래서 cold Observable의 `.next(10, value)`는 기본 구독 시각 200을 기준으로 결과에 210으로 기록돼요.

## hot과 cold의 시간을 비교해요

```text
Hot:  절대 시간  ── 100 ── 200(구독) ── 300
Cold: 구독 기준  ────────── 0 ── +10 ── +100
```

- hot은 구독 전 150에 발생한 값도 이미 지나가므로 기본 200 구독에서 받지 못해요.
- cold는 Subscriber마다 구독 시점부터 같은 상대 타임라인을 새로 시작해요.

## map 흐름을 검증해요

```swift
import XCTest
import RxSwift
import RxTest

final class NumberPipelineTests: XCTestCase {
  func testMap() {
    let scheduler = TestScheduler(initialClock: 0)
    let source = scheduler.createHotObservable([
      .next(150, 99),
      .next(210, 1),
      .next(220, 2),
      .completed(230),
    ])

    let result = scheduler.start {
      source.map { $0 * 10 }
    }

    XCTAssertEqual(
      result.events,
      [
        .next(210, 10),
        .next(220, 20),
        .completed(230),
      ]
    )
    XCTAssertEqual(
      source.subscriptions,
      [Subscription(200, 230)]
    )
  }
}
```

값뿐 아니라 `.completed`와 source subscriptions를 함께 검증해요. 그래야 연산자가 값을 맞게 내보내면서 구독을 필요 이상으로 오래 유지하는 문제도 찾을 수 있어요.

## debounce를 실제 대기 없이 테스트해요

```swift
func testDebounce() {
  let scheduler = TestScheduler(initialClock: 0)
  let source = scheduler.createHotObservable([
    .next(210, "R"),
    .next(220, "Rx"),
    .next(260, "RxS"),
    .completed(400),
  ])

  let result = scheduler.start {
    source.debounce(
      .seconds(30),
      scheduler: scheduler
    )
  }

  XCTAssertEqual(
    result.events,
    [
      .next(250, "Rx"),
      .next(290, "RxS"),
      .completed(400),
    ]
  )
}
```

가상 시간 단위에서는 `.seconds(30)`이 TestScheduler converter의 tick 해석을 따라요. 실제 앱의 300ms 값을 그대로 테스트하고 싶다면 Scheduler와 시간 설정을 의존성으로 주입해 제품과 테스트에서 일관된 단위를 사용하세요.

## 직접 Observer를 만들어 여러 입력을 제어해요

```swift
let scheduler = TestScheduler(initialClock: 0)
let observer = scheduler.createObserver(String.self)

let disposable = output
  .subscribe(observer)

scheduler.scheduleAt(10) {
  input.accept("Swift")
}
scheduler.scheduleAt(20) {
  input.accept("RxSwift")
}
scheduler.start()

XCTAssertEqual(
  observer.events.map(\.value.element),
  ["Swift", "RxSwift"].map(Optional.some)
)

disposable.dispose()
```

`scheduler.start { factory }`는 기본 생성·구독·폐기 시점을 자동 관리하고, `createObserver`와 `scheduleAt` 조합은 여러 입력과 특정 dispose 시점을 직접 제어할 때 유용해요.

## 오류와 완료도 값만큼 검증해요

```swift
enum TestError: Error {
  case failed
}

let source = scheduler.createColdObservable([
  .next(10, 1),
  .error(20, TestError.failed),
])
```

`Recorded<Event<T>>`는 종료 사건도 포함해요. 오류 타입이 Equatable이 아니라면 event 패턴을 분해하거나 테스트용 오류를 Equatable하게 설계하세요.

종료되지 않는 시퀀스의 값만 검사할 때는 공식 `XCTAssertRecordedElements` helper를 사용할 수 있어요. 이 helper는 error나 completed 같은 stop event가 있으면 실패하므로 목적을 확인하세요.

## View Model 입력·출력을 테스트해요

```swift
func testLatestQueryWins() {
  let scheduler = TestScheduler(initialClock: 0)
  let query = scheduler.createHotObservable([
    .next(210, "Swift"),
    .next(220, "RxSwift"),
  ])
  let firstResult = scheduler.createColdObservable([
    .next(50, ["old"]),
    .completed(50),
  ])
  let secondResult = scheduler.createColdObservable([
    .next(10, ["new"]),
    .completed(10),
  ])

  let result = scheduler.start {
    query.flatMapLatest { value in
      value == "Swift" ? firstResult : secondResult
    }
  }

  XCTAssertEqual(
    result.events,
    [
      .next(230, ["new"]),
    ]
  )
  XCTAssertEqual(
    firstResult.subscriptions,
    [Subscription(210, 220)]
  )
}
```

최종 값뿐 아니라 첫 요청이 220에 폐기됐는지 검증하면 `flatMapLatest`의 취소 의미까지 확인할 수 있어요.

## 테스트 가능한 설계 기준

- 시간 연산자에 들어갈 Scheduler를 주입해요.
- 네트워크와 저장소는 입력에 따라 cold Observable을 돌려주는 fake로 바꿀 수 있게 해요.
- View Model 출력은 Observable·Driver를 구독할 수 있는 형태로 노출해요.
- 테스트에서 실제 DispatchQueue와 sleep을 섞지 않아요.
- 상태 값뿐 아니라 종료와 source subscription을 검증해요.

## 자주 하는 실수

- 실제 시간을 기다리는 expectation과 TestScheduler를 섞어요.
- hot과 cold의 시간을 같은 의미로 계산해요.
- 기본 구독 시각 200을 잊고 예상 시간을 10으로 적어요.
- next 값만 비교하고 error·completed·dispose를 놓쳐요.
- 제품 코드가 MainScheduler를 내부에 고정해 가상 시간으로 바꾸지 못해요.
- 하나의 TestScheduler에서 테스트 간 상태를 공유해요.

## 적용 체크리스트

- 입력은 hot과 cold 중 실제 의미에 맞나요?
- 절대 시각과 구독 기준 상대 시각을 구분했나요?
- Scheduler 기본 created·subscribed·disposed 시각을 반영했나요?
- 값, 종료 Event, source subscriptions를 함께 검증했나요?
- 실제 sleep 없이 시간 연산을 테스트하나요?
- 각 테스트가 새로운 Scheduler와 독립 상태를 사용하나요?

## 면접에서 이어질 수 있는 질문

### RxTest의 hot Observable과 cold Observable은 무엇이 다른가요?

hot은 Subscriber와 무관한 절대 가상 시각에 사건을 보내고, cold는 각 구독 시점부터 상대 시각으로 같은 사건 시퀀스를 시작해요.

### TestScheduler의 장점은 무엇인가요?

실제 시간을 기다리지 않고 예약된 사건을 즉시 실행해 테스트가 빠르고 결정적이에요. 값뿐 아니라 이벤트 시각과 구독·폐기 시점도 검증할 수 있어요.

## 참고 자료

- [RxSwift Unit Tests 공식 문서](https://github.com/ReactiveX/RxSwift/blob/6.10.2/Documentation/UnitTests.md)
- [TestScheduler 구현](https://github.com/ReactiveX/RxSwift/blob/6.10.2/RxTest/Schedulers/TestScheduler.swift)
- [HotObservable 구현](https://github.com/ReactiveX/RxSwift/blob/6.10.2/RxTest/HotObservable.swift)
- [ColdObservable 구현](https://github.com/ReactiveX/RxSwift/blob/6.10.2/RxTest/ColdObservable.swift)
- [TestableObserver 구현](https://github.com/ReactiveX/RxSwift/blob/6.10.2/RxTest/TestableObserver.swift)
