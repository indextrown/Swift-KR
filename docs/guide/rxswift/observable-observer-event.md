---
title: Observable, Observer와 Event 계약
description: ObservableType과 ObserverType의 역할, Event의 next·error·completed 문법, 구독별 실행, AnyObserver, materialize와 사용자 정의 Observable 경계를 설명합니다.
source: https://docs.rxswift.org/protocols/observabletype
reviewed: '2026-09-06'
---

# Observable, Observer와 Event 계약

> **면접 답변 한 줄 요약:** Observable은 구독마다 Observer에게 직렬화된 `next* (error | completed)?` 이벤트를 전달하고, Observer는 종료 뒤 이벤트가 더 오지 않는다는 계약을 전제로 값을 소비해요.

RxSwift 코드는 결국 “누가 이벤트를 만들고, 누가 구독하며, 언제 끝나는가”로 읽을 수 있어요. 이 계약을 이해하면 연산자 조합이 복잡해져도 오류와 취소 경로를 추적하기 쉬워져요.

## 핵심 타입의 역할

| 타입                              | 역할                                                               |
| --------------------------------- | ------------------------------------------------------------------ |
| `Observable<Element>`             | 실제 Observable 시퀀스를 나타내는 클래스예요.                      |
| `ObservableType`                  | 연산자가 확장되는 핵심 프로토콜이며 `subscribe`를 요구해요.        |
| `ObservableConvertibleType`       | 자신을 Observable로 바꾸는 `asObservable()` 계약을 제공해요.       |
| `ObserverType`                    | `on(_:)`으로 Event를 받는 소비자 계약이에요.                       |
| `Event<Element>`                  | `.next(Element)`, `.error(Error)`, `.completed`를 담는 enum이에요. |
| `AnyObserver<Element>`            | 구체적인 Observer 타입을 숨기는 타입 소거 래퍼예요.                |
| `GroupedObservable<Key, Element>` | `groupBy` 결과에서 그룹 키와 그룹별 Observable을 함께 제공해요.    |

대부분의 앱 코드는 `Observable`을 직접 subclass하지 않고 `Observable.create`, Subject, 기존 API와 연산자를 조합해요.

## Event 문법을 코드로 읽어요

```swift
import RxSwift

let observer = AnyObserver<Int> { event in
  switch event {
  case let .next(value):
    print("값:", value)
  case let .error(error):
    print("실패:", error)
  case .completed:
    print("정상 완료")
  }
}

Observable.of(1, 2, 3)
  .subscribe(observer)
  .dispose()
```

Event의 문법은 다음과 같아요.

```text
next* (error | completed)?
```

- 값은 없거나 여러 개일 수 있어요.
- 오류와 정상 완료는 서로 배타적인 종료 이벤트예요.
- 종료 뒤에는 값이나 다른 종료 이벤트를 보내지 않아요.
- 끝나지 않는 Observable도 유효해요.

`Event.element`는 next일 때만 값을 돌려주고, `isStopEvent`는 error 또는 completed인지 알려 줘요. 일반 앱 코드에서는 `subscribe(onNext:onError:onCompleted:)`가 더 읽기 쉽지만, 이벤트 자체를 다루는 로깅·테스트·연산자 구현에서는 Event가 유용해요.

## subscribe는 정의를 실행과 연결해요

```swift
let source = Observable.deferred {
  print("새 구독")
  return Observable.of(10, 20)
}

source.subscribe(onNext: { print("A:", $0) }).dispose()
source.subscribe(onNext: { print("B:", $0) }).dispose()
```

`deferred`의 factory는 구독마다 호출되므로 `새 구독`도 두 번 출력돼요. Observable 변수 하나를 공유했다고 실행까지 자동 공유되는 것은 아니에요.

| 구분    | Observable 정의            | 구독 실행                                 |
| ------- | -------------------------- | ----------------------------------------- |
| 시점    | 연산자를 조합할 때         | `subscribe`, `bind`, `drive`를 호출할 때  |
| 하는 일 | 어떤 값 흐름을 만들지 표현 | Observer를 연결하고 실제 부수 효과를 시작 |
| 반환값  | 새 Observable 또는 Trait   | `Disposable`                              |

## 한 구독의 이벤트는 순서가 있어요

Observable 계약을 지키는 소스는 한 Observer에게 이벤트를 동시에 겹쳐 보내지 않고 순서 있게 전달해야 해요. 여러 Scheduler에서 값이 만들어지더라도 같은 구독의 Observer가 `.next` 두 개를 동시에 처리하게 만들면 안 돼요.

하지만 이 규칙이 앱의 모든 공유 상태를 안전하게 만드는 것은 아니에요.

- 서로 다른 Observable의 Observer는 동시에 실행될 수 있어요.
- 여러 구독이 같은 변수에 접근하면 별도 동기화가 필요해요.
- Observer 안에서 같은 Subject에 다시 값을 보내면 재진입이 일어날 수 있어요.
- 오래 걸리는 `onNext`는 이벤트를 전달하는 현재 Scheduler를 막을 수 있어요.

## create에서는 종료와 취소를 모두 구현해요

```swift
import Foundation
import RxSwift

func makeClock() -> Observable<Date> {
  Observable.create { observer in
    let timer = DispatchSource.makeTimerSource()
    timer.schedule(
      deadline: .now(),
      repeating: .seconds(1)
    )
    timer.setEventHandler {
      observer.onNext(Date())
    }
    timer.resume()

    return Disposables.create {
      timer.cancel()
    }
  }
}
```

사용자 정의 소스에서는 다음을 지켜야 해요.

1. 종료 이벤트를 최대 한 번 보내요.
2. 종료 또는 dispose 뒤 추가 값을 만들지 않게 기반 작업을 중단해요.
3. 여러 실행 문맥에서 이벤트가 올 수 있다면 Observer 전달을 직렬화해요.
4. Observer를 작업이 필요 이상으로 오래 보관하지 않아요.

기존 Rx API를 조합할 수 있다면 직접 `create`하는 것보다 검증된 연산자를 사용하는 편이 안전해요.

## AnyObserver로 쓰기 인터페이스를 좁혀요

Subject를 외부에 그대로 반환하면 호출자가 종료 이벤트까지 보낼 수 있어요. 값 입력이 필요한 협력자에게만 `AnyObserver`를 노출해 구체적인 Subject를 숨길 수 있어요.

```swift
let inputSubject = PublishSubject<String>()

let input = AnyObserver<String> { event in
  guard case let .next(value) = event else {
    return
  }
  inputSubject.onNext(value.trimmingCharacters(in: .whitespaces))
}

input.onNext("  RxSwift  ")
```

오류와 완료가 필요 없는 입력이라면 종료 API 자체가 없는 RxRelay가 더 명확할 수 있어요. AnyObserver는 타입을 지울 뿐 도메인 계약을 자동으로 제한하지는 않아요.

## materialize로 종료를 값처럼 다뤄요

`materialize()`는 `Observable<Element>`를 `Observable<Event<Element>>`로 바꿔요. 원래 오류도 바깥 Observable을 종료시키는 대신 `.error` 값으로 관찰할 수 있어요.

```swift
api.loadProfile()
  .materialize()
  .subscribe(onNext: { event in
    analytics.record(event)
  })
  .disposed(by: disposeBag)
```

`dematerialize()`는 Event 값을 다시 실제 next·error·completed 이벤트로 복원해요. 모든 오류를 materialize해서 비즈니스 상태로 쓰기보다, 이벤트 자체를 검사해야 하는 로깅·재시도 제어·테스트 경계에서 제한적으로 사용하세요.

## Observable과 Trait의 경계를 정해요

| 실제 계약               | 더 구체적인 타입      |
| ----------------------- | --------------------- |
| 값 0개 이상, 오류 가능  | `Observable<Element>` |
| 값 정확히 1개 또는 오류 | `Single<Element>`     |
| 값 0개나 1개 또는 오류  | `Maybe<Element>`      |
| 값 없이 완료 또는 오류  | `Completable`         |
| 값 0개 이상, 오류 없음  | `Infallible<Element>` |

Observable로 모든 것을 표현할 수 있지만, 공개 API에서 가능한 이벤트 수를 Trait으로 좁히면 호출자가 `take(1)` 같은 추측을 하지 않아도 돼요.

## 자주 하는 실수

- Observable 변수를 재사용하면 네트워크 요청도 자동 공유된다고 생각해요.
- `.error` 뒤에 같은 구독으로 값이 다시 올 것으로 기대해요.
- `create`에서 기반 Task·Timer·URLSessionTask를 취소하지 않아요.
- 여러 스레드가 직접 Observer에 이벤트를 보내며 직렬화 계약을 깨요.
- Observer 클로저에서 무거운 동기 작업을 실행해 현재 Scheduler를 막아요.
- Subject나 AnyObserver를 전역 입력으로 공개해 이벤트 생산자를 추적하기 어렵게 만들어요.

## 적용 체크리스트

- 값 개수와 종료 조건을 타입과 문서로 표현했나요?
- 구독마다 새로 실행되는 부수 효과를 파악했나요?
- 사용자 정의 소스가 종료 뒤 이벤트를 보내지 않나요?
- dispose가 실제 기반 작업을 취소하나요?
- 서로 다른 스트림이 공유 상태를 수정할 때 동기화 경계가 있나요?
- Observable보다 구체적인 Trait을 사용할 수 있나요?

## 면접에서 이어질 수 있는 질문

### ObservableType과 ObservableConvertibleType은 무엇이 다른가요?

ObservableType은 직접 구독 가능한 시퀀스의 핵심 계약이고 대부분의 연산자가 확장돼요. ObservableConvertibleType은 자신을 일반 Observable로 변환할 수 있다는 더 넓은 계약이에요.

### 종료 이벤트와 dispose는 어떻게 다른가요?

error와 completed는 생산자가 Observer에게 보내는 이벤트이고, dispose는 소비자가 구독 연결을 끊는 동작이에요. dispose가 정상 완료 이벤트를 만들어 주지는 않아요.

## 참고 자료

- [ObservableType 공식 API](https://docs.rxswift.org/protocols/observabletype)
- [ObserverType 공식 API](https://docs.rxswift.org/protocols/observertype)
- [Event 공식 API](https://docs.rxswift.org/enums/event)
- [Getting Started의 Observable 계약](https://github.com/ReactiveX/RxSwift/blob/6.10.2/Documentation/GettingStarted.md)
- [Observable.create 구현](https://github.com/ReactiveX/RxSwift/blob/6.10.2/RxSwift/Observables/Create.swift)
