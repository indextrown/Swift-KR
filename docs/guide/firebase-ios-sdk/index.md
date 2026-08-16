---
title: Swift로 시작하는 Firebase iOS SDK
description: Firebase Apple 플랫폼 SDK의 제품별 책임을 구분하고, 프로젝트 등록과 Swift Package Manager 설치부터 SwiftUI 초기화까지 안전하게 구성합니다.
pageType: doc-wide
outline: false
---

# Swift로 시작하는 Firebase iOS SDK

> 면접용 한 줄 요약: **Firebase iOS SDK는 인증, 실시간 데이터, 파일 저장소 같은 관리형 백엔드 기능을 Apple 앱에서 사용하게 해 주지만, 제품마다 데이터 모델·보안 규칙·상태 관찰 방식이 다릅니다.**

Firebase는 하나의 거대한 데이터베이스가 아니에요. 앱에서 해결하려는 문제에 따라 서로 다른 제품과 SDK 모듈을 선택합니다.

```text
SwiftUI / UIKit 앱
        │
        ├─ FirebaseAuth ─────── 사용자 인증 상태
        ├─ FirebaseDatabase ─── 하나의 JSON 트리와 실시간 동기화
        ├─ FirebaseFirestore ── 컬렉션·문서와 쿼리
        └─ FirebaseStorage ──── 이미지·동영상 같은 파일 객체
                 │
                 ├─ Security Rules: 누가 무엇을 읽고 쓸 수 있는가
                 └─ App Check: 요청이 신뢰할 앱에서 왔는가
```

SDK를 설치하는 것과 서버 자원이 안전해지는 것은 별개예요. 클라이언트 앱의 화면에서 버튼을 숨겨도 공격자는 API를 직접 호출할 수 있으므로, 데이터 접근 권한은 반드시 제품별 Security Rules에서 검증해야 합니다.

## 먼저 알아둘 용어

| 용어                       | 의미                                                                                   |
| -------------------------- | -------------------------------------------------------------------------------------- |
| Firebase project           | Auth, Database, Storage 같은 Firebase 자원과 설정을 묶는 최상위 단위예요.              |
| Firebase app               | 한 Firebase project에 등록한 특정 Apple 앱 구성이에요. Bundle ID와 연결됩니다.         |
| SDK module                 | `FirebaseAuth`, `FirebaseDatabase`처럼 제품별로 앱에 추가하는 라이브러리예요.          |
| `FirebaseApp`              | `GoogleService-Info.plist`를 읽어 초기화한 Firebase 구성 객체예요.                     |
| Snapshot                   | 특정 시점의 데이터 또는 작업 상태를 고정해 전달하는 읽기 전용 값이에요.                |
| Listener                   | 이후의 상태 변화를 계속 전달받기 위해 등록하는 구독이에요.                             |
| Security Rules             | 클라이언트 요청의 경로, 인증 정보, 입력값을 서버에서 검사하는 접근 제어 규칙이에요.    |
| Local Emulator Suite       | 실제 프로젝트 자원 대신 로컬 Auth·Database·Firestore·Storage를 실행하는 개발 도구예요. |
| `GoogleService-Info.plist` | 앱이 접속할 Firebase project와 Firebase app을 식별하는 구성 파일이에요.                |

## 어떤 제품을 선택할까요?

| 요구 사항                             | 우선 검토할 제품         | 핵심 모델               |
| ------------------------------------- | ------------------------ | ----------------------- |
| 이메일·소셜·전화번호 로그인           | Authentication           | 사용자와 ID token       |
| 단순한 공유 상태를 매우 빠르게 동기화 | Realtime Database        | 하나의 JSON 트리        |
| 구조화된 데이터와 복합 쿼리           | Cloud Firestore          | 컬렉션과 문서           |
| 이미지·동영상·문서 원본 저장          | Cloud Storage            | bucket 안의 파일 객체   |
| 앱 요청의 진위 확인                   | App Check                | 앱·기기 증명 token      |
| 서버 측 권한 판단                     | Security Rules 또는 서버 | 인증 정보와 데이터 조건 |

Firebase의 [데이터베이스 선택 가이드](https://firebase.google.com/docs/database/rtdb-vs-firestore)는 새 프로젝트에는 일반적으로 Cloud Firestore부터 검토하라고 권장해요. Realtime Database는 단순한 데이터 모델, 매우 낮은 지연 시간의 상태 동기화, presence 기능이 중요한 경우에 여전히 적합합니다.

파일의 설명·소유자·공개 범위는 Firestore나 Realtime Database에 저장하고, 실제 이미지 bytes는 Cloud Storage에 저장하는 식으로 제품을 조합할 수 있어요.

## 1단계: Firebase project와 Apple 앱을 등록해요

1. [Firebase Console](https://console.firebase.google.com/)에서 project를 만들어요.
2. **앱 추가 > Apple 플랫폼**을 선택해요.
3. Xcode target의 Bundle Identifier를 대소문자까지 정확히 입력해요.
4. `GoogleService-Info.plist`를 내려받아 앱 target에 추가해요.
5. 필요한 제품을 Console에서 활성화하고 운영용 Security Rules를 작성해요.

등록한 Firebase app의 Bundle ID는 나중에 바꿀 수 없어요. 개발·스테이징·운영 앱이 서로 다른 Bundle ID를 사용한다면 각각 Firebase app으로 등록하고, build configuration에 맞는 구성 파일을 사용합니다.

:::warning 구성 파일과 서버 비밀 키를 구분해요
공식 문서에 따르면 `GoogleService-Info.plist`의 프로젝트·앱 식별자는 비밀 값이 아닙니다. 그렇다고 Admin SDK service account key나 서버 비밀 키를 앱에 넣어도 된다는 뜻은 아니에요. 앱 bundle은 사용자가 추출할 수 있으므로 서버 권한을 가진 credential은 서버나 안전한 secret 저장소에만 둡니다.
:::

이 저장소에도 실제 `GoogleService-Info.plist`를 예제로 커밋하지 않아요. 문서에는 설정 절차와 placeholder만 남기고, 각자의 Firebase Console에서 받은 파일을 앱 target에 추가합니다.

## 2단계: Swift Package Manager로 필요한 모듈만 추가해요

Xcode의 **File > Add Package Dependencies**에서 다음 공식 저장소를 입력해요.

```text
https://github.com/firebase/firebase-ios-sdk
```

사용할 제품에 맞춰 product를 선택합니다.

```text
FirebaseCore
FirebaseAuth
FirebaseDatabase
FirebaseFirestore
FirebaseStorage
```

예전 코드의 `Firebase` umbrella 모듈이나 `FirebaseFirestoreSwift` 확장 모듈을 그대로 따라 하지 마세요. 현재 Swift 전용 API는 주요 모듈에 통합되어 있고, 필요한 제품 모듈을 직접 선택하는 방식이 권장됩니다.

지원 OS와 Xcode 조건은 SDK release마다 달라질 수 있어요. 2026년 8월의 [Apple 프로젝트 설정 가이드](https://firebase.google.com/docs/ios/setup)는 Xcode 26.2 이상과 iOS 15 이상을 안내합니다. 실제 프로젝트에서는 선택한 package tag의 `Package.swift`와 [Firebase Apple SDK release](https://github.com/firebase/firebase-ios-sdk/releases)를 함께 확인하세요.

## 3단계: 앱 시작 시 한 번 초기화해요

UIKit 앱에서는 App Delegate에서 `FirebaseApp.configure()`를 호출합니다.

```swift
import FirebaseCore
import UIKit

@main
final class AppDelegate: UIResponder, UIApplicationDelegate {
  func application(
    _ application: UIApplication,
    didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil
  ) -> Bool {
    FirebaseApp.configure()
    return true
  }
}
```

SwiftUI 앱도 App Delegate를 만들고 `UIApplicationDelegateAdaptor`로 연결해요.

```swift
import FirebaseCore
import SwiftUI

final class AppDelegate: NSObject, UIApplicationDelegate {
  func application(
    _ application: UIApplication,
    didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil
  ) -> Bool {
    FirebaseApp.configure()
    return true
  }
}

@main
struct ReadingApp: App {
  @UIApplicationDelegateAdaptor(AppDelegate.self) private var appDelegate

  var body: some Scene {
    WindowGroup {
      ContentView()
    }
  }
}
```

`FirebaseApp.configure()`보다 먼저 `Auth.auth()`나 `Firestore.firestore()`를 만들지 않도록 앱 조립 지점을 한 곳으로 모으는 편이 좋아요.

### SwiftUI에서는 App Delegate swizzling을 확인해요

Firebase의 [Apple 플랫폼 이해하기](https://firebase.google.com/docs/ios/learn-more#swiftui)는 완전한 SwiftUI 앱에서 알려진 문제 때문에 App Delegate swizzling을 끄도록 안내합니다. `Info.plist`에 Boolean 값을 추가해요.

```xml
<key>FirebaseAppDelegateProxyEnabled</key>
<false/>
```

swizzling은 Firebase가 App Delegate method를 바꿔 Analytics, App Distribution, Authentication, FCM을 OS callback과 자동 연결하는 기능이에요. 이를 끈 뒤 전화번호 인증, 소셜 로그인 redirect, APNs·FCM처럼 App Delegate callback이 필요한 기능을 사용한다면 **각 제품의 수동 연결 가이드도 구현해야 합니다.** 이 문서의 이메일·비밀번호 인증 예제만 보고 다른 인증 공급자 설정까지 끝났다고 가정하면 안 돼요.

## 4단계: 화면과 SDK 객체 사이에 경계를 만들어요

화면에서 매번 정적 singleton을 직접 호출하면 테스트와 listener 정리가 어려워져요. 작은 protocol로 필요한 기능을 감싸면 Preview와 unit test에서 대체하기 쉬워집니다.

```swift
import FirebaseAuth

protocol AuthProviding {
  var currentUserID: String? { get }
  func signIn(email: String, password: String) async throws
}

struct FirebaseAuthProvider: AuthProviding {
  var currentUserID: String? {
    Auth.auth().currentUser?.uid
  }

  func signIn(email: String, password: String) async throws {
    _ = try await Auth.auth().signIn(
      withEmail: email,
      password: password
    )
  }
}
```

SDK 타입을 완전히 숨기는 것이 목적은 아니에요. 화면이 인증·데이터베이스·파일 업로드의 구체적인 수명 주기까지 동시에 책임지지 않도록 경계를 나누는 것이 핵심입니다.

## 이 섹션의 학습 순서

1. [Firebase Authentication](./authentication)에서 이메일 계정과 인증 상태 listener를 다뤄요.
2. [Realtime Database](./realtime-database)에서 JSON tree와 `DataSnapshot`을 배워요.
3. [Cloud Firestore](./cloud-firestore)에서 collection·document·query listener를 배워요.
4. [Cloud Storage](./cloud-storage)에서 파일 전송과 task snapshot을 다뤄요.
5. [Snapshot과 Listener](./snapshots-and-listeners)에서 같은 이름처럼 보이는 상태 타입을 비교해요.
6. [Security Rules와 Emulator](./security-rules-and-emulators)에서 client code 밖의 보안 경계와 로컬 검증을 구성해요.

## 시작 전 체크리스트

- [ ] 개발·스테이징·운영 project와 Bundle ID의 대응 관계를 정했나요?
- [ ] 필요한 SDK product만 target에 추가했나요?
- [ ] 앱 시작 시 `FirebaseApp.configure()`가 정확히 한 번 호출되나요?
- [ ] SwiftUI 앱의 swizzling과 제품별 수동 callback 요구사항을 확인했나요?
- [ ] 실제 `GoogleService-Info.plist`나 서버 credential을 문서·공개 저장소에 넣지 않았나요?
- [ ] Console의 test mode를 그대로 운영에 배포하지 않도록 Rules를 설계했나요?

## 면접에서 이어질 수 있는 질문

### Firebase project와 Firebase app은 무엇이 다른가요?

project는 여러 Firebase 제품과 자원을 묶는 단위이고, Firebase app은 그 project에 연결된 특정 Bundle ID의 클라이언트 구성이에요. 하나의 project에 iOS 앱, Widget이 포함된 Apple 앱 구성, Android 앱 등을 각각 등록할 수 있습니다.

### `GoogleService-Info.plist`를 숨기면 데이터가 보호되나요?

아니요. 이 파일은 project와 app을 식별하는 구성 파일이지 서버 권한을 주는 비밀 credential이 아니에요. 실제 데이터 보호는 Authentication, Security Rules, 필요하면 App Check와 서버 측 검증으로 구성합니다.

### Firestore와 Realtime Database를 동시에 써도 되나요?

가능하지만 데이터의 진실 원천을 명확히 해야 해요. 단순히 익숙한 API를 섞기보다 Firestore는 문서·쿼리, Realtime Database는 presence나 단순한 저지연 상태처럼 책임을 구분해야 중복 동기화와 비용 문제를 피할 수 있습니다.

## 참고 자료

- [Apple 프로젝트에 Firebase 추가하기](https://firebase.google.com/docs/ios/setup)
- [Apple 플랫폼에서 Firebase 이해하기](https://firebase.google.com/docs/ios/learn-more)
- [Firebase Apple 플랫폼 SDK 저장소](https://github.com/firebase/firebase-ios-sdk)
- [Cloud Firestore와 Realtime Database 비교](https://firebase.google.com/docs/database/rtdb-vs-firestore)
- [Firebase Security Rules](https://firebase.google.com/docs/rules)
