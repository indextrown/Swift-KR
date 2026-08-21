---
title: Realm 구성·마이그레이션·보안과 동시성
description: Realm Configuration으로 파일과 스키마를 분리하고 migration, in-memory 테스트, AES 암호화와 Keychain, actor 격리를 운영 수준으로 설계합니다.
pageType: doc-wide
outline: false
---

# Realm 구성·마이그레이션·보안과 동시성

> 면접용 한 줄 요약: **`Realm.Configuration`은 파일 위치·스키마·migration·암호화의 identity이며, managed Realm 객체는 생성된 executor에 격리하므로 ID나 Sendable DTO를 actor 경계로 전달해야 합니다.**

Realm API로 저장에 성공하는 것과 출시 후 안전하게 운영하는 것은 다른 문제예요. 앱 update에서 schema가 변하고, 암호화 key를 잃을 수 있으며, test가 운영 파일을 열거나 actor가 잘못된 managed object를 받을 수 있습니다. 이 문제들의 출발점이 `Realm.Configuration`입니다.

## configuration이 결정하는 범위를 확인해요

| 설정                    | 결정하는 것                              | 틀렸을 때 생기는 문제                            |
| ----------------------- | ---------------------------------------- | ------------------------------------------------ |
| `fileURL`               | 어떤 Realm 파일을 열지                   | 사용자·환경의 데이터가 섞여요.                   |
| `inMemoryIdentifier`    | 파일 없이 공유할 memory Realm의 identity | test 상태가 섞이거나 너무 빨리 사라져요.         |
| `objectTypes`           | 파일 schema에 포함할 model subset        | 필요한 type이 없거나 불필요한 schema가 늘어요.   |
| `schemaVersion`         | 현재 앱 schema version                   | schema mismatch로 열기에 실패해요.               |
| `migrationBlock`        | 과거 data를 새 schema로 변환하는 방법    | update 후 기존 사용자의 파일만 열리지 않아요.    |
| `encryptionKey`         | 파일 암호화·복호화 key                   | key가 다르면 기존 파일을 열 수 없어요.           |
| `shouldCompactOnLaunch` | open 시 파일을 compact할 조건            | 시작 시간이 길어지거나 파일이 불필요하게 커져요. |

configuration은 앱 시작 뒤 여기저기서 즉흥적으로 바꾸기보다 composition root에서 먼저 만들고 store에 주입하세요.

## 기본 파일 대신 목적이 드러나는 위치를 정해요

```swift
import Foundation
import RealmSwift

func makeLibraryConfiguration() throws -> Realm.Configuration {
  let fileManager = FileManager.default
  let applicationSupport = try fileManager.url(
    for: .applicationSupportDirectory,
    in: .userDomainMask,
    appropriateFor: nil,
    create: true
  )
  let directory = applicationSupport.appendingPathComponent(
    "LibraryDatabase",
    isDirectory: true
  )

  try fileManager.createDirectory(
    at: directory,
    withIntermediateDirectories: true
  )

  var configuration = Realm.Configuration.defaultConfiguration
  configuration.fileURL = directory.appendingPathComponent("library.realm")
  configuration.objectTypes = [Author.self, Book.self, BookNote.self]
  return configuration
}
```

개발·staging·운영 또는 로그인 사용자별로 파일을 나눈다면 이름만 다르게 하지 말고 **어떤 data가 어느 Realm에 속하는지** 정책을 문서화하세요. 로그아웃할 때 파일을 삭제할지, 오프라인 기록을 유지할지, 새 사용자가 이전 사용자의 파일을 열 수 없는지도 결정해야 합니다.

App와 extension이 같은 Realm을 열어야 한다면 App Group container URL을 `fileURL`로 사용하고 두 target에 동일한 App Group entitlement를 설정할 수 있습니다. 이때 model version, Realm SDK version, encryption key 접근과 file protection 정책도 두 process에서 같아야 해요. 단순히 `.realm` 본 파일만 공유 folder로 복사하는 방식은 피합니다.

## schema가 바뀌면 version을 올려요

Realm 파일은 설치된 앱 version이 아니라 **마지막으로 적용된 schema version**을 기억합니다. configuration에 지정하지 않으면 version `0`이에요.

```text
앱 1.0: schemaVersion 1 ── title, progress, lastOpenedAt
앱 1.1: schemaVersion 2 ── status 추가
앱 2.0: schemaVersion 3 ── lastOpenedAt → updatedAt 이름 변경
```

```swift
func makeMigratingConfiguration() -> Realm.Configuration {
  var configuration = Realm.Configuration.defaultConfiguration
  configuration.schemaVersion = 3
  configuration.migrationBlock = { migration, oldSchemaVersion in
    if oldSchemaVersion < 2 {
      migration.enumerateObjects(ofType: Book.className()) {
        _, newObject in
        newObject?["status"] = ReadingStatus.unread.rawValue
      }
    }

    if oldSchemaVersion < 3 {
      migration.renameProperty(
        onType: Book.className(),
        from: "lastOpenedAt",
        to: "updatedAt"
      )
    }
  }
  return configuration
}
```

### migration block은 누적 경로여야 해요

`oldSchemaVersion`이 바로 이전 version이라고 가정하면 오랫동안 update하지 않은 사용자가 실패합니다.

```swift
if oldSchemaVersion < 2 {
  // v1 → v2에 필요한 변환
}

if oldSchemaVersion < 3 {
  // v1 또는 v2 → v3에 필요한 변환
}
```

각 조건을 독립적으로 두면 v1 사용자는 두 변환을 순서대로 받고 v2 사용자는 두 번째만 받습니다. `else if`나 서로 nested된 version 조건 때문에 중간 단계를 건너뛰지 않게 하세요.

| schema 변경                        | version 증가 | migration logic                                   |
| ---------------------------------- | ------------ | ------------------------------------------------- |
| optional property 추가             | 필요         | 보통 자동, 기존 값은 `nil`                        |
| property 제거                      | 필요         | schema에서 자동 제거 가능                         |
| required property 추가             | 필요         | 기존 row의 초기값 지정                            |
| property 이름 변경                 | 필요         | `renameProperty` 사용                             |
| type 변경·field 합치기             | 필요         | old/new object를 enumerate해 변환                 |
| `Object`를 `EmbeddedObject`로 변경 | 필요         | 각 embedded object가 정확히 한 부모를 갖도록 정리 |

:::danger 운영 앱에서 `deleteRealmIfMigrationNeeded`를 켜지 않아요
이 option은 schema mismatch가 생기면 사용자 데이터를 삭제하고 새 파일을 만듭니다. disposable fixture나 개발 build에는 편리할 수 있지만 운영 migration을 대신할 수 없어요.
:::

## migration을 fixture로 검증해요

새 model로 빈 Realm을 여는 test만으로는 기존 사용자 update를 검증할 수 없습니다.

1. 실제 과거 schema version별 작은 Realm fixture를 준비해요.
2. 현재 migration configuration으로 fixture의 복사본을 열어요.
3. row 수, primary key, 관계와 변환된 값을 검증해요.
4. 가장 오래 지원하는 version에서 최신 version으로 바로 이동하는 test를 넣어요.
5. migration 실패 시 원본을 보존하고 사용자가 취할 복구 경로를 정해요.

출시 전에는 production과 같은 file protection, encryption key와 data volume에서도 시간을 측정하세요. migration은 보통 Realm을 처음 여는 시점에 실행되므로 main thread에서 무거운 변환을 시작하면 첫 화면이 멈출 수 있습니다.

## test에서는 configuration을 주입해요

```swift
import RealmSwift
import XCTest

func makeTestConfiguration(
  identifier: String = UUID().uuidString
) -> Realm.Configuration {
  var configuration = Realm.Configuration(
    inMemoryIdentifier: identifier
  )
  configuration.objectTypes = [Author.self, Book.self, BookNote.self]
  return configuration
}

final class LibraryStoreTests: XCTestCase {
  func testCreateBook() throws {
    let configuration = makeTestConfiguration()
    let store = try LibraryStore(configuration: configuration)

    let id = try store.createBook(
      title: "Realm Testing",
      authorName: "Swift-KR"
    )

    let realm = try Realm(configuration: configuration)
    XCTAssertNotNil(
      realm.object(ofType: Book.self, forPrimaryKey: id)
    )
  }
}
```

in-memory Realm은 같은 identifier를 가진 instance가 하나라도 살아 있는 동안 data를 유지하고, 모두 해제되면 사라집니다. 병렬 test가 같은 global default identifier를 공유하지 않도록 test마다 고유 configuration을 만들고 명시적으로 주입하세요.

## 파일 암호화는 64-byte key로 시작해요

Realm 공식 가이드는 64-byte key를 configuration에 전달해 file을 AES-256으로 암호화하고 무결성을 확인한다고 설명합니다.

```swift
import RealmSwift
import Security

func generateRealmEncryptionKey() throws -> Data {
  var key = Data(count: 64)
  let status = key.withUnsafeMutableBytes { buffer in
    guard let baseAddress = buffer.baseAddress else {
      return errSecParam
    }
    return SecRandomCopyBytes(
      kSecRandomDefault,
      buffer.count,
      baseAddress
    )
  }

  guard status == errSecSuccess else {
    throw RealmKeyError.security(status)
  }
  return key
}

enum RealmKeyError: Error {
  case security(OSStatus)
  case invalidKeyData
}
```

이 key를 `UserDefaults`, plist, source code에 저장하면 앱 bundle이나 container를 읽은 공격자에게 같이 노출됩니다. Keychain에 저장하고 매번 같은 key를 꺼내야 해요.

```swift
struct RealmEncryptionKeyStore {
  private let service = "io.swift-kr.realm"
  private let account = "library-database-key"

  func loadOrCreate() throws -> Data {
    let readQuery: [String: Any] = [
      kSecClass as String: kSecClassGenericPassword,
      kSecAttrService as String: service,
      kSecAttrAccount as String: account,
      kSecReturnData as String: true,
      kSecMatchLimit as String: kSecMatchLimitOne
    ]

    var item: CFTypeRef?
    let readStatus = SecItemCopyMatching(
      readQuery as CFDictionary,
      &item
    )

    if readStatus == errSecSuccess {
      guard let key = item as? Data, key.count == 64 else {
        throw RealmKeyError.invalidKeyData
      }
      return key
    }

    guard readStatus == errSecItemNotFound else {
      throw RealmKeyError.security(readStatus)
    }

    let key = try generateRealmEncryptionKey()
    let insertQuery: [String: Any] = [
      kSecClass as String: kSecClassGenericPassword,
      kSecAttrService as String: service,
      kSecAttrAccount as String: account,
      kSecAttrAccessible as String:
        kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly,
      kSecValueData as String: key
    ]
    let insertStatus = SecItemAdd(insertQuery as CFDictionary, nil)

    guard insertStatus == errSecSuccess else {
      throw RealmKeyError.security(insertStatus)
    }
    return key
  }
}
```

```swift
let key = try RealmEncryptionKeyStore().loadOrCreate()
var configuration = makeMigratingConfiguration()
configuration.encryptionKey = key
let realm = try Realm(configuration: configuration)
```

### 암호화에서 놓치기 쉬운 조건

- 처음부터 encrypted file로 만들어야 해요. 기존 평문 Realm에 key만 추가하면 열리지 않습니다.
- 이후 open마다 정확히 같은 64-byte key가 필요해요.
- key를 잃으면 Realm file을 복구할 수 없으므로 재로그인·server 복원 가능 여부에 맞춘 정책이 필요해요.
- 암호화는 device가 unlock된 뒤 memory에 있는 data, screenshot, log, network 전송까지 자동 보호하지 않아요.
- App Group에서 extension도 열면 두 target의 Keychain access group과 accessibility를 함께 설계해야 해요.
- Realm 공식 가이드는 encrypted Realm의 read·write가 평문보다 느릴 수 있다고 안내하므로 실제 기기에서 측정해요.

## file protection과 background 실행을 함께 봐요

iOS Data Protection 때문에 device가 잠긴 동안 Realm file 접근이 실패할 수 있습니다. background task나 extension이 첫 unlock 전에도 data를 읽어야 하는지 먼저 판단하세요.

보호 수준을 낮추기 전에 다음 순서로 검토합니다.

1. 잠긴 동안 정말 Realm 접근이 필요한가요?
2. 작업을 unlock 이후로 미룰 수 있나요?
3. 최소한의 별도 파일·queue만 다른 보호 수준으로 둘 수 있나요?
4. Realm encryption과 Keychain accessibility가 같은 시점에 key 접근을 허용하나요?

Realm은 보조 파일을 만들 수 있으므로 protection attribute를 변경해야 한다면 본 파일 하나가 아니라 공식 가이드처럼 parent directory의 정책을 검토해요.

## Swift Concurrency에서는 Realm을 actor에 격리해요

Realm Swift `v20`의 Swift 6 API는 현재 actor를 추론하는 `Realm.open(configuration:)`을 제공합니다. 하나의 actor가 Realm과 write를 소유하면 임의의 queue 전환보다 경계가 명확해져요.

```swift
import RealmSwift

struct BookSummary: Sendable {
  let id: String
  let title: String
  let progress: Int
}

actor LibraryRealmActor {
  private let realm: Realm

  init(
    configuration: Realm.Configuration = .defaultConfiguration
  ) async throws {
    realm = try await Realm.open(configuration: configuration)
  }

  func markAsFinished(id: String) async throws {
    guard let objectID = try? ObjectId(string: id),
          let book = realm.object(
            ofType: Book.self,
            forPrimaryKey: objectID
          ) else {
      return
    }

    try await realm.asyncWrite {
      book.progress = 100
      book.status = .finished
      book.updatedAt = Date()
    }
  }

  func readingBookSummaries() -> [BookSummary] {
    realm.objects(Book.self)
      .where { $0.status == .reading }
      .map {
        BookSummary(
          id: $0.id.stringValue,
          title: $0.title,
          progress: $0.progress
        )
      }
  }
}
```

`asyncWrite`는 write lock을 기다리는 동안 현재 task를 suspend하고 disk I/O를 background worker에서 처리합니다. 그렇다고 복잡한 closure 계산이 자동으로 무료가 되거나 같은 Realm file에 여러 write가 동시에 commit되는 것은 아니에요. transaction은 여전히 serialize됩니다.

### actor 경계로 managed object를 직접 넘기지 않아요

```text
MainActor의 Book ──X──> Background actor

대신
Book.id 문자열 ───────> 목적지 Realm에서 다시 query
BookSummary DTO ──────> 화면에 필요한 값만 전달
ThreadSafeReference ─> 필요한 특수 상황에서 생성·resolve
```

Realm object는 일반적인 `Sendable` 값이 아닙니다. 기본 키를 전달해 목적지 actor가 자기 Realm에서 다시 찾거나 immutable `Sendable` DTO를 만들어 전달하세요. `ThreadSafeReference`도 제공되지만 version을 유지하는 비용과 resolve 생명주기를 이해해야 하므로 app-wide 전달 모델의 기본값으로 쓰지는 않습니다.

## 운영 체크리스트

- [ ] Realm을 열기 전에 한 곳에서 configuration을 완성하나요?
- [ ] 환경·사용자·App Group별 file identity가 명확한가요?
- [ ] 가장 오래 지원하는 schema fixture에서 최신 migration을 검증했나요?
- [ ] 운영 build에서 `deleteRealmIfMigrationNeeded`가 꺼져 있나요?
- [ ] encryption key를 64-byte secure random으로 만들고 Keychain에 저장하나요?
- [ ] key 상실, device 잠금과 backup·복구 정책이 있나요?
- [ ] 병렬 test마다 고유한 in-memory configuration을 주입하나요?
- [ ] Realm과 managed object가 한 actor에 격리되고 경계에는 ID·DTO를 사용하나요?

## 면접에서 이어질 수 있는 질문

### schema version과 앱 version은 같은가요?

아니요. 앱 version은 배포 binary의 release를 나타내고 Realm schema version은 파일 구조의 migration 단계를 나타냅니다. UI만 바뀐 앱 release에서는 schema version을 올릴 필요가 없고, 한 앱 release에서 schema가 바뀌면 더 높은 version과 필요한 migration을 제공해야 합니다.

### `asyncWrite`를 쓰면 모든 Realm 동시성 문제가 해결되나요?

아니요. write lock을 기다리는 동안 task를 block하지 않는 장점은 있지만 managed object의 actor 격리, notification 수명, transaction 크기와 단일 파일의 serialized write 규칙은 그대로 고려해야 합니다.

## 참고 자료

- [Realm 구성과 파일 열기 공식 가이드](https://github.com/realm/realm-swift/blob/community/docs/guides/realm-files/configure-and-open-a-realm.md)
- [Realm schema 변경 공식 가이드](https://github.com/realm/realm-swift/blob/community/docs/guides/model-data/change-an-object-model.md)
- [Realm 암호화 공식 가이드](https://github.com/realm/realm-swift/blob/community/docs/guides/realm-files/encrypt-a-realm.md)
- [Realm test·debug 공식 가이드](https://github.com/realm/realm-swift/blob/community/docs/guides/test-and-debug.md)
- [Realm Swift Concurrency 공식 가이드](https://github.com/realm/realm-swift/blob/community/docs/guides/use-realm-with-actors.md)
- [`Realm.open`과 `asyncWrite` API source](https://github.com/realm/realm-swift/blob/community/RealmSwift/Realm.swift)
- [Apple Keychain Services](https://developer.apple.com/documentation/security/keychain-services)
- [Apple Data Protection](https://support.apple.com/guide/security/data-protection-overview-secf6276da8a/web)
