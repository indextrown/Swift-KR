---
title: RxSwift 연산자 — 선택·집계·시간
description: element, first, single, skip, take, buffer, window, debounce, throttle, delay, timeout으로 필요한 값과 전달 시점을 제어하는 방법을 설명합니다.
---

# RxSwift 연산자 — 선택·집계·시간

> **면접 답변 한 줄 요약:** 선택 연산자는 필요한 위치·조건·구간의 값만 남기고, 집계 연산자는 완료 시 결과를 모으며, 시간 연산자는 Scheduler를 기준으로 값의 전달 빈도와 종료 시점을 제어해요.

이 페이지의 연산자는 값의 개수와 종료 시점을 크게 바꿀 수 있어요. 끝나지 않는 Observable에 완료가 필요한 집계 연산자를 사용하면 결과도 나오지 않는다는 점부터 확인하세요.

## 위치와 개수로 값을 선택해요

<!-- rxswift-operator: element -->

### `element(at:)`

0부터 시작하는 지정 위치의 값 하나를 보내고 정상 완료해요. 해당 위치 전에 원본이 완료하면 `RxError.argumentOutOfRange`로 실패해요.

```swift
Observable.of("A", "B", "C")
  .element(at: 1)
// B
```

<!-- rxswift-operator: first -->

### `first()`

첫 값 하나를 `Single<Element?>`로 보내요. 원본이 값 없이 정상 완료하면 `nil`을 보내고, 원본 오류는 그대로 전달해요.

```swift
let firstName: Single<String?> = names.first()
```

값이 반드시 하나 있어야 한다면 `take(1)`보다 계약이 명확한 `asSingle` 또는 도메인 API의 `Single`을 검토하세요.

<!-- rxswift-operator: single -->

### `single()`과 `single(_:)`

원본이 정상 완료할 때 값이 정확히 하나면 그 값을 보내요. 값이 없으면 `RxError.noElements`, 둘 이상이면 `RxError.moreThanOneElement`로 실패해요.

```swift
Observable.just("한 개")
  .single()
```

조건 오버로드는 조건에 맞는 값이 정확히 하나인지 검사해요.

```swift
Observable.of(1, 2, 3)
  .single { $0.isMultiple(of: 2) }
// 2
```

`first`는 첫 값을 찾으면 끝낼 수 있지만, `single`은 두 번째 일치 값이 없는지 확인해야 하므로 원본 완료까지 검사해요.

<!-- rxswift-operator: skip -->

### `skip(...)`

시작 부분을 여러 기준으로 버려요.

| 오버로드                     | 동작                                                            |
| ---------------------------- | --------------------------------------------------------------- |
| `skip(count)`                | 처음 지정한 개수의 값을 버려요.                                 |
| `skip(duration, scheduler:)` | 구독 뒤 지정한 시간 동안 도착한 값을 버려요.                    |
| `skip(while:)`               | 조건이 참인 시작 구간을 버리고, 처음 거짓인 값부터 모두 보내요. |
| `skip(until:)`               | 다른 Observable이 값을 보낼 때까지 원본 값을 버려요.            |

```swift
Observable.of(1, 2, 5, 1)
  .skip(while: { $0 < 5 })
// 5, 1
```

전체 시퀀스에서 조건에 맞지 않는 값을 계속 버리려면 `filter`를 사용해요.

<!-- rxswift-operator: take -->

### `take(...)`

시작 부분에서 값을 가져오고 조건이 충족되면 정상 완료해요.

| 오버로드                | 동작                                                     |
| ----------------------- | -------------------------------------------------------- |
| `take(count)`           | 처음 지정한 개수만 보내요.                               |
| `take(for:scheduler:)`  | 구독 뒤 지정한 시간 동안 온 값만 보내요.                 |
| `take(until: other)`    | 다른 Observable이 값을 보내기 전까지만 원본 값을 보내요. |
| `take(while:behavior:)` | 조건이 참인 동안 보내요.                                 |
| `take(until:behavior:)` | 조건이 참이 되는 지점까지 보내요.                        |

`TakeBehavior.exclusive`는 조건을 깨거나 만족시킨 경계 값을 제외하고, `.inclusive`는 그 값도 포함해요.

```swift
Observable.of(1, 2, 5, 1)
  .take(while: { $0 < 5 }, behavior: .inclusive)
// 1, 2, 5
```

화면 객체 해제 신호나 취소 버튼 Observable을 `take(until:)`에 연결하면 구독 수명을 선언적으로 제한할 수 있어요.

<!-- rxswift-operator: takeLast -->

### `takeLast(_:)`

원본이 정상 완료할 때 마지막 N개 값을 원래 순서대로 보내요.

```swift
Observable.of(1, 2, 3, 4)
  .takeLast(2)
// 정상 완료 뒤 3, 4
```

끝나지 않는 Observable에서는 값을 내보내지 않고, N개 값을 내부에 보관하므로 메모리 비용도 고려해야 해요.

## 값을 앞에 붙이거나 빈 결과를 바꿔요

<!-- rxswift-operator: startWith -->

### `startWith(_:)`

원본을 구독해 값을 받기 전에 나열한 초기값을 먼저 보내요.

```swift
searchResults
  .startWith([])
```

현재 상태를 저장하고 새 Observer에게 재생해야 하는 요구라면 `BehaviorSubject`, `BehaviorRelay`, `share(replay:)`와 의미를 비교하세요.

<!-- rxswift-operator: ifEmpty -->

### `ifEmpty(default:)`와 `ifEmpty(switchTo:)`

원본이 값 없이 정상 완료했을 때 대체 결과를 만들어요.

```swift
Observable<String>.empty()
  .ifEmpty(default: "결과 없음")
```

`switchTo` 오버로드는 대체 Observable로 전환해요.

```swift
remoteResults
  .ifEmpty(switchTo: cachedResults)
```

원본이 오류로 끝나면 빈 결과가 아니므로 대체하지 않고 오류를 전달해요. 오류 복구는 `catch`를 사용하세요.

## 완료 뒤 전체 결과를 받아요

<!-- rxswift-operator: toArray -->

### `toArray()`

원본의 모든 값을 배열에 모으고 정상 완료할 때 `Single<[Element]>` 하나를 보내요.

```swift
let all: Single<[Int]> = Observable
  .of(1, 2, 3)
  .toArray()
```

끝나지 않거나 값이 매우 많은 Observable에서는 결과가 나오지 않거나 메모리가 커질 수 있어요. 일부씩 처리하려면 `buffer`를 사용하세요.

<!-- rxswift-operator: ignoreElements -->

### `ignoreElements()`

모든 `.next` 값을 버리고 오류와 정상 완료만 전달하는 `Observable<Never>`를 반환해요.

```swift
let completionOnly = saveProgress
  .ignoreElements()
```

작업 결과 값은 필요 없고 종료만 다음 흐름에 연결할 때 사용해요. `Completable` 타입 계약이 필요하면 `asCompletable()`로 변환하세요.

## 값을 배열이나 작은 Observable로 묶어요

<!-- rxswift-operator: buffer -->

### `buffer(timeSpan:count:scheduler:)`

지정한 시간이나 개수 중 먼저 충족한 기준마다 값을 배열로 묶어 보내요.

```swift
events
  .buffer(
    timeSpan: .seconds(1),
    count: 20,
    scheduler: MainScheduler.instance
  )
  .subscribe(onNext: { batch in
    print("일괄 처리:", batch)
  })
```

빠른 이벤트를 일괄 처리해 Observer 호출 횟수를 줄일 수 있어요. 배열을 만드는 동안 메모리가 필요하고 처리 지연이 생겨요.

<!-- rxswift-operator: window -->

### `window(timeSpan:count:scheduler:)`

`buffer`와 같은 시간·개수 기준으로 나누지만 배열 대신 각 구간을 `Observable<Element>`로 보내요.

```swift
events
  .window(
    timeSpan: .seconds(1),
    count: 20,
    scheduler: MainScheduler.instance
  )
  .flatMap { window in
    window.reduce(0) { count, _ in count + 1 }
  }
```

구간 내부도 연산자로 처리하거나 값이 도착하는 즉시 소비하고 싶을 때 사용해요. 바깥 Observable과 각 window의 구독·종료 수명을 함께 추적해야 해서 배열보다 구조가 복잡해요.

## 다른 Observable의 틱에 최신 값을 뽑아요

<!-- rxswift-operator: sample -->

### `sample(_:defaultValue:)`

sampler Observable이 값을 보낼 때, 직전 sampler 틱 이후 원본에서 새로 들어온 최신 값 하나를 보내요.

```swift
sensorValues
  .sample(
    Observable<Int>.interval(
      .seconds(1),
      scheduler: MainScheduler.instance
    )
  )
```

틱 사이에 새 값이 없다면 기본적으로 아무것도 보내지 않고, `defaultValue`를 지정하면 그 값을 보내요. 일정 주기마다 최신 상태를 확인하는 흐름에 적합해요.

## 입력이 잠잠해지면 최신 값을 보내요

<!-- rxswift-operator: debounce -->

### `debounce(_:scheduler:)`

값을 받은 뒤 지정한 시간 안에 새 값이 오지 않을 때 최신 값을 보내요. 기다리는 중 새 값이 오면 이전 값은 버리고 타이머를 다시 시작해요.

```swift
query
  .debounce(
    .milliseconds(300),
    scheduler: MainScheduler.instance
  )
  .distinctUntilChanged()
```

검색어처럼 사용자가 잠시 멈춘 뒤 마지막 값을 처리할 때 적합해요. 값이 계속 빠르게 오면 전달이 계속 미뤄질 수 있어요.

<!-- rxswift-operator: throttle -->

### `throttle(_:latest:scheduler:)`

두 출력 사이가 지정한 시간보다 짧지 않도록 제한해요. 첫 값은 보내고, `latest: true`이면 제한 구간에 들어온 최신 값도 다음 가능한 시점에 보내요.

```swift
scrollOffsets
  .throttle(
    .milliseconds(100),
    latest: true,
    scheduler: MainScheduler.instance
  )
```

`debounce`는 조용한 구간을 기다리지만 `throttle`은 입력이 계속 와도 제한된 빈도로 값을 보낼 수 있어요. `latest: false`이면 구간 중 뒤에 들어온 값을 보존하지 않아요.

## 이벤트나 구독 시작을 미뤄요

<!-- rxswift-operator: delay -->

### `delay(_:scheduler:)`

원본의 값과 정상 완료를 지정한 시간만큼 뒤로 미뤄요. **오류 이벤트는 지연하지 않고 즉시 전달해요.**

```swift
Observable.just("표시")
  .delay(
    .seconds(1),
    scheduler: MainScheduler.instance
  )
```

<!-- rxswift-operator: delaySubscription -->

### `delaySubscription(_:scheduler:)`

원본 Observable을 구독하는 시점 자체를 미뤄요.

```swift
let delayedRequest = request
  .delaySubscription(
    .seconds(1),
    scheduler: MainScheduler.instance
  )
```

`delay`는 작업이 시작된 뒤 이벤트 전달을 미루고, `delaySubscription`은 cold Observable의 작업 시작 자체를 늦출 수 있다는 차이가 있어요.

## 값 사이 대기가 너무 길면 종료하거나 전환해요

<!-- rxswift-operator: timeout -->

### `timeout(_:scheduler:)`와 `timeout(_:other:scheduler:)`

이전 값 뒤 지정한 시간 안에 다음 값이 오지 않으면 기본 오버로드는 `RxError.timeout`으로 실패해요.

```swift
request
  .timeout(
    .seconds(5),
    scheduler: MainScheduler.instance
  )
```

`other` 오버로드는 오류 대신 대체 Observable로 전환해 이후 이벤트를 받아요.

```swift
remote
  .timeout(
    .seconds(5),
    other: cached,
    scheduler: MainScheduler.instance
  )
```

이 연산자는 이벤트 사이의 제한 시간을 다뤄요. 기반 네트워크 요청이 실제로 취소되는지는 원본 Observable이 폐기를 작업 취소에 연결했는지도 확인해야 해요.

## 선택 기준을 정리해요

| 질문                                          | 연산자                            |
| --------------------------------------------- | --------------------------------- |
| 첫 값, 정확히 한 값, 특정 위치 중 무엇인가요? | `first`, `single`, `element`      |
| 앞부분을 버리거나 가져올까요?                 | `skip`, `take`                    |
| 완료 뒤 마지막 값이나 전체 값이 필요한가요?   | `takeLast`, `toArray`             |
| 값은 버리고 종료만 필요한가요?                | `ignoreElements`, `asCompletable` |
| 값이 잠잠해진 뒤 처리할까요?                  | `debounce`                        |
| 계속 오는 값을 제한된 빈도로 처리할까요?      | `throttle`, `sample`              |
| 모든 이벤트를 미룰지 구독 자체를 미룰까요?    | `delay`, `delaySubscription`      |

## 참고 자료

- [ObservableType 공식 API](https://docs.rxswift.org/protocols/observabletype)
- [Selection 연산자 구현](https://github.com/ReactiveX/RxSwift/tree/6.10.2/RxSwift/Observables)
- [Schedulers](https://github.com/ReactiveX/RxSwift/blob/6.10.2/Documentation/Schedulers.md)
