---
title: Swift로 이해하는 GCD와 Swift Concurrency
description: GCD의 queue·thread와 Swift Concurrency의 task·executor를 비교하고 async/await, 구조화된 동시성, 취소와 점진적 전환 기준을 설명합니다.
pageType: doc-wide
outline: false
---

# Swift로 이해하는 GCD와 Swift Concurrency

> **면접 답변 한 줄 요약:** GCD는 block을 dispatch queue에 제출해 실행 순서와 thread 사용을 관리하는 시스템 library이고, Swift Concurrency는 비동기 작업을 task 구조로 표현해 결과·오류·우선순위·협력적 취소를 전파하며 actor isolation을 compiler가 검사하게 하는 언어 실행 모델이에요.

GCD(Grand Central Dispatch)와 Swift Concurrency는 둘 다 여러 작업을 효율적으로 실행하도록 도와줘요. 하지만 `DispatchQueue.global().async`를 `Task {}`로 바꾸는 단순한 문법 차이는 아니에요.

GCD에서는 **어느 queue에 block을 제출할지**를 중심으로 생각해요. Swift Concurrency에서는 **작업이 어떤 task에 속하고, 어디에서 중단되며, 어떤 isolation에서 다시 실행되는지**를 중심으로 생각해요. 이 차이를 이해해야 불필요한 thread hop, 취소되지 않는 작업, main actor 정체와 data race를 피할 수 있어요.

이 문서에서는 다음 내용을 설명해요.

- GCD의 queue와 Swift Concurrency의 task·executor 차이
- `async`와 `await`이 보장하는 것과 보장하지 않는 것
- 순차 실행, `async let`, task group의 선택 기준
- structured task, `Task`, `Task.detached`의 생명주기 차이
- 협력적 cancellation과 priority
- callback API를 continuation으로 연결하는 방법
- GCD 코드를 점진적으로 전환하는 기준

## 먼저 알아둘 동시성 용어

| 용어                   | 쉬운 뜻                                                                                                                                                         |
| ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| concurrency            | 여러 작업이 같은 시간 구간에 진행되도록 구성하는 방식이에요. 실제로 동시에 실행되는 parallelism과는 구분해요.                                                   |
| thread                 | 운영체제가 CPU에서 명령을 실행하도록 scheduling하는 실행 흐름이에요.                                                                                            |
| dispatch queue         | GCD에 block을 제출하는 FIFO 대기열이에요. serial queue는 한 번에 하나를 시작하고 concurrent queue는 여러 작업을 겹쳐 실행할 수 있어요.                          |
| task                   | Swift 비동기 코드의 기본 실행 단위예요. priority, cancellation 상태와 task-local 값을 가지고 async 함수를 실행해요.                                             |
| suspension point       | async 함수가 thread를 점유하지 않고 잠시 멈출 가능성이 있는 지점이에요. `await`가 이 가능성을 표시해요.                                                         |
| job                    | task가 한 suspension point에서 다음 suspension point까지 실행하는 scheduling 단위예요.                                                                          |
| executor               | 실행 가능한 job을 받아 어떤 thread에서 실행할지 정하는 service예요. actor와 global actor는 자신의 executor에 격리될 수 있어요.                                  |
| structured concurrency | child task의 수명과 결과를 lexical scope 안에 묶어 부모가 scope를 나가기 전에 모든 child를 기다리게 하는 구조예요.                                              |
| unstructured task      | `Task {}`처럼 생성 scope를 벗어나서도 실행될 수 있는 task예요. handle로 결과와 cancellation을 직접 관리해야 해요.                                               |
| data race              | 여러 실행 흐름이 synchronization 없이 같은 memory에 접근하고 그중 하나 이상이 쓰는 상황이에요.                                                                  |
| actor isolation        | actor가 자신의 mutable state를 보호하고 compiler가 isolation boundary를 넘는 접근을 검사하는 Swift 규칙이에요. 자세한 내용은 [Actor 문서](./actors)를 참고해요. |

## GCD는 block을 queue에 제출해요

`DispatchQueue`는 실행할 closure인 block을 받아 system이 관리하는 thread pool에서 실행해요.

```swift
import Dispatch

let imageQueue = DispatchQueue(
  label: "com.example.reading.image",
  qos: .userInitiated
)

imageQueue.async {
  let thumbnail = makeThumbnail()

  DispatchQueue.main.async {
    show(thumbnail)
  }
}
```

이 코드에는 두 가지 정책이 직접 드러나요.

1. thumbnail 생성 block을 `imageQueue`에 비동기로 제출해요.
2. UI 갱신 block을 main queue에 다시 제출해요.

Apple의 [`DispatchQueue` 문서](https://developer.apple.com/documentation/dispatch/dispatchqueue)는 queue를 serial 또는 concurrent하게 block을 실행하는 FIFO 대기열로 설명해요. 여기서 FIFO는 **제출된 작업을 꺼내 시작하는 순서**에 관한 규칙이에요. concurrent queue에 제출한 작업의 완료 순서까지 같다는 뜻은 아니에요.

### `sync`와 `async`는 호출자가 기다리는지가 달라요

```swift
queue.sync {
  updateIndex()
}

queue.async {
  updateIndex()
}
```

- `sync`는 block이 끝날 때까지 현재 호출을 막아요.
- `async`는 block을 제출하고 바로 반환해요.

main thread에서 `DispatchQueue.main.sync`를 호출하면 현재 main thread는 block이 끝나기를 기다리고, block은 main thread가 비워지기를 기다려 deadlock이 생겨요. 어느 queue에 있는지 사람이 정확히 추적해야 하는 이유예요.

serial queue를 mutable state의 유일한 접근 경로로 사용하면 data race를 막을 수 있어요. 하지만 property를 직접 읽는 경로가 하나라도 생기면 compiler는 실수를 막아 주지 못해요.

## `async`는 함수가 중단될 수 있다는 타입 정보예요

Swift에서는 시간이 걸릴 수 있는 함수에 `async`를 선언해요.

```swift
struct ReadingSummary: Sendable {
  let completedMinutes: Int
}

func fetchSummary() async throws -> ReadingSummary {
  // 실제 앱에서는 URLSession 같은 async API를 호출해요.
  ReadingSummary(completedMinutes: 30)
}
```

호출하는 쪽은 potential suspension point에 `await`를 써요.

```swift
let summary = try await fetchSummary()
print(summary.completedMinutes)
```

Swift Evolution의 [async/await 제안](https://github.com/swiftlang/swift-evolution/blob/main/proposals/0296-async-await.md)은 suspension이 발생하면 함수가 현재 thread를 양보할 수 있다고 설명해요. 작업이 준비되면 이어서 실행하지만 suspension 전과 같은 thread에서 재개된다고 보장하지 않아요.

중요한 오해를 나눠 볼게요.

| 표현                 | 실제 의미                                                                                        |
| -------------------- | ------------------------------------------------------------------------------------------------ |
| `async` 함수         | 실행 중 중단될 수 있어요. 호출만으로 새 task나 background thread가 생기지는 않아요.              |
| `await`              | 이 지점에서 중단될 가능성을 표시해요. 항상 중단된다는 뜻은 아니에요.                             |
| `Task { ... }`       | async 코드를 실행할 새 unstructured task를 만들어요. 곧바로 background thread를 지정하지 않아요. |
| actor 또는 MainActor | 재개해야 할 isolation과 executor를 표현해요. 일반 actor는 특정 고정 thread를 뜻하지 않아요.      |
| `@concurrent` 함수   | Swift 6.2 이상에서 caller actor를 떠나 concurrent executor에서 실행할 의도를 명시해요.           |

`await` 뒤에서 같은 **actor**로 돌아오는 것은 보장할 수 있지만 같은 **thread**로 돌아온다고 가정하면 안 돼요. UI처럼 main thread 실행이 필요한 코드는 thread를 추측하지 말고 [`@MainActor`](./main-actor)로 isolation을 선언해요.

## `await`를 두 번 쓴다고 두 작업이 동시에 시작되지는 않아요

다음 코드는 첫 번째 호출이 끝난 뒤 두 번째 호출을 시작해요.

```swift
let profile = try await fetchProfile()
let sessions = try await fetchSessions()
```

두 결과가 서로 독립적이고 함께 필요하다면 `async let`으로 child task를 만들 수 있어요.

```swift
async let profile = fetchProfile()
async let sessions = fetchSessions()

let page = try await ReadingPage(
  profile: profile,
  sessions: sessions
)
```

`async let`으로 만든 두 child task는 동시에 진행될 수 있어요. enclosing scope는 두 child가 끝나기 전에 반환하지 않아요. 오류가 발생하거나 scope가 먼저 끝나면 남은 child는 자동으로 cancellation 요청을 받아요.

| 상황                                  | 알맞은 방식             |
| ------------------------------------- | ----------------------- |
| 앞 결과가 다음 요청에 필요해요.       | 순서대로 `try await`    |
| 서로 다른 고정 개수 결과가 필요해요.  | `async let`             |
| 실행 중 동적으로 child 수가 정해져요. | `withThrowingTaskGroup` |

### 동적인 작업 수에는 task group을 사용해요

여러 책의 독서 시간을 동시에 불러오는 예예요.

```swift
func fetchMinutes(
  for bookIDs: [Int],
  client: any ReadingClient
) async throws -> [Int] {
  try await withThrowingTaskGroup(
    of: (Int, Int).self,
    returning: [Int].self
  ) { group in
    for (index, bookID) in bookIDs.enumerated() {
      group.addTask {
        let minutes = try await client.fetchMinutes(bookID: bookID)
        return (index, minutes)
      }
    }

    var indexedMinutes: [(Int, Int)] = []

    for try await result in group {
      indexedMinutes.append(result)
    }

    return indexedMinutes
      .sorted { $0.0 < $1.0 }
      .map(\.1)
  }
}
```

child가 끝나는 순서는 입력 순서와 다를 수 있어요. 결과 순서가 중요하므로 원래 index를 함께 반환해 정렬했어요. task group을 사용하면 모든 child가 scope 안에서 완료되고, child가 던진 오류와 cancellation을 부모가 구조적으로 처리할 수 있어요.

## Task 종류는 생명주기와 상속 범위가 달라요

모든 async 함수는 어떤 task 안에서 실행돼요. 일반 async 함수를 `await`해 호출하면 새 task를 만드는 것이 아니라 현재 task에서 이어서 실행해요.

| 생성 방식               | 구조화 여부  | creator의 actor context     | priority·task-local      | cancellation 관계                                                                    |
| ----------------------- | ------------ | --------------------------- | ------------------------ | ------------------------------------------------------------------------------------ |
| 일반 async 함수 `await` | 같은 task    | 현재 isolation을 따름       | 같은 task 정보           | 같은 task의 cancellation 상태를 봐요.                                                |
| `async let`             | child task   | closure 규칙에 따라 결정    | 부모에서 상속            | 부모 취소가 child로 전파되고 scope가 child 완료를 기다려요.                          |
| `group.addTask`         | child task   | 명시된 isolation을 따름     | 부모에서 상속            | group이 lifetime을 묶고 오류·취소를 관리해요.                                        |
| `Task { ... }`          | unstructured | 현재 actor를 상속할 수 있음 | priority·task-local 상속 | parent-child lifetime이 없어 creator 취소가 자동 전파되지 않아요. handle을 관리해요. |
| `Task.detached { ... }` | unstructured | 상속하지 않음               | 상속하지 않음            | 독립적이에요. 필요한 경우 handle을 저장하고 직접 취소해요.                           |

`Task {}`를 구조화된 child task라고 부르면 안 돼요. 현재 actor context와 일부 task 정보를 상속할 수 있지만 생성한 함수가 반환된 뒤에도 실행될 수 있어요.

```swift
@MainActor
final class ThumbnailLoader {
  private var task: Task<Void, Never>?

  func start() {
    task = Task {
      await loadThumbnails()
    }
  }

  func cancel() {
    task?.cancel()
    task = nil
  }
}
```

unstructured task가 화면이나 객체 lifetime에 묶여야 한다면 handle을 보관하고 명확한 시점에 취소해요. 단순히 async 함수 안에서 병렬 child가 필요하다면 `Task {}`보다 `async let`이나 task group을 먼저 검토해요.

`Task.detached`는 actor context까지 끊어야 하는 드문 작업에 사용해요. isolation 오류를 피하려고 습관적으로 쓰면 non-`Sendable` capture와 lifetime 관리가 더 어려워져요.

## cancellation은 요청이며 작업이 협력해야 해요

Swift task를 취소해도 runtime이 임의의 줄에서 작업을 강제로 종료하지 않아요. 취소 상태를 기록하고 child task로 요청을 전파해요. 작업은 적절한 지점에서 상태를 확인해야 해요.

```swift
func buildSearchIndex(
  from books: [Book]
) async throws -> [SearchEntry] {
  var entries: [SearchEntry] = []

  for book in books {
    try Task.checkCancellation()
    entries.append(makeSearchEntry(from: book))
  }

  return entries
}
```

`Task.checkCancellation()`은 취소되었다면 `CancellationError`를 던져요. 오류를 던질 수 없는 함수에서는 `Task.isCancelled`를 확인하고 지금까지 만든 결과를 버리거나 반환할 정책을 정해요.

`Task.sleep(for:)`처럼 cancellation을 확인하는 API도 있지만 **모든 `await`가 자동으로 `CancellationError`를 던지는 것은 아니에요.** 사용하는 API의 cancellation 계약을 확인해야 해요.

GCD의 `DispatchWorkItem.cancel()`도 이미 실행 중인 block을 강제로 멈추지 않아요. 차이는 Swift structured concurrency가 부모와 child 관계를 알고 cancellation 요청을 아래로 전파할 수 있다는 점이에요. 실제 종료가 협력적이라는 사실은 둘 다 코드가 책임져야 해요.

## priority는 실행 순서를 확정하지 않아요

Swift task는 `TaskPriority`를 가지고 child task가 부모 priority를 상속할 수 있어요. 높은 priority task가 낮은 priority task의 결과를 기다리면 priority inversion을 완화하기 위한 escalation도 일어날 수 있어요.

```swift
let task = Task(priority: .userInitiated) {
  try await fetchReadingPage()
}

let page = try await task.value
```

priority는 executor가 scheduling 판단에 사용할 **힌트**예요. 높은 priority task가 항상 먼저 완료된다는 보장은 없어요. GCD의 QoS도 작업의 중요도와 latency 기대를 전달하지만 dependency와 실제 resource 상태에 따라 순서가 달라질 수 있어요.

priority를 작업 순서 제어 장치로 사용하지 말고 필요한 dependency는 `await`로 표현해요.

## callback API는 continuation으로 한 번만 연결해요

기존 library가 completion handler만 제공한다면 continuation으로 async 함수 하나를 만들 수 있어요.

```swift
protocol LegacyReadingAPI: Sendable {
  func loadSummary(
    completion: @escaping @Sendable (
      Result<ReadingSummary, any Error>
    ) -> Void
  )
}

func loadSummary(
  from api: any LegacyReadingAPI
) async throws -> ReadingSummary {
  try await withCheckedThrowingContinuation { continuation in
    api.loadSummary { result in
      continuation.resume(with: result)
    }
  }
}
```

continuation은 callback이 어느 queue에서 호출되는지를 caller에게 다시 노출하지 않으면서 중단된 task를 재개해요. 재개된 코드는 자신의 actor isolation과 executor 규칙을 따라요.

반드시 지켜야 할 계약이 있어요.

- 모든 실행 경로에서 정확히 한 번 `resume`해요.
- callback이 두 번 올 수 있다면 먼저 한 번만 전달되도록 adapter가 상태를 보호해요.
- callback이 오지 않을 수 있다면 취소·timeout·실패 경로를 설계해요.
- continuation closure 안에서 오래 걸리는 동기 작업으로 thread를 막지 않아요.

`CheckedContinuation`은 일부 오용을 진단하지만 API의 취소를 자동으로 구현하지 않아요. underlying request를 취소해야 한다면 `withTaskCancellationHandler`와 library의 cancel handle을 함께 설계해야 해요.

제공된 [Actor 참고 글](https://green1229.tistory.com/341)과 [MainActor 참고 글](https://green1229.tistory.com/343)은 completion handler를 async 함수로 감싸고 serial queue 기반 저장소를 actor로 옮기는 흐름을 보여 줘요. 이 문서에서는 그 전환 흐름에 structured task, cooperative cancellation과 Swift 6 isolation 규칙을 더해 설명해요.

## GCD와 Swift Concurrency를 같은 기준으로 비교해요

| 비교 기준          | GCD                                                                | Swift Concurrency                                                                                  |
| ------------------ | ------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------- |
| 기본 실행 단위     | queue에 제출한 block 또는 `DispatchWorkItem`                       | async 함수를 실행하는 task와 suspension 사이의 job                                                 |
| scheduling 표현    | serial·concurrent queue, target queue와 QoS를 직접 선택해요.       | executor가 job을 scheduling하고 코드는 task·actor isolation을 표현해요.                            |
| 결과와 오류        | completion handler, shared storage, `DispatchGroup` 등을 조립해요. | async 함수의 return과 `throws`가 일반 control flow처럼 전파돼요.                                   |
| 병렬 child의 수명  | 제출한 block의 lifetime을 별도로 추적해요.                         | `async let`과 task group은 child가 scope 밖으로 나가지 못하게 해요.                                |
| cancellation       | work item과 underlying API별로 flag와 전달 방식을 설계해요.        | task tree로 요청을 전파하지만 실제 중단은 작업이 협력해요.                                         |
| mutable state 보호 | serial queue, barrier, lock을 빠짐없이 사용해야 해요.              | actor와 `Sendable` 계약을 compiler가 검사할 수 있어요.                                             |
| main UI 실행       | `DispatchQueue.main.async`를 호출 지점마다 선택해요.               | 선언에 `@MainActor` 요구를 기록하고 isolation boundary에서 hop해요.                                |
| 순서               | serial queue는 제출 순서대로 block을 시작해요.                     | actor와 executor는 priority를 고려할 수 있어 FIFO를 보장하지 않아요.                               |
| thread blocking    | `sync`, semaphore와 blocking API를 사용할 수 있지만 주의해야 해요. | suspension을 전제로 한 cooperative pool에서 thread blocking은 다른 task의 진행까지 막을 수 있어요. |
| 적용 범위          | C·Objective-C·Swift에서 사용하는 Darwin system concurrency library | Swift type system, runtime, standard library가 함께 제공하는 언어 수준 모델                        |

둘 중 하나가 모든 상황에서 무조건 더 빠른 것은 아니에요. Swift Concurrency의 task는 suspension할 때 thread를 양보해 많은 비동기 작업을 적은 thread로 진행할 수 있어요. 반대로 아주 작은 동기 critical section이나 DispatchSource 같은 system primitive까지 actor로 감싸면 async 경계와 hop 비용만 늘 수 있어요.

Apple의 [Swift concurrency: Behind the scenes](https://developer.apple.com/videos/play/wwdc2021/10254/)는 cooperative thread pool이 원활히 동작하려면 task가 thread를 오래 막지 않아야 한다고 설명해요. async 코드 안에서 semaphore로 다른 async 결과를 동기적으로 기다리거나 blocking I/O를 대량 실행하면 thread starvation이 생길 수 있어요.

## Swift 6.2 이후에는 기본 isolation 설정도 확인해요

Swift 6.2는 executable target을 main actor에 기본 격리할 수 있는 선택지를 추가했어요. Xcode의 **Default Actor Isolation**을 `MainActor`로 설정하거나 Swift Package에서 다음과 같이 지정할 수 있어요.

```swift
.target(
  name: "ReadingApp",
  swiftSettings: [
    .defaultIsolation(MainActor.self),
  ]
)
```

이 설정을 사용하면 annotation이 없는 많은 선언이 암시적으로 main actor에 격리돼요. 설정하지 않으면 module 기본은 `nonisolated`예요. library target과 app target의 설정이 다를 수 있으므로 “annotation이 없으니 어느 actor에도 속하지 않는다”고 단정하지 말고 build setting을 확인해요.

같은 release에서 `@concurrent`는 caller actor를 떠나 concurrent executor에서 실행해야 하는 CPU 작업의 의도를 명시해요.

```swift
import Foundation

struct SearchIndex: Decodable, Sendable {}

@concurrent
func decodeSearchIndex(
  from data: Data
) async throws -> SearchIndex {
  try JSONDecoder().decode(SearchIndex.self, from: data)
}
```

`async`만 붙이면 자동으로 main actor를 떠난다는 오래된 설명에 의존하지 마세요. Swift 6.2의 `NonisolatedNonsendingByDefault` 기능과 default isolation 설정에 따라 annotation이 없는 async 함수의 isolation이 달라질 수 있어요. main actor를 비워야 하는 계산은 의도를 명시하고 실제 Instruments 측정으로 확인해요.

## GCD를 한 번에 지우지 말고 경계부터 옮겨요

| 기존 패턴                                   | 먼저 검토할 Swift Concurrency 표현              | 확인할 점                                                                  |
| ------------------------------------------- | ----------------------------------------------- | -------------------------------------------------------------------------- |
| completion handler                          | native async overload 또는 checked continuation | callback이 정확히 한 번 오는지, underlying cancellation이 있는지 확인해요. |
| 독립된 두 `DispatchGroup` 작업              | `async let`                                     | 두 결과가 모두 필요하고 고정 개수인지 확인해요.                            |
| 반복문에서 동적으로 group에 작업 추가       | throwing task group                             | 결과 순서, 동시 요청 상한과 오류 정책을 정해요.                            |
| mutable state를 지키는 private serial queue | actor                                           | API가 async로 바뀌는 비용과 reentrancy를 함께 설계해요.                    |
| `DispatchQueue.main.async` UI 갱신          | type 또는 method의 `@MainActor`                 | 호출 지점의 hop보다 UI state 소유 타입의 isolation을 먼저 선언해요.        |
| `asyncAfter` 지연 실행                      | `Task.sleep(for:)`                              | duration과 clock, cancellation 처리를 확인해요.                            |
| background queue의 CPU 계산                 | 명확한 nonisolated/`@concurrent` async 함수     | `Sendable` 입력·출력과 main actor를 막지 않는지 확인해요.                  |
| `DispatchSource`, low-level event source    | GCD를 유지하고 async interface로 감싸기         | system API의 lifecycle과 handler queue 의미를 보존해요.                    |

새 코드라고 GCD를 사용할 수 없는 것은 아니에요. DispatchSource, file descriptor event, 기존 library의 queue contract처럼 GCD가 직접 표현하는 system 기능은 그대로 사용할 수 있어요. 반대로 단순히 결과를 반환하는 비동기 흐름과 공유 상태 보호에는 async 함수, structured task와 actor가 더 많은 정보를 compiler에 제공해요.

## 언제 어떤 방식을 선택해야 하나요

Swift Concurrency를 먼저 검토하기 좋은 경우예요.

- 새 Swift API가 결과를 비동기로 반환하고 오류와 취소를 caller에게 전달해요.
- 여러 child 작업의 lifetime을 하나의 operation scope에 묶어야 해요.
- mutable state를 여러 task에서 공유해 actor isolation이 필요해요.
- UI 실행 요구를 `@MainActor`로 API contract에 남기고 싶어요.
- Swift 6 strict concurrency에서 `Sendable`과 isolation 검사를 활용하려고 해요.

GCD를 유지하거나 함께 사용하기 좋은 경우예요.

- DispatchSource, source handler, target queue 같은 GCD 고유 기능을 사용해요.
- C·Objective-C API가 dispatch queue를 명시적인 callback contract로 사용해요.
- 아주 작은 동기 critical section을 async API로 바꾸지 않고 보호해야 해요. 이때는 lock이나 Swift Synchronization의 `Mutex`도 비교해요.
- 검증된 legacy code를 한 번에 다시 작성하는 위험이 점진적 adapter보다 커요.

`Task.detached`나 global concurrent queue에 넣었다는 이유만으로 CPU 작업이 빨라지지는 않아요. 작업을 나눌 가치가 있는지, actor hop과 scheduling 비용보다 계산량이 큰지 측정해야 해요.

## 적용 순서를 정리해요

1. 현재 queue가 **작업 실행**, **mutable state 보호**, **main UI 이동** 중 어떤 역할을 하는지 표시해요.
2. completion 기반 API에 공식 async overload가 있는지 먼저 확인해요.
3. 없으면 가장 바깥 경계 하나만 checked continuation으로 감싸요.
4. 순차 dependency는 `await`, 고정된 독립 작업은 `async let`, 동적인 child는 task group으로 표현해요.
5. unstructured `Task`가 필요하면 handle 소유자와 취소 시점을 정해요.
6. serial queue가 보호하던 state를 actor로 옮길 때 모든 `await` 전후 invariant를 다시 검사해요.
7. UI state의 소유 타입을 `@MainActor`로 격리하고 무거운 동기 작업은 밖으로 분리해요.
8. Swift 6 strict concurrency와 target의 Default Actor Isolation 설정에서 compile해요.
9. Instruments의 Swift Concurrency template과 실제 latency를 측정한 뒤 GCD 경계를 더 옮길지 결정해요.

## 면접에서 이어질 수 있는 질문

### `async` 함수는 자동으로 background thread에서 실행되나요?

아니요. `async`는 함수가 suspension할 수 있다는 뜻이며 새 task나 background thread를 자동 생성하지 않아요. 함수는 현재 task와 isolation에서 시작할 수 있고 suspension 뒤에는 같은 thread가 아니라 자신이 속한 actor의 executor 규칙에 따라 재개돼요.

### `await`와 `DispatchQueue.sync`는 둘 다 기다리는데 무엇이 다른가요?

`DispatchQueue.sync`는 제출한 block이 끝날 때까지 호출 thread를 막아요. `await`는 async 작업을 기다리는 동안 현재 task를 suspend해 thread가 다른 job을 실행할 수 있게 해요. 단, awaited 함수가 blocking 작업을 수행하면 async 문법을 사용해도 thread는 여전히 막혀요.

### `Task {}`는 structured concurrency인가요?

아니요. `Task {}`는 actor context, priority와 task-local 값을 상속할 수 있지만 creator scope에 lifetime이 묶이지 않는 unstructured task예요. 구조화된 child가 필요하면 `async let`이나 task group을 사용하고, `Task`를 사용하면 handle과 cancellation을 직접 관리해요.

### Swift task cancellation은 즉시 함수를 종료하나요?

아니요. cancellation은 상태와 요청을 전파하는 협력적 기능이에요. 작업이 `Task.checkCancellation()`, `Task.isCancelled` 또는 cancellation을 지원하는 API를 사용해 적절한 지점에서 종료해야 해요.

### actor는 serial DispatchQueue와 같은가요?

둘 다 mutable state에 mutual exclusion을 제공할 수 있지만 같지는 않아요. actor isolation은 compiler가 접근을 검사하고 suspension 시 다른 actor 작업이 끼어들 수 있으며 실행 순서도 FIFO가 아니에요. 자세한 차이는 [Actor와 데이터 격리](./actors)에서 이어서 설명해요.

## 참고 자료

- [The Swift Programming Language — Concurrency](https://docs.swift.org/swift-book/documentation/the-swift-programming-language/concurrency/)
- [Swift Evolution SE-0296 — Async/await](https://github.com/swiftlang/swift-evolution/blob/main/proposals/0296-async-await.md)
- [Swift Evolution SE-0304 — Structured Concurrency](https://github.com/swiftlang/swift-evolution/blob/main/proposals/0304-structured-concurrency.md)
- [Swift Evolution SE-0302 — Sendable and @Sendable closures](https://github.com/swiftlang/swift-evolution/blob/main/proposals/0302-concurrent-value-and-concurrent-closures.md)
- [Swift Evolution SE-0461 — Run nonisolated async functions on the caller's actor by default](https://github.com/swiftlang/swift-evolution/blob/main/proposals/0461-async-function-isolation.md)
- [Swift Evolution SE-0466 — Control default actor isolation inference](https://github.com/swiftlang/swift-evolution/blob/main/proposals/0466-control-default-actor-isolation.md)
- [Swift.org — Swift 6.2 Released](https://www.swift.org/blog/swift-6.2-released/)
- [Apple Developer — DispatchQueue](https://developer.apple.com/documentation/dispatch/dispatchqueue)
- [Apple Developer — Task](https://developer.apple.com/documentation/swift/task)
- [Apple Developer — Concurrency](https://developer.apple.com/documentation/swift/concurrency)
- [WWDC21 — Explore structured concurrency in Swift](https://developer.apple.com/videos/play/wwdc2021/10134/)
- [WWDC21 — Swift concurrency: Behind the scenes](https://developer.apple.com/videos/play/wwdc2021/10254/)
- [WWDC22 — Visualize and optimize Swift concurrency](https://developer.apple.com/videos/play/wwdc2022/110350/)
- [iOYES — Swift Concurrency: Actor](https://green1229.tistory.com/341)
- [iOYES — Swift Concurrency: @MainActor 사용하기](https://green1229.tistory.com/343)
