---
title: Swift로 이해하는 의존성 주입
description: Swift 코드로 의존성, 의존성 주입, 의존관계 역전 원칙의 차이와 생성자 주입을 이해하고 테스트 가능한 구조를 설계하는 방법을 설명합니다.
---

# Swift로 이해하는 의존성 주입

> **면접 답변 한 줄 요약:** 의존성 주입은 객체가 필요한 대상을 직접 만들지 않고 외부에서 전달받게 해서, 코드끼리 구체적인 구현을 아는 정도인 결합도를 낮추고 구현 교체와 테스트를 쉽게 만드는 설계 방식이에요.

의존성 주입(Dependency Injection, DI)을 이해하려면 몇 가지 설계 용어를 먼저 알아야 해요. 아래 정의는 이 문서에서 사용하는 뜻을 입문자 관점에서 간단히 정리한 것이에요.

## 먼저 알아둘 설계 용어

| 용어                  | 쉬운 뜻                                                                                                                                                                          |
| --------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 타입과 인스턴스(객체) | 타입은 데이터와 동작을 정의한 설계도이고, 인스턴스는 그 타입으로 실제 만들어 사용 중인 값이에요. `ProfileViewModel`은 타입이고 `ProfileViewModel(...)`로 만든 값은 인스턴스예요. |
| 구체 구현             | 실제 동작이 작성된 타입이에요. 서버와 통신하는 `LiveUserRepository`가 한 예예요.                                                                                                 |
| 추상화                | 구체적인 작동 방식은 감추고 여러 구현이 공통으로 지켜야 할 동작만 드러낸 약속이에요.                                                                                             |
| 프로토콜              | 타입이 제공해야 할 프로퍼티와 메서드를 선언하는 Swift 문법이에요. 이 문서에서는 추상화를 표현하는 데 사용해요.                                                                   |
| 결합도                | 한 코드가 다른 코드의 구체적인 구현을 얼마나 많이 알고 의존하는지를 나타내요. 많이 알수록 변경의 영향도 커져요.                                                                  |
| 테스트 대역           | 테스트에서 네트워크나 데이터베이스 같은 실제 의존성을 대신하는 객체예요.                                                                                                         |
| stub, fake, mock      | 모두 테스트 대역의 종류예요. stub은 준비된 값을 돌려주고, fake는 단순하지만 실제로 동작하며, mock은 특정 호출이 일어났는지 검증하는 데 사용해요.                                 |

### SOLID는 다섯 가지 설계 원칙의 머리글자예요

SOLID는 객체 지향 코드를 변경하고 확장하기 쉽게 만드는 다섯 가지 설계 원칙을 묶어 부르는 이름이에요. Swift 문법이나 라이브러리가 아니며, 모든 코드에 기계적으로 적용해야 하는 규칙도 아니에요. SOLID에서 말하는 **인터페이스**는 Swift의 `protocol`처럼 구현이 지켜야 할 약속을 뜻해요.

- **S — 단일 책임 원칙(Single Responsibility Principle):** 타입이나 모듈이 변경되는 이유를 하나로 모아요.
- **O — 개방-폐쇄 원칙(Open-Closed Principle):** 기존 코드를 계속 고치기보다 새 구현을 추가해서 동작을 확장할 수 있게 설계해요.
- **L — 리스코프 치환 원칙(Liskov Substitution Principle):** 약속을 따르는 구현이라면 어떤 구현으로 바꿔도 사용하는 코드의 기대를 깨뜨리지 않아야 해요.
- **I — 인터페이스 분리 원칙(Interface Segregation Principle):** 하나의 큰 약속보다 사용하는 쪽에 필요한 작은 약속으로 나눠요.
- **D — 의존관계 역전 원칙(Dependency Inversion Principle):** 중요한 정책과 세부 구현이 구체 타입이 아니라 추상화에 의존하게 해요.

이 문서에서는 다섯 원칙을 모두 적용하는 방법을 다루지 않아요. 의존성 주입과 직접 연결되는 **D, 의존관계 역전 원칙**을 중심으로 설명하고, 필요한 곳에서 인터페이스 분리 원칙도 함께 살펴봐요.

이제 출발점인 **객체가 필요한 것을 객체 밖에서 만들어 전달한다**는 원칙부터 살펴볼게요.

이 문서에서는 다음 내용을 Swift 코드로 설명해요.

- 의존성이 무엇인지
- 의존성 주입이 왜 필요한지
- 의존성 주입과 의존관계 역전 원칙이 어떻게 다른지
- 생성자 주입으로 코드를 바꾸는 방법
- 실제 구현을 테스트용 구현으로 교체하는 방법
- 의존성 주입을 적용하지 않아도 되는 경우

## 의존성은 코드를 실행하는 데 필요한 대상이에요

한 타입이 자신의 일을 하기 위해 사용하는 다른 값이나 기능을 **의존성**이라고 해요. 서버에서 사용자를 가져오는 객체라면 네트워크 클라이언트가 의존성이에요. 현재 시각, UUID, 파일 시스템, 데이터베이스도 모두 의존성이 될 수 있어요.

```swift
struct WelcomeMessage {
  func makeMessage() -> String {
    let hour = Calendar.current.component(.hour, from: Date())
    return hour < 12 ? "좋은 아침이에요" : "안녕하세요"
  }
}
```

이 코드는 다른 객체를 생성하지 않지만 `Date()`와 `Calendar.current`에 의존해요. 실행 시각에 따라 결과가 달라지므로 테스트에서 원하는 상황을 만들기 어려워요.

의존성은 잘못된 것이 아니에요. 애플리케이션이 외부 세계와 상호작용하려면 의존성이 필요해요. 중요한 점은 **의존성을 알고 제어할 수 있는가**예요. Point-Free의 [What are dependencies?](https://swiftpackageindex.com/pointfreeco/swift-dependencies/main/documentation/dependencies/whataredependencies) 문서도 네트워크뿐 아니라 날짜, UUID, clock처럼 결과를 바꾸는 외부 요소를 의존성으로 다뤄요.

## 직접 생성하면 구현과 사용이 묶여요

사용자 이름을 가져오는 화면 모델을 만들어 볼게요.

```swift
struct LiveUserRepository {
  func fetchName() async throws -> String {
    // 실제 앱에서는 서버에서 사용자 정보를 가져와요.
    "Blob"
  }
}

@MainActor
final class ProfileViewModel {
  private let repository = LiveUserRepository()
  private(set) var name = ""

  func load() async throws {
    name = try await repository.fetchName()
  }
}
```

`ProfileViewModel`은 `LiveUserRepository`를 직접 만들어요. 코드는 짧지만 두 책임이 한곳에 섞였어요.

1. `ProfileViewModel`은 사용자 이름을 언제 불러올지 결정해요.
2. 동시에 어떤 저장소 구현을 사용할지도 결정해요.

이 구조에서는 테스트도 실제 구현을 사용해요. 실제 구현이 네트워크에 연결된다면 테스트 속도와 결과가 네트워크 상태에 영향을 받아요. 실패 상황이나 특정 응답도 쉽게 만들 수 없어요.

Apple도 테스트를 방해하는 구체 타입과의 결합을 줄이고, 실제 구현을 stub으로 바꿀 수 있도록 프로토콜과 의존성 주입을 사용하라고 [테스트를 위한 코드 개선 문서](https://developer.apple.com/documentation/xcode/updating-your-existing-codebase-to-accommodate-unit-tests)에서 안내해요.

## 외부에서 전달하면 의존성 주입이에요

가장 작은 변화는 저장소를 이니셜라이저로 받는 거예요.

```swift
@MainActor
final class ProfileViewModel {
  private let repository: LiveUserRepository
  private(set) var name = ""

  init(repository: LiveUserRepository) {
    self.repository = repository
  }

  func load() async throws {
    name = try await repository.fetchName()
  }
}
```

이제 `ProfileViewModel`은 저장소를 직접 만들지 않아요. 호출하는 쪽이 저장소를 만들어 전달해요.

```swift
let viewModel = ProfileViewModel(repository: LiveUserRepository())
```

이 코드도 의존성 주입이에요. **프로토콜을 사용해야만 의존성 주입이 되는 것은 아니에요.** 구체 타입이라도 외부에서 전달받으면 의존성을 주입한 거예요.

다만 `ProfileViewModel`은 여전히 `LiveUserRepository`라는 구체 구현만 받을 수 있어요. 테스트용 구현으로 교체하려면 한 단계 더 나아가야 해요.

## 프로토콜로 필요한 동작만 표현해요

Swift 프로토콜은 타입이 제공해야 할 프로퍼티와 메서드를 정의해요. 구체 타입은 요구사항을 구현해서 프로토콜을 따를 수 있어요. 자세한 언어 규칙은 Swift 공식 문서의 [Protocols](https://docs.swift.org/swift-book/documentation/the-swift-programming-language/protocols/)에서 확인할 수 있어요.

화면 모델이 실제로 필요한 동작은 “사용자 이름 가져오기” 하나예요. 이 요구사항을 프로토콜로 표현해요.

```swift
protocol UserRepository: Sendable {
  func fetchName() async throws -> String
}

struct LiveUserRepository: UserRepository {
  func fetchName() async throws -> String {
    // 실제 앱에서는 서버에서 사용자 정보를 가져와요.
    "Blob"
  }
}
```

`ProfileViewModel`은 구체 구현 대신 프로토콜에 의존해요.

```swift
@MainActor
final class ProfileViewModel {
  private let repository: any UserRepository
  private(set) var name = ""

  init(repository: any UserRepository) {
    self.repository = repository
  }

  func load() async throws {
    name = try await repository.fetchName()
  }
}
```

`any UserRepository`에는 `UserRepository`를 따르는 어떤 타입이든 전달할 수 있어요. 프로덕션에서는 실제 구현을 전달해요.

```swift
let viewModel = ProfileViewModel(repository: LiveUserRepository())
```

구현을 선택하고 객체를 조립하는 위치를 **컴포지션 루트(composition root)**라고 불러요. SwiftUI 앱이라면 `App`, Scene, 최상위 View처럼 애플리케이션이 시작되는 지점이 컴포지션 루트가 될 수 있어요. 객체를 사용하는 코드와 객체를 조립하는 코드를 나누면 실행 환경에 맞는 구현을 한곳에서 선택할 수 있어요.

Martin Fowler도 [의존성 주입 패턴을 설명한 글](https://martinfowler.com/articles/injection.html)에서 서비스의 설정과 사용을 분리하는 점을 핵심으로 다뤄요.

## 테스트에서는 작은 구현을 주입해요

테스트용 저장소는 네트워크에 연결하지 않고 준비된 값을 반환해요.

```swift
private struct StubUserRepository: UserRepository {
  let name: String

  func fetchName() async throws -> String {
    name
  }
}
```

Swift Testing에서는 이 stub을 `ProfileViewModel`에 전달해요.

```swift
import Testing
@testable import MyApp

@Test
@MainActor
func loadProfile() async throws {
  let repository = StubUserRepository(name: "Blob")
  let viewModel = ProfileViewModel(repository: repository)

  try await viewModel.load()

  #expect(viewModel.name == "Blob")
}
```

이 테스트는 실제 서버나 네트워크 상태에 의존하지 않아요. 원하는 값을 즉시 반환하므로 빠르고 결과가 일정해요. 실패하는 구현을 따로 만들면 오류 처리도 같은 방식으로 검증할 수 있어요.

## 의존성 주입과 의존관계 역전은 달라요

비슷한 용어를 역할에 따라 나누면 혼동이 줄어요.

| 개념                    | 답하는 질문                                   | 핵심                                                                 |
| ----------------------- | --------------------------------------------- | -------------------------------------------------------------------- |
| 의존성                  | 이 코드가 일하려면 무엇이 필요한가요?         | 다른 타입, 함수, 시간, 네트워크처럼 결과에 영향을 주는 대상이에요.   |
| 의존성 주입(DI)         | 필요한 대상을 어떻게 제공하나요?              | 객체 안에서 직접 만들지 않고 외부에서 전달해요.                      |
| 제어의 역전(IoC)        | 생성과 흐름을 누가 제어하나요?                | 객체가 하던 선택이나 제어를 프레임워크 또는 외부 조립 코드가 맡아요. |
| 의존관계 역전 원칙(DIP) | 소스 코드의 의존 방향을 어디로 향하게 하나요? | 고수준 정책과 저수준 구현이 구체 타입이 아닌 추상화에 의존하게 해요. |

의존성 주입은 객체를 조립하는 **방법**이고, 의존관계 역전 원칙(Dependency Inversion Principle, DIP)은 모듈 사이의 의존 방향을 정하는 **설계 원칙**이에요.

Robert C. Martin은 [Design Principles and Design Patterns](https://staff.cs.utu.fi/~jounsmed/doos_06/material/DesignPrinciplesAndPatterns.pdf)에서 고수준 정책이 저수준 세부 구현에 직접 의존하지 않고, 양쪽 모두 추상화에 의존하도록 설계해야 한다고 설명해요. 세부 구현은 추상화가 정한 요구사항을 따르게 돼요.

앞의 코드를 의존 방향으로 표현하면 다음과 같아요.

```text
직접 의존

ProfileViewModel ───> LiveUserRepository ───> 네트워크


의존관계 역전

ProfileViewModel ───> UserRepository <─── LiveUserRepository
                            ^
                            └────────── StubUserRepository
```

`ProfileViewModel`은 사용자 이름을 불러오는 시점을 결정하는 고수준 정책이에요. 네트워크를 사용하는 `LiveUserRepository`는 세부 구현이에요. 둘 사이에 `UserRepository`를 두면 고수준 정책은 세부 구현을 몰라도 돼요.

프로토콜을 추가했다고 항상 의존관계 역전이 완성되는 것은 아니에요. 프로토콜에는 **사용하는 쪽이 필요한 최소 동작**이 들어가야 해요. 저수준 구현의 모든 기능을 그대로 복사한 거대한 프로토콜은 결합을 다른 파일로 옮길 뿐이에요.

## Swift에서 주입하는 세 가지 방법

Martin Fowler는 의존성 주입을 생성자, setter, interface 방식으로 구분해요. Swift 앱 코드에서는 interface 주입보다 이니셜라이저와 프로퍼티를 통한 주입을 자주 사용하고, 작업 하나에만 필요한 의존성은 메서드 매개변수로 전달하기도 해요. 여기서는 실무에서 자주 만나는 세 가지 전달 위치를 살펴볼게요.

### 이니셜라이저 주입

```swift
struct ProfileService {
  let repository: any UserRepository

  init(repository: any UserRepository) {
    self.repository = repository
  }
}
```

필수 의존성에는 이니셜라이저 주입을 먼저 고려하세요.

- 객체가 만들어지는 순간 필요한 의존성을 모두 갖게 돼요.
- 프로퍼티를 `let`으로 선언할 수 있어요.
- 이니셜라이저만 봐도 필요한 의존성이 보여요.
- 의존성을 빼먹으면 컴파일 단계에서 알 수 있어요.

### 메서드 매개변수 주입

```swift
protocol ReportFormatting {
  func format(_ text: String) -> String
}

struct ReportExporter {
  func export(
    text: String,
    using formatter: any ReportFormatting
  ) -> String {
    formatter.format(text)
  }
}
```

특정 작업을 실행할 때만 필요한 의존성에는 메서드 매개변수가 잘 맞아요. 객체가 의존성을 오래 보관하지 않아도 되고, 호출마다 다른 구현을 전달할 수도 있어요.

### 프로퍼티 주입

```swift
protocol AnalyticsTracking {
  func track(_ event: String)
}

final class ProfileCoordinator {
  var analytics: (any AnalyticsTracking)?
}
```

객체를 만든 뒤 프로퍼티에 값을 넣는 방식이에요. 선택적인 기능이나 프레임워크 생명주기 때문에 나중에 설정해야 하는 값에 사용할 수 있어요.

필수 의존성을 프로퍼티로 주입하면 값이 들어오기 전의 불완전한 상태가 생겨요. 외부에서 의존성을 바꿀 수도 있으므로 기본 선택으로는 이니셜라이저 주입이 더 안전해요.

## 프로토콜 대신 클로저를 주입할 수도 있어요

필요한 동작이 하나뿐이라면 작은 클로저가 더 단순할 수 있어요.

```swift
struct WelcomeMessage {
  let currentHour: () -> Int

  func makeMessage() -> String {
    currentHour() < 12 ? "좋은 아침이에요" : "안녕하세요"
  }
}
```

프로덕션에서는 실제 시각을 전달해요.

```swift
let message = WelcomeMessage {
  Calendar.current.component(.hour, from: Date())
}
```

테스트에서는 고정된 시각을 전달할 수 있어요.

```swift
let message = WelcomeMessage(currentHour: { 9 })
```

여러 메서드가 하나의 역할을 이룬다면 프로토콜이 읽기 쉬워요. 동작 하나만 교체하면 된다면 클로저가 불필요한 타입을 줄여줘요.

## DI 컨테이너는 필수가 아니에요

의존성 주입은 설계 방식이고, DI 컨테이너는 객체 생성과 연결을 자동화하는 도구예요. Swift 코드에서 이니셜라이저로 직접 전달해도 의존성 주입은 완성돼요.

컨테이너는 객체 그래프가 크거나 생명주기를 한곳에서 관리해야 할 때 도움이 될 수 있어요. 반면 등록 키 오류, 실행 중에만 발견되는 설정 문제, 실제 의존성을 찾기 어려운 문제를 만들 수도 있어요. 작은 프로젝트에서는 명시적인 이니셜라이저 조립부터 시작하는 편이 이해하고 디버깅하기 쉬워요.

Service Locator도 의존성을 찾는 도구지만 의존성 주입과는 달라요.

```swift
final class ProfileViewModel {
  private let repository = ServiceLocator.shared.userRepository
}
```

이 코드의 의존성은 이니셜라이저에 드러나지 않아요. `ProfileViewModel`이 전역 locator를 직접 호출하므로 locator 자체에도 의존해요. 전역 상태를 테스트마다 바꾸면 테스트가 서로 영향을 줄 수도 있어요.

## 모든 의존성을 추상화하지 않아도 돼요

의존성 주입은 비용도 만들어요.

- 타입과 이니셜라이저가 늘어나요.
- 구현을 따라가려면 파일을 더 이동해야 할 수 있어요.
- 작은 코드에 추상화를 먼저 넣으면 구조만 복잡해질 수 있어요.
- 이니셜라이저 매개변수가 지나치게 많다면 타입의 책임이 너무 큰 신호일 수 있어요.

다음 질문 중 하나에 해당할 때 주입을 고려하세요.

- 테스트에서 실제 구현을 다른 구현으로 바꿔야 하나요?
- 네트워크, 데이터베이스, 파일, 시간, 난수처럼 외부 상태를 사용하나요?
- 실행 환경에 따라 구현이 달라지나요?
- 세부 구현의 변경이 핵심 비즈니스 로직까지 번지나요?
- 객체를 생성하는 책임과 사용하는 책임을 나누면 코드가 더 분명해지나요?

반대로 값이 단순하고 안정적이며 교체할 이유가 없다면 구체 타입을 그대로 사용해도 괜찮아요. 모든 타입마다 프로토콜을 만드는 것이 목표는 아니에요. **변화하거나 제어해야 하는 경계에 추상화를 두는 것**이 목표예요.

## 적용 순서를 정리해요

기존 코드를 의존성 주입 구조로 바꿀 때는 다음 순서로 진행하세요.

1. 타입 안에서 직접 생성하는 외부 대상을 찾으세요.
2. 테스트나 실행 환경에서 교체해야 하는 대상인지 판단하세요.
3. 사용하는 쪽에서 꼭 필요한 동작만 프로토콜이나 클로저로 표현하세요.
4. 필수 의존성은 이니셜라이저로 받으세요.
5. 앱의 시작 지점에서 실제 구현을 만들어 연결하세요.
6. 테스트에서는 stub이나 fake를 전달해 원하는 상황을 만드세요.

의존성 주입의 목적은 프로토콜 수를 늘리는 것이 아니에요. 코드가 사용하는 대상과 그 대상을 만드는 책임을 분리해서, 변화와 테스트를 제어하는 데 목적이 있어요.

## 면접에서 이어질 수 있는 질문

### 의존성 주입과 의존관계 역전은 같은가요?

같지 않아요. 의존성 주입은 필요한 객체를 외부에서 전달하는 방법이에요. 의존관계 역전은 고수준 정책과 저수준 구현이 추상화에 의존하도록 소스 코드의 의존 방향을 설계하는 원칙이에요. 추상화 타입을 이니셜라이저로 주입하면 두 개념을 함께 적용할 수 있어요.

### 생성자 주입을 선호하는 이유는 무엇인가요?

객체가 생성되는 순간 필수 의존성을 모두 갖게 하고, 의존성을 `let`으로 유지할 수 있기 때문이에요. 필요한 의존성이 이니셜라이저에 드러나므로 코드도 찾기 쉬워요.

### 의존성 주입의 장점은 무엇인가요?

구체 구현과 사용하는 코드를 분리할 수 있어요. 실행 환경에 따라 구현을 교체하기 쉽고, 테스트에서는 빠르고 결과가 일정한 대역을 사용할 수 있어요.

### 단점은 무엇인가요?

추상화와 조립 코드가 늘어나요. 작은 기능까지 무조건 분리하면 탐색 비용과 구조 복잡도가 커질 수 있어요. 변경 가능성과 테스트 필요성이 있는 경계부터 적용해야 해요.

## 참고 자료

- [The Swift Programming Language — Protocols](https://docs.swift.org/swift-book/documentation/the-swift-programming-language/protocols/)
- [Apple — Updating your existing codebase to accommodate unit tests](https://developer.apple.com/documentation/xcode/updating-your-existing-codebase-to-accommodate-unit-tests)
- [Martin Fowler — Inversion of Control Containers and the Dependency Injection pattern](https://martinfowler.com/articles/injection.html)
- [Robert C. Martin — Design Principles and Design Patterns](https://staff.cs.utu.fi/~jounsmed/doos_06/material/DesignPrinciplesAndPatterns.pdf)
- [Point-Free — What are dependencies?](https://swiftpackageindex.com/pointfreeco/swift-dependencies/main/documentation/dependencies/whataredependencies)
