---
title: RxSwift 연산자 — Traits와 폐기 API
description: Single, Maybe, Completable, Infallible의 계약과 전용 연산자를 익히고 RxSwift 6의 폐기 연산자를 최신 이름으로 마이그레이션합니다.
---

# RxSwift 연산자 — Traits와 폐기 API

> **면접 답변 한 줄 요약:** Traits는 Observable 위에 값 개수와 오류 가능성 계약을 타입으로 표현하고, RxSwift 6에서 폐기된 옛 연산자 이름은 Swift API Design Guidelines에 맞춘 최신 이름으로 바꿔야 해요.

`Single`, `Maybe`, `Completable`, `Infallible`은 별도 실행 엔진이 아니라 제한된 이벤트 문법을 표현하는 `PrimitiveSequence`예요. 일반 Observable 연산자 대부분을 같은 의미로 사용하면서 반환 타입의 계약을 유지할 수 있어요.

## Traits의 이벤트 계약을 구분해요

| Trait           | 성공 시 값 수 | 실패 가능 | 대표 용도                        |
| --------------- | ------------- | --------- | -------------------------------- |
| `Single<T>`     | 정확히 1개    | 가능      | 네트워크 응답, 한 번의 조회      |
| `Maybe<T>`      | 0개 또는 1개  | 가능      | 캐시 조회, 선택적인 검색 결과    |
| `Completable`   | 0개           | 가능      | 저장·삭제의 성공 여부            |
| `Infallible<T>` | 0개 이상      | 불가능    | 오류가 없는 상태와 이벤트 스트림 |

Observable에서 Trait으로 변환하는 `asSingle`, `asMaybe`, `asCompletable`, `asInfallible`과 Swift Concurrency의 `value`는 [생성과 변환](/guide/rxswift/operators-create-convert)에서 설명해요.

Trait의 계약과 실제 이벤트가 맞지 않으면 변환 뒤 오류가 날 수 있어요. 예를 들어 값이 둘 이상인 Observable에 `asSingle()`을 적용하면 성공 하나로 축약되지 않아요. 먼저 `take(1)`이나 `single()`처럼 의도한 선택 규칙을 표현하세요.

## Completable이 끝난 뒤 다음 작업을 시작해요

<!-- rxswift-operator: andThen -->

### `andThen(_:)`

Completable이 정상 완료하면 두 번째 `Completable`, `Single`, `Maybe` 또는 Observable을 구독해요. 첫 작업이 실패하면 두 번째 작업은 시작하지 않고 오류를 전달해요.

```swift
let refreshedUser: Single<User> = refreshToken()
  .andThen(loadCurrentUser())
```

인증 토큰 저장 뒤 사용자 조회, 파일 쓰기 뒤 인덱싱처럼 **첫 단계의 값은 없고 성공 여부만 다음 단계의 시작 조건**일 때 적합해요. 일반 Observable의 `concat`과 비슷하지만 첫 시퀀스의 성공 값이 없다는 계약이 타입에 드러나요.

## 성공 값을 다른 Trait 작업으로 바꿔요

<!-- rxswift-operator: flatMapCompletable -->

### `flatMapCompletable(_:)`

`Single`의 성공 값을 받아 `Completable` 작업을 만들어요.

```swift
let saved: Completable = loadDraft()
  .flatMapCompletable { draft in
    repository.save(draft)
  }
```

원본 Single이나 내부 Completable이 실패하면 그 오류를 전달해요. 성공 값에서 후속 작업의 성공 여부만 필요할 때 사용하세요.

<!-- rxswift-operator: flatMapMaybe -->

### `flatMapMaybe(_:)`

`Single`의 성공 값을 `Maybe`로 바꿔 결과가 없을 수도 있는 후속 조회를 표현해요.

```swift
let cachedProfile: Maybe<Profile> = currentUserID()
  .flatMapMaybe { id in
    cache.profile(id: id)
  }
```

원본 Single이나 내부 Maybe가 실패하면 결과도 실패해요. 값이 반드시 하나여야 하면 `flatMap`, 값 없이 성공 여부만 필요하면 `flatMapCompletable`을 선택하세요.

## Trait 구독 API를 사용해요

각 Trait은 가능한 이벤트만 받는 구독 오버로드를 제공해요.

```swift
userSingle
  .subscribe(
    onSuccess: { user in
      print(user.name)
    },
    onFailure: { error in
      print(error)
    }
  )
  .disposed(by: disposeBag)

saveCompletable
  .subscribe(
    onCompleted: {
      print("저장 완료")
    },
    onError: { error in
      print(error)
    }
  )
  .disposed(by: disposeBag)
```

`Maybe`는 `onSuccess`, `onError`, `onCompleted`를, `Infallible`은 오류 처리 없이 `onNext`와 `onCompleted`를 사용해요. Trait 전용 구독은 호출부에서 가능한 종료 상태를 더 분명하게 보여 줘요.

## RxCocoa의 UI Traits를 알아둬요

RxCocoa는 UI 바인딩에 맞춘 `Driver`와 `Signal`을 제공해요.

| Trait    | 오류 | 전달 스케줄러 | 새 구독자에게 최근 값 재생 |
| -------- | ---- | ------------- | -------------------------- |
| `Driver` | 없음 | 메인 스케줄러 | 1개                        |
| `Signal` | 없음 | 메인 스케줄러 | 없음                       |

화면 상태처럼 최근 값이 필요한 흐름은 `Driver`, 탭이나 일회성 알림처럼 과거 값을 다시 보내면 안 되는 흐름은 `Signal`이 잘 맞아요. 두 타입은 RxCocoa의 공유 시퀀스이므로 이 문서의 RxSwift 핵심 Observable 연산자 목록과는 범위가 달라요.

## 폐기된 이름을 최신 API로 바꿔요

RxSwift 6은 여러 연산자 이름과 인자 레이블을 Swift API Design Guidelines에 맞게 정리했어요. 폐기 API는 당장 컴파일될 수 있어도 경고가 발생하고 이후 버전에서 제거될 수 있으므로 새 코드에서는 최신 이름을 사용하세요.

<!-- rxswift-operator: catchError -->

<!-- rxswift-operator: catchErrorJustReturn -->

<!-- rxswift-operator: elementAt -->

<!-- rxswift-operator: observeOn -->

<!-- rxswift-operator: retryWhen -->

<!-- rxswift-operator: skipUntil -->

<!-- rxswift-operator: skipWhile -->

<!-- rxswift-operator: subscribeOn -->

<!-- rxswift-operator: takeUntil -->

<!-- rxswift-operator: takeWhile -->

| 폐기된 호출                | 최신 호출               | 의미                                           |
| -------------------------- | ----------------------- | ---------------------------------------------- |
| `catchError(_:)`           | `catch(_:)`             | 오류를 대체 Observable로 바꿔요.               |
| `catchErrorJustReturn(_:)` | `catchAndReturn(_:)`    | 오류 때 대체 값 하나를 보내요.                 |
| `elementAt(_:)`            | `element(at:)`          | 지정한 인덱스의 값을 선택해요.                 |
| `observeOn(_:)`            | `observe(on:)`          | 이후 이벤트 전달 스케줄러를 정해요.            |
| `retryWhen(_:)`            | `retry(when:)`          | 오류 알림으로 재시도 정책을 만들어요.          |
| `skipUntil(_:)`            | `skip(until:)`          | 다른 Observable이 값을 보낼 때까지 건너뛰어요. |
| `skipWhile(_:)`            | `skip(while:)`          | 조건이 참인 앞부분을 건너뛰어요.               |
| `subscribeOn(_:)`          | `subscribe(on:)`        | 구독과 해제 스케줄러를 정해요.                 |
| `takeUntil(_:)`            | `take(until:)`          | 다른 Observable의 이벤트 전까지만 받아요.      |
| `takeUntil(_:predicate:)`  | `take(until:behavior:)` | 조건 경계를 포함할지 정해 받아요.              |
| `takeWhile(_:)`            | `take(while:)`          | 조건이 참인 앞부분만 받아요.                   |
| `take(_:scheduler:)`       | `take(for:scheduler:)`  | 지정 시간 동안만 받아요.                       |

```swift
// 이전
source
  .catchErrorJustReturn([])
  .observeOn(MainScheduler.instance)

// 현재
source
  .catchAndReturn([])
  .observe(on: MainScheduler.instance)
```

이름만 바뀐 API는 동작을 새로 설계할 필요 없이 호출을 교체할 수 있어요. 다만 `take(until:behavior:)`처럼 오버로드가 여러 개인 경우 컴파일러의 자동 수정만 믿지 말고, 다른 Observable을 경계로 쓰는지 조건 클로저를 쓰는지 확인하세요.

## 선택 기준을 정리해요

| 요구사항                                 | 선택                 |
| ---------------------------------------- | -------------------- |
| 값 하나가 반드시 성공하거나 실패해요     | `Single`             |
| 값이 없을 수도 있는 한 번의 작업이에요   | `Maybe`              |
| 값 없이 성공 또는 실패만 알려요          | `Completable`        |
| 여러 값이 오지만 오류는 계약상 없어요    | `Infallible`         |
| Completable 성공 뒤 다른 작업을 시작해요 | `andThen`            |
| 성공 값을 값 없는 후속 작업으로 바꿔요   | `flatMapCompletable` |
| Single 성공 값을 선택적 결과로 바꿔요    | `flatMapMaybe`       |

## 참고 자료

- [PrimitiveSequence 공식 API](https://docs.rxswift.org/rxswift/traits/primitivesequence)
- [Infallible 공식 API](https://docs.rxswift.org/rxswift/traits/infallible)
- [Traits 설명](https://github.com/ReactiveX/RxSwift/blob/6.10.2/Documentation/Traits.md)
- [RxSwift 6.0 마이그레이션 가이드](https://github.com/ReactiveX/RxSwift/blob/6.10.2/Documentation/CompilerWarnings.md)
