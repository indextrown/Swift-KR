---
title: 'UICollectionViewFlowLayout 예제'
description: 'UICollectionViewFlowLayout으로 균일한 사진 격자를 만들고, delegate에서 가용 너비를 계산해 회전과 Split View에 대응하는 반응형 셀·헤더를 구현합니다.'
---

# UICollectionViewFlowLayout 예제

> **면접 답변 한 줄 요약:** `UICollectionViewFlowLayout`은 item을 스크롤 축과 반대 방향으로 차례대로 배치하고 공간이 부족하면 다음 줄로 넘기며, delegate로 section별 크기와 간격을 동적으로 정할 수 있어요.

이 예제에서는 [공통 `Photo` 모델과 `PhotoCell`](./index)을 사용해 화면 너비에 반응하는 사진 격자를 만들어요. Data source는 [전통적인 방식](./data-source)과 [Diffable 방식](./diffable-data-source) 중 어느 쪽을 사용해도 돼요.

## 먼저 알아둘 용어

| 용어                | 쉬운 뜻                                                                                       |
| ------------------- | --------------------------------------------------------------------------------------------- |
| scroll direction    | 전체 콘텐츠가 움직이는 방향이에요. `.vertical`이면 item은 가로로 놓이다 다음 행으로 넘어가요. |
| interitem spacing   | 같은 행이나 열 안에서 이웃한 item 사이의 최소 간격이에요.                                     |
| line spacing        | 행과 행 또는 열과 열 사이의 최소 간격이에요.                                                  |
| section inset       | section 콘텐츠와 Collection View 가장자리 사이 여백이에요.                                    |
| layout invalidation | 이전 크기·위치 계산이 유효하지 않으니 다시 계산하라고 layout에 알리는 과정이에요.             |
| self-sizing         | Auto Layout으로 셀 콘텐츠를 측정해 최종 크기를 정하는 방식이에요.                             |

## 가장 작은 격자를 만들어요

```swift
private func makeFlowLayout() -> UICollectionViewFlowLayout {
  let layout = UICollectionViewFlowLayout()
  layout.scrollDirection = .vertical
  layout.itemSize = CGSize(width: 160, height: 180)
  layout.minimumInteritemSpacing = 12
  layout.minimumLineSpacing = 16
  layout.sectionInset = UIEdgeInsets(
    top: 16,
    left: 16,
    bottom: 16,
    right: 16
  )
  return layout
}
```

세로 스크롤에서는 item이 왼쪽에서 오른쪽으로 놓이고 남은 너비가 부족하면 다음 행으로 넘어가요. `itemSize`를 고정하면 구현은 짧지만 좁은 화면에서 한 열만 보이거나 넓은 화면에 빈 공간이 많이 남을 수 있어요.

## Delegate로 현재 너비에 맞는 셀 크기를 계산해요

```swift
extension ClassicPhotoGridViewController:
  UICollectionViewDelegateFlowLayout
{
  func collectionView(
    _ collectionView: UICollectionView,
    layout collectionViewLayout: UICollectionViewLayout,
    sizeForItemAt indexPath: IndexPath
  ) -> CGSize {
    let sectionInset = UIEdgeInsets(
      top: 16,
      left: 16,
      bottom: 16,
      right: 16
    )
    let spacing: CGFloat = 12

    let availableWidth =
      collectionView.bounds.width
      - collectionView.adjustedContentInset.left
      - collectionView.adjustedContentInset.right
      - sectionInset.left
      - sectionInset.right

    let minimumCellWidth: CGFloat = 150
    let columnCount = max(
      1,
      Int(
        (availableWidth + spacing)
          / (minimumCellWidth + spacing)
      )
    )
    let totalSpacing =
      CGFloat(columnCount - 1) * spacing
    let cellWidth = floor(
      (availableWidth - totalSpacing)
        / CGFloat(columnCount)
    )

    return CGSize(
      width: cellWidth,
      height: cellWidth
    )
  }
}
```

기기 이름으로 iPhone과 iPad를 나누지 않고 실제 가용 너비를 사용해요. 이 방식은 화면 회전과 iPad Split View, 창 크기 변경에도 같은 규칙을 적용할 수 있어요.

`adjustedContentInset`과 section inset을 모두 빼야 안전 영역이나 navigation bar 조정 뒤에도 셀이 가장자리를 넘지 않아요.

## 화면 크기가 바뀌면 layout을 다시 계산해요

View controller 본문에 아래 override를 추가해요.

```swift
override func viewWillTransition(
  to size: CGSize,
  with coordinator: UIViewControllerTransitionCoordinator
) {
  super.viewWillTransition(to: size, with: coordinator)

  coordinator.animate(
    alongsideTransition: { [weak self] _ in
      self?.collectionView.collectionViewLayout.invalidateLayout()
    },
    completion: nil
  )
}
```

Flow Layout은 bounds 변경을 감지해 다시 계산할 수 있지만, 회전 애니메이션과 정확히 맞춰야 하거나 사용자 정의 크기 계산을 확실히 다시 실행하려면 명시적으로 invalidate할 수 있어요.

## Section마다 크기와 간격을 다르게 정해요

`UICollectionViewDelegateFlowLayout`은 item 크기뿐 아니라 section별 여백과 간격도 제공해요.

```swift
func collectionView(
  _ collectionView: UICollectionView,
  layout collectionViewLayout: UICollectionViewLayout,
  insetForSectionAt section: Int
) -> UIEdgeInsets {
  section == 0
    ? UIEdgeInsets(top: 24, left: 16, bottom: 32, right: 16)
    : UIEdgeInsets(top: 12, left: 16, bottom: 24, right: 16)
}

func collectionView(
  _ collectionView: UICollectionView,
  layout collectionViewLayout: UICollectionViewLayout,
  minimumLineSpacingForSectionAt section: Int
) -> CGFloat {
  section == 0 ? 20 : 12
}
```

프로퍼티에 지정한 값은 기본값이고 delegate가 값을 반환하면 해당 section에서는 delegate 값이 사용돼요.

## Header 크기를 layout에 알려요

```swift
private func makeFlowLayoutWithHeader()
  -> UICollectionViewFlowLayout
{
  let layout = makeFlowLayout()
  layout.headerReferenceSize = CGSize(
    width: 0,
    height: 52
  )
  layout.sectionHeadersPinToVisibleBounds = true
  return layout
}
```

`headerReferenceSize`는 header 공간을 만들고, 실제 header 뷰는 data source가 제공해요.

```swift
final class GalleryHeaderView: UICollectionReusableView {
  private let titleLabel = UILabel()

  override init(frame: CGRect) {
    super.init(frame: frame)

    titleLabel.font = .preferredFont(forTextStyle: .title2)
    titleLabel.translatesAutoresizingMaskIntoConstraints = false
    addSubview(titleLabel)

    NSLayoutConstraint.activate([
      titleLabel.topAnchor.constraint(
        equalTo: topAnchor,
        constant: 8
      ),
      titleLabel.leadingAnchor.constraint(
        equalTo: leadingAnchor,
        constant: 16
      ),
      titleLabel.trailingAnchor.constraint(
        lessThanOrEqualTo: trailingAnchor,
        constant: -16
      ),
      titleLabel.bottomAnchor.constraint(
        equalTo: bottomAnchor,
        constant: -8
      ),
    ])
  }

  @available(*, unavailable)
  required init?(coder: NSCoder) {
    fatalError("init(coder:)는 사용하지 않아요.")
  }

  func configure(title: String) {
    titleLabel.text = title
  }
}
```

```swift
collectionView.register(
  GalleryHeaderView.self,
  forSupplementaryViewOfKind:
    UICollectionView.elementKindSectionHeader,
  withReuseIdentifier: "GalleryHeaderView"
)

func collectionView(
  _ collectionView: UICollectionView,
  viewForSupplementaryElementOfKind kind: String,
  at indexPath: IndexPath
) -> UICollectionReusableView {
  guard kind == UICollectionView.elementKindSectionHeader else {
    preconditionFailure("지원하지 않는 supplementary view예요.")
  }

  let header = collectionView.dequeueReusableSupplementaryView(
    ofKind: kind,
    withReuseIdentifier: "GalleryHeaderView",
    for: indexPath
  )

  (header as? GalleryHeaderView)?.configure(
    title: sections[indexPath.section].title
  )
  return header
}
```

Header가 보이지 않는다면 layout에 크기를 지정했는지, 뷰를 등록했는지, data source가 뷰를 반환하는지 세 단계를 모두 확인하세요.

## 가로 스크롤 목록을 만들어요

```swift
private func makeHorizontalFlowLayout()
  -> UICollectionViewFlowLayout
{
  let layout = UICollectionViewFlowLayout()
  layout.scrollDirection = .horizontal
  layout.itemSize = CGSize(width: 280, height: 180)
  layout.minimumLineSpacing = 12
  layout.sectionInset = UIEdgeInsets(
    top: 16,
    left: 16,
    bottom: 16,
    right: 16
  )
  return layout
}
```

가로 스크롤에서는 item이 위에서 아래로 놓이다 공간이 부족하면 다음 열로 넘어가요. 카드 하나만 세로로 보이게 하려면 Collection View 높이와 item 높이를 맞추세요.

세로 Collection View 안에 가로 Collection View를 중첩할 수도 있지만, section 하나만 가로로 움직이는 화면이라면 [Compositional Layout의 orthogonal scrolling](./compositional-layout)을 사용하면 중첩을 줄일 수 있어요.

## Self-sizing 셀을 사용할 때는 estimated 크기를 정해요

```swift
let layout = UICollectionViewFlowLayout()
layout.estimatedItemSize = CGSize(
  width: 160,
  height: 120
)
```

Self-sizing 셀은 `contentView` 내부 Auto Layout 제약으로 최종 크기를 계산해요. 위·아래와 좌·우 방향의 제약이 완성되지 않으면 크기가 모호하거나 반복 측정으로 스크롤이 흔들릴 수 있어요.

균일한 사진 격자처럼 셀 크기가 예측 가능하다면 직접 `itemSize`를 계산하는 편이 더 단순하고 측정 비용도 줄어요.

## Flow Layout과 Compositional Layout을 비교해요

| 요구사항                         | Flow Layout                              | Compositional Layout                            |
| -------------------------------- | ---------------------------------------- | ----------------------------------------------- |
| 한 방향 목록이나 균일한 격자     | 설정이 짧고 이해하기 쉬워요.             | 가능하지만 구성 객체가 더 많아요.               |
| item마다 크기가 조금씩 다른 격자 | delegate 메서드가 잘 맞아요.             | estimated size를 사용할 수 있어요.              |
| section마다 전혀 다른 배치       | delegate 분기가 복잡해질 수 있어요.      | section별 group과 스크롤을 선언하기 쉬워요.     |
| 세로 화면 안의 가로 카드         | 중첩 Collection View를 고려할 수 있어요. | orthogonal scrolling으로 한 section에 구성해요. |
| 화면 너비 대응                   | delegate에서 `CGSize`를 계산해요.        | layout environment로 section을 구성해요.        |

모든 section이 같은 격자라면 Flow Layout이 더 읽기 쉬워요. App Store처럼 section별 배치가 다르다면 [Compositional Layout 예제](./compositional-layout)를 검토하세요.

## 자주 발생하는 문제를 점검해요

| 증상                                 | 먼저 확인할 것                                                                      |
| ------------------------------------ | ----------------------------------------------------------------------------------- |
| 마지막 열이 잘리거나 다음 줄로 가요. | inset과 item 간격을 제외한 실제 너비로 셀 크기를 계산했는지 확인해요.               |
| 회전 뒤 열 수가 바뀌지 않아요.       | layout invalidation 뒤 `sizeForItemAt`이 다시 호출되는지 확인해요.                  |
| 셀 높이가 예상과 달라요.             | `itemSize`, `estimatedItemSize`, delegate 크기 중 무엇이 최종 값을 제공하는지 봐요. |
| Header가 나타나지 않아요.            | header 크기, 등록, data source 제공을 모두 확인해요.                                |
| Self-sizing 중 스크롤이 흔들려요.    | 셀 내부 Auto Layout 제약과 estimated 크기가 현실적인지 확인해요.                    |

## 면접에서 이어질 수 있는 질문

### `minimumInteritemSpacing`은 항상 정확한 간격인가요?

최소 간격이에요. Flow Layout은 한 행의 남는 공간을 배분하면서 실제 간격을 더 크게 만들 수 있어요. 정확한 열 너비가 필요하면 inset과 간격을 포함해 item 크기를 계산하세요.

### 언제 layout을 invalidate해야 하나요?

Collection View의 bounds, 셀 크기를 결정하는 데이터, layout 정책이 바뀌어 기존 attributes를 다시 계산해야 할 때예요. 단순한 셀 내용 변경만으로 frame이 바뀌지 않는다면 전체 invalidation이 필요하지 않을 수 있어요.

## 함께 읽으면 좋아요

Flow Layout 화면의 선택·하이라이트·메뉴는 [전통적인 `UICollectionViewDelegate` 예제](./traditional-delegate)에서 이어서 확인할 수 있어요.

Item 크기와 section 간격을 delegate 역할에 집중해 다시 살펴보려면 [`UICollectionViewDelegateFlowLayout` 예제](./flow-layout-delegate)를 읽어 보세요.

## 전체 최종 코드

아래 코드는 [공통 `Photo`와 `PhotoCell`](./index)을 사용해 반응형 열 계산, 고정 header, 회전 시 invalidation을 한 화면에 합친 최종본이에요.

<details>
<summary>전체 코드 펼쳐보기</summary>

```swift
import UIKit

final class FlowGalleryHeaderView: UICollectionReusableView {
  static let reuseIdentifier = "FlowGalleryHeaderView"
  private let titleLabel = UILabel()

  override init(frame: CGRect) {
    super.init(frame: frame)

    titleLabel.font = .preferredFont(forTextStyle: .title2)
    titleLabel.text = "모든 사진"
    titleLabel.translatesAutoresizingMaskIntoConstraints = false
    addSubview(titleLabel)
    NSLayoutConstraint.activate([
      titleLabel.leadingAnchor.constraint(
        equalTo: leadingAnchor,
        constant: 16
      ),
      titleLabel.centerYAnchor.constraint(equalTo: centerYAnchor),
    ])
  }

  @available(*, unavailable)
  required init?(coder: NSCoder) {
    fatalError("init(coder:)는 사용하지 않아요.")
  }
}

@MainActor
final class FlowPhotoGridViewController: UIViewController {
  private var photos = Photo.samples

  private lazy var collectionView = UICollectionView(
    frame: .zero,
    collectionViewLayout: makeFlowLayout()
  )

  override func viewDidLoad() {
    super.viewDidLoad()

    collectionView.translatesAutoresizingMaskIntoConstraints = false
    collectionView.backgroundColor = .systemBackground
    collectionView.dataSource = self
    collectionView.delegate = self
    collectionView.register(
      PhotoCell.self,
      forCellWithReuseIdentifier: PhotoCell.reuseIdentifier
    )
    collectionView.register(
      FlowGalleryHeaderView.self,
      forSupplementaryViewOfKind:
        UICollectionView.elementKindSectionHeader,
      withReuseIdentifier:
        FlowGalleryHeaderView.reuseIdentifier
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

  override func viewWillTransition(
    to size: CGSize,
    with coordinator: UIViewControllerTransitionCoordinator
  ) {
    super.viewWillTransition(to: size, with: coordinator)
    coordinator.animate { [weak self] _ in
      self?.collectionView.collectionViewLayout
        .invalidateLayout()
    }
  }

  private func makeFlowLayout() -> UICollectionViewFlowLayout {
    let layout = UICollectionViewFlowLayout()
    layout.scrollDirection = .vertical
    layout.minimumInteritemSpacing = 12
    layout.minimumLineSpacing = 16
    layout.sectionInset = UIEdgeInsets(
      top: 16,
      left: 16,
      bottom: 16,
      right: 16
    )
    layout.headerReferenceSize = CGSize(width: 0, height: 52)
    layout.sectionHeadersPinToVisibleBounds = true
    return layout
  }
}

extension FlowPhotoGridViewController:
  UICollectionViewDataSource
{
  func collectionView(
    _ collectionView: UICollectionView,
    numberOfItemsInSection section: Int
  ) -> Int {
    photos.count
  }

  func collectionView(
    _ collectionView: UICollectionView,
    cellForItemAt indexPath: IndexPath
  ) -> UICollectionViewCell {
    guard let cell = collectionView.dequeueReusableCell(
      withReuseIdentifier: PhotoCell.reuseIdentifier,
      for: indexPath
    ) as? PhotoCell else {
      preconditionFailure("PhotoCell 등록을 확인하세요.")
    }
    cell.configure(with: photos[indexPath.item])
    return cell
  }

  func collectionView(
    _ collectionView: UICollectionView,
    viewForSupplementaryElementOfKind kind: String,
    at indexPath: IndexPath
  ) -> UICollectionReusableView {
    collectionView.dequeueReusableSupplementaryView(
      ofKind: kind,
      withReuseIdentifier:
        FlowGalleryHeaderView.reuseIdentifier,
      for: indexPath
    )
  }
}

extension FlowPhotoGridViewController:
  UICollectionViewDelegateFlowLayout
{
  func collectionView(
    _ collectionView: UICollectionView,
    layout collectionViewLayout: UICollectionViewLayout,
    sizeForItemAt indexPath: IndexPath
  ) -> CGSize {
    let inset: CGFloat = 16
    let spacing: CGFloat = 12
    let minimumWidth: CGFloat = 150
    let availableWidth =
      collectionView.bounds.width
      - collectionView.adjustedContentInset.left
      - collectionView.adjustedContentInset.right
      - inset * 2
    let columns = max(
      1,
      Int(
        (availableWidth + spacing)
          / (minimumWidth + spacing)
      )
    )
    let width = floor(
      (availableWidth - spacing * CGFloat(columns - 1))
        / CGFloat(columns)
    )
    return CGSize(width: width, height: width)
  }
}
```

</details>

## 참고 자료

- [Apple Developer Documentation — UICollectionViewFlowLayout](https://developer.apple.com/documentation/uikit/uicollectionviewflowlayout)
- [Apple Developer Documentation — UICollectionViewDelegateFlowLayout](https://developer.apple.com/documentation/uikit/uicollectionviewdelegateflowlayout)
