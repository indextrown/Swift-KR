---
title: Cloud Storage 파일 업로드와 StorageTaskSnapshot
description: Firebase Cloud Storage의 object path와 metadata, 메모리·파일 기반 업로드와 다운로드, 진행률 관찰과 StorageTaskSnapshot의 의미를 설명합니다.
pageType: doc-wide
outline: false
---

# Cloud Storage 파일 업로드와 StorageTaskSnapshot

> 면접용 한 줄 요약: **Cloud Storage는 이미지·동영상 같은 binary object를 bucket의 path로 저장하고, `StorageUploadTask`의 진행 상태는 immutable `StorageTaskSnapshot`으로 관찰하며 접근 권한은 Storage Security Rules로 검사합니다.**

Cloud Storage는 Firestore처럼 field를 query하는 데이터베이스가 아니에요. 파일 bytes와 content type, 크기 같은 metadata를 저장하는 object storage입니다.

```text
Firestore document
┌────────────────────────────────┐
│ title: "프로필 이미지"         │
│ ownerID: "user-123"           │
│ storagePath: "users/.../a.jpg"│
└────────────────────────────────┘
                │ path로 연결
                ▼
Cloud Storage bucket
└─ users/user-123/profile/a.jpg
   ├─ binary bytes
   └─ metadata: image/jpeg, size, ...
```

검색·정렬할 정보는 Firestore나 Realtime Database에, 큰 원본 bytes는 Storage에 두는 조합이 일반적이에요.

## 먼저 알아둘 용어

| 용어                  | 의미                                                                                |
| --------------------- | ----------------------------------------------------------------------------------- |
| bucket                | Cloud Storage object를 담는 최상위 저장 공간이에요.                                 |
| object                | 특정 path에 저장된 파일 bytes와 metadata예요.                                       |
| `StorageReference`    | bucket 안의 object 또는 prefix 경로를 가리키는 handle이에요.                        |
| `StorageMetadata`     | content type, 크기, custom metadata 같은 object 설명이에요.                         |
| upload task           | 업로드를 실행하고 pause·resume·cancel할 수 있는 작업 객체예요.                      |
| `StorageTaskSnapshot` | upload·download task의 특정 순간 status, progress, metadata, error를 담은 값이에요. |
| download URL          | 저장된 object를 내려받을 수 있도록 발급받는 URL이에요.                              |
| Rules                 | path, 인증 정보, metadata, size 등을 기준으로 object 요청을 허용하거나 거절해요.    |

## bucket을 만들기 전에 요금제와 설정 파일을 확인해요

2026년 8월 현재 [Apple 플랫폼 Cloud Storage 시작 가이드](https://firebase.google.com/docs/storage/ios/start)는 Cloud Storage를 사용하려면 project가 사용량 기반 Blaze 요금제여야 한다고 안내해요. bucket location과 예상 전송량을 정하고 budget alert, 사용량 dashboard를 먼저 설정하세요. 무료 사용 구간이 있더라도 무제한 무료를 뜻하지 않습니다.

새 기본 bucket 이름은 `PROJECT_ID.firebasestorage.app` 형식이고, 2024년 9월 이전에 만든 legacy 기본 bucket은 `PROJECT_ID.appspot.com` 형식일 수 있어요. Storage를 Console에서 나중에 활성화했다면 bucket 정보가 포함된 최신 `GoogleService-Info.plist`를 다시 내려받아 앱 구성을 갱신합니다.

Xcode target에는 `FirebaseStorage` product를 추가하고 공식 시작 가이드에 따라 **Other Linker Flags**의 `-ObjC`도 확인해요. 실제 project 설정에서는 선택한 SDK release와 공식 guide의 최신 요구사항을 다시 검토합니다.

## object path는 사용자 소유권이 드러나게 설계해요

```swift
import FirebaseStorage

enum StoragePath {
  static func profileImage(
    userID: String,
    fileName: String
  ) -> String {
    "users/\(userID)/profile/\(fileName)"
  }
}

let reference = Storage.storage()
  .reference()
  .child(
    StoragePath.profileImage(
      userID: "user-123",
      fileName: "avatar.jpg"
    )
  )
```

Storage의 `/`는 Console에서 folder처럼 보이게 하는 path delimiter예요. 실제 권한은 path 문자열만으로 생기지 않고 Security Rules가 `request.auth.uid`와 path의 `userID`를 비교해야 합니다.

사용자가 보낸 원래 파일명을 그대로 path에 넣으면 충돌, 허용하지 않은 문자, 개인정보 노출 문제가 생길 수 있어요. 앱이 UUID 같은 object ID를 만들고 확장자와 content type을 검증하는 편이 안전합니다.

## 작은 Data는 async로 간단히 업로드해요

이미 메모리에 있고 크기가 작은 thumbnail이라면 `putDataAsync`를 사용할 수 있어요.

```swift
import FirebaseStorage

func uploadThumbnail(
  data: Data,
  userID: String,
  imageID: String
) async throws -> StorageMetadata {
  let reference = Storage.storage()
    .reference(withPath: "users/\(userID)/thumbnails/\(imageID).jpg")

  let metadata = StorageMetadata()
  metadata.contentType = "image/jpeg"
  metadata.customMetadata = [
    "ownerID": userID,
  ]

  return try await reference.putDataAsync(
    data,
    metadata: metadata
  )
}
```

`putDataAsync`는 전체 `Data`를 메모리에 들고 있으므로 큰 이미지·동영상에는 적합하지 않아요. PhotosPicker 결과를 무조건 `Data`로 확장하기보다 임시 파일 URL로 내보낸 뒤 file upload를 검토합니다.

custom metadata는 검색용 database나 신뢰할 수 있는 권한 원장이 아니에요. client가 쓸 수 있는 metadata는 Rules에서 허용 값을 검증하고, query가 필요한 정보는 Firestore document에도 저장합니다.

## 큰 파일은 disk URL에서 업로드해요

```swift
import Combine
import FirebaseStorage
import Foundation

@MainActor
final class FileUploader: ObservableObject {
  @Published private(set) var fractionCompleted = 0.0

  func uploadVideo(
    fileURL: URL,
    userID: String,
    videoID: String
  ) async throws -> StorageMetadata {
    let reference = Storage.storage()
      .reference(withPath: "users/\(userID)/videos/\(videoID).mov")

    let metadata = StorageMetadata()
    metadata.contentType = "video/quicktime"

    return try await reference.putFileAsync(
      from: fileURL,
      metadata: metadata
    ) { [weak self] progress in
      guard let progress else { return }

      Task { @MainActor in
        self?.fractionCompleted = progress.fractionCompleted
      }
    }
  }
}
```

async API의 progress closure는 Foundation `Progress?`를 전달하고 완료 시 `StorageMetadata`를 반환해요. 화면을 벗어났을 때 upload 자체를 취소하거나 pause해야 한다면 반환값만 기다리는 방식보다 `StorageUploadTask`를 직접 소유합니다.

## `StorageUploadTask`를 관찰하고 제어해요

```swift
import FirebaseStorage

final class ManagedUpload {
  private(set) var task: StorageUploadTask?
  private var progressHandle: StorageHandle?

  func start(
    fileURL: URL,
    path: String,
    onProgress: @escaping (Double) -> Void,
    onSuccess: @escaping (StorageMetadata?) -> Void,
    onFailure: @escaping (Error?) -> Void
  ) {
    let reference = Storage.storage().reference(withPath: path)
    let metadata = StorageMetadata()
    metadata.contentType = "image/jpeg"

    let task = reference.putFile(
      from: fileURL,
      metadata: metadata
    )
    self.task = task

    progressHandle = task.observe(.progress) { snapshot in
      onProgress(snapshot.progress?.fractionCompleted ?? 0)
    }

    task.observe(.success) { snapshot in
      onSuccess(snapshot.metadata)
    }

    task.observe(.failure) { snapshot in
      onFailure(snapshot.error)
    }
  }

  func pause() {
    task?.pause()
  }

  func resume() {
    task?.resume()
  }

  func cancel() {
    task?.cancel()
  }

  func stopObservingProgress() {
    guard let task, let progressHandle else { return }
    task.removeObserver(withHandle: progressHandle)
    self.progressHandle = nil
  }
}
```

공식 upload 가이드에 따르면 success 또는 failure가 발생하면 task observer는 memory leak을 막기 위해 제거돼요. 그 전에도 특정 화면에서 progress 관찰만 끝낼 수 있으므로 반환된 `StorageHandle`을 보관해 개별 제거할 수 있습니다.

`StorageTaskSnapshot`은 database 파일 내용의 snapshot이 아니에요. 다음 정보를 담은 **전송 작업의 순간 상태**입니다.

- `task`: 이 snapshot을 만든 upload 또는 download task
- `reference`: 작업 대상 object reference
- `metadata`: 현재 사용할 수 있는 object metadata
- `progress`: 완료 bytes와 전체 bytes를 표현하는 `Progress?`
- `error`: failure에서 전달된 오류
- `status`: resume, progress, pause, success, failure 같은 task 상태

## 다운로드 크기에 따라 API를 선택해요

작은 파일은 최대 크기를 정하고 메모리로 받을 수 있어요.

```swift
func loadThumbnail(path: String) async throws -> Data {
  let fiveMegabytes: Int64 = 5 * 1_024 * 1_024

  return try await Storage.storage()
    .reference(withPath: path)
    .data(maxSize: fiveMegabytes)
}
```

`maxSize`보다 큰 object라면 task가 취소되고 오류가 발생해요. 이 제한 없이 큰 파일을 메모리에 받으면 앱이 종료될 수 있으므로 큰 파일은 disk로 다운로드합니다.

```swift
func downloadVideo(
  path: String,
  destinationURL: URL,
  onProgress: @escaping (Double) -> Void
) async throws -> URL {
  try await Storage.storage()
    .reference(withPath: path)
    .writeAsync(toFile: destinationURL) { progress in
      onProgress(progress?.fractionCompleted ?? 0)
    }
}
```

이미지 화면 표시에는 cache library와 HTTP cache 전략도 고려해요. 매번 view가 나타날 때 같은 object를 다시 `data(maxSize:)`로 받는 구조는 전송 비용과 사용자 경험에 불리할 수 있습니다.

## download URL과 storage path의 역할을 구분해요

```swift
func makeDownloadURL(path: String) async throws -> URL {
  try await Storage.storage()
    .reference(withPath: path)
    .downloadURL()
}
```

storage path는 앱이 Firebase SDK와 Rules를 통해 object를 찾는 내부 식별자로 쓰기 좋아요. download URL은 다른 HTTP client나 화면 구성 요소에 전달할 수 있지만, private content라면 URL이 log·분석 event·clipboard에 노출되지 않도록 배포 범위를 관리해야 합니다.

Firestore에는 가능하면 `storagePath`와 domain metadata를 저장하고 필요할 때 download URL을 얻는 설계를 검토하세요. 영구 URL 문자열만 진실 원천으로 저장하면 object 이동이나 URL 관리 정책이 바뀔 때 migration이 어려워집니다.

## file과 metadata document는 하나의 transaction이 아니에요

Storage upload와 Firestore write는 서로 다른 제품이라 하나의 atomic transaction으로 묶이지 않습니다.

```text
1. Storage upload 성공
2. Firestore metadata 저장 실패
3. 참조되지 않는 orphan object 발생
```

또는 반대 순서라면 존재하지 않는 파일을 가리키는 document가 남을 수 있어요. 상태 field와 재시도·정리 job을 설계합니다.

```text
uploading → ready
     └────→ failed → retry 또는 orphan cleanup
```

예를 들어 먼저 Firestore에 `status: uploading` document를 만들고, upload 성공 뒤 `ready`와 storage path를 기록할 수 있어요. Cloud Functions나 서버 cleanup으로 오래된 `uploading` object와 document를 정리하는 방식도 검토합니다.

## 체크리스트

- [ ] 구조화 field와 큰 binary object의 저장소를 구분했나요?
- [ ] object path에 소유자 uid와 충돌 없는 object ID를 사용하나요?
- [ ] 작은 `Data`와 큰 file URL upload를 구분했나요?
- [ ] 큰 download를 `data(maxSize:)`로 무제한 메모리에 올리지 않나요?
- [ ] upload task의 progress, cancel, 화면 수명 주기를 설계했나요?
- [ ] content type과 허용 크기를 client와 Storage Rules에서 검증하나요?
- [ ] Storage와 Firestore 사이의 부분 실패·orphan 정리 정책이 있나요?
- [ ] private download URL을 log나 분석 event에 남기지 않나요?

## 면접에서 이어질 수 있는 질문

### Firestore에 이미지 `Data`를 직접 넣지 않고 Storage를 쓰는 이유는 무엇인가요?

Firestore는 query 가능한 구조화 document를 위한 저장소이고 document 크기에도 제한이 있어요. 큰 binary 전송, resumable upload, file metadata는 Cloud Storage가 담당하도록 역할을 나눕니다.

### `StorageTaskSnapshot`은 `DataSnapshot`과 무엇이 다른가요?

`DataSnapshot`은 Realtime Database 경로의 데이터 값이고, `StorageTaskSnapshot`은 file upload·download 작업의 status와 progress를 나타냅니다.

### upload와 Firestore metadata write를 atomic하게 묶을 수 있나요?

두 제품을 하나의 client transaction으로 묶을 수 없어요. 중간 상태를 기록하고 재시도, 보상 작업, orphan cleanup을 설계해 최종 일관성을 만듭니다.

## 참고 자료

- [Apple 플랫폼에서 Cloud Storage 시작하기](https://firebase.google.com/docs/storage/ios/start)
- [Apple 플랫폼에서 파일 업로드하기](https://firebase.google.com/docs/storage/ios/upload-files)
- [Apple 플랫폼에서 파일 다운로드하기](https://firebase.google.com/docs/storage/ios/download-files)
- [`StorageReference` API Reference](https://firebase.google.com/docs/reference/swift/firebasestorage/api/reference/Classes/StorageReference)
- [`StorageTaskSnapshot` API Reference](https://firebase.google.com/docs/reference/swift/firebasestorage/api/reference/Classes/StorageTaskSnapshot)
- [Cloud Storage Security Rules](https://firebase.google.com/docs/storage/security)
