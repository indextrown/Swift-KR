---
title: DependencyKey
description: 사용자 정의 의존성을 DependencyValues에 등록하는 DependencyKey와 TestDependencyKey의 live·Preview·test 값 및 캐싱 규칙을 설명합니다.
---

# DependencyKey

의존성에 접근하기 위한 key예요.

원문: [DependencyKey](https://swiftpackageindex.com/pointfreeco/swift-dependencies/main/documentation/dependencies/dependencykey)

## 개요

사용자 정의 의존성으로 `DependencyValues`를 확장하려면 타입이 이 protocol을 준수해야 해요. SwiftUI에서 `EnvironmentValues`에 값을 추가할 때 사용하는 `EnvironmentKey` protocol과 비슷해요.

`DependencyKey`의 핵심 요구사항은 `liveValue`예요. simulator나 기기에서 애플리케이션을 실행할 때 사용하는 의존성의 기본값을 반환해야 해요. 기능을 테스트하는 동안 `liveValue`에 접근하면 테스트 실패가 발생해요.

사용자 값을 가져오고 저장하는 `UserClient` 의존성은 다음과 같이 추가할 수 있어요.

```swift
// The user client dependency.
struct UserClient {
  var fetchUser: (User.ID) async throws -> User
  var saveUser: (User) async throws -> Void
}
// Conform to DependencyKey to provide a live implementation of
// the interface.
extension UserClient: DependencyKey {
  static let liveValue = Self(
    fetchUser: { /* Make request to fetch user */ },
    saveUser: { /* Make request to save user */ }
  )
}
// Register the dependency within DependencyValues.
extension DependencyValues {
  var userClient: UserClient {
    get { self[UserClient.self] }
    set { self[UserClient.self] = newValue }
  }
}
```

의존성에 처음 접근하면 값을 cache하므로 다시 요청하지 않아요. `liveValue`를 `static let` 대신 computed property로 구현해도 한 번만 호출돼요.

```swift
extension UserClient: DependencyKey {
  static var liveValue: Self {
    // Only called once when dependency is first accessed.
    return Self(/* ... */)
  }
}
```

`DependencyKey`는 `TestDependencyKey`를 상속해요. Test의 기본값을 반환하는 `testValue`와 Xcode Preview에 적합한 기본값을 반환하는 `previewValue`라는 재정의 가능한 요구사항 두 개가 더 있어요. 구현하지 않으면 이 endpoint들은 `liveValue`를 반환해요.

Interface와 live 구현을 분리하려면 interface 모듈에서 `TestDependencyKey`를 준수하고 구현 모듈에서 `DependencyKey`를 준수하세요. 자세한 내용은 [Live, preview, and test dependencies](./live-preview-test.md)를 참고하세요.

## 의존성 등록하기

### Value

```swift
associatedtype Value = Self
```

Dependency key 값의 타입을 나타내는 associated type이에요. 기본값은 key 타입 자체예요.

### liveValue

```swift
static var liveValue: Value { get }
```

Simulator나 기기에서 애플리케이션을 실행할 때 기본으로 사용하는 값이에요. 테스트에서는 의존성을 mock해야 하므로 test context에서 live 의존성을 사용하면 테스트가 실패해요. 테스트에 기본 의존성을 자동으로 공급하려면 `testValue`를 구현하세요.

### testValue

```swift
static var testValue: Value { get }
```

연결된 dependency value를 XCTest에서 접근하거나 현재 `DependencyValues.context`가 `.test`일 때 자동으로 사용하는 값이에요.

```swift
withDependencies {
  $0.context = .test
} operation: {
  // Dependencies accessed here default to their "test" value
}
```

`testValue`를 직접 제공하지 않으면 기본 구현이 `previewValue`를 제공하고, Preview 값도 없다면 `liveValue`를 사용하면서 접근 시 테스트를 실패하게 해요. 테스트에서 사용할 의존성을 명시적으로 재정의하거나 모든 테스트의 기본값이 필요하다면 직접 `testValue`를 구현하세요.

### previewValue

```swift
static var previewValue: Value { get }
```

연결된 dependency value를 Xcode Preview에서 접근하거나 현재 `DependencyValues.context`가 `.preview`일 때 자동으로 사용하는 값이에요.

```swift
withDependencies {
  $0.context = .preview
} operation: {
  // Dependencies accessed here default to their "preview" value
}
```

`DependencyKey`에는 `liveValue`를 Xcode Preview에 제공하는 기본 구현이 있어요. `TestDependencyKey` 준수에서 직접 `previewValue`를 제공하면 그 구현이 우선해요. 직접 구현할 때는 반드시 `TestDependencyKey` 준수와 같은 모듈에 두세요.

## 의존성 모듈화하기

### TestDependencyKey

```swift
protocol TestDependencyKey<Value>
```

Test 의존성에 접근하기 위한 key예요. `DependencyKey`보다 한 계층 아래에 있어 dependency interface와 live 구현을 분리할 수 있게 해요.

핵심 요구사항은 테스트용 기본값을 반환하는 `testValue`예요. 선택 요구사항인 `previewValue`는 Xcode Preview에 적합한 기본값을 반환하고, 구현하지 않으면 `testValue`를 반환해요. 실제 애플리케이션의 static 기본값은 `DependencyKey`를 준수해 정의하세요.

`testValue` 구현에서 미구현 접근을 보고해야 한다면 `TestDependencyKey.shouldReportUnimplemented`를 확인할 수 있어요. 값을 설정하는 동안에도 `testValue` getter가 호출될 수 있으므로 무조건 issue를 보고하면 안 돼요.

```swift
private enum DefaultDatabaseKey: DependencyKey {
  static var testValue: any DatabaseWriter {
    if shouldReportUnimplemented {
      reportIssue("A blank, in-memory database is being used.")
    }
    return InMemoryDatabase()
  }
}
```
