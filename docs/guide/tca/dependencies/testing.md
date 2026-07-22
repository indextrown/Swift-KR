---
title: Testing
description: Swift Testing과 XCTest에서 의존성을 재정의하고 격리하며, app host·static link·test leakage 같은 흔한 함정을 피하는 방법을 설명합니다.
---

# Testing

의존성을 제어하는 주된 이유 중 하나는 테스트를 더 쉽게 만드는 것이에요. 라이브러리로 더 나은 테스트를 작성하기 위한 팁과 기법을 알아봐요.

원문: [Testing](https://swiftpackageindex.com/pointfreeco/swift-dependencies/main/documentation/dependencies/testing)

## 개요

[Live, preview, and test dependencies](./live-preview-test.md)에서는 의존성을 등록할 때 테스트에서 자동으로 사용할 `TestDependencyKey/testValue`를 정의하는 방법을 배웠어요. 이 문서에서는 의존성을 재정의한 테스트를 실제로 작성하는 방법과 기억해야 할 팁과 주의사항을 더 자세히 다뤄요.

- [Swift의 native Testing framework](#swift의-native-testing-framework)
- [Xcode의 XCTest framework](#xcode의-xctest-framework)
- [테스트 중 의존성 변경하기](#테스트-중-의존성-변경하기)
- [테스트 주의사항](#테스트-주의사항)
  - [테스트 host 애플리케이션](#테스트-host-애플리케이션)
  - [Test target에 Dependencies를 static link하기](#test-target에-dependencies를-static-link하기)
  - [Test case leakage](#test-case-leakage)
  - [Static @Dependency](#static-dependency)
  - [Parameterized 및 반복 @Test 실행](#parameterized-및-반복-test-실행)

## Swift의 native Testing framework

이 라이브러리는 Xcode의 XCTest framework뿐 아니라 Swift의 native Testing framework도 완전히 지원해요. process 안에서 여러 테스트를 동시에 실행해도 다른 테스트로 상태가 흘러 들어가지 않게 할 수 있어요.

테스트에서 의존성을 재정의하는 가장 직접적인 방법은 전체 테스트 함수를 `withDependencies(_:operation:)`로 감싸 테스트가 실행되는 동안 의존성을 재정의하는 것이에요.

```swift
@Test func basics() {
  withDependencies {
    $0.uuid = .incrementing
  } operation: {
    let model = FeatureModel()
    // Invoke methods on 'model' and make assertions
  }
}
```

라이브러리는 `withDependencies(_:operation:)` 때문에 생기는 중첩을 줄이는 test trait도 제공해요. test trait에 접근하려면 test target에 `DependenciesTestSupport` 라이브러리를 link해야 해요. 그러면 다음과 같이 작성할 수 있어요.

```swift
@Test(.dependency(\.uuid, .incrementing))
func basics() {
  let model = FeatureModel()
  // Invoke methods on 'model' and make assertions
}
```

> 중요: `DependenciesTestSupport`는 test target에만 link하고 app target에는 절대 link하지 마세요. 이 라이브러리를 app target에 link하면 프로젝트가 컴파일되지 않아요.

Suite trait를 사용하면 전체 `@Suite`의 의존성을 재정의할 수도 있어요.

```swift
@Suite(.dependency(\.uuid, .incrementing))
struct MySuite {
  @Test func basics() {
    let model = FeatureModel()
    // Invoke methods on 'model' and make assertions
  }
}
```

여러 의존성을 재정의해야 한다면 `.dependencies` test trait를 사용할 수 있어요.

```swift
@Suite(.dependencies {
  $0.date.now = Date(timeIntervalSince1970:12324567890)
  $0.uuid = .incrementing
})
struct MySuite {
  @Test func basics() {
    let model = FeatureModel()
    // Invoke methods on 'model' and make assertions
  }
}
```

Swift native Testing framework의 테스트는 같은 process 안에서 병렬로 실행되기 때문에 여러 테스트가 동일한 의존성에 접근할 수 있어요. 의존성이 stateful이라면 한 테스트가 변경한 값을 다른 테스트에서 볼 수 있어 문제가 돼요. 원인을 알기 어려운 테스트 실패가 생기고, 테스트 실행 순서에 따라 실패 유형이 달라질 수도 있어요.

이를 올바르게 처리하려면 모든 테스트와 suite가 내부에 중첩되는 “base suite”를 두는 것이 좋아요. 각 테스트에 새로운 의존성 집합을 제공하므로 한 테스트의 변경 사항이 다른 테스트로 흘러갈 수 없어요.

먼저 `@Suite`를 정의하고 `.dependencies` trait를 사용하세요.

```swift
@Suite(.dependencies) struct BaseSuite {}
```

이 타입의 body에는 아무것도 없어도 돼요. `.dependencies` trait가 suite의 각 테스트에 독립적으로 사용할 의존성 공간을 제공해요.

그런 다음 모든 `@Suite`와 `@Test`를 이 타입 안에 중첩하세요.

```swift
extension BaseSuite {
  @Suite struct FeatureTests {
    @Test func basics() {
      // ...
    }
  }
}
```

그러면 모든 테스트가 서로 영향을 주지 않고 같은 process에서 병렬로 실행될 수 있어요.

## Xcode의 XCTest framework

이 라이브러리는 XCTest라는 Xcode testing framework에서도 동작해요. Swift Testing framework와 마찬가지로 테스트 body를 `withDependencies(_:operation:)`로 감싸 의존성을 재정의할 수 있어요.

```swift
func testBasics() {
  withDependencies {
    $0.uuid = .incrementing
  } operation: {
    let model = FeatureModel()
    // Invoke methods on 'model' and make assertions
  }
}
```

XCTest는 trait를 지원하지 않아서 `withDependencies(_:operation:)`의 들여쓰기 없이 테스트별로 의존성을 재정의할 수는 없어요. 하지만 `invokeTest` 메서드를 구현해 전체 test case의 모든 의존성을 재정의할 수 있어요.

```swift
class FeatureTests: XCTestCase {
  override func invokeTest() {
    withDependencies {
      $0.uuid = .incrementing
    } operation: {
      super.invokeTest()
    }
  }

  func testBasics() {
    // Test has 'uuid' dependency overridden.
  }
}
```

## 테스트 중 의존성 변경하기

테스트를 시작할 때 모든 의존성을 설정한 뒤 assertion을 수행하는 것이 가장 일반적이지만, 테스트 도중 의존성을 변경해야 할 때도 있어요. 처음에는 의존성이 실패 상태였다가 나중에 성공하는 테스트 흐름을 모델링할 때 매우 유용해요. 테스트 body 안에서 `withDependencies(_:operation:)`를 다시 사용하면 돼요.

예를 들어 로그인을 시도했을 때 오류가 발생해 메시지가 표시되는 로그인 기능이 있다고 해 볼게요. 나중에 로그인이 성공하면 메시지가 사라져요. API client 의존성이 로그인에 실패하는 상태로 시작한 뒤 `withDependencies(_:operation:)`로 성공하도록 변경하면 전체 흐름을 처음부터 끝까지 테스트할 수 있어요.

```swift
@Test(.dependency(\.apiClient.login, { _, _ in throw LoginFailure() }))
func retryFlow() async {
  let model = LoginModel()
  await model.loginButtonTapped()
  #expect(model.errorMessage == "We could not log you in. Please try again")

  withDependencies {
    $0.apiClient.login = { email, password in
      LoginResponse(user: User(id: 42, name: "Blob"))
    }
  } operation: {
    await model.loginButtonTapped()
    #expect(model.errorMessage == nil)
  }
}
```

`LoginModel`을 API client가 실패하는 context에서 만들었더라도 새로운 `withDependencies` context에서 실행하면 변경된 의존성을 사용해요.

## 테스트 주의사항

### 테스트 host 애플리케이션

잘 알려지지 않은 사실이지만 application target에서 테스트를 실행하면 simulator를 부팅하고 실제 애플리케이션 entry point를 simulator에서 실행해요. 즉, 테스트가 실행되는 동안 애플리케이션 코드도 별도로 실행돼요. 자신도 모르게 네트워크 요청을 보내고, analytics를 기록하고, user defaults나 디스크에 데이터를 쓰는 등의 작업을 할 수 있어 큰 함정이 돼요.

대개는 눈에 띄지 않아서 이런 일이 일어나는지조차 모르지만 문제가 될 수 있어요. 이 라이브러리로 의존성을 제어하기 시작하면 문제가 매우 눈에 띄게 드러날 수 있어요. 일반적으로 test context에서 의존성을 재정의하지 않고 사용하면 테스트가 실패해요. 그래서 테스트 자체는 성공적으로 통과했지만 알 수 없는 이유로 test suite가 실패할 수 있어요. **app host**의 코드가 test context에서 실행되고 의존성에 접근해 테스트 실패를 일으키기 때문이에요.

이 문제는 simulator나 기기에서 애플리케이션을 실행하는 데 사용하는 target인 **application target**에서 테스트할 때만 발생해요. framework나 SwiftPM library의 테스트에서는 발생하지 않아요. 코드베이스를 모듈화해야 하는 또 하나의 좋은 이유예요.

당장 코드베이스를 모듈화할 수 없다면 빠른 해결책이 있어요. 이 라이브러리에 전이 의존성으로 포함된 [Issue Reporting](https://github.com/pointfreeco/swift-issue-reporting) 라이브러리는 현재 테스트가 실행 중인지 확인할 수 있는 프로퍼티를 제공해요. 테스트 중이라면 애플리케이션 entry point 전체를 실행하지 않을 수 있어요.

예를 들어 순수 SwiftUI entry point에서는 테스트 중 애플리케이션이 실행되지 않게 다음과 같이 작성할 수 있어요.

```swift
import IssueReporting
import SwiftUI

@main
struct MyApp: App {
  var body: some Scene {
    WindowGroup {
      if !isTesting {
        // Your real root view
      }
    }
  }
}
```

`UIApplicationDelegate` 기반 entry point에서는 다음과 같이 작성할 수 있어요.

```swift
func application(
_ application: UIApplication,
didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?
) -> Bool {
  guard !isTesting else { return true }
  // ...
}
```

그러면 실제 애플리케이션 코드가 방해하지 않는 상태에서 application target의 테스트를 실행할 수 있어요.

### Test target에 Dependencies를 static link하기

`Dependencies` 모듈을 test target에 static link하면 앱 자체에 static link된 구현과 충돌할 수 있어요. 그러면 앱과 테스트에서 서로 다른 `DependencyValues` base type을 사용할 수 있고, `withDependencies`로 한 의존성 재정의가 적용되지 않는 것처럼 보이는 테스트 실패가 발생할 수 있어요.

이럴 때 Xcode는 다음과 비슷한 경고를 여러 개 표시해요.

> Class _TtC12Dependencies[…] is implemented in both […] and […].
> One of the two will be used. Which one is undefined.

해결 방법은 test target에서 `Dependencies` static link를 제거하는 것이에요. 앱을 통해 전이적으로 접근할 수 있기 때문이에요. Xcode에서 “Build Phases”로 이동해 “Link Binary With Libraries” 섹션의 “Dependencies”를 제거하세요. SwiftPM을 사용한다면 `Package.swift`의 `testTarget` `dependencies` 배열에서 “Dependencies” 항목을 제거하세요.

### Test case leakage

단독으로 실행하면 성공하지만 suite로 함께 실행하면 실패하는 테스트가 생길 때가 있어요. escaping closure를 테스트에서 사용하면 대체 실행 흐름이 만들어져 테스트가 끝난 뒤에도 코드가 오래 실행될 수 있기 때문이에요.

이 문제는 Dependencies 라이브러리를 사용할 때뿐 아니라 어떤 테스트에서든 발생할 수 있어요. 예를 들어 다음 테스트 메서드는 각각 단독으로 실행하면 통과하지만 전체 test suite를 실행하면 실패해요.

```swift
final class SomeTest: XCTestCase {
  func testA() {
    Task {
      try await Task.sleep(for: .seconds(0.1))
      XCTFail()
    }
  }
  func testB() async throws {
    try await Task.sleep(for: .seconds(0.15))
  }
}
```

`testA`가 실행할 작업 일부를 바깥으로 내보낸 뒤 실패 없이 즉시 끝나기 때문에 이런 일이 생겨요. 이후 `testB`가 실행되는 동안 `testA`에서 빠져나온 작업이 마침내 실행돼 실패를 일으켜요.

Dependencies 라이브러리를 사용할 때도 이 문제가 생길 수 있어요. 특히 테스트에서 사용하지도 않는 의존성의 `TestDependencyKey/testValue`에 접근했다는 테스트 실패가 나타날 수 있어요. 해당 테스트를 단독으로 실행했을 때 통과한다면 다른 테스트의 코드가 실수로 이 테스트까지 흘러 들어왔을 가능성이 높아요. suite의 다른 테스트를 모두 확인해 leakage를 일으키는 escaping closure를 사용하는지 살펴봐야 해요.

### Static @Dependency

`@Dependency` 프로퍼티 래퍼를 static 변수로 사용하면 안 돼요.

```swift
class Model {
  @Dependency(\.date) static var date
  // ...
}
```

이 의존성은 일반적인 방식으로 재정의할 수 없어요. 대체로 static 의존성을 둘 이유가 없으므로 이 패턴을 피하세요.

### Parameterized 및 반복 @Test 실행

> 중요: Swift 6.1 이상, 즉 Xcode 16.3 이상을 대상으로 한다면 이 주의사항은 적용되지 않으므로 무시해도 돼요.

라이브러리는 Swift의 새로운 native Testing framework를 지원해요. 하지만 Testing framework에는 XCTest가 제공하는 기능 중 아직 빠진 것이 있으므로 추가 단계를 거쳐야 할 수 있어요.

`@Test` 매크로를 사용하는 **parameterized** 테스트를 작성한다면 매개변수마다 새로운 의존성 집합을 사용하도록 전체 값을 초기화하는 `withDependencies`로 테스트 body 전체를 감싸야 해요.

```swift
@Test(arguments: [1, 2, 3])
func feature(_ number: Int) {
  withDependencies {
    $0 = DependencyValues()
  } operation: {
    // All test code in here...
  }
}
```

그러면 의존성 state가 테스트의 각 매개변수로 흘러 들어가지 않아요.
