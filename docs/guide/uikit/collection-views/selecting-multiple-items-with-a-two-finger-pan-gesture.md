---
title: '두 손가락 제스처로 여러 item 선택하기'
description: '두 손가락 다중 선택은 Collection View의 다중 선택을 허용하고 delegate에서 선택 시작 가능 여부를 결정해 연속 item을 빠르게 선택하게 해요. 주요 API, 사용 예제, 주의점을 함께 정리합니다.'
---

# 두 손가락 제스처로 여러 item 선택하기

> **면접 답변 한 줄 요약:** 두 손가락 다중 선택은 Collection View의 다중 선택을 허용하고 delegate에서 선택 시작 가능 여부를 결정해 연속 item을 빠르게 선택하게 해요.

Apple 공식 문서의 **Collection Views — Selection management** 영역에 대응하는 한국어 실습 문서예요. 원문의 구조와 핵심 API를 확인하되, 코드는 작은 사진 목록 예제로 다시 구성했어요.

## 먼저 알아둘 용어

| 용어                | 쉬운 뜻                                                      |
| ------------------- | ------------------------------------------------------------ |
| Highlight           | 손가락이 닿아 있는 동안 제공하는 일시적인 시각 피드백이에요. |
| Selection           | 사용자가 item을 선택했다는 지속적인 상태예요.                |
| Configuration State | 셀 모양을 결정하는 선택·하이라이트 등의 상태 값이에요.       |

## 먼저 다중 선택을 허용해요

```swift
collectionView.allowsMultipleSelection = true
```

iPhone과 iPad에서 사용자는 두 손가락으로 item 위를 끌어 연속된 항목을 선택할 수 있어요. 앱은 delegate에서 이 상호작용을 시작할 수 있는지 결정해요.

<!-- Apple DocC image: two-finger_multi-select_collection_2x -->

![두 손가락을 여러 item 위로 움직여 다중 선택을 시작하고 확장한 뒤 끝내는 과정](./assets/apple-docs/two-finger_multi-select_collection_2x.png)

```swift
func collectionView(
  _ collectionView: UICollectionView,
  shouldBeginMultipleSelectionInteractionAt indexPath: IndexPath
) -> Bool {
  !isEditingLocked
}

func collectionView(
  _ collectionView: UICollectionView,
  didBeginMultipleSelectionInteractionAt indexPath: IndexPath
) {
  setEditing(true, animated: true)
}

func collectionViewDidEndMultipleSelectionInteraction(
  _ collectionView: UICollectionView
) {
  synchronizeSelectedPhotoIDs()
}
```

다중 선택 결과를 삭제나 공유 같은 후속 작업에 사용한다면 `indexPathsForSelectedItems`를 item 식별자로 즉시 변환해요. 목록이 바뀌면 IndexPath가 달라질 수 있기 때문이에요.

## 적용 순서를 정리해요

1. 화면에서 변하지 않는 item 식별자를 먼저 정해요.
2. 데이터, 셀, 레이아웃, 상호작용 중 이 문서가 바꾸는 책임을 구분해요.
3. 가장 작은 데이터로 정상 동작을 확인해요.
4. 삽입·삭제·이동과 셀 재사용 상황을 각각 확인해요.
5. 비동기 작업은 성공뿐 아니라 취소와 실패 경로도 검사해요.

## 참고 자료

- [Apple Developer Documentation — Selecting multiple items with a two-finger pan gesture](https://developer.apple.com/documentation/uikit/selecting-multiple-items-with-a-two-finger-pan-gesture)
- [Collection Views 한눈에 보기](./index)
