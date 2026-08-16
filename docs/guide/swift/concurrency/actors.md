---
title: Swift로 이해하는 Actor와 데이터 격리
description: Swift Actor가 mutable state를 격리하는 원리와 cross-actor await, Sendable, reentrancy, nonisolated, protocol 준수와 테스트 기준을 설명합니다.
pageType: doc-wide
outline: false
---

# Swift로 이해하는 Actor와 데이터 격리

> **면접 답변 한 줄 요약:** Actor는 공유 mutable state와 그 state를 다루는 동작을 하나의 isolation domain에 묶고 compiler가 외부 접근을 `await`와 `Sendable` 경계로 제한해 data race를 막는 reference type이며, suspension 사이에는 다른 작업이 끼어들 수 있어 reentrancy까지 설계해야 해요.

여러 task가 하나의 class를 동시에 수정하면 실행 순서에 따라 결과가 달라질 수 있어요. lock이나 serial dispatch queue로 접근을 한 줄씩 감싸면 막을 수 있지만, 한 곳이라도 synchronization을 빠뜨리면 다시 data race가 생겨요.

Actor는 이 규칙을 Swift type system에 넣어요. actor의 mutable state는 기본적으로 actor instance에 격리되고, 외부 코드는 actor가 실행할 수 있을 때까지 비동기적으로 기다려야 해요. 하지만 actor를 “자동 lock class”나 “항상 FIFO로 실행되는 전용 thread”로 이해하면 `await`를 포함한 method에서 논리적인 race condition을 만들 수 있어요.

이 문서에서는 다음 내용을 설명해요.

- class와 serial queue로 state를 보호할 때 생기는 문제
- actor instance isolation과 cross-actor `await`
- actor와 thread·serial queue의 차이
- isolation boundary를 넘는 `Sendable` 값
- actor reentrancy와 `await` 전후 invariant
- `nonisolated`와 `isolated` parameter
- actor의 protocol conformance와 테스트 방법
- actor를 사용하지 않아도 되는 경우

## 먼저 알아둘 Actor 용어

| 용어                  | 쉬운 뜻                                                                                                                                            |
| --------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| shared mutable state  | 여러 실행 흐름이 같은 instance를 참조하면서 바꿀 수 있는 값이에요.                                                                                 |
| mutual exclusion      | 한 순간에 하나의 실행 흐름만 보호된 state를 다루게 하는 성질이에요.                                                                                |
| actor instance        | `actor` 선언으로 만든 reference value예요. actor instance마다 독립적인 state와 isolation domain이 있어요.                                          |
| actor-isolated member | 해당 actor의 executor에서만 동기적으로 접근할 수 있는 property나 method예요. actor의 mutable instance member는 기본적으로 여기에 속해요.           |
| cross-actor reference | 현재 isolation과 다른 actor instance의 member에 접근하는 일이에요. potential suspension이므로 보통 `await`가 필요해요.                             |
| reentrancy            | actor method가 `await`에서 suspend한 동안 같은 actor의 다른 job이 실행되고, 원래 method가 나중에 바뀐 state 위에서 재개될 수 있는 성질이에요.      |
| invariant             | state가 항상 만족해야 하는 규칙이에요. 예를 들어 잔여 독서 시간은 0보다 작아지면 안 된다는 조건이에요.                                             |
| `Sendable`            | isolation domain을 넘어 전달해도 data race 위험이 없음을 나타내는 protocol이에요. 자세한 내용은 [Sendable 문서](../protocols/sendable)를 참고해요. |
| `nonisolated`         | actor member가 actor state에 격리되지 않음을 명시해 어느 isolation에서도 동기 호출할 수 있게 하는 modifier예요.                                    |
| `isolated` parameter  | 함수가 전달받은 actor의 isolation에서 실행되게 해 함수 내부에서 여러 member를 추가 `await` 없이 다루게 하는 parameter예요.                         |

## 일반 class를 동시에 수정하면 data race가 생길 수 있어요

독서 시간을 누적하는 작은 저장소를 만들어 볼게요.

```swift
final class ReadingProgressStore {
  private var minutesByBookID: [Int: Int] = [:]

  func add(minutes: Int, to bookID: Int) {
    minutesByBookID[bookID, default: 0] += minutes
  }

  func minutes(for bookID: Int) -> Int {
    minutesByBookID[bookID, default: 0]
  }
}
```

Dictionary를 읽고 기본값을 만들고 더한 뒤 쓰는 과정은 하나의 원자적 연산이 아니에요. 서로 다른 task나 thread가 같은 `bookID`를 동시에 수정하면 update가 사라지거나 Dictionary 내부 접근이 충돌할 수 있어요.

GCD에서는 private serial queue를 모든 접근 경로에 사용해 보호할 수 있어요.

```swift
final class QueueReadingProgressStore {
  private let queue = DispatchQueue(
    label: "com.example.reading.progress"
  )
  private var minutesByBookID: [Int: Int] = [:]

  func add(minutes: Int, to bookID: Int) {
    queue.sync {
      minutesByBookID[bookID, default: 0] += minutes
    }
  }

  func minutes(for bookID: Int) -> Int {
    queue.sync {
      minutesByBookID[bookID, default: 0]
    }
  }
}
```

mutual exclusion은 생겼지만 안전성이 convention에 의존해요.

- 새 property나 method도 같은 queue를 사용해야 해요.
- queue 밖에서 state를 노출하는 reference를 반환하면 보호가 깨져요.
- 같은 queue 안에서 다시 `sync`하면 deadlock이 생길 수 있어요.
- blocking `sync` 호출은 actor 기반 async 흐름과 잘 맞지 않을 수 있어요.

제공된 [Actor 참고 글](https://green1229.tistory.com/341)도 class의 Dictionary 접근을 serial queue로 감싼 뒤 actor로 옮기는 흐름을 보여 줘요. Actor의 차이는 synchronization 규칙이 comment나 개발자의 기억이 아니라 선언과 compiler 검사에 들어간다는 점이에요.

## `actor`는 state와 접근 규칙을 함께 선언해요

`class`를 `actor`로 바꾸고 수동 queue를 제거해요.

```swift
actor ReadingProgressStore {
  private var minutesByBookID: [Int: Int] = [:]

  func add(minutes: Int, to bookID: Int) {
    minutesByBookID[bookID, default: 0] += minutes
  }

  func minutes(for bookID: Int) -> Int {
    minutesByBookID[bookID, default: 0]
  }
}
```

Actor는 class처럼 identity가 있는 reference type이에요. let에 저장해도 같은 actor instance의 내부 state는 actor method를 통해 바뀔 수 있어요. 반면 class inheritance는 지원하지 않으며 actor type끼리 상속 관계를 만들 수 없어요.

```swift
let store = ReadingProgressStore()

await store.add(minutes: 10, to: 1)
let minutes = await store.minutes(for: 1)
```

외부에서 actor-isolated method를 호출하는 일은 cross-actor access예요. 호출을 actor의 executor에 제출하고 기다릴 수 있으므로 `await`가 필요해요. method 선언 자체가 동기 함수여도 **호출자의 위치**가 다른 actor라면 호출은 비동기가 돼요.

### 같은 actor 안에서는 동기적으로 접근해요

Actor method의 `self`는 현재 actor에 isolated되어 있어요.

```swift
actor ReadingProgressStore {
  private var minutesByBookID: [Int: Int] = [:]

  func add(minutes: Int, to bookID: Int) {
    minutesByBookID[bookID, default: 0] += minutes
  }

  func addHalfHour(to bookID: Int) {
    add(minutes: 30, to: bookID)
  }
}
```

`addHalfHour`가 자신의 `add`를 호출할 때는 이미 같은 actor isolation에 있으므로 `await`가 없어요. 다른 `ReadingProgressStore` instance를 호출하면 같은 actor **타입**이어도 서로 다른 isolation domain이라 `await`가 필요해요.

```swift
extension ReadingProgressStore {
  func copyProgress(
    for bookID: Int,
    to other: ReadingProgressStore
  ) async {
    let current = minutesByBookID[bookID, default: 0]
    await other.add(minutes: current, to: bookID)
  }
}
```

Swift의 [Actor 제안 SE-0306](https://github.com/swiftlang/swift-evolution/blob/main/proposals/0306-actors.md)은 `self`와 `other`를 구분해 같은 actor type의 instance라도 cross-actor 접근을 검사해요.

## Actor는 전용 thread도 FIFO queue도 아니에요

Actor는 mutable state에 대한 **동시 접근 금지**를 보장해요. 구현 세부로 특정 thread 하나를 영구 소유한다는 뜻은 아니에요. actor의 executor는 실행 가능한 job을 system thread에 scheduling하고, suspension 뒤에는 다른 thread에서 같은 actor isolation으로 재개할 수 있어요.

serial `DispatchQueue`와 비교하면 다음 차이가 있어요.

| 기준                | serial DispatchQueue                                       | Swift actor                                                              |
| ------------------- | ---------------------------------------------------------- | ------------------------------------------------------------------------ |
| 보호 규칙           | 모든 접근을 queue에 넣는 convention을 직접 지켜요.         | compiler가 actor-isolated 접근을 검사해요.                               |
| 제출 순서           | FIFO로 block을 시작해요.                                   | priority를 고려할 수 있어 대기한 순서대로 실행된다고 보장하지 않아요.    |
| 기다림              | `sync`는 thread를 막고 `async`는 callback 구조가 필요해요. | cross-actor 호출은 task를 suspend하고 `await` 뒤에서 결과를 이어 받아요. |
| method 중간 `await` | block 안에는 Swift suspension 의미가 없어요.               | suspend한 동안 같은 actor의 다른 job이 실행될 수 있어요.                 |
| 값 전달 검사        | capture와 반환값의 thread safety를 compiler가 몰라요.      | isolation boundary의 argument와 result에 `Sendable` 검사가 적용돼요.     |

Actor는 한 시점에 actor-isolated code의 job 하나만 실행해요. 다만 하나의 async method 전체가 처음부터 끝까지 다른 작업을 막는 것은 아니에요. method가 `await`에서 suspend하면 다음 job이 actor에 들어올 수 있어요.

## isolation boundary에는 안전한 값을 전달해요

Actor 밖으로 mutable reference를 그대로 반환하면 내부 state 보호를 우회할 수 있어요. Swift는 cross-actor argument와 result가 안전하게 전달될 수 있도록 `Sendable`을 검사해요.

```swift
struct ReadingProgress: Sendable, Equatable {
  let bookID: Int
  let minutes: Int
}

actor ReadingProgressStore {
  private var minutesByBookID: [Int: Int] = [:]

  func progress(for bookID: Int) -> ReadingProgress {
    ReadingProgress(
      bookID: bookID,
      minutes: minutesByBookID[bookID, default: 0]
    )
  }
}
```

`ReadingProgress`는 immutable value type이고 stored property가 모두 `Sendable`이라 actor 밖으로 snapshot을 전달하기 좋아요.

```swift
let snapshot = await store.progress(for: 1)
```

다음 방식은 피해야 해요.

```swift
final class MutableProgress {
  var minutes = 0
}

actor UnsafeStore {
  private let progress = MutableProgress()

  // strict concurrency에서는 non-Sendable mutable reference가
  // actor boundary를 빠져나가는 반환을 진단해요.
}
```

Actor 자체는 implicit `Sendable`이에요. reference를 여러 concurrency domain에 전달해도 내부 mutable state 접근은 actor isolation이 보호하기 때문이에요. 그러나 actor가 반환하는 모든 값이 자동으로 `Sendable`이 되는 것은 아니에요.

## reentrancy 때문에 `await` 전의 가정이 깨질 수 있어요

Actor는 data race를 막지만 모든 logical race를 자동으로 막지는 않아요. 잔여 독서 시간을 예약하는 actor를 볼게요.

```swift
actor DailyReadingBudget {
  private var remainingMinutes = 30

  func reserve(
    minutes: Int,
    authorize: @Sendable () async throws -> Void
  ) async throws -> Bool {
    guard remainingMinutes >= minutes else {
      return false
    }

    try await authorize()
    remainingMinutes -= minutes
    return true
  }
}
```

두 task가 동시에 `reserve(minutes: 20)`을 호출한다고 생각해 볼게요.

1. 첫 번째 job이 `remainingMinutes == 30`을 확인하고 `authorize()`에서 suspend해요.
2. 두 번째 job도 같은 actor에 들어와 30을 확인하고 suspend해요.
3. 두 authorization이 끝난 뒤 각각 20을 빼면 `remainingMinutes == -10`이 돼요.

한 순간에 두 job이 property를 동시에 만진 data race는 없지만 “0보다 작아지지 않는다”는 invariant가 깨졌어요. `await`는 다른 job이 끼어들 수 있는 경계라고 읽어야 해요.

### 먼저 state를 확정하고 실패하면 되돌려요

authorization 전에 예약을 확정하면 같은 actor의 동기 구간에서 검사와 변경을 하나로 묶을 수 있어요.

```swift
actor DailyReadingBudget {
  private var remainingMinutes = 30

  func reserve(
    minutes: Int,
    authorize: @Sendable () async throws -> Void
  ) async throws -> Bool {
    guard remainingMinutes >= minutes else {
      return false
    }

    remainingMinutes -= minutes

    do {
      try await authorize()
      return true
    } catch {
      remainingMinutes += minutes
      throw error
    }
  }
}
```

이 방식은 oversubscription을 막지만 rollback 정책이 필요해요. authorization 동안 다른 호출은 이미 줄어든 잔여 시간을 관찰해요. domain에서 “예약 중” 상태를 별도로 모델링해야 할 수도 있어요.

### `await` 뒤에서 조건을 다시 확인해요

원격 결과가 최신 state에만 적용되어야 한다면 revision을 비교할 수 있어요.

```swift
actor ReadingRecommendations {
  private var revision = 0
  private var books: [Book] = []

  func replacePreference() {
    revision += 1
  }

  func refresh(
    using client: any RecommendationClient
  ) async throws {
    let requestedRevision = revision
    let response = try await client.fetchBooks()

    guard revision == requestedRevision else {
      return
    }

    books = response
  }
}
```

`await` 뒤에서 현재 revision이 요청 당시와 같은지 확인해 오래된 응답이 새 설정을 덮어쓰지 않게 했어요.

Apple의 [Protect mutable state with Swift actors](https://developer.apple.com/videos/play/wwdc2021/10133/)도 `await`에서 세상이 진행되어 이전 가정이 무효가 될 수 있으므로 reentrancy를 고려하라고 설명해요.

## `nonisolated`는 actor state가 필요 없는 member에 사용해요

Actor member는 기본적으로 actor-isolated예요. instance identity처럼 생성 뒤 바뀌지 않고 actor state를 읽지 않는 API는 `nonisolated`로 만들 수 있어요.

```swift
actor ReadingProgressStore {
  nonisolated let storeID: String
  private var minutesByBookID: [Int: Int] = [:]

  init(storeID: String) {
    self.storeID = storeID
  }

  nonisolated var description: String {
    "ReadingProgressStore(\(storeID))"
  }
}
```

호출자는 `await` 없이 사용할 수 있어요.

```swift
print(store.description)
```

`nonisolated` member는 actor의 isolated mutable property에 접근할 수 없어요. synchronization 비용을 줄이려고 mutable state에 `nonisolated(unsafe)`를 붙이면 actor의 안전 보장을 직접 해제하게 돼요. lock이나 atomic처럼 별도의 정확한 보호가 있고 그 책임을 설명할 수 있는 제한된 interop에서만 검토해요.

## `isolated` parameter로 같은 actor에서 여러 동작을 묶어요

Actor method를 외부에서 여러 번 호출하면 호출마다 isolation boundary를 넘어요.

```swift
let before = await store.minutes(for: 1)
await store.add(minutes: 10, to: 1)
let after = await store.minutes(for: 1)
```

각 `await` 사이에 다른 job이 actor state를 바꿀 수 있어요. 하나의 actor isolation에서 atomic한 동기 sequence로 실행해야 한다면 `isolated` parameter를 받을 수 있어요.

```swift
func addAndRead(
  store: isolated ReadingProgressStore,
  minutes: Int,
  bookID: Int
) -> Int {
  store.add(minutes: minutes, to: bookID)
  return store.minutes(for: bookID)
}
```

외부 호출은 actor로 한 번 hop해요.

```swift
let total = await addAndRead(
  store: store,
  minutes: 10,
  bookID: 1
)
```

함수 안에서는 `store`의 isolation에 이미 있으므로 각 method에 `await`가 필요 없어요. isolated parameter는 한 함수에 하나만 둘 수 있어요. 서로 다른 두 actor를 동시에 lock하는 기능이 아니며, 다른 actor에 접근하면 다시 `await`해야 해요.

## protocol requirement의 isolation도 맞아야 해요

Actor가 synchronous nonisolated protocol requirement를 actor-isolated method로 구현하면 caller가 `await` 없이 state에 접근할 수 있어 안전하지 않아요.

요구사항 자체가 `async`이면 actor의 synchronous method도 구현으로 사용할 수 있어요.

```swift
protocol ProgressReading: Sendable {
  func minutes(for bookID: Int) async -> Int
}

actor ReadingProgressStore: ProgressReading {
  nonisolated let storeID: String
  private var minutesByBookID: [Int: Int] = [:]

  init(storeID: String) {
    self.storeID = storeID
  }

  func minutes(for bookID: Int) -> Int {
    minutesByBookID[bookID, default: 0]
  }
}
```

Protocol을 통한 호출은 항상 async이므로 actor가 실행 가능할 때까지 안전하게 기다릴 수 있어요.

동기 protocol requirement가 actor state를 필요로 하지 않는다면 `nonisolated` witness로 구현해요.

```swift
extension ReadingProgressStore: CustomStringConvertible {
  nonisolated var description: String {
    "ReadingProgressStore(\(storeID))"
  }
}
```

기존 protocol을 actor에 맞추기 위해 무조건 `@preconcurrency`나 `nonisolated(unsafe)`로 검사를 끄기보다 requirement가 실제로 async여야 하는지, 특정 global actor에 격리되어야 하는지 API contract부터 검토해요.

## Actor 안에서도 오래 걸리는 동기 작업은 다른 job을 막아요

Actor가 thread를 직접 막지는 않아도, actor-isolated synchronous code가 반환하거나 suspend하기 전에는 같은 actor의 다음 job이 실행되지 못해요.

```swift
actor SearchIndexStore {
  private var index = SearchIndex()

  func rebuild(from books: [Book]) {
    // 큰 배열을 오래 계산하면 이 actor의 다른 요청이 기다려요.
    index = makeSearchIndex(from: books)
  }
}
```

큰 CPU 계산은 sendable snapshot을 받아 actor 밖의 concurrent 함수에서 수행하고 결과만 actor에 적용해요.

```swift
@concurrent
func buildSearchIndex(
  from books: [Book]
) async -> SearchIndex {
  makeSearchIndex(from: books)
}

actor SearchIndexStore {
  private var index = SearchIndex()

  func rebuild(from books: [Book]) async {
    let newIndex = await buildSearchIndex(from: books)
    index = newIndex
  }
}
```

여기서도 `await` 동안 다른 rebuild나 update가 들어올 수 있어요. 마지막 완료 결과를 적용할지, 요청 순서를 보존할지 revision이나 task cancellation 정책을 정해야 해요.

## 테스트에서는 결과와 interleaving 조건을 나눠 검증해요

기본 mutation은 여러 child task에서 호출해 최종 결과를 확인할 수 있어요.

```swift
import Testing

@Test
func accumulatesConcurrentUpdates() async {
  let store = ReadingProgressStore(storeID: "test")

  await withTaskGroup(of: Void.self) { group in
    for _ in 0..<100 {
      group.addTask {
        await store.add(minutes: 1, to: 1)
      }
    }
  }

  let total = await store.minutes(for: 1)
  #expect(total == 100)
}
```

이 테스트는 actor가 update를 잃지 않는지 확인하지만 특정 실행 순서를 검증하지 않아요. Actor는 FIFO를 보장하지 않기 때문이에요.

Reentrancy bug를 재현하려면 임의의 `Task.sleep`에 기대지 말고 test가 suspension과 재개 시점을 제어하는 dependency를 주입해요.

```swift
actor AuthorizationGate {
  private var continuations: [CheckedContinuation<Void, Never>] = []

  func wait() async {
    await withCheckedContinuation { continuation in
      continuations.append(continuation)
    }
  }

  func openAll() {
    let pending = continuations
    continuations.removeAll()
    pending.forEach { $0.resume() }
  }
}
```

Production actor를 test-only method로 오염시키기보다 clock, client, gate protocol을 주입하면 `await` 사이 state 변화를 결정적으로 만들 수 있어요.

## Actor를 선택하기 전에 비용도 확인해요

Actor가 잘 맞는 경우예요.

- 여러 task가 하나의 mutable state를 공유해야 해요.
- state와 mutation 규칙을 한 타입에 모을 수 있어요.
- caller API가 async가 되어도 자연스러워요.
- compiler의 isolation과 `Sendable` 검사를 활용하고 싶어요.
- cache, session, repository state처럼 state owner가 명확해요.

다른 방법이 더 단순할 수 있는 경우예요.

- state가 immutable value라 공유해도 mutation이 없어요.
- 각 task가 독립적인 value copy만 사용해요.
- synchronous callback 안에서 아주 짧은 critical section을 즉시 완료해야 해요. lock이나 `Mutex`를 비교해요.
- state가 UI에만 속해 main thread 격리가 필요해요. 일반 actor보다 [`@MainActor`](./main-actor)가 요구를 정확히 표현해요.
- actor method 대부분이 긴 CPU 작업이라 하나의 actor에 contention만 만들어요. state owner와 계산 worker를 분리해요.

Actor를 data container마다 기계적으로 추가하면 모든 property access가 async 경계가 되고 actor 사이 hop이 늘어요. **어떤 invariant를 하나의 isolation domain이 보호하는가**를 먼저 답할 수 있어야 해요.

## 적용 순서를 정리해요

1. 여러 task가 공유하는 mutable state와 현재 synchronization 방식을 표시해요.
2. 같은 invariant를 지키는 property와 method를 하나의 actor에 모아요.
3. actor 밖으로 반환할 값은 immutable `Sendable` snapshot으로 설계해요.
4. cross-actor 호출에 생긴 `await`를 단순 문법 오류로 보지 말고 실제 suspension boundary로 검토해요.
5. 각 actor method에서 `await` 전의 가정을 목록으로 만들고 재개 뒤 다시 확인하거나 state transition을 먼저 확정해요.
6. actor state가 필요 없는 identity와 protocol witness만 `nonisolated`로 분리해요.
7. 여러 actor call을 하나의 isolation에서 묶어야 할 때만 `isolated` parameter를 사용해요.
8. 긴 CPU 작업은 sendable input으로 actor 밖에서 수행하고 stale result 처리 정책을 정해요.
9. Swift 6 strict concurrency와 결정적인 suspension dependency를 사용해 data race와 logical race를 각각 테스트해요.

## 면접에서 이어질 수 있는 질문

### Actor는 data race를 완전히 없애나요?

Actor-isolated state에 대한 unsafe한 동시 접근을 막아 해당 state의 data race를 방지해요. 하지만 actor 밖의 shared mutable state, `nonisolated(unsafe)`, 잘못된 `@unchecked Sendable`까지 보호하지는 않으며 reentrancy로 인한 logical race도 별도로 설계해야 해요.

### Actor method가 동기 함수인데 외부에서 왜 `await`하나요?

Method body에 suspension이 없어도 다른 actor에서 호출하면 target actor가 실행 가능할 때까지 기다려야 해요. 그래서 cross-actor access 자체가 potential suspension이고, 같은 actor의 `self`에서 호출할 때만 동기적으로 실행할 수 있어요.

### Actor는 한 method가 끝날 때까지 다른 호출을 모두 막나요?

`await`가 없는 동기 구간은 mutual exclusion으로 실행돼요. Async method가 `await`에서 suspend하면 같은 actor의 다른 job이 실행될 수 있고, 원래 method는 바뀐 state 위에서 재개될 수 있어요. 이를 actor reentrancy라고 해요.

### Actor의 실행 순서는 FIFO인가요?

아니요. Swift runtime은 priority inversion을 줄이기 위해 task priority 등을 고려할 수 있어 actor 대기 순서를 FIFO로 보장하지 않아요. 순서가 domain 요구라면 sequence number, explicit queue state 또는 하나의 actor method 안에서 처리하는 별도 정책을 설계해요.

### `nonisolated`는 언제 사용하나요?

Actor의 mutable state를 전혀 읽거나 바꾸지 않는 identity, immutable metadata와 synchronous protocol witness에 사용해요. `await`를 없애기 위한 성능 annotation이 아니며, isolated state가 필요한 member에 붙일 수 없어요.

## 참고 자료

- [The Swift Programming Language — Concurrency: Actors](https://docs.swift.org/swift-book/documentation/the-swift-programming-language/concurrency/#Actors)
- [The Swift Programming Language — Declarations: Actor declarations](https://docs.swift.org/swift-book/documentation/the-swift-programming-language/declarations/#Actor-Declaration)
- [Swift Evolution SE-0306 — Actors](https://github.com/swiftlang/swift-evolution/blob/main/proposals/0306-actors.md)
- [Swift Evolution SE-0302 — Sendable and @Sendable closures](https://github.com/swiftlang/swift-evolution/blob/main/proposals/0302-concurrent-value-and-concurrent-closures.md)
- [Swift Evolution SE-0313 — Improved control over actor isolation](https://github.com/swiftlang/swift-evolution/blob/main/proposals/0313-actor-isolation-control.md)
- [Swift Evolution SE-0327 — On Actors and Initialization](https://github.com/swiftlang/swift-evolution/blob/main/proposals/0327-actor-initializers.md)
- [Apple Developer — Actor](https://developer.apple.com/documentation/swift/actor)
- [Apple Developer — Sendable](https://developer.apple.com/documentation/swift/sendable)
- [WWDC21 — Protect mutable state with Swift actors](https://developer.apple.com/videos/play/wwdc2021/10133/)
- [WWDC21 — Swift concurrency: Behind the scenes](https://developer.apple.com/videos/play/wwdc2021/10254/)
- [Swift 6 Concurrency Migration Guide — Common compiler errors](https://www.swift.org/migration/documentation/swift-6-concurrency-migration-guide/commonproblems/)
- [iOYES — Swift Concurrency: Actor](https://green1229.tistory.com/341)
