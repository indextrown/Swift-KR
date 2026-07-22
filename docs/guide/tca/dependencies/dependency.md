---
title: Dependency
description: Dependency 프로퍼티 래퍼로 key path나 DependencyKey를 통해 의존성에 접근하고, 캡처된 현재 값을 읽는 API와 주의사항을 설명합니다.
---

# Dependency

의존성에 접근하는 프로퍼티 래퍼예요.

원문: [Dependency](https://swiftpackageindex.com/pointfreeco/swift-dependencies/main/documentation/dependencies/dependency)

## 개요

모든 의존성은 `DependencyValues`에 저장되고, `Dependency` 프로퍼티 래퍼를 사용해 특정 의존성에 접근해요. 일반적으로 observable object 같은 기능에 의존성을 제공할 때 사용해요.

```swift
@Observable
final class FeatureModel {
  @ObservationIgnored
  @Dependency(\.apiClient) var apiClient
  @ObservationIgnored
  @Dependency(\.continuousClock) var clock
  @ObservationIgnored
  @Dependency(\.uuid) var uuid

  // ...
}
```

[The Composable Architecture](https://github.com/pointfreeco/swift-composable-architecture)를 사용한다면 reducer에 선언할 수 있어요.

```swift
@Reducer
struct Feature {
  @Dependency(\.apiClient) var apiClient
  @Dependency(\.continuousClock) var clock
  @Dependency(\.uuid) var uuid

  // ...
}
```

Helper 함수 같은 다른 곳에서도 사용할 수 있어요.

```swift
func sharedEffect() async throws -> Action {
  @Dependency(\.apiClient) var apiClient
  @Dependency(\.continuousClock) var clock

  // ...
}
```

> 경고: 특히 Composable Architecture로 만들지 않았거나 “single point of entry” 개념을 중심으로 구성하지 않은 애플리케이션에서는 이런 방식으로 `@Dependency`를 사용할 때 주의할 점이 있어요. 자세한 내용은 [Dependency lifetimes](./lifetimes.md)와 [Single entry point systems](./single-entry-point-systems.md)를 참고하세요.

> 중요: `@Dependency`를 static property에 사용하지 마세요.
>
> ```swift
> struct User {
>   @Dependency(\.uuid) static var uuid
>   // ...
> }
> ```
>
> Swift의 static property는 lazy하게 초기화돼요. 따라서 static `@Dependency`는 처음 접근한 위치의 dependency value를 뒤늦게 캡처하고 예상하지 못한 동작을 만들 가능성이 높아요.

라이브러리가 제공하는 전체 dependency value 목록은 [DependencyValues](./dependency-values.md)를 참고하세요.

## 의존성 사용하기

### Key path로 초기화하기

```swift
init(
  _ keyPath: any KeyPath<DependencyValues, Value> & Sendable,
  fileID: StaticString = #fileID,
  filePath: StaticString = #filePath,
  line: UInt = #line,
  column: UInt = #column
)
```

지정한 key path를 읽는 dependency property를 만들어요. 이 이니셜라이저를 직접 호출하지 말고 `Dependency` 프로퍼티 래퍼를 선언하면서 반영할 dependency value의 key path를 전달하세요.

```swift
@Observable
final class FeatureModel {
  @ObservationIgnored
  @Dependency(\.date) var date

  // ...
}
```

매개변수의 의미는 다음과 같아요.

- `keyPath`: 최종 값 하나를 가리키는 key path예요.
- `fileID`, `filePath`, `line`, `column`: 의존성이 선언된 source 위치예요. 기본값을 그대로 사용하면 돼요.

### Dependency key로 초기화하기

```swift
init<Key: TestDependencyKey>(
  _ key: Key.Type,
  fileID: StaticString = #fileID,
  filePath: StaticString = #filePath,
  line: UInt = #line,
  column: UInt = #column
) where Key.Value == Value
```

의존성 object를 읽는 dependency property를 만들어요. 이 이니셜라이저도 직접 호출하지 말고 `Dependency` 프로퍼티 래퍼에 값의 dependency key를 전달하세요.

예를 들어 다음 dependency key가 있을 때,

```swift
final class Settings: DependencyKey {
  static let liveValue = Settings()

  // ...
}
```

프로퍼티 래퍼로 의존성에 접근할 수 있어요.

```swift
@Observable
final class FeatureModel {
  @ObservationIgnored
  @Dependency(Settings.self) var settings

  // ...
}
```

- `key`: 특정 최종 값에 대응하는 dependency key예요.
- `fileID`, `filePath`, `line`, `column`: 의존성이 선언된 source 위치예요. 기본값을 그대로 사용하면 돼요.

## 값 가져오기

### wrappedValue

```swift
var wrappedValue: Value { get }
```

Dependency property의 현재 값이에요. 프로퍼티 래퍼가 초기화될 때 캡처한 값과 현재 범위에서 재정의한 값을 합쳐 key path에 해당하는 값을 반환해요.
