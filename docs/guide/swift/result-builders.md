---
title: Swift로 이해하는 Result Builder
description: Swift Result Builder가 여러 표현식을 하나의 값으로 조합하는 원리와 @resultBuilder 구현, 조건문·반복문 지원, 적용 기준을 설명합니다.
pageType: doc-wide
outline: false
---

# Swift로 이해하는 Result Builder

> **면접 답변 한 줄 요약:** Result Builder는 특별한 속성이 붙은 코드 블록의 표현식을 컴파일러가 정해진 `build` 메서드 호출로 바꿔 하나의 결과로 조합하고, 목록이나 트리 구조를 선언형 문법으로 작성하게 하는 Swift 기능이에요.

SwiftUI에서 `VStack` 안에 여러 View를 나란히 적거나 조건에 따라 View를 추가하는 코드를 본 적이 있다면 이미 Result Builder를 사용한 경험이 있을 수 있어요. 여러 줄인데도 쉼표와 `return` 없이 하나의 결과가 만들어지는 이유가 Result Builder의 변환 규칙에 있어요.

이 문서에서는 설정 화면의 행 목록을 만드는 작은 예제로 직접 배열을 조립할 때의 불편부터 살펴봐요. 이어서 `@resultBuilder` 타입을 만들고, 컴파일러가 표현식과 조건문, 반복문을 어떤 메서드 호출로 바꾸는지 단계적으로 설명해요.

## 먼저 알아둘 Swift 용어

| 용어                 | 쉬운 뜻                                                                                                                                             |
| -------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| 클로저               | 실행할 코드를 값처럼 전달하고 저장할 수 있는 Swift 기능이에요. 자세한 기본 문법은 [클로저](./closures) 문서에서 확인할 수 있어요.                   |
| trailing closure     | 함수의 마지막 클로저 인자를 소괄호 밖에 `{ ... }`로 작성하는 호출 문법이에요.                                                                       |
| 속성(attribute)      | `@resultBuilder`처럼 선언이나 타입에 특별한 의미를 더하는 `@` 문법이에요.                                                                           |
| 선언형 문법          | 처리 순서를 하나씩 명령하기보다 최종 결과의 구조가 어떤 모습이어야 하는지 중심으로 작성하는 방식이에요.                                             |
| DSL                  | Domain-Specific Language의 줄임말이에요. 설정, UI, 테스트처럼 특정 문제 영역을 간결하게 표현하도록 만든 작은 전용 문법이에요.                       |
| 컴파일러 변환        | 작성한 코드를 컴파일러가 의미가 같은 다른 형태로 해석하는 과정이에요. Result Builder 블록은 `build` 메서드 호출로 변환돼요.                         |
| 표현식(expression)   | 실행하면 값을 만드는 코드예요. `.action(title: "일반")`은 `SettingsRow` 값을 만드는 표현식이에요.                                                   |
| 부분 결과(component) | Result Builder가 각 표현식을 바꾸고 합치는 중간 값이에요. 이 문서에서는 `[SettingsRow]` 배열을 부분 결과로 사용해요.                                |
| 결과 조합 메서드     | `buildBlock`, `buildOptional`, `buildArray`처럼 컴파일러가 블록의 문법에 맞춰 호출하는 `static` 메서드예요. 개발자가 호출부에서 직접 부르지 않아요. |

이 문서에서는 다음 내용을 설명해요.

- 배열을 직접 조립할 때 조건과 반복 코드가 흩어지는 이유
- `@resultBuilder`와 `buildExpression`, `buildBlock`의 역할
- 컴파일러가 여러 표현식을 하나의 결과로 조합하는 과정
- `if`, `if-else`, `switch`, `for`를 지원하는 방법
- Result Builder와 일반 배열, Builder 디자인 패턴의 차이
- Result Builder가 잘 맞는 경우와 사용하지 않아도 되는 경우
- 오류가 생겼을 때 빠진 결과 조합 메서드를 찾는 방법
- PopPangListKit이 UIKit 목록을 SwiftUI처럼 선언하는 실전 구조
- UI가 아닌 입력 검증 규칙에 Result Builder를 적용하는 방법

## 배열을 직접 조립해도 올바르게 동작해요

먼저 설정 화면에 표시할 행을 배열로 만들어 볼게요.

```swift
enum SettingsRow: Equatable {
  case action(title: String)
  case account(name: String)
  case divider
}

enum UserRole: Equatable {
  case member
  case administrator
}

func makeSettingsWithoutBuilder(
  showsAdvanced: Bool,
  role: UserRole,
  accountNames: [String]
) -> [SettingsRow] {
  var rows: [SettingsRow] = [
    .action(title: "일반"),
  ]

  if showsAdvanced {
    rows.append(.action(title: "고급"))
  }

  if role == .administrator {
    rows.append(.action(title: "관리자 도구"))
  } else {
    rows.append(.action(title: "도움말"))
  }

  rows.append(.divider)

  for name in accountNames {
    rows.append(.account(name: name))
  }

  return rows
}
```

이 코드는 명확하고 특별한 문법도 필요하지 않아요. 한두 곳에서 짧은 배열을 만든다면 이 방식으로 충분해요.

하지만 같은 종류의 목록을 여러 API에서 반복해서 만든다면 실제 항목보다 `var`, `append`, `return` 같은 조립 코드가 더 눈에 띌 수 있어요. 중첩된 목록이나 트리를 만들 때는 어느 값이 어느 부모에 속하는지 파악하기도 어려워져요.

우리가 표현하고 싶은 핵심 구조는 다음과 같은 모습이에요.

```swift
makeSettings {
  .action(title: "일반")

  if showsAdvanced {
    .action(title: "고급")
  }

  if role == .administrator {
    .action(title: "관리자 도구")
  } else {
    .action(title: "도움말")
  }

  .divider

  for name in accountNames {
    .account(name: name)
  }
}
```

Result Builder를 사용하면 Swift의 조건문과 반복문을 유지하면서, 행을 배열에 넣는 반복 작업은 별도의 Builder 타입에 맡길 수 있어요.

## Result Builder는 코드 블록의 값을 모아 하나의 결과를 만들어요

Result Builder는 런타임에 생성해서 상태를 쌓는 객체가 아니에요. `@resultBuilder`를 붙인 타입에 `static` 메서드를 정의하면, 컴파일러가 Builder 블록을 그 메서드 호출로 변환해요.

가장 작은 `SettingsBuilder`부터 만들어 볼게요.

```swift
@resultBuilder
struct SettingsBuilder {
  typealias Component = [SettingsRow]

  static func buildExpression(
    _ expression: SettingsRow
  ) -> Component {
    [expression]
  }

  static func buildBlock(
    _ components: Component...
  ) -> Component {
    components.flatMap { $0 }
  }
}
```

두 메서드는 서로 다른 일을 담당해요.

- `buildExpression(_:)`은 블록에 적은 `SettingsRow` 하나를 부분 결과인 `[SettingsRow]`로 바꿔요.
- `buildBlock(_:)`은 같은 블록에서 만들어진 여러 부분 결과를 하나의 배열로 합쳐요.

이 Builder를 클로저 매개변수에 적용해요.

```swift
func makeSettings(
  @SettingsBuilder content: () -> [SettingsRow]
) -> [SettingsRow] {
  content()
}
```

`content` 앞의 `@SettingsBuilder`가 호출부의 클로저에 Builder 변환을 적용해요. 이제 쉼표와 `return` 없이 여러 행을 나란히 작성할 수 있어요.

```swift
let basicRows = makeSettings {
  .action(title: "일반")
  .divider
  .action(title: "앱 정보")
}
```

`basicRows`에는 다음 배열이 들어 있어요.

```swift
[
  .action(title: "일반"),
  .divider,
  .action(title: "앱 정보"),
]
```

Result Builder 타입은 특정 프로토콜을 따르지 않아요. 컴파일러가 이름과 시그니처가 맞는 `static` 메서드를 찾아 사용하므로 `SettingsBuilder()` 인스턴스를 만들 필요도 없어요.

## 컴파일러는 표현식을 build 메서드 호출로 바꿔요

다음 Builder 블록을 기준으로 변환 과정을 살펴볼게요.

```swift
let rows = makeSettings {
  .action(title: "일반")
  .divider
}
```

개념적으로 컴파일러는 각 표현식을 `buildExpression(_:)`에 전달한 뒤 `buildBlock(_:)`으로 합쳐요.

```swift
let first = SettingsBuilder.buildExpression(
  .action(title: "일반")
)
let second = SettingsBuilder.buildExpression(
  .divider
)

let combined = SettingsBuilder.buildBlock(
  first,
  second
)
```

실제 컴파일러 구현이 위 이름의 지역 변수를 그대로 만드는 것은 아니에요. 어떤 값이 어떤 결과 조합 메서드로 전달되는지 이해하기 위한 개념적인 표현이에요.

이 변환을 알면 “여러 줄의 클로저가 어떻게 `[SettingsRow]` 하나를 반환하나요?”라는 질문에 답할 수 있어요. 각 줄이 자동으로 반환되는 것이 아니라, **각 표현식이 부분 결과가 되고 Builder가 부분 결과를 최종 값으로 조합해요.**

Swift 공식 문서의 [Result Builders](https://docs.swift.org/swift-book/documentation/the-swift-programming-language/advancedoperators/#Result-Builders)도 Result Builder를 목록이나 트리 같은 중첩 데이터를 선언형 방식으로 만들기 위한 타입으로 설명해요.

## if만 있는 조건은 buildOptional로 처리해요

앞의 `SettingsBuilder`는 여러 표현식을 합칠 수 있지만 아직 `if`를 처리할 방법은 정의하지 않았어요. `if`에 `else`가 없어 결과가 없을 수도 있는 경우에는 `buildOptional(_:)`을 추가해요.

```swift
extension SettingsBuilder {
  static func buildOptional(
    _ component: Component?
  ) -> Component {
    component ?? []
  }
}
```

조건이 참이면 `if` 블록에서 만든 부분 결과가 전달되고, 거짓이면 `nil`이 전달돼요. 이 예제에서는 `nil`을 빈 배열로 바꿔 전체 결과에서 해당 행을 생략해요.

```swift
let showsAdvanced = true

let rows = makeSettings {
  .action(title: "일반")

  if showsAdvanced {
    .action(title: "고급")
  }
}
```

`showsAdvanced`가 `true`이면 `고급` 행이 포함되고, `false`이면 `일반` 행만 남아요. Result Builder가 조건을 미리 계산하는 것은 아니며, 실행 시점에는 원래 `if` 조건이 그대로 평가돼요.

## if-else와 switch는 buildEither로 처리해요

두 갈래 이상에서 하나의 결과를 선택하려면 `buildEither(first:)`와 `buildEither(second:)`을 함께 정의해요.

```swift
extension SettingsBuilder {
  static func buildEither(
    first component: Component
  ) -> Component {
    component
  }

  static func buildEither(
    second component: Component
  ) -> Component {
    component
  }
}
```

첫 번째 갈래가 선택되면 `first`, 두 번째 갈래가 선택되면 `second` 메서드가 호출돼요. 이 Builder에서는 어느 쪽이든 이미 `[SettingsRow]`이므로 값을 그대로 돌려줘요.

```swift
let role = UserRole.administrator

let rows = makeSettings {
  if role == .administrator {
    .action(title: "관리자 도구")
  } else {
    .action(title: "도움말")
  }
}
```

`switch`도 같은 두 메서드를 사용해 여러 갈래의 결과를 하나의 부분 결과로 합쳐요.

```swift
let rows = makeSettings {
  switch role {
  case .member:
    .action(title: "고객 지원")
  case .administrator:
    .action(title: "관리자 도구")
  }
}
```

메서드 이름만 보면 두 갈래만 지원하는 것처럼 보이지만, 컴파일러가 여러 `case`를 `first`와 `second` 호출의 트리로 구성해요.

## for 반복은 buildArray로 처리해요

`for`의 각 반복에서 만들어진 부분 결과는 배열로 모인 뒤 `buildArray(_:)`에 전달돼요.

```swift
extension SettingsBuilder {
  static func buildArray(
    _ components: [Component]
  ) -> Component {
    components.flatMap { $0 }
  }
}
```

이 문서의 `Component`는 이미 `[SettingsRow]`이므로 `components` 타입은 `[[SettingsRow]]`이에요. `flatMap`으로 한 단계 펼치면 최종 `[SettingsRow]`을 얻을 수 있어요.

```swift
let accountNames = ["Blob", "Mango"]

let rows = makeSettings {
  .action(title: "일반")
  .divider

  for name in accountNames {
    .account(name: name)
  }
}
```

결과에는 `일반`, 구분선, `Blob`, `Mango` 행이 순서대로 들어가요. 반복마다 만든 행을 개발자가 직접 `append`하지 않아도 Builder가 모아서 합쳐요.

## 완성된 SettingsBuilder를 한 번에 살펴봐요

지금까지 추가한 기능을 한 타입에 모으면 다음과 같아요.

```swift
@resultBuilder
struct SettingsBuilder {
  typealias Component = [SettingsRow]

  static func buildExpression(
    _ expression: SettingsRow
  ) -> Component {
    [expression]
  }

  static func buildBlock(
    _ components: Component...
  ) -> Component {
    components.flatMap { $0 }
  }

  static func buildOptional(
    _ component: Component?
  ) -> Component {
    component ?? []
  }

  static func buildEither(
    first component: Component
  ) -> Component {
    component
  }

  static func buildEither(
    second component: Component
  ) -> Component {
    component
  }

  static func buildArray(
    _ components: [Component]
  ) -> Component {
    components.flatMap { $0 }
  }
}
```

이제 처음에 배열로 작성했던 설정 목록을 Builder 문법으로 표현할 수 있어요.

```swift
func makeSettings(
  @SettingsBuilder content: () -> [SettingsRow]
) -> [SettingsRow] {
  content()
}

let showsAdvanced = true
let role = UserRole.administrator
let accountNames = ["Blob", "Mango"]

let rows = makeSettings {
  .action(title: "일반")

  if showsAdvanced {
    .action(title: "고급")
  }

  if role == .administrator {
    .action(title: "관리자 도구")
  } else {
    .action(title: "도움말")
  }

  .divider

  for name in accountNames {
    .account(name: name)
  }
}
```

호출부에는 설정 목록의 구조만 남고, 각 표현식을 배열로 바꾸고 합치는 규칙은 `SettingsBuilder` 한곳에 모였어요.

## 문법마다 필요한 결과 조합 메서드가 달라요

Result Builder는 사용하려는 모든 문법을 자동으로 지원하지 않아요. Builder 타입에 어떤 메서드가 있느냐에 따라 블록에서 사용할 수 있는 문법이 정해져요.

| 결과 조합 메서드                                                     | 지원하거나 담당하는 역할                                                                                                    |
| -------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `buildBlock(_:)`                                                     | 같은 블록의 여러 부분 결과를 한 번에 합쳐요.                                                                                |
| `buildPartialBlock(first:)`와 `buildPartialBlock(accumulated:next:)` | 부분 결과를 첫 값부터 하나씩 누적해요. 두 메서드를 함께 구현하면 `buildBlock(_:)` 대신 기본 조합 방식으로 사용할 수 있어요. |
| `buildExpression(_:)`                                                | 블록에 적은 표현식을 Builder 내부의 `Component` 타입으로 바꿔요. 서로 다른 입력 타입을 받도록 오버로드할 수도 있어요.       |
| `buildOptional(_:)`                                                  | `else`가 없는 `if`처럼 결과가 없을 수도 있는 갈래를 처리해요.                                                               |
| `buildEither(first:)`, `buildEither(second:)`                        | `if-else`와 `switch`의 여러 갈래 중 선택된 부분 결과를 합쳐요. 두 메서드를 함께 구현해요.                                   |
| `buildArray(_:)`                                                     | `for`의 각 반복에서 나온 부분 결과를 모아 하나로 합쳐요.                                                                    |
| `buildFinalResult(_:)`                                               | 마지막 `Component`를 외부에 공개할 최종 반환 타입으로 바꾸거나 후처리해요.                                                  |
| `buildLimitedAvailability(_:)`                                       | `if #available` 안의 구체 타입 정보가 바깥으로 퍼지지 않도록 처리할 때 사용해요.                                            |

현재 Swift 언어 규칙에서는 `buildBlock(_:)` 또는 두 `buildPartialBlock` 메서드가 기본 블록 조합을 담당해야 해요. 나머지 메서드는 Builder가 제공하려는 문법과 타입 변환에 따라 선택해요.

모든 메서드를 미리 구현할 필요는 없어요. 정적인 목록만 만든다면 `buildExpression`과 기본 블록 조합만으로 충분할 수 있어요. 필요한 문법이 생길 때 해당 메서드를 추가하면 Builder의 허용 범위도 API 의도에 맞게 유지할 수 있어요.

전체 메서드 시그니처와 정확한 변환 규칙은 Swift 언어 참조의 [`resultBuilder` 속성](https://docs.swift.org/swift-book/documentation/the-swift-programming-language/attributes/#resultBuilder)에서 확인할 수 있어요.

## buildExpression은 입력 문법의 범위를 정해요

`buildExpression(_:)`을 오버로드하면 같은 Builder 블록에서 여러 입력 타입을 받을 수 있어요. 예를 들어 `String`을 계정 행으로 바꾸는 규칙을 추가할 수 있어요.

```swift
extension SettingsBuilder {
  static func buildExpression(
    _ name: String
  ) -> Component {
    [.account(name: name)]
  }
}
```

그러면 다음 문자열도 `SettingsRow`와 함께 사용할 수 있어요.

```swift
let rows = makeSettings {
  .action(title: "일반")
  "Blob"
  "Mango"
}
```

문법은 짧아지지만 문자열이 계정 행으로 바뀐다는 규칙을 모르는 독자에게는 의미가 숨겨질 수 있어요. 입력 타입이 역할을 충분히 설명하지 못한다면 `.account(name:)`처럼 의도가 드러나는 표현을 유지하는 편이 좋아요.

Result Builder의 목적은 가장 짧은 문법을 만드는 것이 아니에요. 반복되는 구조를 안전하게 조합하면서 호출부가 문제 영역의 의미를 잘 보여 주게 만드는 것이 중요해요.

## Builder 속성은 클로저 외의 선언에도 붙일 수 있어요

가장 흔한 사용 위치는 함수 타입의 매개변수예요.

```swift
func makeSettings(
  @SettingsBuilder content: () -> [SettingsRow]
) -> [SettingsRow] {
  content()
}
```

Result Builder 속성은 함수 본문이나 값을 계산하는 프로퍼티의 getter에도 적용할 수 있어요.

```swift
@SettingsBuilder
func defaultSettings() -> [SettingsRow] {
  SettingsRow.action(title: "일반")
  SettingsRow.action(title: "앱 정보")
}

@SettingsBuilder
var supportSettings: [SettingsRow] {
  SettingsRow.action(title: "자주 묻는 질문")
  SettingsRow.action(title: "문의하기")
}
```

subscript의 getter에도 적용할 수 있지만, 일반적인 API에서는 Builder를 받는 클로저 매개변수가 호출부의 범위와 목적을 가장 분명하게 보여 줘요.

## SwiftUI도 같은 원리로 View를 조합해요

SwiftUI는 Apple 플랫폼의 사용자 인터페이스를 선언형으로 만드는 프레임워크예요. 다음처럼 `VStack` 안에 여러 View와 조건문을 작성할 수 있어요.

```swift
VStack {
  Text("프로필")

  if isLoggedIn {
    Text("로그인됨")
  }
}
```

이 형태도 Result Builder가 표현식과 조건문의 결과를 하나의 콘텐츠로 조합하기 때문에 가능해요. Apple의 [`ViewBuilder`](https://developer.apple.com/documentation/swiftui/viewbuilder) 문서는 이를 클로저에서 View를 구성하는 사용자 정의 매개변수 속성으로 설명해요.

SDK와 API에 따라 사용하는 구체적인 Builder 타입과 제약은 달라질 수 있어요. 직접 `buildBlock`을 호출하려고 하지 말고, 사용하는 SwiftUI API의 현재 시그니처에서 어떤 Builder 속성을 요구하는지 확인해야 해요.

## Result Builder와 비슷해 보이는 개념을 구분해요

| 방식                | 핵심 질문                                    | 값이 만들어지는 방법                                                               | 잘 맞는 상황                                              |
| ------------------- | -------------------------------------------- | ---------------------------------------------------------------------------------- | --------------------------------------------------------- |
| 일반 배열·클로저    | 값을 어떤 순서로 직접 추가할까요?            | `append`, 배열 리터럴, `return`을 개발자가 직접 작성해요.                          | 짧고 한 번만 사용하는 단순 목록이에요.                    |
| Result Builder      | 블록의 여러 표현식을 어떤 규칙으로 합칠까요? | 컴파일러가 블록을 `static build...` 메서드 호출로 변환해요.                        | 반복해서 만드는 목록·트리와 선언형 DSL이에요.             |
| Builder 디자인 패턴 | 복잡한 객체의 생성 단계를 어떻게 나눌까요?   | 상태를 가진 Builder 객체에 설정 메서드를 차례로 호출하고 마지막에 결과를 만들어요. | 선택 항목이 많고 단계적인 객체 생성 과정이 필요할 때예요. |

이름은 비슷하지만 Result Builder와 Builder 디자인 패턴은 같은 기능이 아니에요. Result Builder는 Swift 컴파일러가 특정 코드 블록을 변환하는 **언어 기능**이고, Builder 디자인 패턴은 객체 생성 책임을 분리하는 **설계 방식**이에요.

또한 Result Builder는 임의의 Swift 코드를 생성하는 매크로가 아니에요. 컴파일러가 언어에 정해진 규칙으로 블록을 분석하고, Builder 타입이 제공한 결과 조합 메서드를 호출하는 제한된 변환이에요.

## Builder 블록에서 모든 제어문을 사용할 수 있는 것은 아니에요

Result Builder가 처리하는 문법은 결과 조합 메서드와 언어의 변환 규칙에 의해 제한돼요.

- `if`, `if-else`, `switch`, `for`는 대응하는 결과 조합 메서드가 있을 때 사용할 수 있어요.
- `let`과 `var` 같은 지역 선언은 변환되지 않으므로 중간 값을 계산하는 데 사용할 수 있어요.
- `return`, `break`, `continue`, `defer`, `guard`, `while`, `do-catch`는 Result Builder가 변환하는 블록에서 사용할 수 없어요.
- 대입 표현식은 `Void`를 만들기 때문에 `buildExpression(_:)`이 `Void`를 받지 않으면 오류가 날 수 있어요. Builder 블록은 부수 효과보다 결과 구성에 집중하는 편이 좋아요.
- 클로저 인자로 전달한 블록에 명시적인 `return`을 넣으면 Builder 변환이 적용되지 않아 여러 표현식을 조합할 수 없게 돼요.

예를 들어 조건을 만족하지 않으면 일찍 끝내기 위해 `guard`를 쓰기보다, Builder 밖에서 입력을 검증하거나 `if`로 포함할 항목을 선택할 수 있어요.

```swift
let validNames = accountNames.filter {
  !$0.isEmpty
}

let rows = makeSettings {
  for name in validNames {
    .account(name: name)
  }
}
```

Builder가 지원하지 않는 문법을 억지로 추가하기보다 계산과 검증은 일반 Swift 코드에 두고, Builder 블록은 결과 구조를 표현하는 역할로 좁히면 읽기 쉬워져요.

## 오류에서는 사용한 문법과 build 메서드를 연결해 봐요

Result Builder 오류는 변환된 코드를 떠올리면 원인을 찾기 쉬워요.

| 증상                                            | 먼저 확인할 부분                                                                                          |
| ----------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| `if`를 추가한 뒤 컴파일되지 않아요.             | `else`가 없으면 `buildOptional(_:)`, `else`가 있으면 두 `buildEither` 메서드가 있는지 확인해요.           |
| `switch`를 추가한 뒤 컴파일되지 않아요.         | `buildEither(first:)`와 `buildEither(second:)`이 함께 있는지 확인해요.                                    |
| `for`를 추가한 뒤 컴파일되지 않아요.            | `buildArray(_:)`이 있고 반환 타입이 `Component`와 맞는지 확인해요.                                        |
| 특정 표현식만 Builder가 받지 못해요.            | 해당 입력 타입을 받는 `buildExpression(_:)` 오버로드가 있는지 확인해요.                                   |
| 여러 표현식의 타입이 서로 맞지 않아요.          | 모든 경로가 Builder의 `Component`로 변환되는지 확인해요.                                                  |
| `return`을 추가한 뒤 여러 줄을 조합하지 못해요. | 명시적 `return`을 제거하고 각 줄에 결과 표현식을 작성해 Builder 변환이 적용되게 해요.                     |
| 타입 검사 오류가 지나치게 복잡해요.             | 큰 Builder 블록을 의미 있는 하위 함수나 프로퍼티로 나누고, 과도한 제네릭 오버로드와 암시적 변환을 줄여요. |

컴파일러 오류가 `buildEither`나 `buildExpression`을 직접 언급하지 않더라도, 오류가 시작된 문법과 필요한 메서드를 먼저 연결하면 범위를 빠르게 좁힐 수 있어요.

## 언제 사용해야 하나요

다음 조건이 여러 개 맞는다면 Result Builder가 도움이 될 수 있어요.

- 같은 종류의 목록이나 트리 구조를 여러 호출부에서 반복해서 만들어요.
- 조건과 반복을 포함한 구조를 선언형으로 보여 주는 것이 중요해요.
- 호출부에서 허용할 표현식 타입과 조합 규칙을 명확히 제한할 수 있어요.
- `append`, 중첩 배열, 괄호보다 문제 영역의 이름이 코드에서 더 잘 드러나게 만들고 싶어요.
- Builder 구현과 오류 메시지를 유지할 비용보다 호출부가 단순해지는 이점이 커요.

다음 상황에서는 일반 Swift 코드가 더 나을 수 있어요.

- 짧은 배열을 한 번 만들고 끝나요.
- `guard`, `while`, 조기 `return`처럼 Builder가 지원하지 않는 제어 흐름이 핵심이에요.
- 조합 규칙보다 값이 변경되는 순서와 부수 효과가 더 중요해요.
- 암시적인 타입 변환이 많아 호출부만 보고 실제 결과를 예상하기 어려워요.
- 팀이 Builder의 변환 규칙을 이해하기 위해 들이는 비용이 반복 코드보다 커요.

Result Builder는 복잡성을 없애지 않아요. 호출부의 조립 복잡성을 Builder 타입으로 옮겨 재사용하는 기능이에요. 재사용할 구조와 규칙이 충분하지 않다면 배열과 일반 함수가 더 단순해요.

## 적용 순서를 정리해요

1. 먼저 배열, 튜플, 트리처럼 최종으로 만들 값의 타입을 정해요.
2. 한 줄의 표현식 타입과 Builder 내부에서 합칠 `Component` 타입을 구분해요.
3. 가장 작은 `buildExpression(_:)`과 `buildBlock(_:)` 또는 두 `buildPartialBlock` 메서드로 정적인 예제를 만들어요.
4. `@Builder`를 클로저 매개변수나 getter에 적용하고 호출부의 반환 타입을 확인해요.
5. 실제 호출부에 필요한 조건문과 반복문만 골라 `buildOptional`, `buildEither`, `buildArray`를 추가해요.
6. 각 갈래와 반복 결과가 같은 `Component` 타입으로 합쳐지는지 테스트해요.
7. 축약 문법이 문제 영역의 의미를 숨기지 않는지 다른 개발자의 관점에서 읽어 봐요.
8. 단순 배열 구현과 비교해 Builder를 유지할 만큼 반복과 계층 구조가 있는지 다시 판단해요.

## 흔한 오해를 정리해요

### Result Builder는 여러 값을 튜플로 반환하나요?

항상 튜플을 만드는 것은 아니에요. 최종 타입은 Builder의 결과 조합 메서드가 결정해요. 이 문서의 Builder는 `[SettingsRow]`을 만들고, SwiftUI의 Builder는 View 콘텐츠에 맞는 타입을 조합해요.

### buildBlock을 개발자가 직접 호출해야 하나요?

아니요. 일반적인 호출부에서는 Builder 블록만 작성하고 컴파일러가 필요한 메서드를 호출해요. 메서드를 직접 호출하는 코드는 변환 원리를 설명하거나 Builder 구현을 독립적으로 테스트할 때만 필요할 수 있어요.

### @resultBuilder만 붙이면 if와 for를 모두 사용할 수 있나요?

아니요. `if`와 `for`에 대응하는 `buildOptional`, `buildEither`, `buildArray`가 Builder 타입에 있어야 해요. Result Builder가 제공하는 메서드 집합이 DSL에서 허용할 문법을 결정해요.

### Result Builder와 Builder 디자인 패턴은 같은가요?

아니요. Result Builder는 컴파일러가 코드 블록을 변환하는 Swift 언어 기능이에요. Builder 디자인 패턴은 보통 상태를 가진 객체가 생성 단계를 저장했다가 복잡한 객체를 만드는 설계 방식이에요.

### Result Builder를 사용하면 코드가 항상 더 읽기 쉬워지나요?

아니요. 목록이나 트리의 구조가 반복되고 조합 규칙이 명확할 때 효과가 커요. 한 번 쓰는 짧은 배열이나 순차적인 상태 변경 코드에서는 암시적인 변환 때문에 오히려 이해하기 어려울 수 있어요.

## 면접에서 이어질 수 있는 질문

### Result Builder는 어떻게 동작하나요?

컴파일러가 Result Builder 속성이 적용된 블록의 표현식과 제어문을 Builder 타입의 `static build...` 메서드 호출로 변환해요. 각 표현식에서 만든 부분 결과를 합쳐 클로저나 getter의 최종 반환값을 만들어요.

### buildExpression과 buildBlock의 차이는 무엇인가요?

`buildExpression(_:)`은 블록의 개별 표현식을 Builder 내부의 `Component`로 바꿔요. `buildBlock(_:)`은 같은 블록에서 만들어진 여러 `Component`를 하나의 `Component`로 합쳐요.

### if와 for를 지원하려면 무엇이 필요한가요?

`else` 없는 `if`에는 `buildOptional(_:)`, `if-else`와 `switch`에는 두 `buildEither` 메서드, `for`에는 `buildArray(_:)`이 필요해요. 각 메서드는 해당 제어문에서 만들어진 부분 결과를 Builder의 `Component`로 합쳐요.

### Result Builder의 장점과 비용은 무엇인가요?

반복되는 목록이나 트리 구성을 선언형이고 타입 안전한 문법으로 표현할 수 있다는 장점이 있어요. 반면 변환 규칙을 알아야 오류를 해석할 수 있고, 지원할 제어문과 타입 변환을 Builder가 직접 설계하고 유지해야 하는 비용이 있어요.

### Result Builder는 언제 만들지 않는 편이 좋은가요?

짧은 배열을 한 번 만들거나 조기 반환과 상태 변경이 핵심이라면 일반 함수와 배열이 더 직접적이에요. 호출부의 반복되는 조립 코드가 충분하고, 허용할 표현식과 조합 규칙이 명확할 때 Result Builder를 검토하는 편이 좋아요.

## 실전 예제: PopPangListKit은 UIKit 목록을 SwiftUI처럼 선언해요

[PopPangListKit](https://github.com/team-PopPang/PopPangListKit)은 `UICollectionView` 화면을 `List → Section → Cell` 구조로 표현하는 선언형 목록 프레임워크예요. SwiftUI의 `List`처럼 화면에 필요한 구조를 중첩해 작성하지만, 실제 렌더링과 업데이트는 UIKit의 `UICollectionView`가 담당해요.

이 예제는 PopPangListKit 저장소의 `def8d460` 커밋에서 확인한 공개 API를 기준으로 해요. 라이브러리가 발전하면 세부 시그니처가 달라질 수 있으므로 실제 프로젝트에 적용할 때는 [최신 README](https://github.com/team-PopPang/PopPangListKit#readme)도 함께 확인해야 해요.

### 먼저 목록 구성에 필요한 역할을 구분해요

| 용어                      | 이 예제에서 하는 일                                                                                                                                                 |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `UICollectionView`        | UIKit에서 재사용 가능한 Cell을 세로 목록, 가로 목록, 그리드로 보여 주는 View예요.                                                                                   |
| adapter                   | 화면의 데이터와 `UICollectionViewDataSource`, `UICollectionViewDelegate` 같은 UIKit 인터페이스 사이를 연결하는 객체예요.                                            |
| snapshot                  | 특정 시점에 화면이 가져야 할 Section과 Cell의 전체 상태예요. 이전 snapshot과 새 snapshot을 비교하면 삽입, 삭제, 이동, 내용 변경을 찾을 수 있어요.                   |
| `Component`               | 하나의 데이터 Item과 이를 표시할 `UIView`의 생성·업데이트·크기 규칙을 묶는 PopPangListKit 프로토콜이에요.                                                           |
| `List`, `Section`, `Cell` | 화면 전체, 구역, 개별 항목을 나타내는 값이에요. SwiftUI의 같은 이름을 가진 타입과는 별개이며, PopPangListKit에서는 `CollectionViewAdapter`에 전달할 snapshot이에요. |

PopPangListKit의 역할을 한 흐름으로 연결하면 다음과 같아요.

```text
List { ... } 클로저
  └─ SectionsBuilder → [Section]
       └─ Section { ... } 클로저
            └─ CellsBuilder → [Cell]
                 ↓
            List snapshot
                 ↓
      CollectionViewAdapter.apply
                 ↓
  diff 계산 → UICollectionView 업데이트
```

Result Builder가 담당하는 범위는 위 흐름의 `[Section]`과 `[Cell]` 조합까지예요. diff를 계산하거나 Cell을 재사용하고 화면을 갱신하는 일은 `CollectionViewAdapter`의 책임이에요.

### 화면에 표시할 Item과 Component를 먼저 만들어요

팝업 스토어 목록을 만든다고 가정할게요. `Popup`은 화면 데이터이고, `PopupRowComponent`는 `Popup`을 `PopupRowView`에 연결해요.

```swift
import PopPangListKit
import UIKit

struct Popup: Identifiable, Equatable {
  let id: UUID
  let title: String
  let location: String
}

final class PopupRowView: UIView {
  func configure(with popup: Popup) {
    accessibilityLabel = "\(popup.title), \(popup.location)"

    // 실제 앱에서는 UILabel 계층과 Auto Layout 제약을 갱신해요.
  }
}

struct PopupRowComponent: Component {
  let item: Popup

  var layoutMode: ContentLayoutMode {
    .flexibleHeight(estimatedHeight: 72)
  }

  func renderContent(
    coordinator: Void
  ) -> PopupRowView {
    PopupRowView()
  }

  func render(
    in content: PopupRowView,
    coordinator: Void
  ) {
    content.configure(with: item)
  }
}
```

`renderContent(coordinator:)`는 표시할 View를 처음 만들고, `render(in:coordinator:)`는 새 Item을 기존 View에 반영해요. 화면을 다시 그릴 때마다 View 계층을 새로 만들지 않고 재사용할 수 있는 경계예요.

목록이 비었거나 공지 문구를 보여 줄 때 사용할 간단한 Component도 준비해요.

```swift
struct MessageComponent: Component {
  let item: String

  var layoutMode: ContentLayoutMode {
    .flexibleHeight(estimatedHeight: 52)
  }

  func renderContent(
    coordinator: Void
  ) -> UILabel {
    let label = UILabel()
    label.numberOfLines = 0
    return label
  }

  func render(
    in content: UILabel,
    coordinator: Void
  ) {
    content.text = item
  }
}
```

두 Component 모두 Item이 `Equatable`이에요. PopPangListKit은 같은 ID의 Cell에서 Item이 달라졌는지 판단해 필요한 콘텐츠를 갱신해요.

### Result Builder 없이도 같은 snapshot을 만들 수 있어요

PopPangListKit의 `List`, `Section`, `Cell`은 배열을 받는 초기화 메서드도 제공해요. 따라서 Result Builder 없이 일반 Swift 코드만으로 같은 snapshot을 만들 수 있어요.

```swift
@MainActor
func makePopupListWithoutBuilder(
  popups: [Popup],
  showsNotice: Bool,
  onSelect: @escaping (Popup) -> Void
) -> List {
  var sections: [Section] = []

  if showsNotice {
    let noticeCell = Cell(
      id: "notice",
      component: MessageComponent(
        item: "이번 주에 새로운 팝업이 열렸어요."
      )
    )

    let noticeSection = Section(
      id: "notice",
      cells: [noticeCell]
    )
    .withSectionLayout(
      VerticalLayout(spacing: 0)
    )

    sections.append(noticeSection)
  }

  var popupCells: [Cell] = []

  if popups.isEmpty {
    popupCells.append(
      Cell(
        id: "empty",
        component: MessageComponent(
          item: "표시할 팝업이 없어요."
        )
      )
    )
  } else {
    for popup in popups {
      let cell = Cell(
        id: popup.id,
        component: PopupRowComponent(item: popup)
      )
      .didSelect { _ in
        onSelect(popup)
      }

      popupCells.append(cell)
    }
  }

  let popupSection = Section(
    id: "popups",
    cells: popupCells
  )
  .withSectionLayout(
    VerticalLayout(spacing: 8)
      .insets(
        NSDirectionalEdgeInsets(
          top: 16,
          leading: 20,
          bottom: 24,
          trailing: 20
        )
      )
  )

  sections.append(popupSection)
  return List(sections: sections)
}
```

이 코드는 틀리지 않았고 실행 순서도 직접 보여 줘요. 다만 두 단계의 계층을 만들기 위해 다음 조립 코드가 화면 구조 사이에 반복돼요.

- `var sections`, `var popupCells`처럼 중간 배열을 선언해요.
- 각 값을 만든 뒤 올바른 부모 배열에 `append`해야 해요.
- 공지 Section과 팝업 Section의 관계가 멀리 떨어져 보여요.
- 조건과 반복이 “무엇을 보여 줄지”뿐 아니라 “어느 배열에 넣을지”까지 함께 처리해요.

화면이 짧고 한 번만 만들어진다면 이 비용은 크지 않아요. 하지만 여러 화면이 같은 `List → Section → Cell` 계층을 반복한다면 조립 규칙을 Result Builder로 재사용할 가치가 생겨요.

### List와 Section의 초기화 메서드가 Builder 경계를 만들어요

PopPangListKit의 실제 [`List`](https://github.com/team-PopPang/PopPangListKit/blob/def8d46068b8e595381de159305702a5e18a6c55/Sources/PopPangListKit/CollectionReusable/35.%20List.swift)는 `SectionsBuilder`, [`Section`](https://github.com/team-PopPang/PopPangListKit/blob/def8d46068b8e595381de159305702a5e18a6c55/Sources/PopPangListKit/CollectionReusable/10.%20Section.swift)은 `CellsBuilder`를 클로저 매개변수에 적용해요.

```swift
public struct List {
  public init(
    @SectionsBuilder _ sections: () -> [Section]
  ) {
    self.sections = sections()
  }
}

public struct Section {
  public init(
    id: some Hashable,
    @CellsBuilder _ cells: () -> [Cell]
  ) {
    // 실제 구현은 Cell ID에 Section 범위를 적용해 저장해요.
  }
}
```

위 코드는 학습에 필요한 시그니처만 남긴 개념 코드예요. 실제 구현은 이벤트 저장소와 Section 범위의 Cell ID 처리도 담당해요.

두 Builder는 입력 계층만 다르고 조합 원리는 같아요.

| 블록에 작성한 문법 | `CellsBuilder`의 결과               | `SectionsBuilder`의 결과                 |
| ------------------ | ----------------------------------- | ---------------------------------------- |
| 단일 표현식        | `Cell`을 `[Cell]`로 바꿔요.         | `Section`을 `[Section]`으로 바꿔요.      |
| 여러 표현식        | 여러 `[Cell]`을 하나로 합쳐요.      | 여러 `[Section]`을 하나로 합쳐요.        |
| `if`               | 없어진 갈래를 빈 `[Cell]`로 바꿔요. | 없어진 갈래를 빈 `[Section]`으로 바꿔요. |
| `if-else`          | 선택된 Cell 배열을 유지해요.        | 선택된 Section 배열을 유지해요.          |
| `for`              | 반복마다 만든 `[Cell]`을 펼쳐요.    | 반복마다 만든 `[Section]`을 펼쳐요.      |

즉, Builder는 `Cell`과 `Section`을 만드는 방법을 알지 못해요. 블록에서 이미 만들어진 값을 각 계층의 배열로 바꾸고 합치는 방법만 알아요.

### 선언형 문법에서는 최종 화면 구조가 바로 보여요

같은 입력을 PopPangListKit의 Builder 초기화 메서드로 작성해 볼게요.

```swift
@MainActor
func makePopupList(
  popups: [Popup],
  showsNotice: Bool,
  onSelect: @escaping (Popup) -> Void
) -> List {
  List {
    if showsNotice {
      Section(id: "notice") {
        Cell(
          id: "notice",
          component: MessageComponent(
            item: "이번 주에 새로운 팝업이 열렸어요."
          )
        )
      }
      .withSectionLayout(
        VerticalLayout(spacing: 0)
      )
    }

    Section(id: "popups") {
      if popups.isEmpty {
        Cell(
          id: "empty",
          component: MessageComponent(
            item: "표시할 팝업이 없어요."
          )
        )
      } else {
        for popup in popups {
          Cell(
            id: popup.id,
            component: PopupRowComponent(item: popup)
          )
          .didSelect { _ in
            onSelect(popup)
          }
        }
      }
    }
    .withSectionLayout(
      VerticalLayout(spacing: 8)
        .insets(
          NSDirectionalEdgeInsets(
            top: 16,
            leading: 20,
            bottom: 24,
            trailing: 20
          )
        )
    )
  }
}
```

이제 `List` 블록에는 Section이, 각 `Section` 블록에는 Cell이 중첩돼요. `showsNotice`와 `popups.isEmpty`는 항목을 포함할 조건만 설명하고, `for`는 각 팝업이 Cell 하나가 된다는 관계를 보여 줘요.

Builder를 사용해도 `if` 조건과 `for` 반복은 실행 시점에 평가돼요. 달라진 것은 제어 흐름이 아니라 각 갈래와 반복의 결과를 배열에 넣는 코드가 Builder로 이동했다는 점이에요.

### for 한 부분을 build 메서드로 펼쳐 봐요

팝업을 반복하는 부분만 개념적으로 변환하면 다음과 같아요.

```swift
let repeatedCells: [[Cell]] = popups.map { popup in
  CellsBuilder.buildExpression(
    Cell(
      id: popup.id,
      component: PopupRowComponent(item: popup)
    )
  )
}

let cells = CellsBuilder.buildBlock(
  CellsBuilder.buildArray(repeatedCells)
)

let section = Section(
  id: "popups",
  cells: cells
)

let sections = SectionsBuilder.buildBlock(
  SectionsBuilder.buildExpression(section)
)

let list = List(sections: sections)
```

실제 컴파일러가 위 지역 변수 이름을 그대로 만드는 것은 아니에요. 다만 `for`의 각 반복이 `[Cell]`을 만들고, `buildArray(_:)`이 `[[Cell]]`을 `[Cell]`로 펼친 뒤, 바깥 Builder가 `Section`을 `[Section]`으로 바꾼다는 타입 흐름을 확인할 수 있어요.

### CollectionViewAdapter는 완성된 snapshot을 화면에 반영해요

View Controller는 `UICollectionView`, layout adapter, `CollectionViewAdapter`를 한 번 연결하고 상태가 달라질 때 새 `List`를 적용해요.

```swift
@MainActor
final class PopupListViewController: UIViewController {
  private var popups: [Popup] = []
  private var showsNotice = true

  private let layoutAdapter =
    CollectionViewLayoutAdapter()

  private lazy var collectionView =
    UICollectionView(layoutAdapter: layoutAdapter)

  private lazy var adapter = CollectionViewAdapter(
    configuration: .init(),
    collectionView: collectionView,
    layoutAdapter: layoutAdapter
  )

  override func viewDidLoad() {
    super.viewDidLoad()

    collectionView.translatesAutoresizingMaskIntoConstraints =
      false
    view.addSubview(collectionView)

    NSLayoutConstraint.activate([
      collectionView.topAnchor.constraint(
        equalTo: view.topAnchor
      ),
      collectionView.leadingAnchor.constraint(
        equalTo: view.leadingAnchor
      ),
      collectionView.trailingAnchor.constraint(
        equalTo: view.trailingAnchor
      ),
      collectionView.bottomAnchor.constraint(
        equalTo: view.bottomAnchor
      ),
    ])

    render()
  }

  func render() {
    let list = makePopupList(
      popups: popups,
      showsNotice: showsNotice
    ) { [weak self] popup in
      self?.openPopup(popup)
    }

    adapter.apply(list)
  }

  private func openPopup(_ popup: Popup) {
    // 실제 앱에서는 상세 화면으로 이동해요.
  }
}
```

`render()`를 다시 호출하면 Builder는 현재 상태로 새 snapshot을 만들어요. [`CollectionViewAdapter`](https://github.com/team-PopPang/PopPangListKit/blob/def8d46068b8e595381de159305702a5e18a6c55/Sources/PopPangListKit/Adapter/52.%20CollectionViewAdapter.swift)는 이전 snapshot과 새 snapshot의 차이를 계산해 필요한 Cell만 삽입, 삭제, 이동, 갱신해요.

여기서 책임을 혼동하지 않는 것이 중요해요.

| 타입·기능                     | 책임                                                                            |
| ----------------------------- | ------------------------------------------------------------------------------- |
| `CellsBuilder`                | Cell 표현식, 조건, 반복 결과를 `[Cell]`로 합쳐요.                               |
| `SectionsBuilder`             | Section 표현식, 조건, 반복 결과를 `[Section]`으로 합쳐요.                       |
| `Component`                   | Item을 어떤 `UIView`로 만들고 재사용 시 어떻게 갱신할지 정의해요.               |
| `Section`의 layout modifier   | 해당 Section을 세로 목록, 가로 목록, 그리드 중 어떤 형태로 배치할지 정해요.     |
| `CollectionViewAdapter.apply` | 새 `List` snapshot을 이전 상태와 비교해 `UICollectionView` 업데이트로 연결해요. |

Result Builder만으로 목록 프레임워크가 완성되는 것은 아니에요. Builder는 호출부에서 구조를 읽기 쉽게 만드는 입력 계층이고, identity, diff, View 재사용, layout은 별도의 타입이 맡아야 해요.

### SwiftUI List와 문법은 닮았지만 결과 타입은 달라요

SwiftUI의 [`List`](https://developer.apple.com/documentation/swiftui/list)도 Result Builder가 적용된 View 클로저를 받아 행과 Section을 선언형으로 구성해요. PopPangListKit은 이 작성 경험을 UIKit 목록 snapshot에 적용해요.

| 비교 기준       | SwiftUI `List`                               | PopPangListKit `List`                                    | UIKit을 직접 구성하는 방식                     |
| --------------- | -------------------------------------------- | -------------------------------------------------------- | ---------------------------------------------- |
| 블록의 결과     | SwiftUI View 구조예요.                       | `[Section]`과 `[Cell]`로 이루어진 snapshot이에요.        | 개발자가 관리하는 배열과 data source 상태예요. |
| 화면 렌더러     | SwiftUI 런타임이 View를 갱신해요.            | `CollectionViewAdapter`와 `UICollectionView`가 갱신해요. | View Controller와 data source가 직접 갱신해요. |
| 조건·반복 표현  | View Builder 문법 안에 작성해요.             | Sections/Cells Builder 문법 안에 작성해요.               | 배열 수정과 data source 분기를 직접 작성해요.  |
| UIKit 제어 범위 | SwiftUI가 제공하는 API 경계 안에서 제어해요. | Compositional Layout과 UIKit Component를 사용해요.       | UIKit API 전체를 직접 제어해요.                |

문법이 닮았다는 것은 내부 구현이 같다는 뜻이 아니에요. 공통점은 “중첩된 결과 구조를 Result Builder 블록으로 표현한다”는 API 설계 방식이에요.

### snapshot만 검사하면 Builder 결과를 화면 없이 테스트할 수 있어요

Builder가 만든 결과는 `List`, `Section`, `Cell` 값이므로 adapter를 실행하기 전에 구조를 검사할 수 있어요.

```swift
import Testing

@Test
@MainActor
func noticeAndPopupSectionsAreBuiltInOrder() {
  let popups = [
    Popup(
      id: UUID(),
      title: "성수 북마켓",
      location: "서울 성동구"
    ),
    Popup(
      id: UUID(),
      title: "해운대 디자인숍",
      location: "부산 해운대구"
    ),
  ]

  let list = makePopupList(
    popups: popups,
    showsNotice: true,
    onSelect: { _ in }
  )

  #expect(
    list.sections.map(\.id) == [
      AnyHashable("notice"),
      AnyHashable("popups"),
    ]
  )
  #expect(list.sections[1].cells.count == 2)
  #expect(
    list.sections[1].cells[0].id ==
      AnyHashable(popups[0].id)
  )
}
```

이 테스트는 diff나 실제 Cell 렌더링까지 확인하지 않아요. 대신 조건과 반복이 의도한 Section·Cell 계층을 만들었는지 빠르게 검증해요. `CollectionViewAdapter`의 업데이트와 `Component` 렌더링은 각각 별도 통합 테스트로 나누는 편이 실패 원인을 찾기 쉬워요.

### 이 사례에서 Result Builder가 유용한 이유를 정리해요

PopPangListKit 사례에는 Result Builder가 잘 맞는 조건이 여러 개 모여 있어요.

1. 화면마다 `List → Section → Cell`이라는 같은 계층을 반복해요.
2. 각 블록에서 허용할 값이 `Section`과 `Cell`로 명확해요.
3. 조건문과 반복문이 최종 화면 구조를 직접 설명해요.
4. Builder의 결과인 `[Section]`, `[Cell]`을 독립적으로 검사할 수 있어요.
5. 렌더링과 업데이트는 adapter에 분리되어 Builder가 부수 효과를 만들지 않아요.

반대로 Cell 몇 개를 한 번만 표시하거나 목록 갱신 과정 자체를 세밀하게 명령하는 것이 핵심이라면 일반 배열과 UIKit 코드가 더 직접적일 수 있어요. Result Builder를 도입하는 기준은 SwiftUI와 비슷해 보이는지가 아니라, **반복되는 계층 조립 규칙을 여러 호출부에서 재사용할 수 있는지**예요.

## 두 번째 실전 예제: 입력 검증 규칙도 선언형으로 조합할 수 있어요

Result Builder는 UI 전용 기능이 아니에요. 같은 종류의 규칙을 조건과 반복으로 모아 하나의 값으로 만들 때도 사용할 수 있어요.

회원 가입 폼의 검증 규칙을 조합해 볼게요.

```swift
struct SignUpForm {
  let email: String
  let password: String
  let nickname: String?
}

struct ValidationRule {
  let message: String
  let isSatisfied: (SignUpForm) -> Bool
}

@resultBuilder
enum ValidationRulesBuilder {
  static func buildExpression(
    _ expression: ValidationRule
  ) -> [ValidationRule] {
    [expression]
  }

  static func buildBlock(
    _ components: [ValidationRule]...
  ) -> [ValidationRule] {
    components.flatMap { $0 }
  }

  static func buildOptional(
    _ component: [ValidationRule]?
  ) -> [ValidationRule] {
    component ?? []
  }

  static func buildArray(
    _ components: [[ValidationRule]]
  ) -> [ValidationRule] {
    components.flatMap { $0 }
  }
}

struct FormValidator {
  let rules: [ValidationRule]

  init(
    @ValidationRulesBuilder rules: () -> [ValidationRule]
  ) {
    self.rules = rules()
  }

  func messages(
    for form: SignUpForm
  ) -> [String] {
    rules.compactMap { rule in
      rule.isSatisfied(form) ? nil : rule.message
    }
  }
}
```

프로젝트 설정에 따라 닉네임 필수 규칙을 추가하고, 금지어마다 규칙을 반복해서 만들 수 있어요.

```swift
func makeSignUpValidator(
  requiresNickname: Bool,
  bannedWords: [String]
) -> FormValidator {
  FormValidator {
    ValidationRule(
      message: "올바른 이메일을 입력해 주세요.",
      isSatisfied: { $0.email.contains("@") }
    )

    ValidationRule(
      message: "비밀번호는 8자 이상이어야 해요.",
      isSatisfied: { $0.password.count >= 8 }
    )

    if requiresNickname {
      ValidationRule(
        message: "닉네임을 입력해 주세요.",
        isSatisfied: {
          !($0.nickname ?? "").isEmpty
        }
      )
    }

    for word in bannedWords {
      ValidationRule(
        message: "닉네임에 \(word)을 사용할 수 없어요.",
        isSatisfied: {
          !($0.nickname ?? "")
            .lowercased()
            .contains(word.lowercased())
        }
      )
    }
  }
}
```

호출 결과를 확인해 볼게요.

```swift
let validator = makeSignUpValidator(
  requiresNickname: true,
  bannedWords: ["admin"]
)

let messages = validator.messages(
  for: SignUpForm(
    email: "invalid-email",
    password: "short",
    nickname: "Admin User"
  )
)

assert(
  messages == [
    "올바른 이메일을 입력해 주세요.",
    "비밀번호는 8자 이상이어야 해요.",
    "닉네임에 admin을 사용할 수 없어요.",
  ]
)
```

이 예제에서도 Result Builder는 검증을 실행하지 않아요. `ValidationRule`을 `[ValidationRule]`로 조합할 뿐이고, 실제 실행 순서와 오류 수집은 `FormValidator`가 담당해요.

규칙이 독립적이고 여러 설정에서 조합을 재사용한다면 이 구조가 유용해요. 반면 앞 규칙의 결과에 따라 뒤 규칙이 상태를 바꾸거나 즉시 중단해야 한다면 일반 함수의 `guard`와 명시적인 제어 흐름이 더 읽기 쉬울 수 있어요.

두 실전 예제에서 공통으로 확인할 수 있는 기준은 다음과 같아요.

```text
표현식과 조건·반복 → Result Builder가 값의 목록을 구성
구성된 값의 목록   → 별도의 실행기가 렌더링하거나 검증
```

Result Builder는 “무엇을 구성할지”를 선언하는 계층에 두고, “어떻게 실행할지”는 adapter, renderer, validator 같은 별도 타입에 두면 역할이 선명해져요.

## 참고 자료

- [The Swift Programming Language — Result Builders](https://docs.swift.org/swift-book/documentation/the-swift-programming-language/advancedoperators/#Result-Builders)
- [The Swift Programming Language — resultBuilder](https://docs.swift.org/swift-book/documentation/the-swift-programming-language/attributes/#resultBuilder)
- [Swift Evolution SE-0289 — Result Builders](https://github.com/swiftlang/swift-evolution/blob/main/proposals/0289-result-builders.md)
- [Apple Developer — ViewBuilder](https://developer.apple.com/documentation/swiftui/viewbuilder)
- [Apple Developer — List](https://developer.apple.com/documentation/swiftui/list)
- [Apple Developer — UICollectionView](https://developer.apple.com/documentation/uikit/uicollectionview)
- [PopPangListKit 공식 저장소](https://github.com/team-PopPang/PopPangListKit)
- [PopPangListKit — List](https://github.com/team-PopPang/PopPangListKit/blob/def8d46068b8e595381de159305702a5e18a6c55/Sources/PopPangListKit/CollectionReusable/35.%20List.swift)
- [PopPangListKit — Section](https://github.com/team-PopPang/PopPangListKit/blob/def8d46068b8e595381de159305702a5e18a6c55/Sources/PopPangListKit/CollectionReusable/10.%20Section.swift)
- [PopPangListKit — CellsBuilder](https://github.com/team-PopPang/PopPangListKit/blob/def8d46068b8e595381de159305702a5e18a6c55/Sources/PopPangListKit/Builder/33.%20CellsBuilder.swift)
- [PopPangListKit — SectionsBuilder](https://github.com/team-PopPang/PopPangListKit/blob/def8d46068b8e595381de159305702a5e18a6c55/Sources/PopPangListKit/Builder/34.%20SectionsBuilder.swift)
- [PopPangListKit — CollectionViewAdapter](https://github.com/team-PopPang/PopPangListKit/blob/def8d46068b8e595381de159305702a5e18a6c55/Sources/PopPangListKit/Adapter/52.%20CollectionViewAdapter.swift)
