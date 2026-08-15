---
title: Swift 저장소와 데이터 경계 한눈에 보기
description: UserDefaults domain, SwiftData ModelContainer, 파일 container, Keychain access group, CloudKit container의 차이와 선택 기준을 비교합니다.
pageType: doc-wide
outline: false
---

# Swift 저장소와 데이터 경계 한눈에 보기

> **면접 답변 한 줄 요약:** Swift 앱의 저장 기술은 데이터 모양뿐 아니라 수명, 보안, 공유 범위로 선택하며, UserDefaults domain·SwiftData ModelContainer·파일 container·Keychain access group·CloudKit container는 이름이 비슷해도 서로 다른 경계를 뜻해요.

앱 설정을 설명할 때는 `UserDefaults`의 **domain**, SwiftData를 설명할 때는 `ModelContainer`, App Groups에서는 **shared container**, CloudKit에서도 다시 **container**라는 단어가 나와요. 모두 “무언가를 담는 범위”처럼 들리지만 같은 계층의 개념은 아니에요.

예를 들어 로그인 토큰을 “앱 데이터니까 container에 저장한다”라고만 말하면 다음 질문이 남아요.

- 파일 container에 평문으로 저장한다는 뜻인가요?
- Keychain item을 앱 전용 access group에 저장한다는 뜻인가요?
- CloudKit container로 여러 기기에 보내겠다는 뜻인가요?
- SwiftData의 persistent store에 모델 속성으로 넣겠다는 뜻인가요?

저장소를 고를 때는 API 이름보다 **어떤 데이터가, 얼마나 오래, 누구에게 보여야 하는지**부터 정해야 해요.

## 먼저 알아둘 공통 용어

| 용어                  | 쉬운 뜻                                                                                                                 |
| --------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| 저장소(store)         | 데이터를 나중에 다시 읽을 수 있도록 보관하는 논리적·물리적 공간이에요.                                                  |
| 영속성(persistence)   | 프로세스가 종료된 뒤에도 데이터가 남는 성질이에요.                                                                      |
| 직렬화(serialization) | 메모리의 값을 파일이나 네트워크에 기록할 수 있는 `Data`로 바꾸는 과정이에요.                                            |
| schema                | 어떤 모델과 필드, 관계를 저장할지 설명하는 구조예요. SwiftData와 CloudKit에서 중요한 개념이에요.                        |
| container             | 특정 데이터나 저장소에 접근할 수 있는 범위를 가리켜요. 어떤 프레임워크의 container인지 함께 말해야 정확해요.            |
| context               | 저장소에서 읽은 모델과 아직 저장하지 않은 변경을 추적하는 작업 단위예요. SwiftData의 `ModelContext`가 대표적이에요.     |
| domain                | UserDefaults에서는 설정 값을 검색할 논리적인 출처와 우선순위를 뜻해요. DDD의 비즈니스 domain과는 다른 개념이에요.       |
| entitlement           | 서명된 앱이나 extension이 특정 시스템 자원에 접근할 권한이 있음을 운영체제에 증명하는 정보예요.                         |
| 동기화(sync)          | 둘 이상의 저장 위치가 시간이 지나도 같은 상태에 가까워지도록 변경을 전달하고 병합하는 과정이에요. 단순 저장과 구분해요. |

## 같은 단어라도 경계가 달라요

| 이름                       | 무엇을 구분하나요?                                | 대표 경계                                  | 실제 데이터 예시                         |
| -------------------------- | ------------------------------------------------- | ------------------------------------------ | ---------------------------------------- |
| UserDefaults domain        | 설정 key를 찾는 출처와 검색 우선순위              | 앱 설정 namespace                          | 테마, 정렬 방식, 온보딩 완료 여부        |
| SwiftData `ModelContainer` | schema, configuration, persistent store와 context | 모델 저장 stack                            | 독서 기록, 카테고리, 관계가 있는 앱 모델 |
| SwiftData `ModelContext`   | 읽은 모델과 저장 전 변경                          | 하나의 작업·변경 추적 단위                 | insert, update, delete 후 `save()`       |
| 앱 sandbox file container  | 한 앱 프로세스가 접근할 수 있는 파일              | 운영체제가 부여한 private 디렉터리         | JSON, 이미지, 내려받은 문서              |
| App Group file container   | 같은 group entitlement를 가진 target의 파일       | 앱·Widget·extension 사이의 shared 디렉터리 | Widget용 snapshot, 공유 데이터베이스     |
| Keychain access group      | Keychain item을 읽을 수 있는 앱 집합              | code-signing과 entitlement 기반 보안 경계  | 로그인 토큰, 암호화 키                   |
| CloudKit container         | iCloud 서버의 schema와 database                   | 앱 또는 앱 모음의 cloud namespace          | 여러 기기에서 동기화하는 기록            |
| CloudKit database scope    | public, private, shared 데이터의 가시성           | 사용자와 공유 대상                         | 개인 메모, 공개 데이터, 초대받은 데이터  |

“container를 사용한다”만으로는 어느 저장소인지 알 수 없어요. **SwiftData container**, **App Group file container**, **CloudKit container**처럼 소유 프레임워크와 목적을 함께 말하는 습관이 좋아요.

## DDD의 domain은 저장소 이름이 아니에요

DDD(Domain-Driven Design)에서 domain은 앱이 해결하려는 **비즈니스 문제 영역**이에요. 독서 앱이라면 독서 목표, 기록, 연속 읽기 계산 같은 규칙이 domain에 해당해요.

```swift
struct ReadingGoal {
  let minutesPerDay: Int

  func progress(completedMinutes: Int) -> Double {
    guard minutesPerDay > 0 else { return 0 }
    return min(Double(completedMinutes) / Double(minutesPerDay), 1)
  }
}
```

이 타입은 UserDefaults, SwiftData, 파일 중 어디에 저장하는지 몰라도 비즈니스 규칙을 계산할 수 있어요. 저장 방식은 infrastructure의 관심사예요.

반면 UserDefaults domain은 `reading.dailyGoal` 같은 key를 어느 설정 출처에서 찾을지 정하는 **검색 영역**이에요.

```text
DDD domain
└─ 독서 목표라는 비즈니스 규칙

UserDefaults domain
└─ reading.dailyGoal key를 검색할 설정 출처
```

둘은 `domain`이라는 영어 단어만 같을 뿐, 하나는 문제 영역이고 다른 하나는 설정 namespace예요.

## 저장소는 네 가지 질문으로 선택해요

### 1. 데이터의 모양은 어떤가요?

- 작은 scalar 설정인가요?
- 검색·정렬할 모델과 관계가 있나요?
- 이미지나 문서처럼 파일 형식 자체가 중요한가요?
- 비밀번호나 토큰처럼 비밀인가요?

### 2. 언제까지 남아야 하나요?

- 화면이 살아 있는 동안만 필요한가요?
- 앱을 다시 실행해도 남아야 하나요?
- 시스템이 공간을 확보할 때 삭제해도 되나요?
- 앱을 지우고 다시 설치해도 복원되어야 하나요?

### 3. 누가 읽어야 하나요?

- 현재 앱만 읽나요?
- 앱과 Widget이 같은 기기에서 읽나요?
- 같은 사용자의 다른 기기에서도 읽나요?
- 여러 사용자가 함께 읽고 수정하나요?

### 4. 어떤 실패를 처리해야 하나요?

- 일부 파일만 써져도 복구할 수 있나요?
- 오프라인이어도 수정할 수 있어야 하나요?
- 동시 수정 충돌을 어떻게 병합하나요?
- 계정이 바뀌거나 entitlement가 없을 때 어떤 화면을 보여 주나요?

## 목적별 빠른 선택표

| 요구 사항                                     | 먼저 검토할 기술               | 이유                                                               |
| --------------------------------------------- | ------------------------------ | ------------------------------------------------------------------ |
| 다크 모드, 정렬 방식, 마지막 탭               | `UserDefaults` / `@AppStorage` | 작은 property list 설정을 key-value로 저장하기 쉬워요.             |
| 검색·정렬·관계가 있는 앱 모델                 | SwiftData                      | schema, query, 관계, 변경 추적과 migration을 제공해요.             |
| JSON, 이미지, 오디오, 내려받은 문서           | 파일 system                    | 형식과 byte 단위 읽기·쓰기, 디렉터리 정책을 직접 제어할 수 있어요. |
| 로그인 token, password, private key           | Keychain                       | 앱 sandbox 파일과 다른 보호·접근 제어를 제공해요.                  |
| App과 Widget의 작은 설정                      | App Group `UserDefaults` suite | 같은 group의 shared preferences domain을 사용할 수 있어요.         |
| App과 extension의 큰 snapshot·파일            | App Group file container       | 같은 group entitlement가 shared 디렉터리 접근을 허용해요.          |
| 기기 사이의 작은 비민감 설정                  | `NSUbiquitousKeyValueStore`    | 같은 Apple 계정의 앱 인스턴스 사이에서 key-value를 동기화해요.     |
| 사용자의 구조화된 모델을 여러 기기에서 동기화 | SwiftData + CloudKit           | 로컬 모델 저장과 CloudKit 동기화를 결합할 수 있어요.               |
| cloud record와 공유 정책을 세밀하게 제어      | CloudKit API                   | public·private·shared database와 record 단위 API를 제공해요.       |

하나의 앱이 이 기술 중 하나만 선택해야 하는 것은 아니에요. 서로 다른 책임을 조합하는 경우가 더 많아요.

## 실제 앱은 저장소를 조합해요

독서 앱을 예로 들면 데이터가 다음처럼 나뉠 수 있어요.

```text
앱 설정
└─ UserDefaults: 테마, 기본 정렬, 마지막 선택 탭

앱 모델
└─ SwiftData: 책, 독서 세션, 태그와 관계

큰 payload
└─ Application Support: 책 표지 원본과 내보내기 snapshot

비밀
└─ Keychain: API access token

같은 기기의 extension 공유
└─ App Group: Widget이 읽을 작은 progress snapshot

여러 기기 동기화
└─ SwiftData + CloudKit 또는 직접 작성한 CloudKit record
```

이 구조에서 SwiftData가 있다고 이미지 byte까지 반드시 모델 속성에 넣을 필요는 없어요. SwiftData 모델에는 파일 식별자와 metadata를 저장하고 실제 큰 payload는 파일로 분리할 수 있어요.

```swift
import Foundation
import SwiftData

@Model
final class BookCover {
  @Attribute(.unique) var id: UUID
  var relativePath: String
  var updatedAt: Date

  init(
    id: UUID = UUID(),
    relativePath: String,
    updatedAt: Date = .now
  ) {
    self.id = id
    self.relativePath = relativePath
    self.updatedAt = updatedAt
  }
}
```

민감한 API token은 모델의 문자열 속성이나 JSON 파일에 넣지 않고 Keychain에 저장해요. 모델에는 token 자체가 아니라 로그인 상태를 다시 구성할 수 있는 비민감 정보만 남겨요.

## 로컬 저장과 동기화는 다른 책임이에요

파일이나 SwiftData에 저장했다고 자동으로 다른 기기에 전달되지는 않아요. App Group도 **같은 기기의 앱과 extension**이 공유하는 경계이지, 기기 사이의 cloud sync가 아니에요.

```text
현재 프로세스 메모리
        │ save
        ▼
기기의 로컬 저장소 ────── sync 계층 ────── iCloud 서버
        ▲                                      │
        └──────── 다른 기기의 sync ───────────┘
```

동기화는 네트워크 단절, 순서가 다른 변경, 충돌, 계정 전환을 처리해야 해요. “저장 성공”과 “서버 반영 완료”를 같은 상태로 보지 않는 것이 중요해요.

## 보안 경계도 따로 설계해요

앱 sandbox는 다른 일반 앱이 파일을 직접 여는 일을 막는 기본 경계지만, 모든 데이터가 비밀 저장에 적합하다는 뜻은 아니에요.

- 설정이나 일반 앱 모델: UserDefaults, SwiftData, 파일을 목적에 맞게 사용해요.
- 자격 증명과 암호화 key: Keychain을 사용하고 필요한 접근성 수준을 선택해요.
- 앱·extension 공유: App Group entitlement가 공유 대상을 넓힌다는 점을 고려해요.
- cloud 공유: private·public·shared database의 가시성을 데이터 성격에 맞게 선택해요.
- log와 analytics: 저장소가 안전해도 비밀 값을 출력하면 보호가 깨져요.

## 흔한 오해

### `UserDefaults.standard` 외에는 전부 database인가요?

아니에요. `UserDefaults(suiteName:)`도 같은 설정 API의 다른 domain이고, 파일 container는 디렉터리, Keychain은 보안 item 저장소, CloudKit은 cloud database 서비스예요. 이름보다 데이터와 경계를 확인해야 해요.

### SwiftData의 ModelContainer는 App Group container인가요?

아니에요. `ModelContainer`는 SwiftData stack을 관리하는 객체예요. `ModelConfiguration`을 통해 persistent store의 위치로 App Group container를 선택할 수 있지만 두 container 개념이 같아지는 것은 아니에요.

### App Group을 켜면 여러 기기에서 동기화되나요?

아니에요. App Group은 같은 기기에 설치된 관련 앱과 extension의 shared container 접근 권한이에요. 기기 사이 동기화에는 iCloud key-value storage, CloudKit, iCloud Documents 같은 별도 기술이 필요해요.

### Keychain은 암호화된 UserDefaults인가요?

아니에요. Keychain은 item class와 attribute, accessibility, access control, access group을 갖는 별도 보안 서비스예요. 일반 설정 저장 API를 단순히 암호화한 형태로 보면 설계를 놓치기 쉬워요.

## 적용 체크리스트

- 이 값이 설정, 모델, 파일, 비밀 중 무엇인지 먼저 분류했나요?
- 프로세스 종료, 앱 업데이트, 재설치 후 필요한 수명을 정했나요?
- 앱만, 같은 기기의 extension, 다른 기기, 다른 사용자 중 공유 범위를 정했나요?
- App Group·Keychain sharing·iCloud에 필요한 entitlement를 target별로 확인했나요?
- cache와 임시 파일은 사라져도 앱이 복구할 수 있나요?
- cloud sync와 로컬 save를 서로 다른 상태로 처리하나요?
- 민감 정보를 UserDefaults, 일반 파일, log에 남기지 않나요?
- test에서는 실제 저장소 대신 격리된 suite, 임시 디렉터리, in-memory container, fake Keychain을 사용할 수 있나요?

## 면접에서 자주 나오는 질문

### UserDefaults domain과 DDD domain의 차이는 무엇인가요?

UserDefaults domain은 같은 key를 어느 설정 출처에서 찾을지 정하는 namespace와 우선순위이고, DDD domain은 소프트웨어가 해결하는 비즈니스 문제 영역이에요.

### ModelContainer와 ModelContext는 어떻게 다른가요?

`ModelContainer`는 schema와 persistent store 구성을 관리하고 context와 저장소 사이를 중재해요. `ModelContext`는 특정 작업에서 fetch한 모델과 insert·update·delete 변경을 추적하고 저장해요.

### App Group container와 CloudKit container의 차이는 무엇인가요?

App Group container는 같은 기기의 관련 target이 파일과 shared preferences를 공유하는 운영체제 보안 경계이고, CloudKit container는 iCloud 서버의 schema와 public·private·shared database를 묶는 cloud namespace예요.

## 다음 문서

- [UserDefaults](./userdefaults): 작은 설정과 domain 검색 구조
- [@AppStorage](./appstorage): SwiftUI 상태와 UserDefaults 연결
- [SwiftData](./swiftdata): 구조화된 모델, context와 migration
- [파일과 App Group container](./file-containers): 디렉터리 선택과 안전한 파일 쓰기
- [App Groups와 Widget 데이터 공유](./app-groups): shared preferences와 Widget timeline
- [Keychain과 access group](./keychain): 비밀 정보 저장과 공유
- [iCloud key-value storage와 CloudKit](./icloud-cloudkit): 기기 간 동기화와 cloud database

## 참고 자료

- [Apple Developer Documentation - UserDefaults](https://developer.apple.com/documentation/foundation/userdefaults)
- [Apple Developer Documentation - ModelContainer](https://developer.apple.com/documentation/swiftdata/modelcontainer)
- [Apple Developer Documentation - FileManager](https://developer.apple.com/documentation/foundation/filemanager)
- [Apple Developer Documentation - Sharing access to keychain items](https://developer.apple.com/documentation/security/sharing-access-to-keychain-items-among-a-collection-of-apps)
- [Apple Developer Documentation - CKContainer](https://developer.apple.com/documentation/cloudkit/ckcontainer)
- [Apple Developer Documentation - Configuring App Groups](https://developer.apple.com/documentation/xcode/configuring-app-groups)
