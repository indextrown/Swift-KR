---
title: Dependency lifetimes
description: task local의 상속 규칙을 바탕으로 @Dependency가 값을 캡처하고 자식 모델과 escaping closure에 의존성을 전파하는 방법을 설명합니다.
---

# Dependency lifetimes

의존성의 수명, 의존성 수명을 연장하는 방법, 의존성이 상속되는 방식을 알아봐요.

원문: [Dependency lifetimes](https://swiftpackageindex.com/pointfreeco/swift-dependencies/main/documentation/dependencies/lifetimes)

## 개요

`Dependency` 프로퍼티 래퍼는 초기화되는 순간 의존성의 현재 상태를 캡처해요. 새로운 비동기 task가 `@TaskLocal` 값을 상속하는 방식과 비슷한 일종의 “범위 지정” 메커니즘을 제공하지만 고유한 주의사항이 있어요.

- [Task local의 작동 방식](#task-local의-작동-방식)
- [@Dependency 수명의 작동 방식](#dependency-수명의-작동-방식)
- [Structured concurrency 이전 코드에서 @Dependency 접근하기](#structured-concurrency-이전-코드에서-dependency-접근하기)

## Task local의 작동 방식

이 라이브러리는 내부적으로 task local을 기반으로 동작해요. 따라서 먼저 task local과 task local 상속이 어떻게 동작하는지 이해하는 것이 중요할 수 있어요.

Task local은 task에 암시적으로 연결된 값이에요. 값을 명시적으로 전달하지 않고도 애플리케이션 모든 부분의 깊숙한 곳까지 보낼 수 있어요. 이 설명만 보면 나쁘다고 알려진 “전역” 변수처럼 들릴 수 있지만, task local에는 안전하게 사용하고 이해하기 쉽게 만드는 세 가지 특성이 있어요.

- Task local은 동시성 context에서 안전하게 사용할 수 있어요. 여러 task가 race condition 걱정 없이 같은 task local에 접근할 수 있어요.
- Task local은 구체적이고 명확하게 정의된 범위에서만 변경할 수 있어요. 애플리케이션 모든 부분에서 변경을 관찰하도록 task local을 영구히 바꾸는 것은 허용되지 않아요.
- 기존 task에서 새로 생성한 task는 task local을 상속해요.

예를 들어 다음 task local이 있다고 해 볼게요.

```swift
enum Locals {
  @TaskLocal static var value = 1
}
```

값은 task local의 [`withValue`](<https://developer.apple.com/documentation/swift/tasklocal/withvalue(_:operation:file:line:)-1xjor>) 메서드로만 “변경”할 수 있어요. 이 메서드는 non-escaping closure 범위에서만 `value`를 바꿀 수 있게 해요.

```swift
print(Locals.value)  // 1
Locals.$value.withValue(42) {
  print(Locals.value)  // 42
}
print(Locals.value)  // 1
```

위 코드는 `withValue` closure가 실행되는 동안에만 `Locals.value`가 바뀐다는 것을 보여 줘요.

이는 매우 제한적으로 보일 수 있지만 task local을 안전하고 이해하기 쉽게 만드는 특성이기도 해요. 직접 변경하는 것처럼 task local의 변경을 일정 시간 동안 계속 유지할 수는 없어요.

```swift
Locals.value = 42
// 🛑 Cannot assign to property: 'value' is a get-only property
```

이 작업이 가능하다면 `value`의 변경 사항을 애플리케이션 모든 부분에서 즉시 관찰할 수 있게 돼요. `Locals.value`를 연속으로 두 번 읽었는데 서로 다른 값이 나올 수도 있어요.

```swift
print(Locals.value)  // 1
print(Locals.value)  // 42
```

그러면 코드를 이해하기 매우 어려워져요. 따라서 task local은 매우 구체적인 범위에서만 바꿀 수 있어요.

하지만 Swift는 task local의 변경을 non-escaping closure 범위 밖까지 연장하면서도 코드를 이해하기 어렵게 만들지 않는 도구를 제공해요. 이 도구를 “task local inheritance”라고 해요. `TaskGroup`, `async let`으로 만든 모든 자식 task와 `Task { }`로 만든 task는 생성된 순간의 task local을 상속해요.

예를 들어 다음 코드는 escaping closure인데도 1초 뒤 `Task`에서 접근했을 때 task local의 재정의가 유지된다는 것을 보여 줘요.

```swift
enum Locals {
  @TaskLocal static var value = 1
}

print(Locals.value)  // 1
Locals.$value.withValue(42) {
  print(Locals.value)  // 42
  Task {
    try await Task.sleep(for: .seconds(1))
    print(Locals.value)  // 42
  }
  print(Locals.value)  // 42
}
```

`Task`에 전달한 closure가 escaping이고 print가 `withValue` 범위가 끝난 지 한참 뒤에 실행되는데도 “42”가 출력돼요. Task 안에서 task local을 상속하기 때문이에요.

이를 통해 명확하게 정의되어 이해하기 쉬운 방식으로 task local 변경의 수명을 연장할 수 있어요.

Task local이 **모든** escaping context에서 상속되지는 않는다는 점이 중요해요. [`Task.init`](<https://developer.apple.com/documentation/swift/task/init(priority:operation:)-5k89c>)과 [`TaskGroup.addTask`](<https://developer.apple.com/documentation/swift/taskgroup/addtask(priority:operation:)>)는 escaping closure를 사용하지만 task local 상속이 동작해요. 표준 라이브러리가 이 도구에서 task local을 상속하도록 특별히 처리하기 때문이에요. 관련 구현은 [이 코드](https://github.com/apple/swift/blob/60952b868d46fc9a83619f747a7f92b5534fb632/stdlib/public/Concurrency/Task.swift#L500-L509)의 `copyTaskLocals`를 참고하세요.

하지만 일반적으로 escaping 경계를 넘으면 task local 재정의가 사라져요. 예를 들어 위 코드에서 `Task` 대신 `DispatchQueue.main.asyncAfter`를 사용하면 escaping closure에서 task local이 다시 1로 초기화되는 것을 볼 수 있어요.

```swift
print(Locals.value)  // 1
Locals.$value.withValue(42) {
  print(Locals.value)  // 42
  DispatchQueue.main.asyncAfter(deadline: .now() + 1) {
    print(Locals.value)  // 1
  }
  print(Locals.value)  // 42
}
```

정리하면 Swift는 특정 escaping 및 unstructured context에 task local을 전파하기 위한 추가 작업을 하지만 모든 곳에 적용하지는 않으므로 주의해야 해요.

## @Dependency 수명의 작동 방식

이제 task local의 작동 방식을 이해했으므로 `@Dependency`의 수명과 이를 연장하는 방법을 알아볼 수 있어요. 내부적으로 의존성은 `@TaskLocal`에 보관되기 때문에 task local의 여러 규칙이 의존성에도 적용돼요. 예를 들면 의존성은 task에서 상속되지만 일반적으로 escaping 경계를 넘어가지는 않아요. 다만 몇 가지 주의사항이 더 있어요.

Task local과 마찬가지로 `withDependencies(_:operation:)`의 뒤따르는 non-escaping closure 범위에서 의존성 값을 바꿀 수 있어요. 라이브러리는 변경의 수명을 명확한 방식으로 연장하는 도구도 몇 가지 제공해요.

예를 들어 사용자를 가져오기 위한 API client에 접근해야 하는 기능이 있다고 해 볼게요.

```swift
@Observable
class FeatureModel {
  var user: User?

  @ObservationIgnored
  @Dependency(\.apiClient) var apiClient

  func onAppear() async {
    do {
      user = try await apiClient.fetchUser()
    } catch {}
  }
}
```

때로는 다른 `apiClient` 구현을 사용하는 “제어된” 환경에서 이 model을 생성하고 싶을 수 있어요.

> 참고: 테스트는 의존성을 재정의해 제어하는 가장 대표적인 예일 거예요. 자세한 내용은 [Testing](./testing.md) 문서를 꼭 읽어 보세요.

의존성 제어는 테스트에서만 유용한 것이 아니에요. 기능의 로직에서 직접 사용해 자식 기능을 제어된 환경에서 실행할 수 있고 Xcode Preview에서도 사용할 수 있어요.

먼저 기능 로직에서 의존성 제어를 직접 사용하는 방법을 살펴볼게요. 이 기능을 “onboarding” 경험의 일부로 애플리케이션에 표시하고 싶다고 해 볼게요. Onboarding 중에는 사용자가 기능을 이용하더라도 원격 database에 데이터를 쓸 수 있는 실제 API 요청을 실행하지 않게 하고 싶어요.

Model을 생성하는 범위와 의존성을 사용하는 범위가 다르기 때문에 이를 구현하기 어려울 수 있어요. 하지만 앞에서 설명했듯이 라이브러리는 나중에 model의 의존성을 참조할 때 model을 생성한 순간 캡처한 의존성을 사용하도록 추가 작업을 해요.

예를 들어 기능 model을 다음과 같이 만들었다고 해 볼게요.

```swift
let onboardingModel = withDependencies {
  $0.apiClient = .mock
} operation: {
  FeatureModel()
}
```

그러면 `FeatureModel` 안에서 `apiClient` 의존성을 참조할 때마다 mock API client를 사용해요. `FeatureModel`의 `onAppear` 메서드를 `operation` closure 범위 밖에서 호출하더라도 마찬가지예요.

하지만 부모 model에서 자식 model을 만들 때는 주의해야 해요. 자식의 의존성이 부모의 의존성을 상속하게 하려면 자식 model을 생성할 때 `withDependencies(from:operation:fileID:filePath:line:column:)`를 사용해야 해요.

```swift
let onboardingModel = withDependencies(from: self) {
  $0.apiClient = .mock
} operation: {
  FeatureModel()
}
```

그러면 `FeatureModel`의 의존성이 부모 기능에서 상속되고, 원하는 다른 의존성을 추가로 재정의할 수 있어요.

일반적으로 애플리케이션 기능의 모든 계층에서 의존성을 올바르게 상속하려면 observable model을 `withDependencies(from:operation:fileID:filePath:line:column:)` 범위 안에서 생성해야 해요.

이렇게 하면 매우 구체적인 환경에서 Preview를 실행할 수도 있어요. Dependencies는 Xcode Preview에서 실행할 때 사용하는 의존성 구현인 `TestDependencyKey/previewValue` 개념을 이미 지원해요. 자세한 내용은 [Live, preview, and test dependencies](./live-preview-test.md)를 참고하세요. `TestDependencyKey/previewValue`에서는 기본 mock 데이터를 즉시 반환하는 것이 가장 적절해요.

하지만 기능이 매우 구체적인 state에서 어떻게 동작하는지 보기 위해 Preview의 의존성을 맞춤 설정하고 싶을 때도 있어요. 예를 들어 `fetchUser` endpoint가 오류를 던질 때 기능이 어떻게 반응하는지 보려면 Preview를 다음과 같이 수정할 수 있어요.

```swift
#Preview {
  let _ = prepareDependencies {
    $0.apiClient.fetchUser = { _ in throw SomeError() }
  }
  FeatureView(model: FeatureModel())
}
```

## Structured concurrency 이전 코드에서 @Dependency 접근하기

의존성은 task local에 보관되므로 structured concurrency와 `Task` 안에서만 자동으로 전파돼요. callback이나 Combine operator처럼 escaping closure에서 의존성에 접근하려면 의존성을 “escape”해 closure로 전달하기 위한 추가 작업이 필요해요.

예를 들어 `DispatchQueue.main.asyncAfter`를 사용해 일정 시간이 지난 뒤 의존성이 필요한 로직을 실행한다고 해 볼게요. `asyncAfter`의 escaping closure에서 사용하는 의존성이 올바른 값을 반영한다고 보장하려면 `withEscapedDependencies(_:)`를 사용해야 해요.

```swift
withEscapedDependencies { dependencies in
  DispatchQueue.main.asyncAfter(deadline: .now() + 1) {
    dependencies.yield {
      // All code in here will use dependencies at the time of calling withEscapedDependencies.
    }
  }
}
```
