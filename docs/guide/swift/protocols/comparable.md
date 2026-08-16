---
title: Swift로 이해하는 Comparable
description: Comparable의 strict total order, Equatable과의 일관성, < 구현, tuple 비교와 sorted·range에 적합한 자연스러운 순서 설계를 설명합니다.
pageType: doc-wide
outline: false
---

# Swift로 이해하는 Comparable

> **면접 답변 한 줄 요약:** `Comparable`은 `Equatable`을 바탕으로 같은 타입의 모든 정상 값을 하나의 일관된 전체 순서에 놓는 프로토콜이며, `==`와 `<`만 올바르게 구현하면 나머지 관계 연산과 정렬 API를 사용할 수 있어요.

독서 기록을 날짜순, 제목순, 시간순으로 정렬할 수 있어요. 하지만 이 세 기준이 모두 타입의 `Comparable`이 되어야 하는 것은 아니에요. `Comparable`은 “호출마다 고르는 정렬 옵션”보다 타입 자체에 누구나 동의할 자연스러운 기본 순서가 있을 때 적합해요.

잘못된 `<`는 `sorted()`, 범위와 이진 검색 같은 알고리즘의 전제를 깨요. 단순히 예제 몇 개에서 정렬되는지보다 equality와 order가 함께 지켜야 할 법칙을 이해해야 해요.

이 문서에서는 다음 내용을 설명해요.

- `Comparable`과 `Equatable`의 관계
- strict total order와 비교 법칙
- `<` 하나로 `>`, `<=`, `>=`를 얻는 방법
- tuple을 이용한 다중 field 순서
- 자연스러운 순서와 화면별 sort closure의 선택 기준
- 문자열 locale, optional과 부동소수점 예외 값의 주의점

## 먼저 알아둘 순서 용어

| 용어                | 쉬운 뜻                                                                                             |
| ------------------- | --------------------------------------------------------------------------------------------------- |
| 관계 연산자         | 두 값의 순서를 비교하는 `<`, `<=`, `>`, `>=` 연산자예요.                                            |
| strict order        | `<`처럼 같은 값은 자기보다 앞서지 않는 엄격한 순서 관계예요.                                        |
| total order         | 임의의 두 정상 값이 같거나 어느 한쪽이 앞선다고 반드시 결정되는 전체 순서예요.                      |
| irreflexivity       | 어떤 값도 자기 자신보다 작지 않다는 성질로 `a < a`는 항상 `false`예요.                              |
| asymmetry           | `a < b`이면 동시에 `b < a`일 수 없다는 성질이에요.                                                  |
| transitivity        | `a < b`, `b < c`이면 `a < c`여야 한다는 성질이에요.                                                 |
| lexicographic order | 첫 요소를 비교하고 같으면 다음 요소를 비교하는 사전식 순서예요. tuple과 문자열 비교가 대표적이에요. |
| sort descriptor     | 화면이나 기능마다 선택한 정렬 기준과 방향을 표현하는 값 또는 closure예요.                           |

## 호출부마다 비교 closure를 반복하면 기본 순서가 흩어져요

version을 major, minor, patch 순으로 비교한다고 해 볼게요.

```swift
struct AppVersion: Equatable {
  let major: Int
  let minor: Int
  let patch: Int
}

let versions = [
  AppVersion(major: 2, minor: 0, patch: 0),
  AppVersion(major: 1, minor: 9, patch: 1),
]

let sorted = versions.sorted { lhs, rhs in
  if lhs.major != rhs.major {
    return lhs.major < rhs.major
  }
  if lhs.minor != rhs.minor {
    return lhs.minor < rhs.minor
  }
  return lhs.patch < rhs.patch
}
```

version의 순서는 domain 자체에 하나로 정해져 있는데 호출할 때마다 closure를 반복해요. 어떤 곳이 patch 비교를 빼먹으면 서로 다른 순서를 사용하게 돼요.

## `Comparable`은 타입의 자연스러운 순서를 선언해요

```swift
struct AppVersion: Comparable {
  let major: Int
  let minor: Int
  let patch: Int

  static func < (
    lhs: AppVersion,
    rhs: AppVersion
  ) -> Bool {
    (lhs.major, lhs.minor, lhs.patch) <
      (rhs.major, rhs.minor, rhs.patch)
  }
}
```

저장 프로퍼티가 모두 `Equatable`이므로 `==`는 자동 합성돼요. `<`는 comparable tuple의 사전식 비교를 사용해 major가 같을 때 minor, 둘 다 같을 때 patch를 비교해요.

이제 표준 라이브러리 API를 사용할 수 있어요.

```swift
let current = AppVersion(major: 1, minor: 9, patch: 1)
let required = AppVersion(major: 2, minor: 0, patch: 0)

current < required
required > current
current <= current
versions.sorted()
versions.min()
versions.max()
```

`Comparable`이 요구하는 핵심은 `<`와 상속한 `Equatable`의 `==`예요. 표준 라이브러리가 `>`, `<=`, `>=`의 기본 구현을 제공해요.

## equality와 order는 같은 구성 요소를 사용해야 해요

임의의 정상 값 `a`, `b`에 대해 정확히 하나가 참이어야 해요.

```text
a == b
a < b
b < a
```

`==`는 `id`만 비교하면서 `<`는 날짜와 제목을 비교하면 같은 두 값 사이에도 순서가 생길 수 있어요. 반대로 `<`가 일부 field를 무시하면 `a != b`인데 어느 쪽도 작지 않은 incomparability가 생겨요.

```swift
struct Edition: Comparable {
  let volume: Int
  let revision: Int

  static func < (lhs: Edition, rhs: Edition) -> Bool {
    (lhs.volume, lhs.revision) <
      (rhs.volume, rhs.revision)
  }
}
```

자동 합성된 `==`와 `<`가 모두 `volume`, `revision`을 사용해 일관돼요.

## `<`는 세 가지 순서 법칙을 지켜요

| 법칙                    | 조건                               | 깨졌을 때 문제                                    |
| ----------------------- | ---------------------------------- | ------------------------------------------------- |
| 비반사성(irreflexivity) | `a < a`는 항상 `false`예요.        | 자기 자신이 앞선다고 판단해 algorithm이 흔들려요. |
| 비대칭성(asymmetry)     | `a < b`이면 `b < a`는 `false`예요. | 두 값이 동시에 서로 앞선다고 나와요.              |
| 추이성(transitivity)    | `a < b`, `b < c`이면 `a < c`예요.  | 정렬 결과가 비교 순서에 따라 달라져요.            |

`Equatable`의 반사성·대칭성·추이성과 함께 strict total order를 만들어요. 직접 구현한 비교는 작은 예제뿐 아니라 임의 입력을 생성하는 property-based test로 법칙을 확인할 수도 있어요.

## 여러 정렬 기준이 있다면 Comparable 하나에 숨기지 않아요

독서 session은 날짜순, 시간 많은 순, 제목순 모두 자연스러울 수 있어요. 타입 전체의 유일한 기본 순서가 아니라 화면 목적에 따른 선택이에요.

```swift
import Foundation

struct ReadingSession: Equatable {
  let title: String
  let minutes: Int
  let startedAt: Date
}

let newestFirst = sessions.sorted {
  $0.startedAt > $1.startedAt
}

let longestFirst = sessions.sorted {
  if $0.minutes != $1.minutes {
    return $0.minutes > $1.minutes
  }
  return $0.title < $1.title
}
```

이 경우 `ReadingSession: Comparable`에 임의의 기준 하나를 넣으면 `sorted()`만 보고 어떤 순서인지 알기 어려워요. 이름 있는 comparator를 만들면 의도를 재사용할 수 있어요.

```swift
extension ReadingSession {
  static func byLongestReading(
    _ lhs: Self,
    _ rhs: Self
  ) -> Bool {
    if lhs.minutes != rhs.minutes {
      return lhs.minutes > rhs.minutes
    }
    return lhs.title < rhs.title
  }
}

let sorted = sessions.sorted(
  by: ReadingSession.byLongestReading
)
```

`Comparable`은 타입의 본질적인 순서, `sorted(by:)`는 use case별 순서라고 생각하면 선택이 쉬워요.

## tie-breaker를 넣어 전체 순서를 완성해요

날짜만 비교하면 같은 날짜의 서로 다른 값은 어느 쪽도 앞서지 않을 수 있어요. equality가 날짜와 ID를 모두 사용한다면 `<`에도 ID tie-breaker가 필요해요.

```swift
import Foundation

struct DailyRecord: Comparable {
  let day: Date
  let id: UUID

  static func < (
    lhs: DailyRecord,
    rhs: DailyRecord
  ) -> Bool {
    if lhs.day != rhs.day {
      return lhs.day < rhs.day
    }
    return lhs.id.uuidString < rhs.id.uuidString
  }
}
```

UUID 문자열 순서는 사용자 의미가 있는 순서라기보다 deterministic tie-breaker예요. API 문서에서 이런 선택을 설명하고, UI에는 사용자가 이해할 기준을 별도로 제공하세요.

## `Comparable`로 범위와 clamp를 표현해요

```swift
let allowedMinutes = 1...1_440

allowedMinutes.contains(30) // true
```

range bound는 `Comparable`을 이용해 값이 구간 안에 있는지 판단해요. 제네릭 clamp도 같은 제약으로 작성할 수 있어요.

```swift
func clamped<Value: Comparable>(
  _ value: Value,
  to range: ClosedRange<Value>
) -> Value {
  min(max(value, range.lowerBound), range.upperBound)
}

clamped(1_500, to: 1...1_440) // 1440
```

함수는 `Int`를 몰라도 `Comparable`의 순서만으로 lower와 upper bound 사이 값을 만들어요.

## 문자열의 `<`가 사용자 언어 정렬과 같지는 않아요

`String`은 `Comparable`이지만 기본 순서가 모든 locale의 사전 정렬 요구를 충족한다는 뜻은 아니에요. 사용자가 보는 이름과 제목은 locale, 숫자 포함 문자열과 대소문자 규칙에 따라 원하는 순서가 달라져요.

```swift
let titles = ["Book 10", "Book 2"]
let localized = titles.sorted {
  $0.localizedStandardCompare($1) == .orderedAscending
}
```

UI의 자연어 정렬에는 Foundation의 localized comparison이나 `SortDescriptor`처럼 요구에 맞는 API를 검토해요. domain identifier와 version처럼 locale 독립 순서는 타입의 `Comparable`로 정의할 수 있어요.

## Optional에는 일반적인 전체 순서를 임의로 만들지 않아요

`nil`을 모든 값보다 앞이나 뒤에 둘지는 use case 선택이에요.

```swift
let records: [ReadingSession?] = [session, nil]

let nilLast = records.sorted { lhs, rhs in
  switch (lhs, rhs) {
  case (nil, nil): return false
  case (nil, _): return false
  case (_, nil): return true
  case let (lhs?, rhs?):
    return lhs.startedAt < rhs.startedAt
  }
}
```

optional 전체에 하나의 보편적 순서를 가정하지 않고 해당 화면의 `nil` 위치 정책을 명시해요.

## 부동소수점 NaN은 일반적인 전체 순서의 예외예요

`Double.nan`은 자신과도 같지 않고 정상 숫자보다 작거나 크지도 않아요.

```swift
let value = Double.nan

value == value // false
value < 10     // false
value > 10     // false
```

Apple의 `Comparable` 문서도 NaN 같은 exceptional value는 strict total order 밖에 있을 수 있다고 설명해요. 측정값을 정렬한다면 NaN을 사전에 거르거나 처음·마지막에 둘 명시적인 정책을 사용하세요.

## Comparable과 관련 선택지를 비교해요

| 선택                       | 적합한 질문                                  | 예시                                    |
| -------------------------- | -------------------------------------------- | --------------------------------------- |
| [`Equatable`](./equatable) | 같은 값인가요?                               | 상태 비교, `contains`                   |
| `Comparable`               | 타입에 하나의 자연스러운 전체 순서가 있나요? | version, 날짜, 순서가 있는 domain value |
| `sorted(by:)`              | 이 화면에서 어떤 기준으로 정렬할까요?        | 최신순, 긴 독서 시간순                  |
| localized comparison       | 사용자 언어 규칙에 맞는 문자열 순서인가요?   | 사람 이름, 제목                         |

`Comparable`을 채택했다고 모든 정렬에서 `sorted()`만 사용해야 하는 것은 아니에요. 기본 순서가 있어도 UI는 다른 명시적 기준을 선택할 수 있어요.

## 언제 `Comparable`을 사용해야 하나요

- version, 날짜 구성 값처럼 타입 자체에 명확한 기본 순서가 있어요.
- `<`, `>`, range, `min`, `max`, `sorted()`를 일관된 기준으로 제공해야 해요.
- 임의의 두 정상 값을 같음 또는 앞뒤 중 하나로 결정할 수 있어요.
- equality와 order가 같은 구성 요소를 사용하도록 설계할 수 있어요.

정렬 기준이 여러 개이고 어느 하나도 본질적이지 않다면 `Equatable`과 이름 있는 comparator를 사용하세요. 순서를 정할 수 없는 graph node나 service 객체에 억지로 채택하지 않아요.

## 적용 순서를 정리해요

1. 타입에 호출 맥락과 무관한 자연스러운 기본 순서가 있는지 확인해요.
2. equality에 참여하는 모든 구성 요소를 순서에도 반영해요.
3. `<`를 구현하고 나머지 관계 연산자는 표준 기본 구현을 사용해요.
4. 다중 field는 lexicographic 순서와 tie-breaker를 명시해요.
5. 비반사성·비대칭성·추이성과 equality 일관성을 test해요.
6. locale 문자열, optional과 NaN에는 use case별 예외 정책을 제공해요.
7. 화면별 정렬은 `sorted(by:)`나 sort descriptor로 의도를 드러내요.

## 면접에서 이어질 수 있는 질문

### `Comparable`을 준수하려면 어떤 연산자를 구현해야 하나요?

상속한 `Equatable`의 `==`와 `Comparable`의 `<`를 구현해요. `>`, `<=`, `>=`와 `!=`는 표준 라이브러리의 기본 구현을 사용할 수 있어요.

### `==`와 `<`는 어떤 관계여야 하나요?

정상적인 임의의 두 값에서 `a == b`, `a < b`, `b < a` 중 정확히 하나만 참이어야 해요. 두 구현이 다른 구성 요소를 사용하면 이 전체 순서가 깨질 수 있어요.

### 정렬할 수 있는 타입은 모두 Comparable이어야 하나요?

아니요. 맥락마다 기준이 달라지는 타입은 `sorted(by:)`가 더 명확해요. `Comparable`은 타입 자체에 하나의 자연스러운 기본 순서가 있을 때 채택해요.

### 문자열 title 정렬에 기본 `<`만 사용하면 안 되나요?

기계적인 순서가 목적이면 사용할 수 있지만 사용자 언어의 사전식 순서와는 다를 수 있어요. UI title과 이름에는 locale과 숫자 규칙을 고려한 localized comparison을 검토해요.

## 참고 자료

- [Apple Developer — Comparable](https://developer.apple.com/documentation/swift/comparable)
- [Apple Developer — sorted()](<https://developer.apple.com/documentation/swift/sequence/sorted()>)
- [Apple Developer — ClosedRange](https://developer.apple.com/documentation/swift/closedrange)
- [The Swift Programming Language — Basic Operators](https://docs.swift.org/swift-book/documentation/the-swift-programming-language/basicoperators/)
- [Swift-KR — Swift로 이해하는 Equatable](./equatable)
- [Swift-KR — Swift로 이해하는 Sequence와 Collection](./sequence-and-collection)
