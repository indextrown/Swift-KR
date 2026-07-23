---
title: 'NSCollectionLayoutVisibleItem'
description: 'NSCollectionLayoutVisibleItem은 곧 화면에 표시될 item의 frame, transform, alpha, z-index를 마지막 레이아웃 단계에서 조정하게 해요. 주요 API, 사용 예제, 주의점을 함께 정리합니다.'
---

# NSCollectionLayoutVisibleItem

> **면접 답변 한 줄 요약:** `NSCollectionLayoutVisibleItem`은 곧 화면에 표시될 item의 frame, transform, alpha, z-index를 마지막 레이아웃 단계에서 조정하게 해요.

Apple 공식 문서의 **Layouts — Layout updates** 영역에 있는 프로토콜예요. 이 페이지는 공식 topic section 순서를 유지하면서 실제 코드에서 무엇을 선택해야 하는지 한국어로 설명해요.

## 먼저 알아둘 용어

| 용어    | 쉬운 뜻                                                        |
| ------- | -------------------------------------------------------------- |
| Item    | 셀 하나가 차지할 크기와 간격을 정의하는 레이아웃 단위예요.     |
| Group   | 여러 item을 가로·세로 또는 사용자 정의 방식으로 묶는 단위예요. |
| Section | group을 반복하고 헤더·배경·스크롤 동작을 설정하는 단위예요.    |

## 이 API가 맡는 역할

레이아웃 갱신 API는 보이는 item의 표시 속성을 바꾸거나 필요한 범위만 무효화해 불필요한 전체 재계산을 줄여요.

NSCollectionLayoutVisibleItem은 곧 화면에 표시될 item의 frame, transform, alpha, z-index를 마지막 레이아웃 단계에서 조정하게 해요.

## 선언과 지원 범위를 확인해요

```swift
@MainActor protocol NSCollectionLayoutVisibleItem : UIDynamicItem
```

**지원 플랫폼:** iOS 13.0+ · iPadOS 13.0+ · Mac Catalyst 13.1+ · tvOS 13.0+ · visionOS 1.0+

## 가장 작은 사용 예제

아래 예제에서는 이 API가 속한 역할이 전체 Collection View 구성에서 어디에 놓이는지 확인해요. 핵심 호출에 집중할 수 있도록 모델 선언과 주변 화면 구성은 생략했어요.

```swift
import UIKit

func applyParallax(
  to item: any NSCollectionLayoutVisibleItem,
  distanceFromCenter: CGFloat
) {
  item.alpha = max(0.5, 1 - abs(distanceFromCenter) / 500)
  item.transform = CGAffineTransform(
    scaleX: item.alpha,
    y: item.alpha
  )
}
```

## 공식 API 목차대로 살펴봐요

### item 식별하기 (Identifying the item)

현재 상태에서 필요한 값이나 위치를 안전하게 조회하는 API예요.

| API                          | 하는 일                                                          |
| ---------------------------- | ---------------------------------------------------------------- |
| `name`                       | visible item을 식별하거나 디버깅할 때 사용하는 이름이에요.       |
| `representedElementKind`     | supplementary·decoration 요소의 kind 문자열이에요.               |
| `representedElementCategory` | attributes가 cell·supplementary·decoration 중 무엇인지 구분해요. |

### index path 확인하기 (Getting the index path)

현재 상태에서 필요한 값이나 위치를 안전하게 조회하는 API예요.

| API         | 하는 일                                            |
| ----------- | -------------------------------------------------- |
| `indexPath` | 해당 layout 요소 또는 update item의 IndexPath예요. |

### appearance 설정하기 (Configuring appearance)

동작과 표시 방식을 요구사항에 맞게 설정하는 API예요.

| API        | 하는 일                                     |
| ---------- | ------------------------------------------- |
| `alpha`    | 요소의 불투명도를 나타내요.                 |
| `isHidden` | 현재 layout cycle에서 요소를 숨길지 정해요. |

### position 설정하기 (Configuring position)

동작과 표시 방식을 요구사항에 맞게 설정하는 API예요.

| API           | 하는 일                                                 |
| ------------- | ------------------------------------------------------- |
| `frame`       | layout container 좌표에서 요소가 차지하는 사각형이에요. |
| `bounds`      | 요소 자체 좌표계의 크기와 원점을 나타내요.              |
| `center`      | layout 좌표계에서 요소의 중심점이에요.                  |
| `transform`   | 요소에 적용할 2D transform이에요.                       |
| `transform3D` | 요소에 적용할 3D transform이에요.                       |

### stacking order 지정하기 (Specifying stacking order)

동작과 표시 방식을 요구사항에 맞게 설정하는 API예요.

| API      | 하는 일                                |
| -------- | -------------------------------------- |
| `zIndex` | 겹친 요소의 앞뒤 그리기 순서를 정해요. |

## 타입 관계를 확인해요

| 관계 | 타입                                |
| ---- | ----------------------------------- |
| 상속 | `NSObjectProtocol`, `UIDynamicItem` |

## 사용할 때 주의할 점

비율 크기는 바로 바깥 컨테이너를 기준으로 계산해요. 예상 크기를 사용한다면 셀이 Auto Layout으로 실제 높이를 계산할 수 있어야 하며, layout 객체와 데이터 상태의 책임을 섞지 않아요.

## 함께 읽으면 좋은 문서

- [Collection Views 한눈에 보기](./../index)
- [레이아웃 학습 가이드](../layout-guide)
- [공식 문서 인벤토리](./../official-document-inventory)

## 참고 자료

- [Apple Developer Documentation — NSCollectionLayoutVisibleItem](https://developer.apple.com/documentation/uikit/nscollectionlayoutvisibleitem)
