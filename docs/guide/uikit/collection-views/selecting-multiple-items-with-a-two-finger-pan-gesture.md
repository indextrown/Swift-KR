---
title: '두 손가락 제스처로 여러 item 선택하기'
description: 'Apple 공식 샘플의 Table View와 Collection View 구현을 모두 따라 두 손가락 다중 선택 시작 허용, 편집 모드 전환, 종료 처리와 선택 식별자 보존 방법을 설명합니다.'
---

# 두 손가락 제스처로 여러 item 선택하기

> **면접 답변 한 줄 요약:** iOS 13 이상의 두 손가락 다중 선택은 delegate가 제스처 시작을 허용하고 편집 모드로 전환해 여러 item을 빠르게 선택·해제하게 해요.

## 먼저 알아둘 용어

| 용어             | 쉬운 뜻                                                      |
| ---------------- | ------------------------------------------------------------ |
| 다중 선택        | 한 화면에서 여러 row나 item을 동시에 선택하는 동작이에요.    |
| 편집 모드        | 선택 표시와 삭제·이동 같은 편집 동작을 제공하는 뷰 상태예요. |
| Constrained axis | 세로 스크롤 화면의 가로 방향처럼 스크롤하지 않는 축이에요.   |

## 개요 (Overview)

iOS 13 이상에서는 Table View와 Collection View에서 두 손가락 pan gesture로 여러 item을 선택하는 기능을 제공할 수 있어요. 이 기능을 활성화하면 사용자가 여러 item을 빠르게 선택할 수 있어요. 예를 들어 Table View가 두 손가락 pan gesture를 인식했을 때 앱이 자동으로 편집 모드에 들어가게 만들면 사용자가 Edit 또는 Select 버튼을 먼저 탭할 필요가 없어요.

여러 item을 선택하려면 선택하려는 item 위로 두 손가락을 끌어요. 뷰가 두 손가락 pan gesture를 인식하면 편집 모드로 전환되어 둘 이상의 item을 선택할 수 있어요.

<!-- Apple DocC image: two-finger_multi-select_collection_2x -->

![두 손가락을 여러 item 위로 움직여 다중 선택을 시작하고 확장한 뒤 끝내는 과정](./assets/apple-docs/two-finger_multi-select_collection_2x.png)

선택할 item은 서로 이어져 있지 않아도 돼요. 두 손가락으로 몇 개를 선택한 뒤 화면을 스크롤하고 같은 제스처로 다른 item을 더 선택할 수 있어요. 이미 선택한 item 위로 두 손가락을 끌면 Table View와 Collection View가 해당 item의 선택을 해제해요.

이 샘플은 앱에서 이 기능을 지원하는 방법을 보여 줘요. 샘플 앱에는 Table View와 Collection View가 있으며, iPad에서는 Split View를 사용해 두 화면을 나란히 표시해요. iPhone에서는 Tab Bar를 사용해 두 화면 사이를 전환해요.

### Table View에서 여러 Item 선택 지원하기 (Support multiple item selection in a table view)

Table View에서 두 손가락 pan gesture를 활성화하려면 delegate의 `tableView(_:shouldBeginMultipleSelectionInteractionAt:)`를 구현하고 `true`를 반환해요. Table View는 두 손가락 터치를 감지하면 앱이 다중 선택 제스처를 지원하는지 확인하기 위해 이 메서드를 호출해요.

```swift
override func tableView(_ tableView: UITableView, shouldBeginMultipleSelectionInteractionAt indexPath: IndexPath) -> Bool {
    return true
}
```

`true`를 반환하면 Table View가 `tableView(_:didBeginMultipleSelectionInteractionAt:)`을 호출해요. 공식 샘플은 이 시점에 사용자가 Edit 버튼을 탭하지 않아도 되도록 Table View를 편집 모드로 바꾸고 현재 row를 선택해요. 이후 사용자는 Table View 위에서 두 손가락을 위아래로 움직여 row를 더 선택해요.

```swift
override func tableView(_ tableView: UITableView, didBeginMultipleSelectionInteractionAt indexPath: IndexPath) {
    // Replace the Edit button with Done, and put the
    // table view into editing mode.
    self.setEditing(true, animated: true)
}
```

사용자가 두 손가락을 화면에서 떼면 Table View가 `tableViewDidEndMultipleSelectionInteraction(_:)`을 호출해요. 이 호출은 사용자가 두 손가락 pan gesture를 더 이상 사용하지 않는다는 뜻이에요. 공식 샘플은 이 메서드에서 아무 작업도 하지 않으므로 사용자가 다시 두 손가락을 사용하거나 선택 체크박스가 표시되는 가장자리를 한 손가락으로 움직여 item을 더 선택할 수 있어요.

```swift
override func tableViewDidEndMultipleSelectionInteraction(_ tableView: UITableView) {
    print("\(#function)")
}
```

### Collection View에서 여러 Item 선택 지원하기 (Support multiple item selection in a collection view)

Collection View에서 같은 다중 선택 동작을 제공하는 방법은 Table View 구현과 비슷해요. 먼저 사용자에게 제스처를 제공할지 결정하는 `collectionView(_:shouldBeginMultipleSelectionInteractionAt:)`을 구현해요. 공식 샘플은 이 메서드에서 `true`를 반환해요.

다음으로 `collectionView(_:didBeginMultipleSelectionInteractionAt:)`을 구현해요. Table View delegate 버전과 마찬가지로 공식 샘플은 이 메서드에서 Collection View를 편집 모드로 전환해요.

마지막으로 `collectionViewDidEndMultipleSelectionInteraction(_:)`을 구현해요. 공식 샘플은 사용자가 탭 또는 다른 두 손가락 pan gesture로 계속 item을 선택할 수 있도록 여기서 별도의 작업을 하지 않아요.

```swift
func collectionView(_ collectionView: UICollectionView, shouldBeginMultipleSelectionInteractionAt indexPath: IndexPath) -> Bool {
    // Returning `true` automatically sets `collectionView.isEditing`
    // to `true`. The app sets it to `false` after the user taps the Done button.
    return true
}

func collectionView(_ collectionView: UICollectionView, didBeginMultipleSelectionInteractionAt indexPath: IndexPath) {
    // Replace the Select button with Done, and put the
    // collection view into editing mode.
    setEditing(true, animated: true)
}

func collectionViewDidEndMultipleSelectionInteraction(_ collectionView: UICollectionView) {
    print("\(#function)")
}
```

사용자는 스크롤 축에 제한된 반대 방향으로 한 손가락을 움직여 item을 더 선택할 수도 있어요. 예를 들어 Collection View가 세로로 스크롤된다면 한 손가락을 가로로 움직여 item을 추가로 선택할 수 있어요.

## Swift-KR 보충: 다중 선택 결과를 식별자로 보존해요

`indexPathsForSelectedItems`는 현재 위치이므로 snapshot 갱신 뒤 달라질 수 있어요. 삭제나 공유에 사용할 때는 곧바로 item 식별자로 바꿔 저장하세요.

```swift
private func synchronizeSelectedPhotoIDs() {
  selectedPhotoIDs = Set(
    (collectionView.indexPathsForSelectedItems ?? []).compactMap {
      dataSource.itemIdentifier(for: $0)
    }
  )
}
```

## 참고 자료

- [Apple Developer Documentation — Selecting multiple items with a two-finger pan gesture](https://developer.apple.com/documentation/uikit/selecting-multiple-items-with-a-two-finger-pan-gesture)
- [선택 관리 학습 가이드](./selection)
