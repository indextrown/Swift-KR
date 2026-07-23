---
title: 'UICollectionViewLayoutAttributes'
description: 'UICollectionViewLayoutAttributes는 특정 셀·보조 뷰·장식 뷰의 frame, transform, alpha, 표시 순서 같은 결과를 담아요. 주요 API, 사용 예제, 주의점을 함께 정리합니다.'
---

# UICollectionViewLayoutAttributes

> **면접 답변 한 줄 요약:** `UICollectionViewLayoutAttributes`는 특정 셀·보조 뷰·장식 뷰의 frame, transform, alpha, 표시 순서 같은 결과를 담아요.

Apple 공식 문서의 **Layouts — Manual layouts** 영역에 있는 클래스예요. 이 페이지는 공식 topic section 순서를 유지하면서 실제 코드에서 무엇을 선택해야 하는지 한국어로 설명해요.

## 먼저 알아둘 용어

| 용어    | 쉬운 뜻                                                        |
| ------- | -------------------------------------------------------------- |
| Item    | 셀 하나가 차지할 크기와 간격을 정의하는 레이아웃 단위예요.     |
| Group   | 여러 item을 가로·세로 또는 사용자 정의 방식으로 묶는 단위예요. |
| Section | group을 반복하고 헤더·배경·스크롤 동작을 설정하는 단위예요.    |

## 이 API가 맡는 역할

`UICollectionViewLayout` 하위 클래스는 `prepare()`에서 결과를 준비하고 요청된 rect와 IndexPath에 맞는 attributes를 반환해요.

UICollectionViewLayoutAttributes는 특정 셀·보조 뷰·장식 뷰의 frame, transform, alpha, 표시 순서 같은 결과를 담아요.

## 선언과 지원 범위를 확인해요

```swift
@MainActor class UICollectionViewLayoutAttributes
```

**지원 플랫폼:** iOS 6.0+ · iPadOS 6.0+ · Mac Catalyst 13.1+ · tvOS · visionOS 1.0+

## 가장 작은 사용 예제

아래 예제에서는 이 API가 속한 역할이 전체 Collection View 구성에서 어디에 놓이는지 확인해요. 핵심 호출에 집중할 수 있도록 모델 선언과 주변 화면 구성은 생략했어요.

```swift
import UIKit

final class MosaicLayout: UICollectionViewLayout {
  private var attributes: [UICollectionViewLayoutAttributes] = []

  override func prepare() {
    super.prepare()
    // 모델과 collectionView 크기로 attributes를 계산해요.
  }

  override func layoutAttributesForElements(
    in rect: CGRect
  ) -> [UICollectionViewLayoutAttributes]? {
    attributes.filter { $0.frame.intersects(rect) }
  }
}
```

## 공식 API 목차대로 살펴봐요

### layout attributes 만들기 (Creating layout attributes)

`UICollectionViewLayoutAttributes`를 만들거나 필요한 구성 요소를 연결하는 API예요.

| API                                      | 하는 일                                                  |
| ---------------------------------------- | -------------------------------------------------------- |
| `init(forCellWith:)`                     | 레이아웃 속성에 필요한 값을 받아 새 인스턴스를 만들어요. |
| `init(forSupplementaryViewOfKind:with:)` | 보조 뷰에 필요한 값을 받아 새 인스턴스를 만들어요.       |
| `init(forDecorationViewOfKind:with:)`    | 장식 뷰에 필요한 값을 받아 새 인스턴스를 만들어요.       |

### referenced item 식별하기 (Identifying the referenced item)

현재 상태에서 필요한 값이나 위치를 안전하게 조회하는 API예요.

| API                                | 하는 일                                              |
| ---------------------------------- | ---------------------------------------------------- |
| `indexPath`                        | 지정한 IndexPath의 현재 위치를 반환해요.             |
| `representedElementKind`           | item의 현재 값이나 설정을 읽고 필요한 경우 변경해요. |
| `representedElementCategory`       | item의 현재 값이나 설정을 읽고 필요한 경우 변경해요. |
| `UICollectionView.ElementCategory` | item의 현재 값이나 설정을 읽고 필요한 경우 변경해요. |

### layout attributes 접근하기 (Accessing the layout attributes)

현재 상태에서 필요한 값이나 위치를 안전하게 조회하는 API예요.

| API           | 하는 일                                                       |
| ------------- | ------------------------------------------------------------- |
| `frame`       | 레이아웃 속성의 현재 값이나 설정을 읽고 필요한 경우 변경해요. |
| `bounds`      | 레이아웃 속성의 현재 값이나 설정을 읽고 필요한 경우 변경해요. |
| `center`      | 레이아웃 속성의 현재 값이나 설정을 읽고 필요한 경우 변경해요. |
| `size`        | 레이아웃 속성의 현재 값이나 설정을 읽고 필요한 경우 변경해요. |
| `transform3D` | 레이아웃 속성의 현재 값이나 설정을 읽고 필요한 경우 변경해요. |
| `transform`   | 레이아웃 속성의 현재 값이나 설정을 읽고 필요한 경우 변경해요. |
| `alpha`       | 레이아웃 속성의 현재 값이나 설정을 읽고 필요한 경우 변경해요. |
| `zIndex`      | 레이아웃 속성의 현재 값이나 설정을 읽고 필요한 경우 변경해요. |
| `isHidden`    | 레이아웃 속성의 활성화 여부나 현재 상태를 나타내요.           |

### 초기화

`UICollectionViewLayoutAttributes`를 만들거나 필요한 구성 요소를 연결하는 API예요.

| API                                               | 하는 일                                              |
| ------------------------------------------------- | ---------------------------------------------------- |
| `init(forCellWithIndexPath:)`                     | IndexPath에 필요한 값을 받아 새 인스턴스를 만들어요. |
| `init(forDecorationViewOfKind:withIndexPath:)`    | 장식 뷰에 필요한 값을 받아 새 인스턴스를 만들어요.   |
| `init(forSupplementaryViewOfKind:withIndexPath:)` | 보조 뷰에 필요한 값을 받아 새 인스턴스를 만들어요.   |

## 타입 관계를 확인해요

| 관계              | 타입                                                                                                                                                        |
| ----------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 상속              | `NSObject`                                                                                                                                                  |
| 준수하는 프로토콜 | `CVarArg`, `CustomDebugStringConvertible`, `CustomStringConvertible`, `Equatable`, `Hashable`, `NSCopying`, `NSObjectProtocol`, `Sendable`, `UIDynamicItem` |

## 사용할 때 주의할 점

비율 크기는 바로 바깥 컨테이너를 기준으로 계산해요. 예상 크기를 사용한다면 셀이 Auto Layout으로 실제 높이를 계산할 수 있어야 하며, layout 객체와 데이터 상태의 책임을 섞지 않아요.

## 함께 읽으면 좋은 문서

- [Collection Views 한눈에 보기](./../index)
- [레이아웃 학습 가이드](../layout-guide)
- [공식 문서 인벤토리](./../official-document-inventory)

## 참고 자료

- [Apple Developer Documentation — UICollectionViewLayoutAttributes](https://developer.apple.com/documentation/uikit/uicollectionviewlayoutattributes)
