---
title: Combine 연산자 — Publisher 결합
description: combineLatest, merge, zip의 값 짝짓기 방식과 완료 조건을 비교하고 여러 Publisher를 안전하게 결합하는 방법을 Swift 예제로 설명합니다.
---

# Combine 연산자 — Publisher 결합

> **면접 답변 한 줄 요약:** `combineLatest`는 각 Publisher의 최신 값을, `merge`는 같은 타입의 값을 도착 순서대로, `zip`은 소비하지 않은 값을 위치별 한 쌍으로 묶어요.

여러 Publisher를 합칠 때 가장 중요한 질문은 **어떤 값끼리 결과 하나를 만들 것인가**예요. 세 연산자는 구독하는 Publisher 수가 같아도 값을 기다리고 소비하는 규칙이 서로 달라요.

## 먼저 세 규칙을 비교해요

| 연산자          | 결과를 만들 조건                                             | 이전 값 처리                                 | 출력 타입                         |
| --------------- | ------------------------------------------------------------ | -------------------------------------------- | --------------------------------- |
| `combineLatest` | 모든 Publisher가 한 번 이상 보낸 뒤 어느 하나가 새 값을 보냄 | 각 Publisher의 최신 값 하나를 기억           | 튜플 또는 변환 클로저의 반환 타입 |
| `merge`         | 어느 Publisher든 값을 보냄                                   | 짝을 만들지 않고 바로 전달                   | 모든 Publisher와 같은 `Output`    |
| `zip`           | 모든 Publisher에 아직 소비하지 않은 값이 하나 이상 있음      | Publisher별 대기열에서 가장 오래된 값을 소비 | 튜플 또는 변환 클로저의 반환 타입 |

세 연산자 모두 여러 업스트림을 동시에 구독해요. 연결되는 Publisher들의 `Failure` 타입도 호환되어야 해요. 실패가 오면 아직 기다리던 값이 있어도 다운스트림으로 실패를 전달하고 끝날 수 있으므로 실패 경로도 설계해야 해요.

## 각 Publisher의 최신 상태를 합쳐요

<!-- combine-operator: combineLatest -->

### `combineLatest`

각 Publisher가 적어도 값 하나씩을 보낸 뒤부터, 어느 Publisher든 새 값을 보낼 때 모든 Publisher의 **현재 최신 값**을 묶어 보내요.

```swift
let query = PassthroughSubject<String, Never>()
let isOnline = PassthroughSubject<Bool, Never>()

let cancellable = query
  .combineLatest(isOnline)
  .sink { query, isOnline in
    print(query, isOnline)
  }

query.send("Swift")    // isOnline의 값이 없어 아직 출력하지 않아요.
isOnline.send(true)    // Swift true
query.send("Combine")  // Combine true
isOnline.send(false)   // Combine false
```

최신 값은 다시 사용돼요. `query`가 새 값을 보낼 때 직전 `isOnline` 값인 `true`를 함께 사용한 것이 핵심이에요.

변환 클로저를 받는 오버로드는 튜플을 만든 뒤 바로 `map`하는 것과 같은 목적을 한 단계로 표현해요.

```swift
let canSearch = query
  .combineLatest(isOnline) { query, isOnline in
    !query.isEmpty && isOnline
  }
```

한 번의 호출로 현재 Publisher를 포함해 최대 네 Publisher를 결합할 수 있어요.

```swift
let combined = first.combineLatest(second, third)
let transformed = first.combineLatest(second, third) {
  firstValue,
  secondValue,
  thirdValue in
  // 세 값을 하나의 결과로 바꿔요.
}
```

더 많은 상태는 작은 의미 단위로 먼저 결합한 뒤 그 결과를 다시 결합하거나, 별도 상태 타입을 만들어 읽기 쉬운 경계를 유지하세요.

### 수요가 느리면 중간 상태가 합쳐질 수 있어요

`combineLatest`는 각 업스트림의 최신 값 하나에 관심이 있어요. 다운스트림 수요가 부족한 동안 같은 업스트림에서 값이 여러 번 오면 모든 중간 조합을 보존하는 대기열로 생각하면 안 돼요. 모든 입력 쌍을 빠짐없이 처리해야 한다면 `zip`이나 별도 버퍼링 전략이 요구사항에 맞는지 확인하세요.

## 같은 타입의 사건을 한 흐름으로 합쳐요

<!-- combine-operator: merge -->

### `merge(with:)`

여러 Publisher의 값을 도착하는 대로 하나의 흐름에 섞어 보내요. 짝을 기다리지 않으므로 모든 Publisher의 `Output`과 `Failure` 타입이 같아야 해요.

```swift
enum RefreshReason {
  case user
  case foreground
}

let userRefresh = PassthroughSubject<RefreshReason, Never>()
let foregroundRefresh = PassthroughSubject<RefreshReason, Never>()

let cancellable = userRefresh
  .merge(with: foregroundRefresh)
  .sink { print($0) }

userRefresh.send(.user)                  // user
foregroundRefresh.send(.foreground)      // foreground
userRefresh.send(.user)                  // user
```

“새로 고침을 요청하는 여러 원인”처럼 값의 의미가 같고 어느 쪽에서 왔는지 구분할 필요가 없을 때 적합해요. 출처가 필요하면 합치기 전에 `map`으로 태그를 붙이세요.

```swift
enum RefreshEvent {
  case user
  case foreground
}

let merged = userTap
  .map { RefreshEvent.user }
  .merge(
    with: appDidEnterForeground
      .map { RefreshEvent.foreground }
  )
```

인스턴스 메서드 오버로드는 현재 Publisher를 포함해 최대 여덟 Publisher를 한 번에 합칠 수 있어요. 개수가 동적으로 정해진 같은 타입의 Publisher 배열은 `Publishers.MergeMany`를 사용해요.

```swift
let publishers: [AnyPublisher<Int, Never>] = [
  first.eraseToAnyPublisher(),
  second.eraseToAnyPublisher(),
  third.eraseToAnyPublisher(),
]

let merged = Publishers.MergeMany(publishers)
```

`merge`는 모든 업스트림이 정상 완료해야 정상 완료해요. 하나라도 실패하면 합쳐진 Publisher도 실패해요.

## 소비하지 않은 값을 순서대로 짝지어요

<!-- combine-operator: zip -->

### `zip`

각 Publisher의 아직 소비하지 않은 가장 오래된 값끼리 묶어요. 한쪽이 빠르게 여러 값을 보내면 다른 쪽 값이 올 때까지 그 값들이 순서대로 기다려요.

```swift
let names = PassthroughSubject<String, Never>()
let scores = PassthroughSubject<Int, Never>()

let cancellable = names
  .zip(scores)
  .sink { name, score in
    print(name, score)
  }

names.send("Blob")
names.send("Swift")
scores.send(90)  // Blob 90
scores.send(80)  // Swift 80
```

`combineLatest`였다면 첫 `scores` 값이 온 순간 최신 이름인 `"Swift"`와 `90`을 묶었을 거예요. `zip`은 먼저 들어온 `"Blob"`을 소비하므로 입력 순서를 보존해요.

변환 클로저를 받는 오버로드는 튜플을 바로 원하는 결과로 바꿔요.

```swift
let reports = names
  .zip(scores) { name, score in
    "\(name): \(score)점"
  }
```

한 번의 호출로 현재 Publisher를 포함해 최대 네 Publisher를 묶을 수 있고, 각 개수에 변환 클로저 오버로드가 있어요.

`zip`은 어떤 업스트림이 정상 완료하고 더 이상 완성할 묶음을 만들 수 없게 되면 끝나요. 속도 차이가 매우 크거나 한쪽이 오랫동안 값을 보내지 않으면 빠른 쪽의 소비되지 않은 값이 쌓일 수 있으므로 버퍼 크기와 종료 조건을 고려하세요.

## 같은 입력으로 결과 차이를 확인해요

두 Subject가 아래 순서로 값을 보낸다고 가정해요.

```text
A: A1 ── A2 ───────── A3
B: ───────── B1 ─ B2
```

| 연산자          | 만들어지는 결과                                     |
| --------------- | --------------------------------------------------- |
| `combineLatest` | `(A2, B1)`, `(A2, B2)`, `(A3, B2)`                  |
| `merge`         | 타입이 같다는 전제에서 `A1`, `A2`, `B1`, `B2`, `A3` |
| `zip`           | `(A1, B1)`, `(A2, B2)`                              |

`combineLatest`는 B의 첫 값이 오기 전 A1을 결과로 만들지 못하고, A2가 최신 값이 되어 A1을 대체해요. `zip`은 A1을 보관했다가 B1과 묶고, A2는 B2와 묶어요.

## 어떤 연산자를 선택해야 하나요

- 폼의 여러 입력값으로 현재 유효성을 계속 계산하면 `combineLatest`가 잘 맞아요.
- 버튼 탭과 화면 진입처럼 같은 행동을 촉발하는 여러 사건을 하나로 모으면 `merge`가 자연스러워요.
- 요청과 식별자, 이름과 점수처럼 순서대로 1:1 대응해야 하면 `zip`을 사용해요.
- 새 Publisher가 올 때 이전 작업을 취소하려는 요구라면 결합 연산자가 아니라 `switchToLatest`를 검토해요.
- 모든 내부 Publisher를 동시에 유지하며 출력을 합치려면 `flatMap`을 검토해요.

## 적용 순서를 정리해요

1. 결합할 Publisher의 `Output`과 `Failure` 타입을 적어요.
2. 최신 값, 도착한 값, 소비하지 않은 값 중 무엇을 묶을지 정해요.
3. 첫 결과가 나오기 위해 각 Publisher가 무엇을 보내야 하는지 확인해요.
4. 속도가 다른 Publisher 사이에 값이 대기하거나 대체되는 규칙을 테스트해요.
5. 하나가 실패하거나 먼저 완료할 때의 결과를 테스트해요.
6. 결합 수가 많으면 의미 있는 중간 상태 타입으로 나눠요.

## 면접에서 이어질 수 있는 질문

### `combineLatest`와 `zip`은 무엇이 다른가요?

`combineLatest`는 각 Publisher의 최신 값을 기억하고 어느 하나가 갱신될 때 새 조합을 만들어요. `zip`은 각 Publisher에서 아직 소비하지 않은 가장 오래된 값을 한 번씩만 사용하므로 입력 순서를 맞춘 1:1 묶음에 적합해요.

### `merge`에서 출력 타입이 같아야 하는 이유는 무엇인가요?

`merge`는 값을 튜플로 묶지 않고 하나의 출력 흐름에 그대로 섞어요. 다운스트림이 단일 `Output` 타입으로 모든 값을 받아야 하므로 각 Publisher의 출력과 실패 타입이 같아야 해요.

## 참고 자료

- [Publisher — Collecting and republishing the latest elements from multiple publishers](https://developer.apple.com/documentation/combine/publisher#Collecting-and-republishing-the-latest-elements-from-multiple-publishers)
- [Publisher — Republishing elements from multiple publishers as an interleaved stream](https://developer.apple.com/documentation/combine/publisher#Republishing-elements-from-multiple-publishers-as-an-interleaved-stream)
- [Publisher — Collecting and republishing the oldest unconsumed elements from multiple publishers](https://developer.apple.com/documentation/combine/publisher#Collecting-and-republishing-the-oldest-unconsumed-elements-from-multiple-publishers)
- [Publishers.CombineLatest](https://developer.apple.com/documentation/combine/publishers/combinelatest)
- [Publishers.Merge](https://developer.apple.com/documentation/combine/publishers/merge)
- [Publishers.Zip](https://developer.apple.com/documentation/combine/publishers/zip)
