---
title: 'Custom UICollectionViewLayout 예제'
description: 'UICollectionViewLayout을 상속한 태그 배치 예제로 prepare·contentSize·layout attributes·bounds invalidation의 책임과 성능 최적화 기준을 단계별로 설명합니다.'
---

# Custom UICollectionViewLayout 예제

> **면접 답변 한 줄 요약:** Custom `UICollectionViewLayout`은 Collection View가 셀을 직접 배치하도록 만드는 것이 아니라, 각 item의 frame과 표시 속성을 `UICollectionViewLayoutAttributes`로 계산해 제공하는 layout 객체예요.

Flow Layout이나 Compositional Layout으로 요구사항을 표현할 수 있다면 먼저 그 방법을 선택하세요. 이 문서는 너비가 다른 태그를 왼쪽부터 배치하고 남은 공간이 부족하면 다음 줄로 넘기는 작은 custom layout을 만들어요.

## 먼저 알아둘 용어

| 용어              | 쉬운 뜻                                                                               |
| ----------------- | ------------------------------------------------------------------------------------- |
| layout attributes | Item의 frame, 중심점, alpha, z-index처럼 화면 배치에 필요한 정보를 담는 객체예요.     |
| `prepare()`       | Layout이 invalidation된 뒤 필요한 attributes와 content size를 미리 계산하는 단계예요. |
| content size      | Collection View 안에서 스크롤할 수 있는 전체 콘텐츠 너비와 높이예요.                  |
| invalidation      | 기존 배치 정보가 오래되었으니 필요한 부분을 다시 계산하라고 알리는 동작이에요.        |
| query rect        | Collection View가 현재 화면 주변에서 필요한 attributes를 요청하는 사각형 영역이에요.  |

## Layout이 필요한 너비를 Delegate로 받아요

```swift
protocol TagCloudLayoutDelegate: AnyObject {
  func collectionView(
    _ collectionView: UICollectionView,
    widthForItemAt indexPath: IndexPath
  ) -> CGFloat
}
```

Layout은 셀이나 모델을 직접 만들지 않아요. 화면이 알고 있는 제목 길이를 너비로 계산해 delegate를 통해 제공하게 해 책임을 나눠요.

## Attributes Cache와 기본 값을 준비해요

```swift
final class TagCloudLayout: UICollectionViewLayout {
  weak var delegate: (any TagCloudLayoutDelegate)?

  var itemHeight: CGFloat = 44
  var horizontalSpacing: CGFloat = 8
  var verticalSpacing: CGFloat = 10
  var sectionInset = UIEdgeInsets(
    top: 16,
    left: 16,
    bottom: 16,
    right: 16
  )

  private var cachedAttributes: [
    UICollectionViewLayoutAttributes
  ] = []
  private var contentHeight: CGFloat = 0
}
```

Attributes는 자주 요청되므로 `prepare()`에서 계산해 cache에 보관해요. Layout 프로퍼티가 바뀐다면 `invalidateLayout()`을 호출해 cache를 다시 계산하게 해야 해요.

## `prepare()`에서 모든 Item Frame을 계산해요

```swift
override func prepare() {
  super.prepare()

  guard let collectionView else {
    return
  }

  cachedAttributes.removeAll(keepingCapacity: true)

  let availableMaxX =
    collectionView.bounds.width
    - collectionView.adjustedContentInset.left
    - collectionView.adjustedContentInset.right
    - sectionInset.right
  var x = sectionInset.left
  var y = sectionInset.top

  for section in 0..<collectionView.numberOfSections {
    for item in 0..<collectionView.numberOfItems(
      inSection: section
    ) {
      let indexPath = IndexPath(
        item: item,
        section: section
      )
      let requestedWidth = delegate?.collectionView(
        collectionView,
        widthForItemAt: indexPath
      ) ?? 80
      let maximumWidth = max(
        availableMaxX - sectionInset.left,
        1
      )
      let width = min(max(requestedWidth, 1), maximumWidth)

      if x + width > availableMaxX,
        x > sectionInset.left
      {
        x = sectionInset.left
        y += itemHeight + verticalSpacing
      }

      let attributes = UICollectionViewLayoutAttributes(
        forCellWith: indexPath
      )
      attributes.frame = CGRect(
        x: x,
        y: y,
        width: width,
        height: itemHeight
      )
      cachedAttributes.append(attributes)

      x += width + horizontalSpacing
    }

    x = sectionInset.left
    y += itemHeight + sectionInset.bottom
  }

  contentHeight = y
}
```

요청된 너비가 한 줄보다 크면 표시 가능한 최대 너비로 제한해요. 여러 section을 지원한다면 section 사이 inset과 header 공간을 요구사항에 맞게 더 정교하게 계산하세요.

## Content Size와 Attributes를 제공해요

```swift
override var collectionViewContentSize: CGSize {
  guard let collectionView else {
    return .zero
  }

  return CGSize(
    width: collectionView.bounds.width,
    height: max(
      contentHeight,
      collectionView.bounds.height
    )
  )
}

override func layoutAttributesForElements(
  in rect: CGRect
) -> [UICollectionViewLayoutAttributes]? {
  cachedAttributes.filter {
    $0.frame.intersects(rect)
  }
}

override func layoutAttributesForItem(
  at indexPath: IndexPath
) -> UICollectionViewLayoutAttributes? {
  cachedAttributes.first {
    $0.indexPath == indexPath
  }
}
```

Collection View는 화면 주변의 `rect`와 특정 `IndexPath` 두 방식으로 정보를 요청해요. 데이터가 매우 많다면 매번 전체 cache를 선형 검색하지 말고 y 좌표로 범위를 좁히거나 section별 index를 두세요.

## 화면 너비가 바뀔 때만 다시 계산해요

```swift
override func shouldInvalidateLayout(
  forBoundsChange newBounds: CGRect
) -> Bool {
  guard let collectionView else {
    return false
  }

  return newBounds.width
    != collectionView.bounds.width
}
```

세로 스크롤에서 origin만 바뀔 때는 frame을 다시 계산할 필요가 없어요. 회전이나 Split View로 너비가 바뀌면 줄바꿈 위치가 달라지므로 layout을 invalidation해요.

## View Controller에서 모델 너비를 계산해요

```swift
extension TagCloudViewController:
  TagCloudLayoutDelegate
{
  func collectionView(
    _ collectionView: UICollectionView,
    widthForItemAt indexPath: IndexPath
  ) -> CGFloat {
    let title = tags[indexPath.item]
    let font = UIFont.preferredFont(
      forTextStyle: .body
    )
    let textWidth = (title as NSString).size(
      withAttributes: [.font: font]
    ).width

    return ceil(textWidth) + 32
  }
}
```

```swift
private func makeCollectionView() -> UICollectionView {
  let layout = TagCloudLayout()
  layout.delegate = self

  return UICollectionView(
    frame: .zero,
    collectionViewLayout: layout
  )
}
```

Dynamic Type가 바뀌면 글꼴과 item 너비도 바뀌므로 layout을 invalidation하세요.

## Custom Layout을 선택하기 전에 비교해요

| 요구사항                                  | 먼저 검토할 API                       |
| ----------------------------------------- | ------------------------------------- |
| 균일한 목록·격자                          | `UICollectionViewFlowLayout`          |
| Section별 카드·가로 스크롤·복합 배치      | `UICollectionViewCompositionalLayout` |
| 표준 설정 목록                            | Collection View List Layout           |
| 기존 layout으로 표현하기 어려운 배치 규칙 | Custom `UICollectionViewLayout`       |

Custom Layout은 계산·invalidation·삽입 삭제 animation·접근성·성능까지 직접 책임져야 해요. 단순히 셀 크기만 조금 다르다면 Flow Layout delegate나 Compositional Layout의 estimated dimension이 더 적합할 수 있어요.

## 자주 발생하는 문제를 점검해요

| 증상                                | 먼저 확인할 것                                                                |
| ----------------------------------- | ----------------------------------------------------------------------------- |
| 셀이 나타나지 않아요.               | Content size와 attributes 메서드가 유효한 frame을 반환하는지 확인해요.        |
| 스크롤할수록 느려져요.              | Query rect 요청마다 모든 item을 다시 계산하거나 전체 cache를 검색하는지 봐요. |
| 회전 뒤 줄바꿈이 이전 그대로예요.   | 너비 변경에서 layout을 invalidation하고 cache를 다시 만드는지 확인해요.       |
| 삽입 뒤 기존 attributes가 어긋나요. | `prepare()`에서 오래된 cache를 비우고 현재 item 개수로 다시 계산하는지 봐요.  |
| 큰 item이 화면 밖으로 나가요.       | Delegate가 준 너비를 실제 표시 가능한 너비로 제한하는지 확인해요.             |

## 면접에서 이어질 수 있는 질문

### Custom Layout의 필수 책임은 무엇인가요?

Content size와 화면 영역·특정 item에 대한 layout attributes를 제공해야 해요. 보통 `prepare()`, `collectionViewContentSize`, `layoutAttributesForElements(in:)`, `layoutAttributesForItem(at:)`, bounds 변경 invalidation을 구현해요.

### 셀은 Layout이 생성하나요?

아니요. Data Source가 셀을 생성하고 구성하며, Layout은 해당 셀의 위치와 크기 같은 attributes만 계산해요. 이 책임을 분리해야 layout을 바꿔도 같은 데이터와 셀을 재사용할 수 있어요.

## 다음 예제로 이동해요

Custom layout과 다른 layout 사이를 gesture로 전환하려면 [`UICollectionViewTransitionLayout` 예제](./transition-layout)를 읽어 보세요.

## 전체 최종 코드

아래 코드는 태그 셀, 배열 기반 Data Source, 너비 delegate, attributes cache를 사용하는 Custom Layout을 모두 합친 최종본이에요.

<details>
<summary>전체 코드 펼쳐보기</summary>

```swift
import UIKit

protocol TagCloudLayoutDelegate: AnyObject {
  func collectionView(
    _ collectionView: UICollectionView,
    widthForItemAt indexPath: IndexPath
  ) -> CGFloat
}

final class TagCloudLayout: UICollectionViewLayout {
  weak var delegate: (any TagCloudLayoutDelegate)?
  var itemHeight: CGFloat = 44
  var horizontalSpacing: CGFloat = 8
  var verticalSpacing: CGFloat = 10
  var sectionInset = UIEdgeInsets(
    top: 16,
    left: 16,
    bottom: 16,
    right: 16
  )

  private var cachedAttributes: [
    UICollectionViewLayoutAttributes
  ] = []
  private var contentHeight: CGFloat = 0

  override func prepare() {
    super.prepare()
    guard let collectionView else {
      return
    }

    cachedAttributes.removeAll(keepingCapacity: true)
    let availableMaxX =
      collectionView.bounds.width
      - collectionView.adjustedContentInset.left
      - collectionView.adjustedContentInset.right
      - sectionInset.right
    let maximumWidth = max(
      availableMaxX - sectionInset.left,
      1
    )
    var x = sectionInset.left
    var y = sectionInset.top

    for section in 0..<collectionView.numberOfSections {
      for item in 0..<collectionView.numberOfItems(
        inSection: section
      ) {
        let indexPath = IndexPath(
          item: item,
          section: section
        )
        let requestedWidth = delegate?.collectionView(
          collectionView,
          widthForItemAt: indexPath
        ) ?? 80
        let width = min(
          max(requestedWidth, 1),
          maximumWidth
        )

        if x + width > availableMaxX,
          x > sectionInset.left
        {
          x = sectionInset.left
          y += itemHeight + verticalSpacing
        }

        let attributes = UICollectionViewLayoutAttributes(
          forCellWith: indexPath
        )
        attributes.frame = CGRect(
          x: x,
          y: y,
          width: width,
          height: itemHeight
        )
        cachedAttributes.append(attributes)
        x += width + horizontalSpacing
      }

      x = sectionInset.left
      y += itemHeight + sectionInset.bottom
    }
    contentHeight = y
  }

  override var collectionViewContentSize: CGSize {
    guard let collectionView else {
      return .zero
    }
    return CGSize(
      width: collectionView.bounds.width,
      height: max(contentHeight, collectionView.bounds.height)
    )
  }

  override func layoutAttributesForElements(
    in rect: CGRect
  ) -> [UICollectionViewLayoutAttributes]? {
    cachedAttributes.filter {
      $0.frame.intersects(rect)
    }
  }

  override func layoutAttributesForItem(
    at indexPath: IndexPath
  ) -> UICollectionViewLayoutAttributes? {
    cachedAttributes.first {
      $0.indexPath == indexPath
    }
  }

  override func shouldInvalidateLayout(
    forBoundsChange newBounds: CGRect
  ) -> Bool {
    guard let collectionView else {
      return false
    }
    return newBounds.width != collectionView.bounds.width
  }
}

final class TagCell: UICollectionViewCell {
  static let reuseIdentifier = "TagCell"
  private let label = UILabel()

  override init(frame: CGRect) {
    super.init(frame: frame)

    label.translatesAutoresizingMaskIntoConstraints = false
    contentView.addSubview(label)
    contentView.backgroundColor = .secondarySystemBackground
    contentView.layer.cornerRadius = 12
    NSLayoutConstraint.activate([
      label.leadingAnchor.constraint(
        equalTo: contentView.leadingAnchor,
        constant: 16
      ),
      label.trailingAnchor.constraint(
        equalTo: contentView.trailingAnchor,
        constant: -16
      ),
      label.centerYAnchor.constraint(
        equalTo: contentView.centerYAnchor
      ),
    ])
  }

  @available(*, unavailable)
  required init?(coder: NSCoder) {
    fatalError("init(coder:)는 사용하지 않아요.")
  }

  func configure(title: String) {
    label.text = title
  }
}

@MainActor
final class TagCloudViewController: UIViewController {
  private let tags = [
    "Swift",
    "UIKit",
    "Collection View",
    "Diffable Data Source",
    "Custom Layout",
  ]

  private lazy var collectionView: UICollectionView = {
    let layout = TagCloudLayout()
    layout.delegate = self
    return UICollectionView(
      frame: .zero,
      collectionViewLayout: layout
    )
  }()

  override func viewDidLoad() {
    super.viewDidLoad()

    collectionView.translatesAutoresizingMaskIntoConstraints = false
    collectionView.backgroundColor = .systemBackground
    collectionView.dataSource = self
    collectionView.register(
      TagCell.self,
      forCellWithReuseIdentifier: TagCell.reuseIdentifier
    )
    view.addSubview(collectionView)
    NSLayoutConstraint.activate([
      collectionView.topAnchor.constraint(
        equalTo: view.safeAreaLayoutGuide.topAnchor
      ),
      collectionView.leadingAnchor.constraint(
        equalTo: view.leadingAnchor
      ),
      collectionView.trailingAnchor.constraint(
        equalTo: view.trailingAnchor
      ),
      collectionView.bottomAnchor.constraint(
        equalTo: view.bottomAnchor
      ),
    ])
  }

  override func traitCollectionDidChange(
    _ previousTraitCollection: UITraitCollection?
  ) {
    super.traitCollectionDidChange(previousTraitCollection)
    collectionView.collectionViewLayout.invalidateLayout()
  }
}

extension TagCloudViewController:
  UICollectionViewDataSource
{
  func collectionView(
    _ collectionView: UICollectionView,
    numberOfItemsInSection section: Int
  ) -> Int {
    tags.count
  }

  func collectionView(
    _ collectionView: UICollectionView,
    cellForItemAt indexPath: IndexPath
  ) -> UICollectionViewCell {
    guard let cell = collectionView.dequeueReusableCell(
      withReuseIdentifier: TagCell.reuseIdentifier,
      for: indexPath
    ) as? TagCell else {
      preconditionFailure("TagCell 등록을 확인하세요.")
    }
    cell.configure(title: tags[indexPath.item])
    return cell
  }
}

extension TagCloudViewController: TagCloudLayoutDelegate {
  func collectionView(
    _ collectionView: UICollectionView,
    widthForItemAt indexPath: IndexPath
  ) -> CGFloat {
    let font = UIFont.preferredFont(forTextStyle: .body)
    let textWidth = (tags[indexPath.item] as NSString).size(
      withAttributes: [.font: font]
    ).width
    return ceil(textWidth) + 32
  }
}
```

</details>

## 참고 자료

- [Apple Developer Documentation — UICollectionViewLayout](https://developer.apple.com/documentation/uikit/uicollectionviewlayout)
- [Apple Developer Documentation — Customizing collection view layouts](https://developer.apple.com/documentation/uikit/customizing-collection-view-layouts)
- [Apple Developer Documentation — UICollectionViewLayoutAttributes](https://developer.apple.com/documentation/uikit/uicollectionviewlayoutattributes)
