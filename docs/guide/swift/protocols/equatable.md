---
title: Swift로 이해하는 Equatable
description: Equatable의 값 동등성, 자동 합성, == 구현 규칙과 클래스 identity 차이를 이해하고 안전한 비교 기준을 설계하는 방법을 설명합니다.
pageType: doc-wide
outline: false
---

# Swift로 이해하는 Equatable

> **면접 답변 한 줄 요약:** `Equatable`은 같은 타입의 두 값이 의미상 서로 바꿔 써도 되는지를 `==`로 정의하는 프로토콜이며, 일관된 동등성 규칙을 통해 비교·검색·테스트와 상위 프로토콜의 기반을 제공해요.

앱은 같은 책인지, 검색 결과에 특정 항목이 있는지, 변경 전후 상태가 같은지를 계속 판단해요. 프로퍼티를 호출할 때마다 직접 비교하면 기준이 흩어지고 새 프로퍼티가 생겼을 때 빠뜨리기 쉬워요.

`Equatable`을 채택하면 타입 자체가 “어떤 두 값이 같은가”를 정의해요. `==`, `!=`뿐 아니라 `contains`, `firstIndex(of:)`와 테스트 assertion도 그 규칙을 재사용할 수 있어요.

이 문서에서는 다음 내용을 설명해요.

- 값 동등성과 클래스 인스턴스 identity의 차이
- 구조체와 enum의 `Equatable` 자동 합성
- 직접 `==`를 구현할 때 지켜야 할 동등성 법칙
- 컬렉션과 제네릭에서 `Equatable`을 사용하는 방법
- `Hashable`, `Comparable`, `Identifiable`과의 경계

## 먼저 알아둘 비교 용어

| 용어             | 쉬운 뜻                                                                                                             |
| ---------------- | ------------------------------------------------------------------------------------------------------------------- |
| 동등성(equality) | 두 값이 프로그램의 의미상 같아서 서로 바꿔 써도 되는지를 판단하는 규칙이에요.                                       |
| identity         | 두 참조가 메모리의 같은 클래스 인스턴스를 가리키는지를 뜻해요. Swift에서는 `===`로 확인해요.                        |
| 값 의미론        | 값의 내용으로 의미가 결정되고 복사한 뒤 각각 변경할 수 있는 성질이에요. 구조체와 enum이 주로 사용해요.              |
| 자동 합성        | 저장 프로퍼티나 연관 값이 조건을 만족하면 컴파일러가 프로토콜 구현을 만들어 주는 기능이에요.                        |
| 치환 가능성      | 같다고 판정한 두 값을 공개된 동작에서 서로 바꿔도 관찰 결과가 달라지지 않아야 한다는 원칙이에요.                    |
| 동등 관계        | 반사성·대칭성·추이성을 모두 만족하는 비교 관계예요. `Equatable`의 사용자 정의 `==`가 지켜야 하는 수학적 성질이에요. |
| `Self`           | 프로토콜을 실제로 따르는 구체 타입이에요. `==`는 왼쪽과 오른쪽에 같은 `Self` 타입을 요구해요.                       |

## 프로퍼티를 매번 비교하면 동등성 기준이 흩어져요

독서 기록 두 개가 같은 값인지 확인한다고 해 볼게요.

```swift
struct ReadingRecord {
  let bookID: String
  var minutes: Int
  var note: String
}

let before = ReadingRecord(
  bookID: "swift-guide",
  minutes: 20,
  note: "프로토콜"
)
let after = ReadingRecord(
  bookID: "swift-guide",
  minutes: 20,
  note: "프로토콜"
)

let isSame =
  before.bookID == after.bookID &&
  before.minutes == after.minutes &&
  before.note == after.note
```

호출하는 곳마다 이 코드를 반복하면 어떤 곳은 `note`를 비교하고 어떤 곳은 빼먹을 수 있어요. “같은 독서 기록”의 의미가 타입이 아니라 각 호출부에 흩어져요.

## `Equatable`은 타입의 값 동등성을 선언해요

저장 프로퍼티가 모두 `Equatable`이면 구조체는 `==`를 자동으로 합성할 수 있어요.

```swift
struct ReadingRecord: Equatable {
  let bookID: String
  var minutes: Int
  var note: String
}

let isSame = before == after
let hasChanged = before != after
```

합성된 구현은 모든 저장 프로퍼티를 비교해요. `String`과 `Int`가 이미 `Equatable`이므로 추가 구현이 필요하지 않아요. `!=`는 `==`의 결과를 반대로 만드는 기본 구현을 사용해요.

이제 같은 규칙이 여러 API에 전달돼요.

```swift
let records = [before]

records.contains(after)       // true
records.firstIndex(of: after) // 0
```

`contains(_:)`가 특정 값을 직접 받을 수 있는 이유도 배열의 원소가 `Equatable`이기 때문이에요.

## enum도 연관 값까지 비교하도록 합성해요

연관 값이 모두 `Equatable`이면 enum도 자동 합성할 수 있어요.

```swift
enum SyncState: Equatable {
  case idle
  case syncing(progress: Double)
  case failed(message: String)
}

SyncState.idle == .idle
SyncState.syncing(progress: 0.5) ==
  .syncing(progress: 0.5)
```

case가 다르면 같지 않고, 같은 case라면 연관 값을 함께 비교해요. 연관 값이 없는 enum은 명시적으로 `Equatable`을 쓰지 않아도 동등 비교가 가능한 경우가 있지만, 제네릭 제약이나 공개 API에서 준수 사실을 드러내려면 명시할 수 있어요.

## 직접 구현할 때는 공개된 값 의미를 반영해요

모든 저장 값이 아닌 정규화된 의미로 비교해야 할 때 직접 `==`를 구현해요. 이메일 주소를 대소문자와 양끝 공백을 무시하고 비교하는 도메인 규칙을 예로 들어요.

```swift
import Foundation

struct EmailAddress: Equatable {
  let rawValue: String

  private var normalized: String {
    rawValue
      .trimmingCharacters(in: .whitespacesAndNewlines)
      .lowercased()
  }

  static func == (
    lhs: EmailAddress,
    rhs: EmailAddress
  ) -> Bool {
    lhs.normalized == rhs.normalized
  }
}

EmailAddress(rawValue: " reader@example.com ") ==
  EmailAddress(rawValue: "READER@example.com") // true
```

이 비교가 올바르려면 타입의 나머지 공개 동작도 정규화된 주소를 같은 값으로 취급해야 해요. `rawValue` 철자 차이가 프로그램에서 중요한 관찰 결과라면 두 값을 같다고 정의하면 치환 가능성이 깨질 수 있어요.

단순히 성능을 줄이려고 큰 프로퍼티를 `==`에서 제외하지 마세요. 제외한 프로퍼티가 동작을 바꾼다면 동등성의 의미가 잘못된 거예요.

## 동등성은 세 가지 법칙을 지켜야 해요

임의의 같은 타입 값 `a`, `b`, `c`에 대해 사용자 정의 `==`는 다음 조건을 만족해야 해요.

| 법칙                 | 조건                                 | 깨졌을 때 생기는 문제                                        |
| -------------------- | ------------------------------------ | ------------------------------------------------------------ |
| 반사성(reflexivity)  | `a == a`는 항상 `true`예요.          | 값이 자기 자신과도 다르다고 나와 검색과 캐시가 불안정해져요. |
| 대칭성(symmetry)     | `a == b`이면 `b == a`예요.           | 피연산자 순서에 따라 결과가 달라져요.                        |
| 추이성(transitivity) | `a == b`, `b == c`이면 `a == c`예요. | 그룹화와 중복 제거 결과를 신뢰할 수 없어요.                  |

허용 오차를 단순히 `==`에 넣은 부동소수점 비교는 추이성을 깨기 쉬워요.

```swift
func isApproximatelyEqual(
  _ lhs: Double,
  _ rhs: Double,
  tolerance: Double
) -> Bool {
  abs(lhs - rhs) <= tolerance
}
```

근삿값 비교는 타입 전체의 동등성으로 숨기기보다 목적이 드러나는 별도 메서드로 제공하는 편이 안전해요.

## 클래스의 `==`와 `===`는 다른 질문에 답해요

클래스는 참조 타입이므로 값 동등성과 인스턴스 identity를 구분해야 해요.

```swift
final class BookCopy: Equatable {
  let barcode: String

  init(barcode: String) {
    self.barcode = barcode
  }

  static func == (lhs: BookCopy, rhs: BookCopy) -> Bool {
    lhs.barcode == rhs.barcode
  }
}

let first = BookCopy(barcode: "A-001")
let sameValue = BookCopy(barcode: "A-001")
let sameReference = first

first == sameValue      // true: 정의한 값이 같아요.
first === sameValue     // false: 서로 다른 인스턴스예요.
first === sameReference // true: 같은 인스턴스예요.
```

`Equatable`은 클래스를 자동 합성하지 않으므로 `==`를 직접 구현해요. 객체가 정말 같은 메모리 인스턴스인지 확인하려는 경우에만 `===`를 사용하세요.

## 제네릭 제약은 필요한 비교 능력만 요구해요

어떤 타입이든 받되 동등 비교가 필요한 함수는 `Equatable` 제약을 사용해요.

```swift
func hasDuplicate<Element: Equatable>(
  _ values: [Element]
) -> Bool {
  for index in values.indices {
    let remaining = values.index(after: index)..<values.endIndex
    if values[remaining].contains(values[index]) {
      return true
    }
  }
  return false
}
```

함수는 `Element`의 구체 타입을 몰라도 `==`가 있다는 사실을 알아요. 중복 검색을 더 빠르게 하려고 `Set`을 사용한다면 더 강한 [`Hashable`](./hashable) 제약이 필요해요. 필요한 능력보다 강한 제약을 먼저 요구하지 마세요.

## `Equatable`, `Hashable`, `Identifiable`은 같은 의미가 아니에요

| 프로토콜                         | 답하는 질문                                     | 대표 사용처                          |
| -------------------------------- | ----------------------------------------------- | ------------------------------------ |
| `Equatable`                      | 두 값이 의미상 같은가요?                        | `==`, `contains`, 테스트 기대값      |
| [`Hashable`](./hashable)         | 값을 hash 기반 저장소의 key로 쓸 수 있나요?     | `Set`, `Dictionary` key              |
| [`Identifiable`](./identifiable) | 변화 전후에도 같은 entity임을 나타내는 ID는?    | SwiftUI `List`, diffing, entity 추적 |
| [`Comparable`](./comparable)     | 이 타입에 하나의 자연스러운 전체 순서가 있나요? | `<`, 범위, `sorted()`                |

이름이 바뀐 같은 사용자는 `Identifiable.id`는 같지만 전체 값은 달라 `Equatable` 비교가 `false`일 수 있어요. 반대로 내용이 같은 임시 입력 두 개가 같은 값이어도 서로 다른 entity일 수 있어요.

## 자주 하는 실수를 피해요

### ID만 비교하고 모든 값을 같다고 가정해요

entity ID만 같은 두 값을 `==`로 처리할 수는 있지만, 이름이나 상태처럼 공개된 값 차이가 중요한 타입에서는 치환 가능성을 깨요. ID 비교가 목적이면 `lhs.id == rhs.id`라고 호출부에 명시하거나 identity 전용 타입을 사용하세요.

### 현재 시각이나 난수를 비교에 넣어요

계산할 때마다 달라지는 값으로 `==`를 구현하면 같은 값의 비교 결과가 시점마다 바뀌어요. 동등성에 참여하는 요소는 비교하는 동안 안정적이어야 해요.

### 상속 계층에서 값 동등성을 억지로 만들어요

서브클래스가 새 값을 추가하면 대칭성과 치환 가능성을 유지하기 어려워요. 값 동등성이 핵심이라면 `final` 클래스나 구조체를 우선 검토하세요.

### `==`를 구현하고 `Hashable`은 다른 필드를 사용해요

같은 값은 반드시 같은 hash 입력을 사용해야 해요. 이 계약은 [Hashable 문서](./hashable)에서 자세히 설명해요.

## 언제 `Equatable`을 사용해야 하나요

- 두 값의 의미상 동등 여부가 도메인에 명확히 존재해요.
- 컬렉션에서 값 검색, 중복 확인이나 테스트 비교가 필요해요.
- `Hashable` 또는 `Comparable`을 채택하려고 해요.
- 상태 변경 전후를 한 규칙으로 비교하고 싶어요.

모든 타입에 습관적으로 붙이지는 마세요. 서비스 객체, 네트워크 세션처럼 값 동등성보다 수명과 행위가 중요한 객체는 자연스러운 `==`가 없을 수 있어요.

## 적용 순서를 정리해요

1. “두 값을 같다고 했을 때 서로 바꿔도 되는가?”를 먼저 정의해요.
2. 구조체와 enum의 모든 저장 값이 의미에 참여한다면 자동 합성을 사용해요.
3. 정규화 같은 도메인 규칙이 있을 때만 `==`를 직접 구현해요.
4. 반사성·대칭성·추이성과 치환 가능성을 예제로 검사해요.
5. 클래스라면 값 비교 `==`와 참조 identity `===` 중 질문을 구분해요.
6. `Hashable`도 채택한다면 같은 필드와 정규화 규칙을 사용해요.
7. 여러 정렬 기준 중 하나를 선택하는 문제라면 `Equatable`과 별도의 sort closure를 사용해요.

## 면접에서 이어질 수 있는 질문

### 구조체의 `Equatable`은 언제 자동 합성되나요?

원래 타입 선언에서 준수를 선언하고 모든 저장 프로퍼티가 `Equatable`이면 합성돼요. enum은 모든 연관 값이 `Equatable`이면 case와 연관 값을 기준으로 합성할 수 있어요.

### `==`와 `===`는 어떻게 다른가요?

`==`는 타입이 정의한 값 동등성을 비교하고 `===`는 두 참조가 같은 클래스 인스턴스를 가리키는지 확인해요. 구조체에는 클래스 identity가 없으므로 `===`를 사용하지 않아요.

### `Equatable`의 법칙이 중요한 이유는 무엇인가요?

컬렉션 검색과 상위 프로토콜이 `==`의 일관성을 전제로 동작하기 때문이에요. 반사성·대칭성·추이성이 깨지면 같은 입력에서도 검색과 그룹화 결과를 신뢰할 수 없어요.

### 모든 프로퍼티를 `==`에 포함해야 하나요?

공개적으로 관찰되는 값 의미를 바꾸는 프로퍼티는 포함해야 해요. 캐시처럼 결과 의미에 참여하지 않는 내부 구현 세부 정보는 제외할 수 있지만 그 선택을 타입의 계약으로 명확히 해야 해요.

## 참고 자료

- [Apple Developer — Equatable](https://developer.apple.com/documentation/swift/equatable)
- [The Swift Programming Language — Protocols](https://docs.swift.org/swift-book/documentation/the-swift-programming-language/protocols/)
- [The Swift Programming Language — Structures and Classes](https://docs.swift.org/swift-book/documentation/the-swift-programming-language/classesandstructures/)
- [Swift-KR — Swift로 이해하는 제네릭](../generics)
- [Swift-KR — Swift로 이해하는 Hashable](./hashable)
- [Swift-KR — Swift로 이해하는 Identifiable](./identifiable)
