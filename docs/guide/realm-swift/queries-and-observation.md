---
title: Realm 쿼리와 변경 관찰
description: Results의 lazy·live 특성, 타입 안전 where와 정렬을 이해하고 NotificationToken, UIKit batch update, SwiftUI property wrapper로 변경을 반영합니다.
pageType: doc-wide
outline: false
---

# Realm 쿼리와 변경 관찰

> 면접용 한 줄 요약: **Realm의 `Results`는 query 결과를 복사한 배열이 아니라 조건을 유지한 live collection이며, observation은 초기 결과와 삭제·삽입·수정 index를 전달해 UI를 증분 갱신합니다.**

## 먼저 `Results`의 정체를 이해해요

```swift
let realm = try Realm()

let readingBooks = realm.objects(Book.self).where {
  $0.status == .reading
}
```

`readingBooks`는 query를 실행한 순간의 `[Book]` snapshot이 아닙니다.

- query는 필요할 때 평가되며 result 전체를 즉시 Swift array로 복사하지 않아요.
- 같은 executor에서 Realm이 최신 version으로 이동하면 결과도 자동으로 갱신돼요.
- `Results` 안의 element도 managed live object예요.
- 정렬하지 않으면 business상 의미 있는 순서를 보장한다고 가정하면 안 돼요.

```text
조건: status == reading
          │
Realm v1 ─┼─> [A, B]
          │ write: C.status = reading
Realm v2 ─┴─> [A, B, C]  같은 Results가 새 상태를 표시
```

`Array(readingBooks)`로 바꿔도 배열 구조만 복사할 뿐 내부 `Book` reference는 여전히 managed object입니다. actor 경계나 영구 snapshot이 필요하면 원하는 scalar를 별도 `Sendable` struct로 복사하세요.

## 타입 안전 `where`로 query해요

```swift
func searchBooks(
  in realm: Realm,
  keyword: String,
  minimumProgress: Int
) -> Results<Book> {
  realm.objects(Book.self)
    .where {
      $0.title.contains(keyword, options: .caseInsensitive) &&
        $0.progress >= minimumProgress &&
        $0.status != .finished
    }
    .sorted(byKeyPath: "updatedAt", ascending: false)
}
```

Swift query API는 property와 비교 값의 type을 compiler가 검사할 수 있다는 장점이 있습니다. 문자열 기반 predicate도 지원하지만, 새 코드는 표현 가능한 범위에서 `where`를 먼저 사용하세요.

```swift
let legacyStyle = realm.objects(Book.self).filter(
  "title CONTAINS[c] %@ AND progress >= %d",
  keyword,
  minimumProgress
)
```

문자열 predicate는 복잡한 기존 `NSPredicate`를 옮기기 쉽지만 오타와 property rename을 compile time에 잡기 어렵습니다. 사용자 입력을 query format 문자열 자체에 직접 이어 붙이지 말고 placeholder argument로 전달해요.

## filter와 sort의 책임을 분리해요

```swift
let recentReadingBooks = realm.objects(Book.self)
  .where {
    $0.status == .reading && $0.progress.between(1...99)
  }
  .sorted(by: [
    SortDescriptor(keyPath: "updatedAt", ascending: false),
    SortDescriptor(keyPath: "title", ascending: true)
  ])
```

| 연산       | 질문                                   | 예시                              |
| ---------- | -------------------------------------- | --------------------------------- |
| filter     | 어떤 객체를 포함할까요?                | 읽는 중이고 진도가 1~99인가?      |
| sort       | 포함된 객체를 어떤 순서로 보여 줄까요? | 최근 수정 순, 같은 날짜면 제목 순 |
| projection | 어떤 field만 화면 모델로 옮길까요?     | id, 제목, 진도만 DTO로 변환       |

검색 화면에서 query text가 바뀔 때마다 Realm 전체를 `[Book]`으로 복사한 뒤 Swift `filter`를 돌리기보다 Realm query로 조건을 내려보내세요. 다만 짧은 목록의 UI-only 후처리는 가독성과 측정 결과에 따라 Swift collection 연산을 사용할 수 있습니다.

## live result가 snapshot과 다른 순간을 확인해요

```swift
let results = realm.objects(Book.self).where {
  $0.status == .reading
}

let countBeforeWrite = results.count

let book = Book()
book.title = "Realm Internals"
book.status = .reading

try realm.write {
  realm.add(book)
}

let countAfterWrite = results.count
print(countBeforeWrite, countAfterWrite)
```

같은 executor에서 실행한 local write는 같은 Realm과 result에 반영됩니다. 다른 executor나 process의 변경은 해당 Realm이 refresh되거나 run loop를 통해 auto-refresh된 뒤 보입니다. “database file이 바뀌었다”와 “이 Realm instance가 그 version으로 이동했다”를 구분하세요.

## `NotificationToken`으로 collection 변경을 관찰해요

```swift
final class ReadingBooksObserver {
  private let results: Results<Book>
  private var token: NotificationToken?

  init(realm: Realm) {
    results = realm.objects(Book.self)
      .where { $0.status == .reading }
      .sorted(byKeyPath: "updatedAt", ascending: false)
  }

  func start(onChange: @escaping () -> Void) {
    token = results.observe { change in
      switch change {
      case .initial:
        onChange()

      case .update(
        _,
        let deletions,
        let insertions,
        let modifications
      ):
        print("삭제: \(deletions)")
        print("삽입: \(insertions)")
        print("수정: \(modifications)")
        onChange()

      case .error(let error):
        assertionFailure("Realm observation error: \(error)")
      }
    }
  }

  func stop() {
    token?.invalidate()
    token = nil
  }

  deinit {
    token?.invalidate()
  }
}
```

token을 local variable로만 만들고 함수가 끝나게 두면 관찰도 끝날 수 있어요. feature·view model·view controller처럼 관찰 책임을 가진 객체가 token을 강하게 보관하고, 수명이 끝날 때 `invalidate()`합니다.

### 전체 Realm, collection, object 관찰은 정보량이 달라요

| 관찰 대상         | 전달 정보                         | 적합한 경우                       |
| ----------------- | --------------------------------- | --------------------------------- |
| `realm.observe`   | Realm에 write가 commit됐다는 사실 | 전체 cache 무효화 같은 넓은 신호  |
| `results.observe` | initial, 삭제·삽입·수정 index     | 목록을 증분 갱신할 때             |
| `object.observe`  | 변경된 property 또는 삭제         | 상세 화면의 특정 객체를 추적할 때 |

필요보다 넓은 범위를 관찰하면 관련 없는 write에도 UI 작업이 발생합니다. object·collection observation에는 `keyPaths`를 지정해 관심 property만 좁힐 수도 있어요.

## UIKit 목록은 diff index를 순서대로 적용해요

```swift
import RealmSwift
import UIKit

final class ReadingBooksViewController: UITableViewController {
  private let realm = try! Realm()
  private lazy var books = realm.objects(Book.self)
    .where { $0.status == .reading }
    .sorted(byKeyPath: "updatedAt", ascending: false)
  private var token: NotificationToken?

  override func viewDidLoad() {
    super.viewDidLoad()

    token = books.observe { [weak self] changes in
      guard let self else { return }

      switch changes {
      case .initial:
        tableView.reloadData()

      case .update(_, let deletions, let insertions, let modifications):
        tableView.performBatchUpdates {
          tableView.deleteRows(
            at: deletions.map { IndexPath(row: $0, section: 0) },
            with: .automatic
          )
          tableView.insertRows(
            at: insertions.map { IndexPath(row: $0, section: 0) },
            with: .automatic
          )
          tableView.reloadRows(
            at: modifications.map { IndexPath(row: $0, section: 0) },
            with: .automatic
          )
        }

      case .error(let error):
        assertionFailure(error.localizedDescription)
      }
    }
  }

  override func tableView(
    _ tableView: UITableView,
    numberOfRowsInSection section: Int
  ) -> Int {
    books.count
  }

  override func tableView(
    _ tableView: UITableView,
    cellForRowAt indexPath: IndexPath
  ) -> UITableViewCell {
    let cell = tableView.dequeueReusableCell(
      withIdentifier: "BookCell",
      for: indexPath
    )
    let book = books[indexPath.row]
    var content = cell.defaultContentConfiguration()
    content.text = book.title
    content.secondaryText = "\(book.progress)%"
    cell.contentConfiguration = content
    return cell
  }
}
```

Realm 공식 가이드는 collection change를 **삭제 → 삽입 → 수정** 순서로 적용하라고 안내합니다. index는 이전 notification과 이번 notification 사이의 변화에 맞춰 계산되므로, 별도 array를 다른 순서로 먼저 바꾸거나 callback 밖의 오래된 index와 섞지 마세요.

고빈도 변경에서는 모든 notification마다 복잡한 animation을 실행하면 UI update가 밀릴 수 있습니다. update 빈도, batch 크기와 main thread 시간을 Instruments로 측정하고 필요하면 표시 주기를 조절하거나 snapshot UI 계층을 둡니다.

## SwiftUI에서는 `@ObservedResults`로 시작해요

```swift
import RealmSwift
import SwiftUI

struct ReadingBooksView: View {
  @ObservedResults(
    Book.self,
    where: { $0.status == .reading },
    sortDescriptor: SortDescriptor(
      keyPath: "updatedAt",
      ascending: false
    )
  ) private var books

  var body: some View {
    List {
      ForEach(books, id: \.id) { book in
        VStack(alignment: .leading) {
          Text(book.title)
          ProgressView(value: Double(book.progress), total: 100)
        }
      }
      .onDelete(perform: $books.remove)
    }
    .toolbar {
      Button("책 추가", action: addBook)
    }
  }

  private func addBook() {
    let book = Book()
    book.title = "새 책"
    book.status = .reading
    $books.append(book)
  }
}
```

`@ObservedResults`는 query 결과 변경을 View invalidation과 연결하고 projected collection인 `$books`로 append·remove write를 편리하게 수행합니다. 간결하다는 이유로 모든 business rule을 View에 넣지는 마세요. 검증, 여러 object의 원자적 변경, 서버 outbox 기록처럼 하나의 operation으로 묶여야 하는 작업은 store나 actor의 method로 모읍니다.

상세 화면에서 하나의 managed object를 수정해야 하면 `@ObservedRealmObject`를 사용할 수 있습니다. 다만 navigation path나 actor 경계를 Realm 객체 reference 자체로 채우기보다 primary key를 전달하고 목적지에서 query하는 방식이 삭제·executor 문제를 줄여요.

## notification과 write의 순환을 피하세요

```text
write
  └─> notification
         └─> 같은 값을 다시 write
                └─> notification ...
```

callback에서 받은 값을 그대로 다시 저장하면 불필요한 notification loop가 생길 수 있습니다.

- 새 값이 기존 값과 실제로 다른지 먼저 검사해요.
- UI에서 이미 반영한 write라면 `write(withoutNotifying:)`의 적용 가능성을 검토해요.
- 복잡한 derived field는 notification callback보다 명시적인 domain operation에서 함께 갱신해요.
- callback 안에서 nested write를 시작하지 않도록 write 책임을 분리해요.

## query와 관찰 체크리스트

- [ ] 결과 순서가 중요할 때 명시적으로 sort했나요?
- [ ] 문자열 predicate에 사용자 문자열을 직접 이어 붙이지 않나요?
- [ ] `Results`와 element가 live managed object임을 고려했나요?
- [ ] observation 범위를 Realm보다 collection·object·key path로 좁힐 수 있나요?
- [ ] token을 관찰 책임 객체가 유지하고 종료 시 invalidate하나요?
- [ ] UIKit에서 삭제 → 삽입 → 수정 순서로 batch update하나요?
- [ ] 고빈도 update의 main thread 비용을 실제 기기에서 측정했나요?

## 면접에서 이어질 수 있는 질문

### `Results`와 `[Object]`는 어떻게 다른가요?

`Results`는 Realm query를 표현하는 lazy·live collection이며 Realm이 새 version으로 이동하면 조건에 맞는 내용도 갱신됩니다. Swift array는 container의 element 구성을 복사하지만, `Array(results)`의 element가 managed Realm object라면 object 값까지 immutable snapshot이 되는 것은 아닙니다.

### collection notification의 index로 무엇을 할 수 있나요?

이전 결과와 새 결과 사이에 삭제·삽입·수정된 위치를 알 수 있어 `UITableView`와 `UICollectionView`를 전체 `reloadData()` 대신 batch update할 수 있습니다. Realm이 안내하는 삭제, 삽입, 수정 순서를 지키고 동일한 observed result를 data source로 사용해야 해요.

## 참고 자료

- [Realm 데이터 읽기 공식 가이드](https://github.com/realm/realm-swift/blob/community/docs/guides/crud/read.md)
- [Realm filter 공식 가이드](https://github.com/realm/realm-swift/blob/community/docs/guides/crud/filter-data.md)
- [Realm 변경 관찰 공식 가이드](https://github.com/realm/realm-swift/blob/community/docs/guides/crud/react-to-changes.md)
- [Realm SwiftUI 공식 가이드](https://github.com/realm/realm-swift/blob/community/docs/guides/swiftui.md)
- [`Results` API source](https://github.com/realm/realm-swift/blob/community/RealmSwift/Results.swift)
- [`RealmSwift.swiftUI` API source](https://github.com/realm/realm-swift/blob/community/RealmSwift/SwiftUI.swift)
