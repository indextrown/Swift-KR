---
title: RxSwift 연산자 — 오류·스케줄러·구독
description: catch와 retry로 오류를 복구하고 observe, subscribe, do, debug로 실행 위치와 Observable 생명주기를 다루는 방법을 설명합니다.
---

# RxSwift 연산자 — 오류·스케줄러·구독

> **면접 답변 한 줄 요약:** `catch`는 실패를 다른 흐름으로 바꾸고 `retry`는 원본을 다시 구독하며, `observe(on:)`과 `subscribe(on:)`은 각각 이벤트 전달과 구독 부수 효과가 실행될 스케줄러를 정해요.

Observable의 오류는 값 하나가 아니라 시퀀스를 끝내는 종료 이벤트예요. 따라서 복구 연산자는 오류 뒤에 같은 구독을 계속하는 것이 아니라 대체 Observable로 전환하거나 원본 Observable을 새로 구독해요.

## 오류를 다른 Observable로 바꿔요

<!-- rxswift-operator: catch -->

### `catch(_:)`

원본이 오류로 끝나면 오류를 클로저에 전달하고, 클로저가 반환한 Observable로 전환해요. 정상 완료하면 복구 클로저는 호출되지 않아요.

```swift
let products = remoteProducts()
  .catch { error in
    logger.record(error)
    return cachedProducts()
  }
```

복구 클로저 자체도 `throw`할 수 있어요. 클로저가 오류를 던지거나 대체 Observable이 실패하면 결과도 그 오류로 끝나요.

정적 `Observable.catch(_:)`는 Observable 시퀀스를 앞에서부터 구독해요. 하나가 실패하면 다음 후보로 넘어가고, 어느 후보가 정상 완료하면 전체도 완료해요.

```swift
let products = Observable.catch(sequence: [
  primaryProducts(),
  backupProducts(),
  cachedProducts(),
])
```

모든 후보가 실패하면 마지막 오류를 전달해요. 단순 대체 값이 아니라 실패 원인에 따라 다른 정책을 적용할 때 적합해요.

<!-- rxswift-operator: catchAndReturn -->

### `catchAndReturn(_:)`

오류가 오면 대체 값 하나를 보낸 뒤 정상 완료해요.

```swift
let count = loadCartCount()
  .catchAndReturn(0)
```

오류 정보를 버리므로 진단이 필요하면 앞에서 `do(onError:)`로 기록하세요. 오류와 정상적인 기본값을 도메인에서 구분해야 한다면 `Result` 같은 값으로 바꾸는 편이 더 명확할 수 있어요.

## 실패한 작업을 다시 구독해요

<!-- rxswift-operator: retry -->

### `retry(...)`

원본이 실패하면 원본 Observable을 다시 구독해요.

```swift
let response = request()
  .retry(3)
```

RxSwift의 `retry(3)`에서 `3`은 **최대 전체 시도 횟수**예요. 최초 구독 한 번과 재시도 두 번을 합쳐 최대 세 번 실행해요. 인자 없는 `retry()`는 성공하거나 구독이 폐기될 때까지 제한 없이 재시도하므로 지속적으로 실패하는 작업에 그대로 사용하지 마세요.

`retry(when:)`은 오류 Observable을 알림 Observable로 바꿔 재시도 시점과 종료 조건을 정해요.

```swift
let response = request()
  .retry { errors in
    errors
      .enumerated()
      .flatMap { attempt, error -> Observable<Int> in
        guard attempt < 2 else {
          return .error(error)
        }

        return Observable<Int>
          .timer(
            .seconds(attempt + 1),
            scheduler: MainScheduler.instance
          )
      }
  }
```

알림 Observable의 이벤트에 따라 동작이 달라져요.

| 알림 Observable의 이벤트 | 결과                                     |
| ------------------------ | ---------------------------------------- |
| `next`                   | 원본을 다시 구독해요.                    |
| `completed`              | 더 재시도하지 않고 결과를 정상 완료해요. |
| `error`                  | 해당 오류로 결과를 종료해요.             |

결제처럼 중복 실행이 위험한 작업에는 멱등성 키나 서버 정책 없이 재시도를 붙이면 안 돼요. 네트워크 오류처럼 다시 시도할 가치가 있는 오류만 선별하고, 횟수 제한과 지수 백오프를 함께 설계하세요.

## 이벤트를 받을 실행 문맥을 정해요

<!-- rxswift-operator: observe -->

### `observe(on:)`

이 연산자 뒤로 전달되는 `next`, `error`, `completed` 이벤트와 하위 연산자의 작업을 지정한 스케줄러에서 실행해요.

```swift
loadProfile()
  .observe(on: MainScheduler.instance)
  .subscribe(onNext: { profile in
    nameLabel.text = profile.name
  })
  .disposed(by: disposeBag)
```

UI 갱신 직전에 메인 스케줄러로 전환하는 식으로 사용해요. 체인에 여러 번 배치하면 각각의 위치부터 실행 문맥이 바뀌어요.

<!-- rxswift-operator: subscribe -->

### `subscribe(...)`

Observable을 구독해 실행을 시작하고 `Disposable`을 반환해요. 이벤트 전체를 받거나 `onNext`, `onError`, `onCompleted`, `onDisposed` 클로저를 나눠 전달할 수 있어요.

```swift
let disposable = loadProfile()
  .subscribe(
    onNext: { profile in
      print(profile.name)
    },
    onError: { error in
      print("실패:", error)
    },
    onCompleted: {
      print("완료")
    },
    onDisposed: {
      print("구독 정리")
    }
  )

disposable.disposed(by: disposeBag)
```

`subscribe(with:onNext:onError:onCompleted:onDisposed:)` 오버로드는 객체를 약하게 캡처해 구독 클로저와 객체 사이의 강한 참조 순환을 줄여요.

```swift
viewModel.output
  .subscribe(with: self) { owner, value in
    owner.render(value)
  }
  .disposed(by: disposeBag)
```

오류 가능한 Observable에서 `onError`를 생략하면 처리되지 않은 오류가 RxSwift의 기본 오류 처리 훅으로 전달돼요. 오류가 실제로 불가능한 계약이라면 `Infallible`, `Driver`처럼 타입으로 표현하고, 그렇지 않다면 오류 처리를 명시하세요.

### `subscribe(on:)`

`subscribe(on:)`은 원본에 대한 **구독과 구독 해제 부수 효과**가 실행될 스케줄러를 정해요. 체인 어디에 놓아도 주로 소스 쪽 동작에 영향을 줘요.

```swift
let image = decodeImage()
  .subscribe(on: ConcurrentDispatchQueueScheduler(qos: .userInitiated))
  .observe(on: MainScheduler.instance)
```

두 스케줄러 연산자의 차이를 정리하면 다음과 같아요.

| 질문                                       | 연산자           |
| ------------------------------------------ | ---------------- |
| 소스 구독과 구독 해제를 어디서 실행할까요? | `subscribe(on:)` |
| 이후 이벤트와 연산자를 어디서 실행할까요?  | `observe(on:)`   |

RxSwift 연산자는 별도 지정이 없으면 현재 실행 문맥에서 동작해요. `Observable`이라는 이유만으로 자동으로 백그라운드 실행되는 것은 아니에요.

## 생명주기에 부수 효과를 끼워 넣어요

<!-- rxswift-operator: do -->

### `do(...)`

이벤트를 바꾸지 않고 구독 생명주기를 관찰해요. 로깅, 지표 수집, 로딩 상태 변경처럼 흐름 밖의 부수 효과에 사용해요.

```swift
loadProfile()
  .do(
    onSubscribe: {
      loading.accept(true)
    },
    onNext: { profile in
      metrics.record(profile)
    },
    onError: { error in
      logger.record(error)
    },
    onDispose: {
      loading.accept(false)
    }
  )
```

값·오류·완료의 전달 전후를 관찰하는 `onNext`/`afterNext`, `onError`/`afterError`, `onCompleted`/`afterCompleted`와 `onSubscribe`, `onSubscribed`, `onDispose`를 제공해요.

`onCompleted`는 정상 완료 때만 호출되지만 `onDispose`는 정상 완료, 오류, 수동 폐기 뒤의 정리 시점에 호출돼요. `do` 클로저가 오류를 던지면 원래 이벤트 대신 그 오류로 시퀀스가 끝날 수 있으므로 관찰 코드도 안전하게 작성해야 해요.

<!-- rxswift-operator: debug -->

### `debug(...)`

구독, 이벤트, 폐기 과정을 콘솔에 출력해요. 식별자를 지정하면 여러 체인을 구분할 수 있어요.

```swift
loadProfile()
  .debug("profile-request", trimOutput: true)
  .subscribe()
  .disposed(by: disposeBag)
```

`trimOutput`은 긴 이벤트 설명을 잘라 로그 폭을 제한해요. `debug`는 개발 중 흐름을 확인하는 도구예요. 운영 환경의 구조화된 로깅, 개인정보 마스킹, 장애 추적은 별도 로거로 설계하세요.

## 종료와 폐기를 구분해요

| 상황                    | `completed`/`error` | 구독 폐기 | `onDispose` |
| ----------------------- | ------------------- | --------- | ----------- |
| 정상 완료               | `completed`         | 실행됨    | 호출됨      |
| 오류 종료               | `error`             | 실행됨    | 호출됨      |
| `dispose()`로 조기 중단 | 전달되지 않음       | 실행됨    | 호출됨      |

구독을 폐기하면 이후 이벤트 전달을 중단하지만, 사용자 정의 Observable이 반환한 Disposable에서 기반 작업 취소를 구현해야 네트워크 요청이나 타이머 같은 실제 자원도 중단돼요.

## 참고 자료

- [ObservableType 공식 API](https://docs.rxswift.org/protocols/observabletype)
- [오류 처리 연산자 구현](https://github.com/ReactiveX/RxSwift/tree/6.10.2/RxSwift/Observables)
- [Schedulers 문서](https://github.com/ReactiveX/RxSwift/blob/6.10.2/Documentation/Schedulers.md)
- [RxSwift Hooks](https://docs.rxswift.org/enums/hooks)
