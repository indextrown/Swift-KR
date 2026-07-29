---
title: Swift로 이해하는 any와 실존 타입
description: Swift의 any가 여러 프로토콜 준수 타입을 실존 상자에 저장하는 원리와 타입 소거, 연관 타입 제약, 제네릭·some과의 선택 기준을 설명합니다.
pageType: doc-wide
outline: false
---

# Swift로 이해하는 any와 실존 타입

> **면접 답변 한 줄 요약:** `any Protocol`은 프로토콜을 따르는 서로 다른 구체 타입을 하나의 실존 상자에 저장하고 실행 중 교체할 수 있도록 바깥에서 구체 타입 정체성을 지우는 대신, 프로토콜이 보장하는 공통 기능만 사용하게 하는 Swift의 타입 소거 문법이에요.

책과 영상은 서로 다른 타입이지만 카탈로그 화면에서는 같은 목록에 표시해야 할 수 있어요. 제네릭 배열 `Shelf<Book>`은 책의 구체 타입 정보를 안전하게 유지하지만 `Video`를 함께 넣을 수 없어요. 불투명 타입 `some CatalogItem`도 하나의 숨겨진 기반 타입을 유지하므로 실행 중 다른 타입으로 바꿀 수 없어요.

이처럼 **서로 다른 구체 타입을 같은 프로퍼티나 배열에 저장하고 실행 중 선택해야 하는 문제**를 `any Protocol`로 해결할 수 있어요. `any`는 편리하지만 구체 타입 정보를 지우는 선택이므로, 사용할 수 있는 연산과 런타임 비용도 함께 이해해야 해요.

이 문서에서는 카탈로그 항목을 섞어 저장하는 문제에서 출발해 실존 상자의 의미, 프로토콜 멤버 접근 제한, 연관 타입이 있는 프로토콜, 암시적으로 열린 실존 타입까지 설명해요. 타입 정보를 유지하는 방법은 [제네릭](./generics), 하나의 구현 타입만 숨기는 방법은 [`some`과 불투명 타입](./opaque-types) 문서에서 먼저 확인할 수 있어요.

## 먼저 알아둘 실존 타입 용어

| 용어                      | 쉬운 뜻                                                                                                                                                                        |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 프로토콜                  | 여러 타입이 공통으로 제공해야 할 프로퍼티와 메서드를 선언한 약속이에요.                                                                                                        |
| 구체 타입                 | 값의 실제 구조와 구현이 정해진 타입이에요. `Book`과 `Video`가 한 예예요.                                                                                                       |
| 정적 타입                 | 컴파일러가 코드를 검사할 때 알고 있는 타입이에요. `any CatalogItem` 변수의 정적 타입은 실존 타입이에요.                                                                        |
| 동적 타입                 | 실행 중 실존 상자 안에 실제로 들어 있는 값의 구체 타입이에요. 같은 변수라도 어느 순간에는 `Book`, 나중에는 `Video`일 수 있어요.                                                |
| 실존 타입                 | “프로토콜을 따르는 어떤 구체 타입이 존재한다”는 값을 담는 타입이에요. 영어로 existential type 또는 Swift 공식 문서에서 boxed protocol type이라고 해요.                         |
| 실존 값                   | `any Protocol` 타입의 변수나 프로퍼티에 저장된 값이에요.                                                                                                                       |
| 실존 상자                 | 구체 값을 프로토콜 타입으로 다루기 위해 값과 타입·준수 정보를 함께 감싼 개념적인 저장 구조예요. 실제 메모리 배치는 값과 최적화 상황에 따라 달라질 수 있어요.                   |
| 타입 소거                 | 바깥 코드에서 구체 타입 정체성을 직접 사용하지 못하게 숨기고 공통 인터페이스만 남기는 방식이에요. 영어로 type erasure라고 해요.                                                |
| boxing                    | 구체 값을 실존 타입의 저장 형식으로 감싸고 필요할 때 간접 접근하는 과정이에요. 추가 간접 참조와 경우에 따른 저장 비용이 생길 수 있어요.                                        |
| `Self` 요구사항           | 프로토콜을 따르는 실제 자기 타입과 연결된 요구사항이에요. `Equatable`의 `==`는 두 인자가 같은 `Self` 타입이어야 해요.                                                          |
| 연관 타입                 | 프로토콜을 따르는 구체 타입이 정하는 내부 타입 자리예요. `CatalogSource.Item`이 한 예예요.                                                                                     |
| 암시적으로 열린 실존 타입 | 제네릭 함수에 실존 값을 전달할 때 컴파일러가 상자 안의 숨겨진 구체 타입에 임시 이름을 붙여 타입 매개변수로 다루는 기능이에요. 영어로 implicitly opened existential이라고 해요. |

이 문서에서는 다음 내용을 설명해요.

- 제네릭 저장소가 서로 다른 타입을 섞지 못하는 이유
- `any Protocol` 변수가 구체 타입을 저장하고 교체하는 방법
- 실존 상자가 개념적으로 보관하는 정보와 비용
- 프로토콜 요구사항만 바로 사용할 수 있는 이유
- `Self`와 연관 타입 때문에 일부 연산이 제한되는 경우
- 실존 값을 제네릭 함수에 전달할 때 일어나는 암시적 열기
- primary associated type으로 실존 값의 연관 타입을 제약하는 방법
- `Any`, `some`, 제네릭과 `any`의 차이

## 하나의 구체 타입을 보존하는 배열에는 다른 타입을 넣을 수 없어요

먼저 카탈로그 항목을 정의해 볼게요.

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

`[Book]`은 원소의 구체 타입이 `Book`으로 정해진 제네릭 배열이에요.

```swift
var books: [Book] = [
  Book(
    id: 1,
    title: "Swift 기초",
    author: "Blob"
  ),
]
```

이 배열에 `Video`를 추가할 수 없어요.

```swift
// 오류: [Book]에는 Video를 넣을 수 없어요.
books.append(
  Video(
    id: 2,
    title: "Swift 동시성",
    duration: 35
  )
)
```

이 제한은 제네릭의 장점이에요. `books[0]`은 항상 `Book`이므로 캐스팅 없이 `author`에 접근할 수 있어요.

하지만 홈 화면에서 책과 영상을 하나의 추천 목록에 섞어 표시해야 한다면 원소의 구체 타입을 하나로 고정한 `[Book]`만으로 요구사항을 표현할 수 없어요.

## any Protocol은 여러 준수 타입을 같은 저장소에 담아요

프로토콜 이름 앞에 `any`를 붙이면 실존 타입을 만들 수 있어요.

```swift
let item: any CatalogItem =
  Book(
    id: 1,
    title: "Swift 기초",
    author: "Blob"
  )
```

정적 타입은 `any CatalogItem`이고, 현재 상자 안의 동적 타입은 `Book`이에요. `CatalogItem`의 요구사항을 사용할 수 있어요.

```swift
print(item.id)
print(item.title)
```

변수라면 나중에 다른 준수 타입을 대입할 수 있어요.

```swift
var selectedItem: any CatalogItem =
  Book(
    id: 1,
    title: "Swift 기초",
    author: "Blob"
  )

selectedItem = Video(
  id: 2,
  title: "Swift 동시성",
  duration: 35
)
```

첫 번째 값의 동적 타입은 `Book`, 두 번째 값의 동적 타입은 `Video`예요. 둘 다 `CatalogItem`을 따르므로 같은 `any CatalogItem` 변수에 들어갈 수 있어요.

## 이종 배열은 각 원소가 다른 동적 타입을 가질 수 있어요

`[any CatalogItem]`을 사용하면 책과 영상을 같은 배열에 저장할 수 있어요.

```swift
let items: [any CatalogItem] = [
  Book(
    id: 1,
    title: "Swift 기초",
    author: "Blob"
  ),
  Video(
    id: 2,
    title: "Swift 동시성",
    duration: 35
  ),
]
```

배열의 정적 원소 타입은 하나인 `any CatalogItem`이에요. 각 실존 상자 안의 동적 타입은 서로 달라도 돼요.

```text
[any CatalogItem]
├─ 상자 0 → Book
└─ 상자 1 → Video
```

반복문에서는 공통 프로토콜 요구사항을 사용할 수 있어요.

```swift
for item in items {
  print("\(item.id): \(item.title)")
}
```

반면 `Book.author`나 `Video.duration`은 `CatalogItem`이 보장하지 않으므로 바로 접근할 수 없어요.

```swift
// 오류: any CatalogItem에는 author 요구사항이 없어요.
print(items[0].author)
```

필요하다면 실행 중 타입을 확인해 downcast할 수 있어요.

```swift
if let book = items[0] as? Book {
  print(book.author)
}
```

캐스팅이 곳곳에서 반복된다면 공통으로 필요한 기능이 프로토콜 요구사항에서 빠졌거나, 서로 다른 타입을 한 배열에 넣는 설계가 적절한지 다시 확인해야 해요.

## 실존 상자는 값과 타입 사용 정보를 함께 보관해요

`any CatalogItem`을 개념적으로 다음 정보가 들어 있는 상자로 생각할 수 있어요.

```text
┌─────────────────────────────┐
│ any CatalogItem 실존 상자   │
├─────────────────────────────┤
│ 저장된 값                   │ → Book 값
│ 실제 구체 타입 정보         │ → Book
│ 프로토콜 요구사항 구현 정보 │ → Book의 CatalogItem 구현
└─────────────────────────────┘
```

프로토콜 요구사항 구현 정보는 특정 구체 타입의 메서드와 프로퍼티를 어떻게 호출할지 연결해요. Swift 구현에서는 이를 witness table과 같은 용어로 설명할 수 있지만, 입문 단계에서는 **상자가 실제 타입과 약속 구현을 함께 알고 있다**고 이해하면 돼요.

실제 값이 상자 내부의 고정 공간에 들어갈지, 별도 저장소를 사용할지, 어떤 호출이 최적화될지는 값의 크기와 컴파일러 판단에 따라 달라질 수 있어요. “모든 `any` 값은 반드시 힙에 할당된다”라고 단정하면 안 돼요.

다만 실존 타입은 구체 타입을 직접 다루는 코드와 비교해 필요할 때 추가 간접 참조와 boxing 비용이 생길 수 있어요. Swift 공식 [Types](https://docs.swift.org/swift-book/documentation/the-swift-programming-language/types/#Boxed-Protocol-Type) 문서도 boxed protocol type의 간접 접근과 런타임 비용을 설명해요.

성능 비용만으로 `any`를 피할 필요는 없어요. 서로 다른 타입을 저장하는 요구사항이 먼저이고, 실제 병목은 측정으로 확인해야 해요.

## any를 쓰면 프로토콜이 보장한 인터페이스만 남아요

실존 값의 바깥에서는 동적 타입이 `Book`인지 `Video`인지 정적으로 확정할 수 없어요. 따라서 모든 준수 타입이 제공하기로 약속한 멤버만 바로 사용할 수 있어요.

```swift
func summary(
  of item: any CatalogItem
) -> String {
  "\(item.id): \(item.title)"
}
```

`id`와 `title`은 `CatalogItem` 요구사항이므로 안전해요.

```swift
// 사용할 수 없어요.
// item.author
// item.duration
```

프로토콜 extension의 멤버도 요구사항과 타입 관계에 따라 사용할 수 있어요.

```swift
extension CatalogItem {
  var displayTitle: String {
    "#\(id) \(title)"
  }
}

print(item.displayTitle)
```

API를 `any Protocol`로 받으면 구체 타입별 전용 기능보다 프로토콜 인터페이스가 중심이 돼요. 이 경계가 의도한 추상화인지 확인해야 해요.

## Self를 사용하는 요구사항은 타입이 지워지면 제한될 수 있어요

`CatalogItem`은 `Equatable`을 따르므로 구체 타입끼리는 `==`로 비교할 수 있어요.

```swift
let firstBook = Book(
  id: 1,
  title: "Swift 기초",
  author: "Blob"
)

let secondBook = Book(
  id: 1,
  title: "Swift 기초",
  author: "Blob"
)

print(firstBook == secondBook)
// true
```

`Equatable`의 비교는 양쪽 값이 같은 `Self` 타입이어야 해요. 그러나 두 `any CatalogItem` 상자 안에는 서로 다른 동적 타입이 들어 있을 수 있어요.

```swift
let first: any CatalogItem = firstBook
let second: any CatalogItem =
  Video(
    id: 2,
    title: "Swift 동시성",
    duration: 35
  )

// 오류: 두 상자 안의 구체 타입이 같다는 보장이 없어요.
// print(first == second)
```

`any CatalogItem`이 `Equatable` 제약을 가진 값을 담을 수 있다는 사실과, 실존 값 두 개에 `==`를 바로 적용할 수 있다는 것은 다른 문제예요. 비교 연산에는 양쪽의 숨겨진 `Self`가 같다는 보장이 필요해요.

요구사항에 맞는 해결 방법을 선택해야 해요.

- 카탈로그에서 동일 항목인지 판단하려면 공통 `id`를 비교해요.
- 같은 구체 타입의 전체 값 비교가 필요하면 안전하게 downcast한 뒤 비교해요.
- 비교할 두 값이 같은 타입이어야 하는 API라면 제네릭 매개변수를 사용해요.
- 여러 타입을 아우르는 별도 동등성 규칙이 필요하면 프로토콜 요구사항이나 type eraser에 그 규칙을 명시해요.

```swift
func hasSameID(
  _ first: any CatalogItem,
  _ second: any CatalogItem
) -> Bool {
  first.id == second.id
}
```

`id` 비교는 `Equatable`의 전체 값 비교와 의미가 다르므로 함수 이름에서 의도를 드러내야 해요.

## Any와 any Protocol은 지우는 범위가 달라요

`Any`는 함수, 튜플을 포함해 거의 모든 Swift 값을 담을 수 있어요.

```swift
let mixedValues: [Any] = [
  1,
  "Swift",
  Book(
    id: 1,
    title: "Swift 기초",
    author: "Blob"
  ),
]
```

공통 프로토콜 약속이 없으므로 값을 사용하려면 타입을 확인하고 캐스팅해야 해요.

```swift
if let book = mixedValues[2] as? Book {
  print(book.title)
}
```

`any CatalogItem`은 `CatalogItem`을 따르는 값만 받을 수 있고 요구사항에 바로 접근할 수 있어요.

```swift
let catalogValues: [any CatalogItem] = [
  Book(
    id: 1,
    title: "Swift 기초",
    author: "Blob"
  ),
  Video(
    id: 2,
    title: "Swift 동시성",
    duration: 35
  ),
]

print(catalogValues[0].title)
```

| 타입              | 담을 수 있는 값           | 바로 사용할 수 있는 인터페이스               |
| ----------------- | ------------------------- | -------------------------------------------- |
| `Any`             | 거의 모든 Swift 값        | 공통 사용자 정의 인터페이스가 없어요.        |
| `AnyObject`       | 모든 클래스 인스턴스      | 구체 멤버는 캐스팅이나 동적 기능이 필요해요. |
| `any CatalogItem` | `CatalogItem`을 따르는 값 | `CatalogItem` 요구사항을 사용할 수 있어요.   |

공통 약속이 있다면 `Any`보다 `any Protocol`이 더 많은 타입 안전성과 의도를 제공해요.

## 반환 타입의 any는 경로마다 다른 준수 타입을 허용해요

함수 실행 결과가 조건에 따라 다른 구체 타입이어야 한다면 `any` 반환을 사용할 수 있어요.

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

두 반환값 모두 `CatalogItem`을 따르므로 각각 실존 상자에 담겨 반환돼요.

```swift
let first = dynamicItem(
  prefersVideo: false
)
// 동적 타입: Book

let second = dynamicItem(
  prefersVideo: true
)
// 동적 타입: Video
```

같은 코드를 `-> some CatalogItem`으로 바꾸면 반환 경로의 기반 타입이 달라 컴파일되지 않아요. `some`은 하나의 숨겨진 타입, `any`는 서로 다른 타입이 들어갈 수 있는 상자라는 차이가 드러나는 예예요.

반환 타입이 항상 `Book`인데 단지 구현 이름만 숨기려는 목적이라면 `any`보다 `some`이 더 강한 타입 정체성 계약을 제공해요.

## 연관 타입이 있는 프로토콜도 실존 타입으로 사용할 수 있어요

카탈로그 소스가 어떤 항목을 불러오는지 연관 타입으로 표현해 볼게요.

```swift
protocol CatalogSource {
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

현대 Swift에서는 연관 타입이 있는 프로토콜도 `any CatalogSource` 형태로 실존 값에 사용할 수 있어요.

```swift
let source: any CatalogSource =
  BookSource()
```

다만 `source`의 `Item`이 무엇인지 바깥 타입에 명시하지 않았어요. 반환 위치처럼 안전하게 타입을 지울 수 있는 멤버는 사용할 수 있지만, 연관 타입이 입력 위치에 등장하는 메서드는 구체 관계를 모르면 제한될 수 있어요.

연관 타입의 상한이 `CatalogItem`이므로 `load()` 결과를 통해 항목의 공통 인터페이스를 사용할 수 있지만, 호출자가 정확히 `[Book]`을 기대한다면 제약 없는 `any CatalogSource`는 정보가 부족해요.

## primary associated type으로 실존 값의 내부 타입을 제약해요

자주 제약할 연관 타입을 primary associated type으로 표시해요.

```swift
protocol CatalogSource<Item> {
  associatedtype Item: CatalogItem

  func load() -> [Item]
}
```

이제 구체 소스 타입은 서로 달라도 모두 `Book`을 불러온다는 조건을 표현할 수 있어요.

```swift
struct CachedBookSource:
  CatalogSource {
  let books: [Book]

  func load() -> [Book] {
    books
  }
}

let bookSources:
  [any CatalogSource<Book>] = [
    BookSource(),
    CachedBookSource(books: []),
  ]
```

배열의 각 원소는 `BookSource`, `CachedBookSource`처럼 서로 다른 동적 타입일 수 있어요. 하지만 모든 실존 값의 `Item == Book`이라는 관계는 유지돼요.

```swift
let allBooks: [Book] =
  bookSources.flatMap {
    $0.load()
  }
```

이 형태를 **제약된 실존 타입(constrained existential type)**이라고 해요. [SE-0353](https://github.com/swiftlang/swift-evolution/blob/main/proposals/0353-constrained-existential-types.md)은 primary associated type에 동일 타입 요구사항을 적용한 `any Collection<String>` 같은 문법을 도입했어요.

구체 구현 타입은 중요하지 않지만 처리하는 데이터 타입은 중요할 때 유용해요.

```text
소스의 구체 타입: 달라도 돼요.
소스가 반환하는 Item: 모두 Book이어야 해요.
```

## 실존 값은 제네릭 함수에 전달할 때 임시로 열릴 수 있어요

제네릭 함수는 원래 구체 타입 매개변수를 받아요.

```swift
func describe<Item: CatalogItem>(
  _ item: Item
) -> String {
  "\(item.id): \(item.title)"
}
```

`any CatalogItem` 값을 전달해도 현대 Swift에서는 많은 경우 컴파일돼요.

```swift
let erased: any CatalogItem =
  Book(
    id: 1,
    title: "Swift 기초",
    author: "Blob"
  )

let text = describe(erased)
```

컴파일러가 실존 상자를 **암시적으로 열어** 그 안의 숨겨진 동적 타입에 임시 이름을 붙이고 `Item`으로 사용하기 때문이에요.

```text
any CatalogItem 상자
        │ 열기
        ▼
숨겨진 구체 타입 τ
        │
        └─ describe<τ>(...)
```

이는 `any CatalogItem` 실존 타입 자체가 일반적인 의미에서 `CatalogItem`을 따르는 새로운 구체 타입이 되었다는 뜻이 아니에요. 특정 호출이 안전한 범위에서 상자 안의 타입을 잠시 제네릭 매개변수로 다루는 기능이에요.

Swift Evolution의 [SE-0352](https://github.com/swiftlang/swift-evolution/blob/main/proposals/0352-implicit-open-existentials.md)는 이 동작을 암시적으로 열린 실존 타입으로 설명해요.

제네릭 타입 매개변수가 반환 타입이나 다른 값과 복잡하게 연결되면 실존 타입을 열어도 관계를 바깥으로 안전하게 표현할 수 없는 경우가 있어요. 컴파일 오류가 난다면 다음을 확인해요.

- 타입 매개변수가 반환 타입 안에 그대로 노출되는가
- 두 실존 값의 숨겨진 타입이 같아야 하는가
- 연관 타입이 입력 위치에 사용되는가
- `any P<Associated>`처럼 필요한 관계를 제약할 수 있는가

## any Protocol이 프로토콜을 따른다고 단순화하면 안 돼요

다음 두 문장은 구분해야 해요.

1. `any CatalogItem` 상자는 `CatalogItem`을 따르는 값을 저장할 수 있어요.
2. `any CatalogItem`이라는 실존 타입 자체가 모든 상황에서 `CatalogItem`을 따르는 구체 타입인 것은 아니에요.

두 번째 문장을 무조건 참으로 만들면 `Equatable`의 `Self`처럼 숨겨진 타입 정체성이 필요한 요구사항을 안전하게 구현할 수 없어요. 상자 A의 동적 타입이 `Book`, 상자 B의 동적 타입이 `Video`일 수 있기 때문이에요.

암시적 열기 덕분에 실존 값을 제네릭 함수에 전달하는 많은 코드가 동작하지만, 이를 “`any P`가 이제 P에 준수한다”라고 외우기보다 **컴파일러가 필요할 때 상자 안의 타입을 열 수 있다**고 이해하는 편이 정확해요.

## 수동 type eraser는 여전히 역할이 있을 수 있어요

과거에는 연관 타입이나 `Self` 요구사항이 있는 프로토콜 값을 저장하기 위해 `AnySequence`, `AnyPublisher`처럼 `Any...` wrapper를 직접 만드는 경우가 많았어요. 현대 Swift의 `any`와 제약된 실존 타입은 단순 저장 문제를 더 직접적으로 해결할 수 있어요.

하지만 수동 type eraser가 항상 불필요해진 것은 아니에요. 별도 wrapper는 다음 역할을 추가할 수 있어요.

- 실존 값에서 직접 제공하지 않는 새로운 프로토콜 준수
- 값 비교, 해싱, 복사와 같은 명시적인 의미 규칙
- 여러 프로토콜과 콜백을 하나의 안정된 API로 묶는 기능
- 저장 방식과 성능 특성을 직접 제어하는 기능
- 이전 Swift 버전이나 기존 public API와의 호환

`any Protocol`로 충분한 단순 저장 문제에 관성적으로 wrapper를 추가하지 말고, wrapper가 제공해야 할 추가 의미가 있는지 확인해야 해요.

## 제네릭, some, any를 나란히 비교해요

같은 `CatalogItem` 제약을 사용해도 타입을 정하고 보존하는 방식이 달라요.

| 기준                       | 제네릭 `<Item: CatalogItem>`            | `some CatalogItem` 반환                   | `any CatalogItem`                      |
| -------------------------- | --------------------------------------- | ----------------------------------------- | -------------------------------------- |
| 구체 타입을 정하는 주체    | 호출자                                  | 함수·프로퍼티 구현                        | 값을 대입하는 코드                     |
| 한 값의 타입 정체성        | 유지해요.                               | 유지하지만 이름을 숨겨요.                 | 상자 바깥에서 지워요.                  |
| 실행 중 다른 타입으로 교체 | 같은 인스턴스·호출 관계에서는 어려워요. | 할 수 없어요.                             | 할 수 있어요.                          |
| 이종 배열                  | 단일 타입 매개변수로는 표현하지 않아요. | 한 기반 타입만 담아요.                    | `[any P]`로 표현해요.                  |
| `Self`·연관 타입 관계      | 가장 많이 보존해요.                     | 기반 타입을 보존해 많이 활용할 수 있어요. | 지운 정보에 따라 일부 연산이 제한돼요. |
| 런타임 간접 접근           | 필수 의미가 아니에요.                   | 실존 boxing이 핵심 의미가 아니에요.       | 필요할 때 boxing과 간접 접근이 생겨요. |
| 대표 사용                  | 재사용 알고리즘과 자료구조              | 구현 타입을 감춘 반환 API                 | 런타임 교체, 이종 저장, 플러그인 목록  |

선택 질문을 짧게 정리하면 다음과 같아요.

```text
호출자가 구체 타입을 고르고 관계를 유지해야 하나요?
└─ 제네릭

구현이 고른 하나의 타입을 숨겨 반환해야 하나요?
└─ some

서로 다른 준수 타입을 저장하거나 실행 중 바꿔야 하나요?
└─ any
```

## any의 비용은 요구사항과 함께 판단해요

실존 타입은 다음 비용을 가질 수 있어요.

- 구체 타입의 전용 API를 바로 사용할 수 없어요.
- `Self`와 연관 타입 관계가 지워져 일부 프로토콜 멤버가 제한될 수 있어요.
- 필요할 때 boxing 저장과 추가 간접 참조가 생겨요.
- 컴파일러가 구체 타입을 직접 아는 제네릭 코드보다 특수화 기회가 줄 수 있어요.
- 캐스팅이 늘어나면 런타임 실패 가능성과 분기 코드가 생겨요.

반면 다음 가치를 제공해요.

- 서로 다른 준수 타입을 하나의 배열과 프로퍼티에 저장해요.
- 실행 중 구성, 사용자 선택, 플러그인 등록 결과에 따라 구현을 교체해요.
- 공개 API에서 구체 타입을 노출하지 않아요.
- 단순한 type eraser wrapper를 직접 작성하지 않고 프로토콜 상자를 표현해요.

성능이 중요하지 않다는 뜻도, `any`가 항상 느리다는 뜻도 아니에요. 먼저 동적 이질성이 실제 요구사항인지 판단하고, 병목 경로에서는 Instruments나 벤치마크로 측정해야 해요.

## any 오류는 지워진 타입 관계를 찾아봐요

| 자주 만나는 상황                                     | 원인                                                                     | 확인할 부분                                                                                    |
| ---------------------------------------------------- | ------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------- |
| 구체 타입 전용 프로퍼티에 접근할 수 없어요.          | 실존 값의 정적 인터페이스에는 프로토콜 요구사항만 보여요.                | 공통 요구사항으로 올릴지, 안전하게 캐스팅할지, 이종 저장 자체가 필요한지 확인해요.             |
| 두 실존 값을 `==`로 비교할 수 없어요.                | `Equatable`의 두 `Self` 타입이 같다는 보장이 없어요.                     | 공통 식별자 비교, 같은 타입 제네릭, downcast, 별도 동등성 규칙 중 목적에 맞는 방법을 선택해요. |
| 연관 타입을 입력으로 받는 메서드를 호출할 수 없어요. | 상자 밖에서 연관 타입의 정확한 정체성을 몰라요.                          | `any Protocol<Associated>`로 제약하거나 제네릭 경계에서 처리해요.                              |
| `any P`를 제네릭 함수에 전달한 코드가 실패해요.      | 숨겨진 타입 관계가 반환 타입이나 다른 매개변수로 빠져나갈 수 있어요.     | 타입 매개변수 관계를 단순화하거나 제약된 실존 타입, 별도 type eraser를 검토해요.               |
| `Any` 값에서 프로토콜 멤버를 사용할 수 없어요.       | `Any`는 특정 프로토콜 약속을 보존하지 않아요.                            | 실제 요구사항이 있다면 `any Protocol`로 타입을 좁혀요.                                         |
| 성능을 이유로 모든 any를 제네릭으로 바꾸려 해요.     | 런타임 이종 저장이라는 요구사항을 제네릭 하나로 표현하지 못할 수 있어요. | 의미를 먼저 유지하고 실제 측정에서 병목인 경계만 wrapper나 구조 변경을 검토해요.               |

오류 메시지에서 `Self`, `associated type`, `cannot conform`이 보이면 어떤 구체 타입 정보가 상자 밖에서 지워졌는지 추적해 보세요.

## 언제 사용해야 하나요

다음 상황에서는 `any`가 잘 맞아요.

- 서로 다른 프로토콜 준수 타입을 같은 배열에 저장해요.
- 설정, 사용자 입력, 의존성 조립 결과에 따라 구현을 실행 중 교체해요.
- 구체 타입보다 공통 프로토콜 인터페이스가 중요한 저장 경계예요.
- 플러그인, 라우트, 명령, 렌더러처럼 타입이 다른 구현 목록을 관리해요.
- primary associated type을 제약해 구현 타입은 달라도 처리하는 데이터 타입은 같게 유지해요.
- 단순한 타입 소거를 위해 별도 `Any...` wrapper를 만드는 비용을 줄이고 싶어요.

다음 상황에서는 다른 표현도 검토해요.

- 함수 한 번의 호출에서 타입 관계를 유지하면 된다면 제네릭이 더 강한 계약을 제공해요.
- 구현이 항상 하나의 구체 타입을 반환하고 이름만 숨기려면 `some`이 맞아요.
- 구체 타입 전용 기능을 계속 캐스팅해서 사용한다면 프로토콜 경계가 잘못 잡혔을 수 있어요.
- 값의 전체 동등성, 해싱, 복사 의미를 실존 값에 별도로 제공해야 한다면 명시적인 type eraser가 필요할 수 있어요.
- 동적 이질성이 없는 단순 코드에 관성적으로 `any`를 추가하지 않아요.

## any를 적용하는 순서를 정리해요

1. 같은 저장소에 실제로 서로 다른 구체 타입이 들어가야 하는지 확인해요.
2. 모든 값이 공통으로 제공해야 할 최소 동작을 프로토콜 요구사항으로 정의해요.
3. 변수, 프로퍼티, 배열의 타입을 `any Protocol`로 선언해요.
4. 호출부에서 구체 타입 전용 멤버를 캐스팅 없이 사용하려는 곳이 없는지 확인해요.
5. `Self`나 연관 타입 때문에 제한되는 연산을 찾고, 제네릭 또는 primary associated type 제약으로 관계를 복구해요.
6. 단순 `any`로 부족하다면 별도 enum이나 type eraser가 제공할 추가 의미를 정의해요.
7. 캐스팅과 런타임 분기가 늘어나지 않는지 검토해요.
8. 성능이 중요한 저장·호출 경계는 실제 데이터와 release 빌드로 측정해요.

## 흔한 오해를 정리해요

### any Protocol은 Any와 같은가요?

아니요. `Any`는 거의 모든 Swift 값을 담고 공통 사용자 정의 인터페이스를 보존하지 않아요. `any Protocol`은 해당 프로토콜을 따르는 값만 담으며 프로토콜 요구사항을 바로 사용할 수 있어요.

### any를 붙이면 프로토콜을 따르는 새 구체 타입이 만들어지나요?

아니요. 프로토콜을 따르는 구체 값을 담는 실존 타입을 만들어요. 암시적 열기로 제네릭 함수에 전달할 수 있는 경우가 많지만, 실존 타입 자체가 모든 상황에서 그 프로토콜을 따르는 구체 타입이 된 것은 아니에요.

### any 값은 항상 힙에 할당되나요?

아니요. 실제 저장 방식은 값의 크기와 컴파일러·런타임 구현에 따라 달라질 수 있어요. 실존 타입은 필요할 때 boxing과 간접 접근 비용을 가질 수 있다고 이해하고, 구체적인 성능은 측정해야 해요.

### 프로토콜이 Equatable을 따르면 any 값도 바로 비교할 수 있나요?

항상 그렇지 않아요. `Equatable`의 `==`는 양쪽 값의 `Self` 타입이 같아야 하는데, 두 실존 상자의 동적 타입이 같다는 보장이 없어요. 비교 목적에 맞는 식별자나 별도 동등성 규칙이 필요해요.

### 연관 타입이 있는 프로토콜은 any로 사용할 수 없나요?

현대 Swift에서는 사용할 수 있어요. 다만 연관 타입 정체성을 모르면 일부 멤버 사용이 제한될 수 있고, primary associated type을 이용한 `any Protocol<Concrete>` 형태로 필요한 관계를 제약할 수 있어요.

## 면접에서 이어질 수 있는 질문

### 실존 타입이란 무엇인가요?

어떤 구체 타입이 프로토콜을 따른다는 사실만 남기고 그 값을 상자에 담아 다루는 타입이에요. `any Protocol`로 표현하며 상자 밖에서는 공통 프로토콜 인터페이스를 사용해요.

### any를 사용하면 어떤 정보를 잃나요?

바깥 코드에서 저장된 값의 구체 타입 정체성을 직접 사용하지 못해요. 이 때문에 구체 타입 전용 멤버와 `Self`·일부 연관 타입 관계에 의존하는 연산이 제한될 수 있어요.

### 제네릭과 any는 어떻게 선택하나요?

호출마다 하나의 구체 타입과 입력·출력 관계를 보존해야 하면 제네릭을 사용해요. 서로 다른 준수 타입을 한 저장소에 담거나 실행 중 교체해야 하면 `any`를 사용해요.

### some과 any의 차이는 무엇인가요?

`some Protocol`은 선언이 선택한 하나의 기반 타입을 숨기면서 정체성을 유지해요. `any Protocol`은 여러 기반 타입을 실행 중 담을 수 있도록 바깥에서 정체성을 지워요.

### 암시적으로 열린 실존 타입은 무엇인가요?

실존 값을 제네릭 함수에 전달할 때 컴파일러가 상자 안의 숨겨진 타입에 임시 이름을 붙여 타입 매개변수로 사용하는 기능이에요. 실존 타입 자체의 일반적인 프로토콜 준수를 추가하는 것과는 달라요.

## 참고 자료

- [The Swift Programming Language — Opaque and Boxed Protocol Types](https://docs.swift.org/swift-book/documentation/the-swift-programming-language/opaquetypes/)
- [The Swift Programming Language — Types](https://docs.swift.org/swift-book/documentation/the-swift-programming-language/types/)
- [The Swift Programming Language — Protocols](https://docs.swift.org/swift-book/documentation/the-swift-programming-language/protocols/)
- [The Swift Programming Language — Generics](https://docs.swift.org/swift-book/documentation/the-swift-programming-language/generics/)
- [Swift Evolution SE-0309 — Unlock Existential Types for All Protocols](https://github.com/swiftlang/swift-evolution/blob/main/proposals/0309-unlock-existential-types-for-all-protocols.md)
- [Swift Evolution SE-0335 — Introduce Existential any](https://github.com/swiftlang/swift-evolution/blob/main/proposals/0335-existential-any.md)
- [Swift Evolution SE-0352 — Implicitly Opened Existentials](https://github.com/swiftlang/swift-evolution/blob/main/proposals/0352-implicit-open-existentials.md)
- [Swift Evolution SE-0353 — Constrained Existential Types](https://github.com/swiftlang/swift-evolution/blob/main/proposals/0353-constrained-existential-types.md)
