---
title: Swift로 이해하는 제네릭
description: Swift 제네릭 함수와 타입, 타입 매개변수·제약·where 절·연관 타입을 단계적으로 이해하고 some·any와 선택 기준을 비교합니다.
pageType: doc-wide
outline: false
---

# Swift로 이해하는 제네릭

> **면접 답변 한 줄 요약:** 제네릭은 호출할 때 정해지는 구체 타입을 타입 매개변수로 표현하고 필요한 제약만 선언해, 타입 안전성과 타입 사이의 관계를 유지하면서 여러 타입에 같은 알고리즘과 자료구조를 재사용하는 Swift 기능이에요.

`Array<Int>`와 `Array<String>`은 원소 타입이 다르지만 같은 배열 기능을 제공해요. `Optional<Book>`과 `Optional<Video>`도 값의 타입만 다를 뿐 “값이 있거나 없다”라는 같은 구조를 사용해요. 이처럼 타입만 바뀌고 동작이 반복될 때 Swift의 제네릭을 사용할 수 있어요.

제네릭을 단순히 “모든 타입을 받는 문법”으로 이해하면 중요한 부분을 놓치기 쉬워요. 제네릭은 아무 타입이나 무조건 허용하는 기능이 아니라, 호출마다 하나의 구체 타입을 정하고 그 타입이 지켜야 할 조건과 여러 위치에서 같아야 할 관계를 컴파일러가 검사하게 하는 기능이에요.

이 문서에서는 카탈로그의 `Book`과 `Video`를 다루는 중복 코드에서 출발해 제네릭 함수와 타입, 타입 제약, `where` 절, 연관 타입까지 단계적으로 설명해요. 마지막에는 [불투명 타입 `some`](./opaque-types)과 [실존 타입 `any`](./existential-types)를 언제 선택할지도 비교해요.

## 먼저 알아둘 제네릭 용어

| 용어                    | 쉬운 뜻                                                                                                                                                    |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 타입                    | 값이 저장할 데이터와 사용할 수 있는 동작을 정한 분류예요. `Book`, `String`, `Array<Int>`가 모두 타입이에요.                                                |
| 구체 타입               | 실제 값의 메모리 구조와 동작이 정해진 타입이에요. `Book`과 `Array<Book>`이 한 예예요.                                                                      |
| 타입 매개변수           | 나중에 들어올 구체 타입에 붙인 자리 이름이에요. `Shelf<Item>`의 `Item`이 타입 매개변수예요.                                                                |
| 타입 인자               | 제네릭을 실제로 사용할 때 타입 매개변수 자리에 들어가는 구체 타입이에요. `Shelf<Book>`에서 `Book`이 타입 인자예요.                                         |
| 타입 추론               | 코드의 인자와 문맥을 보고 컴파일러가 생략된 타입을 알아내는 과정이에요.                                                                                    |
| 타입 제약               | 타입 매개변수가 특정 클래스를 상속하거나 프로토콜을 따라야 한다는 조건이에요. `Item: Equatable`은 `Item`이 비교 가능해야 한다는 뜻이에요.                  |
| 프로토콜                | 타입이 제공해야 할 프로퍼티와 메서드를 선언한 약속이에요. 제네릭에서는 구체 타입에 필요한 능력을 제약으로 표현할 때 자주 사용해요.                         |
| `where` 절              | 여러 타입이나 연관 타입의 준수 조건과 동일 타입 관계를 선언하는 문법이에요.                                                                                |
| 연관 타입               | 프로토콜을 따르는 구체 타입이 정하게 되는 타입 자리예요. `CatalogSource`가 불러올 `Item` 타입처럼 `associatedtype`으로 선언해요.                           |
| primary associated type | 연관 타입 중 사용 위치에서 자주 제약할 타입을 프로토콜 이름 뒤의 꺾쇠괄호에 표시한 것이에요. 한국어로는 주 연관 타입이라고도 해요.                         |
| 특수화(specialization)  | 컴파일러가 특정 타입 인자를 사용하는 제네릭 코드를 그 구체 타입에 맞춰 최적화하는 과정이에요. 항상 같은 방식으로 일어난다고 보장되는 언어 규칙은 아니에요. |

이 문서에서는 다음 내용을 설명해요.

- 타입별로 반복되는 함수에서 제네릭이 해결하는 문제
- 타입 매개변수와 타입 인자, 타입 추론의 관계
- 제네릭 함수와 제네릭 타입을 작성하는 방법
- 프로토콜 제약으로 사용할 수 있는 동작을 늘리는 방법
- `where` 절로 타입 사이의 관계를 표현하는 방법
- 프로토콜의 연관 타입과 primary associated type
- 조건부 extension과 조건부 프로토콜 준수
- 제네릭, `some`, `any`를 선택하는 기준

## 타입만 다른 함수는 같은 구현을 반복하게 돼요

카탈로그에서 책과 영상을 찾는 함수를 각각 작성해 볼게요.

```swift
struct Book: Equatable {
  let id: Int
  let title: String
  let author: String
}

struct Video: Equatable {
  let id: Int
  let title: String
  let duration: Int
}

func findBook(
  _ target: Book,
  in books: [Book]
) -> Book? {
  books.first { $0 == target }
}

func findVideo(
  _ target: Video,
  in videos: [Video]
) -> Video? {
  videos.first { $0 == target }
}
```

두 함수의 알고리즘은 같아요.

1. 배열의 값을 앞에서부터 확인해요.
2. 찾는 값과 같은 첫 값을 반환해요.
3. 같은 값이 없으면 `nil`을 반환해요.

다른 부분은 `Book`과 `Video`라는 타입 이름뿐이에요. 새로운 `Podcast` 타입이 생기면 같은 함수를 또 만들 수 있지만, 이렇게 복사한 함수는 검색 규칙을 바꿀 때 모두 수정해야 해요.

`Any`로 타입을 지우면 하나의 함수를 만들 수 있지만, `==`로 안전하게 비교할 수 없고 반환값을 다시 캐스팅해야 해요.

```swift
// 타입 정보가 너무 많이 사라지는 접근이에요.
func findValue(
  _ target: Any,
  in values: [Any]
) -> Any? {
  // Any 두 값을 일반적인 == 연산자로 비교할 수 없어요.
  nil
}
```

필요한 것은 타입 정보를 없애는 방식이 아니에요. **호출마다 구체 타입은 달라도 입력 배열과 찾는 값, 반환값이 모두 같은 타입이라는 관계**를 보존하는 방식이 필요해요.

## 타입 매개변수는 나중에 정해질 타입의 자리예요

먼저 비교 기능 없이 첫 값을 반환하는 가장 작은 제네릭 함수를 만들어 볼게요.

```swift
func first<Item>(
  in items: [Item]
) -> Item? {
  items.first
}
```

`<Item>`은 `Item`이 타입 매개변수라는 뜻이에요. 함수 안에서 `Item`은 구체 타입처럼 사용할 수 있지만, 실제 타입은 호출할 때 정해져요.

```swift
let books = [
  Book(
    id: 1,
    title: "Swift 기초",
    author: "Blob"
  ),
]

let videos = [
  Video(
    id: 2,
    title: "Swift 동시성",
    duration: 35
  ),
]

let firstBook = first(in: books)
// Item == Book, 반환 타입은 Book?

let firstVideo = first(in: videos)
// Item == Video, 반환 타입은 Video?
```

호출부에서 `first<Book>(in:)`처럼 타입 인자를 직접 적지 않아도 돼요. 컴파일러가 `[Book]` 인자를 보고 `Item`을 `Book`으로 추론해요.

여기서 `Item`은 “아무 값이나 담는 상자”가 아니에요. 한 번의 호출 안에서는 하나의 구체 타입으로 정해져요. 입력이 `[Book]`이면 반환값도 반드시 `Book?`이고, 입력이 `[Video]`이면 반환값은 `Video?`예요.

## 같은 타입 매개변수는 같은 구체 타입이어야 해요

타입 매개변수를 여러 위치에서 반복하면 그 위치의 타입이 같아야 한다는 관계를 표현해요.

```swift
func choose<Item>(
  _ first: Item,
  or second: Item,
  useFirst: Bool
) -> Item {
  useFirst ? first : second
}
```

두 인자와 반환값에 같은 `Item`을 사용했어요.

```swift
let book = Book(
  id: 1,
  title: "Swift 기초",
  author: "Blob"
)

let anotherBook = Book(
  id: 2,
  title: "Swift 심화",
  author: "Mango"
)

let selected = choose(
  book,
  or: anotherBook,
  useFirst: true
)
// selected는 Book
```

서로 다른 타입을 전달하면 하나의 `Item`을 정할 수 없어 컴파일 오류가 나요.

```swift
let video = Video(
  id: 3,
  title: "SwiftUI",
  duration: 40
)

// 오류: Item을 Book과 Video로 동시에 정할 수 없어요.
let invalid = choose(
  book,
  or: video,
  useFirst: true
)
```

두 인자가 서로 다른 타입이어도 되는 함수라면 타입 매개변수를 두 개 선언해야 해요.

```swift
func makePair<First, Second>(
  _ first: First,
  _ second: Second
) -> (First, Second) {
  (first, second)
}

let pair = makePair(book, video)
// (Book, Video)
```

제네릭 설계에서는 “몇 개의 타입을 받을 수 있는가?”보다 **어느 위치의 타입이 같아야 하고 어느 위치는 달라도 되는가?**를 먼저 생각해야 해요.

## 타입 제약은 제네릭 코드가 사용할 수 있는 능력을 정해요

앞의 `findBook`과 `findVideo`를 하나로 합치려면 두 값을 `==`로 비교해야 해요. 하지만 제약 없는 `Item`이 `Equatable`을 따른다는 보장은 없어요.

```swift
// 컴파일되지 않는 예예요.
func find<Item>(
  _ target: Item,
  in items: [Item]
) -> Item? {
  items.first { $0 == target }
  // 오류: 모든 Item이 == 연산을 제공하지는 않아요.
}
```

`Item: Equatable` 제약을 추가하면 컴파일러가 `==` 사용을 허용해요.

```swift
func find<Item: Equatable>(
  _ target: Item,
  in items: [Item]
) -> Item? {
  items.first { $0 == target }
}
```

이제 `Book`과 `Video`가 모두 `Equatable`을 따르므로 하나의 함수를 사용할 수 있어요.

```swift
let foundBook = find(book, in: books)
let foundVideo = find(video, in: videos)
```

제약은 제네릭을 덜 유연하게 만드는 불필요한 제한이 아니에요. 함수 구현이 실제로 요구하는 능력을 API 계약으로 드러내요. `==`를 사용하는 함수라면 `Equatable`, 딕셔너리 키로 사용한다면 `Hashable`, 정렬한다면 `Comparable` 같은 제약이 필요해요.

Swift 공식 [Generics](https://docs.swift.org/swift-book/documentation/the-swift-programming-language/generics/) 문서도 제약을 타입 매개변수가 특정 클래스를 상속하거나 프로토콜을 따라야 한다는 요구사항으로 설명해요.

## 문제 영역의 프로토콜로 필요한 동작을 표현해요

카탈로그 항목이 공통으로 `id`와 `title`을 제공하게 만들 수 있어요.

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

제네릭 함수에 `CatalogItem` 제약을 사용하면 `id`, `title`, `==`를 모두 사용할 수 있어요.

```swift
func describe<Item: CatalogItem>(
  _ item: Item
) -> String {
  "\(item.id): \(item.title)"
}
```

함수 안에서는 `Book.author`나 `Video.duration`을 사용할 수 없어요. `Item`이 어떤 `CatalogItem`인지는 호출자가 정하므로, 구현은 모든 `CatalogItem`이 보장하는 프로토콜 요구사항만 사용해야 해요.

```swift
let bookDescription = describe(book)
// "1: Swift 기초"

let videoDescription = describe(video)
// "3: SwiftUI"
```

구체 타입 정보는 사라지지 않아요. 호출마다 `Item`이 `Book` 또는 `Video`로 정해지고, 반환 타입이나 다른 제네릭 타입과의 관계에 계속 사용할 수 있어요.

## 제네릭 타입은 같은 구조를 여러 원소 타입에 재사용해요

함수뿐 아니라 구조체, 클래스, 열거형에도 타입 매개변수를 선언할 수 있어요. 카탈로그 항목을 보관하는 `Shelf`를 만들어 볼게요.

```swift
struct Shelf<Item> {
  private(set) var items: [Item] = []

  mutating func add(_ item: Item) {
    items.append(item)
  }

  mutating func removeLast() -> Item? {
    items.popLast()
  }
}
```

`Shelf<Book>`과 `Shelf<Video>`는 같은 구조와 메서드를 사용하지만 서로 다른 구체 타입이에요.

```swift
var bookShelf = Shelf<Book>()
bookShelf.add(book)

var videoShelf = Shelf<Video>()
videoShelf.add(video)
```

책 선반에는 `Video`를 넣을 수 없어요.

```swift
// 오류: Shelf<Book>에는 Book만 추가할 수 있어요.
bookShelf.add(video)
```

이 제한 덕분에 `bookShelf.removeLast()`의 반환 타입은 항상 `Book?`이라고 알 수 있어요. 값을 꺼낼 때 캐스팅할 필요도 없어요.

Swift 표준 라이브러리에서도 같은 구조를 볼 수 있어요.

| 제네릭 타입                | 타입 매개변수가 뜻하는 것       |
| -------------------------- | ------------------------------- |
| `Array<Element>`           | 배열에 저장할 원소 타입이에요.  |
| `Dictionary<Key, Value>`   | 키 타입과 값 타입이에요.        |
| `Optional<Wrapped>`        | 값이 있을 때 감싸는 타입이에요. |
| `Result<Success, Failure>` | 성공 값과 실패 오류 타입이에요. |

`[Book]`은 `Array<Book>`의 축약이고, `Book?`은 `Optional<Book>`의 축약이에요. Swift 코드를 작성할 때 이미 많은 제네릭 타입을 사용하고 있는 셈이에요.

## 조건부 extension은 요구사항을 만족할 때만 기능을 열어요

모든 `Shelf<Item>`에서 사용할 수 있는 기능은 제약 없는 extension에 작성해요.

```swift
extension Shelf {
  var isEmpty: Bool {
    items.isEmpty
  }
}
```

`Item`이 `CatalogItem`일 때만 제목 목록을 제공하려면 extension에 `where` 조건을 붙여요.

```swift
extension Shelf where Item: CatalogItem {
  var titles: [String] {
    items.map(\.title)
  }
}
```

`Shelf<Book>`과 `Shelf<Video>`에서는 `titles`를 사용할 수 있지만, `Shelf<Int>`에서는 사용할 수 없어요.

```swift
print(bookShelf.titles)
// ["Swift 기초"]

let numbers = Shelf<Int>()
// numbers.titles는 사용할 수 없어요.
```

제네릭 타입 전체에 지나치게 강한 제약을 걸 필요는 없어요. 기본 저장 기능은 모든 `Item`에 제공하고, 제목처럼 추가 능력이 필요한 기능에만 조건을 붙일 수 있어요.

## 조건부 준수는 타입 인자가 따를 때만 프로토콜을 따르게 해요

`Shelf`의 두 값을 비교하려면 내부 `Item`도 비교할 수 있어야 해요.

```swift
extension Shelf: Equatable
where Item: Equatable {}
```

컴파일러가 `[Item]`의 `Equatable` 구현을 이용해 `Shelf`의 구현을 합성해요.

```swift
let firstShelf = Shelf(
  items: [book]
)
let secondShelf = Shelf(
  items: [book]
)

print(firstShelf == secondShelf)
// true
```

`Item`이 `Equatable`을 따르지 않으면 해당 `Shelf<Item>`도 `Equatable`을 따르지 않아요. 바깥 제네릭 타입의 능력이 타입 인자의 능력에 따라 달라지는 구조예요.

## where 절은 타입 사이의 관계를 표현해요

콜론 제약은 한 타입 매개변수의 기본 조건을 간단히 표현하기 좋아요.

```swift
func describe<Item: CatalogItem>(
  _ item: Item
) -> String
```

두 타입의 내부 타입이 같아야 하는 것처럼 더 복잡한 관계는 `where` 절로 표현해요. 먼저 카탈로그 데이터를 불러오는 프로토콜을 정의해 볼게요.

```swift
protocol CatalogSource {
  associatedtype Item: CatalogItem

  func load() -> [Item]
}
```

두 소스가 같은 `Item`을 불러올 때만 결과를 합치고 싶어요.

```swift
func merge<
  Left: CatalogSource,
  Right: CatalogSource
>(
  _ left: Left,
  _ right: Right
) -> [Left.Item]
where Left.Item == Right.Item {
  left.load() + right.load()
}
```

요구사항을 나눠 읽으면 다음과 같아요.

1. `Left`와 `Right`는 각각 `CatalogSource`를 따라야 해요.
2. `Left.Item`과 `Right.Item`은 같은 타입이어야 해요.
3. 따라서 두 배열을 안전하게 합쳐 `[Left.Item]`으로 반환할 수 있어요.

```swift
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

struct CachedBookSource: CatalogSource {
  let books: [Book]

  func load() -> [Book] {
    books
  }
}

let mergedBooks = merge(
  BookSource(),
  CachedBookSource(books: [])
)
// [Book]
```

`VideoSource`와 `BookSource`를 전달하면 `Item`이 다르므로 컴파일되지 않아요. `where` 절은 실행 중에 검사하는 조건문이 아니라, 허용할 타입 조합을 컴파일 시점에 제한하는 타입 관계예요.

## 연관 타입은 프로토콜을 따르는 타입이 정하는 자리예요

제네릭 타입의 타입 매개변수와 프로토콜의 연관 타입은 모두 타입의 자리를 표현하지만, 누가 어디에서 정하는지가 달라요.

```swift
struct Shelf<Item> {
  // Shelf를 사용할 때 Item을 정해요.
}

protocol CatalogSource {
  associatedtype Item: CatalogItem
  // CatalogSource를 따르는 타입이 Item을 정해요.
}
```

`BookSource`는 `load()`의 반환 타입을 `[Book]`으로 구현했기 때문에 컴파일러가 `Item == Book`이라고 추론해요.

```swift
struct BookSource: CatalogSource {
  func load() -> [Book] {
    []
  }
}
```

명시적으로 적으면 다음과 같은 의미예요.

```swift
struct ExplicitBookSource: CatalogSource {
  typealias Item = Book

  func load() -> [Book] {
    []
  }
}
```

| 구분        | 타입 매개변수                                 | 연관 타입                                             |
| ----------- | --------------------------------------------- | ----------------------------------------------------- |
| 선언 위치   | 함수나 구체 타입의 `<...>`                    | 프로토콜 본문의 `associatedtype`                      |
| 정하는 주체 | 제네릭 함수 호출부 또는 제네릭 타입 사용 위치 | 프로토콜을 따르는 구체 타입                           |
| 예          | `Shelf<Book>`의 `Book`                        | `BookSource.Item == Book`                             |
| 주된 역할   | 알고리즘과 자료구조를 여러 타입에 재사용해요. | 프로토콜 요구사항 안에서 서로 연결된 타입을 표현해요. |

연관 타입이 있는 프로토콜도 제네릭 제약으로 사용할 수 있어요.

```swift
func titles<Source: CatalogSource>(
  from source: Source
) -> [String] {
  source.load().map(\.title)
}
```

`Source.Item`의 정확한 타입은 호출마다 다를 수 있지만 `CatalogItem`을 따른다는 제약 덕분에 `title`을 사용할 수 있어요.

## primary associated type은 자주 쓰는 연관 타입 제약을 짧게 적어요

`CatalogSource`에서 가장 중요한 연관 타입이 `Item`이라면 이를 프로토콜 이름 뒤에 표시할 수 있어요.

```swift
protocol CatalogSource<Item> {
  associatedtype Item: CatalogItem

  func load() -> [Item]
}
```

꺾쇠괄호의 `Item`은 새로운 제네릭 타입 매개변수를 선언하는 것이 아니에요. 본문에 선언한 기존 연관 타입 `Item`을 **primary associated type**으로 지정해 사용 위치에서 쉽게 제약할 수 있게 해요.

예를 들어 “구체 소스 타입은 숨기되 `Book`을 불러오는 소스”를 다음처럼 표현할 수 있어요.

```swift
func makeBookSource()
  -> some CatalogSource<Book> {
  BookSource()
}
```

“서로 다른 소스 타입을 저장하되 모두 `Book`을 불러오는 값”은 다음처럼 표현해요.

```swift
let bookSources:
  [any CatalogSource<Book>] = [
    BookSource(),
    CachedBookSource(books: []),
  ]
```

`CatalogSource<Book>`은 `CatalogSource`라는 프로토콜 자체가 제네릭 타입이 되었다는 뜻이 아니에요. `Item == Book`이라는 동일 타입 요구사항을 간단히 적은 제약 문법이에요.

Swift Evolution의 [SE-0346](https://github.com/swiftlang/swift-evolution/blob/main/proposals/0346-light-weight-same-type-syntax.md)은 primary associated type을 이용해 `some Sequence<String>`처럼 자주 쓰는 동일 타입 제약을 가볍게 표현하는 문법을 도입했어요.

## 제네릭은 구체 타입 정보와 관계를 보존해요

제네릭 함수는 호출부가 선택한 구체 타입을 타입 매개변수에 연결해요.

```text
describe(book)
    │
    └─ Item == Book
       입력: Book
       사용 가능한 약속: CatalogItem
       구체 타입 관계: 유지
```

함수 구현은 프로토콜 제약이 보장하는 동작만 사용하지만, 컴파일러는 호출마다 실제 `Item`이 무엇인지 알고 있어요. 이 정보로 반환 타입을 정하고 다른 타입 매개변수나 연관 타입과의 관계를 검사해요.

컴파일러는 상황에 따라 특정 타입 인자에 맞는 제네릭 구현을 특수화해 호출 비용을 줄이거나 추가 최적화를 할 수 있어요. 그러나 “제네릭을 쓰면 항상 코드가 복제된다”, “항상 직접 호출보다 빠르다”처럼 구현 결과를 단정하면 안 돼요. 최적화 여부는 가시성, 빌드 설정, 모듈 경계와 컴파일러 판단에 따라 달라질 수 있어요.

제네릭을 선택하는 첫 번째 이유는 성능이 아니라 **타입 안전성과 관계를 유지한 재사용**이에요. 성능이 중요한 경로는 실제 빌드에서 측정해야 해요.

## 제네릭, some, any는 타입을 정하는 주체가 달라요

세 문법은 모두 프로토콜과 함께 사용할 수 있지만 답하는 질문이 달라요.

| 방식                    | 구체 타입을 정하는 주체       | 구체 타입 정체성 | 서로 다른 타입을 한 저장소에 혼합      | 대표 목적                               |
| ----------------------- | ----------------------------- | ---------------- | -------------------------------------- | --------------------------------------- |
| `<Item: CatalogItem>`   | 호출자                        | 유지             | 하나의 제네릭 값 안에서는 어려워요.    | 알고리즘과 타입 관계를 재사용해요.      |
| `some CatalogItem` 반환 | 함수·프로퍼티 구현            | 유지하되 숨겨요. | 하나의 선언은 한 기반 타입을 사용해요. | 구현 타입을 감춘 결과를 제공해요.       |
| `any CatalogItem`       | 값을 저장하거나 대입하는 코드 | 지워져요.        | 가능해요.                              | 실행 중 여러 준수 타입을 저장·교체해요. |

제네릭 함수는 호출자가 타입을 선택해요.

```swift
func describe<Item: CatalogItem>(
  _ item: Item
) -> String
```

`some` 반환은 구현이 타입을 선택하고 호출자에게는 약속만 보여 줘요.

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

`any`는 실행 중에 여러 구체 타입을 같은 변수나 배열에 담을 수 있어요.

```swift
let mixedItems: [any CatalogItem] = [
  book,
  video,
]
```

제네릭의 더 짧은 매개변수 표기는 [`some` 문서](./opaque-types)에서, 타입을 지운 저장과 동적 교체는 [`any` 문서](./existential-types)에서 자세히 살펴봐요.

## 제네릭 오류는 추론 정보와 제약을 확인해요

| 자주 만나는 상황                               | 원인                                                            | 확인할 부분                                                                              |
| ---------------------------------------------- | --------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| `generic parameter could not be inferred`      | 타입 매개변수를 정할 인자나 반환 문맥이 부족해요.               | 인자 타입, 변수 타입 주석, 반환값 사용 문맥 중 어디에서 타입을 알려 줄지 확인해요.       |
| `requires that ... conform to ...`             | 전달한 타입이 선언된 프로토콜 제약을 만족하지 않아요.           | 해당 제약이 구현에 정말 필요한지, 구체 타입이 올바르게 준수하는지 확인해요.              |
| `conflicting arguments to generic parameter`   | 같은 타입 매개변수 자리에 서로 다른 타입이 들어왔어요.          | 같은 타입이어야 하는 관계가 맞는지, 타입 매개변수를 둘로 나눠야 하는지 확인해요.         |
| `binary operator '==' cannot be applied`       | 타입 매개변수에 `Equatable` 보장이 없어요.                      | `T: Equatable` 또는 `where T: Equatable` 제약이 필요한지 확인해요.                       |
| 서로 다른 두 소스의 배열을 합칠 수 없어요.     | 두 연관 타입이 같다는 보장이 없어요.                            | `where Left.Item == Right.Item` 같은 동일 타입 요구사항을 추가해요.                      |
| 제네릭 시그니처가 지나치게 길고 읽기 어려워요. | 한 함수가 너무 많은 타입 관계와 책임을 표현하고 있을 수 있어요. | 의미 있는 타입 이름, 작은 보조 함수, primary associated type, 별도 타입 분리를 검토해요. |

오류 메시지의 `T`, `Item`, `Source.Item`을 실제 호출부 타입으로 치환해 읽으면 원인을 찾기 쉬워요.

```text
Item == Book이라고 추론했는데
두 번째 인자로 Video가 들어왔어요.
→ 같은 Item으로 볼 수 없어요.
```

## 언제 사용해야 하나요

다음 상황에서는 제네릭이 잘 맞아요.

- 타입만 다르고 알고리즘이나 자료구조가 같아요.
- 입력과 반환값, 여러 인자 사이의 동일 타입 관계를 보존해야 해요.
- 호출자가 사용할 구체 타입을 선택하는 API예요.
- 특정 프로토콜 능력을 가진 여러 타입에 같은 구현을 제공해요.
- 배열 원소와 반환 타입처럼 연관된 타입 정보를 컴파일 시점에 유지해야 해요.
- 타입 인자가 만족하는 조건에 따라 extension이나 프로토콜 준수를 제공해요.

다음 상황에서는 다른 표현도 검토해요.

- 실제로 한 구체 타입만 사용한다면 제네릭이 불필요한 복잡성을 만들 수 있어요.
- 구현이 고른 반환 타입을 감추고 싶다면 `some`이 API 의도를 더 잘 표현할 수 있어요.
- 서로 다른 준수 타입을 같은 배열이나 프로퍼티에 저장하고 실행 중 교체해야 한다면 `any`가 필요할 수 있어요.
- 타입 매개변수와 `where` 조건이 너무 많아 함수의 책임을 설명하기 어렵다면 타입이나 기능 분리를 먼저 검토해요.
- 성능만을 추측해 제네릭으로 바꾸지 말고 실제 병목을 측정해요.

## 제네릭을 적용하는 순서를 정리해요

1. 타입 이름만 다르고 구현이 같은 중복 코드를 찾어요.
2. 호출마다 바뀌는 타입에 `Item`, `Element`, `Key`, `Value`처럼 역할이 드러나는 이름을 붙여요.
3. 같은 타입이어야 하는 매개변수와 반환값에 같은 타입 매개변수를 사용해요.
4. 구현이 사용하는 연산과 프로퍼티를 확인하고 필요한 프로토콜 제약만 추가해요.
5. 연관 타입 사이의 동일 타입 관계는 `where` 절로 표현해요.
6. 일부 기능만 추가 능력이 필요하면 조건부 extension으로 범위를 좁혀요.
7. 호출자가 타입을 선택하는지, 구현이 숨길지, 실행 중 섞어 저장할지를 확인해 제네릭·`some`·`any`를 다시 선택해요.
8. 여러 구체 타입과 잘못된 타입 조합을 모두 컴파일하거나 테스트해 계약이 의도와 같은지 확인해요.

## 흔한 오해를 정리해요

### 제네릭은 Any와 같은가요?

아니요. `Any`는 다양한 값을 담기 위해 구체 타입 정보를 지우고 사용할 때 캐스팅이 필요할 수 있어요. 제네릭은 호출마다 구체 타입을 정하고 그 타입 정보를 유지하므로 입력과 반환값 사이의 관계를 컴파일러가 검사할 수 있어요.

### T는 모든 타입을 뜻하나요?

`T`는 한 번의 호출이나 하나의 제네릭 인스턴스에서 정해지는 하나의 구체 타입 자리예요. 제약이 없다면 여러 종류의 타입이 각각 다른 호출에서 들어올 수 있지만, 같은 호출 안에서 `T`가 동시에 `Book`과 `Video`가 되지는 않아요.

### 제약이 많을수록 더 안전한가요?

구현에 필요한 제약은 안전한 계약을 만들지만, 사용하지 않는 능력까지 요구하면 사용할 수 있는 타입을 불필요하게 줄여요. 함수 본문이 실제로 사용하는 동작을 기준으로 최소한의 제약을 선언해야 해요.

### 프로토콜의 꺾쇠괄호는 제네릭 프로토콜을 뜻하나요?

`protocol CatalogSource<Item>`의 `Item`은 제네릭 타입 매개변수를 새로 선언하는 문법이 아니에요. 본문의 연관 타입을 primary associated type으로 지정해 `some CatalogSource<Book>`이나 `any CatalogSource<Book>`처럼 동일 타입 제약을 짧게 쓰게 해요.

### 제네릭을 사용하면 항상 정적 디스패치되고 더 빠른가요?

구체 타입 정보가 보존되므로 컴파일러가 특수화와 인라이닝을 적용할 기회가 있지만, 최적화 결과는 보장된 한 가지 형태가 아니에요. 모듈 경계와 빌드 설정에 따라 달라질 수 있으므로 성능은 측정해야 해요.

## 면접에서 이어질 수 있는 질문

### 제네릭의 핵심 목적은 무엇인가요?

타입만 다른 중복 구현을 하나로 만들면서도 구체 타입 정보와 타입 사이의 관계를 유지하는 것이 핵심이에요. 필요한 프로토콜 제약을 선언하면 컴파일러가 허용할 타입과 사용할 수 있는 동작을 검사해요.

### 타입 매개변수와 연관 타입의 차이는 무엇인가요?

타입 매개변수는 제네릭 함수 호출부나 제네릭 타입 사용 위치에서 정해져요. 연관 타입은 프로토콜에 타입 자리를 선언하고, 그 프로토콜을 따르는 구체 타입이 실제 타입을 정해요.

### where 절은 언제 사용하나요?

연관 타입이 특정 프로토콜을 따라야 하거나 두 타입 매개변수의 내부 타입이 같아야 하는 등 복합적인 관계를 표현할 때 사용해요. 실행 중 조건이 아니라 허용할 타입 조합을 컴파일 시점에 제한하는 문법이에요.

### 조건부 준수란 무엇인가요?

제네릭 타입의 타입 인자가 특정 요구사항을 만족할 때만 바깥 타입도 프로토콜을 따르게 하는 기능이에요. `Shelf`가 `Equatable`일 때만 `Shelf`도 `Equatable`을 따르게 만드는 것이 한 예예요.

### 제네릭과 any의 가장 중요한 차이는 무엇인가요?

제네릭은 호출마다 하나의 구체 타입을 타입 매개변수에 연결해 정체성과 관계를 유지해요. `any Protocol`은 서로 다른 준수 타입을 같은 저장소에 담기 위해 구체 타입을 실존 상자 뒤로 지워 실행 중 유연성을 얻어요.

## 참고 자료

- [The Swift Programming Language — Generics](https://docs.swift.org/swift-book/documentation/the-swift-programming-language/generics/)
- [The Swift Programming Language — Protocols](https://docs.swift.org/swift-book/documentation/the-swift-programming-language/protocols/)
- [The Swift Programming Language — Opaque and Boxed Protocol Types](https://docs.swift.org/swift-book/documentation/the-swift-programming-language/opaquetypes/)
- [Swift Evolution SE-0341 — Opaque Parameter Declarations](https://github.com/swiftlang/swift-evolution/blob/main/proposals/0341-opaque-parameters.md)
- [Swift Evolution SE-0346 — Lightweight Same-Type Requirements for Primary Associated Types](https://github.com/swiftlang/swift-evolution/blob/main/proposals/0346-light-weight-same-type-syntax.md)
