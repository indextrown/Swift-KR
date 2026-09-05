---
title: Scheduler와 Swift Concurrency 연결
description: RxSwift의 subscribe(on:)·observe(on:) 차이, 내장 Scheduler 선택, 직렬화와 시간 연산, Observable·AsyncSequence·Single 사이의 동시성 브리지를 설명합니다.
source: https://github.com/ReactiveX/RxSwift/blob/6.10.2/Documentation/Schedulers.md
reviewed: '2026-09-06'
---

# Scheduler와 Swift Concurrency 연결

> **면접 답변 한 줄 요약:** `subscribe(on:)`은 소스 구독·해제 위치를, `observe(on:)`은 이후 이벤트 전달 위치를 바꾸며, async/await와 연결할 때는 변환 경계를 한곳에 두고 Task와 Disposable 취소를 함께 설계해요.

Scheduler는 단순히 “백그라운드 스레드”를 의미하지 않아요. 현재 스레드, 메인 큐, 직렬·병렬 DispatchQueue, OperationQueue, 가상 시간을 같은 인터페이스로 표현하는 실행 추상화예요.

## 두 Scheduler 연산자를 구분해요

```swift
let background = ConcurrentDispatchQueueScheduler(qos: .userInitiated)

api.loadFeed()
  .subscribe(on: background)
  .map { items in
    items.sorted { $0.date > $1.date }
  }
  .observe(on: MainScheduler.instance)
  .subscribe(onNext: { items in
    collectionView.apply(items)
  })
  .disposed(by: disposeBag)
```

| 연산자           | 영향을 주는 범위                                         |
| ---------------- | -------------------------------------------------------- |
| `subscribe(on:)` | 소스의 `subscribe` 실행과 구독 해제가 수행될 Scheduler   |
| `observe(on:)`   | 이 연산자 아래로 next·error·completed가 전달될 Scheduler |

`observe(on:)`을 여러 번 쓰면 각 지점 아래의 실행 문맥이 바뀌어요. 반면 `subscribe(on:)`은 소스 구독 경계에 영향을 주므로 여러 곳에 흩어 놓으면 실제 시작 위치를 읽기 어려워져요.

Scheduler를 지정하지 않으면 소스가 이벤트를 만든 현재 실행 문맥에서 연산자가 이어져요. `map`이나 `filter`가 자동으로 백그라운드 실행되는 것은 아니에요.

## 내장 Scheduler를 선택해요

| Scheduler                          | 직렬성·특징                                                         | 대표 용도                                  |
| ---------------------------------- | ------------------------------------------------------------------- | ------------------------------------------ |
| `CurrentThreadScheduler`           | 현재 스레드의 trampoline 큐를 사용해 재귀 예약을 순서대로 처리해요. | 기본 생성 연산자, 내부 재귀 완화           |
| `MainScheduler`                    | 메인 스레드를 추상화하며 메인에서 예약하면 즉시 실행될 수 있어요.   | `observe(on:)`을 통한 UI 갱신              |
| `ConcurrentMainScheduler`          | 메인 큐로 구독 작업을 보내는 데 최적화돼요.                         | `subscribe(on:)`이 반드시 메인이어야 할 때 |
| `SerialDispatchQueueScheduler`     | 전달받은 큐가 concurrent여도 직렬 실행을 보장해요.                  | 상태 변경, 순차 I/O                        |
| `ConcurrentDispatchQueueScheduler` | DispatchQueue 기반 병렬 실행을 제공해요.                            | 독립적인 백그라운드 작업                   |
| `OperationQueueScheduler`          | OperationQueue와 `maxConcurrentOperationCount` 정책을 사용해요.     | 큰 작업의 동시 실행 수 제어                |
| `HistoricalScheduler`              | `Date`와 `TimeInterval` 기반의 가상 시간을 사용해요.                | 시간 이동 시뮬레이션                       |
| `VirtualTimeScheduler`             | 사용자 정의 절대·상대 시간 변환으로 가상 실행을 제공해요.           | 테스트 Scheduler의 기반                    |

UI 이벤트 관찰에는 `MainScheduler`, 메인에서 시작해야 하는 구독 최적화에는 `ConcurrentMainScheduler`라는 공식 권장 차이가 있어요. 일반 화면 코드에서는 RxCocoa의 Driver와 Signal이 메인 관찰 계약을 더 명시적으로 제공해요.

## serial과 concurrent의 의미를 구분해요

Rx 연산자는 한 Observer의 이벤트 순서를 보존해야 해요. RxSwift가 serial Scheduler임을 알 수 있으면 `observe(on:)` 같은 경계도 더 단순하게 최적화할 수 있어요.

```swift
let stateScheduler = SerialDispatchQueueScheduler(
  internalSerialQueueName: "com.example.state"
)

actions
  .observe(on: stateScheduler)
  .scan(State.initial) { state, action in
    state.reducing(action)
  }
  .share(replay: 1, scope: .whileConnected)
```

병렬 Scheduler에서 각각 계산한 결과가 하나의 가변 상태를 수정한다면 Rx 이벤트 순서만으로 충분하지 않아요. 상태를 변경하는 마지막 경계를 serial Scheduler나 actor 하나로 모으세요.

## CurrentThreadScheduler는 재귀를 큐로 펴요

CurrentThreadScheduler는 같은 스레드에서 처음 예약한 작업을 즉시 실행하고, 실행 중 다시 예약된 작업은 숨은 큐에 넣었다가 현재 작업 뒤에 처리해요. 이 trampoline 방식은 연산자가 재귀적으로 다음 작업을 예약할 때 호출 스택이 끝없이 깊어지는 것을 줄여요.

직접 Scheduler를 지정하지 않은 여러 생성 연산자가 CurrentThreadScheduler를 기본으로 사용해요. “현재 스레드”라는 이름 때문에 모든 작업이 즉시 재귀 호출된다고 오해하면 안 돼요.

## 시간 기반 연산자는 테스트 가능한 Scheduler를 받아요

```swift
let query = input
  .debounce(
    .milliseconds(300),
    scheduler: MainScheduler.instance
  )
  .distinctUntilChanged()
```

`debounce`, `throttle`, `delay`, `timeout`, `timer`, `interval`은 시간의 기준이 되는 Scheduler를 받아요. 제품 코드에서 구체적인 메인 Scheduler를 함수 내부에 고정하면 가상 시간 테스트가 어려울 수 있으므로, 중요한 도메인 로직은 Scheduler를 주입하거나 파이프라인 바깥에서 선택하세요.

## Observable을 AsyncSequence로 읽어요

오류 가능한 Observable의 `values`는 `for try await`로 순회해요.

```swift
let task = Task {
  do {
    for try await update in updates.values {
      await model.apply(update)
    }
  } catch {
    await model.fail(error)
  }
}
```

Observable이 완료되지 않으면 loop도 계속 대기해요. Task가 취소되면 비동기 시퀀스의 종료 처리에서 Rx 구독이 폐기되지만, Observable을 만든 기반 작업도 dispose에 실제 취소를 연결해야 해요.

`Infallible`, `Driver`, `Signal`은 오류가 없으므로 `for await`로 읽을 수 있어요.

```swift
for await state in stateDriver.values {
  await renderer.render(state)
}
```

## PrimitiveSequence의 한 값을 await해요

```swift
let user = try await userSingle.value
let cachedUser = try await cachedUserMaybe.value
try await saveCompletable.value
```

| Rx 타입           | await 결과 |
| ----------------- | ---------- |
| `Single<Element>` | `Element`  |
| `Maybe<Element>`  | `Element?` |
| `Completable`     | `Void`     |

Maybe가 값 없이 완료하면 `nil`, Completable이 정상 완료하면 `Void`가 돌아와요. 오류 종료는 throw로 전달돼요.

## AsyncSequence를 Observable로 바꿔요

```swift
let updates: AsyncStream<Update> = service.updates()

updates
  .asObservable(priority: .userInitiated)
  .observe(on: MainScheduler.instance)
  .subscribe(onNext: { update in
    renderer.render(update)
  })
  .disposed(by: disposeBag)
```

RxSwift 6.10부터 `AsyncSequence.asObservable()`은 `Task.detached`로 순회하고 선택적으로 `TaskPriority`를 받아요. 호출한 actor 문맥을 뜻하지 않게 상속해 교착이나 불필요한 직렬화를 만드는 문제를 피하기 위한 변경이에요. UI 적용은 예제처럼 명시적으로 메인 Scheduler로 돌아오세요.

## async 함수 결과를 Single로 감싸요

```swift
let profile: Single<Profile> = Single.create {
  try await profileService.load()
}

profile
  .observe(on: MainScheduler.instance)
  .subscribe(onSuccess: { profile in
    renderer.render(profile)
  })
  .disposed(by: disposeBag)
```

변환 후 dispose가 Task 취소와 어떻게 연결되는지, async 함수가 취소 협력적인지 확인하세요. 단순히 타입만 Single로 바꾼다고 내부 작업이 즉시 중단되는 것은 아니에요.

## Rx와 actor 경계를 섞을 때 원칙을 세워요

- actor 내부 상태 변경은 actor 메서드에서 완료해요.
- Rx Scheduler를 actor 격리의 대체물로 생각하지 않아요.
- `Task {}`를 `subscribe` 안에서 무제한 생성하지 말고 취소 소유자를 정해요.
- 변환은 Repository adapter나 View Model 출력처럼 한 경계에 모아요.
- UI는 Driver·Signal 또는 MainScheduler 중 한 계약으로 일관되게 전달해요.

## 자주 하는 실수

- RxSwift를 사용하면 연산자가 자동으로 백그라운드에서 실행된다고 생각해요.
- `subscribe(on:)`으로 UI 관찰 위치까지 바뀐다고 오해해요.
- `observe(on:)`을 너무 일찍 메인으로 바꿔 무거운 map·decode를 메인에서 실행해요.
- concurrent Scheduler에서 하나의 Relay 상태를 read-modify-write해 갱신을 잃어요.
- Task와 Disposable 중 어느 쪽이 취소를 소유하는지 정하지 않아요.
- 끝나지 않는 Observable의 `values`를 기다리며 상위 Task가 완료될 것으로 기대해요.

## 적용 체크리스트

- 소스 구독 위치와 이벤트 관찰 위치를 각각 설명할 수 있나요?
- UI 직전 메인 실행 계약이 있나요?
- 무거운 동기 연산이 어느 Scheduler에서 실행되는지 확인했나요?
- 상태 변경이 하나의 serial 또는 actor 경계에 있나요?
- 시간 연산을 가상 Scheduler로 테스트할 수 있나요?
- Rx↔async 변환 지점과 양쪽 취소 소유자가 명확한가요?

## 면접에서 이어질 수 있는 질문

### MainScheduler와 ConcurrentMainScheduler는 무엇이 다른가요?

MainScheduler는 `observe(on:)`으로 UI 이벤트를 전달하는 데 최적화됐고 메인에서 예약하면 즉시 실행할 수 있어요. ConcurrentMainScheduler는 `subscribe(on:)`으로 구독 작업을 메인 큐에서 시작하는 경우에 최적화돼요.

### Scheduler와 actor는 같은 문제를 해결하나요?

아니요. Scheduler는 Rx 작업과 이벤트 전달의 실행 위치·시간을 정하고, actor는 Swift 가변 상태의 격리 규칙을 컴파일러와 런타임이 관리해요. 함께 사용할 수 있지만 서로 대체하지 않아요.

## 참고 자료

- [RxSwift Schedulers 공식 설명](https://github.com/ReactiveX/RxSwift/blob/6.10.2/Documentation/Schedulers.md)
- [SchedulerType 공식 API](https://docs.rxswift.org/protocols/schedulertype)
- [MainScheduler 공식 API](https://docs.rxswift.org/classes/mainscheduler)
- [Swift Concurrency 공식 설명](https://github.com/ReactiveX/RxSwift/blob/6.10.2/Documentation/SwiftConcurrency.md)
- [RxSwift 6.10.2 릴리스 노트](https://github.com/ReactiveX/RxSwift/releases/tag/6.10.2)
