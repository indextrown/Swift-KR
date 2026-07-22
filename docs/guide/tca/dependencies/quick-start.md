---
title: Quick start
description: SwiftPM에 Dependencies를 추가하고 기본 제공 의존성을 기능·테스트·Xcode Preview에서 선언하고 재정의하는 첫 사용 흐름을 설명합니다.
---

# Quick start

라이브러리의 모든 기능을 깊이 살펴보기 전에 시작에 필요한 기본을 알아봐요.

원문: [Quick start](https://swiftpackageindex.com/pointfreeco/swift-dependencies/main/documentation/dependencies/quickstart)

## Dependencies 라이브러리를 의존성으로 추가하기

SwiftPM 프로젝트에서 이 라이브러리를 사용하려면 `Package.swift`의 의존성에 추가하고, 라이브러리에 접근해야 하는 각 타깃에 `Dependencies` product를 지정하세요.

```swift
let package = Package(
  dependencies: [
    .package(
      url: "https://github.com/pointfreeco/swift-dependencies",
      from: "1.0.0"
    ),
  ],
  targets: [
    .target(
      name: "<your-target-name>",
      dependencies: [
        .product(name: "Dependencies", package: "swift-dependencies")
      ]
    )
  ]
)
```

## 첫 의존성 사용하기

라이브러리에는 직접 의존성을 등록할 수 있을 뿐 아니라 제어 가능한 의존성이 많이 기본 제공돼요. 전체 목록은 `DependencyValues`를 참고하세요. 바로 사용할 수 있는 의존성이 있을 가능성이 높아요. 기능 로직에서 `Date()`, `UUID()`, `Task.sleep`, Combine scheduler를 직접 사용하고 있다면 이미 이 라이브러리를 사용하기 시작할 수 있어요.

```swift
@Observable
final class FeatureModel {
  var items: [Item] = []

  @ObservationIgnored
  @Dependency(\.continuousClock) var clock  // Controllable way to sleep a task
  @ObservationIgnored
  @Dependency(\.date.now) var now           // Controllable way to ask for current date
  @ObservationIgnored
  @Dependency(\.mainQueue) var mainQueue    // Controllable scheduling on main queue
  @ObservationIgnored
  @Dependency(\.uuid) var uuid              // Controllable UUID creation

  // ...
}
```

의존성을 선언한 뒤에는 `Date()`, `UUID()` 등에 직접 접근하지 말고 기능 model에 정의한 의존성을 사용할 수 있어요.

```swift
@Observable
final class FeatureModel {
  // ...

  func addButtonTapped() async throws {
    try await clock.sleep(for: .seconds(1))  // 👈 Don't use 'Task.sleep'
    items.append(
      Item(
        id: uuid(),  // 👈 Don't use 'UUID()'
        name: "",
        createdAt: now  // 👈 Don't use 'Date()'
      )
    )
  }
}
```

기능에서 제어 가능한 의존성을 사용하려면 이것만 하면 돼요. 이 정도의 사전 작업만으로 라이브러리의 강력한 기능을 활용하기 시작할 수 있어요.

예를 들어 테스트에서 이런 의존성을 쉽게 제어할 수 있어요. `addButtonTapped` 메서드의 로직을 테스트하고 싶다면 `.dependencies` 테스트 trait로 단일 테스트 범위의 의존성을 재정의하세요. 1-2-3 단계면 충분해요.

```swift
import Dependencies
import DependenciesTestSupport
import Testing

@Test(
  // 1️⃣ Override any dependencies that your feature uses.
  .dependencies {
    $0.clock = .immediate
    $0.date.now = Date(timeIntervalSinceReferenceDate: 1234567890)
    $0.uuid = .incrementing
  }
)
func add() async throws {
  // 2️⃣ Construct the feature's model
  let model = FeatureModel()
  // 3️⃣ The model now executes in a controlled environment of dependencies,
  //    and so we can make assertions against its behavior.
  try await model.addButtonTapped()
  #expect(
    model.items == [
      Item(
        id: UUID(uuidString: "00000000-0000-0000-0000-000000000000")!,
        name: "",
        createdAt: Date(timeIntervalSinceReferenceDate: 1234567890)
      )
    ]
  )
}
```

여기서는 `date` 의존성이 항상 같은 날짜를 반환하게 제어했고, `uuid` 의존성은 호출할 때마다 자동 증가 UUID를 반환하게 제어했어요. [`ImmediateClock`](https://swiftpackageindex.com/pointfreeco/swift-clocks/main/documentation/clocks/immediateclock)을 사용해 `clock` 의존성의 모든 시간을 한순간으로 압축하기도 했어요. 이런 의존성을 제어하지 않으면 `Date()`와 `UUID()`의 반환값을 정확히 예측할 방법이 없고 실제 시간이 지나기를 기다려야 하므로 테스트를 작성하기 매우 어렵고 느려져요.

제어 가능한 의존성은 테스트에만 유용한 것이 아니에요. Xcode Preview에서도 사용할 수 있어요. 위 기능이 뷰에서 어떤 일이 일어나기 전 일정 시간 잠들기 위해 clock을 사용한다고 해 볼게요. 뷰가 어떻게 바뀌는지 확인하려고 실제 시간이 지나기를 기다리고 싶지 않다면 `prepareDependencies(_:)`로 clock 의존성을 “immediate” clock으로 재정의할 수 있어요.

```swift
#Preview {
  let _ = prepareDependencies { $0.continuousClock = ImmediateClock() }
  // All access of '@Dependency(\.continuousClock)' in this preview will
  // use an immediate clock.
  FeatureView(model: FeatureModel())
}
```

그러면 Preview는 실행할 때 immediate clock을 사용하지만, simulator나 기기에서 실행할 때는 계속 live `ContinuousClock`을 사용해요. 운영 환경의 앱 실행 방식에 영향을 주지 않고 Preview에서만 의존성을 재정의할 수 있어요.

여기까지가 라이브러리 사용을 시작하는 기본이에요. 하지만 할 수 있는 일은 훨씬 많아요. [What are dependencies?](./what-are-dependencies.md)와 [Using dependencies](./using-dependencies.md)에서 더 깊이 알아볼 수 있어요. 익숙해지면 [Registering dependencies](./registering-dependencies.md)와 [Live, preview, and test dependencies](./live-preview-test.md)를 활용하는 방법을 알아보세요. 마지막으로 [Designing dependencies](./designing-dependencies.md), [Overriding dependencies](./overriding-dependencies.md), [Lifetimes](./lifetimes.md), [Single entry point systems](./single-entry-point-systems.md) 같은 고급 주제도 살펴볼 수 있어요.
