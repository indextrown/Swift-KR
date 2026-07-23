---
title: 'Diffable Data Source로 Collection View 업데이트하기'
description: 'Apple 공식 Recipe 샘플의 흐름을 따라 안정적인 식별자, cell provider, 최초 snapshot, 삽입·삭제·이동, 기존 item 재구성, 값 타입 식별자의 한계를 단계별로 설명합니다.'
---

# Diffable Data Source로 Collection View 업데이트하기

> **면접 답변 한 줄 요약:** Diffable Data Source는 안정적인 식별자로 현재 목록 상태를 표현한 snapshot을 비교해 삽입·삭제·이동·재구성을 안전하게 화면에 반영해요.

이 문서는 Apple의 **Updating collection views using diffable data sources** 샘플이 설명하는 순서와 사례를 빠뜨리지 않고 한국어로 풀어쓴 문서예요. 공식 샘플은 Recipe 목록을 사용하고, 마지막에 Swift-KR의 작은 Photo 예제를 보충해요.

## 먼저 알아둘 용어

| 용어           | 쉬운 뜻                                                                                |
| -------------- | -------------------------------------------------------------------------------------- |
| 식별자         | item이 이동해도 같은 데이터임을 구분하는 `Hashable` 값이에요.                          |
| Snapshot       | 특정 시점에 표시할 section과 item의 식별자 및 순서를 담은 값이에요.                    |
| Cell provider  | item 식별자를 실제 모델로 바꾼 뒤 표시할 셀을 구성하는 클로저예요.                     |
| Reconfigure    | item의 정체성과 셀 상태를 유지하면서 현재 데이터로 셀 구성을 다시 실행하는 갱신이에요. |
| Hash collision | 서로 다른 값이 우연히 같은 hash 값을 갖는 상황이에요.                                  |

## 개요: 위치가 아니라 정체성을 비교해요

Collection View는 데이터를 section과 item으로 나누어 표시해요. Recipe 샘플에서는 사용자가 레시피를 추가·삭제·이동하고 즐겨찾기 상태도 바꿀 수 있어요. 전통적인 `UICollectionViewDataSource`는 배열을 바꾼 결과와 `insertItems`, `deleteItems`, `moveItem` 같은 화면 명령의 순서를 개발자가 직접 맞춰야 해요.

`UICollectionViewDiffableDataSource`는 이 과정을 **안정적인 section/item 식별자**와 snapshot으로 바꿔요. `IndexPath`는 현재 위치이므로 목록이 바뀌면 달라지지만, 식별자는 위치가 달라져도 같은 데이터를 가리켜요. 새 snapshot을 적용하면 data source가 이전 snapshot과 비교해 필요한 삽입·삭제·이동을 계산해요.

> **참고:** 이 원리는 `UITableViewDiffableDataSource`를 사용하는 Table View에도 같게 적용돼요.

식별자 타입은 `Hashable`이어야 하고, 동등성도 올바르게 구현해야 해요. 두 값이 같다면 반드시 같은 hash 값을 가져야 해요.

> **중요:** 서로 다른 식별자가 같은 hash 값을 가질 수는 있지만, 충돌이 지나치게 많으면 snapshot 비교와 조회 성능이 떨어져요. 식별자에는 변하지 않고 고유한 값을 사용하세요.

## Diffable Data Source를 정의해요

공식 샘플의 `RecipeListViewController`는 section 식별자로 `RecipeListSection`, item 식별자로 `Recipe.ID`를 사용해요.

```swift
private var recipeListDataSource:
  UICollectionViewDiffableDataSource<RecipeListSection, Recipe.ID>!

private enum RecipeListSection: Int {
  case main
}
```

`Recipe`는 `Identifiable`을 채택해 `id`와 그 타입인 `Recipe.ID`를 제공해요. 전체 모델을 snapshot에 넣는 것이 아니라 가벼운 `Recipe.ID`만 넣는 점이 핵심이에요.

```swift
struct Recipe: Identifiable, Codable {
  var id: Int
  var title: String
  var prepTime: Int
  var cookTime: Int
  var servings: String
  var ingredients: String
  var directions: String
  var isFavorite: Bool
  var collections: [String]
  fileprivate var addedOn: Date? = Date()
  fileprivate var imageNames: [String]
}
```

`Recipe` 전체가 `Hashable`일 필요는 없어요. data source와 snapshot에는 완전한 모델 대신 `Recipe.ID`가 저장되기 때문이에요. 셀을 구성할 때 식별자로 backing store에서 최신 `Recipe`를 조회해요. 모델이 커지거나 속성이 자주 바뀌어도 snapshot은 작은 식별자만 다룰 수 있어요.

> **참고:** 공식 샘플의 `Recipe`는 `Hashable`을 채택하지 않아요. snapshot에 저장되는 값은 전체 `Recipe`가 아니라 `Hashable`인 `Recipe.ID`이기 때문이에요.

## Diffable Data Source를 구성해요

`viewDidLoad()`에서 다음 순서를 실행해요.

1. `CellRegistration`을 만들어 실제 `Recipe`로 셀을 구성해요.
2. Diffable Data Source의 cell provider가 `Recipe.ID`를 받아 backing store에서 `Recipe`를 조회해요.
3. 조회한 모델을 registration에 전달해 재사용 셀을 만들어요.

Cell registration의 item 타입은 data source의 item 식별자 타입과 같을 필요가 없어요. 아래에서 registration은 `Recipe`, data source는 `Recipe.ID`를 사용해요.

> **참고:** Cell registration은 셀을 그리는 데 필요한 실제 모델 타입을, Diffable Data Source는 정체성을 추적할 식별자 타입을 각각 사용할 수 있어요.

```swift
private func configureDataSource() {
  let recipeCellRegistration =
    UICollectionView.CellRegistration<UICollectionViewListCell, Recipe> {
      cell, _, recipe in

      var content = UIListContentConfiguration.subtitleCell()
      content.text = recipe.title
      content.secondaryText = recipe.subtitle
      content.image = recipe.smallImage
      content.imageProperties.cornerRadius = 4
      content.imageProperties.maximumSize = CGSize(width: 60, height: 60)
      cell.contentConfiguration = content

      if recipe.isFavorite {
        let imageView = UIImageView(image: UIImage(systemName: "heart.fill"))
        let accessory = UICellAccessory.CustomViewConfiguration(
          customView: imageView,
          placement: .trailing(displayed: .always),
          tintColor: .secondaryLabel
        )
        cell.accessories = [.customView(configuration: accessory)]
      } else {
        cell.accessories = []
      }
    }

  recipeListDataSource = UICollectionViewDiffableDataSource(
    collectionView: collectionView
  ) { collectionView, indexPath, recipeID in
    guard let recipe = dataStore.recipe(with: recipeID) else { return nil }
    return collectionView.dequeueConfiguredReusableCell(
      using: recipeCellRegistration,
      for: indexPath,
      item: recipe
    )
  }
}
```

셀 구성 클로저는 캡처한 오래된 모델이 아니라 **식별자로 방금 조회한 모델**을 사용해요. 이후 `reconfigureItems(_:)`가 cell provider를 다시 호출하면 최신 제목과 즐겨찾기 상태가 반영돼요.

## 최초 데이터는 식별자로 채워요

초기 로딩에서는 현재 선택한 Recipe 식별자 목록을 가져와 snapshot에 `.main` section과 item을 추가해요. 공식 샘플은 최초 상태를 즉시 맞추기 위해 `applySnapshotUsingReloadData(_:)`를 사용해요. 이 API는 diff와 애니메이션을 계산하지 않고 현재 표시 상태를 snapshot으로 재설정해요.

```swift
private func loadRecipeData() {
  guard let recipeIDs =
    recipeSplitViewController.selectedRecipes?.recipeIds()
  else { return }

  var snapshot =
    NSDiffableDataSourceSnapshot<RecipeListSection, Recipe.ID>()
  snapshot.appendSections([.main])
  snapshot.appendItems(recipeIDs, toSection: .main)
  recipeListDataSource.applySnapshotUsingReloadData(snapshot)
}
```

> **중요:** 한 snapshot 안에서 section 식별자와 item 식별자는 각각 고유해야 해요. 같은 `Recipe.ID`를 두 위치나 두 section에 중복으로 넣을 수 없어요.

## 삽입·삭제·이동은 새 snapshot으로 알려요

공식 샘플은 변경을 두 종류로 나눠요.

- 컬렉션 자체가 바뀐 경우: Recipe 추가·삭제·순서 이동
- 기존 item의 속성만 바뀐 경우: 제목 수정·즐겨찾기 변경

Diffable Data Source가 backing store를 자동 감시하지는 않아요. 앱이 모델 변경을 감지한 뒤 새 snapshot을 적용해야 해요. 알림 전달에는 `NotificationCenter`, Combine 또는 앱의 상태 관리 방식을 사용할 수 있고, 공식 샘플은 `NotificationCenter`를 사용해요.

> **참고:** 공식 샘플은 `NotificationCenter`를 선택했지만 특정 알림 기술이 Diffable Data Source의 요구사항은 아니에요. 중요한 점은 앱이 모델 변경을 감지해 새 snapshot을 명시적으로 적용하는 일이에요.

```swift
NotificationCenter.default.addObserver(
  self,
  selector: #selector(selectedRecipesDidChange(_:)),
  name: .selectedRecipesDidChange,
  object: nil
)
```

Recipe 목록 자체가 바뀌면 새 식별자 순서로 snapshot을 만들고 `apply(_:animatingDifferences:)`를 호출해요. UIKit은 이전 snapshot과 비교해 삽입·삭제·이동을 점진적으로 반영해요.

```swift
@objc
private func selectedRecipesDidChange(_ notification: Notification) {
  guard
    let userInfo = notification.userInfo,
    let selectedRecipeIDs =
      userInfo[NotificationKeys.selectedRecipeIds] as? [Recipe.ID]
  else { return }

  var snapshot =
    NSDiffableDataSourceSnapshot<RecipeListSection, Recipe.ID>()
  snapshot.appendSections([.main])
  snapshot.appendItems(selectedRecipeIDs, toSection: .main)
  recipeListDataSource.apply(snapshot, animatingDifferences: true)

  // 상세 화면에 표시 중인 Recipe가 목록에 다시 들어왔다면
  // 현재 식별자의 새 IndexPath를 찾아 선택 상태를 복원해요.
  selectRecipeIfNeeded()
}
```

선택 상태를 보존해야 한다면 예전 `IndexPath`를 저장하지 말고 `Recipe.ID`를 저장하세요. snapshot 적용 뒤 `indexPath(for:)`로 현재 위치를 다시 구할 수 있어요.

## 기존 item의 내용은 재구성해요

item의 정체성과 위치는 같고 속성만 바뀌었다면 전체 목록을 새로 만들 필요가 없어요. 공식 샘플은 현재 snapshot을 가져와 변경한 Recipe 식별자를 `reconfigureItems(_:)`에 전달해요.

```swift
NotificationCenter.default.addObserver(
  self,
  selector: #selector(recipeDidChange(_:)),
  name: .recipeDidChange,
  object: nil
)
```

```swift
@objc
private func recipeDidChange(_ notification: Notification) {
  guard
    let userInfo = notification.userInfo,
    let recipeID = userInfo[NotificationKeys.recipeId] as? Recipe.ID,
    recipeListDataSource.indexPath(for: recipeID) != nil
  else { return }

  var snapshot = recipeListDataSource.snapshot()
  snapshot.reconfigureItems([recipeID])
  recipeListDataSource.apply(snapshot, animatingDifferences: true)
}
```

적용 과정에서 data source는 해당 식별자의 cell provider를 다시 호출해 최신 Recipe를 가져와요. 선택과 first responder 같은 기존 셀 상태를 가능한 한 유지하면서 하트 아이콘 같은 내용만 갱신할 수 있어요. 셀 자체를 완전히 교체해야 하는 특별한 경우에는 `reloadItems(_:)`를 검토해요.

## 가벼운 값 타입을 snapshot에 직접 넣을 때의 한계

식별자 대신 작은 `Hashable` 구조체를 item 타입으로 직접 넣는 방식도 가능해요. 공식 샘플의 sidebar처럼 값이 바뀌지 않는 정적 항목에는 편리해요.

```swift
private struct SidebarItem: Hashable {
  let title: String
  let type: SidebarItemType

  enum SidebarItemType {
    case standard
    case collection
    case expandableHeader
  }
}
```

```swift
private func createSnapshotOfStandardItems()
  -> NSDiffableDataSourceSectionSnapshot<SidebarItem> {
  let items = [
    SidebarItem(title: "모든 레시피", type: .standard),
    SidebarItem(title: "즐겨찾기", type: .standard),
    SidebarItem(title: "최근 항목", type: .standard),
  ]
  return createSidebarItemSnapshot(.standardItems, items: items)
}
```

하지만 구조체의 제목이나 다른 hash 대상 속성이 바뀌면 새 값은 이전 값과 다른 item으로 판단돼요. 그 결과 다음 문제가 생길 수 있어요.

- 기존 item 갱신이 아니라 이전 item 삭제 + 새 item 삽입으로 처리돼요.
- 선택 상태, 셀 내부 애니메이션처럼 item 정체성에 연결된 UI 상태를 잃을 수 있어요.
- 변경할 때마다 셀 제거·삽입 애니메이션이 발생해 성능이 나빠질 수 있어요.
- 이전 식별자가 없어졌으므로 `reconfigureItems(_:)`와 `reloadItems(_:)`로 같은 item을 지정하기 어려워요.

값이 변하지 않는 단순 메뉴나 정체성이 중요하지 않은 임시 화면이 아니라면, snapshot에는 모델 전체 대신 **고유하고 안정적인 식별자**를 넣는 방식을 기본으로 선택하세요.

## Swift-KR 보충: 두 section으로 Photo를 나눠요

아래 예제는 공식 Recipe 흐름을 이해한 뒤 작은 화면에서 연습하기 위한 보충 예제예요. 같은 사진을 `.favorites`와 `.all`에 동시에 넣지 않고 현재 상태에 따라 한 section에만 넣어요.

```swift
enum Section {
  case favorites
  case all
}

struct Photo: Identifiable {
  let id: UUID
  var title: String
  var isFavorite: Bool
}

private func applyPhotos(_ photos: [Photo], animated: Bool) {
  photosByID = Dictionary(uniqueKeysWithValues: photos.map { ($0.id, $0) })

  var snapshot = NSDiffableDataSourceSnapshot<Section, Photo.ID>()
  snapshot.appendSections([.favorites, .all])
  snapshot.appendItems(
    photos.filter(\.isFavorite).map(\.id),
    toSection: .favorites
  )
  snapshot.appendItems(
    photos.filter { !$0.isFavorite }.map(\.id),
    toSection: .all
  )
  dataSource.apply(snapshot, animatingDifferences: animated)
}
```

## 점검표

1. 식별자가 item의 위치나 변경 가능한 제목이 아니라 안정적인 ID인가요?
2. snapshot 안의 section/item 식별자가 중복되지 않나요?
3. 모델 컬렉션 변경과 기존 item 속성 변경을 구분했나요?
4. cell provider가 식별자로 backing store의 최신 모델을 조회하나요?
5. 속성만 바뀐 item에는 `reconfigureItems(_:)`를 사용했나요?
6. 선택 상태를 `IndexPath`가 아니라 item 식별자로 보존하나요?

## 참고 자료

- [Apple Developer Documentation — Updating collection views using diffable data sources](https://developer.apple.com/documentation/uikit/updating-collection-views-using-diffable-data-sources)
- [UICollectionViewDiffableDataSource](./uicollectionviewdiffabledatasource)
- [NSDiffableDataSourceSnapshot](./nsdiffabledatasourcesnapshot)
- [Collection Views 한눈에 보기](./index)
