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

## 참고 자료

- [The Swift Programming Language — Result Builders](https://docs.swift.org/swift-book/documentation/the-swift-programming-language/advancedoperators/#Result-Builders)
- [The Swift Programming Language — resultBuilder](https://docs.swift.org/swift-book/documentation/the-swift-programming-language/attributes/#resultBuilder)
- [Swift Evolution SE-0289 — Result Builders](https://github.com/swiftlang/swift-evolution/blob/main/proposals/0289-result-builders.md)
- [Apple Developer — ViewBuilder](https://developer.apple.com/documentation/swiftui/viewbuilder)
