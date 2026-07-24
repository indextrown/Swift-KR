---
title: 'UICollectionViewCompositionalLayout 예제'
description: 'UICollectionViewCompositionalLayout의 item·group·section을 조합해 가로 추천 카드와 반응형 사진 격자, section header를 하나의 Collection View에 구현합니다.'
---

# UICollectionViewCompositionalLayout 예제

> **면접 답변 한 줄 요약:** `UICollectionViewCompositionalLayout`은 item을 group으로, group을 section으로 조합해 section마다 서로 다른 크기·간격·스크롤 방식을 선언하는 Collection View layout이에요.

이 예제에서는 `추천 사진`을 가로로 넘기는 큰 카드로, `모든 사진`을 화면 너비에 따라 열 수가 바뀌는 격자로 만들어요. Data source는 snapshot으로 여러 section을 표현하기 쉬운 Diffable Data Source를 사용해요.

## 먼저 알아둘 용어

| 용어                        | 쉬운 뜻                                                                         |
| --------------------------- | ------------------------------------------------------------------------------- |
| item                        | 셀 하나가 차지하는 가장 작은 layout 단위예요.                                   |
| group                       | 하나 이상의 item이나 하위 group을 가로·세로로 묶는 단위예요.                    |
| section                     | group을 반복하고 inset, header, 가로 스크롤 같은 정책을 정하는 단위예요.        |
| fractional dimension        | 바로 바깥 컨테이너 크기에 대한 비율로 너비나 높이를 정하는 값이에요.            |
| layout environment          | 현재 container의 유효 크기와 trait 정보를 section provider에 전달하는 값이에요. |
| orthogonal scrolling        | 전체 세로 스크롤과 직각인 가로 방향으로 특정 section만 움직이는 방식이에요.     |
| boundary supplementary item | section 경계에 놓는 header나 footer의 layout 정보예요.                          |

## 화면 section과 item 식별자를 정의해요

```swift
private enum GallerySection: Int, CaseIterable {
  case featured
  case library

  var title: String {
    switch self {
    case .featured:
      return "추천 사진"
    case .library:
      return "모든 사진"
    }
  }
}

private enum GalleryItemID: Hashable {
  case featured(Photo.ID)
  case library(Photo.ID)

  var photoID: Photo.ID {
    switch self {
    case let .featured(id), let .library(id):
      return id
    }
  }
}
```

하나의 사진을 추천 section과 전체 section에 동시에 표시하려면 snapshot 안의 item identifier는 서로 달라야 해요. 모델 ID에 화면 역할을 더한 `GalleryItemID`를 사용하면 같은 `Photo`를 두 위치에 표현할 수 있어요.

## 공통 header layout을 만들어요

```swift
private func makeSectionHeader()
  -> NSCollectionLayoutBoundarySupplementaryItem
{
  let size = NSCollectionLayoutSize(
    widthDimension: .fractionalWidth(1),
    heightDimension: .estimated(52)
  )

  return NSCollectionLayoutBoundarySupplementaryItem(
    layoutSize: size,
    elementKind: UICollectionView.elementKindSectionHeader,
    alignment: .top
  )
}
```

Layout은 header가 차지할 위치와 크기만 요청해요. 실제 재사용 뷰는 뒤에서 supplementary registration으로 제공해요.

## 추천 사진을 가로 카드로 만들어요

```swift
private func makeFeaturedSection()
  -> NSCollectionLayoutSection
{
  let itemSize = NSCollectionLayoutSize(
    widthDimension: .fractionalWidth(1),
    heightDimension: .fractionalHeight(1)
  )
  let item = NSCollectionLayoutItem(layoutSize: itemSize)

  let groupSize = NSCollectionLayoutSize(
    widthDimension: .fractionalWidth(0.82),
    heightDimension: .absolute(220)
  )
  let group = NSCollectionLayoutGroup.horizontal(
    layoutSize: groupSize,
    subitems: [item]
  )

  let section = NSCollectionLayoutSection(group: group)
  section.orthogonalScrollingBehavior = .groupPagingCentered
  section.interGroupSpacing = 12
  section.contentInsets = NSDirectionalEdgeInsets(
    top: 8,
    leading: 16,
    bottom: 24,
    trailing: 16
  )
  section.boundarySupplementaryItems = [
    makeSectionHeader(),
  ]
  return section
}
```

전체 Collection View는 세로로 스크롤하지만 `.featured` section만 가로로 움직여요. `.groupPagingCentered`는 한 번 넘길 때 group 단위로 이동하고 가운데에 맞춰요.

Group 너비를 container의 82%로 정했기 때문에 다음 카드 일부가 보여 가로로 더 넘길 수 있다는 단서를 줘요.

## 모든 사진을 반응형 격자로 만들어요

```swift
private func makeLibrarySection(
  environment: NSCollectionLayoutEnvironment
) -> NSCollectionLayoutSection {
  let width =
    environment.container.effectiveContentSize.width
  let columnCount: Int

  switch width {
  case 900...:
    columnCount = 5
  case 600...:
    columnCount = 3
  default:
    columnCount = 2
  }

  let itemSize = NSCollectionLayoutSize(
    widthDimension: .fractionalWidth(1),
    heightDimension: .fractionalHeight(1)
  )
  let item = NSCollectionLayoutItem(layoutSize: itemSize)
  item.contentInsets = NSDirectionalEdgeInsets(
    top: 6,
    leading: 6,
    bottom: 6,
    trailing: 6
  )

  let groupSize = NSCollectionLayoutSize(
    widthDimension: .fractionalWidth(1),
    heightDimension: .fractionalWidth(
      1 / CGFloat(columnCount)
    )
  )
  let group = NSCollectionLayoutGroup.horizontal(
    layoutSize: groupSize,
    subitem: item,
    count: columnCount
  )

  let section = NSCollectionLayoutSection(group: group)
  section.contentInsets = NSDirectionalEdgeInsets(
    top: 8,
    leading: 10,
    bottom: 24,
    trailing: 10
  )
  section.boundarySupplementaryItems = [
    makeSectionHeader(),
  ]
  return section
}
```

`effectiveContentSize`를 기준으로 열 수를 고르면 화면 회전, Split View, 창 크기 변경에 대응할 수 있어요. 기기 모델을 기준으로 분기하지 않아도 돼요.

item의 `.fractionalWidth(1)`은 Collection View 전체가 아니라 자신이 들어 있는 group 너비 전체를 뜻해요.

예제는 iOS 15 지원을 위해 `horizontal(layoutSize:subitem:count:)`를 사용해요. iOS 16 이상만 지원한다면 같은 의미의 `horizontal(layoutSize:repeatingSubitem:count:)`를 사용할 수 있어요.

## Section provider에서 배치를 선택해요

```swift
private func makeGalleryLayout()
  -> UICollectionViewCompositionalLayout
{
  let configuration =
    UICollectionViewCompositionalLayoutConfiguration()
  configuration.interSectionSpacing = 16

  return UICollectionViewCompositionalLayout(
    sectionProvider: { sectionIndex, environment in
      guard let section = GallerySection(
        rawValue: sectionIndex
      ) else {
        return nil
      }

      switch section {
      case .featured:
        return makeFeaturedSection()
      case .library:
        return makeLibrarySection(
          environment: environment
        )
      }
    },
    configuration: configuration
  )
}
```

이 예제는 snapshot에 항상 `.featured`, `.library` 순서로 section을 추가하므로 raw value로 layout을 선택해요. section 순서가 동적으로 바뀐다면 현재 snapshot의 section identifier를 조회해 layout을 결정하세요.

## Header 재사용 뷰를 만들어요

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

Header도 셀과 마찬가지로 재사용되므로 구성 메서드가 현재 section의 모든 표시 상태를 덮어써야 해요.

## View Controller와 Diffable Data Source를 연결해요

아래 코드는 [공통 `PhotoCell`](./index)을 사용해요.

```swift
@MainActor
final class CompositionalPhotoGalleryViewController:
  UIViewController
{
  private var photosByID: [Photo.ID: Photo] = [:]
  private var dataSource:
    UICollectionViewDiffableDataSource<
      GallerySection,
      GalleryItemID
    >!

  private lazy var collectionView = UICollectionView(
    frame: .zero,
    collectionViewLayout: makeGalleryLayout()
  )

  override func viewDidLoad() {
    super.viewDidLoad()

    configureCollectionView()
    configureDataSource()
    show(Photo.samples)
  }

  private func configureCollectionView() {
    collectionView.translatesAutoresizingMaskIntoConstraints = false
    collectionView.backgroundColor = .systemBackground

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
}
```

## Cell과 header registration을 구성해요

```swift
extension CompositionalPhotoGalleryViewController {
  private func configureDataSource() {
    let cellRegistration = UICollectionView.CellRegistration<
      PhotoCell,
      GalleryItemID
    > { [weak self] cell, _, itemID in
      guard let photo = self?.photosByID[itemID.photoID] else {
        return
      }
      cell.configure(with: photo)
    }

    dataSource = UICollectionViewDiffableDataSource(
      collectionView: collectionView
    ) { collectionView, indexPath, itemID in
      collectionView.dequeueConfiguredReusableCell(
        using: cellRegistration,
        for: indexPath,
        item: itemID
      )
    }

    let headerRegistration =
      UICollectionView.SupplementaryRegistration<
        GalleryHeaderView
      >(
        elementKind:
          UICollectionView.elementKindSectionHeader
      ) { [weak self] header, _, indexPath in
        guard let section = self?.dataSource.sectionIdentifier(
          for: indexPath.section
        ) else {
          return
        }
        header.configure(title: section.title)
      }

    dataSource.supplementaryViewProvider = {
      collectionView,
      _,
      indexPath in

      collectionView.dequeueConfiguredReusableSupplementary(
        using: headerRegistration,
        for: indexPath
      )
    }
  }
}
```

Supplementary Registration은 provider 안에서 매번 만들지 않고 provider 밖에서 한 번 만들어요. iOS 15 이상에서는 provider 안에서 생성하면 재사용을 막고 예외가 발생할 수 있어요.

## 여러 section의 snapshot을 적용해요

```swift
extension CompositionalPhotoGalleryViewController {
  private func show(_ photos: [Photo]) {
    photosByID = Dictionary(
      uniqueKeysWithValues: photos.map { ($0.id, $0) }
    )

    let featuredIDs = photos.prefix(3).map {
      GalleryItemID.featured($0.id)
    }
    let libraryIDs = photos.map {
      GalleryItemID.library($0.id)
    }

    var snapshot = NSDiffableDataSourceSnapshot<
      GallerySection,
      GalleryItemID
    >()
    snapshot.appendSections([.featured, .library])
    snapshot.appendItems(
      featuredIDs,
      toSection: .featured
    )
    snapshot.appendItems(
      libraryIDs,
      toSection: .library
    )
    dataSource.apply(
      snapshot,
      animatingDifferences: false
    )
  }
}
```

Layout의 section 순서와 snapshot의 section 순서가 같아야 해요. 추천 사진을 전체 격자에도 표시하기 위해 서로 다른 `GalleryItemID` case를 사용했으므로 snapshot identifier 중복도 발생하지 않아요.

## 한 section만 고정 header로 바꿔요

```swift
let header = makeSectionHeader()
header.pinToVisibleBounds = true
header.zIndex = 2
section.boundarySupplementaryItems = [header]
```

`pinToVisibleBounds`를 켜면 해당 section이 보이는 동안 header가 화면 경계에 머물러요. 여러 고정 header가 겹치지 않는지 실제 스크롤로 확인하세요.

## 자주 발생하는 문제를 점검해요

| 증상                                     | 먼저 확인할 것                                                             |
| ---------------------------------------- | -------------------------------------------------------------------------- |
| 다른 section의 layout이 적용돼요.        | section provider index와 snapshot section 순서가 같은지 확인해요.          |
| 같은 사진을 두 section에 넣을 수 없어요. | 화면 역할을 포함한 별도 item identifier를 사용했는지 확인해요.             |
| Header가 나타나지 않아요.                | boundary item과 supplementary provider를 모두 설정했는지 확인해요.         |
| 격자 높이가 예상과 달라요.               | fractional dimension이 바로 바깥 container를 기준으로 계산되는지 확인해요. |
| 가로 스크롤 제스처가 불편해요.           | 카드 너비와 paging 방식, 셀 내부 제스처 충돌을 실제 기기에서 확인해요.     |

## 언제 Compositional Layout을 사용해야 하나요

- section마다 목록, 격자, 큰 카드처럼 배치가 다를 때 잘 맞아요.
- 세로 화면 안에 가로 스크롤 section을 넣을 때 중첩 Collection View를 줄일 수 있어요.
- 모든 section이 같은 두 열 격자라면 [Flow Layout](./flow-layout)이 더 짧고 읽기 쉬울 수 있어요.
- 작은 화면에서도 item, group, section 객체가 많아질 수 있으므로 layout helper를 역할별로 나눠 이름을 붙이세요.

## 면접에서 이어질 수 있는 질문

### Item, group, section의 관계를 설명해 주세요.

Item은 셀 하나의 배치 단위이고, group은 item을 가로·세로 또는 사용자 정의 방식으로 묶어요. Section은 group을 반복하며 inset, header, 가로 스크롤처럼 구역 전체의 정책을 정해요.

### 같은 모델을 두 section에 표시할 때 왜 별도 identifier가 필요한가요?

Diffable snapshot 안에서 item identifier는 유일해야 하기 때문이에요. 같은 `Photo.ID`에 `featured`와 `library`라는 화면 역할을 더하면 모델은 같아도 서로 다른 화면 item으로 표현할 수 있어요.

## 함께 읽으면 좋아요

Compositional Layout의 여러 section에서 선택한 item을 안정적인 모델 ID로 해석하는 방법은 [현대적인 `UICollectionViewDelegate` 예제](./modern-delegate)에서 이어서 확인할 수 있어요.

설정 화면처럼 표준 목록이 필요하다면 [Collection View List Layout 예제](./list-layout)에서 list cell, accessory와 swipe action을 연결해 보세요.

## 참고 자료

- [Apple Developer Documentation — UICollectionViewCompositionalLayout](https://developer.apple.com/documentation/uikit/uicollectionviewcompositionallayout)
- [Apple Developer Documentation — Implementing modern collection views](https://developer.apple.com/documentation/uikit/implementing-modern-collection-views)
- [Apple Developer Documentation — UICollectionView.SupplementaryRegistration](https://developer.apple.com/documentation/uikit/uicollectionview/supplementaryregistration)
