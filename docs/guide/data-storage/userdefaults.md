---
title: Swift로 이해하는 UserDefaults
description: UserDefaults의 key-value 저장, 지원 타입, 도메인 검색 순서, 메모리·디스크 반영, 개인정보 보호와 테스트 기준을 Swift 예제로 설명합니다.
pageType: doc-wide
outline: false
---

# Swift로 이해하는 UserDefaults

> **면접 답변 한 줄 요약:** `UserDefaults`는 앱의 작고 민감하지 않은 설정을 문자열 key와 property list 값으로 저장하는 Foundation API이며, 값을 메모리에 즉시 반영하고 영속 저장소에는 비동기로 기록해 다음 실행에서도 읽을 수 있게 해요.

앱을 다시 실행해도 다크 모드 선택, 알림 허용 여부, 마지막으로 선택한 탭 같은 작은 설정은 유지되어야 해요. 이런 값을 매번 파일로 직렬화하고 경로를 관리할 수도 있지만, 단순한 설정에는 코드가 지나치게 커져요.

`UserDefaults`는 이런 **사용자 기본 설정과 앱 구성 값**을 key-value 형태로 관리해요. 이름에 `Defaults`가 들어가지만 기본값만 제공하는 API는 아니에요. [Apple의 UserDefaults 문서](https://developer.apple.com/documentation/foundation/userdefaults)가 정의하듯 실제로 변경한 값을 기기에 영속적으로 저장하고, 다음 실행에서 다시 읽을 수 있는 설정 데이터베이스의 인터페이스예요.

이 문서에서는 독서 목표 앱을 예로 들어 다음 내용을 설명해요.

- `UserDefaults.standard`로 값을 읽고 쓰는 방법
- 저장 가능한 값과 큰 모델을 넣지 않아야 하는 이유
- 등록 기본값과 저장된 값의 차이
- 여러 domain을 검색해 최종 값을 결정하는 구조
- 메모리 반영과 비동기 디스크 저장의 관계
- key 관리, 관찰, 동시성, 테스트 기준
- privacy manifest에 UserDefaults 사용 이유를 선언하는 방법
- `@AppStorage`와 App Group 공유로 이어지는 관계

## 먼저 알아둘 저장 용어

| 용어                  | 쉬운 뜻                                                                                                                                                         |
| --------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| key-value 저장        | 문자열 key로 값을 찾는 저장 방식이에요. `reading.dailyGoal`이라는 key에 `30`을 연결하는 식이에요.                                                               |
| 영속성(persistence)   | 앱 프로세스가 종료된 뒤에도 값을 남겨 다음 실행에서 다시 읽을 수 있는 성질이에요.                                                                               |
| property list 값      | Apple 플랫폼의 설정 파일이 기본으로 표현할 수 있는 문자열, 숫자, Boolean, 날짜, 데이터, 배열, 딕셔너리 같은 값이에요.                                           |
| domain                | 설정의 출처와 우선순위를 구분하는 논리적인 저장 영역이에요. 앱이 저장한 값, 실행 인자, 등록 기본값이 서로 다른 domain에 들어가요.                               |
| volatile domain       | 현재 프로세스가 실행되는 동안만 존재하고 종료되면 사라지는 설정 영역이에요.                                                                                     |
| persistent domain     | 기기의 영속 저장소에 기록되어 앱을 다시 실행해도 남는 설정 영역이에요.                                                                                          |
| suite                 | 기본 앱 domain과 구분되는 사용자 정의 설정 domain이에요. App Group 식별자로 만든 suite는 앱과 extension이 같은 설정을 읽게 해요.                                |
| 직렬화(serialization) | 메모리의 값을 저장하거나 전달할 수 있는 `Data` 형태로 바꾸는 과정이에요. `Codable` 모델을 `JSONEncoder`로 변환하는 작업이 한 예예요.                            |
| privacy manifest      | 앱이나 SDK가 수집하는 데이터와 required reason API 사용 이유를 기록하는 `PrivacyInfo.xcprivacy` 파일이에요. `UserDefaults`는 사용 이유를 선언해야 하는 API예요. |

## 메모리에만 저장하면 다음 실행에서 사라져요

독서 목표를 일반 저장 프로퍼티로 관리해 볼게요.

```swift
final class ReadingSettings {
  var dailyGoal = 30
}
```

사용자가 `dailyGoal`을 60으로 바꿔도 이 값은 현재 `ReadingSettings` 인스턴스의 메모리에만 있어요. 앱 프로세스가 종료되면 인스턴스도 사라지고, 다음 실행에서는 다시 `30`으로 시작해요.

설정 하나를 직접 파일에 저장하려면 다음 책임을 모두 작성해야 해요.

1. 저장할 파일의 안전한 위치를 찾습니다.
2. 값을 `Data`로 인코딩합니다.
3. 쓰기 실패와 파일 손상을 처리합니다.
4. 다음 실행에서 파일을 읽고 디코딩합니다.
5. 값이 없거나 예전 형식이면 기본값을 결정합니다.

작은 설정 몇 개에는 이 비용이 커요. `UserDefaults`를 사용하면 key와 값에 집중할 수 있어요.

## standard는 현재 앱의 기본 설정 저장소예요

`UserDefaults.standard`는 현재 앱의 표준 설정을 읽고 쓰는 공유 인스턴스예요.

```swift
import Foundation

enum PreferenceKey {
  static let dailyGoal = "reading.dailyGoal"
  static let reminderEnabled = "reading.reminderEnabled"
}

let defaults = UserDefaults.standard

defaults.set(45, forKey: PreferenceKey.dailyGoal)
defaults.set(true, forKey: PreferenceKey.reminderEnabled)

let dailyGoal = defaults.integer(forKey: PreferenceKey.dailyGoal)
let reminderEnabled = defaults.bool(forKey: PreferenceKey.reminderEnabled)

print(dailyGoal)
// 45

print(reminderEnabled)
// true
```

`set(_:forKey:)`로 쓴 값은 앱의 persistent domain에 연결돼요. 다음 실행에서도 같은 bundle의 `UserDefaults.standard`가 같은 key를 검색해 값을 가져와요.

문자열 key를 코드 여러 곳에 직접 반복하면 오타가 생겨도 컴파일러가 찾지 못해요. 한쪽은 `reading.dailyGoal`, 다른 쪽은 `reading.dailygoal`을 사용하면 서로 다른 값으로 취급돼요. 작은 `enum`이나 전용 저장 타입에 key를 모으면 이름 변경과 검색이 쉬워져요.

## 등록 기본값은 저장값이 없을 때 사용하는 fallback이에요

정수 getter인 `integer(forKey:)`는 key가 없거나 정수로 바꿀 수 없으면 `0`을 반환해요. 하지만 독서 목표의 기본값이 `30`이라면 매번 `0`인지 검사하는 방식은 의미가 불분명해요.

앱 시작 직후 기본값을 등록해 두는 편이 명확해요.

```swift
import Foundation

enum DefaultPreferences {
  static let values: [String: Any] = [
    PreferenceKey.dailyGoal: 30,
    PreferenceKey.reminderEnabled: false,
  ]
}

let defaults = UserDefaults.standard
defaults.register(defaults: DefaultPreferences.values)

print(defaults.integer(forKey: PreferenceKey.dailyGoal))
// 저장값이 없다면 30
```

`register(defaults:)`는 값을 앱의 persistent domain에 저장하지 않아요. 가장 낮은 우선순위의 **registration domain**에 fallback을 넣어요. 이 domain은 volatile이므로 앱을 실행할 때마다 다시 등록해야 해요.

사용자가 목표를 `45`로 저장하면 앱 domain의 값이 registration domain보다 먼저 발견돼 `45`가 반환돼요. 나중에 저장값을 제거하면 다시 등록 기본값 `30`이 보여요.

```swift
defaults.set(45, forKey: PreferenceKey.dailyGoal)
print(defaults.integer(forKey: PreferenceKey.dailyGoal))
// 45

defaults.removeObject(forKey: PreferenceKey.dailyGoal)
print(defaults.integer(forKey: PreferenceKey.dailyGoal))
// 30
```

등록 기본값은 **아직 사용자가 선택하지 않은 상태**를 표현할 때 유용해요. 반대로 “사용자가 이 기능을 한 번 설정했는가?”를 구분해야 한다면 `object(forKey:)`로 실제 값의 존재 여부를 확인하거나 별도 key를 두어야 해요.

```swift
let hasSavedGoal = defaults.object(forKey: PreferenceKey.dailyGoal) != nil
```

registration domain에도 같은 key가 있으면 `object(forKey:)`가 fallback을 찾을 수 있으므로, 실제 앱 domain만 검사해야 하는 고급 상황에서는 `persistentDomain(forName:)`처럼 domain을 명시하는 API를 검토해야 해요. 대부분의 앱에서는 명시적인 `hasConfiguredGoal` key가 의도를 더 잘 드러내요.

## property list로 표현할 수 있는 값을 저장해요

Apple 공식 문서에서 안내하는 주요 저장 타입은 다음과 같아요.

| 분류       | 예시                                              | 사용 기준                                            |
| ---------- | ------------------------------------------------- | ---------------------------------------------------- |
| 문자열     | `String`                                          | 이름, 선택한 옵션 식별자처럼 짧은 텍스트에 사용해요. |
| 숫자       | `Int`, `Float`, `Double`, `NSNumber`              | 횟수, 비율, 임계값 같은 설정에 사용해요.             |
| 논리값     | `Bool`                                            | 기능 켜기·끄기 설정에 사용해요.                      |
| 시간과 URL | `Date`, `URL`                                     | 마지막 확인 시각이나 작은 URL 설정에 사용해요.       |
| 바이너리   | `Data`                                            | 꼭 필요한 작은 직렬화 결과에 사용해요.               |
| 컬렉션     | property list 값으로 구성된 `Array`, `Dictionary` | 작고 구조가 단순한 목록이나 매핑에 사용해요.         |

`UserDefaults`에 임의의 Swift 구조체를 그대로 넣을 수는 없어요.

```swift
struct ReadingProfile: Codable {
  let nickname: String
  let favoriteGenres: [String]
}

let profile = ReadingProfile(
  nickname: "Blob",
  favoriteGenres: ["Swift", "Architecture"]
)

let data = try JSONEncoder().encode(profile)
defaults.set(data, forKey: "reading.profile")

guard let savedData = defaults.data(forKey: "reading.profile") else {
  throw CocoaError(.fileReadNoSuchFile)
}

let restored = try JSONDecoder().decode(
  ReadingProfile.self,
  from: savedData
)
```

코드는 가능하지만 모든 모델을 `Data`로 바꿔 넣어도 된다는 뜻은 아니에요. 모델이 커질수록 다음 문제가 생겨요.

- 작은 필드 하나만 바꿔도 전체 `Data`를 다시 인코딩하고 저장해야 해요.
- 모델 구조가 바뀌면 이전 데이터의 migration을 직접 처리해야 해요.
- 검색, 정렬, 부분 갱신, 관계 표현이 어려워요.
- 앱 시작 시 큰 값을 읽고 디코딩하면 성능에 영향을 줄 수 있어요.

작은 설정은 `UserDefaults`, 큰 문서나 이미지와 원자적으로 교체할 snapshot은 파일, 검색과 관계가 필요한 모델은 SwiftData·Core Data·SQLite 같은 데이터베이스를 고려해요.

## UserDefaults는 값을 찾을 때 domain을 순서대로 검색해요

`UserDefaults`는 하나의 딕셔너리만 읽는 것처럼 보이지만 내부적으로 여러 **설정 domain**을 우선순위대로 검색해요. 높은 우선순위에서 key를 찾으면 더 아래 domain은 보지 않아요.

Apple 공식 문서가 설명하는 주요 순서는 다음과 같아요. 일부 domain은 특정 기기나 실행 환경에서만 존재해요.

| 검색 순서 | domain              | 저장 성격  | 역할                                                                                      |
| --------- | ------------------- | ---------- | ----------------------------------------------------------------------------------------- |
| 1         | Managed             | persistent | 관리자가 관리 기기에 강제로 제공한 설정이에요. 앱은 이 값을 직접 쓸 수 없어요.            |
| 2         | Argument            | volatile   | Xcode 실행 인자나 명령줄로 전달한 임시 override예요. 테스트 후 프로세스 종료 시 사라져요. |
| 3         | Educational managed | persistent | 교육 기관의 관리 환경에서 제공하는 설정이에요.                                            |
| 4         | App                 | persistent | 현재 앱 또는 `suiteName`으로 지정한 App Group이 저장한 값이에요.                          |
| 5         | Suite               | persistent | `addSuite(named:)`로 검색 목록에 추가한 사용자 정의 domain이에요.                         |
| 6         | Global              | persistent | 시스템이 모든 앱에 제공하는 전역 설정이에요. 앱은 여기에 쓸 수 없어요.                    |
| 7         | Registration        | volatile   | 앱이 `register(defaults:)`로 등록한 마지막 fallback이에요.                                |

이 구조 때문에 등록 기본값과 저장값이 같은 key를 사용해도 충돌하지 않아요. 앱 domain에 값이 있으면 먼저 반환되고, 없을 때만 registration domain까지 내려가요.

`addSuite(named:)`는 다른 domain을 **검색 목록에 추가**할 뿐 쓰기 대상을 바꾸지 않아요. App Group domain에 직접 쓰려면 해당 식별자로 별도 인스턴스를 만들어야 해요.

```swift
let defaults = UserDefaults.standard
defaults.addSuite(named: "group.com.example.Reading")

// 읽기는 앱 domain 다음에 추가한 suite도 검색해요.
let goal = defaults.integer(forKey: PreferenceKey.dailyGoal)

// 쓰기 대상은 여전히 현재 앱의 domain이에요.
defaults.set(60, forKey: PreferenceKey.dailyGoal)
```

공유 App Group에 읽고 쓰려면 다음처럼 `init(suiteName:)`을 사용해요. 실제 앱에서는 같은 App Group entitlement가 target에 있어야 해요.

```swift
guard let sharedDefaults = UserDefaults(
  suiteName: "group.com.example.Reading"
) else {
  preconditionFailure("App Group 설정을 확인하세요.")
}

sharedDefaults.set(60, forKey: PreferenceKey.dailyGoal)
```

App과 Widget이 이 suite를 공유하는 전체 과정은 [App Groups와 Widget 데이터 공유](./app-groups) 문서에서 이어서 설명해요.

## 쓰기는 메모리에 즉시 반영되고 디스크에는 비동기로 저장돼요

`set`을 호출했을 때의 흐름을 단순화하면 다음과 같아요.

```text
호출 코드
   │ set(value, forKey:)
   ▼
UserDefaults의 메모리 표현 ── 즉시 갱신 ──▶ 같은 프로세스의 다음 읽기
   │
   └──────── 비동기 기록 ────────────────▶ defaults 영속 저장소
```

`set` 직후 같은 `UserDefaults`에서 값을 읽으면 갱신된 메모리 값을 얻어요. Apple은 값을 쓰면 [메모리 표현을 즉시 갱신하고 디스크에는 비동기로 기록한다](https://developer.apple.com/documentation/foundation/userdefaults)고 설명해요. 매번 저장 완료를 기다리며 UI를 막는 구조가 아니에요.

이 구현 세부 때문에 defaults 파일 경로를 추측해서 직접 열거나 수정하면 안 돼요. Apple은 내부 파일을 직접 바꾸면 데이터 손실, 변경 반영 지연, 앱 crash가 발생할 수 있다고 경고해요. 논리적인 key-value API만 사용해야 해요.

### synchronize는 호출하지 않아요

오래된 코드에서는 앱 종료 전 `synchronize()`를 호출하는 예를 볼 수 있어요.

```swift
defaults.set(45, forKey: PreferenceKey.dailyGoal)
defaults.synchronize() // 사용하지 않아요.
```

현재 Apple 문서는 `synchronize()`가 불필요하며 사용하지 말아야 한다고 명시해요. 시스템이 변경을 자동으로 영속 저장소에 반영하도록 두고, 저장 완료를 강제로 제어해야 하는 데이터라면 `UserDefaults`가 아니라 원자적 파일 쓰기나 transaction을 제공하는 데이터베이스가 더 적합한지 검토해요.

## UserDefaults 인스턴스는 thread-safe지만 여러 단계 연산은 따로 보호해요

Apple은 `UserDefaults`를 여러 thread나 task에서 동시에 사용할 수 있는 thread-safe 타입으로 문서화해요. 개별 `set`과 getter 호출 때문에 내부 저장 구조가 깨지지는 않아요.

하지만 읽고 계산하고 다시 쓰는 세 호출 전체가 하나의 원자적 연산이 되는 것은 아니에요.

```swift
func increaseLaunchCount(defaults: UserDefaults) {
  let oldValue = defaults.integer(forKey: "app.launchCount")
  defaults.set(oldValue + 1, forKey: "app.launchCount")
}
```

두 task가 동시에 `oldValue`를 읽으면 같은 값에 각각 1을 더해 한 번의 증가가 사라질 수 있어요. 이런 read-modify-write를 정확히 직렬화해야 한다면 actor나 lock으로 상위 연산을 보호해야 해요. 여러 프로세스가 함께 쓰는 복잡한 데이터라면 transaction을 지원하는 저장소를 선택해요.

```swift
actor LaunchCounter {
  private let defaults: UserDefaults
  private let key = "app.launchCount"

  init(defaults: UserDefaults = .standard) {
    self.defaults = defaults
  }

  func increase() -> Int {
    let nextValue = defaults.integer(forKey: key) + 1
    defaults.set(nextValue, forKey: key)
    return nextValue
  }
}
```

## 변경을 관찰할 수 있지만 화면 연결에는 AppStorage가 간단해요

`UserDefaults`는 설정 변경 notification을 제공해요. 모든 key 변경을 넓게 관찰할 때는 `didChangeNotification`을 사용할 수 있어요.

```swift
import Foundation

let token = NotificationCenter.default.addObserver(
  forName: UserDefaults.didChangeNotification,
  object: UserDefaults.standard,
  queue: .main
) { _ in
  let goal = UserDefaults.standard.integer(
    forKey: PreferenceKey.dailyGoal
  )
  print("목표 변경:", goal)
}

// 관찰이 더 필요하지 않을 때 해제해요.
NotificationCenter.default.removeObserver(token)
```

notification은 어떤 key가 바뀌었는지 직접 전달하지 않으므로 필요한 값을 다시 읽어야 해요. SwiftUI View의 작은 설정 하나를 연결하려는 목적이라면 UserDefaults notification을 직접 관리하는 대신 [`@AppStorage`](./appstorage)를 사용하면 값 변경과 View 갱신을 함께 처리할 수 있어요.

App과 Widget은 서로 다른 프로세스이므로 notification이나 SwiftUI Binding으로 화면이 실시간 연결된다고 가정하면 안 돼요. 공유 저장소에 값을 쓴 뒤 WidgetKit에 timeline reload를 요청하는 별도 흐름이 필요해요.

## 저장 접근을 한 타입에 모으면 key와 기본값이 일관돼요

화면마다 `UserDefaults.standard`와 문자열 key를 직접 사용하면 저장 정책이 UI 코드에 퍼져요. 전용 타입이 key, 기본값, 값 검증을 담당하게 만들 수 있어요.

```swift
import Foundation

struct ReadingPreferences {
  private enum Key {
    static let dailyGoal = "reading.dailyGoal"
    static let reminderEnabled = "reading.reminderEnabled"
  }

  private let defaults: UserDefaults

  init(defaults: UserDefaults = .standard) {
    self.defaults = defaults
    defaults.register(defaults: [
      Key.dailyGoal: 30,
      Key.reminderEnabled: false,
    ])
  }

  var dailyGoal: Int {
    get {
      defaults.integer(forKey: Key.dailyGoal)
    }
    nonmutating set {
      defaults.set(max(newValue, 1), forKey: Key.dailyGoal)
    }
  }

  var reminderEnabled: Bool {
    get {
      defaults.bool(forKey: Key.reminderEnabled)
    }
    nonmutating set {
      defaults.set(newValue, forKey: Key.reminderEnabled)
    }
  }
}
```

호출 코드는 저장 key를 몰라도 돼요.

```swift
let preferences = ReadingPreferences()
preferences.dailyGoal = 45
preferences.reminderEnabled = true
```

이 구조는 `UserDefaults`를 데이터베이스처럼 추상화하기 위한 목적이 아니에요. 문자열 key와 검증 규칙이 여러 화면에 퍼지는 것을 막고, 테스트에서 저장소를 바꾸기 쉽게 만드는 작은 경계예요.

## 테스트에서는 전용 suite를 만들고 흔적을 제거해요

테스트가 `UserDefaults.standard`를 사용하면 이전 테스트나 개발 중 저장한 값에 영향을 받을 수 있어요. 테스트마다 고유한 suite 이름을 만들면 값을 격리할 수 있어요.

```swift
import Foundation
import Testing

@Test
func dailyGoalIsClampedToPositiveValue() {
  let suiteName = "ReadingPreferencesTests.\(UUID().uuidString)"
  let defaults = UserDefaults(suiteName: suiteName)!

  defer {
    defaults.removePersistentDomain(forName: suiteName)
  }

  let preferences = ReadingPreferences(defaults: defaults)
  preferences.dailyGoal = -10

  #expect(preferences.dailyGoal == 1)
}
```

테스트가 끝나면 `removePersistentDomain(forName:)`으로 suite를 정리해 다른 실행에 영향을 주지 않게 해요. 실제 App Group suite를 사용하는 통합 테스트에서는 test target의 entitlement와 서명 환경도 함께 확인해야 해요.

## 민감한 정보와 큰 데이터는 저장하지 않아요

Apple은 defaults 시스템의 정보가 디스크에 암호화되지 않은 형태로 저장될 수 있으므로 개인 정보나 민감한 정보를 넣지 말라고 안내해요.

| 데이터                                 | 권장 저장소                            |
| -------------------------------------- | -------------------------------------- |
| 다크 모드, 정렬 방식, 작은 기능 flag   | `UserDefaults`                         |
| 인증 token, 비밀번호, 암호화 key       | Keychain                               |
| 이미지, 문서, 큰 JSON snapshot         | 앱 또는 App Group 파일 container       |
| 검색·정렬·관계·부분 수정이 필요한 모델 | SwiftData, Core Data, SQLite           |
| 여러 기기의 같은 사용자 설정           | `NSUbiquitousKeyValueStore`나 CloudKit |

또한 `UserDefaults`는 required reason API예요. 앱이나 SDK에서 사용할 때 `PrivacyInfo.xcprivacy`의 `NSPrivacyAccessedAPITypes`에 [Apple이 허용한 실제 사용 이유](https://developer.apple.com/documentation/bundleresources/app-privacy-configuration/nsprivacyaccessedapitypes/nsprivacyaccessedapitype)를 선언해야 해요.

- 앱 자체만 접근하는 설정에는 Apple이 정의한 `CA92.1` reason을 검토해요.
- 같은 App Group의 앱·extension·App Clip이 함께 접근하는 설정에는 `1C8F.1` reason을 검토해요.

reason code를 단순 복사하지 말고 현재 Apple 문서의 허용 범위와 실제 구현이 일치하는지 확인해야 해요. fingerprinting 목적으로 기기 신호를 수집하는 것은 허용되지 않아요.

## 언제 UserDefaults를 사용해야 하나요

다음 조건을 대부분 만족하면 적합해요.

- 앱의 시작 상태나 동작을 바꾸는 작은 설정이에요.
- 값이 property list 타입으로 자연스럽게 표현돼요.
- key 하나로 전체 값을 읽고 쓰는 방식이 충분해요.
- 민감한 정보가 아니에요.
- 기기 간 동기화가 필요하지 않아요.
- transaction, 복잡한 검색, 관계, 대량 데이터가 필요하지 않아요.

값을 “저장할 수 있다”는 사실과 “저장하기 적합하다”는 판단은 달라요. `Data`로 인코딩할 수 있다는 이유만으로 모든 앱 모델을 넣지 않아요.

## 적용 순서를 정리해요

1. 저장하려는 값이 작은 비민감 설정인지 확인해요.
2. 문자열 key를 한 위치에 모으고 의미가 드러나는 namespace를 사용해요.
3. 앱 시작 시 `register(defaults:)`로 fallback을 등록해요.
4. 타입에 맞는 getter와 `set(_:forKey:)`를 사용해요.
5. `synchronize()`나 내부 defaults 파일 직접 접근을 제거해요.
6. 여러 단계 갱신에는 actor·lock·transaction이 필요한지 검토해요.
7. 테스트 저장소를 격리하고 종료 후 persistent domain을 정리해요.
8. `PrivacyInfo.xcprivacy`의 UserDefaults required reason이 실제 사용과 맞는지 확인해요.

## 면접에서 이어질 수 있는 질문

### UserDefaults의 값은 set을 호출하면 즉시 디스크에 저장되나요?

메모리 표현에는 즉시 반영되지만 영속 저장소에는 비동기로 기록돼요. 같은 프로세스에서 이어지는 읽기는 새 값을 얻지만 디스크 파일을 직접 확인하거나 `synchronize()`로 강제하는 방식에 의존하면 안 돼요.

### register(defaults:)와 set의 차이는 무엇인가요?

`register(defaults:)`는 저장값이 없을 때 사용할 volatile fallback을 registration domain에 넣어요. `set`은 앱이나 suite의 persistent domain에 실제 선택값을 기록해 다음 실행에서도 유지해요.

### UserDefaults가 thread-safe라면 동시성 처리가 필요 없나요?

개별 API 호출은 thread-safe하지만 여러 호출로 구성된 read-modify-write 전체가 원자적인 것은 아니에요. 경쟁하면 안 되는 복합 연산은 actor나 lock으로 보호하고, 여러 프로세스 transaction이 필요하면 다른 저장소를 선택해요.

### UserDefaults에 Codable 모델을 Data로 저장해도 되나요?

작고 단순한 snapshot에는 가능하지만 모델이 커지면 전체 재인코딩, migration, 검색과 부분 수정 비용이 커져요. 저장 가능 여부보다 데이터 크기와 접근 패턴을 기준으로 파일이나 데이터베이스와 비교해야 해요.

### standard와 suiteName으로 만든 UserDefaults는 어떻게 다른가요?

`standard`는 현재 앱의 기본 domain을 읽고 쓰고, `init(suiteName:)`은 지정한 custom domain을 쓰기 대상으로 사용해요. App Group 식별자를 suite 이름으로 사용하고 entitlement가 맞으면 앱과 extension이 같은 설정을 공유할 수 있어요.

## 참고 자료

- [Apple Developer — UserDefaults](https://developer.apple.com/documentation/foundation/userdefaults)
- [Apple Developer — register(defaults:)](<https://developer.apple.com/documentation/foundation/userdefaults/register(defaults:)>)
- [Apple Developer — init(suiteName:)](<https://developer.apple.com/documentation/foundation/userdefaults/init(suitename:)>)
- [Apple Developer — synchronize()](<https://developer.apple.com/documentation/foundation/userdefaults/synchronize()>)
- [Apple Developer — Privacy manifest files](https://developer.apple.com/documentation/bundleresources/privacy-manifest-files)
- [Apple Developer — UserDefaults required reason API](https://developer.apple.com/documentation/bundleresources/app-privacy-configuration/nsprivacyaccessedapitypes/nsprivacyaccessedapitype)
- [Swift-KR — 저장소와 데이터 경계](./storage-overview)
- [Swift-KR — @AppStorage](./appstorage)
- [Swift-KR — SwiftData](./swiftdata)
- [Swift-KR — 파일과 App Group container](./file-containers)
- [Swift-KR — App Groups와 Widget 데이터 공유](./app-groups)
- [Swift-KR — Keychain과 access group](./keychain)
- [Swift-KR — iCloud key-value storage와 CloudKit](./icloud-cloudkit)
- [Swift-KR — Property Wrapper](../swift/property-wrappers)
