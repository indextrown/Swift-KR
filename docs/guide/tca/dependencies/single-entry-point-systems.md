---
title: Single entry point systems
description: SwiftUI·TCA·서버처럼 단일 진입점을 가진 시스템에서 실행 환경을 바꾸는 원리와 일반 객체에서 의존성을 전파하는 방법을 설명합니다.
---

# Single entry point systems

“Single entry point” 시스템이 무엇인지, 이 시스템이 Dependencies 라이브러리에 가장 적합한 이유와 single entry point가 아닌 시스템에서 사용하는 방법을 알아봐요.

원문: [Single entry point systems](https://swiftpackageindex.com/pointfreeco/swift-dependencies/main/documentation/dependencies/singleentrypointsystems)

## 개요

모든 로직과 동작을 호출하는 곳이 하나라면 시스템에 “single entry point”가 있다고 말해요. 이런 시스템은 실행되는 execution context를 쉽게 바꿀 수 있어 강력해요.

## Single entry point 시스템의 예

Apple 생태계에서 가장 널리 알려진 예는 단연 SwiftUI view예요. View는 `View` protocol을 준수하고 view hierarchy를 반환하는 하나의 `body` property를 노출하는 타입이에요.

```swift
struct FeatureView: View {
  var body: some View {
    // All of the view is constructed in here...
  }
}
```

SwiftUI가 화면에 그릴 실제 view를 만드는 방법은 `body` property를 호출하는 것 하나뿐이에요. 실제로 직접 호출할 필요는 없어요. SwiftUI가 애플리케이션의 `@main` entry point나 `UIHostingController` 안에서 모든 작업을 숨겨 줘요.

[The Composable Architecture](https://github.com/pointfreeco/swift-composable-architecture)도 single entry point 시스템의 예지만 이번에는 view의 로직과 동작을 구현하는 시스템이에요. 준수할 protocol을 제공하고, 기능의 state를 변경하고 실행할 effect를 반환하는 단 하나의 요구사항인 `reduce`를 갖고 있어요.

```swift
import ComposableArchitecture

@Reducer
struct Feature {
  struct State {
    // ...
  }
  enum Action {
    // ...
  }
  var body: some Reducer<State, Action> {
    // All of the feature's logic and behavior is implemented here...
  }
}
```

다시 말해 이 기능의 로직을 실행하는 방법은 `reduce` 메서드를 호출하는 것 하나뿐이에요. 하지만 실제로 직접 호출할 필요는 없어요. Composable Architecture가 모든 것을 숨겨 주고, 대신 애플리케이션 root에서 `Store`를 생성하기만 하면 돼요.

Server framework도 single entry point 시스템의 예예요. 보통 단순한 request-to-response lifecycle을 가져요. 외부 client의 request를 framework가 받는 것으로 시작하고, framework의 도구를 사용해 request를 해석하고 client에 보낼 response를 만들어요. 이 역시 특정 request의 모든 로직이 실행되는 단 하나의 지점을 설명해요.

이처럼 “single entry point” 시스템의 예는 많지만 대다수라고 할 수는 없어요. Observable object, UIKit 전체 등 이 패러다임에 속하지 않는 예도 많아요. Single entry point 시스템을 다루고 있다면 매우 강력한 능력을 활용할 수 있어요.

## 변경된 실행 환경

Single entry point 시스템의 가장 흥미로운 특징 중 하나는 시작부터 끝까지 명확하게 정의된 범위가 있어 execution context를 쉽게 바꿀 수 있다는 것이에요.

예를 들어 SwiftUI view에는 [“environment values”](https://developer.apple.com/documentation/swiftui/environment-values)라는 강력한 기능이 있어요. 값을 view hierarchy 깊숙이 전파하고 view tree의 작은 일부에서만 재정의할 수 있어요.

다음 SwiftUI view는 header view 위에 footer view를 쌓고 header의 foreground color를 재정의해요.

```swift
struct ContentView: View {
  var body: some View {
    VStack {
      HeaderView()
        .foregroundColor(.red)
      FooterView()
    }
  }
}
```

`.red` foreground color는 깊이 중첩된 view를 포함해 `HeaderView`의 모든 view에 적용돼요. 가장 중요한 점은 이 style이 header에만 적용되고 `FooterView`에는 적용되지 않는다는 것이에요.

`foregroundColor` view modifier는 내부적으로 [environment values](https://developer.apple.com/documentation/swiftui/environment-values)에 기반해 동작해요. `ContentView` body의 타입을 출력해 보면 알 수 있어요.

```swift
print(ContentView.Body.self)
// VStack<
//   TupleView<(
//     ModifiedContent<
//       HeaderView,
//       _EnvironmentKeyWritingModifier<Optional<Color>>
//     >,
//     FooterView
//   )>
// >
```

`_EnvironmentKeyWritingModifier`가 존재한다는 것은 environment key에 값을 쓰고 있다는 뜻이에요.

이는 SwiftUI의 매우 강력한 기능이고, SwiftUI view가 single entry point 시스템을 형성하기 때문에 이해하기 쉽게 잘 동작해요. `HeaderView`의 execution environment를 변경해 foreground color를 빨간색으로 만들면서도 변경된 state가 `FooterView` 같은 view tree의 다른 부분에 영향을 주지 않게 할 수 있어요.

Composable Architecture와 기능의 의존성에서도 같은 일을 할 수 있어요. 예를 들어 어떤 기능의 로직과 동작을 “header”와 “footer” 로직으로 나누었고 header에서 사용하는 의존성을 바꾸고 싶다고 해 볼게요. SwiftUI의 [`.environment`](<https://developer.apple.com/documentation/swiftui/view/environment(_:_:)>) view modifier와 비슷하게 작동하는 reducer의 `.dependency` 메서드를 사용할 수 있어요.

```swift
@Reducer
struct Feature {
  struct State {
    // ...
  }
  enum Action {
    // ...
  }
  var body: some Reducer<State, Action> {
    Header()
      .dependency(\.fileManager, .mock)
      .dependency(\.userDefaults, .mock)

    Footer()
  }
}
```

그러면 `Header` 기능과 `Header` 내부에서 호출하는 모든 기능에서 `fileManager`와 `userDefaults` 의존성을 mock으로 재정의하지만, `Footer`를 포함한 다른 모든 기능의 의존성은 그대로 둬요.

Server 애플리케이션에도 이 패턴을 반복해서 적용할 수 있어요. Request마다, 심지어 request-to-response lifecycle 일부에서만 execution environment를 바꿀 수 있어요.

이런 작업은 매우 강력하지만 시스템을 single entry point로 표현할 수 있어야 해요. 그렇지 않으면 변경할 곳이 하나뿐이지 않기 때문에 시스템이나 하위 시스템의 execution context를 바꾸기가 훨씬 어려워져요.

## Single entry point가 아닌 시스템

이 라이브러리는 “single entry point” 시스템에 적용할 때 가장 뛰어나지만 다른 종류의 시스템에서도 사용할 수 있어요. 다만 조금 더 주의해야 해요. 특히 기능의 어느 곳에 의존성을 추가하고, 의존성을 사용하는 기능을 어떻게 생성하는지 신경 써야 해요.

Observable object로 모델링한 기능에 의존성을 추가할 때는 object의 instance property에만 `@Dependency`를 사용해야 해요.

```swift
@Observable
final class FeatureModel {
  @ObservationIgnored
  @Dependency(\.apiClient) var apiClient
  @ObservationIgnored
  @Dependency(\.date) var date
  // ...
}
```

`UIViewController` subclass도 마찬가지예요.

```swift
final class FeatureViewController: UIViewController {
  @Dependency(\.apiClient) var apiClient
  @Dependency(\.date) var date
  // ...
}
```

그런 다음 model과 controller 안에서는 어디서든 이 의존성을 자유롭게 사용할 수 있어요.

기존 model이나 controller 안에서 새 model이나 controller를 만든다면 부모 기능의 의존성을 자식에게 전파하기 위한 단계를 하나 더 거쳐야 해요.

예를 들어 SwiftUI model이 sheet를 표시하는 optional state를 보관한다면 state에 값을 채울 때 `withDependencies(from:operation:fileID:filePath:line:column:)`로 감싸야 해요.

```swift
@Observable
final class FeatureModel {
  var editModel: EditModel?

  @ObservationIgnored
  @Dependency(\.apiClient) var apiClient
  @ObservationIgnored
  @Dependency(\.date) var date

  func editButtonTapped() {
    editModel = withDependencies(from: self) {
      EditModel()
    }
  }
}
```

그러면 `FeatureModel`을 만들 때 일부 의존성을 재정의했다면 자세한 내용은 [Overriding dependencies](./overriding-dependencies.md)를 참고하세요. 그 변경 사항이 `EditModel`에도 보여요.

UIKit에도 같은 원칙이 적용돼요. 표시할 자식 view controller를 생성할 때는 `withDependencies(from:operation:fileID:filePath:line:column:)`로 감싸세요.

```swift
final class FeatureViewController: UIViewController {
  @Dependency(\.apiClient) var apiClient
  @Dependency(\.date) var date

  func editButtonTapped() {
    let controller = withDependencies(from: self) {
      EditViewController()
    }
    present(controller, animated: true, completion: nil)
  }
}
```

자식 model과 controller를 만들 때 항상 `withDependencies(from:operation:fileID:filePath:line:column:)`를 사용하면 애플리케이션 어느 계층에서든 의존성을 변경했을 때 그 아래 모든 계층에서 변경 사항을 볼 수 있다고 확신할 수 있어요. 의존성 수명의 작동 방식은 [Dependency lifetimes](./lifetimes.md)를 참고하세요.
