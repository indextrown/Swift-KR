---
title: Swift로 이해하는 Singleton 패턴
description: Swift의 static let으로 Singleton을 구현하고, 공유 인스턴스·전역 상태·스레드 안전성·의존성 주입의 차이와 올바른 적용 기준을 설명합니다.
---

# Swift로 이해하는 Singleton 패턴

> **면접 답변 한 줄 요약:** Singleton 패턴은 프로그램 전체에서 특정 타입의 객체를 하나만 만들도록 제한하고, 어디서나 같은 객체에 접근할 공통 지점을 제공하는 설계 패턴이에요.

Singleton은 한국어로 **싱글턴 패턴**이라고 불러요. `SomeType.shared` 형태가 익숙해서 구현은 쉬워 보이지만, 객체의 개수와 접근 방법이라는 두 가지 책임을 함께 다뤄요. 특히 어디서나 직접 접근할 수 있다는 특성은 편리함과 함께 숨은 의존성과 전역 상태 문제를 만들 수 있어요.

## 먼저 알아둘 설계 용어

| 용어             | 쉬운 뜻                                                                                             |
| ---------------- | --------------------------------------------------------------------------------------------------- |
| 인스턴스(객체)   | 타입이라는 설계도로 실제 만들어 메모리에서 사용하는 값이에요.                                       |
| 생성 패턴        | 객체를 어떤 방식으로 만들고 제공할지 다루는 디자인 패턴이에요.                                      |
| 전역 접근 지점   | 애플리케이션의 여러 위치에서 같은 경로로 접근할 수 있는 이름이에요. `AppLogger.shared`가 한 예예요. |
| 공유 인스턴스    | 여러 코드가 함께 사용하는 하나의 객체예요. 추가 인스턴스 생성을 반드시 막는다는 뜻은 아니에요.      |
| 타입 프로퍼티    | 개별 인스턴스가 아니라 타입 자체에 속하는 프로퍼티예요. Swift에서는 주로 `static`으로 선언해요.     |
| `static let`     | 타입에 속하면서 한 번 정해지면 바꿀 수 없는 프로퍼티를 선언하는 Swift 문법이에요.                   |
| `private init()` | 타입 바깥에서 이니셜라이저를 호출해 새 객체를 만들지 못하게 제한하는 선언이에요.                    |
| 전역 상태        | 프로그램의 여러 위치에서 읽거나 바꿀 수 있고 실행 결과에 영향을 주는 공유 값이에요.                 |
| 스레드 안전성    | 여러 실행 흐름이 동시에 접근해도 데이터가 깨지거나 예측하지 못한 결과가 생기지 않는 성질이에요.     |
| actor            | 변경 가능한 상태에 한 번에 하나의 작업만 접근하도록 격리하는 Swift 동시성 타입이에요.               |
| 의존성 주입      | 객체가 필요한 대상을 내부에서 직접 찾지 않고 외부에서 전달받는 설계 방법이에요.                     |
| Service Locator  | 여러 공유 객체를 한 저장소에 두고 사용하는 코드가 직접 찾아가는 설계 방식이에요.                    |

이 문서에서는 다음 내용을 설명해요.

- Singleton을 구성하는 두 가지 조건
- Swift에서 `static let`과 `private init`을 사용하는 이유
- Singleton과 공유 인스턴스의 차이
- 전역 접근이 테스트와 변경을 어렵게 만드는 이유
- 의존성 주입과 actor를 함께 사용하는 방법
- Singleton이 적합한 경우와 피해야 하는 경우

## Singleton은 하나의 인스턴스와 공통 접근 지점을 보장해요

Singleton 패턴은 다음 두 조건을 함께 만족해요.

1. 특정 타입의 인스턴스를 하나만 만들 수 있어요.
2. 프로그램의 여러 위치에서 그 인스턴스에 접근할 수 있어요.

Apple의 보관된 [Cocoa Design Patterns](https://developer.apple.com/library/archive/documentation/Cocoa/Conceptual/CocoaFundamentals/CocoaDesignPatterns/CocoaDesignPatterns.html) 문서도 Singleton을 하나의 인스턴스와 전역 접근 지점을 제공하는 패턴으로 설명해요. 이 문서는 오래된 Cocoa 구현도 포함하므로 패턴의 개념적 배경으로 참고하고, 실제 Swift 구현은 최신 언어 문서를 기준으로 살펴볼게요.

## Swift에서는 static let과 private init으로 구현해요

애플리케이션 전체에서 같은 로거를 사용한다고 해 볼게요.

```swift
final class AppLogger {
  static let shared = AppLogger()

  private init() {}

  func log(_ message: String) {
    print("[App] \(message)")
  }
}
```

각 선언은 서로 다른 역할을 해요.

- `static let shared`는 타입에 하나의 공유 프로퍼티를 만들어요.
- `private init()`은 타입 외부에서 `AppLogger()`를 호출하지 못하게 해요.
- `final`은 서브클래스를 통한 다른 생성 경로를 막고 의도를 분명하게 해요.

호출하는 코드는 어디서나 같은 접근 지점을 사용해요.

```swift
AppLogger.shared.log("주문을 시작합니다.")
```

Swift의 저장 타입 프로퍼티는 처음 접근할 때 초기화되고, 여러 스레드가 동시에 접근하더라도 한 번만 초기화돼요. 자세한 규칙은 Swift 공식 문서의 [Properties](https://docs.swift.org/swift-book/documentation/the-swift-programming-language/properties/)에서 확인할 수 있어요.

## static let이 객체 내부 상태까지 안전하게 만들지는 않아요

`static let`이 보장하는 것은 `shared` 프로퍼티의 **초기화가 한 번만 일어난다**는 점이에요. Singleton 내부의 변경 가능한 값까지 자동으로 스레드 안전해지는 것은 아니에요.

```swift
final class VisitCounter {
  static let shared = VisitCounter()

  private var count = 0

  private init() {}

  func increment() {
    count += 1
  }
}
```

여러 실행 흐름이 `increment()`를 동시에 호출하면 `count` 변경이 충돌할 수 있어요. 공유하는 상태라면 동시 접근 방법도 함께 설계해야 해요.

Swift 동시성에서는 actor로 상태를 격리할 수 있어요.

```swift
actor VisitCounter {
  static let shared = VisitCounter()

  private var count = 0

  private init() {}

  func increment() {
    count += 1
  }

  func currentCount() -> Int {
    count
  }
}
```

호출하는 쪽에서는 actor의 격리된 메서드에 `await`로 접근해요.

```swift
await VisitCounter.shared.increment()
let count = await VisitCounter.shared.currentCount()
```

actor는 데이터 경쟁을 막는 데 도움을 주지만, 전역 접근과 숨은 의존성 문제까지 해결하지는 않아요.

## 공유 인스턴스가 항상 엄격한 Singleton은 아니에요

`shared`나 `default`라는 이름의 프로퍼티가 있다고 해서 항상 추가 인스턴스를 만들 수 없는 것은 아니에요.

| 형태                 | 인스턴스 생성                                                      | 예                                         |
| -------------------- | ------------------------------------------------------------------ | ------------------------------------------ |
| 엄격한 Singleton     | 외부 생성을 막아 하나만 허용해요.                                  | `private init()`을 가진 `AppLogger.shared` |
| 공유 기본 인스턴스   | 편리한 기본 객체를 제공하지만 필요하면 별도 객체도 만들 수 있어요. | `FileManager.default`, `URLSession.shared` |
| 단순한 타입 프로퍼티 | 타입에 값이 하나 있지만 객체 생성 패턴은 아닐 수 있어요.           | `static let maximumCount = 10`             |

Apple의 [`FileManager.default`](https://developer.apple.com/documentation/foundation/filemanager/default)는 프로세스에서 같은 파일 관리자를 돌려주지만, delegate가 필요하면 새 `FileManager` 인스턴스를 만들라고 안내해요. [`URLSession.shared`](https://developer.apple.com/documentation/foundation/urlsession/shared)도 기본 요청에는 편리하지만 설정과 delegate가 필요한 경우 별도 세션을 만들 수 있어요.

따라서 `shared`라는 이름보다 **추가 생성을 실제로 막는지**, 그리고 **하나만 있어야 하는 이유가 무엇인지**를 확인해야 해요.

## 어디서나 직접 호출하면 의존성이 숨겨져요

주문 서비스가 Singleton을 내부에서 직접 호출하는 코드를 볼게요.

```swift
final class OrderService {
  func submit() {
    AppLogger.shared.log("주문을 제출합니다.")
    // 실제 앱에서는 주문 API를 호출해요.
  }
}
```

`OrderService`의 이니셜라이저와 프로퍼티만 봐서는 로거가 필요하다는 사실이 드러나지 않아요. 코드를 안쪽까지 읽어야 `AppLogger.shared` 의존성을 발견할 수 있어요.

이 구조는 다음 문제를 만들 수 있어요.

- 테스트에서 로거를 기록용 구현으로 교체하기 어려워요.
- 테스트들이 같은 변경 가능한 상태를 공유하면 실행 순서에 영향을 받을 수 있어요.
- 미리보기, 테스트, 프로덕션에서 서로 다른 구현을 선택하기 어려워요.
- Singleton의 기능이 늘어날수록 많은 코드가 하나의 구체 타입에 묶여요.

Singleton의 존재 자체보다 **사용하는 객체가 전역 접근 지점을 직접 찾는 방식**이 결합을 키워요.

## Singleton도 의존성으로 주입할 수 있어요

먼저 사용하는 쪽이 필요한 동작을 프로토콜로 표현해요.

```swift
protocol Logging {
  func log(_ message: String)
}

extension AppLogger: Logging {}
```

`OrderService`는 구체 Singleton을 찾지 않고 외부에서 로거를 받아요.

```swift
final class OrderService {
  private let logger: any Logging

  init(logger: any Logging) {
    self.logger = logger
  }

  func submit() {
    logger.log("주문을 제출합니다.")
    // 실제 앱에서는 주문 API를 호출해요.
  }
}
```

프로덕션 조립 코드에서는 공유 인스턴스를 전달할 수 있어요.

```swift
let service = OrderService(
  logger: AppLogger.shared
)
```

이 구조에서도 `AppLogger`는 Singleton이에요. 하지만 `OrderService`는 전역 접근 지점을 직접 호출하지 않아요. 어떤 로거가 필요한지 이니셜라이저에 드러나고, 실행 환경에 따라 구현을 바꿀 수 있어요.

[의존성 주입](./dependency-injection.md)은 Singleton을 반드시 없애는 기법이 아니에요. 객체의 생성과 수명은 조립 코드가 관리하고, 사용하는 코드는 필요한 동작만 전달받게 할 수 있어요.

## 테스트에서는 공유 상태 대신 작은 구현을 사용해요

호출 내용을 기록하는 테스트용 로거를 만들어요.

```swift
private final class SpyLogger: Logging {
  private(set) var messages: [String] = []

  func log(_ message: String) {
    messages.append(message)
  }
}
```

테스트에서는 `AppLogger.shared` 대신 `SpyLogger`를 전달해요.

```swift
import Testing

@Test
func submitLogsMessage() {
  let logger = SpyLogger()
  let service = OrderService(logger: logger)

  service.submit()

  #expect(logger.messages == ["주문을 제출합니다."])
}
```

각 테스트가 자신의 로거를 만들기 때문에 다른 테스트가 남긴 전역 상태에 영향을 받지 않아요.

## Singleton, 전역 변수, Service Locator는 달라요

비슷해 보이는 개념을 역할에 따라 나눠 볼게요.

| 개념            | 핵심                                                              | 주의할 점                                                           |
| --------------- | ----------------------------------------------------------------- | ------------------------------------------------------------------- |
| Singleton       | 특정 타입의 인스턴스를 하나로 제한하고 공통 접근 지점을 제공해요. | 전역 접근이 숨은 의존성을 만들 수 있어요.                           |
| 공유 인스턴스   | 자주 쓰는 기본 객체를 제공해요.                                   | 추가 인스턴스를 만들 수 있으므로 엄격한 Singleton이 아닐 수 있어요. |
| 전역 변수       | 어디서나 읽거나 쓸 수 있는 값을 제공해요.                         | 타입이 객체 생성을 제어하지 않아요.                                 |
| Service Locator | 여러 서비스를 전역 저장소에서 이름이나 타입으로 찾아요.           | 실제 의존성이 이니셜라이저에 드러나지 않아요.                       |
| 의존성 주입     | 필요한 객체를 외부에서 전달해요.                                  | 조립 코드가 별도로 필요해요.                                        |

Singleton은 **객체의 개수와 접근 방식**에 관한 패턴이고, 의존성 주입은 **객체를 사용하는 코드에 제공하는 방법**이에요.

## 하나만 존재해야 한다는 요구부터 확인해야 해요

Singleton을 고려할 수 있는 상황은 다음과 같아요.

- 운영체제나 프로세스 수준에서 실제로 하나인 자원을 표현해요.
- 여러 인스턴스가 존재하면 의미적으로 잘못된 결과가 생겨요.
- 공유 객체가 불변이거나 내부 동시성 정책이 명확해요.
- 수명주기가 애플리케이션 전체와 같아요.
- 플랫폼이 제공하는 `UIApplication.shared` 같은 객체를 사용해요.

다음 상황에서는 다른 수명 관리 방식을 먼저 고려하세요.

- 현재 사용자, 장바구니, 화면 상태처럼 테스트마다 달라지는 값을 보관해요.
- 개발·테스트·미리보기 환경마다 구현을 바꿔야 해요.
- “전달하기 귀찮다”는 이유만으로 전역 접근을 추가하려고 해요.
- 초기화 순서나 종료 시점을 명시적으로 관리해야 해요.
- 여러 계정이나 여러 창처럼 나중에 인스턴스가 둘 이상 필요할 수 있어요.

Singleton은 접근이 쉬워서 사용 범위가 빠르게 넓어질 수 있어요. 정말 하나여야 하는 객체인지, 단지 현재 하나만 사용하고 있는 객체인지 구분해야 해요.

## 적용 순서를 정리해요

Singleton을 도입하거나 기존 Singleton을 점검할 때는 다음 순서로 살펴보세요.

1. 객체가 프로세스 전체에서 정말 하나만 존재해야 하는지 확인하세요.
2. 추가 인스턴스를 막아야 한다면 `private init()`으로 생성 경로를 제한하세요.
3. `static let`으로 한 번 초기화되는 공유 인스턴스를 제공하세요.
4. 변경 가능한 상태가 있다면 actor나 다른 동기화 방법을 설계하세요.
5. 사용하는 코드가 `.shared`를 직접 찾기보다 이니셜라이저로 받게 하세요.
6. 테스트에는 독립된 대역을 전달해 전역 상태 공유를 피하세요.
7. 요구가 바뀌어 여러 인스턴스가 필요해지면 Singleton 제약을 제거하세요.

## 면접에서 이어질 수 있는 질문

### Singleton 패턴의 두 가지 조건은 무엇인가요?

특정 타입의 인스턴스를 하나만 만들도록 제한하고, 프로그램의 여러 위치에서 그 인스턴스에 접근할 공통 지점을 제공해야 해요. 단순히 `static` 프로퍼티가 있다는 사실만으로는 엄격한 Singleton이라고 할 수 없어요.

### Swift에서 Singleton은 어떻게 구현하나요?

보통 `static let shared`로 공유 인스턴스를 만들고 `private init()`으로 외부 생성을 막아요. `final`을 사용하면 서브클래싱을 통한 다른 생성 경로도 제한할 수 있어요.

### static let은 스레드 안전한가요?

저장 타입 프로퍼티의 초기화는 여러 스레드에서 접근해도 한 번만 이루어져요. 하지만 공유 인스턴스 내부의 변경 가능한 상태까지 자동으로 안전해지는 것은 아니므로 actor나 적절한 동기화가 필요해요.

### Singleton과 의존성 주입은 함께 사용할 수 있나요?

가능해요. 앱의 조립 지점에서 Singleton 인스턴스를 만들거나 가져온 뒤, 사용하는 객체에는 프로토콜 타입으로 주입할 수 있어요. 이렇게 하면 수명은 하나로 유지하면서 숨은 의존성은 줄일 수 있어요.

### Singleton의 가장 큰 단점은 무엇인가요?

어디서나 직접 접근하면 의존성이 코드의 인터페이스에 드러나지 않고 변경 가능한 전역 상태를 공유하게 될 수 있어요. 그 결과 구현 교체, 병렬 테스트, 수명주기 관리가 어려워질 수 있어요.

## 참고 자료

- [Apple — Cocoa Design Patterns](https://developer.apple.com/library/archive/documentation/Cocoa/Conceptual/CocoaFundamentals/CocoaDesignPatterns/CocoaDesignPatterns.html)
- [The Swift Programming Language — Properties](https://docs.swift.org/swift-book/documentation/the-swift-programming-language/properties/)
- [The Swift Programming Language — Automatic Reference Counting](https://docs.swift.org/swift-book/documentation/the-swift-programming-language/automaticreferencecounting/)
- [Apple — FileManager.default](https://developer.apple.com/documentation/foundation/filemanager/default)
- [Apple — URLSession.shared](https://developer.apple.com/documentation/foundation/urlsession/shared)
