---
title: Collection View 드래그 앤 드롭
description: UICollectionViewDragDelegate와 DropDelegate를 연결하고 로컬 재정렬, 외부 데이터, proposal, coordinator, placeholder 처리 흐름을 설명합니다.
---

# Collection View 드래그 앤 드롭

> **면접 답변 한 줄 요약:** Collection View의 drag delegate는 이동할 데이터를 `UIDragItem`으로 제공하고 drop delegate는 허용할 동작을 제안한 뒤, 실제 drop에서 모델과 snapshot을 먼저 갱신하고 coordinator로 애니메이션을 마무리해요.

드래그 앤 드롭은 셀을 손가락 위치로 움직이는 애니메이션만 뜻하지 않아요. 어떤 데이터를 옮기는지, 앱 안 이동인지 외부 앱에서 온 복사인지, 비동기 데이터를 기다리는 동안 무엇을 보여 줄지까지 결정해야 해요.

Apple의 [Supporting Drag and Drop in Collection Views](https://developer.apple.com/documentation/uikit/supporting-drag-and-drop-in-collection-views)는 drag와 drop을 서로 다른 delegate 역할로 분리해 설명해요.

## 먼저 알아둘 드래그 앤 드롭 용어

| 용어             | 쉬운 뜻                                                                                                                |
| ---------------- | ---------------------------------------------------------------------------------------------------------------------- |
| drag session     | 사용자가 하나 이상의 item을 끌기 시작해 놓을 때까지 이어지는 상호작용 단위예요.                                        |
| `NSItemProvider` | 앱이나 프로세스 경계를 넘어 전달할 수 있도록 데이터 타입과 비동기 로딩 방법을 표현해요.                                |
| `UIDragItem`     | 드래그 중인 item 하나예요. `NSItemProvider`를 가지며 같은 앱 안에서는 `localObject`로 빠른 로컬 값을 전달할 수 있어요. |
| drop proposal    | 현재 위치에서 drop을 금지·복사·이동할지, item 사이에 넣을지 item 안에 넣을지 제안하는 값이에요.                        |
| drop coordinator | 실제 drop item, 목적 index path, proposal을 제공하고 최종 위치로 이동하는 애니메이션을 조정해요.                       |
| placeholder      | 외부 데이터를 비동기로 불러오는 동안 최종 셀 대신 잠시 보여 주는 항목이에요.                                           |
| local reorder    | 같은 Collection View 또는 앱 안에서 item 순서만 바꾸는 동작이에요. 외부 데이터 복사보다 단순해요.                      |

## drag와 drop delegate를 연결해요

```swift
private func configureDragAndDrop() {
  collectionView.dragDelegate = self
  collectionView.dropDelegate = self
  collectionView.dragInteractionEnabled = true
}
```

iPhone에서는 drag interaction 사용 여부를 명시적으로 켜야 하는 배포 대상이 있을 수 있어요. `hasActiveDrag`, `hasActiveDrop`으로 현재 상호작용 상태를 확인할 수도 있어요.

## drag delegate가 옮길 item을 제공해요

사용자가 끌기 시작한 index path를 안정적인 `Photo.ID`로 바꾸고 `UIDragItem`을 만들어요.

```swift
extension PhotoGridViewController: UICollectionViewDragDelegate {
  func collectionView(
    _ collectionView: UICollectionView,
    itemsForBeginning session: UIDragSession,
    at indexPath: IndexPath
  ) -> [UIDragItem] {
    guard let photoID = dataSource.itemIdentifier(for: indexPath) else {
      return []
    }

    let itemProvider = NSItemProvider(
      object: photoID.uuidString as NSString
    )
    let dragItem = UIDragItem(itemProvider: itemProvider)
    dragItem.localObject = photoID

    return [dragItem]
  }
}
```

빈 배열을 반환하면 해당 위치의 drag를 시작하지 않아요. 여러 item을 반환하면 한 번에 함께 끌 수 있어요. 선택된 item을 drag하는 경우 Collection View가 선택 집합과 상호작용하는 방식도 함께 확인해야 해요.

`localObject`는 같은 앱 안에서만 사용하는 최적화예요. 다른 앱이나 프로세스로 전달할 데이터는 `NSItemProvider`가 이해할 수 있는 형식으로 제공해야 해요.

`UICollectionViewDragDelegate`의 나머지 역할은 다음과 같아요.

| 메서드·역할                                    | 사용 시점                                      |
| ---------------------------------------------- | ---------------------------------------------- |
| `itemsForAddingTo`                             | 진행 중인 drag session에 item을 추가해요.      |
| `dragPreviewParametersForItemAt`               | 드래그 미리보기의 보이는 영역과 모양을 바꿔요. |
| `dragSessionWillBegin` / `DidEnd`              | drag 시작·종료에 맞춰 UI 상태를 조정해요.      |
| `dragSessionAllowsMoveOperation`               | session이 move 동작을 허용하는지 정해요.       |
| `dragSessionIsRestrictedToDraggingApplication` | 현재 앱 밖으로 drag할 수 있는지 제한해요.      |

## drop 가능 여부를 빠르게 판단해요

drop delegate는 먼저 session의 데이터를 처리할 수 있는지 물어요.

```swift
extension PhotoGridViewController: UICollectionViewDropDelegate {
  func collectionView(
    _ collectionView: UICollectionView,
    canHandle session: UIDropSession
  ) -> Bool {
    session.localDragSession != nil
      || session.hasItemsConforming(
        toTypeIdentifiers: [UTType.image.identifier]
      )
  }
}
```

`UTType`을 사용하려면 `UniformTypeIdentifiers`를 import해요. 로컬 재정렬만 지원한다면 `session.localDragSession != nil`처럼 범위를 더 좁힐 수 있어요.

## drop proposal로 의도를 알려 줘요

손가락이 움직일 때마다 Collection View는 현재 위치에서 drop을 어떻게 처리할지 물을 수 있어요.

```swift
func collectionView(
  _ collectionView: UICollectionView,
  dropSessionDidUpdate session: UIDropSession,
  withDestinationIndexPath destinationIndexPath: IndexPath?
) -> UICollectionViewDropProposal {
  guard collectionView.hasActiveDrag else {
    return UICollectionViewDropProposal(
      operation: .copy,
      intent: .insertAtDestinationIndexPath
    )
  }

  return UICollectionViewDropProposal(
    operation: .move,
    intent: .insertAtDestinationIndexPath
  )
}
```

`UICollectionViewDropProposal`은 `UIDropOperation`과 intent를 묶어요.

| operation    | 의미                                  |
| ------------ | ------------------------------------- |
| `.forbidden` | 현재 drop을 받지 않아요.              |
| `.cancel`    | 진행 중인 drop을 취소해요.            |
| `.copy`      | 원본을 유지하고 새 데이터를 만들어요. |
| `.move`      | 원본 위치에서 목적 위치로 이동해요.   |

intent는 item 사이에 삽입할지, 목적 item 자체에 넣을지 표현해요. 사진을 앨범 item 위에 떨어뜨려 앨범에 추가한다면 `.insertIntoDestinationIndexPath`, 순서를 바꾼다면 `.insertAtDestinationIndexPath`가 자연스러워요.

이 메서드는 드래그가 움직이는 동안 자주 호출되므로 네트워크나 snapshot 적용 같은 무거운 작업을 하지 마세요.

## 로컬 item 순서를 snapshot으로 바꿔요

실제 drop에서는 `UICollectionViewDropCoordinator`의 item과 목적 index path를 사용해요.

```swift
func collectionView(
  _ collectionView: UICollectionView,
  performDropWith coordinator: UICollectionViewDropCoordinator
) {
  guard
    let dropItem = coordinator.items.first,
    let photoID = dropItem.dragItem.localObject as? Photo.ID,
    let sourceIndexPath = dropItem.sourceIndexPath
  else {
    return
  }

  let destinationIndexPath = coordinator.destinationIndexPath
    ?? IndexPath(
      item: collectionView.numberOfItems(inSection: 0),
      section: 0
    )

  movePhoto(
    id: photoID,
    from: sourceIndexPath,
    to: destinationIndexPath
  )

  coordinator.drop(
    dropItem.dragItem,
    toItemAt: destinationIndexPath
  )
}
```

`UICollectionViewDropItem`은 다음 정보를 제공해요.

- `dragItem`: 실제 데이터와 `localObject`를 가진 drag item
- `sourceIndexPath`: 같은 Collection View에서 시작했다면 원래 위치
- `previewSize`: drop 미리보기 크기

모델과 snapshot 갱신은 별도 메서드에서 한 방향으로 처리해요.

```swift
private func movePhoto(
  id: Photo.ID,
  from source: IndexPath,
  to destination: IndexPath
) {
  var ids = dataSource.snapshot().itemIdentifiers

  guard let sourceOffset = ids.firstIndex(of: id) else {
    return
  }

  ids.remove(at: sourceOffset)
  let destinationOffset = min(destination.item, ids.count)
  ids.insert(id, at: destinationOffset)

  photoOrder = ids

  var snapshot = NSDiffableDataSourceSnapshot<Section, Photo.ID>()
  snapshot.appendSections([.main])
  snapshot.appendItems(ids, toSection: .main)
  dataSource.apply(snapshot, animatingDifferences: true)
}
```

예제는 section 하나를 가정해요. 여러 section 사이 이동이라면 원본·목적 section identifier와 각 section의 item 순서를 모델에서 함께 바꿔야 해요.

중요한 순서는 다음과 같아요.

1. drop item의 안정적인 식별자를 읽어요.
2. 모델의 item 순서를 바꿔요.
3. 변경된 순서로 snapshot을 적용해요.
4. coordinator에 최종 애니메이션 위치를 알려 줘요.

화면 셀만 이동하고 모델을 바꾸지 않으면 다음 reload나 snapshot에서 원래 순서로 돌아가요.

## 외부 데이터는 비동기로 읽어요

다른 앱에서 온 item은 `localObject`가 없을 수 있어요. 이때 `NSItemProvider`가 지원하는 타입을 확인하고 비동기로 데이터를 읽어요.

```swift
private func loadExternalImage(
  from dragItem: UIDragItem
) async throws -> UIImage {
  let provider = dragItem.itemProvider

  return try await withCheckedThrowingContinuation { continuation in
    provider.loadObject(ofClass: UIImage.self) { object, error in
      if let image = object as? UIImage {
        continuation.resume(returning: image)
      } else {
        continuation.resume(
          throwing: error ?? PhotoImportError.invalidImage
        )
      }
    }
  }
}
```

데이터가 로드되는 동안 목적 index path가 바뀌거나 snapshot이 갱신될 수 있어요. 최종 삽입도 처음의 `IndexPath`를 장기 보관하기보다 현재 모델 정책과 식별자를 기준으로 다시 결정하세요.

## placeholder는 느린 외부 로딩을 표시해요

`UICollectionViewPlaceholder`는 삽입 위치와 재사용 식별자, placeholder 셀 구성 handler를 표현해요. `UICollectionViewDropPlaceholder`는 drop 미리보기 설정을 추가해요.

coordinator의 `drop(_:to:)`로 placeholder를 넣으면 `UICollectionViewDropPlaceholderContext`를 받을 수 있어요. 데이터가 준비되면 다음 중 하나를 선택해요.

- `commitInsertion(dataSourceUpdates:)`: 모델과 data source를 갱신하고 placeholder를 최종 item으로 바꿔요.
- `setNeedsCellUpdate()`: 로딩 표시 내용을 다시 구성해요.
- `deletePlaceholder()`: 로딩 실패나 취소 시 placeholder를 제거해요.

placeholder API는 Collection View의 data source 갱신 방식과 밀접하게 연결돼요. diffable data source를 사용하는 화면에서는 임시 item 식별자를 snapshot에 넣고 성공·실패 snapshot으로 교체하는 방식이 더 일관적인지 함께 검토하세요.

## coordinator가 제공하는 정보를 구분해요

`UICollectionViewDropCoordinator`의 주요 역할은 다음과 같아요.

| API                    | 역할                                                           |
| ---------------------- | -------------------------------------------------------------- |
| `items`                | 이번 drop에 포함된 `UICollectionViewDropItem` 목록이에요.      |
| `destinationIndexPath` | Collection View가 계산한 현재 목적 위치예요. 없을 수도 있어요. |
| `proposal`             | 직전에 결정한 operation과 intent예요.                          |
| `session`              | 전체 drop session 정보와 item provider에 접근해요.             |
| `drop(_:toItemAt:)`    | item 위치로 이동하는 애니메이션을 조정해요.                    |
| `drop(_:intoItemAt:)`  | 목적 item 안으로 들어가는 애니메이션을 조정해요.               |
| `drop(_:to:)`          | placeholder나 지정한 target으로 drop을 연결해요.               |

여러 item을 동시에 drop할 수 있으므로 `items.first`만 처리하는 예제를 실제 기능에 그대로 사용하지 마세요. 앱의 다중 item 정책에 맞춰 모두 순회하고 하나의 모델 갱신으로 묶어야 해요.

## `UIDataSourceTranslating`은 표시 위치를 변환해요

일부 고급 data source는 모델의 data source index path와 실제 화면의 presentation index path가 다를 수 있어요. `UIDataSourceTranslating`은 두 위치 사이 변환을 제공해요.

- data source 위치를 presentation 위치로 변환해요.
- presentation 위치를 data source 위치로 되돌려요.
- section index도 양방향으로 변환해요.
- presentation 값을 사용하는 작업 범위를 제공해요.

일반적인 diffable data source 화면에서는 직접 구현할 일이 드물어요. drag/drop 중 화면이 임시 placeholder나 재정렬 상태를 보여 주어 두 위치 체계가 필요할 때 존재 이유를 이해하면 돼요.

## drag/drop 상태와 셀 모양을 연결해요

`UICollectionViewCell`은 drag state 변화도 받을 수 있어요.

```swift
final class DraggablePhotoCell: UICollectionViewCell {
  override func dragStateDidChange(
    _ dragState: UICollectionViewCell.DragState
  ) {
    super.dragStateDidChange(dragState)

    switch dragState {
    case .lifting:
      contentView.alpha = 0.7
    case .dragging:
      contentView.alpha = 0.4
    case .none:
      contentView.alpha = 1
    @unknown default:
      contentView.alpha = 1
    }
  }
}
```

최종 상태로 돌아오는 경로를 항상 포함하고 접근성의 Reduce Motion 설정도 고려하세요. 단순한 시각 효과라면 시스템 기본 미리보기를 먼저 사용해요.

## 실패와 취소 정책을 먼저 정해요

외부 데이터를 drop하는 기능에는 실패가 정상적으로 발생할 수 있어요.

- 지원하지 않는 타입이면 `canHandle`에서 거절해요.
- 로드가 실패하면 placeholder를 제거하고 오류를 안내해요.
- 사용자가 화면을 닫으면 진행 중인 로딩을 취소해요.
- 같은 item을 중복으로 drop했을 때 복사할지 무시할지 정해요.
- 외부 파일 크기와 메모리 사용량을 검증해요.
- 보안 범위가 필요한 파일 URL은 접근 수명과 복사를 명시적으로 관리해요.

성공 흐름만 구현한 뒤 오류를 나중에 붙이면 모델과 placeholder가 어긋나기 쉬워요.

## 관련 API 전체 지도를 확인해요

| API                                      | 역할                                                         |
| ---------------------------------------- | ------------------------------------------------------------ |
| `UICollectionViewDragDelegate`           | drag item 제공, session 추적, 미리보기와 이동 정책을 정해요. |
| `UICollectionViewDropDelegate`           | 수신 가능 여부, proposal, 실제 drop 처리를 담당해요.         |
| `UICollectionViewDropCoordinator`        | drop item·목적 위치와 최종 애니메이션을 조정해요.            |
| `UICollectionViewDropProposal`           | operation과 삽입 intent를 표현해요.                          |
| `UICollectionViewDropItem`               | drag item과 원본 index path 정보를 제공해요.                 |
| `UICollectionViewPlaceholder`            | 비동기 삽입 중 임시 셀을 표현해요.                           |
| `UICollectionViewDropPlaceholder`        | drop용 placeholder와 미리보기를 표현해요.                    |
| `UICollectionViewDropPlaceholderContext` | placeholder 갱신, 성공 commit, 실패 삭제를 처리해요.         |
| `UIDataSourceTranslating`                | data source 위치와 presentation 위치를 변환해요.             |

## 적용 순서를 정리해요

1. 로컬 재정렬, 앱 내부 이동, 외부 복사 중 지원 범위를 정해요.
2. item provider가 제공할 데이터 타입과 안정적인 local identifier를 정해요.
3. drag delegate에서 허용할 item만 반환해요.
4. drop delegate의 `canHandle`과 proposal을 가볍고 명확하게 구현해요.
5. 실제 drop에서 모델을 먼저 바꾸고 snapshot을 적용해요.
6. 외부 비동기 데이터의 placeholder, 취소, 실패 정책을 구현해요.
7. 다중 item, 여러 section, 빠른 데이터 갱신 중 순서가 유지되는지 테스트해요.

## 면접에서 이어질 수 있는 질문

### `localObject`와 `NSItemProvider`는 어떻게 다른가요?

`localObject`는 같은 앱 안의 drag/drop에서 빠르게 전달하는 메모리 객체이고 프로세스 밖으로 가지 않아요. `NSItemProvider`는 앱 경계를 넘어 교환할 데이터 타입과 비동기 로딩을 표현하므로 외부 drop을 지원하려면 필요해요.

### drop에서 화면 이동만 처리하면 왜 안 되나요?

Collection View 화면은 모델과 snapshot의 결과이기 때문이에요. 셀만 움직이면 다음 snapshot이나 reload에서 원래 순서로 돌아가므로 모델 순서를 먼저 바꾸고 그 상태를 화면에 적용해야 해요.

### placeholder는 언제 필요한가요?

외부 이미지처럼 실제 데이터를 비동기로 읽는 동안 삽입 위치와 로딩 상태를 보여 줄 때 필요해요. 로컬 재정렬처럼 데이터가 이미 메모리에 있다면 보통 placeholder가 필요하지 않아요.

### drop proposal 메서드는 왜 빨라야 하나요?

사용자가 드래그 위치를 움직이는 동안 반복 호출되어 시각 피드백을 계속 갱신하기 때문이에요. 여기서 무거운 작업을 하면 drag 반응성이 떨어져요.

## 참고 자료

- [Supporting Drag and Drop in Collection Views](https://developer.apple.com/documentation/uikit/supporting-drag-and-drop-in-collection-views)
- [UICollectionViewDragDelegate](https://developer.apple.com/documentation/uikit/uicollectionviewdragdelegate)
- [UICollectionViewDropDelegate](https://developer.apple.com/documentation/uikit/uicollectionviewdropdelegate)
- [UICollectionViewDropCoordinator](https://developer.apple.com/documentation/uikit/uicollectionviewdropcoordinator)
- [UICollectionViewDropPlaceholder](https://developer.apple.com/documentation/uikit/uicollectionviewdropplaceholder)
- [UICollectionViewDropProposal](https://developer.apple.com/documentation/uikit/uicollectionviewdropproposal)
- [UICollectionViewDropItem](https://developer.apple.com/documentation/uikit/uicollectionviewdropitem)
- [UICollectionViewDropPlaceholderContext](https://developer.apple.com/documentation/uikit/uicollectionviewdropplaceholdercontext)
- [UIDataSourceTranslating](https://developer.apple.com/documentation/uikit/uidatasourcetranslating)
- [UICollectionViewPlaceholder](https://developer.apple.com/documentation/uikit/uicollectionviewplaceholder)
