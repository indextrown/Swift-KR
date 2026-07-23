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

## 개요 (Overview)

Collection View는 표시 중인 item과 함께 동작하는 전용 API를 통해 드래그 앤 드롭을 지원해요. 드래그를 지원하려면 `UICollectionViewDragDelegate`를 채택하는 drag delegate 객체를 만들고 Collection View의 `dragDelegate`에 지정해요. 드롭을 처리하려면 `UICollectionViewDropDelegate`를 채택하는 drop delegate 객체를 만들고 `dropDelegate`에 지정해요.

### Collection View에서 Item 드래그하기 (Drag Items from the Collection View)

Collection View가 드래그와 관련된 상호작용 대부분을 관리하지만, 어떤 item을 드래그할지는 앱이 지정해야 해요. 드래그 제스처가 발생하면 Collection View가 drag session을 만들고 drag delegate의 `collectionView(_:itemsForBeginning:at:)`을 호출해요. 이 메서드가 비어 있지 않은 배열을 반환하면 지정한 item의 드래그를 시작하고, 빈 배열을 반환하면 해당 IndexPath의 item을 드래그하지 않아요.

> **참고:** `UICollectionViewDragDelegate`의 다른 메서드를 사용하면 드래그 중인 item의 모양을 사용자 정의하거나 현재 drag session에 item을 추가하는 등 부가적인 드래그 상호작용을 관리할 수 있어요.

`collectionView(_:itemsForBeginning:at:)`을 구현할 때는 다음 순서로 처리해요.

1. 하나 이상의 `NSItemProvider`를 만들어요. Item provider는 Collection View item의 데이터를 표현해요.
2. 각 item provider를 `UIDragItem`으로 감싸요.
3. 필요하다면 각 drag item의 `localObject`에 값을 지정해요. 필수 단계는 아니지만 같은 앱 안에서 콘텐츠를 드래그 앤 드롭할 때 더 빠르게 전달할 수 있어요.
4. 메서드에서 drag item 배열을 반환해요.

전달받은 IndexPath로 어떤 item을 드래그할지 결정해요. 해당 item이 현재 선택된 item 집합에 포함되어 있으면 Collection View가 선택된 모든 item을 자동으로 드래그해요. 현재 선택에 포함되지 않았다면 그 item을 드래그 작업에 추가해요.

드래그 시작에 관한 자세한 내용은 `UICollectionViewDragDelegate` 문서를 참고하세요.

### 드롭된 콘텐츠 받기 (Receive Dropped Content)

Collection View 영역 안으로 콘텐츠가 들어오면 Collection View는 drop delegate에 드래그 데이터를 받을 수 있는지 물어봐요. 처음에는 `collectionView(_:canHandle:)`만 호출해 지정된 데이터를 data source에 포함할 수 있는지 확인해요. 데이터를 받을 수 있다면 어디에 드롭할 수 있는지 판단하기 위해 다른 delegate 메서드도 호출하기 시작해요.

사용자의 손가락이 움직이는 동안 Collection View는 예상 drop 위치를 추적하고 위치가 바뀔 때마다 `collectionView(_:dropSessionDidUpdate:withDestinationIndexPath:)`을 호출해 delegate에 알려요. 구현은 선택 사항이지만, 드래그한 item을 어떤 방식으로 반영할지 Collection View가 시각적으로 보여 줄 수 있으므로 구현하는 편이 좋아요. 지정된 IndexPath에서 드롭을 처리할 방법을 담은 `UICollectionViewDropProposal`을 반환하세요. 새 item으로 삽입하거나 기존 item에 데이터를 추가하는 등의 방식을 제안할 수 있어요. 이 메서드는 자주 호출되므로 가능한 한 빠르게 proposal을 반환해야 해요. 구현하지 않으면 Collection View가 드롭 처리 방식에 대한 시각적 피드백을 제공하지 않아요.

사용자가 화면에서 손가락을 떼어 드롭을 확정하면 Collection View가 drop delegate의 `collectionView(_:performDropWith:)`을 호출해요. 이 메서드는 반드시 구현해야 해요. 드래그 데이터를 가져오고 Collection View의 data source를 갱신한 다음 필요한 item을 Collection View에 삽입하세요. 같은 Collection View에서 시작한 item은 기존 Collection View API로 순서를 직접 바꿀 수 있어요. 외부에서 온 콘텐츠는 앱 내부에서 시작했다면 `localObject`, 그 밖의 경우에는 `NSItemProvider`를 이용해 데이터를 가져와 삽입해요.

`collectionView(_:performDropWith:)`을 구현할 때는 다음 순서로 처리해요.

1. 전달받은 drop coordinator의 `items`를 순회해요.
2. 각 item의 출처에 따라 콘텐츠 처리 방식을 결정해요.

- `sourceIndexPath`에 값이 있으면 같은 Collection View에서 시작한 item이에요. Batch update로 현재 위치에서 삭제하고 새 IndexPath에 삽입해요.
- Drag item의 `localObject`에 값이 있으면 같은 앱의 다른 위치에서 시작한 item이에요. 새 item을 삽입하거나 기존 item을 갱신해요.
- 앞의 두 정보를 사용할 수 없다면 drag item의 `itemProvider`에 있는 `NSItemProvider`로 데이터를 비동기 로드한 뒤 item을 삽입하거나 갱신해요.

1. Data source를 갱신하고 Collection View에 필요한 item을 삽입하거나 이동해요.

앱 내부에 이미 존재하는 item은 보통 Collection View의 data source와 화면을 직접 갱신할 수 있어요. 예를 들어 같은 Collection View에서 시작한 item을 batch update로 삭제한 뒤 새 위치에 삽입할 수 있어요. 작업이 끝나면 drop coordinator의 `drop(_:toItemAt:)`을 호출해 드래그한 콘텐츠가 Collection View에 삽입되는 애니메이션을 실행해요.

`NSItemProvider`로 데이터를 가져와야 한다면 실제 데이터가 도착할 때까지 Collection View에 placeholder를 삽입해요. Placeholder는 Collection View에 새 item을 추가할 때만 필요해요. 실제 데이터가 준비될 때까지 임시 item으로 남아 기본 콘텐츠를 표시하며, 예를 들어 “불러오는 중”이라는 문구를 가진 셀을 보여 줄 수 있어요.

Collection View에 placeholder를 삽입할 때는 다음 순서로 처리해요.

1. 전달받은 `UICollectionViewDropCoordinator`의 `drop(_:to:)`을 호출해 placeholder 셀을 Collection View에 삽입해요.
2. `NSItemProvider`에서 데이터를 비동기로 불러오기 시작해요.

`NSItemProvider`가 실제 데이터를 반환하면 삽입을 확정하고 placeholder 셀을 최종 셀로 교체해요. Placeholder를 만들 때 받은 context의 `commitInsertion(dataSourceUpdates:)`을 호출하고, 전달하는 closure 안에서 모델 객체와 Collection View data source를 갱신하세요. 이 메서드가 반환되면 Collection View가 placeholder를 자동으로 삭제하고 최종 item을 삽입해 갱신된 데이터를 새 item에 반영해요.

Placeholder는 drop coordinator의 `destinationIndexPath`가 지정하는 위치에 삽입해요.

## Swift-KR 보충: 실제 Delegate 코드로 연결해요

먼저 drag delegate와 drop delegate를 Collection View에 연결해요.

```swift
collectionView.dragDelegate = self
collectionView.dropDelegate = self
collectionView.dragInteractionEnabled = true
```

Drag delegate에서는 안정적인 item 식별자로 item provider와 drag item을 만들고, 같은 앱 안에서 빠르게 전달할 수 있도록 `localObject`도 설정할 수 있어요.

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

Drop delegate에서는 지원하는 데이터 타입을 먼저 확인하고 현재 session에 맞는 proposal을 반환해요.

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

Drop item의 상태에 따라 세 경로를 구분해요.

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

외부 데이터를 기다리는 동안에는 placeholder를 삽입하고, 데이터가 도착하면 context를 이용해 최종 item으로 교체해요.

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

## Swift-KR 보충: 점검표

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
