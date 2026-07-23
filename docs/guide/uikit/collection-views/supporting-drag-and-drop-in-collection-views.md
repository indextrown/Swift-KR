---
title: 'Collection View에서 드래그 앤 드롭 지원하기'
description: 'Apple 공식 흐름에 따라 drag item 생성, drop 수용 판단과 proposal, 내부 이동·앱 내부 localObject·외부 NSItemProvider 분기, 비동기 placeholder 교체를 빠짐없이 설명합니다.'
---

# Collection View에서 드래그 앤 드롭 지원하기

> **면접 답변 한 줄 요약:** Drag delegate는 이동할 `UIDragItem`을 만들고 Drop delegate는 수용 가능 여부·제안·모델 갱신·최종 애니메이션을 조정해요.

## 먼저 알아둘 용어

| 용어             | 쉬운 뜻                                                                             |
| ---------------- | ----------------------------------------------------------------------------------- |
| Drag Session     | 사용자가 하나 이상의 item을 끄는 전체 상호작용이에요.                               |
| Drop Proposal    | 현재 위치에서 복사·이동·금지와 삽입 방식을 표현한 값이에요.                         |
| `localObject`    | 같은 앱 안에서 이동할 때 직렬화 없이 전달할 수 있는 앱 내부 객체예요.               |
| `NSItemProvider` | 앱 밖에서도 사용할 수 있게 데이터를 지연 로딩하는 표준 제공자예요.                  |
| Placeholder      | 외부 데이터가 도착할 때까지 목적 위치를 임시로 차지하는 Collection View item이에요. |

## 개요

Collection View에서 드래그를 지원하려면 `UICollectionViewDragDelegate`를 채택한 객체를 `dragDelegate`에, 드롭을 지원하려면 `UICollectionViewDropDelegate`를 채택한 객체를 `dropDelegate`에 지정해요.

```swift
collectionView.dragDelegate = self
collectionView.dropDelegate = self
collectionView.dragInteractionEnabled = true
```

## Collection View에서 Item을 드래그해요

드래그 제스처가 시작되면 Collection View가 drag session을 만들고 `itemsForBeginning`을 호출해요. 빈 배열을 반환하면 해당 위치의 드래그를 허용하지 않고, 하나 이상의 `UIDragItem`을 반환하면 드래그를 시작해요.

```swift
func collectionView(
  _ collectionView: UICollectionView,
  itemsForBeginning session: UIDragSession,
  at indexPath: IndexPath
) -> [UIDragItem] {
  guard let id = dataSource.itemIdentifier(for: indexPath) else {
    return []
  }

  let provider = NSItemProvider(object: id.uuidString as NSString)
  let dragItem = UIDragItem(itemProvider: provider)
  dragItem.localObject = id
  return [dragItem]
}
```

현재 선택 집합에 포함된 item에서 드래그를 시작하면 Collection View가 선택된 item들을 함께 드래그해요. 선택되지 않은 item이라면 그 item을 현재 드래그에 포함해요.

> **참고:** `UICollectionViewDragDelegate`의 다른 메서드로 drag preview를 바꾸거나 진행 중인 session에 item을 추가할 수 있어요.

## 드롭할 콘텐츠를 받아요

드래그가 Collection View 경계 안으로 들어오면 다음 순서로 Drop delegate가 관여해요.

1. `canHandle`에서 데이터 타입을 앱 모델에 받아들일 수 있는지 검사해요.
2. 손가락 위치가 바뀔 때 `dropSessionDidUpdate`에서 제안을 빠르게 반환해요.
3. 사용자가 손가락을 떼면 `performDropWith`에서 데이터를 가져와 모델과 화면을 갱신해요.

### 받을 수 있는 타입인지 먼저 확인해요

```swift
func collectionView(
  _ collectionView: UICollectionView,
  canHandle session: UIDropSession
) -> Bool {
  session.canLoadObjects(ofClass: UIImage.self)
    || session.hasItemsConforming(
      toTypeIdentifiers: [UTType.utf8PlainText.identifier]
    )
}
```

### 현재 위치의 Drop Proposal을 반환해요

이 메서드는 손가락이 움직이는 동안 자주 호출되므로 모델을 변경하거나 느린 작업을 실행하지 말고 즉시 결과를 반환해요. 구현하지 않으면 Collection View가 목적 위치에 대한 충분한 시각 피드백을 제공하지 못해요.

```swift
func collectionView(
  _ collectionView: UICollectionView,
  dropSessionDidUpdate session: UIDropSession,
  withDestinationIndexPath destinationIndexPath: IndexPath?
) -> UICollectionViewDropProposal {
  let operation: UIDropOperation =
    session.localDragSession == nil ? .copy : .move
  return UICollectionViewDropProposal(
    operation: operation,
    intent: .insertAtDestinationIndexPath
  )
}
```

### 출처에 따라 실제 Drop을 처리해요

`UICollectionViewDropItem`의 상태에 따라 세 경로를 구분해요.

| 조건                          | 출처와 처리 방법                                                          |
| ----------------------------- | ------------------------------------------------------------------------- |
| `sourceIndexPath`가 있음      | 같은 Collection View에서 시작했으므로 모델 순서를 바꾸고 item을 이동해요. |
| `dragItem.localObject`가 있음 | 같은 앱의 다른 화면에서 왔으므로 앱 모델을 직접 삽입하거나 갱신해요.      |
| 위 두 정보가 없음             | 외부 앱에서 왔으므로 `itemProvider`에서 데이터를 비동기로 읽어요.         |

같은 Collection View의 item은 모델을 먼저 바꾸고 snapshot을 적용한 뒤 coordinator에 최종 위치를 알려요.

```swift
func collectionView(
  _ collectionView: UICollectionView,
  performDropWith coordinator: UICollectionViewDropCoordinator
) {
  let destination = coordinator.destinationIndexPath
    ?? IndexPath(item: max(0, photos.count - 1), section: 0)

  for dropItem in coordinator.items {
    if
      let source = dropItem.sourceIndexPath,
      let id = dropItem.dragItem.localObject as? Photo.ID
    {
      photos.move(id: id, from: source.item, to: destination.item)
      applyCurrentSnapshot()
      coordinator.drop(dropItem.dragItem, toItemAt: destination)
      continue
    }

    receiveExternal(dropItem, at: destination, coordinator: coordinator)
  }
}
```

화면 애니메이션만 실행하고 모델을 바꾸지 않으면 다음 reload나 snapshot에서 item이 이전 위치로 돌아가요. Diffable Data Source를 사용하지 않는 구현이라면 `performBatchUpdates` 안에서 data source 배열과 delete/insert/move 호출의 결과가 정확히 일치해야 해요.

### 외부 데이터는 Placeholder를 거쳐 받아요

`NSItemProvider`에서 큰 이미지나 파일을 읽는 동안 빈 자리를 유지하려면 `UICollectionViewDropPlaceholder`를 만들고 `drop(_:to:)`로 목적 위치에 넣어요. placeholder는 “불러오는 중” 같은 기본 셀을 표시할 수 있어요.

```swift
let placeholder = UICollectionViewDropPlaceholder(
  insertionIndexPath: destination,
  reuseIdentifier: LoadingCell.reuseIdentifier
) { cell in
  (cell as? LoadingCell)?.showProgress()
}

let context = coordinator.drop(
  dropItem.dragItem,
  to: placeholder
)
```

데이터를 받으면 context의 `commitInsertion(dataSourceUpdates:)`에서 모델을 갱신해요. 성공하면 Collection View가 placeholder를 제거하고 최종 item을 삽입해요. 로딩 실패나 취소 시에는 placeholder context를 삭제하고 진행 중인 작업도 정리해야 해요.

```swift
dropItem.dragItem.itemProvider.loadObject(
  ofClass: UIImage.self
) { [weak self] object, _ in
  Task { @MainActor in
    guard let self, let image = object as? UIImage else {
      context.deletePlaceholder()
      return
    }

    context.commitInsertion { insertionIndexPath in
      photos.insert(
        Photo(image: image),
        at: insertionIndexPath.item
      )
    }
  }
}
```

## 점검표

1. `canHandle`에서 지원 타입을 먼저 거르나요?
2. `dropSessionDidUpdate`가 빠르게 proposal만 반환하나요?
3. 동일 Collection View, 동일 앱, 외부 앱 경로를 구분하나요?
4. UI 애니메이션 전에 모델이나 snapshot을 먼저 갱신하나요?
5. 외부 비동기 데이터에 placeholder와 실패·취소 처리가 있나요?

## 참고 자료

- [Apple Developer Documentation — Supporting Drag and Drop in Collection Views](https://developer.apple.com/documentation/uikit/supporting-drag-and-drop-in-collection-views)
- [드래그 앤 드롭 학습 가이드](./drag-and-drop)
- [UICollectionViewDragDelegate](./uicollectionviewdragdelegate)
- [UICollectionViewDropDelegate](./uicollectionviewdropdelegate)
