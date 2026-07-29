---
title: Combine 연산자 — 변환과 필터링
description: map, scan, filter, compactMap, removeDuplicates와 try 변형 등 Combine의 값·오류 타입 변환 및 필터링 연산자를 예제로 설명합니다.
---

# Combine 연산자 — 변환과 필터링

> **면접 답변 한 줄 요약:** Combine의 변환 연산자는 값이나 오류의 타입을 바꾸고, 필터링 연산자는 조건에 맞는 값만 통과시키며, `try` 변형은 클로저가 던진 오류를 파이프라인의 실패로 바꿔요.

이 페이지는 Apple `Publisher` 문서의 **Mapping elements**와 **Filtering elements**에 속한 연산자를 모두 설명해요. 예제는 각각 독립적으로 실행할 수 있으며, 출력 확인을 위해 `sink`를 사용해요.

## 먼저 알아둘 타입 변화

| 연산자 종류                  | `Output` 변화                    | `Failure` 변화                        |
| ---------------------------- | -------------------------------- | ------------------------------------- |
| 일반 `map`, `filter`, `scan` | 연산자에 따라 유지되거나 새 타입 | 업스트림 `Failure`를 유지             |
| `try`로 시작하는 연산자      | 연산자에 따라 유지되거나 새 타입 | 클로저가 던질 수 있어 `any Error`     |
| `mapError`                   | 그대로 유지                      | 클로저가 반환하는 새 오류 타입        |
| `setFailureType`             | 그대로 유지                      | `Never`에서 지정한 오류 타입으로 맞춤 |

`try` 연산자는 단순히 문법이 다른 것이 아니라 파이프라인의 `Failure` 타입을 바꿔요. 클로저가 실제로 던질 일이 없다면 일반 연산자를 사용해야 뒤쪽의 오류 타입도 단순하게 유지돼요.

## 값을 다른 형태로 바꿔요

<!-- combine-operator: map -->

### `map(_:)`

업스트림의 모든 값을 클로저로 변환해요. 값의 개수와 완료 이벤트는 유지하고 `Output` 타입만 바꿀 수 있어요.

```swift
let cancellable = [1, 2, 3].publisher
  .map { "상품 \($0)" }
  .sink { print($0) }

// 상품 1
// 상품 2
// 상품 3
```

`map(\.name)`처럼 키 경로 하나를 전달할 수 있고, `map(\.name, \.price)`와 세 개의 키 경로 오버로드는 여러 프로퍼티를 튜플로 뽑아요. 키 경로 오버로드는 단순 프로퍼티 추출 의도를 클로저보다 짧게 표현해요.

<!-- combine-operator: tryMap -->

### `tryMap(_:)`

변환 중 오류를 던질 수 있는 `map`이에요. 던진 오류는 `.failure(error)` 완료가 되고 이후 값은 전달되지 않아요. 반환 Publisher의 `Failure`는 `any Error`예요.

```swift
enum ParseError: Error {
  case invalidNumber
}

let cancellable = ["10", "없음"].publisher
  .tryMap { text in
    guard let number = Int(text) else {
      throw ParseError.invalidNumber
    }
    return number
  }
  .sink(
    receiveCompletion: { print($0) },
    receiveValue: { print($0) }
  )

// 10
// failure(ParseError.invalidNumber)
```

<!-- combine-operator: replaceNil -->

### `replaceNil(with:)`

`Output`이 옵셔널일 때 `nil`을 지정한 값으로 바꾸고 옵셔널을 벗겨요. Publisher가 아무 값도 보내지 않는 상황은 `nil`과 다르므로 `replaceEmpty(with:)`를 사용해야 해요.

```swift
let cancellable = [1, nil, 3].publisher
  .replaceNil(with: 0)
  .sink { print($0) }

// 1
// 0
// 3
```

## 이전 결과를 기억하며 변환해요

<!-- combine-operator: scan -->

### `scan(_:_:)`

초기 누적값과 현재 값을 클로저에 전달하고, 계산된 누적값을 **입력마다** 내보내요. 최종 결과 하나만 내보내는 `reduce`와 달라요.

```swift
let cancellable = [10, -3, 5].publisher
  .scan(0, +)
  .sink { print($0) }

// 10
// 7
// 12
```

장바구니 합계나 진행 중 상태처럼 중간 누적값도 필요할 때 사용해요. 누적값이 큰 컬렉션이면 값마다 복사 비용이 생길 수 있으므로 상태 크기도 확인하세요.

<!-- combine-operator: tryScan -->

### `tryScan(_:_:)`

누적 클로저가 오류를 던질 수 있는 `scan`이에요. 유효하지 않은 중간 상태를 발견하면 실패로 끝낼 수 있으며 `Failure`는 `any Error`가 돼요.

```swift
enum BalanceError: Error {
  case overdrawn
}

let cancellable = [10, -3, -8].publisher
  .tryScan(0) { balance, change in
    let next = balance + change
    guard next >= 0 else {
      throw BalanceError.overdrawn
    }
    return next
  }
  .sink(
    receiveCompletion: { print($0) },
    receiveValue: { print($0) }
  )

// 10
// 7
// failure(BalanceError.overdrawn)
```

## 오류 타입을 바꿔요

<!-- combine-operator: mapError -->

### `mapError(_:)`

업스트림의 실패만 다른 오류 타입으로 변환해요. 정상 값은 그대로 통과하고, 실패하지 않으면 클로저도 호출되지 않아요.

```swift
enum APIError: Error {
  case requestFailed
}

let request = Fail<Int, URLError>(
  error: URLError(.notConnectedToInternet)
)

let cancellable = request
  .mapError { _ in APIError.requestFailed }
  .sink(
    receiveCompletion: { print($0) },
    receiveValue: { print($0) }
  )
```

하위 계층의 `URLError`, 디코딩 오류 등을 화면 계층이 이해하는 도메인 오류로 모을 때 유용해요. 원래 원인까지 진단해야 한다면 새 오류의 연관 값에 원본 오류를 보관하세요.

<!-- combine-operator: setFailureType -->

### `setFailureType(to:)`

`Failure == Never`인 Publisher가 지정한 오류 타입으로 실패하는 것처럼 타입만 맞춰요. 실제 오류를 새로 만들거나 보내지는 않아요.

```swift
enum SearchError: Error {
  case unavailable
}

let local = Just("저장된 결과")
  .setFailureType(to: SearchError.self)

let remote = Fail<String, SearchError>(error: .unavailable)

let cancellable = local
  .append(remote)
  .sink(
    receiveCompletion: { print($0) },
    receiveValue: { print($0) }
  )
```

실패하지 않는 로컬 Publisher를 실패 가능한 원격 Publisher와 결합할 때처럼 `Failure` 타입을 일치시키는 용도예요. 이미 실패 가능한 Publisher의 오류를 바꾸려면 `mapError`를 사용해요.

## 조건에 맞는 값만 통과시켜요

<!-- combine-operator: filter -->

### `filter(_:)`

조건 클로저가 `true`를 반환한 값만 다운스트림으로 보내요. 걸러진 값은 실패가 아니며 조용히 사라져요.

```swift
let cancellable = [1, 2, 3, 4].publisher
  .filter { $0.isMultiple(of: 2) }
  .sink { print($0) }

// 2
// 4
```

<!-- combine-operator: tryFilter -->

### `tryFilter(_:)`

조건을 계산하다 오류를 던질 수 있는 `filter`예요. 오류를 던지면 파이프라인이 실패하고 `Failure`는 `any Error`가 돼요.

```swift
enum ValidationError: Error {
  case negative
}

let cancellable = [1, -1, 2].publisher
  .tryFilter { value in
    guard value >= 0 else {
      throw ValidationError.negative
    }
    return value.isMultiple(of: 2)
  }
  .sink(
    receiveCompletion: { print($0) },
    receiveValue: { print($0) }
  )
```

단순히 조건에 맞지 않는 값은 `false`, 데이터 자체가 잘못되어 흐름을 중단해야 하는 상황은 `throw`로 구분할 수 있어요.

<!-- combine-operator: compactMap -->

### `compactMap(_:)`

각 값을 새 값으로 변환하되 클로저가 `nil`을 반환한 입력은 버려요. `map`과 `filter`를 한 단계로 합친 형태예요.

```swift
let cancellable = ["10", "없음", "30"].publisher
  .compactMap(Int.init)
  .sink { print($0) }

// 10
// 30
```

파싱 실패를 무시해도 되는 입력에 적합해요. 실패 이유가 중요하거나 잘못된 입력에서 흐름을 끝내야 한다면 `tryMap`을 사용하세요.

<!-- combine-operator: tryCompactMap -->

### `tryCompactMap(_:)`

`nil`이면 값을 버리고, 오류를 던지면 실패로 끝내는 `compactMap`이에요. “없는 값”과 “잘못된 값”을 나눌 때 사용해요.

```swift
enum ScoreError: Error {
  case outOfRange
}

let cancellable = ["42", "", "120"].publisher
  .tryCompactMap { text -> Int? in
    guard !text.isEmpty else { return nil }
    guard let score = Int(text), 0...100 ~= score else {
      throw ScoreError.outOfRange
    }
    return score
  }
  .sink(
    receiveCompletion: { print($0) },
    receiveValue: { print($0) }
  )
```

## 연속된 중복을 제거해요

<!-- combine-operator: removeDuplicates -->

### `removeDuplicates()`와 `removeDuplicates(by:)`

바로 앞에서 통과시킨 값과 같은 새 값을 버려요. 전체 이력을 검사하는 집합 연산이 아니므로 `1, 2, 1`은 세 값 모두 통과해요.

```swift
let cancellable = [1, 1, 2, 2, 1].publisher
  .removeDuplicates()
  .sink { print($0) }

// 1
// 2
// 1
```

매개변수 없는 오버로드는 `Output: Equatable`일 때 `==`를 사용해요. `removeDuplicates(by:)`는 두 값이 중복인지 직접 판단하므로 식별자나 일부 프로퍼티만 비교할 수 있어요.

```swift
struct Product {
  let id: Int
  let name: String
}

let products = [
  Product(id: 1, name: "연필"),
  Product(id: 1, name: "연필"),
  Product(id: 2, name: "지우개"),
]

let cancellable = products.publisher
  .removeDuplicates { $0.id == $1.id }
  .sink { print($0.name) }
```

<!-- combine-operator: tryRemoveDuplicates -->

### `tryRemoveDuplicates(by:)`

중복 비교가 오류를 던질 수 있는 변형이에요. 비교 중 던진 오류는 실패 완료가 되고 `Failure`는 `any Error`로 바뀌어요.

```swift
enum ComparisonError: Error {
  case invalidID
}

let cancellable = products.publisher
  .tryRemoveDuplicates { previous, current in
    guard previous.id > 0, current.id > 0 else {
      throw ComparisonError.invalidID
    }
    return previous.id == current.id
  }
  .sink(
    receiveCompletion: { print($0) },
    receiveValue: { print($0.name) }
  )
```

비교가 실패할 이유가 없다면 일반 `removeDuplicates(by:)`를 사용해 오류 타입을 넓히지 마세요.

## 값이 없거나 실패했을 때 대체해요

<!-- combine-operator: replaceEmpty -->

### `replaceEmpty(with:)`

업스트림이 값을 하나도 보내지 않고 정상 완료하면 대체 값 하나를 보낸 뒤 정상 완료해요. 업스트림이 실패하면 대체하지 않고 실패를 그대로 전달해요.

```swift
let cancellable = Empty<String, Never>()
  .replaceEmpty(with: "검색 결과 없음")
  .sink { print($0) }

// 검색 결과 없음
```

`filter`나 `compactMap` 뒤에서 모든 값이 제거된 경우에도 사용할 수 있어요. `nil` 값 하나를 바꾸는 `replaceNil(with:)`와 구분하세요.

<!-- combine-operator: replaceError -->

### `replaceError(with:)`

업스트림이 실패하면 오류 대신 대체 값 하나를 보내고 **정상 완료**해요. 반환 Publisher의 `Failure`는 `Never`가 돼요.

```swift
let cancellable = Fail<Int, URLError>(
  error: URLError(.timedOut)
)
.replaceError(with: -1)
.sink { print($0) }

// -1
```

오류 정보를 버리므로 “대체 값을 보여 주면 충분한가?”를 먼저 판단해야 해요. 오류에 따라 다른 Publisher로 복구하거나 로그를 남겨야 한다면 `catch`가 더 적합해요.

## 비슷한 연산자를 비교해요

| 원하는 동작                                 | 연산자          |
| ------------------------------------------- | --------------- |
| 모든 입력을 다른 값으로 바꿔요              | `map`           |
| 변환 실패를 오류로 끝내요                   | `tryMap`        |
| 변환 결과가 없는 입력만 버려요              | `compactMap`    |
| 없는 입력은 버리고 잘못된 입력은 실패시켜요 | `tryCompactMap` |
| 입력마다 현재 누적값을 보내요               | `scan`          |
| 마지막 누적값 하나만 보내요                 | `reduce`        |
| `nil`이라는 값을 바꿔요                     | `replaceNil`    |
| 값 없이 정상 완료한 흐름에 값을 넣어요      | `replaceEmpty`  |
| 실패한 흐름을 대체 값으로 정상 완료시켜요   | `replaceError`  |

## 적용 기준을 정리해요

1. `Output`만 바꿀지, 값의 개수도 줄일지 먼저 정해요.
2. “버릴 값”과 “실패시킬 값”을 구분해요.
3. 클로저가 던질 필요가 없으면 `try`가 없는 연산자를 선택해요.
4. `try` 연산자 뒤에서 도메인 오류가 필요하면 `mapError`로 다시 제한해요.
5. `replaceError`가 원인을 숨겨도 되는지 확인해요.
6. 상태 누적은 `scan`, 최종 집계는 `reduce`로 구분해요.

## 참고 자료

- [Publisher — Mapping elements](https://developer.apple.com/documentation/combine/publisher#Mapping-elements)
- [Publisher — Filtering elements](https://developer.apple.com/documentation/combine/publisher#Filtering-elements)
- [Publishers.Map](https://developer.apple.com/documentation/combine/publishers/map)
- [Publishers.RemoveDuplicates](https://developer.apple.com/documentation/combine/publishers/removeduplicates)
