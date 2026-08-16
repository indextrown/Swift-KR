---
title: Cloud Firestore의 문서, 쿼리, 실시간 Listener
description: Firestore의 collection과 document 모델, Swift Codable mapping, 비동기 읽기·쓰기, QuerySnapshot과 documentChanges 기반 목록 갱신을 설명합니다.
pageType: doc-wide
outline: false
---

# Cloud Firestore의 문서, 쿼리, 실시간 Listener

> 면접용 한 줄 요약: **Cloud Firestore는 collection 안의 document로 데이터를 저장하고 index 기반 query를 제공하며, document·query listener는 local write를 먼저 반영한 snapshot과 이후 server 상태를 전달합니다.**

Firestore는 Realtime Database처럼 하나의 큰 JSON tree를 내려받는 방식이 아니에요. document를 독립적인 읽기·쓰기 단위로 두고 collection query로 필요한 document 집합을 선택합니다.

```text
users (collection)
└─ user-123 (document)
   ├─ displayName: "Mina"
   └─ books (subcollection)
      ├─ book-a (document)
      │  ├─ title: "Swift"
      │  ├─ minutes: 40
      │  └─ ownerID: "user-123"
      └─ book-b (document)
```

## 먼저 알아둘 용어

| 용어                 | 의미                                                                        |
| -------------------- | --------------------------------------------------------------------------- |
| collection           | 여러 document를 담는 논리적 그룹이에요.                                     |
| document             | field와 값을 저장하는 Firestore의 기본 읽기·쓰기 단위예요.                  |
| subcollection        | document 아래에 둘 수 있는 또 다른 collection이에요.                        |
| document ID          | collection 안에서 document를 구분하는 문자열이에요.                         |
| `DocumentReference`  | 특정 document 경로를 가리키는 handle이에요.                                 |
| query                | 조건, 정렬, 제한을 조합해 document 집합을 선택하는 요청이에요.              |
| index                | query 결과를 효율적으로 찾기 위해 Firestore가 관리하는 정렬 구조예요.       |
| `DocumentSnapshot`   | 한 document의 특정 시점 데이터와 metadata를 담아요.                         |
| `QuerySnapshot`      | query의 현재 document 결과와 `documentChanges`를 담아요.                    |
| latency compensation | server 응답 전 local write를 snapshot listener에 먼저 보여 주는 동작이에요. |

## collection과 document 경로를 만들어요

경로는 collection과 document가 번갈아 나타나요.

```swift
import FirebaseFirestore

let database = Firestore.firestore()

let userReference = database
  .collection("users")
  .document("user-123")

let booksReference = userReference
  .collection("books")

let bookReference = booksReference
  .document("book-a")
```

`users/user-123`은 document 경로이고 `users/user-123/books`는 collection 경로예요. reference를 만든 것만으로 network 요청이 발생하지는 않습니다.

document 크기 제한과 query 패턴을 고려해 경계를 정하세요. 계속 커지는 배열 하나를 사용자 document에 넣기보다 각 책을 별도 document로 저장하면 일부 항목만 읽고 갱신하기 쉬워요.

## Codable로 document를 type-safe하게 변환해요

```swift
import FirebaseFirestore

struct ReadingBook: Codable, Identifiable {
  @DocumentID var id: String?
  let ownerID: String
  var title: String
  var minutes: Int
  var isFinished: Bool
}
```

`@DocumentID`는 document 경로의 ID를 decoding 결과에 넣고, document field로 중복 저장하지 않도록 돕습니다. 앱 model과 database schema를 완전히 같은 타입으로 유지하기 어려워지면 Firestore DTO와 domain model을 나눠 변환하세요.

한 document를 async로 읽을 수 있어요.

```swift
enum BookError: Error {
  case notFound
}

func loadBook(
  userID: String,
  bookID: String
) async throws -> ReadingBook {
  let snapshot = try await Firestore.firestore()
    .collection("users")
    .document(userID)
    .collection("books")
    .document(bookID)
    .getDocument()

  guard snapshot.exists else {
    throw BookError.notFound
  }

  return try snapshot.data(as: ReadingBook.self)
}
```

“document가 없음”과 “document는 있지만 schema가 맞지 않아 decoding 실패”를 구분하면 migration 문제를 빨리 찾을 수 있어요.

## 비동기 쓰기의 두 단계를 구분해요

Codable API의 `setData(from:)`는 encoding 오류를 `throw`하고 completion으로 server write 결과를 알려요. async/await로 server 완료까지 기다리고 싶다면 먼저 `Firestore.Encoder`로 dictionary를 만든 뒤 async `setData`를 사용할 수 있습니다.

```swift
import FirebaseFirestore

func saveBook(
  _ book: ReadingBook,
  userID: String,
  bookID: String
) async throws {
  let document = Firestore.firestore()
    .collection("users")
    .document(userID)
    .collection("books")
    .document(bookID)

  let data = try Firestore.Encoder().encode(book)
  try await document.setData(data)
}
```

`setData`는 기본적으로 기존 document를 덮어써요. 일부 field만 바꿀 때는 `updateData` 또는 `setData(_:merge:)`를 사용합니다.

```swift
func markAsFinished(
  userID: String,
  bookID: String
) async throws {
  let document = Firestore.firestore()
    .collection("users")
    .document(userID)
    .collection("books")
    .document(bookID)

  try await document.updateData([
    "isFinished": true,
    "updatedAt": FieldValue.serverTimestamp(),
  ])
}
```

`updateData`는 document가 없으면 실패하지만 merge set은 document를 만들 수 있어요. “없으면 생성할지”가 API 선택 기준입니다.

## query로 필요한 document만 읽어요

```swift
func loadUnfinishedBooks(
  userID: String
) async throws -> [ReadingBook] {
  let snapshot = try await Firestore.firestore()
    .collection("users")
    .document(userID)
    .collection("books")
    .whereField("isFinished", isEqualTo: false)
    .order(by: "minutes", descending: true)
    .limit(to: 20)
    .getDocuments()

  return try snapshot.documents.map {
    try $0.data(as: ReadingBook.self)
  }
}
```

조건과 정렬 조합에 필요한 composite index가 없으면 Firestore가 오류와 함께 생성 link를 안내할 수 있어요. index를 무작정 추가하기보다 실제 화면 query를 먼저 정의하고 Console에서 필요한 index를 관리합니다.

Firestore Security Rules는 결과를 받은 뒤 금지 document를 걸러내는 filter가 아니에요. query가 반환할 **가능성이 있는 모든 document**가 허용되어야 하므로, Rules의 소유자 조건에 맞춰 `ownerID` 조건을 query에도 포함해야 할 수 있습니다.

## query listener로 목록을 실시간 갱신해요

```swift
import FirebaseFirestore

final class BooksObserver {
  private var registration: ListenerRegistration?

  func start(
    userID: String,
    onChange: @escaping (Result<[ReadingBook], Error>) -> Void
  ) {
    guard registration == nil else { return }

    let query = Firestore.firestore()
      .collection("users")
      .document(userID)
      .collection("books")
      .order(by: "title")

    registration = query.addSnapshotListener {
      snapshot,
      error in
      if let error {
        onChange(.failure(error))
        return
      }

      guard let snapshot else { return }

      do {
        let books = try snapshot.documents.map {
          try $0.data(as: ReadingBook.self)
        }
        onChange(.success(books))
      } catch {
        onChange(.failure(error))
      }
    }
  }

  func stop() {
    registration?.remove()
    registration = nil
  }
}
```

listener는 현재 query 결과를 먼저 전달한 뒤 결과가 달라질 때 새 `QuerySnapshot`을 전달해요. error로 listener가 종료되면 공식 가이드에 따라 그 실패 listener를 별도로 detach할 필요는 없지만, 소유 객체가 끝날 때 정상 listener의 `registration.remove()`를 호출하는 구조는 유지합니다.

## `documentChanges`로 목록 차이만 적용해요

`snapshot.documents`는 현재 전체 결과이고, `snapshot.documentChanges`는 직전 snapshot과 비교해 어떤 document가 추가·수정·삭제되었는지 알려 줍니다.

```swift
func printChanges(_ snapshot: QuerySnapshot) throws {
  for change in snapshot.documentChanges {
    let book = try change.document.data(as: ReadingBook.self)

    switch change.type {
    case .added:
      print("추가", book.title, change.newIndex)

    case .modified:
      print(
        "수정 또는 이동",
        book.title,
        change.oldIndex,
        change.newIndex
      )

    case .removed:
      print("삭제", book.title, change.oldIndex)
    }
  }
}
```

UIKit collection view에서 차이만 적용할 때 유용하지만 index mutation 순서가 틀리면 crash가 날 수 있어요. 작은 목록은 snapshot 전체를 새 배열로 바꾸고 SwiftUI `List`나 diffable data source에 stable ID를 전달하는 방식이 더 단순할 수 있습니다.

## local write와 server snapshot을 metadata로 구분해요

Firestore는 latency compensation 때문에 local write를 listener에 즉시 반영해요. `snapshot.metadata.hasPendingWrites`가 `true`면 아직 backend에 commit되지 않은 local write가 포함된 상태입니다.

metadata 변화까지 다시 받으려면 listener를 등록할 때 `includeMetadataChanges: true`를 사용해요.

```swift
let registration = document.addSnapshotListener(
  includeMetadataChanges: true
) { snapshot, error in
  guard let snapshot, error == nil else { return }

  if snapshot.metadata.hasPendingWrites {
    print("로컬 변경을 표시하는 중")
  } else {
    print("서버 commit이 확인된 상태")
  }
}
```

`metadata.isFromCache`는 snapshot이 local cache에서 왔는지 알려 줍니다. “cache에서 왔다”와 “pending local write가 있다”는 서로 다른 상태예요.

## batch와 transaction의 역할이 달라요

| 도구        | 먼저 읽기      | 여러 쓰기 atomic 적용 | 재시도 가능성           | 사용 예                       |
| ----------- | -------------- | --------------------- | ----------------------- | ----------------------------- |
| write batch | 불필요         | 가능                  | 읽기 충돌 없음          | 여러 document를 함께 생성     |
| transaction | 필요할 수 있음 | 가능                  | 충돌 시 callback 재실행 | 현재 값에 따라 잔여 수량 감소 |

이미 정해진 여러 변경은 write batch가 단순하고, server의 현재 값에 따라 새 값을 계산해야 하면 transaction을 사용해요. transaction closure는 재실행될 수 있으므로 UI 변경이나 외부 API 호출 같은 side effect를 넣지 않습니다.

## 체크리스트

- [ ] collection과 document 경로가 번갈아 구성되나요?
- [ ] 계속 커지는 배열 대신 독립 document와 query를 검토했나요?
- [ ] document 없음과 Codable decoding 실패를 구분하나요?
- [ ] 전체 덮어쓰기, merge, update의 의미를 구분했나요?
- [ ] query와 Security Rules 조건이 서로 맞나요?
- [ ] listener registration을 소유자가 제거하나요?
- [ ] local pending write와 server commit 완료를 구분하나요?
- [ ] 여러 쓰기의 atomicity가 필요하면 batch 또는 transaction을 사용하나요?

## 면접에서 이어질 수 있는 질문

### `DocumentSnapshot`과 `QuerySnapshot`은 무엇이 다른가요?

`DocumentSnapshot`은 한 document의 데이터와 존재 여부를, `QuerySnapshot`은 query 결과인 여러 document와 변경 목록을 담습니다.

### listener에서 값이 보이면 server에 저장이 끝난 건가요?

항상 그렇지는 않아요. latency compensation으로 local write가 먼저 보일 수 있습니다. `hasPendingWrites` metadata나 write completion을 사용해 server commit 여부를 구분해야 해요.

### Firestore Rules가 금지된 document를 자동으로 제외하나요?

아니요. Rules는 filter가 아니라 query 전체를 허용하거나 거절해요. query가 반환할 수 있는 모든 document가 Rules 조건을 만족하도록 query constraint를 설계해야 합니다.

## 참고 자료

- [Cloud Firestore 시작하기](https://firebase.google.com/docs/firestore/quickstart)
- [Firestore 데이터 추가하기](https://firebase.google.com/docs/firestore/manage-data/add-data)
- [Firestore에서 데이터 가져오기](https://firebase.google.com/docs/firestore/query-data/get-data)
- [Firestore 실시간 update 수신](https://firebase.google.com/docs/firestore/query-data/listen)
- [Swift Codable로 Firestore 데이터 mapping](https://firebase.google.com/docs/firestore/solutions/swift-codable-data-mapping)
- [`DocumentReference` API Reference](https://firebase.google.com/docs/reference/swift/firebasefirestore/api/reference/Classes/DocumentReference)
- [Cloud Firestore query 보안](https://firebase.google.com/docs/firestore/security/rules-query)
