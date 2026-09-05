---
title: Subject와 RxSwift Traits
description: PublishSubject·BehaviorSubject·ReplaySubject·AsyncSubject의 이벤트 보관 차이와 Single·Maybe·Completable·Infallible의 값·오류 계약을 비교합니다.
source: https://github.com/ReactiveX/RxSwift/blob/6.10.2/Documentation/Traits.md
reviewed: '2026-09-06'
---

# Subject와 RxSwift Traits

> **면접 답변 한 줄 요약:** Subject는 외부 이벤트를 Observable 세계로 넣는 양방향 경계이고, Trait은 Observable이 보낼 값의 개수와 실패 가능성을 타입으로 좁혀 호출자에게 계약을 전달해요.

Subject와 Trait은 모두 Observable과 관련되지만 방향이 달라요. Subject는 값을 **넣는 기능**을 추가하고, Trait은 값을 **읽는 규칙**을 더 엄격하게 표현해요.

## Subject는 Observer이면서 Observable이에요

```text
외부 콜백 ── onNext/onError/onCompleted ──▶ Subject ── subscribe ──▶ Observer
```

Subject를 사용하면 delegate, Notification, SDK callback처럼 Rx가 아닌 입력을 파이프라인에 연결할 수 있어요. 반면 여러 곳이 같은 Subject에 값을 넣으면 상태 변경 출처가 감춰지므로 소유자를 좁게 유지해야 해요.

## 네 Subject의 보관 규칙

| 타입                       | 구독 직후 받는 값                           | 대표 용도                     |
| -------------------------- | ------------------------------------------- | ----------------------------- |
| `PublishSubject<Element>`  | 구독 이후 새로 들어오는 값만 받아요.        | 실시간 사건, callback adapter |
| `BehaviorSubject<Element>` | 초기값 또는 가장 최근 값 1개를 먼저 받아요. | 종료 가능한 현재 상태         |
| `ReplaySubject<Element>`   | 정한 버퍼의 과거 값을 순서대로 받아요.      | 제한된 기록 재생              |
| `AsyncSubject<Element>`    | 정상 완료 시 마지막 값 1개와 완료를 받아요. | 완료 시점의 최종 결과         |

모든 Subject는 `.error`나 `.completed`로 종료될 수 있고, 종료 뒤 새 값을 받지 않아요.

## PublishSubject는 과거 사건을 보관하지 않아요

```swift
let subject = PublishSubject<String>()

subject.onNext("구독 전")

subject
  .subscribe(onNext: { print($0) })
  .disposed(by: disposeBag)

subject.onNext("구독 후")
// 구독 후
```

구독 전 값이 필요한 상태라면 PublishSubject가 아니라 BehaviorSubject 또는 상태 저장소를 고려하세요. 과거 사건이 필요하지 않은데 ReplaySubject를 쓰면 화면 재구성 시 옛 사건이 다시 실행될 수 있어요.

## BehaviorSubject는 최신 값과 종료를 함께 표현해요

```swift
let subject = BehaviorSubject(value: ConnectionState.disconnected)

let current = try subject.value()
print(current)

subject.onNext(.connecting)
subject.onNext(.connected)
subject.onCompleted()
```

`value()`는 최신 값을 동기적으로 읽지만 Subject가 오류로 종료됐다면 그 오류를 throw할 수 있어요. 종료 없는 앱 상태가 필요하고 오류를 값으로 표현한다면 `BehaviorRelay.value`가 더 단순해요.

## ReplaySubject의 버퍼를 제한해요

```swift
let subject = ReplaySubject<String>.create(bufferSize: 2)

subject.onNext("A")
subject.onNext("B")
subject.onNext("C")

subject
  .subscribe(onNext: { print($0) })
  .disposed(by: disposeBag)

// B, C
```

`createUnbounded()`는 모든 값을 보관하므로 값 개수와 크기에 상한이 없는 스트림에는 사용하지 마세요. replay는 메모리 이벤트 재생이고 디스크 캐시가 아니에요.

## AsyncSubject는 완료돼야 마지막 값을 보내요

```swift
let subject = AsyncSubject<Int>()

subject.onNext(1)
subject.onNext(2)
subject.onNext(3)
subject.onCompleted()

// Observer는 3과 completed를 받아요.
```

정상 완료 전에 여러 값을 받아도 마지막 값만 보관했다가 완료와 함께 전달해요. 값 없이 완료하면 값 없이 완료하고, 오류로 끝나면 보관한 값 대신 오류를 전달해요. 한 번의 결과를 직접 만드는 앱 API라면 대개 `Single`이 더 명확해요.

## Subject를 외부에 그대로 공개하지 않아요

```swift
final class SessionStore {
  private let stateSubject = BehaviorSubject(
    value: SessionState.signedOut
  )

  var state: Observable<SessionState> {
    stateSubject.asObservable()
  }
}
```

구독자는 상태를 읽을 수 있지만 `onNext`, `onError`, `onCompleted`로 내부 상태를 바꿀 수 없어요. 입력은 의도가 드러나는 메서드로 제한하세요.

## Trait은 Observable의 제약을 타입에 담아요

Trait은 별도 이벤트 엔진이 아니라 하나의 Observable을 감싼 구조예요. `asObservable()`로 다시 일반 Observable로 바꿀 수 있고, 계약을 보존하는 연산자를 연결할 수 있어요.

| Trait                 | 성공 값 수   | 실패 | 정상 완료의 의미         | 부수 효과 공유  |
| --------------------- | ------------ | ---- | ------------------------ | --------------- |
| `Single<Element>`     | 정확히 1개   | 가능 | 성공 값 하나로 종료      | 기본 공유 안 함 |
| `Maybe<Element>`      | 0개 또는 1개 | 가능 | 값이 없을 수도 있는 종료 | 기본 공유 안 함 |
| `Completable`         | 0개          | 가능 | 값 없이 작업 성공        | 기본 공유 안 함 |
| `Infallible<Element>` | 0개 이상     | 불가 | 선택적으로 정상 완료     | 소스에 따름     |

Trait이 부수 효과를 자동 공유한다고 생각하면 안 돼요. Single도 두 번 구독하면 cold 네트워크 요청이 두 번 실행될 수 있어요.

## Single은 결과 하나를 표현해요

```swift
let profile: Single<Profile> = Single.create { single in
  let task = service.loadProfile { result in
    single(result)
  }

  return Disposables.create {
    task.cancel()
  }
}
```

Single은 `.success(Element)` 또는 `.failure(Error)` 중 하나로 끝나요. HTTP 응답 하나, 데이터베이스 조회 하나처럼 결과 개수가 정확히 하나일 때 적합해요.

## Maybe는 값이 없음을 정상 결과로 표현해요

```swift
let cachedProfile: Maybe<Profile> = cache.profile()

cachedProfile
  .subscribe(
    onSuccess: { profile in
      print(profile)
    },
    onError: { error in
      print(error)
    },
    onCompleted: {
      print("캐시 없음")
    }
  )
  .disposed(by: disposeBag)
```

값 없음이 오류가 아닌 캐시 miss나 조건부 조회에 맞아요. “값 없음”이 도메인에서 실제 상태인지, `Single<Profile?>`이 호출자에게 더 익숙한지 팀 기준으로 선택하세요.

## Completable은 값 없는 성공과 실패를 표현해요

```swift
let saved: Completable = repository.save(draft)

saved
  .andThen(repository.loadDraft())
  .subscribe(onSuccess: { draft in
    print(draft)
  })
  .disposed(by: disposeBag)
```

저장·삭제·로그아웃처럼 반환 값보다 성공 여부가 중요한 작업에 적합해요. `Observable<Void>`와 달리 next 값을 보내지 않는 계약이 타입에 드러나요.

## Infallible은 실패하지 않는 여러 값을 표현해요

```swift
let appPhase: Infallible<AppPhase> = phaseObservable
  .asInfallible(onErrorRecover: { error in
    logger.record(error)
    return .just(.inactive)
  })
```

오류를 타입에서 제거하려면 반드시 대체 값이나 대체 시퀀스 정책이 필요해요. 오류를 숨기는 도구로 쓰지 말고 실패가 정말 계약상 불가능하거나 이미 값 상태로 변환된 경계에서 사용하세요.

## Observable에서 Trait으로 바꿀 때 이벤트 수를 검증해요

```swift
let single = Observable.of(1, 2)
  .asSingle()
```

`asSingle()`은 여러 값을 자동으로 첫 값 하나로 줄이지 않아요. 값이 두 개면 계약 위반 오류가 나요. 첫 값이 의도라면 `take(1)` 또는 `first`, 유일한 값이어야 한다면 `single()`처럼 선택 규칙을 먼저 표현하세요.

## 자주 하는 실수

- 상태를 PublishSubject로 만들어 새 구독자가 현재 값을 모르게 해요.
- 탭 사건을 ReplaySubject로 재생해 화면 재진입 때 다시 실행해요.
- Subject를 public으로 노출해 누구나 종료시킬 수 있게 해요.
- Single은 구독을 자동 공유한다고 생각해 요청을 중복 실행해요.
- `asSingle()`이 여러 값 중 하나를 알아서 고른다고 생각해요.
- 오류를 무조건 fallback으로 바꾸고 원인 기록과 실패 UI를 잃어요.

## 적용 체크리스트

- 외부 이벤트를 Rx로 넣어야 해서 Subject가 필요한가요?
- 새 구독자가 과거 값 또는 최신 값을 받아야 하나요?
- Subject 소유자만 쓰기·종료 권한을 가지나요?
- 공개 API가 값의 개수와 실패 가능성을 가장 좁은 Trait으로 표현하나요?
- Trait 변환 전 실제 이벤트 개수를 검증했나요?
- 여러 구독에서 부수 효과를 공유해야 하는지 정했나요?

## 면접에서 이어질 수 있는 질문

### BehaviorSubject와 BehaviorRelay는 무엇이 다른가요?

둘 다 최신 값 하나를 보관하지만 BehaviorSubject는 오류와 완료로 종료될 수 있고 `value()`가 throw할 수 있어요. BehaviorRelay는 값만 accept하고 종료 API가 없으며 최신 값을 `value`로 읽어요.

### Single과 Observable의 실행 방식이 다른가요?

Single은 Observable 위에 값 하나 또는 오류 하나라는 계약을 표현한 PrimitiveSequence예요. 별도 네트워크 엔진이 아니며 cold 소스라면 구독마다 부수 효과가 실행되는 점도 같아요.

## 참고 자료

- [RxSwift Subjects 공식 설명](https://github.com/ReactiveX/RxSwift/blob/6.10.2/Documentation/Subjects.md)
- [Subjects 공식 API](https://docs.rxswift.org/rxswift/subjects)
- [Traits 공식 설명](https://github.com/ReactiveX/RxSwift/blob/6.10.2/Documentation/Traits.md)
- [PrimitiveSequence 공식 API](https://docs.rxswift.org/structs/primitivesequence)
- [Infallible 공식 API](https://docs.rxswift.org/structs/infallible)
