---
title: 'UICollectionViewDiffableDataSource 예제'
description: 'UICollectionViewDiffableDataSource와 Cell Registration을 연결하고 안정적인 Photo.ID snapshot으로 초기 표시, 삽입·삭제·내용 변경·선택을 구현합니다.'
---

# UICollectionViewDiffableDataSource 예제

> **면접 답변 한 줄 요약:** `UICollectionViewDiffableDataSource`는 안정적인 section·item 식별자로 목표 상태 snapshot을 적용하고 이전 상태와의 차이를 계산해 Collection View의 삽입·삭제·이동을 반영해요.

이 예제에서는 [공통 `Photo` 모델과 `PhotoCell`](./index)을 사용해 사진 격자를 만들어요. 전통적인 data source와 화면 모양은 같지만, 위치 대신 `Photo.ID`로 데이터를 찾고 snapshot으로 갱신해요.

## 먼저 알아둘 용어

| 용어          | 쉬운 뜻                                                                                 |
| ------------- | --------------------------------------------------------------------------------------- |
| identifier    | item이 이동해도 같은 데이터임을 구분하는 `Hashable` 값이에요.                           |
| snapshot      | 특정 시점의 section과 item 순서를 나타내는 값이에요.                                    |
| cell provider | item identifier를 받아 구성된 셀을 반환하는 closure예요.                                |
| backing store | 화면에 표시할 실제 최신 모델을 보관하는 저장소예요. 이 예제에서는 `[Photo]` 배열이에요. |
| reconfigure   | item 정체성과 셀을 유지하면서 표시 내용을 다시 구성하는 갱신이에요.                     |

## 모델과 화면 순서를 한 배열에서 관리해요

```swift
@MainActor
final class DiffablePhotoGridViewController: UIViewController {
  private enum Section {
    case main
  }

  private var photos: [Photo] = []

  private var dataSource:
    UICollectionViewDiffableDataSource<Section, Photo.ID>!

  private lazy var collectionView = UICollectionView(
    frame: .zero,
    collectionViewLayout: makeGridLayout()
  )

  override func viewDidLoad() {
    super.viewDidLoad()

    configureCollectionView()
    configureDataSource()
    show(Photo.samples, animatingDifferences: false)
  }
}
```

`photos` 배열이 모델 내용과 화면 순서를 함께 나타내는 단일 진실 공급원이에요. Snapshot에는 배열 자체가 아니라 `photos.map(\.id)`로 얻은 안정적인 ID만 넣어요. 제목이나 즐겨찾기 여부가 바뀌어도 `Photo.ID`는 유지돼요.

ID로 모델을 찾을 때는 작은 helper를 사용해요.

```swift
private func index(of id: Photo.ID) -> Int? {
  photos.firstIndex { $0.id == id }
}

private func photo(for id: Photo.ID) -> Photo? {
  guard let index = index(of: id) else {
    return nil
  }
  return photos[index]
}
```

### Dictionary와 ID 배열을 따로 두지 않는 이유

`[Photo.ID: Photo]`는 ID 조회가 평균 O(1)이고 `[Photo.ID]`는 화면 순서를 표현하기 좋아요. 하지만 삽입·삭제·이동 때 두 저장소를 항상 함께 수정해야 하므로 한쪽만 바뀌는 버그가 생길 수 있어요.

| 방식                               | 장점                                   | 비용                                               |
| ---------------------------------- | -------------------------------------- | -------------------------------------------------- |
| 단일 `[Photo]`                     | 원본이 하나라 갱신 순서가 단순해요.    | ID 조회가 O(n)이에요.                              |
| Dictionary + 순서 배열             | ID 조회가 평균 O(1)이에요.             | 두 가변 저장소의 삽입·삭제·이동을 동기화해야 해요. |
| 배열 + 필요할 때 계산한 Dictionary | 원본은 하나고 일괄 조회도 빠르게 해요. | Index를 다시 만드는 비용과 시점을 관리해야 해요.   |

사진 수가 작고 학습이 목적인 이 예제에서는 배열 하나가 더 적합해요. 수천 개 모델을 반복 조회해 실제 병목이 확인되면, 배열을 원본으로 유지한 채 읽기 전용 ID index를 계산하거나 순서와 조회를 함께 책임지는 별도 store 타입을 도입하세요.

## Flow Layout을 준비해요

이 문서에서는 data source 흐름에 집중할 수 있도록 고정 격자를 사용해요.

```swift
private func makeGridLayout() -> UICollectionViewFlowLayout {
  let layout = UICollectionViewFlowLayout()
  layout.minimumInteritemSpacing = 12
  layout.minimumLineSpacing = 12
  layout.sectionInset = UIEdgeInsets(
    top: 16,
    left: 16,
    bottom: 16,
    right: 16
  )
  layout.itemSize = CGSize(width: 160, height: 160)
  return layout
}
```

Data source와 layout은 독립적이므로 나중에 [Compositional Layout](./compositional-layout)로 바꿔도 snapshot 흐름은 유지할 수 있어요.

## Collection View를 화면에 배치해요

```swift
extension DiffablePhotoGridViewController {
  private func configureCollectionView() {
    collectionView.translatesAutoresizingMaskIntoConstraints = false
    collectionView.backgroundColor = .systemBackground
    collectionView.delegate = self

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

Diffable Data Source를 생성하면 대상 Collection View의 `dataSource`로 연결돼요. 그 뒤 `collectionView.dataSource`를 다른 객체로 교체하지 마세요.

## Cell Registration과 cell provider를 연결해요

```swift
extension DiffablePhotoGridViewController {
  private func configureDataSource() {
    let registration = UICollectionView.CellRegistration<
      PhotoCell,
      Photo.ID
    > { [weak self] cell, _, photoID in
      guard let photo = self?.photo(for: photoID) else {
        return
      }

      cell.configure(with: photo)
    }

    dataSource = UICollectionViewDiffableDataSource(
      collectionView: collectionView
    ) { collectionView, indexPath, photoID in
      collectionView.dequeueConfiguredReusableCell(
        using: registration,
        for: indexPath,
        item: photoID
      )
    }
  }
}
```

Cell Registration은 셀 타입과 구성 코드를 묶어요. `dequeueConfiguredReusableCell`을 사용하면 별도의 reuse identifier 등록을 하지 않아도 돼요.

`registration`의 item 타입이 반드시 data source의 item identifier 타입과 같아야 하는 것은 아니에요. 이 예제에서는 ID를 받아 backing store에서 모델을 찾는 흐름을 명확히 하기 위해 둘 다 `Photo.ID`로 사용해요.

## 초기 상태를 snapshot으로 표시해요

```swift
extension DiffablePhotoGridViewController {
  private func show(
    _ newPhotos: [Photo],
    animatingDifferences: Bool = true
  ) {
    photos = newPhotos

    applyCurrentSnapshot(
      animatingDifferences: animatingDifferences
    )
  }

  private func applyCurrentSnapshot(
    animatingDifferences: Bool = true
  ) {
    var snapshot =
      NSDiffableDataSourceSnapshot<Section, Photo.ID>()
    snapshot.appendSections([.main])
    snapshot.appendItems(
      photos.map(\.id),
      toSection: .main
    )

    dataSource.apply(
      snapshot,
      animatingDifferences: animatingDifferences
    )
  }
}
```

각 section identifier와 item identifier는 snapshot 안에서 유일해야 해요. 같은 `Photo.ID`를 두 번 append하면 예외가 발생해요.

## item을 삽입하고 삭제해요

```swift
extension DiffablePhotoGridViewController {
  func append(_ photo: Photo) {
    guard index(of: photo.id) == nil else {
      return
    }

    photos.append(photo)
    applyCurrentSnapshot()
  }

  func deletePhoto(id: Photo.ID) {
    photos.removeAll { $0.id == id }
    applyCurrentSnapshot()
  }
}
```

앱은 여전히 모델 변화를 감지하고 backing store를 갱신할 책임이 있어요. Diffable Data Source는 새 snapshot과 현재 snapshot의 차이를 화면에 반영하지만 서버나 저장소를 자동으로 관찰하지 않아요.

## 기존 item의 내용만 다시 구성해요

```swift
extension DiffablePhotoGridViewController {
  func toggleFavorite(id: Photo.ID) {
    guard let index = index(of: id) else {
      return
    }

    photos[index].isFavorite.toggle()

    var snapshot = dataSource.snapshot()
    guard snapshot.indexOfItem(id) != nil else {
      return
    }

    snapshot.reconfigureItems([id])
    dataSource.apply(snapshot, animatingDifferences: true)
  }
}
```

`reconfigureItems(_:)`는 ID와 기존 셀 상태를 유지하면서 cell provider를 다시 호출해요. iOS 15 이상에서 사용할 수 있어요.

모델 전체를 item identifier로 넣고 자동 생성된 `Hashable`을 사용하면 `isFavorite` 변경 뒤 다른 값으로 판단될 수 있어요. 같은 사진의 내용만 바뀐 경우에는 안정적인 `Photo.ID`를 유지하세요.

## 선택한 위치를 identifier로 바꿔요

```swift
extension DiffablePhotoGridViewController:
  UICollectionViewDelegate
{
  func collectionView(
    _ collectionView: UICollectionView,
    didSelectItemAt indexPath: IndexPath
  ) {
    guard let photoID = dataSource.itemIdentifier(
      for: indexPath
    ) else {
      return
    }

    toggleFavorite(id: photoID)
  }
}
```

선택 순간의 `IndexPath`는 identifier를 얻는 데만 사용해요. 비동기 작업, 선택 상태, 화면 이동에는 `Photo.ID`를 전달해요.

## 원하는 위치로 item을 이동해요

새 snapshot을 직접 수정해 특정 item을 이동할 수도 있어요.

```swift
extension DiffablePhotoGridViewController {
  func movePhoto(
    id: Photo.ID,
    before destinationID: Photo.ID
  ) {
    guard
      let sourceIndex = index(of: id),
      let destinationIndex = index(of: destinationID)
    else {
      return
    }

    let photo = photos.remove(at: sourceIndex)
    photos.insert(
      photo,
      at: sourceIndex < destinationIndex
        ? destinationIndex - 1
        : destinationIndex
    )
    applyCurrentSnapshot()
  }
}
```

화면의 snapshot만 임시로 바꾸기보다 backing store의 순서를 먼저 변경한 뒤 snapshot을 다시 만드는 흐름이 다음 갱신을 예측하기 쉬워요.

## 전통적인 data source와 비교해요

| 질문                | `UICollectionViewDataSource`           | `UICollectionViewDiffableDataSource`       |
| ------------------- | -------------------------------------- | ------------------------------------------ |
| item을 찾는 기준    | 주로 현재 위치인 `IndexPath`           | 안정적인 `Hashable` identifier             |
| 셀 제공 위치        | `cellForItemAt` protocol 메서드        | cell provider closure                      |
| 삽입·삭제           | 모델과 batch update를 직접 맞춰요.     | 새 snapshot을 적용해 차이를 계산하게 해요. |
| 기존 item 내용 변경 | `reloadItems(at:)` 등을 직접 호출해요. | `reconfigureItems(_:)`를 사용할 수 있어요. |
| 주의점              | item 개수와 update 명령의 불일치       | 불안정하거나 중복된 identifier             |

## 자주 발생하는 문제를 점검해요

| 증상                                | 먼저 확인할 것                                                           |
| ----------------------------------- | ------------------------------------------------------------------------ |
| snapshot 적용 중 중복 예외가 나요.  | section과 item identifier가 각각 유일한지 확인해요.                      |
| 내용 변경 뒤 선택이 사라져요.       | 바뀌는 모델 전체가 아니라 `Photo.ID`를 identifier로 사용했는지 확인해요. |
| 셀 provider에서 모델을 찾지 못해요. | snapshot의 ID가 현재 `photos` 배열에도 존재하는지 확인해요.              |
| 삭제한 item이 다시 나타나요.        | `photos`에서 제거한 뒤 배열 기준으로 새 snapshot을 적용했는지 봐요.      |
| 셀이 전혀 표시되지 않아요.          | `configureDataSource()` 뒤 초기 snapshot을 적용했는지 확인해요.          |

## 면접에서 이어질 수 있는 질문

### Diffable Data Source가 모델도 자동으로 갱신하나요?

아니요. 앱이 데이터 변화를 감지하고 backing store를 먼저 갱신한 뒤 새 snapshot을 적용해야 해요. Diffable Data Source는 두 snapshot의 차이를 Collection View에 반영해요.

### 왜 모델 전체가 아니라 ID를 snapshot에 넣나요?

제목이나 즐겨찾기처럼 바뀌는 속성이 item의 정체성에 섞이지 않게 하기 위해서예요. 안정적인 ID를 사용하면 같은 item의 선택, 포커스, 셀 상태를 유지하며 내용만 다시 구성할 수 있어요.

## 다음 예제로 이동해요

- 선택 callback을 identifier와 snapshot에 연결하려면 [현대적인 `UICollectionViewDelegate` 예제](./modern-delegate)를 읽어 보세요.
- 곧 보일 이미지 작업을 미리 시작하려면 [`UICollectionViewDataSourcePrefetching` 예제](./data-source-prefetching)를 읽어 보세요.
- section마다 다른 배치를 만들려면 [`UICollectionViewCompositionalLayout` 예제](./compositional-layout)로 이동하세요.
- 새로고침과 prefetch는 [실무 확장 예제](./practical-recipes)에서 이어서 구현해요.

## 전체 최종 코드

아래 최종본은 [공통 `Photo`와 `PhotoCell`](./index)을 사용해 단일 `[Photo]` 배열, Cell Registration, snapshot, 삽입·삭제·내용 변경·이동을 모두 연결해요.

<details>
<summary>전체 코드 펼쳐보기</summary>

```swift
import UIKit

@MainActor
final class DiffablePhotoGridViewController: UIViewController {
  private enum Section {
    case main
  }

  private var photos: [Photo] = []
  private var dataSource:
    UICollectionViewDiffableDataSource<Section, Photo.ID>!

  private lazy var collectionView = UICollectionView(
    frame: .zero,
    collectionViewLayout: makeGridLayout()
  )

  override func viewDidLoad() {
    super.viewDidLoad()

    configureCollectionView()
    configureDataSource()
    show(Photo.samples, animatingDifferences: false)
  }

  private func index(of id: Photo.ID) -> Int? {
    photos.firstIndex { $0.id == id }
  }

  private func photo(for id: Photo.ID) -> Photo? {
    guard let index = index(of: id) else {
      return nil
    }
    return photos[index]
  }

  private func makeGridLayout() -> UICollectionViewFlowLayout {
    let layout = UICollectionViewFlowLayout()
    layout.minimumInteritemSpacing = 12
    layout.minimumLineSpacing = 12
    layout.sectionInset = UIEdgeInsets(
      top: 16,
      left: 16,
      bottom: 16,
      right: 16
    )
    layout.itemSize = CGSize(width: 160, height: 160)
    return layout
  }

  private func configureCollectionView() {
    view.backgroundColor = .systemBackground
    collectionView.translatesAutoresizingMaskIntoConstraints = false
    collectionView.backgroundColor = .systemBackground
    collectionView.delegate = self

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

  private func configureDataSource() {
    let registration = UICollectionView.CellRegistration<
      PhotoCell,
      Photo.ID
    > { [weak self] cell, _, photoID in
      guard let photo = self?.photo(for: photoID) else {
        return
      }
      cell.configure(with: photo)
    }

    dataSource = UICollectionViewDiffableDataSource(
      collectionView: collectionView
    ) { collectionView, indexPath, photoID in
      collectionView.dequeueConfiguredReusableCell(
        using: registration,
        for: indexPath,
        item: photoID
      )
    }
  }

  private func show(
    _ newPhotos: [Photo],
    animatingDifferences: Bool = true
  ) {
    photos = newPhotos
    applyCurrentSnapshot(
      animatingDifferences: animatingDifferences
    )
  }

  private func applyCurrentSnapshot(
    animatingDifferences: Bool = true
  ) {
    var snapshot =
      NSDiffableDataSourceSnapshot<Section, Photo.ID>()
    snapshot.appendSections([.main])
    snapshot.appendItems(photos.map(\.id), toSection: .main)
    dataSource.apply(
      snapshot,
      animatingDifferences: animatingDifferences
    )
  }

  func append(_ photo: Photo) {
    guard index(of: photo.id) == nil else {
      return
    }
    photos.append(photo)
    applyCurrentSnapshot()
  }

  func deletePhoto(id: Photo.ID) {
    photos.removeAll { $0.id == id }
    applyCurrentSnapshot()
  }

  func toggleFavorite(id: Photo.ID) {
    guard let index = index(of: id) else {
      return
    }
    photos[index].isFavorite.toggle()

    var snapshot = dataSource.snapshot()
    guard snapshot.indexOfItem(id) != nil else {
      return
    }
    snapshot.reconfigureItems([id])
    dataSource.apply(snapshot, animatingDifferences: true)
  }

  func movePhoto(
    id: Photo.ID,
    before destinationID: Photo.ID
  ) {
    guard
      let sourceIndex = index(of: id),
      let destinationIndex = index(of: destinationID)
    else {
      return
    }

    let photo = photos.remove(at: sourceIndex)
    let insertionIndex = sourceIndex < destinationIndex
      ? destinationIndex - 1
      : destinationIndex
    photos.insert(photo, at: insertionIndex)
    applyCurrentSnapshot()
  }
}

extension DiffablePhotoGridViewController:
  UICollectionViewDelegate
{
  func collectionView(
    _ collectionView: UICollectionView,
    didSelectItemAt indexPath: IndexPath
  ) {
    guard let id = dataSource.itemIdentifier(
      for: indexPath
    ) else {
      return
    }
    toggleFavorite(id: id)
  }
}
```

</details>

## 참고 자료

- [Apple Developer Documentation — Updating collection views using diffable data sources](https://developer.apple.com/documentation/uikit/updating-collection-views-using-diffable-data-sources)
- [Apple Developer Documentation — UICollectionViewDiffableDataSource](https://developer.apple.com/documentation/uikit/uicollectionviewdiffabledatasource)
- [Apple Developer Documentation — NSDiffableDataSourceSnapshot](https://developer.apple.com/documentation/uikit/nsdiffabledatasourcesnapshot)
- [Apple Developer Documentation — UICollectionView.CellRegistration](https://developer.apple.com/documentation/uikit/uicollectionview/cellregistration)
