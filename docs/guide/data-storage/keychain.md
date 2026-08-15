---
title: Swift Keychain과 access group 이해하기
description: Keychain item의 class와 attribute, SecItem CRUD, accessibility와 사용자 인증, access group 공유, 오류 처리와 테스트 기준을 Swift 예제로 설명합니다.
pageType: doc-wide
outline: false
---

# Swift Keychain과 access group 이해하기

> **면접 답변 한 줄 요약:** Keychain은 password·token·암호화 key 같은 작은 비밀을 item과 attribute로 저장하는 보안 서비스이며, `kSecAttrAccessible`로 기기 상태에 따른 접근 시점을 제한하고 access group entitlement로 관련 앱 사이의 접근 범위를 정해요.

로그인 뒤 받은 access token을 다음 실행에도 사용하려고 해요. `UserDefaults`에 문자열로 저장하면 코드는 간단하지만 비밀 저장 정책을 표현할 수 없어요.

```swift
// 비밀에는 사용하지 않아요.
UserDefaults.standard.set(
  accessToken,
  forKey: "auth.accessToken"
)
```

일반 JSON file이나 SwiftData model 속성도 같은 문제가 있어요. 앱 sandbox는 기본 격리를 제공하지만 “기기가 잠겼을 때 접근 가능한가?”, “다른 기기로 복원되는가?”, “사용자 인증을 다시 요구하는가?”, “어떤 관련 앱이 읽을 수 있는가?”를 item마다 표현하는 보안 API는 아니에요.

Keychain Services는 이런 작은 비밀을 별도 item으로 관리하고 code signing과 entitlement, Data Protection 상태에 따라 접근을 제어해요.

## 먼저 알아둘 Keychain 용어

| 용어                | 쉬운 뜻                                                                                                                     |
| ------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| keychain item       | Keychain에 저장하는 하나의 record예요. secret data와 검색·보안 attribute로 구성돼요.                                        |
| item class          | generic password, internet password, certificate, key, identity처럼 item의 종류를 구분해요.                                 |
| query dictionary    | item의 추가·검색·수정·삭제 조건과 option을 key-value로 표현한 dictionary예요.                                               |
| generic password    | 앱 자체 account나 token처럼 service와 account로 식별하는 일반 자격 증명 item이에요.                                         |
| `service`           | 같은 앱 안에서 자격 증명의 용도를 구분하는 문자열이에요. bundle identifier나 API 이름을 사용할 수 있어요.                   |
| `account`           | 한 service 안에서 사용자를 구분하는 문자열이에요.                                                                           |
| accessibility       | 기기가 잠겼는지, passcode가 설정됐는지, 다른 기기로 migration할 수 있는지에 따른 item 접근 정책이에요.                      |
| access control      | 사용자 presence, biometric, device passcode처럼 item을 읽기 위해 추가로 만족해야 할 조건이에요.                             |
| access group        | 어떤 app들이 같은 Keychain item을 읽을 수 있는지 구분하는 entitlement 기반 보안 group이에요. item은 한 group에 속해요.      |
| OSStatus            | Security framework 함수의 성공·실패 결과 code예요. `errSecSuccess`, `errSecItemNotFound` 등이 있어요.                       |
| synchronizable item | iCloud Keychain을 통해 같은 사용자의 기기 사이에 동기화할 수 있도록 표시한 item이에요. CloudKit record와는 다른 기능이에요. |

## Keychain item은 data와 attribute로 구성돼요

로그인 token을 generic password item으로 저장하면 구조를 다음처럼 볼 수 있어요.

```text
Keychain item
├─ class: generic password
├─ service: com.example.Reading.auth
├─ account: user-1234
├─ value data: access token의 UTF-8 Data
├─ accessible: when unlocked, this device only
└─ access group: 앱의 기본 group 또는 지정한 shared group
```

`service`와 `account`는 secret 자체가 아니라 item을 다시 찾을 식별 attribute예요. 하나의 “token” key만 반복하면 여러 account와 environment의 item이 충돌할 수 있으므로 용도를 안정적으로 구분해요.

## SecItem API는 하나의 query dictionary를 사용해요

Keychain Services의 주요 C API는 다음과 같아요.

| 작업   | API                   | 역할                                                  |
| ------ | --------------------- | ----------------------------------------------------- |
| Create | `SecItemAdd`          | attribute와 secret data를 가진 새 item을 추가해요.    |
| Read   | `SecItemCopyMatching` | query에 맞는 item의 data나 attribute를 가져와요.      |
| Update | `SecItemUpdate`       | search query에 맞는 item의 attribute와 data를 바꿔요. |
| Delete | `SecItemDelete`       | query에 맞는 item을 삭제해요.                         |

Swift wrapper가 이 API의 query 작성과 `OSStatus` 처리를 한곳에 모으면 UI가 Security framework 세부 사항에 의존하지 않아요.

## 오류 type부터 만들어요

```swift
import Security

struct KeychainError: Error, CustomStringConvertible {
  let status: OSStatus

  var description: String {
    if let message = SecCopyErrorMessageString(
      status,
      nil
    ) as String? {
      return message
    }

    return "Keychain error: \(status)"
  }
}
```

`OSStatus`를 `Bool`로 지우지 말고 caller가 not found, duplicate, missing entitlement, authentication failure를 구분할 수 있게 해요. 사용자에게는 이해할 수 있는 메시지로 변환하되 secret data와 query 전체를 log에 출력하지 않아요.

## generic password 저장 type을 만들어요

```swift
import Foundation
import Security

struct GenericPasswordStore: Sendable {
  let service: String
  let accessGroup: String?

  init(service: String, accessGroup: String? = nil) {
    self.service = service
    self.accessGroup = accessGroup
  }

  private func baseQuery(account: String) -> [String: Any] {
    var query: [String: Any] = [
      kSecClass as String: kSecClassGenericPassword,
      kSecAttrService as String: service,
      kSecAttrAccount as String: account,
    ]

    if let accessGroup {
      query[kSecAttrAccessGroup as String] = accessGroup
    }

    return query
  }
}
```

기본 query에는 item을 유일하게 찾을 class, service, account와 선택적 access group을 넣어요. access group을 명시하려면 현재 app의 entitlement가 해당 group을 허용해야 해요.

## Create와 Update를 구분해서 저장해요

같은 식별자의 generic password item을 다시 `SecItemAdd`하면 `errSecDuplicateItem`이 발생해요. 먼저 update하고 item이 없을 때 add하는 upsert를 만들 수 있어요.

```swift
extension GenericPasswordStore {
  func save(
    _ data: Data,
    account: String
  ) throws {
    let query = baseQuery(account: account)
    let updates: [String: Any] = [
      kSecValueData as String: data,
      kSecAttrAccessible as String:
        kSecAttrAccessibleWhenUnlockedThisDeviceOnly,
    ]

    let updateStatus = SecItemUpdate(
      query as CFDictionary,
      updates as CFDictionary
    )

    switch updateStatus {
    case errSecSuccess:
      return

    case errSecItemNotFound:
      var attributes = query
      updates.forEach { key, value in
        attributes[key] = value
      }

      let addStatus = SecItemAdd(
        attributes as CFDictionary,
        nil
      )

      guard addStatus == errSecSuccess else {
        throw KeychainError(status: addStatus)
      }

    default:
      throw KeychainError(status: updateStatus)
    }
  }
}
```

이 예제의 `kSecAttrAccessibleWhenUnlockedThisDeviceOnly`는 기기가 unlock된 동안 접근할 수 있고 다른 기기로 migration하지 않는 정책이에요. 모든 앱에 정답인 상수는 아니므로 background access와 복원 요구를 보고 선택해야 해요.

string token을 저장하는 convenience method를 추가할 수 있어요.

```swift
extension GenericPasswordStore {
  func save(_ value: String, account: String) throws {
    guard let data = value.data(using: .utf8) else {
      throw CocoaError(.fileWriteInapplicableStringEncoding)
    }

    try save(data, account: account)
  }
}
```

## SecItemCopyMatching으로 읽어요

```swift
extension GenericPasswordStore {
  func readData(account: String) throws -> Data? {
    var query = baseQuery(account: account)
    query[kSecReturnData as String] = true
    query[kSecMatchLimit as String] = kSecMatchLimitOne

    var result: CFTypeRef?
    let status = SecItemCopyMatching(
      query as CFDictionary,
      &result
    )

    switch status {
    case errSecSuccess:
      guard let data = result as? Data else {
        throw KeychainError(status: errSecDecode)
      }
      return data

    case errSecItemNotFound:
      return nil

    default:
      throw KeychainError(status: status)
    }
  }

  func readString(account: String) throws -> String? {
    guard let data = try readData(account: account) else {
      return nil
    }

    guard let value = String(data: data, encoding: .utf8) else {
      throw CocoaError(.fileReadInapplicableStringEncoding)
    }

    return value
  }
}
```

“item이 없음”은 첫 로그인처럼 정상적인 앱 상태일 수 있으므로 `nil`로 돌려주고, decode나 entitlement 오류는 throw하도록 구분했어요. 앱의 domain에 맞게 `notAuthenticated` 상태로 mapping할 수 있어요.

## SecItemDelete로 로그아웃을 처리해요

```swift
extension GenericPasswordStore {
  func delete(account: String) throws {
    let status = SecItemDelete(
      baseQuery(account: account) as CFDictionary
    )

    guard status == errSecSuccess
      || status == errSecItemNotFound
    else {
      throw KeychainError(status: status)
    }
  }
}
```

로그아웃에서 item이 이미 없으면 원하는 최종 상태와 같으므로 성공으로 취급할 수 있어요. 계정 삭제에서는 server token 폐기와 local item 삭제의 순서, offline 실패를 별도로 설계해야 해요.

## accessibility는 접근 가능한 기기 상태를 정해요

Apple은 [`kSecAttrAccessible`](https://developer.apple.com/documentation/security/ksecattraccessible)에 대해 앱 요구를 만족하는 가장 제한적인 option을 선택하라고 안내해요.

| 대표 option                                       | 접근 시점과 이동성                                                       | 검토할 상황                                    |
| ------------------------------------------------- | ------------------------------------------------------------------------ | ---------------------------------------------- |
| `kSecAttrAccessibleWhenUnlocked`                  | device가 unlock된 동안 접근, 다른 device로 migration 가능                | 사용자가 앱을 직접 사용하는 동안 필요한 secret |
| `kSecAttrAccessibleAfterFirstUnlock`              | 재부팅 뒤 한 번 unlock하면 다음 재부팅 전까지 background에서도 접근 가능 | 잠긴 상태의 background 작업이 꼭 필요한 경우   |
| `kSecAttrAccessibleWhenUnlockedThisDeviceOnly`    | unlock된 동안 접근, 다른 device로 migration하지 않음                     | device에 묶고 싶은 token                       |
| `kSecAttrAccessibleWhenPasscodeSetThisDeviceOnly` | passcode가 설정된 device에서만 접근, migration하지 않음                  | 더 민감하고 passcode 의존성이 허용되는 secret  |

`ThisDeviceOnly`가 붙은 item은 backup이나 sync를 통해 다른 device로 이동할 수 없어요. 반대로 background 작업이 필요하다는 이유만으로 너무 넓은 접근 option을 선택하지 말고 실제 실행 조건을 확인해요.

## access control로 사용자 presence를 요구해요

금융 승인용 key처럼 앱이 열린 것만으로 충분하지 않은 item은 `SecAccessControl`을 만들고 사용자 presence나 biometric 조건을 붙일 수 있어요.

```swift
import Security

func makeUserPresenceAccessControl() throws -> SecAccessControl {
  var error: Unmanaged<CFError>?

  guard let accessControl = SecAccessControlCreateWithFlags(
    nil,
    kSecAttrAccessibleWhenPasscodeSetThisDeviceOnly,
    [.userPresence],
    &error
  ) else {
    throw error?.takeRetainedValue()
      ?? KeychainError(status: errSecParam)
  }

  return accessControl
}
```

item을 추가할 때 `kSecAttrAccessControl` attribute에 이 값을 넣어요. 이때 같은 query에 `kSecAttrAccessible`도 중복 지정하지 않아요. accessibility가 access control 생성 과정에 포함되기 때문이에요.

`.userPresence`는 가능한 인증 mechanism을 system이 선택하게 해요. biometric만 강제할지, 현재 등록된 biometric set이 바뀌면 item을 무효화할지에 따라 `SecAccessControlCreateFlags` 선택이 달라져요. 인증 UI가 발생할 수 있으므로 background에서 조용히 읽힌다고 가정하지 않아요.

## access group은 어떤 앱이 item을 읽는지 정해요

기본적으로 access group을 지정하지 않으면 Keychain Services가 app의 기본 access group을 사용해요. 관련 앱이나 extension과 item을 공유해야 할 때는 Keychain Sharing 또는 App Groups entitlement로 허용된 group을 사용해요.

```text
App A entitlement ───┐
                     ├─ shared access group ── Keychain item
App B entitlement ───┘

App C: group 없음 ─────────────────────────── 접근 불가
```

Apple의 [`kSecAttrAccessGroup`](https://developer.apple.com/documentation/security/ksecattraccessgroup) 문서에 따르면 app이 속한 access group 목록은 Keychain Access Groups entitlement, app ID, App Groups entitlement의 식별자로 구성될 수 있어요. item은 그중 **하나의 access group**에 속하고, app은 자신이 속하지 않은 group을 지정할 수 없어요.

```swift
let sharedStore = GenericPasswordStore(
  service: "com.example.Reading.auth",
  accessGroup: "TEAMID.com.example.SharedCredentials"
)
```

실제 group 문자열은 Xcode capability와 signed entitlement에 맞아야 해요. 허용되지 않은 group으로 add하면 `errSecMissingEntitlement`가 발생해요.

### App Group file 공유와는 다른 저장소예요

- App Group file container: shared directory의 URL을 얻어 file을 읽고 써요.
- UserDefaults App Group suite: shared preferences domain을 읽고 써요.
- Keychain access group: shared Keychain item에 대한 보안 접근 경계예요.

같은 App Group identifier가 access group 목록에 참여할 수 있어도 실제 저장 형식과 API는 서로 달라요.

## iCloud Keychain 동기화는 별도 선택이에요

item에 `kSecAttrSynchronizable`을 지정하면 iCloud Keychain을 통한 동기화 대상이 될 수 있어요. 이는 CloudKit container에 `CKRecord`를 저장하는 것과 달라요.

동기화를 켤 때는 다음 제약을 확인해요.

- 사용자의 iCloud Keychain 상태와 동기화 시점을 앱이 즉시 제어하지 못해요.
- `ThisDeviceOnly` accessibility option은 다른 device로 이동할 수 없으므로 synchronizable item에 사용할 수 없어요.
- 모든 token이 기기 사이에 공유되어야 하는지 server의 session 정책과 함께 결정해요.
- 검색 query에서 synchronizable item을 포함할지 명시해야 하는 상황이 있어요.

일반 설정을 sync하려고 Keychain을 사용하지 않아요. 비민감한 작은 설정은 `NSUbiquitousKeyValueStore`, 구조화된 cloud data는 CloudKit을 검토해요.

## UI에서 Security 세부 사항을 숨겨요

domain code가 `OSStatus`와 CFDictionary를 직접 알지 않도록 작은 protocol을 둘 수 있어요.

```swift
protocol CredentialStoring: Sendable {
  func save(_ value: String, account: String) throws
  func readString(account: String) throws -> String?
  func delete(account: String) throws
}

extension GenericPasswordStore: CredentialStoring {}
```

로그인 service는 `CredentialStoring`에 의존하고 production에서는 Keychain adapter, unit test에서는 memory fake를 주입해요.

```swift
final class InMemoryCredentialStore: CredentialStoring,
  @unchecked Sendable {
  private let lock = NSLock()
  private var values: [String: String] = [:]

  func save(_ value: String, account: String) {
    lock.withLock {
      values[account] = value
    }
  }

  func readString(account: String) -> String? {
    lock.withLock {
      values[account]
    }
  }

  func delete(account: String) {
    _ = lock.withLock {
      values.removeValue(forKey: account)
    }
  }
}
```

unit test가 실제 사용자의 Keychain item을 만들고 지우지 않게 할 수 있어요. Keychain wrapper 자체의 integration test는 test 전용 service와 account를 사용하고 생성한 정확한 item만 정리해요.

## 다른 저장 기술과 비교해요

| 기준         | UserDefaults              | 일반 파일·SwiftData     | Keychain                                  |
| ------------ | ------------------------- | ----------------------- | ----------------------------------------- |
| 주요 목적    | 작은 비민감 설정          | 일반 앱 content와 model | password, token, cryptographic key        |
| 검색 방식    | key                       | URL 또는 model query    | class와 attribute query                   |
| 접근 정책    | app·suite domain          | sandbox·App Group       | accessibility·access control·access group |
| 사용자 인증  | 제공하지 않음             | 별도 구현               | `SecAccessControl`로 요구 가능            |
| 기기 간 이동 | standard 자체는 sync 아님 | 별도 sync 필요          | synchronizable item에서 선택 가능         |
| 큰 데이터    | 부적합                    | 적합                    | 부적합                                    |

## 자주 발생하는 실수

### token을 UserDefaults나 log에 남겨요

저장소를 Keychain으로 바꿔도 request·error log에 token 전체를 출력하면 보호가 깨져요. secret의 저장·전송·관찰 경로 전체를 확인해요.

### 모든 오류를 item 없음으로 처리해요

`errSecItemNotFound`와 `errSecMissingEntitlement`, authentication failure를 구분하지 않으면 설정 문제와 사용자의 로그아웃 상태가 같은 화면으로 보여요.

### service와 account 없이 item을 넓게 검색해요

query 범위가 넓으면 다른 기능의 item을 읽거나 삭제할 수 있어요. class, service, account와 필요한 access group을 안정적으로 지정해요.

### 가장 편한 accessibility를 고정해요

background access, device migration, passcode 요구가 제품마다 달라요. 가능한 가장 제한적인 option을 요구 사항에 맞춰 선택해요.

## 적용 체크리스트

- 저장 값이 실제로 작은 secret인가요?
- generic password의 service와 account가 안정적으로 item을 구분하나요?
- `OSStatus`에서 not found, duplicate, entitlement와 인증 오류를 구분하나요?
- background와 migration 요구에 맞는 accessibility를 선택했나요?
- 매우 민감한 item은 user presence나 biometric access control이 필요한가요?
- shared access가 필요하다면 모든 target의 entitlement와 group이 정확한가요?
- synchronizable 여부와 server session 정책이 일치하나요?
- secret value와 query data를 log·analytics에 출력하지 않나요?
- unit test는 protocol과 memory fake로 실제 Keychain을 격리하나요?

## 면접에서 자주 나오는 질문

### Keychain과 UserDefaults의 가장 큰 차이는 무엇인가요?

UserDefaults는 작은 비민감 설정을 위한 key-value API이고, Keychain은 자격 증명과 key 같은 비밀을 item attribute, accessibility, access control, code-signing 기반 access group으로 보호하는 보안 서비스예요.

### kSecAttrAccessible과 kSecAttrAccessControl은 어떻게 다른가요?

accessibility는 lock 상태와 passcode, device migration 같은 기본 접근 시점을 정하고, access control은 사용자 presence나 biometric 같은 추가 인증 조건을 표현해요. access control을 만들 때 accessibility 정책도 함께 지정할 수 있어요.

### access group과 App Group은 같은가요?

동일하지 않아요. access group은 Keychain item을 읽을 app 집합이고 App Group은 관련 target의 shared container와 preferences 접근 권한이에요. 다만 App Groups entitlement의 식별자가 app의 Keychain access group 목록에 포함될 수 있어 연결점은 있어요.

### Keychain item은 항상 iCloud로 동기화되나요?

아니에요. 동기화하려면 synchronizable attribute와 가능한 accessibility를 선택해야 하고, iCloud Keychain 상태의 영향을 받아요. `ThisDeviceOnly` item은 다른 device로 동기화되지 않아요.

## 참고 자료

- [Apple Developer Documentation - Keychain Services](https://developer.apple.com/documentation/security/keychain-services)
- [Apple Developer Documentation - Adding a password to the keychain](https://developer.apple.com/documentation/security/adding-a-password-to-the-keychain)
- [Apple Developer Documentation - Searching for keychain items](https://developer.apple.com/documentation/security/searching-for-keychain-items)
- [Apple Developer Documentation - Restricting keychain item accessibility](https://developer.apple.com/documentation/security/restricting-keychain-item-accessibility)
- [Apple Developer Documentation - kSecAttrAccessible](https://developer.apple.com/documentation/security/ksecattraccessible)
- [Apple Developer Documentation - kSecAttrAccessGroup](https://developer.apple.com/documentation/security/ksecattraccessgroup)
- [Apple Developer Documentation - Sharing access to keychain items among a collection of apps](https://developer.apple.com/documentation/security/sharing-access-to-keychain-items-among-a-collection-of-apps)
