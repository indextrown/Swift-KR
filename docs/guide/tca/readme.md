---
title: The Composable Architecture
description: The Composable Architecture의 핵심 개념부터 기본 기능 구현, 테스트, 의존성 관리, 설치와 커뮤니티까지 공식 README 전체 내용을 설명합니다.
---

# The Composable Architecture

[![](https://img.shields.io/badge/documentation-gray?logo=swift&logoColor=white)](https://swiftpackageindex.com/pointfreeco/swift-composable-architecture/main/documentation/composablearchitecture)
[![CI](https://github.com/pointfreeco/swift-composable-architecture/actions/workflows/ci.yml/badge.svg)](https://github.com/pointfreeco/swift-composable-architecture/actions/workflows/ci.yml)
[![Slack](https://img.shields.io/badge/slack-chat-informational.svg?label=Slack&logo=slack)](https://www.pointfree.co/slack-invite)
[![](https://img.shields.io/endpoint?url=https%3A%2F%2Fswiftpackageindex.com%2Fapi%2Fpackages%2Fpointfreeco%2Fswift-composable-architecture%2Fbadge%3Ftype%3Dswift-versions)](https://swiftpackageindex.com/pointfreeco/swift-composable-architecture)
[![](https://img.shields.io/endpoint?url=https%3A%2F%2Fswiftpackageindex.com%2Fapi%2Fpackages%2Fpointfreeco%2Fswift-composable-architecture%2Fbadge%3Ftype%3Dplatforms)](https://swiftpackageindex.com/pointfreeco/swift-composable-architecture)

The Composable Architecture(줄여서 TCA)는 조합, 테스트, 사용 편의성을 염두에 두고 일관되고 이해하기 쉬운 방식으로 애플리케이션을 만들기 위한 라이브러리입니다. SwiftUI, UIKit 등을 비롯해 모든 Apple 플랫폼(iOS, macOS, iPadOS, visionOS, tvOS, watchOS)에서 사용할 수 있습니다.

원문: [pointfreeco/swift-composable-architecture](https://github.com/pointfreeco/swift-composable-architecture)

- [The Composable Architecture란?](#the-composable-architecture란)
- [더 알아보기](#더-알아보기)
- [예제](#예제)
- [기본 사용법](#기본-사용법)
- [문서](#문서)
- [자주 묻는 질문](#자주-묻는-질문)
- [커뮤니티](#커뮤니티)
- [설치](#설치)
- [번역](#번역)

## The Composable Architecture란?

이 라이브러리는 목적과 복잡도가 다양한 애플리케이션을 만드는 데 사용할 수 있는 몇 가지 핵심 도구를 제공합니다. 애플리케이션을 개발하면서 매일 마주치는 수많은 문제를 해결할 수 있도록 다음과 같은 강력한 접근 방식을 제공합니다.

- **상태 관리**
  <br /> 간단한 값 타입을 사용해 애플리케이션 상태를 관리하고, 여러 화면에서 상태를 공유하여 한 화면의 변경 사항을 다른 화면에서 즉시 관찰하는 방법입니다.

- **조합**
  <br /> 큰 기능을 자체적으로 분리된 모듈로 추출할 수 있는 작은 컴포넌트로 나누고, 이들을 손쉽게 다시 결합해 하나의 기능을 만드는 방법입니다.

- **부수 효과**
  <br /> 애플리케이션의 특정 부분이 외부 세계와 소통할 때 가능한 한 테스트하기 쉽고 이해하기 쉬운 방식을 사용하는 방법입니다.

- **테스트**
  <br /> 이 아키텍처로 만든 기능을 테스트할 뿐만 아니라, 여러 부분을 조합한 기능의 통합 테스트와 부수 효과가 애플리케이션에 어떤 영향을 미치는지 파악하는 종단 간 테스트를 작성하는 방법입니다. 이를 통해 비즈니스 로직이 예상대로 실행된다는 강력한 확신을 얻을 수 있습니다.

- **사용 편의성**
  <br /> 가능한 한 적은 개념과 구성 요소로 이루어진 간단한 API를 사용해 위의 모든 작업을 수행하는 방법입니다.

## 더 알아보기

The Composable Architecture는 Swift 언어의 고급 프로그래밍 주제를 탐구하는 동영상 시리즈 [Point-Free][pointfreeco]의 여러 에피소드를 거치며 설계되었습니다. 이 시리즈는 [Brandon Williams][mbrandonw]와 [Stephen Celis][stephencelis]가 진행합니다.

모든 에피소드는 [여기][tca-episode-collection]에서 볼 수 있으며, 아키텍처를 처음부터 설명하는 전용 [다부작 둘러보기][tca-tour]도 시청할 수 있습니다.

<a href="https://www.pointfree.co/collections/tours/composable-architecture-1-0">
  <img alt="동영상 포스터 이미지" src="https://d3rccdn33rt8ze.cloudfront.net/episodes/0243.jpeg" width="600" />
</a>

## 예제

[![예제 애플리케이션 화면](https://d3rccdn33rt8ze.cloudfront.net/composable-architecture/demos.png)](https://github.com/pointfreeco/swift-composable-architecture/tree/main/Examples)

이 저장소에는 The Composable Architecture로 흔한 문제와 복잡한 문제를 해결하는 방법을 보여 주는 _수많은_ 예제가 포함되어 있습니다. 다음 항목을 포함한 모든 예제는 [Examples 디렉터리](https://github.com/pointfreeco/swift-composable-architecture/tree/main/Examples)에서 확인할 수 있습니다.

- [Case Studies](https://github.com/pointfreeco/swift-composable-architecture/tree/main/Examples/CaseStudies)
  - 시작하기
  - Effect
  - 내비게이션
  - 고차 reducer
  - 재사용 가능한 컴포넌트
- [Location manager](https://github.com/pointfreeco/composable-core-location/tree/main/Examples/LocationManager)
- [Motion manager](https://github.com/pointfreeco/composable-core-motion/tree/main/Examples/MotionManager)
- [Search](https://github.com/pointfreeco/swift-composable-architecture/tree/main/Examples/Search)
- [Speech Recognition](https://github.com/pointfreeco/swift-composable-architecture/tree/main/Examples/SpeechRecognition)
- [SyncUps app](https://github.com/pointfreeco/swift-composable-architecture/tree/main/Examples/SyncUps)
- [Tic-Tac-Toe](https://github.com/pointfreeco/swift-composable-architecture/tree/main/Examples/TicTacToe)
- [Todos](https://github.com/pointfreeco/swift-composable-architecture/tree/main/Examples/Todos)
- [Voice memos](https://github.com/pointfreeco/swift-composable-architecture/tree/main/Examples/VoiceMemos)

좀 더 완성도 높은 예제를 찾고 있나요? SwiftUI와 The Composable Architecture로 만든 iOS 단어 찾기 게임 [isowords][gh-isowords]의 소스 코드를 살펴보세요.

## 기본 사용법

> 참고: 단계별 대화형 튜토리얼은 [Meet the Composable Architecture][meet-tca]에서 확인하세요.

The Composable Architecture로 기능을 만들려면 도메인을 모델링하는 몇 가지 타입과 값을 정의합니다.

- **State**: 기능이 로직을 수행하고 UI를 렌더링하는 데 필요한 데이터를 설명하는 타입입니다.
- **Action**: 사용자 동작, 알림, 이벤트 소스 등 기능에서 발생할 수 있는 모든 동작을 나타내는 타입입니다.
- **Reducer**: 액션이 주어졌을 때 앱의 현재 상태를 다음 상태로 변경하는 방법을 설명하는 함수입니다. API 요청처럼 실행해야 할 effect가 있다면 `Effect` 값을 반환하는 일도 reducer가 담당합니다.
- **Store**: 실제로 기능을 구동하는 런타임입니다. 모든 사용자 액션을 store로 보내 reducer와 effect를 실행하며, store의 상태 변경을 관찰해 UI를 업데이트할 수 있습니다.

이렇게 구성하면 기능을 즉시 테스트할 수 있으며, 크고 복잡한 기능을 다시 결합할 수 있는 더 작은 도메인으로 나눌 수 있습니다.

기본 예제로 숫자와 함께 숫자를 증가시키고 감소시키는 `+`, `−` 버튼을 보여 주는 UI를 생각해 보겠습니다. 여기에 재미를 더하기 위해, 버튼을 누르면 API에 요청하여 해당 숫자에 관한 무작위 사실을 가져오고 뷰에 표시한다고 가정해 보겠습니다.

이 기능을 구현하려면 기능의 도메인과 동작을 담을 새 타입을 만들고 `@Reducer` 매크로를 붙입니다.

```swift
import ComposableArchitecture

@Reducer
struct Feature {
}
```

이 타입 안에는 기능의 상태를 나타내는 타입을 정의해야 합니다. 상태는 현재 숫자를 나타내는 정수와 표시할 사실을 나타내는 옵셔널 문자열로 구성됩니다.

```swift
@Reducer
struct Feature {
  @ObservableState
  struct State: Equatable {
    var count = 0
    var numberFact: String?
  }
}
```

> 참고: 라이브러리의 observation 도구를 활용하기 위해 `State`에 `@ObservableState` 매크로를 적용했습니다.

기능의 액션을 나타내는 타입도 정의해야 합니다. 감소 버튼, 증가 버튼, 사실 버튼을 누르는 것처럼 명확한 액션이 있습니다. 한편 사실 API 요청의 응답을 받았을 때 발생하는 액션처럼 조금 덜 명확한 액션도 있습니다.

```swift
@Reducer
struct Feature {
  @ObservableState
  struct State: Equatable { /* ... */ }
  enum Action {
    case decrementButtonTapped
    case incrementButtonTapped
    case numberFactButtonTapped
    case numberFactResponse(String)
  }
}
```

이어서 기능의 실제 로직과 동작을 조합하는 `body` 속성을 구현합니다. 여기서는 `Reduce` reducer를 사용하여 현재 상태를 다음 상태로 변경하는 방법과 실행해야 할 effect를 설명할 수 있습니다. effect를 실행할 필요가 없는 액션은 이를 나타내기 위해 `.none`을 반환할 수 있습니다.

```swift
@Reducer
struct Feature {
  @ObservableState
  struct State: Equatable { /* ... */ }
  enum Action { /* ... */ }

  var body: some Reducer<State, Action> {
    Reduce { state, action in
      switch action {
      case .decrementButtonTapped:
        state.count -= 1
        return .none

      case .incrementButtonTapped:
        state.count += 1
        return .none

      case .numberFactButtonTapped:
        return .run { [count = state.count] send in
          let (data, _) = try await URLSession.shared.data(
            from: URL(string: "http://number-trivia.com/\(count)/trivia")!
          )
          await send(
            .numberFactResponse(String(decoding: data, as: UTF8.self))
          )
        }

      case let .numberFactResponse(fact):
        state.numberFact = fact
        return .none
      }
    }
  }
}
```

마지막으로 기능을 표시하는 뷰를 정의합니다. 이 뷰는 `StoreOf<Feature>`를 보유하므로 모든 상태 변경을 관찰하고 다시 렌더링할 수 있습니다. 또한 모든 사용자 액션을 store로 보내 상태를 변경할 수 있습니다.

```swift
struct FeatureView: View {
  let store: StoreOf<Feature>

  var body: some View {
    Form {
      Section {
        Text("\(store.count)")
        Button("Decrement") { store.send(.decrementButtonTapped) }
        Button("Increment") { store.send(.incrementButtonTapped) }
      }

      Section {
        Button("Number fact") { store.send(.numberFactButtonTapped) }
      }

      if let fact = store.numberFact {
        Text(fact)
      }
    }
  }
}
```

이 store로 구동되는 UIKit 컨트롤러도 간단하게 만들 수 있습니다. `viewDidLoad`에서 store의 상태 변경을 관찰하고, store의 데이터로 UI 컴포넌트를 채우면 됩니다. 코드는 SwiftUI 버전보다 조금 더 길기 때문에 아래에 접어 두었습니다.

<details>
  <summary>펼쳐 보기</summary>

```swift
class FeatureViewController: UIViewController {
  let store: StoreOf<Feature>

  init(store: StoreOf<Feature>) {
    self.store = store
    super.init(nibName: nil, bundle: nil)
  }

  required init?(coder: NSCoder) {
    fatalError("init(coder:) has not been implemented")
  }

  override func viewDidLoad() {
    super.viewDidLoad()

    let countLabel = UILabel()
    let decrementButton = UIButton()
    let incrementButton = UIButton()
    let factLabel = UILabel()

    // Omitted: Add subviews and set up constraints...

    observe { [weak self] in
      guard let self
      else { return }

      countLabel.text = "\(self.store.count)"
      factLabel.text = self.store.numberFact
    }
  }

  @objc private func incrementButtonTapped() {
    self.store.send(.incrementButtonTapped)
  }
  @objc private func decrementButtonTapped() {
    self.store.send(.decrementButtonTapped)
  }
  @objc private func factButtonTapped() {
    self.store.send(.numberFactButtonTapped)
  }
}
```

</details>

앱의 진입점 등에서 이 뷰를 표시할 준비가 되면 store를 만들 수 있습니다. 애플리케이션이 시작할 초기 상태와 애플리케이션을 구동할 reducer를 지정하면 됩니다.

```swift
import ComposableArchitecture

@main
struct MyApp: App {
  var body: some Scene {
    WindowGroup {
      FeatureView(
        store: Store(initialState: Feature.State()) {
          Feature()
        }
      )
    }
  }
}
```

이것만으로 화면에 기능을 띄워 직접 사용해 볼 수 있습니다. 일반적인 SwiftUI 방식으로 구현할 때보다 단계가 몇 가지 더 필요한 것은 분명하지만, 여러 장점이 있습니다. 여러 observable 객체와 UI 컴포넌트의 각종 액션 클로저에 로직을 흩어 놓는 대신 상태 변경에 일관된 방식을 적용할 수 있습니다. 부수 효과를 간결하게 표현할 수도 있습니다. 추가 작업을 많이 하지 않고도 effect를 포함한 로직을 즉시 테스트할 수도 있습니다.

### 테스트

> 참고: 테스트에 관한 자세한 내용은 전용 [테스트][testing-article] 문서를 확인하세요.

테스트에는 `TestStore`를 사용합니다. `TestStore`는 `Store`와 동일한 정보로 만들 수 있지만, 액션을 보낼 때 기능이 어떻게 변화하는지 검증할 수 있도록 추가 작업을 수행합니다.

```swift
@Test
func basics() async {
  let store = TestStore(initialState: Feature.State()) {
    Feature()
  }
}
```

테스트 store를 만들고 나면 여러 단계로 이루어진 전체 사용자 흐름을 검증할 수 있습니다. 각 단계에서는 상태가 예상한 대로 변경되었음을 증명해야 합니다. 예를 들어 사용자가 증가 버튼과 감소 버튼을 누르는 흐름을 시뮬레이션할 수 있습니다.

```swift
// Test that tapping on the increment/decrement buttons changes the count
await store.send(.incrementButtonTapped) {
  $0.count = 1
}
await store.send(.decrementButtonTapped) {
  $0.count = 0
}
```

또한 어떤 단계에서 effect가 실행되어 store로 데이터를 다시 전달한다면, 이 동작도 검증해야 합니다. 예를 들어 사용자가 사실 버튼을 누르는 상황을 시뮬레이션하면 사실이 담긴 응답을 받을 것으로 예상할 수 있으며, 이 응답은 `numberFact` 상태를 채웁니다.

```swift
await store.send(.numberFactButtonTapped)

await store.receive(\.numberFactResponse) {
  $0.numberFact = ???
}
```

그렇다면 어떤 사실이 돌아올지 어떻게 알 수 있을까요?

현재 reducer는 실제 API 서버에 접근하는 effect를 사용하므로 그 동작을 제어할 방법이 없습니다. 이 테스트를 작성하려면 인터넷 연결 상태와 API 서버의 가용성에 의존해야 합니다.

이 의존성을 reducer에 전달하면 더 좋습니다. 그러면 기기에서 애플리케이션을 실행할 때는 실제 의존성을 사용하고, 테스트에서는 모의 의존성을 사용할 수 있습니다. `Feature` reducer에 속성을 추가하면 됩니다.

```swift
@Reducer
struct Feature {
  let numberFact: (Int) async throws -> String
  // ...
}
```

그런 다음 `reduce` 구현에서 이 속성을 사용할 수 있습니다.

```swift
case .numberFactButtonTapped:
  return .run { [count = state.count] send in
    let fact = try await self.numberFact(count)
    await send(.numberFactResponse(fact))
  }
```

애플리케이션의 진입점에서는 실제 API 서버와 통신하는 버전의 의존성을 제공할 수 있습니다.

```swift
@main
struct MyApp: App {
  var body: some Scene {
    WindowGroup {
      FeatureView(
        store: Store(initialState: Feature.State()) {
          Feature(
            numberFact: { number in
              let (data, _) = try await URLSession.shared.data(
                from: URL(string: "http://number-trivia.com/\(number)")!
              )
              return String(decoding: data, as: UTF8.self)
            }
          )
        }
      )
    }
  }
}
```

테스트에서는 예측 가능하고 결정적인 사실을 즉시 반환하는 모의 의존성을 사용할 수 있습니다.

```swift
@Test
func basics() async {
  let store = TestStore(initialState: Feature.State()) {
    Feature(numberFact: { "\($0) is a good number Brent" })
  }
}
```

이처럼 약간의 사전 작업을 해두면 사용자가 사실 버튼을 누르는 상황을 시뮬레이션하고, 의존성에서 응답을 받아 사실을 표시하는 것으로 테스트를 마칠 수 있습니다.

```swift
await store.send(.numberFactButtonTapped)

await store.receive(\.numberFactResponse) {
  $0.numberFact = "0 is a good number Brent"
}
```

애플리케이션에서 `numberFact` 의존성을 더 편리하게 사용할 수도 있습니다. 시간이 지나 애플리케이션이 여러 기능으로 확장되면 그중 일부 기능도 `numberFact`에 접근해야 할 수 있으며, 모든 계층을 거쳐 명시적으로 전달하는 일은 번거로워질 수 있습니다. 라이브러리에 의존성을 “등록”하는 절차를 따르면 애플리케이션의 어느 계층에서든 즉시 사용할 수 있습니다.

> 참고: 의존성 관리에 관한 자세한 내용은 전용 [의존성][dependencies-article] 문서를 확인하세요.

먼저 숫자 사실 기능을 새 타입으로 감쌉니다.

```swift
struct NumberFactClient {
  var fetch: (Int) async throws -> String
}
```

그런 다음 client가 `DependencyKey` 프로토콜을 준수하도록 하여 의존성 관리 시스템에 타입을 등록합니다. 이 프로토콜을 준수하려면 시뮬레이터나 기기에서 애플리케이션을 실행할 때 사용할 실제 값을 지정해야 합니다.

```swift
extension NumberFactClient: DependencyKey {
  static let liveValue = Self(
    fetch: { number in
      let (data, _) = try await URLSession.shared
        .data(from: URL(string: "http://number-trivia.com/\(number)")!
      )
      return String(decoding: data, as: UTF8.self)
    }
  )
}

extension DependencyValues {
  var numberFact: NumberFactClient {
    get { self[NumberFactClient.self] }
    set { self[NumberFactClient.self] = newValue }
  }
}
```

이 간단한 사전 작업을 마치면 어느 기능에서든 `@Dependency` 프로퍼티 래퍼를 사용해 의존성을 즉시 활용할 수 있습니다.

```diff
 @Reducer
 struct Feature {
-  let numberFact: (Int) async throws -> String
+  @Dependency(\.numberFact) var numberFact

   …

-  try await self.numberFact(count)
+  try await self.numberFact.fetch(count)
 }
```

이 코드는 이전과 똑같이 동작하지만 기능의 reducer를 만들 때 더는 의존성을 명시적으로 전달할 필요가 없습니다. 미리보기, 시뮬레이터 또는 기기에서 앱을 실행하면 실제 의존성이 reducer에 제공되고, 테스트에서는 테스트 의존성이 제공됩니다.

따라서 애플리케이션의 진입점에서 더는 의존성을 만들 필요가 없습니다.

```swift
@main
struct MyApp: App {
  var body: some Scene {
    WindowGroup {
      FeatureView(
        store: Store(initialState: Feature.State()) {
          Feature()
        }
      )
    }
  }
}
```

테스트 store도 의존성을 지정하지 않고 만들 수 있습니다. 다만 테스트 목적에 따라 필요한 의존성은 여전히 재정의할 수 있습니다.

```swift
let store = TestStore(initialState: Feature.State()) {
  Feature()
} withDependencies: {
  $0.numberFact.fetch = { "\($0) is a good number Brent" }
}

// ...
```

여기까지가 The Composable Architecture에서 기능을 만들고 테스트하는 기본 방법입니다. 조합, 모듈화, 적응성, 복잡한 effect 등 탐구할 내용이 _훨씬_ 더 많습니다. [Examples 디렉터리](https://github.com/pointfreeco/swift-composable-architecture/tree/main/Examples)에는 더 고급 사용법을 살펴볼 수 있는 여러 프로젝트가 있습니다.

## 문서

릴리스 버전과 `main` 브랜치의 문서는 다음에서 확인할 수 있습니다.

- [`main`](https://swiftpackageindex.com/pointfreeco/swift-composable-architecture/main/documentation/composablearchitecture)
- [1.x.x](https://swiftpackageindex.com/pointfreeco/swift-composable-architecture/~/documentation/composablearchitecture)

라이브러리에 익숙해지는 과정에서 다음 문서가 도움이 될 수 있습니다.

- [시작하기][getting-started-article]
- [의존성][dependencies-article]
- [테스트][testing-article]
- [내비게이션][navigation-article]
- [상태 공유][sharing-state-article]
- [성능][performance-article]
- [동시성][concurrency-article]
- [바인딩][bindings-article]

## 자주 묻는 질문

라이브러리에 관해 자주 묻는 모든 질문과 의견은 [전용 문서][faq-article]에서 확인할 수 있습니다.

## 커뮤니티

The Composable Architecture에 관해 이야기하거나 특정 문제를 해결하는 방법을 질문하고 싶다면 다른 [Point-Free](http://www.pointfree.co) 사용자와 대화할 수 있는 공간이 여러 곳 있습니다.

- 긴 형식의 토론에는 이 저장소의 [Discussions][gh-discussions] 탭을 권장합니다.
- 가벼운 대화에는 [Point-Free Community Slack](http://pointfree.co/slack-invite)을 권장합니다.

## 설치

ComposableArchitecture를 패키지 의존성으로 추가하여 Xcode 프로젝트에 설치할 수 있습니다.

1. **File** 메뉴에서 **Add Package Dependencies...**를 선택합니다.
2. 패키지 저장소 URL 입력란에 `https://github.com/pointfreeco/swift-composable-architecture`를 입력합니다.
3. 프로젝트 구조에 따라 다음과 같이 설정합니다.
   - 라이브러리를 사용하는 애플리케이션 target이 하나라면 **ComposableArchitecture**를 애플리케이션에 직접 추가합니다.
   - 여러 Xcode target에서 이 라이브러리를 사용하거나 Xcode target과 SPM target을 함께 사용하려면 **ComposableArchitecture**에 의존하는 공유 framework를 만들고, 모든 target이 이 framework에 의존하도록 해야 합니다. 기능을 여러 모듈로 분리하고 **tic-tac-toe** Swift package를 통해 이 방식으로 정적 라이브러리를 사용하는 [Tic-Tac-Toe](https://github.com/pointfreeco/swift-composable-architecture/tree/main/Examples/TicTacToe) 데모 애플리케이션을 참고하세요.

## 보조 라이브러리

The Composable Architecture는 확장성을 염두에 두고 만들어졌으며, 애플리케이션을 개선할 수 있도록 커뮤니티에서 지원하는 여러 라이브러리가 있습니다.

- [Composable Architecture Extras](https://github.com/Ryu0118/swift-composable-architecture-extras): The Composable Architecture의 보조 라이브러리입니다.
- [TCAComposer](https://github.com/mentalflux/tca-composer): The Composable Architecture의 반복 코드를 생성하는 매크로 framework입니다.
- [TCACoordinators](https://github.com/johnpatrickmorgan/TCACoordinators): The Composable Architecture에서 coordinator 패턴을 제공합니다.

라이브러리를 추가하고 싶다면 해당 링크를 담은 [PR을 열어 주세요](https://github.com/pointfreeco/swift-composable-architecture/edit/main/README.md)!

## 번역

커뮤니티 구성원이 기여한 README 번역은 다음과 같습니다.

- [아랍어](https://gist.github.com/NorhanBoghdadi/1b98d55c02b683ddef7e05c2ebcccd47)
- [프랑스어](https://gist.github.com/nikitamounier/0e93eb832cf389db12f9a69da030a2dc)
- [힌디어](https://gist.github.com/akashsoni01/b358ee0b3b747167964ef6946123c88d)
- [인도네시아어](https://gist.github.com/wendyliga/792ea9ac5cc887f59de70a9e39cc7343)
- [이탈리아어](https://gist.github.com/Bellaposa/5114e6d4d55fdb1388e8186886d48958)
- [일본어](https://gist.github.com/Achoo-kr/2d0712deb77f78b3379551ac7baea3e4)
- [한국어](https://gist.github.com/Achoo-kr/5d8936d12e71028fcc4a7c5e078ca038)
- [페르시아어](https://gist.github.com/MojtabaHs/aec8eb43a7ffe184be8d6ed629adcef4)
- [폴란드어](https://gist.github.com/MarcelStarczyk/6b6153051f46912a665c32199f0d1d54)
- [포르투갈어](https://gist.github.com/SevioCorrea/2bbf337cd084a58c89f2f7f370626dc8)
- [러시아어](https://gist.github.com/SubvertDev/3317d0c3b35ed601be330d6fc0df5aba)
- [중국어 간체](https://gist.github.com/sh3l6orrr/10c8f7c634a892a9c37214f3211242ad)
- [스페인어](https://gist.github.com/pitt500/f5e32fccb575ce112ffea2827c7bf942)
- [튀르키예어](https://gist.github.com/gokhanamal/93001244ef0c1cec58abeb1afc0de37c)
- [우크라이나어](https://gist.github.com/barabashd/33b64676195ce41f4bb73c327ea512a8)

번역을 기여하고 싶다면 [Gist](https://gist.github.com) 링크를 담은 [PR을 열어 주세요](https://github.com/pointfreeco/swift-composable-architecture/edit/main/README.md)!

## 기여와 감사

다음 분들은 라이브러리 개발 초기에 피드백을 제공하여 지금의 라이브러리가 만들어지는 데 도움을 주었습니다.

Paul Colton, Kaan Dedeoglu, Matt Diephouse, Josef Doležal, Eimantas, Matthew Johnson, George Kaimakas, Nikita Leonov, Christopher Liscio, Jeffrey Macko, Alejandro Martinez, Shai Mishali, Willis Plummer, Simon-Pierre Roy, Justin Price, Sven A. Schmidt, Kyle Sherman, Petr Šíma, Jasdev Singh, Maxim Smirnov, Ryan Stone, Daniel Hollis Tavares, 그리고 모든 [Point-Free][pointfreeco] 구독자 여러분 😁.

수많은 낯선 SwiftUI 문제를 함께 해결하고 최종 API를 다듬는 데 도움을 준 [Chris Liscio](https://twitter.com/liscio)에게 특별히 감사드립니다.

또한 `Publishers.Create` 구현을 가져올 수 있게 해 준 [Shai Mishali](https://github.com/freak4pc)와 [CombineCommunity](https://github.com/CombineCommunity/CombineExt/) 프로젝트에도 감사드립니다. 이 구현은 `Effect`에서 delegate 및 callback 기반 API를 연결하는 데 사용하며, 서드 파티 framework와 훨씬 쉽게 연동할 수 있게 합니다.

## 다른 라이브러리

The Composable Architecture는 다른 라이브러리, 특히 [Elm](https://elm-lang.org)과 [Redux](https://redux.js.org)에서 시작된 아이디어를 토대로 만들어졌습니다.

Swift 및 iOS 커뮤니티에는 다른 아키텍처 라이브러리도 많습니다. 각 라이브러리에는 The Composable Architecture와는 다른 우선순위와 trade-off가 있습니다.

- [RIBs](https://github.com/uber/RIBs)
- [Loop](https://github.com/ReactiveCocoa/Loop)
- [ReSwift](https://github.com/ReSwift/ReSwift)
- [Workflow](https://github.com/square/workflow)
- [ReactorKit](https://github.com/ReactorKit/ReactorKit)
- [RxFeedback](https://github.com/NoTests/RxFeedback.swift)
- [Mobius.swift](https://github.com/spotify/mobius.swift)
- <details>
    <summary>더 보기</summary>
  - [Fluxor](https://github.com/FluxorOrg/Fluxor)
  - [PromisedArchitectureKit](https://github.com/RPallas92/PromisedArchitectureKit)

  </details>

## 라이선스

이 라이브러리는 MIT 라이선스로 배포됩니다. 자세한 내용은 [LICENSE](https://github.com/pointfreeco/swift-composable-architecture/blob/main/LICENSE)를 확인하세요.

[pointfreeco]: https://www.pointfree.co
[mbrandonw]: https://twitter.com/mbrandonw
[stephencelis]: https://twitter.com/stephencelis
[tca-episode-collection]: https://www.pointfree.co/collections/composable-architecture
[tca-tour]: https://www.pointfree.co/collections/tours/composable-architecture-1-0
[gh-isowords]: https://github.com/pointfreeco/isowords
[gh-discussions]: https://github.com/pointfreeco/swift-composable-architecture/discussions
[swift-forum]: https://forums.swift.org/c/related-projects/swift-composable-architecture
[testing-article]: https://swiftpackageindex.com/pointfreeco/swift-composable-architecture/main/documentation/composablearchitecture/testingtca
[faq-article]: https://swiftpackageindex.com/pointfreeco/swift-composable-architecture/main/documentation/composablearchitecture/faq
[dependencies-article]: https://swiftpackageindex.com/pointfreeco/swift-composable-architecture/main/documentation/composablearchitecture/dependencymanagement
[getting-started-article]: https://swiftpackageindex.com/pointfreeco/swift-composable-architecture/main/documentation/composablearchitecture/gettingstarted
[navigation-article]: https://swiftpackageindex.com/pointfreeco/swift-composable-architecture/main/documentation/composablearchitecture/navigation
[performance-article]: https://swiftpackageindex.com/pointfreeco/swift-composable-architecture/main/documentation/composablearchitecture/performance
[concurrency-article]: https://swiftpackageindex.com/pointfreeco/swift-composable-architecture/main/documentation/composablearchitecture/swiftconcurrency
[bindings-article]: https://swiftpackageindex.com/pointfreeco/swift-composable-architecture/main/documentation/composablearchitecture/bindings
[sharing-state-article]: https://swiftpackageindex.com/pointfreeco/swift-composable-architecture/main/documentation/composablearchitecture/sharingstate
[meet-tca]: https://swiftpackageindex.com/pointfreeco/swift-composable-architecture/main/tutorials/meetcomposablearchitecture
