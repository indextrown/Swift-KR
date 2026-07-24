---
title: 'UICollectionViewDropDelegate 예제'
description: 'UICollectionViewDropDelegate로 내부 재배치와 외부 문자열 삽입을 구분하고, Drop Proposal·모델 갱신·Coordinator 애니메이션의 순서를 안전하게 맞춥니다.'
---

# UICollectionViewDropDelegate 예제

> **면접 답변 한 줄 요약:** `UICollectionViewDropDelegate`는 들어온 drag 데이터를 받을 수 있는지와 삽입 방식·위치를 결정하고, 모델을 먼저 갱신한 뒤 coordinator에 최종 drop 위치를 알려 주는 프로토콜이에요.

이 문서는 [`UICollectionViewDragDelegate` 예제](./drag-delegate)에서 만든 `UIDragItem`을 같은 갤러리 안에서 재배치하고, 다른 앱에서 온 문자열을 새 사진으로 추가해요.

## 먼저 알아둘 용어

| 용어             | 쉬운 뜻                                                                           |
| ---------------- | --------------------------------------------------------------------------------- |
| drop session     | Drag 데이터가 Collection View 영역에 들어와 위치를 움직이는 동안의 작업 단위예요. |
| drop proposal    | 현재 위치에 데이터를 복사·이동할지, 어떤 방식으로 삽입할지 표현한 값이에요.       |
| drop coordinator | Drop item, 목적지와 애니메이션을 실제 데이터 갱신에 맞춰 연결하는 객체예요.       |
| local drag       | 같은 앱 안에서 시작해 `localObject`를 바로 읽을 수 있는 drag예요.                 |
| external drop    | 다른 앱에서 시작해 `NSItemProvider`를 비동기로 읽어야 하는 drop이에요.            |

## Drop Delegate를 연결해요

```swift
override func viewDidLoad() {
  super.viewDidLoad()

  collectionView.dropDelegate = self
}
```

내부 재배치까지 지원한다면 Drag Delegate도 함께 연결해요. Drop만 지원하는 화면이라면 외부 앱에서 들어온 데이터만 받을 수도 있어요.

## 받을 수 있는 데이터 타입을 선언해요

```swift
extension ClassicPhotoGridViewController:
  UICollectionViewDropDelegate
{
  func collectionView(
    _ collectionView: UICollectionView,
    canHandle session: UIDropSession
  ) -> Bool {
    session.canLoadObjects(ofClass: NSString.self)
      || session.localDragSession != nil
  }
}
```

지원하지 않는 데이터는 일찍 `false`를 반환해요. 실제 앱에서 이미지 파일을 받는다면 `UIImage`, `UTType.image` 또는 앱의 문서 타입처럼 목적에 맞는 표현을 확인하세요.

## 이동과 복사를 Proposal로 구분해요

```swift
func collectionView(
  _ collectionView: UICollectionView,
  dropSessionDidUpdate session: UIDropSession,
  withDestinationIndexPath destinationIndexPath: IndexPath?
) -> UICollectionViewDropProposal {
  if session.localDragSession != nil {
    return UICollectionViewDropProposal(
      operation: .move,
      intent: .insertAtDestinationIndexPath
    )
  }

  return UICollectionViewDropProposal(
    operation: .copy,
    intent: .insertAtDestinationIndexPath
  )
}
```

같은 앱 안의 item은 기존 모델을 옮기므로 `.move`, 외부 데이터는 새 모델을 만들므로 `.copy`를 사용해요. `.forbidden`을 반환하면 현재 위치에서 drop할 수 없다는 피드백을 표시해요.

## 목적지 IndexPath를 안전한 범위로 보정해요

```swift
private func resolvedDestination(
  from coordinator: UICollectionViewDropCoordinator
) -> IndexPath {
  if let destination = coordinator.destinationIndexPath {
    return IndexPath(
      item: min(destination.item, photos.count),
      section: 0
    )
  }

  return IndexPath(item: photos.count, section: 0)
}
```

빈 공간에 drop하면 목적지가 `nil`일 수 있어 마지막 위치를 사용해요. 기존 item을 같은 배열 안에서 아래쪽으로 이동할 때는 source 제거로 index가 하나 줄어드는 점도 처리해야 해요.

## 같은 Collection View 안에서 Item을 이동해요

```swift
func collectionView(
  _ collectionView: UICollectionView,
  performDropWith coordinator: UICollectionViewDropCoordinator
) {
  var destination = resolvedDestination(from: coordinator)

  for item in coordinator.items {
    guard
      let source = item.sourceIndexPath,
      let photoID = item.dragItem.localObject as? Photo.ID,
      let sourceIndex = photos.firstIndex(
        where: { $0.id == photoID }
      )
    else {
      loadExternalItem(
        item,
        destination: destination,
        coordinator: coordinator
      )
      destination = IndexPath(
        item: destination.item + 1,
        section: destination.section
      )
      continue
    }

    let photo = photos[sourceIndex]
    let adjustedDestination = sourceIndex < destination.item
      ? destination.item - 1
      : destination.item
    let insertionIndex = min(
      max(adjustedDestination, 0),
      photos.count
    )
    collectionView.performBatchUpdates {
      photos.remove(at: sourceIndex)
      photos.insert(photo, at: insertionIndex)
      collectionView.moveItem(
        at: source,
        to: IndexPath(item: insertionIndex, section: 0)
      )
    }

    coordinator.drop(
      item.dragItem,
      toItemAt: IndexPath(
        item: insertionIndex,
        section: 0
      )
    )
  }
}
```

`localObject`의 ID로 현재 모델 위치를 다시 찾아요. Drag 시작 뒤 배열이 바뀔 수 있으므로 오래된 source `IndexPath`만 모델 조회에 사용하지 않아요.

## 외부 문자열을 비동기로 받아요

```swift
private func loadExternalItem(
  _ item: UICollectionViewDropItem,
  destination: IndexPath,
  coordinator: UICollectionViewDropCoordinator
) {
  let placeholder = UICollectionViewDropPlaceholder(
    insertionIndexPath: destination,
    reuseIdentifier: PhotoCell.reuseIdentifier
  )
  let context = coordinator.drop(
    item.dragItem,
    to: placeholder
  )

  item.dragItem.itemProvider.loadObject(
    ofClass: NSString.self
  ) { [weak self] object, error in
    DispatchQueue.main.async {
      guard
        let self,
        error == nil,
        let title = object as? String
      else {
        context.deletePlaceholder()
        return
      }

      let photo = Photo(
        id: UUID(),
        title: title,
        symbolName: "photo.fill",
        isFavorite: false
      )

      context.commitInsertion { insertionIndexPath in
        self.photos.insert(
          photo,
          at: insertionIndexPath.item
        )
      }
    }
  }
}
```

외부 provider 로딩이 끝날 때까지 placeholder가 drop 위치를 유지해요. 로딩이 실패하면 placeholder를 삭제하고, 성공하면 `commitInsertion` 안에서 모델을 갱신해요.

## Diffable Data Source에서는 Snapshot을 갱신해요

전통적인 배열과 `moveItem` 대신 다음 순서를 사용해요.

1. `localObject` 또는 item provider에서 안정적인 ID와 모델을 얻어요.
2. Backing store의 순서를 먼저 변경해요.
3. 현재 snapshot에서 `deleteItems`, `insertItems` 또는 새 전체 순서를 구성해요.
4. Snapshot을 적용해 Collection View가 이동 차이를 계산하게 해요.
5. Coordinator의 `drop(_:toItemAt:)`으로 drop preview의 목적지를 알려요.

같은 변경에 `moveItem`과 Diffable snapshot을 동시에 적용하면 두 갱신 경로가 충돌할 수 있으므로 하나만 선택하세요.

## 자주 발생하는 문제를 점검해요

| 증상                                    | 먼저 확인할 것                                                         |
| --------------------------------------- | ---------------------------------------------------------------------- |
| Drop 위치와 모델 순서가 달라요.         | Source 제거 뒤 destination index를 보정했는지 확인해요.                |
| 외부 Drop이 아무 반응 없이 실패해요.    | `canHandle`, provider 타입, 비동기 오류와 placeholder 삭제를 확인해요. |
| 재배치 중 update 예외가 발생해요.       | 모델 변경과 Collection View update의 전후 item 개수가 일치하는지 봐요. |
| Diffable 화면에서 animation이 중복돼요. | Snapshot과 `moveItem`을 동시에 호출하지 않는지 확인해요.               |
| Drag 시작 뒤 다른 item이 이동해요.      | `localObject`의 ID로 현재 모델 위치를 다시 찾는지 확인해요.            |

## 면접에서 이어질 수 있는 질문

### Drop Delegate의 필수 메서드는 무엇인가요?

`collectionView(_:performDropWith:)`예요. 여기에서 받은 item을 모델과 Data Source에 반영하고 coordinator에 최종 drop 위치나 placeholder를 전달해요.

### 내부 재배치와 외부 Drop은 어떻게 구분하나요?

`session.localDragSession`과 `UIDragItem.localObject`를 사용할 수 있으면 같은 앱 내부 흐름으로 처리할 수 있어요. 외부 데이터는 `NSItemProvider`가 제공하는 등록 타입을 검사하고 비동기로 로드해 새 모델을 만들어요.

## 참고 자료

- [Apple Developer Documentation — UICollectionViewDropDelegate](https://developer.apple.com/documentation/uikit/uicollectionviewdropdelegate)
- [Apple Developer Documentation — Supporting drag and drop in collection views](https://developer.apple.com/documentation/uikit/supporting-drag-and-drop-in-collection-views)
- [Apple Developer Documentation — UICollectionViewDropCoordinator](https://developer.apple.com/documentation/uikit/uicollectionviewdropcoordinator)
