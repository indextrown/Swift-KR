---
title: Swift로 이해하는 some과 불투명 타입
description: Swift의 some이 하나의 숨겨진 구체 타입을 유지하는 원리와 opaque result·parameter type, 반환 규칙 및 any와의 차이를 설명합니다.
pageType: doc-wide
outline: false
---

# Swift로 이해하는 some과 불투명 타입

> **면접 답변 한 줄 요약:** `some Protocol`은 선언의 구현이 선택한 하나의 구체 타입을 호출자에게 숨기되 컴파일러에는 그 타입의 정체성을 유지해, 프로토콜이 보장하는 기능과 정적 타입 관계를 사용하면서 구현 세부사항을 감출 수 있게 하는 불투명 타입 문법이에요.

함수가 프로토콜을 따르는 값을 반환할 때 구체 타입 이름을 그대로 공개하면 호출자가 구현 세부사항에 의존할 수 있어요. 반대로 타입을 완전히 지우면 서로 다른 값을 저장할 수 있는 대신 구체 타입 사이의 관계와 일부 연산을 잃을 수 있어요.

Swift의 `some`은 이 두 선택 사이에서 **구체 타입은 하나로 유지하되 이름만 숨기는 방식**을 제공해요. SwiftUI의 `var body: some View`가 대표적이지만 `some`은 SwiftUI 전용 문법이 아니며, 일반 프로토콜과 제네릭 API에서도 사용할 수 있어요.

이 문서에서는 카탈로그 항목을 반환하는 함수로 불투명 반환 타입을 먼저 이해하고, `some` 매개변수, primary associated type 제약, 프로토콜 연관 타입 추론까지 살펴봐요. 제네릭 자체가 낯설다면 [제네릭](./generics) 문서를 먼저 읽으면 타입을 정하는 주체의 차이를 이해하기 쉬워요.

## 먼저 알아둘 불투명 타입 용어

| 용어                       | 쉬운 뜻                                                                                                                                              |
| -------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| 프로토콜                   | 타입이 제공해야 할 프로퍼티와 메서드를 선언한 약속이에요.                                                                                            |
| 구체 타입                  | 값의 실제 구조와 구현이 정해진 타입이에요. `Book`과 `Video`가 한 예예요.                                                                             |
| 기반 타입(underlying type) | `some Protocol` 뒤에 숨겨진 실제 구체 타입이에요. 함수 본문의 반환값을 보고 컴파일러가 정해요.                                                       |
| 불투명 타입                | 구체 타입 이름은 사용하는 코드에 숨기지만, 컴파일러가 하나의 타입 정체성을 계속 추적하는 타입이에요. 영어로 opaque type이라고 해요.                  |
| 타입 정체성                | 두 값이 컴파일 시점에 같은 구체 타입인지 구분하는 정보예요. 같은 불투명 반환 선언의 결과는 이 정체성을 공유해요.                                     |
| 추상화 경계                | 구현 세부사항을 감추고 외부에 필요한 약속만 보여 주는 경계예요. 함수의 반환 타입이나 모듈의 public API가 한 예예요.                                  |
| 호출자                     | 함수나 프로퍼티를 사용하는 코드예요.                                                                                                                 |
| 구현자                     | 함수 본문이나 프로퍼티 getter를 작성해 실제 반환 타입을 선택하는 쪽이에요.                                                                           |
| 불투명 반환 타입           | `-> some Protocol`처럼 반환 위치에 작성해 구현이 고른 구체 타입을 숨기는 형태예요. 영어로 opaque result type이라고 해요.                             |
| 불투명 매개변수 타입       | `value: some Protocol`처럼 매개변수 위치에 작성하는 가벼운 제네릭 표기예요. 호출자가 전달한 구체 타입을 함수 안에서 하나의 타입 매개변수처럼 다뤄요. |
| 실존 타입                  | `any Protocol`처럼 프로토콜을 따르는 여러 구체 타입을 실행 중 담을 수 있도록 타입을 지운 상자예요. `some`과 달리 저장된 구체 타입이 바뀔 수 있어요.  |

이 문서에서는 다음 내용을 설명해요.

- 구체 반환 타입을 공개할 때 생기는 결합
- `some Protocol`이 기반 타입을 숨기고 정체성을 유지하는 방식
- 모든 반환 경로가 같은 기반 타입이어야 하는 이유
- 같은 불투명 선언과 서로 다른 선언의 타입 정체성
- 제네릭 인자에 따라 달라지는 불투명 타입
- `some` 매개변수와 명시적인 제네릭 매개변수의 관계
- primary associated type으로 불투명 타입의 연관 타입을 제약하는 방법
- 제네릭, `some`, `any`를 선택하는 기준

## 구체 반환 타입은 구현 세부사항을 공개해요

카탈로그에 표시할 항목을 정의해 볼게요.

```swift
protocol CatalogItem: Equatable {
  var id: Int { get }
  var title: String { get }
}

struct Book: CatalogItem {
  let id: Int
  let title: String
  let author: String
}

struct Video: CatalogItem {
  let id: Int
  let title: String
  let duration: Int
}
```

추천 항목을 반환하는 가장 직접적인 함수는 `Book`을 반환 타입으로 적어요.

```swift
func featuredItem() -> Book {
  Book(
    id: 1,
    title: "Swift 기초",
    author: "Blob"
  )
}
```

이 시그니처는 정확하지만 두 가지 사실을 외부에 공개해요.

1. 결과가 `CatalogItem`이라는 API 약속
2. 현재 구현이 결과를 `Book`으로 만든다는 세부사항

호출자는 `author`에 접근하거나 결과를 `Book`만 받는 다른 API에 전달할 수 있어요.

```swift
let featured = featuredItem()
print(featured.author)
```

나중에 구현을 `FeaturedBook`이라는 전용 타입이나 여러 값을 조합한 제네릭 타입으로 바꾸면 함수 본문만 바뀌는 것이 아니에요. 공개된 반환 타입에 의존한 호출 코드도 영향을 받아요.

호출자에게 필요한 약속이 `id`와 `title`뿐이라면 구체 타입 이름을 API에 공개하지 않는 편이 변경 범위를 줄일 수 있어요.

## some은 하나의 구체 타입을 숨겨 반환해요

반환 타입을 `some CatalogItem`으로 바꿔 볼게요.

```swift
func featuredItem()
  -> some CatalogItem {
  Book(
    id: 1,
    title: "Swift 기초",
    author: "Blob"
  )
}
```

이 선언을 두 관점으로 읽어야 해요.

- 호출자에게는 “결과가 `CatalogItem`을 따른다”라고 보여요.
- 구현과 컴파일러에는 “기반 타입은 항상 `Book`이다”라는 사실이 남아 있어요.

호출자는 프로토콜이 보장하는 멤버를 사용할 수 있어요.

```swift
let featured = featuredItem()

print(featured.id)
print(featured.title)
```

하지만 정적 타입 시스템에서 결과를 `Book`이라고 가정할 수는 없어요.

```swift
// 오류: 호출자에게 기반 타입 Book은 공개되지 않아요.
let book: Book = featuredItem()
```

불투명 타입은 구체 타입을 `Any`처럼 없애는 것이 아니에요. 타입 이름에 접근하지 못하게 추상화 경계를 만들 뿐, 컴파일러는 같은 불투명 타입인지 계속 구분해요.

Swift 공식 [Opaque and Boxed Protocol Types](https://docs.swift.org/swift-book/documentation/the-swift-programming-language/opaquetypes/) 문서도 불투명 타입은 구현 타입을 숨기지만 타입 정체성을 보존한다고 설명해요.

## 반환 경로마다 같은 기반 타입을 사용해야 해요

`some CatalogItem`은 “조건마다 아무 `CatalogItem`이나 반환해도 된다”는 뜻이 아니에요. 하나의 선언에는 하나의 기반 타입이 있어야 해요.

다음 함수는 두 반환 경로의 타입이 모두 `Book`이므로 유효해요.

```swift
func recommendedBook(
  isBeginner: Bool
) -> some CatalogItem {
  if isBeginner {
    return Book(
      id: 1,
      title: "Swift 기초",
      author: "Blob"
    )
  }

  return Book(
    id: 2,
    title: "Swift 심화",
    author: "Mango"
  )
}
```

반면 `Book`과 `Video`를 조건에 따라 직접 반환하면 컴파일되지 않아요.

```swift
// 컴파일되지 않는 예예요.
func recommendedItem(
  prefersVideo: Bool
) -> some CatalogItem {
  if prefersVideo {
    return Video(
      id: 2,
      title: "Swift 동시성",
      duration: 35
    )
  }

  return Book(
    id: 1,
    title: "Swift 기초",
    author: "Blob"
  )
  // 오류: 기반 타입을 Video와 Book 중 하나로 정할 수 없어요.
}
```

프로토콜 준수 여부만 보면 두 타입 모두 조건을 만족해요. 하지만 불투명 반환 타입은 준수 여부뿐 아니라 하나의 타입 정체성을 약속하므로 모든 반환 경로의 기반 타입이 같아야 해요.

## 서로 다른 경우를 하나의 구체 타입으로 감쌀 수 있어요

조건에 따라 책이나 영상을 표현해야 하지만 불투명 타입의 정체성을 유지하고 싶다면, 두 경우를 하나의 열거형으로 감쌀 수 있어요.

```swift
enum FeaturedItem: CatalogItem {
  case book(Book)
  case video(Video)

  var id: Int {
    switch self {
    case let .book(book):
      book.id
    case let .video(video):
      video.id
    }
  }

  var title: String {
    switch self {
    case let .book(book):
      book.title
    case let .video(video):
      video.title
    }
  }
}
```

이제 반환 경로의 기반 타입은 항상 `FeaturedItem`이에요.

```swift
func recommendedItem(
  prefersVideo: Bool
) -> some CatalogItem {
  if prefersVideo {
    return FeaturedItem.video(
      Video(
        id: 2,
        title: "Swift 동시성",
        duration: 35
      )
    )
  }

  return FeaturedItem.book(
    Book(
      id: 1,
      title: "Swift 기초",
      author: "Blob"
    )
  )
}
```

열거형은 가능한 경우가 닫혀 있고 각 경우의 동작을 직접 제어할 때 잘 맞아요. 새 준수 타입을 실행 중 자유롭게 저장하고 교체해야 한다면 [`any CatalogItem`](./existential-types)이 더 직접적인 표현일 수 있어요.

## 같은 선언의 결과는 같은 불투명 타입이에요

같은 함수의 서로 다른 호출 결과는 같은 불투명 타입 정체성을 공유해요.

```swift
let first = featuredItem()
let second = featuredItem()

print(first == second)
```

`CatalogItem`이 `Equatable`을 따르고 두 값이 같은 불투명 타입이므로 `==`를 사용할 수 있어요. 호출자는 기반 타입이 `Book`이라는 사실은 모르지만, 두 결과가 같은 타입이라는 사실은 알아요.

배열에도 함께 담을 수 있어요.

```swift
let featuredItems = [
  featuredItem(),
  featuredItem(),
]
```

각 값의 타입 이름은 숨겨져 있지만 배열의 원소 타입은 `featuredItem()`이 만든 하나의 불투명 반환 타입으로 정해져요.

## 서로 다른 선언의 불투명 타입은 별개예요

두 함수가 우연히 같은 `Book`을 반환해도 각각의 `some CatalogItem`은 별개의 불투명 타입이에요.

```swift
func featuredItem()
  -> some CatalogItem {
  Book(
    id: 1,
    title: "Swift 기초",
    author: "Blob"
  )
}

func latestItem()
  -> some CatalogItem {
  Book(
    id: 2,
    title: "Swift 심화",
    author: "Mango"
  )
}
```

다음 대입은 허용되지 않아요.

```swift
var item = featuredItem()

// 오류: latestItem()은 다른 불투명 타입이에요.
item = latestItem()
```

호출자가 두 함수의 기반 타입을 `Book`이라고 가정할 수 있다면 구현 타입을 숨긴 의미가 없어져요. Swift는 불투명 타입을 선언별로 구분해 각 API의 추상화 경계를 지켜요.

여러 API가 반드시 같은 반환 타입을 공유해야 한다면 다음 중 하나를 검토해요.

- 구체 반환 타입을 공개해요.
- 공통 wrapper나 열거형을 반환해요.
- 하나의 함수나 타입의 멤버로 결과 생성을 모아요.
- 런타임 교체가 목적이라면 `any Protocol`을 사용해요.

## 제네릭 인자가 다르면 불투명 결과도 달라질 수 있어요

불투명 반환 타입의 기반 타입은 바깥 제네릭 인자에 의존할 수 있어요.

```swift
func duplicate<Item>(
  _ item: Item
) -> some Collection {
  [item, item]
}
```

구현의 기반 타입은 `[Item]`이에요.

```swift
let numbers = duplicate(3)
// 기반 타입은 [Int]

let words = duplicate("Swift")
// 기반 타입은 [String]
```

같은 함수 이름을 호출했지만 `Item`이 다르므로 두 결과의 불투명 타입도 달라요.

```swift
var values = duplicate(3)

// 오류: duplicate(String)의 결과는
// duplicate(Int)의 결과와 다른 불투명 타입이에요.
values = duplicate("Swift")
```

하나의 제네릭 인자 조합 안에서는 기반 타입이 일관되지만, 다른 타입 인자 조합까지 같은 타입일 필요는 없어요.

## some 반환은 구현이 타입을 선택하는 역방향 제네릭이에요

일반 제네릭 매개변수에서는 호출자가 타입을 선택해요.

```swift
func describe<Item: CatalogItem>(
  _ item: Item
) -> String {
  item.title
}
```

```text
호출자: Book을 전달할게요.
함수: Item이 무엇인지 추상적으로 다룰게요.
```

불투명 반환 타입에서는 구현이 타입을 선택해요.

```swift
func featuredItem()
  -> some CatalogItem {
  Book(
    id: 1,
    title: "Swift 기초",
    author: "Blob"
  )
}
```

```text
함수: 기반 타입은 내가 Book으로 정할게요.
호출자: 이름은 모르지만 CatalogItem으로 사용할게요.
```

이 때문에 불투명 반환 타입을 **역방향 제네릭(reverse generic)**이라는 관점으로 설명하기도 해요. [SE-0244](https://github.com/swiftlang/swift-evolution/blob/main/proposals/0244-opaque-result-types.md)는 일반 제네릭은 호출자가 타입을 선택하고, 불투명 반환은 구현이 타입을 선택한다고 설명해요.

| 방향                  | 타입을 선택하는 쪽 | 타입을 추상적으로 보는 쪽 |
| --------------------- | ------------------ | ------------------------- |
| 제네릭 매개변수 `<T>` | 호출자             | 함수 구현                 |
| 불투명 반환 `some P`  | 함수 구현          | 호출자                    |

이 모델은 반환 위치의 `some`을 이해할 때 유용해요. 매개변수 위치의 `some`은 다음 섹션처럼 일반 제네릭의 가벼운 표기이므로 타입을 선택하는 방향이 달라요.

## some 매개변수는 이름 없는 제네릭 매개변수예요

매개변수 타입에도 `some`을 사용할 수 있어요.

```swift
func printTitle(
  _ item: some CatalogItem
) {
  print(item.title)
}
```

이 함수는 다음 제네릭 함수의 가벼운 표기예요.

```swift
func printTitle<Item: CatalogItem>(
  _ item: Item
) {
  print(item.title)
}
```

두 경우 모두 호출자가 구체 타입을 선택해요.

```swift
printTitle(
  Book(
    id: 1,
    title: "Swift 기초",
    author: "Blob"
  )
)

printTitle(
  Video(
    id: 2,
    title: "Swift 동시성",
    duration: 35
  )
)
```

`some` 매개변수는 제약이 단순하고 함수 본문이나 반환 타입에서 타입 매개변수의 이름을 다시 사용할 필요가 없을 때 읽기 쉬워요.

## 여러 some 매개변수는 각각 독립된 타입이에요

다음 함수의 두 `some CatalogItem`은 서로 다른 이름 없는 타입 매개변수예요.

```swift
func printPair(
  _ first: some CatalogItem,
  _ second: some CatalogItem
) {
  print(first.title)
  print(second.title)
}
```

따라서 `Book`과 `Video`를 함께 전달할 수 있어요.

```swift
printPair(
  Book(
    id: 1,
    title: "Swift 기초",
    author: "Blob"
  ),
  Video(
    id: 2,
    title: "Swift 동시성",
    duration: 35
  )
)
```

두 인자가 반드시 같은 구체 타입이어야 한다면 이름 있는 타입 매개변수를 사용해야 해요.

```swift
func areEqual<Item: CatalogItem>(
  _ first: Item,
  _ second: Item
) -> Bool {
  first == second
}
```

같은 `Item`을 두 위치에 사용했으므로 `Book`과 `Video`를 섞어 전달할 수 없어요. 타입 사이의 관계를 반복해서 표현해야 한다면 `<Item>` 형태가 더 정확해요.

Swift Evolution의 [SE-0341](https://github.com/swiftlang/swift-evolution/blob/main/proposals/0341-opaque-parameters.md)은 `some P` 매개변수를 이름이 필요 없는 제네릭 매개변수의 가벼운 문법으로 도입했어요.

## some 매개변수와 some 반환은 같은 단어지만 방향이 달라요

다음 시그니처에는 `some`이 두 번 등장해요.

```swift
func copyTitle(
  from item: some CatalogItem
) -> some CatalogItem {
  Book(
    id: item.id,
    title: item.title,
    author: "Unknown"
  )
}
```

각 위치를 따로 읽어야 해요.

| 위치                        | 구체 타입 선택 주체 | 이 예제의 타입                          |
| --------------------------- | ------------------- | --------------------------------------- |
| 매개변수 `some CatalogItem` | 호출자              | 호출마다 `Book`, `Video` 등이 가능해요. |
| 반환 `some CatalogItem`     | 함수 구현           | 기반 타입은 항상 `Book`이에요.          |

매개변수로 들어온 타입과 반환 타입은 자동으로 같은 타입이 아니에요. 같은 타입을 그대로 반환한다는 관계가 필요하면 이름 있는 제네릭을 사용해요.

```swift
func identity<Item: CatalogItem>(
  _ item: Item
) -> Item {
  item
}
```

`identity(_:)`는 입력이 `Video`이면 반환도 `Video`, 입력이 `Book`이면 반환도 `Book`이라는 관계를 시그니처에 표현해요.

## primary associated type으로 숨겨진 타입의 일부 관계를 공개해요

불투명 타입은 기반 타입 이름을 숨기지만, 호출자가 꼭 알아야 할 연관 타입 관계까지 숨길 필요는 없어요.

카탈로그 소스의 `Item`을 primary associated type으로 선언해 볼게요.

```swift
protocol CatalogSource<Item> {
  associatedtype Item: CatalogItem

  func load() -> [Item]
}

struct BookSource: CatalogSource {
  func load() -> [Book] {
    [
      Book(
        id: 1,
        title: "Swift 기초",
        author: "Blob"
      ),
    ]
  }
}
```

구체 소스 타입은 숨기면서 `Item == Book`이라는 관계를 공개할 수 있어요.

```swift
func makeBookSource()
  -> some CatalogSource<Book> {
  BookSource()
}

let source = makeBookSource()
let books: [Book] = source.load()
```

호출자는 결과가 `BookSource`라는 사실은 모르지만 `load()`가 `[Book]`을 반환한다는 사실은 알아요. 불투명 타입이 타입 정체성과 연관 타입 정보를 보존하기 때문에 가능해요.

`some CatalogSource`만 적으면 `Item`의 정확한 타입을 API에 명시하지 않아요.

```swift
func makeSource()
  -> some CatalogSource {
  BookSource()
}
```

함수 사용에 필요한 관계를 기준으로 제약을 공개해야 해요. 호출자가 `Book` 전용 API에 결과를 연결해야 한다면 `some CatalogSource<Book>`이 더 유용한 계약이에요.

## 프로토콜 연관 타입을 some 구현으로 추론할 수 있어요

프로토콜이 결과 타입을 연관 타입으로 요구할 때, 준수 타입의 구현에서 `some`을 사용할 수 있어요.

```swift
protocol FeaturedProviding {
  associatedtype Featured: CatalogItem

  func featured() -> Featured
}

struct HomeProvider: FeaturedProviding {
  func featured()
    -> some CatalogItem {
    Book(
      id: 1,
      title: "Swift 기초",
      author: "Blob"
    )
  }
}
```

컴파일러는 `HomeProvider.Featured`를 `featured()`의 불투명 반환 타입으로 추론해요. 외부에는 구체 기반 타입 이름을 공개하지 않으면서 `HomeProvider` 안에서는 항상 같은 `Featured` 타입을 제공해요.

프로토콜 요구사항 자체에 `some` 반환을 직접 적기보다, 연관 타입으로 관계를 선언하고 준수 타입의 구현에서 `some`으로 구체 타입을 숨기는 구조가 명확해요.

## 프로퍼티에서도 불투명 타입을 사용할 수 있어요

계산 프로퍼티의 반환 타입을 숨길 수 있어요.

```swift
var previewItem: some CatalogItem {
  Book(
    id: 0,
    title: "미리보기",
    author: "Preview"
  )
}
```

초깃값이 있는 저장 프로퍼티나 지역 상수에서도 기반 타입을 추론할 수 있어요.

```swift
let sampleItem: some CatalogItem =
  Book(
    id: 0,
    title: "샘플",
    author: "Preview"
  )
```

`sampleItem`의 기반 타입은 초깃값의 `Book`으로 정해지지만, 정적 타입 시스템에서 `sampleItem`의 타입을 `Book`과 같다고 취급하지는 않아요.

```swift
var hiddenItem: some CatalogItem =
  Book(
    id: 0,
    title: "샘플",
    author: "Preview"
  )

// 오류: 불투명 타입을 정적으로 Book과
// 같은 타입이라고 가정할 수 없어요.
hiddenItem = Book(
  id: 1,
  title: "Swift 기초",
  author: "Blob"
)
```

값을 바꿔야 한다면 같은 불투명 반환 선언의 결과를 사용해 타입 정체성을 맞출 수 있어요.

```swift
func makeSample(
  id: Int
) -> some CatalogItem {
  Book(
    id: id,
    title: "샘플 \(id)",
    author: "Preview"
  )
}

var editableItem = makeSample(id: 0)
editableItem = makeSample(id: 1)

// 두 값은 같은 makeSample 선언의
// 불투명 반환 타입이에요.
```

실행 중 `Book`과 `Video`처럼 다른 준수 타입으로 바꿔야 한다면 `var editableItem: any CatalogItem`이 목적에 맞아요.

## SwiftUI의 some View도 같은 규칙을 사용해요

SwiftUI는 Apple 플랫폼에서 화면을 선언형으로 구성하는 프레임워크예요. `View` 프로토콜의 `body`는 연관 타입을 사용하고, 구현에서는 흔히 `some View`를 반환해요.

```swift
import SwiftUI

struct ProfileView: View {
  var body: some View {
    VStack {
      Text("프로필")
      Text("Swift 학습자")
    }
  }
}
```

`VStack<Text...>`처럼 조합 과정에서 만들어지는 구체 타입 이름은 길고 구현 구조를 그대로 드러낼 수 있어요. `some View`는 그 이름을 숨기면서 기반 타입 정체성은 유지해 SwiftUI가 타입 정보를 이용할 수 있게 해요.

조건에 따라 서로 다른 View를 반환하는 코드가 동작하는 경우에는 Result Builder가 조건별 View를 하나의 공통 구체 wrapper 타입으로 조합하는 등 추가 규칙이 개입할 수 있어요. 이를 “`some`은 서로 다른 반환 타입을 허용한다”라고 일반화하면 안 돼요. 일반 함수의 반환 경로는 여전히 같은 기반 타입을 사용해야 해요.

## some과 any는 타입 정체성 보존 여부가 달라요

두 문법 모두 구체 타입 이름을 숨기지만 제공하는 계약은 달라요.

| 기준                       | `some CatalogItem`               | `any CatalogItem`                                |
| -------------------------- | -------------------------------- | ------------------------------------------------ |
| 의미                       | 숨겨진 하나의 구체 타입이에요.   | 준수 타입을 담을 수 있는 실존 상자예요.          |
| 타입 선택                  | 선언 구현이 선택해요.            | 값을 대입하는 코드가 실행 중 선택할 수 있어요.   |
| 타입 정체성                | 유지해요.                        | 상자 밖에서는 지워져요.                          |
| 서로 다른 타입으로 교체    | 할 수 없어요.                    | 할 수 있어요.                                    |
| 같은 함수의 여러 결과      | 같은 불투명 타입이에요.          | 각 값의 동적 타입이 다를 수 있어요.              |
| `Self`·연관 타입 기반 연산 | 더 많은 관계를 보존할 수 있어요. | 지워진 정보 때문에 일부 연산이 제한될 수 있어요. |
| 대표 사용                  | 구현 타입을 숨긴 반환값이에요.   | 이종 배열, 저장 프로퍼티, 런타임 교체예요.       |

조건마다 `Book` 또는 `Video`를 자유롭게 반환하고 호출자가 둘을 같은 타입으로 저장해야 한다면 `any`를 사용할 수 있어요.

```swift
func dynamicItem(
  prefersVideo: Bool
) -> any CatalogItem {
  if prefersVideo {
    return Video(
      id: 2,
      title: "Swift 동시성",
      duration: 35
    )
  }

  return Book(
    id: 1,
    title: "Swift 기초",
    author: "Blob"
  )
}
```

유연성을 얻는 대신 결과의 구체 타입 정체성은 실존 상자 뒤로 지워져요. 자세한 저장 방식과 제약은 [`any`와 실존 타입](./existential-types) 문서에서 설명해요.

## some 오류는 기반 타입과 선택 방향을 확인해요

| 자주 만나는 상황                                           | 원인                                                               | 확인할 부분                                                                |
| ---------------------------------------------------------- | ------------------------------------------------------------------ | -------------------------------------------------------------------------- |
| 반환 경로마다 다른 타입이라는 오류가 나요.                 | 하나의 불투명 반환 선언에서 기반 타입이 `Book`과 `Video`로 갈려요. | 하나의 enum·wrapper로 감싸거나, 런타임 유연성이 필요하면 `any`를 검토해요. |
| `some` 결과를 구체 타입 변수에 대입할 수 없어요.           | 호출자에게 기반 타입 이름이 숨겨져 있어요.                         | 프로토콜 요구사항만 사용할지, 구체 타입을 공개해야 하는 API인지 확인해요.  |
| 같은 구체 타입을 반환하는 두 함수 결과를 대입할 수 없어요. | 서로 다른 선언의 불투명 타입은 별개예요.                           | 공통 구체 타입·wrapper를 공개하거나 결과 생성 API를 하나로 모아요.         |
| 두 `some` 매개변수가 같은 타입일 것으로 기대했어요.        | 각 `some` 매개변수는 독립된 이름 없는 제네릭 매개변수예요.         | 같은 타입 관계가 필요하면 `<Item>`을 선언해 두 위치에 반복해서 사용해요.   |
| `some Source`의 원소 타입을 사용할 수 없어요.              | 연관 타입 관계를 시그니처에 충분히 공개하지 않았어요.              | primary associated type으로 `some Source<Book>`처럼 제약해요.              |
| 실행 중 다른 타입을 대입할 수 없어요.                      | `some` 변수의 기반 타입은 초기화 시점에 하나로 고정돼요.           | 동적 교체가 요구사항이면 `any Protocol`을 사용해요.                        |

오류를 볼 때 `some`을 “아무 타입”으로 읽지 말고 다음 문장으로 바꿔 읽어 보세요.

```text
이 선언이 선택한,
이름은 숨겨져 있지만 정확히 하나인 구체 타입
```

## 언제 사용해야 하나요

다음 상황에서는 불투명 반환 타입이 잘 맞아요.

- 호출자가 구체 구현 타입보다 프로토콜 약속에 의존해야 해요.
- 구현 타입 이름이 길거나 제네릭 조합 구조를 그대로 드러내요.
- 기반 타입을 나중에 바꿀 수 있는 API 추상화 경계를 만들고 싶어요.
- 같은 선언의 결과끼리 타입 정체성과 연관 타입 관계를 유지해야 해요.
- 프로토콜 연관 타입 구현을 제공하면서 구체 타입 이름은 숨기고 싶어요.
- SwiftUI처럼 컴파일러가 구체 타입 정보를 활용할 수 있게 유지하고 싶어요.

다음 상황에서는 다른 표현도 검토해요.

- 호출자가 구체 타입의 전용 API를 사용해야 한다면 구체 타입을 반환하는 편이 명확해요.
- 반환 경로마다 서로 다른 준수 타입을 자유롭게 선택해야 한다면 `any`나 공통 wrapper가 필요해요.
- 여러 함수의 결과가 반드시 같은 공개 타입이어야 한다면 각각의 `some`은 맞지 않을 수 있어요.
- 매개변수와 반환값이 같은 타입이라는 관계를 표현해야 한다면 이름 있는 제네릭을 사용해요.
- 단지 반환 타입 이름을 짧게 만들려는 목적이라면 어떤 추상화 계약을 제공하는지 먼저 확인해요.

## some을 적용하는 순서를 정리해요

1. 호출자가 실제로 필요한 프로토콜 요구사항을 정해요.
2. 구체 반환 타입을 공개했을 때 호출자가 의도하지 않은 구현 세부사항에 의존하는지 확인해요.
3. 모든 반환 경로가 같은 기반 타입을 만드는지 확인해요.
4. 함수나 프로퍼티 반환 타입을 `some Protocol`로 바꾸고 호출부가 필요한 기능을 사용할 수 있는지 검사해요.
5. 연관 타입 정보가 필요하면 primary associated type 제약을 추가해요.
6. 여러 `some` 매개변수 사이에 같은 타입 관계가 필요한지 확인하고, 필요하면 이름 있는 제네릭으로 바꿔요.
7. 실행 중 다른 준수 타입을 저장하거나 교체해야 한다면 `any`와 비교해요.
8. 여러 호출, 조건 경로, 모듈 경계에서 타입 관계와 컴파일 결과를 검증해요.

## 흔한 오해를 정리해요

### some Protocol은 Protocol을 따르는 아무 타입이나 뜻하나요?

아니요. 한 선언의 구현이 선택한 정확히 하나의 구체 타입을 뜻해요. 이름은 호출자에게 숨겨지지만 모든 반환 경로에서 같은 기반 타입을 사용해야 해요.

### some과 any는 성능만 다른가요?

핵심 차이는 의미와 타입 정체성이에요. `some`은 하나의 숨겨진 타입을 유지하고, `any`는 실행 중 서로 다른 준수 타입을 담도록 타입을 지워요. 성능 차이는 이 의미 차이에서 따라오는 결과 중 하나이며 실제 영향은 측정해야 해요.

### 같은 Book을 반환하면 서로 다른 some 함수의 결과도 같은 타입인가요?

정적 타입 시스템에서는 아니에요. 서로 다른 선언의 불투명 반환 타입은 각각 고유하므로 기반 구현이 우연히 같아도 직접 대입할 수 없어요.

### 매개변수의 some도 구현이 타입을 선택하나요?

아니요. 매개변수 위치의 `some`은 이름 없는 제네릭 매개변수의 가벼운 표기라 호출자가 타입을 선택해요. 반환 위치의 `some`은 구현이 기반 타입을 선택해요.

### some을 사용하면 런타임 boxing이 전혀 없나요?

`some` 자체는 실존 상자처럼 구체 타입을 지우는 의미가 아니며 컴파일러가 기반 타입 정체성을 유지해요. 하지만 전체 프로그램의 실제 메모리 배치와 최적화 결과는 다른 추상화, 모듈 경계, 빌드 설정의 영향도 받으므로 “할당이 절대 없다”라고 단정하면 안 돼요.

## 면접에서 이어질 수 있는 질문

### some이 불투명 타입이라고 불리는 이유는 무엇인가요?

호출자에게는 기반 구체 타입의 이름이 보이지 않기 때문이에요. 다만 컴파일러는 그 타입 정체성을 유지하므로 같은 선언의 결과와 연관 타입 관계를 정적으로 검사할 수 있어요.

### some 반환 타입은 왜 모든 경로에서 같은 타입이어야 하나요?

하나의 함수 선언이 하나의 불투명 타입 정체성을 제공하기 때문이에요. 반환 경로마다 기반 타입이 다르면 호출자가 받은 값의 정적 타입을 하나로 정할 수 없어요.

### some 매개변수와 제네릭 매개변수의 차이는 무엇인가요?

`item: some Protocol`은 단순한 제약에서 이름을 생략한 제네릭 매개변수 문법이에요. 타입 이름을 반환 타입이나 다른 매개변수에 반복해 관계를 표현해야 한다면 `<Item: Protocol>` 형태가 필요해요.

### some과 any 중 무엇을 반환해야 하나요?

구현 타입을 숨기되 항상 하나의 기반 타입과 타입 관계를 유지하려면 `some`이 맞아요. 반환 경로의 타입이 실행 중 달라져야 하거나 결과를 서로 교체 가능한 실존 값으로 제공하려면 `any`를 검토해요.

### 불투명 타입이 API 설계에 주는 이점은 무엇인가요?

호출자에게 필요한 프로토콜 약속만 공개하고 구체 구현 타입 이름은 감출 수 있어요. 호출자가 세부 타입에 의존하지 않으므로 구현을 변경할 여지가 생기면서도 타입 정체성과 연관 타입 정보는 유지할 수 있어요.

## 참고 자료

- [The Swift Programming Language — Opaque and Boxed Protocol Types](https://docs.swift.org/swift-book/documentation/the-swift-programming-language/opaquetypes/)
- [The Swift Programming Language — Generics](https://docs.swift.org/swift-book/documentation/the-swift-programming-language/generics/)
- [The Swift Programming Language — Types](https://docs.swift.org/swift-book/documentation/the-swift-programming-language/types/)
- [Swift Evolution SE-0244 — Opaque Result Types](https://github.com/swiftlang/swift-evolution/blob/main/proposals/0244-opaque-result-types.md)
- [Swift Evolution SE-0341 — Opaque Parameter Declarations](https://github.com/swiftlang/swift-evolution/blob/main/proposals/0341-opaque-parameters.md)
- [Swift Evolution SE-0346 — Lightweight Same-Type Requirements for Primary Associated Types](https://github.com/swiftlang/swift-evolution/blob/main/proposals/0346-light-weight-same-type-syntax.md)
