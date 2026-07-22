---
title: Live, preview, and test dependencies
description: live·Preview·test 환경별 의존성 구현을 제공하고, interface와 구현을 분리하며 값 선택의 cascading 규칙을 적용하는 방법을 설명합니다.
---

# Live, preview, and test dependencies

실제 애플리케이션, Xcode Preview, 테스트에서 사용할 서로 다른 의존성 구현을 제공하는 방법을 알아봐요.

원문: [Live, preview, and test dependencies](https://swiftpackageindex.com/pointfreeco/swift-dependencies/main/documentation/dependencies/livepreviewtest)

## 개요

앞 절에서는 `DependencyKey`를 준수하려면 기기나 simulator에서 실행할 때 기본으로 사용하는 의존성 버전인 `DependencyKey/liveValue`를 **적어도 하나** 제공해야 한다고 설명했어요. `DependencyKey` 프로토콜은 기본 프로토콜인 `TestDependencyKey`를 상속해요. 여기에는 선택적으로 구현할 수 있는 `TestDependencyKey/testValue`와 `TestDependencyKey/previewValue` 프로퍼티가 있고, 구현하지 않으면 둘 다 `DependencyKey/liveValue`에 위임해요.

이런 대체 의존성 구현을 활용하면 테스트와 Preview를 비롯한 여러 환경에서 기능을 더 안전하게 실행할 수 있어요.

- [Live value](#live-value)
- [Test value](#test-value)
- [Preview value](#preview-value)
- [Interface와 구현 분리하기](#interface와-구현-분리하기)
- [Cascading 규칙](#cascading-규칙)

## Live value

`DependencyKey` 프로토콜의 `DependencyKey/liveValue` static property는 유일하게 정말 **필수인** 요구사항이에요. 기능을 simulator나 기기에서 실행할 때 이 값을 사용해요. 외부 세계와 실제로 상호작용하는 의존성 구현을 이 값으로 사용하는 것이 적절해요. 네트워크 요청을 보내고, 시간 기반 비동기를 수행하며, 파일 시스템과 상호작용하는 등의 작업을 할 수 있어요.

하지만 `DependencyKey/liveValue`만 구현하면 테스트에서 기능을 실행할 때도 live 의존성을 사용하므로 문제가 될 수 있어요. 느리고 불안정한 live API 요청을 보내고, 분석 이벤트를 기록해 데이터를 흐리고, 디스크에 파일을 써서 다른 테스트에 영향을 주는 등의 일이 생겨요.

테스트에서 live 의존성을 사용하는 것은 문제가 매우 많기 때문에 테스트 실행 중 live 의존성과 상호작용하면 라이브러리가 테스트를 실패하게 해요.

```swift
@Test
func feature() async throws {
  let model = FeatureModel()

  model.addButtonTapped()
  // 🛑  A dependency has no test implementation, but was accessed from a
  //     test context:
  //
  //         Dependency:
  //           APIClient
  //
  //     Dependencies registered with the library are not allowed to use
  //     their default, live implementations when run from tests.
}
```

테스트에서 정말 live 의존성을 사용하려면 의존성을 재정의하고 live 값을 설정해 의도를 명시해야 해요.

```swift
@Test
func feature() async throws {
  let model = withDependencies {
    // ⚠️ Explicitly say you want to use a live dependency.
    $0.apiClient = .liveValue
  } operation: {
    FeatureModel()
  }

  // ...
}
```

## Test value

모든 테스트에 사용할 특정 의존성 구현을 제공하려면 `TestDependencyKey` 프로토콜의 `TestDependencyKey/testValue` static property를 구현해야 해요. 최소한 실제 세계에 접근하지 않는 구현을 제공하세요. 네트워크 요청을 보내거나 실제 시간 동안 잠들거나 파일 시스템을 건드리면 안 돼요.

그러면 테스트를 실행할 때 코드에서 발생할 수 있는 버그 한 부류 전체를 막을 수 있어요. 예를 들어 사용자 이벤트를 분석 서버에 기록하는 의존성이 있다고 해 볼게요. 테스트에서 이 의존성을 제어하지 않은 채 사용하면 실제 사용자 행동과 무관한 이벤트를 실수로 기록할 위험이 있고, 그 결과 나쁘고 신뢰할 수 없는 데이터가 생겨요.

테스트 중 제어해야 하는 또 다른 의존성의 예는 파일 시스템 접근이에요. 테스트 중 기능이 디스크에 파일을 쓰면 그 파일은 이후 다른 테스트를 실행할 때도 남아 있어요. 테스트 부산물이 다른 테스트에 흘러 들어가 이해하기 어려운 실패를 일으킬 수 있어요.

따라서 `TestDependencyKey/testValue`를 제공하는 것은 매우 유용해요. 더 나아가 이 라이브러리는 `TestDependencyKey/testValue`에 의존성의 이른바 “unimplemented” 버전을 제공하기를 적극 권장해요. endpoint가 하나라도 호출되면 테스트를 실패하게 하는 구현이에요.

이를 돕기 위해 전이 의존성으로 바로 사용할 수 있는 [Issue Reporting](https://github.com/pointfreeco/xctest-dynamic-overlay) 라이브러리가 있어요. 거의 모든 시그니처의 함수를 반환할 수 있고, 그 함수를 호출하면 테스트를 실패하게 하는 [`unimplemented`](<https://swiftpackageindex.com/pointfreeco/swift-issue-reporting/main/documentation/issuereporting/unimplemented(_:fileid:filepath:function:line:column:)>) 함수가 포함돼요. 앞서 살펴본 가상의 analytics 의존성에는 다음과 같이 `testValue`를 줄 수 있어요.

```swift
struct AnalyticsClient {
  var track: (String, [String: String]) async throws -> Void
}

import Dependencies

extension AnalyticsClient: TestDependencyKey {
  static let testValue = Self(
    track: unimplemented("AnalyticsClient.track")
  )
}
```

이제 별도로 재정의하지 않은 채 기능이 analytics client의 `track` endpoint를 사용하면 테스트가 실패해요. 테스트를 작성하지 않고 새 이벤트를 추적하기 시작했을 때 쉽게 알 수 있어 매우 강력해요.

## Preview value

지금까지 `DependencyKey/liveValue`는 외부 세계에 접근하는 의존성 구현을 두기에 적절하고, `TestDependencyKey/testValue`는 외부 세계와 상호작용하지 않는 의존성 구현을 두기에 적절하다는 것을 살펴봤어요. `testValue`가 endpoint에 접근할 때 실제로 테스트를 실패하게 하면 더욱 좋아요.

`DependencyKey/liveValue`와 `TestDependencyKey/testValue`의 중간에 놓이는 세 번째 구현도 제공할 수 있어요. `TestDependencyKey/previewValue`라고 하며, 기능을 Xcode Preview에서 실행할 때마다 사용해요.

Xcode Preview는 일반적으로 네트워크 요청 같은 외부 세계와 상호작용하고 싶지 않다는 점에서 테스트와 비슷해요. 실제로 Core Location처럼 Apple framework 중 상당수는 Preview에서 동작하지 않기 때문에 기능이 이런 framework를 사용하면 Preview에서 상호작용하기 어려워요.

하지만 의존성이 mock 데이터를 반환해도 괜찮다는 점에서 Xcode Preview는 테스트와 달라요. 실제로 어떤 의존성을 사용하는지 증명하기 위한 “unimplemented” client를 다룰 필요가 없어요.

예를 들어 사용자를 가져오는 몇 가지 endpoint를 가진 API client가 있다고 해 볼게요. Preview가 느려질 수 있으므로 Swift Preview에서 실제 네트워크 요청을 보내고 싶지는 않아요. 대신 mock 데이터를 동기적으로 즉시 반환하는 `TestDependencyKey/previewValue` 구현을 제공할 수 있어요.

```swift
extension APIClient: TestDependencyKey {
  static let previewValue = Self(
    fetchUsers: {
      [
        User(id: 1, name: "Blob"),
        User(id: 2, name: "Blob Jr."),
        User(id: 3, name: "Blob Sr."),
      ]
    },
    fetchUser: { id in
      User(id: id, name: "Blob, id: \(id)")
    }
  )
}
```

> 참고: `previewValue` 구현은 `TestDependencyKey` 준수와 같은 모듈에 정의해야 해요. [Interface와 구현 분리하기](#interface와-구현-분리하기)에서 설명한 것처럼 의존성의 interface와 구현을 분리한다면 구현 모듈이 아니라 interface 모듈에 정의해야 해요.

이제 이 의존성을 사용하는 기능을 Xcode Preview에서 실행하면 데이터가 즉시 제공되므로 기능의 로직과 스타일을 더 쉽게 반복해서 다듬을 수 있어요.

특정 데이터 구성을 시험하고 싶을 때는 Preview의 의존성을 언제든 재정의할 수 있어요. 예를 들어 API client가 빈 배열을 반환할 때 기능의 empty state를 테스트하려면 다음과 같이 할 수 있어요.

```swift
struct Feature_Previews: PreviewProvider {
  static var previews: some View {
    FeatureView(
      model: withDependencies {
        $0.apiClient.fetchUsers = { _ in [] }
      } operation: {
        FeatureModel()
      }
    )
  }
}
```

API에서 오류를 반환할 때 기능이 어떻게 처리하는지 Preview에서 확인하고 싶다면 다음과 같이 할 수 있어요.

```swift
struct Feature_Previews: PreviewProvider {
  static var previews: some View {
    FeatureView(
      model: withDependencies {
        $0.apiClient.fetchUser = { _ in
          struct SomeError: Error {}
          throw SomeError()
        }
      } operation: {
        FeatureModel()
      }
    )
  }
}
```

## Interface와 구현 분리하기

의존성의 interface는 보통 간단한 data type으로 이루어져 매우 가볍고 빠르게 컴파일되지만, “live” 구현은 서드파티 라이브러리를 사용하는 경우가 많아 무겁고 컴파일하는 데 오래 걸리는 것이 일반적이에요. 이럴 때는 interface와 live 구현을 별도 모듈에 두고 구현 모듈이 interface 모듈에 의존하게 만드는 것이 좋아요.

이를 구현하려면 interface 모듈에서 의존성이 `TestDependencyKey` 프로토콜을 준수하게 만들 수 있어요.

```swift
// Module: AnalyticsClient
struct AnalyticsClient: TestDependencyKey {
  // ...

  static let testValue = Self(/* ... */)
}
```

그런 다음 구현 모듈에서 의존성을 확장해 `DependencyKey` 프로토콜도 준수하게 만들고 live 구현을 제공할 수 있어요.

```swift
// Module: LiveAnalyticsClient
extension AnalyticsClient: DependencyKey {
  static let liveValue = Self(/* ... */)
}
```

## Cascading 규칙

`TestDependencyKey/testValue`, `TestDependencyKey/previewValue`, `DependencyKey/liveValue` 중 무엇을 구현했는지와 `TestDependencyKey`, `DependencyKey` 중 어떤 프로토콜 준수가 compiler에 보이는지에 따라 runtime에서 사용할 실제 의존성을 정하는 규칙이 있어요.

- `TestDependencyKey/testValue`에는 `TestDependencyKey/previewValue`를 호출하는 기본 구현이 제공돼요. 따라서 테스트 context에서는 의존성의 Preview 버전을 사용해요.

- `TestDependencyKey`뿐 아니라 `DependencyKey` 준수도 제공하면 `TestDependencyKey/previewValue`에는 `DependencyKey/liveValue`를 호출하는 기본 구현이 제공돼요. 따라서 Preview context에서는 의존성의 live 버전을 사용해요.

위 두 규칙의 결과로 `DependencyKey`를 준수할 때 `DependencyKey/liveValue`만 구현하면 `TestDependencyKey/testValue`와 `TestDependencyKey/previewValue` 모두 내부적으로 `liveValue`를 호출해요. 즉, 테스트와 Preview 중에도 의존성이 외부 세계와 상호작용하므로 이상적이지 않을 수 있어요.

라이브러리는 테스트에서 live 의존성을 사용하는 일을 발견하도록 한 가지 도움을 줘요. 테스트 context에서 live 의존성을 사용하면 테스트 case가 실패해요. 테스트에서 live 의존성을 사용하는 위험을 이해했는지 확인하기 위한 장치예요. 정말 live 의존성을 사용하려면 의존성을 `.liveValue`로 재정의해 의도를 확인할 수 있어요.

```swift
@Test
func feature() async throws {
  let model = withDependencies {
    // ⚠️ Explicitly say you want to use a live dependency.
    $0.apiClient = .liveValue
  } operation: {
    FeatureModel()
  }

  // ...
}
```

그러면 테스트 context에서 live 의존성을 사용하더라도 라이브러리가 테스트를 실패하게 하지 않아요.

반대로 `liveValue`를 제공하지 않은 상황도 라이브러리가 발견하도록 도와줘요. simulator나 기기에서 애플리케이션을 실행할 때 `liveValue`가 없는 의존성에 접근하면 Xcode에 보라색 runtime 경고가 나타나요.

애플리케이션 target이나 test target에서 의존성 context를 강제로 지정하는 방법도 있어요. `SWIFT_DEPENDENCIES_CONTEXT` 환경 변수가 존재하고 값이 `live`, `preview`, `test` 중 하나라면 해당 context를 사용해요. 애플리케이션 target이 테스트 process 밖의 별도 process로 실행되는 UI 테스트에서 유용할 수 있어요.

UI 테스트 중 애플리케이션 target을 test 의존성으로 실행하게 만들려면 UI test case에서 다음과 같이 설정하세요.

```swift
func testFeature() {
  self.app.launchEnvironment["SWIFT_DEPENDENCIES_CONTEXT"] = "test"
  self.app.launch()
  …
}
```

## Topics

### Previews

- `DeveloperToolsSupport/PreviewTrait`
