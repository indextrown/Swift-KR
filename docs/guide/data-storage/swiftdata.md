---
title: SwiftData의 ModelContainer와 ModelContext 이해하기
description: SwiftData의 @Model, Schema, ModelContainer, ModelContext, CRUD, Query, transaction, migration, concurrency와 테스트를 단계적으로 설명합니다.
pageType: doc-wide
outline: false
---

# SwiftData의 ModelContainer와 ModelContext 이해하기

> **면접 답변 한 줄 요약:** SwiftData는 Swift 모델을 schema로 영속화하는 프레임워크이며, `ModelContainer`가 schema와 persistent store 구성을 관리하고 `ModelContext`가 fetch·insert·update·delete와 저장 전 변경을 추적해요.

앱의 독서 기록이 제목과 날짜 하나뿐일 때는 JSON 파일도 충분해 보여요. 하지만 다음 요구가 추가되면 직접 관리할 책임이 빠르게 늘어나요.

- 최근 기록을 날짜순으로 정렬하고 완료된 기록만 검색해요.
- 책과 독서 기록의 관계를 표현해요.
- 한 항목만 수정하고 삭제해요.
- 앱 업데이트로 모델 속성이 바뀌어도 기존 데이터를 유지해요.
- SwiftUI 화면이 저장소의 변경을 따라 다시 그려져야 해요.

SwiftData는 이런 **구조화된 앱 모델**을 선언하고 저장·조회하는 API예요. iOS 17, macOS 14부터 사용할 수 있으며 Swift의 macro와 SwiftUI 환경에 자연스럽게 연결돼요.

## 먼저 알아둘 SwiftData 용어

| 용어                 | 쉬운 뜻                                                                                                            |
| -------------------- | ------------------------------------------------------------------------------------------------------------------ |
| persistent model     | SwiftData가 저장하고 추적하는 class예요. `@Model` macro로 선언해요.                                                |
| schema               | 저장할 model type과 속성·관계의 구조예요.                                                                          |
| persistent store     | 모델 데이터가 실제로 보관되는 저장소예요. 기본 구성에서는 기기의 디스크를 사용해요.                                |
| `ModelConfiguration` | 어떤 schema를 어느 위치와 방식으로 저장할지 설명해요. in-memory, App Group, CloudKit 같은 선택을 포함할 수 있어요. |
| `ModelContainer`     | schema, configuration, persistent store를 관리하고 context의 요청을 저장소에 연결하는 객체예요.                    |
| `ModelContext`       | fetch한 model과 아직 저장하지 않은 insert·update·delete를 추적하는 작업 공간이에요.                                |
| `@Query`             | SwiftUI 환경의 model context를 사용해 model을 조회하고 결과 변경에 따라 화면을 갱신하는 property wrapper예요.      |
| fetch descriptor     | 어떤 model을 어떤 조건과 정렬로 가져올지 표현하는 값이에요.                                                        |
| migration            | 앱의 schema가 바뀌었을 때 기존 저장 데이터를 새 schema로 옮기는 과정이에요.                                        |
| model actor          | 별도 동시성 영역에서 model context 작업을 직렬화하도록 SwiftData가 제공하는 actor 패턴이에요.                      |

## 전체 구조부터 이해해요

SwiftData의 주요 객체 관계는 다음과 같아요.

```text
SwiftUI View
├─ @Query ───────────────────────┐
└─ @Environment(\.modelContext) ─┤
                                  ▼
                         ModelContext
                      변경 추적 / fetch / save
                                  │
                                  ▼
                         ModelContainer
                  schema + configuration + migration
                                  │
                                  ▼
                         persistent store
```

Apple은 [`ModelContainer`](https://developer.apple.com/documentation/swiftdata/modelcontainer)를 context와 underlying persistent storage 사이를 중재하고 schema와 저장 구성을 관리하는 객체로 설명해요. [`ModelContext`](https://developer.apple.com/documentation/swiftdata/modelcontext)는 model을 가져오고, 삽입하고, 삭제하고, 변경을 disk에 저장하는 객체예요.

`ModelContainer`와 App Group의 file container는 같은 개념이 아니에요. 전자는 SwiftData stack을 관리하는 Swift 객체이고, 후자는 운영체제가 entitlement에 따라 제공하는 디렉터리예요. `ModelConfiguration`이 App Group 디렉터리를 store 위치로 선택할 수 있을 뿐이에요.

## @Model로 저장할 class를 선언해요

독서 기록 모델부터 만들어요.

```swift
import Foundation
import SwiftData

@Model
final class ReadingRecord {
  var id: UUID
  var title: String
  var minutes: Int
  var startedAt: Date
  var isCompleted: Bool

  init(
    id: UUID = UUID(),
    title: String,
    minutes: Int,
    startedAt: Date = .now,
    isCompleted: Bool = false
  ) {
    self.id = id
    self.title = title
    self.minutes = minutes
    self.startedAt = startedAt
    self.isCompleted = isCompleted
  }
}
```

`@Model`은 일반 Swift class에 SwiftData가 필요한 저장·변경 추적 기능을 합성해요. persistent model은 reference type이므로 동일한 인스턴스를 여러 곳에서 다룰 때 값 타입처럼 복사되지 않아요.

### 저장할 수 없는 상태는 @Transient로 제외해요

화면에만 필요한 계산 cache처럼 저장할 필요가 없는 값은 `@Transient`를 사용할 수 있어요.

```swift
@Model
final class ReadingSession {
  var startedAt: Date
  var endedAt: Date?

  @Transient
  var isHighlighted = false

  init(startedAt: Date = .now, endedAt: Date? = nil) {
    self.startedAt = startedAt
    self.endedAt = endedAt
  }

  var duration: TimeInterval {
    (endedAt ?? .now).timeIntervalSince(startedAt)
  }
}
```

`@Transient` 값은 앱을 다시 실행했을 때 복원되지 않아요. 영속 상태의 진실 공급원으로 사용하면 안 돼요.

## App 시작점에 ModelContainer를 설치해요

SwiftUI 앱에서는 scene에 `.modelContainer(for:)`를 붙이는 방법이 가장 간단해요.

```swift
import SwiftData
import SwiftUI

@main
struct ReadingApp: App {
  var body: some Scene {
    WindowGroup {
      ReadingRecordList()
    }
    .modelContainer(for: ReadingRecord.self)
  }
}
```

이 modifier는 model container를 만들고 하위 view가 같은 container를 사용하도록 연결해요. 동시에 main actor에 묶인 context를 SwiftUI environment에 넣어요. `@Query`와 `@Environment(\.modelContext)`가 이 context를 사용해요.

여러 model type을 함께 사용한다면 배열로 전달할 수 있어요.

```swift
.modelContainer(for: [Book.self, ReadingRecord.self])
```

앱에 적어도 하나의 `ModelContainer`가 필요해요. 서로 관계가 있는 모델을 이유 없이 여러 container로 쪼개면 fetch와 관계 관리가 복잡해질 수 있어요.

## @Query로 목록을 읽어요

`@Query`는 저장소 결과를 SwiftUI 상태처럼 화면에 연결해요.

```swift
import SwiftData
import SwiftUI

struct ReadingRecordList: View {
  @Query(
    sort: \ReadingRecord.startedAt,
    order: .reverse
  )
  private var records: [ReadingRecord]

  var body: some View {
    List(records) { record in
      VStack(alignment: .leading) {
        Text(record.title)
        Text("\(record.minutes)분")
          .foregroundStyle(.secondary)
      }
    }
  }
}
```

`@Model` type은 identity를 제공하므로 별도 `Identifiable` 채택 없이 `List`에서 사용할 수 있어요. context의 변경이 반영되면 query 결과와 화면도 갱신돼요.

### predicate와 sort를 함께 사용해요

완료된 기록만 최근 순서로 읽을 수 있어요.

```swift
@Query(
  filter: #Predicate<ReadingRecord> { record in
    record.isCompleted
  },
  sort: [
    SortDescriptor(\ReadingRecord.startedAt, order: .reverse),
  ]
)
private var completedRecords: [ReadingRecord]
```

`#Predicate` macro는 closure처럼 읽히지만 SwiftData가 저장소 query로 해석할 수 있는 표현을 만들어요. 모든 임의 Swift 함수를 predicate 안에서 실행할 수 있는 것은 아니므로 compile error가 나면 지원되는 표현으로 분해해야 해요.

## ModelContext로 CRUD를 수행해요

CRUD는 Create, Read, Update, Delete의 앞 글자예요.

### Create: insert 후 저장해요

```swift
import SwiftData
import SwiftUI

struct AddReadingRecordButton: View {
  @Environment(\.modelContext) private var modelContext

  var body: some View {
    Button("30분 기록") {
      let record = ReadingRecord(
        title: "The Swift Programming Language",
        minutes: 30
      )

      modelContext.insert(record)

      do {
        try modelContext.save()
      } catch {
        assertionFailure("독서 기록 저장 실패: \(error)")
      }
    }
  }
}
```

`insert`는 model을 context의 변경 추적 대상에 추가해요. 이 순간의 변경은 먼저 memory에 있고, `save()`가 성공해야 persistent store에 반영돼요.

SwiftUI가 설치한 main context는 autosave를 구성할 수 있지만, 사용자가 명시적으로 완료한 중요한 작업은 `save()` 오류를 직접 처리하는 편이 상태를 설명하기 쉬워요. autosave timing을 transaction 완료 시점처럼 가정하지 마세요.

### Read: FetchDescriptor로 명시적으로 읽어요

view 밖의 repository나 service에서는 `FetchDescriptor`를 사용할 수 있어요.

```swift
import SwiftData

func recentCompletedRecords(
  in context: ModelContext,
  limit: Int = 20
) throws -> [ReadingRecord] {
  var descriptor = FetchDescriptor<ReadingRecord>(
    predicate: #Predicate { record in
      record.isCompleted
    },
    sortBy: [
      SortDescriptor(\.startedAt, order: .reverse),
    ]
  )
  descriptor.fetchLimit = limit

  return try context.fetch(descriptor)
}
```

모든 record를 memory로 읽은 뒤 Swift 배열에서 filter하는 방식보다 저장소가 조건과 limit을 처리하도록 표현하는 편이 데이터가 커질 때 유리해요.

### Update: 추적 중인 property를 바꿔요

```swift
func complete(
  _ record: ReadingRecord,
  in context: ModelContext
) throws {
  record.isCompleted = true
  try context.save()
}
```

context가 추적하는 model의 저장 property를 바꾸면 update로 인식해요. 별도의 `update(record)` 호출은 필요하지 않아요.

### Delete: context에 삭제를 요청해요

```swift
func delete(
  _ record: ReadingRecord,
  from context: ModelContext
) throws {
  context.delete(record)
  try context.save()
}
```

model 관계에 delete rule이 있다면 관련 model의 처리도 schema 설정에 따라 달라져요. 중요한 삭제는 확인 UI와 복구 정책을 함께 설계하고, `ModelContainer.deleteAllData()`처럼 전체 데이터를 지우는 API를 일반 항목 삭제에 사용하지 않아요.

## transaction으로 여러 변경의 의도를 묶어요

독서 기록을 추가하면서 하루 합계를 갱신하는 두 변경이 함께 성공해야 한다면 transaction을 사용할 수 있어요.

```swift
func addRecord(
  title: String,
  minutes: Int,
  summary: DailySummary,
  in context: ModelContext
) throws {
  try context.transaction {
    let record = ReadingRecord(
      title: title,
      minutes: minutes,
      isCompleted: true
    )

    context.insert(record)
    summary.completedMinutes += minutes
  }
}
```

[`transaction(block:)`](<https://developer.apple.com/documentation/swiftdata/modelcontext/transaction(block:)>)은 closure가 정상적으로 끝난 뒤 pending insert·update·delete를 persistent store에 저장해요. closure가 오류를 던지면 그 save는 실행되지 않지만, 이미 바꾼 memory model까지 자동으로 원래 값이 된다고 가정하지 않아요. 작업 전체를 취소해야 한다면 별도 context로 격리하거나 오류 경계에서 `rollback()` 정책을 명시해요. transaction 안에서는 네트워크 요청이나 사용자 입력처럼 오래 걸리는 작업을 기다리지 말고, 저장할 값이 준비된 뒤 짧은 변경 단위를 수행해요.

## 관계는 model 사이의 연결을 표현해요

책 한 권에 여러 독서 기록이 연결되는 관계를 만들 수 있어요.

```swift
import Foundation
import SwiftData

@Model
final class Book {
  var title: String

  @Relationship(deleteRule: .cascade, inverse: \BookReading.book)
  var readings: [BookReading] = []

  init(title: String) {
    self.title = title
  }
}

@Model
final class BookReading {
  var minutes: Int
  var readAt: Date
  var book: Book?

  init(minutes: Int, readAt: Date = .now, book: Book? = nil) {
    self.minutes = minutes
    self.readAt = readAt
    self.book = book
  }
}
```

`.cascade`는 `Book`을 삭제할 때 연결된 `BookReading`도 삭제하도록 의미를 부여해요. 사용자가 남겨야 할 기록까지 사라지지 않는지 domain 요구를 먼저 확인해야 해요.

CloudKit 자동 동기화를 사용할 schema라면 관계 제약이 더 엄격해요. Apple의 [SwiftData model data 동기화 문서](https://developer.apple.com/documentation/swiftdata/syncing-model-data-across-a-persons-devices)는 CloudKit이 모든 관계를 optional로 요구하고, relationship 변경의 원자적 처리를 보장하지 않으며, `.deny` delete rule을 지원할 수 없다고 설명해요.

## ModelConfiguration으로 저장 방식을 바꿔요

[`ModelConfiguration`](https://developer.apple.com/documentation/swiftdata/modelconfiguration)은 schema와 store의 세부 구성을 설명해요.

### test와 preview는 memory store를 사용해요

```swift
import SwiftData

func makeInMemoryContainer() throws -> ModelContainer {
  let configuration = ModelConfiguration(
    isStoredInMemoryOnly: true
  )

  return try ModelContainer(
    for: ReadingRecord.self,
    configurations: configuration
  )
}
```

in-memory store는 process가 끝나면 사라져 test끼리 디스크 상태가 섞이지 않아요. 그래도 test마다 새 container를 만들어 서로 격리해야 해요.

```swift
import Testing
import SwiftData

@Test
func savesReadingRecord() throws {
  let container = try makeInMemoryContainer()
  let context = ModelContext(container)

  context.insert(
    ReadingRecord(title: "Swift", minutes: 25)
  )
  try context.save()

  let records = try context.fetch(
    FetchDescriptor<ReadingRecord>()
  )

  #expect(records.count == 1)
  #expect(records.first?.minutes == 25)
}
```

### App Group 위치를 선택할 수 있어요

같은 App Group entitlement를 가진 target이 store 파일에 접근해야 한다면 group container를 지정할 수 있어요.

```swift
let configuration = ModelConfiguration(
  "SharedReading",
  schema: Schema([ReadingRecord.self]),
  isStoredInMemoryOnly: false,
  allowsSave: true,
  groupContainer: .identifier("group.com.example.Reading"),
  cloudKitDatabase: .none
)

let container = try ModelContainer(
  for: ReadingRecord.self,
  configurations: configuration
)
```

Apple 문서에서 `GroupContainer.identifier(_:)`는 지정한 App Group container를 persistent storage의 root로 사용하도록 알려 주는 선택이에요. 그러나 위치를 공유하는 것만으로 서로 다른 process의 live context가 하나가 되지는 않아요. 각 process의 context와 저장 시점, 변경 알림, 동시에 쓰는 정책을 별도로 검토해야 해요. Widget에는 전체 database가 아니라 작은 snapshot이면 충분한 경우가 많아요.

## schema 변경과 migration을 설계해요

앱을 업데이트하면서 property를 추가하거나 이름과 타입을 바꾸면 기존 store를 새 schema로 해석해야 해요.

`ModelContainer`는 지원 가능한 변경에 automatic migration을 수행해요. 그 범위를 넘는 변경은 `VersionedSchema`와 `SchemaMigrationPlan`으로 버전 사이의 이동을 설명해야 해요.

### versioned schema를 선언해요

```swift
import Foundation
import SwiftData

enum ReadingSchemaV1: VersionedSchema {
  static let versionIdentifier = Schema.Version(1, 0, 0)

  static var models: [any PersistentModel.Type] {
    [ReadingRecord.self]
  }

  @Model
  final class ReadingRecord {
    var title: String
    var minutes: Int

    init(title: String, minutes: Int) {
      self.title = title
      self.minutes = minutes
    }
  }
}

enum ReadingSchemaV2: VersionedSchema {
  static let versionIdentifier = Schema.Version(2, 0, 0)

  static var models: [any PersistentModel.Type] {
    [ReadingRecord.self]
  }

  @Model
  final class ReadingRecord {
    var title: String
    var minutes: Int
    var note: String?

    init(title: String, minutes: Int, note: String? = nil) {
      self.title = title
      self.minutes = minutes
      self.note = note
    }
  }
}
```

### migration stage를 연결해요

optional property 추가처럼 자동으로 옮길 수 있는 변경은 lightweight stage로 연결할 수 있어요.

```swift
enum ReadingMigrationPlan: SchemaMigrationPlan {
  static var schemas: [any VersionedSchema.Type] {
    [ReadingSchemaV1.self, ReadingSchemaV2.self]
  }

  static var stages: [MigrationStage] {
    [
      .lightweight(
        fromVersion: ReadingSchemaV1.self,
        toVersion: ReadingSchemaV2.self
      ),
    ]
  }
}

let container = try ModelContainer(
  for: ReadingSchemaV2.ReadingRecord.self,
  migrationPlan: ReadingMigrationPlan.self
)
```

값 변환과 정리가 필요하면 custom migration stage의 `willMigrate`와 `didMigrate` closure를 검토해요. migration은 실제 사용자의 오래된 store에서 실행되므로 다음을 준비하는 것이 좋아요.

- 지원 중인 각 과거 schema version의 fixture를 보관해요.
- 새 버전 앱으로 fixture를 열고 record 수와 중요한 값을 검증해요.
- migration 중 앱이 종료되거나 disk 공간이 부족한 실패를 고려해요.
- production data에서 처음 시도하지 말고 release 전에 반복 test해요.

## 동시성에서는 context의 isolation을 지켜요

`ModelContainer.mainContext`는 main actor에 묶여 있어 SwiftUI 화면 작업에 적합해요. 대량 import나 오래 걸리는 저장을 main actor에서 실행하면 UI가 멈출 수 있어요.

`@ModelActor`를 사용하면 actor의 `modelContext`에서 작업을 직렬화할 수 있어요.

```swift
import SwiftData

@ModelActor
actor ReadingImporter {
  func insert(_ inputs: [ReadingInput]) throws {
    for input in inputs {
      modelContext.insert(
        ReadingRecord(
          title: input.title,
          minutes: input.minutes
        )
      )
    }

    try modelContext.save()
  }
}

struct ReadingInput: Sendable {
  let title: String
  let minutes: Int
}
```

```swift
let importer = ReadingImporter(modelContainer: container)
try await importer.insert(inputs)
```

한 context가 추적하는 live model reference를 임의의 task나 actor로 넘겨 수정하지 않아요. 동시성 경계를 넘길 때는 `Sendable` input이나 model의 persistent identifier 같은 안정적인 식별 정보를 전달하고, 목적지 context에서 다시 fetch하는 구조를 고려해요.

## CloudKit 자동 동기화는 별도 제약을 확인해요

SwiftData는 iCloud와 Background Modes capability를 구성하면 CloudKit을 통해 model data를 자동 동기화할 수 있어요. 여러 container 중 특정 private database를 선택하려면 configuration에 명시해요.

```swift
let configuration = ModelConfiguration(
  cloudKitDatabase: .private("iCloud.com.example.Reading")
)

let container = try ModelContainer(
  for: ReadingRecord.self,
  configurations: configuration
)
```

CloudKit capability가 있지만 SwiftData가 sync를 담당하지 않아야 하면 `.none`을 명시할 수 있어요.

```swift
let localOnly = ModelConfiguration(
  cloudKitDatabase: .none
)
```

자동 동기화는 schema 설계까지 자동으로 안전하게 바꿔 주는 기능은 아니에요.

- CloudKit은 SwiftData의 unique constraint를 지원하지 못해요.
- 모든 relationship은 optional이어야 해요.
- production에 배포한 CloudKit schema는 삭제·변경보다 additive change 중심으로 진화해야 해요.
- iCloud 계정, 네트워크, quota와 server 오류 상태를 사용자 경험에 반영해야 해요.
- local save 성공과 다른 기기까지 sync 완료된 시점은 같지 않아요.

자세한 cloud 경계는 [iCloud key-value storage와 CloudKit](./icloud-cloudkit) 문서에서 이어서 설명해요.

## 다른 저장 기술과 비교해요

| 기준             | UserDefaults                | SwiftData                           | 파일                                   |
| ---------------- | --------------------------- | ----------------------------------- | -------------------------------------- |
| 주 데이터        | 작은 설정                   | 구조화된 model과 관계               | byte, JSON, image, document            |
| 조회             | key                         | predicate, sort, fetch              | path와 직접 decode                     |
| 부분 수정        | key 단위                    | model property와 context 변경 추적  | 보통 파일 전체 또는 직접 random access |
| schema migration | 앱이 key·decode 정책을 관리 | 자동 migration + migration plan     | 파일 version과 변환을 직접 관리        |
| SwiftUI 연결     | `@AppStorage`               | `@Query`, environment model context | 별도 observable state 필요             |
| 비밀 저장        | 부적합                      | 부적합                              | 일반 파일만으로는 부적합               |

작은 설정 하나를 저장하기 위해 SwiftData schema를 만드는 것은 과할 수 있고, 수천 개 record를 검색하기 위해 UserDefaults에 큰 `Data` 하나를 넣는 것도 맞지 않아요.

## 자주 발생하는 실수

### context를 전역 singleton처럼 어디서나 공유해요

context는 변경 추적과 concurrency isolation을 가진 작업 단위예요. SwiftUI에서는 environment의 main context를 사용하고, background 작업에는 별도 model actor나 context를 두는 식으로 소유권을 명확히 해요.

### save 오류를 무시해요

```swift
try? modelContext.save()
```

이 코드는 disk, validation, migration 오류를 숨겨요. 사용자 작업이 저장되지 않았는데 성공한 것처럼 보일 수 있으므로 오류를 기록하고 UI 상태로 전달할 경계를 만들어요. 민감한 model 내용 자체를 log에 출력하지는 않아요.

### 모든 payload를 model property에 넣어요

큰 이미지나 영상은 파일에 두고 SwiftData에는 relative path, identifier, 크기, 갱신 시각 같은 metadata만 저장하는 구성이 더 적합할 수 있어요.

### 개발 중 store 삭제로 migration 문제를 피워요

시뮬레이터 앱을 지우면 개발은 다시 되지만 사용자의 production store는 지울 수 없어요. schema version fixture로 migration을 test해야 해요.

## 적용 체크리스트

- 데이터가 단순 설정이 아니라 query와 관계가 필요한 model인가요?
- app root에 필요한 model type을 포함한 container를 한 번 설치했나요?
- UI 작업은 environment context, background 작업은 격리된 context나 model actor를 사용하나요?
- 중요한 작업의 `save()` 오류를 처리하나요?
- fetch 조건, 정렬과 limit을 저장소 query로 표현했나요?
- 큰 payload와 비밀 정보를 model에서 분리했나요?
- schema 변경마다 migration 가능 여부와 과거 fixture를 test하나요?
- CloudKit을 사용한다면 unique·relationship·production schema 제약을 확인했나요?
- test마다 새 in-memory container를 사용하나요?

## 면접에서 자주 나오는 질문

### ModelContainer와 persistent store는 같은 것인가요?

아니에요. persistent store는 데이터가 저장되는 underlying 저장소이고, `ModelContainer`는 schema, configuration, migration을 관리하며 context의 읽기·쓰기를 store에 연결하는 객체예요.

### insert만 호출하면 영구 저장되나요?

`insert`는 model을 context의 변경 추적에 추가해요. 변경은 먼저 memory에 있고, autosave가 실행되거나 `save()`가 성공해야 persistent store에 반영돼요.

### @Query와 FetchDescriptor는 언제 나누어 사용하나요?

SwiftUI 화면이 저장소 변경을 관찰하며 목록을 그릴 때는 `@Query`가 편하고, service·repository·model actor에서 명시적으로 한 번 fetch하거나 세부 option을 제어할 때는 `FetchDescriptor`가 적합해요.

### SwiftData가 있으면 CloudKit code가 전혀 필요 없나요?

자동 sync가 record 전송의 많은 부분을 처리하지만 capability, CloudKit-compatible schema, production schema 배포, 계정·오류·동기화 상태의 사용자 경험은 앱이 설계해야 해요. 직접 CloudKit API 수준의 record와 공유 제어가 필요하면 별도 구현이 필요할 수 있어요.

## 참고 자료

- [Apple Developer Documentation - SwiftData](https://developer.apple.com/documentation/swiftdata)
- [Apple Developer Documentation - ModelContainer](https://developer.apple.com/documentation/swiftdata/modelcontainer)
- [Apple Developer Documentation - ModelContext](https://developer.apple.com/documentation/swiftdata/modelcontext)
- [Apple Developer Documentation - ModelConfiguration](https://developer.apple.com/documentation/swiftdata/modelconfiguration)
- [Apple Developer Documentation - VersionedSchema](https://developer.apple.com/documentation/swiftdata/versionedschema)
- [Apple Developer Documentation - SchemaMigrationPlan](https://developer.apple.com/documentation/swiftdata/schemamigrationplan)
- [Apple Developer Documentation - Syncing model data across a person's devices](https://developer.apple.com/documentation/swiftdata/syncing-model-data-across-a-persons-devices)
