---
title: Swift로 이해하는 Sendable
description: Swift 6의 Sendable과 @Sendable이 concurrency domain 사이 data race를 막는 방식, actor·class 준수와 @unchecked 사용 기준을 설명합니다.
pageType: doc-wide
outline: false
---

# Swift로 이해하는 Sendable

> **면접 답변 한 줄 요약:** `Sendable`은 값이 task와 actor 같은 concurrency domain 사이에서 공유되어도 data race를 만들지 않는다는 의미 계약을 compiler가 검사하는 marker protocol이고, closure에는 `@Sendable`로 같은 안전 조건을 표현해요.

비동기 함수가 많다고 data race가 생기는 것은 아니에요. 서로 다른 task가 같은 mutable memory에 동시에 접근하고 그중 하나 이상이 값을 쓸 수 있을 때 문제가 생겨요. 결과는 실행 순서에 따라 달라지고 재현하기 어려워요.

Swift Concurrency는 actor isolation과 `Sendable` 검사를 함께 사용해 unsafe한 공유를 compile time에 막아요. `Sendable`에는 호출할 method가 없지만 준수를 잘못 선언하면 안전성 보장이 깨질 수 있으므로 단순히 warning을 없애는 annotation으로 사용하면 안 돼요.

이 문서에서는 다음 내용을 설명해요.

- concurrency domain과 data race의 의미
- marker protocol인 `Sendable`의 semantic requirement
- 구조체·enum, final class, actor와 global actor의 준수 규칙
- generic collection의 conditional sendability
- `@Sendable` closure와 capture 검사
- `@unchecked Sendable`, `@preconcurrency`와 `sending`의 경계

## 먼저 알아둘 동시성 용어

| 용어                  | 쉬운 뜻                                                                                                                               |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| concurrency domain    | mutable state에 순차적으로 접근하는 하나의 격리 영역이에요. task와 actor instance가 경계를 만들 수 있어요.                            |
| data race             | 여러 실행 흐름이 같은 memory에 동시에 접근하고 하나 이상이 쓰면서 synchronization되지 않은 상황이에요.                                |
| actor isolation       | actor가 자신의 mutable state 접근을 한 번에 하나씩 실행하도록 보호하는 규칙이에요.                                                    |
| marker protocol       | method나 property 요구사항 없이 타입이 특정 의미 조건을 만족한다는 사실을 표시하는 protocol이에요.                                    |
| sendable type         | 여러 concurrency domain에서 동시에 공유해도 data race 위험이 없도록 설계된 타입이에요.                                                |
| `@Sendable` closure   | concurrency domain을 넘어 실행될 수 있어 capture한 값도 sendable이어야 하는 closure예요.                                              |
| `@unchecked Sendable` | compiler 검사를 끄고 작성자가 locking 등으로 안전을 직접 보증하는 준수예요.                                                           |
| global actor          | 여러 declaration을 하나의 전역 actor에 격리하는 기능이에요. `@MainActor`가 UI state를 보호하는 대표적인 global actor예요.             |
| region transfer       | non-sendable 값의 소유 영역을 다른 격리 경계로 완전히 넘겨 원래 쪽에서 더 사용하지 못하게 하는 방식이에요. `sending`이 이를 표현해요. |

## mutable class를 task 사이에 공유하면 race가 생길 수 있어요

```swift
final class ReadingCounter {
  var minutes = 0

  func addTenMinutes() {
    minutes += 10
  }
}
```

`minutes += 10`은 값을 읽고 10을 더해 다시 쓰는 여러 단계예요. 두 task가 같은 instance에서 동시에 실행하면 둘 다 이전 값 0을 읽고 각각 10을 써서 최종 결과가 20이 아닌 10이 될 수 있어요.

```swift
let counter = ReadingCounter()

// strict concurrency에서는 mutable reference를
// task 경계로 보내는 code를 compiler가 진단할 수 있어요.
```

단순히 class에 `Sendable`을 붙이는 것으로 mutation이 직렬화되지는 않아요. type의 실제 구현이 sharing에 안전해야 해요.

## `Sendable`은 실행 method가 없는 의미 계약이에요

현재 Swift 표준 라이브러리에서 `Sendable`은 required method나 property가 없는 marker protocol이에요. compiler는 stored property, associated value, class finality와 isolation을 검사해 준수가 안전한지 판단해요.

```swift
import Foundation

struct ReadingSnapshot: Sendable {
  let id: UUID
  let minutes: Int
  let note: String
}
```

`UUID`, `Int`, `String`이 sendable이고 구조체가 value semantics를 가지므로 snapshot을 actor 사이에 전달할 수 있어요.

```swift
actor ReadingStore {
  private var snapshots: [ReadingSnapshot] = []

  func append(_ snapshot: ReadingSnapshot) {
    snapshots.append(snapshot)
  }
}

let store = ReadingStore()
let snapshot = ReadingSnapshot(
  id: UUID(),
  minutes: 30,
  note: "Sendable"
)

await store.append(snapshot)
```

actor method를 외부에서 호출하면 argument가 isolation boundary를 건너요. `ReadingSnapshot`의 value를 안전하게 전달할 수 있다는 사실을 compiler가 알아요.

## 구조체와 enum은 모든 내부 값이 sendable이어야 해요

```swift
enum SyncCommand: Sendable {
  case upload(ReadingSnapshot)
  case delete(id: UUID)
}
```

구조체의 stored property와 enum의 associated value가 모두 `Sendable`이면 명시적으로 준수할 수 있어요. 내부 type이 unsafe한 mutable reference라면 compiler가 진단해요.

```swift
final class MutableFormatter {
  var prefix = ""
}

struct ExportRequest: Sendable {
  let snapshot: ReadingSnapshot
  // let formatter: MutableFormatter
  // error: non-Sendable stored property예요.
}
```

module 내부의 일부 value type은 조건을 만족하면 implicit `Sendable`을 얻을 수 있어요. public API와 `@usableFromInline`처럼 resilient boundary에서는 compiler가 미래의 stored property 변경을 알 수 없으므로 명시적 준수가 필요한 경우가 있어요. API 계약으로 중요하다면 선언에 `Sendable`을 써 의도를 드러내세요.

## generic type은 원소가 sendable일 때만 안전해요

```swift
struct Page<Element: Sendable>: Sendable {
  let items: [Element]
  let nextCursor: String?
}
```

`Array`도 `Element`가 `Sendable`일 때 conditionally sendable해요. `Page<ReadingSnapshot>`은 안전하지만 non-sendable mutable class를 원소로 가진 page는 이 제약을 만족하지 못해요.

모든 generic type에 무조건 `Element: Sendable`을 붙이지 마세요. concurrency boundary를 전혀 넘지 않는 container까지 제한할 수 있어요. API가 값을 다른 domain으로 보내는 역할일 때 필요한 제약을 선언해요.

## actor는 mutable state 접근을 직렬화해요

```swift
actor ReadingCounter {
  private var minutes = 0

  func addTenMinutes() {
    minutes += 10
  }

  func currentMinutes() -> Int {
    minutes
  }
}
```

actor type은 자신의 mutable state 접근을 isolation하고 암시적으로 `Sendable`이에요. 외부 code는 `await`로 actor-isolated method를 호출하고 actor가 한 번에 하나씩 실행하도록 조정해요.

```swift
let counter = ReadingCounter()

async let first: Void = counter.addTenMinutes()
async let second: Void = counter.addTenMinutes()
_ = await (first, second)

let total = await counter.currentMinutes() // 20
```

`Sendable`과 actor는 역할이 달라요. `Sendable`은 경계를 넘어 공유할 type의 안전성을 표현하고 actor는 자신의 mutable state 접근을 격리해요.

## 일반 class의 checked conformance는 제한적이에요

일반 class가 compiler가 검사하는 `Sendable`을 만족하려면 보통 다음 조건이 필요해요.

- `final`이라 subclass가 unsafe stored property를 추가할 수 없어요.
- stored property가 immutable `let`이고 sendable해요.
- superclass가 없거나 허용된 안전한 superclass 조건을 만족해요.

```swift
import Foundation

final class ReadingConfiguration: Sendable {
  let apiBaseURL: URL
  let maximumRetries: Int

  init(apiBaseURL: URL, maximumRetries: Int) {
    self.apiBaseURL = apiBaseURL
    self.maximumRetries = maximumRetries
  }
}
```

instance가 생성된 뒤 공개된 state가 바뀌지 않으므로 여러 domain에서 같은 reference를 읽어도 race가 없어요.

`let` property가 가리키는 reference 내부가 mutable하다면 안전하지 않을 수 있어요. `let`은 reference 자체를 다른 객체로 바꾸지 못하게 할 뿐, 참조된 객체의 내부 mutation까지 자동으로 막지 않아요.

## `@MainActor` class는 main actor가 state를 보호해요

```swift
@MainActor
final class ReadingViewModel {
  private(set) var minutes = 0

  func addTenMinutes() {
    minutes += 10
  }
}
```

global actor로 격리된 class는 mutable property가 있어도 해당 actor가 접근을 조정하므로 암시적으로 sendable해요. 다른 domain은 main actor로 hop한 뒤 state를 읽거나 변경해요.

```swift
await viewModel.addTenMinutes()
```

UI state라서 main actor에 있어야 하는 경우에는 적절하지만 단지 `Sendable` warning을 없애려고 모든 model을 `@MainActor`에 두면 background 작업도 main actor에 묶여요. 실제 state 소유와 실행 요구에 따라 isolation을 선택하세요.

## closure는 `@Sendable`로 capture 안전성을 표현해요

closure는 주변 값을 capture할 수 있으므로 function type 자체에 concurrency 안전 조건이 필요해요.

```swift
let prefix = "독서"

let format: @Sendable (Int) -> String = { minutes in
  "\(prefix) \(minutes)분"
}
```

`prefix`는 immutable sendable `String`이라 안전하게 capture할 수 있어요. `@Sendable` closure는 capture한 값이 sendable이어야 하고 mutable variable을 unsafe하게 동시에 capture할 수 없어요.

```swift
var total = 0

// let add: @Sendable (Int) -> Void = { value in
//   total += value
// }
// strict concurrency에서 concurrently mutated capture를 진단해요.
```

여러 task가 누계를 공유해야 한다면 actor처럼 mutation을 격리하는 type을 capture해요.

```swift
actor TotalMinutes {
  private var value = 0

  func add(_ minutes: Int) {
    value += minutes
  }
}

let totalMinutes = TotalMinutes()
let add: @Sendable (Int) async -> Void = { minutes in
  await totalMinutes.add(minutes)
}
```

`Sendable`은 type 준수이고 `@Sendable`은 function·closure type attribute라는 차이를 기억하세요.

## `@unchecked Sendable`은 compiler 대신 작성자가 증명해요

legacy class가 내부 lock으로 모든 mutation을 보호하지만 compiler가 그 사실을 분석하지 못할 수 있어요.

```swift
import Foundation

final class LockedReadingCounter: @unchecked Sendable {
  private let lock = NSLock()
  private var minutes = 0

  func add(_ value: Int) {
    lock.lock()
    defer { lock.unlock() }
    minutes += value
  }

  func current() -> Int {
    lock.lock()
    defer { lock.unlock() }
    return minutes
  }
}
```

모든 state 접근이 같은 lock을 사용하므로 작성자가 thread safety를 보증해요. 하지만 새 property나 method가 lock을 빠뜨려도 compiler가 알려 주지 않아요.

`@unchecked Sendable`을 사용할 때는 다음을 확인해요.

- 모든 mutable state 접근이 같은 synchronization 규칙을 따라요.
- 내부 reference가 밖으로 노출되어 lock 없이 바뀌지 않아요.
- callback을 lock을 잡은 채 호출해 deadlock을 만들지 않아요.
- 동시 실행 stress test와 code review를 유지해요.
- actor나 immutable snapshot으로 바꿀 수 없는 이유를 문서화해요.

warning을 빠르게 없애기 위한 기본 선택으로 사용하지 마세요.

## unavailable conformance로 암시적 준수를 막을 수 있어요

구조상 implicit sendable 조건을 만족해도 domain 의미상 넘기면 안 되는 type에는 unavailable conformance를 선언할 수 있어요.

```swift
struct FileHandleToken {
  let rawValue: Int32
}

@available(*, unavailable)
extension FileHandleToken: Sendable {}
```

integer 자체는 sendable이지만 열린 file resource의 ownership은 단순 복사와 다를 수 있어요. 값의 stored property 형태뿐 아니라 resource 의미 때문에 보내면 안 된다는 계약을 드러내요.

최신 language mode에는 `~Sendable`처럼 implicit conformance를 억제하는 문법도 추가되고 있지만 compiler version에 따라 experimental feature flag가 필요할 수 있어요. library 문서는 최소 compiler version을 명시하고, 넓은 호환성이 필요하면 위의 unavailable conformance를 사용하세요.

## `sending`은 type 전체의 공유 가능성과 다른 선택이에요

최신 Swift는 일부 parameter와 result에 `sending`을 사용해 특정 non-sendable value 영역을 다른 isolation domain으로 완전히 transfer할 수 있어요. transfer 뒤 원래 domain에서 그 값을 다시 사용하지 못하게 compiler가 검사해 concurrent alias를 막아요.

| 표현       | 보장하는 관점                                                               |
| ---------- | --------------------------------------------------------------------------- |
| `Sendable` | 해당 type의 value를 여러 concurrency domain에서 안전하게 공유할 수 있어요.  |
| `sending`  | 이 호출에서 특정 value 영역의 소유를 넘기고 이전 쪽의 후속 사용을 제한해요. |

모든 non-sendable type을 `@unchecked Sendable`로 만드는 대신 ownership transfer로 문제가 풀리는지 검토할 수 있어요. 다만 API와 compiler version에 따라 사용할 수 있는 위치가 달라지므로 공식 language guide와 proposal을 확인하세요.

## `@preconcurrency`는 migration 도구예요

concurrency annotation이 없는 오래된 module을 import할 때 `@preconcurrency import ModuleName`으로 일부 검사를 완화할 수 있어요. 이는 imported API가 실제 thread-safe해진다는 뜻이 아니에요.

- dependency의 최신 version이 concurrency annotation을 제공하는지 먼저 확인해요.
- 완화된 경계에서 어떤 type을 어느 actor에서 사용하는지 직접 검토해요.
- module migration이 끝나면 annotation을 제거해 compiler 검사를 복원해요.

`@preconcurrency`와 `@unchecked Sendable`은 점진적 migration의 책임을 작성자에게 옮기는 도구예요.

## Sendable과 관련 개념을 비교해요

| 개념                  | 보호하는 대상                                | 핵심 질문                                      |
| --------------------- | -------------------------------------------- | ---------------------------------------------- |
| `Sendable`            | 경계를 넘어 공유되는 value                   | 여러 domain에서 사용해도 race가 없나요?        |
| `@Sendable`           | 경계를 넘어 실행되는 closure와 capture       | closure가 안전한 값만 capture하나요?           |
| actor                 | actor instance의 mutable state               | 이 state 접근을 누가 순차 실행하나요?          |
| `@MainActor`          | UI 등 main actor 소유 state와 code           | 이 접근은 main actor에서 실행되어야 하나요?    |
| `@unchecked Sendable` | compiler가 증명 못 하는 수동 synchronization | 작성자가 모든 공유 안전성을 실제로 보증했나요? |
| `sending`             | 한 호출에서 transfer되는 value region        | 공유 대신 소유를 완전히 넘길 수 있나요?        |

`Sendable`이 “항상 background thread에서 실행된다”는 뜻은 아니에요. 실행 위치가 아니라 data를 isolation boundary 사이에 둘 수 있는지를 표현해요.

## 언제 `Sendable`을 사용해야 하나요

- public API의 argument나 result가 task·actor boundary를 건너요.
- closure를 task group, detached task나 concurrent callback에 전달해요.
- immutable snapshot과 message type의 동시성 안전 계약을 드러내요.
- generic container가 sendable 원소만 담아 경계를 넘어야 해요.
- Swift 6 strict concurrency 진단을 근거로 실제 공유 구조를 개선해요.

한 actor 안에서만 수명이 끝나는 private helper까지 무조건 public `Sendable`로 만들 필요는 없어요. 경계를 찾고 immutable value, actor isolation, ownership transfer 중 문제에 맞는 도구를 선택하세요.

## 적용 순서를 정리해요

1. task와 actor 사이에서 실제로 넘어가는 값과 capture를 찾아요.
2. 가능한 data를 immutable value snapshot으로 만들고 `Sendable`을 명시해요.
3. shared mutable state는 actor나 적절한 synchronization owner 안에 둬요.
4. generic API에는 경계를 넘을 때만 `Element: Sendable` 제약을 추가해요.
5. closure가 concurrent context로 가면 `@Sendable`과 capture를 확인해요.
6. legacy lock type은 모든 접근 규칙을 증명할 때만 `@unchecked Sendable`을 사용해요.
7. `@preconcurrency`는 migration 기간으로 제한하고 strict checking을 다시 켜요.
8. 공유가 필요 없는 non-sendable value는 `sending` transfer가 맞는지 검토해요.

## 면접에서 이어질 수 있는 질문

### `Sendable`에는 왜 required method가 없나요?

실행 기능이 아니라 concurrency domain 사이 공유 안전성이라는 의미를 표시하는 marker protocol이기 때문이에요. compiler가 type의 stored data와 isolation을 검사해 semantic requirement를 확인해요.

### `Sendable`과 `@Sendable`은 어떻게 다른가요?

`Sendable`은 value type과 reference type의 protocol 준수이고 `@Sendable`은 function·closure type에 붙는 attribute예요. `@Sendable` closure가 capture하는 값도 sendable이어야 해요.

### mutable class를 `Sendable`로 만들 수 있나요?

일반 checked conformance로는 제한적이에요. actor나 global actor로 state를 격리하거나 모든 접근을 lock으로 보호한 뒤 `@unchecked Sendable`로 작성자가 책임질 수 있지만 immutable value로 바꿀 수 있는지 먼저 검토해요.

### actor는 왜 암시적으로 Sendable인가요?

actor가 자신의 mutable state 접근을 순차적으로 격리하기 때문이에요. actor reference가 여러 domain에 전달되어도 state를 직접 동시에 읽고 쓸 수 없어요.

### `@unchecked Sendable`을 쓰면 compiler가 무엇을 확인하나요?

준수의 내부 thread safety는 확인하지 않아요. 작성자가 locking과 encapsulation이 모든 code path에서 올바르다는 책임을 지므로 최소 범위와 강한 review가 필요해요.

## 참고 자료

- [Apple Developer — Sendable](https://developer.apple.com/documentation/swift/sendable)
- [The Swift Programming Language — Concurrency](https://docs.swift.org/swift-book/LanguageGuide/Concurrency.html)
- [The Swift Programming Language — Protocols](https://docs.swift.org/swift-book/documentation/the-swift-programming-language/protocols/)
- [Swift Evolution SE-0302 — Sendable and @Sendable closures](https://github.com/swiftlang/swift-evolution/blob/main/proposals/0302-concurrent-value-and-concurrent-closures.md)
- [Swift Evolution SE-0337 — Incremental migration to concurrency checking](https://github.com/swiftlang/swift-evolution/blob/main/proposals/0337-support-incremental-migration-to-concurrency-checking.md)
- [Swift Evolution SE-0430 — sending parameter and result values](https://github.com/swiftlang/swift-evolution/blob/main/proposals/0430-transferring-parameters-and-results.md)
- [Swift-KR — Swift로 이해하는 Codable](./codable)
- [Swift-KR — Swift로 이해하는 제네릭](../generics)
