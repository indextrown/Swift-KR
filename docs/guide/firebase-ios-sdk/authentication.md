---
title: Firebase Authentication과 인증 상태 관리
description: Firebase Auth의 이메일 계정 생성과 로그인, Auth 상태 listener 수명 주기, uid와 ID token의 차이, SwiftUI 세션 모델을 설명합니다.
pageType: doc-wide
outline: false
---

# Firebase Authentication과 인증 상태 관리

> 면접용 한 줄 요약: **Firebase Authentication은 사용자의 로그인 자격을 확인하고 세션과 ID token을 관리하며, 앱은 `currentUser`를 한 번 읽기보다 인증 상태 listener를 구독해 초기 복원과 로그인·로그아웃을 함께 처리합니다.**

Authentication은 프로필 데이터베이스가 아니에요. 이메일, 공급자 정보, `uid`처럼 로그인에 필요한 최소 사용자 정보를 관리합니다. 닉네임, 앱 설정, 작성한 게시물은 보통 `uid`를 key로 Firestore나 Realtime Database에 별도로 저장해요.

```text
이메일·비밀번호 입력
        │
        ▼
Firebase Authentication
        │
        ├─ User / uid ───── 앱 안의 사용자 식별
        └─ ID token ─────── 서버 요청의 인증 증명
                 │
                 ▼
        Security Rules 또는 우리 서버
```

## 먼저 알아둘 용어

| 용어                | 의미                                                                              |
| ------------------- | --------------------------------------------------------------------------------- |
| Authentication      | 사용자가 누구인지 확인하고 인증 session을 관리하는 Firebase 제품이에요.           |
| Auth provider       | 이메일·비밀번호, Apple, Google처럼 사용자를 인증하는 방식이에요.                  |
| `User`              | 현재 Firebase project에서 인증된 사용자 정보를 나타내는 SDK 객체예요.             |
| `uid`               | Firebase project 안에서 사용자를 구분하는 안정적인 문자열 식별자예요.             |
| ID token            | 로그인한 사용자를 서버가 검증할 수 있도록 Firebase가 서명한 단기 token이에요.     |
| refresh token       | SDK가 새 ID token을 얻는 데 사용하는 credential이며 앱이 직접 관리하지 않아요.    |
| auth state listener | 초기 session 복원과 이후 로그인·로그아웃 상태 변화를 전달하는 구독이에요.         |
| recent sign-in      | 비밀번호 변경·계정 삭제 같은 민감 작업 전에 최근 인증을 다시 요구하는 정책이에요. |

## Console에서 로그인 방식을 먼저 활성화해요

이메일·비밀번호 예제를 실행하기 전에 Firebase Console의 **Authentication > Sign-in method**에서 Email/Password를 활성화합니다. SDK만 추가하고 공급자를 활성화하지 않으면 계정 생성과 로그인이 실패해요.

운영 앱에서는 [비밀번호 정책](https://firebase.google.com/docs/auth/ios/password-auth#recommended_set_a_password_policy)과 email enumeration protection도 검토하세요. 클라이언트의 정규식 검사는 빠른 UI feedback일 뿐, 최종 정책은 Firebase Auth가 판단합니다.

### 요구사항에 맞는 provider를 선택해요

| 방식               | 적합한 상황                                | 추가로 확인할 것                                       |
| ------------------ | ------------------------------------------ | ------------------------------------------------------ |
| 이메일·비밀번호    | 앱 자체 계정 UX가 필요할 때                | password policy, 이메일 인증, 계정 복구                |
| Sign in with Apple | Apple 생태계의 간단한 로그인               | nonce, Apple credential 상태, private relay email      |
| Google·OAuth       | 기존 provider 계정을 활용할 때             | URL scheme, redirect와 App Delegate callback           |
| 전화번호           | 전화번호 소유를 확인할 때                  | APNs·reCAPTCHA fallback, 지역 정책, abuse와 비용       |
| 익명 인증          | 가입 전 데이터를 사용자에게 연결할 때      | 정식 credential로 account linking, orphan account      |
| custom token       | 기존 서버 인증 체계를 Firebase와 연결할 때 | server에서 Admin SDK로 token 발급, client 비밀 키 금지 |

같은 사람이 여러 provider로 로그인할 때 계정을 자동으로 하나로 합쳐 준다고 가정하면 안 돼요. 현재 `User`에 새 credential을 link하는 정책과 “같은 이메일의 기존 계정” 오류 UX를 설계해야 데이터가 서로 다른 `uid`로 갈라지는 일을 줄일 수 있습니다.

SwiftUI에서 App Delegate swizzling을 껐다면 전화번호 인증과 OAuth redirect처럼 OS callback이 필요한 provider의 **제품별 수동 설정**을 반드시 공식 guide에서 확인하세요.

## 계정을 만들면 바로 로그인 상태가 돼요

현재 SDK의 async API를 사용하면 callback 중첩 없이 계정을 만들 수 있어요.

```swift
import FirebaseAuth

struct SignUpResult {
  let userID: String
  let email: String?
}

func signUp(
  email: String,
  password: String
) async throws -> SignUpResult {
  let result = try await Auth.auth().createUser(
    withEmail: email,
    password: password
  )

  return SignUpResult(
    userID: result.user.uid,
    email: result.user.email
  )
}
```

계정 생성에 성공하면 그 사용자는 현재 앱에서도 로그인 상태가 됩니다. 별도로 `signIn`을 한 번 더 호출하지 않아요. 가입 뒤 Firestore에 프로필을 만드는 작업이 실패할 수 있으므로, “Auth 계정 생성”과 “프로필 문서 생성”이 하나의 원자적 transaction이라고 가정하지 마세요. 재시도 가능한 onboarding 흐름으로 설계하는 편이 안전합니다.

## 로그인 결과보다 상태 listener를 진실 원천으로 삼아요

```swift
import FirebaseAuth

func signIn(
  email: String,
  password: String
) async throws {
  _ = try await Auth.auth().signIn(
    withEmail: email,
    password: password
  )
}

func signOut() throws {
  try Auth.auth().signOut()
}
```

`signIn`의 반환값은 그 작업의 성공을 처리할 때 유용해요. 하지만 앱 전체 root 화면은 인증 상태 listener를 기준으로 바꾸는 편이 좋습니다. 앱 재실행 시 SDK가 저장된 session을 복원하는 과정까지 같은 경로에서 처리할 수 있기 때문이에요.

`Auth.auth().currentUser`는 Auth 초기화가 끝나기 전 잠시 `nil`일 수 있어요. 앱 시작 직후 한 번 읽은 값만으로 로그인 화면을 결정하면 이미 로그인한 사용자에게 로그인 화면이 깜빡일 수 있습니다.

## SwiftUI용 인증 세션을 만들어요

`nil`을 곧바로 “로그아웃”으로 해석하지 않고 초기 확인 상태를 따로 둡니다.

```swift
import Combine
import FirebaseAuth

@MainActor
final class AuthSession: ObservableObject {
  enum State: Equatable {
    case checking
    case signedOut
    case signedIn(userID: String)
  }

  @Published private(set) var state: State = .checking
  @Published private(set) var message: String?

  private var listenerHandle: AuthStateDidChangeListenerHandle?

  func start() {
    guard listenerHandle == nil else { return }

    listenerHandle = Auth.auth().addStateDidChangeListener {
      [weak self] _, user in
      Task { @MainActor in
        guard let self else { return }

        if let user {
          self.state = .signedIn(userID: user.uid)
        } else {
          self.state = .signedOut
        }
      }
    }
  }

  func stop() {
    guard let listenerHandle else { return }
    Auth.auth().removeStateDidChangeListener(listenerHandle)
    self.listenerHandle = nil
  }

  func signIn(email: String, password: String) async {
    message = nil

    do {
      _ = try await Auth.auth().signIn(
        withEmail: email,
        password: password
      )
    } catch {
      message = "로그인하지 못했습니다. 입력값과 네트워크를 확인해 주세요."
    }
  }

  func signOut() {
    do {
      try Auth.auth().signOut()
    } catch {
      message = "로그아웃하지 못했습니다."
    }
  }
}
```

화면은 세 상태를 분기해요.

```swift
import SwiftUI

struct RootView: View {
  @StateObject private var session = AuthSession()

  var body: some View {
    Group {
      switch session.state {
      case .checking:
        ProgressView("로그인 상태 확인 중")

      case .signedOut:
        SignInView(session: session)

      case let .signedIn(userID):
        HomeView(userID: userID)
      }
    }
    .task {
      session.start()
    }
  }
}
```

앱 수명 동안 하나의 `AuthSession`을 유지한다면 root에서 한 번 `start()`해도 돼요. 특정 feature에서만 listener를 소유한다면 feature 종료 시 `stop()`을 호출해 중복 listener와 불필요한 화면 갱신을 막습니다.

### Auth state와 ID token 변화는 관찰 목적이 달라요

| listener                      | 주로 관찰하는 것                                                  |
| ----------------------------- | ----------------------------------------------------------------- |
| `addStateDidChangeListener`   | 초기 session 복원, 로그인, 로그아웃처럼 현재 사용자가 바뀌는 상태 |
| `addIDTokenDidChangeListener` | 로그인·로그아웃뿐 아니라 현재 사용자의 ID token 변화              |

root 화면 전환에는 auth state listener가 보통 충분해요. custom claims 갱신이나 token 변화에 맞춰 별도 동작이 필요할 때 ID token listener를 검토합니다. listener가 호출되었다는 이유로 매번 network 요청을 다시 보내지 말고 실제 목적을 먼저 정하세요.

## `uid`와 ID token은 용도가 달라요

`uid`는 데이터 경로를 구성하기 좋은 사용자 식별자예요.

```text
users/{uid}
users/{uid}/privateNotes/{noteID}
```

하지만 우리 서버에 다음처럼 `uid` 문자열만 보내 사용자를 인증하면 안 돼요.

```json
{
  "uid": "someone-else-uid"
}
```

클라이언트가 문자열을 마음대로 바꿀 수 있기 때문이에요. 우리 서버를 호출할 때는 현재 사용자의 ID token을 보내고, 서버가 Firebase Admin SDK로 token의 서명·만료·project를 검증한 뒤 token 안의 `uid`를 사용합니다.

```swift
import FirebaseAuth

func authorizationHeader() async throws -> String {
  guard let user = Auth.auth().currentUser else {
    throw AuthRequestError.signedOut
  }

  let idToken = try await user.getIDToken()
  return "Bearer \(idToken)"
}

enum AuthRequestError: Error {
  case signedOut
}
```

ID token은 영구 API key가 아니에요. SDK가 갱신을 관리하므로 token 값을 `UserDefaults`에 따로 저장하거나 로그에 출력하지 않습니다.

## 인증과 권한 부여를 구분해요

Authentication은 “누구인가”를 확인해요. “이 사용자가 이 문서를 읽어도 되는가”는 Security Rules나 우리 서버가 결정합니다.

```text
Authentication: request.auth.uid = "user-123"
                         │
                         ▼
Security Rules: 이 uid가 문서 ownerID와 같은가?
```

클라이언트에서 `if currentUser.uid == ownerID`로 버튼을 숨기는 것은 UX 처리일 뿐 권한 검사가 아니에요. 같은 조건을 Rules에 작성해야 직접 API 호출도 차단됩니다.

## 오류는 사용자 메시지와 진단 정보를 분리해요

Auth 오류에는 잘못된 credential, 비활성화된 계정, network 오류, 너무 많은 요청 등 서로 다른 원인이 있어요. 화면에는 계정 존재 여부가 과도하게 노출되지 않는 안전한 문장을 보여 주고, 개발 로그에는 민감 정보 없이 error code와 흐름을 기록합니다.

```swift
import OSLog

let logger = Logger(
  subsystem: "com.example.Reading",
  category: "FirebaseAuth"
)

enum SignInError: Error {
  case failed
}

do {
  _ = try await Auth.auth().signIn(
    withEmail: email,
    password: password
  )
} catch {
  // 운영 로그에 password, ID token, 전체 사용자 정보를 남기지 않아요.
  logger.error("Firebase Auth sign-in failed: \(error.localizedDescription)")
  throw SignInError.failed
}
```

비밀번호 변경, 이메일 변경, 계정 삭제는 recent sign-in을 요구할 수 있어요. 이 경우 현재 credential로 사용자를 재인증한 다음 민감 작업을 다시 시도하는 별도 UX가 필요합니다.

## 언제 유용한가요?

- 서버를 직접 구축하지 않고 이메일·소셜 로그인과 session 복원을 제공할 때
- Firestore, Realtime Database, Storage Rules에서 사용자별 접근을 제어할 때
- 우리 서버가 Firebase ID token을 검증해 동일한 사용자 체계를 사용할 때

조직별 복잡한 권한, 장기 session 정책, 규제 요구사항이 있다면 Firebase Auth만으로 충분한지 서버 인증 체계와 함께 검토해야 해요.

## 체크리스트

- [ ] Console에서 사용할 Auth provider를 활성화했나요?
- [ ] 앱 시작의 `checking` 상태와 실제 `signedOut`을 구분했나요?
- [ ] auth state listener handle을 한 곳에서 보관하고 제거하나요?
- [ ] `uid` 문자열을 서버 인증 credential처럼 신뢰하지 않나요?
- [ ] 민감 작업의 recent sign-in 요구사항을 처리하나요?
- [ ] password와 ID token을 로그나 `UserDefaults`에 저장하지 않나요?
- [ ] 데이터 접근 권한을 Security Rules 또는 서버에서도 검사하나요?

## 면접에서 이어질 수 있는 질문

### `currentUser`만 확인하면 충분하지 않은 이유는 무엇인가요?

앱 시작 시 저장된 session을 복원하는 동안 일시적으로 `nil`일 수 있고, 이후 로그인·로그아웃 변화도 반영해야 하기 때문이에요. auth state listener는 초기 복원 완료와 상태 변화를 하나의 흐름으로 전달합니다.

### `uid`를 서버에 보내면 인증이 되나요?

아니요. `uid`는 클라이언트가 바꿀 수 있는 식별 문자열이에요. 서버는 Firebase가 서명한 ID token을 검증하고 그 token에서 `uid`를 읽어야 합니다.

### Auth listener와 Firestore listener는 같은가요?

둘 다 지속 구독이지만 관찰 대상이 달라요. Auth listener는 로그인 session 변화를, Firestore listener는 document나 query 결과 변화를 전달합니다. 각 API가 반환한 handle을 해당 제거 method로 정리해야 해요.

## 참고 자료

- [Apple 플랫폼에서 Firebase Authentication 시작하기](https://firebase.google.com/docs/auth/ios/start)
- [이메일과 비밀번호로 인증하기](https://firebase.google.com/docs/auth/ios/password-auth)
- [Apple 플랫폼의 사용자 관리](https://firebase.google.com/docs/auth/ios/manage-users)
- [FirebaseAuth `Auth` API Reference](https://firebase.google.com/docs/reference/swift/firebaseauth/api/reference/Classes/Auth)
- [Firebase ID token 검증](https://firebase.google.com/docs/auth/admin/verify-id-tokens)
