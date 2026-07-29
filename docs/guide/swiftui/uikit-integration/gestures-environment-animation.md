---
title: UIKit 통합의 제스처·환경·애니메이션
description: iOS 18의 UIGestureRecognizerRepresentable과 통합 애니메이션, iOS 17의 UIKit trait–SwiftUI environment 브리지를 지원 버전과 대안까지 설명합니다.
---

# UIKit 통합의 제스처·환경·애니메이션

> **면접 답변 한 줄 요약:** 최신 SwiftUI–UIKit 통합 API는 UIKit 제스처를 SwiftUI에 직접 붙이고, 사용자 정의 trait과 environment를 같은 계층 값으로 공유하며, 하나의 SwiftUI `Animation`으로 양쪽 화면의 타이밍을 맞추되 지원 OS와 더 단순한 대안을 먼저 확인해야 해요.

기본 통합은 `UIHostingController`와 Representable만으로 충분한 경우가 많아요. 하지만 기존 UIKit 제스처 인식기의 세부 기능을 유지하거나, UIKit과 SwiftUI 하위 계층 전체에 앱 테마를 전달하거나, 두 프레임워크의 애니메이션 감각을 맞춰야 할 수 있어요.

Apple의 [UIKit integration](https://developer.apple.com/documentation/swiftui/uikit-integration) 공식 목차는 이런 문제를 위한 최신 API도 함께 제공해요.

| 기능                                 | iOS 도입 버전 | 해결하는 문제                                                                  |
| ------------------------------------ | ------------- | ------------------------------------------------------------------------------ |
| `UITraitBridgedEnvironmentKey`       | iOS 17        | UIKit 사용자 정의 trait과 SwiftUI environment가 같은 계층 값을 읽고 쓰게 해요. |
| `UIGestureRecognizerRepresentable`   | iOS 18        | UIKit gesture recognizer를 SwiftUI 뷰에 직접 붙이고 좌표를 변환해요.           |
| SwiftUI `Animation`을 받는 UIKit API | iOS 18        | SwiftUI와 UIKit 애니메이션의 타이밍과 spring 특성을 같은 값으로 표현해요.      |
| `UIHostingSceneDelegate`             | iOS 26        | UIKit scene delegate 생명주기에서 SwiftUI scene을 연결해요.                    |
| `UIHostingOrnament`, `UIOrnament`    | visionOS 1.0  | UIKit이 소유한 visionOS 인터페이스에 SwiftUI ornament를 호스팅해요.            |

새 API라는 이유만으로 사용할 필요는 없어요. 직접 프로퍼티 하나를 전달하면 되는 화면에 사용자 정의 trait을 만들거나, SwiftUI `LongPressGesture`로 충분한데 UIKit recognizer를 넣으면 경계만 복잡해져요.

## 먼저 알아둘 제스처와 환경 용어

| 용어                  | 쉬운 뜻                                                                                                                                     |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| gesture recognizer    | 탭, 길게 누르기, pan처럼 연속된 터치 입력을 하나의 제스처 상태로 해석하는 UIKit 객체예요.                                                   |
| coordinate space      | 점의 위치를 어느 뷰나 화면을 기준으로 표현하는지 정하는 좌표계예요. 같은 손가락 위치도 전역 화면과 로컬 뷰에서는 다른 숫자가 돼요.          |
| SwiftUI environment   | 상위 SwiftUI 뷰가 하위 계층에 내려보내는 구성 값 저장소예요. 하위 뷰는 `@Environment`로 필요한 값을 읽어요.                                 |
| UIKit trait           | 화면 크기, 색상 모드, 접근성 설정, 사용자 정의 값처럼 UIKit 뷰와 뷰 컨트롤러 계층으로 전파되는 구성 정보예요.                               |
| environment key       | SwiftUI environment에서 특정 값과 기본값을 식별하는 타입이에요.                                                                             |
| `UITraitDefinition`   | UIKit 사용자 정의 trait의 값 타입과 기본값을 정의하는 프로토콜이에요.                                                                       |
| animation transaction | 한 상태 변경과 함께 적용할 애니메이션 정보를 담는 SwiftUI 갱신 단위예요. Representable의 `Context`에서 현재 transaction을 확인할 수 있어요. |
| ornament              | visionOS 창에 붙여 배치하는 보조 인터페이스예요. iOS의 toolbar와 비슷해 보일 수 있지만 3차원 창 주변에 배치되는 visionOS 개념이에요.        |

## UIKit 제스처를 SwiftUI 뷰에 직접 붙여요

iOS 18 이상에서는 `UIGestureRecognizerRepresentable`이 UIKit recognizer의 생성, 갱신, action 처리를 SwiftUI에 연결해요. 독서 앱의 책 표지를 길게 누른 위치에 메뉴를 띄운다고 가정할게요.

```swift
import SwiftUI
import UIKit

@available(iOS 18.0, *)
struct BookLongPressRecognizer: UIGestureRecognizerRepresentable {
  let onBegan: (CGPoint) -> Void

  func makeUIGestureRecognizer(
    context: Context
  ) -> UILongPressGestureRecognizer {
    let recognizer = UILongPressGestureRecognizer()
    recognizer.minimumPressDuration = 0.4
    return recognizer
  }

  func handleUIGestureRecognizerAction(
    _ recognizer: UILongPressGestureRecognizer,
    context: Context
  ) {
    guard recognizer.state == .began else {
      return
    }

    let location = context.converter.location(in: .local)
    onBegan(location)
  }
}
```

SwiftUI 뷰에는 `gesture(_:)` modifier로 붙여요.

```swift
@available(iOS 18.0, *)
struct BookCoverView: View {
  @State private var menuLocation: CGPoint?

  var body: some View {
    Image(systemName: "book.closed.fill")
      .font(.system(size: 80))
      .gesture(
        BookLongPressRecognizer { location in
          menuLocation = location
        }
      )
  }
}
```

SwiftUI가 recognizer에 action target을 자동으로 설치하고, 인식될 때 `handleUIGestureRecognizerAction`을 호출해요. 별도 delegate 메시지나 추가 target이 필요하면 `makeCoordinator(converter:)`로 Coordinator를 제공할 수 있어요.

## 좌표는 converter로 SwiftUI 공간에 맞춰요

UIKit recognizer의 `view`가 SwiftUI에서 생각하는 대상 뷰와 같은 기하 구조를 갖는다고 가정하면 안 돼요. Apple은 context의 coordinate space converter를 사용해 전역 위치를 SwiftUI 계층의 좌표로 변환하라고 안내해요.

```swift
let localPoint = context.converter.location(in: .local)
let globalPoint = context.converter.location(in: .global)
```

메뉴를 책 표지 안의 터치 위치에 배치하려면 `.local`, 여러 형제 뷰가 공유하는 overlay에 배치하려면 이름을 붙인 SwiftUI coordinate space를 사용할 수 있어요.

```swift
let point = context.converter.location(
  in: .named("reading-dashboard")
)
```

좌표를 UIKit `recognizer.location(in:)`로만 읽으면 실제 recognizer가 붙은 내부 뷰를 기준으로 할 수 있어 SwiftUI 뷰의 로컬 좌표와 다를 수 있어요.

## 기본 SwiftUI gesture로 충분한지 먼저 확인해요

| 요구 사항                                                     | 먼저 고려할 선택                                        |
| ------------------------------------------------------------- | ------------------------------------------------------- |
| 탭, 드래그, 길게 누르기 같은 일반 상호작용                    | SwiftUI `TapGesture`, `DragGesture`, `LongPressGesture` |
| 기존 사용자 정의 `UIGestureRecognizer`를 재사용해요.          | `UIGestureRecognizerRepresentable`                      |
| UIKit delegate, failure dependency, 세부 recognizer 설정 필요 | `UIGestureRecognizerRepresentable`과 Coordinator        |
| iOS 17 이하도 지원해야 해요.                                  | SwiftUI gesture 또는 작은 UIKit 뷰 어댑터               |

SwiftUI 기본 gesture는 환경과 상태 흐름에 자연스럽게 참여하고 하위 버전도 지원해요. UIKit recognizer만 제공하는 기능이나 기존 구현을 유지해야 할 때 브리지를 선택하세요.

## UIKit trait과 SwiftUI environment를 같은 값으로 연결해요

UIKit trait과 SwiftUI environment는 모두 상위 계층에서 하위 계층으로 구성 값을 전파해요. iOS 17 이상에서는 사용자 정의 environment key가 `UITraitBridgedEnvironmentKey`를 따르게 해서 같은 값을 양쪽 API로 읽고 쓸 수 있어요.

독서 앱의 화면 분위기를 나타내는 테마를 예로 들어 볼게요.

```swift
import SwiftUI
import UIKit

enum ReadingTheme: Int {
  case standard
  case calm
  case focus
}

@available(iOS 17.0, *)
struct ReadingThemeTrait: UITraitDefinition {
  static let defaultValue = ReadingTheme.standard
}

@available(iOS 17.0, *)
extension UITraitCollection {
  var readingTheme: ReadingTheme {
    self[ReadingThemeTrait.self]
  }
}

@available(iOS 17.0, *)
extension UIMutableTraits {
  var readingTheme: ReadingTheme {
    get { self[ReadingThemeTrait.self] }
    set { self[ReadingThemeTrait.self] = newValue }
  }
}
```

여기까지는 UIKit 사용자 정의 trait이에요. SwiftUI environment key를 같은 값 타입으로 만들어요.

```swift
struct ReadingThemeKey: EnvironmentKey {
  static let defaultValue = ReadingTheme.standard
}

extension EnvironmentValues {
  var readingTheme: ReadingTheme {
    get { self[ReadingThemeKey.self] }
    set { self[ReadingThemeKey.self] = newValue }
  }
}
```

마지막으로 읽기와 쓰기 변환을 연결해요.

```swift
@available(iOS 17.0, *)
extension ReadingThemeKey: UITraitBridgedEnvironmentKey {
  static func read(
    from traitCollection: UITraitCollection
  ) -> ReadingTheme {
    traitCollection.readingTheme
  }

  static func write(
    to mutableTraits: inout any UIMutableTraits,
    value: ReadingTheme
  ) {
    mutableTraits.readingTheme = value
  }
}
```

`read`는 UIKit trait 값을 SwiftUI environment로 보내고, `write`는 SwiftUI environment 값을 UIKit의 mutable traits에 반영해요. Apple의 [UITraitBridgedEnvironmentKey](https://developer.apple.com/documentation/uikit/uitraitbridgedenvironmentkey)는 이 두 메서드를 요구해요.

## UIKit에서 설정하고 SwiftUI에서 읽어요

UIKit 계층의 상단에 override를 적용해요.

```swift
@available(iOS 17.0, *)
func applyFocusTheme(to windowScene: UIWindowScene) {
  windowScene.traitOverrides.readingTheme = .focus
}
```

이 window scene 아래의 UIKit 뷰, `UIHostingController`, `UIHostingConfiguration` 안에 있는 SwiftUI 뷰까지 값이 내려가요.

```swift
struct ReadingCardView: View {
  @Environment(\.readingTheme) private var theme

  var body: some View {
    Text("집중 독서")
      .foregroundStyle(theme == .focus ? .orange : .primary)
  }
}
```

Apple의 [Unleash the UIKit trait system](https://developer.apple.com/videos/play/wwdc2023/10057/) 세션은 UIKit window scene의 trait override가 `UIHostingConfiguration` 안 SwiftUI 환경까지 전파되고, 값이 바뀌면 SwiftUI가 의존성을 추적해 화면을 갱신하는 예를 보여 줘요.

## SwiftUI에서 설정하고 UIKit에서 읽어요

반대 방향도 같은 키를 사용해요.

```swift
struct SettingsView: View {
  var body: some View {
    SettingsControllerRepresentable()
      .environment(\.readingTheme, .calm)
  }
}
```

Representable 안의 UIKit 뷰 컨트롤러는 자신의 trait collection에서 값을 읽어요.

```swift
final class SettingsViewController: UIViewController {
  override func viewWillLayoutSubviews() {
    super.viewWillLayoutSubviews()

    view.backgroundColor =
      traitCollection.readingTheme == .calm
        ? .systemMint
        : .systemBackground
  }
}
```

trait은 UIKit 계층을 따라 내려오므로 가장 구체적인 뷰나 뷰 컨트롤러의 `traitCollection`을 읽으세요. iOS 17에서는 뷰가 계층에 들어온 뒤 trait이 최신 상태가 되므로 레이아웃 시점에 사용하는 방식이 안전해요.

## 단순한 값에는 직접 전달을 사용해요

사용자 정의 trait과 environment 브리지는 다음 상황에 적합해요.

- 여러 단계 아래의 UIKit과 SwiftUI 구성 요소가 같은 계층형 설정을 읽어요.
- 창이나 화면 하위 트리 전체에 테마, 표시 밀도, 기능 모드가 전파돼요.
- UIKit과 SwiftUI 중 어느 쪽이 바깥 컨테이너가 되어도 같은 값 접근 방식을 유지하고 싶어요.

반면 부모와 자식이 직접 연결되어 있고 값 하나만 전달하면 된다면 프로퍼티나 binding이 더 단순해요.

```swift
struct ReadingCardView: View {
  let theme: ReadingTheme
}
```

Apple도 custom trait은 계층의 많은 자식이나 멀리 떨어진 구성 요소에 값을 전달할 때 사용하고, 직접 전달할 수 있는 값에는 피하라고 안내해요. trait 변경은 하위 계층 갱신 비용도 만들어요.

## 하나의 SwiftUI `Animation`을 UIKit에서도 사용해요

iOS 18 이상에서는 `UIView.animate`에 SwiftUI `Animation`을 전달할 수 있어요.

```swift
import SwiftUI
import UIKit

@available(iOS 18.0, *)
func emphasize(_ cardView: UIView) {
  let animation = SwiftUI.Animation.spring(duration: 0.45)

  UIView.animate(animation) {
    cardView.transform = CGAffineTransform(
      scaleX: 1.04,
      y: 1.04
    )
  }
}
```

SwiftUI 쪽에서도 같은 값을 사용할 수 있어요.

```swift
let readingAnimation = Animation.spring(duration: 0.45)

withAnimation(readingAnimation) {
  isExpanded.toggle()
}
```

두 프레임워크가 서로 다른 duration과 curve를 따로 관리하는 대신 같은 `Animation` 값으로 움직임의 특성을 맞출 수 있어요. Apple의 [Unifying your app’s animations](https://developer.apple.com/documentation/swiftui/unifying-your-app-s-animations) 문서는 SwiftUI, UIKit, AppKit을 섞은 앱에서 timing 불일치를 줄이는 방법으로 이를 소개해요.

## Representable은 현재 transaction의 애니메이션을 적용할 수 있어요

iOS 18 이상에서 `UIViewRepresentableContext`와 `UIViewControllerRepresentableContext`는 `animate(changes:completion:)`을 제공해요. SwiftUI가 현재 transaction에 넣은 애니메이션으로 UIKit 변경을 실행할 수 있어요.

```swift
@available(iOS 18.0, *)
func updateUIView(
  _ progressView: UIProgressView,
  context: Context
) {
  context.animate {
    progressView.alpha = isEnabled ? 1 : 0.35
  }
}
```

바깥 SwiftUI 상태가 `withAnimation` 안에서 바뀌면 해당 transaction의 애니메이션이 UIKit 변경에도 사용돼요. 애니메이션이 없는 갱신이라면 즉시 적용돼요.

iOS 17 이하에서는 `context.transaction.animation`을 UIKit이 직접 실행할 수 있는 일반 API가 없어요. 하위 버전에서는 `UIView.animate(withDuration:)` 같은 UIKit 애니메이션을 명시적으로 선택하고, 두 구현의 duration과 curve를 설계 값으로 공유하세요.

## 통합 애니메이션의 제한도 확인해요

Apple은 다음 차이를 안내해요.

- SwiftUI 애니메이션은 앱 프로세스의 백그라운드 스레드에서 값을 계산할 수 있어요.
- SwiftUI 애니메이션에는 대응하는 `CAAnimation` 객체가 없어요.
- `UIViewPropertyAnimator`나 UIKit keyframe animation과 호환되지 않아요.

상호작용 가능한 animator를 멈추고 되감거나 복잡한 keyframe을 제어해야 한다면 기존 UIKit 애니메이션이 더 적합할 수 있어요. 단순히 두 프레임워크의 spring과 timing을 맞추려는 경우에 통합 API의 이점이 커요.

## Scene과 visionOS ornament는 별도 범위예요

공식 UIKit integration 목차의 모든 API가 일반 iOS 화면 임베딩용은 아니에요.

- `UIHostingSceneDelegate`는 iOS 26 이상에서 `UISceneDelegate`를 확장해 SwiftUI scene을 연결해요. 한 뷰를 감싸는 `UIHostingController`보다 앱 scene 생명주기에 가까운 고급 마이그레이션 API예요.
- `UIHostingOrnament`와 `UIOrnament`는 visionOS 1.0 이상 전용이에요. iPhone과 iPad의 toolbar를 위한 대체 API가 아니에요.

현재 문제가 화면이나 셀 하나의 통합이라면 기본 hosting/representable부터 사용하세요. scene이나 공간 인터페이스를 실제로 옮길 때 해당 플랫폼 문서를 별도로 확인하는 편이 안전해요.

## 적용 순서를 정리해요

1. SwiftUI 기본 gesture, 직접 프로퍼티, 각 프레임워크의 기본 애니메이션으로 해결 가능한지 확인하세요.
2. 앱의 최소 지원 OS와 availability 분기를 정하세요.
3. UIKit recognizer가 꼭 필요하면 `UIGestureRecognizerRepresentable`로 생성과 action을 연결하세요.
4. 위치가 필요하면 context converter로 사용할 SwiftUI coordinate space를 명시하세요.
5. 여러 계층이 공유할 사용자 정의 값만 trait–environment 브리지로 정의하세요.
6. 양쪽 애니메이션의 timing을 맞출 때 같은 SwiftUI `Animation`이나 representable context를 사용하세요.
7. 하위 버전 대안과 animation 호환 제한을 실제 기기에서 확인하세요.

## 면접에서 이어질 수 있는 질문

### `UIGestureRecognizerRepresentable`은 언제 필요한가요?

SwiftUI 기본 gesture로 표현하기 어려운 기존 사용자 정의 recognizer, delegate 상호작용, UIKit의 세부 제스처 설정을 유지할 때 필요해요. 일반 탭이나 길게 누르기라면 더 단순하고 하위 버전도 지원하는 SwiftUI gesture를 먼저 선택해요.

### UIKit recognizer의 위치를 왜 converter로 읽어야 하나요?

recognizer가 내부적으로 연결된 UIKit 뷰의 좌표계와 사용자가 보는 SwiftUI 뷰의 좌표계가 다를 수 있기 때문이에요. context converter는 전역 위치를 SwiftUI의 로컬, 전역, 이름 있는 좌표 공간으로 변환해 올바른 위치를 제공해요.

### `UITraitBridgedEnvironmentKey`가 직접 프로퍼티 전달보다 좋은 경우는 언제인가요?

창이나 화면의 여러 단계 아래에 있는 UIKit과 SwiftUI 구성 요소가 같은 계층형 설정을 자동으로 물려받아야 할 때 좋아요. 부모와 자식이 직접 연결되어 값 하나만 전달하면 프로퍼티나 binding이 더 단순하고 비용도 적어요.

### SwiftUI `Animation`을 UIKit에서 쓰면 `UIViewPropertyAnimator`를 대신할 수 있나요?

항상 그렇지는 않아요. 같은 spring과 timing을 두 프레임워크에 적용하는 데 유용하지만 대응 `CAAnimation`이 없고 property animator나 keyframe animation과 호환되지 않아요. 중단, 진행률 제어, keyframe이 필요하면 UIKit 전용 animator를 유지하세요.

## 참고 자료

- [UIKit integration](https://developer.apple.com/documentation/swiftui/uikit-integration)
- [UIGestureRecognizerRepresentable](https://developer.apple.com/documentation/swiftui/uigesturerecognizerrepresentable)
- [UITraitBridgedEnvironmentKey](https://developer.apple.com/documentation/uikit/uitraitbridgedenvironmentkey)
- [Providing data to the view hierarchy with custom traits](https://developer.apple.com/documentation/uikit/providing-data-to-the-view-hierarchy-with-custom-traits)
- [Unleash the UIKit trait system](https://developer.apple.com/videos/play/wwdc2023/10057/)
- [Unifying your app’s animations](https://developer.apple.com/documentation/swiftui/unifying-your-app-s-animations)
- [UIHostingSceneDelegate](https://developer.apple.com/documentation/swiftui/uihostingscenedelegate)
- [UIHostingOrnament](https://developer.apple.com/documentation/swiftui/uihostingornament)
