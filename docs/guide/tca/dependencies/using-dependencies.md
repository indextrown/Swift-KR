---
title: Using dependencies
description: 등록된 Dependencies 값을 @Dependency로 기능 모델에 주입하고, 테스트에서 clock·date·UUID를 결정적인 값으로 재정의하는 방법을 설명합니다.
---

# Using dependencies

라이브러리에 등록된 의존성을 사용하는 방법을 알아봐요.

원문: [Using dependencies](https://swiftpackageindex.com/pointfreeco/swift-dependencies/main/documentation/dependencies/usingdependencies)

## 개요

라이브러리에 의존성을 등록하고 나면 자세한 내용은 [Registering dependencies](./registering-dependencies.md)에서 설명한 것처럼 `Dependency` 프로퍼티 래퍼로 의존성에 접근할 수 있어요. 일반적으로 observable object 같은 기능 model이나 `UIViewController` subclass 같은 controller에 `@Dependency` 프로퍼티를 추가해요. 함수, 메서드, computed property 같은 다른 범위에서도 사용할 수 있지만 고려해야 할 주의사항이 있어요. 따라서 라이브러리에 충분히 익숙해질 때까지는 권장하지 않아요.

라이브러리에는 date generator, clock, random number generator, UUID generator 등 제어 가능한 방식으로 사용할 수 있는 공통 의존성이 많이 포함돼요.

예를 들어 date 이니셜라이저, 시간 기반 비동기를 위한 continuous clock, UUID 이니셜라이저에 접근해야 하는 기능이 있다고 해 볼게요. 세 의존성을 모두 기능 model에 추가할 수 있어요.

```swift
@Observable
final class TodosModel {
  @ObservationIgnored @Dependency(\.continuousClock) var clock
  @ObservationIgnored @Dependency(\.date) var date
  @ObservationIgnored @Dependency(\.uuid) var uuid

  // ...
}
```

그런 다음 기능을 테스트할 때 세 의존성을 결정적인 버전으로 쉽게 재정의할 수 있어요.

```swift
import Dependencies
import DependenciesTestSupport
import Testing

@Test(
  .dependencies {
    $0.continuousClock = .immediate
    $0.date.now = Date(timeIntervalSinceReferenceDate: 1234567890)
    $0.uuid = .incrementing
  }
)
func todos() async {
  let model = TodosModel()
  // Invoke methods on `model` and make assertions...
}
```

이제 `TodosModel` 안에서 `continuousClock`, `date`, `uuid`를 참조할 때는 모두 제어된 버전을 사용해요.
