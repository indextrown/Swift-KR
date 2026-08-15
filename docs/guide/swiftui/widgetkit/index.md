---
title: Swift로 이해하는 WidgetKit
description: WidgetKit의 extension 구조, TimelineProvider와 갱신 정책, WidgetCenter, App Groups 공유, AppIntent 상호작용을 완성형 Swift 예제로 설명합니다.
pageType: doc-wide
outline: false
---

# Swift로 이해하는 WidgetKit

> **면접 답변 한 줄 요약:** WidgetKit은 별도 extension process에서 만든 `TimelineEntry` snapshot을 시스템이 적절한 시점에 렌더링하는 프레임워크이며, 앱은 공유 저장소와 timeline reload 요청으로 데이터를 전달하고 App Intent로 제한된 상호작용을 제공해요.

Widget은 앱 화면을 작게 잘라 Home Screen에 계속 실행해 두는 기능이 아니에요. 시스템은 Widget extension을 필요할 때만 실행해 SwiftUI View의 표현을 만들고, extension이 멈춘 뒤에도 미리 받은 timeline entry를 이용해 화면을 표시해요.

이 실행 모델을 놓치면 `Timer`가 계속 동작할 것이라고 기대하거나, View가 앱의 상태를 실시간으로 관찰하게 만들거나, 몇 초마다 reload를 요청하는 설계로 이어지기 쉬워요. 이 문서에서는 독서 목표 Widget을 단계별로 만들며 다음 내용을 배워요.

- Widget extension과 containing app이 분리되는 이유
- `TimelineEntry`, `TimelineProvider`, `StaticConfiguration`의 역할
- placeholder, snapshot, timeline의 차이
- 예측 가능한 시간 변화와 앱에서 발생한 데이터 변화를 갱신하는 방법
- `WidgetCenter` reload 요청과 시스템 refresh budget
- App Groups로 앱과 Widget이 snapshot을 공유하는 방법
- Widget family, content margin, container background에 대응하는 방법
- `widgetURL`, `Link`, App Intent `Button`을 선택하는 기준
- `AppIntentConfiguration`으로 사용자가 설정하는 Widget을 만드는 방법
- Preview, 테스트, 보안과 흔한 실패 원인

완성 예제는 iOS 17 이상을 기준으로 해요. WidgetKit의 기본 Widget은 iOS 14부터 사용할 수 있지만, `containerBackground(for:)`, App Intent 기반 상호작용과 설정형 Widget은 iOS 17 이상에서 사용할 수 있어요.

## 먼저 알아둘 WidgetKit 용어

| 용어                  | 쉬운 뜻                                                                                                                               |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| containing app        | Widget extension을 bundle 안에 포함해 설치하는 본체 앱이에요.                                                                         |
| Widget extension      | Widget 구성과 View, provider를 담는 별도 target이자 실행 단위예요. containing app과 메모리를 공유하지 않아요.                         |
| `Widget`              | Widget의 식별자, provider, View와 지원 크기를 선언하는 진입점이에요.                                                                  |
| `WidgetConfiguration` | WidgetKit이 Widget을 어떻게 생성하고 표시할지 설명하는 값이에요. `StaticConfiguration`과 `AppIntentConfiguration`이 대표적이에요.     |
| `kind`                | Widget 종류를 구분하는 개발자 정의 문자열이에요. `WidgetCenter`로 reload할 때도 같은 값을 사용해요.                                   |
| `TimelineEntry`       | 특정 시점에 Widget View가 표시할 데이터 snapshot이에요. 최소한 `date`를 가져야 해요.                                                  |
| timeline              | 시간순 `TimelineEntry` 배열과 다음 timeline 요청 정책을 묶은 값이에요.                                                                |
| `TimelineProvider`    | placeholder, gallery snapshot과 실제 timeline을 WidgetKit에 제공하는 객체예요.                                                        |
| reload policy         | 현재 timeline을 다 쓴 뒤 새 timeline을 언제 요청할지 알려 주는 `.atEnd`, `.after`, `.never` 정책이에요.                               |
| Widget family         | `.systemSmall`, `.systemMedium`처럼 Widget이 배치되는 크기와 모양이에요.                                                              |
| App Intent            | 시스템이 앱이나 Widget의 기능을 실행할 수 있도록 입력과 동작을 선언한 타입이에요. iOS 17부터 Widget의 `Button`과 `Toggle`에 사용해요. |
| App Group             | 별도 sandbox를 가진 app과 extension이 같은 preferences나 파일 container에 접근할 수 있게 하는 entitlement 기반 공유 경계예요.         |

## Widget은 작은 앱 화면이 아니라 시스템이 보관한 snapshot이에요

앱 화면은 process가 실행되는 동안 상태를 관찰하고 필요할 때 View를 다시 계산할 수 있어요. Widget은 시스템 영역에 오래 보여야 하지만 extension을 계속 실행하면 배터리와 메모리를 과도하게 사용해요. 그래서 WidgetKit은 **미래에 보여 줄 snapshot을 미리 받는 방식**을 사용해요.

```text
Containing App process
├─ 사용자가 데이터를 변경
├─ App Group 저장소에 기록
└─ WidgetCenter에 timeline reload 요청
                 │
                 ▼
              WidgetKit
                 │ 필요할 때 extension 실행
                 ▼
Widget Extension process
├─ shared store 또는 서버에서 데이터 읽기
├─ TimelineEntry 배열 생성
└─ SwiftUI View 표현을 WidgetKit에 전달
                 │
                 ▼ extension이 항상 살아 있지 않아도
          시스템이 entry 시점에 Widget 표시
```

Apple의 [Keeping a widget up to date](https://developer.apple.com/documentation/widgetkit/keeping-a-widget-up-to-date) 문서도 WidgetKit이 View를 별도 process에서 대신 렌더링하며 extension은 화면에 보일 때도 계속 활성 상태가 아니라고 설명해요. 따라서 다음 원칙이 중요해요.

1. Widget View는 전달받은 entry만 빠르게 렌더링해요.
2. 시간에 따라 바뀔 값은 가능한 한 미래 entry로 미리 계산해요.
3. 앱에서 값이 바뀌면 저장을 먼저 완료하고 reload를 요청해요.
4. reload는 즉시 다시 그리라는 명령이 아니라 새 timeline을 요청해 달라는 신호예요.

## Widget Extension target을 만들어요

Xcode에서 다음 순서로 기본 target을 만들 수 있어요.

1. **File > New > Target**을 선택해요.
2. iOS의 **Widget Extension** template을 선택해요.
3. 정적인 첫 예제라면 **Include Configuration App Intent**를 끄고 시작해도 돼요.
4. Widget 이름과 bundle identifier를 확인하고 target을 추가해요.
5. 앱과 Widget에서 함께 쓸 model과 저장 코드의 Target Membership에 두 target을 모두 포함해요.

Widget extension template은 `Widget`, provider, entry와 View의 기본 구조를 만들어요. 하나의 extension에 Widget이 하나뿐이면 `Widget` 타입에 `@main`을 붙일 수 있고, 여러 종류를 제공하면 `WidgetBundle`을 진입점으로 사용해요.

설치 후 Widget gallery에 나타나려면 사용자가 containing app을 한 번 실행해야 해요. Simulator에서 Widget만 실행했는데 gallery에 보이지 않는다면 먼저 app scheme을 실행해 설치와 최초 실행을 마치세요.

## 1단계: Widget이 표시할 snapshot을 정의해요

독서 Widget은 오늘의 목표 시간과 완료 시간을 표시해요. View가 저장소를 직접 읽게 하지 않고 표시할 값을 entry 하나에 모두 담아요.

```swift
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
```

`date`는 이 entry가 적용될 시점이에요. 나머지 프로퍼티는 View를 완성하는 데 필요한 snapshot이에요. View가 렌더링 도중 network나 database에 다시 접근하지 않도록 작은 표시 모델로 정리해 두면 다음 이점이 있어요.

- 같은 entry로 Preview와 snapshot test를 만들 수 있어요.
- 데이터가 바뀌는 시점과 화면이 그려지는 시점을 분리할 수 있어요.
- provider가 실패했을 때 마지막 값이나 fallback을 선택하기 쉬워요.
- View가 빠르고 결정적으로 렌더링돼요.

## 2단계: App Group 저장소를 한곳에 감싸요

앱과 Widget이 서로 다른 process에서 같은 값을 읽으려면 `UserDefaults.standard`가 아니라 App Group suite가 필요해요. group identifier와 key를 두 target이 함께 빌드하는 파일에 모아요.

```swift
import Foundation

enum ReadingWidgetConstants {
  static let kind = "ReadingProgressWidget"
  static let appGroup = "group.com.example.Reading"
}

struct ReadingSnapshot {
  let dailyGoal: Int
  let completedMinutes: Int
}

struct ReadingSnapshotStore {
  private enum Key {
    static let dailyGoal = "reading.dailyGoal"
    static let completedMinutes = "reading.completedMinutes"
  }

  private let defaults: UserDefaults

  init?() {
    guard let defaults = UserDefaults(
      suiteName: ReadingWidgetConstants.appGroup
    ) else {
      return nil
    }

    self.defaults = defaults
  }

  func load() -> ReadingSnapshot {
    let storedGoal = defaults.integer(forKey: Key.dailyGoal)

    return ReadingSnapshot(
      dailyGoal: storedGoal > 0 ? storedGoal : 30,
      completedMinutes: max(
        defaults.integer(forKey: Key.completedMinutes),
        0
      )
    )
  }

  func addCompletedMinutes(_ minutes: Int) {
    let current = load().completedMinutes
    defaults.set(
      current + max(minutes, 0),
      forKey: Key.completedMinutes
    )
  }
}
```

이 코드를 사용하기 전에 App target과 Widget extension target 모두에 같은 App Groups capability를 추가해야 해요. 문자열만 같고 entitlement가 다르면 suite가 공유되지 않아요. sandbox와 서명 설정, shared file 예제는 [Swift로 이해하는 App Groups와 Widget 데이터 공유](../../data-storage/app-groups)에서 자세히 설명해요.

## 3단계: placeholder, snapshot, timeline을 각각 제공해요

`TimelineProvider`에는 비슷해 보이지만 목적이 다른 세 메서드가 있어요.

| 메서드                        | WidgetKit이 필요한 것                                     | 구현 기준                                                                                     |
| ----------------------------- | --------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| `placeholder(in:)`            | gallery 로딩이나 실제 값이 준비되기 전에 사용할 빠른 골격 | network와 disk를 기다리지 않고 즉시 대표 값을 반환해요. 민감하거나 개인화된 값을 넣지 않아요. |
| `getSnapshot(in:completion:)` | gallery와 preview에 사용할 한 시점의 대표 화면            | `context.isPreview`이면 sample을, 그 외에는 가능한 현재 snapshot을 반환해요.                  |
| `getTimeline(in:completion:)` | 실제 표시할 entry들과 다음 요청 시점                      | 현재 데이터와 예측 가능한 미래 변화를 entry로 만들고 적절한 policy를 선택해요.                |

```swift
import WidgetKit

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
    let nextDay = Calendar.current.startOfDay(
      for: Calendar.current.date(
        byAdding: .day,
        value: 1,
        to: entry.date
      ) ?? entry.date.addingTimeInterval(86_400)
    )

    completion(
      Timeline(
        entries: [entry],
        policy: .after(nextDay)
      )
    )
  }

  private func makeCurrentEntry() -> ReadingEntry {
    let snapshot = ReadingSnapshotStore()?.load()
      ?? ReadingSnapshot(
        dailyGoal: 30,
        completedMinutes: 0
      )

    return ReadingEntry(
      date: .now,
      dailyGoal: snapshot.dailyGoal,
      completedMinutes: snapshot.completedMinutes
    )
  }
}
```

독서량은 사용자가 앱이나 Widget에서 기록할 때 바뀌므로, 그 변화는 저장 후 `WidgetCenter` reload로 알려요. 날짜가 바뀌는 시점은 미리 알 수 있으므로 provider가 다음 날 시작 시각 이후 새 timeline을 요청하도록 `.after(nextDay)`를 사용했어요.

각 메서드는 독립적으로 완결된 결과를 제공해야 해요. placeholder가 먼저 호출됐으니 그때 만든 메모리 값이 timeline까지 남아 있을 것이라고 가정하지 마세요. extension process는 호출 사이에 종료될 수 있어요.

## 4단계: Entry만 그리는 SwiftUI View를 만들어요

Widget View는 앱의 화면처럼 임의의 크기를 요청하지 않아요. WidgetKit이 선택한 family와 content margin 안에서 entry를 표현해요.

```swift
import SwiftUI
import WidgetKit

struct ReadingWidgetView: View {
  let entry: ReadingEntry

  @Environment(\.widgetFamily) private var family

  var body: some View {
    VStack(alignment: .leading, spacing: 8) {
      Label("오늘의 독서", systemImage: "book.closed.fill")
        .font(.headline)

      ProgressView(value: entry.progress)

      Text(
        "\(entry.completedMinutes) / \(entry.dailyGoal)분"
      )
      .font(family == .systemSmall ? .caption : .body)

      if family != .systemSmall {
        Text("목표까지 \(remainingMinutes)분 남았어요")
          .font(.caption)
          .foregroundStyle(.secondary)
      }
    }
    .containerBackground(for: .widget) {
      Color.orange.opacity(0.14)
    }
    .widgetURL(URL(string: "reading://today"))
  }

  private var remainingMinutes: Int {
    max(entry.dailyGoal - entry.completedMinutes, 0)
  }
}
```

`@Environment(\.widgetFamily)`는 현재 배치 크기에 맞춰 정보 밀도를 조절할 때 사용해요. family마다 완전히 다른 디자인을 억지로 유지하기보다 작은 크기에서는 핵심 정보만 남기고 큰 크기에서 설명을 추가하는 식으로 확장해요.

`.containerBackground(for: .widget)`는 어떤 View가 Widget의 배경인지 WidgetKit에 알려 줘요. StandBy나 accessory family처럼 시스템이 배경을 제거하거나 다르게 처리하는 맥락에서도 올바르게 표현할 수 있어요. Apple은 [Displaying the right widget background](https://developer.apple.com/documentation/widgetkit/displaying-the-right-widget-background)에서 모든 Widget 크기에 제거 가능한 container background를 표시하도록 안내해요.

## 5단계: StaticConfiguration으로 Widget을 조립해요

사용자가 따로 설정할 값이 없는 Widget은 `StaticConfiguration`으로 provider와 View를 연결해요.

```swift
import SwiftUI
import WidgetKit

struct ReadingProgressWidget: Widget {
  let kind = ReadingWidgetConstants.kind

  var body: some WidgetConfiguration {
    StaticConfiguration(
      kind: kind,
      provider: ReadingProvider()
    ) { entry in
      ReadingWidgetView(entry: entry)
    }
    .configurationDisplayName("독서 진행률")
    .description("오늘의 독서 목표와 완료 시간을 보여 줍니다.")
    .supportedFamilies([
      .systemSmall,
      .systemMedium,
    ])
  }
}

@main
struct ReadingWidgetBundle: WidgetBundle {
  var body: some Widget {
    ReadingProgressWidget()
  }
}
```

각 구성 요소의 책임은 다음처럼 나뉘어요.

```text
ReadingProgressWidget
├─ kind: Widget 종류를 식별
├─ ReadingProvider: 언제 어떤 entry를 보여 줄지 결정
├─ ReadingWidgetView: 받은 entry를 어떻게 그릴지 결정
└─ supportedFamilies: 배치할 수 있는 크기를 제한
```

`kind`는 bundle identifier일 필요는 없지만 앱 전체에서 유일하고 안정적인 문자열이어야 해요. 배포 후 문자열을 바꾸면 기존 Widget과 reload 대상의 연결이 달라질 수 있으므로 상수로 관리해요.

## Timeline reload policy를 데이터 변화에 맞게 선택해요

`Timeline`의 policy는 현재 timeline 이후에 provider를 다시 호출할 시점을 알려 줘요.

| policy         | 의미                                                  | 알맞은 예                                                  |
| -------------- | ----------------------------------------------------- | ---------------------------------------------------------- |
| `.atEnd`       | 마지막 entry 시점이 지나면 새 timeline을 요청해요.    | 시간표, 정해진 경기 일정처럼 여러 미래 entry를 제공했어요. |
| `.after(date)` | 지정한 날짜 이후 새 timeline을 요청해요.              | 자정, 시장 개장처럼 다음 데이터 계산 시각을 알아요.        |
| `.never`       | 시스템이 timeline 종료를 이유로 다시 요청하지 않아요. | 앱이나 서버 이벤트가 생길 때만 `WidgetCenter`로 알려요.    |

예를 들어 집중 세션의 남은 상태가 30분 동안 10분 간격으로 변한다면 한 번 실행될 때 미래 entry를 함께 만들어요.

```swift
let now = Date.now
let entries = stride(from: 0, through: 30, by: 10).map { minute in
  ReadingEntry(
    date: now.addingTimeInterval(Double(minute * 60)),
    dailyGoal: 30,
    completedMinutes: minute
  )
}

let timeline = Timeline(
  entries: entries,
  policy: .atEnd
)
```

이 예제는 시간 경과만으로 값이 예측되는 경우를 보여 주기 위한 것이에요. 실제 독서 완료 시간처럼 사용자의 행동으로만 바뀌는 값을 임의로 증가시키면 안 돼요.

Apple의 refresh 안내에 따르면 future entry는 가능한 한 많이 계획하되 entry 간격을 대략 5분 이상으로 두고, 필요한 최소 빈도를 선택하는 것이 좋아요. WidgetKit은 여러 Widget의 작업을 합치거나 요청 시각을 조정할 수 있으므로 entry의 날짜는 초 단위 timer를 보장하는 예약 시간이 아니에요.

## 앱에서 값이 바뀌면 저장을 마친 뒤 reload를 요청해요

앱에서 독서 시간을 기록하면 shared store를 먼저 갱신하고 해당 `kind`의 timeline을 다시 요청해요.

```swift
import WidgetKit

func recordReading(minutes: Int) {
  guard let store = ReadingSnapshotStore() else { return }

  store.addCompletedMinutes(minutes)
  WidgetCenter.shared.reloadTimelines(
    ofKind: ReadingWidgetConstants.kind
  )
}
```

호출 순서가 중요해요.

```text
잘못된 순서
reload 요청 → provider가 예전 값을 읽음 → 저장 완료

권장 순서
저장 완료 → reload 요청 → provider가 새 값을 읽어 entry 생성
```

`reloadTimelines(ofKind:)`는 한 Widget 종류의 timeline을 다시 요청하고, `reloadAllTimelines()`는 이 앱이 제공하는 모든 Widget timeline을 대상으로 해요. 로그아웃처럼 모든 Widget의 표시가 동시에 무효화되는 경우가 아니라면 구체적인 `kind`를 사용해 불필요한 작업을 줄여요.

## Refresh budget은 호출 횟수가 아니라 시스템과의 계약이에요

Widget reload는 extension 실행, 데이터 접근과 렌더링을 일으켜 배터리를 사용해요. WidgetKit은 각 활성 Widget에 동적인 24시간 budget을 배정하고 사용자가 보는 빈도, 마지막 reload, containing app의 활성 상태 등을 고려해 갱신을 분산해요.

Apple의 [Keeping a widget up to date](https://developer.apple.com/documentation/widgetkit/keeping-a-widget-up-to-date) 문서는 자주 보는 Widget의 일반적인 일일 budget을 대략 40~70회라고 설명하지만, 이는 보장 횟수나 고정 제한이 아니에요. 사용 패턴을 학습하는 데 며칠이 걸릴 수 있고 실제 간격도 달라져요.

다음 상황은 서로 다른 전략을 사용해요.

| 변화 원인                                     | 권장 전략                                                                                  |
| --------------------------------------------- | ------------------------------------------------------------------------------------------ |
| 시계나 일정처럼 예측할 수 있어요.             | 미래 `TimelineEntry`를 한 번에 생성해요.                                                   |
| 사용자가 containing app에서 값을 바꿨어요.    | 저장을 완료한 뒤 해당 `kind`만 reload해요.                                                 |
| Widget의 App Intent가 값을 바꿨어요.          | `perform()` 안에서 저장을 완료하고 return해요. 상호작용 후 시스템이 timeline을 reload해요. |
| 외부 서버 값이 가끔 바뀌어요.                 | 앱의 background 갱신이나 지원 OS의 WidgetKit push를 검토하되 timeline을 기본으로 유지해요. |
| 표시 형식, locale, Dynamic Type이 바뀌었어요. | 시스템이 갱신하므로 앱이 별도 reload를 남발하지 않아요.                                    |

`reloadTimelines`를 반복 호출해도 실시간 갱신을 강제할 수 없어요. 정확한 초 단위 진행 상태가 핵심이라면 Widget보다 앱 화면이나 Live Activity가 문제에 더 맞는지 먼저 검토해요.

## Widget family와 content margin에 맞춰 정보를 줄여요

WidgetKit은 플랫폼과 배치 위치에 따라 여러 family를 제공해요.

| 대표 family             | 주 사용 맥락                                | 설계 기준                                                      |
| ----------------------- | ------------------------------------------- | -------------------------------------------------------------- |
| `.systemSmall`          | Home Screen의 작은 정사각형                 | 하나의 핵심 수치와 짧은 action에 집중해요.                     |
| `.systemMedium`         | 가로로 넓은 Home Screen Widget              | 보조 설명이나 두 개의 정보 그룹을 추가할 수 있어요.            |
| `.systemLarge`          | 큰 Home Screen Widget                       | 목록을 넣을 수 있지만 앱 화면처럼 과도한 탐색을 만들지 않아요. |
| `.systemExtraLarge`     | 지원되는 iPad 배치                          | 넓어진 공간에서도 정보 계층을 유지해요.                        |
| `.accessoryCircular`    | Lock Screen, Smart Stack 등의 원형 맥락     | 짧은 숫자나 gauge에 맞춰요.                                    |
| `.accessoryRectangular` | Lock Screen, Smart Stack 등의 직사각형 맥락 | 짧은 headline과 한두 줄 정보를 사용해요.                       |
| `.accessoryInline`      | 한 줄 accessory 영역                        | icon과 아주 짧은 text만 제공해요.                              |

모든 family가 모든 플랫폼과 OS에서 제공되는 것은 아니므로 실제 deployment target과 기기에서 확인해야 해요. `.supportedFamilies`에는 실제로 검증한 family만 선언해요.

Widget, Live Activity와 watch complication은 safe area 대신 시스템이 정한 content margin을 사용해요. 기본 margin은 대부분 유지하는 것이 좋아요. 사진이나 지도처럼 가장자리까지 채우는 디자인이 정말 필요할 때만 configuration의 `.contentMarginsDisabled()`를 사용하고 직접 spacing을 관리해요.

Widget View는 SwiftUI로 작성해야 하며 `UIViewRepresentable`이나 `NSViewRepresentable`로 UIKit·AppKit View를 감싸 사용할 수 없어요. 기존 앱 UI를 그대로 옮기기보다 필요한 정보를 Widget 전용 SwiftUI View로 다시 구성해요.

## Widget을 탭해 앱의 알맞은 화면을 열어요

단순히 앱을 여는 것이 목적이면 App Intent `Button` 대신 deep link를 사용해요. Widget 전체의 기본 목적지는 `.widgetURL(_:)`로 지정하고, 여러 항목을 가진 충분히 큰 Widget은 `Link`를 추가할 수 있어요.

```swift
struct ReadingLinkList: View {
  var body: some View {
    VStack(alignment: .leading) {
      Link("오늘 기록 열기", destination: URL(
        string: "reading://today"
      )!)

      Link("독서 목표 편집", destination: URL(
        string: "reading://goal"
      )!)
    }
    .widgetURL(URL(string: "reading://dashboard"))
  }
}
```

Widget View 계층에 `.widgetURL`을 두 개 이상 지정하면 동작이 정의되지 않아요. 기본 URL은 하나만 두고 세부 목적지는 `Link`로 표현해요. containing app은 SwiftUI의 `.onOpenURL`이나 UIKit app delegate의 URL 처리 메서드에서 같은 scheme을 받아 알맞은 화면으로 이동해요.

## iOS 17부터 App Intent로 Widget 안에서 행동해요

Interactive Widget의 `Button`과 `Toggle`은 일반 SwiftUI `@State` binding을 직접 바꾸지 않아요. 사용자가 누르면 시스템이 연결된 App Intent의 `perform()`을 실행하고, 공유 저장소를 바꾼 뒤 새 timeline을 받아 화면을 갱신해요.

먼저 10분 기록 action을 App Intent로 선언해요.

```swift
import AppIntents

struct AddTenReadingMinutesIntent: AppIntent {
  static let title: LocalizedStringResource = "독서 10분 기록"
  static let description = IntentDescription(
    "오늘의 완료 독서 시간에 10분을 더합니다."
  )
  static let openAppWhenRun = false

  func perform() async throws -> some IntentResult {
    ReadingSnapshotStore()?.addCompletedMinutes(10)

    return .result()
  }
}
```

그리고 Widget View에 intent를 실행하는 `Button`을 추가해요.

```swift
Button(intent: AddTenReadingMinutesIntent()) {
  Label("10분 기록", systemImage: "plus")
}
.buttonStyle(.bordered)
```

Apple의 [Adding interactivity to widgets and Live Activities](https://developer.apple.com/documentation/widgetkit/adding-interactivity-to-widgets-and-live-activities)에 따르면 Widget의 button이나 toggle interaction이 끝나면 시스템이 timeline reload를 보장해요. 그래서 이 `perform()`에서는 저장이 완료된 다음 return하는 것이 핵심이고, 같은 변경을 위해 `WidgetCenter.reloadTimelines`를 다시 호출할 필요는 없어요.

Widget용 `AppIntent`는 기본적으로 Widget extension process에서 실행돼요. 같은 action을 앱과 Widget에서 재사용하려면 intent와 필요한 model을 App target과 Widget extension target 모두에 포함해요. `openAppWhenRun`을 `true`로 설정하면 앱 process를 여는 다른 경험이 되므로, Widget에서 직접 끝낼 수 있는 짧은 작업에는 `false`를 유지해요.

`Button`은 action을 실행하고 눌린 상태를 유지하지 않아요. 완료 여부처럼 on/off 상태를 표시해야 하면 App Intent를 연결한 `Toggle`을 사용해요. Toggle은 먼저 낙관적인 모양을 보여 줄 수 있으므로 서버 동기화가 실패하면 저장값과 다음 entry에서 실제 상태를 복원하는 오류 정책도 설계해야 해요.

잠긴 기기에서는 사용자가 인증해 잠금을 풀기 전까지 Widget button과 toggle action이 실행되지 않을 수 있어요. 인증이 필요한 작업이나 민감한 결과를 Widget만으로 완료한다고 가정하지 마세요.

## 사용자가 표시 방식을 고르게 하려면 AppIntentConfiguration을 사용해요

`StaticConfiguration`은 모든 설치 인스턴스가 같은 규칙을 사용해요. 사용자가 “분 단위”와 “진행률” 중 표시 방식을 고르게 하려면 `WidgetConfigurationIntent`와 `AppIntentTimelineProvider`를 사용해요.

먼저 설정 화면에 나타날 선택지를 정의해요.

```swift
import AppIntents

enum ReadingMetric: String, AppEnum {
  case minutes
  case progress

  static let typeDisplayRepresentation = TypeDisplayRepresentation(
    name: "독서 표시 방식"
  )

  static let caseDisplayRepresentations: [
    ReadingMetric: DisplayRepresentation
  ] = [
    .minutes: "읽은 시간",
    .progress: "목표 진행률",
  ]
}

struct ReadingWidgetConfiguration: WidgetConfigurationIntent {
  static let title: LocalizedStringResource = "독서 Widget 설정"
  static let description = IntentDescription(
    "Widget에 표시할 독서 정보를 선택합니다."
  )

  @Parameter(
    title: "표시 방식",
    default: ReadingMetric.progress
  )
  var metric: ReadingMetric
}
```

설정값은 provider 메서드의 `configuration`으로 전달돼요. View가 사용할 값은 설정과 함께 entry에 넣어요.

```swift
import WidgetKit

struct ConfigurableReadingEntry: TimelineEntry {
  let date: Date
  let dailyGoal: Int
  let completedMinutes: Int
  let metric: ReadingMetric
}

struct ConfigurableReadingProvider: AppIntentTimelineProvider {
  func placeholder(in context: Context) -> ConfigurableReadingEntry {
    ConfigurableReadingEntry(
      date: .now,
      dailyGoal: 30,
      completedMinutes: 10,
      metric: .progress
    )
  }

  func snapshot(
    for configuration: ReadingWidgetConfiguration,
    in context: Context
  ) async -> ConfigurableReadingEntry {
    makeEntry(metric: configuration.metric)
  }

  func timeline(
    for configuration: ReadingWidgetConfiguration,
    in context: Context
  ) async -> Timeline<ConfigurableReadingEntry> {
    Timeline(
      entries: [makeEntry(metric: configuration.metric)],
      policy: .never
    )
  }

  private func makeEntry(
    metric: ReadingMetric
  ) -> ConfigurableReadingEntry {
    let snapshot = ReadingSnapshotStore()?.load()
      ?? ReadingSnapshot(
        dailyGoal: 30,
        completedMinutes: 0
      )

    return ConfigurableReadingEntry(
      date: .now,
      dailyGoal: snapshot.dailyGoal,
      completedMinutes: snapshot.completedMinutes,
      metric: metric
    )
  }
}
```

마지막으로 `AppIntentConfiguration`으로 설정형 provider를 연결해요.

```swift
import SwiftUI
import WidgetKit

struct ConfigurableReadingView: View {
  let entry: ConfigurableReadingEntry

  var body: some View {
    VStack(alignment: .leading, spacing: 8) {
      Text("오늘의 독서")
        .font(.headline)

      switch entry.metric {
      case .minutes:
        Text("\(entry.completedMinutes)분")
          .font(.title)
      case .progress:
        let progress = Double(entry.completedMinutes)
          / Double(max(entry.dailyGoal, 1))

        ProgressView(value: min(progress, 1))
        Text("목표의 \(Int(progress * 100))%")
          .font(.caption)
      }
    }
  }
}

struct ConfigurableReadingWidget: Widget {
  let kind = "ConfigurableReadingProgressWidget"

  var body: some WidgetConfiguration {
    AppIntentConfiguration(
      kind: kind,
      intent: ReadingWidgetConfiguration.self,
      provider: ConfigurableReadingProvider()
    ) { entry in
      ConfigurableReadingView(entry: entry)
        .containerBackground(.fill.tertiary, for: .widget)
    }
    .configurationDisplayName("맞춤 독서 진행률")
    .description("표시 방식을 선택하는 독서 Widget입니다.")
    .supportedFamilies([.systemSmall, .systemMedium])
  }
}
```

`@Parameter`가 `String`, `Int`, `AppEnum`처럼 정적인 값이면 WidgetKit이 편집 UI를 구성할 수 있어요. 앱의 책 목록처럼 동적으로 바뀌는 항목을 선택하게 하려면 `AppEntity`와 `EntityQuery`를 추가해요. Apple의 [Making a configurable widget](https://developer.apple.com/documentation/widgetkit/making-a-configurable-widget)에서 동적 entity와 기본 선택값을 확인할 수 있어요.

| 질문                         | `StaticConfiguration` | `AppIntentConfiguration`                             |
| ---------------------------- | --------------------- | ---------------------------------------------------- |
| 사용자가 설정할 값이 있나요? | 없어요.               | `WidgetConfigurationIntent`의 parameter를 편집해요.  |
| provider protocol            | `TimelineProvider`    | `AppIntentTimelineProvider`                          |
| provider가 설정을 받나요?    | 받지 않아요.          | snapshot과 timeline 메서드가 configuration을 받아요. |
| 알맞은 예                    | 오늘 전체 독서량      | 사용자가 고른 책이나 표시 방식                       |

## Preview는 placeholder가 아니라 실제 entry 조합을 검증해요

Xcode 15 이상에서는 `#Preview` macro로 Widget family와 timeline entry를 함께 제공할 수 있어요.

```swift
#Preview("독서 Small", as: .systemSmall, widget: {
  ReadingProgressWidget()
}, timeline: {
  ReadingEntry(
    date: .now,
    dailyGoal: 30,
    completedMinutes: 0
  )
  ReadingEntry(
    date: .now,
    dailyGoal: 30,
    completedMinutes: 30
  )
  ReadingEntry(
    date: .now,
    dailyGoal: 30,
    completedMinutes: 50
  )
})
```

0%, 100%, 초과 달성처럼 경계값을 나란히 확인해요. family마다 text가 잘리거나 background와 content margin이 어색하지 않은지도 살펴봐요. Preview만으로 process, entitlement와 실제 scheduling을 재현할 수는 없으므로 다음 테스트를 나눠 진행해요.

1. `ReadingEntry.progress`와 provider의 날짜 계산은 일반 unit test로 검증해요.
2. View는 여러 entry와 family를 Preview 또는 snapshot test로 확인해요.
3. App Group suite는 App과 Widget target이 같은 entitlement로 서명된 실제 기기에서 검증해요.
4. 앱을 foreground, background, 종료 상태로 바꿔 reload 결과를 확인해요.
5. 시간대와 자정, locale, Dynamic Type, 잠금 화면과 StandBy를 확인해요.
6. interactive button은 저장 성공과 실패, 잠금 상태를 각각 확인해요.

## Widget, Live Activity와 알림은 갱신 방식이 달라요

| 기능           | 주 목적                                      | 갱신 모델                                                       | 상호작용                            |
| -------------- | -------------------------------------------- | --------------------------------------------------------------- | ----------------------------------- |
| Widget         | 자주 확인하는 요약과 짧은 action             | timeline snapshot, reload 요청                                  | deep link, App Intent button·toggle |
| Live Activity  | 진행 중인 배달, 경기, timer 같은 실시간 사건 | ActivityKit state update이며 Widget timeline을 사용하지 않아요. | App Intent action과 앱 열기         |
| 로컬·push 알림 | 특정 사건을 사용자에게 적극적으로 알려요.    | 예약 시각 또는 APNs 전달                                        | notification action과 앱 열기       |
| 앱 화면        | 탐색, 편집과 연속적인 상호작용               | 실행 중인 process와 state observation                           | 제한 없는 UI 흐름                   |

몇 초마다 바뀌는 배달 위치나 경기 점수를 일반 Widget timeline으로 흉내 내면 refresh budget과 맞지 않아요. 반대로 사용자가 하루에 몇 번 확인하는 독서 진행률은 Live Activity보다 Widget이 자연스러워요. 변화 속도와 사용자의 목적을 먼저 보고 기술을 선택해요.

## 민감한 정보는 잠금 화면과 snapshot 노출을 고려해요

Widget은 Home Screen, Lock Screen, StandBy, Smart Stack과 다른 기기에 표시될 수 있어요. 앱이 잠겨 있지 않은 순간에 만든 View 표현이 시스템 영역에서 다시 사용될 수 있으므로 민감 정보의 표시 범위를 명시해야 해요.

- 계좌, 건강, 개인 메시지처럼 민감한 View에는 `.privacySensitive()`를 검토해요.
- placeholder에는 실제 사용자의 이름이나 저장값을 넣지 않아요.
- deep link를 받더라도 앱에서 인증과 권한을 다시 확인해요.
- App Group에는 Widget 표시에 필요한 최소 snapshot만 저장해요.
- token과 암호를 UserDefaults suite에 저장하지 말고 Keychain access group 같은 보호 저장소를 검토해요.

## 자주 실패하는 구현을 점검해요

### Widget View에서 network를 직접 호출해요

View의 `body`는 렌더링 설명이어야 해요. 호출 횟수와 생명주기를 제어할 수 없으므로 network는 provider나 별도 data layer에서 완료하고 entry에 결과를 담아요. 실패하면 마지막 성공 snapshot이나 명시적인 fallback을 제공해요.

### `Timer`, `@State`, `ObservableObject`가 계속 갱신할 것이라고 기대해요

extension은 계속 실행되지 않고 WidgetKit은 보관한 View 표현을 표시해요. 시간 기반 text는 SwiftUI가 제공하는 시간 표시 API를 활용하고, 데이터 변화는 timeline entry로 계획해요.

### 매번 `reloadAllTimelines()`를 호출해요

하나의 값만 바뀌었는데 모든 종류를 reload하면 불필요한 extension 작업이 늘어요. 값과 관련된 `kind`만 요청하고 실제 표시 데이터가 바뀐 경우에만 호출해요.

### App과 Widget이 `UserDefaults.standard`를 함께 읽어요

두 target의 standard domain은 서로 달라요. App Groups capability를 두 target에 추가하고 같은 `UserDefaults(suiteName:)`을 사용해요.

### reload 직후 화면이 동기적으로 바뀐다고 테스트해요

reload는 scheduling 요청이에요. 저장 완료 여부를 먼저 검증하고 실제 기기에서는 시스템이 extension을 다시 호출해 새 entry를 받은 결과를 관찰해요.

### 작은 Widget에 앱 화면 전체를 축소해 넣어요

Widget은 glanceable한 정보와 짧은 action을 제공해요. 복잡한 입력과 탐색은 deep link로 앱의 알맞은 화면에 이어 주세요.

### 하나의 View 계층에 여러 `widgetURL`을 붙여요

동작이 정의되지 않아요. 기본 목적지는 `widgetURL` 하나로 두고 개별 목적지는 `Link`를 사용해요.

## 언제 WidgetKit을 사용해야 하나요

다음 조건에서 Widget이 잘 맞아요.

- 사용자가 앱을 열지 않고도 자주 확인할 짧은 요약이 있어요.
- 데이터가 일정 시각이나 비교적 낮은 빈도로 바뀌어요.
- 미래 변화를 timeline으로 예측하거나 변경 시점에 reload를 요청할 수 있어요.
- 한두 번의 짧은 action을 App Intent로 안전하게 완료할 수 있어요.
- 앱과 별도 process라는 경계에 맞춰 공유 snapshot을 설계할 수 있어요.

다음 조건이라면 다른 UI를 먼저 고려해요.

- 초 단위 정확도와 계속 실행되는 animation이 핵심이에요.
- 여러 단계 입력, 자유로운 탐색과 복잡한 편집이 필요해요.
- 민감 정보를 잠금 화면에 노출하면 안 되고 유용한 대체 표현도 없어요.
- 모든 갱신이 즉시 반영되어야만 기능이 성립해요.

## 구현 체크리스트

1. Widget이 “한눈에 볼 정보”와 “짧은 action”에 맞는지 확인해요.
2. extension target과 안정적인 `kind`를 만들어요.
3. View에 필요한 값만 가진 `TimelineEntry` snapshot을 정의해요.
4. placeholder에는 빠르고 일반적인 sample data를 제공해요.
5. 예측 가능한 변화는 미래 entry로 만들고 policy를 선택해요.
6. 앱에서 바뀌는 데이터는 저장 완료 후 구체적인 `kind`만 reload해요.
7. App과 Widget 공유가 필요하면 두 target의 App Group entitlement를 일치시켜요.
8. 실제로 지원할 family에서 content margin, background와 text 길이를 확인해요.
9. 앱 열기는 `widgetURL`·`Link`, 직접 action은 App Intent를 사용해요.
10. 설정값이 필요할 때만 `AppIntentConfiguration`을 도입해요.
11. 민감 정보와 잠금 상태의 표시·상호작용 정책을 정해요.
12. Preview뿐 아니라 실제 기기에서 process와 scheduling을 검증해요.

## 면접에서 이어질 수 있는 질문

### Widget을 작은 SwiftUI 앱이라고 볼 수 있나요?

아니요. Widget extension은 별도 process에서 필요할 때만 실행되고, WidgetKit은 provider가 만든 timeline entry와 View 표현을 보관해 시스템 영역에 렌더링해요. 앱처럼 계속 실행되며 임의의 state binding을 관찰하는 구조가 아니에요.

### placeholder, snapshot과 timeline은 어떻게 다른가요?

placeholder는 실제 데이터를 기다리지 않는 빠른 골격이고, snapshot은 gallery나 preview의 대표 한 장면이며, timeline은 실제 표시할 entry 배열과 다음 요청 정책이에요. 세 경로 모두 process 재사용을 가정하지 않고 독립적으로 결과를 만들 수 있어야 해요.

### `reloadTimelines(ofKind:)`를 호출하면 Widget이 즉시 갱신되나요?

아니요. 현재 timeline이 오래됐음을 WidgetKit에 알리는 요청이에요. 시스템이 전력, visibility와 refresh budget을 고려해 provider를 호출하므로 동기적인 redraw나 정확한 실행 시각을 보장하지 않아요.

### 앱과 Widget은 왜 `UserDefaults.standard`로 공유할 수 없나요?

containing app과 Widget extension은 별도 sandbox와 preferences domain을 가져요. 두 target에 같은 App Group entitlement를 추가하고 `UserDefaults(suiteName:)`으로 shared domain을 열어야 해요.

### Interactive Widget은 `@State`를 직접 바꾸나요?

아니요. iOS 17 이상에서 `Button`이나 `Toggle`이 App Intent를 실행하고, intent가 공유 저장소를 갱신한 뒤 시스템이 timeline을 reload해 새 entry로 렌더링해요.

### `StaticConfiguration`과 `AppIntentConfiguration`은 언제 구분하나요?

모든 Widget 인스턴스가 같은 규칙을 사용하면 `StaticConfiguration`이 단순해요. 사용자가 책, 지역, 표시 방식처럼 인스턴스별 값을 편집해야 하면 `WidgetConfigurationIntent`와 `AppIntentTimelineProvider`를 사용하는 `AppIntentConfiguration`을 선택해요.

### Widget과 Live Activity는 무엇이 다른가요?

Widget은 오래 두고 보는 요약을 timeline으로 갱신하고, Live Activity는 진행 중인 한 사건의 live state를 ActivityKit으로 갱신해요. Live Activity도 Widget extension과 SwiftUI 구성을 사용하지만 Widget timeline은 사용하지 않아요.

## 참고 자료

- [Apple Developer — WidgetKit](https://developer.apple.com/documentation/widgetkit)
- [Apple Developer — Creating a widget extension](https://developer.apple.com/documentation/widgetkit/creating-a-widget-extension)
- [Apple Developer — TimelineProvider](https://developer.apple.com/documentation/widgetkit/timelineprovider)
- [Apple Developer — Keeping a widget up to date](https://developer.apple.com/documentation/widgetkit/keeping-a-widget-up-to-date)
- [Apple Developer — Creating views for widgets, Live Activities, and watch complications](https://developer.apple.com/documentation/widgetkit/creating-views-for-widgets-live-activities-and-watch-complications)
- [Apple Developer — Displaying the right widget background](https://developer.apple.com/documentation/widgetkit/displaying-the-right-widget-background)
- [Apple Developer — Linking to specific app scenes from your widget or Live Activity](https://developer.apple.com/documentation/widgetkit/linking-to-specific-app-scenes-from-your-widget-or-live-activity)
- [Apple Developer — Adding interactivity to widgets and Live Activities](https://developer.apple.com/documentation/widgetkit/adding-interactivity-to-widgets-and-live-activities)
- [Apple Developer — Making a configurable widget](https://developer.apple.com/documentation/widgetkit/making-a-configurable-widget)
- [Apple Developer — Previewing widgets and Live Activities in Xcode](https://developer.apple.com/documentation/widgetkit/previewing-widgets-and-live-activities-in-xcode)
- [Swift-KR — Swift로 이해하는 App Groups와 Widget 데이터 공유](../../data-storage/app-groups)
- [Swift-KR — UserDefaults](../../data-storage/userdefaults)
- [Swift-KR — @AppStorage](../../data-storage/appstorage)
