---
title: 'UICollectionViewDelegateFlowLayout 예제'
description: 'UICollectionViewDelegateFlowLayout의 선택 메서드로 item 크기·section 여백·행과 item 간격·header 크기를 화면과 모델에 맞게 동적으로 계산합니다.'
---

# UICollectionViewDelegateFlowLayout 예제

> **면접 답변 한 줄 요약:** `UICollectionViewDelegateFlowLayout`은 `UICollectionViewFlowLayout`이 item 크기와 section 간격을 물을 때 화면별 값을 반환하여 같은 layout 객체를 데이터와 가용 너비에 맞게 조정하는 delegate예요.

[`UICollectionViewFlowLayout` 예제](./flow-layout)가 layout 객체의 기본 설정을 다룬다면, 이 문서는 delegate가 각 section과 item마다 값을 바꾸는 방법에 집중해요.

## 먼저 알아둘 용어

| 용어               | 쉬운 뜻                                                                 |
| ------------------ | ----------------------------------------------------------------------- |
| layout delegate    | Layout이 크기와 간격을 물을 때 화면별 정책을 답하는 객체예요.           |
| section inset      | Section 콘텐츠 바깥쪽에 두는 위·왼쪽·아래·오른쪽 여백이에요.            |
| line spacing       | 세로 스크롤에서는 행 사이, 가로 스크롤에서는 열 사이의 최소 간격이에요. |
| inter-item spacing | 한 행이나 열 안에서 서로 이웃한 item 사이의 최소 간격이에요.            |
| supplementary view | Section의 header나 footer처럼 cell을 보조하는 재사용 뷰예요.            |

## Collection View Delegate에 연결해요

```swift
override func viewDidLoad() {
  super.viewDidLoad()

  collectionView.delegate = self
}
```

`UICollectionViewDelegateFlowLayout`은 `UICollectionViewDelegate`를 상속해요. 별도의 `flowLayoutDelegate` 프로퍼티는 없고 Collection View의 일반 `delegate`에 연결해요.

```swift
extension ClassicPhotoGridViewController:
  UICollectionViewDelegateFlowLayout
{
  // 선택과 layout callback을 함께 구현할 수 있어요.
}
```

모든 메서드는 선택 사항이에요. 구현하지 않은 값은 `UICollectionViewFlowLayout`의 `itemSize`, `sectionInset`, spacing 프로퍼티를 사용해요.

## 가용 너비로 열 크기를 계산해요

```swift
func collectionView(
  _ collectionView: UICollectionView,
  layout collectionViewLayout: UICollectionViewLayout,
  sizeForItemAt indexPath: IndexPath
) -> CGSize {
  let horizontalInset: CGFloat = 16
  let spacing: CGFloat = 12
  let minimumWidth: CGFloat = 150

  let availableWidth =
    collectionView.bounds.width
    - collectionView.adjustedContentInset.left
    - collectionView.adjustedContentInset.right
    - horizontalInset * 2

  let columns = max(
    1,
    Int((availableWidth + spacing) / (minimumWidth + spacing))
  )
  let totalSpacing = spacing * CGFloat(columns - 1)
  let width = floor(
    (availableWidth - totalSpacing) / CGFloat(columns)
  )

  return CGSize(width: width, height: width + 48)
}
```

화면 너비에서 safe area가 반영된 content inset과 section inset, 열 사이 간격을 모두 빼야 해요. 반환하는 너비와 높이는 0보다 커야 하고, 세로 격자의 item 너비가 표시 가능한 영역을 넘지 않게 해야 해요.

## Section 여백과 간격을 한곳에서 맞춰요

```swift
func collectionView(
  _ collectionView: UICollectionView,
  layout collectionViewLayout: UICollectionViewLayout,
  insetForSectionAt section: Int
) -> UIEdgeInsets {
  UIEdgeInsets(
    top: 16,
    left: 16,
    bottom: 24,
    right: 16
  )
}

func collectionView(
  _ collectionView: UICollectionView,
  layout collectionViewLayout: UICollectionViewLayout,
  minimumLineSpacingForSectionAt section: Int
) -> CGFloat {
  16
}

func collectionView(
  _ collectionView: UICollectionView,
  layout collectionViewLayout: UICollectionViewLayout,
  minimumInteritemSpacingForSectionAt section: Int
) -> CGFloat {
  12
}
```

`minimumInteritemSpacing`은 최소값이에요. Flow Layout은 한 행에 남은 공간을 배분하면서 실제 간격을 더 크게 만들 수 있어요. 정확한 열 너비가 중요하다면 앞의 item 크기 계산에 같은 inset과 spacing 값을 사용하세요.

## 모델에 따라 item 높이를 바꿔요

```swift
func collectionView(
  _ collectionView: UICollectionView,
  layout collectionViewLayout: UICollectionViewLayout,
  sizeForItemAt indexPath: IndexPath
) -> CGSize {
  let photo = photos[indexPath.item]
  let width = max(collectionView.bounds.width - 32, 1)
  let titleHeight: CGFloat = photo.title.count > 20 ? 64 : 44

  return CGSize(
    width: width,
    height: 120 + titleHeight
  )
}
```

이 방식은 item마다 계산 비용이 작고 높이를 미리 알 수 있을 때 적합해요. 텍스트와 Auto Layout으로 높이를 측정해야 한다면 `estimatedItemSize` 기반 self-sizing을 검토하세요.

## Header와 Footer 크기를 제공해요

```swift
func collectionView(
  _ collectionView: UICollectionView,
  layout collectionViewLayout: UICollectionViewLayout,
  referenceSizeForHeaderInSection section: Int
) -> CGSize {
  CGSize(
    width: collectionView.bounds.width,
    height: 52
  )
}

func collectionView(
  _ collectionView: UICollectionView,
  layout collectionViewLayout: UICollectionViewLayout,
  referenceSizeForFooterInSection section: Int
) -> CGSize {
  section == 0
    ? CGSize(width: collectionView.bounds.width, height: 32)
    : .zero
}
```

크기만 반환한다고 header나 footer가 자동 생성되지는 않아요. 재사용 뷰를 등록하고 Data Source의 `viewForSupplementaryElementOfKind`에서도 실제 뷰를 제공해야 해요.

## Layout 프로퍼티와 Delegate 값의 우선순위를 구분해요

| 요구사항                            | 적합한 위치                   |
| ----------------------------------- | ----------------------------- |
| 모든 item이 같은 고정 크기          | `flowLayout.itemSize`         |
| 화면 너비에 따라 열 수 변경         | Delegate의 `sizeForItemAt`    |
| 모든 section의 같은 inset과 spacing | Flow Layout 프로퍼티          |
| Section마다 다른 inset과 spacing    | Delegate의 section별 메서드   |
| Auto Layout으로 내용 기반 크기      | `estimatedItemSize`와 셀 제약 |

Delegate 값은 해당 항목의 Flow Layout 기본 프로퍼티보다 우선해요. 둘을 동시에 설정해도 동작하지만 실제 값을 찾기 어려워질 수 있으므로, 동적인 항목만 delegate로 옮기세요.

## 자주 발생하는 문제를 점검해요

| 증상                                       | 먼저 확인할 것                                                                 |
| ------------------------------------------ | ------------------------------------------------------------------------------ |
| 크기 callback이 호출되지 않아요.           | Layout이 실제 `UICollectionViewFlowLayout`이고 delegate가 연결됐는지 확인해요. |
| 마지막 열이 다음 줄로 넘어가요.            | Content inset, section inset, 전체 spacing을 모두 빼고 너비를 계산했는지 봐요. |
| Header 공간만 있고 뷰가 안 보여요.         | Header 등록과 Data Source 제공 메서드를 함께 구현했는지 확인해요.              |
| 회전 뒤 이전 크기가 남아요.                | Bounds 크기 변경 시 layout이 invalidation되는지 확인해요.                      |
| Self-sizing 크기와 delegate 값이 충돌해요. | 크기 결정 방식을 하나로 정하고 `estimatedItemSize` 설정을 확인해요.            |

## 면접에서 이어질 수 있는 질문

### `UICollectionViewDelegate`와 무엇이 다른가요?

`UICollectionViewDelegate`는 선택과 highlight 같은 사용자 상호작용을 다뤄요. `UICollectionViewDelegateFlowLayout`은 이를 상속하면서 Flow Layout이 필요한 item 크기와 spacing 정보를 추가로 제공해요.

### 모든 item이 같은 크기여도 Delegate가 필요한가요?

아니요. 고정된 크기라면 `UICollectionViewFlowLayout.itemSize`를 설정하는 편이 더 단순해요. 화면 너비나 section, 모델에 따라 값이 달라질 때 delegate가 유용해요.

## 참고 자료

- [Apple Developer Documentation — UICollectionViewDelegateFlowLayout](https://developer.apple.com/documentation/uikit/uicollectionviewdelegateflowlayout)
- [Apple Developer Documentation — UICollectionViewFlowLayout](https://developer.apple.com/documentation/uikit/uicollectionviewflowlayout)
- [Apple Developer Documentation — collectionView(_:layout:sizeForItemAt:)](<https://developer.apple.com/documentation/uikit/uicollectionviewdelegateflowlayout/collectionview(_:layout:sizeforitemat:)>)
