---
title: Swift로 이해하는 Hashable
description: Hashable과 Equatable의 계약, hash 충돌, 자동 합성, hash(into:) 구현과 Set·Dictionary key를 안전하게 설계하는 방법을 설명합니다.
pageType: doc-wide
outline: false
---

# Swift로 이해하는 Hashable

> **면접 답변 한 줄 요약:** `Hashable`은 값의 핵심 구성 요소를 `Hasher`에 제공해 `Set`과 `Dictionary`가 후보 위치를 빠르게 찾게 하는 `Equatable` 기반 프로토콜이며, 같은 값은 반드시 같은 hash 입력을 사용해야 해요.

독서한 책의 ID를 중복 없이 보관하거나 ID로 기록을 빠르게 찾으려면 `Set`과 `Dictionary`를 사용해요. 이 자료구조는 모든 원소를 처음부터 비교하지 않고 먼저 hash를 이용해 값이 있을 법한 위치를 좁혀요.

`Hashable`을 “고유한 정수를 만드는 기능”으로 이해하면 잘못된 key와 영속 저장 형식을 만들기 쉬워요. hash는 identity도 암호화도 아니며 서로 다른 값이 같은 hash를 가질 수 있어요.

이 문서에서는 다음 내용을 설명해요.

- hash와 hash collision의 의미
- `Hashable`이 `Equatable`을 상속하는 이유
- 구조체와 enum의 자동 합성
- `hash(into:)`와 `==`를 같은 기준으로 구현하는 방법
- `Set`과 `Dictionary` key를 변경할 때 생기는 문제
- `hashValue`, `Identifiable`, 암호학적 hash의 차이

## 먼저 알아둘 hash 용어

| 용어           | 쉬운 뜻                                                                                                          |
| -------------- | ---------------------------------------------------------------------------------------------------------------- |
| hash           | 값을 일정한 계산에 넣어 제한된 크기의 정수 표현으로 요약한 결과예요.                                             |
| hash function  | 입력 값을 hash로 바꾸는 계산이에요. Swift에서는 `Hasher`가 표준 컬렉션용 계산을 담당해요.                        |
| hash collision | 서로 다른 값이 같은 hash 결과를 가지는 상황이에요. 가능한 정상 상황이므로 최종적으로 `==` 비교가 필요해요.       |
| bucket         | hash table이 비슷한 hash 위치의 후보를 모아 두는 개념적인 칸이에요. 구현 세부 구조는 표준 라이브러리가 결정해요. |
| key            | `Dictionary`에서 값을 찾는 기준이 되는 값이에요. key 타입은 `Hashable`이어야 해요.                               |
| 핵심 구성 요소 | 타입의 값 동등성을 결정하는 프로퍼티예요. `==`에 참여한다면 같은 방식으로 `Hasher`에도 제공해야 해요.            |
| 암호학적 hash  | 위변조 검증과 보안 목적의 특성을 가진 별도 알고리즘이에요. `Hasher`는 이런 목적으로 설계되지 않았어요.           |

## 배열 검색은 원소를 차례로 비교해요

읽은 책 ID를 배열로 보관하면 중복 확인 때 앞에서부터 비교해요.

```swift
let completedBookIDs = ["swift", "ios", "testing"]

completedBookIDs.contains("testing")
```

배열의 `contains`는 최악의 경우 모든 원소를 살펴봐요. 원소가 많고 membership 확인을 자주 한다면 중복 없는 hash 기반 `Set`이 목적에 더 잘 맞아요.

```swift
let completedBookIDs: Set<String> = [
  "swift",
  "ios",
  "testing",
]

completedBookIDs.contains("testing")
```

`String`이 `Hashable`이므로 `Set<String>`을 만들 수 있어요. 평균적인 검색 비용은 상수 시간에 가까울 수 있지만, 구체 성능은 데이터와 구현 상태에 따라 달라져요.

## `Hashable`은 먼저 후보를 좁히고 `==`로 확정해요

hash 값의 가능한 개수는 제한되어 있지만 입력 값의 수는 훨씬 많아요. 따라서 서로 다른 값이 같은 hash를 가지는 collision을 완전히 피할 수 없어요.

```text
값 ── hash ──▶ 후보 bucket ── == ──▶ 실제 같은 값인지 확정
```

`Hashable`이 [`Equatable`](./equatable)을 상속하는 이유예요. hash가 다르면 두 값이 다르다고 빠르게 판단할 수 있지만, hash가 같다고 값까지 같다고 결론 내리면 안 돼요.

반드시 지켜야 할 한 방향 계약은 다음과 같아요.

```text
a == b  이면  a와 b는 같은 구성 요소를 같은 순서로 hash해야 해요.
```

반대는 성립하지 않아요. 같은 hash를 가진 두 값이 `==`에서는 다를 수 있어요.

## 저장 프로퍼티가 모두 Hashable이면 자동 합성해요

```swift
struct ReadingKey: Hashable {
  let userID: Int
  let bookID: String
}

var minutesByBook: [ReadingKey: Int] = [:]
let key = ReadingKey(userID: 42, bookID: "swift")

minutesByBook[key] = 30
print(minutesByBook[key] as Any) // Optional(30)
```

`Int`와 `String`이 `Hashable`이므로 컴파일러가 `==`와 `hash(into:)`를 함께 합성해요. 모든 저장 프로퍼티가 값 의미에 참여할 때 가장 안전하고 간결한 방법이에요.

연관 값이 모두 `Hashable`인 enum도 합성할 수 있어요.

```swift
enum LibraryRoute: Hashable {
  case home
  case bookDetail(id: String)
  case search(query: String)
}
```

navigation path나 상태 집합처럼 enum 값을 hash 기반 컬렉션에 저장할 때 유용해요.

## 직접 구현할 때 `==`와 같은 구성 요소를 사용해요

ISBN의 하이픈을 무시해 같은 판본인지 판단하는 타입을 만들게요.

```swift
struct ISBN: Hashable {
  let rawValue: String

  private var digits: String {
    rawValue.filter(\.isNumber)
  }

  static func == (lhs: ISBN, rhs: ISBN) -> Bool {
    lhs.digits == rhs.digits
  }

  func hash(into hasher: inout Hasher) {
    hasher.combine(digits)
  }
}

let formatted = ISBN(rawValue: "978-1-2345-6789-0")
let plain = ISBN(rawValue: "9781234567890")

formatted == plain // true
Set([formatted, plain]).count // 1
```

`==`와 `hash(into:)`가 모두 정규화된 `digits`를 사용해요. `==`는 `digits`를 쓰면서 `hash(into:)`는 `rawValue`를 사용하면 같은 값이 서로 다른 bucket으로 들어가 collection lookup이 실패할 수 있어요.

`Hasher.combine(_:)` 호출 순서도 값 의미의 일부로 일관되게 유지해요. 직접 정수 hash 공식을 만들거나 프로퍼티의 `hashValue`를 XOR하는 방식보다 `Hasher`에 핵심 값을 차례로 전달하세요.

## `hashValue`를 저장하거나 전송하지 마세요

다음 코드는 안정적인 식별자를 만드는 방법이 아니에요.

```swift
let cacheFileName = String(key.hashValue) // 사용하지 마세요.
```

Swift 표준 `Hasher`는 실행마다 무작위 seed를 사용하므로 같은 값의 `hashValue`가 다른 process 실행에서 달라질 수 있어요. 표준 라이브러리는 hash 계산 방식을 버전 사이에 바꿀 수도 있어요.

따라서 `hashValue`를 다음 목적으로 사용하지 않아요.

- database primary key
- 파일 이름이나 영속 cache key
- network payload
- 사용자 identity
- 암호화, 서명이나 무결성 검증

지속되는 ID에는 명시적인 문자열, UUID나 database key를 사용하고, 보안 hash에는 CryptoKit 같은 목적에 맞는 API를 사용해요.

## key가 컬렉션 안에 있는 동안 hash 기준을 바꾸지 마세요

참조 타입을 `Set` 원소나 `Dictionary` key로 사용하면서 hash에 참여하는 프로퍼티를 바꾸면 저장된 위치와 새 hash가 어긋날 수 있어요.

```swift
final class MutableBookKey: Hashable {
  var id: String

  init(id: String) {
    self.id = id
  }

  static func == (
    lhs: MutableBookKey,
    rhs: MutableBookKey
  ) -> Bool {
    lhs.id == rhs.id
  }

  func hash(into hasher: inout Hasher) {
    hasher.combine(id)
  }
}

let key = MutableBookKey(id: "old")
var keys: Set = [key]
key.id = "new" // Set 내부 위치와 현재 hash 기준이 달라질 수 있어요.
```

이후 `contains`와 `remove` 결과는 신뢰할 수 없어요. hash key에는 불변 값 타입을 우선 사용하세요. 꼭 바꿔야 한다면 컬렉션에서 기존 값을 제거한 뒤 변경하고 다시 삽입해야 하지만, 별도의 불변 key 타입이 더 안전해요.

구조체 key를 `Set` 안에서 직접 변경할 수 없는 이유도 같은 invariant를 보호하는 데 도움이 돼요.

## `Set`과 `Dictionary`는 서로 다른 문제를 해결해요

```swift
let favoriteBookIDs: Set<String> = ["swift", "testing"]

let minutesByBookID: [String: Int] = [
  "swift": 40,
  "testing": 25,
]
```

| 자료구조     | 저장하는 관계                  | 같은 key를 다시 넣으면                 |
| ------------ | ------------------------------ | -------------------------------------- |
| `Set`        | 중복 없는 값의 membership      | 기존 동등 값과 하나로 유지돼요.        |
| `Dictionary` | 고유 key와 value의 association | 해당 key의 value가 새 값으로 교체돼요. |

순서와 중복이 중요하면 `Array`, membership과 key lookup이 중요하면 hash 기반 collection을 검토해요. `Set`과 `Dictionary`의 iteration 순서에 비즈니스 의미를 기대하지 마세요.

## 제네릭 알고리즘은 필요한 곳에서 Hashable을 요구해요

```swift
func unique<Element: Hashable>(
  _ values: [Element]
) -> [Element] {
  var seen: Set<Element> = []

  return values.filter { value in
    seen.insert(value).inserted
  }
}
```

이 함수는 첫 등장 순서를 결과 배열에 유지하면서 중복 여부를 `Set`으로 확인해요. 단순히 두 값만 비교하는 함수에 `Hashable`까지 요구하면 불필요하게 강한 제약이에요. 그 경우에는 `Equatable`이면 충분해요.

## Hashable, Identifiable과 암호학적 hash를 구분해요

| 개념                                | 목적                                  | 실행 사이 안정성                              |
| ----------------------------------- | ------------------------------------- | --------------------------------------------- |
| `Hashable`                          | 표준 hash collection의 후보 위치 찾기 | 보장하지 않아요.                              |
| [`Identifiable.id`](./identifiable) | entity를 변화 전후에 추적             | 선택한 ID 계약에 따라 달라요.                 |
| UUID·database key                   | 영속 또는 지정 범위의 고유 identity   | 설계한 저장 범위에서 유지해요.                |
| 암호학적 digest                     | 무결성·서명 같은 보안 목적            | 같은 알고리즘과 입력이면 재현되도록 설계해요. |

`Hashable` 준수는 값이 전 세계에서 고유하다는 뜻이 아니고, hash 결과가 충돌하지 않는다는 뜻도 아니에요.

## 자주 하는 실수를 정리해요

### `hashValue`만 같으면 같은 값이라고 판단해요

collision이 가능하므로 틀린 판단이에요. 동등성은 `==`가 결정하고 hash는 후보 검색을 돕기만 해요.

### `==`에는 ID만, hash에는 모든 프로퍼티를 넣어요

같다고 판정되는 값이 다른 hash를 갖게 되어 계약을 깨요. 같은 정규화와 같은 핵심 구성 요소를 사용하세요.

### hash에 난수나 현재 시각을 넣어요

호출마다 hash가 달라져 collection 내부 위치를 찾을 수 없어요. 한 값이 컬렉션에 있는 동안 hash 기준은 안정적이어야 해요.

### 중복 제거만 하려고 결과를 무조건 Set으로 반환해요

호출자가 원래 순서나 중복 횟수를 필요로 할 수 있어요. API의 결과 의미를 먼저 정하고 필요하면 위의 `unique`처럼 순서 있는 배열을 반환하세요.

## 언제 `Hashable`을 사용해야 하나요

- 사용자 정의 타입을 `Set` 원소로 저장해야 해요.
- 사용자 정의 타입을 `Dictionary` key로 사용해야 해요.
- hash 기반 중복 제거와 membership lookup이 필요해요.
- `Equatable` 값에 안정적인 핵심 구성 요소가 이미 정의되어 있어요.

단순 비교만 필요하거나 값이 자주 바뀌는 참조 객체에는 먼저 `Equatable`이나 별도의 불변 key 타입을 검토하세요.

## 적용 순서를 정리해요

1. 타입의 값 동등성을 먼저 정의하고 `Equatable` 계약을 확인해요.
2. 모든 저장 값이 의미에 참여한다면 `Hashable` 자동 합성을 사용해요.
3. 직접 구현할 때 `==`와 `hash(into:)`에 정확히 같은 정규화 기준을 적용해요.
4. key가 collection 안에 있는 동안 핵심 구성 요소를 바꾸지 않아요.
5. `hashValue`를 process 밖에 저장하거나 전송하지 않아요.
6. 순서가 필요한지 확인해 `Array`, `Set`, `Dictionary` 중 목적에 맞게 선택해요.
7. 사용자 identity와 보안 digest가 필요하면 별도의 전용 타입과 API를 사용해요.

## 면접에서 이어질 수 있는 질문

### `Hashable`이 `Equatable`을 상속하는 이유는 무엇인가요?

hash collision이 가능해서 hash가 같은 후보를 최종적으로 `==`로 구분해야 하기 때문이에요. hash는 검색 범위를 좁히고 동등성은 실제 같은 값을 확정해요.

### 서로 다른 값의 hash는 반드시 달라야 하나요?

아니요. 서로 다른 값이 같은 hash를 갖는 collision은 허용돼요. 반드시 필요한 계약은 `a == b`라면 두 값이 같은 핵심 구성 요소를 같은 순서로 hash해야 한다는 것이에요.

### `hashValue`를 database key로 쓰면 안 되는 이유는 무엇인가요?

Swift의 hash는 실행마다 달라질 수 있고 구현도 영속 형식으로 보장되지 않기 때문이에요. database에는 UUID나 명시적인 primary key를 사용해야 해요.

### mutable class를 Dictionary key로 쓸 때 무엇을 조심해야 하나요?

key가 저장된 동안 equality와 hash에 참여하는 값을 변경하면 안 돼요. 조회에 사용할 새 hash와 저장 위치가 달라질 수 있으므로 불변 값 타입 key를 우선 사용해요.

## 참고 자료

- [Apple Developer — Hashable](https://developer.apple.com/documentation/swift/hashable)
- [Apple Developer — Hasher](https://developer.apple.com/documentation/swift/hasher)
- [The Swift Programming Language — Collection Types](https://docs.swift.org/swift-book/documentation/the-swift-programming-language/collectiontypes/)
- [Swift Evolution SE-0206 — Hashable Enhancements](https://github.com/swiftlang/swift-evolution/blob/main/proposals/0206-hashable-enhancements.md)
- [Swift-KR — Swift로 이해하는 Equatable](./equatable)
- [Swift-KR — Swift로 이해하는 Identifiable](./identifiable)
