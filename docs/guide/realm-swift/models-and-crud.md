---
title: Realm 데이터 모델과 CRUD
description: Object와 EmbeddedObject, Persisted 속성, 관계와 collection을 모델링하고 managed 객체의 생명주기와 쓰기 트랜잭션을 이해해 CRUD를 구현합니다.
pageType: doc-wide
outline: false
---

# Realm 데이터 모델과 CRUD

> 면접용 한 줄 요약: **Realm 모델은 `Object`와 `@Persisted`로 스키마를 선언하며, Realm에 추가된 managed 객체의 변경은 반드시 하나의 원자적 `write` transaction 안에서 수행합니다.**

## 먼저 모델링 용어를 구분해요

| 용어                 | 의미                                                                         |
| -------------------- | ---------------------------------------------------------------------------- |
| schema               | Realm 파일에 어떤 object type과 property가 존재하는지 정의한 구조예요.       |
| primary key          | 같은 object type 안에서 각 객체를 유일하게 식별하는 값이에요.                |
| to-one relationship  | 한 객체가 다른 객체 하나를 참조하는 optional property예요.                   |
| to-many relationship | `List`, `MutableSet`, `Map`으로 여러 값을 연결하는 관계예요.                 |
| embedded object      | 부모에 소유되어 독립적으로 존재할 수 없는 중첩 객체예요.                     |
| backlink             | 다른 객체가 자신을 가리키는 관계를 역방향으로 조회하는 `LinkingObjects`예요. |
| managed object       | Realm에 들어가 파일의 row와 연결된 객체예요.                                 |
| invalidated object   | 삭제됐거나 Realm이 무효화되어 더 이상 안전하게 읽을 수 없는 객체예요.        |

## 완성할 독서 기록 모델을 먼저 봐요

```swift
import Foundation
import RealmSwift

enum ReadingStatus: String, PersistableEnum {
  case unread
  case reading
  case finished
}

final class BookNote: EmbeddedObject {
  @Persisted var text = ""
  @Persisted var createdAt = Date()
}

final class Author: Object {
  @Persisted(primaryKey: true) var id: ObjectId
  @Persisted(indexed: true) var name = ""
  @Persisted(originProperty: "author") var books: LinkingObjects<Book>
}

final class Book: Object {
  @Persisted(primaryKey: true) var id: ObjectId
  @Persisted(indexed: true) var title = ""
  @Persisted var status = ReadingStatus.unread
  @Persisted var progress = 0
  @Persisted var author: Author?
  @Persisted var tags = List<String>()
  @Persisted var notes = List<BookNote>()
  @Persisted var updatedAt = Date()

  var progressText: String {
    "\(progress)%"
  }
}
```

이 모델에는 관계가 세 종류 있어요.

```text
Author <──────────── Book
   ▲     backlink      │ author: Author?       to-one
   │                   │
   └─ books            ├─ tags: List<String>   primitive collection
                       └─ notes: List<BookNote> owned embedded objects
```

`progressText`에는 `@Persisted`가 없으므로 계산할 때만 존재하고 파일에는 저장되지 않습니다. 모델에서 하나라도 `@Persisted` 선언 방식을 사용하면 wrapper가 없는 속성은 자동으로 스키마에서 제외돼요.

## `Object`와 `EmbeddedObject`는 수명이 달라요

`Author`와 `Book`은 독립적으로 query·삭제할 수 있는 `Object`입니다. `BookNote`는 특정 `Book` 안에 소유되는 `EmbeddedObject`예요.

| 질문                                      | `Object` | `EmbeddedObject`              |
| ----------------------------------------- | -------- | ----------------------------- |
| 독립 query 대상인가요?                    | 예       | 아니요. 부모를 통해 접근해요. |
| primary key를 가질 수 있나요?             | 예       | 아니요.                       |
| 여러 부모가 같은 객체를 공유할 수 있나요? | 예       | 아니요. 한 부모에만 속해요.   |
| 부모에서 관계를 제거하면 자동 삭제되나요? | 아니요   | 예                            |

주소, 주문 항목의 당시 snapshot, 책에 완전히 소유된 메모처럼 부모 없이 의미가 없는 값은 embedded object가 잘 맞습니다. 여러 책이 공유하는 저자처럼 독립 식별과 재사용이 필요하면 일반 `Object`로 모델링하세요.

## property의 저장 의미를 의도적으로 정해요

### optional과 기본값

```swift
final class Profile: Object {
  @Persisted(primaryKey: true) var id: ObjectId
  @Persisted var nickname = "이름 없음"  // required String
  @Persisted var biography: String?       // optional String
  @Persisted var age = 0                  // required Int
  @Persisted var height: Double?          // optional Double
}
```

`""`와 `nil`은 의미가 달라요. 값이 아직 없음을 표현해야 하면 optional을 사용하고, business상 반드시 존재해야 하면 의미 있는 기본값이나 생성 경로의 검증을 마련합니다. Realm schema의 required 여부만으로 domain 유효성 검사가 모두 해결되지는 않아요.

### primary key

```swift
@Persisted(primaryKey: true) var id: ObjectId
```

- object type마다 하나만 선언할 수 있어요.
- 같은 Realm의 같은 type 안에서 값이 유일해야 해요.
- managed 객체가 된 뒤 primary key를 직접 변경할 수 없어요.
- 값 자체를 바꾸려면 기존 객체를 삭제하고 새 객체를 만들어야 해요.

서버 ID가 없다면 `ObjectId.generate()` 또는 기본 `ObjectId` 값을 사용할 수 있습니다. 임의의 제목이나 배열 index처럼 바뀌거나 충돌할 값을 식별자로 쓰지 마세요.

### index

```swift
@Persisted(indexed: true) var title = ""
```

index는 equality와 `IN` query를 빠르게 할 수 있지만 모든 쓰기에서 index도 갱신하고 파일 공간을 사용합니다. “검색할 것 같다”는 추측으로 모든 field에 붙이지 말고 실제 query와 Instruments 측정을 근거로 추가하세요. Realm은 string, integer, boolean, `Date`, `UUID`, `ObjectId`, `AnyRealmValue` 등에 index를 지원합니다.

## collection의 의미도 서로 달라요

| Realm collection          | 성질                                                                  | 예시                        |
| ------------------------- | --------------------------------------------------------------------- | --------------------------- |
| `List<Element>`           | 순서와 중복을 허용해요.                                               | 독서 메모, 직접 정렬한 항목 |
| `MutableSet<Element>`     | 순서가 없고 중복을 허용하지 않아요.                                   | 고유한 category 집합        |
| `Map<Value>`              | `String` key로 value를 찾는 dictionary 형태예요.                      | locale별 제목               |
| `LinkingObjects<Element>` | 다른 object의 관계를 역방향으로 보여 주는 read-only collection이에요. | 저자의 모든 책              |

Realm collection 자체도 managed 상태에서는 write 안에서만 수정합니다.

```swift
try realm.write {
  book.tags.append("Swift")
  book.tags.append(objectsIn: ["iOS", "Database"])

  let note = BookNote()
  note.text = "write transaction을 다시 읽기"
  book.notes.append(note)
}
```

## unmanaged에서 managed로 바뀌는 순간을 이해해요

```swift
let book = Book()
book.title = "Realm Guide"       // 아직 unmanaged: 자유롭게 변경
print(book.realm == nil)          // true

try realm.write {
  realm.add(book)
}

print(book.realm === realm)       // true

try realm.write {
  book.progress = 30              // managed: write 안에서 변경
}
```

같은 Swift 변수지만 `realm.add` 전후의 규칙이 다릅니다.

| 상태      | persisted 속성 변경                | 다른 executor로 전달         | 삭제 후 접근                |
| --------- | ---------------------------------- | ---------------------------- | --------------------------- |
| unmanaged | 일반 객체처럼 가능                 | 직접 설계한 값이라면 가능    | 해당 없음                   |
| managed   | 같은 Realm의 `write` 안에서만 가능 | 객체 그대로 전달하지 않아요. | `isInvalidated`를 확인해요. |

managed object는 Realm 파일의 현재 version을 보는 live reference입니다. actor나 queue 경계를 넘길 때는 primary key 또는 별도 `Sendable` DTO를 전달하고 목적지의 Realm에서 다시 query하는 방식을 우선하세요.

## 쓰기 트랜잭션은 원자적인 변경 단위예요

```swift
enum ReadingError: Error {
  case invalidProgress
}

func updateProgress(
  of book: Book,
  to progress: Int,
  in realm: Realm
) throws {
  guard 0...100 ~= progress else {
    throw ReadingError.invalidProgress
  }

  try realm.write {
    book.progress = progress
    book.status = progress == 100 ? .finished : .reading
    book.updatedAt = Date()
  }
}
```

closure가 성공하면 세 속성이 함께 commit됩니다. closure가 throw하면 transaction은 취소되고 중간 변경을 남기지 않아요. 같은 Realm file에는 한 번에 하나의 write transaction만 열 수 있고 nested write도 허용되지 않습니다.

transaction을 너무 잘게 쪼개면 lock·commit 비용이 늘고, 너무 크게 묶으면 다른 쓰기가 오래 기다립니다. 사용자가 인식하는 하나의 business operation을 기본 경계로 삼고, 대량 import는 batch 크기를 측정하세요.

## CRUD를 하나의 store로 모아봐요

```swift
import RealmSwift

final class LibraryStore {
  private let realm: Realm

  init(configuration: Realm.Configuration = .defaultConfiguration) throws {
    realm = try Realm(configuration: configuration)
  }

  @discardableResult
  func createBook(title: String, authorName: String) throws -> ObjectId {
    let author = Author()
    author.name = authorName

    let book = Book()
    book.title = title
    book.author = author

    try realm.write {
      realm.add(book)
    }

    return book.id
  }

  func books(status: ReadingStatus? = nil) -> Results<Book> {
    let allBooks = realm.objects(Book.self)
    guard let status else {
      return allBooks.sorted(byKeyPath: "updatedAt", ascending: false)
    }

    return allBooks
      .where { $0.status == status }
      .sorted(byKeyPath: "updatedAt", ascending: false)
  }

  func updateProgress(id: ObjectId, progress: Int) throws {
    guard let book = realm.object(ofType: Book.self, forPrimaryKey: id) else {
      return
    }

    try realm.write {
      book.progress = min(max(progress, 0), 100)
      book.status = book.progress == 100 ? .finished : .reading
      book.updatedAt = Date()
    }
  }

  func upsert(_ draft: Book) throws {
    try realm.write {
      realm.add(draft, update: .modified)
    }
  }

  func deleteBook(id: ObjectId) throws {
    guard let book = realm.object(ofType: Book.self, forPrimaryKey: id) else {
      return
    }

    try realm.write {
      realm.delete(book)
    }
  }
}
```

`upsert`의 `.modified`는 같은 primary key 객체가 있으면 전달된 속성을 갱신하고, 없으면 추가합니다. API 응답 전체를 무조건 upsert하기 전에 서버에 없는 local-only field가 덮어써지는지 mapping 정책을 확인하세요.

### delete는 기본적으로 cascade delete가 아니에요

`Book`을 삭제하면 그 안의 `BookNote` embedded objects는 함께 삭제됩니다. 그러나 연결된 일반 `Author`는 남아요.

```swift
try realm.write {
  let author = book.author
  realm.delete(book)

  if let author, author.books.isEmpty {
    realm.delete(author)
  }
}
```

“참조가 없어지면 저자도 지운다”는 것은 Realm의 기본 규칙이 아니라 앱의 business rule입니다. 어느 관계가 소유이고 어느 관계가 공유인지 모델 단계에서 명시하세요.

### 객체가 삭제되면 reference도 무효화돼요

```swift
let selectedBook = realm.object(ofType: Book.self, forPrimaryKey: id)

try realm.write {
  if let selectedBook {
    realm.delete(selectedBook)
  }
}

if selectedBook?.isInvalidated == true {
  print("이미 삭제된 객체입니다.")
}
```

화면이 managed object를 오래 보관한다면 다른 화면·notification에서 삭제될 수 있음을 고려해야 합니다. 화면 식별자는 primary key로 유지하고 필요할 때 query하거나, 관찰 wrapper가 삭제 상태를 처리하도록 설계하세요.

## 모델링과 CRUD 체크리스트

- [ ] 독립 수명이 필요한 모델과 부모에 소유되는 embedded model을 구분했나요?
- [ ] to-one relationship을 optional로 선언했나요?
- [ ] primary key가 안정적이고 유일하며 변경되지 않나요?
- [ ] index를 실제 equality query가 많은 속성에만 추가했나요?
- [ ] managed object의 모든 변경을 같은 Realm의 `write`로 묶었나요?
- [ ] 일반 object 관계의 delete policy를 business rule로 구현했나요?
- [ ] Realm 객체 대신 ID·DTO가 계층과 actor 경계를 넘도록 설계했나요?

## 면접에서 이어질 수 있는 질문

### managed object와 일반 Swift class는 어떻게 다른가요?

managed object는 Realm file의 row와 연결된 live object입니다. Realm이 관리하는 persisted 속성은 transaction과 executor 규칙을 따르고, 다른 write가 반영되면 같은 reference의 값도 갱신될 수 있습니다. 일반 class처럼 임의의 thread에서 자유롭게 수정하는 객체가 아니에요.

### `Object`와 `EmbeddedObject` 중 무엇을 선택하나요?

독립 query·식별·여러 부모의 공유가 필요하면 `Object`, 부모 없이 존재할 수 없고 부모와 함께 삭제돼야 하면 `EmbeddedObject`를 선택합니다. embedded object는 primary key를 가질 수 없고 한 부모에만 속합니다.

## 참고 자료

- [Realm 객체 모델 공식 가이드](https://github.com/realm/realm-swift/blob/community/docs/guides/model-data/object-models.md)
- [Realm 관계 모델 공식 가이드](https://github.com/realm/realm-swift/blob/community/docs/guides/model-data/relationships.md)
- [Realm CRUD 공식 가이드](https://github.com/realm/realm-swift/tree/community/docs/guides/crud)
- [`Persisted` API source](https://github.com/realm/realm-swift/blob/community/RealmSwift/PersistedProperty.swift)
- [`Object` API source](https://github.com/realm/realm-swift/blob/community/RealmSwift/Object.swift)
