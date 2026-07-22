---
title: DependencyValues
description: 전역적으로 사용할 의존성 모음의 생성·접근·재정의·escaping 전파 API와 라이브러리 기본 제공 값 및 실행 context를 설명합니다.
---

# DependencyValues

전역적으로 사용할 수 있는 의존성 모음이에요.

원문: [DependencyValues](https://swiftpackageindex.com/pointfreeco/swift-dependencies/main/documentation/dependencies/dependencyvalues)

## 개요

모음에서 특정 의존성에 접근할 때는 `Dependency` 프로퍼티 래퍼를 사용해요.

```swift
@Dependency(\.date) var date
// ...
let now = date.now
```

명확하게 정의된 범위에서 의존성을 바꾸려면 `withDependencies(_:operation:)`를 사용할 수 있어요.

```swift
@Dependency(\.date) var date
let now = date.now

withDependencies {
  $0.date.now = Date(timeIntervalSinceReferenceDate: 1234567890)
} operation: {
  @Dependency(\.date.now) var now: Date
  now.timeIntervalSinceReferenceDate  // 1234567890
}
```

의존성은 동기 또는 비동기 `operation` 범위가 유지되는 동안 바뀌어요.

> 참고: 일반적으로 변경된 의존성은 `operation` 범위에서만 유지되고 escaping closure가 의존성을 캡처하면 변경 값이 전파되지 않아요. 다만 `DependencyValues` 안의 의존성 모음은 `@TaskLocal`이기 때문에 `Task`로 `operation` closure를 빠져나오면 변경 사항이 전파되는 예외가 있어요.
>
> ```swift
> withDependencies {
>   $0.date.now = Date(timeIntervalSinceReferenceDate: 1234567890)
> } operation: {
>   @Dependency(\.date.now) var now: Date
>   now.timeIntervalSinceReferenceDate  // 1234567890
>   Task {
>     now.timeIntervalSinceReferenceDate  // 1234567890
>   }
> }
> ```
>
> 자세한 내용은 [Dependency lifetimes](./lifetimes.md)를 참고하세요.

`DependencyValues`에 의존성을 등록하려면 먼저 타입이 `DependencyKey` protocol을 준수하게 만들어 simulator와 기기에서 사용할 `DependencyKey/liveValue`를 지정하세요. Key는 private이어도 돼요.

```swift
private enum MyValueKey: DependencyKey {
  static let liveValue = 42
}
```

그런 다음 key를 사용해 `DependencyValues`를 읽고 쓰는 computed property를 추가하세요.

```swift
extension DependencyValues {
  var myValue: Int {
    get { self[MyValueKey.self] }
    set { self[MyValueKey.self] = newValue }
  }
}
```

이제 `Dependency` 프로퍼티 래퍼로 의존성에 접근할 수 있어요.

```swift
@Dependency(\.myValue) var myValue
myValue  // 42
```

자세한 등록 방법은 [Registering dependencies](./registering-dependencies.md)를 참고하세요.

## 값 생성하고 접근하기

### init()

```swift
init()
```

Dependency value instance를 만들어요. 보통 `DependencyValues` instance를 직접 만들지는 않아요. 직접 만들면 기본값에만 접근할 수 있기 때문이에요. 대신 `Dependency` 프로퍼티 래퍼를 사용할 때 라이브러리가 관리하는 instance를 사용해요.

### Custom key subscript

```swift
subscript<Key: TestDependencyKey>(
  key: Key.Type,
  fileID fileID: StaticString = #fileID,
  filePath filePath: StaticString = #filePath,
  line line: UInt = #line,
  column column: UInt = #column,
  function function: StaticString = #function
) -> Key.Value
```

사용자 정의 key와 연결된 dependency value에 접근해요. 일반적으로 사용자 정의 의존성을 등록하기 위해 `DependencyValues`에 computed property를 추가할 때 사용해요.

```swift
private struct MyDependencyKey: DependencyKey {
  static let testValue = "Default value"
}

extension DependencyValues {
  var myCustomValue: String {
    get { self[MyDependencyKey.self] }
    set { self[MyDependencyKey.self] = newValue }
  }
}
```

시스템 제공 dependency value와 같은 방식으로 `withDependencies(_:operation:)`에서 사용자 정의 값을 설정하고 `Dependency` 프로퍼티 래퍼로 읽어요.

### Type subscript

```swift
subscript<Key: TestDependencyKey>(_ type: Key.Type) -> Key.Value
```

Key type을 직접 사용해 dependency value를 읽고 쓸 수 있어요. 별도 key path를 만들지 않은 의존성은 `@Dependency(APIClient.self)`와 `$0[APIClient.self]` 형태로 접근해요.

## 값 재정의하기

### withDependencies(_:operation:)

동기 또는 비동기 operation을 실행하는 동안 현재 의존성을 갱신해요. `updateValuesForOperation` 안에서 `DependencyValues`에 적용한 변경은 operation에서 실행되는 모든 코드에 보여요. 함수는 operation이 반환한 결과를 그대로 반환해요.

```swift
withDependencies {
  $0.date.now = Date(timeIntervalSince1970: 1234567890)
} operation: {
  // References to date in here are pinned to 1234567890.
}
```

### withDependencies(from:operation:fileID:filePath:line:column:)

특정 object에 연결된 의존성을 가져온 뒤 동기 또는 비동기 operation 동안 현재 의존성을 갱신해요. 전달한 model은 `@Dependency` property를 하나 이상 갖거나 다른 `withDependencies` operation에서 초기화되어 반환된 object여야 해요.

부모 model에서 자식 model을 만들 때 부모의 의존성을 그대로 전달하려면 이 overload를 사용하세요. 일부 값을 더 재정의할 수도 있고, 변경할 값이 없다면 update closure를 생략할 수도 있어요.

```swift
let child = withDependencies(from: parent) {
  $0.apiClient = .mock
} operation: {
  ChildModel()
}
```

### prepareDependencies(_:)

애플리케이션이 살아 있는 동안 사용할 global 의존성을 준비해요. 앱의 entry point나 Xcode Preview에서 초기 의존성을 설정할 수 있고, 앱 lifecycle에서 가능한 한 일찍 호출하는 것이 좋아요.

SwiftUI entry point에서는 `App` 준수의 이니셜라이저에서 호출하는 것이 적절해요.

```swift
@main
struct MyApp: App {
  init() {
    prepareDependencies {
      $0.defaultDatabase = try! DatabaseQueue(/* ... */)
    }
  }

  // ...
}
```

App delegate entry point에서는 `didFinishLaunchingWithOptions`에서 호출할 수 있어요.

```swift
@main
class AppDelegate: UIResponder, UIApplicationDelegate {
  func application(
    _ application: UIApplication,
    didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?
  ) -> Bool {
    prepareDependencies {
      $0.defaultDatabase = try! DatabaseQueue(/* ... */)
    }
    // Override point for customization after application launch.
    return true
  }

  // ...
}
```

> 중요: 하나의 dependency key는 최대 한 번만 준비할 수 있고, 접근하기 **전에** 준비해야 해요. 이전에 재정의했거나 접근한 의존성을 준비하려고 하면 runtime 경고가 발생해요.

Xcode Preview에서도 사용할 수 있지만 result builder와 함께 올바르게 동작하도록 `let _`가 필요해요.

```swift
#Preview {
  let _ = prepareDependencies {
    $0.defaultDatabase = try! DatabaseQueue(/* ... */)
  }
  FeatureView()
}
```

> 참고: 테스트에서 `prepareDependencies(_:)`를 사용하는 것도 기술적으로 가능해요.
>
> ```swift
> @Suite struct FeatureTests {
>   init() {
>     prepareDependencies {
>       $0.defaultDatabase = try! DatabaseQueue(/* ... */)
>     }
>   }
>
>   // ...
> }
> ```
>
> 하지만 `prepareDependencies(_:)`는 테스트 반복 실행이나 parameterized test와 호환되지 않으므로 테스트에서는 사용하지 않는 편이 나을 수 있어요.

## Escaping context

### withEscapedDependencies(_:)

현재 의존성을 escaping context로 전파해요. Structured concurrency를 사용할 수 없어 escaping closure를 써야 할 때 유용해요. 의존성은 structured context나 `Task`에서처럼 escaping 경계를 자동으로 넘어가지 않아요.

```swift
withEscapedDependencies { dependencies in
  DispatchQueue.main.asyncAfter(deadline: .now() + 1) {
    dependencies.yield {
      // All code in here will use dependencies at the time of calling withEscapedDependencies.
    }
  }
}
```

일반적으로 의존성에 접근할 수 있는 **모든** escaping 코드를 이 helper로 감싸고 escaping closure에 들어가자마자 `DependencyValues.Continuation.yield(_:)`를 사용해야 해요. 그렇지 않으면 escaping 코드가 잘못된 의존성을 사용할 수 있어요. 가능하다면 Swift의 structured concurrency 도구로 코드를 structured 세계에 유지하고 escaping closure 사용을 피하는 것이 좋아요.

Escaping closure 안에서 의존성을 추가로 재정의하려면 `yield` 밖이 아니라 안에서 바꾸세요.

```swift
withEscapedDependencies { dependencies in
  DispatchQueue.main.asyncAfter(deadline: .now() + 1) {
    dependencies.yield {
      withDependencies {
        $0.apiClient = .mock
      } operation: {
        // All code in here will use dependencies at the time of calling
        // withEscapedDependencies except the API client will be mocked.
      }
    }
  }
}
```

## Dependency value

라이브러리는 다음과 같은 제어 가능한 의존성을 기본으로 제공해요.

| 값                          | 역할                                                   |
| --------------------------- | ------------------------------------------------------ |
| `assert`                    | 재정의할 수 있는 assertion을 수행해요.                 |
| `assertionFailure`          | 재정의할 수 있는 assertion failure를 보고해요.         |
| `calendar`                  | 현재 calendar에 제어 가능하게 접근해요.                |
| `context`                   | 현재 `DependencyContext`를 읽고 바꿔요.                |
| `continuousClock`           | 시간 기반 비동기에 사용할 continuous clock이에요.      |
| `date`                      | 현재 날짜와 date generator에 제어 가능하게 접근해요.   |
| `fireAndForget`             | 결과를 기다리지 않는 작업을 실행해요.                  |
| `locale`                    | 현재 locale에 제어 가능하게 접근해요.                  |
| `mainQueue`                 | Main dispatch queue의 scheduling을 제어해요.           |
| `mainRunLoop`               | Main run loop의 scheduling을 제어해요.                 |
| `notificationCenter`        | Notification center에 제어 가능하게 접근해요.          |
| `openURL`                   | URL 열기 동작을 제어해요.                              |
| `precondition`              | 재정의할 수 있는 precondition을 검사해요.              |
| `suspendingClock`           | 시스템이 suspend될 때 멈추는 clock이에요.              |
| `timeZone`                  | 현재 time zone에 제어 가능하게 접근해요.               |
| `urlSession`                | Network request에 사용할 URL session이에요.            |
| `uuid`                      | 제어 가능한 UUID를 생성해요.                           |
| `withRandomNumberGenerator` | 제어 가능한 random number generator로 작업을 실행해요. |

## 기본 context

### live

“Live” 의존성 모음이에요. Live 의존성을 다룰 때 시작점으로 유용해요. 예를 들어 기본 test 의존성 대신 애플리케이션의 live 의존성을 실행하는 테스트를 작성할 때 전체 값을 바꿀 수 있어요.

```swift
func testLiveDependencies() {
  withDependencies { $0 = .live } operation: {
    // Make assertions using live dependencies...
  }
}
```

### preview

`previewValue`를 기본으로 읽는 “Preview” 의존성 모음이에요.

### test

`testValue`를 기본으로 읽는 “Test” 의존성 모음이에요.

## Deprecations

이전 API와 migration 안내는 공식 [DependencyValues deprecations](https://swiftpackageindex.com/pointfreeco/swift-dependencies/main/documentation/dependencies/dependencyvaluesdeprecations) 문서를 참고하세요.
