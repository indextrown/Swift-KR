---
title: Swift로 시작하는 Combine
description: Publisher와 Subscriber의 연결부터 Subject, 취소, 오류, 스케줄러까지 Combine 파이프라인의 핵심과 모든 연산자의 학습 순서를 설명합니다.
---

# Swift로 시작하는 Combine

> **면접 답변 한 줄 요약:** Combine은 `Publisher`가 시간에 따라 보내는 값과 완료 이벤트를 연산자로 변환하고, `Subscriber`가 수요를 요청해 소비하도록 연결하는 Apple의 반응형 프로그래밍 프레임워크예요.

버튼 탭, 검색어 변경, 네트워크 응답은 모두 **언제 도착할지 모르는 값**이에요. 각각을 콜백과 상태 변수로 처리하면 취소, 오류, 실행 위치가 여러 곳으로 흩어지기 쉬워요. Combine은 값이 출발하는 곳부터 화면에 반영되는 곳까지 하나의 파이프라인으로 표현해요.

이 섹션은 기본 Swift 문법을 알지만 Combine은 처음 접하는 독자를 대상으로 해요. 먼저 Publisher와 Subscriber가 연결되는 과정을 익힌 뒤, Apple의 `Publisher` API에 공개된 모든 연산자를 목적별로 찾아볼 수 있어요.

## 먼저 알아둘 Combine 용어

| 용어                                 | 쉬운 뜻                                                                                                                                   |
| ------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------- |
| 반응형 프로그래밍                    | 값이 바뀌거나 사건이 생겼을 때 미리 연결한 처리 흐름이 반응하도록 만드는 방식이에요.                                                      |
| `Publisher`                          | 0개 이상의 값과 마지막 완료 이벤트를 시간에 따라 보내는 타입이에요. 보내는 값은 `Output`, 보낼 수 있는 오류는 `Failure`로 표현해요.       |
| `Subscriber`                         | Publisher에 연결되어 구독을 받고, 필요한 값의 개수를 요청한 뒤 값과 완료를 처리하는 타입이에요.                                           |
| 연산자(operator)                     | 위쪽 Publisher를 입력으로 받아 값, 오류, 시간, 연결 방식을 바꾼 새 Publisher나 Subscriber를 만드는 메서드예요.                            |
| 업스트림·다운스트림                  | 값이 출발하는 쪽을 업스트림, 연산자를 지나 값을 받는 쪽을 다운스트림이라고 해요.                                                          |
| 구독(subscription)                   | Publisher와 Subscriber 사이의 연결이에요. Subscriber는 구독을 통해 값을 요청하거나 연결을 취소해요.                                       |
| 수요(demand)와 역압력(back pressure) | Subscriber가 지금 처리할 수 있는 값의 개수를 Publisher에 알리는 흐름 제어 방식이에요.                                                     |
| `Subject`                            | 외부 코드가 `send(_:)`로 값을 직접 넣을 수 있으면서 Publisher와 Subscriber 역할을 모두 하는 타입이에요.                                   |
| 스케줄러(scheduler)                  | 지연 시간과 작업 실행 위치를 정하는 추상화예요. `RunLoop`, `DispatchQueue`, `OperationQueue` 등이 Combine 스케줄러로 쓰여요.              |
| `AnyCancellable`                     | 구독을 취소할 수 있는 토큰이에요. 해제될 때 자동으로 취소되므로 파이프라인을 유지하려면 프로퍼티나 `Set<AnyCancellable>`에 보관해야 해요. |

이 문서에서는 다음 순서로 Combine을 배워요.

1. Publisher가 값과 완료를 보내는 규칙을 이해해요.
2. 연산자를 연결해 값과 오류를 처리해요.
3. `sink`가 만든 구독을 보관하고 취소해요.
4. Subject와 `@Published`로 상태 변화를 노출해요.
5. 모든 연산자를 목적에 따라 골라요.
6. Combine과 Swift Concurrency의 역할을 구분해요.

## Publisher는 값과 완료를 보내요

Publisher는 `Output` 타입의 값을 여러 번 보낼 수 있고, 마지막에는 아래 완료 이벤트 중 하나를 최대 한 번 보내요.

```swift
Subscribers.Completion<Failure>.finished
Subscribers.Completion<Failure>.failure(error)
```

완료한 뒤에는 값이나 다른 완료를 더 보내지 않아요. 실패할 수 없는 Publisher는 `Failure == Never`를 사용해요. 이 두 타입이 파이프라인 전체에서 맞아야 다음 연산자와 Subscriber를 연결할 수 있어요.

가장 작은 Publisher는 컬렉션의 `publisher` 프로퍼티로 만들 수 있어요.

```swift
import Combine

let numbers = [1, 2, 3, 4, 5].publisher
```

이 Publisher의 `Output`은 `Int`, `Failure`는 `Never`예요. 아직 값이 출력되지는 않아요. Combine 파이프라인은 보통 Subscriber가 연결되어 구독이 시작될 때 업스트림에 값을 요청해요.

## 연산자는 새 Publisher를 반환해요

짝수만 골라 문자열로 바꿔 볼게요.

```swift
let cancellable = [1, 2, 3, 4, 5].publisher
  .filter { $0.isMultiple(of: 2) }
  .map { "값: \($0)" }
  .sink { value in
    print(value)
  }

// 값: 2
// 값: 4
```

호출 순서는 위에서 아래지만 연결은 아래의 `sink`에서 시작해요.

```text
[Int].publisher → filter → map → sink
     업스트림                    다운스트림
```

`filter`는 원래 Publisher를 직접 바꾸지 않고 `Publishers.Filter`라는 새 Publisher를 만들어요. `map`도 그 결과를 감싼 새 Publisher를 만들고, 마지막 `sink`가 Subscriber와 취소 토큰을 만들어요. 그래서 각 단계의 입력과 출력을 왼쪽에서 오른쪽으로 읽으면 파이프라인을 이해하기 쉬워요.

## 구독을 보관해야 값이 계속 와요

`sink`와 `assign(to:on:)`은 `AnyCancellable`을 반환해요. 토큰을 보관하지 않으면 표현식이 끝난 직후 해제되면서 구독도 취소될 수 있어요.

```swift
import Combine

final class SearchViewModel {
  @Published var query = ""
  @Published private(set) var normalizedQuery = ""

  private var cancellables = Set<AnyCancellable>()

  init() {
    $query
      .map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }
      .removeDuplicates()
      .sink { [weak self] query in
        self?.normalizedQuery = query
      }
      .store(in: &cancellables)
  }
}
```

`store(in:)`은 `Cancellable`의 편의 메서드로 토큰을 집합에 넣어요. `SearchViewModel`이 해제되면 집합과 토큰도 해제되어 구독이 취소돼요. 클로저가 `self`를 강하게 잡고, `self`가 토큰을 보관하면 참조 순환이 생길 수 있으므로 소유 기간을 확인해야 해요.

## Publisher를 만드는 방법을 구분해요

연산자를 적용하려면 먼저 값이 출발할 Publisher가 필요해요.

| Publisher·API              | 언제 사용하나요                                                                                                                                |
| -------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `Just`                     | 실패 없이 값 하나를 즉시 보내고 끝낼 때 사용해요.                                                                                              |
| `Future`                   | 나중에 성공 값 하나나 실패 하나를 전달할 때 사용해요. 생성 시 작업 클로저가 실행되고 결과를 저장하므로 구독 시 시작하려면 `Deferred`로 감싸요. |
| `Deferred`                 | Subscriber가 붙을 때마다 내부 Publisher를 새로 만들고 싶을 때 사용해요.                                                                        |
| `Empty`                    | 값 없이 바로 끝내거나 끝나지 않는 Publisher가 필요할 때 사용해요.                                                                              |
| `Fail`                     | 값 없이 지정한 오류로 끝낼 때 사용해요.                                                                                                        |
| `Record`                   | 미리 기록한 값들과 완료를 재생할 때 사용해요.                                                                                                  |
| `Sequence.publisher`       | 배열이나 범위 같은 `Sequence`의 값을 차례로 보낼 때 사용해요.                                                                                  |
| `PassthroughSubject`       | 새 Subscriber에게 과거 값은 주지 않고 이후 `send(_:)` 값만 전달해요.                                                                           |
| `CurrentValueSubject`      | 현재 값을 저장하고 새 Subscriber에게 그 값을 먼저 전달해요.                                                                                    |
| `@Published`의 `$property` | 클래스 프로퍼티가 바뀌는 흐름을 `Published.Publisher`로 노출해요.                                                                              |
| Foundation Publisher       | `URLSession`, `NotificationCenter`, `Timer`, KVO 같은 시스템 사건을 Combine으로 연결해요.                                                      |

Subject는 기존 delegate나 콜백을 Combine 파이프라인에 넣는 경계에서는 유용해요. 그러나 어디서나 값을 보낼 수 있으므로 상태 변경 경로가 감춰질 수 있어요. 단순한 상태는 `@Published`처럼 소유자가 분명한 API부터 고려하세요.

## 오류 타입을 맞춰야 연결할 수 있어요

Combine은 오류 타입도 제네릭으로 추적해요.

```swift
import Combine

enum SearchError: Error {
  case emptyQuery
}

func validate(_ query: String) -> AnyPublisher<String, SearchError> {
  Just(query)
    .setFailureType(to: SearchError.self)
    .tryMap { query in
      guard !query.isEmpty else {
        throw SearchError.emptyQuery
      }
      return query
    }
    .mapError { error in
      error as? SearchError ?? .emptyQuery
    }
    .eraseToAnyPublisher()
}
```

`setFailureType`은 실패하지 않는 `Never` Publisher에 오류 타입만 맞춰요. `tryMap`처럼 던질 수 있는 클로저를 받는 연산자는 `Failure`를 `any Error`로 넓혀요. 필요한 구체 오류로 다시 제한하려면 `mapError`를 사용해요.

## 모든 연산자를 목적별로 찾아봐요

아래 표는 Xcode 26.4 SDK의 Combine 모듈과 Apple의 `Publisher` DocC 목차를 대조한 인벤토리예요. 같은 이름의 오버로드는 한 항목에서 차이를 함께 설명해요. `receive(subscriber:)`와 `connect()`는 프로토콜 요구사항이므로 연결 문서에서 별도로 다루고, `values`는 메서드가 아닌 비동기 브리지지만 함께 설명해요.

| 목적                  | 연산자                                                                                                                          | 문서                                                 |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------- |
| 값 변환               | `map`, `tryMap`, `mapError`, `replaceNil`, `scan`, `tryScan`, `setFailureType`                                                  | [변환과 필터링](./operators-map-filter)              |
| 값 필터링             | `filter`, `tryFilter`, `compactMap`, `tryCompactMap`, `removeDuplicates`, `tryRemoveDuplicates`, `replaceEmpty`, `replaceError` | [변환과 필터링](./operators-map-filter)              |
| 모으기와 축약         | `collect`, `ignoreOutput`, `reduce`, `tryReduce`, `count`, `min`, `tryMin`, `max`, `tryMax`                                     | [축약과 조건 판정](./operators-reduce-match)         |
| 조건 판정             | `contains`, `tryContains`, `allSatisfy`, `tryAllSatisfy`                                                                        | [축약과 조건 판정](./operators-reduce-match)         |
| 앞뒤 연결과 구간 선택 | `append`, `prepend`, `drop`, `tryDrop`, `dropFirst`, `prefix`, `tryPrefix`, `first`, `tryFirst`, `last`, `tryLast`, `output`    | [시퀀스와 요소 선택](./operators-sequence-selection) |
| 여러 Publisher 결합   | `combineLatest`, `merge`, `zip`                                                                                                 | [Publisher 결합](./operators-combine)                |
| 내부 Publisher 평탄화 | `flatMap`, `switchToLatest`                                                                                                     | [평탄화와 오류 처리](./operators-flatten-error)      |
| 오류 처리             | `assertNoFailure`, `catch`, `tryCatch`, `retry`                                                                                 | [평탄화와 오류 처리](./operators-flatten-error)      |
| 시간과 흐름 제어      | `measureInterval`, `debounce`, `delay`, `throttle`, `timeout`, `buffer`, `subscribe(on:)`, `receive(on:)`                       | [시간·버퍼·스케줄러](./operators-time-buffer)        |
| 코딩과 타입 감추기    | `encode`, `decode`, `eraseToAnyPublisher`                                                                                       | [연결·구독·디버깅](./operators-lifecycle)            |
| 공유와 연결           | `share`, `multicast`, `makeConnectable`, `autoconnect`                                                                          | [연결·구독·디버깅](./operators-lifecycle)            |
| 구독과 관찰           | `sink`, `assign`, `subscribe`, `handleEvents`, `print`, `breakpoint`, `breakpointOnError`, `values`                             | [연결·구독·디버깅](./operators-lifecycle)            |

## Combine과 Swift Concurrency를 구분해요

둘 다 비동기 값을 다루지만 출발점이 달라요.

| 질문           | Combine                                                         | Swift Concurrency                                                    |
| -------------- | --------------------------------------------------------------- | -------------------------------------------------------------------- |
| 값의 형태      | 여러 Publisher를 연산자로 조합하는 반응형 파이프라인            | 한 번의 결과는 `async`, 여러 결과는 `AsyncSequence`로 표현           |
| 취소           | `AnyCancellable` 또는 `Subscription`을 취소                     | `Task` 취소와 협력적 취소 확인                                       |
| 오류 타입      | `Publisher<Output, Failure>`가 구체 오류 타입을 추적            | 일반적인 `throws`는 호출부에서 구체 오류 타입을 항상 보존하지는 않음 |
| 시간 기반 연산 | `debounce`, `throttle`, `combineLatest` 같은 연산자를 기본 제공 | 필요한 동작을 `AsyncSequence` 알고리즘이나 별도 구현으로 구성        |
| 연결           | `publisher.values`로 `AsyncSequence`처럼 순회                   | `AsyncPublisher`를 통해 Publisher의 값을 소비                        |

여러 UI 입력을 합치고 시간 기반 제어가 많은 기존 Apple 플랫폼 코드라면 Combine이 자연스러워요. 한 번의 요청을 순서대로 읽는 로직은 `async`/`await`가 더 단순할 수 있어요. 둘 중 하나만 고집하기보다 값의 수명과 필요한 연산을 기준으로 선택하세요.

## 언제 사용해야 하나요

Combine이 잘 맞는 경우는 다음과 같아요.

- 검색어, 네트워크 상태, 선택 값처럼 여러 비동기 상태를 계속 결합해야 해요.
- 중복 제거, 지연, 재시도, 취소 같은 규칙을 하나의 흐름으로 읽고 싶어요.
- UIKit·AppKit의 기존 이벤트나 Foundation Publisher를 연결해야 해요.
- 이미 Combine 기반 API와 코드가 많은 프로젝트를 유지해요.

반대로 단일 네트워크 요청 하나를 기다리는 코드는 `async`/`await`가 더 짧고 읽기 쉬울 수 있어요. 연산자를 많이 연결했다고 자동으로 좋은 구조가 되는 것은 아니에요. 파이프라인이 화면 상태 변경, 네트워크 정책, 데이터 변환을 모두 떠안으면 작은 이름 있는 메서드나 별도 타입으로 경계를 나누세요.

## 적용 순서를 정리해요

1. 값이 어디에서 시작되고 몇 번 도착하는지 정해요.
2. `Output`과 `Failure` 타입을 확인해요.
3. 변환, 필터링, 결합, 시간 제어를 각각 한 단계씩 연결해요.
4. UI를 바꾼다면 `receive(on:)`으로 전달 위치를 명확히 해요.
5. `sink`, `assign`, `values` 중 소비 방법을 선택해요.
6. 취소 토큰의 소유자와 수명을 정해요.
7. `handleEvents`나 테스트용 Subject로 값·완료·취소 경로를 검증해요.

## 면접에서 이어질 수 있는 질문

### Publisher와 Subscriber 사이에 Subscription이 왜 필요한가요?

Subscription은 값의 요청과 취소를 담당하는 연결 객체예요. Subscriber가 처리 가능한 수요를 전달할 수 있어 빠른 Publisher가 소비자를 무제한 밀어붙이는 문제를 제어하고, 더 필요하지 않을 때 업스트림 작업을 취소할 수 있어요.

### `PassthroughSubject`와 `CurrentValueSubject`는 무엇이 다른가요?

`PassthroughSubject`는 구독 이후에 들어온 값만 전달하고 현재 값을 저장하지 않아요. `CurrentValueSubject`는 현재 값 하나를 보관하며 새 Subscriber에게 그 값을 즉시 전달하므로 상태를 표현할 때 적합해요.

### `AnyCancellable`을 왜 프로퍼티에 보관하나요?

`AnyCancellable`은 해제될 때 구독을 취소해요. 비동기 파이프라인이 객체의 수명 동안 유지되어야 한다면 같은 수명을 가진 프로퍼티나 집합에 토큰을 보관해야 해요.

### Combine과 `AsyncSequence`를 함께 쓸 수 있나요?

가능해요. Publisher의 `values` 프로퍼티를 `for await` 또는 `for try await`로 순회할 수 있어요. 다만 무한 Publisher를 순회하는 Task의 취소와 소유 수명도 함께 설계해야 해요.

## 참고 자료

- [Combine](https://developer.apple.com/documentation/combine)
- [Publisher](https://developer.apple.com/documentation/combine/publisher)
- [Receiving and Handling Events with Combine](https://developer.apple.com/documentation/combine/receiving-and-handling-events-with-combine)
- [Processing Published Elements with Subscribers](https://developer.apple.com/documentation/combine/processing-published-elements-with-subscribers)
- [Subject](https://developer.apple.com/documentation/combine/subject)
- [Using Combine for Your App’s Asynchronous Code](https://developer.apple.com/documentation/combine/using-combine-for-your-app-s-asynchronous-code)
