---
title: '선택·하이라이트 셀 모양 바꾸기'
description: 'Apple 공식 샘플의 상태 변화, backgroundView와 selectedBackgroundView, 선택·해제·하이라이트 delegate 예제를 보존하고 modern configuration state 방식까지 함께 설명합니다.'
---

# 선택·하이라이트 셀 모양 바꾸기

> **면접 답변 한 줄 요약:** Collection View가 관리하는 `isHighlighted`·`isSelected` 상태에 맞춰 배경이나 configuration을 다시 계산해야 재사용되는 셀도 올바른 모양을 유지해요.

이 문서는 Apple 공식 샘플이 사용하는 `backgroundView`, `selectedBackgroundView`, delegate 방식부터 최신 configuration state 방식까지 차례대로 설명해요.

## 먼저 알아둘 용어

| 용어                | 쉬운 뜻                                                      |
| ------------------- | ------------------------------------------------------------ |
| Highlight           | 손가락이 닿아 있는 동안 제공하는 일시적인 시각 피드백이에요. |
| Selection           | 사용자가 item을 선택했다는 지속적인 상태예요.                |
| Configuration State | 셀 모양을 결정하는 선택·하이라이트 등의 상태 값이에요.       |

## 개요

공식 샘플은 선택되지 않음, 하이라이트, 선택됨 상태로 셀이 바뀔 때 모양을 달리해 현재 상태를 사용자에게 알려 줘요. Collection View는 기본적으로 한 item 선택을 허용하지만 `allowsMultipleSelection`으로 다중 선택을 켜거나 `allowsSelection`으로 선택을 끌 수 있어요.

## 셀 상태가 바뀌는 순서를 이해해요

`allowsSelection`이 `true`이면 Collection View가 터치 위치를 추적해 셀의 `isHighlighted`와 `isSelected`를 관리해요.

1. 선택되지 않은 셀을 누르면 `isHighlighted`가 `true`가 돼요.
2. 손가락을 떼면 `isHighlighted`가 `false`로 돌아가요.
3. 셀 안에서 손가락을 뗐다면 `isSelected`가 `true`가 돼요.
4. 셀 밖에서 뗐다면 선택 상태는 바뀌지 않아요.

<!-- Apple DocC image: collection-view-selection_2x -->

![선택되지 않은 셀을 누르고 손가락을 뗄 때 하이라이트와 선택 상태가 변하는 순서](./assets/apple-docs/collection-view-selection_2x.png)

## 셀의 시각적 모양을 바꿔요

`backgroundView`는 기본 상태의 배경이고 `selectedBackgroundView`는 하이라이트 또는 선택 상태에서 대신 표시할 배경이에요. Collection View는 상태 값만 관리할 뿐 임의의 시각 디자인을 만들지는 않지만, `selectedBackgroundView`를 지정하면 상태에 맞춰 두 배경을 자동으로 전환해요.

```swift
final class ColorCell: UICollectionViewCell {
  override init(frame: CGRect) {
    super.init(frame: frame)

    let normalBackground = UIView(frame: bounds)
    normalBackground.backgroundColor = .systemRed
    backgroundView = normalBackground

    let selectedBackground = UIView(frame: bounds)
    selectedBackground.backgroundColor = .systemBlue
    selectedBackgroundView = selectedBackground
  }

  required init?(coder: NSCoder) {
    fatalError("init(coder:) has not been implemented")
  }
}
```

Storyboard나 nib을 사용한다면 공식 샘플처럼 같은 구성을 `awakeFromNib()`에서 적용할 수도 있어요.

## 상태 변화를 더 분명하게 보여 줘요

배경 이외에 체크 표시나 아이콘을 추가하려면 선택 delegate를 사용할 수 있어요. 공식 샘플은 선택 시 별 아이콘을 표시하고 선택 해제 시 감춰요.

```swift
func collectionView(
  _ collectionView: UICollectionView,
  didSelectItemAt indexPath: IndexPath
) {
  let cell = collectionView.cellForItem(at: indexPath) as? PhotoCell
  cell?.showSelectionIcon()
}

func collectionView(
  _ collectionView: UICollectionView,
  didDeselectItemAt indexPath: IndexPath
) {
  let cell = collectionView.cellForItem(at: indexPath) as? PhotoCell
  cell?.hideSelectionIcon()
}
```

하이라이트만 별도로 표현하려면 `didHighlightItemAt`과 `didUnhighlightItemAt`을 사용해요. `selectedBackgroundView`가 선택 배경을 담당한다면 짧은 터치 피드백은 `contentView`에 적용할 수 있어요.

```swift
func collectionView(
  _ collectionView: UICollectionView,
  didHighlightItemAt indexPath: IndexPath
) {
  collectionView.cellForItem(at: indexPath)?
    .contentView.backgroundColor = .systemRed.withAlphaComponent(0.45)
}

func collectionView(
  _ collectionView: UICollectionView,
  didUnhighlightItemAt indexPath: IndexPath
) {
  collectionView.cellForItem(at: indexPath)?
    .contentView.backgroundColor = nil
}
```

이 방식은 공식 샘플의 상태 전환을 직접 보여 주기 때문에 이해하기 쉽지만, 재사용으로 셀이 다시 구성될 때 아이콘과 배경을 반드시 초기화해야 해요.

## Swift-KR 보충: Configuration State로 한곳에서 계산해요

iOS 14 이상에서는 `updateConfiguration(using:)`에서 모든 상태별 모양을 계산하면 초기화 누락을 줄일 수 있어요. 상태가 바뀔 때 UIKit이 이 메서드를 다시 호출해요.

```swift
final class PhotoCell: UICollectionViewCell {
  override func updateConfiguration(
    using state: UICellConfigurationState
  ) {
    var background = UIBackgroundConfiguration.listPlainCell()

    if state.isSelected {
      background.backgroundColor = .systemBlue
    } else if state.isHighlighted {
      background.backgroundColor = .systemBlue.withAlphaComponent(0.2)
    } else {
      background.backgroundColor = .secondarySystemBackground
    }

    backgroundConfiguration = background
  }
}
```

사용자 정의 상태가 바뀌면 `setNeedsUpdateConfiguration()`으로 재계산을 요청해요. 화면 갱신 뒤에도 선택을 유지해야 한다면 `IndexPath`가 아니라 item 식별자를 모델에 저장하고 새 위치를 찾아 다시 선택하세요.

## 참고 자료

- [Apple Developer Documentation — Changing the appearance of selected and highlighted cells](https://developer.apple.com/documentation/uikit/changing-the-appearance-of-selected-and-highlighted-cells)
- [UICollectionViewCell](./uicollectionviewcell)
- [선택 관리 학습 가이드](./selection)
