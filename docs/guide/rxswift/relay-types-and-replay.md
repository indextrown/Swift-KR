---
title: PublishRelay, BehaviorRelay와 ReplayRelay
description: 세 RxRelay 타입의 accept·value·buffer·late subscriber 동작, asObservable·asInfallible 변환과 Observable bind 오류 규칙을 공식 구현 기준으로 비교합니다.
source: https://github.com/ReactiveX/RxSwift/tree/6.10.2/RxRelay
reviewed: '2026-09-06'
---

# PublishRelay, BehaviorRelay와 ReplayRelay

> **면접 답변 한 줄 요약:** PublishRelay는 새 사건만, BehaviorRelay는 초기값과 최신 값 하나를, ReplayRelay는 지정한 과거 버퍼를 전달하며 세 타입 모두 `accept`로 next만 받고 종료하지 않아요.

RxRelay의 세 타입은 각각 PublishSubject, BehaviorSubject, ReplaySubject를 감싸요. 차이는 오류·완료 API를 제거하고 값 입력을 `accept`로 제한한다는 점이에요.

## 공통 계약

```swift
let relay = PublishRelay<Int>()

relay.accept(1)
relay.accept(2)
```

- `.error`를 보낼 수 없어요.
- `.completed`를 보낼 수 없어요.
- 값은 `accept(_:)`로 넣어요.
- ObservableType이므로 직접 구독할 수 있어요.
- `asObservable()`과 `asInfallible()`로 읽기 타입을 바꿀 수 있어요.
- 스스로 종료하지 않으므로 Subscriber의 dispose 수명은 별도로 관리해요.

## PublishRelay는 구독 뒤 값만 전달해요

```swift
let relay = PublishRelay<String>()

relay.accept("구독 전")

relay
  .subscribe(onNext: { print($0) })
  .disposed(by: disposeBag)

relay.accept("구독 후")
// 구독 후
```

새 Subscriber에게 초기값이나 최근 값을 주지 않아요. 버튼 탭을 Store에 전달하거나, 토스트·화면 이동 같은 일회성 사건을 내부에서 발행할 때 적합해요.

```swift
private let routeRelay = PublishRelay<Route>()

var route: Signal<Route> {
  routeRelay.asSignal()
}
```

Relay를 private으로 두고 Signal만 공개하면 외부는 과거 replay 없이 사건을 소비할 수 있고 `accept` 권한은 소유자에게 남아요.

## BehaviorRelay는 항상 최신 값이 있어요

```swift
let relay = BehaviorRelay(value: 0)

print(relay.value) // 0

relay.accept(1)
print(relay.value) // 1
```

초기값이 필수이고 새 Subscriber는 최신 값을 즉시 받아요. `value`는 현재 값을 동기적으로 읽어요.

```swift
relay
  .subscribe(onNext: { print("A:", $0) })
  .disposed(by: disposeBag)

relay.accept(2)

relay
  .subscribe(onNext: { print("B:", $0) })
  .disposed(by: disposeBag)

// A: 1
// A: 2
// B: 2
```

화면 상태, 선택된 필터, 장바구니처럼 새 소비자가 현재 값을 알아야 하는 데이터에 적합해요. 값이 없을 수 있다는 이유로 무조건 Optional 초기값을 쓰기보다 `.idle` 같은 명시적 초기 상태를 모델링하세요.

## ReplayRelay는 최근 N개를 보관해요

```swift
let relay = ReplayRelay<String>.create(bufferSize: 2)

relay.accept("A")
relay.accept("B")
relay.accept("C")

relay
  .subscribe(onNext: { print($0) })
  .disposed(by: disposeBag)

// B
// C
```

`create(bufferSize:)`는 최근 N개만 보관해요. `createUnbound()`는 들어온 모든 값을 저장하므로 공식 구현도 메모리 사용에 주의하라고 명시해요.

ReplayRelay에는 BehaviorRelay의 `value`와 같은 동기 조회 API가 없어요. 버퍼는 late subscriber에게 이벤트를 replay하기 위한 것이지, 임의 조회와 삭제를 제공하는 컬렉션 저장소가 아니에요.

## late subscriber 동작을 한눈에 봐요

```text
시간       A ── B ── C ── [구독] ── D

PublishRelay                    D
BehaviorRelay               C, D
ReplayRelay(buffer: 2)    B, C, D
```

상태에는 최신 값, 사건에는 구독 후 값이라는 기준이 가장 중요해요. ReplayRelay는 “혹시 놓칠까 봐” 선택하기보다 과거 N개를 새 소비자가 받아야 하는 명시적 요구가 있을 때만 사용하세요.

## Observable과 Infallible로 읽기 권한을 좁혀요

```swift
private let stateRelay = BehaviorRelay(value: State.initial)

var state: Observable<State> {
  stateRelay.asObservable()
}

var safeState: Infallible<State> {
  stateRelay.asInfallible()
}
```

`asObservable()`은 일반 RxSwift 소비자와 연산자를 위한 경계이고, `asInfallible()`은 오류가 없다는 계약까지 타입에 표현해요. UIKit 화면에는 `asDriver()`와 `asSignal()`이 메인 Scheduler 계약을 추가해요.

## 같은 값을 accept해도 다시 방출해요

```swift
let relay = BehaviorRelay(value: false)

relay
  .distinctUntilChanged()
  .subscribe(onNext: { print($0) })
  .disposed(by: disposeBag)

relay.accept(false)
relay.accept(true)
relay.accept(true)
```

Relay는 동등성을 검사하지 않아요. 모든 accept를 이벤트로 전달해요. 같은 상태 렌더링을 줄여야 한다면 `Equatable` 기준을 정하고 읽기 경계에서 `distinctUntilChanged()`를 사용하세요.

## Observable을 Relay에 bind할 때 오류를 처리해요

```swift
searchBar.rx.text.orEmpty
  .bind(to: queryRelay)
  .disposed(by: disposeBag)
```

ControlProperty처럼 오류 없는 입력은 바로 bind할 수 있어요. 오류 가능한 Observable은 먼저 복구하거나 오류 상태로 분기해야 해요.

```swift
api.loadProducts()
  .catch { error in
    errorRelay.accept(error)
    return .empty()
  }
  .bind(to: productsRelay)
  .disposed(by: disposeBag)
```

공식 `Observable+Bind` 구현은 Relay에 오류가 들어오면 디버그에서 fatal error를 발생시키고 릴리스에서는 로그를 남겨요. Relay가 오류를 무시하고 계속 구독해 주는 것이 아니에요.

## Relay와 Subject를 비교해요

| 타입            | 값 입력  | 오류·완료 | 최신 값 조회  | replay           |
| --------------- | -------- | --------- | ------------- | ---------------- |
| PublishSubject  | `onNext` | 가능      | 불가          | 없음             |
| BehaviorSubject | `onNext` | 가능      | `try value()` | 최신 1개         |
| ReplaySubject   | `onNext` | 가능      | 불가          | 버퍼 또는 무제한 |
| PublishRelay    | `accept` | 불가      | 불가          | 없음             |
| BehaviorRelay   | `accept` | 불가      | `value`       | 최신 1개         |
| ReplayRelay     | `accept` | 불가      | 불가          | 버퍼 또는 무제한 |

실패와 완료가 도메인 의미라면 Subject나 Single·Maybe·Completable을 사용하세요. 종료 없는 상태·사건 입력에 Relay가 맞아요.

## Relay와 share를 비교해요

| 질문                  | Relay                       | `share(replay:scope:)`                 |
| --------------------- | --------------------------- | -------------------------------------- |
| 외부에서 값을 넣나요? | `accept` 가능               | 불가                                   |
| 주된 목적             | 상태·사건의 소유 지점       | 기존 cold 소스의 구독과 부수 효과 공유 |
| 종료                  | 없음                        | 원본 소스의 오류·완료를 따라요.        |
| replay                | Relay 종류에 따라 정해져요. | 인자와 scope로 정해요.                 |

네트워크 요청 중복을 막기 위해 BehaviorRelay에 결과를 수동 복사하기보다, 먼저 `share`가 문제에 맞는지 확인하세요.

## 자주 하는 실수

- 모든 값을 BehaviorRelay로 만들어 사건까지 replay해요.
- ReplayRelay를 영구 저장소나 조회 가능한 배열로 생각해요.
- `createUnbound()`에 무한 이벤트를 쌓아요.
- Relay를 public으로 노출해 아무 코드나 accept하게 해요.
- 같은 값을 자동으로 제거한다고 생각해요.
- 오류 Observable을 바로 Relay에 bind해 디버그 실패를 만들어요.

## 적용 체크리스트

- 값이 현재 상태인지 일회성 사건인지 구분했나요?
- late subscriber가 받아야 하는 값의 개수를 정했나요?
- Relay가 private이고 읽기 전용 출력만 공개되나요?
- ReplayRelay 버퍼에 메모리 상한이 있나요?
- 동일 상태 재방출 기준을 정했나요?
- bind 전 오류가 의도적으로 처리되나요?

## 면접에서 이어질 수 있는 질문

### Relay가 절대 메모리 누수를 만들지 않나요?

아니요. Relay가 오류·완료 없이 계속 살아 있다는 뜻일 뿐이에요. Relay와 Subscriber의 소유 관계, DisposeBag 수명, ReplayRelay 버퍼 크기에 따라 메모리를 오래 유지할 수 있어요.

### BehaviorRelay의 초기값은 왜 필수인가요?

새 Subscriber에게 언제나 현재 값 하나를 제공한다는 계약을 지키기 위해서예요. 초기 상태를 정의할 수 없다면 Optional, 명시적 상태 enum 또는 다른 Relay가 더 맞는지 검토해야 해요.

## 참고 자료

- [RxRelay 공식 소스](https://github.com/ReactiveX/RxSwift/tree/6.10.2/RxRelay)
- [PublishRelay 구현](https://github.com/ReactiveX/RxSwift/blob/6.10.2/RxRelay/PublishRelay.swift)
- [BehaviorRelay 구현](https://github.com/ReactiveX/RxSwift/blob/6.10.2/RxRelay/BehaviorRelay.swift)
- [ReplayRelay 구현](https://github.com/ReactiveX/RxSwift/blob/6.10.2/RxRelay/ReplayRelay.swift)
- [Relay bind 구현](https://github.com/ReactiveX/RxSwift/blob/6.10.2/RxRelay/Observable%2BBind.swift)
