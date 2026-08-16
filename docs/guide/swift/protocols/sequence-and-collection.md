---
title: Swift로 이해하는 Sequence와 Collection
description: Sequence의 iteration과 single-pass 가능성, Collection의 반복 접근·index·slice·성능 계약과 custom collection 구현 방법을 설명합니다.
pageType: doc-wide
outline: false
---

# Swift로 이해하는 Sequence와 Collection

> **면접 답변 한 줄 요약:** `Sequence`는 iterator로 원소를 한 번씩 꺼낼 수 있다는 최소 계약이고, `Collection`은 유한한 원소를 손상 없이 여러 번 순회하며 유효한 index로 접근할 수 있다는 더 강한 계약이라 더 많은 알고리즘과 성능 보장을 제공해요.

배열, 문자열, dictionary와 range는 모두 `for-in`으로 순회할 수 있어요. 하지만 “순회할 수 있다”는 사실만으로 두 번 반복해도 같은 값이 나오는지, 원하는 위치를 subscript로 읽을 수 있는지, `count`가 빠른지는 알 수 없어요.

Swift는 이런 능력을 `Sequence`, `Collection`, `BidirectionalCollection`, `RandomAccessCollection` 같은 프로토콜 계층으로 표현해요. 제네릭 함수가 실제로 필요한 가장 약한 계약을 받으면 array뿐 아니라 lazy sequence와 custom collection에도 재사용할 수 있어요.

이 문서에서는 다음 내용을 설명해요.

- `IteratorProtocol`과 `Sequence.makeIterator()`의 관계
- single-pass sequence를 두 번 순회하면 안 되는 이유
- `Collection`의 multipass, 유한성, subscript와 index 계약
- `startIndex`, `endIndex`, slice와 index invalidation
- bidirectional·random access·mutable collection의 차이
- lazy algorithm과 custom collection 구현

## 먼저 알아둘 순회 용어

| 용어            | 쉬운 뜻                                                                                                                 |
| --------------- | ----------------------------------------------------------------------------------------------------------------------- |
| iteration       | 원소를 하나씩 순서대로 방문하는 과정이에요.                                                                             |
| iterator        | 현재 순회 위치를 기억하고 `next()`마다 다음 원소를 내주는 값이에요.                                                     |
| single-pass     | 한 번 읽으면 소비되어 같은 값에서 다시 처음부터 순회할 수 있다고 보장하지 않는 성질이에요.                              |
| multipass       | 같은 collection을 여러 번 순회해도 같은 원소와 순서를 다시 얻을 수 있는 성질이에요.                                     |
| index           | collection 안의 특정 위치를 나타내는 값이에요. 반드시 `Int`이거나 0부터 시작하는 것은 아니에요.                         |
| `endIndex`      | 마지막 원소 뒤의 위치예요. 순회 종료를 표시하지만 실제 원소가 없으므로 subscript하면 안 돼요.                           |
| slice           | 원본 collection의 일부 구간을 같은 index 체계로 보여 주는 view예요. `ArraySlice`와 `Substring`이 대표적이에요.          |
| eager operation | 호출 시 모든 원소를 즉시 처리하고 결과를 만드는 연산이에요.                                                             |
| lazy operation  | 결과 원소가 실제로 필요할 때까지 변환을 미루는 연산이에요.                                                              |
| Big O           | 입력 크기가 커질 때 연산 시간이 어떻게 늘어나는지 나타내는 표기예요. `O(1)`은 크기와 무관, `O(n)`은 원소 수에 비례해요. |

## `for-in`은 iterator의 `next()`를 반복해요

가장 작은 순회 계약은 `IteratorProtocol`이에요.

```swift
protocol IteratorProtocol<Element> {
  mutating func next() -> Element?
}
```

`next()`는 다음 원소가 있으면 반환하고 끝나면 `nil`을 반환해요. `Sequence`는 새 iterator를 만드는 `makeIterator()`를 제공해요.

```swift
protocol Sequence<Element> {
  associatedtype Iterator: IteratorProtocol
    where Iterator.Element == Element

  func makeIterator() -> Iterator
}
```

실제 표준 라이브러리 선언에는 Swift 버전에 따른 추가 제약과 기본 구현이 있어요. 개념적으로 `for-in`은 다음과 비슷하게 동작해요.

```swift
var iterator = values.makeIterator()

while let element = iterator.next() {
  print(element)
}
```

호출자는 iterator의 내부 위치를 몰라도 `next()`라는 공통 인터페이스로 원소를 소비해요.

## Sequence는 두 번 순회할 수 있다고 보장하지 않아요

`Sequence`는 iteration이 원본을 파괴적으로 소비하는지 요구하지 않아요. 다음 custom sequence는 자기 자신이 iterator인 참조 타입이에요.

```swift
final class OnePassCounter: Sequence, IteratorProtocol {
  private var current: Int

  init(from start: Int) {
    current = start
  }

  func next() -> Int? {
    guard current > 0 else { return nil }
    defer { current -= 1 }
    return current
  }
}

let counter = OnePassCounter(from: 3)
print(Array(counter)) // [3, 2, 1]
print(Array(counter)) // []
```

첫 순회가 같은 객체의 iteration state를 끝까지 소비했어요. 모든 `Sequence`가 이 방식이라는 뜻은 아니고, `Sequence` 계약만으로는 반복 순회의 결과를 가정할 수 없다는 뜻이에요.

따라서 제네릭 함수가 같은 원소를 여러 번 살펴봐야 한다면 다음 중 하나를 선택해요.

- 입력을 `Collection`으로 더 강하게 제한해요.
- sequence를 한 번 `Array`로 materialize해요.
- 한 번 순회하는 알고리즘으로 다시 설계해요.

## Sequence만으로 많은 공통 알고리즘을 얻어요

```swift
let minutes = [10, 20, 30, 40]

let longSessions = minutes.filter { $0 >= 30 }
let doubled = minutes.map { $0 * 2 }
let total = minutes.reduce(0, +)
let hasShortSession = minutes.contains { $0 < 15 }
```

`map`, `filter`, `reduce`, `contains(where:)`, `first(where:)`와 `sorted` 같은 연산은 순차 접근만으로 구현할 수 있어 `Sequence`에 제공돼요. generic API가 index를 사용하지 않는다면 `Collection`보다 `Sequence`를 받는 편이 더 넓은 입력을 지원해요.

```swift
func totalMinutes<Values: Sequence>(
  in values: Values
) -> Int where Values.Element == Int {
  values.reduce(0, +)
}
```

이 함수는 배열, set, range와 custom sequence에 모두 사용할 수 있어요.

## Collection은 유한하고 multipass이며 index 접근을 제공해요

`Collection`은 `Sequence`를 상속하고 더 강한 계약을 추가해요.

- 원소의 위치가 `startIndex`부터 `endIndex`까지 유한해요.
- 원소를 손상시키지 않고 여러 번 순회할 수 있어요.
- 유효한 index로 subscript해 원소를 읽을 수 있어요.
- `index(after:)`로 다음 위치를 얻을 수 있어요.
- index로 순회한 원소와 iterator로 순회한 원소의 순서가 같아요.

```swift
func printFirstAndLast<C: Collection>(
  _ values: C
) {
  guard let first = values.first,
        let last = values.last
  else { return }

  print(first, last)
}
```

`last`는 collection이 유한하고 다시 접근할 수 있다는 전제가 필요해요. 단순 single-pass sequence에서는 끝까지 소비한 뒤 처음 상태를 유지하지 못할 수 있어요.

## index는 offset 정수가 아니라 collection의 위치 타입이에요

배열 index는 흔히 `Int`라서 모든 collection이 0-based integer라고 오해하기 쉬워요. 문자열 index는 Unicode 경계 정보를 가진 `String.Index`예요.

```swift
let title = "📘 Swift"
let first = title.startIndex
let next = title.index(after: first)

print(title[first]) // 📘
print(title[next])  // 공백
```

다음처럼 임의 정수로 문자열을 subscript할 수 없어요.

```swift
// title[1] // compile error
```

generic collection code에서는 `index(after:)`, `index(_:offsetBy:)`, `indices`를 사용하고 `Index == Int`라고 가정하지 마세요.

## `endIndex`는 마지막 원소가 아니에요

```swift
let values = [10, 20, 30]

values.startIndex // 0
values.endIndex   // 3
values[values.startIndex] // 10
// values[values.endIndex] // runtime error
```

`endIndex`는 “마지막 원소 뒤”를 나타내 순회 종료 조건으로 사용해요. 비어 있는 collection에서는 `startIndex == endIndex`예요.

마지막 원소가 필요하면 `last`를 사용하거나 비어 있지 않음을 확인한 뒤 `index(before:)`를 사용해요. `index(before:)`는 `BidirectionalCollection`에서 제공해요.

## slice는 0부터 다시 시작하지 않을 수 있어요

```swift
let values = [10, 20, 30, 40]
let suffix = values.suffix(2)

print(suffix.startIndex) // 2
print(suffix[suffix.startIndex]) // 30
```

`ArraySlice`는 원본과 index를 공유하므로 `suffix[0]`을 가정하면 안 돼요. generic code는 항상 전달받은 collection의 `startIndex`를 사용해요.

slice는 원본 storage 일부를 공유할 수 있어요. 큰 array의 작은 slice를 오래 보관하면 큰 backing storage가 유지될 수 있으므로 장기 보관할 작은 결과가 필요하면 새 `Array`로 복사하는 것을 검토해요.

```swift
let persisted = Array(suffix)
```

## mutation은 저장해 둔 index를 무효화할 수 있어요

```swift
var titles = ["Swift", "Testing", "Concurrency"]
let savedIndex = titles.index(after: titles.startIndex)

titles.removeFirst()
// savedIndex를 다시 사용해도 되는지는 collection의
// index invalidation 규칙을 확인해야 해요.
```

mutation 뒤 index가 계속 유효한지는 `MutableCollection`, `RangeReplaceableCollection`과 구체 타입의 문서가 정해요. 원소 삽입·삭제가 가능한 generic algorithm은 mutation 전 index를 무조건 재사용하지 마세요.

다른 collection에서 얻은 index를 사용해도 안 돼요. index type이 우연히 같아도 그 위치는 원래 collection에만 유효해요.

## Collection 계층은 이동과 mutation 능력을 나눠요

| 프로토콜                     | 추가하는 핵심 능력                           | 대표 타입                      |
| ---------------------------- | -------------------------------------------- | ------------------------------ |
| `Sequence`                   | 순서대로 한 번씩 iteration                   | one-pass stream, lazy sequence |
| `Collection`                 | 유한·multipass·forward index subscript       | `String`, `Set`, `Dictionary`  |
| `BidirectionalCollection`    | `index(before:)`로 뒤로 이동                 | `String`, `Array`              |
| `RandomAccessCollection`     | 임의 거리 이동과 distance를 상수 시간에 제공 | `Array`, `Range<Int>`          |
| `MutableCollection`          | 기존 위치의 원소 교체                        | `Array`                        |
| `RangeReplaceableCollection` | 구간 삽입·삭제로 collection 길이 변경        | `Array`, `String`              |

`MutableCollection`과 `RangeReplaceableCollection`은 이동 방향 계층과 다른 능력을 표현해요. 원소를 바꿀 수 있다고 길이까지 바꿀 수 있는 것은 아니에요.

가장 강한 `RandomAccessCollection`을 습관적으로 요구하지 말고 algorithm이 실제로 임의 거리 이동을 사용하는지 확인하세요.

## `count`와 offset 접근 비용은 구체 능력에 따라 달라요

`Collection`은 subscript, `startIndex`, `endIndex`가 `O(1)`이기를 기대해요. 하지만 `count`는 모든 collection에서 반드시 `O(1)`은 아니에요.

- `RandomAccessCollection`은 두 index 사이 거리를 빠르게 계산할 수 있어 일반적으로 `count`가 `O(1)`이에요.
- forward나 bidirectional collection은 거리를 알기 위해 원소를 순회해 `O(n)`일 수 있어요.
- `Sequence`의 일반적인 전체 순회 연산은 별도 문서가 없다면 `O(n)`으로 생각해요.

loop 조건에서 매번 비용 큰 `count`와 offset을 계산하지 말고 index iteration이나 `isEmpty`, `first`처럼 목적에 맞는 API를 사용해요.

## lazy sequence는 실제로 필요한 원소만 처리해요

일반 `map`과 `filter`는 즉시 결과 array를 만들어요.

```swift
let result = Array(1...1_000_000)
  .map { $0 * 2 }
  .filter { $0.isMultiple(of: 3) }
  .prefix(3)
```

앞의 세 결과만 필요해도 큰 intermediate array를 만들 수 있어요. `lazy`를 사용하면 요청된 원소를 만들 때 변환해요.

```swift
let result = (1...1_000_000)
  .lazy
  .map { $0 * 2 }
  .filter { $0.isMultiple(of: 3) }
  .prefix(3)

print(Array(result)) // [6, 12, 18]
```

lazy가 항상 빠른 것은 아니에요. 여러 번 순회하면 계산을 반복할 수 있고 closure와 wrapper 비용이 생겨요. 결과를 재사용하거나 random access가 필요하면 적절한 시점에 `Array`로 materialize해요.

## 작은 wrapper를 Collection으로 만들어요

배열을 감싼 독서 기록 collection이 domain API를 제공하면서 표준 collection algorithm도 사용하게 해 볼게요.

```swift
struct ReadingSession: Equatable {
  let title: String
  let minutes: Int
}

struct ReadingLog: Collection {
  private var storage: [ReadingSession]

  init(_ sessions: [ReadingSession]) {
    storage = sessions
  }

  var startIndex: Int {
    storage.startIndex
  }

  var endIndex: Int {
    storage.endIndex
  }

  func index(after index: Int) -> Int {
    storage.index(after: index)
  }

  subscript(index: Int) -> ReadingSession {
    storage[index]
  }

  var totalMinutes: Int {
    reduce(0) { $0 + $1.minutes }
  }
}
```

`startIndex`, `endIndex`, `index(after:)`와 subscript라는 최소 요구사항을 backing array에 위임했어요. associated type인 `Element`와 `Index`는 method signature에서 `ReadingSession`, `Int`로 추론돼요.

```swift
let log = ReadingLog([
  ReadingSession(title: "Swift", minutes: 30),
  ReadingSession(title: "Testing", minutes: 20),
])

log.totalMinutes // 50
log.map(\.title) // ["Swift", "Testing"]
log.first?.minutes // 30
```

custom collection은 index 이동과 subscript의 의미·복잡도 계약을 정확히 지켜야 해요. 단순히 domain 이름을 붙이려는 목적이라면 array를 프로퍼티로 보관하고 필요한 method만 제공하는 것이 더 간단할 수도 있어요.

## 언제 Sequence와 Collection을 사용해야 하나요

- 한 번의 순차 처리만 필요하면 generic 입력을 `Sequence`로 받아요.
- 여러 번 순회, index, `first`·`last`와 slice가 필요하면 `Collection`을 요구해요.
- 뒤로 이동해야 하면 `BidirectionalCollection`, 임의 거리 이동 성능이 필요하면 `RandomAccessCollection`을 요구해요.
- custom storage가 표준 algorithm과 자연스럽게 결합해야 할 때 custom collection을 구현해요.
- 큰 pipeline에서 일부 결과만 필요하면 `lazy`를 검토해요.

입력이 이미 작은 array이고 domain API 몇 개만 필요하다면 custom collection과 복잡한 generic 제약을 만들지 않아도 돼요.

## 적용 순서를 정리해요

1. algorithm이 원소를 한 번만 순서대로 읽는지 확인해요.
2. 반복 순회나 index 접근이 필요할 때만 `Collection`으로 제약을 강화해요.
3. `Index == Int`와 `startIndex == 0`을 가정하지 않아요.
4. `endIndex`를 subscript하지 않고 slice의 원래 index를 존중해요.
5. mutation 뒤 저장 index가 유효한지 구체 collection 계약을 확인해요.
6. 연산 복잡도와 intermediate allocation을 측정해 lazy 또는 materialization을 선택해요.
7. custom collection은 최소 요구사항과 index·성능 법칙을 test해요.

## 면접에서 이어질 수 있는 질문

### `Sequence`와 `Collection`의 가장 중요한 차이는 무엇인가요?

`Sequence`는 순차 iteration만 보장하고 한 번 소비될 수도 있어요. `Collection`은 유한한 원소를 손상 없이 여러 번 순회하고 유효한 index로 subscript할 수 있어요.

### `endIndex`로 마지막 원소를 읽을 수 있나요?

안 돼요. `endIndex`는 마지막 원소 뒤의 sentinel 위치라 유효한 subscript가 아니에요. `last`나 bidirectional collection의 `index(before: endIndex)`를 사용해요.

### 모든 Collection의 index는 Int인가요?

아니요. `Collection.Index`는 associated type이고 문자열은 `String.Index`를 사용해요. generic code는 `startIndex`, `index(after:)`와 `indices`로 이동해야 해요.

### `lazy`를 사용하면 항상 성능이 좋아지나요?

아니요. intermediate allocation과 불필요한 계산을 줄일 수 있지만 반복 순회 때 계산을 다시 하고 wrapper 비용이 생길 수 있어요. 실제 소비 방식과 측정 결과로 선택해요.

### Collection의 `count`는 항상 O(1)인가요?

아니요. random-access collection은 빠르게 계산할 수 있지만 forward나 bidirectional collection은 index 사이를 순회해 `O(n)`일 수 있어요.

## 참고 자료

- [Apple Developer — Sequence](https://developer.apple.com/documentation/swift/sequence)
- [Apple Developer — IteratorProtocol](https://developer.apple.com/documentation/swift/iteratorprotocol)
- [Apple Developer — Collection](https://developer.apple.com/documentation/swift/collection)
- [Apple Developer — BidirectionalCollection](https://developer.apple.com/documentation/swift/bidirectionalcollection)
- [Apple Developer — RandomAccessCollection](https://developer.apple.com/documentation/swift/randomaccesscollection)
- [Apple Developer — LazySequenceProtocol](https://developer.apple.com/documentation/swift/lazysequenceprotocol)
- [The Swift Programming Language — For-In Statement](https://docs.swift.org/swift-book/documentation/the-swift-programming-language/statements/#For-In-Statement)
- [Swift-KR — Swift로 이해하는 제네릭](../generics)
- [Swift-KR — Swift로 이해하는 Comparable](./comparable)
