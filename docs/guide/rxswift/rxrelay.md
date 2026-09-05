---
title: RxRelay로 상태와 이벤트 모델링하기
description: PublishRelay, BehaviorRelay, ReplayRelay의 저장·재생 규칙과 accept 사용법, 상태·이벤트 선택 기준, 캡슐화와 동시성 주의점을 공식 구현 기준으로 설명합니다.
source: https://github.com/ReactiveX/RxSwift/tree/6.10.2/RxRelay
reviewed: '2026-09-06'
---

# RxRelay로 상태와 이벤트 모델링하기

> **면접 답변 한 줄 요약:** RxRelay는 Subject를 감싸 `.next` 값만 받도록 만든 종료 없는 스트림이며, 현재 상태에는 `BehaviorRelay`, 새 사건에는 `PublishRelay`, 제한된 과거 재생에는 `ReplayRelay`를 사용해요.

화면 상태나 사용자 입력은 보통 값이 계속 바뀌지만 “오류로 종료”하거나 “정상 완료”할 대상은 아니에요. Subject로 표현하면 어느 코드든 `onError`나 `onCompleted`를 보내 스트림을 영구 종료할 수 있어요. RxRelay는 이런 입력에서 종료 이벤트를 제거해 값만 받도록 만든 별도 모듈이에요.

이 문서는 **RxSwift 6.10.2의 RxRelay 공식 구현**을 기준으로 해요. UI 출력에 사용하는 `Driver`와 `Signal`은 [RxCocoa UI 바인딩](./rxcocoa)에서 설명해요.

## 먼저 알아둘 용어

| 용어              | 뜻                                                                                                            |
| ----------------- | ------------------------------------------------------------------------------------------------------------- |
| Relay             | Subject를 감싸 값 이벤트만 받고 오류나 완료를 외부 API에서 제거한 타입이에요.                                 |
| `accept(_:)`      | Relay에 새 값을 넣는 메서드예요. 내부 Subject의 `.onNext`로 전달돼요.                                         |
| current value     | 가장 최근 상태값이에요. `BehaviorRelay.value`로 읽을 수 있어요.                                               |
| replay buffer     | 새 Subscriber에게 다시 보낼 과거 값의 개수예요.                                                               |
| 상태(state)       | 화면이 현재 어떤 모습이어야 하는지 나타내며, 새 구독자도 최신 값을 알아야 하는 데이터예요.                    |
| 사건(event)       | 버튼 탭, 토스트 요청처럼 특정 시점에 한 번 발생하며 과거 값을 재실행하면 안 되는 신호예요.                    |
| read-modify-write | 현재 값을 읽고 수정한 뒤 새 값으로 쓰는 연속 작업이에요. 각 단계가 안전해도 전체가 원자적이지 않을 수 있어요. |

## Relay는 Subject의 종료 API를 제거해요

공식 구현에서 각 Relay는 대응하는 Subject를 내부에 보관하고, `accept`를 Subject의 `.onNext`로 전달해요.

```text
PublishRelay  ── wraps ── PublishSubject
BehaviorRelay ── wraps ── BehaviorSubject
ReplayRelay   ── wraps ── ReplaySubject
```

```swift
import RxSwift
import RxRelay

let relay = PublishRelay<String>()
let disposeBag = DisposeBag()

relay
  .subscribe(onNext: { value in
    print(value)
  })
  .disposed(by: disposeBag)

relay.accept("로그인 완료")
```

Relay에는 `onError`와 `onCompleted`를 보내는 공개 API가 없어요. 그렇다고 구독 자원이 자동으로 사라지는 것은 아니에요. Relay가 스스로 종료하지 않으므로 Subscriber는 `Disposable`과 `DisposeBag`으로 수명을 반드시 관리해야 해요.

## 세 Relay의 재생 규칙을 비교해요

| 타입                     | 생성할 때 필요한 값 | 새 Subscriber가 처음 받는 값           | 현재 값 직접 읽기 | 대표 용도                        |
| ------------------------ | ------------------- | -------------------------------------- | ----------------- | -------------------------------- |
| `PublishRelay<Element>`  | 없음                | 구독 이후 `accept`한 값만 받아요.      | 불가              | 탭, 토스트, 화면 이동 요청       |
| `BehaviorRelay<Element>` | 초기값              | 가장 최근 값 1개를 즉시 받아요.        | `value`           | 화면 상태, 설정, 선택 목록       |
| `ReplayRelay<Element>`   | 버퍼 크기           | 버퍼에 남은 과거 값을 순서대로 받아요. | 불가              | 제한된 최근 기록, 연결 직후 복구 |

선택 질문은 “몇 개를 저장할까?”보다 **이 값이 상태인지 사건인지**에서 시작하세요.

```text
새 구독자가 현재 값을 알아야 하나요?
├─ 예  ─▶ BehaviorRelay
└─ 아니요
   ├─ 과거 N개가 명시적으로 필요한가요? ─▶ ReplayRelay
   └─ 새 사건만 필요하나요?              ─▶ PublishRelay
```

## PublishRelay는 구독 뒤의 사건만 보내요

```swift
let toastRelay = PublishRelay<String>()

toastRelay.accept("첫 번째 메시지")

toastRelay
  .subscribe(onNext: { message in
    print(message)
  })
  .disposed(by: disposeBag)

toastRelay.accept("두 번째 메시지")

// 두 번째 메시지만 출력해요.
```

첫 번째 메시지는 Subscriber가 없을 때 발생했으므로 사라져요. 이것은 버그가 아니라 PublishRelay의 계약이에요. 화면이 아직 구독하지 않았을 때 생긴 사건도 반드시 처리해야 한다면 “사건 버퍼”를 무작정 늘리기보다 앱 상태나 명시적인 큐로 모델링해야 하는지 먼저 검토하세요.

일회성 UI 사건을 화면에 노출할 때는 RxCocoa의 Signal로 읽기 전용 계약을 만들 수 있어요.

```swift
import RxCocoa

private let messageRelay = PublishRelay<String>()

var message: Signal<String> {
  messageRelay.asSignal()
}
```

외부에는 `Signal`만 보이므로 값을 주입하는 `accept` 권한은 소유 객체 안에 남아요.

## BehaviorRelay는 초기값과 최신 상태를 가져요

BehaviorRelay는 반드시 초기값을 받아요.

```swift
struct FilterState: Equatable {
  var keyword = ""
  var showsFavoritesOnly = false
}

let filterRelay = BehaviorRelay(value: FilterState())

filterRelay
  .subscribe(onNext: { state in
    print(state.keyword, state.showsFavoritesOnly)
  })
  .disposed(by: disposeBag)
```

구독 직후 초기 `FilterState()`가 한 번 전달돼요. 이후 상태를 바꾸려면 새 값을 `accept`해요.

```swift
var nextState = filterRelay.value
nextState.keyword = "RxSwift"
filterRelay.accept(nextState)
```

`value`는 가장 최근 값을 동기적으로 읽어요. 하지만 상태가 없을 수도 있다는 이유만으로 `BehaviorRelay<State?>`를 만들고 `nil`을 무조건 초기값으로 두면 화면마다 nil 분기가 늘어날 수 있어요. `.idle`, `.loading`, `.loaded`, `.failed`를 가진 enum처럼 실제 상태 기계를 모델링할 수 있는지 먼저 생각하세요.

## ReplayRelay는 정한 개수만 과거 값을 다시 보내요

```swift
let historyRelay = ReplayRelay<String>.create(bufferSize: 2)

historyRelay.accept("A")
historyRelay.accept("B")
historyRelay.accept("C")

historyRelay
  .subscribe(onNext: { value in
    print(value)
  })
  .disposed(by: disposeBag)

// B
// C
```

버퍼 크기가 2이므로 새 Subscriber는 최근 두 값만 받아요. `ReplayRelay.createUnbound()`는 모든 과거 값을 보관하므로 공식 구현도 메모리 사용에 주의하라고 명시해요. 로그 전체처럼 데이터가 계속 늘어나는 흐름에는 제한된 버퍼나 별도 영구 저장소를 사용하세요.

ReplayRelay는 `BehaviorRelay.value`처럼 현재 값을 동기적으로 꺼내는 API를 제공하지 않아요. 과거 값 컬렉션을 직접 조회하고 수정해야 한다면 Relay 버퍼를 저장소로 오해한 것이 아닌지 점검하세요.

## 상태 저장소는 쓰기 권한을 캡슐화해요

장바구니 상태는 BehaviorRelay로, 사용자에게 한 번 보여 줄 메시지는 PublishRelay로 분리해 볼게요.

```swift
import Foundation
import RxSwift
import RxRelay
import RxCocoa

struct CartItem: Equatable {
  let id: UUID
  let name: String
}

struct CartState: Equatable {
  var items: [CartItem]
}

@MainActor
final class CartStore {
  private let stateRelay = BehaviorRelay(
    value: CartState(items: [])
  )
  private let messageRelay = PublishRelay<String>()

  var state: Driver<CartState> {
    stateRelay
      .asDriver()
      .distinctUntilChanged()
  }

  var message: Signal<String> {
    messageRelay.asSignal()
  }

  /// 장바구니에 상품을 추가하고 사용자 메시지를 발행합니다.
  ///
  /// - Parameter item: 장바구니에 새로 담을 상품입니다.
  func add(
    item: CartItem
  ) {
    var nextState = stateRelay.value

    guard !nextState.items.contains(where: { $0.id == item.id }) else {
      messageRelay.accept("이미 담은 상품이에요")
      return
    }

    nextState.items.append(item)
    stateRelay.accept(nextState)
    messageRelay.accept("장바구니에 담았어요")
  }
}
```

구조의 핵심은 다음과 같아요.

- Relay는 `private`이라 Store만 `accept`할 수 있어요.
- 화면에는 현재 값이 필요한 `state: Driver<CartState>`를 노출해요.
- 화면에는 replay하면 안 되는 `message: Signal<String>`를 노출해요.
- `@MainActor`가 상태 읽기와 쓰기를 한 실행 영역으로 직렬화해요.
- `distinctUntilChanged()`는 같은 상태를 다시 accept했을 때 불필요한 UI 갱신을 줄여요.

`BehaviorRelay` 자체는 같은 값을 걸러 주지 않아요. 모든 `accept`는 새 이벤트예요. 값이 `Equatable`이고 중복 제거가 의미 있을 때 읽기 경계에 `distinctUntilChanged()`를 적용하세요.

## `value`를 수정하는 전체 과정은 원자적이지 않아요

다음 코드는 자주 쓰이지만 여러 실행 문맥에서 동시에 호출되면 갱신을 잃을 수 있어요.

```swift
var items = itemsRelay.value
items.append(newItem)
itemsRelay.accept(items)
```

예를 들어 작업 A와 B가 모두 같은 기존 배열을 읽은 뒤 각각 다른 항목을 추가해 accept하면, 마지막 쓰기가 앞선 변경을 덮을 수 있어요. `value` 읽기와 `accept`가 각각 내부 잠금을 사용하더라도 **읽기 → 수정 → 쓰기 전체**가 하나의 원자 연산이 되는 것은 아니에요.

다음 중 하나로 상태 소유권을 직렬화하세요.

- 화면 상태 Store 전체를 `@MainActor`로 격리해요.
- 전용 serial Scheduler나 직렬 큐 한 곳에서만 상태를 변경해요.
- 여러 동시 작업의 결과를 Relay 밖의 actor에서 합친 뒤 완성된 상태만 accept해요.
- 입력을 하나의 Observable로 모아 `scan`으로 다음 상태를 계산해요.

RxRelay는 상태 보관 도구이지 actor나 lock의 대체물이 아니며, `Sendable` 안전성을 자동으로 제공하지 않아요.

## Observable을 Relay에 bind할 때 오류를 먼저 처리해요

오류가 없는 UI 입력은 Relay에 자연스럽게 연결할 수 있어요.

```swift
searchBar.rx.text.orEmpty
  .bind(to: queryRelay)
  .disposed(by: disposeBag)
```

반면 오류가 날 수 있는 Observable을 Relay에 바로 bind하면 문제가 생겨요. Relay는 오류를 받을 수 없으므로 공식 `bind(to:)` 구현은 업스트림 오류에서 디버그 빌드의 실패 또는 릴리스 로그로 처리해요.

```swift
api.loadRecommendations()
  .catch { error in
    errorRelay.accept(error)
    return .empty()
  }
  .bind(to: recommendationsRelay)
  .disposed(by: disposeBag)
```

오류를 `.empty()`로 바꾸기 전에 별도 오류 상태에 기록하거나 재시도 정책을 적용하세요. Relay가 종료되지 않는다는 이유로 업스트림 오류가 자동으로 무시되는 것은 아니에요.

## Relay와 비슷한 도구를 비교해요

| 도구                        | 외부에서 값 입력 | 오류·완료 | 최근 값 보존               | 주된 역할                   |
| --------------------------- | ---------------- | --------- | -------------------------- | --------------------------- |
| `PublishSubject`            | `onNext`         | 가능      | 없음                       | 종료 가능한 콜백 어댑터     |
| `BehaviorSubject`           | `onNext`         | 가능      | 최신 값 1개                | 종료 가능한 상태 시퀀스     |
| `PublishRelay`              | `accept`         | 불가      | 없음                       | 종료 없는 사건 입력         |
| `BehaviorRelay`             | `accept`         | 불가      | 최신 값 1개와 `value`      | 종료 없는 상태 입력         |
| `ReplayRelay`               | `accept`         | 불가      | 정한 버퍼 또는 무제한      | 종료 없는 제한적 과거 재생  |
| `share(replay:scope:)` 결과 | 직접 입력 불가   | 소스 따름 | 연산자 설정에 따라 달라요. | cold 소스의 구독 공유       |
| `Driver`                    | 직접 입력 불가   | 불가      | 연결 중 최신 값 1개        | 메인 Scheduler UI 상태 출력 |
| `Signal`                    | 직접 입력 불가   | 불가      | 없음                       | 메인 Scheduler UI 사건 출력 |

Relay와 `share`는 바꿔 쓸 수 있는 도구가 아니에요. Relay는 외부에서 값을 주입할 수 있는 상태·사건의 **소유 지점**이고, `share`는 기존 Observable의 **구독과 부수 효과를 공유**하는 연산자예요.

## Relay가 해결하지 않는 문제를 알아둬요

### 영구 저장소가 아니에요

Relay의 값과 replay 버퍼는 메모리에만 있어요. 앱 재실행 뒤 복구가 필요하면 UserDefaults, 파일, 데이터베이스 같은 저장소가 필요해요.

### 동시성 안전을 자동으로 보장하지 않아요

여러 작업이 같은 상태를 읽고 수정하는 정책은 Store, actor, serial Scheduler가 책임져야 해요.

### 중복 값을 자동으로 제거하지 않아요

같은 값을 accept해도 다시 방출해요. 도메인에서 동일성 기준을 정하고 `distinctUntilChanged()`를 적용하세요.

### 실패와 완료를 표현할 수 없어요

네트워크 요청의 성공·실패처럼 종료가 의미 있는 작업 자체를 Relay로 바꾸면 계약이 약해져요. 요청은 `Single`이나 Observable로 유지하고, 그 결과로 화면 상태 Relay를 갱신하는 구조가 더 분명해요.

### 전역 이벤트 버스가 되기 쉬워요

전역 PublishRelay에 여러 기능이 임의 문자열이나 enum 사건을 보내면 의존 관계와 순서를 추적하기 어려워요. Relay는 가능한 한 작은 Store나 기능 경계가 소유하고 입력 메서드와 읽기 전용 출력을 통해 사용하세요.

## 선택 기준을 정리해요

| 질문                                                    | 선택                                              |
| ------------------------------------------------------- | ------------------------------------------------- |
| 새 Subscriber가 현재 상태를 즉시 알아야 하나요?         | `BehaviorRelay`                                   |
| 구독 이후의 새 사건만 전달하면 되나요?                  | `PublishRelay`                                    |
| 새 Subscriber가 제한된 과거 N개를 반드시 받아야 하나요? | `ReplayRelay.create(bufferSize:)`                 |
| 값과 함께 오류 또는 정상 완료가 도메인 계약인가요?      | Relay 대신 Subject, Observable, PrimitiveSequence |
| 여러 Subscriber의 중복 네트워크 요청만 막고 싶은가요?   | Relay 대신 `share(replay:scope:)`                 |
| UI에 읽기 전용 상태·사건으로 노출하나요?                | `Driver` 또는 `Signal`로 변환                     |
| 앱 재실행 뒤에도 값이 남아야 하나요?                    | Relay와 별도로 영구 저장소 사용                   |

## 적용 체크리스트

- 값이 상태인지 사건인지 먼저 구분했나요?
- Relay를 `private`로 두고 외부 쓰기 권한을 제한했나요?
- 외부에는 Observable, Driver, Signal 같은 읽기 전용 형태를 노출했나요?
- BehaviorRelay에 의미 있는 초기 상태를 제공했나요?
- `value` 읽기부터 `accept`까지 하나의 직렬 실행 영역에 있나요?
- 같은 상태 재방출을 줄여야 한다면 동일성 기준을 정했나요?
- ReplayRelay 버퍼 크기와 메모리 상한을 정했나요?
- 오류 가능한 Observable을 bind하기 전에 오류를 처리했나요?
- Relay가 종료되지 않으므로 Subscriber의 dispose 수명을 관리했나요?
- 영구 저장, 동시성, 비즈니스 오류를 Relay가 해결한다고 오해하지 않았나요?

## 면접에서 이어질 수 있는 질문

### Subject와 Relay의 차이는 무엇인가요?

Subject는 `.next`, `.error`, `.completed`를 받을 수 있지만 Relay는 Subject를 감싸 값만 `accept`하도록 제한해요. 상태나 UI 사건처럼 외부에서 종료시키면 안 되는 입력에 Relay가 적합해요.

### BehaviorRelay와 PublishRelay는 어떻게 선택하나요?

새 Subscriber가 즉시 현재 값을 알아야 하는 상태라면 BehaviorRelay, 구독 이후 새로 생긴 사건만 받아야 한다면 PublishRelay를 선택해요.

### BehaviorRelay의 `value`를 읽고 accept하면 thread-safe한가요?

각 API 호출의 내부 동기화와 별개로 읽기·수정·쓰기 전체는 원자적이지 않아요. 여러 실행 문맥에서 상태를 바꿀 수 있다면 MainActor, actor, serial Scheduler 같은 단일 소유 경계로 직렬화해야 해요.

### ReplayRelay를 캐시로 사용해도 되나요?

연결 중 최근 이벤트 재생에는 쓸 수 있지만 영구 캐시가 아니고, 큰 값이나 무제한 버퍼는 메모리를 계속 사용해요. 조회·만료·영속성이 필요한 캐시는 별도 저장소로 설계해야 해요.

## 참고 자료

- [ReactiveX/RxSwift 6.10.2 — RxRelay](https://github.com/ReactiveX/RxSwift/tree/6.10.2/RxRelay)
- [PublishRelay 구현](https://github.com/ReactiveX/RxSwift/blob/6.10.2/RxRelay/PublishRelay.swift)
- [BehaviorRelay 구현](https://github.com/ReactiveX/RxSwift/blob/6.10.2/RxRelay/BehaviorRelay.swift)
- [ReplayRelay 구현](https://github.com/ReactiveX/RxSwift/blob/6.10.2/RxRelay/ReplayRelay.swift)
- [ObservableType+Relay 바인딩 구현](https://github.com/ReactiveX/RxSwift/blob/6.10.2/RxRelay/Observable%2BBind.swift)
- [RxCocoa Traits 공식 설명](https://github.com/ReactiveX/RxSwift/blob/6.10.2/Documentation/Traits.md#rxcocoa-traits)
