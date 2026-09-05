---
title: RxBlocking으로 동기 결과 검사하기
description: toBlocking의 timeout과 first·last·single·toArray·materialize 동작을 비교하고 테스트 전용 동기 대기에서 발생할 수 있는 무한 대기와 메인 스레드 교착을 설명합니다.
source: https://github.com/ReactiveX/RxSwift/tree/6.10.2/RxBlocking
reviewed: '2026-09-06'
---

# RxBlocking으로 동기 결과 검사하기

> **면접 답변 한 줄 요약:** RxBlocking은 테스트에서 현재 스레드를 막고 Observable 결과를 동기적으로 꺼내는 도구이며, 완료되지 않는 스트림과 메인 Scheduler 의존 소스에서는 timeout 또는 교착 위험이 있어 제품 코드에 사용하면 안 돼요.

RxBlocking의 공식 `BlockingObservable` 문서도 테스트와 데모에는 유용하지만 일반 제품 앱에는 부적절하다고 설명해요. 비동기 모델을 동기 호출로 숨기기 때문에 사용 범위를 테스트 타깃으로 제한하세요.

## Observable을 BlockingObservable로 바꿔요

```swift
import RxSwift
import RxBlocking

let blocking = Observable.of(1, 2, 3)
  .toBlocking(timeout: 1)
```

`toBlocking(timeout:)` 자체가 바로 기다리는 것은 아니고 blocking 연산자를 제공하는 래퍼를 만들어요. `first`, `last`, `single`, `toArray`, `materialize`를 호출할 때 현재 스레드를 막아요.

timeout이 지나면 `RxError.timeout`을 throw해요. timeout을 생략하면 종료되지 않는 소스에서 무한 대기할 수 있어요.

## blocking 연산자를 비교해요

| 연산자          | 기다리는 조건                               | 반환                                  |
| --------------- | ------------------------------------------- | ------------------------------------- |
| `first()`       | 첫 값 또는 그 전의 종료·오류                | `Element?`                            |
| `last()`        | 전체 시퀀스 종료                            | 마지막 `Element?`                     |
| `single()`      | 전체 결과가 정확히 하나인지 확인            | `Element`                             |
| `single(_:)`    | 조건을 만족하는 결과가 정확히 하나인지 확인 | `Element`                             |
| `toArray()`     | 전체 시퀀스 정상 완료                       | `[Element]`                           |
| `materialize()` | 전체 시퀀스 정상 완료 또는 오류             | `MaterializedSequenceResult<Element>` |

`first()`는 첫 값을 받으면 구독을 폐기할 수 있지만, `last()`와 `toArray()`는 마지막을 알기 위해 완료를 기다려야 해요.

## 배열 결과를 검사해요

```swift
import XCTest
import RxSwift
import RxBlocking

func testFilteredValues() throws {
  let result = try Observable.of(1, 2, 3, 4)
    .filter { $0.isMultiple(of: 2) }
    .toBlocking(timeout: 1)
    .toArray()

  XCTAssertEqual(result, [2, 4])
}
```

값과 순서만 간단히 검사할 때 읽기 쉬워요. 이벤트 시각과 구독·폐기를 검증해야 한다면 RxTest가 더 적합해요.

## first, last, single의 빈 시퀀스 처리가 달라요

```swift
let first = try Observable<Int>
  .empty()
  .toBlocking(timeout: 1)
  .first()

XCTAssertNil(first)
```

`first()`와 `last()`는 빈 시퀀스에서 nil을 반환해요. `single()`은 정확히 한 값이 아니면 `RxError.noElements` 또는 `RxError.moreThanOneElement`를 throw해요.

```swift
XCTAssertThrowsError(
  try Observable.of(1, 2)
    .toBlocking(timeout: 1)
    .single()
)
```

값 하나의 계약을 검증하는 테스트라면 single이 의도를 더 분명히 보여 줘요.

## materialize로 실패 전 값도 확인해요

```swift
enum LoadError: Error {
  case failed
}

let result = Observable.concat(
  .just(1),
  .just(2),
  .error(LoadError.failed)
)
.toBlocking(timeout: 1)
.materialize()

switch result {
case let .completed(elements):
  XCTFail("오류를 기대했지만 완료했어요: \(elements)")
case let .failed(elements, error):
  XCTAssertEqual(elements, [1, 2])
  XCTAssertTrue(error is LoadError)
}
```

`toArray()`는 오류를 throw하므로 오류 전 값 목록을 함께 잃어요. `materialize()`는 정상 완료의 전체 값 또는 실패 전 값과 오류를 함께 반환해 통합 흐름을 자세히 검사할 수 있어요.

## 완료되지 않는 Observable을 주의해요

```swift
let result = try Observable<Int>
  .never()
  .toBlocking(timeout: 0.1)
  .toArray()
```

`never`는 값도 종료도 보내지 않으므로 timeout까지 현재 스레드가 멈춰요. Relay, UI event, 무한 interval에 `last`나 `toArray`를 쓰면 같은 문제가 생겨요.

무한 스트림의 일부만 검사하려면 `take`로 테스트 경계를 만든 뒤 완료시키거나 RxTest로 가상 시간과 dispose를 검증하세요.

```swift
let values = try updates
  .take(3)
  .toBlocking(timeout: 1)
  .toArray()
```

## 메인 스레드 교착을 피해야 해요

다음 조건이 동시에 성립하면 교착 또는 timeout이 발생할 수 있어요.

1. 테스트가 메인 스레드에서 `toBlocking`으로 현재 스레드를 막아요.
2. source가 `observe(on: MainScheduler.instance)` 뒤 이벤트를 보내려고 해요.
3. 메인 스레드는 blocking 호출이 끝나기를 기다려 예약된 이벤트를 실행하지 못해요.

```text
Main Thread: toBlocking 대기 ─────────────┐
                                          │
MainScheduler event: 메인 실행 대기 ◀─────┘
```

해결을 위해 제품 코드를 억지로 다른 Scheduler로 바꾸기보다 RxTest로 Scheduler를 주입하거나 async 테스트로 경계를 유지하세요.

## RxTest와 선택 기준

| 요구사항                           | 선택                     |
| ---------------------------------- | ------------------------ |
| 값 배열 하나를 간단히 동기 검증    | RxBlocking               |
| debounce·retry·timeout의 시각 검증 | RxTest                   |
| hot·cold 구독과 dispose 시각 검증  | RxTest                   |
| 실패 전 값과 종료 오류를 함께 검사 | RxBlocking `materialize` |
| MainScheduler 기반 UI Trait 테스트 | Scheduler 주입과 RxTest  |
| async API의 결과 하나를 검사       | XCTest async 테스트      |

RxBlocking은 간단하지만 비동기 구조를 숨겨요. 테스트 요구가 커지면 RxTest의 기록 기반 검증으로 옮기는 편이 좋아요.

## 자주 하는 실수

- 제품 코드에서 비동기 값을 동기 반환하려고 RxBlocking을 사용해요.
- timeout을 생략하고 끝나지 않는 Relay를 기다려요.
- MainScheduler가 필요한 source를 메인 스레드에서 block해요.
- `last`와 `toArray`가 완료 이벤트를 필요로 한다는 점을 놓쳐요.
- 이벤트 시간과 폐기까지 검증해야 하는 테스트에 값 배열만 비교해요.
- `single()`이 첫 값을 반환한다고 오해해요.

## 적용 체크리스트

- RxBlocking이 테스트 타깃에만 연결됐나요?
- 모든 blocking 호출에 합리적인 timeout이 있나요?
- source가 유한하게 완료되는지 확인했나요?
- source가 현재 막고 있는 Scheduler를 필요로 하지 않나요?
- 값 개수에 맞는 first·last·single·toArray를 골랐나요?
- 시간과 구독 수명 검증에는 RxTest를 사용했나요?

## 면접에서 이어질 수 있는 질문

### RxBlocking을 제품 코드에 쓰면 안 되는 이유는 무엇인가요?

현재 스레드를 막아 응답성과 동시성을 해치고, source가 같은 Scheduler를 필요로 하면 교착을 만들 수 있어요. 비동기 취소와 구조화된 수명도 호출부에서 보이지 않게 돼요.

### `single()`과 `first()`의 차이는 무엇인가요?

first는 첫 값을 받으면 반환하고 빈 시퀀스에서는 nil이에요. single은 전체 시퀀스에서 값이 정확히 하나인지 확인하며 0개나 2개 이상이면 오류를 throw해요.

## 참고 자료

- [RxBlocking 공식 소스](https://github.com/ReactiveX/RxSwift/tree/6.10.2/RxBlocking)
- [BlockingObservable 구현](https://github.com/ReactiveX/RxSwift/blob/6.10.2/RxBlocking/BlockingObservable.swift)
- [Blocking 연산자 구현](https://github.com/ReactiveX/RxSwift/blob/6.10.2/RxBlocking/BlockingObservable%2BOperators.swift)
- [toBlocking 구현](https://github.com/ReactiveX/RxSwift/blob/6.10.2/RxBlocking/ObservableConvertibleType%2BBlocking.swift)
- [Unit Tests 공식 문서](https://github.com/ReactiveX/RxSwift/blob/6.10.2/Documentation/UnitTests.md)
