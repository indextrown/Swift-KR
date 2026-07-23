---
title: '현대적인 Collection View 구현하기'
description: 'Apple Modern Collection Views 샘플의 Grid, section별·환경별 배치, badge·header·decoration, 중첩·가로 스크롤, snapshot 갱신, list와 복합 section 예제를 빠짐없이 설명합니다.'
---

# 현대적인 Collection View 구현하기

> **면접 답변 한 줄 요약:** 현대적인 Collection View는 Compositional Layout으로 배치를 조합하고 Diffable Data Source로 식별자 기반 상태를 적용하며 registration으로 재사용 뷰를 구성해요.

이 문서는 Apple의 **Implementing modern collection views** 샘플이 다루는 예제를 공식 순서대로 설명해요. 원문 예제의 핵심 API와 동작을 모두 남기고, 코드는 각 개념을 독립적으로 읽을 수 있게 정리했어요.

## 먼저 알아둘 용어

| 용어                 | 쉬운 뜻                                                                         |
| -------------------- | ------------------------------------------------------------------------------- |
| Compositional Layout | item·group·section을 조합해 단순 목록부터 복합 화면까지 만드는 레이아웃이에요.  |
| Diffable Data Source | 현재 화면 상태를 식별자 snapshot으로 받아 이전 상태와 차이를 반영하는 객체예요. |
| Registration         | 재사용 뷰 타입과 데이터를 받아 뷰를 구성하는 클로저를 묶은 값이에요.            |
| Supplementary View   | badge·header·footer처럼 셀의 내용을 보완하는 재사용 뷰예요.                     |
| Decoration View      | 데이터와 직접 연결되지 않은 section 배경 같은 장식용 뷰예요.                    |
| Orthogonal Scrolling | 전체 세로 스크롤 안에서 특정 section만 가로로 스크롤하는 방식이에요.            |

## 개요

Collection View는 같은 데이터도 grid, list, 가로 carousel, 계층형 outline처럼 다양한 형태로 표현할 수 있어요. 공식 샘플은 다음 두 기술을 중심으로 여러 화면을 만들어요.

- `UICollectionViewCompositionalLayout`: 빠르고 유연하게 시각적 배치를 조합해요.
- `UICollectionViewDiffableDataSource`: snapshot의 차이를 계산해 데이터와 UI를 갱신해요.

샘플 프로젝트는 iOS와 macOS target을 함께 제공해요. 이 문서는 UIKit을 사용하는 iOS 코드를 기준으로 설명해요.

## Grid Layout을 만들어요

폭이 같은 item 다섯 개를 한 행에 배치하려면 item 폭을 group의 20%로 만들고, group은 section 폭 전체를 사용하게 해요. group 높이를 폭의 20%로 잡으면 정사각형에 가까운 다섯 칸 행이 만들어져요.

```swift
let itemSize = NSCollectionLayoutSize(
  widthDimension: .fractionalWidth(0.2),
  heightDimension: .fractionalHeight(1)
)
let item = NSCollectionLayoutItem(layoutSize: itemSize)

let groupSize = NSCollectionLayoutSize(
  widthDimension: .fractionalWidth(1),
  heightDimension: .fractionalWidth(0.2)
)
let group = NSCollectionLayoutGroup.horizontal(
  layoutSize: groupSize,
  subitems: [item]
)

let section = NSCollectionLayoutSection(group: group)
return UICollectionViewCompositionalLayout(section: section)
```

### Item 둘레에 간격을 추가해요

`contentInsets`는 item의 frame 안쪽을 줄여 셀 사이에 시각적 여백을 만들어요.

```swift
let item = NSCollectionLayoutItem(
  layoutSize: .init(
    widthDimension: .fractionalWidth(0.2),
    heightDimension: .fractionalHeight(1)
  )
)
item.contentInsets = .init(top: 5, leading: 5, bottom: 5, trailing: 5)
```

### 열 개수를 직접 지정해요

한 행의 열 개수가 핵심이라면 `repeatingSubitem:count:`를 사용해요. 이때 item의 fractional width보다 `count`가 우선하고, group이 실제 item 폭을 계산해요.

```swift
let item = NSCollectionLayoutItem(
  layoutSize: .init(
    widthDimension: .fractionalWidth(1),
    heightDimension: .fractionalHeight(1)
  )
)
let group = NSCollectionLayoutGroup.horizontal(
  layoutSize: .init(
    widthDimension: .fractionalWidth(1),
    heightDimension: .absolute(44)
  ),
  repeatingSubitem: item,
  count: 2
)
group.interItemSpacing = .fixed(10)
```

## Section마다 다른 Layout을 표시해요

여러 section을 서로 다르게 배치하려면 section provider를 사용해요. provider는 현재 section index와 layout environment를 받고 해당 section의 레이아웃을 반환해요.

```swift
let layout = UICollectionViewCompositionalLayout {
  sectionIndex, _ -> NSCollectionLayoutSection? in
  guard let kind = SectionLayoutKind(rawValue: sectionIndex) else {
    return nil
  }

  let item = NSCollectionLayoutItem(
    layoutSize: .init(
      widthDimension: .fractionalWidth(1),
      heightDimension: .fractionalHeight(1)
    )
  )
  item.contentInsets = .init(top: 2, leading: 2, bottom: 2, trailing: 2)

  let height: NSCollectionLayoutDimension =
    kind.columnCount == 1 ? .absolute(44) : .fractionalWidth(0.2)
  let group = NSCollectionLayoutGroup.horizontal(
    layoutSize: .init(
      widthDimension: .fractionalWidth(1),
      heightDimension: height
    ),
    repeatingSubitem: item,
    count: kind.columnCount
  )
  let section = NSCollectionLayoutSection(group: group)
  section.contentInsets = .init(
    top: 20,
    leading: 20,
    bottom: 20,
    trailing: 20
  )
  return section
}
```

### 화면 환경에 따라 Layout을 바꿔요

회전, Split View, 창 크기 변경처럼 사용 가능한 폭이 달라질 때 `layoutEnvironment.container.effectiveContentSize`를 확인해 열 개수를 바꿀 수 있어요.

```swift
let layout = UICollectionViewCompositionalLayout {
  sectionIndex, environment -> NSCollectionLayoutSection? in
  guard let kind = SectionLayoutKind(rawValue: sectionIndex) else {
    return nil
  }

  let availableWidth = environment.container.effectiveContentSize.width
  let columns = kind.columnCount(for: availableWidth)
  let item = NSCollectionLayoutItem(
    layoutSize: .init(
      widthDimension: .fractionalWidth(1),
      heightDimension: .fractionalHeight(1)
    )
  )
  item.contentInsets = .init(top: 2, leading: 2, bottom: 2, trailing: 2)

  let group = NSCollectionLayoutGroup.horizontal(
    layoutSize: .init(
      widthDimension: .fractionalWidth(1),
      heightDimension: kind == .list ? .absolute(44) : .fractionalWidth(0.2)
    ),
    repeatingSubitem: item,
    count: columns
  )
  return NSCollectionLayoutSection(group: group)
}
```

고정된 기기 이름보다 실제 컨테이너 폭을 기준으로 판단하면 iPad 멀티태스킹과 가변 크기 창에도 자연스럽게 대응해요.

## Item에 Badge를 붙여요

Badge는 item에 딸린 supplementary item이에요. anchor로 item의 어느 모서리에 붙을지 정하고 `fractionalOffset`으로 중심을 바깥쪽으로 이동할 수 있어요.

```swift
let badgeAnchor = NSCollectionLayoutAnchor(
  edges: [.top, .trailing],
  fractionalOffset: CGPoint(x: 0.3, y: -0.3)
)
let badge = NSCollectionLayoutSupplementaryItem(
  layoutSize: .init(
    widthDimension: .absolute(20),
    heightDimension: .absolute(20)
  ),
  elementKind: ElementKind.badge,
  containerAnchor: badgeAnchor
)

let item = NSCollectionLayoutItem(
  layoutSize: .init(
    widthDimension: .fractionalWidth(0.25),
    heightDimension: .fractionalHeight(1)
  ),
  supplementaryItems: [badge]
)
```

실제 badge 뷰는 data source의 `supplementaryViewProvider`가 element kind와 IndexPath를 받아 구성해요.

## Section에 Header와 Footer를 추가해요

section 경계에 붙는 header와 footer는 `NSCollectionLayoutBoundarySupplementaryItem`으로 정의해요. self-sizing을 허용하려면 높이에 `.estimated`를 사용해요.

```swift
let headerFooterSize = NSCollectionLayoutSize(
  widthDimension: .fractionalWidth(1),
  heightDimension: .estimated(44)
)
let header = NSCollectionLayoutBoundarySupplementaryItem(
  layoutSize: headerFooterSize,
  elementKind: ElementKind.header,
  alignment: .top
)
let footer = NSCollectionLayoutBoundarySupplementaryItem(
  layoutSize: headerFooterSize,
  elementKind: ElementKind.footer,
  alignment: .bottom
)
section.boundarySupplementaryItems = [header, footer]
```

Supplementary registration은 재사용 뷰 타입, element kind, 구성 클로저를 묶어요.

```swift
let headerRegistration =
  UICollectionView.SupplementaryRegistration<TitleSupplementaryView>(
    elementKind: ElementKind.header
  ) { view, kind, indexPath in
    view.label.text = "\(kind) · section \(indexPath.section)"
    view.backgroundColor = .secondarySystemBackground
  }
```

```swift
dataSource.supplementaryViewProvider = {
  collectionView, kind, indexPath in
  let registration =
    kind == ElementKind.header ? headerRegistration : footerRegistration
  return collectionView.dequeueConfiguredReusableSupplementary(
    using: registration,
    for: indexPath
  )
}
```

### Header를 section에 고정해요

`pinToVisibleBounds`를 켜면 section 일부가 보이는 동안 header가 화면 경계에 남아요. 다른 셀 위에 그려지도록 `zIndex`도 높여요.

```swift
header.pinToVisibleBounds = true
header.zIndex = 2
section.boundarySupplementaryItems = [header, footer]
```

고정 여부와 관계없이 header/footer 구성은 같은 registration과 `supplementaryViewProvider`를 사용해요.

```swift
dataSource.supplementaryViewProvider = {
  collectionView, kind, indexPath in
  let registration =
    kind == ElementKind.header ? headerRegistration : footerRegistration
  return collectionView.dequeueConfiguredReusableSupplementary(
    using: registration,
    for: indexPath
  )
}
```

## Section 배경을 Decoration View로 꾸며요

Decoration View는 item 데이터와 무관한 시각 요소예요. section에 decoration item을 연결하고, 레이아웃에 해당 element kind의 뷰 클래스를 등록해요.

```swift
let background = NSCollectionLayoutDecorationItem.background(
  elementKind: ElementKind.sectionBackground
)
background.contentInsets = .init(
  top: 5,
  leading: 5,
  bottom: 5,
  trailing: 5
)
section.decorationItems = [background]
```

```swift
let layout = UICollectionViewCompositionalLayout(section: section)
layout.register(
  SectionBackgroundView.self,
  forDecorationViewOfKind: ElementKind.sectionBackground
)
```

Supplementary View는 data source가 제공하지만 Decoration View는 layout이 만들고 관리한다는 차이를 기억하세요.

## Group을 중첩해 사용자 정의 배치를 만들어요

큰 item 하나와 작은 item 두 개를 나란히 놓으려면 작은 item을 세로 group으로 묶은 뒤 큰 item과 함께 가로 group에 넣어요.

```swift
let leadingItem = NSCollectionLayoutItem(
  layoutSize: .init(
    widthDimension: .fractionalWidth(0.7),
    heightDimension: .fractionalHeight(1)
  )
)
leadingItem.contentInsets = .init(
  top: 10,
  leading: 10,
  bottom: 10,
  trailing: 10
)

let trailingItem = NSCollectionLayoutItem(
  layoutSize: .init(
    widthDimension: .fractionalWidth(1),
    heightDimension: .fractionalHeight(0.3)
  )
)
let trailingGroup = NSCollectionLayoutGroup.vertical(
  layoutSize: .init(
    widthDimension: .fractionalWidth(0.3),
    heightDimension: .fractionalHeight(1)
  ),
  repeatingSubitem: trailingItem,
  count: 2
)
let nestedGroup = NSCollectionLayoutGroup.horizontal(
  layoutSize: .init(
    widthDimension: .fractionalWidth(1),
    heightDimension: .fractionalHeight(0.4)
  ),
  subitems: [leadingItem, trailingGroup]
)
```

## Section을 가로로 스크롤해요

전체 layout의 기본 축이 세로라면 특정 section의 `orthogonalScrollingBehavior`를 `.none` 이외의 값으로 바꿔 가로 스크롤을 만들어요.

```swift
section.orthogonalScrollingBehavior = .continuous
```

### 가로 스크롤과 Paging 방식을 선택해요

| 값                                | 동작                                                   |
| --------------------------------- | ------------------------------------------------------ |
| `.continuous`                     | 손가락 이동량만큼 연속으로 스크롤해요.                 |
| `.continuousGroupLeadingBoundary` | 연속 스크롤 뒤 group의 leading 경계에 맞춰 멈춰요.     |
| `.paging`                         | Collection View의 보이는 폭을 한 페이지로 삼아요.      |
| `.groupPaging`                    | group 단위로 페이지를 넘겨요.                          |
| `.groupPagingCentered`            | group 단위로 넘기고 선택된 group을 가운데에 맞춰요.    |
| `.none`                           | 별도의 직교 스크롤 없이 전체 layout의 주축을 따라가요. |

```swift
func behavior(
  for option: ScrollingOption
) -> UICollectionLayoutSectionOrthogonalScrollingBehavior {
  switch option {
  case .continuous: .continuous
  case .leadingBoundary: .continuousGroupLeadingBoundary
  case .page: .paging
  case .groupPage: .groupPaging
  case .centeredGroupPage: .groupPagingCentered
  case .disabled: .none
  }
}
```

## Collection View의 데이터를 업데이트해요

공식 Mountains Search 예제는 검색어가 바뀔 때 이름을 필터링하고, 결과로 새 snapshot을 만든 뒤 적용해요.

```swift
func performQuery(with filter: String?) {
  let mountains = mountainsController
    .filteredMountains(with: filter)
    .sorted { $0.name < $1.name }

  var snapshot =
    NSDiffableDataSourceSnapshot<Section, Mountain>()
  snapshot.appendSections([.main])
  snapshot.appendItems(mountains)
  dataSource.apply(snapshot, animatingDifferences: true)
}
```

snapshot은 새 UI 상태가 되고, Diffable Data Source가 이전 상태와의 차이를 계산해 화면을 갱신해요. 실제 앱에서는 변경 가능한 전체 모델보다 안정적인 `Mountain.ID`를 item 식별자로 사용하는 편이 안전해요.

### 여러 Section의 데이터를 업데이트해요

공식 Wi-Fi 설정 예제는 Wi-Fi가 꺼져 있으면 구성 section만, 켜져 있으면 네트워크 section까지 snapshot에 추가해요.

```swift
let configItems = configurationItems.filter {
  !($0.type == .currentNetwork && !controller.wifiEnabled)
}

var snapshot = NSDiffableDataSourceSnapshot<Section, Item>()
snapshot.appendSections([.config])
snapshot.appendItems(configItems, toSection: .config)

if controller.wifiEnabled {
  let networkItems = controller.availableNetworks
    .sorted { $0.name < $1.name }
    .map(Item.init(network:))
  snapshot.appendSections([.networks])
  snapshot.appendItems(networkItems, toSection: .networks)
}

dataSource.apply(snapshot, animatingDifferences: animated)
```

### 현재 Snapshot을 조금씩 바꿔요

Insertion Sort 시각화 예제는 매 단계마다 빈 snapshot을 만들지 않아요. `dataSource.snapshot()`으로 현재 상태를 가져와 section 하나의 item 순서만 수정해 점진적 진행을 보여 줘요.

```swift
var updatedSnapshot = dataSource.snapshot()

for section in updatedSnapshot.sectionIdentifiers where !section.isSorted {
  section.sortNext()
  let items = section.values
  updatedSnapshot.deleteItems(items)
  updatedSnapshot.appendItems(items, toSection: section)
}

dataSource.apply(updatedSnapshot, animatingDifferences: true)
```

## 간단한 List Layout을 만들어요

시스템 목록 스타일은 `UICollectionLayoutListConfiguration`과 `list(using:)`으로 만들어요. 화면 크기에 맞게 자동으로 적응해요.

```swift
let configuration =
  UICollectionLayoutListConfiguration(appearance: .insetGrouped)
return UICollectionViewCompositionalLayout.list(using: configuration)
```

### List 모양을 선택해요

`.plain`, `.grouped`, `.insetGrouped`, `.sidebar`, `.sidebarPlain` 중 화면 구조에 맞는 appearance를 선택해요. `headerMode = .firstItemInSection`을 사용하면 첫 item을 접고 펼칠 수 있는 section header로 만들 수 있어요.

```swift
var configuration =
  UICollectionLayoutListConfiguration(appearance: appearance)
configuration.headerMode = .firstItemInSection
```

### List Cell을 사용자 정의해요

`UICollectionViewListCell`을 상속한 셀은 `updateConfiguration(using:)`에서 상태별 모양을 계산해요. 시스템이 선택·하이라이트·비활성 같은 state가 바뀔 때 이 메서드를 다시 호출해요.

```swift
override func updateConfiguration(
  using state: UICellConfigurationState
) {
  var content = defaultListContentConfiguration().updated(for: state)
  content.text = item?.title
  content.secondaryText = item?.subtitle
  contentConfiguration = content
}
```

사용자 정의 image view와 label도 시스템 value cell configuration의 font·tint 같은 metric을 재사용하면 기본 목록과 일관된 모양을 만들 수 있어요.

```swift
let valueConfiguration =
  UIListContentConfiguration.valueCell().updated(for: state)
categoryIconView.tintColor =
  valueConfiguration.imageProperties.resolvedTintColor(for: tintColor)
categoryIconView.preferredSymbolConfiguration = .init(
  font: valueConfiguration.secondaryTextProperties.font,
  scale: .small
)
```

Cell registration은 item을 셀에 전달하고 accessory를 구성해요.

```swift
let registration =
  UICollectionView.CellRegistration<CustomListCell, Item> {
    cell, _, item in
    cell.update(with: item)
    cell.accessories = [.disclosureIndicator()]
  }
```

```swift
return collectionView.dequeueConfiguredReusableCell(
  using: registration,
  for: indexPath,
  item: item
)
```

## 여러 Section 유형을 한 Layout에 조합해요

공식 Emoji Explorer 예제는 한 Compositional Layout 안에 다음 세 section을 넣어요.

- 최근 Emoji를 보여 주는 가로 스크롤 grid
- 펼치고 접는 계층형 outline
- swipe action을 제공하는 일반 list

가로 section에는 직교 스크롤을 적용해요.

```swift
section.orthogonalScrollingBehavior =
  .continuousGroupLeadingBoundary
```

Outline은 section snapshot에 root와 child 관계를 표현해요.

```swift
let root = Item(title: category.name, hasChildren: true)
outlineSnapshot.append([root])

let children = category.emojis.map(Item.init(emoji:))
outlineSnapshot.append(children, to: root)
outlineSnapshot.expand([root])
```

List section은 configuration에서 leading swipe action을 제공할 수 있어요.

```swift
configuration.leadingSwipeActionsConfigurationProvider = {
  [weak self] indexPath in
  guard
    let self,
    let item = dataSource.itemIdentifier(for: indexPath)
  else { return nil }
  return leadingSwipeActionConfiguration(for: item)
}
```

Cell provider는 현재 section에 맞는 registration을 골라요.

```swift
switch section {
case .recents:
  return collectionView.dequeueConfiguredReusableCell(
    using: gridRegistration,
    for: indexPath,
    item: item.emoji
  )
case .list:
  return collectionView.dequeueConfiguredReusableCell(
    using: listRegistration,
    for: indexPath,
    item: item
  )
case .outline:
  if item.hasChildren {
    return collectionView.dequeueConfiguredReusableCell(
      using: outlineHeaderRegistration,
      for: indexPath,
      item: item.title
    )
  } else {
    return collectionView.dequeueConfiguredReusableCell(
      using: outlineItemRegistration,
      for: indexPath,
      item: item.emoji
    )
  }
}
```

### Value Cell 목록을 만들어요

설정 화면처럼 왼쪽에 제목, 오른쪽에 값을 표시하려면 `.valueCell()`의 기본 스타일을 사용해요.

```swift
var content = UIListContentConfiguration.valueCell()
content.text = emoji.text
content.secondaryText = emoji.category.description
cell.contentConfiguration = content
```

## 전체 연결 순서

1. section별 item·group·section 구조로 layout을 만들어요.
2. badge·header·footer·decoration처럼 셀 이외의 요소를 layout에 정의해요.
3. cell/supplementary registration으로 재사용 뷰의 구성 규칙을 만들어요.
4. Diffable Data Source의 provider에서 식별자를 최신 모델로 바꿔 registration에 전달해요.
5. snapshot으로 최초 상태와 이후 변경을 적용해요.
6. 컨테이너 크기, 선택·하이라이트, 셀 재사용, 가로 스크롤을 각각 확인해요.

## 참고 자료

- [Apple Developer Documentation — Implementing modern collection views](https://developer.apple.com/documentation/uikit/implementing-modern-collection-views)
- [Diffable Data Source로 Collection View 업데이트하기](./updating-collection-views-using-diffable-data-sources)
- [Layouts](./layouts/index)
- [Collection Views 한눈에 보기](./index)
