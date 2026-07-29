---
title: 통합 화면의 상태·레이아웃·생명주기
description: SwiftUI와 UIKit 통합 경계에서 단일 데이터 원천을 유지하고 반복 update, 피드백 루프, 크기 충돌, containment와 메모리 누수를 예방하는 기준을 설명합니다.
---

# 통합 화면의 상태·레이아웃·생명주기

> **면접 답변 한 줄 요약:** SwiftUI와 UIKit 통합 경계에서는 상태 원본과 레이아웃 소유자를 하나씩 정하고, `make`는 생성, `update`는 반복 가능한 동기화, `dismantle`은 외부 연결 정리에만 사용해야 갱신 루프와 생명주기 오류를 피할 수 있어요.

`UIHostingController`나 Representable로 화면을 표시하는 것까지는 어렵지 않아요. 실전 문제는 그다음에 생겨요.

- UIKit과 SwiftUI 중 어느 값이 최신인지 알 수 없어요.
- `updateUIView`가 예상보다 자주 호출돼 네트워크 요청이 반복돼요.
- slider나 text field 이벤트가 다시 update를 불러 피드백 루프가 생겨요.
- SwiftUI와 UIKit이 모두 `frame`을 바꾸면서 레이아웃이 흔들려요.
- 화면을 닫았는데 hosting controller나 Coordinator가 해제되지 않아요.

이 문서는 API 사용법보다 **경계의 책임을 설계하고 점검하는 방법**에 집중해요.

## 먼저 알아둘 상태와 생명주기 용어

| 용어             | 쉬운 뜻                                                                                                                                    |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| 상태(state)      | 현재 화면 결과를 결정하는 값이에요. 독서 완료 시간, 선택한 색, 로딩 여부가 예예요.                                                         |
| 단일 데이터 원천 | 같은 의미의 값을 한 곳에서만 원본으로 저장하고 다른 화면은 읽거나 변경 요청만 보내는 원칙이에요.                                           |
| 입력(input)      | 바깥 프레임워크에서 통합 경계 안으로 들어오는 값이에요. `Binding`, 관찰 모델, environment가 예예요.                                        |
| 출력(output)     | UIKit 사용자 이벤트가 SwiftUI로 나가는 통로예요. Coordinator가 호출하는 binding 쓰기나 클로저가 예예요.                                    |
| 피드백 루프      | 입력을 UIKit에 반영한 일이 새 출력 이벤트를 만들고, 그 출력이 다시 같은 입력 갱신을 끝없이 일으키는 흐름이에요.                            |
| identity         | SwiftUI가 이전 요소와 새 요소를 같은 화면 요소로 볼지 판단하는 정체성이에요. 정체성이 바뀌면 기존 UIKit 객체를 버리고 새로 만들 수 있어요. |
| layout proposal  | 부모가 자식에게 “이 범위 안에서 크기를 정해 보세요”라고 제안하는 값이에요. SwiftUI와 UIKit은 브리지에서 이 제안과 선호 크기를 주고받아요.  |
| 생명주기 메서드  | Representable의 `make`는 UIKit 객체 생성, `update`는 최신 상태 반영, `dismantle`은 외부 연결 정리를 맡아요.                                |
| retain cycle     | 객체들이 서로를 강하게 참조해 화면에서 제거된 뒤에도 메모리에서 해제되지 않는 소유 관계예요.                                               |
| MainActor        | UI 상태와 화면 변경을 메인 실행 영역에 격리하는 Swift 동시성 규칙이에요. UIKit과 SwiftUI 화면 작업은 메인 actor에서 수행해야 해요.         |

## 같은 상태를 양쪽에 복사하면 기준이 두 개가 돼요

UIKit 화면이 `completedMinutes`를 저장하고 SwiftUI 카드도 별도 `@State`에 같은 값을 저장한다고 가정할게요.

```swift
final class ReadingViewController: UIViewController {
  var completedMinutes = 20
}

struct ReadingProgressView: View {
  @State private var completedMinutes = 20

  var body: some View {
    Text("\(completedMinutes)분")
  }
}
```

처음에는 값이 같아요. 하지만 UIKit 버튼이 한쪽 값만 바꾸거나 SwiftUI가 자체 상태를 변경하면 두 화면이 다른 값을 표시해요. 동기화 코드를 더 추가할수록 “어느 변경이 원본인가요?”라는 문제가 커져요.

원본을 하나로 모으세요.

```swift
import Combine

@MainActor
final class ReadingGoalStore: ObservableObject {
  @Published var completedMinutes = 20
  @Published var targetMinutes = 30

  func addSession(minutes: Int) {
    completedMinutes += minutes
  }
}
```

UIKit과 SwiftUI는 같은 인스턴스를 전달받아요.

```text
UIKit 버튼 ── 변경 요청 ──> ReadingGoalStore <── 관찰 ── SwiftUI View
UIKit 라벨 <──── 읽기 ───── ReadingGoalStore ─── 알림 ──> SwiftUI 갱신
```

`ReadingGoalStore`는 UIKit이나 SwiftUI 화면을 소유하지 않아요. 도메인 상태와 변경 동작만 제공해 두 화면 기술이 같은 값을 사용할 수 있게 해요.

## 경계를 지나는 네 가지 흐름을 구분해요

| 흐름                        | 권장 통로                                  | 예시                                                       |
| --------------------------- | ------------------------------------------ | ---------------------------------------------------------- |
| UIKit 상태 → SwiftUI 표시   | 공유 관찰 모델 또는 새 `rootView` 입력     | UIKit이 독서 시간을 바꾸면 SwiftUI 진행률 카드가 갱신돼요. |
| SwiftUI 이벤트 → UIKit 동작 | 명시적인 클로저                            | SwiftUI 버튼이 UIKit 편집 화면 present를 요청해요.         |
| SwiftUI 상태 → UIKit 표시   | Representable의 프로퍼티와 `update`        | `@State` 목표 시간이 `UISlider.value`에 반영돼요.          |
| UIKit 이벤트 → SwiftUI 상태 | Coordinator → `Binding` 또는 이벤트 클로저 | slider의 `.valueChanged`가 SwiftUI의 목표 시간을 바꿔요.   |

한 경계에서 입력과 출력을 이름으로 구분하면 순환 흐름을 찾기 쉬워요. 예를 들어 `value`와 `onValueChanged`처럼 읽는 값과 발생한 사건을 따로 표현하세요.

## `make`, `update`, `dismantle`의 책임을 섞지 않아요

Representable의 생명주기를 다음처럼 생각할 수 있어요.

| 단계        | 해야 할 일                                               | 피해야 할 일                                              |
| ----------- | -------------------------------------------------------- | --------------------------------------------------------- |
| `make`      | UIKit 객체 생성, 고정 설정, target·delegate 연결         | 현재 입력이 영원히 유지된다고 가정하기                    |
| `update`    | 최신 입력과 environment를 기존 객체에 반영               | 네트워크 요청 시작, observer 중복 등록, 자식 뷰 계속 추가 |
| `dismantle` | delegate·observer 해제, 타이머·Task 취소, 외부 자원 정리 | 앱의 원본 도메인 상태 삭제                                |

`update`는 렌더링 callback처럼 생각하세요. 호출 횟수는 앱 로직의 사건 횟수와 같지 않아요. 부모가 다시 계산되거나 environment가 바뀌어도 호출될 수 있어요.

### 비동기 작업을 `update`에서 바로 시작하지 않아요

다음 코드는 update 횟수만큼 이미지 요청을 시작할 수 있어요.

```swift
func updateUIView(_ imageView: UIImageView, context: Context) {
  Task {
    imageView.image = await imageLoader.load(url)
  }
}
```

이미지 로딩은 화면 모델이나 별도 로더가 URL identity와 취소를 관리하게 하고, update는 준비된 결과를 반영하는 편이 안전해요. 어댑터 안에서 작업해야 한다면 Coordinator가 현재 요청의 identity와 `Task`를 보관하고, URL이 실제로 바뀔 때만 이전 작업을 취소한 뒤 시작하세요.

```swift
final class Coordinator {
  var loadingURL: URL?
  var task: Task<Void, Never>?

  func cancel() {
    task?.cancel()
    task = nil
    loadingURL = nil
  }

  deinit {
    task?.cancel()
  }
}
```

그리고 `dismantleUIView`에서 명시적으로 취소해요.

```swift
static func dismantleUIView(
  _ imageView: UIImageView,
  coordinator: Coordinator
) {
  coordinator.cancel()
}
```

## 입력 반영과 사용자 이벤트를 구분해 피드백 루프를 막아요

text field를 예로 들어 볼게요.

1. SwiftUI의 `text`가 바뀌어 `updateUIView`가 호출돼요.
2. update가 `textField.text`를 설정해요.
3. UIKit이 편집 이벤트를 알리고 Coordinator가 같은 값을 binding에 기록해요.
4. SwiftUI 상태가 다시 바뀌었다고 판단하면 update가 반복돼요.

가장 기본적인 방어는 실제 차이가 있을 때만 속성을 바꾸는 거예요.

```swift
func updateUIView(_ textField: UITextField, context: Context) {
  context.coordinator.text = $text

  guard textField.text != text else {
    return
  }

  textField.text = text
}
```

복잡한 컨트롤에서는 입력 반영 중인지 나타내는 플래그가 필요할 수도 있어요. 하지만 먼저 다음 순서로 단순화하세요.

1. 같은 값 쓰기를 건너뛰어요.
2. 프로그램 변경과 사용자 사건을 구분할 수 있는 UIKit API를 사용해요.
3. 이벤트를 연속 값과 완료 값으로 나눌 필요가 있는지 확인해요.
4. 마지막 수단으로 Coordinator에 재진입 방지 상태를 둬요.

모든 callback을 막는 플래그는 실제 사용자 이벤트까지 잃게 할 수 있어요. 어떤 사건을 차단하는지 좁게 정의하세요.

## SwiftUI identity가 바뀌면 UIKit 객체도 새로 만들어질 수 있어요

Representable 값이 다시 만들어졌다고 해서 `makeUIView`가 매번 호출되는 것은 아니에요. SwiftUI가 같은 identity라고 판단하면 기존 UIKit 객체를 유지하고 `updateUIView`를 호출해요.

반대로 `.id(...)` 값이 바뀌거나 조건 분기에서 다른 뷰로 교체되면 기존 객체를 정리하고 새 객체를 만들 수 있어요.

```swift
MinutesSlider(minutes: $targetMinutes)
  .id(selectedGoalID)
```

이 코드는 `selectedGoalID`가 바뀔 때 slider identity도 바꿔요. 목표가 바뀔 때 UIKit 내부 상태까지 초기화하려는 의도라면 맞지만, 단지 update를 강제로 호출하려고 `.id`를 계속 바꾸면 focus, 스크롤 위치, delegate 상태를 불필요하게 잃어요.

### 생성 횟수에 의존하는 로직을 넣지 않아요

- `make`가 정확히 한 번 실행된다고 가정하지 마세요.
- `update`가 특정 횟수만 실행된다고 가정하지 마세요.
- 사용자 입력처럼 비즈니스 의미가 있는 사건은 Coordinator나 모델의 명시적인 메서드로 다루세요.
- 객체 재생성이 기능을 깨뜨리지 않도록 외부 자원을 정리하세요.

## 레이아웃 소유자는 바깥 프레임워크예요

통합 방향에 따라 크기를 주도하는 쪽이 달라요.

| 바깥 화면     | 크기를 주도하는 방식                                                                                 | 안쪽 구현이 할 일                                                     |
| ------------- | ---------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| UIKit         | `UIHostingController.view`에 Auto Layout 제약을 주거나 컨테이너가 `preferredContentSize`를 사용해요. | SwiftUI root view는 제안된 공간에서 layout을 구성해요.                |
| SwiftUI       | SwiftUI layout이 Representable에 크기를 제안하고 최종 frame을 정해요.                                | UIKit 객체는 intrinsic size 또는 `sizeThatFits`로 선호 크기를 알려요. |
| UIKit 목록 셀 | 셀의 self-sizing과 content configuration이 크기를 계산해요.                                          | `UIHostingConfiguration` 내용과 margins를 선언해요.                   |

Representable이 관리하는 UIKit 뷰의 아래 프로퍼티는 SwiftUI가 제어해요.

- `center`
- `bounds`
- `frame`
- `transform`

Apple의 `UIViewRepresentable`과 `UIViewControllerRepresentable` 문서는 이 값을 직접 설정하면 SwiftUI 레이아웃과 충돌해 정의되지 않은 동작이 생길 수 있다고 경고해요. 안쪽 UIKit 뷰의 서브뷰 제약은 UIKit 코드로 관리할 수 있지만, 바깥에서 받은 자신의 frame을 다시 정하려고 하면 안 돼요.

## 크기 협상 API는 필요한 곳에만 사용해요

| API                                          | 도입 버전 | 역할                                                                      |
| -------------------------------------------- | --------- | ------------------------------------------------------------------------- |
| `UIViewRepresentable.sizeThatFits`           | iOS 16    | SwiftUI의 제안을 보고 UIKit 뷰가 선호하는 크기를 반환해요.                |
| `UIViewControllerRepresentable.sizeThatFits` | iOS 16    | UIKit 뷰 컨트롤러 내용의 선호 크기를 SwiftUI에 알려요.                    |
| `UIHostingController.sizeThatFits(in:)`      | iOS 16    | 주어진 최대 크기 안에서 SwiftUI 콘텐츠의 적절한 크기를 계산해요.          |
| `UIHostingController.sizingOptions`          | iOS 16    | 콘텐츠 변화가 intrinsic 또는 preferred content size에 자동 반영되게 해요. |

측정은 비용이 들어요. 전체 화면처럼 부모 제약이 너비와 높이를 모두 정한다면 이상적인 크기를 반복해서 계산할 이유가 없어요. popover, self-sizing cell, 내용에 따라 높이가 달라지는 작은 container처럼 실제로 선호 크기가 필요한 곳에만 사용하세요.

## Environment와 trait을 중복 변환하지 않아요

Representable의 `context.environment`에는 SwiftUI 환경 값이 들어 있어요. UIKit 객체에 대응 값이 없다면 update에서 명시적으로 변환할 수 있어요.

```swift
func updateUIView(_ label: UILabel, context: Context) {
  label.textColor =
    context.environment.colorScheme == .dark
      ? .white
      : .black
}
```

하지만 `UIColor.label`처럼 UIKit이 자체 trait으로 이미 처리하는 시스템 값은 그 기능을 그대로 쓰는 편이 좋아요.

```swift
func makeUIView(context: Context) -> UILabel {
  let label = UILabel()
  label.textColor = .label
  return label
}
```

같은 시스템 설정을 SwiftUI environment와 UIKit trait에서 각각 읽어 수동 변환하면 두 경로가 어긋날 수 있어요. 사용자 정의 계층 값은 iOS 17 이상의 `UITraitBridgedEnvironmentKey`를 검토하고, 단순한 직접 입력은 프로퍼티로 전달하세요.

## 소유 관계를 그려 순환 참조를 찾아요

UIKit에 SwiftUI를 넣을 때 자주 생기는 순환은 다음과 같아요.

```text
ReadingViewController
└─ 강한 참조 → UIHostingController
   └─ 강한 참조 → SwiftUI root view
      └─ 강한 클로저 캡처 → ReadingViewController
```

root view의 이벤트 클로저는 화면으로 돌아가는 역참조예요. 이 경우 `[weak self]`로 순환을 끊을 수 있어요.

```swift
hostingController.rootView = ReadingProgressView(
  store: store,
  onEdit: { [weak self] in
    self?.presentGoalEditor()
  }
)
```

Representable 방향에서도 다음을 점검하세요.

- UIKit delegate 프로퍼티가 `weak`인지 확인해요.
- NotificationCenter의 selector observer와 closure observer를 등록한 위치에서 해제해요.
- `CADisplayLink`, `Timer`, KVO token, 비동기 `Task`를 Coordinator가 소유한다면 dismantle에서 정리해요.
- Coordinator가 상위 화면을 꼭 참조해야 한다면 소유 관계를 확인하고 약한 참조나 이벤트 클로저를 사용해요.

`weak`를 무조건 붙이는 것이 정답은 아니에요. 작업이 살아 있는 동안 반드시 유지해야 하는 모델까지 약하게 만들면 중간에 사라질 수 있어요. 화면으로 돌아가는 역참조인지, 어댑터가 실제로 소유해야 하는 자원인지 먼저 구분하세요.

## UI 변경은 메인 actor에서 수행해요

UIKit과 SwiftUI의 화면 객체는 메인 actor에 격리돼요. 네트워크나 디코딩은 백그라운드에서 할 수 있지만 결과를 모델과 UI에 반영하는 코드는 메인 actor로 돌아와야 해요.

```swift
Task {
  let minutes = await repository.fetchCompletedMinutes()

  await MainActor.run {
    store.completedMinutes = minutes
  }
}
```

`UIViewRepresentable`과 `UIHostingController`의 주요 API도 공식 선언에서 `MainActor`로 표시돼요. 동시성 경고를 억지로 피하기보다 데이터 작업과 화면 반영의 실행 영역을 분리하세요.

## 증상으로 경계 문제를 찾아요

| 증상                                      | 먼저 확인할 원인                                                          |
| ----------------------------------------- | ------------------------------------------------------------------------- |
| 값이 잠깐 바뀌었다가 되돌아와요.          | UIKit과 SwiftUI가 같은 상태를 따로 저장하는지 확인해요.                   |
| `makeUIView`가 계속 다시 호출돼요.        | `.id`나 조건 분기로 identity가 계속 바뀌는지 확인해요.                    |
| `updateUIView`마다 요청이 여러 번 나가요. | update에 네트워크, observer 등록, Task 생성을 넣었는지 확인해요.          |
| 입력 한 번에 callback이 여러 번 와요.     | 같은 값 설정과 target·delegate 중복 등록을 확인해요.                      |
| 크기가 흔들리거나 제약 경고가 떠요.       | 양쪽이 frame을 정하는지, sizing 옵션과 고정 제약이 충돌하는지 확인해요.   |
| 화면을 닫아도 `deinit`이 호출되지 않아요. | root view 클로저, Coordinator, observer와 Task의 강한 참조를 그려 보세요. |
| 회전이나 appearance callback이 빠져요.    | 자식 `UIHostingController` containment 절차를 지켰는지 확인해요.          |

## 테스트는 어댑터 로직과 실제 연결을 나눠요

Representable 자체는 SwiftUI가 생명주기를 호출하므로 순수 단위 테스트만으로 모든 동작을 확인하기 어려워요. 다음 세 층으로 나누면 좋아요.

1. **상태 모델 단위 테스트:** `ReadingGoalStore`의 변경 규칙을 화면 없이 검증해요.
2. **변환 로직 단위 테스트:** slider 값 반올림이나 UIKit 모델 변환을 순수 함수로 분리해 검증해요.
3. **통합·UI 테스트:** 실제 hosting/representable 화면에서 입력, 회전, dismiss, 접근성 동작을 확인해요.

예를 들어 분 단위 반올림은 어댑터 안에 숨기지 않고 함수로 분리할 수 있어요.

```swift
func roundedMinutes(from sliderValue: Float) -> Int {
  Int(sliderValue.rounded())
}
```

```swift
import Testing

@Test
func roundsSliderValueToMinutes() {
  #expect(roundedMinutes(from: 29.6) == 30)
}
```

어댑터는 이 함수를 호출하고, 단위 테스트는 SwiftUI 렌더링 없이 규칙을 빠르게 검증해요.

## 적용 순서를 정리해요

1. 통합 경계를 지나는 입력과 출력을 각각 적으세요.
2. 같은 의미의 상태를 하나의 모델, `State`, 상위 UIKit 중 한 곳에만 저장하세요.
3. `make`, `update`, `dismantle`에 들어갈 일을 표로 나누세요.
4. update에서 같은 값 쓰기, 비동기 작업 시작, observer 중복 등록을 제거하세요.
5. 바깥 프레임워크가 자신의 frame을 정하고 안쪽은 선호 크기만 알리게 하세요.
6. 강한 참조를 그림으로 그리고 화면 제거 후 `deinit`과 작업 취소를 확인하세요.
7. 모델 단위 테스트와 실제 통합 화면 테스트를 나눠 실행하세요.

## 면접에서 이어질 수 있는 질문

### 통합 화면에서 단일 데이터 원천이 중요한 이유는 무엇인가요?

UIKit과 SwiftUI가 같은 의미의 값을 각각 저장하면 갱신 순서에 따라 화면이 달라질 수 있기 때문이에요. 한쪽 모델이나 상위 상태를 원본으로 두고 다른 쪽은 입력을 반영하거나 변경 사건만 보내야 예측 가능한 단방향 흐름을 만들 수 있어요.

### `updateUIView`에서 네트워크 요청을 시작하면 안 되는 이유는 무엇인가요?

update는 비즈니스 사건이 아니라 렌더링 조건 변화에 따라 여러 번 호출될 수 있기 때문이에요. 요청이 중복되거나 순서가 뒤집힐 수 있으므로 모델이나 identity와 취소를 관리하는 별도 로더에서 작업을 시작하고 update는 결과 반영에 집중하는 편이 안전해요.

### Representable의 UIKit 뷰 frame을 직접 바꾸면 왜 안 되나요?

바깥 SwiftUI layout이 representable의 최종 frame을 소유하기 때문이에요. UIKit 객체가 같은 frame을 다시 바꾸면 두 레이아웃 시스템이 충돌하므로 intrinsic content size나 `sizeThatFits`로 선호 크기만 알려야 해요.

### 화면이 해제되지 않을 때 무엇부터 확인하나요?

hosting controller의 root view 클로저가 부모 UIKit 컨트롤러를 강하게 캡처하는지, Coordinator가 observer·timer·Task를 유지하는지부터 확인해요. 소유 그래프를 그린 뒤 역참조는 약하게 만들고, 어댑터가 만든 외부 연결은 dismantle에서 정리해요.

## 참고 자료

- [UIViewRepresentable](https://developer.apple.com/documentation/swiftui/uiviewrepresentable)
- [UIViewControllerRepresentable](https://developer.apple.com/documentation/swiftui/uiviewcontrollerrepresentable)
- [UIViewRepresentableContext](https://developer.apple.com/documentation/swiftui/uiviewrepresentablecontext)
- [UIHostingControllerSizingOptions](https://developer.apple.com/documentation/swiftui/uihostingcontrollersizingoptions)
- [Managing user interface state](https://developer.apple.com/documentation/swiftui/managing-user-interface-state)
