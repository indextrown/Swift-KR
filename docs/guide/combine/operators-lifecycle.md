---
title: Combine 연산자 — 연결·구독·디버깅
description: encode, share, multicast, sink, assign, subscribe, values와 디버깅 연산자로 Combine 파이프라인의 연결·소비·관찰 방법을 설명합니다.
---

# Combine 연산자 — 연결·구독·디버깅

> **면접 답변 한 줄 요약:** 연결 연산자는 업스트림 작업을 여러 Subscriber가 공유하거나 시작 시점을 제어하고, 구독 연산자는 값을 실제로 소비하며, 관찰 연산자는 흐름을 바꾸지 않고 생명 주기 이벤트를 확인해요.

이 페이지는 Apple `Publisher` 문서의 **Encoding and decoding**, **Working with multiple subscribers**, **Performing type erasure**, **Adding explicit connectability**, **Connecting simple subscribers**, **Accessing elements asynchronously**, **Debugging** 항목을 모두 설명해요.

## 먼저 중간 연산자와 최종 Subscriber를 구분해요

`map`, `share`, `print` 같은 중간 연산자는 새 Publisher를 반환하므로 뒤에 다른 연산자를 연결할 수 있어요. `sink`와 `assign(to:on:)`은 값을 소비할 Subscriber를 만들고 `AnyCancellable`을 반환하므로 보통 파이프라인의 끝이에요.

```text
Publisher → 중간 연산자 → 중간 연산자 → Subscriber
                                         └─ AnyCancellable
```

`subscribe(_:)`는 직접 만든 Subscriber나 Subject를 붙이는 더 낮은 수준의 연결 API예요.

## 값을 데이터로 인코딩해요

<!-- combine-operator: encode -->

### `encode(encoder:)`

`Output: Encodable`일 때 각 값을 지정한 `TopLevelEncoder`로 인코딩해요. `JSONEncoder`를 사용하면 출력은 `Data`가 돼요.

```swift
struct Draft: Codable {
  let title: String
}

let cancellable = Just(Draft(title: "Combine"))
  .encode(encoder: JSONEncoder())
  .sink(
    receiveCompletion: { print($0) },
    receiveValue: { data in
      print(data.count)
    }
  )
```

인코딩이 실패할 수 있으므로 반환 Publisher의 `Failure`는 `any Error`예요. 도메인 오류 타입이 필요하면 뒤에서 `mapError`로 변환하세요.

## 데이터를 값으로 디코딩해요

<!-- combine-operator: decode -->

### `decode(type:decoder:)`

업스트림 출력이 `TopLevelDecoder.Input`과 같을 때 각 값을 지정한 `Decodable` 타입으로 변환해요.

```swift
let json = Data(#"{"title":"Combine"}"#.utf8)

let cancellable = Just(json)
  .decode(type: Draft.self, decoder: JSONDecoder())
  .sink(
    receiveCompletion: { print($0) },
    receiveValue: { draft in
      print(draft.title)
    }
  )

// Combine
```

디코딩 오류와 업스트림 오류를 모두 전달할 수 있어 `Failure`는 `any Error`예요. 배열 응답이면 `[Draft].self`처럼 실제 최상위 JSON 구조와 타입을 맞춰야 해요.

## 구체 Publisher 타입을 감춰요

<!-- combine-operator: eraseToAnyPublisher -->

### `eraseToAnyPublisher()`

긴 구체 Publisher 타입을 `AnyPublisher<Output, Failure>`로 감춰요. 값, 오류, 완료 동작을 바꾸지 않는 타입 소거 연산자예요.

```swift
protocol ProductLoading {
  func load() -> AnyPublisher<[Product], LoadError>
}

func load() -> AnyPublisher<[Product], LoadError> {
  request()
    .map(\.products)
    .eraseToAnyPublisher()
}
```

반환 타입을 감추면 호출자가 내부 연산자 조합에 의존하지 않아 구현을 바꾸기 쉬워요. 그러나 파이프라인 중간마다 사용하면 컴파일러가 구체 타입을 최적화할 기회를 줄이고 타입 정보도 숨겨요. API 경계나 서로 다른 구체 Publisher를 같은 타입으로 보관해야 하는 곳에서 사용하세요.

## 하나의 업스트림 구독을 공유해요

<!-- combine-operator: share -->

### `share()`

여러 Subscriber가 같은 `share()` 결과 인스턴스를 구독할 때 하나의 업스트림 구독에서 받은 값과 완료를 함께 전달해요.

```swift
let sharedRequest = makeRequest()
  .handleEvents(
    receiveSubscription: { _ in
      print("요청 시작")
    }
  )
  .share()

let first = sharedRequest
  .sink(
    receiveCompletion: { _ in },
    receiveValue: { print("첫 번째:", $0) }
  )

let second = sharedRequest
  .sink(
    receiveCompletion: { _ in },
    receiveValue: { print("두 번째:", $0) }
  )
```

`share()`가 없으면 각 `sink`가 업스트림을 따로 구독해 네트워크 요청 같은 작업이 중복될 수 있어요. `Publishers.Share`는 대부분의 Publisher와 달리 클래스라서 참조 의미를 가지며, 같은 인스턴스를 보관하고 공유해야 효과가 있어요.

Apple은 `share()`를 `multicast`에 `PassthroughSubject`와 암시적 `autoconnect()`를 조합한 것과 같은 동작으로 설명해요. 따라서 이전 값을 재생하는 캐시가 아니에요. 늦게 붙은 Subscriber는 이미 지나간 값을 받지 못할 수 있어요.

## Subject를 선택하고 시작 시점을 직접 제어해요

<!-- combine-operator: multicast -->

### `multicast(_:)`와 `multicast(subject:)`

하나의 업스트림 구독을 Subject를 통해 여러 Subscriber에 전달하는 `ConnectablePublisher`를 만들어요. Subscriber를 모두 먼저 붙인 뒤 `connect()`할 수 있어 시작 값의 누락을 피할 수 있어요.

```swift
let shared = [1, 2, 3].publisher
  .multicast(subject: PassthroughSubject<Int, Never>())

let first = shared.sink { print("첫 번째:", $0) }
let second = shared.sink { print("두 번째:", $0) }

let connection = shared.connect()
```

`connect()` 전에는 업스트림이 값을 보내지 않아요. 반환한 `Cancellable`을 취소하면 업스트림 연결을 끊을 수 있으므로 연결 수명도 보관해야 해요.

두 오버로드는 Subject 제공 방법이 달라요.

- `multicast { PassthroughSubject() }`는 클로저로 Subject를 만들어요.
- `multicast(subject:)`는 호출자가 만든 하나의 Subject 인스턴스를 공유해요.

`PassthroughSubject`는 과거 값을 재생하지 않고, `CurrentValueSubject`는 현재 값 하나를 새 Subscriber에게 보낼 수 있어요. 공유하려는 데이터의 의미에 맞는 Subject를 선택하세요.

## 일반 Publisher에 명시적 연결을 추가해요

<!-- combine-operator: makeConnectable -->

### `makeConnectable()`

`Failure == Never`인 일반 Publisher를 `ConnectablePublisher`로 감싸요. Subscriber를 먼저 구성한 다음 원하는 순간 `connect()`를 호출할 수 있어요.

```swift
let connectable = [1, 2, 3].publisher
  .makeConnectable()

let cancellable = connectable
  .sink { print($0) }

let connection = connectable.connect()
```

동기적으로 모든 값을 즉시 보내는 Publisher는 첫 Subscriber가 구독하자마자 끝날 수 있어요. 여러 Subscriber가 첫 값부터 함께 받아야 한다면 명시적 연결이 유용해요.

<!-- combine-operator: autoconnect -->

### `autoconnect()`

`ConnectablePublisher`에 첫 Subscriber가 붙을 때 `connect()`를 자동 호출하는 일반 Publisher를 만들어요.

```swift
let cancellable = Timer
  .publish(every: 1, on: .main, in: .common)
  .autoconnect()
  .sink { date in
    print(date)
  }
```

타이머처럼 별도의 `connect()` 토큰을 관리할 필요가 없는 단일 구독에 편리해요. 여러 Subscriber를 모두 준비한 뒤 정확히 같은 순간 시작해야 한다면 자동 연결 대신 `connect()`를 직접 호출하세요.

## 클로저로 값을 소비해요

<!-- combine-operator: sink -->

### `sink(receiveCompletion:receiveValue:)`와 `sink(receiveValue:)`

값과 완료를 클로저로 처리하는 `Subscribers.Sink`를 붙이고 `AnyCancellable`을 반환해요.

```swift
let cancellable = request
  .sink(
    receiveCompletion: { completion in
      switch completion {
      case .finished:
        print("완료")
      case let .failure(error):
        print("실패:", error)
      }
    },
    receiveValue: { value in
      print("값:", value)
    }
  )
```

`Failure == Never`이면 완료 오류를 처리할 필요가 없는 `sink(receiveValue:)`를 사용할 수 있어요.

```swift
let cancellable = Just("완료")
  .sink { print($0) }
```

`sink`는 구독 시 무제한 수요를 요청해요. 다운스트림 처리가 느리거나 메모리를 많이 사용한다면 클로저에서 블로킹하지 말고, `buffer`나 사용자 정의 Subscriber로 흐름 제어가 필요한지 검토하세요.

클로저가 `self`를 강하게 잡고 `self`가 `AnyCancellable`을 보관하면 참조 순환이 생길 수 있어요. `[weak self]`가 항상 정답은 아니지만, 구독과 객체 중 어느 쪽이 어느 쪽을 소유해야 하는지 명시적으로 정해야 해요.

## 프로퍼티에 값을 대입해요

<!-- combine-operator: assign -->

### `assign(to:on:)`

`Failure == Never`인 Publisher의 각 값을 객체의 쓰기 가능한 키 경로에 대입하고 `AnyCancellable`을 반환해요.

```swift
final class LabelModel {
  var text = ""
}

let model = LabelModel()

let cancellable = Just("Combine")
  .assign(to: \.text, on: model)
```

`Subscribers.Assign`은 대상 객체를 강하게 참조해요. 대상 객체가 이 `AnyCancellable`을 다시 보관하면 참조 순환이 생길 수 있으므로 수명을 확인하세요.

### `assign(to:)`

`@Published` 프로퍼티의 투영 Publisher에 값을 다시 게시해요.

```swift
final class ClockModel: ObservableObject {
  @Published var now = Date()

  init() {
    Timer
      .publish(every: 1, on: .main, in: .common)
      .autoconnect()
      .assign(to: &$now)
  }
}
```

이 오버로드는 `Published` 저장소의 수명에 구독을 묶고 `AnyCancellable`을 반환하지 않아요. `Published`가 해제되면 자동으로 구독이 취소돼요. 수동 취소가 필요하다면 `sink`나 `assign(to:on:)`을 사용하세요.

## 직접 만든 Subscriber나 Subject를 연결해요

<!-- combine-operator: subscribe -->

### `subscribe(_:)`

`Subscriber`를 따르는 사용자 정의 타입이나 Combine 제공 Subscriber를 Publisher에 붙여요. `Input`은 Publisher의 `Output`, Subscriber의 `Failure`는 Publisher의 `Failure`와 같아야 해요.

```swift
let subscriber = Subscribers.Sink<Int, Never>(
  receiveCompletion: { print($0) },
  receiveValue: { print($0) }
)

[1, 2, 3].publisher
  .subscribe(subscriber)
```

`Subject`를 전달하는 오버로드는 Publisher의 값을 Subject로 전달하고 연결을 취소할 `AnyCancellable`을 반환해요.

```swift
let subject = PassthroughSubject<Int, Never>()
let forwarding = [1, 2, 3].publisher
  .subscribe(subject)
```

`Publisher`를 직접 구현할 때는 프로토콜 요구사항인 `receive(subscriber:)`에서 구독을 설정해요. 사용하는 쪽에서는 `receive(subscriber:)`를 직접 호출하지 않고 `subscribe(_:)`를 호출하세요. Combine이 제공하는 기본 `subscribe(_:)`가 요구사항으로 전달해요.

## `async`/`await`로 값을 순회해요

### `values`

`values`는 메서드형 연산자는 아니지만 Publisher를 `AsyncSequence`처럼 소비하게 하는 공식 브리지예요.

`Failure == Never`인 Publisher는 `for await`로 순회해요.

```swift
let task = Task {
  for await value in model.$query.values {
    print(value)
  }
}
```

실패할 수 있는 Publisher는 `for try await`로 순회해요.

```swift
let task = Task {
  do {
    for try await value in request.values {
      print(value)
    }
  } catch {
    print("실패:", error)
  }
}
```

끝나지 않는 Publisher를 순회하는 Task는 소유 객체가 사라질 때 취소하는 등 수명을 관리해야 해요. Combine 파이프라인의 여러 시간·결합 연산자를 그대로 활용한 뒤 소비 부분만 구조적 동시성 문법으로 읽고 싶을 때 유용해요.

## 생명 주기 이벤트를 관찰해요

<!-- combine-operator: handleEvents -->

### `handleEvents(receiveSubscription:receiveOutput:receiveCompletion:receiveCancel:receiveRequest:)`

구독, 값, 완료, 취소, 수요 요청을 선택적으로 관찰하는 클로저를 받아요. 값과 완료를 바꾸지 않고 그대로 전달해요.

```swift
let observed = request
  .handleEvents(
    receiveSubscription: { _ in
      print("구독")
    },
    receiveOutput: { value in
      print("값:", value)
    },
    receiveCompletion: { completion in
      print("완료:", completion)
    },
    receiveCancel: {
      print("취소")
    },
    receiveRequest: { demand in
      print("수요:", demand)
    }
  )
```

로딩 표시, 메트릭, 디버깅 로그처럼 파이프라인 생명 주기에 붙는 부수 효과에 적합해요. 핵심 데이터 변환을 숨겨 넣으면 흐름을 읽기 어려워지므로 값 변경은 `map` 같은 전용 연산자에 두세요.

<!-- combine-operator: print -->

### `print(_:to:)`

구독, 수요, 값, 완료, 취소 이벤트를 텍스트로 기록해요. 첫 문자열은 여러 파이프라인 로그를 구분하는 접두사예요.

```swift
let cancellable = [1, 2, 3].publisher
  .print("numbers")
  .sink { _ in }
```

기본 출력 대상은 표준 출력이에요. `TextOutputStream`을 따르는 대상을 `to:`에 전달할 수 있어요. 출력 형식은 프로그램 로직이나 테스트 계약으로 파싱하지 말고 진단 용도로만 사용하세요.

<!-- combine-operator: breakpoint -->

### `breakpoint(receiveSubscription:receiveOutput:receiveCompletion:)`

각 클로저가 `true`를 반환한 생명 주기 이벤트에서 디버거가 멈출 수 있도록 트랩을 발생시켜요.

```swift
let debugged = values
  .breakpoint(
    receiveOutput: { value in
      value < 0
    }
  )
```

특정 값이나 완료 상태가 발생하는 순간 호출 스택을 확인할 때 사용해요. 일반 오류 처리나 사용자에게 보여 줄 검증 로직을 대신하지 않아요.

<!-- combine-operator: breakpointOnError -->

### `breakpointOnError()`

업스트림에서 실패 완료를 받으면 디버거가 멈출 수 있도록 트랩을 발생시키는 `breakpoint`의 편의 연산자예요.

```swift
let debuggedRequest = request
  .breakpointOnError()
```

재현하기 어려운 실패의 최초 전달 위치를 조사할 때 유용해요. 배포 동작을 위한 복구 코드는 `catch`, `retry`, 오류를 받는 `sink`에 따로 작성하세요.

## 공유와 구독 방법을 비교해요

| 목표                                            | 선택                              |
| ----------------------------------------------- | --------------------------------- |
| 여러 Subscriber가 업스트림 하나를 자동으로 공유 | `share()`                         |
| Subject 종류와 시작 순간을 직접 제어            | `multicast` + `connect()`         |
| 실패하지 않는 일반 Publisher의 시작만 직접 제어 | `makeConnectable()` + `connect()` |
| Connectable Publisher를 첫 구독에 자동 연결     | `autoconnect()`                   |
| 클로저로 값과 완료를 처리                       | `sink`                            |
| 객체 프로퍼티에 바로 대입                       | `assign`                          |
| 수요를 직접 제어하는 Subscriber를 연결          | `subscribe(_:)`                   |
| Task에서 비동기 시퀀스로 순회                   | `values`                          |

## 적용 순서를 정리해요

1. Subscriber마다 업스트림 작업을 새로 수행할지 공유할지 정해요.
2. 모든 Subscriber가 준비된 뒤 시작해야 하는지 확인해요.
3. `sink`, `assign`, `values`, 사용자 정의 Subscriber 중 소비 방식을 선택해요.
4. `AnyCancellable`, 연결 토큰, Task의 소유 수명을 정해요.
5. `share`가 과거 값을 재생하는 캐시는 아니라는 점을 테스트해요.
6. `handleEvents`로 구독·완료·취소 전파를 관찰해요.
7. API 경계에서만 필요한 만큼 타입을 소거해요.

## 면접에서 이어질 수 있는 질문

### `share`와 `multicast`는 무엇이 다른가요?

`share`는 `PassthroughSubject` 기반 공유와 자동 연결을 간단히 제공해요. `multicast`는 사용할 Subject와 `connect()` 시점을 직접 정할 수 있어 여러 Subscriber를 먼저 연결한 뒤 동시에 시작해야 할 때 적합해요.

### `assign(to:)`가 `AnyCancellable`을 반환하지 않는 이유는 무엇인가요?

`@Published` 저장소가 구독의 수명을 관리하고 해제될 때 자동으로 취소하기 때문이에요. 수동 취소가 필요하면 취소 토큰을 반환하는 `assign(to:on:)`이나 `sink`를 사용해야 해요.

## 참고 자료

- [Publisher — Encoding and decoding](https://developer.apple.com/documentation/combine/publisher#Encoding-and-decoding)
- [Publisher — Working with multiple subscribers](https://developer.apple.com/documentation/combine/publisher#Working-with-multiple-subscribers)
- [Publisher — Connecting simple subscribers](https://developer.apple.com/documentation/combine/publisher#Connecting-simple-subscribers)
- [Publisher — Debugging](https://developer.apple.com/documentation/combine/publisher#Debugging)
- [Controlling Publishing with Connectable Publishers](https://developer.apple.com/documentation/combine/controlling-publishing-with-connectable-publishers)
- [ConnectablePublisher](https://developer.apple.com/documentation/combine/connectablepublisher)
- [Publishers.Share](https://developer.apple.com/documentation/combine/publishers/share)
- [Processing Published Elements with Subscribers](https://developer.apple.com/documentation/combine/processing-published-elements-with-subscribers)
