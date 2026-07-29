---
title: Combine 연산자 — 축약과 조건 판정
description: collect, reduce, count, min, max, contains, allSatisfy 등 여러 값을 모으거나 최종 결과와 조건 판정을 만드는 Combine 연산자를 설명합니다.
---

# Combine 연산자 — 축약과 조건 판정

> **면접 답변 한 줄 요약:** 축약 연산자는 여러 입력을 배열이나 값 하나로 모으고, 조건 판정 연산자는 입력을 검사해 `Bool` 하나를 내보내며, 대부분 업스트림이 완료되어야 최종 결과를 확정해요.

이 페이지는 Apple `Publisher` 문서의 **Reducing elements**, **Applying mathematical operations on elements**, **Applying matching criteria to elements**에 속한 연산자를 모두 설명해요.

## 먼저 완료 시점을 확인해요

`collect()`, `reduce`, `count`, `min`, `max`는 앞으로 값이 더 올 수 있는 동안 최종 결과를 알 수 없어요. 따라서 유한한 업스트림이 정상 완료해야 값을 내보내요. 끝나지 않는 타이머나 Subject에 그대로 사용하면 결과도 영원히 나오지 않을 수 있어요.

반면 아래 조건 판정은 답이 확정되는 순간 일찍 끝날 수 있어요.

- `contains`는 일치하는 값 하나를 찾으면 `true`를 보내고 끝나요.
- `allSatisfy`는 조건을 어기는 값 하나를 찾으면 `false`를 보내고 끝나요.

## 값을 배열로 모아요

<!-- combine-operator: collect -->

### `collect()`, `collect(_:)`, `collect(_:options:)`

`collect()`는 정상 완료할 때까지 모든 값을 배열에 모아 한 번 내보내요.

```swift
let cancellable = [1, 2, 3].publisher
  .collect()
  .sink { print($0) }

// [1, 2, 3]
```

입력이 많거나 끝나지 않으면 메모리 사용량도 계속 늘어나요. 전체 값이 꼭 필요하지 않다면 개수나 시간 기준 오버로드를 사용하세요.

`collect(_:)`는 지정한 최대 개수씩 배열로 묶어요. 마지막 묶음은 개수보다 작을 수 있어요.

```swift
let cancellable = [1, 2, 3, 4, 5].publisher
  .collect(2)
  .sink { print($0) }

// [1, 2]
// [3, 4]
// [5]
```

`collect(_:options:)`의 첫 매개변수는 `Publishers.TimeGroupingStrategy`예요.

- `.byTime(scheduler, interval)`은 일정 시간마다 모은 값을 보내요.
- `.byTimeOrCount(scheduler, interval, count)`는 시간이나 개수 중 먼저 충족한 기준으로 보내요.
- `options`는 선택한 스케줄러에 전달할 실행 옵션이에요.

```swift
let cancellable = subject
  .collect(
    .byTimeOrCount(
      DispatchQueue.main,
      .seconds(1),
      20
    )
  )
  .sink { batch in
    print("한 번에 처리할 값:", batch)
  }
```

시간 기반 묶음은 다운스트림 호출 횟수를 줄여요. 다만 업스트림이 매우 빠르면 묶음 안의 값이 많아질 수 있으므로 개수 제한도 함께 고려하세요.

## 값은 버리고 완료만 전달해요

<!-- combine-operator: ignoreOutput -->

### `ignoreOutput()`

업스트림의 모든 값을 버리고 정상 완료나 실패만 전달해요. 반환 Publisher의 `Output` 타입 자체는 유지되지만 실제 출력은 없어요.

```swift
let cancellable = [1, 2, 3].publisher
  .ignoreOutput()
  .sink(
    receiveCompletion: { print($0) },
    receiveValue: { print("호출되지 않음:", $0) }
  )

// finished
```

값은 필요 없고 작업의 성공·실패가 끝나는 시점만 다음 단계에 연결할 때 유용해요.

## 마지막 누적값 하나를 만들어요

<!-- combine-operator: reduce -->

### `reduce(_:_:)`

초기값과 각 입력을 누적한 뒤 업스트림이 정상 완료하면 마지막 결과 하나를 보내요.

```swift
let cancellable = [10, -3, 5].publisher
  .reduce(0, +)
  .sink { print($0) }

// 12
```

입력마다 중간 누적값도 필요하면 `scan`을 사용해요. 큰 배열을 계속 복사하는 누적 클로저는 성능 비용이 커질 수 있으므로 필요한 정보만 누적하세요.

<!-- combine-operator: tryReduce -->

### `tryReduce(_:_:)`

누적 클로저가 오류를 던질 수 있는 `reduce`예요. 오류가 발생하면 최종 값 없이 실패하고 `Failure`는 `any Error`가 돼요.

```swift
enum TotalError: Error {
  case negativePrice
}

let cancellable = [10, 20, -1].publisher
  .tryReduce(0) { total, price in
    guard price >= 0 else {
      throw TotalError.negativePrice
    }
    return total + price
  }
  .sink(
    receiveCompletion: { print($0) },
    receiveValue: { print($0) }
  )
```

## 값의 개수를 세어요

<!-- combine-operator: count -->

### `count()`

업스트림이 정상 완료하면 받은 값의 개수를 `Int` 하나로 보내요. 실패하면 개수를 보내지 않고 실패를 전달해요.

```swift
let cancellable = ["A", "B", "C"].publisher
  .count()
  .sink { print($0) }

// 3
```

조건에 맞는 값만 세려면 `filter` 뒤에 `count()`를 연결해요.

## 가장 작은 값과 큰 값을 찾아요

<!-- combine-operator: min -->

### `min()`과 `min(by:)`

업스트림이 정상 완료하면 가장 작은 값 하나를 보내요. 입력이 없으면 값 없이 정상 완료해요.

```swift
let cancellable = [7, 2, 9].publisher
  .min()
  .sink { print($0) }

// 2
```

매개변수 없는 `min()`은 `Output: Comparable`일 때 `<`를 사용해요. `min(by:)`는 첫 번째 값을 두 번째보다 앞에 둘지를 판단하는 비교 클로저를 받아 사용자 정의 타입이나 다른 정렬 기준을 지원해요.

<!-- combine-operator: tryMin -->

### `tryMin(by:)`

비교 클로저가 오류를 던질 수 있는 `min(by:)`예요. 비교 중 오류가 나면 실패하고 `Failure`는 `any Error`가 돼요.

```swift
enum RankError: Error {
  case invalid
}

let cancellable = [3, -1, 2].publisher
  .tryMin { left, right in
    guard left >= 0, right >= 0 else {
      throw RankError.invalid
    }
    return left < right
  }
  .sink(
    receiveCompletion: { print($0) },
    receiveValue: { print($0) }
  )
```

<!-- combine-operator: max -->

### `max()`와 `max(by:)`

업스트림이 정상 완료하면 가장 큰 값 하나를 보내요. 입력이 없으면 값 없이 정상 완료해요.

```swift
struct Product {
  let name: String
  let price: Int
}

let products = [
  Product(name: "연필", price: 1_000),
  Product(name: "노트", price: 3_000),
]

let cancellable = products.publisher
  .max { $0.price < $1.price }
  .sink { print($0.name) }

// 노트
```

매개변수 없는 `max()`는 `Output: Comparable`일 때 사용하고, `max(by:)`는 비교 기준을 직접 받아요.

<!-- combine-operator: tryMax -->

### `tryMax(by:)`

비교 클로저가 오류를 던질 수 있는 `max(by:)`예요. 검증과 비교를 함께 해야 하는 경우에만 사용하고, 단순 비교라면 일반 오버로드로 오류 타입을 유지하세요.

```swift
let cancellable = products.publisher
  .tryMax { left, right in
    guard left.price >= 0, right.price >= 0 else {
      throw RankError.invalid
    }
    return left.price < right.price
  }
  .sink(
    receiveCompletion: { print($0) },
    receiveValue: { print($0.name) }
  )
```

## 값 하나라도 일치하는지 확인해요

<!-- combine-operator: contains -->

### `contains(_:)`와 `contains(where:)`

`contains(_:)`는 `Output: Equatable`일 때 지정한 값과 같은 입력이 하나라도 있는지 확인해요. 일치하면 즉시 `true`를 보내고 정상 완료해요. 끝까지 없으면 업스트림 정상 완료 시 `false`를 보내요.

```swift
let cancellable = [1, 2, 3].publisher
  .contains(2)
  .sink { print($0) }

// true
```

`contains(where:)`는 직접 조건을 정해요.

```swift
let cancellable = products.publisher
  .contains { $0.price >= 3_000 }
  .sink { print($0) }

// true
```

<!-- combine-operator: tryContains -->

### `tryContains(where:)`

조건 클로저가 오류를 던질 수 있는 `contains`예요. 일치하면 `true`로 일찍 끝나고, 검사 중 오류가 발생하면 실패하며 `Failure`는 `any Error`가 돼요.

```swift
let cancellable = [1, -1, 4].publisher
  .tryContains { value in
    guard value >= 0 else {
      throw RankError.invalid
    }
    return value.isMultiple(of: 2)
  }
  .sink(
    receiveCompletion: { print($0) },
    receiveValue: { print($0) }
  )
```

## 모든 값이 조건을 만족하는지 확인해요

<!-- combine-operator: allSatisfy -->

### `allSatisfy(_:)`

모든 입력이 조건을 만족하는지 검사해요. 조건을 어기는 값이 하나라도 오면 즉시 `false`를 보내고 정상 완료해요. 끝까지 모두 만족하거나 입력이 비어 있으면 업스트림 정상 완료 시 `true`를 보내요.

```swift
let cancellable = [2, 4, 6].publisher
  .allSatisfy { $0.isMultiple(of: 2) }
  .sink { print($0) }

// true
```

빈 입력의 결과가 `true`인 이유는 조건을 위반한 값이 하나도 없기 때문이에요. 빈 입력을 별도로 처리해야 한다면 `collect()`한 뒤 비어 있는지도 함께 검사하세요.

<!-- combine-operator: tryAllSatisfy -->

### `tryAllSatisfy(_:)`

조건 클로저가 오류를 던질 수 있는 `allSatisfy`예요. 조건 위반은 `false`와 정상 완료이고, 검사 자체의 실패는 `.failure`라는 차이가 있어요.

```swift
let cancellable = [2, -1, 4].publisher
  .tryAllSatisfy { value in
    guard value >= 0 else {
      throw RankError.invalid
    }
    return value.isMultiple(of: 2)
  }
  .sink(
    receiveCompletion: { print($0) },
    receiveValue: { print($0) }
  )
```

## 결과가 나오는 시점을 비교해요

| 연산자                          | 결과 개수    | 결과가 확정되는 시점                   |
| ------------------------------- | ------------ | -------------------------------------- |
| `collect()`                     | 배열 하나    | 정상 완료                              |
| `collect(count)`                | 배열 여러 개 | 개수가 차거나 정상 완료                |
| `reduce`, `count`, `min`, `max` | 최대 한 값   | 정상 완료                              |
| `contains`                      | `Bool` 하나  | 일치하면 즉시, 없으면 정상 완료        |
| `allSatisfy`                    | `Bool` 하나  | 위반하면 즉시, 모두 만족하면 정상 완료 |
| `ignoreOutput`                  | 값 없음      | 업스트림 완료만 그대로 전달            |

## 적용 기준을 정리해요

1. 중간 결과가 필요한지 최종 결과만 필요한지 정해요.
2. 업스트림이 실제로 완료되는 흐름인지 확인해요.
3. 전체 값을 모을 필요가 없으면 `collect()` 대신 `reduce`로 필요한 정보만 누적해요.
4. 빠른 흐름을 묶을 때 개수와 시간 제한을 함께 검토해요.
5. 조건 불일치와 검사 오류를 구분해야 할 때만 `try` 변형을 사용해요.

## 참고 자료

- [Publisher — Reducing elements](https://developer.apple.com/documentation/combine/publisher#Reducing-elements)
- [Publisher — Applying mathematical operations on elements](https://developer.apple.com/documentation/combine/publisher#Applying-mathematical-operations-on-elements)
- [Publisher — Applying matching criteria to elements](https://developer.apple.com/documentation/combine/publisher#Applying-matching-criteria-to-elements)
- [Processing Published Elements with Subscribers](https://developer.apple.com/documentation/combine/processing-published-elements-with-subscribers)
