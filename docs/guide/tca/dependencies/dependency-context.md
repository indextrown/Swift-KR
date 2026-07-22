---
title: DependencyContext
description: DependencyValues가 기본 의존성 구현을 선택할 때 사용하는 live·Preview·test 실행 context와 명시적 재정의 방법을 설명합니다.
---

# DependencyContext

`DependencyValues` 모음의 실행 context예요.

원문: [DependencyContext](https://swiftpackageindex.com/pointfreeco/swift-dependencies/main/documentation/dependencies/dependencycontext)

## 개요

의존성을 불러오고 등록하는 context는 세 가지로 구분돼요.

- `live`: 기본 context예요.
- `preview`: Xcode Preview를 위한 context예요.
- `test`: 테스트를 위한 context예요.

현재 `DependencyContext`는 runtime에서 의존성을 불러오는 방식을 정해요. `withDependencies(_:operation:)`로 명시적으로 재정의해 operation이 실행되는 동안 기본 구현을 선택하는 방식을 제어할 수도 있어요.

```swift
withDependencies {
  $0.context = .preview
} operation: {
  // Dependencies accessed here default to their "preview" value
}
```

## Dependency context

### live

```swift
case live
```

의존성의 기본 “live” context예요. Preview나 test context를 감지하지 못하면 이 context를 사용해요. Live context에서 접근한 의존성은 `DependencyKey/liveValue`에 기본값을 요청해요.

### preview

```swift
case preview
```

의존성의 “Preview” context예요. Xcode Preview에서 코드를 실행하면 자동으로 추론해요. Preview context에서 접근한 의존성은 `TestDependencyKey/previewValue`에 기본값을 요청해요.

### test

```swift
case test
```

의존성의 “Test” context예요. XCTestCase에서 코드를 실행하면 자동으로 추론해요. Test context에서 접근한 의존성은 `TestDependencyKey/testValue`에 기본값을 요청해요.

`SWIFT_DEPENDENCIES_CONTEXT` 환경 변수를 `live`, `preview`, `test` 중 하나로 설정하면 자동 감지 대신 해당 context를 강제로 사용할 수 있어요. 애플리케이션이 테스트 process와 별도 process에서 실행되는 UI 테스트에 특히 유용해요.
