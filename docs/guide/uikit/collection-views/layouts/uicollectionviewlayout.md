---
title: 'UICollectionViewLayout'
description: 'UICollectionViewLayout은 Collection View 요소의 위치와 크기를 계산하는 추상 기반 클래스이며 완전한 사용자 정의 배치의 출발점이에요. 주요 API, 사용 예제, 주의점을 함께 정리합니다.'
---

# UICollectionViewLayout

> **면접 답변 한 줄 요약:** `UICollectionViewLayout`은 Collection View 요소의 위치와 크기를 계산하는 추상 기반 클래스이며 완전한 사용자 정의 배치의 출발점이에요.

Apple 공식 문서의 **Layouts — Manual layouts** 영역에 있는 클래스예요. 이 페이지는 공식 topic section 순서를 유지하면서 실제 코드에서 무엇을 선택해야 하는지 한국어로 설명해요.

## 먼저 알아둘 용어

| 용어    | 쉬운 뜻                                                        |
| ------- | -------------------------------------------------------------- |
| Item    | 셀 하나가 차지할 크기와 간격을 정의하는 레이아웃 단위예요.     |
| Group   | 여러 item을 가로·세로 또는 사용자 정의 방식으로 묶는 단위예요. |
| Section | group을 반복하고 헤더·배경·스크롤 동작을 설정하는 단위예요.    |

## 이 API가 맡는 역할

`UICollectionViewLayout` 하위 클래스는 `prepare()`에서 결과를 준비하고 요청된 rect와 IndexPath에 맞는 attributes를 반환해요.

UICollectionViewLayout은 Collection View 요소의 위치와 크기를 계산하는 추상 기반 클래스이며 완전한 사용자 정의 배치의 출발점이에요.

## 공식 설명에서 놓치면 안 되는 동작

layout은 직접 뷰를 만들지 않고 셀, supplementary view, decoration view의 위치·크기·시각 상태를 `UICollectionViewLayoutAttributes`로 보고해요. 실제 셀과 supplementary view는 data source가 제공하고 Decoration View는 layout이 등록해요.

하위 클래스는 보통 다음 흐름을 구현해요.

1. `prepare()`에서 현재 데이터와 bounds를 기준으로 계산하고 캐시해요.
2. `collectionViewContentSize`로 전체 스크롤 영역을 반환해요.
3. `layoutAttributesForElements(in:)`로 요청 rect와 겹치는 attributes만 반환해요.
4. `layoutAttributesForItem(at:)`와 supplementary/decoration 대응 메서드로 특정 요소를 반환해요.

Collection View는 데이터 변경 전후에 layout이 애니메이션을 준비할 기회를 제공해요. 삽입·삭제의 시작/종료 attributes를 반환하면 요소의 등장·퇴장 모양을 사용자 정의할 수 있어요.

### Invalidation으로 필요한 계산만 버려요

bounds, 데이터, layout 설정이 바뀌면 `invalidateLayout()` 또는 invalidation context로 이전 계산이 유효하지 않음을 알려요. context를 사용하면 모든 캐시를 지우지 않고 특정 item이나 측정값만 다시 계산할 수 있어요. 스크롤 중 매번 전체 계산을 반복하지 않도록 `shouldInvalidateLayout(forBoundsChange:)`의 조건을 요구사항에 맞게 좁히세요.

하위 클래스를 만들기 전 `UICollectionViewFlowLayout`이나 `UICollectionViewCompositionalLayout`으로 표현할 수 있는지 먼저 확인하세요. 완전한 사용자 정의 layout은 무효화, 애니메이션, self-sizing, 오른쪽에서 왼쪽으로 읽는 환경까지 직접 책임져야 해요.

## 선언과 지원 범위를 확인해요

```swift
@MainActor class UICollectionViewLayout
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

### the collection view layout 만들기 (Creating the collection view layout)

`UICollectionViewLayout`를 만들거나 필요한 구성 요소를 연결하는 API예요.

| API            | 하는 일                                             |
| -------------- | --------------------------------------------------- |
| `init()`       | 하위 클래스에서 구성할 기본 layout 객체를 만들어요. |
| `init(coder:)` | NSCoder에 저장된 구성으로 인스턴스를 복원해요.      |

### collection view information 확인하기 (Getting the collection view information)

현재 상태에서 필요한 값이나 위치를 안전하게 조회하는 API예요.

| API                         | 하는 일                                              |
| --------------------------- | ---------------------------------------------------- |
| `collectionView`            | 현재 컨트롤러나 layout에 연결된 Collection View예요. |
| `collectionViewContentSize` | layout이 계산한 전체 스크롤 콘텐츠 크기예요.         |

### layout attributes 제공하기 (Providing layout attributes)

`UICollectionViewLayout`에서 Providing layout attributes 책임을 담당하는 API예요.

| API                                                                    | 하는 일                                                |
| ---------------------------------------------------------------------- | ------------------------------------------------------ |
| `layoutAttributesClass`                                                | layout이 item attributes를 만들 때 사용할 클래스예요.  |
| `prepare()`                                                            | 레이아웃 속성을 사용하기 전에 필요한 상태를 준비해요.  |
| `layoutAttributesForElements(in:)`                                     | 요청 rect와 겹치는 모든 layout attributes를 반환해요.  |
| `layoutAttributesForItem(at:)`                                         | 지정한 item의 layout attributes를 반환해요.            |
| `layoutAttributesForInteractivelyMovingItem(at:withTargetPosition:)`   | 대화형 이동 중 item의 현재 위치 attributes를 반환해요. |
| `layoutAttributesForSupplementaryView(ofKind:at:)`                     | 지정한 supplementary view의 attributes를 반환해요.     |
| `layoutAttributesForDecorationView(ofKind:at:)`                        | 지정한 decoration view의 attributes를 반환해요.        |
| `targetContentOffset(forProposedContentOffset:)`                       | 스크롤이 끝날 최종 content offset을 조정해 반환해요.   |
| `targetContentOffset(forProposedContentOffset:withScrollingVelocity:)` | 스크롤이 끝날 최종 content offset을 조정해 반환해요.   |

### collection view updates에 대응하기 (Responding to collection view updates)

`UICollectionViewLayout`에서 Responding to collection view updates 책임을 담당하는 API예요.

| API                                                                    | 하는 일                                                              |
| ---------------------------------------------------------------------- | -------------------------------------------------------------------- |
| `prepare(forCollectionViewUpdates:)`                                   | batch update의 삽입·삭제·이동 정보를 받아 전환 레이아웃을 준비해요.  |
| `finalizeCollectionViewUpdates()`                                      | layout 전환이나 update 전후의 임시 상태를 준비하거나 정리해요.       |
| `indexPathsToInsertForSupplementaryView(ofKind:)`                      | 이번 update에서 삽입할 보조 요소 IndexPath를 반환해요.               |
| `indexPathsToInsertForDecorationView(ofKind:)`                         | 이번 update에서 삽입할 보조 요소 IndexPath를 반환해요.               |
| `initialLayoutAttributesForAppearingItem(at:)`                         | 삽입되어 나타나는 item의 애니메이션 시작 attributes를 반환해요.      |
| `initialLayoutAttributesForAppearingSupplementaryElement(ofKind:at:)`  | 나타나는 supplementary view의 애니메이션 시작 attributes를 반환해요. |
| `initialLayoutAttributesForAppearingDecorationElement(ofKind:at:)`     | 나타나는 decoration view의 애니메이션 시작 attributes를 반환해요.    |
| `indexPathsToDeleteForSupplementaryView(ofKind:)`                      | 이번 update에서 삭제할 보조 요소 IndexPath를 반환해요.               |
| `indexPathsToDeleteForDecorationView(ofKind:)`                         | 이번 update에서 삭제할 보조 요소 IndexPath를 반환해요.               |
| `finalLayoutAttributesForDisappearingItem(at:)`                        | 사라지는 요소의 애니메이션 종료 attributes를 반환해요.               |
| `finalLayoutAttributesForDisappearingSupplementaryElement(ofKind:at:)` | 사라지는 요소의 애니메이션 종료 attributes를 반환해요.               |
| `finalLayoutAttributesForDisappearingDecorationElement(ofKind:at:)`    | 사라지는 요소의 애니메이션 종료 attributes를 반환해요.               |
| `targetIndexPath(forInteractivelyMovingItem:withPosition:)`            | 대화형 이동 좌표의 목적 IndexPath를 반환해요.                        |

### Invalidating the layout

`UICollectionViewLayout`에서 Invalidating the layout 책임을 담당하는 API예요.

| API                                                                                                               | 하는 일                                                     |
| ----------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| `invalidateLayout()`                                                                                              | 지정한 레이아웃을 다시 계산하도록 무효화해요.               |
| `invalidateLayout(with:)`                                                                                         | 지정한 레이아웃을 다시 계산하도록 무효화해요.               |
| `invalidationContextClass`                                                                                        | layout을 다시 계산할 조건이나 invalidation 범위를 결정해요. |
| `shouldInvalidateLayout(forBoundsChange:)`                                                                        | layout을 다시 계산할 조건이나 invalidation 범위를 결정해요. |
| `invalidationContext(forBoundsChange:)`                                                                           | layout을 다시 계산할 조건이나 invalidation 범위를 결정해요. |
| `shouldInvalidateLayout(forPreferredLayoutAttributes:withOriginalAttributes:)`                                    | layout을 다시 계산할 조건이나 invalidation 범위를 결정해요. |
| `invalidationContext(forPreferredLayoutAttributes:withOriginalAttributes:)`                                       | layout을 다시 계산할 조건이나 invalidation 범위를 결정해요. |
| `invalidationContext(forInteractivelyMovingItems:withTargetPosition:previousIndexPaths:previousPosition:)`        | layout을 다시 계산할 조건이나 invalidation 범위를 결정해요. |
| `invalidationContextForEndingInteractiveMovementOfItems(toFinalIndexPaths:previousIndexPaths:movementCancelled:)` | layout을 다시 계산할 조건이나 invalidation 범위를 결정해요. |

### Coordinating animated changes

`UICollectionViewLayout`에서 Coordinating animated changes 책임을 담당하는 API예요.

| API                                 | 하는 일                                                        |
| ----------------------------------- | -------------------------------------------------------------- |
| `prepare(forAnimatedBoundsChange:)` | 위치와 영역을 사용하기 전에 필요한 상태를 준비해요.            |
| `finalizeAnimatedBoundsChange()`    | layout 전환이나 update 전후의 임시 상태를 준비하거나 정리해요. |

### Transitioning between layouts

`UICollectionViewLayout`에서 Transitioning between layouts 책임을 담당하는 API예요.

| API                           | 하는 일                                                        |
| ----------------------------- | -------------------------------------------------------------- |
| `prepareForTransition(from:)` | 레이아웃을 사용하기 전에 필요한 상태를 준비해요.               |
| `prepareForTransition(to:)`   | 레이아웃을 사용하기 전에 필요한 상태를 준비해요.               |
| `finalizeLayoutTransition()`  | layout 전환이나 update 전후의 임시 상태를 준비하거나 정리해요. |

### Registering decoration views

`UICollectionViewLayout`에서 Registering decoration views 책임을 담당하는 API예요.

| API                                    | 하는 일                                   |
| -------------------------------------- | ----------------------------------------- |
| `register(_:forDecorationViewOfKind:)` | 재사용할 장식 뷰 타입이나 nib을 등록해요. |
| `register(_:forDecorationViewOfKind:)` | 재사용할 장식 뷰 타입이나 nib을 등록해요. |

### right-to-left layouts 지원하기 (Supporting right-to-left layouts)

`UICollectionViewLayout`에서 Supporting right-to-left layouts 책임을 담당하는 API예요.

| API                                          | 하는 일                                                            |
| -------------------------------------------- | ------------------------------------------------------------------ |
| `developmentLayoutDirection`                 | 개발 환경에서 layout이 사용하는 좌우 방향이에요.                   |
| `flipsHorizontallyInOppositeLayoutDirection` | 오른쪽에서 왼쪽으로 읽는 환경에서 layout을 수평 반전할지 나타내요. |

## 타입 관계를 확인해요

| 관계              | 타입                                                                                                                                      |
| ----------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| 상속              | `NSObject`                                                                                                                                |
| 상속하는 타입     | `UICollectionViewCompositionalLayout`, `UICollectionViewFlowLayout`, `UICollectionViewTransitionLayout`                                   |
| 준수하는 프로토콜 | `CVarArg`, `CustomDebugStringConvertible`, `CustomStringConvertible`, `Equatable`, `Hashable`, `NSCoding`, `NSObjectProtocol`, `Sendable` |

## 사용할 때 주의할 점

비율 크기는 바로 바깥 컨테이너를 기준으로 계산해요. 예상 크기를 사용한다면 셀이 Auto Layout으로 실제 높이를 계산할 수 있어야 하며, layout 객체와 데이터 상태의 책임을 섞지 않아요.

## 함께 읽으면 좋은 문서

- [Collection Views 한눈에 보기](./../index)
- [레이아웃 학습 가이드](../layout-guide)
- [공식 문서 인벤토리](./../official-document-inventory)

## 참고 자료

- [Apple Developer Documentation — UICollectionViewLayout](https://developer.apple.com/documentation/uikit/uicollectionviewlayout)
