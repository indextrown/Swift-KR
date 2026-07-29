---
title: RxSwift 연산자 — 변환과 필터링
description: map, compactMap, filter, distinctUntilChanged, scan, reduce, groupBy, materialize와 withUnretained로 Observable 값을 안전하게 변환하는 방법을 설명합니다.
---

# RxSwift 연산자 — 변환과 필터링

> **면접 답변 한 줄 요약:** 변환 연산자는 각 값의 형태나 누적 상태를 바꾸고, 필터링 연산자는 전달할 값의 개수를 줄이며, RxSwift에서는 연산자 클로저가 던진 오류도 Observable의 `.error` 이벤트가 돼요.

RxSwift의 `map`, `filter`, `scan` 클로저는 `throws`일 수 있어요. 별도의 `tryMap` 이름을 사용하는 Combine과 달리, 일반 연산자의 클로저에서 던지면 시퀀스가 오류로 종료돼요.

## 값을 다른 형태로 바꿔요

<!-- rxswift-operator: map -->

### `map(_:)`

각 입력을 클로저가 반환한 값으로 바꿔요. 값 개수는 유지되고 `Element` 타입은 달라질 수 있어요.

```swift
Observable.of(1, 2, 3)
  .map { "상품 \($0)" }
  .subscribe(onNext: { print($0) })
  .disposed(by: disposeBag)
```

클로저가 오류를 던지면 이후 입력은 전달되지 않고 `.error`로 끝나요.

<!-- rxswift-operator: compactMap -->

### `compactMap(_:)`

각 입력을 옵셔널 결과로 바꾸고 `nil`은 버리며, 값이 있는 결과만 옵셔널을 벗겨 보내요.

```swift
Observable.of("10", "없음", "30")
  .compactMap(Int.init)
// 10, 30
```

파싱 실패를 무시해도 될 때 적합해요. 잘못된 입력에서 흐름을 중단해야 한다면 `map`의 클로저에서 의미 있는 오류를 던지세요.

<!-- rxswift-operator: enumerated -->

### `enumerated()`

각 값에 0부터 시작하는 인덱스를 붙여 `(index, element)` 튜플로 보내요.

```swift
Observable.of("A", "B")
  .enumerated()
  .subscribe(onNext: { index, value in
    print(index, value)
  })
```

이 인덱스는 현재 구독에서 이벤트가 도착한 순서예요. 데이터의 안정적인 식별자나 컬렉션의 영구 위치로 사용하면 안 돼요.

## 조건에 맞는 값만 보내요

<!-- rxswift-operator: filter -->

### `filter(_:)`

조건 클로저가 `true`를 반환한 값만 보내요.

```swift
Observable.of(1, 2, 3, 4)
  .filter { $0.isMultiple(of: 2) }
// 2, 4
```

조건이 `false`인 것은 오류가 아니라 단순히 전달하지 않는 값이에요. 조건 계산 중 던진 오류는 시퀀스를 종료해요.

<!-- rxswift-operator: distinctUntilChanged -->

### `distinctUntilChanged(...)`

바로 앞에서 통과시킨 값과 중복인 연속 값을 제거해요. 전체 이력을 기억하는 집합 연산이 아니므로 `1, 2, 1`은 모두 통과해요.

```swift
Observable.of(1, 1, 2, 2, 1)
  .distinctUntilChanged()
// 1, 2, 1
```

오버로드는 중복 기준을 다르게 표현해요.

| 형태                                           | 비교 기준                      |
| ---------------------------------------------- | ------------------------------ |
| `distinctUntilChanged()`                       | `Element: Equatable`의 `==`    |
| `distinctUntilChanged(comparer)`               | 두 `Element`를 비교하는 클로저 |
| `distinctUntilChanged(keySelector)`            | 각 값에서 뽑은 `Equatable` 키  |
| `distinctUntilChanged(keySelector, comparer:)` | 키와 사용자 정의 비교 클로저   |
| `distinctUntilChanged(at: keyPath)`            | `Equatable` 프로퍼티의 키 경로 |

```swift
struct Product {
  let id: Int
  let name: String
}

products
  .distinctUntilChanged(at: \.id)
```

검색어, 화면 상태처럼 같은 값으로 반복 작업할 필요가 없을 때 유용해요. 비교 대상이 큰 값이면 전체 값보다 작은 식별 키를 고르세요.

## 입력마다 누적 상태를 보내요

<!-- rxswift-operator: scan -->

### `scan(_:accumulator:)`와 `scan(into:accumulator:)`

초기값과 현재 입력으로 새 누적값을 만들고 **입력마다 중간 결과**를 보내요.

```swift
Observable.of(10, -3, 5)
  .scan(0, accumulator: +)
// 10, 7, 12
```

`scan(into:)`는 누적값을 `inout`으로 수정해요.

```swift
Observable.of("A", "B", "C")
  .scan(into: [String]()) { result, value in
    result.append(value)
  }
// ["A"], ["A", "B"], ["A", "B", "C"]
```

참조 타입을 누적하거나 외부에서 같은 값을 공유하면 과거 출력도 함께 바뀌는 것처럼 보일 수 있어요. 각 출력이 독립적인 상태 스냅샷이어야 하는지 확인하세요.

<!-- rxswift-operator: reduce -->

### `reduce(_:accumulator:)`와 `reduce(_:accumulator:mapResult:)`

모든 입력을 누적한 뒤 원본이 정상 완료하면 마지막 결과 하나를 보내요.

```swift
Observable.of(10, -3, 5)
  .reduce(0, accumulator: +)
// 정상 완료 뒤 12
```

`mapResult` 오버로드는 최종 누적값을 한 번 더 다른 결과로 바꿔요.

```swift
Observable.of(10, 20, 30)
  .reduce(
    (sum: 0, count: 0),
    accumulator: { state, value in
      (state.sum + value, state.count + 1)
    },
    mapResult: { state in
      Double(state.sum) / Double(state.count)
    }
  )
```

끝나지 않는 Observable은 최종 결과를 확정할 수 없으므로 `reduce`도 값을 보내지 않아요. 중간 결과가 필요하면 `scan`을 사용하세요.

## 키별 Observable로 나눠요

<!-- rxswift-operator: groupBy -->

### `groupBy(keySelector:)`

각 값에서 키를 뽑아 같은 키의 값을 `GroupedObservable<Key, Element>`로 묶어요. 바깥 Observable은 그룹을 보내고, 각 그룹 Observable은 해당 키의 값을 계속 보내요.

```swift
struct Message {
  let roomID: Int
  let text: String
}

messages
  .groupBy { $0.roomID }
  .flatMap { room in
    room
      .map { "[\(room.key)] \($0.text)" }
  }
```

키 종류가 계속 늘고 그룹이 오래 끝나지 않으면 그룹별 상태와 구독도 많아질 수 있어요. 유한한 키 공간인지, 그룹을 언제 종료할지 고려하세요.

## 이벤트 자체를 값으로 바꿔요

<!-- rxswift-operator: materialize -->

### `materialize()`

`.next`, `.error`, `.completed`를 `Event<Element>` 값으로 바꿔 일반 `.next`로 보내요. 원본 오류도 값이 되므로 materialized Observable 자체는 해당 오류로 실패하지 않고 이벤트를 보낸 뒤 정상 완료해요.

```swift
Observable<Int>.error(LoadError.offline)
  .materialize()
  .subscribe(onNext: { event in
    print(event)
  })
// error(LoadError.offline)라는 Event 값을 받고 completed
```

오류와 완료까지 하나의 값 흐름으로 검사하거나 테스트할 때 유용해요.

<!-- rxswift-operator: dematerialize -->

### `dematerialize()`

`EventConvertible` 값을 다시 실제 Observable 이벤트로 복원해요.

```swift
let events = Observable.of(
  Event.next(1),
  Event.next(2),
  Event.completed
)

events.dematerialize()
// 1, 2, completed
```

`materialize`로 이벤트를 값처럼 가공한 뒤 다시 원래 의미로 되돌릴 때 사용해요. 종료 이벤트 뒤의 값은 전달될 수 없어요.

## 객체를 강하게 소유하지 않고 함께 전달해요

<!-- rxswift-operator: withUnretained -->

### `withUnretained(_:)`와 `withUnretained(_:resultSelector:)`

객체를 약하게 참조하면서 각 값과 안전한 객체 참조를 튜플 또는 선택 결과로 보내요. 객체가 해제되면 시퀀스가 정상 완료해요.

```swift
query
  .withUnretained(self)
  .subscribe(onNext: { owner, query in
    owner.search(query)
  })
  .disposed(by: disposeBag)
```

결과 선택 오버로드는 튜플을 만들지 않고 원하는 값으로 바로 바꿔요.

```swift
query.withUnretained(self) { owner, query in
  owner.makeRequest(query)
}
```

`withUnretained` 뒤에 `share(replay: 1)`처럼 값을 보관하는 연산자를 두면 replay 버퍼가 객체가 포함된 결과를 강하게 보관할 수 있어요. 가능한 한 replay·buffer 뒤에서 `withUnretained`를 적용하거나 결과에서 객체를 제거하세요.

## 비슷한 연산자를 비교해요

| 원하는 결과                            | 연산자                 |
| -------------------------------------- | ---------------------- |
| 모든 입력을 새 값으로 바꿔요           | `map`                  |
| 변환 결과가 없는 입력을 버려요         | `compactMap`           |
| 조건에 맞는 원본 입력만 보내요         | `filter`               |
| 연속된 같은 상태를 한 번만 보내요      | `distinctUntilChanged` |
| 입력마다 누적 상태를 보내요            | `scan`                 |
| 정상 완료 뒤 최종 누적값만 보내요      | `reduce`               |
| 값·오류·완료를 모두 값처럼 처리해요    | `materialize`          |
| 객체를 강하게 잡지 않고 값과 함께 써요 | `withUnretained`       |

## 참고 자료

- [ObservableType 공식 API](https://docs.rxswift.org/protocols/observabletype)
- [RxSwift 연산자 구현](https://github.com/ReactiveX/RxSwift/tree/6.10.2/RxSwift/Observables)
- [withUnretained 구현](https://github.com/ReactiveX/RxSwift/blob/6.10.2/RxSwift/Observables/WithUnretained.swift)
