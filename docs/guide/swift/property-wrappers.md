---
title: Swift로 이해하는 Property Wrapper
description: Swift Property Wrapper의 wrappedValue, 초기화 규칙, projectedValue와 저장 구조를 예제로 이해하고 재사용 가능한 프로퍼티 정책의 적용 기준을 설명합니다.
pageType: doc-wide
outline: false
---

# Swift로 이해하는 Property Wrapper

> **면접 답변 한 줄 요약:** Property Wrapper는 프로퍼티 값을 저장하고 읽고 쓰는 공통 규칙을 별도 타입의 `wrappedValue`로 정의해, 여러 프로퍼티에 같은 저장 정책을 `@Wrapper` 문법으로 재사용하는 Swift 기능이에요.

앱을 만들다 보면 할인율은 0~100 사이로 제한하고, 사용자 이름은 앞뒤 공백을 제거하고, 설정값은 특정 저장소에서 읽도록 만드는 규칙이 반복돼요. 각 프로퍼티에 계산 프로퍼티와 별도 저장 공간을 직접 작성할 수도 있지만, 같은 규칙을 여러 곳에서 유지하기는 어려워요.

Property Wrapper(프로퍼티 래퍼)는 프로퍼티의 **저장 공간과 접근 규칙**을 하나의 타입으로 묶어요. 이 문서에서는 할인율을 제한하는 작은 예제에서 시작해 `wrappedValue`, 초기화 문법, `_` 저장 공간, `$` 투영 값이 어떻게 연결되는지 단계적으로 설명해요.

## 먼저 알아둘 Property Wrapper 용어

| 용어                         | 쉬운 뜻                                                                                                                                                     |
| ---------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 저장 프로퍼티                | 인스턴스 안에 실제 값을 보관하는 프로퍼티예요. 구조체와 클래스가 가질 수 있어요.                                                                            |
| 계산 프로퍼티                | 값을 직접 보관하지 않고 getter와 선택적인 setter로 값을 계산하거나 다른 저장 공간에 전달하는 프로퍼티예요.                                                  |
| getter와 setter              | getter는 프로퍼티를 읽을 때 값을 돌려주고, setter는 새 값을 대입할 때 저장 방식을 정해요.                                                                   |
| 프로퍼티 관찰자              | `willSet`과 `didSet`처럼 값이 바뀌기 전후에 추가 동작을 실행하는 문법이에요. 저장 자체를 대신하지는 않아요.                                                 |
| Property Wrapper             | 프로퍼티의 실제 저장 공간과 읽기·쓰기 규칙을 재사용 가능한 타입으로 정의하는 Swift 기능이에요.                                                              |
| `@propertyWrapper`           | 클래스, 구조체, 열거형을 Property Wrapper 타입으로 선언하는 속성이에요.                                                                                     |
| `wrappedValue`               | 사용하는 코드가 일반 프로퍼티 이름으로 읽고 쓰게 되는 주 값이에요. 모든 Property Wrapper 타입에 반드시 있어야 해요.                                         |
| backing storage              | 래퍼 인스턴스를 보관하기 위해 컴파일러가 만드는 실제 저장 프로퍼티예요. 원래 이름 앞에 `_`가 붙고 `private` 접근 수준을 가져요.                             |
| projected value              | 래퍼가 주 값 외에 추가 기능이나 상태를 공개하는 선택적인 값이에요. `projectedValue`를 정의하면 사용하는 쪽에서 `$프로퍼티이름`으로 접근해요.                |
| 문법적 설탕(syntactic sugar) | 더 긴 코드를 읽기 쉬운 짧은 문법으로 표현하는 기능이에요. `@Percentage var rate`는 래퍼 저장 공간과 전달 프로퍼티를 컴파일러가 만들어 주는 짧은 표현이에요. |
| 값 타입과 참조 타입          | 구조체는 복사할 때 독립된 값처럼 동작하고, 클래스는 복사한 참조가 같은 인스턴스를 가리켜요. 래퍼를 어떤 타입으로 만드는지에 따라 복사 의미도 달라져요.      |

이 문서에서는 다음 내용을 설명해요.

- 계산 프로퍼티를 반복해서 작성할 때 생기는 문제
- `@propertyWrapper`와 `wrappedValue`로 저장 규칙을 재사용하는 방법
- 컴파일러가 만드는 `_프로퍼티` 저장 공간과 전달 getter·setter
- `init()`, `init(wrappedValue:)`, 래퍼 인자의 초기화 규칙
- `$프로퍼티`로 추가 상태를 공개하는 `projectedValue`
- 구조체 래퍼와 클래스 래퍼의 복사 의미
- 계산 프로퍼티, 관찰자, Result Builder, 매크로와의 차이
- Property Wrapper가 적합한 경우와 피해야 할 경우

## 계산 프로퍼티로도 값을 제한할 수 있어요

상품 할인율은 0보다 작거나 100보다 클 수 없다고 가정해 볼게요. 별도의 저장 프로퍼티와 계산 프로퍼티를 사용하면 이 규칙을 구현할 수 있어요.

```swift
struct Product {
  let name: String

  private var storedDiscountRate = 0

  var discountRate: Int {
    get {
      storedDiscountRate
    }
    set {
      storedDiscountRate = min(max(newValue, 0), 100)
    }
  }
}
```

`discountRate`에 어떤 값을 대입해도 실제 저장값은 0~100 사이로 조정돼요.

```swift
var keyboard = Product(name: "키보드")

keyboard.discountRate = 20
print(keyboard.discountRate)
// 20

keyboard.discountRate = 140
print(keyboard.discountRate)
// 100
```

한 프로퍼티만 관리한다면 이 코드로 충분해요. 문제는 같은 규칙이 `Coupon`, `Promotion`, `MemberBenefit` 같은 여러 타입에 반복될 때 생겨요.

```swift
struct Coupon {
  private var storedDiscountRate = 0

  var discountRate: Int {
    get {
      storedDiscountRate
    }
    set {
      storedDiscountRate = min(max(newValue, 0), 100)
    }
  }
}
```

저장 프로퍼티 이름, getter, setter, 범위 제한식이 모두 반복돼요. 한쪽만 0~80으로 잘못 고치거나 초기값에는 제한을 적용하지 않는 실수도 생길 수 있어요.

## Property Wrapper는 저장 규칙을 타입으로 묶어요

반복되는 0~100 제한을 `Percentage`라는 타입으로 옮겨 볼게요.

```swift
@propertyWrapper
struct Percentage {
  private var value: Int

  var wrappedValue: Int {
    get {
      value
    }
    set {
      value = Self.clamp(newValue)
    }
  }

  init() {
    value = 0
  }

  init(wrappedValue: Int) {
    value = Self.clamp(wrappedValue)
  }

  private static func clamp(_ value: Int) -> Int {
    min(max(value, 0), 100)
  }
}
```

`@propertyWrapper`를 붙인 타입에는 `wrappedValue` 인스턴스 프로퍼티가 반드시 필요해요. 이 예제에서 `wrappedValue`의 getter는 실제 저장값을 돌려주고 setter는 새 값을 제한한 뒤 저장해요.

초기화할 때도 같은 `clamp(_:)`를 사용해요. 생성 시점과 이후 대입 시점에 서로 다른 규칙이 적용되는 문제를 막을 수 있어요.

이제 프로퍼티 앞에 래퍼 타입을 속성처럼 붙여요.

```swift
struct Product {
  let name: String

  @Percentage var discountRate = 0
}
```

사용하는 코드는 래퍼를 직접 호출하지 않고 일반 프로퍼티처럼 읽고 써요.

```swift
var keyboard = Product(name: "키보드")

keyboard.discountRate = 25
print(keyboard.discountRate)
// 25

keyboard.discountRate = 140
print(keyboard.discountRate)
// 100
```

`Product`는 할인율을 어떤 저장 프로퍼티에 넣고 어떻게 제한하는지 몰라도 돼요. 그 정책은 `Percentage`가 맡고, `Product`에는 이 프로퍼티가 퍼센트 규칙을 따른다는 선언만 남아요.

## wrappedValue가 사용하는 코드에 보이는 값이에요

Property Wrapper에는 두 관점의 값이 있어요.

```swift
@Percentage var discountRate = 10
```

- `discountRate`는 사용하는 코드에 보이는 `Int` 값이에요.
- 실제 저장 공간에는 `Percentage` 래퍼 인스턴스가 들어 있어요.

Swift 공식 [Properties 문서](https://docs.swift.org/swift-book/documentation/the-swift-programming-language/properties/#Property-Wrappers)가 설명하는 변환을 단순화하면 위 선언은 다음 코드와 비슷해요.

```swift
private var _discountRate =
  Percentage(wrappedValue: 10)

var discountRate: Int {
  get {
    _discountRate.wrappedValue
  }
  set {
    _discountRate.wrappedValue = newValue
  }
}
```

컴파일러는 원래 프로퍼티 이름 앞에 `_`를 붙인 backing storage를 만들어요. `_discountRate`가 `Percentage` 인스턴스를 저장하고, `discountRate`의 getter와 setter는 그 인스턴스의 `wrappedValue`로 접근을 전달해요.

흐름을 정리하면 다음과 같아요.

```text
keyboard.discountRate = 140
            │
            ▼
discountRate의 합성 setter
            │
            ▼
_discountRate.wrappedValue = 140
            │
            ▼
Percentage가 100으로 조정해 저장
```

Property Wrapper가 특별한 전역 저장소를 자동으로 만드는 것은 아니에요. 기본적으로 래퍼 인스턴스는 이 backing storage에 들어 있고, 각 `Product` 인스턴스가 자신의 래퍼를 가져요.

## 초기값 문법은 래퍼의 이니셜라이저를 선택해요

Property Wrapper를 적용한 프로퍼티의 작성 방식에 따라 컴파일러가 호출하는 래퍼 이니셜라이저가 달라져요.

### 초기값이 없으면 init()을 사용해요

```swift
struct EmptyPromotion {
  @Percentage var discountRate: Int
}
```

`Percentage`가 `init()`을 제공하므로 래퍼의 기본값인 0으로 시작해요. 개념적으로 다음 초기화가 사용돼요.

```swift
private var _discountRate = Percentage()
```

래퍼에 `init()`이 없다면 초기값 없이 위 문법을 사용할 수 없어요.

### 대입한 초기값은 init(wrappedValue:)로 전달해요

```swift
struct LaunchPromotion {
  @Percentage var discountRate = 15
}
```

오른쪽의 `15`는 `Percentage.init(wrappedValue:)`로 전달돼요.

```swift
private var _discountRate =
  Percentage(wrappedValue: 15)
```

초기값이 150이라면 생성 시점부터 100으로 제한돼요.

```swift
struct InvalidPromotion {
  @Percentage var discountRate = 150
}

let promotion = InvalidPromotion()
print(promotion.discountRate)
// 100
```

### 속성 인자는 나머지 이니셜라이저 인자로 전달해요

0~100뿐 아니라 원하는 범위를 지정하려면 제네릭 `Clamped` 래퍼로 확장할 수 있어요.

```swift
@propertyWrapper
struct Clamped<Value: Comparable> {
  private var value: Value
  private let range: ClosedRange<Value>

  var wrappedValue: Value {
    get {
      value
    }
    set {
      value = Self.clamp(newValue, to: range)
    }
  }

  init(
    wrappedValue: Value,
    _ range: ClosedRange<Value>
  ) {
    self.range = range
    value = Self.clamp(wrappedValue, to: range)
  }

  private static func clamp(
    _ value: Value,
    to range: ClosedRange<Value>
  ) -> Value {
    min(
      max(value, range.lowerBound),
      range.upperBound
    )
  }
}
```

`Value: Comparable`은 `Value` 값을 범위의 최솟값·최댓값과 비교할 수 있다는 뜻이에요. `ClosedRange<Value>`는 양 끝을 모두 포함하는 `0...100` 같은 범위 타입이에요.

사용할 때 초기값은 `wrappedValue`로, 속성의 `0...100`은 두 번째 인자로 전달돼요.

```swift
struct ProductPricing {
  @Clamped(0...100)
  var discountRate = 10

  @Clamped(0...1_000_000)
  var salePrice = 120_000
}
```

두 선언은 개념적으로 다음 래퍼 초기화를 사용해요.

```swift
Clamped(
  wrappedValue: 10,
  0...100
)

Clamped(
  wrappedValue: 120_000,
  0...1_000_000
)
```

공식 [Attributes 문서](https://docs.swift.org/swift-book/documentation/the-swift-programming-language/attributes/#propertyWrapper)는 `= 초기값`이 `wrappedValue` 인자가 되고, 속성 괄호의 인자는 나머지 래퍼 이니셜라이저 인자로 전달된다고 설명해요.

## projectedValue는 주 값 밖의 기능을 공개해요

값이 범위를 벗어나 조정됐는지 호출하는 쪽에 알려 주고 싶다고 가정해 볼게요. `wrappedValue`는 최종 `Int` 값을 공개하는 자리이므로, 추가 상태는 `projectedValue`로 분리할 수 있어요.

```swift
@propertyWrapper
struct Clamped<Value: Comparable> {
  private var value: Value
  private let range: ClosedRange<Value>

  private(set) var projectedValue: Bool

  var wrappedValue: Value {
    get {
      value
    }
    set {
      let adjusted = Self.clamp(newValue, to: range)
      projectedValue = adjusted != newValue
      value = adjusted
    }
  }

  init(
    wrappedValue: Value,
    _ range: ClosedRange<Value>
  ) {
    self.range = range

    let adjusted =
      Self.clamp(wrappedValue, to: range)

    value = adjusted
    projectedValue = adjusted != wrappedValue
  }

  private static func clamp(
    _ value: Value,
    to range: ClosedRange<Value>
  ) -> Value {
    min(
      max(value, range.lowerBound),
      range.upperBound
    )
  }
}
```

래퍼가 `projectedValue`를 제공하면 컴파일러는 원래 프로퍼티 이름 앞에 `$`를 붙인 접근점을 만들어요.

```swift
var pricing = ProductPricing()

pricing.discountRate = 30
print(pricing.$discountRate)
// false

pricing.discountRate = 140
print(pricing.discountRate)
// 100

print(pricing.$discountRate)
// true
```

이 예제의 `$discountRate`는 “마지막 대입값이 조정됐는가”를 나타내는 `Bool`이에요. `$` 값이 항상 래퍼 자체이거나 특정 프레임워크 타입인 것은 아니에요. 래퍼 작성자가 `projectedValue`에 어떤 타입과 의미를 부여하는지에 따라 달라져요.

`projectedValue`는 어떤 타입도 반환할 수 있어요.

- 검증 결과나 변경 여부 같은 상태
- 래퍼가 제공하는 메서드를 모은 프록시 객체
- 원래 값의 다른 읽기·쓰기 방식
- 래퍼 인스턴스 자체인 `Self`

SwiftUI는 Apple 플랫폼의 UI를 선언형으로 작성하는 프레임워크예요. SwiftUI의 `@State`에서 `$state`가 `Binding`을 돌려주는 것도 `projectedValue`를 활용한 사례예요. 하지만 모든 `$프로퍼티`가 `Binding`인 것은 아니므로 래퍼의 정의를 확인해야 해요.

## _, 일반 이름, $는 서로 다른 값을 가리켜요

세 이름의 역할을 한 번에 비교하면 혼동이 줄어요.

| 작성 형태               | 가리키는 값                  | 접근 범위와 용도                                                                |
| ----------------------- | ---------------------------- | ------------------------------------------------------------------------------- |
| `pricing.discountRate`  | `wrappedValue`의 `Int`       | 사용하는 코드가 읽고 쓰는 주 값이에요.                                          |
| `pricing.$discountRate` | `projectedValue`의 `Bool`    | 래퍼가 선택적으로 공개하는 추가 상태나 기능이에요.                              |
| `_discountRate`         | `Clamped<Int>` 래퍼 인스턴스 | 컴파일러가 만든 `private` backing storage이며 해당 타입 구현 안에서만 접근해요. |

`_discountRate`는 래퍼의 내부 상태를 직접 바꿔야 하는 특별한 초기화나 구현에서 사용할 수 있지만, 타입 외부에 공개되지 않아요. 외부 API가 필요한 경우 `projectedValue`로 의도를 드러내는 편이 좋아요.

```swift
struct ProductPricing {
  @Clamped(0...100)
  var discountRate = 10

  init(discountRate: Int) {
    _discountRate = Clamped(
      wrappedValue: discountRate,
      0...100
    )
  }
}
```

이 코드는 래퍼 인스턴스 전체를 직접 초기화해요. `discountRate`의 값만 바꾸는 것과 래퍼의 범위·상태까지 새로 구성하는 것은 다른 작업이에요.

## 래퍼는 var에 적용하고 저장 위치의 제약을 따라요

Property Wrapper는 값을 읽고 쓰는 접근을 감싸므로 `let` 상수가 아니라 `var`에 적용해요.

```swift
@Percentage var discountRate = 10
```

현재 Swift의 공식 속성 규칙에서 Property Wrapper는 다음 위치에 사용할 수 있어요.

- 클래스와 구조체의 저장 인스턴스 프로퍼티
- 저장 타입 프로퍼티
- 함수 안의 저장 지역 변수
- Property Wrapper 매개변수를 지원하는 함수와 클로저의 매개변수

반대로 다음 선언에는 사용할 수 없어요.

- `let` 상수
- getter와 setter를 직접 작성한 계산 프로퍼티
- 전역 변수

래퍼가 적용된 프로퍼티에는 `willSet`과 `didSet` 관찰자를 추가할 수 있지만, getter와 setter는 컴파일러가 합성하므로 직접 다시 작성할 수 없어요.

함수 매개변수의 Property Wrapper는 호출자가 래퍼를 전달하는 문법이 아니에요. 호출자는 원래 값 타입을 전달하고, 함수 안에서 래퍼가 그 매개변수 접근을 감싸요.

```swift
func printDiscount(
  @Percentage rate: Int
) {
  print(rate)
}

printDiscount(rate: 140)
// 100
```

매개변수 지원은 [SE-0293](https://github.com/swiftlang/swift-evolution/blob/main/proposals/0293-extend-property-wrappers-to-function-and-closure-parameters.md)에서 도입됐어요. 함수 시그니처만 보고 값이 변환된다는 사실을 놓치기 쉬우므로, 단순한 한 번의 검증이라면 명시적인 함수 호출이 더 읽기 쉬운지도 비교하세요.

## 구조체 래퍼와 클래스 래퍼는 복사 의미가 달라요

앞에서 만든 `Percentage`와 `Clamped`는 구조체예요. 래퍼를 사용하는 바깥 구조체를 복사하면 래퍼도 값처럼 복사돼요.

```swift
var original = ProductPricing()
var copied = original

copied.discountRate = 40

print(original.discountRate)
// 10

print(copied.discountRate)
// 40
```

반대로 클래스 래퍼는 참조를 저장해요.

```swift
@propertyWrapper
final class Shared<Value> {
  var wrappedValue: Value

  init(wrappedValue: Value) {
    self.wrappedValue = wrappedValue
  }
}

struct Counter {
  @Shared var count = 0
}

var first = Counter()
var second = first

second.count = 1

print(first.count)
// 1
```

`Counter`는 구조체지만 복사된 두 값의 `_count`가 같은 `Shared<Int>` 인스턴스를 가리켜요. 그래서 `second.count`를 바꾸면 `first.count`에서도 변경이 보여요.

클래스 래퍼가 잘못이라는 뜻은 아니에요. 여러 소유자가 같은 저장소를 공유해야 한다면 의도에 맞을 수 있어요. 하지만 바깥 타입의 값 의미를 예상과 다르게 만들 수 있으므로 다음 질문으로 선택하세요.

- 바깥 구조체를 복사할 때 래퍼 상태도 독립적으로 복사돼야 하나요?
- 여러 프로퍼티나 인스턴스가 같은 저장소를 의도적으로 공유해야 하나요?
- 래퍼가 가진 참조의 수명과 동시 접근을 누가 관리하나요?

## Property Wrapper 자체는 스레드 안전을 보장하지 않아요

공통 저장 로직을 래퍼에 모았다고 해서 여러 스레드나 동시 작업의 접근이 자동으로 안전해지는 것은 아니에요. 락을 사용하는 래퍼를 만들더라도 읽기와 쓰기 한 번만 보호할지, 여러 단계를 하나의 원자적인 작업으로 보호할지 별도로 설계해야 해요.

예를 들어 다음 코드는 읽기와 쓰기가 결합된 작업이에요.

```swift
counter.count += 1
```

여러 작업이 동시에 실행되면 둘 다 같은 이전 값을 읽고 같은 새 값을 쓸 수 있어요. getter와 setter 각각에 락을 거는 것만으로 전체 증가 연산이 안전하다고 단정할 수 없어요.

동시 접근이 핵심 문제라면 actor, 격리 규칙, 락으로 보호한 명시적인 메서드처럼 작업 전체의 경계를 표현하는 방법을 먼저 검토하세요. Property Wrapper는 그런 동시성 정책을 재사용하는 표현 수단일 수는 있지만, 정책의 정확성을 대신 증명하지는 않아요.

## 계산 프로퍼티, 관찰자, Result Builder, 매크로와 역할이 달라요

비슷해 보이는 기능을 “어떤 코드를 재사용하는가”로 나누면 선택이 쉬워져요.

| 기능               | 주로 해결하는 문제                         | 생성되거나 실행되는 위치                     | 적합한 예                   |
| ------------------ | ------------------------------------------ | -------------------------------------------- | --------------------------- |
| 계산 프로퍼티      | 한 프로퍼티의 읽기·쓰기 방식을 직접 정의   | 해당 프로퍼티의 getter·setter                | 다른 두 값에서 합계를 계산  |
| `willSet`·`didSet` | 값이 바뀌기 전후에 반응                    | 원래 프로퍼티의 저장 전후                    | 변경 로그 남기기            |
| Property Wrapper   | 여러 프로퍼티의 저장·접근 정책 재사용      | 래퍼 인스턴스와 합성 getter·setter           | 범위 제한, 외부 저장소 연결 |
| Result Builder     | 블록 안의 여러 표현식을 하나의 결과로 조합 | 컴파일러가 변환한 `build` 메서드 호출        | 선언형 목록이나 트리 만들기 |
| 매크로             | 작성된 Swift 구문에서 다양한 코드를 생성   | 컴파일 시점에 역할이 허용한 표현식·멤버·확장 | 선언에서 반복 멤버 생성     |

여러 표현식을 하나의 값으로 만드는 문제는 [Result Builder](./result-builders)가 다루고, 프로퍼티를 넘어 선언 전체를 분석해 코드를 추가하는 문제는 [매크로](./macros)가 다뤄요. Property Wrapper는 프로퍼티 하나의 저장과 접근이라는 더 좁고 명확한 지점에 특화돼 있어요.

## 테스트에서는 주 값과 투영 값을 함께 확인해요

Property Wrapper의 테스트는 두 층으로 나눌 수 있어요.

1. 래퍼 타입을 직접 생성해 `wrappedValue` 규칙을 확인해요.
2. 실제 프로퍼티에 적용해 합성된 접근 문법과 `projectedValue`를 확인해요.

Swift Testing은 `@Test`와 `#expect`로 테스트를 선언하고 결과를 검증하는 Swift 공식 테스트 라이브러리예요. `Clamped`를 적용한 타입을 다음처럼 테스트할 수 있어요.

```swift
import Testing

@Test
func clampsDiscountRate() {
  var pricing = ProductPricing()

  pricing.discountRate = 140

  #expect(pricing.discountRate == 100)
  #expect(pricing.$discountRate)
}

@Test
func keepsValidDiscountRate() {
  var pricing = ProductPricing()

  pricing.discountRate = 30

  #expect(pricing.discountRate == 30)
  #expect(pricing.$discountRate == false)
}
```

경계값도 따로 확인하세요.

- 범위의 최솟값과 최댓값
- 범위 바로 바깥의 값
- 선언에 작성한 초기값이 범위를 벗어난 경우
- 유효한 값 이후 잘못된 값을 넣거나 그 반대 순서
- 복사 뒤 상태가 독립적이어야 하는 구조체 래퍼

`projectedValue`가 “마지막 대입 결과”처럼 상태를 기억한다면 여러 대입의 순서도 테스트해야 해요.

## 언제 사용해야 하나요

다음 조건이 겹칠수록 Property Wrapper가 잘 맞아요.

- 여러 프로퍼티가 같은 저장 또는 접근 규칙을 반복해요.
- 사용하는 쪽에는 원래 값 타입처럼 간단한 읽기·쓰기 문법을 보여 주고 싶어요.
- 규칙에 필요한 상태와 옵션을 래퍼 인스턴스가 자연스럽게 소유할 수 있어요.
- 주 값 외의 추가 기능을 `projectedValue`라는 명확한 API로 제공할 수 있어요.
- 래퍼 이름만 읽어도 적용되는 정책을 예상할 수 있어요.

다음 상황에서는 다른 방법이 더 분명할 수 있어요.

- 규칙을 한 프로퍼티 한 곳에서만 사용해 계산 프로퍼티로 충분해요.
- 잘못된 값을 조용히 바꾸지 않고 오류로 돌려줘야 해요.
- 여러 프로퍼티를 함께 검증해야 해서 프로퍼티 하나만 보면 규칙을 결정할 수 없어요.
- 값 변경이 네트워크 요청처럼 실패 가능한 큰 작업을 일으켜요.
- 호출부에서 변환이나 부수 효과가 일어난다는 사실이 숨겨져 코드를 이해하기 어려워져요.
- 동시성 안전성이나 객체 수명처럼 타입 전체의 설계가 더 중요한 문제예요.

프로퍼티 setter는 `throws`로 선언할 수 없어요. 따라서 유효하지 않은 입력을 호출자가 반드시 처리해야 한다면 `updateDiscountRate(_:) throws` 같은 명시적인 메서드가 더 적합할 수 있어요.

## Property Wrapper를 적용하는 순서를 정리해요

1. 여러 프로퍼티에서 실제로 반복되는 저장·접근 코드를 찾으세요.
2. 관찰만 필요한지, 저장 방식 자체를 바꿔야 하는지 구분하세요.
3. 사용하는 코드에 보여 줄 `wrappedValue`의 타입과 읽기·쓰기 가능 여부를 먼저 정하세요.
4. 초기값과 옵션이 어떤 래퍼 이니셜라이저로 들어오는지 설계하세요.
5. 추가 API가 꼭 필요할 때만 의미가 분명한 `projectedValue`를 제공하세요.
6. 바깥 타입을 복사할 때 상태가 독립적이어야 하는지 확인해 구조체와 클래스를 선택하세요.
7. 경계값, 초기화, 투영 값, 복사 의미를 테스트하고 호출부가 정책을 충분히 드러내는지 검토하세요.

처음에는 하나의 작고 구체적인 규칙만 래퍼에 넣으세요. 범위 제한, 저장소 접근, 로그, 검증, 네트워크 동기화를 한 래퍼가 모두 맡으면 이름만으로 동작을 예측하기 어려워져요.

## 흔한 오해를 정리해요

### Property Wrapper는 값을 감싸는 프로토콜인가요?

아니에요. `PropertyWrapper`라는 프로토콜을 따르는 방식이 아니라 클래스, 구조체, 열거형 선언에 `@propertyWrapper`를 붙이고 `wrappedValue`를 제공하는 언어 규칙이에요.

### 프로퍼티 이름으로 읽으면 래퍼 인스턴스가 나오나요?

아니에요. `discountRate`는 래퍼의 `wrappedValue`를 돌려줘요. 래퍼 인스턴스는 `_discountRate` backing storage에 들어 있고, 추가 공개 값은 래퍼가 정의한 `$discountRate`를 통해 접근해요.

### `$프로퍼티`는 항상 원래 값을 변경하는 Binding인가요?

아니에요. `$프로퍼티`의 타입과 의미는 `projectedValue`가 정해요. SwiftUI의 일부 래퍼가 `Binding`을 반환할 뿐, 사용자 정의 래퍼는 `Bool`, 프록시, 래퍼 자신 등 어떤 타입도 선택할 수 있어요.

### Property Wrapper를 쓰면 입력값 검증이 항상 안전해지나요?

아니에요. 범위를 벗어난 값을 조용히 조정하면 호출자의 오류를 숨길 수도 있어요. 잘못된 입력을 거부하고 이유를 전달해야 한다면 실패 가능한 이니셜라이저나 `throws` 메서드를 사용하세요.

### 클래스 래퍼를 구조체에 쓰면 구조체도 값 타입으로 복사되나요?

구조체 자체는 복사되지만 내부 래퍼 참조는 같은 클래스 인스턴스를 가리킬 수 있어요. 두 복사본의 상태가 독립적이어야 한다면 구조체 래퍼를 사용하거나 명시적인 복사 정책을 설계해야 해요.

### Property Wrapper를 쓰면 여러 스레드에서 안전한가요?

아니에요. 래퍼가 정확한 동기화 정책을 구현했을 때만 해당 정책만큼 안전해요. 읽기와 쓰기를 결합한 연산, 참조 타입의 내부 변경, 래퍼 복사 의미까지 함께 검토해야 해요.

## 면접에서 이어질 수 있는 질문

### wrappedValue는 어떤 역할을 하나요?

`wrappedValue`는 래퍼를 적용한 프로퍼티의 getter와 setter가 전달하는 주 값이에요. 사용하는 코드는 일반 프로퍼티 이름으로 접근하지만 실제 읽기와 쓰기는 backing storage의 `wrappedValue`를 거쳐요.

### _프로퍼티와 $프로퍼티의 차이는 무엇인가요?

`_프로퍼티`는 컴파일러가 래퍼 인스턴스를 보관하기 위해 만든 `private` backing storage예요. `$프로퍼티`는 래퍼가 `projectedValue`를 정의했을 때 추가 상태나 기능을 공개하는 합성 프로퍼티예요.

### init(wrappedValue:)는 언제 호출되나요?

래퍼가 적용된 프로퍼티 선언에 `= 초기값`을 작성하면 그 값이 `wrappedValue` 인자로 전달돼요. 속성 괄호에 다른 인자가 있으면 초기값과 함께 해당 인자를 받는 래퍼 이니셜라이저가 선택돼요.

### Property Wrapper와 계산 프로퍼티의 차이는 무엇인가요?

계산 프로퍼티는 한 선언에 getter와 setter를 직접 작성하고, Property Wrapper는 그 저장·접근 규칙을 별도 타입으로 만들어 여러 프로퍼티에서 재사용해요. 한 곳에서만 필요한 계산이라면 계산 프로퍼티가 더 단순할 수 있어요.

### Property Wrapper의 단점은 무엇인가요?

저장과 변환 동작이 짧은 속성 문법 뒤에 숨을 수 있고, 초기화·복사·접근 제어·동시성 의미가 래퍼 타입에 따라 달라져요. 래퍼가 많아지면 실제 저장 위치와 부수 효과를 찾는 비용도 커질 수 있어요.

## 참고 자료

- [The Swift Programming Language — Properties](https://docs.swift.org/swift-book/documentation/the-swift-programming-language/properties/)
- [The Swift Programming Language — Attributes](https://docs.swift.org/swift-book/documentation/the-swift-programming-language/attributes/)
- [Swift Compiler Diagnostics — Property wrapper implementation requirements](https://docs.swift.org/compiler/documentation/diagnostics/property-wrapper-requirements/)
- [SE-0258 Property Wrappers](https://github.com/swiftlang/swift-evolution/blob/main/proposals/0258-property-wrappers.md)
- [SE-0293 Extend Property Wrappers to Function and Closure Parameters](https://github.com/swiftlang/swift-evolution/blob/main/proposals/0293-extend-property-wrappers-to-function-and-closure-parameters.md)
