---
title: Swift 파일 저장과 App Group container
description: 앱 sandbox의 Documents, Application Support, Caches, tmp 선택 기준과 Codable, atomic write, backup, App Group 파일 공유를 Swift 예제로 설명합니다.
pageType: doc-wide
outline: false
---

# Swift 파일 저장과 App Group container

> **면접 답변 한 줄 요약:** 앱의 file container는 sandbox가 허용한 private 디렉터리이며, 사용자가 다루는 문서는 Documents, 앱 관리 영속 파일은 Application Support, 재생성 가능한 데이터는 Caches, 즉시 버릴 파일은 tmp에 두고 App·extension 공유에는 entitlement가 있는 App Group container를 사용해요.

JSON snapshot, image, audio, 내려받은 문서는 key-value 설정이나 model row보다 **파일 형식과 byte 단위 수명**이 중요해요. 파일 저장에서는 encode와 write code만큼 “어느 directory에 둘 것인가”가 중요해요.

다음처럼 실행 때마다 달라질 수 있는 sandbox path를 문자열로 외우면 안 돼요.

```swift
// 사용하지 않아요.
let path = "/var/mobile/Containers/Data/Application/.../records.json"
```

운영체제가 앱의 container 위치를 정하므로 `FileManager`와 `URL` API로 목적에 맞는 directory를 구해야 해요.

## 먼저 알아둘 파일 용어

| 용어                | 쉬운 뜻                                                                                                         |
| ------------------- | --------------------------------------------------------------------------------------------------------------- |
| app bundle          | 실행 파일과 앱에 포함한 resource를 담는 설치 bundle이에요. 보통 runtime에 읽기 전용으로 사용해요.               |
| data container      | 앱이 runtime에 데이터를 읽고 쓸 수 있도록 운영체제가 관리하는 private directory예요.                            |
| sandbox             | 앱이 허용된 container와 system resource만 접근하도록 제한하는 보안 경계예요.                                    |
| file URL            | 파일이나 directory 위치를 표현하는 `URL` 값이에요. path 문자열보다 component 결합과 system API 연결에 유리해요. |
| Application Support | 앱이 관리하며 재실행 뒤에도 남아야 하는 support file을 두는 directory예요.                                      |
| Caches              | 다시 내려받거나 계산할 수 있고 system이 공간 확보를 위해 지워도 되는 file을 두는 directory예요.                 |
| temporary directory | 현재 작업에만 필요하고 빨리 버려도 되는 file을 두는 위치예요.                                                   |
| atomic write        | 완성된 새 file로 기존 file을 교체해 일부 byte만 기록된 상태가 보이지 않도록 하는 write 방식이에요.              |
| backup              | 기기 복원에 사용할 수 있도록 iCloud Backup 등에 app data snapshot이 포함되는 정책이에요. cloud sync와 달라요.   |
| App Group container | 같은 group entitlement를 가진 관련 target이 접근할 수 있는 shared directory예요.                                |
| file coordination   | 여러 process나 system service가 같은 file을 읽고 쓸 때 접근 시점을 조정하는 방식이에요.                         |

## app bundle과 data container를 구분해요

앱에 기본 JSON을 함께 배포할 때는 bundle에서 읽을 수 있어요.

```swift
guard let seedURL = Bundle.main.url(
  forResource: "ReadingSeed",
  withExtension: "json"
) else {
  throw CocoaError(.fileNoSuchFile)
}

let seedData = try Data(contentsOf: seedURL)
```

bundle은 앱을 build하고 code sign할 때 만들어진 내용이에요. 사용자 변경을 bundle 안에 다시 쓰지 말고, 수정해야 하는 resource는 첫 실행에 data container로 복사해요.

```text
App bundle
└─ 배포 resource 읽기

App data container
├─ Documents
├─ Library
│  ├─ Application Support
│  └─ Caches
└─ tmp
```

## directory는 데이터의 수명으로 선택해요

Apple의 [File System Programming Guide](https://developer.apple.com/library/archive/documentation/FileManagement/Conceptual/FileSystemProgrammingGuide/FileSystemOverview/FileSystemOverview.html)는 iOS 앱의 표준 directory를 데이터 목적과 backup 정책에 따라 나누도록 안내해요.

| directory           | 넣을 데이터                            | system 삭제 가능성                      | backup 기본 방향 |
| ------------------- | -------------------------------------- | --------------------------------------- | ---------------- |
| Documents           | 사용자가 만들고 직접 다루는 문서       | 앱이 관리하거나 사용자가 삭제           | 기본적으로 포함  |
| Application Support | 앱이 관리하며 동작에 필요한 영속 파일  | 앱이 관리                               | 기본적으로 포함  |
| Caches              | 다시 내려받거나 계산할 수 있는 cache   | 공간이 부족하면 system이 삭제할 수 있음 | 포함하지 않음    |
| tmp                 | export 중간 결과처럼 곧 버릴 임시 파일 | 앱이 종료된 동안 system이 지울 수 있음  | 포함하지 않음    |

“앱이 만든 파일”이라는 이유로 모두 Documents에 넣지 않아요. 사용자가 직접 보고 관리하는 문서가 아니라면 Application Support가 더 자연스러운 경우가 많아요.

## FileManager로 안전한 URL을 구해요

### Application Support

```swift
import Foundation

func applicationSupportDirectory(
  fileManager: FileManager = .default
) throws -> URL {
  let directory = try fileManager.url(
    for: .applicationSupportDirectory,
    in: .userDomainMask,
    appropriateFor: nil,
    create: true
  )

  let appDirectory = directory.appending(
    path: "Reading",
    directoryHint: .isDirectory
  )

  try fileManager.createDirectory(
    at: appDirectory,
    withIntermediateDirectories: true
  )

  return appDirectory
}
```

`create: true`와 `createDirectory`의 책임을 코드에 드러내면 directory가 없을 때의 실패가 명확해요. bundle identifier나 앱 전용 하위 directory를 두어 파일 이름 충돌을 피할 수 있어요.

### Caches와 tmp

```swift
func cacheDirectory(
  fileManager: FileManager = .default
) throws -> URL {
  try fileManager.url(
    for: .cachesDirectory,
    in: .userDomainMask,
    appropriateFor: nil,
    create: true
  )
}

let temporaryExportURL = FileManager.default.temporaryDirectory
  .appending(path: UUID().uuidString)
  .appendingPathExtension("zip")
```

cache와 tmp의 file이 항상 존재한다고 가정하지 않아요. 읽기 전에 존재를 검사하기보다 `Data(contentsOf:)` 오류를 처리하고 필요하면 다시 생성하거나 내려받는 흐름을 준비해요.

## Codable model을 JSON file로 저장해요

작은 snapshot 하나를 파일에 저장하는 전용 type을 만들어 볼게요.

```swift
import Foundation

struct ReadingSnapshot: Codable, Equatable, Sendable {
  let completedMinutes: Int
  let dailyGoal: Int
  let updatedAt: Date
}

struct ReadingSnapshotFile {
  let url: URL

  func load() throws -> ReadingSnapshot {
    let data = try Data(contentsOf: url)
    return try JSONDecoder().decode(
      ReadingSnapshot.self,
      from: data
    )
  }

  func save(_ snapshot: ReadingSnapshot) throws {
    let encoder = JSONEncoder()
    encoder.outputFormatting = [.prettyPrinted, .sortedKeys]

    let data = try encoder.encode(snapshot)
    try data.write(to: url, options: .atomic)
  }
}
```

`Codable`은 model과 JSON `Data` 사이 변환을 담당하고, `Data.write(options: .atomic)`은 새 내용을 임시 위치에 완성한 뒤 목적 file을 교체하는 방식으로 write 중간 상태가 노출될 위험을 줄여요.

atomic write가 모든 경쟁 상태를 해결하지는 않아요. 두 writer가 같은 snapshot을 읽고 각자 수정한 뒤 차례로 교체하면 마지막 writer가 이전 변경을 덮어쓸 수 있어요.

## decode 실패와 schema version을 처리해요

파일의 model 구조가 앱 업데이트로 바뀔 수 있다면 version을 함께 저장해요.

```swift
struct ReadingSnapshotEnvelope: Codable {
  let version: Int
  let payload: ReadingSnapshot
}

enum ReadingSnapshotError: Error {
  case unsupportedVersion(Int)
}

func decodeSnapshot(from data: Data) throws -> ReadingSnapshot {
  let envelope = try JSONDecoder().decode(
    ReadingSnapshotEnvelope.self,
    from: data
  )

  guard envelope.version == 1 else {
    throw ReadingSnapshotError.unsupportedVersion(
      envelope.version
    )
  }

  return envelope.payload
}
```

property를 optional로 바꾸는 것만으로 모든 과거 파일이 안전해지지는 않아요. 오래된 fixture를 보관하고 현재 decoder와 migration logic으로 읽는 test를 작성해요.

사용자 원본 문서가 손상됐을 때는 조용히 빈 값으로 덮어쓰지 말고 복구나 오류 표시를 고려해요. 반면 cache decode가 실패하면 file을 버리고 다시 생성하는 정책이 가능해요. 같은 오류라도 directory의 목적에 따라 대응이 달라요.

## backup에 포함할 데이터인지 결정해요

Documents와 Application Support의 파일은 기본적으로 backup 대상이 될 수 있어요. 다시 내려받을 수 있는 큰 파일을 Application Support에 두어야 한다면 backup 제외 resource value를 설정할 수 있어요.

```swift
func excludeFromBackup(_ url: URL) throws {
  var values = URLResourceValues()
  values.isExcludedFromBackup = true

  var mutableURL = url
  try mutableURL.setResourceValues(values)
}
```

재생성 가능한 데이터는 처음부터 Caches에 두는 편이 의미가 명확해요. 사용자가 만든 원본이나 앱 동작에 꼭 필요한 유일한 copy를 무조건 backup에서 제외하면 기기 복원 뒤 데이터가 사라질 수 있어요.

### backup과 sync는 달라요

- backup: 특정 시점의 기기 app data를 복원하기 위한 snapshot이에요.
- sync: 실행 중에도 여러 기기 사이 변경을 전달하고 같은 상태로 수렴하게 해요.

Application Support 파일이 backup 대상이라고 해서 다른 iPhone에서 실시간으로 보이는 것은 아니에요. 파일 자체를 기기 사이에 동기화하려면 iCloud Documents 같은 별도 기능을 검토해요.

## App Group file container를 사용해요

앱과 Widget은 기본적으로 서로의 private data container에 접근하지 못해요. 같은 App Group entitlement를 가진 target은 `FileManager.containerURL(forSecurityApplicationGroupIdentifier:)`로 shared directory를 얻을 수 있어요.

```swift
import Foundation

enum ReadingGroup {
  static let identifier = "group.com.example.Reading"
}

func sharedSnapshotURL(
  fileManager: FileManager = .default
) throws -> URL {
  guard let container = fileManager.containerURL(
    forSecurityApplicationGroupIdentifier: ReadingGroup.identifier
  ) else {
    throw CocoaError(.fileNoSuchFile)
  }

  let directory = container.appending(
    path: "WidgetSnapshots",
    directoryHint: .isDirectory
  )

  try fileManager.createDirectory(
    at: directory,
    withIntermediateDirectories: true
  )

  return directory
    .appending(path: "reading.json")
}
```

App target과 Widget target 모두 같은 App Groups capability와 identifier를 가져야 해요. 문자열이 같아도 entitlement가 없으면 접근 권한이 생기지 않아요.

설정 과정과 Widget timeline 전체 흐름은 [App Groups와 Widget 데이터 공유](./app-groups)에서 자세히 설명해요.

## 여러 process가 같은 파일을 쓸 때 정책을 정해요

`actor`는 한 process 안의 Swift task를 직렬화하는 데 유용하지만, App과 Widget처럼 서로 다른 process 사이를 자동으로 잠그지는 못해요.

가능하면 책임을 단순하게 나눠요.

```text
App process
└─ shared snapshot의 유일한 writer
   └─ atomic replace

Widget process
└─ shared snapshot의 reader
   └─ decode 실패 시 placeholder
```

두 process가 모두 같은 file을 수정해야 한다면 다음을 검토해요.

- `NSFileCoordinator`로 coordinated read와 write를 사용해요.
- 읽기→수정→쓰기 전체를 하나의 경쟁 단위로 보고 lost update를 막아요.
- record를 각각 다른 file로 나누거나 database transaction을 사용해 충돌 범위를 줄여요.
- Widget은 짧은 실행 시간에 맞게 작은 immutable snapshot을 읽도록 만들어요.

atomic write는 file의 일부만 보이는 문제를 줄이지만 **누가 마지막으로 쓸지**는 결정하지 않아요.

## 비밀은 일반 file에 저장하지 않아요

sandbox는 다른 일반 앱의 임의 접근을 제한하지만 access token과 password를 평문 JSON으로 저장하기에 충분한 정책은 아니에요. 비밀은 [Keychain과 access group](./keychain)을 사용해요.

파일에도 민감한 사용자 content가 있다면 platform Data Protection, backup 정책, 공유 범위, log와 export를 함께 검토해요. App Group으로 옮기면 group의 모든 member target이 접근할 수 있다는 점도 보안 설계에 포함해요.

## test에서는 임시 directory를 격리해요

test마다 고유 directory를 만들고 완료 후 그 정확한 directory만 제거해요.

```swift
import Foundation
import Testing

@Test
func savesAndLoadsSnapshot() throws {
  let root = FileManager.default.temporaryDirectory
    .appending(path: UUID().uuidString)

  try FileManager.default.createDirectory(
    at: root,
    withIntermediateDirectories: true
  )
  defer {
    try? FileManager.default.removeItem(at: root)
  }

  let store = ReadingSnapshotFile(
    url: root.appending(path: "snapshot.json")
  )
  let expected = ReadingSnapshot(
    completedMinutes: 25,
    dailyGoal: 30,
    updatedAt: Date(timeIntervalSince1970: 1_000)
  )

  try store.save(expected)
  #expect(try store.load() == expected)
}
```

실제 Documents나 App Group container를 unit test의 기본 대상으로 사용하면 이전 test·앱 실행 상태와 섞일 수 있어요. URL을 initializer로 주입하면 임시 directory로 쉽게 교체할 수 있어요.

## 다른 저장 기술과 비교해요

| 기준        | UserDefaults                        | SwiftData                       | 파일                                  |
| ----------- | ----------------------------------- | ------------------------------- | ------------------------------------- |
| 접근 단위   | 문자열 key                          | model과 query                   | URL과 byte                            |
| 잘 맞는 값  | 작은 설정                           | 관계·검색이 있는 구조화된 model | JSON snapshot, image, audio, document |
| update      | key 단위                            | property·record 단위            | 보통 전체 교체 또는 직접 format 설계  |
| migration   | key·decode 정책을 직접 관리         | schema migration API            | version과 변환을 직접 관리            |
| system 삭제 | persistent domain은 일반적으로 유지 | store 정책에 따름               | Caches와 tmp는 삭제될 수 있음         |
| 비밀 저장   | 부적합                              | 부적합                          | 일반 file만으로는 부적합              |

## 적용 체크리스트

- user document, app support, cache, temporary 중 데이터 목적을 분류했나요?
- sandbox path를 문자열로 저장하지 않고 system API로 URL을 구하나요?
- directory 생성과 file-not-found 오류를 처리하나요?
- 중요한 file을 atomic하게 쓰나요?
- format version과 과거 fixture의 decode test가 있나요?
- backup에 포함할 데이터와 재생성 가능한 데이터를 구분했나요?
- cache와 tmp가 사라져도 복구할 수 있나요?
- App Group을 쓰는 모든 target의 entitlement가 일치하나요?
- 여러 process의 writer 정책과 lost update 대책이 있나요?
- token과 password를 일반 file에 넣지 않나요?

## 면접에서 자주 나오는 질문

### Documents와 Application Support는 어떻게 다른가요?

Documents는 사용자가 만들고 직접 다루는 문서에 적합하고, Application Support는 앱이 사용자를 대신해 관리하며 동작에 필요한 영속 파일에 적합해요. 자동 생성된 내부 파일을 모두 Documents에 두지 않아요.

### Caches와 tmp 파일이 사라져도 되나요?

네. Caches는 다시 만들거나 내려받을 수 있어야 하고 system이 공간 확보를 위해 삭제할 수 있어요. tmp는 현재 작업 뒤 바로 버리는 데이터이며 앱이 실행되지 않을 때 system이 지울 수 있어요.

### atomic write면 동시 쓰기도 안전한가요?

일부 내용만 기록된 file이 보이는 위험은 줄이지만 두 writer의 lost update까지 막지는 않아요. 여러 process가 읽고 수정한다면 single-writer 정책이나 file coordination, transaction이 필요해요.

### App Group file container와 UserDefaults suite는 같은가요?

둘 다 App Group 권한을 이용할 수 있지만 file container는 shared directory이고 suite는 shared preferences domain이에요. file에는 `FileManager.containerURL`, 설정에는 `UserDefaults(suiteName:)`을 사용해요.

## 참고 자료

- [Apple Developer Documentation - FileManager](https://developer.apple.com/documentation/foundation/filemanager)
- [Apple Developer Documentation - File System Programming Guide](https://developer.apple.com/library/archive/documentation/FileManagement/Conceptual/FileSystemProgrammingGuide/FileSystemOverview/FileSystemOverview.html)
- [Apple Developer Documentation - Accessing Files and Directories](https://developer.apple.com/library/archive/documentation/FileManagement/Conceptual/FileSystemProgrammingGuide/AccessingFilesandDirectories/AccessingFilesandDirectories.html)
- [Apple Developer Documentation - Data.WritingOptions.atomic](https://developer.apple.com/documentation/foundation/nsdata/writingoptions/atomic)
- [Apple Developer Documentation - containerURL(forSecurityApplicationGroupIdentifier:)](<https://developer.apple.com/documentation/foundation/filemanager/containerurl(forsecurityapplicationgroupidentifier:)>)
- [Apple Developer Documentation - Configuring App Groups](https://developer.apple.com/documentation/xcode/configuring-app-groups)
