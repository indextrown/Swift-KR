---
title: Collection View 데이터와 Diffable Data Source
description: UICollectionViewDataSource와 diffable data source를 비교하고 식별자, snapshot, section snapshot, prefetching과 새로고침을 단계별로 설명합니다.
---

# Collection View 데이터와 Diffable Data Source

> **면접 답변 한 줄 요약:** diffable data source는 section과 item을 안정적인 식별자로 표현한 snapshot을 받아 이전 상태와의 차이를 계산하므로, 삽입·삭제·이동을 화면과 수동으로 맞추는 부담을 줄여 줘요.

Collection View의 데이터 코드는 “셀에 제목을 넣는 코드”보다 넓은 문제를 다뤄요. 몇 개의 section이 있는지, item은 어떤 순서인지, 변경된 item이 같은 item인지, 화면 밖의 데이터를 언제 준비할지까지 결정해요.

Apple의 Collection Views 문서는 전통적인 `UICollectionViewDataSource`와 현대적인 `UICollectionViewDiffableDataSource`를 모두 제공해요. 기존 프로젝트를 읽으려면 두 방식을 알아야 하지만, 새 화면에서는 특별한 제약이 없다면 diffable data source부터 검토하는 것이 좋아요.

## 먼저 알아둘 데이터 용어

| 용어               | 쉬운 뜻                                                                                                                          |
| ------------------ | -------------------------------------------------------------------------------------------------------------------------------- |
| 식별자(identifier) | item이나 section이 무엇인지 구분하는 안정적인 값이에요. 위치가 바뀌어도 같은 대상을 가리켜야 하며 `Hashable`을 따라야 해요.      |
| `Hashable`         | 값을 해시해 빠르게 찾고, 같은 값인지 비교할 수 있게 하는 Swift 프로토콜이에요. diffable data source의 식별자 타입이 따라야 해요. |
| snapshot           | 특정 시점에 존재하는 section과 item 식별자 및 순서를 담은 값이에요. 화면의 목표 상태를 선언해요.                                 |
| diff               | 이전 snapshot과 새 snapshot 사이의 삽입, 삭제, 이동 차이예요.                                                                    |
| backing store      | 실제 `Photo` 모델을 보관하는 배열, 딕셔너리, 데이터베이스 같은 저장소예요. snapshot에는 보통 전체 모델 대신 식별자만 넣어요.     |
| prefetching        | item이 화면에 나타나기 전에 필요한 데이터를 미리 준비하는 최적화예요. 사용자가 방향을 바꾸면 취소할 수 있어야 해요.              |
| section snapshot   | 한 section 안의 부모·자식 item과 펼침 상태를 표현하는 snapshot이에요. 계층형 목록에 사용해요.                                    |

## 위치 기반 data source는 화면과 모델을 직접 맞춰요

`UICollectionViewDataSource`를 따르는 전통적인 방식은 최소 두 메서드를 구현해요.

```swift
extension PhotoGridViewController: UICollectionViewDataSource {
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
    let cell = collectionView.dequeueReusableCell(
      withReuseIdentifier: PhotoCell.reuseIdentifier,
      for: indexPath
    )

    guard let photoCell = cell as? PhotoCell else {
      return cell
    }

    photoCell.configure(with: photos[indexPath.item])
    return photoCell
  }
}
```

이 방식이 잘못된 것은 아니에요. 작은 고정 목록이나 기존 코드에서는 충분히 안정적으로 사용할 수 있어요. 하지만 item을 삽입하거나 삭제할 때 모델과 화면 명령의 결과가 정확히 일치해야 해요.

```swift
photos.remove(at: removedIndex)
collectionView.deleteItems(
  at: [IndexPath(item: removedIndex, section: 0)]
)
```

모델에서 두 개를 삭제했는데 화면에는 하나만 삭제하라고 알리거나, 삭제 전후 개수가 맞지 않으면 Collection View가 내부 일관성 오류를 감지할 수 있어요. 여러 삽입·삭제·이동을 `performBatchUpdates`로 묶을수록 순서를 직접 계산하기 어려워져요.

## diffable data source는 목표 상태를 전달해요

diffable data source에서는 “세 번째 셀을 지워요”보다 “이제 이 식별자들이 이 순서로 존재해요”라고 말해요.

```swift
private enum Section: Hashable {
  case main
}

private var photosByID: [Photo.ID: Photo] = [:]
private var dataSource:
  UICollectionViewDiffableDataSource<Section, Photo.ID>!
```

`Section`과 `Photo.ID`가 각각 section과 item 식별자 타입이에요. 둘 다 `Hashable`이어야 해요.

data source를 만들 때 cell provider를 전달해요.

```swift
private func configureDataSource() {
  let registration = UICollectionView.CellRegistration<
    UICollectionViewCell,
    Photo
  > { cell, _, photo in
    var content = UIListContentConfiguration.cell()
    content.text = photo.title
    content.image = photo.thumbnail
    cell.contentConfiguration = content
  }

  dataSource = UICollectionViewDiffableDataSource(
    collectionView: collectionView
  ) { [weak self] collectionView, indexPath, photoID in
    guard let photo = self?.photosByID[photoID] else {
      return nil
    }

    return collectionView.dequeueConfiguredReusableCell(
      using: registration,
      for: indexPath,
      item: photo
    )
  }
}
```

cell provider가 받는 `photoID`는 snapshot에 넣은 식별자예요. 실제 `Photo`는 backing store에서 가져와요. 이 구조는 snapshot을 가볍게 유지하고, 제목처럼 바뀌는 값과 정체성을 분리해요.

## 첫 snapshot을 적용해요

초기 데이터는 빈 snapshot에 section과 item을 순서대로 추가해 표현해요.

```swift
private func applyInitialPhotos(_ photos: [Photo]) {
  photosByID = Dictionary(
    uniqueKeysWithValues: photos.map { ($0.id, $0) }
  )

  var snapshot = NSDiffableDataSourceSnapshot<Section, Photo.ID>()
  snapshot.appendSections([.main])
  snapshot.appendItems(photos.map(\.id), toSection: .main)

  dataSource.apply(snapshot, animatingDifferences: false)
}
```

item보다 section을 먼저 추가해야 해요. `toSection`을 생략하면 마지막 section에 item이 들어가지만, section을 명시하면 코드의 의도가 더 잘 보여요.

Apple의 diffable data source 예제는 초기 대량 적재나 전체 재설정에서 `applySnapshotUsingReloadData(_:)`를 사용하는 방식도 보여 줘요. 이 메서드는 diff를 계산하지 않고 새 상태로 다시 적재해요. 일반적인 증분 갱신에는 `apply(_:animatingDifferences:)`를 사용해요.

## 삽입과 삭제는 새 snapshot으로 표현해요

사진 하나를 추가할 때 backing store를 먼저 바꾸고 새 목표 상태를 적용해요.

```swift
private func insert(_ photo: Photo) {
  photosByID[photo.id] = photo

  var snapshot = dataSource.snapshot()
  snapshot.appendItems([photo.id], toSection: .main)

  dataSource.apply(snapshot, animatingDifferences: true)
}
```

삭제도 같은 흐름이에요.

```swift
private func deletePhoto(id: Photo.ID) {
  photosByID[id] = nil

  var snapshot = dataSource.snapshot()
  guard snapshot.indexOfItem(id) != nil else {
    return
  }

  snapshot.deleteItems([id])
  dataSource.apply(snapshot, animatingDifferences: true)
}
```

`appendItems`, `insertItems`, `deleteItems`, `moveItem`은 snapshot 값만 바꿔요. 마지막에 data source에 적용해야 화면이 갱신돼요.

## 내용 변경과 정체성 변경을 구분해요

사진 제목이나 즐겨찾기 여부가 바뀌어도 같은 사진이에요. 이때 item 식별자를 바꾸지 않고 `reconfigureItems(_:)`로 표시 내용만 갱신해요.

```swift
private func toggleFavorite(id: Photo.ID) {
  guard var photo = photosByID[id] else {
    return
  }

  photo.isFavorite.toggle()
  photosByID[id] = photo

  var snapshot = dataSource.snapshot()
  snapshot.reconfigureItems([id])
  dataSource.apply(snapshot, animatingDifferences: true)
}
```

`reloadItems(_:)`도 있지만 `reconfigureItems(_:)`는 기존 셀과 연결된 상태를 더 많이 유지하면서 구성 코드를 다시 실행하는 데 적합해요. layout까지 다시 계산해야 하는 변경인지, 셀 내용만 바뀌는지 구분해서 선택해요.

### 전체 모델을 식별자로 넣을 때 생기는 문제

아래처럼 바뀔 수 있는 모델 전체를 item identifier로 넣는 코드도 컴파일될 수 있어요.

```swift
struct Photo: Hashable {
  let id: UUID
  var title: String
  var isFavorite: Bool
}
```

자동 생성된 `Hashable`과 `Equatable`은 모든 저장 프로퍼티를 비교해요. `isFavorite`이 바뀌면 diffable data source는 같은 item의 내용 변경이 아니라 이전 값 삭제와 새 값 삽입으로 판단할 수 있어요. 선택, 포커스, 셀 내부 애니메이션 같은 상태가 끊길 수 있어요.

정적이고 절대 바뀌지 않는 작은 값이라면 모델 자체를 식별자로 사용할 수도 있어요. 실무 데이터처럼 속성이 바뀐다면 안정적인 `Photo.ID`와 모델 저장소를 분리하는 편이 안전해요.

## snapshot은 현재 화면을 검사하는 도구이기도 해요

`NSDiffableDataSourceSnapshot`은 갱신 명령뿐 아니라 현재 상태를 읽는 API도 제공해요.

```swift
let snapshot = dataSource.snapshot()

print(snapshot.numberOfSections)
print(snapshot.numberOfItems)
print(snapshot.sectionIdentifiers)
print(snapshot.itemIdentifiers)
print(snapshot.itemIdentifiers(inSection: .main))
```

특정 item의 위치나 소속 section도 확인할 수 있어요.

```swift
if let index = snapshot.indexOfItem(photoID) {
  print("현재 item 순서: \(index)")
}

let section = snapshot.sectionIdentifier(
  containingItem: photoID
)
```

다만 snapshot에서 구한 숫자 위치를 오래 저장하지는 마세요. 다음 snapshot이 적용되면 위치가 달라질 수 있어요.

## section snapshot으로 계층을 표현해요

앨범 안에 폴더와 사진이 중첩되는 outline 화면은 `NSDiffableDataSourceSectionSnapshot`으로 표현할 수 있어요.

```swift
enum LibraryItem: Hashable {
  case folder(UUID, title: String)
  case photo(Photo.ID)
}

var sectionSnapshot =
  NSDiffableDataSourceSectionSnapshot<LibraryItem>()

let trips = LibraryItem.folder(UUID(), title: "여행")
let seoul = LibraryItem.folder(UUID(), title: "서울")
let photo = LibraryItem.photo(photoID)

sectionSnapshot.append([trips])
sectionSnapshot.append([seoul], to: trips)
sectionSnapshot.append([photo], to: seoul)
sectionSnapshot.expand([trips, seoul])

dataSource.apply(
  sectionSnapshot,
  to: .main,
  animatingDifferences: true
)
```

section snapshot은 다음 정보를 관리해요.

- root item과 각 item의 자식
- 부모, 계층 깊이, 포함 여부
- 펼쳐진 item과 접힌 item
- 현재 보이는 item
- 계층 안의 삽입, 삭제, 이동

평평한 격자라면 일반 snapshot만으로 충분해요. 계층이 없는 화면에 section snapshot을 도입하면 모델과 갱신 코드만 복잡해질 수 있어요.

## 기존 data source와 diffable data source를 비교해요

| 기준              | `UICollectionViewDataSource`                   | `UICollectionViewDiffableDataSource`                  |
| ----------------- | ---------------------------------------------- | ----------------------------------------------------- |
| item을 찾는 기준  | 주로 현재 위치인 `IndexPath`                   | 안정적인 `Hashable` 식별자                            |
| 갱신 방식         | 삽입·삭제·이동 명령을 모델 변경과 직접 맞춰요. | 목표 상태 snapshot을 적용하고 차이를 계산해요.        |
| 필수 셀 제공 코드 | protocol 메서드                                | cell provider closure                                 |
| 계층형 section    | 직접 상태와 갱신을 관리해요.                   | section snapshot을 사용할 수 있어요.                  |
| 기존 코드와 호환  | 오래된 배포 대상과 기존 구조에 널리 쓰여요.    | iOS 13 이후 사용할 수 있어요.                         |
| 주의할 점         | batch update의 개수와 순서를 맞춰야 해요.      | 식별자 안정성, snapshot 크기와 적용 빈도를 봐야 해요. |

diffable data source를 사용한다고 모델 계층이 자동으로 설계되지는 않아요. 앱이 데이터 변경을 감지하고 backing store와 snapshot을 만드는 책임은 여전히 가져요.

## prefetching은 곧 보일 데이터를 미리 준비해요

이미지 디코딩이나 네트워크 요청이 셀이 나타난 뒤 시작되면 빠르게 스크롤할 때 빈 이미지가 보일 수 있어요. `UICollectionViewDataSourcePrefetching`은 곧 필요할 가능성이 있는 index path를 미리 알려 줘요.

```swift
private func configurePrefetching() {
  collectionView.prefetchDataSource = self
  collectionView.isPrefetchingEnabled = true
}

extension PhotoGridViewController:
  UICollectionViewDataSourcePrefetching
{
  func collectionView(
    _ collectionView: UICollectionView,
    prefetchItemsAt indexPaths: [IndexPath]
  ) {
    let ids = indexPaths.compactMap {
      dataSource.itemIdentifier(for: $0)
    }

    imagePipeline.prepareImages(for: ids)
  }

  func collectionView(
    _ collectionView: UICollectionView,
    cancelPrefetchingForItemsAt indexPaths: [IndexPath]
  ) {
    let ids = indexPaths.compactMap {
      dataSource.itemIdentifier(for: $0)
    }

    imagePipeline.cancelPreparation(for: ids)
  }
}
```

prefetch 요청은 “반드시 곧 표시된다”는 보장이 아니에요. 사용자가 스크롤 방향을 바꾸면 취소 메서드가 호출될 수 있어요.

다음 원칙을 지켜요.

- 식별자별로 같은 요청을 합치고 중복 다운로드를 피하세요.
- 취소 가능한 `Task`나 요청 토큰을 사용하세요.
- 이미지 다운로드와 디코딩은 메인 액터를 막지 않게 하세요.
- 셀에 결과를 넣기 전에 셀이 여전히 같은 식별자를 표현하는지 확인하세요.
- 아주 싼 작업까지 모두 prefetch하면 관리 비용이 더 커질 수 있어요.

## 새로고침은 모델을 다시 읽은 뒤 snapshot을 바꿔요

`UIRefreshControl`은 Collection View처럼 스크롤 가능한 뷰의 당겨서 새로고침 동작을 제공해요.

```swift
private let refreshControl = UIRefreshControl()

private func configureRefreshControl() {
  refreshControl.addTarget(
    self,
    action: #selector(refreshPhotos),
    for: .valueChanged
  )
  collectionView.refreshControl = refreshControl
}

@objc
private func refreshPhotos() {
  Task {
    defer { refreshControl.endRefreshing() }

    do {
      let photos = try await photoRepository.fetchPhotos()
      applyPhotos(photos)
    } catch {
      showRefreshError(error)
    }
  }
}
```

`beginRefreshing()`과 `endRefreshing()`은 표시 상태를 관리하고 `isRefreshing`으로 현재 상태를 확인할 수 있어요. refresh control이 데이터 자체를 가져오지는 않아요. 모델을 새로 읽고 snapshot을 적용하는 책임은 앱 코드에 있어요.

## 높은 성능을 위해 갱신 단위를 줄여요

Apple은 고성능 목록과 Collection View에서 prefetching과 이미지 준비를 함께 다뤄요. 실제 병목은 화면마다 다르지만 다음 지점을 먼저 측정해 볼 수 있어요.

- 셀 구성 중 동기 네트워크·파일 접근을 하지 않아요.
- 큰 이미지는 표시 크기에 맞게 준비하고 디코딩 비용을 스크롤 경로에서 줄여요.
- 내용 하나가 바뀌었을 때 전체 `reloadData()` 대신 해당 item을 재구성해요.
- cell provider 안에서 반복되는 무거운 계산을 모델 준비 단계로 옮겨요.
- self-sizing 셀은 예상 크기와 Auto Layout 제약을 일관되게 제공해 반복 측정을 줄여요.
- Instruments의 Time Profiler와 Core Animation 도구로 실제 병목을 확인해요.

“prefetch를 붙였다”는 사실만으로 빨라졌다고 판단하면 안 돼요. 네트워크, 이미지 디코딩, Auto Layout, snapshot 생성 중 어디에서 시간이 걸리는지 먼저 측정해야 해요.

## 데이터 API의 역할을 한눈에 정리해요

| API                                     | 역할                                                           |
| --------------------------------------- | -------------------------------------------------------------- |
| `UICollectionViewDataSource`            | section/item 개수와 셀을 위치 기반 protocol 메서드로 제공해요. |
| `UICollectionViewDiffableDataSource`    | 식별자와 snapshot을 사용해 데이터와 화면 갱신을 관리해요.      |
| `NSDiffableDataSourceSnapshot`          | 전체 section과 item의 한 시점 상태를 표현해요.                 |
| `NSDiffableDataSourceSectionSnapshot`   | 한 section 안의 부모·자식과 펼침 상태를 표현해요.              |
| `UICollectionViewDataSourcePrefetching` | 곧 필요할 데이터의 준비와 취소 시점을 알려 줘요.               |
| `UIRefreshControl`                      | 사용자가 당겨서 새로고침을 시작할 수 있는 표준 컨트롤이에요.   |

## 적용 순서를 정리해요

1. 모델의 정체성을 나타내는 안정적인 section·item 식별자를 정해요.
2. backing store와 snapshot의 책임을 분리해요.
3. cell provider가 식별자로 최신 모델을 읽도록 구성해요.
4. 모델 변경 후 snapshot을 적용하는 한 방향 흐름을 만들어요.
5. 삽입·삭제·이동과 내용 변경을 각각 테스트해요.
6. 계층이 실제로 있을 때만 section snapshot을 사용해요.
7. 스크롤 성능을 측정한 뒤 비싼 작업에 prefetching과 취소를 적용해요.

## 면접에서 이어질 수 있는 질문

### 왜 `IndexPath`를 item 식별자로 사용하면 안 되나요?

`IndexPath`는 현재 위치이고 item의 정체성이 아니기 때문이에요. 앞에서 삽입이나 삭제가 일어나면 같은 위치가 다른 item을 가리킬 수 있으므로 장기 상태와 비동기 작업은 안정적인 식별자로 관리해야 해요.

### snapshot을 적용하면 모델도 자동으로 바뀌나요?

아니요. snapshot은 Collection View가 보여 줄 식별자와 순서를 나타낼 뿐 실제 모델 저장소를 대신하지 않아요. 앱이 모델을 먼저 변경하고 그 결과를 snapshot으로 표현해야 해요.

### `reconfigureItems(_:)`와 `reloadItems(_:)`는 어떻게 선택하나요?

item의 정체성과 셀을 유지하면서 내용 구성만 갱신하려면 `reconfigureItems(_:)`가 우선 후보예요. 크기나 더 넓은 갱신 과정이 필요하다면 `reloadItems(_:)`를 검토하고, 실제 UI 요구와 배포 대상 API를 확인해 선택해요.

### prefetch 요청 결과를 왜 셀에 바로 넣으면 안 되나요?

요청이 끝나는 동안 셀이 재사용되어 다른 item을 표시할 수 있기 때문이에요. 결과는 item 식별자 기준 캐시에 저장하고, 현재 셀의 식별자가 같은지 확인한 뒤 화면에 반영해야 해요.

## 참고 자료

- [Updating collection views using diffable data sources](https://developer.apple.com/documentation/uikit/updating-collection-views-using-diffable-data-sources)
- [UICollectionViewDiffableDataSource](https://developer.apple.com/documentation/uikit/uicollectionviewdiffabledatasource-9tqpa)
- [UICollectionViewDataSource](https://developer.apple.com/documentation/uikit/uicollectionviewdatasource)
- [UICollectionViewDataSourcePrefetching](https://developer.apple.com/documentation/uikit/uicollectionviewdatasourceprefetching)
- [NSDiffableDataSourceSnapshot](https://developer.apple.com/documentation/uikit/nsdiffabledatasourcesnapshot-swift.struct)
- [NSDiffableDataSourceSectionSnapshot](https://developer.apple.com/documentation/uikit/nsdiffabledatasourcesectionsnapshot-swift.struct)
- [UIRefreshControl](https://developer.apple.com/documentation/uikit/uirefreshcontrol)
- [Building high-performance lists and collection views](https://developer.apple.com/documentation/uikit/building-high-performance-lists-and-collection-views)
