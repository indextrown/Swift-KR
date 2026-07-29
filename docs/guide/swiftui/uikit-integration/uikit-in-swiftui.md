---
title: SwiftUI에 UIKit 넣기
description: UIViewRepresentable과 UIViewControllerRepresentable의 make·update·dismantle 생명주기, Coordinator와 Binding을 이용한 양방향 이벤트 전달을 설명합니다.
---

# SwiftUI에 UIKit 넣기

> **면접 답변 한 줄 요약:** SwiftUI에 UIKit을 넣을 때는 뷰를 `UIViewRepresentable`, 뷰 컨트롤러를 `UIViewControllerRepresentable`로 감싸고, SwiftUI 상태는 `update`에서 UIKit에 반영하며 UIKit 이벤트는 `Coordinator`를 통해 `Binding`으로 돌려보내요.

SwiftUI로 독서 목표 편집 화면을 만들었지만 검증된 `UISlider`와 UIKit 색상 선택 화면을 계속 사용한다고 가정할게요. UIKit 객체는 SwiftUI의 `View`를 따르지 않으므로 `body`에 직접 놓을 수 없어요. 대신 SwiftUI가 UIKit 객체를 언제 만들고, 어떤 상태로 갱신하고, 어떻게 정리할지 알 수 있는 어댑터를 제공해야 해요.

이 문서에서는 다음 내용을 배워요.

1. `UIViewRepresentable`로 `UISlider`를 감싸요.
2. SwiftUI 상태를 `updateUIView`에서 UIKit에 반영해요.
3. `Coordinator`로 UIKit 이벤트를 `Binding`에 전달해요.
4. `UIViewControllerRepresentable`로 색상 선택 화면을 감싸요.
5. 크기와 정리 메서드의 책임을 구분해요.

## 먼저 알아둘 SwiftUI와 UIKit 용어

| 용어                            | 쉬운 뜻                                                                                                                                                           |
| ------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `UIViewRepresentable`           | `UIView` 하나를 SwiftUI 뷰 계층에 넣기 위한 프로토콜이에요. 생성은 `makeUIView`, 상태 반영은 `updateUIView`가 맡아요.                                             |
| `UIViewControllerRepresentable` | `UIViewController` 전체를 SwiftUI 뷰 계층에 넣기 위한 프로토콜이에요. 자체 delegate와 화면 생명주기가 있는 UIKit 기능에 적합해요.                                 |
| `Binding`                       | 값을 읽고 쓸 수 있는 연결이에요. 자식이 값을 바꾸면 실제 저장소인 부모의 `State`도 바뀌어요.                                                                      |
| target-action                   | `UIControl`에서 값 변경이나 탭이 발생하면 지정한 객체의 메서드를 호출하는 UIKit 이벤트 전달 방식이에요.                                                           |
| delegate                        | UIKit 객체가 선택, 취소, 스크롤 같은 사건을 미리 정한 메서드로 다른 객체에 알리는 방식이에요.                                                                     |
| `Coordinator`                   | target-action이나 delegate 이벤트를 받는 참조 객체예요. Representable 값이 다시 만들어져도 UIKit 객체와 함께 유지되며 이벤트를 최신 SwiftUI 상태 연결로 전달해요. |
| `Context`                       | SwiftUI가 Representable의 생성·갱신 메서드에 주는 정보 묶음이에요. coordinator, environment, 현재 transaction에 접근할 수 있어요.                                 |
| 멱등성                          | 같은 입력으로 여러 번 실행해도 결과가 달라지지 않는 성질이에요. `update` 메서드는 자주 호출될 수 있으므로 현재 값과 같으면 불필요한 변경을 피해야 해요.           |

## `UIViewRepresentable`은 UIKit 뷰의 생명주기를 번역해요

`UIViewRepresentable`의 핵심 흐름은 세 단계예요.

```text
처음 계층에 들어옴
makeUIView(context:) ── UIKit 뷰 한 번 생성

SwiftUI 입력이나 환경이 바뀜
updateUIView(_:context:) ── 기존 UIKit 뷰를 최신 상태로 갱신

계층에서 제거됨
dismantleUIView(_:coordinator:) ── delegate, observer, 작업 정리
```

SwiftUI의 `View`는 값 타입이라 상태가 바뀔 때 새 값이 만들어질 수 있어요. 반면 `UISlider`는 오래 살아 있는 참조 객체예요. Representable은 새 SwiftUI 입력을 기존 UIKit 객체에 적용하는 경계가 돼요.

Apple의 [UIViewRepresentable](https://developer.apple.com/documentation/swiftui/uiviewrepresentable) 문서도 생성, 갱신, 해제 메서드를 사용해 UIKit 뷰를 관리하고, UIKit에서 발생한 변경은 Coordinator로 전달하라고 설명해요.

## 가장 작은 `UISlider` 어댑터를 만들어요

독서 목표 시간을 10분부터 120분까지 고르는 slider를 감싸 볼게요.

```swift
import SwiftUI
import UIKit

struct MinutesSlider: UIViewRepresentable {
  @Binding var minutes: Double

  func makeUIView(context: Context) -> UISlider {
    let slider = UISlider()
    slider.minimumValue = 10
    slider.maximumValue = 120
    slider.addTarget(
      context.coordinator,
      action: #selector(Coordinator.valueChanged(_:)),
      for: .valueChanged
    )
    return slider
  }

  func updateUIView(_ slider: UISlider, context: Context) {
    context.coordinator.minutes = $minutes

    let newValue = Float(minutes)
    guard abs(slider.value - newValue) > 0.001 else {
      return
    }

    slider.setValue(newValue, animated: false)
  }

  func makeCoordinator() -> Coordinator {
    Coordinator(minutes: $minutes)
  }

  final class Coordinator: NSObject {
    var minutes: Binding<Double>

    init(minutes: Binding<Double>) {
      self.minutes = minutes
    }

    @objc
    func valueChanged(_ sender: UISlider) {
      minutes.wrappedValue = Double(sender.value)
    }
  }
}
```

각 메서드의 책임을 나눠 볼게요.

- `makeUIView`: slider 생성, 범위처럼 한 번 정할 설정, target 등록을 해요.
- `updateUIView`: 현재 `minutes`를 이미 존재하는 slider에 반영해요.
- `makeCoordinator`: UIKit 이벤트를 받을 참조 객체를 만들어요.
- `valueChanged`: UIKit의 새 값을 `Binding`에 기록해 SwiftUI 상태를 바꿔요.

`updateUIView`에서 coordinator의 `minutes`를 `$minutes`로 다시 대입하는 점도 중요해요. Coordinator는 오래 유지되지만 Representable 값과 binding은 부모 계층 변화로 새로 전달될 수 있어요. 이벤트가 과거의 binding에 기록되지 않도록 최신 연결을 넘겨줘요.

## 부모의 `State`가 단일 데이터 원천이에요

SwiftUI 화면에서는 일반 뷰처럼 사용해요.

```swift
struct GoalEditorView: View {
  @State private var targetMinutes = 30.0

  var body: some View {
    Form {
      Text("하루 목표: \(Int(targetMinutes))분")

      MinutesSlider(minutes: $targetMinutes)
    }
  }
}
```

데이터 흐름은 한 바퀴를 돌아요.

```text
@State targetMinutes
      │
      ▼
updateUIView가 UISlider.value에 반영
      │
      ▼
사용자가 slider를 움직임
      │
      ▼
Coordinator가 Binding에 기록
      │
      └──────────────> @State targetMinutes
```

`UISlider`에 별도의 원본 값을 저장한 것이 아니에요. slider의 `value`는 화면 표현이고, 기준 상태는 부모의 `@State`예요.

## 같은 값을 다시 쓰는 피드백 루프를 막아요

다음과 같이 `updateUIView`에서 매번 값을 설정하면 UIKit이 추가 이벤트나 레이아웃을 일으키는 컨트롤에서 불필요한 갱신이 반복될 수 있어요.

```swift
func updateUIView(_ slider: UISlider, context: Context) {
  slider.value = Float(minutes)
}
```

앞의 완성 코드에서는 현재 값과 새 값의 차이를 확인했어요.

```swift
let newValue = Float(minutes)
guard abs(slider.value - newValue) > 0.001 else {
  return
}

slider.setValue(newValue, animated: false)
```

`updateUIView`는 한 번만 호출된다고 가정하면 안 돼요. 부모 상태, 환경 값, transaction이 바뀔 때 다시 호출될 수 있어요. 같은 입력을 여러 번 받아도 추가 부작용이 없도록 작성하세요.

## `UIViewControllerRepresentable`은 컨트롤러 전체를 감싸요

UIKit의 색상 선택 화면은 `UIColorPickerViewController`예요. 이 객체는 자체 화면과 delegate를 가지므로 `UIViewControllerRepresentable`이 맞아요.

```swift
@available(iOS 15.0, *)
struct ColorPickerController: UIViewControllerRepresentable {
  @Binding var selectedColor: UIColor

  func makeUIViewController(
    context: Context
  ) -> UIColorPickerViewController {
    let picker = UIColorPickerViewController()
    picker.supportsAlpha = false
    picker.selectedColor = selectedColor
    picker.delegate = context.coordinator
    return picker
  }

  func updateUIViewController(
    _ picker: UIColorPickerViewController,
    context: Context
  ) {
    context.coordinator.selectedColor = $selectedColor

    guard !picker.selectedColor.isEqual(selectedColor) else {
      return
    }

    picker.selectedColor = selectedColor
  }

  func makeCoordinator() -> Coordinator {
    Coordinator(selectedColor: $selectedColor)
  }

  static func dismantleUIViewController(
    _ picker: UIColorPickerViewController,
    coordinator: Coordinator
  ) {
    picker.delegate = nil
  }

  final class Coordinator: NSObject,
    UIColorPickerViewControllerDelegate
  {
    var selectedColor: Binding<UIColor>

    init(selectedColor: Binding<UIColor>) {
      self.selectedColor = selectedColor
    }

    func colorPickerViewController(
      _ viewController: UIColorPickerViewController,
      didSelect color: UIColor,
      continuously: Bool
    ) {
      selectedColor.wrappedValue = color
    }
  }
}
```

`makeUIViewController`는 컨트롤러를 만들고 delegate를 연결해요. 사용자가 색을 고르면 Coordinator가 UIKit delegate callback을 받아 binding을 갱신해요. `updateUIViewController`는 바깥 SwiftUI 상태가 다른 경로로 바뀐 경우 새 색을 picker에 반영해요.

`dismantleUIViewController`에서는 delegate 연결을 끊어요. 이 예제의 delegate는 UIKit에서 `weak`으로 보관하지만, 명시적인 정리는 어댑터가 어떤 연결을 책임지는지 드러내요. NotificationCenter observer, KVO, 타이머, 비동기 작업을 시작했다면 이 단계에서 반드시 해제하거나 취소해야 해요.

SwiftUI에서는 다음처럼 색을 공유해요.

```swift
@available(iOS 15.0, *)
struct ThemeEditorView: View {
  @State private var accentColor = UIColor.systemBlue

  var body: some View {
    VStack {
      Color(uiColor: accentColor)
        .frame(height: 80)

      ColorPickerController(selectedColor: $accentColor)
    }
  }
}
```

`UIColorPickerViewController`는 iOS 14 이상이고, 예제에서 사용한 연속 선택 delegate 메서드는 iOS 15 이상이에요. 최소 지원 버전이 iOS 14라면 deprecated된 이전 callback을 별도로 처리하거나 기능 범위를 조정해야 해요.

## 뷰와 뷰 컨트롤러 중 어느 쪽을 감쌀지 골라요

| 비교 기준   | `UIViewRepresentable`                        | `UIViewControllerRepresentable`                              |
| ----------- | -------------------------------------------- | ------------------------------------------------------------ |
| 감싸는 대상 | `UIView` 하위 클래스                         | `UIViewController` 하위 클래스                               |
| 대표 사례   | `UISlider`, `MKMapView`, 기존 사용자 정의 뷰 | 문서 선택기, 색상 선택기, 기존 화면 컨트롤러                 |
| 생성 메서드 | `makeUIView(context:)`                       | `makeUIViewController(context:)`                             |
| 갱신 메서드 | `updateUIView(_:context:)`                   | `updateUIViewController(_:context:)`                         |
| 정리 메서드 | `dismantleUIView(_:coordinator:)`            | `dismantleUIViewController(_:coordinator:)`                  |
| 선택 기준   | 기능이 뷰 하나에서 끝나요.                   | delegate, presentation, 자식 관리 등 컨트롤러 책임이 있어요. |

UIKit 타입 이름에 `ViewController`가 들어가고 자체 화면 흐름을 관리한다면 컨트롤러 representable부터 검토하세요. 단순히 컨트롤러의 `view`만 꺼내 `UIViewRepresentable`로 감싸면 원래 컨트롤러 생명주기를 잃을 수 있어요.

## 크기는 SwiftUI의 제안을 존중해요

Representable 안의 UIKit 객체는 SwiftUI 레이아웃에 참여해요. Apple은 SwiftUI가 representable 대상의 `center`, `bounds`, `frame`, `transform`을 제어하므로 직접 바꾸면 정의되지 않은 동작이 생길 수 있다고 경고해요.

기본 intrinsic content size로 충분하지 않다면 iOS 16 이상에서 `sizeThatFits`를 구현할 수 있어요.

```swift
@available(iOS 16.0, *)
func sizeThatFits(
  _ proposal: ProposedViewSize,
  uiView slider: UISlider,
  context: Context
) -> CGSize? {
  CGSize(
    width: proposal.width ?? 240,
    height: slider.intrinsicContentSize.height
  )
}
```

이 메서드는 SwiftUI가 제안한 크기를 보고 UIKit 뷰가 선호하는 크기를 반환해요. 고정 `frame`을 직접 대입하는 것과 달리 레이아웃 협상에 참여하는 방식이에요. 특별한 측정 규칙이 없다면 기본 구현에 맡기세요.

## `Context`에는 현재 환경과 transaction이 들어 있어요

`Context`는 직접 만드는 값이 아니에요. SwiftUI가 현재 갱신에 필요한 정보를 넣어 전달해요.

| 값                    | 사용할 때                                                                             |
| --------------------- | ------------------------------------------------------------------------------------- |
| `context.coordinator` | UIKit delegate와 target-action을 SwiftUI 상태에 연결할 때                             |
| `context.environment` | color scheme, size category처럼 UIKit 뷰 구성에 반영할 현재 SwiftUI 환경 값을 읽을 때 |
| `context.transaction` | 이번 갱신에 애니메이션이 포함됐는지 확인하거나 iOS 18의 통합 애니메이션을 적용할 때   |

예를 들어 UIKit 라벨이 SwiftUI의 Dynamic Type 크기를 따라야 한다면 `updateUIView`에서 `context.environment.dynamicTypeSize`를 읽고 적절한 폰트를 선택할 수 있어요. 다만 UIKit이 이미 trait으로 같은 시스템 값을 전달받는다면 중복 변환을 만들 필요는 없어요.

## 언제 Representable을 사용해야 하나요

다음 조건에서는 좋은 경계가 될 수 있어요.

- SwiftUI에 없는 시스템 컨트롤이나 기존 UIKit 컴포넌트를 재사용해요.
- UIKit SDK가 제공하는 delegate 기반 기능을 그대로 활용해야 해요.
- UIKit 대상과 SwiftUI 상태 사이의 입력·출력을 좁은 API로 정의할 수 있어요.
- 장기적으로 UIKit 구현을 교체하더라도 바깥 SwiftUI 화면은 유지하고 싶어요.

다음 경우에는 먼저 순수 SwiftUI 구현을 검토하세요.

- SwiftUI 기본 컨트롤이 같은 사용자 경험과 접근성을 이미 제공해요.
- Representable이 많은 상태 복제와 수동 레이아웃을 요구해요.
- UIKit 객체의 내부 동작에 지나치게 의존해 어댑터가 화면 전체를 대신하게 돼요.

## 적용 순서를 정리해요

1. 재사용 대상이 `UIView`인지 `UIViewController`인지 확인하세요.
2. SwiftUI가 소유할 단일 상태를 `State`, 관찰 모델, 상위 binding 중 하나로 정하세요.
3. `make`에는 생성과 한 번만 필요한 연결을 넣으세요.
4. `update`에는 최신 입력 반영만 넣고 같은 값이면 건너뛰세요.
5. UIKit 이벤트는 Coordinator를 거쳐 binding이나 명시적인 클로저로 돌려보내세요.
6. delegate, observer, 타이머, 비동기 작업은 `dismantle`에서 정리하세요.
7. 상태 변경, 화면 제거, 재표시, 회전과 Dynamic Type을 확인하세요.

## 면접에서 이어질 수 있는 질문

### `makeUIView`와 `updateUIView`의 역할은 어떻게 다른가요?

`makeUIView`는 UIKit 뷰를 만들고 한 번만 필요한 target이나 delegate 연결을 설정해요. `updateUIView`는 SwiftUI의 현재 상태와 환경을 이미 존재하는 UIKit 뷰에 반복해서 반영하므로 멱등하게 작성해야 해요.

### Coordinator가 필요한 이유는 무엇인가요?

Representable은 다시 만들어질 수 있는 값 타입이지만 UIKit delegate와 target-action은 오래 살아 있는 참조 객체를 필요로 해요. Coordinator가 UIKit 이벤트를 받고 최신 `Binding`이나 클로저로 전달해 두 생명주기를 연결해요.

### `updateUIView`에서 왜 현재 값과 새 값을 비교하나요?

SwiftUI는 여러 원인으로 update를 호출할 수 있고, UIKit 속성 변경이 다시 이벤트를 발생시킬 수도 있기 때문이에요. 값이 실제로 다를 때만 UIKit 객체를 바꾸면 불필요한 작업과 피드백 루프를 줄일 수 있어요.

### `dismantle` 메서드는 언제 필요한가요?

대상이 SwiftUI 계층에서 제거되기 전에 delegate, observer, 타이머, 비동기 작업처럼 어댑터가 만든 외부 연결을 정리할 때 필요해요. 기본 구현이 있으므로 정리할 것이 없다면 생략할 수 있어요.

## 참고 자료

- [UIViewRepresentable](https://developer.apple.com/documentation/swiftui/uiviewrepresentable)
- [UIViewRepresentableContext](https://developer.apple.com/documentation/swiftui/uiviewrepresentablecontext)
- [UIViewControllerRepresentable](https://developer.apple.com/documentation/swiftui/uiviewcontrollerrepresentable)
- [UIViewControllerRepresentableContext](https://developer.apple.com/documentation/swiftui/uiviewcontrollerrepresentablecontext)
- [UIColorPickerViewController](https://developer.apple.com/documentation/uikit/uicolorpickerviewcontroller)
- [Managing user interface state](https://developer.apple.com/documentation/swiftui/managing-user-interface-state)
