---
title: Shared state
description: TCA의 @Shared와 @SharedReader로 상태를 기능 간에 공유하고, 메모리·UserDefaults·파일 저장·테스트를 다루는 방법을 설명합니다.
---

# Shared state

애플리케이션의 여러 부분에서 상태를 공유하는 방법과, 데이터를 사용자 기본값, 파일 시스템, 그 밖의 외부 매체에 저장하는 방법을 알아봐요.

원문: [Sharing state](https://swiftpackageindex.com/pointfreeco/swift-composable-architecture/main/documentation/composablearchitecture/sharingstate)

## 개요

상태 공유는 여러 기능이 같은 데이터에 접근하게 하고, 어느 기능이든 이 데이터를 바꾸면 그 변경이 모든 기능에 즉시 보이게 하는 과정이에요. 아주 유용하지만, 공유하지 않고 복사되는 값 타입과는 잘 맞지 않아요. Composable Architecture는 참조 타입보다 값 타입으로 도메인을 모델링하는 방식을 강하게 선호하므로, 상태 공유가 까다로울 수 있어요.

그래서 라이브러리는 애플리케이션의 여러 부분에 상태를 공유하는 몇 가지 도구를 제공해요. 이 도구 대부분은 Composable Architecture 밖에 있으며, [Sharing](https://github.com/pointfreeco/swift-sharing)이라는 별도 라이브러리에 있어요. 더 자세한 내용은 해당 라이브러리 문서를 참고할 수 있고, 이 글에서도 가장 중요한 개념 일부를 다시 설명해요.

라이브러리의 공유 상태는 크게 명시적으로 전달하는 상태와 영속 상태 두 종류예요. 라이브러리는 메모리, 사용자 기본값, 파일 저장소라는 세 가지 영속 전략을 제공해요. SQLite처럼 사용자 기본값이나 파일 시스템과 다른 저장소를 쓰고 싶다면 직접 영속 전략을 구현할 수도 있어요.

## 목차

- [진실의 원천](#진실의-원천)
- [명시적 공유 상태](#명시적-공유-상태)
- [영속 공유 상태](#영속-공유-상태)
  - [메모리](#메모리)
  - [사용자 기본값](#사용자-기본값)
  - [파일 저장소](#파일-저장소)
  - [사용자 정의 영속성](#사용자-정의-영속성)
- [공유 상태 변경 관찰](#공유-상태-변경-관찰)
- [초기화 규칙](#초기화-규칙)
- [공유 상태 파생](#공유-상태-파생)
- [공유 상태 동시 변경](#공유-상태-동시-변경)
- [공유 상태 테스트](#공유-상태-테스트)
  - [영속성을 사용할 때의 테스트](#영속성을-사용할-때의-테스트)
  - [사용자 정의 영속 전략을 사용할 때의 테스트](#사용자-정의-영속-전략을-사용할-때의-테스트)
  - [테스트에서 공유 상태 재정의](#테스트에서-공유-상태-재정의)
  - [UI 테스트](#ui-테스트)
  - [테스트 팁](#테스트-팁)
- [읽기 전용 공유 상태](#읽기-전용-공유-상태)
- [타입 안전 키](#타입-안전-키)
- [Observation 이전 앱의 공유 상태](#observation-이전-앱의-공유-상태)
- [`@Shared`의 주의점](#shared의-주의점)

## 진실의 원천

먼저 “공유 상태”가 정확히 무엇인지 살펴볼게요. 아키텍처 논의에서는 “단일 진실의 원천(single source of truth)”이라는 개념을 자주 말해요. 애플리케이션의 전체 상태와 내비게이션까지도 하나의 데이터 조각으로 구동할 수 있다는 생각이에요. 이론상 훌륭하지만 실제로 완전히 받아들이기에는 꽤 어려워요.

우선 애플리케이션의 **모든** 상태를 구동할 단 하나의 데이터 조각은 실현 가능하지 않아요. 뷰에 로컬로만 있어도 되고 전역 표현이 필요 없는 상태가 많이 있어요. 예를 들어 버튼이 눌린 상태는 버튼 내부에만 비공개로 두어도 충분해요.

또한 애플리케이션에는 보통 단일 진실의 원천이 있지 않아요. 너무 단순한 설명이에요. 애플리케이션이 API, 디스크, 사용자 기본값에서 데이터를 읽어 온다면 그 데이터의 “진실”은 애플리케이션 안이 아니라 외부에 있어요.

실제로 모든 애플리케이션에는 “진실”의 원천이 두 가지 있어요.

1. 애플리케이션이 로직과 동작을 실행하는 데 필요한 상태예요. 버튼 활성화 여부를 결정하고, sheet나 drill-down 같은 내비게이션을 구동하며, 폼 유효성을 검사하는 상태예요. 이런 상태는 애플리케이션 안에서만 의미가 있어요.
2. 애플리케이션 밖의 외부 시스템에 있고 앱으로 읽어 와야 하는 데이터예요. 이런 상태는 의존성 또는 이 글에서 설명하는 공유 상태 도구로 모델링하는 것이 가장 좋아요.

## 명시적 공유 상태

가장 간단하게 시작할 수 있는 공유 상태예요. 영속성 없이 여러 기능에 상태를 공유할 수 있어요. 데이터는 메모리에만 있고, 다음에 앱을 실행하면 사라져요.

이 방식으로 데이터를 공유하려면 인자 없이 `@Shared` 프로퍼티 래퍼를 사용하세요. 예를 들어 한 기능이 count를 보관하고, 이 count의 공유 참조를 다른 기능에 넘기고 싶다고 해 볼게요. 기능 상태에 `@Shared` 프로퍼티를 보관하면 돼요.

```swift
@Reducer
struct ParentFeature {
  @ObservableState
  struct State {
    @Shared var count: Int
    // Other properties
  }
  // ...
}
```

이 부모 기능이 공유 `count` 값에 접근하려는 자식 기능을 표시한다고 해 볼게요. 자식도 count의 `@Shared` 프로퍼티를 보관해요.

```swift
@Reducer
struct ChildFeature {
  @ObservableState
  struct State {
    @Shared var count: Int
    // Other properties
  }
  // ...
}
```

부모 기능이 자식 기능의 상태를 만들 때는 실제 count 값이 아니라 `$count` 프로젝션 값을 사용해 공유 count의 **참조**를 전달할 수 있어요.

```swift
case .presentButtonTapped:
  state.child = ChildFeature.State(count: state.$count)
  // ...
```

이제 `ChildFeature`가 count를 변경하면 그 변경은 즉시 `ParentFeature`의 count에도 반영돼요.

## 영속 공유 상태

앞에서 설명한 명시적 공유 상태는 데이터 조각을 여러 기능에 가볍게 공유하는 좋은 방법이에요. 하지만 상태를 명시적으로 계속 전달하지 않고 앱 전체와 공유하고 싶을 때도 있어요. 이때는 `@Shared` 프로퍼티 래퍼에 `SharedKey`를 전달하면 돼요. 라이브러리는 세 가지 영속 전략을 제공하고, 사용자 정의 영속 전략도 만들 수 있어요.

#### 메모리

가장 단순한 영속 전략이지만 실제로는 영속하지 않아요. 데이터를 메모리에 보관해 앱의 모든 부분에서 사용할 수 있게 하지만, 앱을 다시 실행하면 기본값으로 초기화돼요.

`@Shared` 프로퍼티 래퍼에 `inMemory`를 전달해 사용할 수 있어요. 예를 들어 어떤 기능이 앱 전체와 정수 count를 공유하고, 모든 기능이 이 정수를 읽고 쓸 수 있게 하려면 다음과 같이 작성해요.

```swift
@Reducer
struct ChildFeature {
  @ObservableState
  struct State {
    @Shared(.inMemory("count")) var count = 0
    // Other properties
  }
  // ...
}
```

> 참고: `@Shared`에 영속 전략을 사용할 때는 공유 상태에 처음 접근할 때 쓸 기본값을 반드시 제공해야 해요.

이제 애플리케이션의 어느 부분에서든 이 상태를 읽고 쓸 수 있으며, 기능들의 상태가 어긋나지 않아요.

#### 사용자 기본값

공유 값을 앱 실행 사이에도 유지하고 싶다면, `@Shared`에 `appStorage` 전략을 사용해 값의 모든 변경을 사용자 기본값에 자동 저장할 수 있어요. 앞에서 설명한 메모리 공유와 비슷하게 동작해요. 사용자 기본값에 저장할 키와, 사용자 기본값에 값이 없을 때 사용할 기본값이 필요해요.

```swift
@Shared(.appStorage("count")) var count = 0
```

이 작은 변경만으로도 count의 모든 변경이 저장되고, 다음 앱 실행 때 자동으로 로드돼요.

이 형태의 영속성은 `UserDefaults`와 잘 동작하는 단순 데이터 타입에만 사용할 수 있어요. 문자열, 불리언, 정수, double, URL, 데이터 등이 여기에 포함돼요. JSON으로 직렬화한 사용자 정의 데이터 타입처럼 더 복잡한 데이터를 저장해야 한다면 `.fileStorage` 전략이나 사용자 정의 영속 전략을 사용하세요.

#### 파일 저장소

공유 값을 앱 실행 사이에 유지해야 하고 값이 사용자 정의 데이터 타입처럼 복잡하다면, `@Shared`에 `fileStorage` 전략을 사용할 수 있어요. 모든 변경을 파일 시스템에 자동으로 저장해요.

메모리 공유와 비슷하게 동작하지만, 디스크에 저장할 URL과 파일 시스템에 데이터가 없을 때 사용할 기본값이 필요해요.

```swift
@Shared(.fileStorage(URL(/* ... */))) var users: [User] = []
```

이 전략은 값을 JSON으로 직렬화해 디스크에 저장하고, 로드할 때 JSON을 역직렬화해요. 따라서 `@Shared(.fileStorage(…))`에 보관하는 값은 `Codable`을 준수해야 해요.

#### 사용자 정의 영속성

사용자 기본값이나 JSON 파일이 충분하지 않은 경우에는 완전히 새로운 영속 전략을 정의할 수 있어요. `SharedKey` 프로토콜을 준수하는 타입을 정의하세요.

```swift
public final class CustomSharedKey: SharedKey {
  // ...
}
```

그런 다음 새 영속 전략을 만드는 정적 함수를 `SharedKey` 프로토콜에 정의하세요.

```swift
extension SharedReaderKey {
  public static func custom<Value>(/*...*/) -> Self
  where Self == CustomPersistence<Value> {
    CustomPersistence(/* ... */)
  }
}
```

이 단계를 마치면 `appStorage`, `fileStorage`와 같은 방식으로 전략을 사용할 수 있어요.

```swift
@Shared(.custom(/* ... */)) var myValue: Value
```

`SharedKey` 프로토콜은 파일 시스템이나 사용자 기본값 같은 외부 저장소에서 **읽기**와 **쓰기**를 모두 나타내요. 하지만 서버가 앱의 모양이나 동작을 맞추는 원격 구성 파일을 보관하는 경우처럼, 외부 시스템에 저장하는 것이 유효하지 않은 때도 있어요. 이때는 `SharedReaderKey` 프로토콜을 준수하세요. 자세한 내용은 [읽기 전용 공유 상태](#읽기-전용-공유-상태)를 참고하세요.

## 공유 상태 변경 관찰

`@Shared` 프로퍼티 래퍼는 앱의 어느 부분에서든 참조의 변경을 관찰할 수 있는 `publisher` 프로퍼티를 노출해요. 예를 들어 어떤 기능이 공유 count의 변경을 듣고 싶다면, count 변경을 구독하는 장기 실행 effect를 시작하는 `onAppear` 액션을 도입할 수 있어요.

```swift
case .onAppear:
  return .publisher {
    state.$count.publisher
      .map(Action.countUpdated)
  }

case .countUpdated(let count):
  // Do something with count
  return .none
```

공유 상태를 보관하면서 그 상태 변경을 구독하는 기능은 주의해야 해요. 다음처럼 작성하면 무한 루프를 만들 수 있어요.

```swift
case .onAppear:
  return .publisher {
    state.$count.publisher
      .map(Action.countUpdated)
  }

case .countUpdated(let count):
  state.count = count + 1
  return .none
```

count가 바뀌면 `$count.publisher`가 값을 내보내고 `countUpdated` 액션이 전송돼요. 이 액션이 공유 count를 다시 바꾸고, `$count.publisher`가 다시 값을 내보내는 일이 반복돼요.

## 초기화 규칙

상태 공유 도구는 프로퍼티 래퍼를 사용하므로, 타입에 사용자 정의 이니셜라이저를 작성할 때 특별한 규칙을 따라야 해요. 이 규칙은 기본 SwiftUI가 제공하는 `@State`, `@StateObject` 등을 포함한 **모든** 프로퍼티 래퍼에 적용돼요. 다만 혼란스러울 수 있으므로 아래에서 공유 상태를 초기화하는 여러 방법을 설명할게요.

특히 모듈화할 때 기능의 `Reducer/State` 타입에 사용자 정의 이니셜라이저를 제공해야 하는 일이 흔해요. `State`에서 `@Shared`를 사용하면 복잡해질 수 있어요. 정확한 상황에 따라 다음 중 하나를 선택하세요.

- 영속하지 않는 공유 상태를 사용하고(`@Shared`에 인자를 전달하지 않음), 상태의 “진실의 원천”이 부모 기능에 있다면 이니셜라이저는 `Shared` 값을 받고 밑줄이 붙은 프로퍼티에 할당해야 해요.

  ```swift
  public struct State {
    @Shared public var count: Int
    // other fields

    public init(count: Shared<Int>, /* other fields */) {
      self._count = count
      // other assignments
    }
  }
  ```

- 영속하지 않는 공유 상태를 사용하고(`@Shared`에 인자를 전달하지 않음), 상태의 “진실의 원천”이 초기화하는 기능 내부에 있다면 이니셜라이저는 일반 `Shared`가 아닌 값을 받고, 이니셜라이저에서 `Shared` 값을 만들어요.

  ```swift
  public struct State {
    @Shared public var count: Int
    // other fields

    public init(count: Int, /* other fields */) {
      self._count = Shared(count)
      // other assignments
    }
  }
  ```

- `appStorage`, `fileStorage` 등 영속 전략을 쓴 공유 상태라면 이니셜라이저는 일반 `Shared`가 아닌 값을 받아야 해요. 그리고 두 번째 인자로 `SharedKey`를 받는 이니셜라이저로 `Shared` 값을 만들어요.

  ```swift
  public struct State {
    @Shared public var count: Int
    // other fields

    public init(count: Int, /* other fields */) {
      self._count = Shared(wrappedValue: count, .appStorage("count"))
      // other assignments
    }
  }
  ```

  count 선언에는 이니셜라이저에서 영속 전략을 지정하므로, 인자 없이 `@Shared`를 사용할 수 있어요.

  > 중요: 이 이니셜라이저에 전달하는 값은 외부 저장소에 값이 아직 없을 때만 사용돼요. 저장소에 값이 있으면 사용하지 않아요. 실제로 `Shared.init(wrappedValue:)`의 `wrappedValue` 인자는 `@autoclosure`이므로 사용되지 않으면 평가조차 하지 않아요. 따라서 이니셜라이저의 인자도 `@autoclosure`로 만들어 실제로 필요할 때만 평가되게 하는 편이 좋아요.
  >
  > ```swift
  > public struct State {
  >   @Shared public var count: Int
  >   // other fields
  >
  >   public init(count: @autoclosure () -> Int, /* other fields */) {
  >     self._count = Shared(wrappedValue: count(), .appStorage("count"))
  >     // other assignments
  >   }
  > }
  > ```

## 공유 상태 파생

기존 공유 상태의 하위 부분에서 공유 상태를 파생할 수 있어요. 예를 들어 여러 단계의 가입 흐름이 있고, 각 화면 간 데이터를 공유하기 위해 `Shared<SignUpData>`를 쓴다고 해 볼게요. 하지만 어떤 화면은 `SignUpData` 전체가 아니라 작은 일부만 필요할 수 있어요. 전화번호 확인 화면은 `signUpData.phoneNumber`만 접근하면 되므로, 이 사실을 나타내기 위해 해당 기능은 `Shared<String>`만 보관할 수 있어요.

```swift
@Reducer
struct PhoneNumberFeature {
  struct State {
    @Shared var phoneNumber: String
  }
  // ...
}
```

그런 다음 부모 기능이 `PhoneNumberFeature`를 만들 때 `Shared<SignUpData>`에서 작은 공유 상태 조각을 파생해 전달할 수 있어요.

```swift
case .nextButtonTapped:
  state.path.append(
    PhoneNumberFeature.State(phoneNumber: state.$signUpData.phoneNumber)
  )
```

여기서는 `$` 문법으로 `@Shared` 값의 프로젝션 값 `$signUpData`를 사용하고, 그 프로젝션에 점 표기법을 이어 붙여 `Shared<String>`를 파생했어요. 이 방식은 기능이 맡은 일을 하는 데 필요한 최소한의 공유 상태만 보관하게 해 줘요.

`@Shared`는 기본 SwiftUI의 `@Bindable`에 대응하는 Composable Architecture 도구라고 생각하면 도움이 돼요. 실제 값의 “진실의 원천”이 다른 곳에 있음을 표현하면서도, 가장 최신 값을 읽고 쓸 수 있게 해 줘요.

영속 전략에도 같은 방식이 적용돼요. 부모 기능이 영속 전략이 있는 `@Shared` 상태를 보관한다고 해 볼게요.

```swift
@Reducer
struct ParentFeature {
  struct State {
    @Shared(.fileStorage(.currentUser)) var currentUser
  }
  // ...
}
```

자식 기능이 `currentUser` 전체가 아니라 이름처럼 일부만 접근하고 싶다면, 꾸밈 없는 단순한 `@Shared`를 보관하면 돼요.

```swift
@Reducer
struct ChildFeature {
  struct State {
    @Shared var currentUserName: String
  }
  // ...
}
```

이후 부모가 자식 상태를 만들 때 `$currentUser.name`을 전달해요.

```swift
case .editNameButtonTapped:
  state.destination = .editName(
    EditNameFeature(name: state.$currentUser.name)
  )
```

자식 기능이 공유 name을 바꾸면 부모의 공유 `currentUser`에도 자동으로 반영돼요. 또한 `.fileStorage` 영속 전략 덕분에 변경은 자동 저장돼요. 즉, 자식은 영속 전략을 설명하지 않고도 필요한 공유 상태 접근만 표현할 수 있고, 부모는 영속성과 파생한 공유 상태를 자식에게 전달하는 책임을 맡을 수 있어요.

공유 상태가 컬렉션, 특히 `IdentifiedArray`라면 배열의 특정 요소로 공유 상태를 파생하는 도구도 있어요. `[id:]` 서브스크립트로 `Shared` 컬렉션에 접근하면 공유 optional 상태 조각을 얻어요. 그 뒤 특수한 `Shared` 이니셜라이저로 언래핑해 실제 공유 상태로 바꿀 수 있어요.

```swift
@Shared(.fileStorage(.todos)) var todos: IdentifiedArrayOf<Todo> = []

guard let todo = Shared($todos[id: todoID])
else { return }
todo // Shared<Todo>
```

## 공유 상태 동시 변경

[공유 상태 변경하기](https://swiftpackageindex.com/pointfreeco/swift-sharing/main/documentation/sharing/mutatingsharedstate)에서 더 자세한 설명을 볼 수 있어요.

`@Shared` 프로퍼티 래퍼는 공유 상태를 대부분 일반 상태처럼 다룰 수 있게 해 주지만, 공유 상태를 변경할 때는 몇 가지 단계를 더 거쳐야 해요. 공유 상태는 내부적으로 참조이기 때문이에요. 값 타입처럼 보이도록 별도 처리를 하지만, 여러 스레드에서 같은 공유 상태를 변경할 수 있으므로 경쟁 조건이 생길 수 있어요.

공유 상태 조각을 격리해 변경하려면 `@Shared` 프로젝션 값에 정의된 `withLock` 메서드를 사용하세요.

```swift
state.$count.withLock { $0 += 1 }
```

현재 count를 읽고, 증가하고, 참조에 다시 저장하는 전체 작업 단위를 잠가요.

기술적으로는 다음처럼 경쟁 조건이 생기는 코드를 여전히 작성할 수 있어요.

```swift
let currentCount = state.count
state.$count.withLock { $0 = currentCount + 1 }
```

경쟁 조건을 코드에서 100% 막을 방법은 없어요. actor도 재진입성 때문에 문제를 겪을 수 있어요. 위와 같은 문제를 피하려면 공유 상태의 변경을 가능한 한 하나의 `withLock`으로 감싸세요. 전체 작업 단위가 잠금으로 보호돼요.

## 공유 상태 테스트

공유 상태는 Composable Architecture 기능이 보관하는 일반 상태와 꽤 다르게 동작해요. Store에 액션을 보내지 않아도 애플리케이션 어느 부분에서나 변경할 수 있고, 값 의미론이 아니라 참조 의미론을 가져요. 참조는 보통 테스트, 특히 라이브러리가 선호하는 철저한 테스트에 심각한 문제를 일으켜요. 참조는 복사할 수 없어 액션 전후의 변경을 검사할 수 없기 때문이에요.

그래서 `@Shared` 프로퍼티 래퍼는 테스트 중 이전 상태 스냅샷을 보존하는 추가 작업을 해요. 참조이더라도 공유 상태를 철저하게 단언할 수 있어요.

대부분의 경우 공유 상태는 기능의 일반 상태처럼 테스트할 수 있어요. 예를 들어 count에 메모리 내 공유 상태를 사용하는 간단한 counter 기능을 살펴볼게요.

```swift
@Reducer
struct Feature {
  struct State: Equatable {
    @Shared var count: Int
  }
  enum Action {
    case incrementButtonTapped
  }
  var body: some ReducerOf<Self> {
    Reduce { state, action in
      switch action {
      case .incrementButtonTapped:
        state.$count.withLock { $0 += 1 }
        return .none
      }
    }
  }
}
```

이 기능은 공유하지 않는 일반 상태를 사용할 때와 비슷하게 테스트할 수 있어요.

```swift
@Test
func increment() async {
  let store = TestStore(initialState: Feature.State(count: Shared(0))) {
    Feature()
  }

  await store.send(.incrementButtonTapped) {
    $0.$count.withLock { $0 = 1 }
  }
}
```

상태가 어떻게 바뀌는지 설명했으므로 이 테스트는 통과해요. 더 나아가 count 변경을 잘못 단언하면 다음처럼 돼요.

```swift
@Test
func increment() async {
  let store = TestStore(initialState: Feature.State(count: Shared(0))) {
    Feature()
  }

  await store.send(.incrementButtonTapped) {
    $0.$count.withLock { $0 = 2 }
  }
}
```

그러면 무엇이 잘못됐는지 알려 주는 테스트 실패를 즉시 얻어요.

```
❌ State was not expected to change, but a change occurred: …

    − Feature.State(_count: 2)
    + Feature.State(_count: 1)

(Expected: −, Actual: +)
```

`@Shared` count가 참조 타입이더라도 동작해요. `TestStore`와 `@Shared` 타입이 함께 액션 전후 상태를 스냅샷으로 저장하므로, 계속 철저하게 단언할 수 있어요.

하지만 기능에서 공유 상태를 철저하게 테스트하는 일은 공유하지 않는 상태를 테스트하는 것보다 복잡해요. 공유 상태는 effect가 캡처해 직접 변경할 수 있고, 시스템에 액션을 전혀 보내지 않아도 돼요. 일반 상태는 액션을 보낼 때만 변경할 수 있다는 점과 크게 달라요.

예를 들어 `incrementButtonTapped` 액션을 바꿔 effect 안에서 공유 상태를 캡처하고 증가시킬 수 있어요.

```swift
case .incrementButtonTapped:
  return .run { [sharedCount = state.$count] _ in
    await sharedCount.withLock { $0 += 1 }
  }
```

이것이 가능한 유일한 이유는 `@Shared` 상태가 참조처럼 동작해 기술적으로 어디서든 변경할 수 있기 때문이에요.

그렇다면 테스트에는 어떤 영향이 있을까요? 이제 reducer에서 count를 직접 증가시키지 않으므로 TestStore 단언의 trailing closure를 뺄 수 있어요.

```swift
@Test
func increment() async {
  let store = TestStore(initialState: SimpleFeature.State(count: Shared(0))) {
    SimpleFeature()
  }
  await store.send(.incrementButtonTapped)
}
```

기술적으로 맞는 테스트지만 effect의 동작은 전혀 테스트하지 않아요.

다행히 `TestStore`가 이를 처리해 줘요. 이 테스트를 실행하면 공유 count가 변경됐지만 그 변경을 단언하지 않았다는 실패를 바로 확인할 수 있어요.

```
❌ Tracked changes to 'Shared<Int>@MyAppTests/FeatureTests.swift:10' but failed to assert: …

  − 0
  + 1

(Before: −, After: +)

Call 'Shared<Int>.assert' to exhaustively test these changes, or call 'skipChanges' to ignore them.
```

테스트를 통과시키려면 테스트 마지막에 `TestStore/assert(_:fileID:file:line:column:)` 메서드로 공유 counter 상태를 명시적으로 단언해야 해요.

```swift
@Test
func increment() async {
  let store = TestStore(initialState: SimpleFeature.State(count: Shared(0))) {
    SimpleFeature()
  }
  await store.send(.incrementButtonTapped)
  store.assert {
    $0.$count.withLock { $0 = 1 }
  }
}
```

이제 테스트가 통과해요.

따라서 `@Shared` 타입은 참조 의미론 때문에 애플리케이션에 약간 더 많은 불확실성을 가져오지만, 변경에 대해 철저한 테스트 범위를 확보할 수 있어요.

#### 영속성을 사용할 때의 테스트

라이브러리가 제공하는 `appStorage`, `fileStorage` 영속 전략을 사용할 때도 테스트할 수 있어요. 보통 영속 데이터는 테스트 간에 남아 격리된 상태에서 각 테스트 동작을 철저하게 증명하기 어렵게 하므로 테스트하기 어려워요.

하지만 `.appStorage`, `.fileStorage` 전략은 이를 보장하기 위한 추가 작업을 해요. 기본적으로 `.appStorage` 전략은 비영속 사용자 기본값을 사용하므로 테스트 실행 사이에 변경이 실제로 저장되지 않아요. `.fileStorage` 전략은 모의 파일 시스템을 사용하므로 상태 변경이 실제 파일 시스템에 저장되지 않아요.

즉, 앞의 [공유 상태 테스트](#공유-상태-테스트) 절에 있는 `SimpleFeature`를 app storage를 쓰도록 바꿔도 다음과 같아요.

```swift
struct State: Equatable {
  @Shared(.appStorage("count")) var count: Int
}
```

이 기능의 테스트는 이전과 같은 방식으로 작성할 수 있고 계속 통과해요.

#### 사용자 정의 영속 전략을 사용할 때의 테스트

사용자 정의 영속 전략을 만들 때는 테스트하기 좋은 방식으로 신중히 만들어야 해요. 예를 들어 라이브러리가 제공하는 `appStorage` 영속 전략은 `defaultAppStorage` 의존성을 주입하므로, 제어된 환경에서 실행할 사용자 정의 `UserDefaults`를 주입할 수 있어요. 기본 `defaultAppStorage`는 비영속 사용자 기본값을 사용하지만, 어떤 종류의 defaults든 사용하도록 맞춤 설정할 수 있어요.

비슷하게 `fileStorage` 영속 전략은 디스크에 파일을 쓰고 읽는 방식을 바꾸기 위한 내부 의존성을 사용해요. 테스트에서는 이 의존성이 파일 시스템과 상호작용하지 않고 `[URL: Data]` 딕셔너리에 데이터를 쓴 뒤 그 딕셔너리에서 읽어요. 실제 파일 시스템의 동작을 모방하면서도 다른 테스트에 영향을 줄 수 있는 전역 파일 시스템에는 데이터를 남기지 않아요.

#### 테스트에서 공유 상태 재정의

영속 전략을 사용하는 `@Shared` 기능을 테스트할 때는 테스트의 초기 상태를 설정하고 싶을 수 있어요. 보통은 테스트 시작에서 공유 상태를 선언해 기본값을 지정하면 돼요.

```swift
@Test
func basics() {
  @Shared(.appStorage("count")) var count = 42

  // Shared state will be 42 for all features using it.
  let store = TestStore(…)
}
```

하지만 테스트 모음이 앱 타깃의 일부라면 앱 진입점이 실행되고, `@Shared`에 너무 이르게 접근해 위와 다른 기본값을 캡처할 수 있어요. 앱 타깃 테스트의 이 특이점은 TCA 테스트 문서의 `TestingTCA#Testing-gotchas`에 설명되어 있고, Xcode Preview에도 비슷한 특이점이 있으며 아래 [`@Shared`의 주의점](#shared의-주의점)에서 다뤄요.

이 문제의 가장 견고한 해결책은 테스트를 실행할 때 앱 진입점을 실행하지 않는 것이에요. `TestingTCA#Testing-host-application`에서 이 방법을 자세히 설명해요. 그러면 테스트 실행 중 실수로 네트워크 요청, 분석 추적 등을 실행하지 않게 돼요.

또한 공유 상태를 초기화한 뒤 다시 설정해 이 문제를 피할 수 있어요.

```swift
@Test
func basics() {
  @Shared(.appStorage("count")) var count = 42
  count = 42  // NB: Set again to override any value set by the app target.

  // Shared state will be 42 for all features using it.
  let store = TestStore(…)
}
```

#### UI 테스트

앱 UI 테스트를 할 때는 공유 상태가 앱 실행 간에 남지 않도록 특히 주의해야 해요. 한 테스트가 다른 테스트에 영향을 주면 항상 통과하는 결정적인 테스트를 작성하기 어려워져요. 이를 해결하려면 UI 테스트 타깃에서 환경 값을 설정하고, 앱 타깃에서 그 값이 있으면 `defaultAppStorage`, `defaultFileStorage` 의존성을 메모리 저장소로 재정의하세요. 그러면 절대 저장하지 않아요.

```swift
@main
struct EntryPoint: App {
  let store = Store(initialState: AppFeature.State()) {
    AppFeature()
  } withDependencies: {
    if ProcessInfo.processInfo.environment["UITesting"] == "true" {
      $0.defaultAppStorage = UserDefaults(
        suiteName:"\(NSTemporaryDirectory())\(UUID().uuidString)"
      )!
      $0.defaultFileStorage = .inMemory
    }
  }
}
```

#### 테스트 팁

공유 상태를 사용하는 기능 테스트를 더 견고하게 만들고, 리팩터링할 때 생길 수 있는 문제를 더 많이 잡는 방법이 있어요. 지금 `@Shared(.appStorage("count"))`를 사용하는 두 기능이 있다고 해 볼게요.

```swift
@Reducer
struct Feature1 {
  struct State {
    @Shared(.appStorage("count")) var count = 0
  }
  // ...
}

@Reducer
struct Feature2 {
  struct State {
    @Shared(.appStorage("count")) var count = 0
  }
  // ...
}
```

그리고 버튼을 탭했을 때 count 하나가 증가함을 증명하는 테스트를 작성했다고 해 볼게요.

```swift
await store.send(.feature1(.buttonTapped)) {
  $0.feature1.count = 1
}
```

두 기능 모두 `@Shared`를 사용하므로 두 count가 동기화된다는 것을 보장할 수 있고, `feature2.count`까지 단언할 필요는 없어요.

하지만 언젠가 길고 복잡한 리팩터링 중 실수로 두 번째 기능에서 `@Shared`를 제거하면 어떻게 될까요?

```swift
@Reducer
struct Feature2 {
  struct State {
    var count = 0
  }
  // ...
}
```

모든 코드가 계속 컴파일되고 테스트도 통과하지만, 두 상태가 더 이상 동기화되지 않는 버그가 생겼을 수 있어요.

기술적으로 필요하지 않더라도 기능의 모든 공유 상태를 강제로 단언해 이 문제를 해결할 수도 있어요.

```swift
await store.send(.feature1(.buttonTapped)) {
  $0.feature1.count = 1
  $0.feature2.count = 1
}
```

이런 버그가 걱정된다면 `TestStore`의 `send` trailing closure에 넘겨지는 인자에서 공유 상태를 단언하지 말고, 테스트에서 공유 상태 참조를 캡처한 뒤 trailing closure 안에서 변경해 테스트를 더 견고하게 만들 수 있어요.

```swift
@Test
func increment() async {
  @Shared(.appStorage("count")) var count = 0
  let store = TestStore(initialState: ParentFeature.State()) {
    ParentFeature()
  }

  await store.send(.feature1(.buttonTapped)) {
    // Mutate $0 to expected value.
    count = 1
  }
}
```

이 방식은 기능 중 하나에서 실수로 `@Shared`를 제거하면 실패해요.

더 나아가 모든 `@Shared` 프로퍼티를 `fileprivate`으로 만들어 파일 범위 밖에서는 절대 변경할 수 없게 하면 이 패턴을 코드베이스 전체에 강제할 수 있어요.

```swift
struct State {
  @Shared(.appStorage("count")) fileprivate var count = 0
}
```

## 읽기 전용 공유 상태

앞에서 설명한 `@Shared` 프로퍼티 래퍼는 읽고 쓸 수 있는 공유 상태 조각에 접근하게 해 줘요. 이것이 가장 흔한 사용 사례이지만, 쓸 수 없거나 쓰는 것이 의미 없는 공유 상태 접근을 표현하고 싶을 때도 있어요.

그럴 때는 `@SharedReader` 프로퍼티 래퍼를 사용하세요. 애플리케이션의 여러 부분과 공유하는 상태 조각의 참조를 나타내지만, 쓸 수는 없어요. 앞에서 설명한 모든 영속 전략은 `SharedReader`와 함께 동작하지만, 상태를 변경하려 하면 컴파일 오류가 나요.

```swift
@SharedReader(.appStorage("isOn")) var isOn = false
isOn = true  // 🛑
```

읽기와 구독만 있고 쓸 수 없는 사용자 정의 영속 전략도 만들 수 있어요. 이때는 전체 `SharedKey` 프로토콜 대신 `SharedReaderKey` 프로토콜만 준수하세요.

예를 들어 서버가 보관하는 원격 구성 파일을 로드하고 구독해 자동 동기화하는 `.remoteConfig` 전략을 만들 수 있어요.

```swift
@SharedReader(.remoteConfig) var remoteConfig
```

## 타입 안전 키

외부 시스템에 데이터를 저장하는 특성상, 앱과 영속 저장소 사이에서 데이터를 주고받을 때 타입 안전성 일부를 잃게 돼요. 예를 들어 파일 저장소 전략으로 사용자 배열을 디스크에 저장한다면 다음처럼 작성할 수 있어요.

```swift
extension URL {
  static let users = URL(/* ... */)
}

@Shared(.fileStorage(.users)) var users: [User] = []
```

그리고 앱의 여러 위치에서 이 파일 저장소 users를 사용한다고 해 볼게요.

하지만 나중에 이 데이터를 일반 배열 대신 식별 배열로 리팩터링하고 싶어질 수 있어요.

```swift
// Somewhere else in the application
@Shared(.fileStorage(.users)) var users: IdentifiedArrayOf<User> = []
```

공유 사용자 배열을 모두 새 식별 배열로 바꾸는 것을 잊어도 앱은 계속 컴파일되지만 동작은 깨져요. 두 저장소 타입이 상태를 공유하지 않아요.

이 과정에 타입 안전성과 재사용성을 더하려면 `SharedReaderKey` 프로토콜을 확장해 영속성 세부 정보를 나타내는 정적 변수를 추가하세요.

```swift
extension SharedReaderKey where Self == FileStorageKey<IdentifiedArrayOf<User>> {
  static var users: Self {
    fileStorage(.users)
  }
}
```

이제 `@Shared`를 사용할 때 `.fileStorage` 없이 이 키를 직접 지정할 수 있어요.

```swift
@Shared(.users) var users: IdentifiedArrayOf<User> = []
```

타입이 키에 포함됐으므로 잘못된 타입을 실수로 사용할 수 없고 즉시 컴파일 오류가 나요.

```swift
@Shared(.users) var users = [User]()
```

> 🛑 오류: Cannot convert value of type '[User]' to expected argument type 'IdentifiedArrayOf<User>'

이 기법은 모든 영속 전략 타입에 적용돼요. 예를 들어 타입 안전한 `.inMemory` 키는 다음처럼 만들어요.

```swift
extension SharedReaderKey where Self == InMemoryKey<IdentifiedArrayOf<User>> {
  static var users: Self {
    inMemory("users")
  }
}
```

타입 안전한 `.appStorage` 키도 다음처럼 만들 수 있어요.

```swift
extension SharedReaderKey where Self == AppStorageKey<Int> {
  static var count: Self {
    appStorage("count")
  }
}
```

이 기법은 [사용자 정의 영속성](#사용자-정의-영속성) 전략에도 적용돼요.

또한 다음처럼 공유 값의 기본값을 키에 포함할 수도 있어요.

```swift
extension SharedReaderKey where Self == FileStorageKey<IdentifiedArrayOf<User>>.Default {
  static var users: Self {
    Self[.fileStorage(.users), default: []]
  }
}
```

이제 공유 users 상태를 참조할 때 기본값을 생략할 수 있고 타입 표기도 생략할 수 있어요.

```swift
@Shared(.users) var users
```

## Observation 이전 앱의 공유 상태

`ObservableState()` 매크로처럼 1.7에서 출시한 observation 도구로 아직 업데이트하지 않은 기능에서도 `@Shared`를 사용할 수 있어요. reducer에서는 observation 도구 사용 여부와 관계없이 `@Shared`를 쓸 수 있어요.

하지만 iOS 16 이하를 지원하고 뷰에서 공유 상태에 접근한다면 `WithPerceptionTracking`을 사용해야 해요. 예를 들어 다음 뷰는요.

```swift
struct FeatureView: View {
  let store: StoreOf<Feature>

  var body: some View {
    Form {
      Text(store.sharedCount.description)
    }
  }
}
```

`sharedCount`가 바뀌어도 제대로 갱신되지 않아요. 또한 문제가 있음을 알려 주는 런타임 경고가 발생해요.

> 🟣 런타임 경고: Perceptible state was accessed but is not being tracked. Track changes to state by wrapping your view in a 'WithPerceptionTracking' view.

해결하려면 뷰의 body를 `WithPerceptionTracking`으로 감싸세요.

```swift
struct FeatureView: View {
  let store: StoreOf<Feature>

  var body: some View {
    WithPerceptionTracking {
      Form {
        Text(store.sharedCount.description)
      }
    }
  }
}
```

## `@Shared`의 주의점

Composable Architecture에서 공유 상태를 사용할 때 알아둘 몇 가지 주의점이 있어요.

#### Hashability

`@Shared` 타입은 감싼 값으로 동등성을 비교하고, 이 값은 참조에 보관되어 시간이 지나며 바뀔 수 있어 hashable일 수 없어요. 따라서 `@Shared` 프로퍼티가 있는 타입도 공유 값으로 해시를 계산하면 안 돼요.

#### Codability

`@Shared` 타입은 조건부로 인코드하거나 디코드할 수 없어요. 감싼 값의 진실의 원천이 로컬에 있는 경우가 드물기 때문이에요. 다른 공유 값에서 파생했을 수도 있고, 지원 영속 전략에서 값을 로드해야 할 수도 있어요.

인코드하거나 디코드하는 데이터 타입에 공유 상태를 도입할 때는 적절한 작업을 수행하는 `encode(to:)`, `init(from:)` 구현을 직접 제공해야 해요.

예를 들어 데이터 타입이 영속 전략으로 상태를 공유한다면, 프로퍼티 래퍼 영속 전략에서 공유 값을 암묵적으로 로드하는 memberwise 이니셜라이저에 디코드를 위임할 수 있어요. 또는 공유 값을 명시적으로 초기화할 수 있어요. 인코드할 때는 공유 값 인코딩을 건너뛸 수 있는 경우가 많아요.

```swift
struct AppState {
  @Shared(.appStorage("launchCount")) var launchCount = 0
  var todos: [String] = []
}

extension AppState: Codable {
  enum CodingKeys: String, CodingKey { case todos }

  init(from decoder: any Decoder) throws {
    let container = try decoder.container(keyedBy: CodingKeys.self)

    // Use the property wrapper default via the memberwise initializer:
    try self.init(
      todos: container.decode([String].self, forKey: .todos)
    )

    // Or initialize the shared storage manually:
    self._launchCount = Shared(wrappedValue: 0, .appStorage("launchCount"))
    self.todos = try container.decode([String].self, forKey: .todos)
  }

  func encode(to encoder: any Encoder) throws {
    var container = encoder.container(keyedBy: CodingKeys.self)
    try container.encode(self.todos, forKey: .todos)
    // Skip encoding the launch count.
  }
}
```

#### 테스트

공유 프로퍼티는 Composable Architecture 테스트 도구와 호환되지만, effect가 여러 액션을 받을 때 단언이 특정 액션과 직접 일치하지 않을 수 있어요.

`tap` 액션이 effect를 시작하고, effect가 `response`를 반환한 뒤 공유 상태를 변경하는 간단한 예를 살펴볼게요.

```swift
@Reducer
struct Feature {
  struct State: Equatable {
    @Shared(value: false) var bool
  }
  enum Action {
    case tap
    case response
  }
  var body: some ReducerOf<Self> {
    Reduce { state, action in
      switch action {
      case .tap:
        return .run { send in
          await send(.response)
        }
      case .response:
        state.$bool.withLock { $0.toggle() }
        return .none
      }
    }
  }
}
```

이 변경은 테스트 Store가 `response` 액션을 받을 때 단언할 것으로 기대하지만, 다음은 실패해요.

```swift
// ❌ State was not expected to change, but a change occurred: …
//
//     Feature.State(
//   -   _shared: #1 false
//   +   _shared: #1 true
//     )
//
// (Expected: −, Actual: +)
await store.send(.tap)

// ❌ Expected state to change, but no change occurred.
await store.receive(.response) {
  $0.$bool.withLock { $0 = true }
}
```

이는 `@Shared`보다 먼저 존재한 `TestStore` 구현 세부 사항 때문이에요. 테스트 Store는 단언하기 **전**에 받은 모든 액션을 즉시 처리해요. 따라서 공유 상태 변경은 항상 첫 번째 액션에서 단언해야 해요.

```swift
await store.send(.tap) {  // ✅
  $0.$bool.withLock { $0 = true }
}

// ❌ Expected state to change, but no change occurred.
await store.receive(.response)  // ✅
```

향후 Composable Architecture의 다음 메이저 버전에서는, 상태를 변경한 액션에서 공유 상태 변경을 단언할 수 있게 하는 호환성 깨지는 변경을 도입할 수 있을 거예요.
