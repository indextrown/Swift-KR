---
title: iCloud key-value storage와 CloudKit 이해하기
description: NSUbiquitousKeyValueStore, CloudKit container와 database scope, CKRecord CRUD, 계정·오프라인·충돌 처리, SwiftData 동기화를 비교해 설명합니다.
pageType: doc-wide
outline: false
---

# iCloud key-value storage와 CloudKit 이해하기

> **면접 답변 한 줄 요약:** iCloud key-value storage는 같은 사용자의 기기 사이에서 작은 비민감 설정을 동기화하고, CloudKit은 container 안의 public·private·shared database에 구조화된 record를 저장·공유하며, 둘 다 로컬 저장 성공과 cloud 반영 시점을 분리해서 설계해야 해요.

App Group을 설정한 뒤 iPhone에서 쓴 값이 iPad에도 나타날 거라고 기대할 수 있어요. 하지만 App Group은 **같은 기기에서 앱과 extension이 공유하는 sandbox 예외**예요. 기기 사이에 데이터를 보내지는 않아요.

Apple 플랫폼에서 iCloud를 사용한 데이터 기능은 목적에 따라 나뉘어요.

- 작은 설정과 진행 위치를 key-value로 동기화해요.
- 구조화된 model과 record를 query하고 공유해요.
- 사용자의 document와 file을 기기 사이에 동기화해요.
- local SwiftData model을 CloudKit과 자동 동기화해요.

“iCloud에 저장한다”만으로는 어떤 일관성과 공유 정책을 원하는지 알 수 없어요. API별 경계를 먼저 구분해야 해요.

## 먼저 알아둘 iCloud와 CloudKit 용어

| 용어                        | 쉬운 뜻                                                                                                          |
| --------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| iCloud container            | 앱이 iCloud service를 사용할 때 data와 권한을 격리하는 namespace예요.                                            |
| CloudKit container          | CloudKit schema와 public·private·shared database를 묶고 server 요청을 중재하는 범위예요.                         |
| database scope              | record가 모든 사용자, 현재 사용자, 초대받은 사용자 중 누구에게 보이는지 정하는 public·private·shared 구분이에요. |
| record                      | CloudKit의 기본 저장 단위예요. record type, record ID와 key-value field로 구성돼요.                              |
| record type                 | 같은 field 구조와 의미를 가진 record의 종류예요. database의 schema를 이루어요.                                   |
| record zone                 | 관련 record를 나누어 관리하고 변경을 추적하는 database partition이에요.                                          |
| asset                       | 큰 file을 CloudKit record field에 연결하는 `CKAsset`이에요.                                                      |
| subscription                | query나 database 변경이 생겼을 때 app이 notification을 받을 수 있게 등록하는 객체예요.                           |
| development environment     | schema를 실험하고 바꿀 수 있는 CloudKit 개발 환경이에요.                                                         |
| production environment      | App Store 사용자에게 제공하는 CloudKit 환경이에요. 배포한 schema는 additive change 중심으로 관리해요.            |
| eventual consistency        | local과 cloud, 여러 기기가 즉시 같지 않을 수 있지만 변경 전달과 병합을 거쳐 같은 상태로 수렴하는 성질이에요.     |
| `NSUbiquitousKeyValueStore` | 같은 Apple 계정의 app instance 사이에서 작은 key-value를 동기화하는 iCloud 저장소예요.                           |

## iCloud 저장 기술을 먼저 비교해요

| 기술                         | 적합한 데이터                        | 앱이 제어하는 수준                        | 대표 제약과 특징                                |
| ---------------------------- | ------------------------------------ | ----------------------------------------- | ----------------------------------------------- |
| `NSUbiquitousKeyValueStore`  | 읽던 page, theme 같은 작은 비민감 값 | key-value 읽기·쓰기와 외부 변경 관찰      | 1,024 keys, 모든 value 합계 1 MB                |
| CloudKit API                 | record, 관계, 공유, server query     | database·zone·record·충돌을 세밀하게 제어 | account·network·quota·schema를 직접 처리        |
| SwiftData + CloudKit         | local-first 구조화 model             | SwiftData model 중심, sync는 framework    | CloudKit-compatible schema와 capability 필요    |
| iCloud Documents             | document, image 같은 file            | ubiquity container의 file 선택            | file coordination과 download 상태 고려          |
| iCloud Backup                | 기기 복원을 위한 app data snapshot   | backup 제외 여부                          | live sync가 아니며 변경 병합 API가 아님         |
| synchronizable Keychain item | 여러 기기에서 필요한 작은 credential | item attribute와 accessibility            | iCloud Keychain 기능이며 CloudKit record가 아님 |

## NSUbiquitousKeyValueStore는 cloud UserDefaults가 아니에요

`NSUbiquitousKeyValueStore`도 key-value API이지만 `UserDefaults.standard`와 저장 위치와 동기화 방식이 달라요.

```text
UserDefaults.standard
└─ 현재 app의 local preferences domain

UserDefaults(suiteName: App Group)
└─ 같은 device의 관련 target이 공유하는 preferences domain

NSUbiquitousKeyValueStore.default
└─ 같은 Apple 계정의 여러 device에 전달되는 iCloud key-value store
```

Apple의 [`NSUbiquitousKeyValueStore`](https://developer.apple.com/documentation/foundation/nsubiquitouskeyvaluestore) 문서는 설정, 구성 정보, app-specific data를 같은 사용자의 기기 사이에 전달하는 용도로 설명해요.

### 작은 진행 위치를 저장해요

```swift
import Foundation

enum CloudPreferenceKey {
  static let currentBookID = "reading.currentBookID"
  static let currentPage = "reading.currentPage"
}

struct CloudReadingPosition {
  private let store: NSUbiquitousKeyValueStore

  init(store: NSUbiquitousKeyValueStore = .default) {
    self.store = store
  }

  func save(bookID: UUID, page: Int) {
    store.set(
      bookID.uuidString,
      forKey: CloudPreferenceKey.currentBookID
    )
    store.set(
      max(page, 0),
      forKey: CloudPreferenceKey.currentPage
    )
  }

  func load() -> (bookID: UUID, page: Int)? {
    guard
      let rawID = store.string(
        forKey: CloudPreferenceKey.currentBookID
      ),
      let bookID = UUID(uuidString: rawID)
    else {
      return nil
    }

    return (
      bookID,
      Int(store.longLong(
        forKey: CloudPreferenceKey.currentPage
      ))
    )
  }
}
```

저장 직후 다른 기기에 즉시 도착한다고 가정하지 않아요. 현재 기기의 local 표현이 바뀐 뒤 system이 적절한 시점에 iCloud와 변경을 주고받아요.

### 외부 변경 notification을 관찰해요

다른 기기나 iCloud에서 값이 들어오면 `didChangeExternallyNotification`이 게시돼요.

```swift
import Foundation

final class CloudPreferenceObserver {
  private let store: NSUbiquitousKeyValueStore
  private var token: NSObjectProtocol?

  init(store: NSUbiquitousKeyValueStore = .default) {
    self.store = store

    token = NotificationCenter.default.addObserver(
      forName: NSUbiquitousKeyValueStore
        .didChangeExternallyNotification,
      object: store,
      queue: .main
    ) { notification in
      let changedKeys = notification.userInfo?[
        NSUbiquitousKeyValueStoreChangedKeysKey
      ] as? [String] ?? []

      if changedKeys.contains(CloudPreferenceKey.currentPage) {
        // 화면 상태를 store의 최신 값으로 갱신해요.
      }
    }

    store.synchronize()
  }

  deinit {
    if let token {
      NotificationCenter.default.removeObserver(token)
    }
  }
}
```

`UserDefaults.synchronize()`는 사용하지 않지만 이름이 같은 `NSUbiquitousKeyValueStore.synchronize()`는 iCloud key-value store가 초기 값을 가져오도록 요청하는 별도 API예요. 둘을 같은 규칙으로 혼동하지 않아요.

notification의 change reason에는 server change, initial sync, quota violation, account change가 올 수 있어요. changed key만 다시 읽고 계정 전환 때 현재 사용자 상태를 재구성해요.

### quota와 보안 제약을 지켜요

Apple 공식 문서의 현재 제약은 다음과 같아요.

- key는 최대 1,024개예요.
- 모든 value를 합쳐 최대 1 MB예요.
- key 문자열은 UTF-16 기준 최대 128 characters예요.
- quota를 넘기면 write가 반영되지 않고 quota violation notification이 올 수 있어요.
- disk에 암호화되지 않은 형태로 저장될 수 있으므로 개인·민감 정보를 넣지 않아요.

큰 Codable model 하나를 `Data`로 넣어 한도를 우회하려 하지 않아요. 검색·관계·충돌 정책이 필요한 데이터라면 CloudKit이나 SwiftData sync가 맞아요.

## CloudKit은 container와 database로 범위를 나눠요

[`CKContainer`](https://developer.apple.com/documentation/cloudkit/ckcontainer)는 app이 사용할 CloudKit database로 들어가는 통로예요.

```text
CKContainer: iCloud.com.example.Reading
├─ public database
│  └─ 모든 app 사용자가 읽는 공개 record
├─ user A private database
│  └─ user A가 기본적으로 혼자 읽는 record
├─ user A shared database
│  └─ 다른 사용자가 user A에게 공유한 record
├─ user B private database
└─ user B shared database
```

한 CloudKit container의 database들은 schema를 공유하지만 record의 가시성과 quota 주체가 달라요.

## public, private, shared database를 구분해요

| database | 기본 가시성                                 | iCloud account 요구                                | 대표 사용                             |
| -------- | ------------------------------------------- | -------------------------------------------------- | ------------------------------------- |
| public   | app의 모든 사용자                           | 읽기는 계정 없이 가능, write는 active account 필요 | 공개 catalogue, app 전체 공개 content |
| private  | 현재 사용자가 기본적으로 혼자 접근          | 필요                                               | 개인 독서 기록, 개인 설정             |
| shared   | 다른 사용자가 현재 사용자에게 공유한 record | 필요                                               | 초대받은 공동 독서 목록               |

```swift
import CloudKit

let container = CKContainer.default()
let privateDatabase = container.privateCloudDatabase
let publicDatabase = container.publicCloudDatabase
let sharedDatabase = container.sharedCloudDatabase
```

private database data는 사용자의 iCloud quota에 포함돼요. public database data는 app container 소유자의 quota에 포함돼요. private property 이름이 “암호화된 비밀 저장소”를 뜻하는 것은 아니므로 password와 token은 Keychain을 사용해요.

## CKRecord로 구조화된 데이터를 저장해요

[`CKRecord`](https://developer.apple.com/documentation/cloudkit/ckrecord)는 record type과 field의 key-value로 구성돼요.

```swift
import CloudKit
import Foundation

struct CloudReadingRecord: Sendable {
  let id: CKRecord.ID
  let title: String
  let minutes: Int
  let readAt: Date
}

extension CloudReadingRecord {
  init(record: CKRecord) throws {
    guard
      let title = record["title"] as? String,
      let minutes = record["minutes"] as? NSNumber,
      let readAt = record["readAt"] as? Date
    else {
      throw CocoaError(.coderReadCorrupt)
    }

    self.init(
      id: record.recordID,
      title: title,
      minutes: minutes.intValue,
      readAt: readAt
    )
  }

  func makeRecord() -> CKRecord {
    let record = CKRecord(
      recordType: "ReadingRecord",
      recordID: id
    )
    record["title"] = title
    record["minutes"] = NSNumber(value: minutes)
    record["readAt"] = readAt
    return record
  }
}
```

CloudKit record field는 지원되는 type만 저장할 수 있어요. 큰 file은 `CKAsset`, 다른 record 연결은 `CKRecord.Reference`를 검토해요. domain model과 `CKRecord` 변환을 한곳에 두면 field 문자열과 optional 처리를 관리하기 쉬워요.

## async API로 Create와 Update를 수행해요

새 record ID를 만들고 private database에 저장해요.

```swift
func saveReading(
  title: String,
  minutes: Int,
  in database: CKDatabase
) async throws -> CloudReadingRecord {
  let value = CloudReadingRecord(
    id: CKRecord.ID(recordName: UUID().uuidString),
    title: title,
    minutes: minutes,
    readAt: .now
  )

  let savedRecord = try await database.save(
    value.makeRecord()
  )

  return try CloudReadingRecord(record: savedRecord)
}
```

`database.save`의 성공 결과에 server가 채운 metadata가 들어 있어요. 처음 만든 client record만 계속 보관하지 말고 반환된 record나 필요한 metadata를 반영해요.

기존 record를 update할 때는 server에서 가져온 record의 change tag가 conflict 감지에 사용돼요. 같은 record ID로 새 `CKRecord`를 무조건 만들면 server version 정보가 없어 원하는 save policy와 다르게 동작할 수 있어요.

```swift
func updateMinutes(
  recordID: CKRecord.ID,
  minutes: Int,
  in database: CKDatabase
) async throws -> CloudReadingRecord {
  let record = try await database.record(for: recordID)
  record["minutes"] = NSNumber(value: minutes)

  let savedRecord = try await database.save(record)
  return try CloudReadingRecord(record: savedRecord)
}
```

## record ID로 읽고 query로 검색해요

ID를 알고 있다면 한 record를 직접 가져와요.

```swift
func fetchReading(
  id: CKRecord.ID,
  from database: CKDatabase
) async throws -> CloudReadingRecord {
  let record = try await database.record(for: id)
  return try CloudReadingRecord(record: record)
}
```

조건 검색에는 `CKQuery`를 사용해요.

```swift
func recentReadings(
  from database: CKDatabase
) async throws -> [CloudReadingRecord] {
  let query = CKQuery(
    recordType: "ReadingRecord",
    predicate: NSPredicate(value: true)
  )
  query.sortDescriptors = [
    NSSortDescriptor(key: "readAt", ascending: false),
  ]

  let result = try await database.records(
    matching: query,
    resultsLimit: 50
  )

  return try result.matchResults.compactMap { _, item in
    let record = try item.get()
    return try CloudReadingRecord(record: record)
  }
}
```

CloudKit query를 사용하려면 production schema에서 해당 field가 queryable·sortable하도록 index를 구성해야 할 수 있어요. 결과가 많으면 cursor를 사용해 다음 page를 요청해야 해요. 첫 50개가 전체라고 가정하지 않아요.

## 삭제는 정확한 record ID로 수행해요

```swift
func deleteReading(
  id: CKRecord.ID,
  from database: CKDatabase
) async throws {
  _ = try await database.deleteRecord(withID: id)
}
```

여러 record를 지우는 operation에서는 일부만 성공하는 partial failure가 생길 수 있어요. “요청 전체가 실패했다”와 “일부 record만 실패했다”를 구분하고 각 record 결과를 확인해요.

## iCloud account 상태를 먼저 설명해요

private·shared database는 active iCloud account가 필요하고 public database도 write에는 account가 필요해요. `accountStatus`를 확인해 사용자가 해결할 수 있는 상태로 바꿔요.

```swift
import CloudKit

enum CloudAvailability {
  case available
  case signInRequired
  case restricted
  case temporarilyUnavailable
}

func cloudAvailability(
  container: CKContainer = .default()
) async throws -> CloudAvailability {
  switch try await container.accountStatus() {
  case .available:
    return .available
  case .noAccount:
    return .signInRequired
  case .restricted:
    return .restricted
  case .couldNotDetermine, .temporarilyUnavailable:
    return .temporarilyUnavailable
  @unknown default:
    return .temporarilyUnavailable
  }
}
```

계정이 없을 때 generic network error만 보여 주면 사용자가 해결 방법을 알기 어려워요. 로그인 필요, 보호자·기기 제한, 일시적 상태를 제품 문구로 mapping해요.

## offline과 retry를 정상 상태로 다뤄요

cloud 요청은 성공과 영구 실패만 있는 동기 함수가 아니에요. 다음 상태를 고려해야 해요.

- network가 없어 요청을 지금 보낼 수 없어요.
- server가 retry after 시간을 알려 줘요.
- quota가 부족해 write가 거절돼요.
- record가 server에서 이미 삭제됐어요.
- 여러 기기가 같은 record를 수정해 conflict가 발생해요.
- batch 안에서 일부 record만 실패해요.
- iCloud account가 바뀌었어요.

`CKError`의 code와 `retryAfterSeconds`를 확인하고 무한 즉시 retry를 피워요.

```swift
func retryDelay(for error: Error) -> TimeInterval? {
  guard let cloudError = error as? CKError else {
    return nil
  }

  return cloudError.retryAfterSeconds
}
```

사용자가 작성한 content를 network 요청 성공 전까지 memory에만 두면 앱 종료와 함께 사라질 수 있어요. 중요한 입력은 local SwiftData나 file outbox에 먼저 저장하고 `pending`, `synced`, `failed` 같은 상태를 관리하는 local-first 구조를 고려해요.

```text
사용자 편집
   │
   ▼
local store에 즉시 저장 ──▶ 화면은 local 상태 표시
   │ pending
   ▼
CloudKit upload
   ├─ 성공 ──▶ synced + server metadata 반영
   └─ 실패 ──▶ retry 가능 상태와 사용자 안내
```

## conflict는 business rule로 병합해요

CloudKit은 record의 change tag로 server version을 구분해요. 이미 바뀐 record를 이전 version 기준으로 저장하면 `serverRecordChanged` 오류가 발생할 수 있어요.

충돌 처리 전략은 데이터 의미에 따라 달라요.

- 마지막 수정 우선: 단순 설정에는 가능하지만 다른 기기 변경을 잃을 수 있어요.
- field별 병합: title과 progress처럼 독립적인 field를 각각 비교해요.
- append-only event: 독서 session을 덮어쓰지 않고 새 event로 추가해요.
- 사용자 선택: 자동 병합할 수 없는 긴 document는 두 version을 보여 줘요.

무조건 client record를 덮어쓰는 것은 충돌 해결이 아니라 server 변경을 버리는 정책이에요. `serverRecord`, `clientRecord`, ancestor record를 비교해 domain rule로 선택해요.

## development와 production schema를 구분해요

개발 중 새 record type과 field를 저장하면 development schema에 반영할 수 있어요. App Store 사용자에게 보이게 하려면 CloudKit Console에서 schema를 production으로 deploy해야 해요.

Apple의 [Designing and Creating a CloudKit Database](https://developer.apple.com/documentation/cloudkit/designing-and-creating-a-cloudkit-database)는 production 배포 뒤 schema 일부를 삭제할 수 없고 새 type이나 field를 추가하는 additive change만 가능하다고 안내해요.

release 전 다음을 확인해요.

- production에 필요한 record type과 field가 deploy됐나요?
- query와 sort에 필요한 index가 배포됐나요?
- development test data가 production에 있다고 가정하지 않나요?
- entitlement와 provisioning profile이 올바른 container와 environment를 가리키나요?
- old app version이 새 optional field가 있는 record를 읽을 수 있나요?

## SwiftData가 CloudKit 동기화를 맡을 수 있어요

직접 `CKRecord`를 만들지 않고 SwiftData model을 local store에 저장한 뒤 CloudKit과 자동 동기화할 수 있어요.

```swift
import SwiftData

let configuration = ModelConfiguration(
  cloudKitDatabase: .private("iCloud.com.example.Reading")
)

let container = try ModelContainer(
  for: ReadingRecord.self,
  configurations: configuration
)
```

Xcode에서 iCloud의 CloudKit capability와 Background Modes의 remote notifications를 구성해야 해요. SwiftData는 내부적으로 Core Data의 CloudKit integration을 사용해 변경을 동기화해요.

다음 경우에는 SwiftData 자동 sync가 잘 맞아요.

- 앱이 이미 SwiftData model을 local source of truth로 사용해요.
- 사용자 private data를 여러 기기에서 사용하고 싶어요.
- record operation의 timing과 save policy를 세밀하게 직접 제어할 필요가 적어요.

다음 경우에는 직접 CloudKit API를 검토해요.

- public·shared database를 명시적으로 다뤄야 해요.
- custom zone, subscription, share와 record operation을 세밀하게 제어해요.
- server record schema와 client cache를 별도 layer로 유지해요.
- 부분 실패와 conflict 병합을 product rule에 맞게 직접 구현해요.

SwiftData + CloudKit도 계정과 network를 무시할 수 있다는 뜻은 아니에요. local save와 sync 상태가 다를 수 있고 CloudKit-compatible schema 제약도 지켜야 해요. 자세한 내용은 [SwiftData](./swiftdata) 문서를 함께 봐요.

## App·Widget 공유와 기기 간 sync를 조합해요

Widget은 실행 시간이 짧고 CloudKit 요청 결과를 항상 기다릴 수 없어요. 본체 앱이 cloud data를 local store에 반영하고 App Group에 작은 snapshot을 쓰면 Widget이 빠르게 읽을 수 있어요.

```text
CloudKit
   │ sync
   ▼
App의 local SwiftData
   │ 필요한 값만 snapshot
   ▼
App Group file 또는 suite
   │ read
   ▼
Widget timeline
```

이 구조에서 각 기술의 책임은 달라요.

- CloudKit: 기기 사이 data 전달과 cloud database
- SwiftData: 앱의 local structured model
- App Group: 같은 기기의 App과 Widget 공유
- WidgetKit: 표시할 timeline snapshot 관리

## test 경계를 만들어요

CloudKit API를 직접 호출하는 code도 protocol 뒤로 감싸면 unit test에서 network와 account에 의존하지 않아요.

```swift
protocol ReadingCloudStore: Sendable {
  func save(
    title: String,
    minutes: Int
  ) async throws -> CloudReadingRecord

  func fetch(id: CKRecord.ID) async throws
    -> CloudReadingRecord
}
```

unit test에서는 memory fake로 성공, retryable error, conflict, account 없음 상태를 재현해요. 실제 CloudKit integration test는 development container의 test용 zone과 고유 record ID를 사용하고, production data를 삭제하는 cleanup을 실행하지 않아요.

`NSUbiquitousKeyValueStore`도 앱 전역 default instance에 직접 의존하는 code보다 initializer로 store를 주입하고, domain logic은 별도 in-memory key-value adapter에서 test하는 편이 좋아요.

## 자주 발생하는 실수

### App Group을 cloud sync로 생각해요

App Group은 같은 device의 관련 target이 shared container를 읽는 권한이에요. 다른 device로 전달하려면 iCloud 기술이 별도로 필요해요.

### NSUbiquitousKeyValueStore에 큰 model을 넣어요

1 MB 전체 quota와 1,024 key 제한이 있고 query·relationship·conflict API가 없어요. 작은 비민감 설정과 진행 위치에 사용해요.

### private database를 Keychain처럼 사용해요

private는 현재 사용자의 database scope를 뜻해요. password와 token storage에는 Keychain의 accessibility와 access control이 필요해요.

### local save 성공을 sync 완료로 표시해요

offline이나 server error로 cloud 반영이 지연될 수 있어요. 중요한 product라면 local state와 sync state를 구분해요.

### development에서 만든 schema가 자동으로 production에 있다고 생각해요

production deployment와 index를 release 전에 확인해야 해요. 배포한 schema는 삭제·변경이 제한되므로 진화 전략도 필요해요.

## 적용 체크리스트

- 같은 device의 target 공유인지 여러 device sync인지 먼저 구분했나요?
- 작은 key-value, structured record, model sync, file 중 목적에 맞는 iCloud 기술을 골랐나요?
- public·private·shared database의 가시성과 quota 주체를 이해했나요?
- iCloud account가 없거나 바뀌는 상태를 사용자에게 설명하나요?
- offline 입력을 local에 보존하고 retry 상태를 관리하나요?
- `CKError`, retry-after, partial failure와 conflict 전략이 있나요?
- query·sort index와 pagination을 처리하나요?
- development schema를 production에 deploy했나요?
- 민감 정보를 NSUbiquitousKeyValueStore나 CloudKit에 자격 증명처럼 저장하지 않나요?
- Widget은 cloud 응답보다 App Group의 작은 local snapshot을 읽도록 설계했나요?

## 면접에서 자주 나오는 질문

### UserDefaults.standard와 NSUbiquitousKeyValueStore의 차이는 무엇인가요?

UserDefaults.standard는 현재 앱의 local settings domain이고, `NSUbiquitousKeyValueStore`는 같은 Apple 계정의 앱 인스턴스 사이에서 작은 key-value를 비동기로 전달하는 iCloud store예요. 용량, notification, 계정과 보안 특성이 달라요.

### CKContainer와 CKDatabase는 어떻게 다른가요?

`CKContainer`는 앱의 CloudKit namespace와 server 접근을 중재하고, 그 안에서 `CKDatabase`가 public·private·shared scope별 record zone과 record operation을 수행해요.

### private와 shared database는 어떻게 다른가요?

private database는 현재 사용자가 소유하고 기본적으로 혼자 보는 data이고, shared database는 다른 사용자가 share를 통해 현재 사용자에게 공개한 record를 담아요.

### SwiftData + CloudKit과 직접 CloudKit API는 언제 나누나요?

SwiftData model을 local source of truth로 두고 private data를 자동 동기화하려면 SwiftData integration이 편해요. database scope, zone, record, subscription, share, conflict를 세밀하게 제어해야 하면 직접 CloudKit API가 적합해요.

### cloud save에서 conflict는 왜 발생하나요?

여러 device가 같은 server record의 이전 version을 기준으로 수정할 수 있기 때문이에요. record change tag가 server version 차이를 감지하고 앱은 server·client·ancestor 값을 비교해 domain에 맞게 병합해야 해요.

## 참고 자료

- [Apple Developer Documentation - Deciding whether CloudKit is right for your app](https://developer.apple.com/documentation/cloudkit/deciding-whether-cloudkit-is-right-for-your-app)
- [Apple Developer Documentation - NSUbiquitousKeyValueStore](https://developer.apple.com/documentation/foundation/nsubiquitouskeyvaluestore)
- [Apple Developer Documentation - didChangeExternallyNotification](https://developer.apple.com/documentation/foundation/nsubiquitouskeyvaluestore/didchangeexternallynotification)
- [Apple Developer Documentation - CKContainer](https://developer.apple.com/documentation/cloudkit/ckcontainer)
- [Apple Developer Documentation - CKDatabase](https://developer.apple.com/documentation/cloudkit/ckdatabase)
- [Apple Developer Documentation - CKRecord](https://developer.apple.com/documentation/cloudkit/ckrecord)
- [Apple Developer Documentation - Designing and Creating a CloudKit Database](https://developer.apple.com/documentation/cloudkit/designing-and-creating-a-cloudkit-database)
- [Apple Developer Documentation - Syncing model data across a person's devices](https://developer.apple.com/documentation/swiftdata/syncing-model-data-across-a-persons-devices)
