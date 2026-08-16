---
title: Swift로 이해하는 MainActor와 UI 격리
description: MainActor가 UI state를 main executor에 격리하는 원리와 선언 위치, MainActor.run, Task·DispatchQueue.main 차이와 테스트 기준을 설명합니다.
pageType: doc-wide
outline: false
---

# Swift로 이해하는 MainActor와 UI 격리

> **면접 답변 한 줄 요약:** `@MainActor`는 UI state와 관련 동작을 main actor라는 하나의 global actor에 격리해 compiler가 잘못된 concurrency domain의 접근을 막고 필요한 async 호출에서 main executor로 전환하게 하는 선언이며, 무거운 작업을 background로 보내는 annotation은 아니에요.

UIKit과 AppKit의 UI 객체는 main thread에서 다뤄야 해요. GCD에서는 callback이 어느 queue에서 오는지 확인하고 필요할 때마다 `DispatchQueue.main.async`를 호출했어요. 이 방식은 실행 시점에 main queue로 보내지만, 함수 선언만 보고 main 실행 요구를 알기 어렵고 한 호출 지점에서 빼먹어도 compiler가 전체 규칙을 검사하기 어려워요.

`@MainActor`는 “이 code와 state는 main actor에 속한다”는 요구를 type system에 기록해요. 호출자는 같은 actor에 있으면 동기적으로 사용하고, 다른 isolation에 있으면 async 경계를 통해 main actor로 전환해요.

Queue와 task의 실행 모델부터 비교하려면 [GCD와 Swift Concurrency](./gcd-vs-swift-concurrency)를, 일반 actor instance의 격리와 reentrancy를 먼저 확인하려면 [Actor와 데이터 격리](./actors)를 참고해요.

이 문서에서는 다음 내용을 설명해요.

- global actor와 MainActor의 의미
- `DispatchQueue.main.async`와 `@MainActor`의 차이
- type, method, property와 closure에 isolation을 선언하는 기준
- 같은 actor 호출과 cross-actor 호출 규칙
- `MainActor.run`, `Task { @MainActor in }`, `Task {}`의 차이
- main actor를 막는 CPU·blocking 작업을 분리하는 방법
- UIKit·SwiftUI 상태 모델과 MainActor 테스트 방법
- Swift 6.2 Default Actor Isolation의 영향

## 먼저 알아둘 MainActor 용어

| 용어                 | 쉬운 뜻                                                                                                                            |
| -------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| global actor         | 서로 다른 type과 함수에 흩어진 선언을 하나의 singleton actor isolation에 묶는 기능이에요.                                          |
| MainActor            | main dispatch queue와 동등한 executor를 사용하는 Swift 표준 global actor예요. UI code와 state를 main 실행 문맥에 묶을 때 사용해요. |
| main thread          | app event와 UI framework 작업을 처리하는 process의 특별한 thread예요.                                                              |
| main executor        | MainActor에 제출된 job을 main thread에서 실행하도록 scheduling하는 executor예요.                                                   |
| isolation annotation | `@MainActor`처럼 선언이 어느 actor에 속하는지 type system에 표시하는 attribute예요.                                                |
| actor hop            | 현재 executor와 다른 actor-isolated 함수를 실행하기 위해 target actor의 executor로 전환하는 일이에요.                              |
| inherited isolation  | type이나 enclosing context의 global actor annotation이 member나 closure에 전파되는 규칙이에요.                                     |
| `MainActor.run`      | async context에서 main actor로 전환해 synchronous closure를 실행하고 결과를 기다리는 API예요.                                      |
| default isolation    | annotation이 없는 선언을 `nonisolated` 또는 `MainActor` 중 어디에 둘지 target 단위로 정하는 Swift 6.2 이상의 compiler 설정이에요.  |

## MainActor는 여러 선언이 공유하는 singleton actor예요

일반 actor는 instance마다 독립적인 isolation domain을 만들어요.

```swift
actor ReadingStore {}

let personal = ReadingStore()
let shared = ReadingStore()
```

`personal`과 `shared`는 서로 다른 actor예요. 반면 global actor는 하나의 `shared` actor instance를 기준으로 여러 선언을 같은 isolation에 모아요. 표준 library가 제공하는 `MainActor`를 단순화하면 다음 모양이에요.

Global actor가 가지는 형태를 custom actor로 단순화하면 다음과 같아요.

```swift
@globalActor
actor ExampleGlobalActor {
  static let shared = ExampleGlobalActor()
}
```

`MainActor`도 `GlobalActor` 요구사항을 만족하는 singleton actor를 표준 library가 제공한 것이에요. 앱에서는 `shared`를 직접 생성하거나 교체하지 않고 `@MainActor` attribute로 사용해요.

```swift
@MainActor
func updateReadingProgressLabel() {
  // main actor-isolated UI 작업
}
```

Apple의 [`MainActor` 문서](https://developer.apple.com/documentation/swift/mainactor)는 MainActor의 executor가 main dispatch queue와 동등하다고 설명해요. 일반 actor가 특정 고정 thread를 뜻하지 않는 것과 달리 MainActor는 Apple platform의 main thread UI model과 연결된 특별한 global actor예요.

## `DispatchQueue.main.async`는 호출이고 `@MainActor`는 계약이에요

Legacy callback에서 UI를 갱신하는 코드를 볼게요.

```swift
func loadSummary() {
  client.loadSummary { result in
    DispatchQueue.main.async {
      self.render(result)
    }
  }
}
```

이 방식은 closure를 main queue에 비동기로 제출해요. `render`의 선언에는 main thread 요구가 보이지 않으므로 다른 호출자가 queue 이동을 빠뜨릴 수 있어요.

MainActor를 사용하면 요구를 UI state의 소유자에 선언해요.

```swift
@MainActor
final class ReadingHeaderViewModel {
  private(set) var title = ""

  func render(_ summary: ReadingSummary) {
    title = "오늘 \(summary.completedMinutes)분 읽었어요"
  }
}
```

Type 전체를 `@MainActor`로 표시하면 instance property, method와 subscript가 기본적으로 main actor-isolated돼요. 다른 isolation에서 동기적으로 접근하려 하면 Swift 6 compiler가 오류를 내고, async context에서는 `await`를 통해 actor hop해야 해요.

| 기준           | `DispatchQueue.main.async`                                        | `@MainActor`                                                                        |
| -------------- | ----------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| 표현 위치      | 각 호출 지점                                                      | type·method·property·closure 선언                                                   |
| compiler 정보  | block 제출은 알지만 대상 API의 전체 isolation 계약은 아니에요.    | declaration type에 main actor isolation이 들어가 cross-actor 접근을 검사해요.       |
| 실행 흐름      | block을 enqueue하고 caller는 즉시 반환해요.                       | async 호출자는 hop한 작업의 결과와 오류를 `await`하며 구조적으로 이어 갈 수 있어요. |
| 같은 main 문맥 | `async`를 호출하면 불필요하게 다음 queue turn으로 미룰 수 있어요. | 이미 MainActor라면 synchronous member를 바로 실행할 수 있어요.                      |
| 누락 방지      | 모든 호출자가 직접 기억해야 해요.                                 | 격리된 API를 잘못 호출하면 compiler가 진단해요.                                     |

제공된 [MainActor 참고 글](https://green1229.tistory.com/343)은 `DispatchQueue.main.async`를 호출마다 넣던 code를 `@MainActor` ViewModel로 옮기는 흐름을 보여 줘요. 현재 Swift에서는 annotation을 단순한 “자동 dispatch”로만 보기보다 state ownership과 cross-actor compile-time contract로 이해해야 해요.

## UI state의 소유 type 전체를 격리해요

화면 상태가 서로 하나의 invariant를 이룬다면 property마다 붙이기보다 type 전체를 격리하는 편이 읽기 쉬워요.

```swift
struct ReadingSummary: Sendable, Equatable {
  let completedMinutes: Int
}

enum ReadingViewState: Equatable {
  case idle
  case loading
  case loaded(ReadingSummary)
  case failed(String)
}

protocol ReadingSummaryLoading: Sendable {
  func loadSummary() async throws -> ReadingSummary
}

@MainActor
final class ReadingViewModel {
  private let loader: any ReadingSummaryLoading
  private(set) var state: ReadingViewState = .idle

  init(loader: any ReadingSummaryLoading) {
    self.loader = loader
  }

  func load() async {
    state = .loading

    do {
      let summary = try await loader.loadSummary()
      state = .loaded(summary)
    } catch is CancellationError {
      state = .idle
    } catch {
      state = .failed(error.localizedDescription)
    }
  }
}
```

`load()`는 MainActor에 isolated되어 있지만 `await loader.loadSummary()`에서 task가 suspend하므로 main thread를 점유한 채 network 응답을 기다리지 않아요. 응답 뒤에는 main actor로 돌아와 `state`를 안전하게 바꿔요.

`await` 동안에는 main actor의 다른 event가 실행될 수 있어요. 사용자가 새 load를 시작하거나 화면을 닫을 수 있으므로 일반 actor와 마찬가지로 stale response, cancellation과 reentrancy를 고려해야 해요.

### UIKit type도 MainActor annotation을 사용해요

현대 SDK의 `UIView`, `UIViewController` 같은 UIKit API는 MainActor isolation을 포함해요.

```swift
@MainActor
final class ReadingViewController: UIViewController {
  private let viewModel: ReadingViewModel

  init(viewModel: ReadingViewModel) {
    self.viewModel = viewModel
    super.init(nibName: nil, bundle: nil)
  }

  @available(*, unavailable)
  required init?(coder: NSCoder) {
    fatalError("init(coder:) has not been implemented")
  }

  private func refresh() {
    Task {
      await viewModel.load()
      render(viewModel.state)
    }
  }

  private func render(_ state: ReadingViewState) {
    // 실제 앱에서는 state에 맞게 label과 loading view를 갱신해요.
  }
}
```

`refresh()`가 이미 MainActor에 있으므로 여기서 만든 `Task {}` closure도 actor context를 상속해요. `viewModel.load()`는 같은 actor에 isolated되어 있어 runtime hop이 필요 없는 경우 compiler가 최적화할 수 있어요. `load()`가 async이므로 potential suspension을 표시하는 `await`는 여전히 사용해요.

다만 이 `Task`는 unstructured예요. View Controller가 사라질 때 취소해야 한다면 handle을 property에 저장하고 lifecycle에서 취소하거나, SwiftUI에서는 view lifecycle과 연동되는 `.task`를 검토해요.

## 필요한 범위에만 MainActor를 선언할 수도 있어요

Type 전체 state가 UI와 관련되지 않으면 특정 member만 격리할 수 있어요.

```swift
import Foundation

final class ReadingExporter: Sendable {
  func makeArchive() async throws -> URL {
    URL(fileURLWithPath: "/tmp/reading.zip")
  }

  @MainActor
  func presentShareSheet(for archiveURL: URL) {
    // UIKit 화면 표시
  }
}
```

MainActor declaration을 붙일 수 있는 대표 위치예요.

```swift
@MainActor final class ViewModel {}

@MainActor func updateUI() {}

@MainActor var selectedBookID: Int?

let completion: @MainActor (ReadingSummary) -> Void = { summary in
  // main actor-isolated closure
}
```

| 선언 위치    | 알맞은 상황                                                                              |
| ------------ | ---------------------------------------------------------------------------------------- |
| type 전체    | 대부분의 state와 method가 UI lifetime·main thread 요구를 공유해요.                       |
| extension    | 기존 type에서 UI 관련 기능 묶음만 같은 isolation에 두고 싶어요.                          |
| method       | type의 일부 operation만 UI framework를 호출해요.                                         |
| property     | 제한된 global·static state 하나가 main actor 보호를 받아야 해요.                         |
| closure type | 저장하거나 전달하는 callback 자체가 MainActor에서 호출되어야 한다는 contract가 필요해요. |

흩어진 property에 개별 annotation을 많이 붙이면 서로 다른 state가 하나의 UI invariant라는 사실이 약해져요. UI-facing ViewModel은 type 전체 격리를 먼저 검토하고, 순수 계산이나 immutable metadata만 명확한 이유가 있을 때 분리해요.

## 호출 위치에 따라 `await` 필요 여부가 달라요

MainActor-isolated synchronous function을 선언해 볼게요.

```swift
import UIKit

@MainActor
func setNavigationTitle(
  _ title: String,
  on viewController: UIViewController
) {
  viewController.navigationItem.title = title
}
```

| 호출 위치                              | 호출 형태                                          | 이유                                                                                      |
| -------------------------------------- | -------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| MainActor의 synchronous·async code     | `setNavigationTitle("독서", on: controller)`       | 이미 같은 isolation이라 synchronous access가 가능해요.                                    |
| 다른 actor 또는 nonisolated async code | `await setNavigationTitle("독서", on: controller)` | main actor로 hop할 수 있는 potential suspension이에요.                                    |
| nonisolated synchronous code           | 직접 호출 불가                                     | synchronous caller는 suspension할 수 없으므로 async context를 만들거나 API 경계를 바꿔요. |

`@MainActor`가 붙은 synchronous 함수를 legacy callback에서 호출한다고 runtime이 모든 경우에 새 task를 자동 생성하는 것은 아니에요. Swift 6 strict concurrency에서는 안전하지 않은 cross-actor 동기 호출을 compile time에 막아요. Objective-C callback과 `@preconcurrency` API처럼 isolation 정보가 약한 경계에서는 dynamic check나 adapter가 필요할 수 있어요.

callback의 threading contract가 명확하지 않다면 async adapter를 만들고 isolation 안으로 들어와요.

```swift
struct LegacyEvent: Sendable {
  let title: String
}

@MainActor
func apply(_ event: LegacyEvent) {
  // UI state를 event에 맞게 갱신해요.
}

func receiveLegacyEvent(_ event: LegacyEvent) {
  Task { @MainActor in
    apply(event)
  }
}
```

이 방식은 새 unstructured task를 만드는 선택이에요. 결과를 기다려야 하는 API라면 fire-and-forget task보다 caller를 async로 바꾸고 `await`로 관계를 보존하는 편이 좋아요.

## `MainActor.run`은 현재 async 흐름 안에서 결과를 기다려요

Nonisolated async 함수 일부에서만 UI state를 갱신해야 할 때 `MainActor.run`을 사용할 수 있어요.

```swift
func importBooks(
  from url: URL,
  viewModel: ReadingViewModel
) async throws {
  let books = try await decodeBooks(from: url)

  await MainActor.run {
    viewModel.showImportedBooks(books)
  }
}
```

`MainActor.run`은 MainActor-isolated synchronous closure를 실행하고 closure 결과가 끝날 때까지 현재 task가 기다려요. 오류를 던지는 closure도 사용할 수 있어요.

`Task { @MainActor in }`와 비교해 볼게요.

```swift
await MainActor.run {
  viewModel.showLoading(false)
}

let task = Task { @MainActor in
  viewModel.showLoading(false)
}

await task.value
```

| 방식                         | 구조와 lifetime                                                              | 사용 기준                                                                            |
| ---------------------------- | ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| `await MainActor.run {}`     | 현재 task가 main actor closure 완료를 기다려요.                              | 기존 async operation의 한 구간을 main actor에서 실행하고 바로 다음 흐름을 이어 가요. |
| `Task { @MainActor in }`     | 별도 unstructured task를 만들고 handle을 반환해요.                           | 독립 lifetime이 실제로 필요하고 handle의 결과·오류·취소를 소유할 곳이 있어요.        |
| MainActor type의 method 호출 | isolation 요구가 API 선언에 남고 caller가 `await`해요.                       | UI state owner의 장기적인 contract를 표현할 때 가장 먼저 선택해요.                   |
| `DispatchQueue.main.async`   | main queue에 block을 제출하고 즉시 반환하며 Swift task 관계는 만들지 않아요. | GCD·Objective-C callback interop처럼 queue API 자체가 경계일 때 사용해요.            |

Swift 6 Concurrency Migration Guide는 `MainActor.run`을 migration 도구로 사용할 수 있지만 system의 isolation 요구를 정적으로 표현하는 대신 남용하지 말라고 안내해요. 반복해서 `MainActor.run`으로 같은 object를 감싼다면 그 object나 method가 `@MainActor`여야 하는지 먼저 검토해요.

## MainActor는 순서 보장용 fire-and-forget queue가 아니에요

다음 코드는 세 개의 독립 task를 만들어요.

```swift
@MainActor
final class FireAndForgetState {
  private(set) var state: ReadingViewState = .idle

  func update(with summary: ReadingSummary) {
    Task { @MainActor in self.state = .loading }
    Task { @MainActor in self.state = .loaded(summary) }
    Task { @MainActor in self.logCompletion() }
  }

  private func logCompletion() {
    // analytics event를 기록해요.
  }
}
```

Actor executor는 submission FIFO를 보장하지 않고 task priority도 고려할 수 있어요. 더 중요한 문제는 creator가 어느 task의 완료나 오류도 기다리지 않는다는 점이에요.

관련 state transition은 하나의 MainActor-isolated async function에 모아요.

```swift
@MainActor
final class StructuredReadingState {
  private let loader: any ReadingSummaryLoading
  private(set) var state: ReadingViewState = .idle

  init(loader: any ReadingSummaryLoading) {
    self.loader = loader
  }

  func load() async {
    state = .loading

    do {
      let summary = try await loader.loadSummary()
      state = .loaded(summary)
      logCompletion()
    } catch {
      state = .failed(error.localizedDescription)
    }
  }

  private func logCompletion() {
    // analytics event를 기록해요.
  }
}
```

`await` 동안 다른 main actor job이 들어올 수 있으므로 request ID나 task cancellation이 필요할 수 있지만, 적어도 한 operation의 lifetime과 오류 흐름이 함수에 보존돼요.

## MainActor에서 network를 기다리는 것과 CPU를 점유하는 것은 달라요

MainActor-isolated 함수 안에서 `URLSession` async API를 호출하는 것은 일반적으로 응답을 기다리는 동안 task를 suspend해 main thread를 양보해요.

```swift
@MainActor
final class CoverViewModel {
  private let coverURL: URL
  private(set) var image: UIImage?

  init(coverURL: URL) {
    self.coverURL = coverURL
  }

  func loadCover() async throws {
    let (data, _) = try await URLSession.shared.data(from: coverURL)
    image = UIImage(data: data)
  }
}
```

하지만 응답 뒤의 image decoding이나 큰 JSON decoding이 동기적으로 오래 걸리면 MainActor가 그 계산을 실행하는 동안 UI event를 처리하지 못해요. `async` 함수 안에 있다는 이유만으로 synchronous CPU 작업이 background로 이동하지 않아요.

```swift
struct Library: Codable, Sendable {}

protocol LibraryClient: Sendable {
  func fetchLibraryData() async throws -> Data
}

@concurrent
func decodeLibrary(from data: Data) async throws -> Library {
  try JSONDecoder().decode(Library.self, from: data)
}

@MainActor
final class LibraryViewModel {
  private let client: any LibraryClient
  private(set) var library: Library?

  init(client: any LibraryClient) {
    self.client = client
  }

  func refreshLibrary() async throws {
    let data = try await client.fetchLibraryData()
    library = try await decodeLibrary(from: data)
  }
}
```

Swift 6.2 이상에서는 `@concurrent`로 caller actor를 떠나 concurrent executor에서 실행할 계산을 명시할 수 있어요. 입력과 결과는 isolation boundary를 안전하게 넘도록 `Sendable`이어야 해요.

분리 기준은 다음과 같아요.

- network·file async wait는 native async API가 thread를 block하지 않는지 확인해요.
- image decoding, parsing, compression처럼 측정상 긴 synchronous 계산은 MainActor 밖으로 분리해요.
- 계산 결과만 immutable `Sendable` value로 MainActor에 가져와 UI state에 적용해요.
- 너무 작은 계산을 무조건 분리하면 executor hop과 scheduling overhead만 늘 수 있으므로 Instruments로 측정해요.

## `nonisolated`로 UI와 무관한 member를 분리해요

MainActor type의 모든 member가 UI state를 필요로 하는 것은 아닐 수 있어요.

```swift
@MainActor
final class ReadingViewModel {
  nonisolated let analyticsScreenName = "reading"
  private(set) var state: ReadingViewState = .idle

  nonisolated static func normalizedQuery(
    _ query: String
  ) -> String {
    query.trimmingCharacters(in: .whitespacesAndNewlines)
      .lowercased()
  }
}
```

`nonisolated` member는 MainActor state에 접근할 수 없고 어느 isolation에서도 동기적으로 호출할 수 있어요. 단지 performance를 위해 instance method에 붙인 뒤 mutable UI state를 우회하려고 하면 compiler가 막아요.

큰 계산을 `nonisolated`로 바꾸는 것만으로 항상 concurrent thread pool에서 실행된다고 가정하지 마세요. Swift 6.2의 isolation behavior와 `@concurrent`를 구분하고 target build setting을 확인해요.

## Swift 6.2 Default Actor Isolation은 선택 설정이에요

Swift 6.2부터 target의 기본 actor isolation을 MainActor로 선택할 수 있어요. 이 mode에서는 annotation이 없는 많은 app 선언이 암시적으로 `@MainActor`가 돼요.

Swift Package라면 target에 설정할 수 있어요.

```swift
.target(
  name: "ReadingApp",
  swiftSettings: [
    .defaultIsolation(MainActor.self),
  ]
)
```

이 설정은 UI 중심 app target의 single-threaded 기본값을 단순하게 만들 수 있어요. 그러나 모든 Swift module이 자동으로 MainActor mode인 것은 아니에요.

- 설정이 없으면 module 기본 isolation은 `nonisolated`예요.
- dependency module의 default isolation은 현재 app target 설정으로 바뀌지 않아요.
- actor type 내부처럼 별도의 isolation 규칙이 있는 선언에는 MainActor 기본값이 그대로 적용되지 않는 경우가 있어요.
- library public API는 명시적인 annotation이 client에게 더 분명한 contract가 될 수 있어요.
- CPU 작업을 concurrent하게 실행하려면 `@concurrent` 같은 명시적 선택이 필요할 수 있어요.

문서와 code review에서는 project의 설정을 모른 채 annotation이 생략된 code의 isolation을 단정하지 말고 Xcode build setting이나 Package.swift를 함께 확인해요.

## 테스트도 MainActor isolation 안에서 실행해요

MainActor ViewModel의 state를 동기적으로 읽고 검증하려면 test function을 MainActor에 격리할 수 있어요.

```swift
import Testing

private struct StubSummaryLoader: ReadingSummaryLoading {
  let summary: ReadingSummary

  func loadSummary() async throws -> ReadingSummary {
    summary
  }
}

@Test
@MainActor
func loadsSummaryIntoViewState() async {
  let summary = ReadingSummary(completedMinutes: 30)
  let viewModel = ReadingViewModel(
    loader: StubSummaryLoader(summary: summary)
  )

  await viewModel.load()

  #expect(viewModel.state == .loaded(summary))
}
```

`@MainActor` test는 ViewModel initializer와 property를 같은 isolation에서 사용하게 해요. 테스트를 통과시키려고 모든 test suite를 MainActor에 두면 병렬 실행 기회를 줄이고 production isolation 설계 오류를 감출 수 있어요. 실제로 UI-facing API를 검증하는 test만 격리해요.

Nonisolated caller가 actor hop을 제대로 요구하는지 확인하고 싶다면 test 자체는 nonisolated로 두고 async helper를 통해 `await`해도 돼요.

```swift
@Test
func readsStateAcrossMainActorBoundary() async {
  let state = await makeLoadedStateForTesting()
  #expect(state == .loaded(.init(completedMinutes: 30)))
}

@MainActor
private func makeLoadedStateForTesting() async -> ReadingViewState {
  let summary = ReadingSummary(completedMinutes: 30)
  let viewModel = ReadingViewModel(
    loader: StubSummaryLoader(summary: summary)
  )

  await viewModel.load()
  return viewModel.state
}
```

UI thread를 확인하는 `Thread.isMainThread` assertion만 반복하기보다 compiler isolation, 최종 state, cancellation과 stale response 처리 결과를 검증해요.

## MainActor를 선택할 범위를 정해요

MainActor가 잘 맞는 경우예요.

- UIKit·AppKit object를 읽거나 변경해요.
- SwiftUI에 표시되는 mutable presentation state를 하나의 owner가 관리해요.
- UI 관련 protocol이나 callback이 main actor에서 호출되어야 해요.
- global·static UI state를 하나의 isolation domain으로 보호해야 해요.
- 선언만 보고도 main execution 요구를 알 수 있어야 해요.

다른 isolation이 더 알맞은 경우예요.

- cache, database state처럼 UI와 무관한 shared mutable state는 일반 actor를 검토해요.
- immutable `Sendable` value transformation은 MainActor에 둘 이유가 없어요.
- CPU-intensive parsing, image processing과 compression은 concurrent function이나 별도 worker로 분리해요.
- 짧은 synchronous critical section은 `Mutex`나 lock이 API 요구에 더 자연스러울 수 있어요.
- queue 자체가 외부 system API의 contract인 DispatchSource handler는 GCD interop을 유지해요.

MainActor는 “data race warning을 없애는 곳”이 아니에요. UI state ownership과 main thread 요구가 없는 domain model까지 올리면 모든 caller가 main actor로 몰리고 UI responsiveness가 나빠질 수 있어요.

## 적용 순서를 정리해요

1. UIKit·AppKit 접근과 화면에 표시되는 mutable state의 owner를 찾아요.
2. 같은 UI invariant를 이루는 state와 method는 type 전체 `@MainActor`를 먼저 검토해요.
3. 외부 async dependency의 입력과 결과를 `Sendable` value로 설계해요.
4. 반복되는 `DispatchQueue.main.async` 호출을 지우기 전에 target API에 MainActor contract를 선언해요.
5. nonisolated async caller에서는 MainActor method를 `await`해 structured flow를 유지해요.
6. 일부 구간 migration에만 `MainActor.run`을 사용하고 반복되면 type isolation으로 올려요.
7. `Task { @MainActor in }`를 사용하면 handle, 오류, cancellation과 lifetime owner를 정해요.
8. MainActor method의 synchronous CPU·blocking 구간을 Instruments로 찾고 sendable snapshot을 사용해 밖으로 분리해요.
9. Xcode의 Default Actor Isolation과 Swift language mode를 확인하고 strict concurrency에서 compile해요.
10. MainActor test와 nonisolated boundary test를 나눠 state transition, cancellation과 stale result를 검증해요.

## 면접에서 이어질 수 있는 질문

### `@MainActor`는 항상 새 작업을 main queue에 dispatch하나요?

아니요. 이미 MainActor에서 실행 중이면 같은 isolation의 synchronous member를 바로 호출할 수 있고 불필요한 hop을 피할 수 있어요. 다른 isolation의 async caller가 접근할 때는 main actor로 전환하며, 안전하지 않은 synchronous cross-actor 호출은 Swift 6 compiler가 막아요.

### MainActor와 main thread는 같은 개념인가요?

Main thread는 운영체제 thread이고 MainActor는 Swift의 global actor isolation이에요. Apple platform에서 MainActor executor는 main dispatch queue와 연결되어 job을 main thread에서 실행하지만, API 설계에서는 thread를 직접 추적하기보다 `@MainActor` isolation contract를 사용해요.

### MainActor 함수에서 network 요청을 하면 UI가 멈추나요?

Native async network API가 응답을 기다리는 동안 task를 suspend하므로 그 기다림 자체는 main thread를 막지 않아요. 하지만 응답 뒤 큰 JSON decoding이나 image processing을 synchronous하게 실행하면 MainActor를 점유하므로 무거운 계산은 밖으로 분리해야 해요.

### `MainActor.run`과 `Task { @MainActor in }`은 무엇이 다른가요?

`MainActor.run`은 현재 task가 main actor closure의 완료를 기다려 기존 control flow를 유지해요. `Task { @MainActor in }`은 별도 unstructured task를 만들기 때문에 독립 lifetime이 필요하고 handle의 결과·취소를 관리할 때 사용해요.

### ViewModel에는 항상 `@MainActor`를 붙여야 하나요?

아니요. ViewModel이 UI presentation state를 소유하고 framework와 상호작용한다면 좋은 기본 선택이지만, 순수 계산이나 UI와 무관한 repository state까지 main actor에 둘 필요는 없어요. type의 state owner와 실행 요구를 기준으로 결정해요.

## 참고 자료

- [The Swift Programming Language — Concurrency: Global Actors](https://docs.swift.org/swift-book/documentation/the-swift-programming-language/concurrency/#Global-Actors)
- [Apple Developer — MainActor](https://developer.apple.com/documentation/swift/mainactor)
- [Apple Developer — MainActor.run](<https://developer.apple.com/documentation/swift/mainactor/run(resulttype:body:)>)
- [Swift Evolution SE-0316 — Global Actors](https://github.com/swiftlang/swift-evolution/blob/main/proposals/0316-global-actors.md)
- [Swift Evolution SE-0313 — Improved control over actor isolation](https://github.com/swiftlang/swift-evolution/blob/main/proposals/0313-actor-isolation-control.md)
- [Swift Evolution SE-0461 — Run nonisolated async functions on the caller's actor by default](https://github.com/swiftlang/swift-evolution/blob/main/proposals/0461-async-function-isolation.md)
- [Swift Evolution SE-0466 — Control default actor isolation inference](https://github.com/swiftlang/swift-evolution/blob/main/proposals/0466-control-default-actor-isolation.md)
- [Swift.org — Swift 6.2 Released](https://www.swift.org/blog/swift-6.2-released/)
- [WWDC21 — Protect mutable state with Swift actors](https://developer.apple.com/videos/play/wwdc2021/10133/)
- [WWDC22 — Eliminate data races using Swift Concurrency](https://developer.apple.com/videos/play/wwdc2022/110351/)
- [WWDC25 — Embracing Swift concurrency](https://developer.apple.com/videos/play/wwdc2025/268/)
- [Swift 6 Concurrency Migration Guide — Incremental Adoption](https://www.swift.org/migration/documentation/swift-6-concurrency-migration-guide/incrementaladoption/)
- [iOYES — Swift Concurrency: @MainActor 사용하기](https://green1229.tistory.com/343)
