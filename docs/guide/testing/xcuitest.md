---
title: Swift로 이해하는 XCUITest
description: XCUITest의 별도 process와 accessibility tree, XCUIApplication·query·wait, launch 환경, Page Object와 안정적인 UI 테스트 전략을 설명합니다.
pageType: doc-wide
outline: false
---

# Swift로 이해하는 XCUITest

> **면접 답변 한 줄 요약:** XCUITest는 test runner process가 실행 중인 앱을 accessibility element로 조회하고 실제 tap·typing·swipe를 보내 핵심 사용자 흐름을 검증해서, 화면과 기능이 함께 연결된 결과를 사용자 관점에서 확인하는 UI automation 도구예요.

unit test는 `ReadingGoal.progress`를 직접 호출할 수 있어요. XCUITest는 앱의 ViewModel이나 repository를 직접 호출하지 않아요. 실제 앱을 별도 process로 실행하고 사용자가 보는 UI element를 찾아 tap하고 text를 입력해요.

이 차이 때문에 XCUITest는 화면, navigation, storage와 여러 framework가 실제로 연결됐는지 확인할 수 있어요. 대신 app launch와 rendering을 기다려야 하므로 unit test보다 느리고 system alert, animation과 device 상태에도 영향을 받아요. 모든 분기를 UI test로 덮기보다 깨졌을 때 사용자 영향이 큰 흐름을 선택해야 해요.

이 문서에서는 독서 시간 기록 화면을 예로 들어 다음 내용을 배워요.

- app process와 UI test runner process의 관계
- accessibility tree와 identifier의 역할
- `XCUIApplication`, `XCUIElementQuery`, `XCUIElement`로 화면을 조작하는 방법
- launch argument와 environment로 초기 상태를 고정하는 방법
- `exists`, `isHittable`과 explicit wait의 차이
- system alert와 interruption을 처리하는 방법
- Page Object, screenshot, test plan과 accessibility audit
- flaky UI test를 줄이고 적절한 사용자 흐름을 고르는 기준

## 먼저 알아둘 UI testing 용어

| 용어                        | 쉬운 뜻                                                                                                                  |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| UI automation               | 사람이 화면을 조작하는 행동을 code가 대신 실행하고 결과를 확인하는 테스트 방식이에요.                                    |
| test runner process         | UI test code를 실행하는 별도 process예요. 앱의 memory와 model object에 직접 접근하지 않아요.                             |
| application under test(AUT) | `XCUIApplication`으로 실행하고 조작하는 실제 대상 앱이에요.                                                              |
| accessibility tree          | 화면을 보조 기술과 automation이 이해할 수 있도록 element의 role, label, value, identifier와 hierarchy를 표현한 구조예요. |
| query                       | accessibility tree에서 조건에 맞는 element 후보를 찾는 표현이에요. `app.buttons`와 `matching`이 대표적이에요.            |
| `XCUIElement`               | query가 가리키는 하나의 UI element proxy예요. tap, typeText와 상태 조회 API를 제공해요.                                  |
| synchronization             | app의 animation과 비동기 작업이 원하는 상태에 도달할 때까지 조건을 기준으로 기다리는 일이에요.                           |
| interruption                | 권한 alert처럼 앱의 원래 흐름을 가리고 test interaction을 막는 system 또는 예상 밖 modal UI예요.                         |
| Page Object                 | 화면의 query와 interaction을 의미 있는 method로 감싸 test scenario에서 세부 selector를 분리하는 구조예요.                |

## UI test는 앱 code가 아니라 화면 경계를 조작해요

XCUITest의 실행 구조를 먼저 보면 왜 production object를 직접 읽을 수 없는지 이해하기 쉬워요.

```text
UI test runner process
├─ XCTestCase
├─ XCUIApplication proxy
├─ XCUIElement query와 gesture 요청
└─ assertion
          │ operating system automation channel
          ▼
Application under test process
├─ 실제 app lifecycle
├─ SwiftUI 또는 UIKit 화면
├─ model, network와 storage
└─ accessibility tree를 system에 노출
```

Apple의 [Record, replay, and review: UI automation with Xcode](https://developer.apple.com/videos/play/wwdc2025/344/)는 automation이 앱과 독립적으로 실행되며 accessibility가 element type, label, value와 frame을 제공한다고 설명해요.

분리된 process는 중요한 테스트 경계예요.

- UI test는 app target의 `internal` property를 `@testable import`로 읽지 않아요.
- 두 process의 global variable과 singleton은 공유되지 않아요.
- app에 전달할 초기 상태는 launch argument, launch environment, URL 또는 test용 seed 경로로 준비해요.
- assertion은 화면에 노출된 text, value, enabled와 navigation 결과를 기준으로 작성해요.

## UI Testing Bundle을 추가해요

Xcode project에 UI test target이 없다면 다음 순서로 만들어요.

1. **File > New > Target**을 선택해요.
2. **UI Testing Bundle**을 선택해요.
3. Target to be Tested에 실제 앱 target을 지정해요.
4. app scheme의 Test action과 test plan에 UI test target을 포함해요.
5. UI test file에서 `import XCTest`를 작성해요.

Xcode의 새 UI test template은 현재도 XCTest와 XCUIAutomation을 사용해요. Swift Testing은 unit·integration test와 함께 사용할 수 있지만 UI automation test는 `XCTestCase` subclass에 작성해요.

## 앱 화면에 안정적인 accessibility identifier를 제공해요

독서 시간을 입력하고 저장하는 SwiftUI 화면을 준비해요.

```swift
import SwiftUI

struct ReadingRecordView: View {
  @State private var minutes = ""
  @State private var message = ""

  var body: some View {
    Form {
      TextField("독서 시간", text: $minutes)
        .keyboardType(.numberPad)
        .accessibilityIdentifier("reading.minutesField")

      Button("기록") {
        message = "오늘 \(minutes)분을 기록했어요"
      }
      .accessibilityIdentifier("reading.saveButton")

      Text(message)
        .accessibilityIdentifier("reading.resultLabel")
    }
  }
}
```

accessibility label인 화면 text로도 query할 수 있지만 localization이나 copy 변경에 따라 test가 깨져요. identifier는 사용자에게 읽히는 label과 분리된 automation용 identity예요.

좋은 identifier는 다음 성질을 가져요.

- app 전체 또는 해당 화면의 query scope 안에서 유일해요.
- localized text를 사용하지 않아요.
- row index처럼 순서가 바뀌면 의미가 달라지는 값보다 domain identity를 사용해요.
- `button1`보다 `reading.saveButton`처럼 역할을 드러내요.
- production과 test가 공유하는 contract이므로 오타를 줄이도록 상수 또는 convention을 관리해요.

identifier를 추가했다고 접근성이 자동으로 좋아지는 것은 아니에요. VoiceOver가 읽을 label, value, trait와 hierarchy도 실제 사용자 의미에 맞아야 해요. 반대로 좋은 accessibility 구조는 UI automation query도 안정적으로 만들어요.

## `XCUIApplication`을 실행하고 첫 사용자 흐름을 검증해요

```swift
import XCTest

final class ReadingFlowUITests: XCTestCase {
  @MainActor
  func testRecordsReadingMinutes() {
    continueAfterFailure = false

    let app = XCUIApplication()
    app.launchArguments += [
      "--uitesting",
      "--reset-reading-data",
    ]
    app.launch()

    let minutesField = app.textFields[
      "reading.minutesField"
    ]
    minutesField.tap()
    minutesField.typeText("20")

    app.buttons["reading.saveButton"].tap()

    let result = app.staticTexts[
      "reading.resultLabel"
    ]
    XCTAssertTrue(
      result.waitForExistence(timeout: 2)
    )
    XCTAssertEqual(
      result.label,
      "오늘 20분을 기록했어요"
    )
  }
}
```

Swift 6의 현재 XCUIAutomation API는 UI element type을 main actor에 격리해요. 예제는 test method에 `@MainActor`를 붙여 `XCUIApplication`과 element interaction이 실행될 actor를 명시했어요.

`app.launch()`는 이미 실행 중인 대상 app을 종료한 뒤 새 instance를 실행하고 user event를 받을 준비가 될 때 반환해요. 하지만 app launch 뒤 시작한 network request나 animation까지 모두 끝났다는 뜻은 아니므로 최종 element 조건을 따로 기다려요.

## Query는 후보를 좁히고 Element는 행동해요

다음 표현은 역할이 달라요.

```swift
let allButtons = app.buttons
let saveButton = app.buttons["reading.saveButton"]
let enabledButtons = app.buttons.matching(
  NSPredicate(format: "enabled == true")
)
let firstEnabledButton = enabledButtons.firstMatch
```

| 표현                  | 의미                                                                                  |
| --------------------- | ------------------------------------------------------------------------------------- |
| `app.buttons`         | 현재 accessibility tree의 button 후보를 나타내는 query예요.                           |
| `query[identifier]`   | identifier가 맞는 element proxy를 만들어요.                                           |
| `matching(predicate)` | attribute 조건으로 후보를 더 좁혀요.                                                  |
| `firstMatch`          | query 결과 중 첫 element를 가리켜 성능을 줄일 수 있지만 uniqueness를 보장하지 않아요. |
| `element(boundBy:)`   | 결과 순서의 index로 고르므로 UI 순서 변경에 민감해요.                                 |

`firstMatch`를 붙여 test가 통과했다고 element identity가 명확해지는 것은 아니에요. 같은 identifier가 여러 개라면 app의 accessibility 구조를 고쳐요. 동적인 list row는 `reading.session.<stable-id>`처럼 domain ID를 포함할 수 있어요.

실패할 때는 `app.debugDescription`이나 query의 debug output으로 현재 tree에 어떤 element가 노출됐는지 확인해요. 화면에 눈으로 보이는 View와 accessibility element가 일대일로 같지 않을 수 있어요.

## `exists`와 `isHittable`은 답하는 질문이 달라요

| property         | 답하는 질문                                                             |
| ---------------- | ----------------------------------------------------------------------- |
| `exists`         | 현재 accessibility hierarchy에 이 element가 있나요?                     |
| `isHittable`     | 현재 system이 계산한 interaction point로 실제 gesture를 보낼 수 있나요? |
| `enabled`        | control이 disabled가 아닌가요?                                          |
| `value`, `label` | accessibility가 현재 어떤 값과 text를 노출하나요?                       |

element가 `exists == true`여도 다른 modal에 가려지거나 화면 밖에 있어 `isHittable == false`일 수 있어요. 반대로 최종 결과 text처럼 tap하지 않을 element는 existence와 label만 확인하면 돼요.

tap 직전에 무조건 `isHittable` assertion을 추가하기보다 test의 의미에 맞춰요. 사용자가 실제로 누를 수 있어야 하는 button이라면 hittable이 중요한 계약이고, scroll 뒤 나타나는 cell은 먼저 scroll action이 필요해요.

## 고정 sleep 대신 원하는 UI 조건을 기다려요

다음 코드는 기기와 CI 속도에 따라 실패해요.

```swift
app.buttons["reading.saveButton"].tap()
sleep(2)
XCTAssertTrue(
  app.staticTexts["reading.resultLabel"].exists
)
```

결과가 0.1초에 나타나도 항상 2초를 낭비하고, 느린 device에서 2.1초가 걸리면 실패해요. element의 조건을 직접 기다려요.

```swift
let result = app.staticTexts[
  "reading.resultLabel"
]

XCTAssertTrue(
  result.waitForExistence(timeout: 2),
  "기록 결과가 표시되어야 해요."
)
```

현재 API에는 `waitForNonExistence(timeout:)`와 특정 key path 값이 바뀔 때까지 기다리는 `wait(for:toEqual:timeout:)`도 있어요. deployment와 Xcode version을 확인해 사용해요.

timeout은 실제 기다릴 최대 시간이지 항상 소비되는 시간이 아니에요. 모든 timeout을 크게 늘리기보다 app이 완료 상태를 accessibility로 명확하게 노출하고 그 조건을 기다리세요.

## launch argument와 environment로 초기 상태를 고정해요

UI test가 이전 실행의 UserDefaults나 database에 영향을 받으면 순서 의존성이 생겨요. `launchArguments`와 `launchEnvironment`를 `launch()` 전에 설정해 app이 test용 시작 상태를 만들게 해요.

```swift
let app = XCUIApplication()
app.launchArguments = [
  "--uitesting",
  "--reset-reading-data",
]
app.launchEnvironment = [
  "READING_SEED": "empty",
  "ANIMATIONS_DISABLED": "1",
]
app.launch()
```

앱 시작 지점에서는 전달된 값을 읽어 dependency와 seed를 선택해요.

```swift
struct LaunchConfiguration {
  let isUITesting: Bool
  let shouldResetReadingData: Bool

  init(processInfo: ProcessInfo = .processInfo) {
    let arguments = processInfo.arguments
    isUITesting = arguments.contains("--uitesting")
    shouldResetReadingData = arguments.contains(
      "--reset-reading-data"
    )
  }
}
```

test code가 app process의 store를 직접 바꾸는 것이 아니에요. app이 launch contract를 받아 test 가능한 dependency graph를 구성하는 방식이에요.

주의할 점도 있어요.

- 인증 우회와 개인정보 seed 같은 test hook이 release에서 악용되지 않도록 build configuration과 입력 범위를 제한해요.
- production behavior를 과도하게 바꿔 UI test만 통과하는 별도 앱을 만들지 않아요.
- network를 stub한다면 화면 아래의 navigation과 rendering은 실제 경로로 유지해요.
- 각 test가 필요한 state를 명시하고 이전 test의 결과에 기대지 않아요.

## 한 test는 하나의 완결된 사용자 목표를 검증해요

좋은 UI test 이름은 tap sequence보다 사용자 목표를 설명해요.

```text
testTapFieldThenTypeThenTapButton        // 구현 단계만 보여요.
testUserCanRecordReadingMinutes          // 사용자 목표를 보여요.
```

독서 앱의 핵심 흐름을 예로 들면 다음 정도를 선택할 수 있어요.

1. 처음 실행한 사용자가 독서 시간을 기록할 수 있어요.
2. 잘못된 시간을 입력하면 validation message를 보고 수정할 수 있어요.
3. 저장한 기록이 목록에 나타나고 상세 화면을 열 수 있어요.
4. offline 오류 뒤 retry해서 저장할 수 있어요.

계산 경계값 20개는 unit test나 parameterized test로 검증하고, UI test에서는 대표적인 성공과 중요한 오류 흐름을 확인해요. UI test가 많아질수록 전체 feedback이 느려지고 실패 원인 분석 비용도 커져요.

## Page Object로 selector와 scenario를 분리해요

여러 test가 같은 query와 입력 순서를 반복하면 화면 변경 때 모든 파일을 고쳐야 해요. 작은 Page Object로 element와 action을 모아요.

```swift
import XCTest

@MainActor
struct ReadingRecordPage {
  let app: XCUIApplication

  var minutesField: XCUIElement {
    app.textFields["reading.minutesField"]
  }

  var saveButton: XCUIElement {
    app.buttons["reading.saveButton"]
  }

  var resultLabel: XCUIElement {
    app.staticTexts["reading.resultLabel"]
  }

  func record(minutes: Int) {
    minutesField.tap()
    minutesField.typeText(String(minutes))
    saveButton.tap()
  }
}
```

test scenario는 사용자 행동과 결과에 집중해요.

```swift
@MainActor
func testUserCanRecordReadingMinutes() {
  let app = XCUIApplication()
  app.launchArguments = ["--uitesting"]
  app.launch()

  let page = ReadingRecordPage(app: app)
  page.record(minutes: 20)

  XCTAssertTrue(
    page.resultLabel.waitForExistence(timeout: 2)
  )
  XCTAssertEqual(
    page.resultLabel.label,
    "오늘 20분을 기록했어요"
  )
}
```

Page Object가 production app의 business logic을 다시 구현하면 안 돼요. query와 gesture를 감싸되 결과 assertion은 test에 남겨 어떤 계약을 검증하는지 보여 주세요. 화면 이동을 반환값으로 표현하면 flow도 읽기 쉬워져요.

## 예상한 alert와 예상 밖 interruption을 구분해요

삭제 확인 alert가 검증할 사용자 흐름의 일부라면 직접 query하고 assertion해요.

```swift
let deleteAlert = app.alerts["기록 삭제"]
XCTAssertTrue(deleteAlert.waitForExistence(timeout: 2))
deleteAlert.buttons["삭제"].tap()
```

사진 권한처럼 현재 검증 흐름과 무관하지만 interaction을 막을 수 있는 system UI에는 interruption monitor를 사용해요.

```swift
addUIInterruptionMonitor(
  withDescription: "사진 접근 권한"
) { alert in
  let allowButton = alert.buttons["허용"]
  guard allowButton.exists else { return false }

  allowButton.tap()
  return true
}

app.buttons["프로필 사진 선택"].tap()
app.tap()
```

monitor는 interruption이 다음 UI interaction을 막을 때 시도되고, 최근 등록한 handler부터 역순으로 실행돼요. 정상 흐름의 alert를 interruption monitor로 숨기면 실제 alert 내용과 action을 검증하지 못해요. Apple의 [Handling UI Interruptions](https://developer.apple.com/documentation/xctest/handling-ui-interruptions)는 두 경우를 분리하도록 안내해요.

system button title은 locale에 따라 달라질 수 있어요. 가능하면 test plan에서 권한 상태를 미리 구성하고, 꼭 처리해야 한다면 실행 locale과 system UI를 함께 관리해요.

## 실패 진단에는 activity와 attachment를 남겨요

긴 흐름은 `XCTContext.runActivity`로 단계 이름을 report에 남길 수 있어요.

```swift
XCTContext.runActivity(
  named: "20분을 입력하고 저장해요"
) { _ in
  page.record(minutes: 20)
}
```

실패 시 screenshot을 attachment로 추가하면 당시 화면을 확인할 수 있어요.

```swift
let screenshot = XCUIScreen.main.screenshot()
let attachment = XCTAttachment(screenshot: screenshot)
attachment.name = "reading-record-result"
attachment.lifetime = .keepAlways
add(attachment)
```

모든 성공 test의 대용량 artifact를 항상 보존하면 저장 비용이 커져요. test plan의 screenshot·video 정책과 함께 실패 진단에 필요한 범위를 정해요. Xcode test report는 failure 시점의 hierarchy, screenshot과 video를 확인하는 중심 도구예요.

## accessibility audit도 UI test에서 자동화할 수 있어요

iOS 17 이상에서는 현재 화면의 accessibility 문제를 audit할 수 있어요.

```swift
@MainActor
func testReadingScreenAccessibility() throws {
  let app = XCUIApplication()
  app.launchArguments = ["--uitesting"]
  app.launch()

  try app.performAccessibilityAudit()
}
```

audit은 element description, hit region, contrast, text clipping과 Dynamic Type 같은 일반 문제를 찾고 issue가 있으면 test를 실패시켜요. 특정 확인된 예외를 filter할 수 있지만 이유 없이 모든 issue를 무시하지 않아요.

자동 audit이 VoiceOver 사용자의 전체 경험을 보장하지는 않아요. 핵심 흐름을 실제 assistive technology로 탐색하는 수동 검증과 함께 사용해요.

## test plan으로 locale과 화면 조건을 반복해요

UI test 하나를 여러 test plan configuration에서 실행하면 다음 차이를 확인할 수 있어요.

- 한국어, 독일어처럼 text 길이가 다른 locale
- 아랍어처럼 right-to-left layout
- light와 dark appearance
- Dynamic Type 크기
- iPhone과 iPad destination
- screen orientation
- screenshot과 video 보존 정책

같은 scenario를 모든 device와 locale 조합에 무작정 실행하면 CI 시간이 폭증해요. 매 pull request에는 대표 조합, nightly에는 넓은 matrix처럼 feedback 속도와 coverage를 나눠요.

## launch performance는 별도 measurement로 관리해요

UI test target에서 app launch metric을 측정할 수 있어요.

```swift
@MainActor
func testLaunchPerformance() {
  measure(metrics: [XCTApplicationLaunchMetric()]) {
    XCUIApplication().launch()
  }
}
```

기능 UI test와 performance baseline은 실패 의미가 달라요. release configuration과 고정 device 조건을 사용하는 performance test plan을 따로 두고, 일반 UI test에 모든 metric을 섞지 않아요.

## 흔한 flaky UI test를 원인별로 고쳐요

| 증상                                          | 흔한 원인                                            | 개선                                                       |
| --------------------------------------------- | ---------------------------------------------------- | ---------------------------------------------------------- |
| element를 찾지 못해요.                        | localized label, 중복 identifier, 아직 나타나지 않음 | stable identifier와 `waitForExistence`를 사용해요.         |
| tap이 실패해요.                               | element가 가려졌거나 화면 밖이에요.                  | navigation·scroll 조건을 명시하고 `isHittable`을 확인해요. |
| 단독 실행은 통과하고 전체 suite에서 실패해요. | 이전 test의 storage와 login state가 남아요.          | launch seed와 test별 계정을 사용해요.                      |
| CI에서만 timeout이 나요.                      | fixed sleep, 실제 network와 animation에 의존해요.    | 완료 상태를 노출하고 controlled dependency를 사용해요.     |
| 다른 언어에서 query가 실패해요.               | 화면 text를 identity로 사용해요.                     | identifier로 찾고 localized text는 별도 assertion해요.     |
| keyboard 때문에 button이 가려져요.            | device size와 focus 상태를 가정해요.                 | keyboard dismissal이나 scroll action을 scenario에 넣어요.  |

실패를 재실행해서 green으로 만드는 것만으로 해결하지 않아요. result bundle의 screenshot, video와 accessibility hierarchy에서 어떤 조건이 달랐는지 먼저 확인해요.

## XCUITest와 다른 테스트의 경계를 비교해요

| 질문                               | XCTest·Swift Testing unit test                 | XCUITest                                                |
| ---------------------------------- | ---------------------------------------------- | ------------------------------------------------------- |
| production code를 직접 호출하나요? | 네. 함수와 object를 test process에서 호출해요. | 아니요. 별도 app process의 UI를 조작해요.               |
| dependency를 어떻게 제어하나요?    | initializer와 test value를 직접 전달해요.      | app launch contract가 test용 graph와 seed를 선택해요.   |
| 무엇을 assertion하나요?            | 반환값, state와 interaction이에요.             | accessibility element의 존재, 값과 사용자 workflow예요. |
| 속도와 실패 원인은 어떤가요?       | 빠르고 좁아요.                                 | 느리고 app·OS 통합 범위가 넓어요.                       |
| 적절한 개수는 어떤가요?            | 다양한 branch와 boundary를 많이 검증해요.      | 중요한 end-to-end 흐름을 적게 유지해요.                 |

UI test가 통과해도 모든 domain branch가 검증되는 것은 아니고 unit test가 통과해도 화면 wiring이 맞다는 보장은 없어요. 두 층이 서로 다른 위험을 보호해요.

## 언제 XCUITest를 사용해야 하나요

다음 조건에서 높은 가치가 있어요.

- 로그인, 결제, 기록 저장처럼 깨지면 사용자가 목표를 완료할 수 없는 핵심 흐름이에요.
- navigation, focus, keyboard와 여러 화면의 실제 연결을 확인해야 해요.
- 과거 UI regression을 실제 사용자 행동으로 재현할 수 있어요.
- locale, Dynamic Type와 device 차이에서 layout과 접근성을 확인해야 해요.
- launch performance와 accessibility audit을 자동화해야 해요.

단순 계산, validation branch와 network error mapping은 unit test가 더 빠르고 정확해요. 화면의 모든 button마다 UI test를 만들기보다 핵심 workflow와 integration risk에 집중해요.

## 적용 순서를 정리해요

1. 실패하면 사용자 목표가 막히는 workflow를 하나 고르세요.
2. UI Testing Bundle과 test plan에 대상 app을 연결하세요.
3. 핵심 element에 stable accessibility identifier를 제공하세요.
4. launch argument와 environment로 독립적인 seed 상태를 만드세요.
5. `XCUIApplication`을 새로 launch하고 사용자 gesture로만 흐름을 진행하세요.
6. fixed sleep 대신 최종 element 조건을 explicit wait로 기다리세요.
7. 반복 query는 작은 Page Object로 모으고 assertion은 scenario에 남기세요.
8. 예상한 alert는 직접 검증하고 무관한 interruption만 monitor로 처리하세요.
9. CI의 locale·device matrix와 screenshot·video 보존 범위를 정하세요.
10. flaky failure는 재실행 전에 hierarchy와 result bundle로 원인을 분류하세요.

## 면접에서 이어질 수 있는 질문

### XCUITest에서 app의 ViewModel을 직접 읽을 수 있나요?

아니요. UI test runner와 대상 app은 별도 process라 memory object를 공유하지 않아요. accessibility element를 통해 결과를 관찰하고 launch argument, environment나 deep link로 초기 상태를 전달해요.

### accessibility identifier와 label은 어떻게 다른가요?

identifier는 automation에서 element identity를 안정적으로 찾기 위한 값이고 보통 사용자에게 읽히지 않아요. label은 VoiceOver 등 보조 기술이 사용자에게 element 의미를 설명하는 localized text예요.

### UI test에서 `sleep`을 피하는 이유는 무엇인가요?

고정 시간보다 작업이 빠르면 시간을 낭비하고 느리면 실패하기 때문이에요. `waitForExistence`처럼 실제 완료 조건을 기다리면 필요한 만큼만 기다리고 실패 원인도 명확해져요.

### Page Object에 assertion을 넣어도 되나요?

공통 invariant라면 일부 넣을 수 있지만 사용자 scenario의 핵심 기대는 test에 남기는 편이 좋아요. Page Object는 selector와 gesture 세부 사항을 숨기고 test는 어떤 행동을 보장하는지 표현해야 해요.

### 모든 기능을 UI test로 검증하지 않는 이유는 무엇인가요?

app launch와 OS interaction 때문에 느리고 실패 원인이 넓어요. 계산과 branch는 빠른 unit test로 많이 검증하고 UI test는 실제 연결을 보장할 핵심 workflow에 집중해야 feedback 속도와 신뢰성을 함께 유지할 수 있어요.

## 참고 자료

- [Apple Developer — Testing](https://developer.apple.com/documentation/xcode/testing)
- [Apple Developer — Adding tests to your Xcode project](https://developer.apple.com/documentation/xcode/adding-tests-to-your-xcode-project)
- [Apple Developer — XCUIApplication](https://developer.apple.com/documentation/xcuiautomation/xcuiapplication)
- [Apple Developer — XCUIElement](https://developer.apple.com/documentation/xcuiautomation/xcuielement)
- [Apple Developer — XCUIElementAttributes](https://developer.apple.com/documentation/xcuiautomation/xcuielementattributes)
- [Apple Developer — Handling UI Interruptions](https://developer.apple.com/documentation/xctest/handling-ui-interruptions)
- [Apple Developer — Performing accessibility audits for your app](https://developer.apple.com/documentation/accessibility/performing-accessibility-audits-for-your-app)
- [Apple Developer — Record, replay, and review: UI automation with Xcode](https://developer.apple.com/videos/play/wwdc2025/344/)
- [Apple Developer — Improving code assessment by organizing tests into test plans](https://developer.apple.com/documentation/xcode/organizing-tests-to-improve-feedback)
- [Swift-KR — Swift로 이해하는 XCTest 단위 테스트](./xctest-unit-testing)
- [Swift-KR — Swift로 이해하는 Swift Testing](./swift-testing)
