---
title: 'Collection View Layouts'
description: 'Collection View Layout API는 item, group, section을 조합해 크기와 간격을 선언하거나 직접 레이아웃 속성을 계산해 화면 배치를 결정해요. 주요 API, 사용 예제, 주의점을 함께 정리합니다.'
---

# Collection View Layouts

> **면접 답변 한 줄 요약:** Collection View Layout API는 item, group, section을 조합해 크기와 간격을 선언하거나 직접 레이아웃 속성을 계산해 화면 배치를 결정해요.

이 페이지부터 Apple의 [Layouts](https://developer.apple.com/documentation/uikit/layouts) 목차와 같은 순서로 레이아웃 API를 찾아볼 수 있어요. 먼저 [레이아웃 학습 가이드](../layout-guide)에서 item·group·section 조립 원리를 익히고, 아래에서 필요한 API의 전체 멤버를 확인해요.

<!-- Apple DocC image: media-3568662 -->

![서로 다른 배치와 가로 스크롤을 사용하는 두 section으로 구성된 App Store 스타일 Collection View](../assets/apple-docs/media-3568662@2x.png)

## 먼저 알아둘 레이아웃 용어

| 용어                 | 쉬운 뜻                                                                                 |
| -------------------- | --------------------------------------------------------------------------------------- |
| Compositional Layout | item·group·section을 조립해 배치를 선언하는 레이아웃이에요.                             |
| Flow Layout          | item을 줄 단위로 차례대로 배치하는 전통적인 격자 레이아웃이에요.                        |
| Custom Layout        | `UICollectionViewLayout`을 상속해 위치 계산을 직접 구현하는 방식이에요.                 |
| Invalidation         | 기존 배치 결과가 더 이상 유효하지 않아 필요한 부분을 다시 계산하도록 알리는 과정이에요. |

## 핵심 API

| 문서·API                                                                          | 역할                                                                                                                                   |
| --------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| [`Implementing modern collection views`](../implementing-modern-collection-views) | 현대적인 Collection View 구성은 Compositional Layout으로 배치를 만들고 Diffable Data Source와 registration으로 데이터와 셀을 연결해요. |
| [`UICollectionViewCompositionalLayout`](./uicollectionviewcompositionallayout)    | UICollectionViewCompositionalLayout은 item·group·section 계층을 조합해 서로 다른 목록, 격자, 가로 스크롤 영역을 한 화면에 배치해요.    |

## 구성 요소

| 문서·API                                                   | 역할                                                                                                                               |
| ---------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| [`NSCollectionLayoutItem`](./nscollectionlayoutitem)       | NSCollectionLayoutItem은 Compositional Layout에서 셀 하나의 크기, content inset, edge spacing, 보조 item을 정의하는 최소 단위예요. |
| [`NSCollectionLayoutGroup`](./nscollectionlayoutgroup)     | NSCollectionLayoutGroup은 하나 이상의 item을 가로·세로 또는 사용자 정의 위치로 배치하고 section에서 반복할 묶음을 만들어요.        |
| [`NSCollectionLayoutSection`](./nscollectionlayoutsection) | NSCollectionLayoutSection은 group을 반복하는 한 section의 간격, inset, 헤더·푸터, 배경, 직교 스크롤 동작을 정의해요.               |

## 크기와 간격

| 문서·API                                                           | 역할                                                                                                                    |
| ------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------- |
| [`NSCollectionLayoutDimension`](./nscollectionlayoutdimension)     | NSCollectionLayoutDimension은 절대값, 부모 대비 비율, 예상값 중 하나로 item과 group의 너비 또는 높이를 표현해요.        |
| [`NSCollectionLayoutSize`](./nscollectionlayoutsize)               | NSCollectionLayoutSize는 두 개의 NSCollectionLayoutDimension을 묶어 레이아웃 요소의 너비와 높이를 정의해요.             |
| [`NSCollectionLayoutSpacing`](./nscollectionlayoutspacing)         | NSCollectionLayoutSpacing은 item이나 group 사이 간격을 고정값 또는 레이아웃이 조정할 수 있는 유연한 값으로 표현해요.    |
| [`NSCollectionLayoutEdgeSpacing`](./nscollectionlayoutedgespacing) | NSCollectionLayoutEdgeSpacing은 레이아웃 요소의 leading·top·trailing·bottom 바깥 간격을 각각 지정해요.                  |
| [`NSCollectionLayoutContainer`](./nscollectionlayoutcontainer)     | NSCollectionLayoutContainer는 레이아웃 계산 시 사용할 컨테이너의 전체·유효 크기와 inset 정보를 제공하는 프로토콜이에요. |

## 구성

| 문서·API                                                                                                     | 역할                                                                                                                                    |
| ------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------- |
| [`UICollectionViewCompositionalLayoutConfiguration`](./uicollectionviewcompositionallayoutconfiguration)     | UICollectionViewCompositionalLayoutConfiguration은 전체 Compositional Layout의 스크롤 방향, section 간격, 전역 헤더·푸터를 설정해요.    |
| [`UICollectionViewCompositionalLayoutSectionProvider`](./uicollectionviewcompositionallayoutsectionprovider) | UICollectionViewCompositionalLayoutSectionProvider는 section 번호와 환경을 받아 해당 section의 레이아웃을 동적으로 반환하는 클로저예요. |
| [`NSCollectionLayoutEnvironment`](./nscollectionlayoutenvironment)                                           | NSCollectionLayoutEnvironment는 section을 만들 때 컨테이너 크기와 size class, 화면 배율 같은 trait 정보를 제공해요.                     |

## 상호작용

| 문서·API                                                                                                         | 역할                                                                                                                                           |
| ---------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| [`UICollectionLayoutSectionOrthogonalScrollingBehavior`](./uicollectionlayoutsectionorthogonalscrollingbehavior) | UICollectionLayoutSectionOrthogonalScrollingBehavior는 section이 전체 스크롤 축과 직각 방향으로 움직일 때 연속·페이징·그룹 맞춤 방식을 정해요. |

## 모양

| 문서·API                                                                                       | 역할                                                                                                                      |
| ---------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| [`NSCollectionLayoutAnchor`](./nscollectionlayoutanchor)                                       | NSCollectionLayoutAnchor는 badge 같은 보조 item을 컨테이너나 item의 어느 모서리에 어떤 offset으로 붙일지 정의해요.        |
| [`NSCollectionLayoutSupplementaryItem`](./nscollectionlayoutsupplementaryitem)                 | NSCollectionLayoutSupplementaryItem은 셀에 붙는 badge처럼 item 또는 container anchor를 기준으로 배치되는 보조 요소예요.   |
| [`NSCollectionLayoutBoundarySupplementaryItem`](./nscollectionlayoutboundarysupplementaryitem) | NSCollectionLayoutBoundarySupplementaryItem은 section이나 전체 레이아웃 경계에 헤더·푸터를 배치하고 고정 여부를 설정해요. |
| [`NSCollectionLayoutDecorationItem`](./nscollectionlayoutdecorationitem)                       | NSCollectionLayoutDecorationItem은 데이터 소스와 무관하게 레이아웃이 section 배경 같은 장식 뷰를 배치하도록 정의해요.     |

## 고급 레이아웃

| 문서·API                                                                                   | 역할                                                                                                                    |
| ------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------- |
| [`NSCollectionLayoutGroupCustomItem`](./nscollectionlayoutgroupcustomitem)                 | NSCollectionLayoutGroupCustomItem은 custom group 안에서 item 하나의 frame과 z-index를 직접 표현해요.                    |
| [`NSCollectionLayoutGroupCustomItemProvider`](./nscollectionlayoutgroupcustomitemprovider) | NSCollectionLayoutGroupCustomItemProvider는 group의 사용 가능한 크기를 받아 각 item의 frame 목록을 계산하는 클로저예요. |

## 레이아웃 업데이트

| 문서·API                                                                                                                 | 역할                                                                                                                                                  |
| ------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| [`NSCollectionLayoutVisibleItem`](./nscollectionlayoutvisibleitem)                                                       | NSCollectionLayoutVisibleItem은 곧 화면에 표시될 item의 frame, transform, alpha, z-index를 마지막 레이아웃 단계에서 조정하게 해요.                    |
| [`NSCollectionLayoutSectionVisibleItemsInvalidationHandler`](./nscollectionlayoutsectionvisibleitemsinvalidationhandler) | NSCollectionLayoutSectionVisibleItemsInvalidationHandler는 스크롤과 레이아웃 갱신 때 보이는 item과 offset, 환경을 받아 표시 속성을 바꾸는 클로저예요. |
| [`UICollectionViewUpdateItem`](./uicollectionviewupdateitem)                                                             | UICollectionViewUpdateItem은 batch update 중 발생한 삽입·삭제·이동·갱신 한 건의 전후 IndexPath와 동작 종류를 설명해요.                                |
| [`UICollectionViewFocusUpdateContext`](./uicollectionviewfocusupdatecontext)                                             | UICollectionViewFocusUpdateContext는 tvOS나 키보드 탐색에서 이전과 다음 포커스 item의 IndexPath를 제공해요.                                           |
| [`UICollectionViewLayoutInvalidationContext`](./uicollectionviewlayoutinvalidationcontext)                               | UICollectionViewLayoutInvalidationContext는 레이아웃 전체가 아니라 다시 계산해야 할 item, 보조 뷰, 장식 뷰와 크기 변화를 지정해요.                    |

## 직접 구성하는 레이아웃

| 문서·API                                                                                           | 역할                                                                                                                                                 |
| -------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| [`Customizing collection view layouts`](./customizing-collection-view-layouts)                     | 사용자 정의 Collection View Layout은 prepare()에서 계산을 준비하고 각 요소의 layout attributes와 전체 콘텐츠 크기를 반환해 자유로운 배치를 만들어요. |
| [`UICollectionViewLayout`](./uicollectionviewlayout)                                               | UICollectionViewLayout은 Collection View 요소의 위치와 크기를 계산하는 추상 기반 클래스이며 완전한 사용자 정의 배치의 출발점이에요.                  |
| [`UICollectionViewFlowLayout`](./uicollectionviewflowlayout)                                       | UICollectionViewFlowLayout은 item을 한 줄씩 채워 나가는 격자 배치와 section inset, 간격, 헤더·푸터, 고정 동작을 제공해요.                            |
| [`UICollectionViewTransitionLayout`](./uicollectionviewtransitionlayout)                           | UICollectionViewTransitionLayout은 두 Collection View Layout 사이 전환 진행률과 사용자 정의 애니메이션 값을 관리해요.                                |
| [`UICollectionViewLayoutAttributes`](./uicollectionviewlayoutattributes)                           | UICollectionViewLayoutAttributes는 특정 셀·보조 뷰·장식 뷰의 frame, transform, alpha, 표시 순서 같은 결과를 담아요.                                  |
| [`UICollectionViewFlowLayoutInvalidationContext`](./uicollectionviewflowlayoutinvalidationcontext) | UICollectionViewFlowLayoutInvalidationContext는 Flow Layout을 무효화할 때 delegate 크기 값과 배치 속성을 다시 계산할지 구분해요.                     |

## 데이터

| 문서·API                                                          | 역할                                                                                                                 |
| ----------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| [`NSDiffableDataSourceSnapshot`](../nsdiffabledatasourcesnapshot) | NSDiffableDataSourceSnapshot은 특정 시점에 존재하는 section과 item의 식별자 및 순서를 값으로 표현하는 목록 상태예요. |

## 어떤 레이아웃부터 선택해야 하나요

1. 일반 목록과 격자는 Compositional Layout 또는 list configuration부터 검토해요.
2. 단순한 줄 단위 격자를 유지하는 기존 화면은 Flow Layout도 충분해요.
3. item·group·section 조합으로 표현할 수 없는 배치에서만 Custom Layout을 구현해요.
4. 스크롤 효과는 visible item handler로 가능한지 먼저 확인하고 전체 사용자 정의 레이아웃은 마지막에 선택해요.

## 참고 자료

- [Apple Developer Documentation — Layouts](https://developer.apple.com/documentation/uikit/layouts)
- [Collection Views 한눈에 보기](../index)
