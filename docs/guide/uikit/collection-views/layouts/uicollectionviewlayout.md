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

## 개요 (Overview)

Layout 객체는 Collection View bounds 안에서 셀, supplementary view, decoration view를 어디에 배치할지 결정하고 그 정보를 Collection View에 전달해요. Collection View는 전달받은 layout 정보를 해당 뷰에 적용해 화면에 표시해요.

`UICollectionViewLayout`은 추상 기반 클래스이므로 실제로 사용하려면 하위 클래스를 만들어야 해요. 다만 직접 하위 클래스를 만들기 전에 `UICollectionViewCompositionalLayout`을 원하는 배치에 맞게 조합할 수 있는지 먼저 검토하세요.

### 하위 클래스 구현 시 참고할 점 (Subclassing notes)

Layout 객체는 설계한 배치 규칙에 따라 Collection View item의 위치, 크기, 시각적 상태를 정의해요. 실제 layout 뷰는 Collection View의 data source가 만들어요.

Collection View Layout은 다음 세 종류의 시각 요소를 배치해요.

- **셀:** Layout이 배치하는 핵심 요소이며 각 셀은 데이터 item 하나를 나타내요. 선택, drag, 재정렬 같은 상호작용을 지원할 수 있어요. 셀을 하나의 묶음으로 구성하거나 여러 section으로 나눌 수 있으며, Layout 객체가 콘텐츠 영역 안에서 위치를 정해요.
- **Supplementary View:** 데이터를 표시하지만 사용자가 직접 선택할 수 없는 뷰예요. section 또는 전체 Collection View의 header와 footer 등에 사용해요. 선택 사항이며 사용 여부와 위치는 Layout 객체가 정해요.
- **Decoration View:** badge나 배경처럼 선택할 수 없고 Collection View 데이터와 직접 연결되지 않은 시각적 장식이에요. 이 요소도 선택 사항이며 사용 여부와 위치를 Layout 객체가 정해요.

Collection View는 여러 시점에 Layout 객체에 이 요소들의 배치 정보를 요청해요. 화면에 나타나는 모든 셀과 뷰는 Layout이 제공한 정보로 배치돼요. item을 삽입하거나 삭제할 때도 추가 layout pass가 실행돼 등장하거나 사라지는 item을 계산해요. 다만 Collection View는 항상 현재 화면에 보이는 객체로 layout 작업 범위를 제한해요.

#### 재정의해야 하는 메서드 (Methods to override)

모든 사용자 정의 Layout은 다음 API를 구현해야 해요.

- `collectionViewContentSize`
- `layoutAttributesForElements(in:)`
- `layoutAttributesForItem(at:)`
- Supplementary View를 지원한다면 `layoutAttributesForSupplementaryView(ofKind:at:)`
- Decoration View를 지원한다면 `layoutAttributesForDecorationView(ofKind:at:)`
- `shouldInvalidateLayout(forBoundsChange:)`

이 API들은 Collection View가 콘텐츠를 화면에 배치하는 데 필요한 기본 정보를 제공해요. Supplementary View나 Decoration View를 지원하지 않는다면 해당 메서드는 구현하지 않아도 돼요.

Collection View 데이터가 바뀌어 item을 삽입하거나 삭제할 때는 Layout 객체에도 새 위치를 반영한 정보를 요청해요. 이동하는 item은 일반 layout attributes 메서드로 갱신된 정보를 가져와요. 삽입되거나 삭제되는 item은 다음 메서드를 재정의해 적절한 시작·종료 attributes를 제공할 수 있어요.

- `initialLayoutAttributesForAppearingItem(at:)`
- `initialLayoutAttributesForAppearingSupplementaryElement(ofKind:at:)`
- `initialLayoutAttributesForAppearingDecorationElement(ofKind:at:)`
- `finalLayoutAttributesForDisappearingItem(at:)`
- `finalLayoutAttributesForDisappearingSupplementaryElement(ofKind:at:)`
- `finalLayoutAttributesForDisappearingDecorationElement(ofKind:at:)`

이 메서드 외에도 `prepare(forCollectionViewUpdates:)`를 재정의해 layout update를 준비할 수 있어요. `finalizeCollectionViewUpdates()`에서는 전체 애니메이션 블록에 추가 애니메이션을 넣거나 마지막 layout 정리 작업을 수행할 수 있어요.

#### Invalidation Context로 Layout 성능 최적화하기 (Optimizing layout performance using invalidation contexts)

사용자 정의 Layout에서는 실제로 달라진 부분만 무효화해 성능을 높일 수 있어요. `invalidateLayout()`을 호출하면 Collection View가 모든 layout 정보를 다시 계산하고 적용해요. 반면 invalidation context를 사용하면 layout에서 어떤 부분이 달라졌는지 지정하고 필요한 데이터만 다시 계산할 수 있어요.

사용자 정의 invalidation context가 필요하면 `UICollectionViewLayoutInvalidationContext`의 하위 클래스를 만들어요. 독립적으로 다시 계산할 수 있는 layout 데이터에 대응하는 프로퍼티를 정의하고, 실행 중 무효화가 필요할 때 context 인스턴스에 변경 정보를 담아 `invalidateLayout(with:)`에 전달해요. 사용자 정의 Layout은 이 정보를 읽어 달라진 영역만 다시 계산할 수 있어요.

사용자 정의 invalidation context를 정의했다면 `invalidationContextClass`도 재정의해 그 class를 반환해야 해요. Collection View는 invalidation context가 필요할 때 여기에 지정된 class의 인스턴스를 만들어요. 사용자 정의 class를 반환해야 Layout 객체가 예상한 context 타입을 항상 받을 수 있어요.

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
