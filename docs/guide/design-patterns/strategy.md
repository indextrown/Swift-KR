---
title: Swift로 이해하는 Strategy 패턴
description: Swift의 프로토콜과 클로저로 교체 가능한 알고리즘을 설계하고, 조건문·State 패턴·의존성 주입과의 차이 및 적용 기준을 설명합니다.
---

# Swift로 이해하는 Strategy 패턴

> **면접 답변 한 줄 요약:** Strategy 패턴은 바뀔 수 있는 계산 방법을 공통 약속 뒤에 각각 분리하고 실행할 방법을 외부에서 선택하게 해서, 사용하는 코드를 고치지 않고 동작을 교체하고 테스트할 수 있게 만드는 설계 패턴이에요.

Strategy는 한국어로 **전략 패턴**이라고 불러요. 여기서 전략은 거창한 사업 계획이 아니라, 같은 목적을 달성하는 여러 방법 중 하나를 뜻해요. 결제 금액에 할인을 적용하는 방법, 목록을 정렬하는 방법, 경로를 탐색하는 방법이 전략이 될 수 있어요.

## 먼저 알아둘 설계 용어

| 용어                | 쉬운 뜻                                                                                       |
| ------------------- | --------------------------------------------------------------------------------------------- |
| 알고리즘            | 입력을 받아 결과를 만드는 계산 절차예요. 이 문서에서는 할인 금액을 계산하는 방법을 뜻해요.    |
| 정책                | 상황에 따라 어떤 규칙을 적용할지 정한 기준이에요. 할인율이나 배송비 규칙이 한 예예요.         |
| 프로토콜            | 여러 타입이 제공해야 할 프로퍼티와 메서드를 정한 Swift의 약속이에요.                          |
| 클로저              | 실행할 코드를 값처럼 저장하고 전달할 수 있는 Swift 문법이에요.                                |
| Strategy            | 교체할 수 있도록 분리한 알고리즘 또는 정책이에요.                                             |
| Context             | Strategy를 받아 실제 작업에 사용하는 객체예요. 이 문서에서는 `PriceCalculator`가 Context예요. |
| Concrete Strategy   | 공통 약속을 실제로 구현한 Strategy예요. `NoDiscount`, `RateDiscount`가 이에 해당해요.         |
| 합성(composition)   | 상속받는 대신 다른 객체를 프로퍼티로 보관하고 함께 동작하게 만드는 방식이에요.                |
| `any` 프로토콜 타입 | 해당 프로토콜을 따르는 여러 구체 타입 중 하나를 실행 중에 담을 수 있는 Swift 타입 표현이에요. |
| 의존성 주입         | 객체가 필요한 대상을 내부에서 직접 만들지 않고 외부에서 전달받는 설계 방법이에요.             |
| Factory             | 사용할 객체를 선택하고 생성하는 책임을 맡은 코드나 객체예요.                                  |
| 제네릭              | 구체 타입을 나중에 정하면서도 타입 정보를 유지해 코드를 재사용하는 Swift 기능이에요.          |
| State 패턴          | 객체의 현재 상태가 바뀔 때 그 상태에 맞춰 행동도 바뀌게 만드는 설계 패턴이에요.               |

이 문서에서는 다음 내용을 설명해요.

- Strategy 패턴이 해결하는 문제
- 조건문을 Strategy로 분리하는 과정
- 프로토콜과 클로저 중에서 선택하는 기준
- 의존성 주입, State 패턴과의 차이
- Strategy를 테스트하는 방법
- 작은 조건문을 그대로 두어도 되는 경우

## Strategy는 바뀌는 계산 방법을 분리해요

쇼핑 앱에서 회원 등급에 따라 할인을 적용한다고 해 볼게요. 모든 등급은 최종 가격을 계산한다는 같은 목적을 가지지만 계산 방법은 달라요.

```text
정가 ──> 할인 없음 ───────> 최종 가격
     ├─> 10% 할인 ───────> 최종 가격
     └─> 20% 할인 ───────> 최종 가격
```

Strategy 패턴은 각 계산 방법을 별도 타입이나 값으로 만들어요. 가격을 사용하는 코드는 구체적인 할인 계산법을 직접 알지 않고, “할인을 적용한다”는 공통 약속만 사용해요.

Apple의 보관된 [Cocoa Design Patterns](https://developer.apple.com/library/archive/documentation/Cocoa/Conceptual/CocoaFundamentals/CocoaDesignPatterns/CocoaDesignPatterns.html) 문서도 Strategy를 객체마다 달라질 수 있는 동작을 분리하는 패턴으로 설명해요. 이 자료는 오래된 Cocoa 구현을 포함하므로 개념적 배경으로만 참고하고, Swift 문법은 최신 공식 문서를 기준으로 살펴볼게요.

## 조건문 안에 정책을 모으면 변경 이유가 섞여요

먼저 Strategy를 적용하지 않은 코드를 볼게요.

```swift
enum MemberGrade {
  case regular
  case premium
  case vip
}

struct PriceCalculator {
  func finalPrice(
    for price: Int,
    grade: MemberGrade
  ) -> Int {
    switch grade {
    case .regular:
      price
    case .premium:
      price * 90 / 100
    case .vip:
      price * 80 / 100
    }
  }
}
```

등급이 세 개뿐이라면 이 코드도 충분히 읽기 쉬워요. 문제는 할인 정책이 계속 복잡해질 때 나타나요.

- 특정 기간에는 추가 할인을 적용해야 할 수 있어요.
- VIP 할인에 최대 금액 제한이 생길 수 있어요.
- 화면 미리보기와 테스트에서 임시 정책을 사용하고 싶을 수 있어요.
- `PriceCalculator`가 가격 계산뿐 아니라 모든 회원 정책의 변경 이유까지 갖게 돼요.

새로운 등급을 추가할 때마다 같은 `switch`를 사용하는 여러 파일을 함께 수정해야 한다면 정책이 사용하는 코드에 흩어졌다는 신호예요.

## 프로토콜로 Strategy의 약속을 만들어요

화면이나 결제 코드가 필요한 동작은 “가격에 할인을 적용한다” 하나예요. 이를 프로토콜로 표현해요.

```swift
protocol DiscountStrategy {
  func apply(to price: Int) -> Int
}
```

Swift 프로토콜은 구현 타입이 제공해야 하는 요구사항을 정의해요. 자세한 문법은 Swift 공식 문서의 [Protocols](https://docs.swift.org/swift-book/documentation/the-swift-programming-language/protocols/)에서 확인할 수 있어요.

이제 할인 방법마다 Concrete Strategy를 만들어요.

```swift
struct NoDiscount: DiscountStrategy {
  func apply(to price: Int) -> Int {
    price
  }
}

struct RateDiscount: DiscountStrategy {
  let percent: Int

  func apply(to price: Int) -> Int {
    price * (100 - percent) / 100
  }
}
```

`NoDiscount`와 `RateDiscount`는 서로 다른 계산을 하지만 모두 `DiscountStrategy`라는 같은 약속을 지켜요.

## Context는 선택된 Strategy만 실행해요

`PriceCalculator`는 할인 정책을 직접 결정하지 않고 외부에서 받아요.

```swift
struct PriceCalculator {
  private let strategy: any DiscountStrategy

  init(strategy: any DiscountStrategy) {
    self.strategy = strategy
  }

  func finalPrice(for price: Int) -> Int {
    strategy.apply(to: price)
  }
}
```

프로덕션 코드는 상황에 맞는 Strategy를 선택해 전달해요.

```swift
let regularCalculator = PriceCalculator(
  strategy: NoDiscount()
)

let premiumCalculator = PriceCalculator(
  strategy: RateDiscount(percent: 10)
)

regularCalculator.finalPrice(for: 10_000) // 10_000
premiumCalculator.finalPrice(for: 10_000) // 9_000
```

이제 `PriceCalculator`는 회원 등급이나 할인율을 몰라요. 어떤 Strategy를 받더라도 같은 방식으로 실행해요. 새로운 할인 방식을 추가할 때 기존 Context를 수정하지 않고 새 Strategy를 만들 수 있어요.

## Strategy 선택 조건까지 없어지는 것은 아니에요

Strategy 패턴을 적용해도 어떤 구현을 사용할지 결정하는 코드는 필요해요.

```swift
func makeDiscountStrategy(
  for grade: MemberGrade
) -> any DiscountStrategy {
  switch grade {
  case .regular:
    NoDiscount()
  case .premium:
    RateDiscount(percent: 10)
  case .vip:
    RateDiscount(percent: 20)
  }
}
```

달라지는 점은 조건문의 **위치와 책임**이에요.

- `PriceCalculator`는 가격을 계산하는 흐름만 담당해요.
- 팩토리나 앱 시작 지점은 어떤 Strategy를 사용할지 선택해요.
- 각 Strategy는 자신의 계산 규칙만 담당해요.

조건문을 완전히 없애는 것이 목표가 아니에요. 선택하는 코드와 실행하는 코드를 분리해 변경이 한곳에 모이게 하는 것이 목표예요.

## 의존성 주입은 Strategy를 전달하는 방법이에요

앞의 `PriceCalculator`는 이니셜라이저로 Strategy를 전달받았어요. 이것은 [의존성 주입](./dependency-injection.md)이기도 해요.

| 개념          | 답하는 질문                          | 이 예제에서의 역할                                      |
| ------------- | ------------------------------------ | ------------------------------------------------------- |
| Strategy 패턴 | 바뀌는 알고리즘을 어떻게 분리하나요? | 할인 계산을 `DiscountStrategy` 구현으로 나눠요.         |
| 의존성 주입   | 필요한 대상을 어떻게 제공하나요?     | Strategy를 `PriceCalculator`의 이니셜라이저로 전달해요. |
| Factory       | 어떤 구현을 누가 생성하나요?         | 회원 등급에 맞는 Strategy를 선택하고 만들어요.          |

Strategy 패턴을 사용한다고 반드시 의존성 주입을 해야 하는 것은 아니지만, 외부에서 Strategy를 전달하면 선택과 실행을 분리하기 쉬워요.

## 동작 하나라면 클로저가 더 간단할 수 있어요

Strategy가 메서드 하나만 필요하고 별도 상태나 이름이 중요하지 않다면 클로저로 표현할 수 있어요.

```swift
struct ClosurePriceCalculator {
  let applyDiscount: (Int) -> Int

  func finalPrice(for price: Int) -> Int {
    applyDiscount(price)
  }
}
```

호출하는 쪽에서 계산 방법을 바로 전달해요.

```swift
let calculator = ClosurePriceCalculator { price in
  price * 85 / 100
}

calculator.finalPrice(for: 10_000) // 8_500
```

Swift의 함수와 클로저는 다른 값처럼 전달하고 프로퍼티에 저장할 수 있어요. 클로저의 캡처와 저장 규칙은 Swift 공식 문서의 [Closures](https://docs.swift.org/swift-book/documentation/the-swift-programming-language/closures/)에서 확인할 수 있어요.

프로토콜과 클로저는 다음 기준으로 선택할 수 있어요.

| 상황                                                 | 적합한 표현 |
| ---------------------------------------------------- | ----------- |
| 교체할 동작이 하나이고 구현이 짧아요.                | 클로저      |
| 여러 메서드와 값이 하나의 역할을 이뤄요.             | 프로토콜    |
| 구현에 의미 있는 이름을 붙여 여러 곳에서 재사용해요. | 프로토콜    |
| 호출 지점에서 작은 계산을 바로 전달하고 싶어요.      | 클로저      |

동작 하나를 위해 프로토콜과 타입을 여러 개 만드는 것이 항상 더 좋은 설계는 아니에요.

## 제네릭으로 구체 Strategy를 컴파일 시점에 정할 수 있어요

Strategy가 객체의 수명 동안 바뀌지 않는다면 제네릭도 사용할 수 있어요.

```swift
struct GenericPriceCalculator<Strategy: DiscountStrategy> {
  let strategy: Strategy

  func finalPrice(for price: Int) -> Int {
    strategy.apply(to: price)
  }
}
```

제네릭은 구체 Strategy 타입을 컴파일 시점에 알 수 있어요. 반면 `any DiscountStrategy`는 실행 중에 서로 다른 구현을 같은 프로퍼티에 담거나 교체하기 쉬워요. Swift 제네릭의 타입 제약은 공식 문서의 [Generics](https://docs.swift.org/swift-book/documentation/the-swift-programming-language/generics/)에서 자세히 설명해요.

입문 단계에서는 다음처럼 선택하면 충분해요.

- 여러 구현을 실행 중에 같은 저장 공간에 담아야 하면 `any DiscountStrategy`
- 구체 타입을 유지하고 실행 중 교체가 필요하지 않으면 제네릭
- 동작이 하나뿐이면 클로저

성능을 추측해 구조를 복잡하게 만들기보다 코드가 실제로 필요한 유연성을 먼저 확인하세요.

## 테스트에서는 원하는 Strategy를 바로 전달해요

각 Strategy는 작은 계산만 담당하므로 독립적으로 테스트할 수 있어요.

```swift
import Testing

@Test
func premiumDiscount() {
  let calculator = PriceCalculator(
    strategy: RateDiscount(percent: 10)
  )

  #expect(calculator.finalPrice(for: 10_000) == 9_000)
}
```

Context가 Strategy를 올바르게 호출하는지 확인하고 싶다면 테스트용 구현을 만들 수 있어요.

```swift
private struct FixedPriceStrategy: DiscountStrategy {
  let result: Int

  func apply(to price: Int) -> Int {
    result
  }
}

@Test
func calculatorUsesInjectedStrategy() {
  let calculator = PriceCalculator(
    strategy: FixedPriceStrategy(result: 1_000)
  )

  #expect(calculator.finalPrice(for: 10_000) == 1_000)
}
```

실제 할인 규칙이나 서버 상태와 무관하게 원하는 결과를 만들 수 있으므로 테스트가 빠르고 일정해져요.

## Strategy와 State는 교체 이유가 달라요

Strategy와 State는 여러 구현에 같은 동작을 요청한다는 점에서 코드 모양이 비슷할 수 있어요. 차이는 누가, 왜 구현을 바꾸는지에 있어요.

| 구분      | Strategy                                  | State                                         |
| --------- | ----------------------------------------- | --------------------------------------------- |
| 목적      | 같은 작업을 수행하는 알고리즘을 교체해요. | 객체의 현재 상태에 따라 행동을 바꿔요.        |
| 선택 주체 | 보통 외부 조립 코드나 호출자가 선택해요.  | 객체 내부의 상태 전이가 다음 행동을 결정해요. |
| 변경 시점 | 설정할 때 정하거나 필요할 때 교체해요.    | 사건을 처리하면서 상태가 계속 바뀔 수 있어요. |
| 예        | 할인 계산, 정렬, 압축 방식                | 재생 중·일시 정지·종료 상태                   |

단순한 회원 등급 값에 따라 계산 하나를 선택한다면 Strategy가 자연스러워요. 객체가 사건을 받으며 자신의 상태와 가능한 행동을 함께 바꾼다면 State 패턴을 검토할 수 있어요.

## 작은 조건문에는 적용하지 않아도 돼요

다음 상황에서는 Strategy를 고려해 보세요.

- 같은 목적의 알고리즘이 여러 개 있고 서로 독립적으로 바뀌어요.
- 긴 조건문이 계산 세부 사항까지 모두 포함해요.
- 실행 환경이나 사용자 설정에 따라 구현을 교체해야 해요.
- 알고리즘을 각각 테스트하거나 재사용해야 해요.
- Context가 구체 구현의 세부 정보를 너무 많이 알고 있어요.

반대로 다음과 같다면 `enum`과 `switch`가 더 명확할 수 있어요.

- 경우가 두세 개이고 규칙이 짧고 안정적이에요.
- 모든 경우를 한눈에 확인하는 것이 중요해요.
- 새 타입을 만드는 비용이 분리해서 얻는 이점보다 커요.
- 각 분기가 독립된 알고리즘이라기보다 하나의 작은 계산식이에요.

Strategy를 적용하면 타입과 조립 코드가 늘어나요. 조건문이 있다는 이유만으로 바로 패턴을 도입하지 말고, **변화하는 알고리즘을 독립적으로 다뤄야 하는가**를 먼저 판단하세요.

## 적용 순서를 정리해요

기존 조건문을 Strategy 구조로 바꿀 때는 다음 순서로 진행하세요.

1. 조건문 안에서 같은 목적을 가진 서로 다른 계산을 찾으세요.
2. 사용하는 쪽이 실제로 필요한 입력과 결과만 공통 약속으로 정의하세요.
3. 각 계산을 별도 타입이나 클로저로 옮기세요.
4. Context가 구체 구현 대신 공통 약속을 받게 하세요.
5. 앱의 조립 지점에서 상황에 맞는 Strategy를 선택하세요.
6. 각 Strategy와 Context를 독립적으로 테스트하세요.
7. 분리가 더 복잡하기만 하다면 작은 조건문으로 되돌리는 것도 고려하세요.

## 면접에서 이어질 수 있는 질문

### Strategy 패턴의 핵심은 무엇인가요?

바뀔 수 있는 알고리즘을 사용하는 코드에서 분리하고 공통 약속으로 캡슐화하는 것이 핵심이에요. Context는 구체 알고리즘을 몰라도 되므로 새로운 Strategy를 추가하거나 테스트용 구현으로 교체하기 쉬워져요.

### Strategy 패턴과 의존성 주입은 같은가요?

같지 않아요. Strategy는 교체 가능한 알고리즘을 설계하는 패턴이고, 의존성 주입은 그 Strategy 같은 의존성을 외부에서 전달하는 방법이에요. Strategy를 이니셜라이저로 주입하면 두 개념을 함께 적용할 수 있어요.

### 프로토콜 대신 클로저를 사용해도 되나요?

가능해요. 필요한 동작이 하나이고 구현이 짧다면 클로저가 더 간단할 수 있어요. 여러 메서드가 하나의 역할을 이루거나 구현에 이름과 상태가 필요하면 프로토콜이 읽기 쉬워요.

### Strategy를 사용하면 조건문이 모두 사라지나요?

아니요. 어떤 Strategy를 선택할지 결정하는 조건은 여전히 필요할 수 있어요. Strategy는 선택 조건을 Context의 계산 로직과 분리해 적절한 조립 위치로 옮겨요.

### Strategy 패턴의 단점은 무엇인가요?

Strategy 타입과 조립 코드가 늘어나고, 실제 동작을 찾기 위해 파일을 더 이동할 수 있어요. 알고리즘이 적고 거의 변하지 않는다면 단순한 `switch`가 더 명확할 수 있어요.

## 참고 자료

- [Apple — Cocoa Design Patterns](https://developer.apple.com/library/archive/documentation/Cocoa/Conceptual/CocoaFundamentals/CocoaDesignPatterns/CocoaDesignPatterns.html)
- [The Swift Programming Language — Protocols](https://docs.swift.org/swift-book/documentation/the-swift-programming-language/protocols/)
- [The Swift Programming Language — Closures](https://docs.swift.org/swift-book/documentation/the-swift-programming-language/closures/)
- [The Swift Programming Language — Generics](https://docs.swift.org/swift-book/documentation/the-swift-programming-language/generics/)
