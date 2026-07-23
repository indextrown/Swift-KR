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

## 개요 (Overview)

Collection View는 같은 데이터도 grid, list, 가로 carousel, 계층형 outline처럼 다양한 형태로 표현할 수 있어요. 공식 샘플은 다음 두 기술을 중심으로 여러 화면을 만들어요.

- `UICollectionViewCompositionalLayout`: 빠르고 유연하게 시각적 배치를 조합해요.
- `UICollectionViewDiffableDataSource`: snapshot의 차이를 계산해 데이터와 UI를 갱신해요.

샘플 프로젝트는 iOS와 macOS target을 함께 제공해요. 이 문서는 UIKit을 사용하는 iOS 코드를 기준으로 설명해요.

### 샘플 코드 프로젝트 구성하기 (Configure the sample code project)

Xcode에서 샘플 프로젝트를 실행할 때는 먼저 iOS 예제와 macOS 예제 중 어느 쪽을 볼지 선택해요.

iOS 예제를 보려면 다음 순서로 실행해요.

1. **Modern Collection Views** target을 선택해요.
2. Scheme 메뉴에서 앱을 실행할 iOS Simulator를 선택해요.

macOS 예제를 보려면 다음 순서로 실행해요.

1. **Modern Collection Views Mac** target을 선택해요.
2. Scheme 메뉴에서 **My Mac**을 선택해요.
3. target의 Build Settings에서 **Signing & Capabilities > Signing Certificate**로 이동한 다음 **Sign to Run Locally**를 선택해요.
4. 앱을 실행하고 Example 메뉴에서 원하는 예제로 이동해요.

이 문서에 나오는 코드는 iOS target의 예제예요. 같은 기능의 macOS 코드는 macOS target에 포함된 `.swift` 파일에서 확인할 수 있어요.

### Grid Layout 만들기 (Create a grid layout)

폭이 같은 item 다섯 개를 한 행에 배치하려면 item 폭을 group의 20%로 만들고, group은 section 폭 전체를 사용하게 해요. group 높이를 폭의 20%로 잡으면 정사각형에 가까운 다섯 칸 행이 만들어져요.

```swift
let itemSize = NSCollectionLayoutSize(widthDimension: .fractionalWidth(0.2),
                                     heightDimension: .fractionalHeight(1.0))
let item = NSCollectionLayoutItem(layoutSize: itemSize)

let groupSize = NSCollectionLayoutSize(widthDimension: .fractionalWidth(1.0),
                                      heightDimension: .fractionalWidth(0.2))
let group = NSCollectionLayoutGroup.horizontal(layoutSize: groupSize,
                                                 subitems: [item])

let section = NSCollectionLayoutSection(group: group)

let layout = UICollectionViewCompositionalLayout(section: section)
return layout
```

### Item 둘레에 간격 추가하기 (Add spacing around items)

`contentInsets`는 item의 frame 안쪽을 줄여 셀 사이에 시각적 여백을 만들어요.

```swift
let itemSize = NSCollectionLayoutSize(widthDimension: .fractionalWidth(0.2),
                                     heightDimension: .fractionalHeight(1.0))
let item = NSCollectionLayoutItem(layoutSize: itemSize)
item.contentInsets = NSDirectionalEdgeInsets(top: 5, leading: 5, bottom: 5, trailing: 5)
```

### Column Layout 만들기 (Create a column layout)

한 행의 열 개수가 핵심이라면 `repeatingSubitem:count:`를 사용해요. 이때 item의 fractional width보다 `count`가 우선하고, group이 실제 item 폭을 계산해요.

```swift
let itemSize = NSCollectionLayoutSize(widthDimension: .fractionalWidth(1.0),
                                     heightDimension: .fractionalHeight(1.0))
let item = NSCollectionLayoutItem(layoutSize: itemSize)

let groupSize = NSCollectionLayoutSize(widthDimension: .fractionalWidth(1.0),
                                      heightDimension: .absolute(44))
let group = NSCollectionLayoutGroup.horizontal(layoutSize: groupSize, repeatingSubitem: item, count: 2)
let spacing = CGFloat(10)
group.interItemSpacing = .fixed(spacing)
```

### Section마다 서로 다른 Layout 표시하기 (Display distinct layouts per section)

여러 section을 서로 다르게 배치하려면 section provider를 사용해요. provider는 현재 section index와 layout environment를 받고 해당 section의 레이아웃을 반환해요.

```swift
let layout = UICollectionViewCompositionalLayout { (sectionIndex: Int,
    layoutEnvironment: NSCollectionLayoutEnvironment) -> NSCollectionLayoutSection? in

    guard let sectionLayoutKind = SectionLayoutKind(rawValue: sectionIndex) else { return nil }
    let columns = sectionLayoutKind.columnCount

    // The group auto-calculates the actual item width to make
    // the requested number of columns fit, so this widthDimension is ignored.
    let itemSize = NSCollectionLayoutSize(widthDimension: .fractionalWidth(1.0),
                                         heightDimension: .fractionalHeight(1.0))
    let item = NSCollectionLayoutItem(layoutSize: itemSize)
    item.contentInsets = NSDirectionalEdgeInsets(top: 2, leading: 2, bottom: 2, trailing: 2)

    let groupHeight = columns == 1 ?
        NSCollectionLayoutDimension.absolute(44) :
        NSCollectionLayoutDimension.fractionalWidth(0.2)
    let groupSize = NSCollectionLayoutSize(widthDimension: .fractionalWidth(1.0),
                                          heightDimension: groupHeight)
    let group = NSCollectionLayoutGroup.horizontal(layoutSize: groupSize, repeatingSubitem: item, count: columns)

    let section = NSCollectionLayoutSection(group: group)
    section.contentInsets = NSDirectionalEdgeInsets(top: 20, leading: 20, bottom: 20, trailing: 20)
    return section
}
return layout
```

### 환경마다 서로 다른 Layout 표시하기 (Display distinct layouts in different environments)

회전, Split View, 창 크기 변경처럼 사용 가능한 폭이 달라질 때 `layoutEnvironment.container.effectiveContentSize`를 확인해 열 개수를 바꿀 수 있어요.

```swift
let layout = UICollectionViewCompositionalLayout {
    (sectionIndex: Int, layoutEnvironment: NSCollectionLayoutEnvironment) -> NSCollectionLayoutSection? in
    guard let layoutKind = SectionLayoutKind(rawValue: sectionIndex) else { return nil }

    let columns = layoutKind.columnCount(for: layoutEnvironment.container.effectiveContentSize.width)

    let itemSize = NSCollectionLayoutSize(widthDimension: .fractionalWidth(0.2),
                                         heightDimension: .fractionalHeight(1.0))
    let item = NSCollectionLayoutItem(layoutSize: itemSize)
    item.contentInsets = NSDirectionalEdgeInsets(top: 2, leading: 2, bottom: 2, trailing: 2)

    let groupHeight = layoutKind == .list ?
        NSCollectionLayoutDimension.absolute(44) : NSCollectionLayoutDimension.fractionalWidth(0.2)
    let groupSize = NSCollectionLayoutSize(widthDimension: .fractionalWidth(1.0),
                                           heightDimension: groupHeight)
    let group = NSCollectionLayoutGroup.horizontal(layoutSize: groupSize, repeatingSubitem: item, count: columns)
    let section = NSCollectionLayoutSection(group: group)
    section.contentInsets = NSDirectionalEdgeInsets(top: 20, leading: 20, bottom: 20, trailing: 20)
    return section
}
return layout
```

고정된 기기 이름보다 실제 컨테이너 폭을 기준으로 판단하면 iPad 멀티태스킹과 가변 크기 창에도 자연스럽게 대응해요.

### Item에 Badge 추가하기 (Add badges to items)

Badge는 item에 딸린 supplementary item이에요. anchor로 item의 어느 모서리에 붙을지 정하고 `fractionalOffset`으로 중심을 바깥쪽으로 이동할 수 있어요.

```swift
let badgeAnchor = NSCollectionLayoutAnchor(edges: [.top, .trailing], fractionalOffset: CGPoint(x: 0.3, y: -0.3))
let badgeSize = NSCollectionLayoutSize(widthDimension: .absolute(20),
                                      heightDimension: .absolute(20))
let badge = NSCollectionLayoutSupplementaryItem(
    layoutSize: badgeSize,
    elementKind: ItemBadgeSupplementaryViewController.badgeElementKind,
    containerAnchor: badgeAnchor)

let itemSize = NSCollectionLayoutSize(widthDimension: .fractionalWidth(0.25),
                                     heightDimension: .fractionalHeight(1.0))
let item = NSCollectionLayoutItem(layoutSize: itemSize, supplementaryItems: [badge])
item.contentInsets = NSDirectionalEdgeInsets(top: 5, leading: 5, bottom: 5, trailing: 5)
```

실제 badge 뷰는 data source의 `supplementaryViewProvider`가 element kind와 IndexPath를 받아 구성해요.

### Section에 Header와 Footer 추가하기 (Add headers and footers to sections)

section 경계에 붙는 header와 footer는 `NSCollectionLayoutBoundarySupplementaryItem`으로 정의해요. self-sizing을 허용하려면 높이에 `.estimated`를 사용해요.

```swift
let headerFooterSize = NSCollectionLayoutSize(widthDimension: .fractionalWidth(1.0),
                                             heightDimension: .estimated(44))
let sectionHeader = NSCollectionLayoutBoundarySupplementaryItem(
    layoutSize: headerFooterSize,
    elementKind: SectionHeadersFootersViewController.sectionHeaderElementKind, alignment: .top)
let sectionFooter = NSCollectionLayoutBoundarySupplementaryItem(
    layoutSize: headerFooterSize,
    elementKind: SectionHeadersFootersViewController.sectionFooterElementKind, alignment: .bottom)
section.boundarySupplementaryItems = [sectionHeader, sectionFooter]
```

Supplementary registration은 재사용 뷰 타입, element kind, 구성 클로저를 묶어요.

```swift
let headerRegistration = UICollectionView.SupplementaryRegistration
<TitleSupplementaryView>(elementKind: SectionHeadersFootersViewController.sectionHeaderElementKind) {
    (supplementaryView, string, indexPath) in
    supplementaryView.label.text = "\(string) for section \(indexPath.section)"
    supplementaryView.backgroundColor = .lightGray
    supplementaryView.layer.borderColor = UIColor.black.cgColor
    supplementaryView.layer.borderWidth = 1.0
}
```

```swift
dataSource.supplementaryViewProvider = { (view, kind, index) in
    return self.collectionView.dequeueConfiguredReusableSupplementary(
        using: kind == SectionHeadersFootersViewController.sectionHeaderElementKind ? headerRegistration : footerRegistration, for: index)
}
```

### Section Header를 Section에 고정하기 (Pin section headers to sections)

`pinToVisibleBounds`를 켜면 section 일부가 보이는 동안 header가 화면 경계에 남아요. 다른 셀 위에 그려지도록 `zIndex`도 높여요.

```swift
let sectionHeader = NSCollectionLayoutBoundarySupplementaryItem(
    layoutSize: NSCollectionLayoutSize(widthDimension: .fractionalWidth(1.0),
                                      heightDimension: .estimated(44)),
    elementKind: PinnedSectionHeaderFooterViewController.sectionHeaderElementKind,
    alignment: .top)
let sectionFooter = NSCollectionLayoutBoundarySupplementaryItem(
    layoutSize: NSCollectionLayoutSize(widthDimension: .fractionalWidth(1.0),
                                      heightDimension: .estimated(44)),
    elementKind: PinnedSectionHeaderFooterViewController.sectionFooterElementKind,
    alignment: .bottom)
sectionHeader.pinToVisibleBounds = true
sectionHeader.zIndex = 2
section.boundarySupplementaryItems = [sectionHeader, sectionFooter]
```

고정 여부와 관계없이 header/footer 구성은 같은 registration과 `supplementaryViewProvider`를 사용해요.

```swift
dataSource.supplementaryViewProvider = { (view, kind, index) in
    return self.collectionView.dequeueConfiguredReusableSupplementary(
        using: kind == PinnedSectionHeaderFooterViewController.sectionHeaderElementKind ? headerRegistration : footerRegistration, for: index)
}
```

### Section을 배경으로 꾸미기 (Decorate sections with backgrounds)

Decoration View는 item 데이터와 무관한 시각 요소예요. section에 decoration item을 연결하고, 레이아웃에 해당 element kind의 뷰 클래스를 등록해요.

```swift
let sectionBackgroundDecoration = NSCollectionLayoutDecorationItem.background(
    elementKind: SectionDecorationViewController.sectionBackgroundDecorationElementKind)
sectionBackgroundDecoration.contentInsets = NSDirectionalEdgeInsets(top: 5, leading: 5, bottom: 5, trailing: 5)
section.decorationItems = [sectionBackgroundDecoration]
```

```swift
let layout = UICollectionViewCompositionalLayout(section: section)
layout.register(
    SectionBackgroundDecorationView.self,
    forDecorationViewOfKind: SectionDecorationViewController.sectionBackgroundDecorationElementKind)
return layout
```

Supplementary View는 data source가 제공하지만 Decoration View는 layout이 만들고 관리한다는 차이를 기억하세요.

### Group을 중첩해 사용자 정의 Layout 만들기 (Create custom layouts by nesting groups)

큰 item 하나와 작은 item 두 개를 나란히 놓으려면 작은 item을 세로 group으로 묶은 뒤 큰 item과 함께 가로 group에 넣어요.

```swift
let leadingItem = NSCollectionLayoutItem(
    layoutSize: NSCollectionLayoutSize(widthDimension: .fractionalWidth(0.7),
                                      heightDimension: .fractionalHeight(1.0)))
leadingItem.contentInsets = NSDirectionalEdgeInsets(top: 10, leading: 10, bottom: 10, trailing: 10)

let trailingItem = NSCollectionLayoutItem(
    layoutSize: NSCollectionLayoutSize(widthDimension: .fractionalWidth(1.0),
                                      heightDimension: .fractionalHeight(0.3)))
trailingItem.contentInsets = NSDirectionalEdgeInsets(top: 10, leading: 10, bottom: 10, trailing: 10)
let trailingGroup = NSCollectionLayoutGroup.vertical(
    layoutSize: NSCollectionLayoutSize(widthDimension: .fractionalWidth(0.3),
                                       heightDimension: .fractionalHeight(1.0)),
    repeatingSubitem: trailingItem,
    count: 2)
let nestedGroup = NSCollectionLayoutGroup.horizontal(
    layoutSize: NSCollectionLayoutSize(widthDimension: .fractionalWidth(1.0),
                                      heightDimension: .fractionalHeight(0.4)),
    subitems: [leadingItem, trailingGroup])
```

### Section을 가로로 스크롤하기 (Scroll sections horizontally)

전체 layout의 기본 축이 세로라면 특정 section의 `orthogonalScrollingBehavior`를 `.none` 이외의 값으로 바꿔 가로 스크롤을 만들어요.

```swift
section.orthogonalScrollingBehavior = .continuous
```

### 가로 스크롤과 Paging 동작 선택하기 (Choose horizontal scrolling and paging behavior)

| 값                                | 동작                                                   |
| --------------------------------- | ------------------------------------------------------ |
| `.continuous`                     | 손가락 이동량만큼 연속으로 스크롤해요.                 |
| `.continuousGroupLeadingBoundary` | 연속 스크롤 뒤 group의 leading 경계에 맞춰 멈춰요.     |
| `.paging`                         | Collection View의 보이는 폭을 한 페이지로 삼아요.      |
| `.groupPaging`                    | group 단위로 페이지를 넘겨요.                          |
| `.groupPagingCentered`            | group 단위로 넘기고 선택된 group을 가운데에 맞춰요.    |
| `.none`                           | 별도의 직교 스크롤 없이 전체 layout의 주축을 따라가요. |

```swift
case continuous, continuousGroupLeadingBoundary, paging, groupPaging, groupPagingCentered, none
func orthogonalScrollingBehavior() -> UICollectionLayoutSectionOrthogonalScrollingBehavior {
    switch self {
    case .none:
        return UICollectionLayoutSectionOrthogonalScrollingBehavior.none
    case .continuous:
        return UICollectionLayoutSectionOrthogonalScrollingBehavior.continuous
    case .continuousGroupLeadingBoundary:
        return UICollectionLayoutSectionOrthogonalScrollingBehavior.continuousGroupLeadingBoundary
    case .paging:
        return UICollectionLayoutSectionOrthogonalScrollingBehavior.paging
    case .groupPaging:
        return UICollectionLayoutSectionOrthogonalScrollingBehavior.groupPaging
    case .groupPagingCentered:
        return UICollectionLayoutSectionOrthogonalScrollingBehavior.groupPagingCentered
    }
}
```

### Collection View 데이터 업데이트하기 (Update data in a collection view)

공식 Mountains Search 예제는 사용자가 데이터를 필터링할 때 Collection View의 데이터와 화면을 갱신하는 방법을 보여 줘요. 산 이름 목록과 검색창을 표시하고, 사용자가 입력한 텍스트가 이름에 포함된 산만 남겨요.

이 예제의 `mountainsCollectionView`에는 산의 원시 데이터를 `MountainsController.Mountain` 구조체로 표현한 item과 하나의 section이 있어요. `Mountain` item을 저장하는 Diffable Data Source를 Collection View에 연결하고, 산 이름을 표시하는 `LabelCell`을 등록해 각 셀을 구성해요.

`performQuery(with:)`은 현재 검색어가 이름에 포함된 산의 목록을 만들고, 필터링된 결과를 새 snapshot으로 표현해 데이터와 화면을 갱신해요. Snapshot의 section은 이전과 같지만 모든 산 대신 필터링된 산만 item으로 포함해요.

```swift
func performQuery(with filter: String?) {
    let mountains = mountainsController.filteredMountains(with: filter).sorted { $0.name < $1.name }

    var snapshot = NSDiffableDataSourceSnapshot<Section, MountainsController.Mountain>()
    snapshot.appendSections([.main])
    snapshot.appendItems(mountains)
    dataSource.apply(snapshot, animatingDifferences: true)
}
```

마지막으로 `apply(_:animatingDifferences:completion:)`으로 snapshot을 적용해요. Diffable Data Source는 snapshot의 데이터를 새 상태로 저장하고 이전 상태와의 차이를 계산한 뒤 화면이 새 상태를 표시하도록 갱신해요.

### 여러 Section의 데이터 업데이트하기 (Update data in multiple sections)

공식 Wi-Fi 설정 예제는 Wi-Fi가 꺼져 있으면 구성 section만, 켜져 있으면 네트워크 section까지 snapshot에 추가해요.

```swift
let configItems = configurationItems.filter { !($0.type == .currentNetwork && !controller.wifiEnabled) }

currentSnapshot = NSDiffableDataSourceSnapshot<Section, Item>()

currentSnapshot.appendSections([.config])
currentSnapshot.appendItems(configItems, toSection: .config)

if controller.wifiEnabled {
    let sortedNetworks = controller.availableNetworks.sorted { $0.name < $1.name }
    let networkItems = sortedNetworks.map { Item(network: $0) }
    currentSnapshot.appendSections([.networks])
    currentSnapshot.appendItems(networkItems, toSection: .networks)
}

self.dataSource.apply(currentSnapshot, animatingDifferences: animated)
```

이 예제는 현재 Wi-Fi 상태로 표시할 section과 item을 모두 구성한 뒤 하나의 snapshot을 적용하므로, 여러 section의 추가·삭제도 같은 상태 변경으로 처리해요.

### 데이터를 점진적으로 업데이트하기 (Update data incrementally)

Insertion Sort 시각화 예제는 매 단계마다 빈 snapshot을 만들지 않아요. `dataSource.snapshot()`으로 현재 상태를 가져와 section 하나의 item 순서만 수정해 점진적 진행을 보여 줘요.

```swift
// Get the current state of the UI from the data source.
var updatedSnapshot = dataSource.snapshot()

// For each section, if needed, step through and perform the next sorting step.
updatedSnapshot.sectionIdentifiers.forEach {
    let section = $0
    if !section.isSorted {

        // Step the sort algorithm.
        section.sortNext()
        let items = section.values

        // Replace the items for this section with the newly sorted items.
        updatedSnapshot.deleteItems(items)
        updatedSnapshot.appendItems(items, toSection: section)

        sectionCountNeedingSort += 1
    }
}
```

현재 snapshot에서 필요한 item만 삭제하고 새 순서로 다시 추가한 뒤 적용하면, Diffable Data Source가 각 정렬 단계의 차이를 계산해 점진적으로 화면에 반영해요.

### 간단한 List Layout 만들기 (Create a simple list layout)

시스템 목록 스타일은 `UICollectionLayoutListConfiguration`과 `list(using:)`으로 만들어요. 화면 크기에 맞게 자동으로 적응해요.

```swift
let config = UICollectionLayoutListConfiguration(appearance: .insetGrouped)
return UICollectionViewCompositionalLayout.list(using: config)
```

### List 모양 선택하기 (Choose a list appearance)

`.plain`, `.grouped`, `.insetGrouped`, `.sidebar`, `.sidebarPlain` 중 화면 구조에 맞는 appearance를 선택해요. `headerMode = .firstItemInSection`을 사용하면 첫 item을 접고 펼칠 수 있는 section header로 만들 수 있어요.

```swift
var config = UICollectionLayoutListConfiguration(appearance: self.appearance)
config.headerMode = .firstItemInSection
```

### List Cell 사용자 정의하기 (Customize list cells)

List with Custom Cells 예제는 `UICollectionViewListCell`의 사용자 정의 하위 클래스인 `CustomListCell`을 구성하는 방법을 보여 줘요. 이 셀은 여러 종류의 subview를 하나의 셀에 배치하고 content configuration으로 각 뷰의 모양과 내용을 설정해요.

`updateConfiguration(using:)`은 셀의 최초 모양과 내용을 설정해요. 시스템은 선택·하이라이트·비활성 같은 configuration state가 바뀔 때마다 새 상태에 맞춰 셀 모양을 갱신하도록 이 메서드를 호출해요. List content view를 구성하기 위해 현재 상태의 기본 List content configuration을 가져와요.

```swift
var content = defaultListContentConfiguration().updated(for: state)
```

그다음 configuration의 값을 사용자 정의하고 List content view의 `configuration`에 할당해요.

사용자 정의 image view와 label에는 현재 상태의 기본 value cell configuration을 가져와요. 이 configuration에 미리 설정된 font, tint, 크기 같은 style과 metric을 사용자 정의 뷰에 복사하면 시스템 List 스타일과 일관된 모양을 만들 수 있어요.

```swift
categoryIconView.tintColor = valueConfiguration.imageProperties.resolvedTintColor(for: tintColor)
categoryIconView.preferredSymbolConfiguration = .init(font: valueConfiguration.secondaryTextProperties.font, scale: .small)
```

Cell registration은 item을 셀에 전달하고 accessory를 구성해요.

```swift
let cellRegistration = UICollectionView.CellRegistration<CustomListCell, Item> { (cell, indexPath, item) in
    cell.updateWithItem(item)
    cell.accessories = [.disclosureIndicator()]
}
```

Diffable Data Source는 셀을 dequeue할 때 이 Cell Registration을 사용해 item 데이터로 셀을 구성해요.

```swift
return collectionView.dequeueConfiguredReusableCell(using: cellRegistration, for: indexPath, item: item)
```

### 여러 Section 유형으로 Layout 만들기 (Build a layout with multiple section types)

공식 Emoji Explorer 예제는 한 Compositional Layout 안에 다음 세 section을 넣어요.

- 최근 Emoji를 보여 주는 가로 스크롤 grid
- 펼치고 접는 계층형 outline
- swipe action을 제공하는 일반 list

가로 section에는 직교 스크롤을 적용해요.

```swift
section.orthogonalScrollingBehavior = .continuousGroupLeadingBoundary
```

Outline은 section snapshot에 root와 child 관계를 표현해요.

```swift
let rootItem = Item(title: String(describing: category), hasChildren: true)
outlineSnapshot.append([rootItem])
let outlineItems = category.emojis.map { Item(emoji: $0) }
outlineSnapshot.append(outlineItems, to: rootItem)
```

List section은 configuration에서 leading swipe action을 제공할 수 있어요.

```swift
configuration.leadingSwipeActionsConfigurationProvider = { [weak self] (indexPath) in
    guard let self = self else { return nil }
    guard let item = self.dataSource.itemIdentifier(for: indexPath) else { return nil }
    return self.leadingSwipeActionConfigurationForListCellItem(item)
}
```

Cell provider는 현재 section에 맞는 registration을 골라요.

```swift
switch section {
case .recents:
    return collectionView.dequeueConfiguredReusableCell(using: gridCellRegistration, for: indexPath, item: item.emoji)
case .list:
    return collectionView.dequeueConfiguredReusableCell(using: listCellRegistration, for: indexPath, item: item)
case .outline:
    if item.hasChildren {
        return collectionView.dequeueConfiguredReusableCell(using: outlineHeaderCellRegistration, for: indexPath, item: item.title!)
    } else {
        return collectionView.dequeueConfiguredReusableCell(using: outlineCellRegistration, for: indexPath, item: item.emoji)
    }
}
```

### Value Cell List 만들기 (Create a value cell list)

설정 화면처럼 왼쪽에 제목, 오른쪽에 값을 표시하려면 `.valueCell()`의 기본 스타일을 사용해요.

```swift
var contentConfiguration = UIListContentConfiguration.valueCell()
contentConfiguration.text = emoji.text
contentConfiguration.secondaryText = String(describing: emoji.category)
cell.contentConfiguration = contentConfiguration
```

## Swift-KR 보충: 전체 연결 순서

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
