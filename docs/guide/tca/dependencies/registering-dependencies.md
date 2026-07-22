---
title: Registering dependencies
description: @DependencyEntry와 DependencyKey로 사용자 정의 의존성을 등록하고 key path 및 간접 키 타입으로 접근 범위를 설계하는 방법을 설명합니다.
---

# Registering dependencies

사용자 정의 의존성을 라이브러리에 등록해 코드베이스 어디에서나 바로 사용할 수 있게 하는 방법을 알아봐요.

원문: [Registering dependencies](https://swiftpackageindex.com/pointfreeco/swift-dependencies/main/documentation/dependencies/registeringdependencies)

## 개요

라이브러리는 제어 가능한 의존성을 기본으로 많이 제공하지만, `Dependency` 프로퍼티 래퍼로 사용하기 위해 직접 만든 의존성을 등록해야 할 때도 있어요. 이를 구현하는 방법은 몇 가지가 있고, SwiftUI의 [environment에 값을 등록하는 방식](https://developer.apple.com/documentation/swiftui/environmentvalues)과 상당히 비슷해요.

## @DependencyEntry 매크로

의존성을 등록하는 가장 간단한 방법은 `@DependencyEntry` 매크로를 사용하는 것이에요. `DependencyValues` 타입을 확장하고 기본값이 있는 mutable property에 매크로를 적용하세요.

```swift
import Dependencies
import DependenciesMacros

extension DependencyValues {
  @DependencyEntry
  var apiClient: any APIClient = MockAPIClient()
}
```

그러면 `TestDependencyKey` 프로토콜을 준수하고 `MockAPIClient`를 `TestDependencyKey/testValue`로 제공하는 private 내부 타입이 생성돼요.

`DependencyKey/liveValue`를 `TestDependencyKey/testValue`와 같은 모듈에 정의해도 괜찮다면 `liveValue` 인자로 제공할 수 있어요.

```swift
import Dependencies
import DependenciesMacros

extension DependencyValues {
  @DependencyEntry(liveValue: LiveAPIClient())
  var apiClient: any APIClient = MockAPIClient()
}
```

하지만 의존성의 live 구현을 앱의 entry point에서만 정의하는 것이 적절하거나 live 구현과 의존성 interface를 분리해야 한다면 이 인자를 제공하지 않아요. 대신 [interface와 구현 분리하기](./live-preview-test.md#interface와-구현-분리하기)의 기법을 사용하세요.

## DependencyKey 직접 준수하기

`TestDependencyKey`와 `DependencyKey`를 직접 준수할 수도 있어요. 먼저 `DependencyKey` 프로토콜 준수를 만들어요. 최소한 구현해야 할 것은 `DependencyKey/liveValue`예요. simulator나 기기에서 앱을 실행할 때 사용하는 값이므로 외부 서버에 실제로 네트워크 요청을 보내는 구현이 적합해요. 일반적으로 의존성 타입이 이 프로토콜을 직접 준수하게 만드는 것이 편리해요.

```swift
extension APIClient: DependencyKey {
  static let liveValue = APIClient(/*
    Construct the "live" API client that actually makes network
    requests and communicates with the outside world.
  */)
}
```

> 팁: 의존성에 제공할 수 있는 값은 두 가지 더 있어요. `DependencyKey/testValue`를 구현하면 테스트에서 기능을 실행할 때 사용하고, `previewValue`를 구현하면 Xcode Preview에서 기능을 실행할 때 사용해요. 처음 시작할 때는 이 값을 신경 쓰지 않아도 되고 나중에 추가할 수 있어요. 자세한 내용은 [Live, preview, and test dependencies](./live-preview-test.md)를 참고하세요.

이제 코드베이스 어디에서나 API client 의존성에 바로 접근할 수 있어요.

```swift
@Observable
final class TodosModel {
  @ObservationIgnored
  @Dependency(APIClient.self) var apiClient
  // ...
}
```

Preview, simulator, 기기에서는 live 의존성을 자동으로 사용하고, 테스트에서는 mock 데이터를 반환하도록 의존성을 재정의할 수 있어요.

```swift
@MainActor
@Test
func fetchUser() async {
  let model = withDependencies {
    $0[APIClient.self].fetchTodos = { _ in Todo(id: 1, title: "Get milk") }
  } operation: {
    TodosModel()
  }

  await store.loadButtonTapped()
  #expect(
    model.todos == [Todo(id: 1, title: "Get milk")]
  )
}
```

## 고급 기법

### 의존성 key path

특정 key path에 의존성 값을 등록하는 단계를 하나 더 거칠 수 있어요. `DependencyValues`를 프로퍼티로 확장하세요.

```swift
extension DependencyValues {
  var apiClient: APIClient {
    get { self[APIClientKey.self] }
    set { self[APIClientKey.self] = newValue }
  }
}
```

그러면 SwiftUI environment value와 비슷하게 자동 완성에서 찾을 수 있는 프로퍼티로 의존성에 접근하고 재정의할 수 있어요.

```diff
-@Dependency(APIClient.self) var apiClient
+@Dependency(\.apiClient) var apiClient

 let model = withDependencies {
-  $0[APIClient.self].fetchTodos = { _ in Todo(id: 1, title: "Get milk") }
+  $0.apiClient.fetchTodos = { _ in Todo(id: 1, title: "Get milk") }
 } operation: {
   TodosModel()
 }
```

이 스타일의 또 다른 장점은 `@Dependency`의 범위를 특정 하위 프로퍼티로 좁힐 수 있다는 것이에요.

```swift
// This feature only needs to access the API client's logged-in user
@Dependency(\.apiClient.currentUser) var currentUser
```

### 간접 의존성 키 준수

소유하지 않은 타입처럼 의존성 타입이 `DependencyKey` 프로토콜을 직접 준수하게 만드는 것이 적절하지 않을 때도 있어요. 이럴 때는 `DependencyKey`를 준수하는 별도의 타입을 정의할 수 있어요.

```swift
enum UserDefaultsKey: DependencyKey {
  static let liveValue = UserDefaults.standard
}
```

그런 다음 값의 타입 대신 이 키 타입을 통해 의존성에 접근하고 재정의할 수 있어요.

```swift
@Dependency(UserDefaultsKey.self) var userDefaults

let model = withDependencies {
  let defaults = UserDefaults(suiteName: "test-defaults")
  defaults.removePersistentDomain(forName: "test-defaults")
  $0[UserDefaultsKey.self] = defaults
} operation: {
  TodosModel()
}
```

전용 key path로 dependency value를 확장하면 이 키를 private으로 만들 수도 있어요.

```diff
-enum UserDefaultsKey: DependencyKey { /* ... */ }
+private enum UserDefaultsKey: DependencyKey { /* ... */ }
+
+extension DependencyValues {
+  var userDefaults: UserDefaults {
+    get { self[UserDefaultsKey.self] }
+    set { self[UserDefaultsKey.self] = newValue }
+  }
+}
```
