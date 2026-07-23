---
title: 'Collection Views 공식 문서 인벤토리'
description: 'Apple Collection Views와 Layouts의 직접 하위 문서·API 57개를 Swift-KR 페이지와 1:1로 연결하고 작성 범위를 확인합니다.'
---

# Collection Views 공식 문서 인벤토리

> **면접 답변 한 줄 요약:** 이 인벤토리는 Apple Collection Views와 Layouts의 공식 목차를 Swift-KR 문서와 1:1로 연결해 빠진 문서와 API를 확인하는 기준표예요.

조사 기준은 **2026년 7월 23일**이에요. Apple DocC의 `Collection views`와 `Layouts` topic section을 기준으로 직접 하위 항목을 추출했어요.

| 범위                       | 항목 수 | Swift-KR 구성                         |
| -------------------------- | ------: | ------------------------------------- |
| Collection Views 직접 항목 |    28개 | 공식 section 순서대로 사이드바에 표시 |
| Layouts 직접 항목          |    32개 | Layouts 하위 section 순서대로 표시    |
| 중복 제외 문서·심볼        |    57개 | 각 항목에 독립 한국어 페이지 제공     |

심볼 페이지는 Apple의 topic section과 직접 멤버를 같은 순서로 나열하고, 한국어 역할 설명과 Swift 예제, 주의점을 함께 제공해요. Apple 설명을 문장 단위로 복제하지 않지만, 원문에 실질적인 본문이 있는 문서는 개념 흐름·예제 수·주의/참고 callout·이미지를 줄이지 않고 한국어 학습 자료로 다시 작성해요. 생성자나 속성 정의가 중심인 짧은 심볼 문서는 표로 정리해요.

## 본문 충실도 기준

| Apple 원문 형태                     | Swift-KR 반영 기준                                                                   |
| ----------------------------------- | ------------------------------------------------------------------------------------ |
| 설명과 예제가 풍부한 article/sample | 공식 heading 흐름, 예제 주제와 코드 블록 수, note/important, 본문 이미지를 보존해요. |
| 설명이 긴 핵심 symbol               | Overview의 동작·제약·권장 흐름을 한국어 본문으로 보강하고 topic table을 유지해요.    |
| 생성자·속성 중심의 짧은 symbol      | 선언, 최소 예제, 공식 topic 순서의 API 표와 주의점으로 간결하게 정리해요.            |
| Swift-KR 자체 예제                  | 공식 내용을 대체하지 않고 **Swift-KR 보충**으로 공식 흐름 뒤에 추가해요.             |

`npm run docs:check-collection-views`는 공식 직접 하위 항목과 이미지뿐 아니라 내용이 풍부한 샘플 문서의 heading·code listing·aside 수가 줄지 않았는지도 검사해요.

## Collection Views — View

| Swift-KR 문서                                                | Apple 공식 문서                                                                          |
| ------------------------------------------------------------ | ---------------------------------------------------------------------------------------- |
| [`UICollectionView`](./uicollectionview)                     | [Apple 원문](https://developer.apple.com/documentation/uikit/uicollectionview)           |
| [`UICollectionViewController`](./uicollectionviewcontroller) | [Apple 원문](https://developer.apple.com/documentation/uikit/uicollectionviewcontroller) |

## Collection Views — Data

| Swift-KR 문서                                                                                                      | Apple 공식 문서                                                                                                     |
| ------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------- |
| [`Updating collection views using diffable data sources`](./updating-collection-views-using-diffable-data-sources) | [Apple 원문](https://developer.apple.com/documentation/uikit/updating-collection-views-using-diffable-data-sources) |
| [`Implementing modern collection views`](./implementing-modern-collection-views)                                   | [Apple 원문](https://developer.apple.com/documentation/uikit/implementing-modern-collection-views)                  |
| [`Building high-performance lists and collection views`](./building-high-performance-lists-and-collection-views)   | [Apple 원문](https://developer.apple.com/documentation/uikit/building-high-performance-lists-and-collection-views)  |
| [`UICollectionViewDiffableDataSource`](./uicollectionviewdiffabledatasource)                                       | [Apple 원문](https://developer.apple.com/documentation/uikit/uicollectionviewdiffabledatasource-9tqpa)              |
| [`UICollectionViewDataSource`](./uicollectionviewdatasource)                                                       | [Apple 원문](https://developer.apple.com/documentation/uikit/uicollectionviewdatasource)                            |
| [`UICollectionViewDataSourcePrefetching`](./uicollectionviewdatasourceprefetching)                                 | [Apple 원문](https://developer.apple.com/documentation/uikit/uicollectionviewdatasourceprefetching)                 |
| [`NSDiffableDataSourceSnapshot`](./nsdiffabledatasourcesnapshot)                                                   | [Apple 원문](https://developer.apple.com/documentation/uikit/nsdiffabledatasourcesnapshot-swift.struct)             |
| [`NSDiffableDataSourceSectionSnapshot`](./nsdiffabledatasourcesectionsnapshot)                                     | [Apple 원문](https://developer.apple.com/documentation/uikit/nsdiffabledatasourcesectionsnapshot-swift.struct)      |
| [`UIRefreshControl`](./uirefreshcontrol)                                                                           | [Apple 원문](https://developer.apple.com/documentation/uikit/uirefreshcontrol)                                      |

## Collection Views — Cells

| Swift-KR 문서                                            | Apple 공식 문서                                                                        |
| -------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| [`UICollectionViewCell`](./uicollectionviewcell)         | [Apple 원문](https://developer.apple.com/documentation/uikit/uicollectionviewcell)     |
| [`UICollectionViewListCell`](./uicollectionviewlistcell) | [Apple 원문](https://developer.apple.com/documentation/uikit/uicollectionviewlistcell) |
| [`UICollectionReusableView`](./uicollectionreusableview) | [Apple 원문](https://developer.apple.com/documentation/uikit/uicollectionreusableview) |

## Collection Views — Layouts

| Swift-KR 문서                                                                    | Apple 공식 문서                                                                                    |
| -------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| [`Implementing modern collection views`](./implementing-modern-collection-views) | [Apple 원문](https://developer.apple.com/documentation/uikit/implementing-modern-collection-views) |
| [`Layouts`](./layouts/index)                                                     | [Apple 원문](https://developer.apple.com/documentation/uikit/layouts)                              |

## Collection Views — Selection management

| Swift-KR 문서                                                                                                              | Apple 공식 문서                                                                                                         |
| -------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| [`Changing the appearance of selected and highlighted cells`](./changing-the-appearance-of-selected-and-highlighted-cells) | [Apple 원문](https://developer.apple.com/documentation/uikit/changing-the-appearance-of-selected-and-highlighted-cells) |
| [`Selecting multiple items with a two-finger pan gesture`](./selecting-multiple-items-with-a-two-finger-pan-gesture)       | [Apple 원문](https://developer.apple.com/documentation/uikit/selecting-multiple-items-with-a-two-finger-pan-gesture)    |

## Collection Views — Drag and drop

| Swift-KR 문서                                                                                    | Apple 공식 문서                                                                                            |
| ------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------- |
| [`Supporting Drag and Drop in Collection Views`](./supporting-drag-and-drop-in-collection-views) | [Apple 원문](https://developer.apple.com/documentation/uikit/supporting-drag-and-drop-in-collection-views) |
| [`UICollectionViewDragDelegate`](./uicollectionviewdragdelegate)                                 | [Apple 원문](https://developer.apple.com/documentation/uikit/uicollectionviewdragdelegate)                 |
| [`UICollectionViewDropDelegate`](./uicollectionviewdropdelegate)                                 | [Apple 원문](https://developer.apple.com/documentation/uikit/uicollectionviewdropdelegate)                 |
| [`UICollectionViewDropCoordinator`](./uicollectionviewdropcoordinator)                           | [Apple 원문](https://developer.apple.com/documentation/uikit/uicollectionviewdropcoordinator)              |
| [`UICollectionViewDropPlaceholder`](./uicollectionviewdropplaceholder)                           | [Apple 원문](https://developer.apple.com/documentation/uikit/uicollectionviewdropplaceholder)              |
| [`UICollectionViewDropProposal`](./uicollectionviewdropproposal)                                 | [Apple 원문](https://developer.apple.com/documentation/uikit/uicollectionviewdropproposal)                 |
| [`UICollectionViewDropItem`](./uicollectionviewdropitem)                                         | [Apple 원문](https://developer.apple.com/documentation/uikit/uicollectionviewdropitem)                     |
| [`UICollectionViewDropPlaceholderContext`](./uicollectionviewdropplaceholdercontext)             | [Apple 원문](https://developer.apple.com/documentation/uikit/uicollectionviewdropplaceholdercontext)       |
| [`UIDataSourceTranslating`](./uidatasourcetranslating)                                           | [Apple 원문](https://developer.apple.com/documentation/uikit/uidatasourcetranslating)                      |
| [`UICollectionViewPlaceholder`](./uicollectionviewplaceholder)                                   | [Apple 원문](https://developer.apple.com/documentation/uikit/uicollectionviewplaceholder)                  |

## Layouts — Essentials

| Swift-KR 문서                                                                          | Apple 공식 문서                                                                                    |
| -------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| [`Implementing modern collection views`](./implementing-modern-collection-views)       | [Apple 원문](https://developer.apple.com/documentation/uikit/implementing-modern-collection-views) |
| [`UICollectionViewCompositionalLayout`](./layouts/uicollectionviewcompositionallayout) | [Apple 원문](https://developer.apple.com/documentation/uikit/uicollectionviewcompositionallayout)  |

## Layouts — Components

| Swift-KR 문서                                                      | Apple 공식 문서                                                                         |
| ------------------------------------------------------------------ | --------------------------------------------------------------------------------------- |
| [`NSCollectionLayoutItem`](./layouts/nscollectionlayoutitem)       | [Apple 원문](https://developer.apple.com/documentation/uikit/nscollectionlayoutitem)    |
| [`NSCollectionLayoutGroup`](./layouts/nscollectionlayoutgroup)     | [Apple 원문](https://developer.apple.com/documentation/uikit/nscollectionlayoutgroup)   |
| [`NSCollectionLayoutSection`](./layouts/nscollectionlayoutsection) | [Apple 원문](https://developer.apple.com/documentation/uikit/nscollectionlayoutsection) |

## Layouts — Size and spacing

| Swift-KR 문서                                                              | Apple 공식 문서                                                                             |
| -------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| [`NSCollectionLayoutDimension`](./layouts/nscollectionlayoutdimension)     | [Apple 원문](https://developer.apple.com/documentation/uikit/nscollectionlayoutdimension)   |
| [`NSCollectionLayoutSize`](./layouts/nscollectionlayoutsize)               | [Apple 원문](https://developer.apple.com/documentation/uikit/nscollectionlayoutsize)        |
| [`NSCollectionLayoutSpacing`](./layouts/nscollectionlayoutspacing)         | [Apple 원문](https://developer.apple.com/documentation/uikit/nscollectionlayoutspacing)     |
| [`NSCollectionLayoutEdgeSpacing`](./layouts/nscollectionlayoutedgespacing) | [Apple 원문](https://developer.apple.com/documentation/uikit/nscollectionlayoutedgespacing) |
| [`NSCollectionLayoutContainer`](./layouts/nscollectionlayoutcontainer)     | [Apple 원문](https://developer.apple.com/documentation/uikit/nscollectionlayoutcontainer)   |

## Layouts — Configuration

| Swift-KR 문서                                                                                                        | Apple 공식 문서                                                                                                  |
| -------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| [`UICollectionViewCompositionalLayoutConfiguration`](./layouts/uicollectionviewcompositionallayoutconfiguration)     | [Apple 원문](https://developer.apple.com/documentation/uikit/uicollectionviewcompositionallayoutconfiguration)   |
| [`UICollectionViewCompositionalLayoutSectionProvider`](./layouts/uicollectionviewcompositionallayoutsectionprovider) | [Apple 원문](https://developer.apple.com/documentation/uikit/uicollectionviewcompositionallayoutsectionprovider) |
| [`NSCollectionLayoutEnvironment`](./layouts/nscollectionlayoutenvironment)                                           | [Apple 원문](https://developer.apple.com/documentation/uikit/nscollectionlayoutenvironment)                      |

## Layouts — Interaction

| Swift-KR 문서                                                                                                            | Apple 공식 문서                                                                                                    |
| ------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------ |
| [`UICollectionLayoutSectionOrthogonalScrollingBehavior`](./layouts/uicollectionlayoutsectionorthogonalscrollingbehavior) | [Apple 원문](https://developer.apple.com/documentation/uikit/uicollectionlayoutsectionorthogonalscrollingbehavior) |

## Layouts — Appearance

| Swift-KR 문서                                                                                          | Apple 공식 문서                                                                                           |
| ------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------- |
| [`NSCollectionLayoutAnchor`](./layouts/nscollectionlayoutanchor)                                       | [Apple 원문](https://developer.apple.com/documentation/uikit/nscollectionlayoutanchor)                    |
| [`NSCollectionLayoutSupplementaryItem`](./layouts/nscollectionlayoutsupplementaryitem)                 | [Apple 원문](https://developer.apple.com/documentation/uikit/nscollectionlayoutsupplementaryitem)         |
| [`NSCollectionLayoutBoundarySupplementaryItem`](./layouts/nscollectionlayoutboundarysupplementaryitem) | [Apple 원문](https://developer.apple.com/documentation/uikit/nscollectionlayoutboundarysupplementaryitem) |
| [`NSCollectionLayoutDecorationItem`](./layouts/nscollectionlayoutdecorationitem)                       | [Apple 원문](https://developer.apple.com/documentation/uikit/nscollectionlayoutdecorationitem)            |

## Layouts — Advanced layouts

| Swift-KR 문서                                                                                      | Apple 공식 문서                                                                                         |
| -------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| [`NSCollectionLayoutGroupCustomItem`](./layouts/nscollectionlayoutgroupcustomitem)                 | [Apple 원문](https://developer.apple.com/documentation/uikit/nscollectionlayoutgroupcustomitem)         |
| [`NSCollectionLayoutGroupCustomItemProvider`](./layouts/nscollectionlayoutgroupcustomitemprovider) | [Apple 원문](https://developer.apple.com/documentation/uikit/nscollectionlayoutgroupcustomitemprovider) |

## Layouts — Layout updates

| Swift-KR 문서                                                                                                                    | Apple 공식 문서                                                                                                        |
| -------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| [`NSCollectionLayoutVisibleItem`](./layouts/nscollectionlayoutvisibleitem)                                                       | [Apple 원문](https://developer.apple.com/documentation/uikit/nscollectionlayoutvisibleitem)                            |
| [`NSCollectionLayoutSectionVisibleItemsInvalidationHandler`](./layouts/nscollectionlayoutsectionvisibleitemsinvalidationhandler) | [Apple 원문](https://developer.apple.com/documentation/uikit/nscollectionlayoutsectionvisibleitemsinvalidationhandler) |
| [`UICollectionViewUpdateItem`](./layouts/uicollectionviewupdateitem)                                                             | [Apple 원문](https://developer.apple.com/documentation/uikit/uicollectionviewupdateitem)                               |
| [`UICollectionViewFocusUpdateContext`](./layouts/uicollectionviewfocusupdatecontext)                                             | [Apple 원문](https://developer.apple.com/documentation/uikit/uicollectionviewfocusupdatecontext)                       |
| [`UICollectionViewLayoutInvalidationContext`](./layouts/uicollectionviewlayoutinvalidationcontext)                               | [Apple 원문](https://developer.apple.com/documentation/uikit/uicollectionviewlayoutinvalidationcontext)                |

## Layouts — Manual layouts

| Swift-KR 문서                                                                                              | Apple 공식 문서                                                                                             |
| ---------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| [`Customizing collection view layouts`](./layouts/customizing-collection-view-layouts)                     | [Apple 원문](https://developer.apple.com/documentation/uikit/customizing-collection-view-layouts)           |
| [`UICollectionViewLayout`](./layouts/uicollectionviewlayout)                                               | [Apple 원문](https://developer.apple.com/documentation/uikit/uicollectionviewlayout)                        |
| [`UICollectionViewFlowLayout`](./layouts/uicollectionviewflowlayout)                                       | [Apple 원문](https://developer.apple.com/documentation/uikit/uicollectionviewflowlayout)                    |
| [`UICollectionViewTransitionLayout`](./layouts/uicollectionviewtransitionlayout)                           | [Apple 원문](https://developer.apple.com/documentation/uikit/uicollectionviewtransitionlayout)              |
| [`UICollectionViewLayoutAttributes`](./layouts/uicollectionviewlayoutattributes)                           | [Apple 원문](https://developer.apple.com/documentation/uikit/uicollectionviewlayoutattributes)              |
| [`UICollectionViewFlowLayoutInvalidationContext`](./layouts/uicollectionviewflowlayoutinvalidationcontext) | [Apple 원문](https://developer.apple.com/documentation/uikit/uicollectionviewflowlayoutinvalidationcontext) |

## Layouts — Data

| Swift-KR 문서                                                    | Apple 공식 문서                                                                                         |
| ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| [`NSDiffableDataSourceSnapshot`](./nsdiffabledatasourcesnapshot) | [Apple 원문](https://developer.apple.com/documentation/uikit/nsdiffabledatasourcesnapshot-swift.struct) |

## 범위를 갱신하는 방법

1. Apple DocC JSON에서 두 API Collection의 topic section을 다시 가져와요.
2. `npm run docs:check-collection-views`로 공식 URL과 로컬 페이지, 멤버 목차를 대조해요.
3. 새 항목은 공식 section과 같은 위치에 문서를 추가해요.
4. deprecated·beta·새 플랫폼 지원 여부를 해당 심볼 페이지에 반영해요.
5. 문서의 예제는 현재 Swift와 UIKit 선언에 맞게 빌드 또는 공식 선언으로 검증해요.

## 참고 자료

- [Apple Developer Documentation — Collection views](https://developer.apple.com/documentation/uikit/collection-views)
- [Apple Developer Documentation — Layouts](https://developer.apple.com/documentation/uikit/layouts)
