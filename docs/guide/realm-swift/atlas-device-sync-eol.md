---
title: Atlas Device Sync 종료와 Realm 전환 가이드
description: MongoDB Atlas Device SDK 종료 범위와 Realm Swift v20의 로컬 전용 변화를 구분하고 기존 Sync 앱의 인증, 동기화, 충돌 해결 전환 절차를 설계합니다.
pageType: doc-wide
outline: false
---

# Atlas Device Sync 종료와 Realm 전환 가이드

> 면접용 한 줄 요약: **Atlas Device SDK는 기기 내 Realm과 Atlas Device Sync로 구성됐지만 Sync·App Services는 2025년 9월 30일 종료됐고, Realm Swift v20에는 로컬 데이터베이스 API만 남았습니다.**

사용자가 제시한 [MongoDB Atlas Device SDK for Swift 문서](https://www.mongodb.com/ko-kr/docs/atlas/device-sdks/sdk/swift/)에는 로컬 Realm과 Device Sync가 함께 설명돼 있습니다. 이 문서는 과거 구조와 API를 이해하는 자료로는 유용하지만, Sync·App Services 예제를 현재 새 프로젝트의 시작 절차로 사용하면 안 돼요.

## 이름과 제품 범위를 시간순으로 정리해요

```text
Realm Mobile Database
        │ MongoDB 인수 이후
        ▼
Realm SDK / MongoDB Realm
        │ 2023년 명칭 변경
        ▼
Atlas Device SDK
   ├─ 기기 내 Realm database
   └─ Atlas Device Sync + App Services 연동
        │ 2024년 9월 deprecated
        │ 2025년 9월 30일 EOL
        ▼
현재 Realm Swift community v20
   └─ 기기 내 로컬 Realm database만 제공
```

[MongoDB 공식 종료 안내](https://www.mongodb.com/docs/atlas/device-sdks/deprecation/)는 Atlas Device SDK가 두 부분으로 구성됐다고 설명합니다.

1. **On-device database**: open source community project로 계속 존재해요.
2. **Atlas Device Sync**: deprecated된 뒤 2025년 9월 30일 end-of-life에 도달했어요.

Realm Swift [`v20.0.0` release note](https://github.com/realm/realm-swift/releases/tag/v20.0.0)도 모든 Atlas App Services·Atlas Device Sync 기능을 제거했다고 명시합니다. 즉 service 종료와 client API 제거가 모두 일어났어요.

## 지금 남은 기능과 종료된 기능을 분리해요

| 기능                        | 현재 Realm Swift v20 | 설명                                                     |
| --------------------------- | -------------------- | -------------------------------------------------------- |
| 로컬 Realm file             | 사용 가능            | 기기 안에 객체를 저장해요.                               |
| `Object`, `@Persisted`      | 사용 가능            | 로컬 schema를 정의해요.                                  |
| CRUD·query·notification     | 사용 가능            | 로컬 data를 쓰고 live result를 관찰해요.                 |
| SwiftUI property wrapper    | 사용 가능            | 로컬 Realm 변경을 View와 연결해요.                       |
| local migration·encryption  | 사용 가능            | file schema와 at-rest 보안을 관리해요.                   |
| Atlas Device Sync           | 제거·종료            | Atlas와 기기 사이 자동 동기화가 없어요.                  |
| App Services Authentication | 제거·종료            | `App`, `Credentials`, `User` login 흐름이 없어요.        |
| Functions의 SDK 직접 호출   | 제거                 | client에서 Realm SDK로 function을 호출할 수 없어요.      |
| Rules·Roles 기반 Sync 권한  | 제거·종료            | 새 backend의 authorization을 별도로 구현해야 해요.       |
| Sync subscription·session   | 제거                 | flexible sync query subscription과 session API가 없어요. |

:::warning v10 pin은 서비스 수명을 연장하지 않아요
`v20.0.0` release note는 기존 Device Sync 사용자가 `v10`에 고정하라고 안내했습니다. 이는 제거된 symbol을 사용하는 기존 source를 당장 build하기 위한 version 선택이지, 이미 EOL에 도달한 Atlas Device Sync와 App Services가 계속 제공된다는 뜻이 아닙니다.
:::

## codebase에서 과거 Sync 의존성을 찾아요

다음 symbol이나 개념이 보이면 로컬 Realm만 사용하는 앱이 아닐 가능성이 큽니다.

| 찾을 대상                   | 과거 책임                     | 전환 시 필요한 새 책임            |
| --------------------------- | ----------------------------- | --------------------------------- |
| `App(id:)`                  | App Services app 연결         | 새 backend client 구성            |
| `Credentials`               | App Services 인증 credential  | OAuth/OIDC 또는 선택한 인증 SDK   |
| `User`·`currentUser`        | login session과 user identity | 새 인증 session과 account model   |
| `flexibleSyncConfiguration` | synced Realm 구성             | local Realm 구성 + 별도 pull/push |
| `subscriptions`             | device에 내려받을 query set   | server API query·cursor 정책      |
| `SyncSession`               | upload/download·error 상태    | network queue·retry·monitoring    |
| `AsymmetricObject`          | Atlas로 write-only ingest     | 명시적 upload endpoint·ack 처리   |
| App Services Rules·Roles    | server data authorization     | backend의 인증·인가 검사          |

Xcode의 Find navigator에서 이름만 검색하지 말고 다음 흐름도 추적하세요.

```text
로그인 성공
  └─> user configuration 생성
       └─> Realm async open
            ├─> subscription 갱신
            ├─> progress 표시
            └─> client reset·sync error 처리
```

type 이름을 wrapper 뒤에 숨긴 codebase라면 composition root, repository 구현, login/logout, background refresh와 test double까지 확인해야 합니다.

## 전환 목표를 세 가지 중 먼저 선택해요

### 1. 완전한 로컬 앱으로 전환

여러 device·server 공유가 더 이상 필요 없다면 Sync 의존성을 제거하고 local configuration으로 엽니다.

```swift
var configuration = Realm.Configuration.defaultConfiguration
configuration.schemaVersion = 3
let realm = try Realm(configuration: configuration)
```

가장 단순하지만 계정 간 복원, web console 수정, 여러 device 동기화 기능은 사라집니다. 기존 Atlas data를 언제 어떻게 기기로 내려받을지와 logout 시 local data 정책도 필요해요.

### 2. Realm은 로컬 저장소로 유지하고 별도 backend와 동기화

Realm의 query·notification·오프라인 저장은 유지하되 networking과 sync protocol을 앱·server가 직접 책임집니다.

```text
SwiftUI / UIKit
      │
      ▼
Local Realm ── Outbox ──> 새 Backend API ──> Server Database
      ▲                         │
      └──── cursor 기반 Pull ───┘
```

이 경로는 UI 변경을 최소화할 수 있지만 과거 Device Sync가 맡았던 retry, ordering, conflict resolution, auth, access control과 observability를 새로 설계해야 해요.

### 3. local database까지 교체

SwiftData, Core Data, SQLite 계층 또는 새 sync solution의 database로 옮길 수 있습니다. package 유지보수 위험을 줄일 수 있지만 model, query, observation, migration과 test가 모두 영향을 받아요. `Object`를 feature 전체에 직접 노출한 앱일수록 교체 비용이 커집니다.

도입 당시의 편의보다 앞으로 3~5년의 OS 지원 범위, 팀 역량, offline 요구와 vendor support를 기준으로 선택하세요.

## 직접 동기화한다면 Outbox부터 설계해요

network 요청을 먼저 보내고 성공하면 Realm을 바꾸는 방식은 offline UX가 약하고 process 종료 사이에 상태를 잃기 쉽습니다. local 변경과 upload 의도를 같은 transaction에 기록하는 Outbox pattern을 사용할 수 있어요.

```swift
import Foundation
import RealmSwift

enum MutationOperation: String, PersistableEnum {
  case create
  case update
  case delete
}

final class PendingMutation: Object {
  @Persisted(primaryKey: true) var id: ObjectId
  @Persisted(indexed: true) var entityID = ""
  @Persisted var operation = MutationOperation.update
  @Persisted var payload = Data()
  @Persisted var createdAt = Date()
  @Persisted var retryCount = 0
}

struct BookMutationPayload: Codable, Sendable {
  let id: String
  let title: String
  let progress: Int
  let clientRevision: Int
}
```

```swift
func updateBookAndEnqueue(
  book: Book,
  title: String,
  progress: Int,
  encoder: JSONEncoder,
  realm: Realm
) throws {
  let payload = BookMutationPayload(
    id: book.id.stringValue,
    title: title,
    progress: progress,
    clientRevision: Int(book.updatedAt.timeIntervalSince1970)
  )
  let encoded = try encoder.encode(payload)

  try realm.write {
    book.title = title
    book.progress = progress
    book.updatedAt = Date()

    let mutation = PendingMutation()
    mutation.entityID = book.id.stringValue
    mutation.operation = .update
    mutation.payload = encoded
    realm.add(mutation)
  }
}
```

local object update와 `PendingMutation` 추가가 한 transaction이므로 둘 중 하나만 남지 않습니다. upload worker는 다음 순서로 동작할 수 있어요.

1. 오래된 pending mutation을 제한된 batch로 읽어요.
2. mutation ID를 idempotency key로 server에 전송해요.
3. server가 revision과 결과를 응답해요.
4. 성공을 확인한 transaction에서 Outbox 항목을 삭제하고 server revision을 저장해요.
5. 실패하면 backoff, network 도달 가능성, 인증 갱신과 최대 재시도 정책을 적용해요.

Outbox만 추가한다고 완전한 Sync가 되지는 않습니다. server 변경을 가져오는 inbox/pull, delete tombstone, ordering과 충돌 해결이 함께 필요해요.

## Pull은 cursor와 원자적 적용이 필요해요

```text
GET /changes?cursor=abc
        │
        ├─ upserts [BookPayload]
        ├─ deletes [BookID]
        └─ nextCursor def
                │
                ▼
Realm.write {
  upsert 모두 적용
  tombstone 삭제 적용
  cursor = def 저장
}
```

data 적용과 `nextCursor` 저장을 같은 transaction에 넣으면 process가 중간에 종료돼도 일부 data만 반영한 채 다음 cursor로 넘어가지 않습니다. response가 너무 크면 server cursor를 더 작은 page로 쪼개고 page마다 원자적으로 적용해요.

## 충돌 정책은 코드보다 먼저 문장으로 정의해요

| 정책              | 장점                                     | 위험                                           |
| ----------------- | ---------------------------------------- | ---------------------------------------------- |
| server wins       | 구현이 단순하고 중앙 정책이 명확해요.    | offline 사용자의 변경을 잃을 수 있어요.        |
| client wins       | 사용자가 방금 한 변경을 유지하기 쉬워요. | 오래된 client가 새 server 값을 덮을 수 있어요. |
| last write wins   | timestamp 비교가 간단해요.               | device clock 차이와 동시 수정에 약해요.        |
| revision compare  | stale write를 server가 거부할 수 있어요. | conflict UI·retry logic이 필요해요.            |
| field-level merge | 독립 field 변경을 보존할 수 있어요.      | schema와 규칙이 복잡해져요.                    |

“가장 최근 값”이 무엇을 뜻하는지 server sequence인지 device time인지 명확히 해야 합니다. 금액·재고처럼 손실되면 안 되는 data는 client의 자동 last-write-wins보다 server transaction과 domain command가 적합해요.

## 인증과 인가를 따로 이전해요

MongoDB 종료 안내는 Device SDK를 통한 Authentication and User Management도 더 이상 제공되지 않는다고 설명합니다. 새 인증 provider를 연결했다고 data 보안이 완성되는 것은 아니에요.

```text
Authentication: 이 요청을 보낸 사용자는 누구인가?
Authorization: 이 사용자가 이 Book을 읽거나 수정할 수 있는가?
```

- access·refresh token은 Realm 일반 property보다 Keychain 보관을 우선해요.
- server는 client가 보낸 `ownerID`를 신뢰하지 말고 인증 token의 subject와 비교해요.
- logout 시 local Realm, encryption key, Outbox와 background task를 어떻게 정리할지 결정해요.
- token 만료 중 Outbox 요청이 실패하면 재로그인 전까지 보존할지 사용자에게 알릴지 정해요.
- 과거 Rules·Roles에 있던 조건을 backend authorization test로 옮겨요.

## EOL 이후 전환 순서

현재는 종료일이 지난 상태이므로 새 Sync traffic이 계속된다고 가정하지 말고 보유한 client·server data와 backup부터 확인합니다.

1. **동결**: Sync 관련 dependency와 server 설정을 변경하기 전에 source, schema, App Services 설정과 backup을 보존해요.
2. **목록화**: 인증, Sync, Function, Rules·Roles, Trigger 의존성을 기능별로 찾아요.
3. **data source 결정**: Atlas, device Realm, export 중 무엇을 migration의 기준 원본으로 삼을지 정해요.
4. **목표 architecture 선택**: local-only, Realm+custom sync, local database 교체 중 하나를 결정해요.
5. **인증·인가 선행**: 새 identity와 server permission을 먼저 검증해요.
6. **dual-read 또는 export/import 검증**: record 수, primary key, 관계와 삭제 상태를 대조해요.
7. **client 전환**: feature flag와 단계적 rollout으로 새 경로를 활성화해요.
8. **관찰**: upload 지연, conflict, auth 실패, data 불일치 지표를 수집해요.
9. **제거**: 충분한 rollback 기간 뒤에 v10 Sync code와 secret·설정을 삭제해요.

이미 종료된 service에서 export하지 못했다면 client device에 남은 Realm file, Atlas backup과 조직의 MongoDB support 계약을 확인하세요. 가능한 복구 범위를 문서 없이 추측해 기존 파일을 덮어쓰지 않습니다.

## 전환 체크리스트

- [ ] local Realm API와 제거된 Sync API를 source에서 구분했나요?
- [ ] `v10` 고정이 EOL service를 되살리지 않는다는 점을 공유했나요?
- [ ] App Services 인증·Functions·Rules·Roles 의존성을 모두 찾았나요?
- [ ] migration의 기준 data source와 record 대조 방법이 있나요?
- [ ] custom sync라면 Outbox, cursor, tombstone, retry와 idempotency를 설계했나요?
- [ ] domain별 conflict policy를 server와 client가 같은 의미로 구현하나요?
- [ ] token은 Keychain에 저장하고 server authorization을 별도로 검증하나요?
- [ ] rollback 기간과 Sync code 제거 조건을 정의했나요?

## 면접에서 이어질 수 있는 질문

### Realm Swift v20에서도 MongoDB Atlas에 연결할 수 있나요?

Realm SDK가 제공하던 Atlas Device Sync·App Services 연결 API로는 할 수 없습니다. v20은 로컬 Realm 데이터베이스 기능만 남겼어요. Atlas를 server database로 계속 사용하려면 직접 관리하는 backend API 같은 별도 연결 계층이 필요합니다.

### Realm을 local cache로 유지하면 Device Sync와 같은가요?

아니요. local Realm은 persistence와 query·notification을 제공할 뿐 upload/download, 인증, 권한, retry, conflict resolution과 client reset을 자동 제공하지 않습니다. 이 책임을 새 architecture에서 명시적으로 구현해야 해요.

## 참고 자료

- [MongoDB Atlas Device SDK for Swift 문서](https://www.mongodb.com/ko-kr/docs/atlas/device-sdks/sdk/swift/)
- [MongoDB Atlas Device SDK 종료 안내](https://www.mongodb.com/docs/atlas/device-sdks/deprecation/)
- [MongoDB Atlas App Services 종료 안내](https://www.mongodb.com/docs/atlas/app-services/deprecation/)
- [Realm Swift v20.0.0 release note](https://github.com/realm/realm-swift/releases/tag/v20.0.0)
- [Realm Swift community 브랜치](https://github.com/realm/realm-swift/tree/community)
- [Realm Swift 공식 저장소](https://github.com/realm/realm-swift)
