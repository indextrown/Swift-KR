---
title: '현대적인 UICollectionViewDelegate 예제'
description: 'Diffable Data Source 기반 UICollectionView에서 delegate의 IndexPath를 item identifier로 변환해 선택·내용 갱신·표시 생명주기·컨텍스트 메뉴를 안전하게 처리합니다.'
---

# 현대적인 UICollectionViewDelegate 예제

> **면접 답변 한 줄 요약:** Diffable Collection View에서도 상호작용은 `UICollectionViewDelegate`가 처리하지만, callback의 `IndexPath`를 Diffable Data Source의 item identifier로 변환해 모델과 snapshot을 갱신해야 해요.

이 문서는 [`UICollectionViewDiffableDataSource` 예제](./diffable-data-source)의 `DiffablePhotoGridViewController`에 delegate 동작을 추가해요. 사용하는 delegate 프로토콜은 전통적인 방식과 같지만, 위치를 모델로 해석하는 방법이 달라요.

아래 extension은 예제 view controller와 같은 Swift 파일에 두는 것을 기준으로 해요. 파일을 분리한다면 delegate가 필요한 data source와 backing store에 접근할 수 있도록 `private` 접근 수준을 조정하거나, view controller 내부 메서드로 동작을 노출하세요.

## 먼저 알아둘 용어

| 용어            | 쉬운 뜻                                                                         |
| --------------- | ------------------------------------------------------------------------------- |
| item identifier | item이 이동해도 같은 데이터임을 나타내는 안정적인 `Hashable` 값이에요.          |
| snapshot        | 현재 화면의 section과 item 순서를 표현한 값이에요.                              |
| reconfigure     | 기존 item의 정체성과 셀 상태를 유지하면서 표시 내용만 다시 구성하는 갱신이에요. |
| backing store   | identifier로 실제 최신 모델을 찾는 저장소예요. 이 예제에서는 `photosByID`예요.  |
| delegate        | Collection View의 선택·표시·메뉴 같은 상호작용을 전달받는 객체예요.             |

## Delegate 연결은 전통적인 방식과 같아요

```swift
private func configureCollectionView() {
  collectionView.delegate = self
}
```

Diffable Data Source는 `collectionView.dataSource`를 맡지만 delegate를 대신하지 않아요. 선택과 사용자 상호작용이 필요하면 별도로 `delegate`를 연결해야 해요.

## IndexPath를 identifier로 변환하는 helper를 만들어요

```swift
extension DiffablePhotoGridViewController {
  private func photoID(
    at indexPath: IndexPath
  ) -> Photo.ID? {
    dataSource.itemIdentifier(for: indexPath)
  }
}
```

`itemIdentifier(for:)`는 현재 snapshot에서 해당 위치의 ID를 찾아요. Callback마다 배열을 직접 index로 조회하지 않고 이 helper를 사용하면 상호작용 코드가 Diffable 상태를 기준으로 동작해요.

## 선택 가능 여부를 최신 모델로 판단해요

```swift
extension DiffablePhotoGridViewController:
  UICollectionViewDelegate
{
  func collectionView(
    _ collectionView: UICollectionView,
    shouldSelectItemAt indexPath: IndexPath
  ) -> Bool {
    guard
      let id = photoID(at: indexPath),
      let photo = photosByID[id]
    else {
      return false
    }

    return !photo.title.isEmpty
  }
}
```

Snapshot에는 ID가 있지만 backing store에서 모델을 찾지 못한다면 아직 두 상태가 동기화되지 않은 거예요. 선택을 허용하지 않고 모델과 snapshot 갱신 순서를 먼저 확인하세요.

## 선택으로 모델을 바꾸고 item만 다시 구성해요

```swift
func collectionView(
  _ collectionView: UICollectionView,
  didSelectItemAt indexPath: IndexPath
) {
  guard let id = photoID(at: indexPath) else {
    return
  }

  toggleFavorite(id: id)
}
```

`toggleFavorite(id:)`는 backing store의 `isFavorite`를 바꾸고 현재 snapshot에서 해당 ID를 `reconfigureItems(_:)`로 지정해요.

```swift
private func toggleFavorite(id: Photo.ID) {
  guard photosByID[id] != nil else {
    return
  }

  photosByID[id]?.isFavorite.toggle()

  var snapshot = dataSource.snapshot()
  guard snapshot.indexOfItem(id) != nil else {
    return
  }

  snapshot.reconfigureItems([id])
  dataSource.apply(snapshot, animatingDifferences: true)
}
```

선택 callback에서 보이는 셀만 직접 바꾸면 스크롤 뒤 재사용된 셀이 backing store의 이전 값으로 다시 구성될 수 있어요. 모델을 먼저 바꾸고 snapshot으로 표시를 갱신해요.

## 다중 선택 상태를 ID로 저장해요

다중 선택을 사용하는 화면에서는 앞의 즐겨찾기 전환용 `didSelectItemAt` 대신 아래 구현으로 선택 상태를 별도 관리해요.

```swift
private var selectedPhotoIDs: Set<Photo.ID> = []

func collectionView(
  _ collectionView: UICollectionView,
  didSelectItemAt indexPath: IndexPath
) {
  guard let id = photoID(at: indexPath) else {
    return
  }
  selectedPhotoIDs.insert(id)
}

func collectionView(
  _ collectionView: UICollectionView,
  didDeselectItemAt indexPath: IndexPath
) {
  guard let id = photoID(at: indexPath) else {
    return
  }
  selectedPhotoIDs.remove(id)
}
```

새 snapshot을 적용한 뒤 현재 위치를 다시 조회해 선택을 복원할 수 있어요.

```swift
private func restoreSelection() {
  removeMissingSelection()

  for id in selectedPhotoIDs {
    guard let indexPath = dataSource.indexPath(for: id) else {
      continue
    }

    collectionView.selectItem(
      at: indexPath,
      animated: false,
      scrollPosition: []
    )
  }
}
```

`Set`을 순회하면서 같은 `Set`을 변경하지 않도록, 선택을 복원하기 전에 유효한 ID만 남겨요.

```swift
private func removeMissingSelection() {
  selectedPhotoIDs = selectedPhotoIDs.filter {
    dataSource.indexPath(for: $0) != nil
  }
}
```

`restoreSelection()`이 먼저 `removeMissingSelection()`을 호출하므로 삭제된 item은 선택 상태에서도 정리돼요.

## 셀이 나타날 때 identifier로 노출을 기록해요

```swift
func collectionView(
  _ collectionView: UICollectionView,
  willDisplay cell: UICollectionViewCell,
  forItemAt indexPath: IndexPath
) {
  guard let id = photoID(at: indexPath) else {
    return
  }
  print("사진 노출: \(id)")
}
```

`willDisplay`는 같은 ID에 여러 번 호출될 수 있어요. 한 번만 기록해야 한다면 `Set<Photo.ID>`로 중복을 제거하세요.

`didEndDisplaying`에서는 전달된 `IndexPath`가 새 snapshot에서 다른 ID를 가리킬 수 있으므로 셀 자체의 task를 취소하는 데 집중해요.

```swift
protocol ImageRequestCancelling: AnyObject {
  func cancelImageRequest()
}

func collectionView(
  _ collectionView: UICollectionView,
  didEndDisplaying cell: UICollectionViewCell,
  forItemAt indexPath: IndexPath
) {
  (cell as? any ImageRequestCancelling)?
    .cancelImageRequest()
}
```

## Context menu action도 identifier로 실행해요

```swift
func collectionView(
  _ collectionView: UICollectionView,
  contextMenuConfigurationForItemAt indexPath: IndexPath,
  point: CGPoint
) -> UIContextMenuConfiguration? {
  guard let photoID = photoID(at: indexPath) else {
    return nil
  }

  return UIContextMenuConfiguration(
    identifier: photoID as NSUUID,
    previewProvider: nil
  ) { [weak self] _ in
    let favorite = UIAction(
      title: "즐겨찾기 전환",
      image: UIImage(systemName: "heart")
    ) { _ in
      self?.toggleFavorite(id: photoID)
    }

    let delete = UIAction(
      title: "삭제",
      image: UIImage(systemName: "trash"),
      attributes: .destructive
    ) { _ in
      self?.deletePhoto(id: photoID)
    }

    return UIMenu(children: [favorite, delete])
  }
}
```

메뉴 action이 실행될 때 item 위치가 달라져도 ID는 같은 모델을 가리켜요. 삭제 구현은 backing store와 ID 순서를 바꾼 뒤 새 snapshot을 적용해야 해요.

## Compositional Layout의 section과 상호작용을 연결해요

`GalleryItemID`처럼 화면 역할을 포함한 identifier를 사용한다면 delegate에서 모델 ID를 한 번 더 꺼내요.

```swift
func collectionView(
  _ collectionView: UICollectionView,
  didSelectItemAt indexPath: IndexPath
) {
  guard let itemID = dataSource.itemIdentifier(
    for: indexPath
  ) else {
    return
  }

  let selectedPhotoID = itemID.photoID
  onSelectPhoto?(selectedPhotoID)
}
```

추천 section과 전체 section의 item identifier는 달라도 `photoID`는 같은 모델을 가리켜요. 즐겨찾기 내용이 바뀌면 같은 `Photo.ID`를 표현하는 두 화면 item을 모두 reconfigure해야 해요.

```swift
private func reconfigurePhoto(id: Photo.ID) {
  var snapshot = dataSource.snapshot()
  let candidates: [GalleryItemID] = [
    .featured(id),
    .library(id),
  ]
  let visibleIdentifiers = candidates.filter {
    snapshot.indexOfItem($0) != nil
  }

  snapshot.reconfigureItems(visibleIdentifiers)
  dataSource.apply(snapshot, animatingDifferences: true)
}
```

## 전통적인 Delegate 처리와 비교해요

| 단계               | 배열 기반 전통 방식                    | Diffable 기반 현대 방식                       |
| ------------------ | -------------------------------------- | --------------------------------------------- |
| callback이 주는 값 | `IndexPath`                            | `IndexPath`                                   |
| 모델 ID 찾기       | `photos[indexPath.item].id`            | `dataSource.itemIdentifier(for:)`             |
| 모델 내용 갱신     | 배열 원소를 수정해요.                  | ID로 backing store를 수정해요.                |
| 화면 내용 갱신     | `reloadItems(at:)` 등을 직접 호출해요. | snapshot의 `reconfigureItems(_:)`를 적용해요. |
| 선택 위치 복원     | 배열에서 ID의 현재 index를 검색해요.   | `dataSource.indexPath(for:)`로 조회해요.      |

Delegate 프로토콜 자체가 현대적인 다른 타입으로 바뀌는 것은 아니에요. Data Source가 위치 중심에서 identifier 중심으로 바뀌면서 delegate callback을 모델로 해석하는 코드가 달라져요.

## 자주 발생하는 문제를 점검해요

| 증상                                  | 먼저 확인할 것                                                                 |
| ------------------------------------- | ------------------------------------------------------------------------------ |
| 선택한 모델을 찾지 못해요.            | callback의 `IndexPath`를 현재 data source의 identifier로 변환하는지 확인해요.  |
| 내용 변경 뒤 셀이 원래대로 돌아가요.  | 보이는 셀만 직접 수정하지 않고 backing store와 snapshot을 갱신하는지 확인해요. |
| 두 section 중 한 셀만 바뀌어요.       | 같은 모델을 나타내는 모든 화면 identifier를 reconfigure하는지 확인해요.        |
| 선택 복원 중 잘못된 위치가 선택돼요.  | 저장한 `IndexPath` 대신 ID의 현재 `indexPath(for:)`를 조회하는지 확인해요.     |
| 메뉴에서 삭제한 item이 다시 나타나요. | backing store와 snapshot 양쪽에서 ID를 제거했는지 확인해요.                    |

## 면접에서 이어질 수 있는 질문

### Diffable Data Source를 쓰면 다른 Delegate가 필요한가요?

아니요. 선택과 상호작용은 동일한 `UICollectionViewDelegate`가 담당해요. 다만 callback의 `IndexPath`를 Diffable Data Source의 item identifier로 바꾸어 모델과 snapshot을 갱신해요.

### 같은 모델이 여러 section에 보이면 어떻게 갱신하나요?

Snapshot 안의 화면 identifier는 각각 유일해야 해요. 화면 역할을 포함한 identifier를 사용하고, 모델 내용이 바뀌면 같은 모델 ID를 나타내는 모든 화면 identifier를 reconfigure해요.

## 다음 예제로 이동해요

Delegate 상호작용을 연결했다면 [`UICollectionViewCompositionalLayout` 예제](./compositional-layout)에서 추천 카드와 반응형 격자를 한 화면에 구성해 보세요.

## 참고 자료

- [Apple Developer Documentation — UICollectionViewDelegate](https://developer.apple.com/documentation/uikit/uicollectionviewdelegate)
- [Apple Developer Documentation — UICollectionViewDiffableDataSource](https://developer.apple.com/documentation/uikit/uicollectionviewdiffabledatasource)
- [Apple Developer Documentation — Changing the appearance of selected and highlighted cells](https://developer.apple.com/documentation/uikit/changing-the-appearance-of-selected-and-highlighted-cells)
