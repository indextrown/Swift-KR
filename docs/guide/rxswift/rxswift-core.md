---
title: RxSwift 핵심 구조와 생명 주기
description: RxSwift의 모듈 구조, Observable 이벤트 계약, 구독과 폐기, cold·hot 시퀀스, 공유, Scheduler와 Swift Concurrency 연동을 공식 문서 기준으로 설명합니다.
source: https://github.com/ReactiveX/RxSwift/tree/6.10.2
reviewed: '2026-09-06'
---

# RxSwift 핵심 구조와 생명 주기

> **면접 답변 한 줄 요약:** RxSwift는 `Observable`이 값을 밀어 보내고 Observer가 구독하는 모델이며, 이벤트 종료 규칙과 `Disposable` 수명, 실행 Scheduler, 공유 범위를 함께 설계해야 안전하게 사용할 수 있어요.

연산자 이름을 많이 아는 것만으로는 RxSwift 코드를 안정적으로 만들기 어려워요. 같은 네트워크 Observable을 두 번 구독하면 요청도 두 번 실행될 수 있고, `dispose()`와 `.completed`를 같다고 생각하면 취소와 정상 종료를 잘못 모델링할 수 있어요.

이 문서는 **RxSwift 6.10.2** 공식 저장소와 API 문서를 기준으로 코어 모듈의 실행 원리를 설명해요. 개별 연산자의 사용법은 [모든 연산자 문서](./operators-create-convert)에서 이어서 볼 수 있어요.

## 먼저 알아둘 용어

| 용어                   | 뜻                                                                                                |
| ---------------------- | ------------------------------------------------------------------------------------------------- |
| push                   | 생산자가 준비된 값을 소비자에게 보내는 방식이에요. Observable은 Observer에게 이벤트를 push해요.   |
| pull                   | 소비자가 다음 값을 직접 요청해 가져오는 방식이에요. Swift의 일반 `Sequence` 순회가 대표적이에요.  |
| 구독(subscription)     | Observable과 Observer를 연결해 이벤트 전달을 시작하는 관계예요.                                   |
| 부수 효과(side effect) | 네트워크 요청, 파일 읽기, 로그 기록처럼 값을 계산하는 것 외에 외부 상태에 영향을 주는 작업이에요. |
| 종료 이벤트            | `.completed` 또는 `.error`예요. 둘 중 하나가 오면 해당 구독에는 다음 이벤트가 더 오지 않아요.     |
| disposal               | 소비자가 구독을 끊고 관련 자원을 정리하는 동작이에요. 생산자가 보내는 종료 이벤트와는 달라요.     |
| cold Observable        | 보통 구독할 때마다 값 생산과 부수 효과를 새로 시작하는 Observable이에요.                          |
| hot Observable         | 구독 여부와 무관하게 진행되는 값 생산을 여러 Observer가 바라보는 Observable이에요.                |
| Scheduler              | 구독, 이벤트 전달, 시간 기반 작업을 언제 어디에서 실행할지 표현하는 RxSwift의 추상화예요.         |
| serialization          | 한 구독의 이벤트가 동시에 겹쳐 전달되지 않도록 순서 있게 처리되는 성질이에요.                     |

## RxSwift 모듈의 의존 관계를 먼저 봐요

공식 저장소의 모듈 의존 관계를 단순화하면 다음과 같아요.

```text
RxCocoa ───────┐
   │           │
   ▼           ▼
RxRelay ───▶ RxSwift ◀── RxTest
                 ▲
                 └────── RxBlocking
```

- `RxSwift`는 Observable, Subject, Scheduler, Disposable과 코어 Trait을 제공하며 다른 Rx 모듈에 의존하지 않아요.
- `RxRelay`는 RxSwift에 의존하고, 종료되지 않는 값 통로인 Relay를 제공해요.
- `RxCocoa`는 RxSwift와 RxRelay에 의존하고 UIKit·AppKit 등 Apple UI 프레임워크를 Rx 형태로 연결해요.
- `RxTest`와 `RxBlocking`은 테스트를 위한 별도 제품이에요.

화면과 무관한 도메인·데이터 계층은 가능하면 `RxSwift`만 알아도 되게 만들고, UIKit 바인딩이 필요한 화면 계층에서 `RxCocoa`를 가져오면 모듈 경계가 선명해져요. 상태와 이벤트를 종료 없는 입력으로 노출해야 할 때만 `RxRelay`를 선택하세요.

## Sequence와 Observable은 방향이 달라요

일반 `Sequence`는 소비자가 `next()`를 호출해 값을 하나씩 가져와요. 반면 Observable은 시간이 지나며 생긴 이벤트를 Observer에게 보내요.

```text
Sequence:   Consumer ── next() ──▶ Producer
Observable: Producer ── Event ───▶ Observer
```

그래서 배열뿐 아니라 버튼 탭, 위치 변화, 소켓 메시지, 네트워크 응답처럼 **도착 시점과 개수가 고정되지 않은 값**도 하나의 인터페이스로 조합할 수 있어요.

```swift
import RxSwift

let temperatures = Observable.of(19, 21, 23)

temperatures
  .map { "현재 온도: \($0)℃" }
  .subscribe(onNext: { text in
    print(text)
  })
  .dispose()
```

Observable은 값을 동기적으로 보낼 수도 있어요. `Observable.of`는 `subscribe` 호출 안에서 모든 값을 바로 보내고 완료하므로, “Observable은 항상 비동기”라고 이해하면 안 돼요.

## 이벤트 문법은 한 방향으로만 끝나요

Observable이 Observer에게 보낼 수 있는 문법은 다음과 같아요.

```text
next* (error | completed)?
```

1. `.next(element)`는 0번 이상 보낼 수 있어요.
2. `.error(error)`와 `.completed`는 둘 중 하나만 최대 한 번 보낼 수 있어요.
3. 종료 이벤트 뒤에는 다른 이벤트가 올 수 없어요.
4. 버튼 탭처럼 종료 이벤트 없이 계속 살아 있는 시퀀스도 가능해요.

이 규칙 덕분에 다운스트림 연산자는 “오류 뒤에 값이 다시 올지”를 매번 방어하지 않아도 돼요. 실패 후 다시 값을 받고 싶다면 같은 Observable이 되살아나는 것이 아니라 `catch`로 대체 시퀀스를 연결하거나 `retry`로 새 구독을 만들어야 해요.

## subscribe는 관찰을 시작하고 Disposable을 돌려줘요

```swift
let disposeBag = DisposeBag()

Observable.of("Swift", "RxSwift")
  .subscribe(
    onNext: { value in
      print("값:", value)
    },
    onError: { error in
      print("오류:", error)
    },
    onCompleted: {
      print("완료")
    },
    onDisposed: {
      print("자원 정리")
    }
  )
  .disposed(by: disposeBag)
```

- `subscribe`는 Observer를 연결하고 `Disposable`을 반환해요.
- Observable이 `.completed` 또는 `.error`를 보내면 해당 구독의 자원이 정리돼요.
- 소비자가 먼저 `dispose()`해도 구독과 기반 작업을 정리할 수 있어요.
- `DisposeBag`은 자신이 해제될 때 보관한 Disposable을 모두 폐기해요.

### `dispose()`는 `.completed`가 아니에요

`.completed`는 생산자가 Observer에게 보내는 **정상 종료 이벤트**예요. `dispose()`는 소비자가 더는 결과가 필요 없다고 알려 **연결을 끊는 동작**이에요. 따라서 폐기된 Observer의 `onCompleted`가 호출된다고 기대하면 안 돼요.

또한 이벤트 생산과 폐기를 서로 다른 Scheduler에서 동시에 실행하면 폐기 시점과 이미 진행 중인 이벤트가 경쟁할 수 있어요. “`dispose()` 호출 뒤에는 어떤 상황에서도 값이 단 한 개도 도착하지 않는다”는 보장이 필요하다면 같은 serial Scheduler에서 생산과 폐기를 순서화하거나, UI 계층에서 최신 요청 식별자 같은 별도 상태 검증을 함께 사용하세요.

## create에서는 취소 방법까지 반환해요

`Observable.create`는 이벤트를 보내는 방법뿐 아니라 구독이 끝날 때 기반 작업을 취소하는 방법도 정의해야 해요.

```swift
import Foundation
import RxSwift

struct Profile: Decodable {
  let name: String
}

enum ProfileError: Error {
  case missingData
}

let profileURL = URL(string: "https://example.com/profile")!

func fetchProfile() -> Observable<Profile> {
  Observable.create { observer in
    let task = URLSession.shared.dataTask(with: profileURL) { data, _, error in
      if let error {
        observer.onError(error)
        return
      }

      guard let data else {
        observer.onError(ProfileError.missingData)
        return
      }

      do {
        let profile = try JSONDecoder().decode(Profile.self, from: data)
        observer.onNext(profile)
        observer.onCompleted()
      } catch {
        observer.onError(error)
      }
    }

    task.resume()

    return Disposables.create {
      task.cancel()
    }
  }
}
```

핵심은 세 가지예요.

1. 모든 성공 경로는 필요한 값을 보낸 뒤 정상 완료해요.
2. 실패 경로는 오류 하나로 끝내요.
3. 반환한 Disposable에서 `URLSessionTask.cancel()`처럼 실제 기반 작업을 취소해요.

한 번의 비동기 결과라면 값 개수 계약이 더 분명한 `Single<Profile>`이 적합할 수 있어요. 이 예제는 `create`의 생명 주기를 보여 주기 위해 Observable을 사용했어요.

## cold Observable은 구독마다 부수 효과를 반복해요

위 `fetchProfile()`은 cold Observable이에요. Observable 값을 변수에 한 번 담았더라도 구독을 두 번 하면 `create` 클로저도 두 번 실행돼 네트워크 요청이 두 번 시작돼요.

```swift
let profile = fetchProfile()

profile.subscribe(onNext: { print("이름:", $0.name) })
profile.subscribe(onNext: { print("로그:", $0.name) })
```

요청 하나의 결과를 화면 표시와 로그에 함께 쓰려는 의도라면 공유 범위를 명시하세요.

```swift
let sharedProfile = fetchProfile()
  .share(replay: 1, scope: .whileConnected)

sharedProfile
  .map(\.name)
  .subscribe(onNext: { print("이름:", $0) })
  .disposed(by: disposeBag)

sharedProfile
  .subscribe(onNext: { print("로그:", $0.name) })
  .disposed(by: disposeBag)
```

### 공유 옵션을 의도로 선택해요

| 선택                                | 늦은 구독자에게 과거 값 | 연결 수명                                                  | 적합한 상황                         |
| ----------------------------------- | ----------------------- | ---------------------------------------------------------- | ----------------------------------- |
| 공유하지 않음                       | 해당 없음               | Subscriber마다 독립                                        | 구독마다 새 작업이 필요한 요청      |
| `share(replay: 0, .whileConnected)` | 없음                    | Subscriber가 모두 사라지면 연결과 상태를 버려요.           | 일회성 UI 이벤트                    |
| `share(replay: 1, .whileConnected)` | 연결 중 최신 값 1개     | Subscriber가 모두 사라지면 연결과 replay 상태를 버려요.    | 화면이 살아 있는 동안 공유하는 상태 |
| `share(replay: 1, .forever)`        | 최신 값 1개             | 연결이 끊겨도 같은 공유 Subject의 종료·replay 상태를 써요. | 의도적으로 오래 유지할 결과         |

`replay`는 “캐시처럼 보이는 동작”이지 디스크 캐시나 영구 저장소가 아니에요. 메모리에 남길 값의 크기, 오류·완료를 새 구독자에게 재생할지, Subscriber가 0명이 됐을 때 상태를 버릴지를 함께 정해야 해요. 자세한 연결 동작은 [공유와 연결](./operators-share-connect)에서 설명해요.

## hot과 cold는 타입 이름이 아니라 생산 방식이에요

`Observable<Element>` 타입만 보고 hot인지 cold인지 알 수 없어요.

- `Observable.just`, `deferred`, 일반 네트워크 래퍼는 보통 cold예요.
- 버튼 탭, NotificationCenter, 이미 작동 중인 위치 센서, Subject는 보통 hot한 성격을 가져요.
- cold Observable도 `share`, `publish`, `replay`로 하나의 구독을 여러 Observer가 보게 만들 수 있어요.

hot 시퀀스에 늦게 구독하면 이전 값을 놓칠 수 있어요. 이전 값이 필요한 **상태**라면 `BehaviorRelay`, `Driver`, 제한된 `replay`처럼 최신 값을 보존하는 모델이 맞는지 확인하세요. 반대로 탭이나 토스트 같은 **사건**에 replay를 적용하면 화면 재구성 때 과거 사건이 다시 실행될 수 있어요.

## Scheduler는 두 질문으로 나눠요

RxSwift에서 자주 혼동하는 두 연산자는 영향을 주는 범위가 달라요.

| 연산자           | 바꾸는 것                                                      |
| ---------------- | -------------------------------------------------------------- |
| `subscribe(on:)` | 소스의 구독 시작과 구독 해제 작업이 실행될 Scheduler를 정해요. |
| `observe(on:)`   | 이 연산자 아래로 이벤트가 전달될 Scheduler를 정해요.           |

```swift
let background = SerialDispatchQueueScheduler(qos: .userInitiated)

fetchProfile()
  .subscribe(on: background)
  .map(\.name)
  .observe(on: MainScheduler.instance)
  .subscribe(onNext: { name in
    // 메인 스레드에서 UI를 갱신해요.
    print(name)
  })
  .disposed(by: disposeBag)
```

`subscribe(on:)`을 파이프라인 여러 곳에 붙여도 가장 가까운 소스의 구독 동작을 이해하기 어려워질 수 있어요. 무거운 작업을 만드는 경계에 한 번 두고, UI 직전에는 `observe(on: MainScheduler.instance)` 또는 RxCocoa의 `Driver`처럼 메인 실행 계약이 타입에 담긴 도구를 선택하는 편이 읽기 쉬워요.

::::warning 모든 연산자가 비동기 경계를 만들지는 않아요
`map`, `filter`, `scan` 같은 연산자는 별도 Scheduler를 지정하지 않으면 이벤트가 들어온 실행 문맥에서 동기적으로 처리돼요. RxSwift를 썼다는 이유만으로 무거운 계산이 자동으로 백그라운드로 이동하지 않아요.
::::

## Subject, Relay, Trait의 경계를 구분해요

| 요구사항                                      | 우선 고려할 타입            |
| --------------------------------------------- | --------------------------- |
| 외부 콜백에서 값·오류·완료를 모두 넣어야 해요 | `PublishSubject` 등 Subject |
| 종료 없이 상태를 저장하고 새 구독자에게 줘요  | `BehaviorRelay`             |
| 종료 없이 새 사건만 전달해요                  | `PublishRelay`              |
| 비동기 결과가 정확히 하나예요                 | `Single`                    |
| 비동기 결과가 없을 수도 있어요                | `Maybe`                     |
| UI 상태를 메인에서 최신 값과 함께 공유해요    | RxCocoa `Driver`            |
| UI 사건을 메인에서 과거 재생 없이 전달해요    | RxCocoa `Signal`            |

Subject와 Relay는 값을 외부에서 주입할 수 있으므로 편리하지만, 공개 프로퍼티로 그대로 노출하면 어느 코드가 상태를 바꾸는지 추적하기 어려워져요. 입력 메서드는 좁게 유지하고 외부에는 `Observable`, `Driver`, `Signal` 같은 읽기 전용 형태를 노출하세요. 구체적인 선택은 [RxRelay 상태와 이벤트](./rxrelay)에서 다뤄요.

## Swift Concurrency와 필요한 경계에서 변환해요

RxSwift 6.10.2는 Observable과 `AsyncSequence` 사이의 브리지를 제공해요.

### Observable을 `for await`로 읽어요

```swift
let task = Task {
  do {
    for try await profile in fetchProfile().values {
      print(profile.name)
    }
  } catch is CancellationError {
    print("작업 취소")
  } catch {
    print("조회 실패:", error)
  }
}

task.cancel()
```

일반 Observable은 오류가 날 수 있으므로 `values`가 `AsyncThrowingStream` 성격의 비동기 시퀀스를 제공해요. `Infallible`, `Driver`, `Signal`처럼 오류가 없는 타입의 `values`는 오류 없는 비동기 시퀀스로 순회할 수 있어요.

### AsyncSequence를 Observable로 바꿔요

```swift
let stream = AsyncStream<Int> { continuation in
  continuation.yield(1)
  continuation.yield(2)
  continuation.finish()
}

stream
  .asObservable()
  .subscribe(onNext: { value in
    print(value)
  })
  .disposed(by: disposeBag)
```

변환은 앱 전체를 한 번에 Rx 또는 async/await로 통일하기 위한 의무가 아니에요. 기존 Rx 파이프라인과 새 async API가 만나는 **어댑터 경계 한 곳**에서 변환하고, 내부 계층은 한 가지 추상화를 유지하면 취소와 오류 흐름을 추적하기 쉬워요.

## 자주 하는 실수를 점검해요

### 구독할 때마다 요청이 다시 실행되는 것을 놓쳐요

원인은 cold Observable을 여러 번 구독한 것이에요. 하나의 작업을 공유할 의도라면 `share` 또는 적절한 Trait을 경계에서 적용하고, replay 개수와 scope를 명시하세요.

### DisposeBag을 전역 저장소처럼 사용해요

DisposeBag이 오래 살수록 그 안의 구독도 오래 살아요. 화면 전용 구독은 View Controller나 View Model처럼 같은 수명의 객체가 소유해야 해요. 재사용 셀은 `prepareForReuse()`에서 셀 전용 bag을 교체하는 패턴을 고려하세요.

### 오류가 나도 이후 값이 계속 올 것으로 기대해요

`.error`는 해당 구독을 종료해요. 계속 관찰하려면 오류를 값으로 모델링하거나 `catch`, `retry`로 새 시퀀스 또는 새 구독 규칙을 설계하세요.

### 모든 작업이 자동으로 직렬화된다고 생각해요

Rx 규약은 한 구독의 이벤트를 순서 있게 전달하는 것을 전제로 하지만, 여러 Subject·Relay·Scheduler가 공유 가변 상태를 동시에 수정하는 문제까지 해결하지 않아요. 상태 소유자와 직렬 실행 경계를 별도로 정해야 해요.

## 적용 체크리스트

- Observable이 몇 개의 값을 보내고 어떻게 끝나는지 계약을 설명할 수 있나요?
- Observable이 cold인지 hot인지, 구독마다 어떤 부수 효과가 실행되는지 확인했나요?
- 공유한다면 `replay` 개수와 `.whileConnected`·`.forever` 범위를 의도적으로 선택했나요?
- `Disposable`과 `DisposeBag`의 수명이 화면·요청·서비스 수명과 일치하나요?
- `subscribe(on:)`과 `observe(on:)`을 각각 왜 쓰는지 설명할 수 있나요?
- UI 갱신 직전의 메인 실행 계약이 보장되나요?
- 오류, 정상 완료, 소비자 취소를 서로 다른 경로로 처리하나요?
- async/await 변환이 여러 계층에 흩어지지 않고 경계에 모여 있나요?

## 면접에서 이어질 수 있는 질문

### Observable은 항상 비동기로 동작하나요?

아니요. Observable은 이벤트를 push하는 추상화일 뿐이고, `just`나 `of`처럼 구독 호출 안에서 동기적으로 값을 보낼 수도 있어요. 실제 실행 위치는 소스 구현과 Scheduler 연산자에 따라 달라져요.

### `subscribe(on:)`과 `observe(on:)`은 무엇이 다른가요?

`subscribe(on:)`은 소스 구독과 해제의 실행 위치에 영향을 주고, `observe(on:)`은 이후 다운스트림으로 이벤트를 전달할 위치를 바꿔요.

### `share(replay: 1)`은 영구 캐시인가요?

아니요. 구독 하나를 공유하고 메모리에서 최근 이벤트를 재생하는 연산이에요. scope와 소스 종료 여부에 따라 연결과 replay 상태가 사라질 수 있고, 앱 재실행 뒤에도 유지되는 영구 저장소는 아니에요.

### `dispose()` 뒤에 `.completed`가 호출되나요?

그렇지 않아요. `dispose()`는 소비자가 연결을 폐기하는 동작이고 `.completed`는 생산자가 보내는 정상 종료 이벤트예요. 두 생명 주기는 같은 의미가 아니에요.

## 참고 자료

- [ReactiveX/RxSwift 6.10.2](https://github.com/ReactiveX/RxSwift/tree/6.10.2)
- [RxSwift 공식 API 문서](https://docs.rxswift.org/)
- [Getting Started](https://github.com/ReactiveX/RxSwift/blob/6.10.2/Documentation/GettingStarted.md)
- [Observable 공식 API](https://docs.rxswift.org/classes/observable)
- [Hot and Cold Observables](https://github.com/ReactiveX/RxSwift/blob/6.10.2/Documentation/HotAndColdObservables.md)
- [Schedulers](https://github.com/ReactiveX/RxSwift/blob/6.10.2/Documentation/Schedulers.md)
- [Subjects](https://github.com/ReactiveX/RxSwift/blob/6.10.2/Documentation/Subjects.md)
- [Swift Concurrency](https://github.com/ReactiveX/RxSwift/blob/6.10.2/Documentation/SwiftConcurrency.md)
