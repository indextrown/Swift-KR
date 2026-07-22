---
title: Overriding dependencies
description: 앱의 특정 기능과 자식 모델, Swift Testing·XCTest 범위에서 의존성을 재정의하고 부모의 값을 안전하게 전파하는 방법을 설명합니다.
---

# Overriding dependencies

애플리케이션의 특정 부분이 서로 다른 의존성을 사용하도록 runtime에서 의존성을 바꾸는 방법을 알아봐요.

원문: [Overriding dependencies](https://swiftpackageindex.com/pointfreeco/swift-dependencies/main/documentation/dependencies/overridingdependencies)

## 개요

애플리케이션 안에서 실행되는 특정 기능의 의존성을 바꿀 수 있어요. 외부 세계와 통신하는 것이 적절하지 않은 더 통제된 환경에서 기능을 실행할 때 유용해요. 가장 명확한 예는 테스트와 Xcode Preview에서 기능을 실행하는 것이지만 흥미로운 사례가 더 있어요.

## 기본

예를 들어 onboarding 경험을 통해 사용자에게 기능 사용법을 알려 주고 싶다고 해 볼게요. 이 경험에서 사용자의 동작 때문에 디스크나 user defaults 등에 데이터가 기록되면 적절하지 않을 수 있어요. 사용자가 완전히 제어된 환경에서 기능과 상호작용할 수 있도록 이런 의존성의 mock 버전을 사용하는 편이 좋아요.

이를 위해 기존 object에서 의존성을 상속하고 그중 일부를 추가로 재정의하는 `withDependencies(from:operation:fileID:filePath:line:column:)` 함수를 사용해야 해요.

```swift
@Observable
final class AppModel {
  var onboardingTodos: TodosModel?

  func tutorialButtonTapped() {
    onboardingTodos = withDependencies(from: self) {
      $0.apiClient = .mock
      $0.fileManager = .mock
      $0.userDefaults = .mock
    } operation: {
      TodosModel()
    }
  }

  // ...
}
```

위 코드의 `TodosModel`은 부모인 `AppModel`과 같은 모든 의존성을 가진 환경에서 생성되고, `apiClient`, `fileManager`, `userDefaults`는 외부 세계와 상호작용하지 않는 제어 가능한 mock으로 재정의돼요. 사용자가 tutorial sandbox를 둘러보는 동안 실수로 네트워크 요청을 보내거나 디스크에 데이터를 저장하거나 user defaults 설정을 덮어쓰지 않는다고 확신할 수 있어요.

> 참고: 위 코드에서 사용한 `withDependencies(from:operation:fileID:filePath:line:column:)` 메서드는 `withDependencies(_:operation:)`와 미묘하게 달라요. 일부 의존성을 재정의하기 전에 의존성을 전파할 object를 지정하는 `from` 인자를 하나 더 받아요. 이 인자를 통해 object에서 object로 의존성을 전파할 수 있어요.
>
> 일반적으로 다른 model object에서 model object를 만들 때는 **항상** 이 메서드를 사용해야 해요. 자세한 내용은 [의존성 범위 지정하기](#의존성-범위-지정하기)를 참고하세요.

## 의존성 범위 지정하기

새로운 의존성을 자식 model, 손자 model과 그 아래까지 전파하려면 의존성을 재정의할 때 각별히 주의해야 해요. 모든 자식 model은 `withDependencies(from:operation:fileID:filePath:line:column:)` 호출 안에서 생성해야 부모가 사용하는 의존성을 정확히 이어받아요.

앞의 코드에서 `TodosModel`이 특정 todo의 편집 화면으로 이동할 수 있다고 해 볼게요. `EditTodoModel`과, 값이 채워지면 화면 이동을 일으키는 optional state로 이를 모델링할 수 있어요.

```swift
@Observable
final class TodosModel {
  var todos: [Todo] = []
  var editTodo: EditTodoModel?

  @ObservationIgnored
  @Dependency(\.apiClient) var apiClient
  @ObservationIgnored
  @Dependency(\.fileManager) var fileManager
  @ObservationIgnored
  @Dependency(\.userDefaults) var userDefaults

  func tappedTodo(_ todo: Todo) {
    editTodo = EditTodoModel(todo: todo)
  }

  // ...
}
```

하지만 `tappedTodo` 메서드에서 `EditTodoModel`을 만들면 해당 의존성은 애플리케이션이 시작할 때의 기본 `DependencyKey/liveValue`로 돌아가요. `TodosModel`을 생성할 때 재정의했던 의존성을 이어받지 않아요.

재정의한 의존성을 자식 기능에도 계속 전파하려면 자식 model 생성을 `withDependencies(from:operation:fileID:filePath:line:column:)`로 감싸야 해요.

```swift
func tappedTodo(_ todo: Todo) {
  editTodo = withDependencies(from: self) {
    EditTodoModel(todo: todo)
  }
}
```

위 코드에서는 `withDependencies(from: self)`를 사용했어요. `EditTodoModel`이 `self`와 똑같은 의존성으로 생성되게 하므로 의존성을 명시적으로 재정의하지 않더라도 사용해야 해요.

## Testing

테스트에서는 기능에서 의존성을 재정의할 때와 같은 방식으로 `withDependencies(_:operation:)`를 사용할 수 있어요. 예를 들어 view가 나타날 때 model이 API client로 사용자를 가져온다면, `apiClient`가 mock 데이터를 반환하도록 재정의해 이 기능을 테스트할 수 있어요.

```swift
@Test
func onAppear() async {
  let model = withDependencies {
    $0.apiClient.fetchUser = { _ in User(id: 42, name: "Blob") }
  } operation: {
    FeatureModel()
  }

  #expect(model.user == nil)
  await model.onAppear()
  #expect(model.user == User(id: 42, name: "Blob"))
}
```

특정 방식으로 전체 test case에서 재정의하고 싶은 의존성이 있을 때도 있어요. 예를 들어 기능에서 `DependencyValues/date` 의존성을 광범위하게 사용한다면 모든 테스트에서 재정의하기 번거로울 수 있어요. 대신 test case class의 `invokeTest`를 재정의해 한 번만 설정할 수 있어요.

```swift
final class FeatureTests: XCTestCase {
  override func invokeTest() {
    withDependencies {
      $0.date.now = Date(timeIntervalSince1970: 1234567890)
    } operation: {
      super.invokeTest()
    }
  }

  // All test functions will use the mock date generator.
}
```

`invokeTest`에서 재정의한 의존성은 test case 전체에 적용돼요.

다른 test case가 상속할 base test class를 구현해 여러 test case에서 사용할 기본 의존성 집합을 제공할 수도 있어요.

```swift
class BaseTestCase: XCTestCase {
  override func invokeTest() {
    withDependencies {
      // Mutate $0 to override dependencies for all test
      // cases that inherit from BaseTestCase.
      // ...
    } operation: {
      super.invokeTest()
    }
  }
}
```
