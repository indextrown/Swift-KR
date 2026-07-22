---
title: What are dependencies?
description: 애플리케이션 의존성이 무엇이고 제어하지 않은 시간 의존성이 Preview와 테스트를 어떻게 어렵게 만드는지 Clock 예제로 설명합니다.
---

# What are dependencies?

의존성이 무엇인지, 의존성이 코드를 어떻게 복잡하게 만드는지, 왜 의존성을 제어해야 하는지 알아봐요.

원문: [What are dependencies?](https://swiftpackageindex.com/pointfreeco/swift-dependencies/main/documentation/dependencies/whataredependencies)

## 개요

애플리케이션의 의존성은 직접 제어할 수 없는 외부 시스템과 상호작용해야 하는 타입과 함수예요. 서버에 네트워크 요청을 보내는 API client가 대표적인 예지만, 겉보기에는 별것 아닌 `UUID`와 `Date` 이니셜라이저, clock과 timer도 모두 의존성으로 볼 수 있어요.

기능이 맡은 일을 하는 데 필요한 의존성을 제어하면 기능이 실행되는 컨텍스트를 완전히 바꿀 수 있어요. 테스트와 Xcode Preview에서는 서버에 실제 네트워크 요청을 보내는 대신 준비된 데이터를 즉시 반환하는 API client mock을 제공할 수 있다는 뜻이에요.

## 제어 가능한 의존성이 필요한 이유

10초 뒤 사용자에게 메시지를 표시하는 기능을 만든다고 해 볼게요. 이 로직은 observable object로 패키징할 수 있어요.

```swift
@Observable
final class FeatureModel {
  var message: String?

  func onAppear() async {
    do {
      try await Task.sleep(for: .seconds(10))
      message = "Welcome!"
    } catch {}
  }
}
```

뷰는 이 model을 사용할 수 있어요.

```swift
struct FeatureView: View {
  let model: FeatureModel

  var body: some View {
    Form {
      if let message = model.message {
        Text(message)
      }

      // ...
    }
    .task { await model.onAppear() }
  }
}
```

처음에는 잘 동작하지만 몇 가지 문제가 있어요.

첫째, Xcode Preview에서 메시지 스타일을 반복해서 다듬고 싶다면 메시지가 나타날 때까지 실제 시간으로 10초를 온전히 기다려야 해요. Preview의 빠르고 반복적인 특성을 완전히 망가뜨려요.

둘째, 이 기능의 테스트를 작성할 때도 실제 시간으로 10초를 온전히 기다려야 해요. 테스트 모음이 느려지고, 전체 실행 시간이 오래 걸리면 앞으로 새 테스트를 추가할 가능성도 낮아져요.

이 코드가 Xcode Preview나 테스트와 잘 맞지 않는 이유는 외부 시스템인 `Task.sleep`에 대한 제어되지 않은 의존성이 있기 때문이에요. 이 API는 실제 세계의 시간만큼만 잠들 수 있어요.

## 의존성 제어하기

기능에서 “잠들기”의 여러 개념을 교체할 수 있다면 훨씬 좋아요. simulator나 기기에서는 `Task.sleep`을 사용하고, Preview나 테스트에서는 다른 잠들기 방식을 사용할 수 있어요.

이를 위한 도구가 Swift 표준 라이브러리의 `Clock` 프로토콜이에요. `Task.sleep`에 직접 접근하는 대신 `Dependency` 프로퍼티 래퍼와 `DependencyValues/continuousClock` 의존성 값을 사용해 기능 model에 clock을 보관함으로써 시간 기반 비동기 의존성을 “주입”할 수 있어요.

```swift
@Observable
final class FeatureModel {
  var message: String?

  @ObservationIgnored
  @Dependency(\.continuousClock) var clock

  func onAppear() async {
    do {
      try await clock.sleep(for: .seconds(10))
      message = "Welcome!"
    } catch {}
  }
}
```

> 참고: `@Observable`과 함께 사용할 때 `@Dependency`는 프로퍼티 래퍼이므로 `@ObservationIgnored` 매크로가 필요해요.

이 작은 변경으로 기능이 Xcode Preview와 테스트에 훨씬 친화적으로 바뀌어요.

Preview에서는 `prepareDependencies(_:)`를 사용해 `DependencyValues/continuousClock` 의존성을 실제로는 전혀 잠들지 않는 “immediate” clock으로 재정의할 수 있어요.

```swift
#Preview {
  let _ = prepareDependencies { $0.continuousClock = ImmediateClock() }
  FeatureView(model: FeatureModel())
}
```

메시지가 즉시 나타나므로 10초를 기다릴 필요가 없어요.

> 팁: [Clock을 다룬 에피소드 모음](https://www.pointfree.co/collections/concurrency/clocks)에서는 `Clock` 프로토콜을 깊이 설명하고 시간 기반 비동기를 제어하는 방법을 보여 줘요.

테스트에서도 `.dependencies` 테스트 trait를 사용해 clock 의존성을 immediate clock으로 재정의할 수 있어요.

```swift
import Dependencies
import DependenciesTestSupport
import Testing

@Test(
  .dependencies {
    $0.continuousClock = .immediate
  }
)
func message() async {
  let model = FeatureModel()
  #expect(model.message == nil)
  await model.onAppear()
  #expect(model.message == "Welcome!")
}
```

이 테스트는 항상 100% 빠르고 결정적으로 통과해요. 그래서 외부 시스템과 상호작용하는 의존성을 제어하는 것이 매우 중요해요.
