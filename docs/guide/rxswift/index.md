---
title: Swift로 시작하는 RxSwift
description: Observable과 Observer, Disposable, Subject, Trait의 관계부터 RxSwift 6.10.2의 모든 공개 연산자를 고르는 방법까지 단계적으로 설명합니다.
---

# Swift로 시작하는 RxSwift

> **면접 답변 한 줄 요약:** RxSwift는 `Observable`이 시간에 따라 보내는 값·오류·완료 이벤트를 연산자로 조합하고, Observer가 구독과 폐기를 통해 소비하도록 만드는 Reactive Extensions의 Swift 구현이에요.

버튼 탭, 검색어, 위치 변화, 네트워크 응답은 도착 시점과 개수가 서로 달라요. 각각을 콜백과 상태 변수로 연결하면 취소, 오류, 실행 스레드가 여러 곳으로 흩어지기 쉬워요. RxSwift는 이런 비동기 값을 모두 `Observable<Element>`라는 한 가지 형태로 표현하고, 작은 연산자를 연결해 처리 흐름을 만들어요.

이 섹션은 기본 Swift 문법을 알지만 RxSwift는 처음 접하는 독자를 대상으로 해요. 문서와 연산자 인벤토리는 공식 저장소의 **RxSwift 6.10.2** 공개 API를 기준으로 작성했어요.

## 먼저 알아둘 RxSwift 용어

| 용어                    | 쉬운 뜻                                                                                                                                                   |
| ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Reactive Extensions, Rx | 시간에 따라 도착하는 값을 관찰 가능한 시퀀스로 표현하고 공통 연산자로 조합하는 규약과 라이브러리 계열이에요.                                              |
| `Observable<Element>`   | `Element` 타입의 값을 0개 이상 보내고, 선택적으로 오류나 정상 완료로 끝나는 시퀀스예요.                                                                   |
| Observer                | Observable을 구독해 `.next`, `.error`, `.completed` 이벤트를 받는 소비자예요.                                                                             |
| 연산자(operator)        | Observable을 만들거나 값·시간·오류·구독 방식을 바꿔 새 Observable 또는 Trait을 만드는 메서드예요.                                                         |
| `Disposable`            | 구독과 기반 작업을 더 이상 사용하지 않을 때 폐기하는 토큰이에요. Combine의 `AnyCancellable`과 비슷한 역할이에요.                                          |
| `DisposeBag`            | 여러 `Disposable`을 보관하고 자신이 해제될 때 모두 `dispose()`하는 컨테이너예요.                                                                          |
| Subject                 | Observable이면서 Observer이기도 해서 외부 코드가 `onNext`로 값을 넣을 수 있는 타입이에요.                                                                 |
| Scheduler               | 구독 작업, 값 전달, 타이머가 실행될 위치와 시간을 표현해요. `MainScheduler`, `SerialDispatchQueueScheduler` 등이 있어요.                                  |
| Trait                   | 값의 개수, 오류 가능성, 실행 위치 같은 Observable의 제약을 타입으로 드러낸 래퍼예요. `Single`, `Maybe`, `Completable`, `Infallible`이 RxSwift에 포함돼요. |
| hot·cold Observable     | cold는 구독마다 작업과 값 생산을 새로 시작하고, hot은 구독과 무관하게 진행되는 값 생산을 여러 Observer가 볼 수 있는 시퀀스예요.                           |

이 섹션에서는 다음 내용을 배워요.

1. Observable이 지켜야 하는 이벤트 규칙을 이해해요.
2. 구독과 `DisposeBag`으로 자원 수명을 관리해요.
3. Subject와 Relay의 상태·이벤트 역할을 구분해요.
4. 값 변환, 결합, 오류 처리, 스케줄러 연산자를 선택해요.
5. 공유 연산자로 중복 작업을 막고 replay 범위를 정해요.
6. Trait과 Swift Concurrency 사이를 변환해요.

## Observable은 값 뒤에 종료 이벤트를 보낼 수 있어요

RxSwift의 Observable 이벤트 규칙은 다음과 같이 표현해요.

```text
next* (error | completed)?
```

- `.next(element)`는 0번 이상 올 수 있어요.
- `.error(error)`나 `.completed`는 최대 한 번 오고 시퀀스를 끝내요.
- 종료 이벤트 뒤에는 다른 이벤트가 올 수 없어요.
- 끝나지 않는 버튼 탭이나 타이머 시퀀스도 만들 수 있어요.

가장 작은 Observable을 만들고 구독해 볼게요.

```swift
import RxSwift

let numbers = Observable.of(1, 2, 3)

let disposable = numbers
  .subscribe(
    onNext: { value in
      print("값:", value)
    },
    onCompleted: {
      print("완료")
    }
  )

// 값: 1
// 값: 2
// 값: 3
// 완료
```

`Observable.of`는 인자로 받은 값을 차례로 보내고 정상 완료해요. `subscribe`는 Observable의 실행을 시작하고 구독을 끊을 수 있는 `Disposable`을 반환해요.

## 연산자를 연결해 처리 흐름을 만들어요

짝수만 남기고 문자열로 바꿔 볼게요.

```swift
let disposable = Observable.of(1, 2, 3, 4, 5)
  .filter { $0.isMultiple(of: 2) }
  .map { "값: \($0)" }
  .subscribe(onNext: { print($0) })

// 값: 2
// 값: 4
```

각 연산자는 원본을 직접 수정하지 않고 새 Observable을 반환해요.

```text
Observable<Int> → filter → map → subscribe
       소스                         Observer
```

Observable은 보통 `subscribe`가 호출될 때 업스트림을 구독해 작업을 시작해요. 하지만 Subject나 이미 실행 중인 시스템 이벤트처럼 구독과 무관하게 값 생산이 진행되는 hot Observable도 있으므로, “Observable은 모두 구독할 때 처음 시작한다”고 단정하면 안 돼요.

## DisposeBag으로 구독 수명을 객체에 맞춰요

끝나지 않는 Observable은 구독을 폐기하지 않으면 기반 작업과 Observer가 계속 남을 수 있어요.

```swift
final class SearchViewModel {
  private let disposeBag = DisposeBag()

  init(query: Observable<String>) {
    query
      .debounce(
        .milliseconds(300),
        scheduler: MainScheduler.instance
      )
      .distinctUntilChanged()
      .subscribe(onNext: { [weak self] query in
        self?.search(query)
      })
      .disposed(by: disposeBag)
  }

  private func search(_ query: String) {
    // 실제 앱에서는 검색 작업을 시작해요.
  }
}
```

`disposed(by:)`는 반환된 `Disposable`을 bag에 보관해요. `SearchViewModel`이 해제되면 bag도 해제되면서 구독을 폐기해요. 같은 객체가 구독을 보관하고 구독 클로저가 객체를 강하게 잡으면 참조 순환이 생길 수 있으므로 `[weak self]`나 `withUnretained`를 소유 관계에 맞게 사용하세요.

`dispose()`는 `.completed` 이벤트를 보내는 연산이 아니에요. Observer와 생산자 사이 연결을 끊고 자원을 정리하는 별도 생명 주기 동작이에요.

## Subject는 외부 이벤트를 Observable에 넣어요

| Subject           | 새 Observer가 처음 받는 값                                                             |
| ----------------- | -------------------------------------------------------------------------------------- |
| `PublishSubject`  | 구독 이후에 들어오는 값만 받아요.                                                      |
| `BehaviorSubject` | 현재 값 하나를 저장하고 새 Observer에게 먼저 보내요.                                   |
| `ReplaySubject`   | 설정한 버퍼 크기만큼 과거 값을 새 Observer에게 다시 보내요.                            |
| `AsyncSubject`    | 원본이 정상 완료했을 때 마지막 값 하나만 보내고 완료해요. 오류가 나면 오류만 전달해요. |

```swift
let subject = BehaviorSubject(value: "초기 검색어")

let disposable = subject
  .subscribe(onNext: { print($0) })

subject.onNext("RxSwift")
```

Subject는 delegate나 콜백을 Rx 경계에 연결할 때 유용하지만, 여러 곳에서 `onNext`를 호출하면 상태 변경 경로가 감춰져요. 오류와 완료를 외부에서 보내지 않아야 하는 상태에는 RxRelay의 `BehaviorRelay`, 단발 이벤트에는 `PublishRelay`도 고려하세요.

## RxSwift 생태계 모듈을 구분해요

| 모듈         | 역할                                                                                  |
| ------------ | ------------------------------------------------------------------------------------- |
| `RxSwift`    | Observable, 연산자, Subject, Scheduler, Disposable과 코어 Trait을 제공해요.           |
| `RxCocoa`    | Apple UI 프레임워크용 바인딩, `Driver`, `Signal`, `ControlProperty` 등을 제공해요.    |
| `RxRelay`    | 오류나 완료 없이 값만 받는 `PublishRelay`, `BehaviorRelay`, `ReplayRelay`를 제공해요. |
| `RxTest`     | 가상 시간 Scheduler와 기록 가능한 Observer로 시간 기반 테스트를 지원해요.             |
| `RxBlocking` | 테스트에서 Observable 결과를 동기적으로 기다리는 API를 제공해요.                      |

이 섹션의 “모든 연산자”는 **RxSwift 코어 모듈**의 공개 연산자를 뜻해요. RxCocoa의 컨트롤별 바인더는 UI API이므로 범위에 넣지 않았고, `Driver`와 `Signal`은 [Trait 문서](./operators-traits-deprecated)에서 역할과 경계를 설명해요.

## Swift Package Manager로 설치해요

`Package.swift`에서는 공식 저장소와 사용할 제품을 선언해요.

```swift
dependencies: [
  .package(
    url: "https://github.com/ReactiveX/RxSwift.git",
    from: "6.10.2"
  ),
],
targets: [
  .target(
    name: "MyApp",
    dependencies: [
      .product(name: "RxSwift", package: "RxSwift"),
      .product(name: "RxCocoa", package: "RxSwift"),
      .product(name: "RxRelay", package: "RxSwift"),
    ]
  ),
]
```

코어만 필요하면 `RxSwift`만 추가하세요. 앱의 실제 배포 기준과 호환성을 검토해 버전을 고정하거나 업데이트 범위를 정해야 해요.

## Trait으로 값의 규칙을 타입에 담아요

| Trait             | 값과 종료 규칙                                    | 대표 용도                   |
| ----------------- | ------------------------------------------------- | --------------------------- |
| `Single<Element>` | 값 하나 또는 오류 하나                            | 네트워크 응답 하나          |
| `Maybe<Element>`  | 값 하나, 값 없는 정상 완료, 또는 오류             | 있을 수도 없는 캐시 조회    |
| `Completable`     | 값 없이 정상 완료 또는 오류                       | 저장·삭제 작업의 성공 여부  |
| `Infallible`      | 오류 없이 값 0개 이상                             | 실패하지 않는 도메인 이벤트 |
| `Driver`          | 오류 없음, 메인 Scheduler 관찰, 최신 값 1개 공유  | UI 상태 구동, RxCocoa       |
| `Signal`          | 오류 없음, 메인 Scheduler 관찰, 과거 값 재생 없음 | UI 단발 이벤트, RxCocoa     |

Trait은 런타임에 완전히 다른 스트림 엔진이 아니라 Observable의 제약과 의미를 타입으로 표현하는 래퍼예요. 값 하나가 보장되는 API를 `Observable`로 노출하기보다 `Single`로 노출하면 호출자가 결과 개수를 추측할 필요가 없어요.

## 모든 연산자를 목적별로 찾아봐요

아래 인벤토리는 RxSwift 6.10.2 모듈을 빌드해 추출한 공개 심볼을 이름별로 묶은 것이에요. 오버로드는 각 문서에서 차이를 함께 설명하고, 폐기된 이름도 최신 대체 API와 연결해요.

| 목적                 | 연산자                                                                                                                                             | 문서                                               |
| -------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------- |
| 생성                 | `create`, `just`, `of`, `from`, `empty`, `error`, `never`, `deferred`, `generate`, `range`, `repeatElement`, `interval`, `timer`, `using`          | [생성과 변환](./operators-create-convert)          |
| 타입·비동기 변환     | `asObservable`, `asSingle`, `asMaybe`, `asCompletable`, `asInfallible`, `values`, `value`, `decode`                                                | [생성과 변환](./operators-create-convert)          |
| 값 변환과 분류       | `map`, `compactMap`, `filter`, `enumerated`, `distinctUntilChanged`, `scan`, `reduce`, `groupBy`, `materialize`, `dematerialize`, `withUnretained` | [변환과 필터링](./operators-transform-filter)      |
| 요소 선택과 기본값   | `element`, `first`, `single`, `toArray`, `ignoreElements`, `skip`, `take`, `takeLast`, `startWith`, `ifEmpty`                                      | [선택·집계·시간](./operators-select-time)          |
| 시간과 묶음          | `buffer`, `window`, `sample`, `debounce`, `throttle`, `delay`, `delaySubscription`, `timeout`                                                      | [선택·집계·시간](./operators-select-time)          |
| 여러 Observable 결합 | `combineLatest`, `zip`, `merge`, `concat`, `concatMap`, `amb`, `withLatestFrom`                                                                    | [Observable 결합](./operators-combine)             |
| 내부 Observable 전환 | `flatMap`, `flatMapLatest`, `flatMapFirst`, `switchLatest`                                                                                         | [Observable 결합](./operators-combine)             |
| 오류 처리            | `catch`, `catchAndReturn`, `retry`                                                                                                                 | [오류·스케줄러·구독](./operators-error-lifecycle)  |
| Scheduler와 구독     | `observe(on:)`, `subscribe(on:)`, `subscribe`, `do`, `debug`                                                                                       | [오류·스케줄러·구독](./operators-error-lifecycle)  |
| 공유와 연결          | `multicast`, `publish`, `replay`, `replayAll`, `share`, `connect`, `refCount`                                                                      | [공유와 연결](./operators-share-connect)           |
| Trait 전용           | `andThen`, `flatMapCompletable`, `flatMapMaybe` 및 Trait별 `create`, `subscribe`, 변환 오버로드                                                    | [Traits와 폐기 API](./operators-traits-deprecated) |
| 폐기된 별칭          | `catchError`, `catchErrorJustReturn`, `elementAt`, `observeOn`, `retryWhen`, `skipUntil`, `skipWhile`, `subscribeOn`, `takeUntil`, `takeWhile`     | [Traits와 폐기 API](./operators-traits-deprecated) |

## RxSwift와 Combine을 비교해요

| 질문          | RxSwift                                               | Combine                                                            |
| ------------- | ----------------------------------------------------- | ------------------------------------------------------------------ |
| 오류 타입     | 모든 Observable 오류는 `Swift.Error`로 전달돼요.      | `Publisher<Output, Failure>`가 구체적인 `Failure` 타입을 추적해요. |
| 취소          | `Disposable.dispose()`와 `DisposeBag`을 사용해요.     | `Cancellable.cancel()`과 `AnyCancellable`을 사용해요.              |
| 역압력        | 일반 Observable에는 수요 협상 프로토콜이 없어요.      | Subscriber가 `Demand`로 요청 개수를 제어할 수 있어요.              |
| UI 계층       | RxCocoa의 `Driver`, `Signal`, Binder가 풍부해요.      | Apple 프레임워크와 `@Published`를 직접 연결해요.                   |
| 플랫폼        | 오픈 소스이며 Apple 플랫폼과 Linux를 지원해요.        | Apple 플랫폼 프레임워크예요.                                       |
| 비동기 브리지 | `values`와 `AsyncSequence.asObservable()`을 제공해요. | Publisher의 `values`를 `AsyncSequence`로 순회할 수 있어요.         |

새 프로젝트에서 한 번의 비동기 작업만 처리한다면 `async`/`await`가 더 단순할 수 있어요. 기존 RxSwift 코드가 많거나 여러 UI 이벤트와 시간 기반 흐름을 조합한다면 RxSwift의 일관된 연산자와 RxCocoa 생태계가 여전히 유용해요.

## 적용 순서를 정리해요

1. 값이 몇 번 오고 정상 완료·오류가 가능한지 정해요.
2. `Observable`, `Single`, `Maybe`, `Completable`, `Infallible` 중 계약을 가장 잘 드러내는 타입을 고르세요.
3. 생성, 변환, 결합, 오류 처리, Scheduler 전환을 작은 단계로 연결해요.
4. cold·hot 여부와 Subscriber마다 작업을 반복할지 공유할지 정해요.
5. `Disposable`, `DisposeBag`, Task의 소유 수명을 정해요.
6. UI 갱신은 메인 Scheduler와 RxCocoa Trait 제약을 확인해요.
7. RxTest의 가상 시간으로 시간 기반 연산자와 종료 경로를 테스트해요.

## 면접에서 이어질 수 있는 질문

### Observable의 이벤트 규칙은 무엇인가요?

`.next`는 0번 이상 올 수 있고 `.error`나 `.completed`는 최대 한 번 와서 시퀀스를 끝내요. 종료 뒤에는 다른 이벤트를 보낼 수 없으며, 끝나지 않는 Observable도 가능해요.

### `dispose()`와 `.completed`는 무엇이 다른가요?

`.completed`는 생산자가 Observer에게 보내는 정상 종료 이벤트예요. `dispose()`는 소비자가 구독 연결을 끊고 자원을 정리하는 동작이라 Observer에 정상 완료를 보장하지 않아요.

### cold Observable과 hot Observable은 무엇이 다른가요?

cold Observable은 보통 Subscriber마다 값 생산과 부수 효과를 새로 시작해요. hot Observable은 구독과 별개로 진행되는 값 생산을 관찰하므로 늦게 구독하면 이전 값을 놓칠 수 있고, `share`나 Subject를 이용해 하나의 소스를 여러 Observer가 볼 수 있어요.

## 참고 자료

- [ReactiveX/RxSwift 6.10.2](https://github.com/ReactiveX/RxSwift/tree/6.10.2)
- [RxSwift 공식 API 문서](https://docs.rxswift.org/)
- [ObservableType](https://docs.rxswift.org/protocols/observabletype)
- [Getting Started](https://github.com/ReactiveX/RxSwift/blob/6.10.2/Documentation/GettingStarted.md)
- [Traits](https://github.com/ReactiveX/RxSwift/blob/6.10.2/Documentation/Traits.md)
- [Swift Concurrency](https://github.com/ReactiveX/RxSwift/blob/6.10.2/Documentation/SwiftConcurrency.md)
- [Hot and Cold Observables](https://github.com/ReactiveX/RxSwift/blob/6.10.2/Documentation/HotAndColdObservables.md)
