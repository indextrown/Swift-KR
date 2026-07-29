---
title: Combine 연산자 — 평탄화와 오류 처리
description: flatMap과 switchToLatest로 Publisher 안의 Publisher를 평탄화하고 catch, retry, assertNoFailure로 실패를 변환·복구하는 방법을 설명합니다.
---

# Combine 연산자 — 평탄화와 오류 처리

> **면접 답변 한 줄 요약:** `flatMap`은 여러 내부 Publisher를 유지하며 출력을 합치고 `switchToLatest`는 최신 내부 Publisher만 남기며, 오류 처리 연산자는 실패를 대체·재시도하거나 개발 중 가정을 검증해요.

`map`의 클로저가 Publisher를 반환하면 출력은 `Publisher<Publisher<...>>`처럼 한 겹 중첩돼요. 네트워크 요청이나 저장 작업처럼 입력마다 새 비동기 Publisher를 만들 때는 이 중첩을 평탄화해야 해요.

## 먼저 `map`의 중첩을 확인해요

```swift
func loadProduct(id: Int) -> AnyPublisher<String, URLError> {
  // 실제 앱에서는 URLSession Publisher를 반환해요.
  Just("상품 \(id)")
    .setFailureType(to: URLError.self)
    .eraseToAnyPublisher()
}

let nested = [1, 2, 3].publisher
  .setFailureType(to: URLError.self)
  .map(loadProduct)
```

`nested`의 `Output`은 문자열이 아니라 `AnyPublisher<String, URLError>`예요. 문자열을 받으려면 내부 Publisher도 구독해 그 출력을 바깥 흐름으로 꺼내야 해요.

## 모든 내부 Publisher의 출력을 합쳐요

<!-- combine-operator: flatMap -->

### `flatMap(maxPublishers:_:)`

각 입력을 새 Publisher로 바꾸고, 활성화된 내부 Publisher들의 출력을 하나의 흐름으로 합쳐요.

```swift
let cancellable = [1, 2, 3].publisher
  .setFailureType(to: URLError.self)
  .flatMap { id in
    loadProduct(id: id)
  }
  .sink(
    receiveCompletion: { print($0) },
    receiveValue: { print($0) }
  )
```

기본 `maxPublishers`는 `.unlimited`예요. 여러 입력이 빠르게 오면 여러 내부 Publisher를 동시에 구독하며, 완료 순서에 따라 결과 순서가 입력과 달라질 수 있어요.

```swift
let serial = ids
  .flatMap(maxPublishers: .max(1)) { id in
    loadProduct(id: id)
  }
```

`.max(1)`은 동시에 활성화할 내부 Publisher를 하나로 제한해요. 다만 `flatMap`을 일반적인 직렬 작업 큐와 완전히 같다고 가정하지 말고, 업스트림과 내부 Publisher의 수요·버퍼 동작을 함께 테스트하세요.

내부 Publisher와 바깥 Publisher의 `Failure` 타입은 호환되어야 해요. 한쪽이 `Never`이면 Combine이 제공하는 제약 오버로드가 실패 타입을 맞춰 주는 경우가 있지만, 코드 경계에서는 `setFailureType`이나 `mapError`로 의도를 명확히 표현하는 편이 읽기 쉬워요.

### `flatMap`은 이전 작업을 자동으로 취소하지 않아요

새 검색어가 올 때 이전 요청이 더 이상 필요 없더라도 `flatMap`은 이미 만든 내부 Publisher를 유지해요. 동시 작업 수 제한은 새 작업의 시작을 늦출 뿐 이전 작업을 최신 작업으로 교체하지 않아요. 최신 입력만 중요하다면 `switchToLatest`를 사용하세요.

## 최신 내부 Publisher만 유지해요

<!-- combine-operator: switchToLatest -->

### `switchToLatest()`

업스트림의 `Output` 자체가 Publisher일 때, 새 내부 Publisher가 오면 기존 내부 구독을 취소하고 최신 Publisher의 값만 전달해요.

```swift
let queries = PassthroughSubject<String, Never>()

let results = queries
  .map { query in
    search(query)
      .replaceError(with: [])
      .eraseToAnyPublisher()
  }
  .switchToLatest()

let cancellable = results
  .sink { products in
    print(products)
  }
```

`"Sw"` 요청이 진행 중일 때 `"Swift"`가 오면 `"Sw"`의 내부 구독을 취소하고 새 검색 Publisher로 전환해요. 실제 네트워크 작업까지 중단되는지는 그 Publisher가 구독 취소를 기반 작업에 올바르게 전달하는지에 달려 있어요.

`switchToLatest`는 바깥 Publisher와 내부 Publisher의 `Failure` 타입 관계에 맞는 여러 제약 오버로드를 제공해요. 둘 중 하나가 `Never`인 경우도 연결할 수 있지만, 최종 `Failure`가 무엇인지 IDE의 타입 정보로 확인하세요.

## 실패를 다른 Publisher로 복구해요

<!-- combine-operator: catch -->

### `catch(_:)`

업스트림이 실패하면 오류를 받아 **대체 Publisher 하나**를 반환해요. 정상 값과 정상 완료에는 개입하지 않아요.

```swift
enum LoadError: Error {
  case offline
}

let remote = Fail<String, LoadError>(error: .offline)
let cached = Just("캐시된 값")
  .setFailureType(to: LoadError.self)

let cancellable = remote
  .catch { error in
    print("원격 실패:", error)
    return cached
  }
  .sink(
    receiveCompletion: { print($0) },
    receiveValue: { print($0) }
  )

// 원격 실패: offline
// 캐시된 값
// finished
```

대체 Publisher가 정상 완료하면 전체 흐름도 정상 완료하고, 대체 Publisher가 실패하면 그 실패가 전달돼요. `catch`는 원래 업스트림의 실패를 한 번 처리하는 연산자이지, 대체 Publisher의 실패를 같은 클로저로 계속 재귀 처리하지 않아요.

대체 값 하나만 필요하고 오류 정보는 버려도 된다면 `replaceError(with:)`가 더 간단해요. 오류별로 다른 비동기 복구 흐름이 필요하면 `catch`가 적합해요.

<!-- combine-operator: tryCatch -->

### `tryCatch(_:)`

오류 처리 클로저 자체가 던질 수 있는 `catch`예요. 복구 Publisher를 만들지 못하면 새 오류로 실패할 수 있고 반환 Publisher의 `Failure`는 `any Error`가 돼요.

```swift
enum RecoveryError: Error {
  case cacheUnavailable
}

let cancellable = remote
  .tryCatch { _ -> AnyPublisher<String, LoadError> in
    guard cacheExists else {
      throw RecoveryError.cacheUnavailable
    }
    return cached.eraseToAnyPublisher()
  }
  .sink(
    receiveCompletion: { print($0) },
    receiveValue: { print($0) }
  )
```

복구 로직이 던질 필요가 없다면 `catch`를 사용해 구체적인 `Failure` 타입을 유지하세요.

## 같은 Publisher를 다시 구독해요

<!-- combine-operator: retry -->

### `retry(_:)`

업스트림이 실패하면 지정한 횟수만큼 업스트림에 다시 구독해요. `retry(2)`는 최초 시도 뒤 최대 두 번 더 시도하므로 총 시도 횟수는 최대 세 번이에요.

```swift
let cancellable = requestPublisher
  .retry(2)
  .sink(
    receiveCompletion: { print($0) },
    receiveValue: { print($0) }
  )
```

재구독이 실제 작업을 새로 시작하는지는 업스트림 Publisher의 생성 방식에 달려 있어요. 예를 들어 `Future`는 생성 시 작업을 시작하고 결과를 저장하므로 같은 `Future`를 재구독해도 작업이 다시 실행되지 않을 수 있어요. 구독마다 작업을 새로 만들려면 `Deferred`로 감싸는 방식을 고려하세요.

```swift
let request = Deferred {
  makeRequestPublisher()
}
.retry(2)
```

`retry`는 재시도 사이에 자동으로 기다리지 않고 오류 종류도 구분하지 않아요. 즉시 재시도하면 서버나 네트워크에 부담을 줄 수 있으므로, 일시적 오류만 골라 지수 백오프를 적용해야 한다면 `catch`, 지연 Publisher, 재시도 정책을 별도 함수로 구성하세요. 결제나 쓰기 요청은 멱등성도 확인해야 해요.

## 실패하지 않는다는 가정을 검사해요

<!-- combine-operator: assertNoFailure -->

### `assertNoFailure(_:file:line:)`

업스트림이 실패하지 않을 것이라는 개발자 가정을 표현해요. 값은 그대로 전달하고 반환 Publisher의 `Failure`는 `Never`가 되지만, 실제 실패가 오면 메시지와 소스 위치를 사용해 실행을 중단해요.

```swift
let configuration = loadConfiguration()
  .assertNoFailure("앱 번들 설정은 항상 디코딩되어야 해요.")
```

실패가 사용자 환경에서 실제로 발생할 수 있다면 복구 수단으로 사용하면 안 돼요. `catch`, `replaceError`, 오류를 받는 `sink`로 정상적인 실패 경로를 처리하세요. `assertNoFailure`는 프로그램 불변식이 깨진 개발 오류를 찾는 도구예요.

## 오류 처리 방법을 비교해요

| 목표                                   | 연산자            | 완료 결과                                |
| -------------------------------------- | ----------------- | ---------------------------------------- |
| 오류 타입만 바꿔요                     | `mapError`        | 새 오류 타입으로 실패                    |
| 실패를 값 하나로 바꿔요                | `replaceError`    | 대체 값 뒤 정상 완료, `Failure == Never` |
| 실패를 다른 흐름으로 복구해요          | `catch`           | 대체 Publisher의 완료를 따름             |
| 복구 흐름을 만들다 다시 던질 수 있어요 | `tryCatch`        | 던지면 `any Error`로 실패                |
| 같은 업스트림을 다시 시도해요          | `retry`           | 성공하거나 재시도 소진 뒤 마지막 실패    |
| 실패가 논리적으로 불가능함을 검사해요  | `assertNoFailure` | 실제 실패 시 실행 중단                   |

## 적용 순서를 정리해요

1. 입력마다 내부 Publisher를 만들 필요가 있는지 확인해요.
2. 모든 내부 작업이 필요한지 최신 작업만 필요한지 정해요.
3. 동시 작업 수와 결과 순서 요구사항을 정해요.
4. 기술 오류를 `mapError`로 도메인 오류에 매핑해요.
5. 복구 가능한 오류만 `catch`나 `retry`로 처리해요.
6. 재시도의 간격, 최대 횟수, 멱등성, 취소 전파를 테스트해요.
7. 실제 환경의 실패를 `assertNoFailure`로 숨기지 않아요.

## 면접에서 이어질 수 있는 질문

### `flatMap`과 `switchToLatest`는 무엇이 다른가요?

`flatMap`은 허용된 수만큼 내부 Publisher 구독을 함께 유지하고 모든 출력을 합쳐요. `switchToLatest`는 새 내부 Publisher가 오면 이전 구독을 취소하므로 검색 자동 완성처럼 최신 요청만 유효한 흐름에 적합해요.

### `retry(3)`은 총 몇 번 요청하나요?

최초 구독 한 번에 실패 후 재구독을 최대 세 번 추가하므로 총 네 번 시도할 수 있어요. 재시도 사이의 지연은 자동으로 생기지 않으며, Publisher가 구독마다 작업을 새로 만드는지도 확인해야 해요.

## 참고 자료

- [Publisher — Republishing elements by subscribing to new publishers](https://developer.apple.com/documentation/combine/publisher#Republishing-elements-by-subscribing-to-new-publishers)
- [Publisher — Handling errors](https://developer.apple.com/documentation/combine/publisher#Handling-errors)
- [Publishers.FlatMap](https://developer.apple.com/documentation/combine/publishers/flatmap)
- [Publishers.SwitchToLatest](https://developer.apple.com/documentation/combine/publishers/switchtolatest)
- [Publishers.Retry](https://developer.apple.com/documentation/combine/publishers/retry)
