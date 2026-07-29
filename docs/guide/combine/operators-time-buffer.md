---
title: Combine 연산자 — 시간·버퍼·스케줄러
description: debounce, throttle, delay, timeout, buffer와 subscribe(on:), receive(on:)으로 값의 빈도·대기열·실행 위치를 제어하는 방법을 설명합니다.
---

# Combine 연산자 — 시간·버퍼·스케줄러

> **면접 답변 한 줄 요약:** 시간 연산자는 값의 전달 시점과 빈도를 바꾸고, `buffer`는 생산자와 소비자의 속도 차이를 흡수하며, 스케줄러 연산자는 구독 작업과 다운스트림 전달의 실행 위치를 나눠요.

검색창에는 짧은 시간에 여러 글자가 입력되고, 센서나 소켓은 화면이 처리하는 속도보다 빠르게 값을 보낼 수 있어요. 이 페이지는 Apple `Publisher` 문서의 **Controlling timing**, **Buffering elements**, **Specifying schedulers**에 속한 연산자를 모두 설명해요.

## 먼저 시간 연산자의 질문을 구분해요

| 질문                                                | 연산자            |
| --------------------------------------------------- | ----------------- |
| 마지막 입력 뒤 조용한 시간이 생겼나요?              | `debounce`        |
| 일정 구간마다 첫 값이나 최신 값 하나만 보낼까요?    | `throttle`        |
| 모든 이벤트를 같은 시간만큼 뒤로 미룰까요?          | `delay`           |
| 너무 오랫동안 값이 없으면 끝낼까요?                 | `timeout`         |
| 값 사이에 얼마나 시간이 흘렀나요?                   | `measureInterval` |
| 빠른 업스트림의 값을 제한된 공간에 잠시 보관할까요? | `buffer`          |

시간 연산자가 사용하는 `SchedulerTimeType.Stride`는 스케줄러마다 표현이 달라요. `DispatchQueue`에서는 `.milliseconds(300)`, `.seconds(1)`처럼 작성할 수 있어요.

## 이벤트 사이 시간을 측정해요

<!-- combine-operator: measureInterval -->

### `measureInterval(using:options:)`

업스트림 이벤트가 도착한 간격을 지정한 스케줄러의 `Stride` 값으로 보내요. 원래 `Output` 대신 시간 간격이 출력돼요.

```swift
let cancellable = events
  .measureInterval(using: DispatchQueue.main)
  .sink { interval in
    print("이벤트 간격:", interval)
  }
```

성능 계측, 사용자 입력 간격, 주기적인 소스의 흔들림을 관찰할 때 사용해요. 벽시계의 절대 날짜가 아니라 선택한 스케줄러의 시간 체계로 측정한다는 점을 기억하세요. `options`는 스케줄러별 실행 옵션이에요.

## 입력이 잠잠해진 뒤 최신 값을 보내요

<!-- combine-operator: debounce -->

### `debounce(for:scheduler:options:)`

값을 받은 뒤 지정한 시간 동안 새 값이 오지 않을 때 그 최신 값을 보내요. 기다리는 중 새 값이 오면 이전 값은 버리고 타이머를 다시 시작해요.

```swift
let cancellable = $query
  .debounce(
    for: .milliseconds(300),
    scheduler: DispatchQueue.main
  )
  .removeDuplicates()
  .sink { query in
    print("검색:", query)
  }
```

사용자가 타이핑을 잠시 멈춘 뒤 검색을 시작하는 상황에 적합해요. 값이 끊임없이 간격보다 빠르게 오면 전달이 계속 미뤄질 수 있어요. 일정 주기로 반드시 값을 받고 싶다면 `throttle`이 요구사항에 더 가까워요.

## 일정 구간마다 대표 값 하나를 보내요

<!-- combine-operator: throttle -->

### `throttle(for:scheduler:latest:)`

지정한 시간 구간마다 값을 최대 하나 보내요.

- `latest: true`이면 구간에 들어온 값 중 최신 값을 선택해요.
- `latest: false`이면 구간에서 먼저 선택된 값을 유지해요.

```swift
let cancellable = scrollOffsets
  .throttle(
    for: .milliseconds(100),
    scheduler: DispatchQueue.main,
    latest: true
  )
  .sink { offset in
    updateHeader(offset)
  }
```

스크롤처럼 계속 들어오는 값을 제한된 빈도로 화면에 반영할 때 유용해요. `debounce`는 조용한 구간을 기다리지만 `throttle`은 입력이 계속 와도 정해진 최대 빈도로 결과를 보낼 수 있다는 차이가 있어요.

## 모든 이벤트를 뒤로 미뤄요

<!-- combine-operator: delay -->

### `delay(for:tolerance:scheduler:options:)`

업스트림의 값과 완료 이벤트를 지정한 시간만큼 늦춰 다운스트림에 전달해요. 값의 순서나 개수는 바꾸지 않아요.

```swift
let cancellable = Just("표시")
  .delay(
    for: .seconds(1),
    scheduler: DispatchQueue.main
  )
  .sink { print($0) }
```

`tolerance`는 스케줄러가 전력과 실행 효율을 위해 허용할 수 있는 시간 오차예요. `nil`이면 스케줄러 기본 허용치를 사용해요. `delay`는 다운스트림 전달을 미루는 연산자이지 업스트림 구독이나 작업 시작 자체를 늦추는 연산자가 아니에요. 작업 생성을 구독 시점까지 늦추려면 `Deferred`를 검토하세요.

## 값이 오지 않으면 종료해요

<!-- combine-operator: timeout -->

### `timeout(_:scheduler:options:customError:)`

업스트림이 지정한 시간보다 오래 새 값을 보내지 않으면 구독을 종료해요. 값이 오면 제한 시간이 다시 계산돼요.

```swift
enum RequestError: Error {
  case timedOut
}

let cancellable = request
  .timeout(
    .seconds(5),
    scheduler: DispatchQueue.main,
    customError: { RequestError.timedOut }
  )
  .sink(
    receiveCompletion: { print($0) },
    receiveValue: { print($0) }
  )
```

`customError`가 반환하는 타입은 업스트림의 `Failure`와 같아야 해요. 오류 클로저를 제공하면 시간 초과를 그 실패로 전달하고, 제공하지 않으면 시간 초과 시 정상 완료해요. 사용자가 시간 초과와 정상적인 값 없는 완료를 구분해야 한다면 명시적인 오류를 제공하세요.

이 연산자는 **각 이벤트 사이의 무응답 시간**을 제한해요. 요청 전체의 절대 마감 시간이나 외부 작업 자체의 취소 보장은 업스트림 구현과 별도로 확인해야 해요.

## 속도 차이를 버퍼로 흡수해요

<!-- combine-operator: buffer -->

### `buffer(size:prefetch:whenFull:)`

다운스트림이 바로 처리하지 못한 값을 제한된 크기의 버퍼에 보관해요.

```swift
let buffered = fastPublisher
  .buffer(
    size: 100,
    prefetch: .keepFull,
    whenFull: .dropOldest
  )
```

`prefetch`는 업스트림에 값을 어떻게 요청할지 정해요.

| `Publishers.PrefetchStrategy` | 동작                                                                                 |
| ----------------------------- | ------------------------------------------------------------------------------------ |
| `.keepFull`                   | 구독 시 버퍼 크기만큼 요청하고, 값이 빠질 때마다 버퍼를 다시 채우도록 추가 요청해요. |
| `.byRequest`                  | 미리 채우지 않고 다운스트림 요청에 따라 업스트림 요청을 전달해요.                    |

버퍼가 가득 찼을 때의 정책도 선택해야 해요.

| `Publishers.BufferingStrategy` | 동작                                                       |
| ------------------------------ | ---------------------------------------------------------- |
| `.dropNewest`                  | 새로 들어온 값을 버리고 이미 기다리던 오래된 값을 지켜요.  |
| `.dropOldest`                  | 가장 오래 기다린 값을 버리고 최신 값을 보관해요.           |
| `.customError { ... }`         | 버퍼 초과를 지정한 `Failure`로 바꾸고 파이프라인을 끝내요. |

상태 화면처럼 최신 값이 중요하면 `.dropOldest`, 이벤트 감사 로그처럼 먼저 온 값을 지켜야 하면 `.dropNewest`가 더 가까울 수 있어요. 어떤 값도 잃으면 안 되는 작업에서는 버리기 정책으로 문제를 숨기지 말고 생산 속도 제한, 배치 처리, 저장소 큐 같은 구조를 설계하세요.

버퍼는 메모리와 지연을 맞바꾸는 도구예요. 크기를 크게 잡는 것만으로 느린 소비자를 해결할 수는 없어요.

## 업스트림 구독 작업의 위치를 정해요

<!-- combine-operator: subscribe -->

### `subscribe(on:options:)`

업스트림을 구독하고, 수요를 요청하고, 구독을 취소하는 작업을 지정한 스케줄러에서 수행하도록 영향을 줘요.

```swift
let backgroundQueue = DispatchQueue(
  label: "com.swiftkr.decode",
  qos: .userInitiated
)

let cancellable = jsonPublisher
  .subscribe(on: backgroundQueue)
  .sink(
    receiveCompletion: { print($0) },
    receiveValue: { print($0) }
  )
```

`subscribe(on:)`을 호출한 아래쪽의 모든 클로저가 반드시 그 큐에서 실행된다는 뜻은 아니에요. **업스트림 방향의 구독·요청·취소**에 영향을 주는 연산자예요. 값 전달 위치를 정하려면 `receive(on:)`을 사용해요.

## 다운스트림 값 전달 위치를 정해요

<!-- combine-operator: receive -->

### `receive(on:options:)`

이 연산자 아래쪽 Subscriber가 값과 완료를 받을 스케줄러를 정해요.

```swift
let cancellable = jsonPublisher
  .subscribe(on: backgroundQueue)
  .map(decode)
  .receive(on: DispatchQueue.main)
  .sink { model in
    updateUI(model)
  }
```

위 예제에서 업스트림 구독과 디코딩은 배경 큐에서 수행하도록 구성하고, `receive(on:)` 아래의 UI 갱신은 메인 큐에서 받아요. 연산자를 체인의 어디에 두는지에 따라 영향을 받는 다운스트림 범위가 달라져요.

`receive(on:)`은 값과 완료의 전달 위치를 바꾸지만 Subscriber의 `receive(subscription:)` 호출에는 같은 방식으로 적용되지 않아요. 사용자 인터페이스를 바꾸는 `sink`나 `assign` 앞에서 명시하는 패턴이 읽기 쉬워요.

## `subscribe(on:)`과 `receive(on:)`을 비교해요

```text
Subscriber의 요청
sink ── receive(on: main) ── map ── subscribe(on: background) ── source
                                                       ← 구독·요청·취소

Publisher의 값
source ── map ── receive(on: main) ── sink
                         값·완료 →
```

| 질문                                       | 연산자           |
| ------------------------------------------ | ---------------- |
| Publisher를 구독하고 취소하는 작업 위치는? | `subscribe(on:)` |
| 이 지점 아래에서 값과 완료를 받는 위치는?  | `receive(on:)`   |

스케줄러 전환은 동시성 안전성을 자동으로 보장하지 않아요. 여러 Publisher가 공유 가변 상태에 접근한다면 상태의 소유자와 격리 방법을 별도로 설계하세요.

## 적용 순서를 정리해요

1. 줄이려는 것이 지연인지 호출 빈도인지 구분해요.
2. 첫 값, 최신 값, 모든 값 중 반드시 보존해야 하는 값을 정해요.
3. 업스트림과 다운스트림의 최대 속도 차이를 측정해요.
4. 버퍼 크기와 초과 정책을 명시하고 값 손실을 테스트해요.
5. 구독 작업과 값 전달 작업의 실행 위치를 각각 정해요.
6. UI 갱신 직전에 `receive(on:)`이 있는지 확인해요.
7. 가상 시간이나 제어 가능한 스케줄러를 주입해 시간 기반 테스트를 안정화해요.

## 면접에서 이어질 수 있는 질문

### `debounce`와 `throttle`은 무엇이 다른가요?

`debounce`는 새 입력이 없는 조용한 시간이 생긴 뒤 최신 값을 보내므로 검색어 입력처럼 마지막 값이 중요한 흐름에 적합해요. `throttle`은 입력이 계속 와도 정해진 구간마다 첫 값이나 최신 값 하나를 보내 최대 전달 빈도를 제한해요.

### `subscribe(on:)`과 `receive(on:)`은 무엇이 다른가요?

`subscribe(on:)`은 업스트림 방향의 구독, 수요 요청, 취소 작업에 영향을 줘요. `receive(on:)`은 그 지점 아래 다운스트림으로 값과 완료를 전달할 스케줄러를 바꿔요.

## 참고 자료

- [Publisher — Controlling timing](https://developer.apple.com/documentation/combine/publisher#Controlling-timing)
- [Publisher — Buffering elements](https://developer.apple.com/documentation/combine/publisher#Buffering-elements)
- [Publisher — Specifying schedulers](https://developer.apple.com/documentation/combine/publisher#Specifying-schedulers)
- [Processing Published Elements with Subscribers](https://developer.apple.com/documentation/combine/processing-published-elements-with-subscribers)
- [Publishers.PrefetchStrategy](https://developer.apple.com/documentation/combine/publishers/prefetchstrategy)
- [Publishers.BufferingStrategy](https://developer.apple.com/documentation/combine/publishers/bufferingstrategy)
