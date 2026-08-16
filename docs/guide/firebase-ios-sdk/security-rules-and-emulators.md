---
title: Firebase Security Rules와 Local Emulator Suite
description: Authentication, Security Rules, App Check의 보안 책임을 구분하고 Firestore·Realtime Database·Storage 규칙과 iOS Emulator 연결 방법을 설명합니다.
pageType: doc-wide
outline: false
---

# Firebase Security Rules와 Local Emulator Suite

> 면접용 한 줄 요약: **Authentication은 사용자를 식별하고, Security Rules는 인증 정보와 요청 데이터를 기준으로 각 경로의 권한을 서버에서 판단하며, App Check는 요청이 신뢰할 앱 환경에서 왔는지 보완합니다.**

Firebase client SDK를 앱에 넣으면 사용자는 같은 project endpoint를 알아낼 수 있어요. 따라서 “앱 화면에서 쓰기 버튼을 숨겼다”, “경로를 난독화했다”, “`GoogleService-Info.plist`를 숨겼다”는 접근 제어가 아닙니다.

```text
요청
 ├─ Authentication token ── 누가 요청했는가?
 ├─ App Check token ─────── 신뢰할 앱 환경에서 왔는가?
 └─ path + operation + data
               │
               ▼
        Security Rules
               │
          allow / deny
```

## 먼저 알아둘 용어

| 용어               | 의미                                                                                             |
| ------------------ | ------------------------------------------------------------------------------------------------ |
| Authentication     | 로그인한 사용자의 identity와 ID token을 제공해요.                                                |
| authorization      | 식별된 사용자가 특정 데이터 작업을 해도 되는지 결정하는 과정이에요.                              |
| Security Rules     | Firebase backend가 client 요청마다 실행하는 제품별 접근 제어 규칙이에요.                         |
| `request.auth`     | 검증된 Firebase Auth 사용자 정보예요. 로그인하지 않았다면 `null`이에요.                          |
| `resource`         | Firestore·Storage에 이미 존재하는 server-side 데이터예요.                                        |
| `request.resource` | write가 성공했을 때 만들어질 새 데이터 또는 metadata예요.                                        |
| App Check          | 정품 앱·기기 환경의 요청인지 증명해 abuse를 줄이는 보완 계층이에요.                              |
| Emulator Suite     | 실제 cloud 자원을 사용하지 않고 로컬에서 Firebase 제품과 Rules를 실행하는 도구예요.              |
| demo project       | 실제 cloud resource가 없는 `demo-` prefix project ID로, 실수로 운영 자원에 접근할 위험을 줄여요. |

## 세 보안 계층은 서로 대체하지 않아요

| 계층           | 답하는 질문                                   | 대체하지 못하는 것                        |
| -------------- | --------------------------------------------- | ----------------------------------------- |
| Authentication | “이 사용자는 누구인가?”                       | 이 사용자가 특정 document를 읽어도 되는지 |
| Security Rules | “이 identity가 이 경로와 값을 다뤄도 되는가?” | 요청 앱이 변조되지 않았는지               |
| App Check      | “허용한 앱 환경에서 온 요청인가?”             | 사용자 로그인과 세부 데이터 소유권        |

App Check를 켰다고 `allow read, write: if true`가 안전해지는 것은 아니고, 로그인했다고 모든 사용자 데이터에 접근시켜도 되는 것도 아니에요. 세 계층을 요구사항에 맞게 조합합니다.

우리 서버에서 Firebase Admin SDK나 server client library를 사용하면 제품에 따라 Security Rules가 아니라 IAM 권한으로 접근해요. 따라서 server code는 “Rules가 막아 주겠지”라고 가정하지 않고 입력 검증과 권한 검사를 직접 수행해야 합니다.

## Firestore Rules는 경로와 새 값을 함께 검사해요

사용자별 책 document를 예로 들어 볼게요.

```javascript
rules_version = '2';

service cloud.firestore {
  match /databases/{database}/documents {
    match /users/{userID}/books/{bookID} {
      function isOwner() {
        return request.auth != null
          && request.auth.uid == userID;
      }

      function isValidBook() {
        return request.resource.data.keys().hasOnly([
          'ownerID',
          'title',
          'minutes',
          'isFinished',
          'updatedAt'
        ])
          && request.resource.data.ownerID == userID
          && request.resource.data.title is string
          && request.resource.data.title.size() > 0
          && request.resource.data.title.size() <= 100
          && request.resource.data.minutes is int
          && request.resource.data.minutes >= 0
          && request.resource.data.isFinished is bool;
      }

      allow read: if isOwner();
      allow create, update: if isOwner() && isValidBook();
      allow delete: if isOwner();
    }
  }
}
```

경로의 `userID`, 인증된 `request.auth.uid`, 새 document의 `ownerID`를 함께 비교했어요. client가 다른 사용자의 경로를 만들거나 field만 바꿔 소유권을 빼앗는 요청을 막습니다.

Rules는 위에서 아래로 실행해 첫 match에서 멈추는 firewall이 아니에요. 요청과 일치하는 `allow` 중 하나라도 `true`면 허용됩니다. 상위에 넓은 `allow read, write: if true`를 둔 뒤 아래 규칙으로 좁힐 수 없어요.

또한 [Firestore query 보안 가이드](https://firebase.google.com/docs/firestore/security/rules-query)가 강조하듯 Rules는 결과 filter가 아니에요. query가 금지 document를 반환할 가능성이 있으면 요청 전체를 거절합니다.

## Realtime Database Rules는 JSON tree 위치에 붙어요

Realtime Database Rules는 JSON 형식으로 path별 `.read`, `.write`, `.validate`, `.indexOn`을 구성합니다.

```json
{
  "rules": {
    "users": {
      "$uid": {
        ".read": "auth != null && auth.uid === $uid",
        ".write": "auth != null && auth.uid === $uid",
        "displayName": {
          ".validate": "newData.isString() && newData.val().length > 0 && newData.val().length <= 50"
        },
        "dailyGoal": {
          ".validate": "newData.isNumber() && newData.val() >= 1 && newData.val() <= 1440"
        },
        "updatedAt": {
          ".validate": "newData.isNumber()"
        },
        "$other": {
          ".validate": false
        }
      }
    }
  }
}
```

`.write`가 true라고 입력값까지 올바른 것은 아니므로 `.validate`에서 type, 범위, 허용 key를 제한해요. query 성능에 필요한 field는 `.indexOn`을 선언할 수 있습니다.

parent path에 넓은 `.read`나 `.write`를 허용하면 child에서 다시 취소할 수 없어요. tree 구조를 설계할 때 공개 데이터와 개인 데이터를 다른 branch로 나누면 Rules도 단순해집니다.

## Storage Rules는 파일 크기와 content type도 검사해요

```javascript
rules_version = '2';

service firebase.storage {
  match /b/{bucket}/o {
    match /users/{userID}/profile/{fileName} {
      function isOwner() {
        return request.auth != null
          && request.auth.uid == userID;
      }

      function isValidImage() {
        return request.resource.size < 5 * 1024 * 1024
          && request.resource.contentType.matches('image/.*');
      }

      allow read: if isOwner();
      allow create, update: if isOwner() && isValidImage();
      allow delete: if isOwner();
    }
  }
}
```

client가 `metadata.contentType = "image/jpeg"`라고 적는 것만으로 실제 bytes가 안전하다고 단정할 수는 없어요. Rules의 type·size 제한은 기본 방어선이고, 위험한 파일을 다룬다면 upload 뒤 server-side 검사와 변환 pipeline도 고려합니다.

delete 요청에는 새 `request.resource`가 없으므로 create·update와 delete 조건을 나눴어요. 기존 object metadata가 필요하면 `resource`를 사용합니다.

## Console test mode를 운영 규칙으로 쓰지 않아요

quickstart의 test mode는 짧은 학습을 위해 넓은 접근을 허용할 수 있어요. client 구현이 끝날 때까지 미루지 말고 데이터 model과 함께 Rules를 작성합니다.

최소한 다음 공격 경로를 test해요.

- 로그인하지 않은 사용자의 읽기·쓰기
- 사용자 A가 사용자 B의 path를 읽거나 쓰는 요청
- `ownerID`를 다른 값으로 바꾸는 update
- 허용하지 않은 field 추가와 type 변경
- Storage 크기 초과와 허용하지 않은 content type
- query 조건이 Rules의 소유권 조건을 만족하지 않는 경우

“정상 요청이 성공한다”만 test하면 보안 규칙을 검증한 것이 아니에요. 반드시 거절되어야 하는 요청도 자동화합니다.

## Local Emulator Suite로 실제 project와 분리해요

Firebase CLI를 설치한 뒤 project root에서 필요한 emulator를 선택합니다.

```bash
firebase init emulators
firebase emulators:start \
  --project demo-reading-app \
  --only auth,database,firestore,storage
```

`demo-` project ID는 실제 Firebase project에 연결되지 않아 accidental production access와 사용량 발생을 줄여요. 제품 간 Auth와 Rules를 함께 시험하려면 모든 emulator가 같은 project ID를 사용해야 합니다.

## iOS 앱을 Emulator에 연결해요

`FirebaseApp.configure()` 뒤, 각 제품을 처음 사용하기 전에 emulator endpoint를 설정합니다.

```swift
import FirebaseAuth
import FirebaseCore
import FirebaseDatabase
import FirebaseFirestore
import FirebaseStorage

enum FirebaseDevelopmentEnvironment {
  static let projectID = "demo-reading-app"

  static func connectEmulators() {
    #if DEBUG
      Auth.auth().useEmulator(
        withHost: "127.0.0.1",
        port: 9099
      )

      let firestore = Firestore.firestore()
      let settings = firestore.settings
      settings.host = "127.0.0.1:8080"
      settings.cacheSettings = MemoryCacheSettings()
      settings.isSSLEnabled = false
      firestore.settings = settings

      Storage.storage().useEmulator(
        withHost: "127.0.0.1",
        port: 9199
      )
    #endif
  }

  static func realtimeDatabase() -> Database {
    #if DEBUG
      return Database.database(
        url: "http://127.0.0.1:9000?ns=\(projectID)"
      )
    #else
      return Database.database()
    #endif
  }
}
```

앱 시작 순서는 다음처럼 유지해요.

```swift
FirebaseApp.configure()
FirebaseDevelopmentEnvironment.connectEmulators()

let database = FirebaseDevelopmentEnvironment.realtimeDatabase()
```

Firestore Emulator가 종료될 때 local persistence에 이전 cache가 남으면 다음 실행 결과와 섞일 수 있어요. 공식 가이드는 emulator 사용 시 memory cache를 설정하거나 실행 사이 persistence를 정리하도록 안내합니다.

### 실제 iPhone에서는 `127.0.0.1`이 Mac이 아니에요

Simulator의 `127.0.0.1`은 개발 Mac의 emulator에 연결할 수 있지만, 실제 기기의 loopback은 그 iPhone 자신을 뜻해요. 기기 test에서는 같은 network의 Mac IP를 host로 사용하고 firewall과 Firebase CLI의 listen 설정을 확인합니다.

host 값을 production build에 실수로 포함하지 않도록 compile flag와 dependency configuration을 사용해요. 단순히 `DEBUG`만 믿기보다 CI의 test scheme과 release archive에서 endpoint를 검사할 수 있습니다.

## Rules test와 iOS 통합 test를 나눠요

```text
Rules unit test
├─ Emulator에 seed
├─ 사용자별 인증 context 생성
├─ allow 요청 검증
└─ deny 요청 검증

iOS integration / UI test
├─ 앱을 Emulator endpoint로 실행
├─ Auth 가입·로그인
├─ listener와 화면 상태 확인
└─ upload·offline·오류 UX 확인
```

Rules 자체는 공식 `@firebase/rules-unit-testing` 도구로 빠르게 검증할 수 있고, iOS test는 SDK 연결과 화면 흐름을 확인하는 데 집중할 수 있어요. 두 층을 분리하면 보안 case를 UI 조작에만 의존하지 않게 됩니다.

Emulator는 production service와 완전히 동일한 성능·제한 환경이 아니에요. Rules와 흐름을 빠르게 검증하는 도구로 사용하고, release 전에는 별도의 staging project에서 index, App Check, 실제 device network와 운영 설정을 확인합니다.

## 배포 전 체크리스트

- [ ] Authentication, Rules, App Check의 책임을 각각 설명할 수 있나요?
- [ ] 공개 test mode rule을 운영에 배포하지 않았나요?
- [ ] client UI와 별개로 owner uid, type, size, 허용 field를 Rules가 검사하나요?
- [ ] 넓은 상위 `allow`가 상세 규칙을 무력화하지 않나요?
- [ ] allow case와 deny case를 Emulator에서 모두 test했나요?
- [ ] 모든 emulator가 동일한 project ID를 사용하나요?
- [ ] emulator 연결이 Firebase 제품의 첫 사용보다 먼저 실행되나요?
- [ ] 실제 기기 host와 Simulator host 차이를 처리했나요?
- [ ] release build가 emulator나 demo project를 가리키지 않나요?
- [ ] Admin SDK를 사용하는 server가 자체 권한 검사를 수행하나요?

## 면접에서 이어질 수 있는 질문

### 로그인한 사용자라면 모든 데이터 접근을 허용해도 되나요?

아니요. Authentication은 identity만 확인해요. Rules에서 path의 owner, 조직 role, 요청 field와 기존 데이터를 비교해 작업별 권한을 결정해야 합니다.

### App Check는 Authentication을 대체하나요?

아니요. App Check는 요청의 앱 환경을 증명해 abuse를 줄이고, Authentication은 사용자를 식별합니다. 사용자별 authorization은 여전히 Security Rules나 server가 담당해요.

### 상세 match가 상위의 넓은 allow를 취소할 수 있나요?

아니요. 일치하는 `allow` 중 하나라도 true면 요청이 허용될 수 있어요. 넓은 허용 규칙을 두고 아래에서 제한하는 구조를 피해야 합니다.

### Emulator만 통과하면 production 배포가 안전한가요?

Emulator는 Rules와 통합 흐름 검증에 유용하지만 실제 index, quota, network, App Check enforcement와 완전히 같지는 않아요. staging project와 release configuration 검증도 필요합니다.

## 참고 자료

- [Firebase Security Rules](https://firebase.google.com/docs/rules)
- [Cloud Firestore Security Rules 조건](https://firebase.google.com/docs/firestore/security/rules-conditions)
- [Firestore query 보안](https://firebase.google.com/docs/firestore/security/rules-query)
- [Realtime Database Security Rules](https://firebase.google.com/docs/database/security)
- [Cloud Storage Security Rules](https://firebase.google.com/docs/storage/security)
- [Firebase App Check](https://firebase.google.com/docs/app-check)
- [Authentication Emulator 연결](https://firebase.google.com/docs/emulator-suite/connect_auth)
- [Realtime Database Emulator 연결](https://firebase.google.com/docs/emulator-suite/connect_rtdb)
- [Cloud Firestore Emulator 연결](https://firebase.google.com/docs/emulator-suite/connect_firestore)
- [Cloud Storage Emulator 연결](https://firebase.google.com/docs/emulator-suite/connect_storage)
- [Security Rules unit test](https://firebase.google.com/docs/rules/unit-tests)
