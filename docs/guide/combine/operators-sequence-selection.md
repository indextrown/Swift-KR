---
title: Combine 연산자 — 시퀀스와 요소 선택
description: append, prepend, drop, prefix, first, last, output 등 Publisher의 앞뒤를 연결하고 원하는 구간과 요소를 선택하는 연산자를 설명합니다.
---

# Combine 연산자 — 시퀀스와 요소 선택

> **면접 답변 한 줄 요약:** 시퀀스 연산자는 업스트림의 앞뒤에 값을 잇거나 일정 구간을 버리고, 선택 연산자는 필요한 위치나 조건의 값만 내보낸 뒤 가능한 시점에 구독을 끝내요.

이 페이지는 Apple `Publisher` 문서의 **Applying sequence operations to elements**와 **Selecting specific elements**에 속한 연산자를 모두 설명해요.

## 먼저 종료 시점을 구분해요

연산자가 원하는 값을 찾았다고 항상 업스트림 완료를 기다릴 필요는 없어요.

- `first`, `prefix`, `output(at:)`은 필요한 값을 받으면 업스트림을 취소하고 정상 완료할 수 있어요.
- `last`는 더 뒤의 값이 없는지 알아야 하므로 업스트림 정상 완료를 기다려요.
- `append`는 업스트림이 정상 완료해야 뒤쪽 Publisher나 값을 이어요.
- 업스트림이 실패하면 대부분 실패를 그대로 전달하고 뒤쪽 처리를 시작하지 않아요.

## 완료 뒤에 값을 이어 붙여요

<!-- combine-operator: append -->

### `append(_:)`

업스트림이 **정상 완료한 뒤** 다른 Publisher, Sequence, 또는 나열한 값을 이어서 보내요.

```swift
let cancellable = [1, 2].publisher
  .append(3, 4)
  .sink { print($0) }

// 1
// 2
// 3
// 4
```

세 가지 오버로드의 역할은 같아요.

| 입력                                 | 예시                       |
| ------------------------------------ | -------------------------- |
| 같은 `Output`, `Failure`의 Publisher | `first.append(second)`     |
| 같은 요소 타입의 Sequence            | `publisher.append([3, 4])` |
| 같은 타입의 값 여러 개               | `publisher.append(3, 4)`   |

업스트림이 실패하면 추가 값이나 뒤쪽 Publisher를 구독하지 않고 그 실패로 끝나요.

```swift
enum LoadError: Error {
  case failed
}

let cancellable = Fail<Int, LoadError>(error: .failed)
  .append(Just(3).setFailureType(to: LoadError.self))
  .sink(
    receiveCompletion: { print($0) },
    receiveValue: { print($0) }
  )

// failure(LoadError.failed)
```

## 시작 전에 값을 붙여요

<!-- combine-operator: prepend -->

### `prepend(_:)`

업스트림을 구독해 값을 받기 전에 다른 Publisher, Sequence, 또는 나열한 값을 먼저 보내요.

```swift
let cancellable = [3, 4].publisher
  .prepend(1, 2)
  .sink { print($0) }

// 1
// 2
// 3
// 4
```

Publisher를 받는 오버로드에서는 앞 Publisher가 정상 완료한 다음 원래 업스트림을 구독해요. 앞 Publisher가 실패하면 원래 업스트림까지 가지 않아요. 화면에 초기값을 먼저 보여 주려는 목적이라면 현재 값을 보관하는 `CurrentValueSubject`나 `@Published`가 모델에 더 잘 맞는지도 비교하세요.

## 시작 구간을 버려요

<!-- combine-operator: dropFirst -->

### `dropFirst(_:)`

처음 지정한 개수의 값을 버리고 나머지를 보내요. 기본값은 `1`이에요.

```swift
let cancellable = [10, 20, 30, 40].publisher
  .dropFirst(2)
  .sink { print($0) }

// 30
// 40
```

`@Published`가 구독 직후 보내는 현재 값은 필요 없고 이후 변경만 받고 싶을 때 `dropFirst()`를 자주 사용해요. 다만 초기값을 무조건 버리는 규칙이 정말 도메인 의도인지 확인하세요.

<!-- combine-operator: drop -->

### `drop(while:)`와 `drop(untilOutputFrom:)`

`drop(while:)`은 조건이 `true`인 시작 구간만 버려요. 처음 `false`가 나온 값부터는 조건을 다시 검사하지 않고 모든 값을 전달해요.

```swift
let cancellable = [1, 2, 5, 1, 6].publisher
  .drop { $0 < 5 }
  .sink { print($0) }

// 5
// 1
// 6
```

전체 흐름에서 조건에 맞지 않는 값을 계속 버리려면 `filter`를 사용해야 해요.

`drop(untilOutputFrom:)`은 두 번째 Publisher가 값을 하나 보낼 때까지 원래 업스트림 값을 버려요. 화면이 나타났다는 신호나 권한 준비 완료처럼 별도 시작 신호로 문을 열 때 사용해요.

```swift
let values = PassthroughSubject<Int, Never>()
let gate = PassthroughSubject<Void, Never>()

let cancellable = values
  .drop(untilOutputFrom: gate)
  .sink { print($0) }

values.send(1)  // 버려요.
gate.send(())
values.send(2)  // 2
```

두 Publisher의 `Failure` 타입이 같아야 하며, 게이트 Publisher의 실패도 다운스트림 실패가 될 수 있어요.

<!-- combine-operator: tryDrop -->

### `tryDrop(while:)`

시작 구간을 검사하는 클로저가 오류를 던질 수 있는 `drop(while:)`예요. 던진 오류는 실패 완료가 되고 `Failure`는 `any Error`가 돼요.

```swift
enum SequenceError: Error {
  case invalid
}

let cancellable = [1, -1, 5].publisher
  .tryDrop { value in
    guard value >= 0 else {
      throw SequenceError.invalid
    }
    return value < 5
  }
  .sink(
    receiveCompletion: { print($0) },
    receiveValue: { print($0) }
  )
```

## 시작 구간만 가져와요

<!-- combine-operator: prefix -->

### `prefix(_:)`, `prefix(while:)`, `prefix(untilOutputFrom:)`

`prefix(_:)`는 처음 지정한 개수만 보내고 정상 완료해요. 필요한 개수를 받으면 업스트림도 취소돼요.

```swift
let cancellable = [1, 2, 3, 4].publisher
  .prefix(2)
  .sink { print($0) }

// 1
// 2
```

`prefix(while:)`은 조건이 `true`인 동안 값을 보내다가 처음 `false`인 값을 만나면 그 값은 보내지 않고 정상 완료해요.

```swift
let cancellable = [1, 2, 5, 1].publisher
  .prefix { $0 < 5 }
  .sink { print($0) }

// 1
// 2
```

`prefix(untilOutputFrom:)`은 두 번째 Publisher가 값을 보낼 때까지 원래 업스트림 값을 전달하다가 신호가 오면 정상 완료해요.

```swift
let values = PassthroughSubject<Int, Never>()
let stop = PassthroughSubject<Void, Never>()

let cancellable = values
  .prefix(untilOutputFrom: stop)
  .sink(
    receiveCompletion: { print($0) },
    receiveValue: { print($0) }
  )

values.send(1)  // 1
stop.send(())   // finished
values.send(2)  // 전달되지 않아요.
```

이 오버로드는 종료 신호 Publisher의 출력만 관찰하며 원래 업스트림의 `Failure` 타입을 유지해요.

<!-- combine-operator: tryPrefix -->

### `tryPrefix(while:)`

조건 클로저가 오류를 던질 수 있는 `prefix(while:)`예요. 조건이 `false`이면 정상 완료하고, 검사 중 던지면 실패 완료한다는 차이가 있어요.

```swift
let cancellable = [1, -1, 5].publisher
  .tryPrefix { value in
    guard value >= 0 else {
      throw SequenceError.invalid
    }
    return value < 5
  }
  .sink(
    receiveCompletion: { print($0) },
    receiveValue: { print($0) }
  )
```

## 첫 번째 값을 선택해요

<!-- combine-operator: first -->

### `first()`와 `first(where:)`

`first()`는 첫 값 하나를 보내고 즉시 정상 완료해요. 업스트림이 값 없이 정상 완료하면 아무 값도 보내지 않아요.

```swift
let cancellable = [10, 20, 30].publisher
  .first()
  .sink { print($0) }

// 10
```

`first(where:)`는 조건을 만족하는 첫 값 하나를 보내요.

```swift
let cancellable = [1, 3, 4, 6].publisher
  .first { $0.isMultiple(of: 2) }
  .sink { print($0) }

// 4
```

조건을 만족하는 값이 없으면 업스트림 정상 완료 시 값 없이 완료해요.

<!-- combine-operator: tryFirst -->

### `tryFirst(where:)`

조건 클로저가 오류를 던질 수 있는 `first(where:)`예요. 값을 찾으면 정상 완료하고, 검사 중 오류가 나면 실패하며 `Failure`는 `any Error`가 돼요.

```swift
let cancellable = [1, -1, 4].publisher
  .tryFirst { value in
    guard value >= 0 else {
      throw SequenceError.invalid
    }
    return value.isMultiple(of: 2)
  }
  .sink(
    receiveCompletion: { print($0) },
    receiveValue: { print($0) }
  )
```

## 마지막 값을 선택해요

<!-- combine-operator: last -->

### `last()`와 `last(where:)`

`last()`는 업스트림이 정상 완료한 뒤 마지막 값 하나를 보내요. `last(where:)`는 조건을 만족했던 마지막 값을 기억했다가 완료 시 보내요.

```swift
let cancellable = [1, 2, 3, 4].publisher
  .last { $0.isMultiple(of: 2) }
  .sink { print($0) }

// 4
```

끝나지 않는 Publisher에서는 마지막 값을 확정할 수 없어요. “현재까지 최신 값”이 필요하면 `scan`, `combineLatest`, `CurrentValueSubject`처럼 입력마다 결과가 나오는 방법을 사용하세요.

<!-- combine-operator: tryLast -->

### `tryLast(where:)`

조건 클로저가 오류를 던질 수 있는 `last(where:)`예요. 일치하는 값을 찾았더라도 더 뒤의 값을 검사해야 하므로 업스트림 정상 완료까지 기다려요.

```swift
let cancellable = [1, 2, -1, 4].publisher
  .tryLast { value in
    guard value >= 0 else {
      throw SequenceError.invalid
    }
    return value.isMultiple(of: 2)
  }
  .sink(
    receiveCompletion: { print($0) },
    receiveValue: { print($0) }
  )
```

## 위치로 값을 선택해요

<!-- combine-operator: output -->

### `output(at:)`와 `output(in:)`

`output(at:)`은 0부터 시작하는 위치의 값 하나를 보내고 정상 완료해요.

```swift
let cancellable = ["A", "B", "C"].publisher
  .output(at: 1)
  .sink { print($0) }

// B
```

업스트림이 해당 위치보다 먼저 완료하면 값 없이 완료해요. `output(in:)`은 정수 범위에 속한 위치의 값들을 차례로 보내요.

```swift
let cancellable = ["A", "B", "C", "D"].publisher
  .output(in: 1..<3)
  .sink { print($0) }

// B
// C
```

범위의 마지막 위치까지 받으면 업스트림을 더 소비하지 않고 정상 완료할 수 있어요. 값의 위치가 아니라 내용으로 선택하려면 `filter`, `first(where:)`, `prefix(while:)`를 사용하세요.

## 비슷한 연산자를 비교해요

| 질문                                            | 연산자                                               |
| ----------------------------------------------- | ---------------------------------------------------- |
| 처음 N개를 버릴까요?                            | `dropFirst(N)`                                       |
| 시작 조건이 유지되는 동안 버릴까요?             | `drop(while:)`                                       |
| 모든 값에 계속 조건을 적용할까요?               | `filter(_:)`                                         |
| 처음 N개만 가져올까요?                          | `prefix(N)`                                          |
| 조건이 깨지기 전까지만 가져올까요?              | `prefix(while:)`                                     |
| 조건을 만족하는 첫 값만 가져올까요?             | `first(where:)`                                      |
| 조건을 만족하는 마지막 값을 완료 후 가져올까요? | `last(where:)`                                       |
| 다른 신호로 시작하거나 끝낼까요?                | `drop(untilOutputFrom:)`, `prefix(untilOutputFrom:)` |

## 적용 기준을 정리해요

1. 필요한 구간이 위치 기준인지 값의 조건 기준인지 정해요.
2. 결과를 찾는 즉시 끝낼 수 있는지 업스트림 완료를 기다려야 하는지 확인해요.
3. 초기값을 붙이는 일과 현재 상태를 보관하는 일을 구분해요.
4. `append` 뒤쪽 작업은 업스트림 실패 시 시작되지 않는다는 점을 고려해요.
5. 시작·종료 신호 Publisher의 실패와 취소도 함께 테스트해요.

## 참고 자료

- [Publisher — Applying sequence operations to elements](https://developer.apple.com/documentation/combine/publisher#Applying-sequence-operations-to-elements)
- [Publisher — Selecting specific elements](https://developer.apple.com/documentation/combine/publisher#Selecting-specific-elements)
- [Publishers.DropUntilOutput](https://developer.apple.com/documentation/combine/publishers/dropuntiloutput)
- [Publishers.PrefixUntilOutput](https://developer.apple.com/documentation/combine/publishers/prefixuntiloutput)
