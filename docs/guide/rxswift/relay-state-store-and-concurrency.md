---
title: Relay 상태 Store와 동시성
description: BehaviorRelay와 PublishRelay로 읽기 전용 Driver·Signal을 노출하는 Store를 만들고 단방향 상태 변경, read-modify-write 경쟁, 영속성과 테스트 기준을 설명합니다.
source: https://github.com/ReactiveX/RxSwift/blob/6.10.2/RxRelay/BehaviorRelay.swift
reviewed: '2026-09-06'
---

# Relay 상태 Store와 동시성

> **면접 답변 한 줄 요약:** Relay Store는 상태 Relay와 사건 Relay를 private으로 소유하고 Driver·Signal만 공개하며, 모든 read-modify-write를 MainActor·actor·serial Scheduler 중 하나에서 직렬화해야 해요.

Relay는 상태를 보관할 수 있지만 상태 관리 아키텍처 자체는 아니에요. 누가 값을 바꿀 수 있는지, 변경 순서가 어떻게 직렬화되는지, 실패와 영속성을 어디서 처리할지는 Store가 설계해야 해요.

## 상태와 사건을 분리해요

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
  var items: [CartItem] = []
  var isSaving = false
}

enum CartMessage {
  case added
  case alreadyExists
  case saveFailed
}

@MainActor
final class CartStore {
  private let stateRelay = BehaviorRelay(value: CartState())
  private let messageRelay = PublishRelay<CartMessage>()

  var state: Driver<CartState> {
    stateRelay
      .asDriver()
      .distinctUntilChanged()
  }

  var message: Signal<CartMessage> {
    messageRelay.asSignal()
  }

  /// 장바구니에 상품을 추가합니다.
  ///
  /// - Parameter item: 새로 담을 상품입니다.
  func add(
    item: CartItem
  ) {
    var next = stateRelay.value

    guard !next.items.contains(where: { $0.id == item.id }) else {
      messageRelay.accept(.alreadyExists)
      return
    }

    next.items.append(item)
    stateRelay.accept(next)
    messageRelay.accept(.added)
  }
}
```

핵심 경계는 다음과 같아요.

- BehaviorRelay는 현재 화면 상태를 보관해요.
- PublishRelay는 다시 실행하면 안 되는 메시지를 전달해요.
- Relay는 private이라 Store만 accept할 수 있어요.
- 외부는 Driver와 Signal로 읽기만 해요.
- `@MainActor`가 상태 변경 순서를 메인 actor에 격리해요.

## public Relay보다 의도 있는 메서드를 제공해요

```swift
// 피해야 할 공개 쓰기 권한
let cartState = BehaviorRelay(value: CartState())
```

Relay를 공개하면 화면, 네트워크 callback, 테스트 helper가 각자 전체 상태를 accept할 수 있어요. `add`, `remove`, `save`처럼 의도를 드러내는 입력만 제공하면 상태 불변식을 한곳에서 검증할 수 있어요.

## read-modify-write는 하나의 원자 연산이 아니에요

```swift
var next = stateRelay.value
next.items.append(item)
stateRelay.accept(next)
```

두 작업이 동시에 같은 기존 값을 읽고 서로 다른 값을 append한 뒤 accept하면 마지막 쓰기가 앞선 변경을 덮을 수 있어요. BehaviorRelay 내부의 개별 `value`와 `accept` 동기화가 세 줄 전체를 원자적으로 만들지는 않아요.

```text
작업 A: read [] ─ append A ───────── accept [A]
작업 B: ─ read [] ─ append B ─ accept [B]
결과: 실행 순서에 따라 A 또는 B 갱신을 잃을 수 있어요.
```

다음 중 하나로 상태 변경을 직렬화하세요.

- UIKit 화면 상태는 Store 전체를 `@MainActor`로 격리해요.
- 백그라운드 상태는 Swift actor 안에서 계산하고 완성된 값을 Relay에 전달해요.
- Rx만 사용하는 계층은 전용 `SerialDispatchQueueScheduler`에서 action을 reduce해요.
- 여러 입력을 하나의 action Observable로 모아 `scan`으로 상태를 만들어요.

Relay는 actor나 lock의 대체물이 아니고 Sendable 안전성을 자동으로 제공하지 않아요.

## action과 scan으로 단방향 흐름을 만들어요

```swift
enum CounterAction {
  case increment
  case decrement
  case reset
}

let actionRelay = PublishRelay<CounterAction>()

let state = actionRelay
  .scan(0) { state, action in
    switch action {
    case .increment:
      return state + 1
    case .decrement:
      return state - 1
    case .reset:
      return 0
    }
  }
  .startWith(0)
  .distinctUntilChanged()
  .share(replay: 1, scope: .whileConnected)
```

입력을 action 하나로 모으면 상태 변경 순서와 규칙을 테스트하기 쉬워요. 상태가 반드시 Subscriber와 무관하게 유지돼야 한다면 Store가 BehaviorRelay를 소유하고 scan 결과를 bind할 수 있어요. 반대로 화면이 연결된 동안만 계산하면 된다면 공유 Observable만으로도 충분할 수 있어요.

## 같은 상태 방출을 제어해요

BehaviorRelay는 같은 값을 accept해도 방출해요. State가 Equatable이라면 출력에서 중복을 제거할 수 있어요.

```swift
var state: Driver<CartState> {
  stateRelay
    .asDriver()
    .distinctUntilChanged()
}
```

큰 상태 전체 비교가 비싸거나 화면이 일부 필드만 필요하면 필드를 먼저 map한 뒤 중복을 제거하세요.

```swift
let itemCount = store.state
  .map(\.items.count)
  .distinctUntilChanged()
```

## 비동기 요청 상태를 값으로 모델링해요

Relay 자체는 오류로 종료되지 않으므로 요청의 실패를 무시하지 말고 상태나 사건으로 바꿔요.

```swift
enum ProductListState: Equatable {
  case idle
  case loading
  case loaded([Product])
  case failed(String)
}

requestRelay
  .flatMapLatest { request in
    api.load(request)
      .map(ProductListState.loaded)
      .catch { error in
        logger.record(error)
        return .just(.failed("상품을 불러오지 못했어요"))
      }
      .startWith(.loading)
  }
  .bind(to: stateRelay)
  .disposed(by: disposeBag)
```

요청 Observable은 오류와 취소 계약을 유지하고, Store 경계에서 화면이 이해하는 상태로 변환해요.

## Relay는 영속성 계층이 아니에요

앱 재실행 뒤에도 장바구니가 남아야 한다면 UserDefaults, 파일, SwiftData, Realm 같은 저장소가 필요해요.

```text
영구 저장소 ── load ──▶ Store ── Driver ──▶ 화면
     ▲                    │
     └──── save ◀──── 상태 변경
```

초기값을 저장소에서 읽고 Relay에 넣으며, 상태 변경 뒤 저장 작업의 성공·실패를 별도로 처리하세요. ReplayRelay 버퍼를 디스크 캐시처럼 사용하면 앱 종료 시 모두 사라져요.

## Relay를 전역 이벤트 버스로 만들지 않아요

전역 PublishRelay에 모든 화면 사건을 넣으면 생산자와 소비자의 의존 관계, 순서, 중복, 수명을 추적하기 어려워요.

- 기능별 Store가 Relay를 소유해요.
- 사건 타입을 작은 enum으로 제한해요.
- 외부에는 Signal이나 Observable만 노출해요.
- 화면 간 통신은 Router, 도메인 Store, 명시적 의존성을 우선해요.

## Store를 테스트해요

```swift
@MainActor
func testAddItem() {
  let store = CartStore()
  let item = CartItem(
    id: UUID(),
    name: "RxSwift 책"
  )
  var states: [CartState] = []

  let disposable = store.state
    .drive(onNext: { states.append($0) })

  store.add(item: item)

  XCTAssertEqual(states.last?.items, [item])
  disposable.dispose()
}
```

시간 기반 파이프라인이 있다면 RxTest의 TestScheduler로 action 시간과 출력 이벤트를 검증하세요. Store의 Relay를 public으로 열어 테스트 값을 주입하기보다 공개 입력을 통해 상태를 바꾸는 편이 실제 계약을 검증해요.

## 자주 하는 실수

- Relay를 public으로 열어 모든 계층이 accept해요.
- 상태와 일회성 사건을 BehaviorRelay 하나에 섞어요.
- 여러 queue에서 `value`를 읽고 수정해 갱신을 잃어요.
- 같은 상태 accept가 자동으로 제거된다고 생각해요.
- 네트워크 오류를 Relay가 알아서 무시할 것으로 기대해요.
- ReplayRelay를 앱 영구 저장소로 사용해요.
- 전역 PublishRelay를 기능 간 메시지 버스로 사용해요.

## 적용 체크리스트

- 상태와 사건이 다른 Relay로 분리됐나요?
- Relay 쓰기 권한이 Store 내부에만 있나요?
- 모든 상태 변경이 하나의 actor 또는 serial 경계에 있나요?
- 오류와 로딩을 사용자 상태로 모델링했나요?
- 동일 상태 렌더링을 줄일 기준이 있나요?
- 영속성 요구사항을 별도 저장소가 담당하나요?
- 테스트가 공개 입력과 읽기 전용 출력을 사용하나요?

## 면접에서 이어질 수 있는 질문

### BehaviorRelay가 thread-safe하면 Store도 thread-safe한가요?

아니요. 개별 API의 내부 동기화와 상태 전이 전체의 원자성은 달라요. value 읽기, 수정, accept를 하나의 MainActor·actor·serial Scheduler에서 실행해야 갱신 손실을 막을 수 있어요.

### 상태와 사건을 Relay 타입으로 어떻게 구분하나요?

새 Subscriber가 현재 값을 알아야 하는 상태는 BehaviorRelay, 구독 뒤 새로 발생한 값만 처리해야 하는 사건은 PublishRelay를 기본으로 선택해요. 외부 출력은 각각 Driver와 Signal로 좁힐 수 있어요.

## 참고 자료

- [BehaviorRelay 구현](https://github.com/ReactiveX/RxSwift/blob/6.10.2/RxRelay/BehaviorRelay.swift)
- [PublishRelay 구현](https://github.com/ReactiveX/RxSwift/blob/6.10.2/RxRelay/PublishRelay.swift)
- [RxCocoa Driver 변환](https://github.com/ReactiveX/RxSwift/blob/6.10.2/RxCocoa/Traits/Driver/BehaviorRelay%2BDriver.swift)
- [RxCocoa Signal 변환](https://github.com/ReactiveX/RxSwift/blob/6.10.2/RxCocoa/Traits/Signal/PublishRelay%2BSignal.swift)
- [Observable bind to Relay](https://github.com/ReactiveX/RxSwift/blob/6.10.2/RxRelay/Observable%2BBind.swift)
