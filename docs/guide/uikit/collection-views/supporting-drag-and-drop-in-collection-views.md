---
title: 'Collection View에서 드래그 앤 드롭 지원하기'
description: 'Collection View의 드래그 앤 드롭은 drag delegate가 이동할 데이터를 만들고 drop delegate가 제안과 모델 갱신, 애니메이션을 조정해요. 주요 API, 사용 예제, 주의점을 함께 정리합니다.'
---

# Collection View에서 드래그 앤 드롭 지원하기

> **면접 답변 한 줄 요약:** Collection View의 드래그 앤 드롭은 drag delegate가 이동할 데이터를 만들고 drop delegate가 제안과 모델 갱신, 애니메이션을 조정해요.

Apple 공식 문서의 **Collection Views — Drag and drop** 영역에 대응하는 한국어 실습 문서예요. 원문의 구조와 핵심 API를 확인하되, 코드는 작은 사진 목록 예제로 다시 구성했어요.

## 먼저 알아둘 용어

| 용어          | 쉬운 뜻                                                     |
| ------------- | ----------------------------------------------------------- |
| Drag Session  | 사용자가 하나 이상의 item을 끄는 전체 상호작용이에요.       |
| Drop Proposal | 현재 위치에서 복사·이동·금지와 삽입 방식을 표현한 값이에요. |
| Item Provider | 앱 안팎으로 전달할 데이터를 지연 로딩하는 표준 객체예요.    |

## Drag Delegate가 이동할 데이터를 만들어요

```swift
func collectionView(
  _ collectionView: UICollectionView,
  itemsForBeginning session: UIDragSession,
  at indexPath: IndexPath
) -> [UIDragItem] {
  guard let id = dataSource.itemIdentifier(for: indexPath) else { return [] }
  let provider = NSItemProvider(object: id.uuidString as NSString)
  let item = UIDragItem(itemProvider: provider)
  item.localObject = id
  return [item]
}
```

## Drop Delegate가 제안과 실제 갱신을 나눠요

```swift
func collectionView(
  _ collectionView: UICollectionView,
  dropSessionDidUpdate session: UIDropSession,
  withDestinationIndexPath destinationIndexPath: IndexPath?
) -> UICollectionViewDropProposal {
  let operation: UIDropOperation = session.localDragSession == nil ? .copy : .move
  return UICollectionViewDropProposal(operation: operation, intent: .insertAtDestinationIndexPath)
}

func collectionView(
  _ collectionView: UICollectionView,
  performDropWith coordinator: UICollectionViewDropCoordinator
) {
  let destination = coordinator.destinationIndexPath ?? endIndexPath
  updateModelAndSnapshot(using: coordinator.items, destination: destination)

  for item in coordinator.items {
    coordinator.drop(item.dragItem, toItemAt: destination)
  }
}
```

화면 애니메이션만 실행하면 다음 snapshot에서 순서가 원래대로 돌아가요. 모델을 먼저 갱신하고 새 snapshot을 적용한 뒤 coordinator에게 최종 위치를 알려야 해요. 외부 데이터가 늦게 도착하면 placeholder로 자리를 확보하고 성공·실패 경로를 모두 처리해요.

## 적용 순서를 정리해요

1. 화면에서 변하지 않는 item 식별자를 먼저 정해요.
2. 데이터, 셀, 레이아웃, 상호작용 중 이 문서가 바꾸는 책임을 구분해요.
3. 가장 작은 데이터로 정상 동작을 확인해요.
4. 삽입·삭제·이동과 셀 재사용 상황을 각각 확인해요.
5. 비동기 작업은 성공뿐 아니라 취소와 실패 경로도 검사해요.

## 참고 자료

- [Apple Developer Documentation — Supporting Drag and Drop in Collection Views](https://developer.apple.com/documentation/uikit/supporting-drag-and-drop-in-collection-views)
- [Collection Views 한눈에 보기](./index)
