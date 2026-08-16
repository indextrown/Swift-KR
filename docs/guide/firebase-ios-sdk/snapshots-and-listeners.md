---
title: Firebase Snapshot과 Listener 수명 주기
description: Auth, Realtime Database, Firestore, Cloud Storage에서 snapshot과 listener가 뜻하는 상태를 비교하고 SwiftUI에서 안전하게 소유하고 해제하는 방법을 설명합니다.
pageType: doc-wide
outline: false
---

# Firebase Snapshot과 Listener 수명 주기

> 면접용 한 줄 요약: **Snapshot은 특정 시점의 데이터나 작업 상태를 고정한 값이고 Listener는 새 Snapshot을 계속 전달하는 구독이므로, 화면은 초기·빈 값·오류를 구분하고 소유자는 등록 handle을 명시적으로 해제해야 합니다.**

Firebase 여러 제품이 `Snapshot`이라는 이름을 쓰지만 담는 대상은 서로 달라요. 이름만 보고 같은 decoding이나 저장 완료 의미를 기대하면 버그가 생깁니다.

```text
변경 가능한 원격 상태 또는 작업
       │
       ├─ 시각 t0 ── Snapshot A
       ├─ 시각 t1 ── Snapshot B
       └─ 시각 t2 ── Snapshot C
                     ▲
                     │ 계속 전달하는 구독
                  Listener
```

## Snapshot과 Listener는 역할이 달라요

| 개념     | 질문                                      | 성질                                               |
| -------- | ----------------------------------------- | -------------------------------------------------- |
| Snapshot | “이 event가 발생한 순간 상태는 무엇인가?” | 읽기 전용 point-in-time view                       |
| Listener | “앞으로 상태가 바뀌면 알려 줄 수 있는가?” | callback이 여러 번 호출되는 지속 구독              |
| Handle   | “이 구독을 어떻게 정확히 끝낼 것인가?”    | 제품별 제거 API에 전달하는 token 또는 registration |

Snapshot을 변수에 보관해도 원격 상태와 자동으로 함께 변하지 않아요. 변화가 일어나면 listener가 **새 snapshot**을 전달합니다.

## 제품별 Snapshot을 한눈에 비교해요

| 제품               | 전달 값               | 나타내는 것                      | 주요 정보                                  |
| ------------------ | --------------------- | -------------------------------- | ------------------------------------------ |
| Authentication     | `User?`               | 현재 인증 session의 사용자       | `uid`, provider, email                     |
| Realtime Database  | `DataSnapshot`        | 한 database path의 JSON subtree  | `key`, `value`, `children`, `exists()`     |
| Firestore document | `DocumentSnapshot`    | 한 document의 field와 metadata   | `documentID`, `exists`, `data()`, metadata |
| Firestore query    | `QuerySnapshot`       | query의 현재 document 집합       | `documents`, `documentChanges`, metadata   |
| Cloud Storage task | `StorageTaskSnapshot` | upload·download 작업의 순간 상태 | `status`, `progress`, `metadata`, `error`  |

`StorageTaskSnapshot`은 저장된 file bytes의 버전 snapshot이 아니고 전송 작업 상태예요. Firestore `QuerySnapshot`은 database 전체가 아니라 특정 query 결과예요. 관찰 범위를 타입 이름과 함께 확인해야 합니다.

## 제품마다 등록과 해제 API가 달라요

| 제품              | 등록                                 | 반환 handle                        | 해제                                    |
| ----------------- | ------------------------------------ | ---------------------------------- | --------------------------------------- |
| Auth              | `addStateDidChangeListener`          | `AuthStateDidChangeListenerHandle` | `removeStateDidChangeListener`          |
| Realtime Database | `reference.observe(...)`             | `DatabaseHandle`                   | `reference.removeObserver(withHandle:)` |
| Firestore         | `reference.addSnapshotListener(...)` | `ListenerRegistration`             | `registration.remove()`                 |
| Storage task      | `task.observe(.progress, ...)`       | `StorageHandle`                    | `task.removeObserver(withHandle:)`      |

서로 비슷해 보여도 handle을 등록한 객체와 해제하는 객체가 맞아야 해요. Realtime Database handle은 등록한 `DatabaseReference`에서, Storage handle은 등록한 task에서 제거합니다.

## 초기 callback은 “변경이 일어났다”만 뜻하지 않아요

실시간 listener는 대개 등록 직후 현재 상태를 먼저 전달해요.

- Auth listener는 저장된 인증 session 초기화가 끝난 상태를 전달해요.
- Realtime Database `.value`는 현재 path 값을 한 번 전달해요.
- Firestore listener는 현재 document 또는 query 결과 snapshot을 전달해요.
- Firestore query의 첫 `documentChanges`에서는 현재 결과가 `.added`로 나타나요.
- Storage observer는 등록한 task가 해당 status event를 발생시킬 때 전달해요.

따라서 첫 callback을 모두 “사용자가 방금 수정했다”는 분석 event로 기록하면 안 돼요. 초기 동기화와 실제 사용자 action을 별도 문맥으로 구분합니다.

## 없는 값, 빈 결과, 실패는 서로 달라요

```text
loading
  ├─ 성공 + 값 있음 ── content
  ├─ 성공 + 값 없음 ── empty / notFound
  └─ 실패 ─────────── error
```

| 타입                  | 없음 또는 빈 상태 확인                                                 |
| --------------------- | ---------------------------------------------------------------------- |
| `User?`               | `nil`이면 signed out이며, 초기 확인 중 상태는 앱에서 따로 둬요.        |
| `DataSnapshot`        | `exists() == false`, `value == nil`                                    |
| `DocumentSnapshot`    | `exists == false`, `data() == nil`                                     |
| `QuerySnapshot`       | `documents.isEmpty`                                                    |
| `StorageTaskSnapshot` | 대상 데이터 없음이 아니라 task의 success·failure와 `error`를 확인해요. |

decoding 실패를 empty로 바꾸지 마세요. schema가 깨졌는데 “아직 데이터가 없습니다”라고 표시하면 운영 오류가 숨겨집니다.

## local 상태와 server 상태를 구분해요

Firebase database SDK는 사용자의 write를 빠르게 보이기 위해 local state에 먼저 적용할 수 있어요.

| 제품              | 빠른 local 반영                                   | server 상태 판단                                       |
| ----------------- | ------------------------------------------------- | ------------------------------------------------------ |
| Realtime Database | local event가 먼저 발생하고 거절 시 rollback 가능 | write completion과 오류를 확인                         |
| Firestore         | latency compensation으로 listener가 먼저 호출     | `metadata.hasPendingWrites` 또는 write completion 확인 |
| Storage           | task progress가 실제 전송 상태를 표현             | `.success` snapshot 또는 async method 반환 확인        |
| Auth              | SDK가 session 복원·token 갱신을 관리              | auth listener와 작업 오류를 확인                       |

Firestore의 `isFromCache`는 cache 출처를, `hasPendingWrites`는 commit되지 않은 local write 포함 여부를 뜻해요. 두 값을 같은 의미로 사용하지 않습니다.

## SwiftUI에서는 화면보다 오래 사는 소유자를 정해요

SwiftUI `body` 안에서 listener를 등록하면 view 계산 때마다 중복 등록될 수 있어요. `ObservableObject` 같은 reference owner가 하나의 registration을 보관하도록 구성합니다.

```swift
import Combine
import FirebaseFirestore

@MainActor
final class BooksViewModel: ObservableObject {
  enum State {
    case loading
    case empty
    case content([ReadingBook])
    case failed(String)
  }

  @Published private(set) var state: State = .loading

  private var registration: ListenerRegistration?

  func start(userID: String) {
    guard registration == nil else { return }
    state = .loading

    registration = Firestore.firestore()
      .collection("users")
      .document(userID)
      .collection("books")
      .order(by: "title")
      .addSnapshotListener { [weak self] snapshot, error in
        Task { @MainActor in
          guard let self else { return }

          if let error {
            self.state = .failed(error.localizedDescription)
            return
          }

          guard let snapshot else {
            self.state = .failed("응답 snapshot이 없습니다.")
            return
          }

          do {
            let books = try snapshot.documents.map {
              try $0.data(as: ReadingBook.self)
            }
            self.state = books.isEmpty ? .empty : .content(books)
          } catch {
            self.state = .failed("책 데이터를 해석하지 못했습니다.")
          }
        }
      }
  }

  func stop() {
    registration?.remove()
    registration = nil
  }
}
```

화면의 의도에 따라 listener lifetime을 선택해요.

```swift
import SwiftUI

struct BooksView: View {
  let userID: String
  @StateObject private var viewModel = BooksViewModel()

  var body: some View {
    BooksContent(state: viewModel.state)
      .onAppear {
        viewModel.start(userID: userID)
      }
      .onDisappear {
        viewModel.stop()
      }
  }
}
```

tab을 오갈 때도 항상 최신 데이터가 필요하면 앱 feature scope가 listener를 더 오래 소유할 수 있어요. 반대로 화면이 사라진 동안 update가 필요 없다면 `onDisappear`에서 제거해 읽기와 UI 작업을 줄입니다. 중요한 것은 우연한 `deinit`에만 기대지 않고 **등록 지점과 해제 지점을 같은 소유자에 두는 것**이에요.

Swift concurrency의 `Task`를 취소해도 callback 기반 Firebase listener가 자동 제거되지는 않아요. listener API를 `AsyncStream`으로 감쌌다면 stream의 `onTermination`에서 registration을 제거해야 합니다.

## 목록 갱신 전략을 데이터 크기에 맞춰요

Firestore `QuerySnapshot`에는 두 가지 정보가 있어요.

```text
snapshot.documents
└─ 현재 query 결과 전체

snapshot.documentChanges
├─ added(oldIndex, newIndex)
├─ modified(oldIndex, newIndex)
└─ removed(oldIndex, newIndex)
```

| 전략                   | 장점                               | 주의점                                            |
| ---------------------- | ---------------------------------- | ------------------------------------------------- |
| 전체 배열 재생성       | 구현이 단순하고 상태 일관성이 쉬움 | 매우 큰 결과를 매번 decoding할 수 있음            |
| `documentChanges` 적용 | 변경된 항목만 처리 가능            | index 이동·batch 순서를 잘못 적용하면 불일치 발생 |

SwiftUI `List`나 diffable data source가 stable ID를 바탕으로 차이를 계산한다면 먼저 전체 배열 교체로 정확성을 확보하세요. profiling 결과가 필요성을 보여 줄 때 `documentChanges` 기반 증분 갱신으로 옮기는 편이 안전합니다.

## 중복 Listener를 찾는 진단법

같은 snapshot이 예상보다 여러 번 처리된다면 다음을 확인해요.

1. `body`, cell 재사용 callback, 반복되는 `.task` 안에서 직접 등록하지 않았는지 봐요.
2. `start()`에 이미 handle이 있는지 막는 guard가 있는지 확인해요.
3. 사용자 ID나 query가 바뀔 때 이전 listener를 먼저 제거했는지 봐요.
4. listener callback과 local optimistic update가 같은 배열을 각각 수정하지 않는지 확인해요.
5. Firestore에서 metadata change까지 포함해 등록했는지 확인해요.
6. debug log에 등록·해제 지점과 reference path를 함께 기록해요.

동일한 값처럼 보여도 Firestore는 pending writes나 cache metadata 변화로 새 snapshot을 전달할 수 있어요. 무조건 `removeDuplicates`하기 전에 UI가 그 metadata를 표현해야 하는지 결정합니다.

## 체크리스트

- [ ] 사용하는 Snapshot이 데이터 값인지 task 상태인지 설명할 수 있나요?
- [ ] loading, empty, decoding failure, permission failure를 구분하나요?
- [ ] 초기 callback을 사용자 변경 event로 오해하지 않나요?
- [ ] local pending 상태와 server 확정 상태를 구분하나요?
- [ ] listener handle과 제거 API를 같은 owner가 관리하나요?
- [ ] `start()` 중복 등록을 막고 query 변경 전 이전 listener를 제거하나요?
- [ ] callback에서 UI 상태를 Main Actor에서 갱신하나요?
- [ ] 전체 배열과 증분 diff 중 요구 규모에 맞는 전략을 선택했나요?

## 면접에서 이어질 수 있는 질문

### Snapshot을 보관하면 자동으로 최신 값이 되나요?

아니요. Snapshot은 특정 시점의 읽기 전용 값이에요. 최신 상태는 listener가 전달한 새 Snapshot으로 교체해야 합니다.

### SwiftUI `.task`가 취소되면 Firebase listener도 끝나나요?

callback 기반 listener는 자동으로 끝나지 않아요. 반환된 handle이나 registration을 직접 제거해야 하고, `AsyncStream` wrapper라면 `onTermination`에서 정리합니다.

### `QuerySnapshot.documentChanges`를 항상 써야 하나요?

아니요. 작은 목록에서는 전체 결과를 새 배열로 만들고 UI diffing에 맡기는 편이 단순하고 안전할 수 있어요. 실제 성능 문제가 확인될 때 증분 적용을 선택합니다.

## 참고 자료

- [Firebase Auth 사용자 관리](https://firebase.google.com/docs/auth/ios/manage-users)
- [`DataSnapshot` API Reference](https://firebase.google.com/docs/reference/swift/firebasedatabase/api/reference/Classes/DataSnapshot)
- [Firestore 실시간 update 수신](https://firebase.google.com/docs/firestore/query-data/listen)
- [`SnapshotMetadata` API Reference](https://firebase.google.com/docs/reference/swift/firebasefirestore/api/reference/Classes/SnapshotMetadata)
- [`StorageTaskSnapshot` API Reference](https://firebase.google.com/docs/reference/swift/firebasestorage/api/reference/Classes/StorageTaskSnapshot)
- [Cloud Storage 파일 upload 진행률 관찰](https://firebase.google.com/docs/storage/ios/upload-files#monitor_upload_progress)
