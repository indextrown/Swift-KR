---
title: TCA Dependencies 사용법
description: TCA에서 client를 직접 만들고 DependencyKey·DependencyValues·@Dependency로 연결한 뒤 live·Preview·test 구현과 Store별 재정의까지 적용하는 방법을 안내합니다.
---

# TCA Dependencies 사용법

공식 참고: [Dependencies](https://swiftpackageindex.com/pointfreeco/swift-dependencies/main/documentation/dependencies), [Live, preview, and test dependencies](https://swiftpackageindex.com/pointfreeco/swift-dependencies/main/documentation/dependencies/livepreviewtest)

TCA에서 Dependencies는 기능이 제어할 수 없는 외부 세계를 다루는 방법이에요. 현재 시간, UUID, Clock, 네트워크 API, 파일 시스템, 사용자 기본값처럼 실행 결과가 매번 달라지거나 테스트·Preview에서 실제로 실행하면 곤란한 값을 `@Dependency`로 받아 사용합니다.

이 가이드에서는 직접 만든 client 하나를 다음 흐름으로 연결합니다.

```text
NumberFactClient
  ├─ liveValue     → 기기·simulator에서 실제 API 호출
  ├─ previewValue  → Xcode Preview에서 즉시 mock 데이터 반환
  └─ testValue     → 테스트에서 재정의를 빠뜨리면 실패
        ↓
DependencyValues.numberFact
        ↓
@Dependency(\.numberFact)
        ↓
Feature reducer / Store / TestStore
```

## 먼저 판단하세요

다음 중 하나라도 해당하면 의존성으로 분리하는 것이 좋아요.

- 현재 시각, UUID, 난수, timer처럼 실행할 때마다 값이 달라져요.
- 네트워크, 디스크, 사용자 기본값, 위치·알림 같은 외부 시스템에 접근해요.
- 테스트에서 실제 구현 대신 예측 가능한 값을 넣고 싶어요.
- Xcode Preview에서 실제 API 호출이나 대기 없이 화면을 확인하고 싶어요.

반대로 순수하게 입력을 받아 값을 계산하는 로직은 의존성으로 만들 필요가 없어요. Reducer의 일반 함수나 계산 로직으로 두는 편이 더 단순합니다.

## 환경마다 어떤 값을 쓰나요?

`DependencyKey`는 `liveValue`를 반드시 제공해야 하고, `previewValue`와 `testValue`는 필요에 따라 추가합니다. 하지만 네트워크·파일 시스템처럼 외부 세계와 만나는 client는 세 값을 모두 선언하는 편이 안전해요.

| 실행 환경                | 기본으로 선택하는 값 | 넣어야 할 구현                                                 |
| ------------------------ | -------------------- | -------------------------------------------------------------- |
| 기기·simulator의 앱 실행 | `liveValue`          | 실제 서버, 디스크, 시스템 API를 호출하는 구현                  |
| Xcode Preview            | `previewValue`       | 빠르고 결정적인 mock 데이터                                    |
| Swift Testing·XCTest     | `testValue`          | 테스트마다 재정의를 강제하는 `unimplemented` 또는 공통 fixture |

`liveValue`만 구현하면 `previewValue`는 결국 live 구현을 사용합니다. 테스트도 live 구현에 접근하려 하면 실패를 보고해요. 따라서 Preview에서 실제 API 호출을 막고 테스트 누락을 바로 발견하려면 아래처럼 세 값을 명시하세요.

## 가장 짧은 사용 흐름

### 1. 기본 제공 의존성은 `@Dependency`로 바로 꺼내요

TCA는 Dependencies를 함께 제공하므로, 현재 시간과 UUID 같은 기본 제공 값은 key path로 바로 가져올 수 있어요.

```swift
@Reducer
struct TodoFeature {
  @ObservableState
  struct State: Equatable {
    var todos: [Todo] = []
  }

  enum Action {
    case addButtonTapped
  }

  @Dependency(\.date.now) var now
  @Dependency(\.uuid) var uuid

  var body: some Reducer<State, Action> {
    Reduce { state, action in
      switch action {
      case .addButtonTapped:
        state.todos.append(
          Todo(id: uuid(), createdAt: now)
        )
        return .none
      }
    }
  }
}
```

이제 `Date()`나 `UUID()`를 reducer 안에서 직접 호출하지 않습니다. 기능이 필요한 값을 명시적으로 선언했으므로 실행 환경에 따라 안전하게 바꿀 수 있어요.

### 2. 직접 만든 client는 작고 closure 기반으로 선언해요

기본 제공 의존성에 없는 API는 client struct로 interface를 먼저 만들어요. TCA에서 기본으로 익힐 패턴은 client가 필요한 endpoint만 closure로 노출하고 `DependencyKey`를 직접 준수하는 방식입니다. [공식 TCA README](https://github.com/pointfreeco/swift-composable-architecture)도 이 구조를 사용해요.

예를 들어 숫자에 관한 사실을 가져오는 API를 client로 분리해 보겠습니다.

```swift
import ComposableArchitecture
import Foundation

struct NumberFactClient: Sendable {
  var fetch: @Sendable (Int) async throws -> String
}
```

reducer가 `fetch`만 필요하다면 HTTP 라이브러리나 `URLSession` 전체를 넘기지 않아요. client의 경계가 작아지고, 테스트에서는 필요한 endpoint 하나만 재정의할 수 있습니다.

### 3. `liveValue`·`previewValue`·`testValue`를 모두 제공해요

같은 client에 세 환경의 기본 구현을 나란히 둡니다. `ComposableArchitecture`는 `Dependencies`와 `IssueReporting`을 다시 내보내므로 아래의 `DependencyKey`, `unimplemented`를 함께 사용할 수 있어요.

```swift
extension NumberFactClient: DependencyKey {
  // 기기와 simulator에서만 실제 네트워크를 호출합니다.
  static let liveValue = Self(
    fetch: { number in
      let (data, _) = try await URLSession.shared.data(
        from: URL(string: "http://number-trivia.com/\(number)")!
      )
      return String(decoding: data, as: UTF8.self)
    }
  )

  // Xcode Preview에서는 즉시 화면에 표시할 데이터를 돌려줍니다.
  static let previewValue = Self(
    fetch: { number in
      "\(number)은 Preview용 숫자입니다."
    }
  )

  // 테스트가 endpoint 재정의를 빠뜨리면 해당 테스트를 실패하게 합니다.
  static let testValue = Self(
    fetch: unimplemented("NumberFactClient.fetch")
  )
}
```

`testValue`를 무조건 `unimplemented`로 둘 필요는 없어요. 모든 테스트에서 안전한 공통 fixture가 필요하다면 결정적인 값을 반환하는 fake client를 둘 수 있습니다. 다만 API 응답처럼 테스트마다 의미가 달라지는 endpoint는 `unimplemented`로 두고 각 테스트에서 기대값을 명시하는 편이 누락을 더 잘 찾아냅니다.

### 4. `DependencyValues`에 key path를 등록해요

`DependencyValues` 확장은 reducer, `Store`, `TestStore`, Preview가 같은 client를 가리키도록 만드는 이름표예요.

```swift
extension DependencyValues {
  var numberFact: NumberFactClient {
    get { self[NumberFactClient.self] }
    set { self[NumberFactClient.self] = newValue }
  }
}
```

이제 `$0.numberFact`, `$0.numberFact.fetch`, `@Dependency(\.numberFact)`를 모두 사용할 수 있어요.

### 5. reducer에서 client 전체를 받아 effect 안에서 호출해요

`@Dependency`는 생성자 인자 없이도 현재 실행 환경의 client를 꺼냅니다. 아래 reducer는 성공·실패 응답을 action으로 돌려보내므로 상태 변경도 reducer 안에 남습니다.

```swift
@Reducer
struct Feature {
  @ObservableState
  struct State: Equatable {
    var count = 0
    var numberFact: String?
    var errorMessage: String?
  }

  enum Action {
    case numberFactButtonTapped
    case numberFactResponse(Result<String, Error>)
  }

  @Dependency(\.numberFact) var numberFact

  var body: some Reducer<State, Action> {
    Reduce { state, action in
      switch action {
      case .numberFactButtonTapped:
        return .run { [count = state.count] send in
          do {
            let fact = try await numberFact.fetch(count)
            await send(.numberFactResponse(.success(fact)))
          } catch {
            await send(.numberFactResponse(.failure(error)))
          }
        }

      case let .numberFactResponse(.success(fact)):
        state.numberFact = fact
        state.errorMessage = nil
        return .none

      case let .numberFactResponse(.failure(error)):
        state.errorMessage = error.localizedDescription
        return .none
      }
    }
  }
}
```

## `TestStore`에서는 endpoint만 재정의해요

위 `testValue`는 기본적으로 `unimplemented`이므로, API를 호출하는 테스트는 어떤 응답이 필요한지 반드시 밝혀야 해요. `TestStore`의 `withDependencies`에서 client 전체를 새로 만들 필요 없이 endpoint 하나만 바꿀 수 있습니다.

```swift
@Test
func numberFact() async {
  let store = TestStore(initialState: Feature.State()) {
    Feature()
  } withDependencies: {
    $0.numberFact.fetch = { "\($0)은 좋은 숫자입니다." }
  }

  await store.send(.numberFactButtonTapped)
  await store.receive(
    .numberFactResponse(.success("0은 좋은 숫자입니다."))
  ) {
    $0.numberFact = "0은 좋은 숫자입니다."
  }
}
```

이 방식의 장점은 테스트가 실제 네트워크를 호출하지 않고, endpoint를 추가하거나 변경했는데 테스트 재정의를 빼먹으면 즉시 알 수 있다는 점이에요. 시간이나 timer가 필요한 테스트는 `$0.continuousClock = .immediate` 또는 test clock을 함께 주입해 실제 대기도 없애세요.

## Preview에서는 세 가지 수준으로 주입해요

### 기본 Preview: `previewValue`를 자동으로 사용해요

`#Preview`에서 `Feature`를 만드는 것만으로 위 `previewValue`가 선택됩니다. 실제 API를 호출하지 않고 화면을 빠르게 볼 수 있어요.

```swift
#Preview {
  FeatureView(
    store: Store(initialState: Feature.State()) {
      Feature()
    }
  )
}
```

### 특정 화면 상태: `Store(..., withDependencies:)`로 덮어써요

빈 상태나 오류 상태처럼 한 Preview에서만 다른 응답이 필요하면 `Store`를 만들 때 재정의합니다. 이 값은 해당 Store와 여기서 파생한 scope에만 적용되므로 여러 Preview를 서로 독립적으로 만들 수 있어요.

```swift
#Preview("네트워크 오류") {
  FeatureView(
    store: Store(initialState: Feature.State()) {
      Feature()
    } withDependencies: {
      $0.numberFact.fetch = { _ in
        throw URLError(.notConnectedToInternet)
      }
    }
  )
}
```

여기서 사용하는 것은 일반 `withDependencies(_:operation:)` 함수가 아니라 TCA `Store` 이니셜라이저의 `withDependencies` closure예요. TCA 기능의 의존성을 Preview 단위로 고정하고 싶을 때 이 형태가 가장 직접적입니다.

### 공통 Preview 환경: `prepareDependencies`를 사용해요

여러 Preview가 공통으로 써야 하는 값은 `prepareDependencies`로 준비할 수 있어요. 예를 들어 모든 Preview에서 시간 대기를 즉시 끝내고 싶다면 다음과 같이 작성합니다.

```swift
#Preview {
  let _ = prepareDependencies {
    $0.continuousClock = .immediate
  }

  FeatureView(
    store: Store(initialState: Feature.State()) {
      Feature()
    }
  )
}
```

`prepareDependencies`는 해당 실행 환경의 전역 기본값을 준비하므로 key를 접근하기 전에, key마다 한 번만 호출해야 해요. `#Preview` result builder 안에서는 `let _ =`로 반환값을 소비해야 합니다. 반복·parameterized 테스트에는 맞지 않으므로 테스트에서는 `TestStore(..., withDependencies:)`나 `withDependencies(_:operation:)`를 사용하세요.

## client를 별도 모듈로 나눌 때

작은 앱은 한 target에서 위 세 값을 모두 정의하면 충분해요. 하지만 live 구현이 Firebase·데이터베이스·네트워크 SDK처럼 무겁다면 interface와 live 구현을 분리할 수 있습니다.

| 위치                                       | 두는 것                                                                                           |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------- |
| `NumberFactClient` interface 모듈          | client struct, `TestDependencyKey` 준수, `testValue`, `previewValue`, `DependencyValues` key path |
| live 구현 모듈 또는 App integration target | `DependencyKey` 준수와 `liveValue`                                                                |

이렇게 하면 feature와 Preview는 가벼운 interface 모듈만 알면 되고, 실제 SDK를 가진 live 구현은 앱을 조립하는 지점에서만 연결합니다. `previewValue`는 `TestDependencyKey` 준수가 있는 interface 모듈에 둬야 합니다.

## 흔한 실수

1. **`liveValue`만 선언하기**: Preview가 실제 네트워크를 호출할 수 있어 느리고 불안정해져요. `previewValue`를 추가하세요.
2. **`testValue`를 live 구현으로 두기**: 테스트가 외부 세계에 의존하고 누락된 mock을 발견하기 어려워져요. 보통 `unimplemented` 또는 결정적인 fixture를 사용하세요.
3. **Preview에 `testValue`를 쓰기**: Preview는 mock 데이터를 보여 주는 곳이므로 `previewValue`나 Preview별 override가 더 알맞아요.
4. **`prepareDependencies`를 테스트 공통 설정으로 쓰기**: 전역 상태라 반복·병렬 테스트에 맞지 않아요. 테스트마다 `TestStore`의 `withDependencies`를 쓰세요.
5. **client 전체를 매번 교체하기**: endpoint 하나만 다르면 `$0.numberFact.fetch = { ... }`처럼 가장 작은 범위만 바꾸세요.

`@DependencyEntry`는 같은 모듈에 간단한 기본값을 등록할 때 쓸 수 있는 Dependencies의 편의 매크로입니다. 하지만 live 구현을 App target이나 integration module로 분리하고 TCA client의 live·Preview·test 동작을 명확히 관리하려면, 이 문서처럼 `DependencyKey`와 `DependencyValues`를 직접 작성하는 흐름이 더 알기 쉽고 유연합니다.

## 상황별로 읽을 문서

| 지금 궁금한 것                                                    | 다음 문서                                                                                                |
| ----------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| 의존성이 왜 필요한지, 어떤 값을 분리해야 하는지                   | [What are dependencies?](./dependencies/what-are-dependencies.md)                                        |
| 기본 제공 `date`, `uuid`, `clock`을 바로 쓰는 방법                | [Quick start](./dependencies/quick-start.md), [Using dependencies](./dependencies/using-dependencies.md) |
| 직접 만든 TCA client를 등록하는 방법                              | [Registering dependencies](./dependencies/registering-dependencies.md)                                   |
| 실제 앱·Preview·테스트 구현을 나누는 방법                         | [Live, preview, and test dependencies](./dependencies/live-preview-test.md)                              |
| `TestStore`와 Swift Testing에서 재정의하는 방법                   | [Testing](./dependencies/testing.md)                                                                     |
| protocol, closure 기반 client, `@DependencyClient` 중 무엇을 쓸지 | [Designing dependencies](./dependencies/designing-dependencies.md)                                       |
| 특정 기능이나 자식 기능에서 잠시 값을 바꾸는 방법                 | [Overriding dependencies](./dependencies/overriding-dependencies.md)                                     |
| task·escaping closure에서 의존성이 유지되는 방식                  | [Lifetimes](./dependencies/lifetimes.md)                                                                 |
| 앱 진입점 하나로 값을 전파하는 방법                               | [Single entry point systems](./dependencies/single-entry-point-systems.md)                               |

## 기억할 규칙

1. 기능이 외부 세계와 상호작용하면 `@Dependency`로 드러내요.
2. 외부 세계를 쓰는 client에는 `liveValue`, `previewValue`, `testValue`를 모두 선언해 실행 환경을 분리해요.
3. 테스트는 `TestStore(..., withDependencies:)`에서 필요한 endpoint를 재정의하고, Preview는 `previewValue`를 기본으로 사용해요.
4. Preview 하나만 다르게 만들 때는 `Store(..., withDependencies:)`, 여러 Preview의 공통 환경을 준비할 때는 `prepareDependencies`를 사용해요.
5. client는 기능이 실제로 쓰는 endpoint만 작게 노출하면 테스트와 변경이 쉬워져요.
