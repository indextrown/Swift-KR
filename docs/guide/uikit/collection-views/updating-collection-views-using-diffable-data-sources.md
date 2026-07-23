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

## 개요 (Overview)

Collection View는 데이터를 section과 item으로 나누어 표시하고, 앱은 표시할 section과 item을 Collection View에 삽입해요. Recipe 샘플에서는 사용자가 레시피를 추가·삭제하고 순서를 바꾸거나 즐겨찾기로 표시할 수 있어요. 샘플 앱은 이런 동작을 지원하기 위해 Collection View 안의 데이터를 삽입·삭제·이동·갱신해요.

Collection View에 데이터를 채울 때는 `UICollectionViewDataSource`를 채택하는 사용자 정의 data source를 만들 수 있어요. 이 방식에서는 Collection View의 정보를 최신으로 유지하기 위해 무엇이 바뀌었는지 판단하고, 삽입·삭제·이동 순서를 세심하게 맞춘 batch update를 직접 수행해야 해요.

샘플 앱은 이 과정의 복잡성을 피하기 위해 `UICollectionViewDiffableDataSource`를 사용해요. Diffable Data Source는 Collection View에 포함된 각 section과 item의 정체성을 나타내는 **안정적인 section/item 식별자 목록**을 저장해요. 반면 `UICollectionViewDataSource`가 사용하는 index와 IndexPath는 위치를 나타내므로 콘텐츠를 추가·삭제·재배치하면 달라질 수 있어요. 식별자를 사용하면 Collection View 안의 현재 위치를 몰라도 특정 section이나 item을 가리킬 수 있어요.

> **참고:** 이 원리는 `UITableViewDiffableDataSource`를 사용하는 Table View에도 같게 적용돼요.

식별자 타입은 `Hashable`이어야 하고, 동등성도 올바르게 구현해야 해요. Hashing을 사용하면 `Set`, `Dictionary`, `NSDiffableDataSourceSnapshot`, `NSDiffableDataSourceSectionSnapshot`이 값을 key처럼 사용해 빠르게 조회할 수 있어요. `Hashable` 타입은 `Equatable`도 준수하므로 두 값이 같은지 판단하는 구현 역시 정확해야 해요. 두 값이 같다면 반드시 같은 hash 값을 가져야 해요.

식별자는 hash와 동등성 비교가 가능하므로 Diffable Data Source가 현재 snapshot과 새 snapshot의 차이를 알아낼 수 있어요. 그 차이를 바탕으로 Collection View의 section과 item을 대신 삽입·삭제·이동하므로 앱이 batch update 코드를 직접 조정할 필요가 줄어요.

> **중요:** 서로 다른 식별자가 같은 hash 값을 가질 수는 있지만, 충돌이 지나치게 많으면 snapshot 비교와 조회 성능이 떨어져요. 식별자에는 변하지 않고 고유한 값을 사용하세요.

### Diffable Data Source 정의하기 (Define the diffable data source)

공식 샘플의 `RecipeListViewController`는 Recipe 목록을 Collection View에 표시해요. 목록을 표시하기 전에 Diffable Data Source를 저장할 instance variable을 선언해요.

```swift
private var recipeListDataSource: UICollectionViewDiffableDataSource<RecipeListSection, Recipe.ID>!
```

`recipeListDataSource`는 section 식별자 타입으로 `RecipeListSection`, item 식별자 타입으로 `Recipe.ID`를 선언해요. 이 두 generic 타입은 data source가 어떤 식별자 값을 담는지 정해요.

Section 식별자인 `RecipeListSection`은 raw value가 `Int`인 enum이에요. Swift의 `Int`는 `Hashable`이고, 각 enum case가 Collection View의 section 하나를 식별해요. 샘플에는 Recipe 목록을 표시하는 `.main` section 하나만 있어요.

```swift
private enum RecipeListSection: Int {
    case main
}
```

Item 식별자에는 `Recipe.ID`를 사용해요. 이 타입은 다음과 같이 정의된 `Recipe` 구조체에서 나와요.

```swift
struct Recipe: Identifiable, Codable {
    var id: Int
    var title: String
    var prepTime: Int   // In seconds.
    var cookTime: Int   // In seconds.
    var servings: String
    var ingredients: String
    var directions: String
    var isFavorite: Bool
    var collections: [String]
    fileprivate var addedOn: Date? = Date()
    fileprivate var imageNames: [String]
}
```

`Recipe`는 `Identifiable`을 채택하므로 `id` 프로퍼티를 제공해야 해요. `Identifiable`을 채택하면 구조체의 `id` 선언에서 결정되는 연관 타입 `ID`도 자동으로 노출돼요. 이 타입은 반드시 `Hashable`이어야 하므로 샘플 앱이 `Recipe.ID`를 item 식별자 타입으로 사용할 수 있어요.

> **참고:** 공식 샘플의 `Recipe`는 `Hashable`을 채택하지 않아요. snapshot에 저장되는 값은 전체 `Recipe`가 아니라 `Hashable`인 `Recipe.ID`이기 때문이에요.

Data source와 적용할 snapshot에는 완전한 Recipe 데이터가 아니라 `Recipe.ID`만 들어가요. 단순하고 hash 가능한 식별자만 비교하므로 Collection View에서 Recipe를 표시할 때 Diffable Data Source가 처리할 데이터를 가볍게 유지할 수 있어요.

### Diffable Data Source 구성하기 (Configure the diffable data source)

Collection View에 Diffable Data Source의 데이터를 표시하기 전에 샘플 앱이 data source를 구성해요. `UICollectionViewDiffableDataSource` 인스턴스를 만들고 Collection View의 셀을 구성해 반환하는 closure인 cell provider를 설정해요.

`RecipeListViewController`는 `configureDataSource()`라는 helper method에서 `recipeListDataSource`를 구성하고, `viewDidLoad()`에서 이 메서드를 호출해요.

`configureDataSource()`는 먼저 Cell Registration을 만들고 실제 `Recipe` 데이터로 각 셀을 구성하는 handler closure를 제공해요. Closure는 `Recipe` 인스턴스를 받아 제목, 보조 텍스트, 이미지와 즐겨찾기 accessory를 셀에 반영해요.

> **참고:** Cell registration은 셀을 그리는 데 필요한 실제 모델 타입을, Diffable Data Source는 정체성을 추적할 식별자 타입을 각각 사용할 수 있어요.

그다음 `UICollectionViewDiffableDataSource` 인스턴스와 cell provider closure를 만들어요. Closure는 Recipe 식별자를 받은 뒤 backing data store에서 Recipe를 조회하고, 조회한 구조체를 Cell Registration의 handler에 전달해요.

```swift
private func configureDataSource() {
    // Create a cell registration that the diffable data source will use.
    let recipeCellRegistration = UICollectionView.CellRegistration<UICollectionViewListCell, Recipe> { cell, indexPath, recipe in
        var contentConfiguration = UIListContentConfiguration.subtitleCell()
        contentConfiguration.text = recipe.title
        contentConfiguration.secondaryText = recipe.subtitle
        contentConfiguration.image = recipe.smallImage
        contentConfiguration.imageProperties.cornerRadius = 4
        contentConfiguration.imageProperties.maximumSize = CGSize(width: 60, height: 60)

        cell.contentConfiguration = contentConfiguration

        if recipe.isFavorite {
            let image = UIImage(systemName: "heart.fill")
            let accessoryConfiguration = UICellAccessory.CustomViewConfiguration(customView: UIImageView(image: image),
                                                                                 placement: .trailing(displayed: .always),
                                                                                 tintColor: .secondaryLabel)
            cell.accessories = [.customView(configuration: accessoryConfiguration)]
        } else {
            cell.accessories = []
        }
    }

    // Create the diffable data source and its cell provider.
    recipeListDataSource = UICollectionViewDiffableDataSource(collectionView: collectionView) {
        collectionView, indexPath, identifier -> UICollectionViewCell in
        // `identifier` is an instance of `Recipe.ID`. Use it to
        // retrieve the recipe from the backing data store.
        let recipe = dataStore.recipe(with: identifier)!
        return collectionView.dequeueConfiguredReusableCell(using: recipeCellRegistration, for: indexPath, item: recipe)
    }
}
```

### 식별자로 Diffable Data Source 채우기 (Load the diffable data source with identifiers)

초기 로딩에서는 현재 선택한 Recipe 식별자 목록을 가져와 snapshot에 `.main` section과 item을 추가해요. 공식 샘플은 최초 상태를 즉시 맞추기 위해 `applySnapshotUsingReloadData(_:)`를 사용해요. 이 API는 diff와 애니메이션을 계산하지 않고 현재 표시 상태를 snapshot으로 재설정해요.

```swift
private func loadRecipeData() {
    // Retrieve the list of recipe identifiers determined based on a
    // selected sidebar item such as All Recipes or Favorites.
    guard let recipeIds = recipeSplitViewController.selectedRecipes?.recipeIds()
    else { return }

    // Update the collection view by adding the recipe identifiers to
    // a new snapshot, and apply the snapshop to the diffable data source.
    var snapshot = NSDiffableDataSourceSnapshot<RecipeListSection, Recipe.ID>()
    snapshot.appendSections([.main])
    snapshot.appendItems(recipeIds, toSection: .main)
    recipeListDataSource.applySnapshotUsingReloadData(snapshot)
}
```

> **중요:** 한 snapshot 안에서 section 식별자와 item 식별자는 각각 고유해야 해요. 같은 `Recipe.ID`를 두 위치나 두 section에 중복으로 넣을 수 없어요.

### Item 삽입·삭제·이동하기 (Insert, delete, and move items)

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

Recipe가 추가되거나 삭제되어 목록이 바뀌면 샘플은 notification center로 `selectedRecipesDidChange` 알림을 보내요. `RecipeListViewController`는 selector가 `selectedRecipesDidChange(_:)`인 observer를 등록해 이 알림을 받아요.

Recipe 목록 자체가 바뀌면 새 식별자 순서로 snapshot을 만들고 `apply(_:animatingDifferences:)`를 호출해요. UIKit은 이전 snapshot과 비교해 삽입·삭제·이동을 점진적으로 반영해요.

```swift
@objc
private func selectedRecipesDidChange(_ notification: Notification) {
    // Create a snapshot of the selected recipe identifiers from the notification's
    // `userInfo` dictionary, and apply it to the diffable data source.
    guard
        let userInfo = notification.userInfo,
        let selectedRecipeIds = userInfo[NotificationKeys.selectedRecipeIds] as? [Recipe.ID]
    else { return }

    var snapshot = NSDiffableDataSourceSnapshot<RecipeListSection, Recipe.ID>()
    snapshot.appendSections([.main])
    snapshot.appendItems(selectedRecipeIds, toSection: .main)
    recipeListDataSource.apply(snapshot, animatingDifferences: true)

    // The design of this sample app makes it possible for the selected
    // recipe displayed in the secondary (detail) view controller to exist
    // in the new snapshot but not exist in the collection view prior to
    // applying the snapshot. For instance, while displaying the list of
    // favorite recipes, a person can unfavorite the selected recipe by tapping
    // the `isFavorite` button. This removes the selected recipe from the
    // favorites list. Tap the button again and the recipe reappears in the
    // list. In this scenario, the app needs to re-select the recipe so it
    // appears as selected in the collection view.
    selectRecipeIfNeeded()
}
```

`selectedRecipesDidChange(_:)`는 `loadRecipeData()`와 비슷하지만 전체 표시를 재설정하는 `applySnapshotUsingReloadData(_:)` 대신 `apply(_:animatingDifferences:)`로 알림에 포함된 Recipe 식별자를 적용해요. `animatingDifferences`가 `true`이므로 Collection View가 점진적인 변경을 애니메이션으로 보여 줘요.

### 기존 Item 업데이트하기 (Update existing items)

item의 정체성과 위치는 같고 속성만 바뀌었다면 전체 목록을 새로 만들 필요가 없어요. 공식 샘플은 현재 snapshot을 가져와 변경한 Recipe 식별자를 `reconfigureItems(_:)`에 전달해요.

어떤 데이터가 바뀌었는지는 Diffable Data Source가 아니라 앱이 감지해요.

```swift
NotificationCenter.default.addObserver(
    self,
    selector: #selector(recipeDidChange(_:)),
    name: .recipeDidChange,
    object: nil
)
```

Recipe의 즐겨찾기 여부처럼 하나의 Recipe 데이터가 바뀌면 샘플은 `recipeDidChange` 알림을 보내요. `RecipeListViewController`는 `recipeDidChange(_:)`를 selector로 사용하는 observer로 이 알림을 받아요.

이 알림은 Recipe 하나의 데이터만 바뀌었다는 뜻이므로 Collection View의 전체 Recipe 목록을 갱신할 필요가 없어요. 즐겨찾기로 바꾸면 해당 셀 옆에 하트가 나타나고, 즐겨찾기를 해제하면 하트가 사라지도록 그 셀만 갱신해요.

```swift
@objc
private func recipeDidChange(_ notification: Notification) {
    guard
        // Get `recipeId` from from the `userInfo` dictionary.
        let userInfo = notification.userInfo,
        let recipeId = userInfo[NotificationKeys.recipeId] as? Recipe.ID,
        // Confirm that the data source contains the recipe.
        recipeListDataSource.indexPath(for: recipeId) != nil
    else { return }

    // Get the diffable data source's current snapshot.
    var snapshot = recipeListDataSource.snapshot()
    // Update the recipe's data displayed in the collection view.
    snapshot.reconfigureItems([recipeId])
    recipeListDataSource.apply(snapshot, animatingDifferences: true)
}
```

`recipeDidChange(_:)`는 먼저 알림이 제공한 Recipe 식별자가 Diffable Data Source에 있는지 확인해요. 그런 다음 현재 snapshot을 가져와 `reconfigureItems(_:)`에 식별자를 전달하고, 바뀐 snapshot을 다시 적용해요.

Diffable Data Source는 갱신한 snapshot과 현재 snapshot을 비교해 변경된 Recipe 셀의 재구성을 요청해요. Cell provider가 다시 호출되면 최신 Recipe를 조회해 셀에 반영하고, `animatingDifferences`가 `true`이므로 하트 아이콘이 나타나거나 사라지는 시각적 변화도 애니메이션으로 보여 줘요.

### 가벼운 데이터 구조로 Snapshot 채우기 (Populate snapshots with lightweight data structures)

식별자 대신 작은 `Hashable` 구조체를 item 타입으로 직접 넣는 방식도 가능해요. 공식 샘플의 sidebar처럼 값이 바뀌지 않는 정적 항목에는 편리해요.

공식 샘플은 이 방식을 sidebar item에 사용해요. 사용자 정의 구조체 `SidebarItem`은 sidebar item의 `title`과 `type` 프로퍼티를 정의해요.

```swift
private struct SidebarItem: Hashable {
    let title: String
    let type: SidebarItemType

    enum SidebarItemType {
        case standard, collection, expandableHeader
    }
}
```

```swift
private func createSnapshotOfStandardItems() -> NSDiffableDataSourceSectionSnapshot<SidebarItem> {
    let items = [
        SidebarItem(title: StandardSidebarItem.all.rawValue, type: .standard),
        SidebarItem(title: StandardSidebarItem.favorites.rawValue, type: .standard),
        SidebarItem(title: StandardSidebarItem.recents.rawValue, type: .standard)
    ]
    return createSidebarItemSnapshot(.standardItems, items: items)
}
```

이 프로퍼티들의 조합이 각 sidebar item의 hash 값을 결정해요. 프로퍼티 값이 바뀌지 않기 때문에 식별자 대신 `SidebarItem` 구조체를 snapshot에 넣어도 이 사례에서는 문제가 없어요.

하지만 이 방식에서는 Diffable Data Source가 item의 정체성을 계속 추적할 수 없어요. 기존 item의 프로퍼티가 하나라도 바뀌면 data source는 이전 item을 삭제하고 새 item을 삽입한 것으로 판단해요. 그 결과 선택된 item의 값이 바뀌었을 때 선택 상태가 사라지는 등 item에 연결된 UI 상태를 잃을 수 있어요.

- 기존 item 갱신이 아니라 이전 item 삭제 + 새 item 삽입으로 처리돼요.
- 선택 상태, 셀 내부 애니메이션처럼 item 정체성에 연결된 UI 상태를 잃을 수 있어요.
- 변경할 때마다 셀 제거·삽입 애니메이션이 발생해 성능이 나빠질 수 있어요.
- 이전 식별자가 없어졌으므로 `reconfigureItems(_:)`와 `reloadItems(_:)`로 같은 item을 지정하기 어려워요.

`animatingDifferences`가 `true`이면 변경할 때마다 기존 셀을 제거하는 애니메이션과 새 셀을 삽입하는 애니메이션이 실행돼 성능이 떨어질 수 있고, 셀 안에서 진행 중이던 애니메이션 같은 UI 상태도 잃을 수 있어요.

또한 데이터 구조 자체를 snapshot에 넣으면 기존 item을 지정하는 올바른 식별자가 없으므로 `reconfigureItems(_:)`와 `reloadItems(_:)`로 item 내용을 갱신할 수 없어요. 새 구조체가 들어 있는 snapshot을 다시 적용해야 하고, 이때 각 변경 item이 삭제와 삽입으로 처리돼요.

따라서 값이 바뀌지 않는 단순 메뉴나 item 정체성이 중요하지 않은 경우에만 가벼운 구조체를 직접 넣으세요. 그 밖의 실제 앱에서는 모델 전체가 아니라 **고유하고 안정적인 식별자**로 Diffable Data Source와 snapshot을 채우는 방식을 사용해요.

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

## Swift-KR 보충: 점검표

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
