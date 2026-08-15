---
title: Swift로 이해하는 App Groups와 Widget 데이터 공유
description: App Groups의 entitlement와 sandbox 구조, shared UserDefaults·파일 container, App과 Widget timeline 데이터 공유 흐름을 상세한 Swift 예제로 설명합니다.
pageType: doc-wide
outline: false
---

# Swift로 이해하는 App Groups와 Widget 데이터 공유

> **면접 답변 한 줄 요약:** App Groups는 같은 개발 팀이 서명한 앱과 extension에 공통 group container 접근 권한을 부여하며, App과 Widget은 별도 프로세스에서 shared UserDefaults나 파일을 읽고 WidgetKit timeline snapshot을 교환해 데이터를 공유해요.

Widget extension bundle은 앱 안에 포함되지만 Widget 코드가 앱 프로세스 안에서 계속 실행되는 것은 아니에요. 앱과 Widget은 각자의 sandbox container를 사용하므로 `UserDefaults.standard`와 일반 파일 경로도 서로 달라요.

[App Groups](https://developer.apple.com/documentation/xcode/configuring-app-groups)는 이 경계에 예외를 만들어요. 두 target이 같은 App Group entitlement를 갖도록 서명하면 운영체제가 둘 다 접근할 수 있는 group container와 shared preferences domain을 제공해요.

이 문서에서는 독서 목표 앱과 Widget을 예로 들어 다음 내용을 설명해요.

- App target, Widget extension, 프로세스와 sandbox의 관계
- capability, entitlement, provisioning과 group identifier의 역할
- App Group shared container가 private container와 분리되는 구조
- `UserDefaults(suiteName:)`으로 작은 설정을 공유하는 방법
- `FileManager.containerURL`로 파일과 데이터베이스 위치를 얻는 방법
- 앱이 값을 쓴 뒤 WidgetKit timeline을 갱신하는 전체 예제
- Widget이 앱의 Binding을 실시간으로 관찰하지 못하는 이유
- 여러 프로세스의 동시 쓰기, 보안, privacy manifest와 문제 해결 기준

## 먼저 알아둘 App Groups 용어

| 용어                 | 쉬운 뜻                                                                                                                                                              |
| -------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| target               | Xcode가 별도의 실행 파일이나 bundle로 빌드하는 단위예요. iOS 앱과 Widget extension은 같은 프로젝트에 있어도 서로 다른 target이에요.                                  |
| containing app       | extension bundle을 포함해 설치되는 본체 앱이에요. Widget의 설정과 데이터를 준비하는 앱을 가리켜요.                                                                   |
| app extension        | 앱의 일부 기능을 시스템 영역에 제공하는 별도 bundle과 실행 코드예요. Widget extension이 한 종류예요.                                                                 |
| process              | 운영체제가 실행 중인 코드와 메모리를 격리하는 단위예요. 앱과 Widget은 서로 다른 프로세스에서 실행될 수 있어 전역 변수와 메모리 객체를 공유하지 않아요.               |
| sandbox              | 실행 파일이 접근할 수 있는 파일과 시스템 자원을 제한하는 보안 경계예요. 각 앱과 extension은 기본적으로 자기 container만 접근해요.                                    |
| container            | 앱이나 extension의 데이터 파일을 보관하도록 운영체제가 관리하는 디렉터리예요. private container와 App Group의 shared container가 따로 있어요.                        |
| capability           | Xcode의 Signing & Capabilities에서 target이 특정 시스템 기능을 사용하도록 설정하는 항목이에요. App Groups capability를 추가하면 entitlement 설정을 관리할 수 있어요. |
| entitlement          | 서명된 실행 파일이 특정 권한을 가진다고 운영체제에 증명하는 key-value 정보예요. App Groups는 `com.apple.security.application-groups` 배열을 사용해요.                |
| App Group identifier | 공유 경계를 식별하는 문자열이에요. iOS에서는 `group.`으로 시작하고 예제에서는 `group.com.example.Reading`을 사용해요.                                                |
| suite                | `UserDefaults`의 별도 설정 domain이에요. App Group identifier로 suite를 만들면 group 구성원들이 같은 preferences를 읽고 쓸 수 있어요.                                |
| timeline             | WidgetKit이 특정 시점에 표시할 데이터 snapshot인 `TimelineEntry`의 배열이에요. Widget은 앱 화면의 live state 대신 timeline entry를 렌더링해요.                       |
| snapshot             | 특정 순간의 데이터를 복사해 고정한 값이에요. Widget provider는 shared store를 읽어 entry snapshot을 만들고 WidgetKit에 넘겨요.                                       |

## 앱과 Widget은 같은 bundle 안에 있어도 저장소가 달라요

App Group을 사용하지 않은 기본 구조부터 볼게요.

```text
Reading.app
├─ Reading 실행 파일 ── App 프로세스 ── App private container
└─ PlugIns/
   └─ ReadingWidget.appex
      └─ Widget 실행 코드 ── Widget 프로세스 ── Extension private container
```

extension bundle은 배포를 위해 앱 bundle 안에 들어 있지만 실행 중인 프로세스와 데이터 container는 분리돼요. Apple의 App Extension 문서도 실행 중인 extension과 containing app이 서로의 container에 직접 접근하지 못한다고 설명해요.

따라서 다음 두 코드는 이름이 같아도 서로 다른 앱 domain을 가리켜요.

```swift
// App target에서 실행
UserDefaults.standard.set(45, forKey: "reading.dailyGoal")

// Widget extension target에서 실행
let goal = UserDefaults.standard.integer(
  forKey: "reading.dailyGoal"
)
```

Widget의 `UserDefaults.standard`는 App의 standard defaults가 아니에요. 앱 process의 메모리 객체, singleton, `@State`, `@Observable` 인스턴스도 Widget process가 직접 읽을 수 없어요.

## App Group은 두 sandbox가 공유하는 세 번째 경계를 만들어요

두 target에 같은 App Group을 허용하면 구조가 다음처럼 바뀌어요.

```text
┌──────────────────────── App target ────────────────────────┐
│ App 프로세스                                               │
│ App private container                                      │
│ entitlement: group.com.example.Reading ───────┐            │
└───────────────────────────────────────────────┼────────────┘
                                                │ 권한 확인
                                                ▼
                              ┌──────────────────────────────┐
                              │ App Group shared container   │
                              │                              │
                              │ shared preferences domain    │
                              │ shared files / database      │
                              └──────────────────────────────┘
                                                ▲
                                                │ 권한 확인
┌──────────────────── Widget extension target ──┼────────────┐
│ Widget 프로세스                               │            │
│ Extension private container                   │            │
│ entitlement: group.com.example.Reading ───────┘            │
└────────────────────────────────────────────────────────────┘
```

App Group은 private container를 합치지 않아요. 각 target의 private 영역은 그대로 유지하면서, 운영체제가 관리하는 **추가 shared container에 접근할 권한**을 함께 부여해요.

두 target이 같은 문자열을 코드에 적는 것만으로는 충분하지 않아요. 서명된 각 실행 파일의 entitlement와 provisioning 정보가 그 group을 허용해야 운영체제가 접근을 승인해요.

## entitlement는 실행 파일의 권한 증명이에요

App Groups capability를 추가하면 Xcode가 target의 `.entitlements` 설정에 다음과 같은 값을 관리해요.

```xml
<key>com.apple.security.application-groups</key>
<array>
  <string>group.com.example.Reading</string>
</array>
```

이 값은 단순한 런타임 설정 파일이 아니에요. Xcode는 developer account와 provisioning 정보를 함께 사용해 최종 entitlement를 실행 파일의 code signature에 적용해요. 운영체제는 실행 중인 프로세스가 group container를 열려고 할 때 이 권한을 검사해요.

### App과 Widget target을 모두 설정해요

Xcode에서 다음 순서로 구성해요.

1. App target을 선택하고 **Signing & Capabilities**에서 **App Groups** capability를 추가해요.
2. `group.com.example.Reading`처럼 `group.`으로 시작하는 identifier를 만들거나 기존 group을 선택해요.
3. Widget extension target에도 **App Groups** capability를 추가해요.
4. App target과 Widget target에서 정확히 같은 group checkbox를 선택해요.
5. 두 target의 Team, bundle signing과 provisioning 상태가 정상인지 확인해요.

App Group identifier에 오타가 있거나 한 target에만 capability를 추가하면 shared `UserDefaults` 생성이나 container URL 접근이 실패할 수 있어요.

## 공유 상수와 저장 코드는 두 target에 포함해요

식별자와 key를 App과 Widget이 각각 복사해 쓰면 쉽게 달라져요. 공통 Swift 파일이나 app-extension-safe framework에 모으고 두 target의 Target Membership에 포함해요.

```swift
import Foundation

enum ReadingAppGroup {
  static let identifier = "group.com.example.Reading"
  static let widgetKind = "ReadingProgressWidget"
}

enum SharedPreferenceKey {
  static let dailyGoal = "reading.dailyGoal"
  static let completedMinutes = "reading.completedMinutes"
}

enum SharedDefaults {
  static let store: UserDefaults = {
    guard let store = UserDefaults(
      suiteName: ReadingAppGroup.identifier
    ) else {
      preconditionFailure("App Group entitlement를 확인하세요.")
    }

    store.register(defaults: [
      SharedPreferenceKey.dailyGoal: 30,
      SharedPreferenceKey.completedMinutes: 0,
    ])

    return store
  }()
}
```

`UserDefaults(suiteName:)`은 지정한 custom domain을 읽고 쓰는 인스턴스를 만들어요. suite 이름이 App Group identifier이고 entitlement가 맞으면 App과 Widget이 같은 shared preferences database를 사용해요.

`register(defaults:)`의 registration domain은 volatile fallback이므로 각 프로세스가 시작될 때 실행돼야 해요. 위 공통 `store`를 App과 Widget이 각각 처음 접근하면 각 process에서 같은 fallback을 등록해요.

## 전용 타입이 shared key와 검증을 관리해요

UI와 Widget provider가 문자열 key를 직접 반복하지 않도록 작은 저장 타입을 만들 수 있어요.

```swift
import Foundation

struct SharedReadingPreferences {
  private let defaults: UserDefaults

  init(defaults: UserDefaults = SharedDefaults.store) {
    self.defaults = defaults
  }

  var dailyGoal: Int {
    get {
      defaults.integer(forKey: SharedPreferenceKey.dailyGoal)
    }
    nonmutating set {
      defaults.set(
        max(newValue, 1),
        forKey: SharedPreferenceKey.dailyGoal
      )
    }
  }

  var completedMinutes: Int {
    get {
      defaults.integer(
        forKey: SharedPreferenceKey.completedMinutes
      )
    }
    nonmutating set {
      defaults.set(
        max(newValue, 0),
        forKey: SharedPreferenceKey.completedMinutes
      )
    }
  }
}
```

이 타입은 App Group 권한을 만들어 주지 않아요. 이미 권한이 있는 target에서 suite의 key, 기본값과 검증을 일관되게 사용하는 역할만 해요.

## App은 값을 저장한 뒤 WidgetKit에 reload를 요청해요

App의 설정 화면은 shared suite에 값을 쓰고 현재 Widget timeline이 더 이상 최신이 아니라고 WidgetKit에 알려요.

```swift
import SwiftUI
import WidgetKit

struct ReadingDashboard: View {
  @AppStorage(
    SharedPreferenceKey.dailyGoal,
    store: SharedDefaults.store
  )
  private var dailyGoal = 30

  @AppStorage(
    SharedPreferenceKey.completedMinutes,
    store: SharedDefaults.store
  )
  private var completedMinutes = 0

  var body: some View {
    Form {
      Stepper(
        "하루 목표: \(dailyGoal)분",
        value: $dailyGoal,
        in: 10...180,
        step: 10
      )

      Text("오늘 완료: \(completedMinutes)분")

      Button("10분 기록") {
        completedMinutes += 10
        reloadReadingWidget()
      }
    }
    .onChange(of: dailyGoal) {
      reloadReadingWidget()
    }
  }

  private func reloadReadingWidget() {
    WidgetCenter.shared.reloadTimelines(
      ofKind: ReadingAppGroup.widgetKind
    )
  }
}
```

`@AppStorage`의 store를 App Group suite로 지정했기 때문에 값은 앱의 standard domain이 아니라 shared domain에 기록돼요.

`reloadTimelines(ofKind:)`의 `kind`는 Widget의 `StaticConfiguration`에 사용하는 문자열과 정확히 같아야 해요. 이 호출은 Widget View를 앱 프로세스에서 직접 다시 그리는 함수가 아니에요. WidgetKit에 기존 timeline이 오래되었으니 새 timeline을 요청해 달라고 알리는 **reload 요청**이에요.

WidgetKit은 전력과 시스템 상태를 고려해 갱신을 scheduling해요. 함수를 호출한 줄에서 Widget 화면이 동기적으로 바뀐다고 가정하면 안 돼요. 현재 표시 정보가 실제로 달라졌을 때만 요청해 불필요한 reload를 줄여요.

## Widget provider는 shared store를 읽어 entry snapshot을 만들어요

Widget extension에서 `TimelineProvider`를 구현해요.

```swift
import SwiftUI
import WidgetKit

struct ReadingEntry: TimelineEntry {
  let date: Date
  let dailyGoal: Int
  let completedMinutes: Int

  var progress: Double {
    guard dailyGoal > 0 else { return 0 }

    return min(
      Double(completedMinutes) / Double(dailyGoal),
      1
    )
  }
}

struct ReadingProvider: TimelineProvider {
  func placeholder(in context: Context) -> ReadingEntry {
    ReadingEntry(
      date: .now,
      dailyGoal: 30,
      completedMinutes: 10
    )
  }

  func getSnapshot(
    in context: Context,
    completion: @escaping (ReadingEntry) -> Void
  ) {
    if context.isPreview {
      completion(placeholder(in: context))
      return
    }

    completion(makeCurrentEntry())
  }

  func getTimeline(
    in context: Context,
    completion: @escaping (Timeline<ReadingEntry>) -> Void
  ) {
    let entry = makeCurrentEntry()
    let timeline = Timeline(
      entries: [entry],
      policy: .never
    )

    completion(timeline)
  }

  private func makeCurrentEntry() -> ReadingEntry {
    let preferences = SharedReadingPreferences()

    return ReadingEntry(
      date: .now,
      dailyGoal: preferences.dailyGoal,
      completedMinutes: preferences.completedMinutes
    )
  }
}
```

provider가 실행되는 곳은 Widget extension process예요. App process의 `@AppStorage` 인스턴스를 참조하는 것이 아니라 같은 App Group suite를 새 process에서 열어 현재 값을 읽어요.

`.never` policy는 예측 가능한 다음 변경 시각이 없으므로 WidgetKit이 스스로 다음 timeline을 요청할 날짜를 지정하지 않는다는 뜻이에요. 앱이 값을 바꿀 때 `reloadTimelines(ofKind:)`를 호출하는 흐름과 맞아요. 시간에 따라 자연스럽게 바뀌는 정보라면 미래 entry를 만들거나 `.after(date)` 같은 policy를 선택해요.

## Widget View는 TimelineEntry만 렌더링해요

provider가 만든 snapshot을 View에 전달해요.

```swift
import SwiftUI
import WidgetKit

struct ReadingWidgetView: View {
  let entry: ReadingEntry

  var body: some View {
    VStack(alignment: .leading, spacing: 8) {
      Text("오늘의 독서")
        .font(.headline)

      ProgressView(value: entry.progress)

      Text(
        "\(entry.completedMinutes) / \(entry.dailyGoal)분"
      )
      .font(.caption)
    }
    .containerBackground(.fill.tertiary, for: .widget)
  }
}

struct ReadingProgressWidget: Widget {
  let kind = ReadingAppGroup.widgetKind

  var body: some WidgetConfiguration {
    StaticConfiguration(
      kind: kind,
      provider: ReadingProvider()
    ) { entry in
      ReadingWidgetView(entry: entry)
    }
    .configurationDisplayName("독서 진행률")
    .description("오늘의 독서 목표와 완료 시간을 보여 줍니다.")
    .supportedFamilies([.systemSmall])
  }
}
```

Widget View가 `SharedDefaults.store`를 직접 읽게 만들 수도 있지만 timeline entry에 필요한 값을 먼저 넣는 구조가 데이터 시점을 명확하게 해요. `placeholder`, `snapshot`, 실제 timeline이 각각 어떤 값을 렌더링하는지 테스트하기도 쉬워져요.

[Apple의 Widget interactivity 문서](https://developer.apple.com/documentation/widgetkit/adding-interactivity-to-widgets-and-live-activities)는 Widget 코드가 앱과 분리된 독립 process에서 실행되고, 시스템이 timeline entry 기반 View 표현을 archive해 렌더링한다고 설명해요. Widget이 보이는 동안 앱의 `Binding`이나 `@Observable` 모델에 계속 연결되어 실행되는 구조가 아니에요.

## 전체 데이터 흐름은 저장과 표시 요청으로 나뉘어요

App에서 목표를 바꿨을 때 내부 흐름을 순서대로 정리하면 다음과 같아요.

```text
1. App process
   @AppStorage 또는 SharedReadingPreferences가 shared suite에 값을 써요.
                     │
                     ▼
2. Foundation defaults system
   App process의 메모리 표현을 즉시 갱신하고 영속 저장소에는 비동기로 반영해요.
                     │
                     ▼
3. App process
   WidgetCenter.reloadTimelines(ofKind:)로 새 snapshot이 필요하다고 요청해요.
                     │
                     ▼
4. WidgetKit
   시스템 정책에 따라 Widget extension에 timeline을 요청해요.
                     │
                     ▼
5. Widget extension process
   같은 suiteName으로 shared domain을 읽고 TimelineEntry를 만들어요.
                     │
                     ▼
6. WidgetKit rendering
   entry를 포함한 View 표현을 보관하고 적절한 시점에 화면에 표시해요.
```

여기에는 App View와 Widget View 사이의 직접 함수 호출이나 live Binding이 없어요. **shared storage가 데이터 전달 경로**이고 **WidgetCenter와 timeline이 표시 갱신 경로**예요.

## shared UserDefaults와 실제 group container 파일은 다른 API로 열어요

App Group으로 공유할 수 있는 저장 방식은 UserDefaults suite만이 아니에요.

Apple은 다음과 같은 접근 방법을 제공해요.

- 작은 설정은 `UserDefaults(suiteName:)`으로 shared preferences database를 사용해요.
- 파일은 `FileManager.containerURL(forSecurityApplicationGroupIdentifier:)`로 group container URL을 얻어 저장해요.
- background URL session은 configuration의 `sharedContainerIdentifier`를 지정할 수 있어요.
- 데이터베이스 파일도 group container에 둘 수 있지만 여러 process 접근을 안전하게 조정해야 해요.

App Group의 실제 파일 경로를 문자열로 만들면 안 돼요. 특히 iOS는 group directory의 이름과 물리적 위치를 보장하지 않으므로 [`containerURL(forSecurityApplicationGroupIdentifier:)`](<https://developer.apple.com/documentation/foundation/filemanager/containerurl(forsecurityapplicationgroupidentifier:)>)의 반환값을 사용해야 해요.

```swift
import Foundation

enum SharedContainerError: Error {
  case unavailable
}

struct SharedReadingFileStore {
  private let fileManager: FileManager

  init(fileManager: FileManager = .default) {
    self.fileManager = fileManager
  }

  func save(_ snapshot: ReadingSnapshot) throws {
    let url = try snapshotURL()
    let data = try JSONEncoder().encode(snapshot)
    try data.write(to: url, options: .atomic)
  }

  func load() throws -> ReadingSnapshot? {
    let url = try snapshotURL()

    guard fileManager.fileExists(atPath: url.path) else {
      return nil
    }

    let data = try Data(contentsOf: url)
    return try JSONDecoder().decode(
      ReadingSnapshot.self,
      from: data
    )
  }

  private func snapshotURL() throws -> URL {
    guard let containerURL = fileManager.containerURL(
      forSecurityApplicationGroupIdentifier:
        ReadingAppGroup.identifier
    ) else {
      throw SharedContainerError.unavailable
    }

    return containerURL.appendingPathComponent(
      "reading-widget-snapshot.json"
    )
  }
}

struct ReadingSnapshot: Codable {
  let dailyGoal: Int
  let completedMinutes: Int
  let updatedAt: Date
}
```

`.atomic` 쓰기는 임시 파일을 완성한 뒤 교체하는 방식으로 부분 파일 노출 가능성을 줄여요. 하지만 App과 Widget이 동시에 읽고 쓰는 전체 업무 규칙까지 자동으로 해결하지는 않아요.

## 저장 방식은 데이터 크기와 동시 접근 방식으로 선택해요

| 데이터와 접근 특성                         | App Group 안의 선택지                         |
| ------------------------------------------ | --------------------------------------------- |
| 작은 Boolean, 숫자, 문자열 설정            | shared `UserDefaults` suite                   |
| 한 번에 통째로 교체하고 읽는 작은 snapshot | 원자적으로 쓰는 파일                          |
| 이미지, 미리 렌더링한 asset, 큰 JSON       | shared file container                         |
| 검색, 관계, 부분 수정, 여러 record         | SQLite·Core Data 등 transaction 가능한 저장소 |
| 인증 token이나 암호 같은 민감 정보         | 요구사항에 맞게 구성한 Keychain sharing       |

UserDefaults의 내부 preferences 파일을 group container에서 직접 찾아 수정하면 안 돼요. Foundation API가 domain 검색, 메모리 표현과 영속 반영을 관리하도록 둬요.

큰 데이터베이스를 App과 extension이 함께 연다면 두 process가 동시에 접근하거나 한 process가 중단되는 상황을 고려해야 해요. Apple의 extension 가이드는 shared container의 데이터 손상을 피하도록 접근을 동기화하고 SQLite, Core Data, POSIX lock, `NSFileCoordinator` 같은 수단을 데이터 특성에 맞게 검토하라고 안내해요.

## 여러 프로세스에서 read-modify-write 경쟁을 피해야 해요

shared UserDefaults 자체는 key-value 저장을 안전하게 관리하지만 다음과 같은 업무 연산은 두 호출로 나뉘어요.

```swift
let oldValue = SharedDefaults.store.integer(
  forKey: SharedPreferenceKey.completedMinutes
)

SharedDefaults.store.set(
  oldValue + 10,
  forKey: SharedPreferenceKey.completedMinutes
)
```

App process와 interactive Widget의 App Intent가 동시에 같은 연산을 실행하면 둘 다 같은 `oldValue`를 읽고 하나의 증가가 사라질 수 있어요. 한 process 안의 actor는 다른 process까지 직렬화하지 못해요.

다음 중 데이터에 맞는 전략을 선택해요.

- 쓰기 주체를 App 하나로 제한하고 Widget은 읽기만 해요.
- 서로 다른 process가 쓰는 key를 분리해 충돌 범위를 줄여요.
- 충돌이 중요한 record는 SQLite transaction 같은 다중 process 저장 전략을 사용해요.
- 파일은 원자적 교체와 coordination 정책을 함께 설계해요.
- Widget App Intent가 값을 바꾼다면 성공 후 새 timeline을 만들고 App도 foreground 복귀 시 저장소를 다시 읽어요.

## reload 요청은 실시간 IPC가 아니에요

App Groups가 일부 IPC 메커니즘도 허용하지만 Widget의 일반적인 데이터 갱신은 shared container와 WidgetKit timeline을 사용해요.

[`WidgetCenter.shared.reloadTimelines(ofKind:)`를 사용한 갱신](https://developer.apple.com/documentation/widgetkit/keeping-a-widget-up-to-date)을 요청할 때 기억할 점은 다음과 같아요.

- 호출은 현재 timeline을 무효화하는 요청이며 동기식 화면 redraw가 아니에요.
- WidgetKit은 전력과 시스템 정책에 따라 extension 실행과 rendering을 scheduling해요.
- Widget에는 일일 refresh budget이 있으므로 표시 데이터가 실제로 달라졌을 때 요청해요.
- 미래 변경 시간이 예상되면 여러 timeline entry를 미리 제공하는 편이 효율적이에요.
- Xcode debugger에서는 실제 기기의 refresh 제한이 그대로 나타나지 않을 수 있어요.

앱이 서버에서 새 데이터를 받았다면 Widget이 다시 네트워크 요청을 반복하게 하기보다 앱이 필요한 snapshot을 group container에 준비하고 reload를 요청하는 구조가 효율적일 수 있어요.

## 보안 경계는 group 구성원 전체로 넓어져요

App Group container는 아무 앱이나 접근하는 공개 폴더가 아니에요. 같은 group entitlement를 가진, 같은 개발 팀의 관련 executable이 접근하는 공유 경계예요.

하지만 private container보다 접근 주체가 늘어나므로 다음을 지켜요.

- 필요하지 않은 extension을 group에 추가하지 않아요.
- 모든 group 구성원이 읽어도 되는 데이터만 넣어요.
- 잠금 화면 Widget에 민감한 정보가 노출되지 않도록 redaction과 표시 정책을 검토해요.
- 비밀번호, 인증 token, 암호화 key를 평문 UserDefaults에 저장하지 않아요.
- App Group identifier와 entitlement를 source code의 보안 비밀로 오해하지 않아요. 실제 권한은 code signature와 provisioning으로 검증돼요.

App Group은 같은 기기의 관련 process 사이에서 데이터를 공유하는 기능이에요. 같은 사용자의 여러 기기에 자동 동기화하는 기능이 아니므로 그 목적에는 CloudKit이나 `NSUbiquitousKeyValueStore` 같은 별도 기술을 검토해요.

## App Group UserDefaults는 privacy manifest에 공유 목적을 선언해요

`UserDefaults`는 required reason API예요. 같은 App Group의 앱·extension·App Clip이 읽고 쓰는 용도에는 [Apple이 정의한 `1C8F.1` reason](https://developer.apple.com/documentation/bundleresources/app-privacy-configuration/nsprivacyaccessedapitypes/nsprivacyaccessedapitype)이 해당 범위를 설명해요.

privacy manifest의 관련 부분은 다음 구조를 사용해요.

```xml
<key>NSPrivacyAccessedAPITypes</key>
<array>
  <dict>
    <key>NSPrivacyAccessedAPIType</key>
    <string>NSPrivacyAccessedAPICategoryUserDefaults</string>
    <key>NSPrivacyAccessedAPITypeReasons</key>
    <array>
      <string>1C8F.1</string>
    </array>
  </dict>
</array>
```

실제 제출 시점의 Apple 문서에서 reason code와 허용 범위를 다시 확인해요. App만 접근하는 standard defaults와 App Group 공유를 모두 사용한다면 각 사용이 선언한 reason 범위에 맞는지 privacy report로 점검해요.

## 문제가 생기면 권한과 프로세스 경계부터 확인해요

| 증상                                                  | 확인할 항목                                                                                                             |
| ----------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `UserDefaults(suiteName:)`이 기대대로 공유되지 않아요 | App과 Widget target에 같은 App Groups capability가 있는지, group identifier 철자가 같은지 확인해요.                     |
| `containerURL`이 iOS에서 `nil`이에요.                 | 전달한 identifier가 entitlement 배열에 정확히 포함됐는지와 signing·provisioning 상태를 확인해요.                        |
| App에서는 보이지만 Widget 값이 오래됐어요.            | App이 shared suite에 썼는지, Widget `kind`가 같은지, reload를 요청했는지, provider가 새 entry에서 값을 읽는지 확인해요. |
| `reloadTimelines` 직후 화면이 안 바뀌어요.            | reload는 비동기 요청이고 시스템 scheduling과 budget의 영향을 받는다는 점을 확인해요. 실제 기기에서도 테스트해요.        |
| Preview에서 group store가 실패해요.                   | Preview process의 entitlement 환경에 의존하지 않도록 sample entry나 주입 가능한 test store를 사용해요.                  |
| 값이 가끔 덮어써져요.                                 | App과 extension이 같은 key를 read-modify-write하는지 확인하고 쓰기 주체 단일화나 transaction 저장소를 검토해요.         |
| 파일 일부가 깨져 보여요.                              | 실제 group URL API를 사용하는지, 원자적 쓰기와 여러 process coordination을 적용했는지 확인해요.                         |

## 테스트는 저장과 timeline 생성을 분리해요

`TimelineProvider`가 global shared store를 직접 열기만 하면 테스트에서 실제 entitlement와 container에 의존해요. entry 생성 로직이 `UserDefaults`나 protocol을 받도록 분리할 수 있어요.

```swift
import Foundation

struct ReadingEntryFactory {
  let defaults: UserDefaults

  func makeEntry(now: Date) -> ReadingEntry {
    let preferences = SharedReadingPreferences(
      defaults: defaults
    )

    return ReadingEntry(
      date: now,
      dailyGoal: preferences.dailyGoal,
      completedMinutes: preferences.completedMinutes
    )
  }
}
```

unit test에서는 고유한 suite를 전달해 저장값과 entry 결과를 확인하고, 실제 App Group 통합 테스트에서는 다음을 별도로 검증해요.

1. App과 Widget target이 같은 entitlement로 서명됐는지 확인해요.
2. App이 shared suite에 쓴 값을 Widget provider가 읽는지 확인해요.
3. 앱에서 표시값을 바꾼 뒤 Widget timeline이 갱신되는지 실제 기기에서 확인해요.
4. 앱이 background 또는 종료된 상태에서 Widget이 fallback과 마지막 snapshot을 안전하게 표시하는지 확인해요.
5. 여러 process가 동시에 접근할 수 있는 저장소의 손상과 충돌 시나리오를 확인해요.

## 언제 App Groups를 사용해야 하나요

다음 조건에서 사용해요.

- 같은 개발 팀의 여러 앱이나 app extension이 같은 기기에서 데이터를 공유해야 해요.
- containing app과 Widget이 작은 설정, snapshot, 파일 또는 데이터베이스를 함께 읽어야 해요.
- 각 process의 private container를 유지하면서 명시적인 공유 경계만 추가하고 싶어요.
- 공유 대상 target과 데이터 범위를 entitlement로 제한할 수 있어요.

한 앱 process 안의 여러 View가 값을 공유하는 문제에는 App Group이 필요하지 않아요. SwiftUI environment, `@Observable` 모델, dependency injection 같은 메모리 내 전달 방법을 먼저 사용해요.

## 적용 순서를 정리해요

1. App과 extension이 실제로 같은 기기에서 공유해야 하는 데이터인지 확인해요.
2. App target과 Widget target에 같은 App Groups capability와 identifier를 추가해요.
3. group identifier, Widget kind와 key를 두 target이 함께 빌드하는 코드에 모아요.
4. 작은 설정은 `UserDefaults(suiteName:)`, 큰 snapshot은 group container 파일, 복잡한 record는 transaction 저장소를 선택해요.
5. App이 값을 쓴 뒤 표시 데이터가 달라졌을 때 `reloadTimelines(ofKind:)`를 요청해요.
6. Widget provider가 shared store를 읽어 완결된 `TimelineEntry` snapshot을 만들게 해요.
7. 여러 process의 동시 쓰기와 앱 중단 상황을 고려해 coordination 정책을 정해요.
8. 민감 정보, 잠금 화면 노출과 privacy manifest의 `1C8F.1` reason을 점검해요.
9. Simulator뿐 아니라 실제 기기에서 timeline scheduling과 refresh budget을 테스트해요.

## 면접에서 이어질 수 있는 질문

### App과 Widget이 UserDefaults.standard로 값을 공유할 수 있나요?

아니요. App과 Widget extension은 별도 process와 sandbox를 사용하므로 각각의 `standard`가 서로 다른 앱 domain을 가리켜요. 같은 App Group entitlement를 설정하고 `UserDefaults(suiteName: groupIdentifier)`로 shared domain을 열어야 해요.

### App Group identifier 문자열만 같으면 공유할 수 있나요?

아니요. 각 target의 서명된 executable에 같은 App Groups entitlement가 포함되고 provisioning이 이를 허용해야 해요. 운영체제는 문자열뿐 아니라 code signature의 권한을 확인해 group container 접근을 결정해요.

### App에서 값을 바꾸면 Widget이 즉시 다시 그려지나요?

아니요. 앱은 shared storage에 값을 쓴 뒤 WidgetKit에 timeline reload를 요청해요. WidgetKit이 시스템 정책에 따라 extension에서 새 entry를 받고 렌더링하므로 동기식 또는 즉시 갱신을 보장하지 않아요.

### shared UserDefaults와 shared container 파일은 어떻게 선택하나요?

작은 비민감 설정은 UserDefaults suite가 간단하고, 큰 snapshot이나 asset은 `containerURL`로 얻은 파일 영역이 적합해요. 검색·관계·동시 transaction이 필요하면 SQLite나 Core Data 같은 저장소를 선택하고 다중 process 접근을 조정해야 해요.

### actor로 App과 Widget의 동시 쓰기를 보호할 수 있나요?

하나의 actor 인스턴스는 한 process 안의 task만 직렬화해요. App과 Widget은 별도 process이므로 actor만으로 둘 사이의 경쟁을 막을 수 없고, 쓰기 주체 단일화나 process 간 lock·transaction 저장 전략이 필요해요.

## 참고 자료

- [Apple Developer — Configuring app groups](https://developer.apple.com/documentation/xcode/configuring-app-groups)
- [Apple Developer — App Groups Entitlement](https://developer.apple.com/documentation/bundleresources/entitlements/com.apple.security.application-groups)
- [Apple Developer — UserDefaults init(suiteName:)](<https://developer.apple.com/documentation/foundation/userdefaults/init(suitename:)>)
- [Apple Developer — containerURL(forSecurityApplicationGroupIdentifier:)](<https://developer.apple.com/documentation/foundation/filemanager/containerurl(forsecurityapplicationgroupidentifier:)>)
- [Apple Developer — Developing a WidgetKit strategy](https://developer.apple.com/documentation/widgetkit/developing-a-widgetkit-strategy)
- [Apple Developer — TimelineProvider](https://developer.apple.com/documentation/widgetkit/timelineprovider)
- [Apple Developer — Keeping a widget up to date](https://developer.apple.com/documentation/widgetkit/keeping-a-widget-up-to-date)
- [Apple Developer — Adding interactivity to widgets and Live Activities](https://developer.apple.com/documentation/widgetkit/adding-interactivity-to-widgets-and-live-activities)
- [Apple Developer Archive — Sharing data with your containing app](https://developer.apple.com/library/archive/documentation/general/conceptual/extensibilitypg/extensionscenarios.html)
- [Apple Developer — UserDefaults required reason API](https://developer.apple.com/documentation/bundleresources/app-privacy-configuration/nsprivacyaccessedapitypes/nsprivacyaccessedapitype)
- [Swift-KR — UserDefaults](./userdefaults)
- [Swift-KR — @AppStorage](./appstorage)
- [Swift-KR — @Observable과 Observation](../swiftui/state-management/observation)
