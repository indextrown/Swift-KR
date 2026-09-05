---
title: Driver, Signal과 SharedSequence
description: RxCocoa SharedSequence의 Scheduler·공유 전략과 Driver·Signal의 replay 차이, 변환 오류 정책, drive·emit 사용 기준을 UI 상태와 사건 예제로 설명합니다.
source: https://github.com/ReactiveX/RxSwift/blob/6.10.2/Documentation/Traits.md#rxcocoa-traits
reviewed: '2026-09-06'
---

# Driver, Signal과 SharedSequence

> **면접 답변 한 줄 요약:** Driver는 오류 없이 메인에서 최신 상태 1개를 공유하고, Signal은 같은 메인·오류 없음 계약을 가지면서 과거 사건을 replay하지 않는 SharedSequence예요.

Driver와 Signal은 “Observable의 다른 실행 엔진”이 아니에요. `SharedSequence<Strategy, Element>`가 Strategy에 정의된 Scheduler와 공유 방식을 적용한 RxCocoa Trait이에요.

## SharedSequence가 보장하는 것

`SharingStrategyProtocol`은 두 가지를 정해요.

1. 이벤트를 관찰할 Scheduler
2. 하나의 업스트림을 Subscriber들이 공유하는 방식

```text
Observable
  └─ asSharedSequence(error policy)
       ├─ Strategy.scheduler
       └─ Strategy.share(source)
```

SharedSequence는 오류를 타입에서 제거해요. 일반 Observable을 변환할 때는 오류를 어떤 값이나 다른 SharedSequence로 바꿀지 반드시 결정해야 해요.

## Driver의 세 계약

공식 Driver 구현은 다음 성질을 명시해요.

- 오류를 보내지 않아요.
- `MainScheduler.instance`에서 이벤트를 관찰해요.
- `share(replay: 1, scope: .whileConnected)` 전략으로 부수 효과를 공유해요.

```swift
let title: Driver<String> = titleService.load()
  .asDriver(onErrorJustReturn: "제목을 불러오지 못했어요")

title
  .drive(titleLabel.rx.text)
  .disposed(by: disposeBag)
```

Subscriber가 한 명 이상 연결된 동안 최신 값을 하나 기억하고 새 Subscriber에게 즉시 보내요. 모든 Subscriber가 사라지면 연결과 해당 replay 상태를 정리해요.

## Signal의 세 계약

Signal은 다음 성질을 가져요.

- 오류를 보내지 않아요.
- `MainScheduler.instance`에서 이벤트를 관찰해요.
- `share(scope: .whileConnected)`로 공유하며 새 Subscriber에게 과거 값을 replay하지 않아요.

```swift
let message: Signal<String> = messageRelay.asSignal()

message
  .emit(onNext: { [weak self] text in
    self?.showToast(text)
  })
  .disposed(by: disposeBag)
```

토스트, 화면 이동, 햅틱처럼 “지금 한 번 실행”해야 하는 명령형 사건에 적합해요.

## Driver와 Signal을 비교해요

| 항목             | Driver           | Signal           |
| ---------------- | ---------------- | ---------------- |
| 오류             | 없음             | 없음             |
| 관찰 Scheduler   | 메인             | 메인             |
| 업스트림 공유    | 연결된 동안 공유 | 연결된 동안 공유 |
| 새 구독자 replay | 최신 값 1개      | 없음             |
| 전용 구독 API    | `drive`          | `emit`           |
| 대표 의미        | 현재 UI 상태     | 일회성 UI 사건   |

“화면에 쓰면 모두 Driver”로 정하지 말고 replay가 맞는지 판단하세요. 화면이 다시 바인딩될 때 현재 로딩·목록 상태는 필요하지만, 과거의 alert 표시 사건은 다시 실행하면 안 돼요.

## 오류 변환 정책을 선택해요

일반 Observable을 Driver로 바꾸는 대표 방식은 세 가지예요.

```swift
let fallback = source.asDriver(
  onErrorJustReturn: State.failed
)

let replacement = source.asDriver(
  onErrorDriveWith: cachedState
)

let recovered = source.asDriver { error in
  logger.record(error)
  return .just(.failed)
}
```

| 변환                    | 적합한 상황                               |
| ----------------------- | ----------------------------------------- |
| `onErrorJustReturn`     | 항상 같은 대체 값 하나면 충분해요.        |
| `onErrorDriveWith`      | 캐시 Driver 등 준비된 대체 흐름이 있어요. |
| `onErrorRecover` 클로저 | 오류 기록과 종류별 대체 정책이 필요해요.  |

Signal도 같은 형태의 `asSignal` 오류 변환을 제공해요. 오류 없음은 “실패가 사라졌다”가 아니라 **실패를 변환 경계에서 처리했다**는 계약이어야 해요.

## 상태 enum으로 실패 의미를 보존해요

```swift
enum ProfileState {
  case idle
  case loading
  case loaded(Profile)
  case failed(String)
}

let state: Driver<ProfileState> = reload
  .flatMapLatest {
    profileService.load()
      .map(ProfileState.loaded)
      .asDriver { error in
        logger.record(error)
        return .just(.failed("프로필을 불러오지 못했어요"))
      }
      .startWith(.loading)
  }
```

오류를 빈 배열 하나로 바꾸면 “결과 없음”과 “통신 실패”가 합쳐질 수 있어요. UI가 구분해야 하는 실패는 상태의 case로 보존하세요.

## ControlProperty와 Relay는 손실 없이 변환할 수 있어요

ControlProperty는 이미 오류 없음과 메인 Scheduler 조건을 만족하므로 Driver로 바로 바꿀 수 있어요.

```swift
let query: Driver<String> = searchBar.rx.text.orEmpty
  .asDriver()
```

BehaviorRelay와 PublishRelay도 RxCocoa가 전용 변환을 제공해요.

```swift
let stateDriver = stateRelay.asDriver()
let eventSignal = eventRelay.asSignal()
```

이 변환은 외부에서 `accept`하는 쓰기 권한을 제거한 읽기 전용 UI 출력을 만드는 데 유용해요.

## `drive`와 `emit`으로 의도를 드러내요

```swift
viewModel.state
  .drive(with: self) { owner, state in
    owner.render(state)
  }
  .disposed(by: disposeBag)

viewModel.route
  .emit(with: self) { owner, route in
    owner.navigate(route)
  }
  .disposed(by: disposeBag)
```

전용 API는 오류 처리 클로저를 받지 않아요. Trait을 만들 때 오류가 제거됐기 때문이에요. 또한 공식 Driver 문서는 `drive*`, `subscribe*`, `bind*` 호출 자체를 메인 스레드에서 만들라고 안내해요. 초기 replay가 구독을 만든 스레드에서 즉시 일어날 수 있기 때문이에요.

## 여러 UI가 하나의 Driver를 공유해요

```swift
let results: Driver<[Repository]> = query
  .flatMapLatest { query in
    api.search(query: query)
      .asDriver(onErrorJustReturn: [])
  }

results
  .drive(tableView.rx.items(cellIdentifier: "Cell"))
  .disposed(by: disposeBag)

results
  .map { "\($0.count)개" }
  .drive(countLabel.rx.text)
  .disposed(by: disposeBag)
```

하나의 Driver 값을 여러 UI가 구독해도 연결 중 업스트림 계산을 공유해요. 단, 모든 Subscriber가 사라졌다가 다시 연결되면 `.whileConnected` 정책에 따라 cold 요청이 새로 시작될 수 있어요. 영구 캐시가 필요한 경우 별도 저장소를 사용하세요.

## SharedSequence와 async/await를 연결해요

Driver와 Signal은 오류가 없으므로 `values`를 `for await`로 읽을 수 있어요.

```swift
for await state in stateDriver.values {
  await auditStore.append(state)
}
```

UI 바인딩만을 위해 Driver를 async로 바꿀 필요는 없어요. 기존 async 소비자와 만나는 adapter 경계에서 사용하고 Task 취소가 Rx 구독을 끝내는지 확인하세요.

## 자주 하는 실수

- 모든 UI 출력을 Driver로 만들어 과거 사건을 replay해요.
- `asDriver(onErrorJustReturn: [])`로 실패와 빈 결과를 합쳐요.
- Driver를 영구 메모리·디스크 캐시로 생각해요.
- 백그라운드에서 `drive`를 호출하고 초기 replay 위치를 놓쳐요.
- Driver로 바꾼 뒤 다시 Observable과 Driver를 반복 변환해 계약을 흐려요.
- 하나의 View Model 출력에서 별도 Driver를 여러 번 만들어 업스트림 공유 범위를 나눠요.

## 적용 체크리스트

- 출력이 상태인지 사건인지 정했나요?
- 새 Subscriber가 최신 값을 받아야 하나요?
- 오류가 대체 값·상태·대체 흐름 중 올바른 의미로 변환됐나요?
- `drive`와 `emit` 구독을 메인에서 만들었나요?
- Driver 연결이 모두 끊긴 뒤 재구독 동작을 이해했나요?
- 영구 캐시는 별도 저장소가 담당하나요?

## 면접에서 이어질 수 있는 질문

### Driver가 네트워크 요청 중복을 막는 이유는 무엇인가요?

DriverSharingStrategy가 `share(replay: 1, scope: .whileConnected)`를 사용해 연결된 Subscriber들이 하나의 업스트림 구독을 공유하기 때문이에요.

### Signal도 현재 값을 보관하나요?

아니요. Signal은 연결된 동안 업스트림을 공유하지만 새 Subscriber에게 과거 값을 replay하지 않아요. 현재 상태가 필요하면 Driver가 더 맞아요.

## 참고 자료

- [RxCocoa Traits 공식 설명](https://github.com/ReactiveX/RxSwift/blob/6.10.2/Documentation/Traits.md#rxcocoa-traits)
- [Driver 구현](https://github.com/ReactiveX/RxSwift/blob/6.10.2/RxCocoa/Traits/Driver/Driver.swift)
- [Signal 구현](https://github.com/ReactiveX/RxSwift/blob/6.10.2/RxCocoa/Traits/Signal/Signal.swift)
- [SharedSequence 구현](https://github.com/ReactiveX/RxSwift/blob/6.10.2/RxCocoa/Traits/SharedSequence/SharedSequence.swift)
- [Driver 구독 API](https://github.com/ReactiveX/RxSwift/blob/6.10.2/RxCocoa/Traits/Driver/Driver%2BSubscription.swift)
