---
title: RxSwift 연산자 — 생성과 변환
description: create, just, from, deferred, interval, using으로 Observable을 만들고 Single·Maybe·Completable·Infallible 및 Swift Concurrency로 변환하는 방법을 설명합니다.
---

# RxSwift 연산자 — 생성과 변환

> **면접 답변 한 줄 요약:** 생성 연산자는 값 생산과 자원 정리 시점을 정의하고, 변환 연산자는 같은 이벤트 흐름에 값 개수·오류 가능성 같은 더 구체적인 타입 계약을 부여해요.

이 페이지는 RxSwift 6.10.2의 Observable 생성 연산자와 Observable·Trait·Swift Concurrency 사이의 변환 API를 모두 설명해요.

## 값을 직접 보내는 Observable을 만들어요

<!-- rxswift-operator: just -->

### `just(_:)`

값 하나를 `.next`로 보내고 정상 완료해요. Scheduler를 받는 오버로드는 해당 Scheduler에서 이벤트를 보내요.

```swift
Observable.just("RxSwift")
  .subscribe(onNext: { print($0) })
  .disposed(by: disposeBag)
```

<!-- rxswift-operator: of -->

### `of(_:scheduler:)`

나열한 값을 순서대로 보내고 정상 완료해요.

```swift
Observable.of(1, 2, 3)
  .subscribe(onNext: { print($0) })
  .disposed(by: disposeBag)
```

배열 자체를 값 하나로 보내려면 `Observable.just([1, 2, 3])`, 배열의 각 요소를 보내려면 `Observable.from([1, 2, 3])`을 사용해요.

<!-- rxswift-operator: from -->

### `from(_:scheduler:)`와 `from(optional:)`

배열이나 `Sequence`의 요소를 차례로 보내요.

```swift
Observable.from([1, 2, 3])
```

옵셔널 오버로드는 값이 있으면 하나를 보내고, `nil`이면 값 없이 정상 완료해요.

```swift
let name: String? = nil

Observable.from(optional: name)
  .subscribe(
    onNext: { print($0) },
    onCompleted: { print("값 없음") }
  )
  .disposed(by: disposeBag)
```

<!-- rxswift-operator: empty -->

### `empty()`

값 없이 즉시 정상 완료해요. 분기에서 “할 일이 없지만 성공적으로 끝남”을 표현할 때 사용해요.

```swift
let noResults = Observable<String>.empty()
```

<!-- rxswift-operator: error -->

### `error(_:)`

값 없이 지정한 오류를 즉시 보내고 끝나요.

```swift
enum LoadError: Error {
  case offline
}

let failed = Observable<String>.error(LoadError.offline)
```

<!-- rxswift-operator: never -->

### `never()`

값, 오류, 완료를 아무것도 보내지 않는 Observable을 만들어요. 구독은 직접 폐기하기 전까지 끝나지 않아요.

```swift
let pending = Observable<String>.never()
```

테스트 대역이나 다른 Observable만 결과를 결정해야 하는 결합에 쓸 수 있지만, 실수로 사용하면 대기와 자원이 영원히 남을 수 있어요.

## 구독 로직을 직접 정의해요

<!-- rxswift-operator: create -->

### `create(_:)`

Observer에게 어떤 이벤트를 보낼지 직접 정의하고, 구독을 폐기할 때 실행할 `Disposable`을 반환해요.

```swift
func loadName() -> Observable<String> {
  Observable.create { observer in
    let task = URLSession.shared.dataTask(
      with: URL(string: "https://example.com/name")!
    ) { data, _, error in
      if let error {
        observer.onError(error)
        return
      }

      let name = data.flatMap {
        String(data: $0, encoding: .utf8)
      } ?? ""

      observer.onNext(name)
      observer.onCompleted()
    }

    task.resume()

    return Disposables.create {
      task.cancel()
    }
  }
}
```

다음 규칙을 지켜야 해요.

- `.error` 또는 `.completed` 뒤에 이벤트를 보내지 않아요.
- 같은 구독에서 이벤트를 동시에 호출하지 않도록 직렬화해요.
- 반환한 Disposable에서 네트워크·타이머·콜백 등록을 실제로 해제해요.
- 가능하면 기존 RxSwift 생성 연산자나 공식 래퍼를 먼저 사용해 수동 구현을 줄여요.

<!-- rxswift-operator: deferred -->

### `deferred(_:)`

Observable을 만드는 클로저를 **구독할 때마다** 실행해 새 Observable을 반환해요.

```swift
let request = Observable.deferred {
  print("구독 시 요청 생성")
  return loadName()
}
```

현재 시각, 인증 토큰, 요청 객체처럼 매 구독 시점의 상태로 소스를 만들어야 할 때 사용해요. 이미 만들어진 hot Observable을 반환하면 기반 생산까지 새로 만들어지는 것은 아니에요.

<!-- rxswift-operator: using -->

### `using(_:observableFactory:)`

`Disposable`인 자원을 만들고 그 자원으로 Observable을 구성해, 구독이 종료되거나 폐기될 때 자원도 함께 폐기해요.

```swift
final class FileHandleResource: Disposable {
  func dispose() {
    // 열린 파일 핸들을 닫아요.
  }
}

let lines = Observable<String>.using(
  { FileHandleResource() },
  observableFactory: { resource in
    // resource로 값을 읽는 Observable을 반환해요.
    Observable.just("한 줄")
  }
)
```

자원 수명과 Observable 구독 수명을 정확히 묶어야 하는 파일·소켓 래퍼에 적합해요.

## 규칙으로 값을 생성해요

<!-- rxswift-operator: generate -->

### `generate(initialState:condition:scheduler:iterate:)`

초기 상태에서 시작해 조건이 참인 동안 현재 상태를 보내고, `iterate`로 다음 상태를 계산해요.

```swift
let countdown = Observable.generate(
  initialState: 3,
  condition: { $0 >= 0 },
  scheduler: CurrentThreadScheduler.instance,
  iterate: { $0 - 1 }
)
```

일반 `for` 루프와 비슷한 유한 상태 생성을 Observable 문법으로 표현해요.

<!-- rxswift-operator: range -->

### `range(start:count:scheduler:)`

정수 시작값부터 지정한 개수만큼 연속된 정수를 보내요.

```swift
Observable.range(start: 5, count: 3)
// 5, 6, 7
```

<!-- rxswift-operator: repeatElement -->

### `repeatElement(_:scheduler:)`

같은 값을 끝없이 반복해요. `take`, `take(for:)`, 구독 폐기 같은 종료 조건과 함께 사용해야 해요.

```swift
Observable.repeatElement("ping")
  .take(3)
// ping, ping, ping
```

<!-- rxswift-operator: interval -->

### `interval(_:scheduler:)`

지정한 주기마다 `0`부터 증가하는 정수를 끝없이 보내요.

```swift
Observable<Int>
  .interval(
    .seconds(1),
    scheduler: MainScheduler.instance
  )
```

첫 값도 한 주기가 지난 뒤 와요. 화면이 사라질 때 구독이 폐기되도록 수명을 관리하세요.

<!-- rxswift-operator: timer -->

### `timer(_:period:scheduler:)`

첫 대기 시간이 지난 뒤 정수 값을 보내요. `period`를 지정하면 이후에도 주기적으로 증가하는 값을 보내고, `nil`이면 값 하나를 보낸 뒤 완료해요.

```swift
let once = Observable<Int>.timer(
  .seconds(2),
  scheduler: MainScheduler.instance
)

let repeating = Observable<Int>.timer(
  .seconds(1),
  period: .seconds(5),
  scheduler: MainScheduler.instance
)
```

`interval`은 첫 대기와 반복 주기가 같고, `timer`는 첫 대기와 반복 주기를 다르게 정할 수 있어요.

## Observable의 구체 타입을 맞춰요

<!-- rxswift-operator: asObservable -->

### `asObservable()`

`ObservableType`이나 Trait을 일반 `Observable<Element>`로 바꿔요. 이벤트 동작은 유지하고 구체 래퍼 타입만 지워 API 경계를 단순하게 해요.

```swift
let observable: Observable<String> = Single
  .just("RxSwift")
  .asObservable()
```

RxSwift 6.10.2에는 반대 방향의 Swift Concurrency 브리지도 있어요. `AsyncSequence.asObservable(priority:)`는 별도 Task에서 비동기 시퀀스를 순회하고 값·오류·완료를 Observable 이벤트로 바꿔요.

```swift
let stream = AsyncStream<Int> { continuation in
  continuation.yield(1)
  continuation.finish()
}

let observable = stream.asObservable()
```

구독을 폐기하면 내부 Task도 취소돼요. UI 전달 위치는 `observe(on:)`으로 별도 지정하세요.

<!-- rxswift-operator: asSingle -->

### `asSingle()`

원본이 정상 완료할 때 값이 정확히 하나였으면 `Single<Element>`로 바꿔요. 값이 없으면 `RxError.noElements`, 둘 이상이면 `RxError.moreThanOneElement`로 실패해요.

```swift
let single = Observable.just("한 개")
  .asSingle()
```

`take(1).asSingle()`처럼 앞에서 값을 잘라 쓰면 “원본에 값이 하나뿐”이라는 계약을 검증하지 못하므로 API 의도를 구분하세요.

<!-- rxswift-operator: asMaybe -->

### `asMaybe()`

원본이 정상 완료할 때 값이 0개 또는 1개면 `Maybe<Element>`로 바꿔요. 둘 이상이면 `RxError.moreThanOneElement`로 실패해요.

```swift
let cachedName = Observable<String>.empty()
  .asMaybe()
```

<!-- rxswift-operator: asCompletable -->

### `asCompletable()`

원본의 모든 `.next` 값을 무시하고 정상 완료나 오류만 `Completable`로 전달해요.

```swift
let finished = loadName()
  .asCompletable()
```

결과 값은 필요 없고 작업 성공 여부만 계약으로 노출할 때 사용해요.

<!-- rxswift-operator: asInfallible -->

### `asInfallible(...)`

오류 가능한 Observable이나 Trait을 오류가 없는 `Infallible`로 바꿔요. 오류를 없애는 정책을 반드시 하나 제공해야 해요.

| 오버로드            | 오류가 오면 하는 일                       |
| ------------------- | ----------------------------------------- |
| `onErrorJustReturn` | 대체 값 하나를 보내요.                    |
| `onErrorFallbackTo` | 대체 `Infallible`로 전환해요.             |
| `onErrorRecover`    | 오류를 보고 대체 `Infallible`을 선택해요. |

```swift
let safe = loadName()
  .asInfallible(onErrorJustReturn: "알 수 없음")
```

오류를 무시해도 되는 도메인인지 먼저 판단하고, 진단이 필요하면 변환 전에 `do(onError:)`로 기록하세요.

## Swift Concurrency로 값을 읽어요

<!-- rxswift-operator: values -->

### `values`

Observable과 오류 가능한 타입은 `AsyncThrowingStream`으로 변환되어 `for try await`로 순회해요.

```swift
let task = Task {
  do {
    for try await value in observable.values {
      print(value)
    }
  } catch {
    print(error)
  }
}
```

`Infallible`은 `AsyncStream`을 제공하므로 `for await`로 순회할 수 있어요. Task가 취소되면 구독도 폐기되고, Observable 구독이 완료되지 않은 채 폐기되면 비동기 순회에는 `CancellationError`가 전달될 수 있어요.

<!-- rxswift-operator: value -->

### `value`

값이 최대 하나인 Primitive Sequence는 프로퍼티를 직접 `await`할 수 있어요.

```swift
let name: String = try await nameSingle.value
let cached: String? = try await cachedMaybe.value
try await saveCompletable.value
```

- `Single.value`는 `Element`를 반환하거나 던져요.
- `Maybe.value`는 값이 없으면 `nil`, 오류면 던져요.
- `Completable.value`는 정상 완료 시 `Void`, 오류면 던져요.

Task와 기반 작업의 취소가 서로 전파되는지 사용자 정의 Observable의 Disposable 구현도 확인하세요.

## Data를 Decodable 타입으로 바꿔요

<!-- rxswift-operator: decode -->

### `decode(type:decoder:)`

각 `Data`를 지정한 `TopLevelDecoder`로 `Decodable` 타입에 디코딩해요. 실패하면 디코딩 오류로 시퀀스가 끝나요.

```swift
struct Product: Decodable {
  let name: String
}

let products = responseData
  .decode(type: [Product].self, decoder: JSONDecoder())
```

네트워크 상태 코드와 빈 응답 검증은 디코딩 전에 처리해야 해요. 이 연산자는 데이터 형식 변환만 책임져요.

## 생성 방법을 비교해요

| 요구사항                         | 선택                           |
| -------------------------------- | ------------------------------ |
| 이미 있는 값 하나                | `just`                         |
| 값 여러 개                       | `of`, `from`                   |
| 값 없이 정상 완료·오류·무한 대기 | `empty`, `error`, `never`      |
| 구독마다 최신 상태로 소스 생성   | `deferred`                     |
| 콜백 API를 직접 감싸고 취소 연결 | `create`                       |
| 자원 수명을 구독과 묶기          | `using`                        |
| 일정한 규칙의 정수·시간 값       | `range`, `interval`, `timer`   |
| Swift 비동기 시퀀스 연결         | `AsyncSequence.asObservable()` |

## 참고 자료

- [ObservableType 공식 API](https://docs.rxswift.org/protocols/observabletype)
- [Observable 생성 소스](https://github.com/ReactiveX/RxSwift/tree/6.10.2/RxSwift/Observables)
- [PrimitiveSequence](https://docs.rxswift.org/rxswift/traits/primitivesequence)
- [Swift Concurrency](https://github.com/ReactiveX/RxSwift/blob/6.10.2/Documentation/SwiftConcurrency.md)
