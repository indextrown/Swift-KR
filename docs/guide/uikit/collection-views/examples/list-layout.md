---
title: 'UICollectionView List Layout 예제'
description: 'UICollectionLayoutListConfiguration과 UICollectionViewListCell로 설정형 목록을 만들고, Diffable Data Source·accessory·swipe action·section별 appearance를 연결합니다.'
---

# UICollectionView List Layout 예제

> **면접 답변 한 줄 요약:** Collection View의 List Layout은 `UICollectionLayoutListConfiguration`을 Compositional Layout에 적용해 표준 목록 모양·구분선·accessory·swipe action을 Collection View의 재사용과 Diffable 갱신 방식으로 구현해요.

List Layout은 `UITableView`처럼 보이는 목록을 Collection View로 만들 때 사용하는 Compositional Layout의 편의 API예요. iOS 14 이상에서 `UICollectionViewListCell`과 함께 사용하면 설정 화면, 사이드바, 계층형 목록을 일관된 방식으로 구성할 수 있어요.

## 먼저 알아둘 용어

| 용어                  | 쉬운 뜻                                                                              |
| --------------------- | ------------------------------------------------------------------------------------ |
| list appearance       | `.plain`, `.grouped`, `.insetGrouped`, `.sidebar`처럼 목록의 기본 시각 스타일이에요. |
| list configuration    | Appearance, 구분선, header·footer, swipe action 정책을 모은 값이에요.                |
| list cell             | 제목·부제·이미지·accessory 구성을 지원하는 Collection View 전용 표준 셀이에요.       |
| accessory             | Disclosure indicator, checkmark처럼 셀 오른쪽이나 왼쪽에 붙는 보조 요소예요.         |
| content configuration | 셀의 제목·이미지·색처럼 표시 내용을 값으로 구성하는 UIKit 방식이에요.                |

## 가장 작은 List Layout을 만들어요

```swift
private func makeListLayout()
  -> UICollectionViewCompositionalLayout
{
  var configuration = UICollectionLayoutListConfiguration(
    appearance: .insetGrouped
  )
  configuration.headerMode = .supplementary
  configuration.showsSeparators = true

  return UICollectionViewCompositionalLayout.list(
    using: configuration
  )
}
```

`UICollectionViewCompositionalLayout.list(using:)`은 모든 section에 같은 list configuration을 적용해요. 한 화면에 목록 section만 있고 모양도 같다면 가장 짧은 출발점이에요.

## 화면 Section과 Item ID를 정의해요

```swift
enum SettingsSection: Hashable {
  case account
  case display
}

enum SettingsItem: Hashable {
  case profile
  case notifications
  case darkMode

  var title: String {
    switch self {
    case .profile:
      "프로필"
    case .notifications:
      "알림"
    case .darkMode:
      "화면 모드"
    }
  }

  var symbolName: String {
    switch self {
    case .profile:
      "person.crop.circle"
    case .notifications:
      "bell"
    case .darkMode:
      "circle.lefthalf.filled"
    }
  }
}
```

Snapshot에는 현재 위치가 아니라 안정적인 enum case를 넣어요. 항목이 이동해도 선택과 셀 상태가 같은 ID에 연결돼요.

## List Cell Registration을 만들어요

```swift
private let cellRegistration =
  UICollectionView.CellRegistration<
    UICollectionViewListCell,
    SettingsItem
  > { cell, _, item in
    var content = cell.defaultContentConfiguration()
    content.text = item.title
    content.image = UIImage(systemName: item.symbolName)
    cell.contentConfiguration = content

    switch item {
    case .profile:
      cell.accessories = [.disclosureIndicator()]
    case .notifications:
      cell.accessories = [
        .label(text: "켜짐"),
        .disclosureIndicator(),
      ]
    case .darkMode:
      cell.accessories = [.checkmark()]
    }
  }
```

셀의 subview를 직접 추가하지 않고 content와 accessory configuration을 값으로 지정해요. 재사용될 때 registration closure가 새 item의 전체 상태를 다시 덮어쓰므로 이전 accessory가 남지 않아요.

## Diffable Data Source와 연결해요

```swift
private lazy var dataSource =
  UICollectionViewDiffableDataSource<
    SettingsSection,
    SettingsItem
  >(
    collectionView: collectionView
  ) { [weak self] collectionView, indexPath, item in
    guard let self else {
      return nil
    }

    return collectionView.dequeueConfiguredReusableCell(
      using: cellRegistration,
      for: indexPath,
      item: item
    )
  }
```

초기 snapshot은 section과 item 순서를 명시해요.

```swift
private func applyInitialSnapshot() {
  var snapshot = NSDiffableDataSourceSnapshot<
    SettingsSection,
    SettingsItem
  >()

  snapshot.appendSections([.account, .display])
  snapshot.appendItems(
    [.profile, .notifications],
    toSection: .account
  )
  snapshot.appendItems(
    [.darkMode],
    toSection: .display
  )

  dataSource.apply(
    snapshot,
    animatingDifferences: false
  )
}
```

## Swipe Action을 Configuration에 추가해요

```swift
private func makeEditableListLayout()
  -> UICollectionViewCompositionalLayout
{
  var configuration = UICollectionLayoutListConfiguration(
    appearance: .insetGrouped
  )

  configuration.trailingSwipeActionsConfigurationProvider = {
    [weak self] indexPath in
    guard
      let self,
      let item = dataSource.itemIdentifier(
        for: indexPath
      )
    else {
      return nil
    }

    let reset = UIContextualAction(
      style: .normal,
      title: "초기화"
    ) { [weak self] _, _, completion in
      self?.reset(item)
      completion(true)
    }
    reset.backgroundColor = .systemOrange

    return UISwipeActionsConfiguration(
      actions: [reset]
    )
  }

  return UICollectionViewCompositionalLayout.list(
    using: configuration
  )
}
```

Swipe action closure가 받은 `IndexPath`를 즉시 Diffable identifier로 바꿔요. Action이 실행될 때 화면 순서가 달라져도 `SettingsItem`으로 올바른 모델을 갱신할 수 있어요.

`reset(_:)`은 해당 item의 backing store를 초기화한 뒤 현재 snapshot에서 item을 `reconfigureItems(_:)`로 표시 갱신하는 화면 helper라고 가정했어요.

## Section마다 다른 List 모양을 사용해요

범위를 벗어난 section index를 안전하게 처리할 작은 extension을 먼저 추가해요.

```swift
extension Collection {
  subscript(safe index: Index) -> Element? {
    indices.contains(index) ? self[index] : nil
  }
}
```

```swift
private func makeSectionedListLayout()
  -> UICollectionViewCompositionalLayout
{
  UICollectionViewCompositionalLayout {
    [weak self] sectionIndex, environment in
    guard
      let self,
      let sectionID = dataSource.snapshot()
        .sectionIdentifiers[safe: sectionIndex]
    else {
      return nil
    }

    let appearance: UICollectionLayoutListConfiguration.Appearance =
      sectionID == .account ? .insetGrouped : .plain
    let configuration = UICollectionLayoutListConfiguration(
      appearance: appearance
    )

    return NSCollectionLayoutSection.list(
      using: configuration,
      layoutEnvironment: environment
    )
  }
}
```

Section provider index는 현재 snapshot의 section 순서로 해석해요. 위 예제의 `[safe:]`는 범위를 확인해 optional element를 반환하는 배열 extension이라고 가정해요.

## List Layout과 일반 Compositional Layout을 비교해요

| 요구사항                             | List Layout                                     | 일반 Compositional Layout                 |
| ------------------------------------ | ----------------------------------------------- | ----------------------------------------- |
| 설정·메뉴 같은 한 열 목록            | 표준 모양과 accessory를 빠르게 구성해요.        | Item·group 크기를 직접 구성해야 해요.     |
| Swipe action                         | List configuration에서 바로 제공해요.           | 별도 interaction 설계가 필요할 수 있어요. |
| App Store형 카드와 격자              | 목적에 맞지 않아요.                             | Section별 group을 조합하기 좋아요.        |
| 목록과 카드 section을 한 화면에 혼합 | Section provider에서 list section으로 사용해요. | 다른 section과 함께 조합할 수 있어요.     |

## 자주 발생하는 문제를 점검해요

| 증상                                  | 먼저 확인할 것                                                                 |
| ------------------------------------- | ------------------------------------------------------------------------------ |
| List Cell이 일반 빈 셀처럼 보여요.    | `UICollectionViewListCell`과 content configuration을 사용했는지 확인해요.      |
| 재사용 뒤 accessory가 남아요.         | Registration closure에서 item마다 `accessories` 전체를 다시 지정하는지 봐요.   |
| Swipe가 다른 item을 바꿔요.           | Action 생성 시 `IndexPath`를 identifier로 변환하는지 확인해요.                 |
| Section에 다른 appearance가 적용돼요. | Section provider index와 snapshot section 순서가 같은지 확인해요.              |
| Header가 안 보여요.                   | `headerMode`와 supplementary registration·provider를 함께 설정했는지 확인해요. |

## 면접에서 이어질 수 있는 질문

### List Layout도 Compositional Layout인가요?

네. `UICollectionViewCompositionalLayout.list(using:)`이 list configuration을 사용하는 Compositional Layout을 만들어 줘요. 여러 section 중 일부만 목록으로 만들 때는 `NSCollectionLayoutSection.list(using:layoutEnvironment:)`을 사용해요.

### `UITableView` 대신 반드시 List Layout을 써야 하나요?

아니요. 단순한 기존 표라면 `UITableView`도 충분해요. 같은 화면에서 목록과 카드·격자를 조합하거나 Diffable Collection View 구성 방식을 통일할 때 List Layout의 이점이 커져요.

## 전체 최종 코드

아래 코드는 List Layout, List Cell Registration, accessory, Diffable snapshot, swipe action을 하나의 설정 화면에 연결한 최종본이에요.

<details>
<summary>전체 코드 펼쳐보기</summary>

```swift
import UIKit

private enum SettingsSection: Hashable {
  case account
  case display
}

private enum SettingsItem: Hashable {
  case profile
  case notifications
  case darkMode

  var title: String {
    switch self {
    case .profile:
      return "프로필"
    case .notifications:
      return "알림"
    case .darkMode:
      return "화면 모드"
    }
  }

  var symbolName: String {
    switch self {
    case .profile:
      return "person.crop.circle"
    case .notifications:
      return "bell"
    case .darkMode:
      return "circle.lefthalf.filled"
    }
  }
}

@MainActor
final class SettingsListViewController: UIViewController {
  private var resetItems: Set<SettingsItem> = []

  private lazy var collectionView = UICollectionView(
    frame: .zero,
    collectionViewLayout: makeListLayout()
  )

  private lazy var cellRegistration =
    UICollectionView.CellRegistration<
      UICollectionViewListCell,
      SettingsItem
    > { [weak self] cell, _, item in
      var content = cell.defaultContentConfiguration()
      content.text = item.title
      content.secondaryText =
        self?.resetItems.contains(item) == true
          ? "기본값"
          : nil
      content.image = UIImage(systemName: item.symbolName)
      cell.contentConfiguration = content

      switch item {
      case .profile:
        cell.accessories = [.disclosureIndicator()]
      case .notifications:
        cell.accessories = [
          .label(text: "켜짐"),
          .disclosureIndicator(),
        ]
      case .darkMode:
        cell.accessories = [.checkmark()]
      }
    }

  private lazy var dataSource =
    UICollectionViewDiffableDataSource<
      SettingsSection,
      SettingsItem
    >(
      collectionView: collectionView
    ) { [weak self] collectionView, indexPath, item in
      guard let self else {
        return nil
      }
      return collectionView.dequeueConfiguredReusableCell(
        using: cellRegistration,
        for: indexPath,
        item: item
      )
    }

  override func viewDidLoad() {
    super.viewDidLoad()

    collectionView.translatesAutoresizingMaskIntoConstraints = false
    collectionView.backgroundColor = .systemGroupedBackground
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

    applyInitialSnapshot()
  }

  private func makeListLayout()
    -> UICollectionViewCompositionalLayout
  {
    var configuration = UICollectionLayoutListConfiguration(
      appearance: .insetGrouped
    )
    configuration.showsSeparators = true
    configuration.trailingSwipeActionsConfigurationProvider = {
      [weak self] indexPath in
      guard
        let self,
        let item = dataSource.itemIdentifier(
          for: indexPath
        )
      else {
        return nil
      }

      let reset = UIContextualAction(
        style: .normal,
        title: "초기화"
      ) { [weak self] _, _, completion in
        self?.reset(item)
        completion(true)
      }
      reset.backgroundColor = .systemOrange
      return UISwipeActionsConfiguration(actions: [reset])
    }

    return UICollectionViewCompositionalLayout.list(
      using: configuration
    )
  }

  private func applyInitialSnapshot() {
    var snapshot = NSDiffableDataSourceSnapshot<
      SettingsSection,
      SettingsItem
    >()
    snapshot.appendSections([.account, .display])
    snapshot.appendItems(
      [.profile, .notifications],
      toSection: .account
    )
    snapshot.appendItems(
      [.darkMode],
      toSection: .display
    )
    dataSource.apply(
      snapshot,
      animatingDifferences: false
    )
  }

  private func reset(_ item: SettingsItem) {
    resetItems.insert(item)
    var snapshot = dataSource.snapshot()
    snapshot.reconfigureItems([item])
    dataSource.apply(snapshot, animatingDifferences: true)
  }
}
```

</details>

## 참고 자료

- [Apple Developer Documentation — UICollectionViewCompositionalLayout](https://developer.apple.com/documentation/uikit/uicollectionviewcompositionallayout)
- [Apple Developer Documentation — UICollectionLayoutListConfiguration](https://developer.apple.com/documentation/uikit/uicollectionlayoutlistconfiguration)
- [Apple Developer Documentation — UICollectionViewListCell](https://developer.apple.com/documentation/uikit/uicollectionviewlistcell)
