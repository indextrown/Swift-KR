---
title: Collection View 선택과 하이라이트
description: UICollectionViewCell의 highlighted·selected 상태 차이와 단일·다중 선택, 두 손가락 팬 제스처, 모델 동기화를 Swift 코드로 설명합니다.
---

# Collection View 선택과 하이라이트

> **면접 답변 한 줄 요약:** 하이라이트는 손가락을 누르는 동안의 일시적인 피드백이고 선택은 탭 이후 유지되는 상태이며, Collection View의 시각 상태와 앱의 선택 모델을 식별자 기준으로 동기화해야 해요.

사용자가 셀을 누르면 색이 잠깐 어두워지고, 손을 떼면 선택 표시가 남을 수 있어요. 두 변화는 같은 상태가 아니에요. 하이라이트와 선택을 구분하지 않으면 손가락을 끌어 취소했는데도 표시가 남거나, 재사용된 셀이 잘못 선택되어 보일 수 있어요.

## 먼저 알아둘 선택 용어

| 용어                     | 쉬운 뜻                                                                                                 |
| ------------------------ | ------------------------------------------------------------------------------------------------------- |
| highlighted              | 손가락이 셀을 누르고 있는 동안처럼 상호작용 중임을 보여 주는 짧은 상태예요. `isHighlighted`로 확인해요. |
| selected                 | 사용자가 item을 선택했다는 상태예요. 탭이 끝난 뒤에도 유지될 수 있고 `isSelected`로 확인해요.           |
| configuration state      | selected, highlighted, disabled 같은 현재 UI 상태를 한 값으로 모아 configuration에 전달해요.            |
| single selection         | 한 번에 item 하나만 선택하는 기본 방식이에요.                                                           |
| multiple selection       | 여러 item을 동시에 선택할 수 있는 방식이에요.                                                           |
| two-finger pan selection | 두 손가락을 item 위로 움직여 여러 item을 빠르게 선택하거나 해제하는 iOS·iPadOS 제스처예요.              |

## 하이라이트와 선택은 발생 시점이 달라요

기본적인 탭 흐름은 다음과 같아요.

1. 손가락이 셀 안에 닿으면 `isHighlighted`가 `true`가 돼요.
2. 손가락을 셀 밖으로 끌면 하이라이트가 취소될 수 있어요.
3. 셀 안에서 손을 떼면 `isHighlighted`가 `false`가 되고 `isSelected`가 `true`가 돼요.
4. 다른 item을 선택하거나 해제 정책이 실행될 때까지 선택은 유지될 수 있어요.

따라서 하이라이트에는 살짝 눌리는 scale이나 배경 변화처럼 짧은 피드백을, 선택에는 체크 표시처럼 지속되는 표현을 사용해요.

## configuration state로 모양을 다시 만들어요

셀의 `configurationUpdateHandler`는 상태가 바뀔 때마다 현재 state를 받아요.

```swift
let registration = UICollectionView.CellRegistration<
  UICollectionViewCell,
  Photo
> { cell, _, photo in
  var content = UIListContentConfiguration.cell()
  content.text = photo.title
  content.image = photo.thumbnail
  cell.contentConfiguration = content

  cell.configurationUpdateHandler = { cell, state in
    var background = UIBackgroundConfiguration.clear()
    background.cornerRadius = 12

    switch (state.isSelected, state.isHighlighted) {
    case (true, _):
      background.backgroundColor = .systemBlue.withAlphaComponent(0.2)
      background.strokeColor = .systemBlue
      background.strokeWidth = 2
    case (false, true):
      background.backgroundColor = .systemGray4
    case (false, false):
      background.backgroundColor = .secondarySystemBackground
    }

    cell.backgroundConfiguration = background
  }
}
```

선택을 먼저 검사해요. 이미 선택된 셀을 다시 누르는 동안에도 선택 표시가 갑자기 사라지지 않게 하기 위해서예요. 실제 디자인 정책에 따라 highlighted 효과를 선택 위에 추가할 수도 있어요.

`backgroundView`와 `selectedBackgroundView`를 사용하는 전통적인 방식도 있어요. 단순히 기본 배경과 선택 배경만 바꾼다면 충분해요. 여러 상태를 함께 표현하려면 configuration state가 규칙을 한곳에 모으기 쉬워요.

## delegate에서 선택 사건을 받아요

기본 Collection View는 단일 선택을 허용해요.

```swift
private func configureSelection() {
  collectionView.allowsSelection = true
  collectionView.allowsMultipleSelection = false
  collectionView.delegate = self
}
```

선택과 해제 사건에서 안정적인 item 식별자를 구해요.

```swift
extension PhotoGridViewController: UICollectionViewDelegate {
  func collectionView(
    _ collectionView: UICollectionView,
    didSelectItemAt indexPath: IndexPath
  ) {
    guard let id = dataSource.itemIdentifier(for: indexPath) else {
      return
    }

    selectedPhotoIDs.insert(id)
  }

  func collectionView(
    _ collectionView: UICollectionView,
    didDeselectItemAt indexPath: IndexPath
  ) {
    guard let id = dataSource.itemIdentifier(for: indexPath) else {
      return
    }

    selectedPhotoIDs.remove(id)
  }
}
```

앱에서 선택이 중요하지 않고 누르면 바로 상세 화면으로 이동한다면 `selectedPhotoIDs`를 유지하지 않아도 돼요. 반대로 삭제 대상 선택이나 다른 화면과 공유하는 선택이라면 모델 상태가 필요해요.

## 화면 선택과 모델 선택을 한 방향으로 맞춰요

Collection View의 `indexPathsForSelectedItems`는 현재 화면 선택을 알려 줘요. 하지만 데이터가 필터링되거나 snapshot이 교체될 때 앱의 선택 정책까지 자동으로 결정하지는 않아요.

모델이 선택의 기준이라면 snapshot 적용 후 보이는 item을 다시 선택할 수 있어요.

```swift
private func restoreVisibleSelection() {
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

선택 item이 새 snapshot에서 사라졌을 때 어떻게 할지도 정해야 해요.

- 삭제된 item이면 선택 모델에서도 제거해요.
- 검색 필터 때문에 잠시 안 보일 뿐이면 식별자를 유지할 수 있어요.
- 단일 선택 상세 화면이라면 첫 item으로 자동 이동할지 빈 상태를 보여 줄지 정해요.

이것은 UIKit이 대신 결정할 수 없는 앱 정책이에요.

## 여러 item 선택을 켜요

```swift
collectionView.allowsMultipleSelection = true
```

편집 모드에서만 다중 선택을 허용하려면 관련 편집 프로퍼티를 함께 확인해요.

```swift
collectionView.allowsSelectionDuringEditing = true
collectionView.allowsMultipleSelectionDuringEditing = true
collectionView.isEditing = true
```

배포 대상과 화면 요구에 따라 일반 상태와 편집 상태의 선택 정책을 분리할 수 있어요. `isEditing`만 켠다고 앱의 편집 버튼이나 삭제 동작이 자동으로 구현되는 것은 아니에요.

선택한 식별자 집합으로 삭제 snapshot을 만들 수 있어요.

```swift
private func deleteSelectedPhotos() {
  let idsToDelete = selectedPhotoIDs

  for id in idsToDelete {
    photosByID[id] = nil
  }

  var snapshot = dataSource.snapshot()
  snapshot.deleteItems(
    idsToDelete.filter { snapshot.indexOfItem($0) != nil }
  )
  dataSource.apply(snapshot, animatingDifferences: true)

  selectedPhotoIDs.removeAll()
}
```

## 두 손가락 팬으로 빠르게 다중 선택해요

Apple은 iOS 13 이후 table view와 Collection View에서 두 손가락 팬 다중 선택을 제공해요. delegate가 시작 가능 여부를 반환하면 시스템이 제스처와 item 선택을 관리해요.

```swift
func collectionView(
  _ collectionView: UICollectionView,
  shouldBeginMultipleSelectionInteractionAt indexPath: IndexPath
) -> Bool {
  true
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
  updateSelectionToolbar()
}
```

제스처가 끝났다고 선택을 바로 모두 지우지 않아도 돼요. 사용자가 스크롤한 뒤 다른 item을 추가로 선택할 수 있기 때문이에요. 완료 버튼이나 명확한 편집 종료 동작에서 선택 정책을 마무리하세요.

## delegate로 직접 모양을 바꿀 수도 있어요

기존 프로젝트에서는 아래 메서드를 볼 수 있어요.

```swift
func collectionView(
  _ collectionView: UICollectionView,
  didHighlightItemAt indexPath: IndexPath
) {
  collectionView.cellForItem(at: indexPath)?
    .contentView.alpha = 0.7
}

func collectionView(
  _ collectionView: UICollectionView,
  didUnhighlightItemAt indexPath: IndexPath
) {
  collectionView.cellForItem(at: indexPath)?
    .contentView.alpha = 1
}
```

간단한 일시 효과에는 사용할 수 있어요. 다만 선택, focus, disabled 상태까지 여러 메서드에서 직접 바꾸면 원래 값으로 돌아가는 경로를 빠뜨리기 쉬워요. 가능하면 상태에서 configuration을 다시 만드는 방식으로 규칙을 모으세요.

## 선택과 focus는 같지 않아요

키보드, 리모컨, visionOS 입력에서는 focus가 이동해도 선택이 확정되지 않을 수 있어요. `selectionFollowsFocus`, `allowsFocus`, `remembersLastFocusedIndexPath` 같은 API로 정책을 정할 수 있어요.

터치 화면에서 선택만 확인한 디자인을 tvOS나 키보드 환경으로 확장한다면 다음을 구분하세요.

- 현재 이동 대상인 focus 표시
- 사용자가 확정한 선택 표시
- 편집 모드의 다중 선택 표시

색 하나로 모두 표현하면 입력 장치에 따라 상태를 구분하기 어려울 수 있어요.

## 접근성과 선택 표시를 함께 확인해요

선택을 색만으로 표시하면 색각 차이가 있는 사용자가 알아보기 어려울 수 있어요. 체크 아이콘, 테두리, 텍스트처럼 두 번째 단서를 제공하세요.

커스텀 셀이라면 VoiceOver가 선택 상태를 읽을 수 있도록 UIKit의 표준 `isSelected` 흐름을 유지하고 필요한 접근성 trait와 label을 확인해요. 셀 안의 버튼과 셀 자체 선택이 동시에 존재하면 어떤 요소가 탭을 처리하는지도 테스트해야 해요.

## 적용 순서를 정리해요

1. 탭이 이동 명령인지, 유지되는 선택인지 정해요.
2. single과 multiple selection 정책을 명시해요.
3. highlighted와 selected 모양을 구분해요.
4. configuration state에서 셀 모양을 다시 만들어요.
5. 장기 선택은 `IndexPath`가 아니라 item 식별자로 저장해요.
6. snapshot에서 item이 사라질 때 선택 정책을 정해요.
7. 다중 선택, 키보드 focus, VoiceOver 환경을 함께 확인해요.

## 면접에서 이어질 수 있는 질문

### `isHighlighted`와 `isSelected`는 어떻게 다른가요?

`isHighlighted`는 손가락이 눌린 동안 같은 일시적인 상호작용 상태이고, `isSelected`는 선택이 확정된 뒤 유지될 수 있는 상태예요. 두 상태는 시각적 목적과 지속 시간이 달라요.

### 선택 상태를 셀에만 저장하면 왜 문제가 되나요?

셀은 재사용되고 화면 밖 item에는 셀이 존재하지 않을 수 있기 때문이에요. 앱에서 유지해야 하는 선택은 item 식별자로 모델에 저장하고 셀은 현재 모델과 configuration state를 표현해야 해요.

### 두 손가락 다중 선택은 직접 gesture recognizer를 만들어야 하나요?

아니요. Collection View delegate의 multiple selection interaction 메서드에 참여하면 시스템 제스처를 사용할 수 있어요. 시작 가능 여부와 편집 모드 전환, 종료 후 UI 갱신만 앱 정책에 맞게 처리해요.

## 참고 자료

- [Changing the appearance of selected and highlighted cells](https://developer.apple.com/documentation/uikit/changing-the-appearance-of-selected-and-highlighted-cells)
- [Selecting multiple items with a two-finger pan gesture](https://developer.apple.com/documentation/uikit/selecting-multiple-items-with-a-two-finger-pan-gesture)
- [UICollectionViewCell](https://developer.apple.com/documentation/uikit/uicollectionviewcell)
- [UICollectionViewDelegate](https://developer.apple.com/documentation/uikit/uicollectionviewdelegate)
- [UICollectionView](https://developer.apple.com/documentation/uikit/uicollectionview)
