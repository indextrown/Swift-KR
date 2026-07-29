---
title: UIKit에 SwiftUI 넣기
description: UIHostingController의 화면 표시와 자식 containment, 공유 모델의 데이터 전달, UIHostingConfiguration 셀 구성과 크기 협상을 단계별로 설명합니다.
---

# UIKit에 SwiftUI 넣기

> **면접 답변 한 줄 요약:** UIKit에 SwiftUI를 넣을 때는 화면 단위면 `UIHostingController`, 목록 셀 내용이면 `UIHostingConfiguration`을 사용하고, UIKit이 컨테이너 생명주기를 소유하되 두 화면은 같은 상태 모델을 관찰하게 만들어요.

UIKit으로 만든 독서 목표 앱에 SwiftUI 진행률 카드를 추가해 볼게요. 기존 `UINavigationController`, 화면 전환, 분석 로직은 유지하고 카드부터 SwiftUI로 바꾸는 상황이에요.

이 문서에서는 다음 순서로 구현해요.

1. SwiftUI 화면과 상태 모델을 만들어요.
2. 전체 화면으로 present해 가장 작은 통합을 확인해요.
3. 기존 UIKit 화면 일부에 자식 뷰 컨트롤러로 넣어요.
4. UIKit과 SwiftUI가 같은 모델을 공유하게 해요.
5. Collection View 셀은 `UIHostingConfiguration`으로 구성해요.
6. 콘텐츠 크기와 메모리 소유 관계를 점검해요.

## 먼저 알아둘 UIKit 용어

| 용어                     | 쉬운 뜻                                                                                                                                   |
| ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `UIHostingController`    | SwiftUI 뷰 계층을 관리하는 UIKit 뷰 컨트롤러예요. 일반 `UIViewController`처럼 present, push, 자식 추가를 할 수 있어요.                    |
| root view                | hosting controller가 관리하는 SwiftUI 계층의 시작 `View`예요. 생성할 때 전달하고 `rootView` 프로퍼티로 교체할 수 있어요.                  |
| containment              | 부모 뷰 컨트롤러가 자식 뷰 컨트롤러를 `addChild`, `didMove` 순서로 등록하고 함께 생명주기를 관리하는 규칙이에요.                          |
| Auto Layout              | 제약 조건으로 UIKit 뷰의 위치와 크기 관계를 계산하는 시스템이에요. 자식 hosting controller의 뷰도 기존 UIKit 뷰처럼 제약 조건을 연결해요. |
| `UIHostingConfiguration` | SwiftUI 뷰 계층을 `UITableViewCell`이나 `UICollectionViewCell`의 content configuration으로 사용하는 iOS 16 이상의 값 타입이에요.          |
| `preferredContentSize`   | popover나 사용자 정의 컨테이너가 자식 뷰 컨트롤러의 이상적인 크기를 물을 때 사용하는 UIKit 크기예요.                                      |
| intrinsic content size   | 제약 조건이 너비나 높이를 모두 지정하지 않았을 때 뷰가 본래 필요하다고 알리는 크기예요.                                                   |

## UIKit 코드만으로 카드를 만들면 상태 표현이 흩어질 수 있어요

독서 시간과 목표가 바뀔 때 UIKit 카드의 여러 뷰를 직접 갱신한다고 가정해 볼게요.

```swift
final class ReadingCardView: UIView {
  private let minutesLabel = UILabel()
  private let progressView = UIProgressView()

  func update(completedMinutes: Int, targetMinutes: Int) {
    minutesLabel.text = "\(completedMinutes) / \(targetMinutes)분"
    progressView.progress =
      Float(completedMinutes) / Float(max(targetMinutes, 1))
  }
}
```

이 코드가 잘못된 것은 아니에요. 하지만 카드의 조건부 문구, 색상, 접근성 값이 늘어날수록 “현재 상태라면 어떻게 보여야 하는가”가 여러 명령으로 흩어져요. 전체 화면을 다시 만들기보다 이 카드만 SwiftUI의 선언형 표현으로 바꿔 볼 수 있어요.

## 공유할 상태와 SwiftUI 화면을 만들어요

먼저 두 프레임워크가 함께 사용할 모델을 만들어요. `ObservableObject`는 변경된 `@Published` 프로퍼티를 SwiftUI가 관찰할 수 있게 해요.

```swift
import Combine
import SwiftUI

@MainActor
final class ReadingGoalStore: ObservableObject {
  @Published var completedMinutes: Int
  @Published var targetMinutes: Int

  init(completedMinutes: Int, targetMinutes: Int) {
    self.completedMinutes = completedMinutes
    self.targetMinutes = targetMinutes
  }
}
```

SwiftUI 카드는 모델을 만들지 않고 외부에서 받아 관찰해요.

```swift
struct ReadingProgressView: View {
  @ObservedObject var store: ReadingGoalStore
  var onEdit: () -> Void = {}

  private var progress: Double {
    Double(store.completedMinutes) /
      Double(max(store.targetMinutes, 1))
  }

  var body: some View {
    VStack(alignment: .leading, spacing: 12) {
      Text("오늘의 독서")
        .font(.headline)

      ProgressView(value: min(progress, 1))

      Text("\(store.completedMinutes) / \(store.targetMinutes)분")
        .foregroundStyle(.secondary)

      Button("목표 수정", action: onEdit)
    }
    .padding()
  }
}
```

이 예제의 `ProgressView`는 iOS 14 이상, `foregroundStyle`은 iOS 15 이상에서 사용할 수 있어요. `UIHostingController` 자체는 iOS 13부터 지원하므로 iOS 13을 지원해야 한다면 진행 막대를 직접 그리고 `foregroundColor`를 사용하는 뷰로 바꿀 수 있어요.

`ReadingProgressView`는 UIKit을 몰라요. 모델을 표시하고 버튼 이벤트를 클로저로 내보낼 뿐이에요. 이 분리는 같은 SwiftUI 뷰를 preview, hosting controller, 다른 SwiftUI 화면에서 재사용하기 쉽게 만들어요.

## 전체 화면은 `UIHostingController`로 표시해요

가장 작은 확인 방법은 일반 UIKit 뷰 컨트롤러처럼 present하는 거예요.

```swift
@MainActor
func presentProgress(
  from presenter: UIViewController,
  store: ReadingGoalStore
) {
  let progressView = ReadingProgressView(store: store)
  let hostingController = UIHostingController(rootView: progressView)

  presenter.present(hostingController, animated: true)
}
```

`UIHostingController`는 `UIViewController`의 하위 클래스예요. 따라서 `present`, `navigationController?.pushViewController`, sheet 설정처럼 기존 UIKit 화면 전환을 그대로 사용할 수 있어요. Apple의 [UIHostingController](https://developer.apple.com/documentation/swiftui/uihostingcontroller) 문서도 생성 시 root view를 전달하고 일반 뷰 컨트롤러처럼 표시하거나 자식으로 넣으라고 설명해요.

이 단계에서 소유 관계는 단순해요.

```text
presenting UIViewController
└─ UIHostingController
   └─ ReadingProgressView
      └─ ReadingGoalStore를 관찰
```

## 화면 일부에는 자식 뷰 컨트롤러로 넣어요

기존 대시보드의 상단 카드만 바꾸려면 hosting controller를 자식으로 추가해야 해요.

```swift
import SwiftUI
import UIKit

@MainActor
final class ReadingDashboardViewController: UIViewController {
  private let store: ReadingGoalStore
  private let hostingController: UIHostingController<ReadingProgressView>

  init(store: ReadingGoalStore) {
    self.store = store
    self.hostingController = UIHostingController(
      rootView: ReadingProgressView(store: store)
    )
    super.init(nibName: nil, bundle: nil)
  }

  @available(*, unavailable)
  required init?(coder: NSCoder) {
    fatalError("init(coder:)는 지원하지 않아요.")
  }

  override func viewDidLoad() {
    super.viewDidLoad()

    let hostedView = hostingController.view!
    hostedView.translatesAutoresizingMaskIntoConstraints = false

    addChild(hostingController)
    view.addSubview(hostedView)

    NSLayoutConstraint.activate([
      hostedView.topAnchor.constraint(
        equalTo: view.safeAreaLayoutGuide.topAnchor
      ),
      hostedView.leadingAnchor.constraint(equalTo: view.leadingAnchor),
      hostedView.trailingAnchor.constraint(equalTo: view.trailingAnchor),
    ])

    hostingController.didMove(toParent: self)
  }
}
```

순서에는 의미가 있어요.

1. `addChild(_:)`로 부모가 자식을 관리하기 시작한다고 알려요.
2. 자식의 `view`를 실제 UIKit 뷰 계층에 추가해요.
3. Auto Layout 제약으로 바깥 UIKit 화면이 크기를 제안해요.
4. `didMove(toParent:)`로 이동이 끝났다고 알려요.

뷰만 `addSubview`하면 화면은 보일 수 있지만 뷰 컨트롤러 containment가 빠져요. 회전, appearance callback, trait 전달처럼 컨트롤러 계층을 따르는 동작이 예상과 달라질 수 있어요.

자식을 명시적으로 제거할 때는 반대 순서를 사용해요.

```swift
func removeProgressCard() {
  hostingController.willMove(toParent: nil)
  hostingController.view.removeFromSuperview()
  hostingController.removeFromParent()
}
```

부모가 사라질 때 자식도 함께 사라지는 일반적인 구조라면 UIKit이 containment를 따라 정리해요. 화면 중간에 카드만 제거하는 경우에는 위 절차를 직접 수행하세요.

## UIKit과 SwiftUI는 같은 모델을 변경해요

`ReadingDashboardViewController`와 `ReadingProgressView`가 같은 `ReadingGoalStore` 인스턴스를 들고 있으므로 상태를 복사할 필요가 없어요.

```swift
extension ReadingDashboardViewController {
  @objc
  func addFiveMinutes() {
    store.completedMinutes += 5
  }
}
```

UIKit 버튼이 `addFiveMinutes()`를 호출하면 `@Published`가 변경을 알리고 SwiftUI 카드가 다시 계산돼요. 반대로 SwiftUI 버튼이 UIKit 화면 전환을 요청해야 하면 root view에 클로저를 전달해요.

```swift
hostingController.rootView = ReadingProgressView(
  store: store,
  onEdit: { [weak self] in
    self?.presentGoalEditor()
  }
)
```

hosting controller가 root view를 소유하고, root view의 클로저가 다시 UIKit 뷰 컨트롤러를 강하게 잡으면 순환 참조가 생길 수 있어요. UIKit 객체를 캡처할 때는 실제 소유 관계를 확인하고, 화면에 대한 역참조라면 보통 `[weak self]`를 사용해요.

### `rootView` 교체와 관찰 모델 중 하나를 상태 경로로 골라요

작은 읽기 전용 값은 새 root view를 대입해 갱신할 수도 있어요.

```swift
struct CompactProgressView: View {
  let completedMinutes: Int

  var body: some View {
    Text("\(completedMinutes)분 읽었어요")
  }
}

func updateProgress(to minutes: Int) {
  compactHostingController.rootView = CompactProgressView(
    completedMinutes: minutes
  )
}
```

이 방식은 입력이 작고 UIKit이 상태를 완전히 소유할 때 명확해요. 하지만 여러 값이 자주 변하거나 SwiftUI에서도 편집한다면 공유 관찰 모델이 더 자연스러워요.

| 갱신 방식               | 적합한 상황                                          | 주의할 점                                          |
| ----------------------- | ---------------------------------------------------- | -------------------------------------------------- |
| `rootView`에 새 값 대입 | 작은 읽기 전용 입력, UIKit 단방향 갱신               | 모든 변경 지점에서 root view를 다시 만들어야 해요. |
| 같은 관찰 모델 공유     | 여러 값이 변하고 양쪽 화면이 같은 상태를 읽거나 변경 | 모델의 소유자와 생존 범위를 분명히 해야 해요.      |

두 방식을 같은 상태에 동시에 사용하면 어떤 경로가 기준인지 흐려져요. 한 상태에는 한 갱신 경로를 정하세요.

## 목록 셀은 `UIHostingConfiguration`으로 구성해요

iOS 16 이상에서는 셀 하나마다 hosting controller를 직접 관리하지 않아도 돼요. `UIHostingConfiguration`은 `UIContentConfiguration`을 따르므로 Collection View와 Table View 셀의 `contentConfiguration`에 바로 대입할 수 있어요.

```swift
struct Book: Hashable {
  let id: UUID
  let title: String
  let isFinished: Bool
}

struct BookRowView: View {
  let book: Book

  var body: some View {
    HStack {
      Image(systemName: book.isFinished ? "checkmark.circle.fill" : "book")
        .foregroundStyle(book.isFinished ? .green : .secondary)

      Text(book.title)

      Spacer()
    }
  }
}
```

cell registration에서 현재 모델을 SwiftUI 뷰에 전달해요.

```swift
@available(iOS 16.0, *)
let bookRegistration = UICollectionView.CellRegistration<
  UICollectionViewListCell,
  Book
> { cell, _, book in
  cell.contentConfiguration = UIHostingConfiguration {
    BookRowView(book: book)
  }
  .margins(.all, 12)
}
```

Apple의 [UIHostingConfiguration](https://developer.apple.com/documentation/swiftui/uihostingconfiguration) 문서는 Collection View 또는 Table View 셀 안에 SwiftUI 계층을 넣는 용도로 이 타입을 제공해요. SwiftUI `background`와 `margins`도 configuration에 연결할 수 있어요.

셀의 선택 상태처럼 UIKit이 소유한 값을 SwiftUI 내용에 반영하려면 `configurationUpdateHandler`에서 새 configuration을 만들 수 있어요.

```swift
@available(iOS 16.0, *)
func configure(_ cell: UICollectionViewListCell, with book: Book) {
  cell.configurationUpdateHandler = { cell, state in
    cell.contentConfiguration = UIHostingConfiguration {
      HStack {
        BookRowView(book: book)

        if state.isSelected {
          Image(systemName: "checkmark")
        }
      }
    }
    .margins(.all, 12)
  }
}
```

`UIHostingConfiguration`은 화면 전체의 내비게이션이나 자식 컨트롤러 생명주기를 대신하는 API가 아니에요. 반복되는 셀의 **내용 구성**에 맞춘 선택이에요.

## SwiftUI 콘텐츠의 크기를 UIKit에 전달해요

전체 화면을 네 모서리에 고정하면 바깥 Auto Layout 제약이 크기를 결정하므로 추가 설정이 필요하지 않은 경우가 많아요. 하지만 popover나 자체 크기를 가진 자식 뷰처럼 콘텐츠의 이상적인 크기가 바깥 컨테이너에 필요할 때는 iOS 16 이상의 `sizingOptions`를 사용해요.

```swift
let hostingController = UIHostingController(
  rootView: ReadingProgressView(store: store)
)

if #available(iOS 16.0, *) {
  hostingController.sizingOptions = .preferredContentSize
}

hostingController.modalPresentationStyle = .popover
present(hostingController, animated: true)
```

| 옵션                    | UIKit에 전달하는 변화                                                                    | 주로 쓰는 위치                               |
| ----------------------- | ---------------------------------------------------------------------------------------- | -------------------------------------------- |
| `.preferredContentSize` | SwiftUI 콘텐츠의 이상적인 크기를 hosting controller의 `preferredContentSize`에 반영해요. | popover, 사용자 정의 컨테이너                |
| `.intrinsicContentSize` | 콘텐츠 크기가 변할 때 hosting view의 intrinsic content size를 무효화해요.                | Auto Layout 안의 자체 크기 뷰                |
| 빈 집합                 | 자동 크기 추적을 하지 않아요. 기본값이에요.                                              | 바깥 제약이 크기를 완전히 결정하는 일반 화면 |

Apple은 `.preferredContentSize`가 지정되지 않은 크기 제안으로 이상적인 크기를 측정하므로 성능 비용이 있다고 안내해요. 컨테이너가 실제로 콘텐츠 크기를 알아야 할 때만 켜세요.

## 화면 단위와 셀 단위를 구분해요

| 비교 기준             | `UIHostingController`                        | `UIHostingConfiguration`                        |
| --------------------- | -------------------------------------------- | ----------------------------------------------- |
| 도입 버전             | iOS 13                                       | iOS 16                                          |
| UIKit에서 보이는 형태 | `UIViewController`                           | `UIContentConfiguration`                        |
| 적합한 범위           | 전체 화면, sheet, 화면 일부의 자식 컨트롤러  | Collection View와 Table View 셀의 내용          |
| 내비게이션·생명주기   | UIKit 뷰 컨트롤러 규칙을 직접 따름           | 셀과 content view가 관리                        |
| 크기 처리             | Auto Layout, `sizingOptions`, `sizeThatFits` | 셀의 self-sizing과 configuration margins를 활용 |

## 흔한 실수를 점검해요

- 자식 hosting controller의 `view`만 추가하고 `addChild`와 `didMove`를 생략하지 않았나요?
- UIKit 상태와 SwiftUI 상태에 같은 값을 중복 저장하지 않았나요?
- `rootView` 교체와 관찰 모델 갱신을 같은 상태에 섞지 않았나요?
- root view의 클로저가 UIKit 컨트롤러를 강하게 잡아 순환 참조를 만들지 않나요?
- 고정된 전체 화면에도 불필요하게 크기 추적 옵션을 켜지 않았나요?
- iOS 16 미만에서 `UIHostingConfiguration`을 호출하지 않도록 availability를 확인했나요?

## 적용 순서를 정리해요

1. 화면 전체, 화면 일부, 셀 중 SwiftUI로 옮길 가장 작은 경계를 고르세요.
2. UIKit이 소유할 상태와 공유 모델이 소유할 상태를 구분하세요.
3. SwiftUI 뷰가 UIKit 타입을 직접 알지 않도록 입력과 이벤트 클로저를 설계하세요.
4. 화면은 `UIHostingController`, 셀은 지원 버전을 확인한 뒤 `UIHostingConfiguration`으로 감싸세요.
5. 자식 컨트롤러에는 containment와 Auto Layout 순서를 적용하세요.
6. 상태 변경, 회전, Dynamic Type, dismiss 뒤 메모리 해제를 확인하세요.

## 면접에서 이어질 수 있는 질문

### `UIHostingController`를 화면 일부에 넣을 때 왜 containment가 필요한가요?

`UIHostingController`는 단순한 `UIView`가 아니라 뷰 컨트롤러예요. 부모-자식 관계를 등록해야 appearance callback, 회전, trait과 같은 UIKit 뷰 컨트롤러 생명주기가 계층에 맞게 전달돼요.

### UIKit의 값이 바뀔 때 SwiftUI는 어떻게 갱신하나요?

작은 불변 입력이면 새 SwiftUI 값을 만들어 `rootView`에 대입할 수 있어요. 여러 값이 자주 바뀌면 UIKit과 SwiftUI에 같은 `ObservableObject` 인스턴스를 전달하고, UIKit이 모델을 변경하면 SwiftUI가 관찰하도록 만드는 편이 명확해요.

### `UIHostingConfiguration`은 언제 `UIHostingController`보다 적합한가요?

Collection View나 Table View 셀의 내용만 SwiftUI로 구성할 때 적합해요. 셀 재사용과 상태 갱신은 기존 UIKit 목록이 맡고, SwiftUI는 셀 내부 표현을 선언해요.

### `sizingOptions`를 항상 설정해야 하나요?

아니요. 바깥 Auto Layout이 크기를 완전히 정하는 화면에는 필요하지 않을 수 있어요. popover나 self-sizing 컨테이너처럼 SwiftUI 콘텐츠의 이상적인 크기를 UIKit이 알아야 할 때만 선택하세요.

## 참고 자료

- [UIHostingController](https://developer.apple.com/documentation/swiftui/uihostingcontroller)
- [UIHostingControllerSizingOptions](https://developer.apple.com/documentation/swiftui/uihostingcontrollersizingoptions)
- [UIHostingConfiguration](https://developer.apple.com/documentation/swiftui/uihostingconfiguration)
- [Use SwiftUI with UIKit](https://developer.apple.com/videos/play/wwdc2022/10072/)
- [UIViewController containment](https://developer.apple.com/documentation/uikit/uiviewcontroller)
