---
title: 'UICollectionViewTransitionLayout 예제'
description: 'UICollectionViewTransitionLayout으로 격자와 목록 사이를 버튼 또는 pan gesture로 전환하고 transitionProgress·완료·취소·layout 상태를 안전하게 관리합니다.'
---

# UICollectionViewTransitionLayout 예제

> **면접 답변 한 줄 요약:** `UICollectionViewTransitionLayout`은 현재 layout과 새 layout의 attributes를 진행률에 따라 보간하는 임시 layout으로, gesture가 `transitionProgress`를 갱신하고 완료 또는 취소를 결정하게 해요.

이 문서는 같은 사진 데이터를 두 열 격자와 한 열 목록 사이에서 전환해요. 단순한 자동 animation과 사용자가 진행률을 조절하는 interactive transition을 나누어 설명해요.

## 먼저 알아둘 용어

| 용어                   | 쉬운 뜻                                                                            |
| ---------------------- | ---------------------------------------------------------------------------------- |
| layout transition      | 같은 item을 유지한 채 배치 방식만 현재 layout에서 새 layout으로 바꾸는 과정이에요. |
| interpolation          | 시작과 끝 attributes 사이의 중간 frame·위치를 진행률로 계산하는 동작이에요.        |
| interactive transition | Gesture 이동량으로 사용자가 animation 진행률을 직접 조절하는 전환이에요.           |
| transition progress    | 시작 layout은 0, 목표 layout은 1로 나타내는 전환 진행률이에요.                     |
| finish / cancel        | 목표 layout을 설치해 끝낼지, 이전 layout으로 되돌릴지 결정하는 동작이에요.         |

## 전환할 두 Layout을 준비해요

```swift
private lazy var gridLayout: UICollectionViewFlowLayout = {
  let layout = UICollectionViewFlowLayout()
  layout.itemSize = CGSize(width: 160, height: 208)
  layout.minimumInteritemSpacing = 12
  layout.minimumLineSpacing = 16
  layout.sectionInset = UIEdgeInsets(
    top: 16,
    left: 16,
    bottom: 16,
    right: 16
  )
  return layout
}()

private lazy var listLayout: UICollectionViewFlowLayout = {
  let layout = UICollectionViewFlowLayout()
  layout.itemSize = CGSize(width: 320, height: 88)
  layout.minimumLineSpacing = 8
  layout.sectionInset = UIEdgeInsets(
    top: 16,
    left: 16,
    bottom: 16,
    right: 16
  )
  return layout
}()
```

예제를 단순하게 유지하기 위해 두 Flow Layout을 사용했어요. Flow와 Compositional Layout처럼 서로 다른 `UICollectionViewLayout` 하위 타입 사이에서도 같은 전환 API를 사용할 수 있어요.

## 버튼으로 자동 전환해요

```swift
private var showsGrid = true

@objc
private func toggleLayout() {
  showsGrid.toggle()
  let target = showsGrid ? gridLayout : listLayout

  collectionView.setCollectionViewLayout(
    target,
    animated: true
  )
}
```

사용자가 진행률을 직접 조절할 필요가 없다면 이 API가 가장 단순해요. 전환 뒤에도 Data Source, 모델, 셀은 그대로 유지되고 layout만 바뀌어요.

## Pan Gesture를 연결해요

```swift
private var transitionLayout:
  UICollectionViewTransitionLayout?
private var transitionTarget: UICollectionViewLayout?
private var transitionShouldFinish = false

private func configureLayoutGesture() {
  let pan = UIPanGestureRecognizer(
    target: self,
    action: #selector(handleLayoutPan(_:))
  )
  collectionView.addGestureRecognizer(pan)
}
```

전환 중인 임시 layout과 목표 layout을 프로퍼티로 강하게 보관해 gesture callback 사이에서 사용해요.

## Gesture 시작에서 Interactive Transition을 만들어요

```swift
@objc
private func handleLayoutPan(
  _ gesture: UIPanGestureRecognizer
) {
  switch gesture.state {
  case .began:
    beginLayoutTransition()
  case .changed:
    updateLayoutTransition(with: gesture)
  case .ended:
    endLayoutTransition(cancelled: false)
  case .cancelled, .failed:
    endLayoutTransition(cancelled: true)
  default:
    break
  }
}

private func beginLayoutTransition() {
  guard transitionLayout == nil else {
    return
  }

  let target = showsGrid ? listLayout : gridLayout
  transitionTarget = target
  transitionLayout = collectionView
    .startInteractiveTransition(
      to: target
    ) { [weak self] completed, finished in
      guard let self else {
        return
      }

      if completed && finished {
        showsGrid.toggle()
      }
      transitionLayout = nil
      transitionTarget = nil
      transitionShouldFinish = false
    }
}
```

`startInteractiveTransition`을 호출하면 Collection View가 반환된 `UICollectionViewTransitionLayout`을 전환 동안 임시 layout으로 사용해요.

## 이동량을 0부터 1 사이 진행률로 바꿔요

```swift
private func updateLayoutTransition(
  with gesture: UIPanGestureRecognizer
) {
  guard let transitionLayout else {
    return
  }

  let translation = gesture.translation(
    in: collectionView
  )
  let distance = max(collectionView.bounds.width, 1)
  let progress = min(
    max(abs(translation.x) / distance, 0),
    1
  )

  transitionLayout.transitionProgress = progress
  transitionLayout.invalidateLayout()

  let velocity = gesture.velocity(
    in: collectionView
  ).x
  transitionShouldFinish =
    progress > 0.5 || abs(velocity) > 700
}
```

`transitionProgress`를 변경한 뒤 layout을 invalidation해야 중간 attributes가 다시 계산돼요. 진행률은 0...1 범위로 제한해 overshoot를 피했어요.

## 끝낼지 이전 Layout으로 돌아갈지 결정해요

```swift
private func endLayoutTransition(
  cancelled: Bool
) {
  guard transitionLayout != nil else {
    return
  }

  if !cancelled && transitionShouldFinish {
    collectionView.finishInteractiveTransition()
  } else {
    collectionView.cancelInteractiveTransition()
  }
}
```

Finish하면 목표 layout이 최종 `collectionViewLayout`이 되고, cancel하면 시작 layout으로 돌아가요. 두 경우 모두 completion에서 임시 상태를 정리해 다음 gesture가 새 transition을 시작할 수 있게 해요.

## 기본 Transition Layout으로 충분한지 판단해요

기본 `UICollectionViewTransitionLayout`은 같은 `IndexPath`의 시작 attributes와 끝 attributes를 보간해요. 다음 요구사항이 없다면 별도 subclass가 필요하지 않아요.

- 전환 중 item마다 다른 곡선이나 추가 속성을 적용해야 해요.
- 특정 section은 고정하고 나머지만 움직여야 해요.
- Custom layout attributes의 새 프로퍼티까지 보간해야 해요.

이런 경우 `UICollectionViewTransitionLayout`을 상속하고 사용자 정의 값을 갱신한 뒤, `UICollectionViewDelegate`의 `collectionView(_:transitionLayoutForOldLayout:newLayout:)`에서 custom transition layout을 반환할 수 있어요.

## 자주 발생하는 문제를 점검해요

| 증상                                    | 먼저 확인할 것                                                                 |
| --------------------------------------- | ------------------------------------------------------------------------------ |
| Gesture를 움직여도 frame이 안 바뀌어요. | `transitionProgress` 변경 뒤 `invalidateLayout()`을 호출하는지 확인해요.       |
| 두 번째 전환이 시작되지 않아요.         | Completion에서 transition 상태를 `nil`로 정리하는지 확인해요.                  |
| 취소했는데 상태 flag가 바뀌어요.        | 실제 `completed`, `finished` 결과에서만 최종 layout 상태를 바꾸는지 봐요.      |
| 전환 중 item이 사라져요.                | 두 layout과 Data Source가 같은 section·item `IndexPath`를 설명하는지 확인해요. |
| 단순 전환 코드가 지나치게 복잡해요.     | Gesture 제어가 필요 없다면 `setCollectionViewLayout(animated:)`을 사용해요.    |

## 면접에서 이어질 수 있는 질문

### `setCollectionViewLayout`과 Interactive Transition의 차이는 무엇인가요?

`setCollectionViewLayout(animated:)`은 UIKit이 animation 시간을 관리하는 자동 전환이에요. Interactive transition은 gesture가 `transitionProgress`를 갱신하고 마지막에 finish 또는 cancel을 직접 결정해요.

### Transition Layout은 최종 Layout인가요?

아니요. 현재 layout과 목표 layout 사이의 중간 attributes를 제공하는 임시 layout이에요. 전환을 완료하면 목표 layout이 설치되고, 취소하면 이전 layout으로 돌아가요.

## 참고 자료

- [Apple Developer Documentation — UICollectionViewTransitionLayout](https://developer.apple.com/documentation/uikit/uicollectionviewtransitionlayout)
- [Apple Developer Documentation — startInteractiveTransition(to:completion:)](<https://developer.apple.com/documentation/uikit/uicollectionview/startinteractivetransition(to:completion:)>)
- [Apple Developer Documentation — UICollectionView](https://developer.apple.com/documentation/uikit/uicollectionview)
