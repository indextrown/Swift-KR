---
title: Swift로 시작하는 Realm 데이터베이스
description: Realm Swift의 현재 지원 범위를 확인하고 설치, 객체 모델, 로컬 파일, 쓰기 트랜잭션과 첫 CRUD까지 단계적으로 시작합니다.
pageType: doc-wide
outline: false
---

# Swift로 시작하는 Realm 데이터베이스

> 면접용 한 줄 요약: **Realm Swift는 Swift 객체 모델을 기기 안의 Realm 파일에 직접 저장하고, 쿼리 결과와 객체의 변경을 실시간으로 관찰할 수 있는 오픈 소스 객체 데이터베이스입니다.**

Realm은 서버 데이터베이스의 Swift 클라이언트가 아니라 앱 프로세스 안에서 실행되는 **로컬 데이터베이스**예요. `Object`를 상속한 모델과 `@Persisted` 속성을 스키마로 사용하고, `Realm` 인스턴스가 파일·트랜잭션·쿼리의 경계가 됩니다.

```text
SwiftUI / UIKit
      │
      ├─ Object + @Persisted ── 객체 스키마
      ├─ Results + observe ──── live query와 변경 알림
      └─ Realm.write ────────── 원자적인 쓰기 트랜잭션
                    │
                    ▼
              로컬 .realm 파일
```

## 가장 먼저 현재 지원 범위를 확인해요

:::warning Realm Swift v20은 로컬 데이터베이스 전용이에요
Realm Swift [`v20.0.0`](https://github.com/realm/realm-swift/releases/tag/v20.0.0)부터 Atlas App Services와 Atlas Device Sync API가 모두 제거됐습니다. MongoDB의 [Atlas Device SDK 종료 안내](https://www.mongodb.com/docs/atlas/device-sdks/deprecation/)에 따르면 Device Sync는 2025년 9월 30일 종료됐지만, 기기 안에서 동작하는 Realm 데이터베이스는 오픈 소스 프로젝트로 남았습니다.

이 섹션의 코드는 현재 `community` 브랜치와 `v20` 로컬 API를 기준으로 합니다. `App`, `Credentials`, `User`, `flexibleSyncConfiguration`을 사용하는 예전 Sync 코드는 현재 Realm 시작 예제로 사용하지 않아요.
:::

Realm Swift 저장소의 기본 브랜치는 현재 [`community`](https://github.com/realm/realm-swift/tree/community)입니다. [`v20.0.4` 릴리스](https://github.com/realm/realm-swift/releases/tag/v20.0.4)는 Realm이 더 이상 MongoDB가 공식 배포하는 제품이 아니며 사전 빌드 binary도 code signing되지 않는다고 알립니다. 새 제품에 도입할 때는 기능만 보지 말고 최근 release, 보안 수정, 지원 Xcode 범위와 팀의 유지보수 계획도 함께 평가하세요.

## 먼저 알아둘 용어

| 용어               | 의미                                                                               |
| ------------------ | ---------------------------------------------------------------------------------- |
| Realm              | `Realm.Configuration`에 따라 하나의 로컬 Realm 파일을 여는 접근 객체예요.          |
| Realm file         | 객체와 스키마가 저장되는 `.realm` 파일이에요. 보조 파일도 함께 생성될 수 있습니다. |
| Object             | Realm이 관리할 수 있는 참조 타입 모델의 기반 클래스예요.                           |
| `@Persisted`       | 속성을 Realm 스키마에 포함시키는 property wrapper예요.                             |
| managed object     | Realm에 추가되어 특정 Realm·executor의 생명주기에 연결된 객체예요.                 |
| unmanaged object   | 아직 Realm에 추가하지 않은 일반 Swift 객체 상태예요.                               |
| write transaction  | 여러 변경을 전부 반영하거나 전부 취소하는 원자적 쓰기 경계예요.                    |
| `Results<Element>` | 쿼리 조건을 표현하고 Realm 변경에 따라 자동 갱신되는 collection이에요.             |
| notification token | 변경 관찰의 수명을 나타내며 유지하지 않으면 관찰이 중단되는 token이에요.           |
| schema version     | 앱의 객체 모델 구조가 몇 번째 상태인지 나타내는 증가하는 정수예요.                 |

## 다른 저장 방식과 무엇이 다른가요?

| 선택지         | 잘 맞는 데이터                                     | 특징                                                            |
| -------------- | -------------------------------------------------- | --------------------------------------------------------------- |
| `UserDefaults` | 테마, 정렬 방식 같은 작은 설정값                   | key-value 설정 저장소이며 대량 객체 검색용이 아니에요.          |
| 파일·`Codable` | 문서, export 파일, 한 덩어리 JSON                  | 형식과 읽기·쓰기 시점을 직접 관리해요.                          |
| SwiftData      | Apple 플랫폼의 객체 그래프와 SwiftUI 앱            | 시스템 프레임워크이며 iOS 17 이상을 중심으로 설계돼요.          |
| Core Data      | 복잡한 객체 그래프와 Apple 생태계의 오랜 운영 자산 | 변경 추적·migration·persistent store를 세밀하게 제어해요.       |
| SQLite         | SQL과 table·index를 직접 통제할 관계형 데이터      | 가장 낮은 계층의 제어가 가능하지만 mapping 코드가 늘 수 있어요. |
| Realm Swift    | 객체 모델, 오프라인 저장, live query가 중요한 앱   | 외부 package이며 객체 API와 변경 알림을 기본 제공해요.          |

Realm은 “서버 동기화가 필요해서”가 아니라 **로컬 객체 저장과 반응형 변경 관찰이 요구 사항에 맞을 때** 선택합니다. Apple 전용 신제품이라면 SwiftData도 함께 prototype하고, 장기 유지보수와 dependency 위험까지 비교하세요.

## 1단계: Swift Package Manager로 설치해요

Xcode에서 **File > Add Package Dependencies**를 열고 공식 저장소 URL을 입력합니다.

```text
https://github.com/realm/realm-swift
```

Swift 앱 target에는 `RealmSwift` product만 연결하세요. `Realm`은 Objective-C API product이므로 Swift target에서 두 product를 동시에 직접 연결할 필요가 없습니다.

```swift
import RealmSwift
```

새 프로젝트라면 `v20` release 범위를 선택하고, 선택한 tag의 Xcode·OS 호환 범위는 [Realm Swift Releases](https://github.com/realm/realm-swift/releases)와 `Package.swift`에서 확인합니다. 기존 Sync 앱은 version을 올리기 전에 [Atlas Device Sync 종료와 전환](/guide/realm-swift/atlas-device-sync-eol)을 먼저 읽어야 해요.

## 2단계: 첫 객체 모델을 정의해요

```swift
import Foundation
import RealmSwift

enum ReadingStatus: String, PersistableEnum {
  case unread
  case reading
  case finished
}

final class Book: Object {
  @Persisted(primaryKey: true) var id: ObjectId
  @Persisted(indexed: true) var title = ""
  @Persisted var authorName = ""
  @Persisted var status = ReadingStatus.unread
  @Persisted var progress = 0
  @Persisted var updatedAt = Date()
}
```

- 클래스 이름은 Realm table에 대응합니다.
- `@Persisted`를 붙인 속성만 파일에 저장돼요.
- 기본 키는 객체를 빠르게 찾고 upsert하는 식별자이며 한 모델에 하나만 둘 수 있습니다.
- index는 동등 비교가 잦은 속도의 읽기를 개선하지만 쓰기 비용과 파일 크기를 늘려요.
- `PersistableEnum`은 Realm이 지원하는 raw type을 가진 enum을 저장하게 해요.

## 3단계: Realm을 열고 한 번의 흐름을 실행해요

```swift
import RealmSwift

func runFirstRealmExample() throws {
  let realm = try Realm()

  let book = Book()
  book.title = "The Swift Programming Language"
  book.authorName = "Apple"

  try realm.write {
    realm.add(book)
  }

  let readingBooks = realm.objects(Book.self).where {
    $0.status == .reading
  }

  try realm.write {
    book.status = .reading
    book.progress = 20
    book.updatedAt = Date()
  }

  print("읽는 중인 책: \(readingBooks.count)권")
}
```

여기서 중요한 순서는 다음과 같아요.

```text
unmanaged Book 생성
      │ realm.add(book)
      ▼
managed Book ──> write 안에서만 변경 ──> Results가 자동 갱신
```

`book`은 `realm.add(book)` 이후 managed object가 됩니다. 그 뒤 persisted 속성을 `write` 밖에서 바꾸면 예외가 발생해요. 반대로 `Results`는 한 번 복사한 배열이 아니라 Realm의 현재 상태를 보여 주는 live collection이라, `book.status`를 바꾼 뒤 `readingBooks.count`도 갱신됩니다.

:::tip 실제 앱에서는 `try!`를 기본값으로 두지 않아요
공식 quick start는 흐름을 짧게 보여 주려고 `try!`를 사용하지만, 파일 열기·migration·write는 실패할 수 있습니다. 앱 경계에서는 `throws`, `do-catch`, 오류 화면과 복구 정책을 사용하세요.
:::

## Realm 파일은 어디에 있나요?

기본 Realm의 위치는 configuration에서 확인합니다.

```swift
let configuration = Realm.Configuration.defaultConfiguration
print(configuration.fileURL?.path ?? "in-memory Realm")
```

경로 문자열을 코드에 고정하지 마세요. Realm은 `.realm` 본 파일 외에도 lock과 관리용 보조 파일을 만들 수 있으므로 backup·삭제·App Group 공유를 설계할 때는 파일 하나만 임의로 이동하지 않습니다. 파일 위치, 암호화와 migration은 [구성·마이그레이션·보안](/guide/realm-swift/configuration-migration-and-security)에서 자세히 다룹니다.

## 다섯 페이지를 이 순서로 읽어요

1. 이 페이지에서 Realm의 현재 범위와 첫 저장을 확인해요.
2. [데이터 모델과 CRUD](/guide/realm-swift/models-and-crud)에서 관계, managed 객체와 transaction을 연결해요.
3. [쿼리와 변경 관찰](/guide/realm-swift/queries-and-observation)에서 live `Results`, UIKit batch update와 SwiftUI wrapper를 배워요.
4. [구성·마이그레이션·보안](/guide/realm-swift/configuration-migration-and-security)에서 파일, schema version, 암호화, 테스트와 actor 경계를 운영 수준으로 정리해요.
5. [Atlas Device Sync 종료와 전환](/guide/realm-swift/atlas-device-sync-eol)에서 예전 MongoDB SDK 문서와 현재 로컬 Realm을 구분해요.

## 도입 전 체크리스트

- [ ] Realm을 로컬 데이터베이스로 선택한 이유를 SwiftData·Core Data와 비교했나요?
- [ ] `v20`에는 Atlas App Services와 Device Sync가 없다는 점을 확인했나요?
- [ ] 지원 Xcode·OS와 최근 release·보안 유지보수 상태를 확인했나요?
- [ ] Realm 객체가 UI와 domain 전체로 무제한 퍼지지 않도록 계층 경계를 정했나요?
- [ ] schema migration과 암호화 key 복구 정책을 출시 전에 테스트했나요?
- [ ] listener와 Realm 인스턴스의 수명을 화면·feature 수명에 맞췄나요?

## 면접에서 이어질 수 있는 질문

### Realm은 ORM인가요?

Realm은 SQLite 위에 얹는 ORM이 아니라 자체 storage engine과 파일 형식을 가진 객체 데이터베이스입니다. Swift 객체처럼 보이는 API를 제공하지만 managed object는 일반 값 타입이 아니라 Realm의 현재 데이터와 연결된 live proxy에 가깝습니다.

### Realm을 쓰면 서버와 자동으로 동기화되나요?

아니요. 현재 Realm Swift `v20`은 로컬 데이터베이스 기능만 제공합니다. 과거의 Atlas Device Sync는 종료됐고 API도 제거됐으므로, 서버 동기화가 필요하면 별도의 backend·인증·충돌 해결 방식을 설계해야 합니다.

## 참고 자료

- [Realm Swift 공식 저장소](https://github.com/realm/realm-swift)
- [Realm Swift community 브랜치](https://github.com/realm/realm-swift/tree/community)
- [Realm Swift Quick Start](https://github.com/realm/realm-swift/blob/community/docs/guides/quick-start.md)
- [Realm Swift Releases](https://github.com/realm/realm-swift/releases)
- [MongoDB Atlas Device SDK for Swift 문서](https://www.mongodb.com/ko-kr/docs/atlas/device-sdks/sdk/swift/)
- [MongoDB Atlas Device SDK 종료 안내](https://www.mongodb.com/docs/atlas/device-sdks/deprecation/)
