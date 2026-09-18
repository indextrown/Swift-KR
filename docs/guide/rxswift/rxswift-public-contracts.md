---
title: RxSwift 공개 프로토콜과 타입 별칭
description: RxSwift 6.10.2의 Cancelable·Scheduler·Subject·Trait 프로토콜과 시간·이벤트 타입 별칭, DataDecoder와 저수준 공개 API의 역할을 설명합니다.
source: https://github.com/ReactiveX/RxSwift/tree/6.10.2/RxSwift
reviewed: '2026-09-19'
---

# RxSwift 공개 프로토콜과 타입 별칭

> **면접 답변 한 줄 요약:** RxSwift의 공개 프로토콜과 타입 별칭은 Observable·Scheduler·Subject·Trait의 공통 계약을 표현하며, 앱 코드는 구체 타입 대신 필요한 최소 계약을 선택하되 구현 지원용 공개 타입까지 직접 사용할 필요는 없어요.

`Observable`, `DisposeBag`, `MainScheduler`처럼 자주 쓰는 타입만 알아도 대부분의 앱 코드는 작성할 수 있어요. 하지만 라이브러리 경계나 공용 유틸리티를 설계할 때는 `Cancelable`, `ImmediateSchedulerType`, `SubjectType`처럼 한 단계 아래의 계약을 이해해야 정확한 타입을 받을 수 있어요.

이 문서는 RxSwift 6.10.2 공개 소스에서 기존 학습 문서에 이름과 역할이 빠져 있던 프로토콜, 마커 타입, 이벤트 타입과 별칭을 모아 설명해요. 공개되어 있어도 일반 앱에서 직접 생성하거나 구현하도록 설계되지 않은 타입은 따로 구분해요.

## 먼저 알아둘 용어

| 용어            | 뜻                                                                                                 |
| --------------- | -------------------------------------------------------------------------------------------------- |
| 공개 API        | 모듈 밖의 앱이나 라이브러리 코드에서 이름을 참조할 수 있도록 `public`으로 선언된 타입과 멤버예요.  |
| 프로토콜 계층   | 더 작은 계약을 다른 프로토콜이 상속해 기능을 단계적으로 늘리는 구조예요.                           |
| 타입 별칭       | 기존 타입에 다른 이름을 붙이는 `typealias`예요. 새 런타임 타입을 만들지는 않아요.                  |
| 마커 타입       | 저장할 값보다 제네릭 타입의 의미를 구분하는 표식으로 사용하는 타입이에요.                          |
| 구현 지원용 API | 공개되어 있지만 일반 앱보다 RxSwift 자체 확장이나 사용자 정의 연산자 구현에 가까운 저수준 API예요. |

## Disposable과 Cancelable은 상태 노출 여부가 달라요

`Disposable`은 `dispose()` 하나만 요구해요. `Cancelable`은 이를 상속하고 `isDisposed` 읽기 속성을 추가해요.

```text
Disposable
└─ Cancelable
   ├─ BooleanDisposable
   ├─ CompositeDisposable
   ├─ RefCountDisposable
   ├─ ScheduledDisposable
   ├─ SerialDisposable
   └─ SingleAssignmentDisposable
```

| 계약         | 보장하는 것                               | 사용할 때                                    |
| ------------ | ----------------------------------------- | -------------------------------------------- |
| `Disposable` | 호출자가 `dispose()`를 요청할 수 있어요.  | 취소 명령만 필요할 때                        |
| `Cancelable` | `dispose()`와 현재 `isDisposed` 상태예요. | 진단이나 저수준 자원 구현에 상태가 필요할 때 |

`isDisposed`는 기반 비동기 작업이 이미 서버에서 중단됐다는 보장이 아니에요. Rx 연결의 폐기 상태를 나타낼 뿐이므로 실제 `URLSessionTask`, `Task`, 타이머 취소는 Observable을 만든 코드가 `dispose`에 연결해야 해요.

`DisposeBase`도 공개 클래스지만 이니셜라이저는 모듈 내부에 있고, `TRACE_RESOURCES`가 켜졌을 때 생성·해제 자원 수를 기록하는 기반 타입이에요. 앱에서 상속해 Disposable을 만드는 출발점으로 사용하기보다 `Disposables.create`, `BooleanDisposable` 같은 공식 팩토리와 구현 타입을 사용하세요.

## Scheduler 프로토콜은 즉시 실행과 시간 실행을 나눠요

`SchedulerType`은 `ImmediateSchedulerType`을 상속해요.

```text
ImmediateSchedulerType
└─ SchedulerType
```

| 프로토콜                 | 핵심 요구사항                          | 대표 소비 API                              |
| ------------------------ | -------------------------------------- | ------------------------------------------ |
| `ImmediateSchedulerType` | 작업을 가능한 즉시 예약하는 `schedule` | `observe(on:)`, `subscribe(on:)`           |
| `SchedulerType`          | 현재 시각, 상대 시간 예약, 주기 예약   | `delay`, `debounce`, `interval`, `timeout` |

즉시 전달 위치만 바꾸는 함수는 더 좁은 `ImmediateSchedulerType`을 받을 수 있어요.

```swift
/// 정수를 지정한 실행 문맥에서 관찰하는 스트림을 만듭니다.
///
/// - Parameter scheduler: 값을 전달할 즉시 실행 Scheduler입니다.
/// - Returns: 지정한 Scheduler에서 값을 전달하는 Observable입니다.
func deliveredNumbers(
  on scheduler: ImmediateSchedulerType
) -> Observable<Int> {
  Observable.of(1, 2, 3)
    .observe(on: scheduler)
}
```

반면 `debounce`처럼 시간을 계산하는 함수는 `SchedulerType`이 필요해요. 필요한 기능보다 넓은 프로토콜을 요구하지 않으면 테스트 대역과 사용자 정의 Scheduler의 구현 부담이 줄어요.

### RxTime과 RxTimeInterval은 이름만 바꾼 타입이에요

RxSwift 6.10.2에서 시간 별칭은 다음 의미예요.

| 별칭             | 실제 타입              | 의미                                |
| ---------------- | ---------------------- | ----------------------------------- |
| `RxTime`         | `Date`                 | Scheduler가 사용하는 절대 시각      |
| `RxTimeInterval` | `DispatchTimeInterval` | `.milliseconds(300)` 같은 상대 시간 |

따라서 `RxTimeInterval`을 초 단위 `Double`로 가정하면 안 돼요. 절대 시각을 다루는 가상 Scheduler에서는 `RxTime`, 지연과 주기 연산자에서는 `RxTimeInterval`을 확인하세요.

## 가상 시간 변환 계약을 구분해요

`VirtualTimeScheduler`는 앱의 실제 시계 대신 임의의 가상 시각을 앞당기며 예약 작업을 실행해요. 가상 단위와 실제 시간의 변환은 `VirtualTimeConverterType`이 담당해요.

| 공개 타입                           | 역할                                                                |
| ----------------------------------- | ------------------------------------------------------------------- |
| `VirtualTimeConverterType`          | 가상 절대·상대 시간과 `Date`·`TimeInterval` 사이의 변환 계약        |
| `VirtualTimeComparison`             | 가상 시각 비교 결과인 `lessThan`, `equal`, `greaterThan`            |
| `HistoricalSchedulerTimeConverter`  | `Date`와 `TimeInterval`을 그대로 가상 시간으로 사용하는 기본 변환기 |
| `TestSchedulerVirtualTimeConverter` | RxTest의 정수 tick과 실제 시간 표현을 연결하는 변환기               |

`HistoricalSchedulerTimeConverter`는 실제 벽시계를 기다리게 만드는 타입이 아니에요. `Date` 값을 가상 시각 좌표로 사용하되 Scheduler의 `start()`나 `advanceTo`로 예약 작업을 진행해요. RxTest에서는 보통 변환기를 직접 만들지 않고 `TestScheduler`를 사용해요.

## SubjectType은 입력과 출력의 두 얼굴을 표현해요

`SubjectType`은 `ObservableType`을 상속하고, 입력 인터페이스인 `Observer` 연관 타입과 `asObserver()`를 요구해요.

```text
                 ┌─ asObservable() ─▶ 읽기·구독
SubjectType ─────┤
                 └─ asObserver() ───▶ 이벤트 입력
```

`PublishSubject`, `BehaviorSubject`, `ReplaySubject`, `AsyncSubject`는 구독 가능한 Observable이면서 이벤트를 받을 Observer예요. 일반 앱 경계에서는 구체 Subject를 그대로 공개하기보다 출력은 `asObservable()`, 입력은 `asObserver()` 또는 종료 사건이 없는 Relay로 좁히는 편이 의도를 드러내요.

`SubjectType`은 여러 종류의 Subject를 받는 공용 라이브러리를 만들 때 유용하지만, 앱 기능 하나를 위해 제네릭 Subject 추상화를 추가하면 읽기 비용만 커질 수 있어요.

## Trait은 마커 타입과 이벤트 타입으로 규칙을 표현해요

`Single`, `Maybe`, `Completable`은 서로 완전히 다른 저장 구조가 아니에요. 모두 `PrimitiveSequence<Trait, Element>`에 마커 타입을 넣은 별칭이에요.

| 공개 타입               | 실제 의미                                                    |
| ----------------------- | ------------------------------------------------------------ |
| `PrimitiveSequenceType` | `primitiveSequence`로 구체 Trait 시퀀스를 돌려주는 공통 계약 |
| `SingleTrait`           | 값이 정확히 하나인 PrimitiveSequence를 구분하는 마커         |
| `MaybeTrait`            | 값이 0개 또는 1개인 PrimitiveSequence를 구분하는 마커        |
| `CompletableTrait`      | 값 없이 완료 또는 실패하는 PrimitiveSequence를 구분하는 마커 |
| `InfallibleType`        | 오류를 내보내지 않는 시퀀스의 변환 계약                      |

이벤트 타입은 각 Trait이 구독자에게 보여 줄 수 있는 종료 문법을 더 직접적으로 나타내요.

| 이벤트 타입                | 가능한 사건                                         |
| -------------------------- | --------------------------------------------------- |
| `SingleEvent<Element>`     | `Result<Element, Error>`의 `success` 또는 `failure` |
| `MaybeEvent<Element>`      | `success(Element)`, `completed`, `error(Error)`     |
| `CompletableEvent`         | `completed`, `error(Error)`                         |
| `InfallibleEvent<Element>` | `next(Element)`, `completed`                        |

```swift
let save: Completable = repository.save()

save.subscribe { event in
  switch event {
  case .completed:
    print("저장 완료")
  case let .error(error):
    print("저장 실패:", error)
  }
}
```

보통은 `subscribe(onSuccess:)`, `subscribe(onCompleted:)`처럼 목적별 클로저가 더 읽기 쉬워요. 이벤트 enum 전체를 받는 오버로드는 종료 사건을 하나의 값으로 분기하거나 공용 어댑터를 만들 때 유용해요.

## DataDecoder로 JSON과 Property List를 같은 연산자에서 읽어요

`DataDecoder`는 `Data`에서 `Decodable` 값을 만드는 최소 계약이에요. RxSwift는 Foundation의 `JSONDecoder`와 `PropertyListDecoder`에 이 프로토콜 채택을 제공해요.

```swift
struct FeatureFlags: Decodable {
  let newSearchEnabled: Bool
}

let flags = plistData
  .decode(
    type: FeatureFlags.self,
    decoder: PropertyListDecoder()
  )
```

`decode(type:decoder:)`는 각 `Data`를 디코딩하고 실패하면 디코더가 던진 오류로 Observable을 종료해요. 사용자 정의 디코더도 `DataDecoder`를 채택하면 같은 연산자에 전달할 수 있어요.

## 호환성과 구현 지원용 별칭을 알아둬요

| 공개 이름                       | 실제 의미                                    | 앱 코드에서의 기준                                 |
| ------------------------------- | -------------------------------------------- | -------------------------------------------------- |
| `RxObservable<T>`               | `RxSwift.Observable<T>`                      | 모듈 이름을 드러낸 별칭이며 보통 `Observable` 사용 |
| `RxAbstractInteger`             | `FixedWidthInteger` 프로토콜                 | 정수 연산자 제약에 쓰이는 구현 지원용 별칭         |
| `maxTailRecursiveSinkStackSize` | 재귀 sink 처리 중 관찰된 최대 generator 깊이 | 동작을 조절하는 설정값으로 사용하지 않아요.        |

`maxTailRecursiveSinkStackSize`는 이름과 달리 사용자가 지정하는 “최대 허용 스택 크기”가 아니에요. 공식 구현이 tail-recursive sink를 처리하며 관찰한 최대 generator 수를 갱신하는 전역 진단 값이에요. 앱 로직이나 성능 정책을 이 값에 의존시키지 마세요.

## 공개 API라고 모두 직접 구현하지는 않아요

| 상황                                            | 권장 선택                                                           |
| ----------------------------------------------- | ------------------------------------------------------------------- |
| 구독을 취소하기만 해요                          | `Disposable`                                                        |
| 폐기 상태도 진단해야 해요                       | `Cancelable` 또는 공식 구현 타입                                    |
| 값 전달 위치만 주입해요                         | `ImmediateSchedulerType`                                            |
| 지연·주기까지 주입해요                          | `SchedulerType`                                                     |
| Subject 입력과 출력을 분리해요                  | `asObserver()`와 `asObservable()`                                   |
| 앱 결과의 값 개수 규칙을 표현해요               | `Single`, `Maybe`, `Completable`, `Infallible`                      |
| 가상 시간 엔진 자체를 확장해요                  | `VirtualTimeConverterType`                                          |
| 일반 앱에서 Rx 내부 기반 클래스를 상속하려 해요 | 먼저 연산자 조합과 `Observable.create`로 해결할 수 있는지 확인해요. |

## 자주 하는 실수

- `Cancelable.isDisposed`를 서버 작업 완료 여부로 사용해요.
- 상대 시간인 `RxTimeInterval`을 `TimeInterval`과 같은 `Double`로 취급해요.
- `SubjectType`을 채택했다는 이유만으로 이벤트 직렬화와 스레드 안전성이 자동 보장된다고 생각해요.
- Trait의 마커 타입을 앱에서 직접 생성해 새로운 의미를 붙여요.
- `DisposeBase`나 가상 시간 변환기처럼 구현 지원용 API를 일반 화면 코드에 노출해요.
- `maxTailRecursiveSinkStackSize`를 재귀 제한 설정값으로 변경해요.

## 적용 체크리스트

- 함수가 정말 필요한 최소 Scheduler 프로토콜을 받나요?
- 취소 가능성과 작업 완료를 같은 상태로 혼동하지 않나요?
- Subject를 외부에 공개할 때 읽기와 쓰기 권한을 좁혔나요?
- 값 개수와 오류 가능성을 가장 구체적인 Trait으로 표현했나요?
- JSON 외 형식에는 맞는 `DataDecoder`를 전달했나요?
- 공개 타입이 앱용 계약인지 Rx 구현 지원용 API인지 공식 소스로 확인했나요?

## 면접에서 이어질 수 있는 질문

### Disposable과 Cancelable은 무엇이 다른가요?

Disposable은 `dispose()` 명령만 제공하고, Cancelable은 이를 상속해 `isDisposed` 상태까지 노출해요. 두 타입 모두 기반 작업의 실제 완료를 뜻하지 않으며, 취소 전파는 Observable 구현에서 연결해야 해요.

### ImmediateSchedulerType과 SchedulerType은 무엇이 다른가요?

ImmediateSchedulerType은 즉시 작업 예약만 표현해요. SchedulerType은 이를 상속하고 현재 시각, 상대 시간 예약, 주기 예약을 추가하므로 시간 기반 연산자에 필요해요.

### Single은 별도 Observable 클래스인가요?

아니요. `Single<Element>`는 `PrimitiveSequence<SingleTrait, Element>`의 타입 별칭이에요. `SingleTrait` 마커가 값이 정확히 하나라는 연산자와 구독 API의 의미를 구분해요.

## 참고 자료

- [RxSwift 6.10.2 공개 소스](https://github.com/ReactiveX/RxSwift/tree/6.10.2/RxSwift)
- [Cancelable 구현](https://github.com/ReactiveX/RxSwift/blob/6.10.2/RxSwift/Cancelable.swift)
- [SchedulerType 구현](https://github.com/ReactiveX/RxSwift/blob/6.10.2/RxSwift/SchedulerType.swift)
- [SubjectType 구현](https://github.com/ReactiveX/RxSwift/blob/6.10.2/RxSwift/Subjects/SubjectType.swift)
- [PrimitiveSequence 구현](https://github.com/ReactiveX/RxSwift/blob/6.10.2/RxSwift/Traits/PrimitiveSequence/PrimitiveSequence.swift)
- [DataDecoder와 decode 구현](https://github.com/ReactiveX/RxSwift/blob/6.10.2/RxSwift/Observables/Decode.swift)
- [VirtualTimeConverterType 구현](https://github.com/ReactiveX/RxSwift/blob/6.10.2/RxSwift/Schedulers/VirtualTimeConverterType.swift)
- [TailRecursiveSink 구현](https://github.com/ReactiveX/RxSwift/blob/6.10.2/RxSwift/Observers/TailRecursiveSink.swift)
