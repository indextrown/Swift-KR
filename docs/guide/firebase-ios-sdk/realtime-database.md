---
title: Firebase Realtime Database와 DataSnapshot
description: Realtime Database의 JSON 트리 모델, DatabaseReference 경로, 비동기 읽기·쓰기와 실시간 listener, DataSnapshot decoding과 수명 주기를 설명합니다.
pageType: doc-wide
outline: false
---

# Firebase Realtime Database와 DataSnapshot

> 면접용 한 줄 요약: **Realtime Database는 모든 데이터를 하나의 JSON tree로 저장하고, `DatabaseReference`가 가리키는 경로의 현재 값을 `DataSnapshot`으로 전달하며 이후 변경은 listener로 계속 관찰합니다.**

Realtime Database에서는 table이나 collection보다 **경로**가 중요해요. 어떤 위치를 읽을지, 얼마나 넓은 subtree를 관찰할지에 따라 전송량과 화면 갱신 범위가 달라집니다.

```text
root
├─ users
│  └─ user-123
│     ├─ displayName: "Mina"
│     └─ dailyGoal: 30
└─ readingSessions
   └─ user-123
      ├─ session-a
      │  ├─ bookTitle: "Swift"
      │  └─ minutes: 25
      └─ session-b
         ├─ bookTitle: "Concurrency"
         └─ minutes: 15
```

## 먼저 알아둘 용어

| 용어                | 의미                                                                                        |
| ------------------- | ------------------------------------------------------------------------------------------- |
| JSON tree           | Realtime Database의 전체 데이터를 구성하는 하나의 중첩 JSON 구조예요.                       |
| `DatabaseReference` | tree 안의 특정 경로를 가리키는 읽기·쓰기 handle이에요.                                      |
| event type          | `.value`, `.childAdded`처럼 어떤 변경을 전달받을지 정하는 종류예요.                         |
| `DataSnapshot`      | event가 발생한 순간 특정 경로의 데이터를 담은 읽기 전용 값이에요.                           |
| observer handle     | 등록한 listener를 나중에 정확히 제거하기 위한 식별자예요.                                   |
| denormalization     | 필요한 읽기 경로를 단순하게 만들기 위해 일부 데이터를 여러 위치에 나누어 저장하는 설계예요. |
| fan-out update      | 여러 경로 변경을 하나의 atomic update로 적용하는 방식이에요.                                |
| server timestamp    | 클라이언트 시계 대신 Firebase server가 기록하는 시각 placeholder예요.                       |

## Database URL을 구성하고 좁은 경로부터 잡아요

Realtime Database instance를 Console에서 만든 뒤 region에 맞는 Database URL이 `GoogleService-Info.plist`와 Firebase 구성에 연결되어야 해요.

```swift
import FirebaseDatabase

let root = Database.database().reference()
let profileReference = root
  .child("users")
  .child("user-123")
```

문자열 경로는 오타가 나기 쉬워 한 곳에 모아둘 수 있어요.

```swift
enum DatabasePath {
  static func user(_ userID: String) -> String {
    "users/\(userID)"
  }

  static func sessions(_ userID: String) -> String {
    "readingSessions/\(userID)"
  }
}

let reference = Database.database()
  .reference(withPath: DatabasePath.user("user-123"))
```

`userID`처럼 경로에 넣는 값은 허용 문자와 소유권을 검증해야 해요. 화면에서 받은 임의 문자열을 그대로 보안 경계로 사용하지 말고 Rules의 `auth.uid`와 비교합니다.

## JSON으로 표현할 수 있는 값을 써요

Realtime Database의 값은 문자열, 숫자, Boolean, `NSNull`, 배열, dictionary처럼 JSON으로 표현할 수 있어야 합니다.

```swift
import FirebaseDatabase

func saveProfile(
  userID: String,
  displayName: String,
  dailyGoal: Int
) async throws {
  let value: [String: Any] = [
    "displayName": displayName,
    "dailyGoal": dailyGoal,
    "updatedAt": ServerValue.timestamp(),
  ]

  try await Database.database()
    .reference(withPath: "users/\(userID)")
    .setValue(value)
}
```

`setValue`는 해당 경로의 기존 값을 통째로 교체해요. 일부 field만 바꾸고 싶다면 `updateChildValues`를 사용합니다.

```swift
func updateDailyGoal(
  userID: String,
  dailyGoal: Int
) async throws {
  let changes: [AnyHashable: Any] = [
    "dailyGoal": dailyGoal,
    "updatedAt": ServerValue.timestamp(),
  ]

  try await Database.database()
    .reference(withPath: "users/\(userID)")
    .updateChildValues(changes)
}
```

값을 삭제할 때는 해당 reference의 `removeValue()`를 사용하거나 update 값에 `NSNull()`을 넣어요.

## 한 번 읽기와 지속 관찰을 구분해요

한 번만 필요한 값은 `getData()`로 읽을 수 있어요.

```swift
import FirebaseDatabase

struct ReadingProfile: Decodable {
  let displayName: String
  let dailyGoal: Int
}

enum ProfileError: Error {
  case notFound
}

func loadProfile(userID: String) async throws -> ReadingProfile {
  let snapshot = try await Database.database()
    .reference(withPath: "users/\(userID)")
    .getData()

  guard snapshot.exists() else {
    throw ProfileError.notFound
  }

  return try snapshot.data(as: ReadingProfile.self)
}
```

`DataSnapshot`은 `Decodable`로 변환할 수 있지만 database 구조와 model의 key·optional 여부가 맞아야 해요. 데이터가 없으면 `exists()`는 `false`, `value`는 `nil`이므로 먼저 정책을 정합니다.

공식 읽기·쓰기 가이드는 불필요한 `getData()` 호출이 bandwidth와 성능 비용을 늘릴 수 있다고 설명해요. 화면이 열려 있는 동안 계속 최신 값이 필요하다면 매번 polling하지 말고 listener를 사용합니다.

## `.value` listener는 처음 한 번과 이후 전체 변화를 전달해요

```swift
import FirebaseDatabase

final class ProfileObserver {
  private let reference: DatabaseReference
  private var handle: DatabaseHandle?

  init(userID: String) {
    self.reference = Database.database()
      .reference(withPath: "users/\(userID)")
  }

  func start(
    onChange: @escaping (Result<ReadingProfile, Error>) -> Void
  ) {
    guard handle == nil else { return }

    handle = reference.observe(.value) { snapshot in
      do {
        guard snapshot.exists() else {
          throw ProfileError.notFound
        }
        onChange(.success(try snapshot.data(as: ReadingProfile.self)))
      } catch {
        onChange(.failure(error))
      }
    } withCancel: { error in
      onChange(.failure(error))
    }
  }

  func stop() {
    guard let handle else { return }
    reference.removeObserver(withHandle: handle)
    self.handle = nil
  }
}
```

`.value`는 listener를 붙인 직후 현재 값을 한 번 전달하고, 그 경로 아래의 child가 바뀔 때마다 subtree 전체 snapshot을 다시 전달해요. root에 붙이면 작은 변경에도 큰 tree를 받게 되므로 **화면이 필요한 가장 좁은 경로**에 붙입니다.

View Controller가 사라진다고 observer가 자동 제거되지는 않아요. `observe`가 반환한 handle과 같은 reference를 보관했다가 명시적으로 제거해야 합니다.

## 목록은 child event로 점진적으로 처리할 수 있어요

큰 목록에서 매번 전체 값을 decoding하기보다 `.childAdded`, `.childChanged`, `.childRemoved`를 사용할 수 있어요.

| event           | 전달 시점                                                                |
| --------------- | ------------------------------------------------------------------------ |
| `.childAdded`   | 기존 child를 순서대로 처음 전달하고, 이후 새 child가 추가될 때 전달해요. |
| `.childChanged` | 직접 child의 값 또는 그 아래 descendant가 바뀔 때 전달해요.              |
| `.childRemoved` | 직접 child가 삭제될 때 삭제 전 데이터를 전달해요.                        |
| `.value`        | 경로의 초기 전체 값과 이후 subtree 전체 변경 결과를 전달해요.            |

```swift
struct ReadingSession: Decodable, Identifiable {
  let id: String
  let bookTitle: String
  let minutes: Int

  private enum CodingKeys: String, CodingKey {
    case bookTitle
    case minutes
  }

  init(id: String, bookTitle: String, minutes: Int) {
    self.id = id
    self.bookTitle = bookTitle
    self.minutes = minutes
  }

  init(from decoder: Decoder) throws {
    let container = try decoder.container(keyedBy: CodingKeys.self)
    self.id = ""
    self.bookTitle = try container.decode(String.self, forKey: .bookTitle)
    self.minutes = try container.decode(Int.self, forKey: .minutes)
  }
}

func decodeSession(_ snapshot: DataSnapshot) throws -> ReadingSession {
  let value = try snapshot.data(as: ReadingSession.self)
  return ReadingSession(
    id: snapshot.key,
    bookTitle: value.bookTitle,
    minutes: value.minutes
  )
}
```

여기서는 database child key를 `Identifiable.id`로 사용하고 실제 JSON field에는 중복 저장하지 않았어요. production model에서는 DTO와 화면 model을 나눠 이런 변환을 더 명확히 할 수 있습니다.

## 여러 경로를 atomic하게 갱신해요

데이터를 읽기 쉬운 구조로 펼치면 같은 정보를 여러 위치에 저장해야 할 수 있어요. 이때 호출을 두 번 나누면 한쪽만 성공할 수 있으므로 root에서 multi-location update를 사용합니다.

```swift
func addReadingSession(
  userID: String,
  bookID: String,
  title: String,
  minutes: Int
) async throws {
  let root = Database.database().reference()
  let sessionKey = root
    .child("readingSessions")
    .child(userID)
    .childByAutoId()
    .key

  guard let sessionKey else { return }

  let session: [String: Any] = [
    "bookID": bookID,
    "bookTitle": title,
    "minutes": minutes,
    "createdAt": ServerValue.timestamp(),
  ]

  let updates: [AnyHashable: Any] = [
    "readingSessions/\(userID)/\(sessionKey)": session,
    "bookReaders/\(bookID)/\(userID)/\(sessionKey)": true,
  ]

  try await root.updateChildValues(updates)
}
```

이 update는 지정한 모든 경로에 함께 적용되거나 모두 적용되지 않아요. 다만 잘못된 중복 데이터가 자동으로 복구되는 것은 아니므로, 어느 경로가 원본인지와 삭제 정책도 설계해야 합니다.

## local event와 server 승인을 구분해요

Realtime Database SDK는 write를 local 상태에 먼저 반영해 listener를 빠르게 호출할 수 있어요. 네트워크 요청이 Rules에서 거절되면 local 상태가 되돌아가며 오류가 전달됩니다. 따라서 화면에서 snapshot을 받았다는 사실만으로 server 저장 완료를 단정하면 안 돼요.

offline queue와 disk persistence가 필요하다면 [Apple 플랫폼 offline 기능](https://firebase.google.com/docs/database/ios/offline-capabilities)을 확인하고 **DatabaseReference를 만들기 전에** persistence 정책을 설정하세요. 테스트마다 cache가 남으면 결과가 달라질 수 있으므로 Emulator와 test lifecycle도 함께 설계합니다.

## Realtime Database와 Firestore 선택 기준

| 기준             | Realtime Database                         | Cloud Firestore              |
| ---------------- | ----------------------------------------- | ---------------------------- |
| 데이터 모델      | 하나의 JSON tree                          | collection과 document        |
| query            | 정렬 기준 하나 중심의 단순 query          | index 기반 복합 query        |
| 넓은 데이터 읽기 | parent snapshot이 subtree 전체를 포함     | query에 맞는 document 집합   |
| 확장 방식        | instance 구성과 sharding을 고려할 수 있음 | 자동 확장에 더 적합          |
| 대표 강점        | 단순 상태, 낮은 지연, presence            | 구조화 데이터, query, 확장성 |

새로운 일반 앱 데이터라면 Firestore를 먼저 검토하고, presence나 단순한 초저지연 공유 상태처럼 Realtime Database의 장점이 분명할 때 선택하는 편이 좋아요.

## 체크리스트

- [ ] root가 아니라 화면에 필요한 가장 좁은 reference를 관찰하나요?
- [ ] `setValue`의 전체 교체와 `updateChildValues`의 부분 변경을 구분했나요?
- [ ] 데이터 없음과 decoding 실패를 서로 다른 상태로 처리하나요?
- [ ] observer handle과 등록한 reference를 함께 보관하고 제거하나요?
- [ ] 중복 저장은 multi-location update로 atomic하게 적용하나요?
- [ ] local event를 server 저장 완료로 오해하지 않나요?
- [ ] 경로 소유권과 입력값을 Security Rules에서도 검증하나요?

## 면접에서 이어질 수 있는 질문

### `DataSnapshot`은 database와 계속 연결된 객체인가요?

아니요. event가 발생한 순간 특정 경로의 값을 담은 변경 불가능한 snapshot이에요. 이후 변화가 필요하면 listener가 새 snapshot을 전달합니다.

### `.value`를 root에 붙이면 왜 위험한가요?

root 아래 어디가 바뀌어도 전체 tree snapshot을 다시 받아 decoding과 네트워크 비용이 커질 수 있어요. 필요한 데이터에 가장 가까운 경로와 query에 listener를 붙여야 합니다.

### `getData()`를 반복 호출하는 것과 listener의 차이는 무엇인가요?

`getData()`는 한 번 읽기이고 listener는 초기 값과 이후 변화를 지속적으로 받아요. 화면이 최신 값을 계속 필요로 한다면 polling보다 listener가 의도에 맞고, 일회성 확인에는 `getData()`가 단순합니다.

## 참고 자료

- [Apple 플랫폼에서 Realtime Database 시작하기](https://firebase.google.com/docs/database/ios/start)
- [Apple 플랫폼에서 데이터 읽기와 쓰기](https://firebase.google.com/docs/database/ios/read-and-write)
- [`DataSnapshot` API Reference](https://firebase.google.com/docs/reference/swift/firebasedatabase/api/reference/Classes/DataSnapshot)
- [Realtime Database offline 기능](https://firebase.google.com/docs/database/ios/offline-capabilities)
- [Realtime Database 데이터 구조화](https://firebase.google.com/docs/database/ios/structure-data)
- [Cloud Firestore와 Realtime Database 비교](https://firebase.google.com/docs/database/rtdb-vs-firestore)
