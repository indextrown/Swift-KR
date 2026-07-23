---
title: Collection Views 공식 문서 인벤토리
description: Apple Collection Views와 Layouts 하위 공식 문서·API 심볼을 영역별로 나열하고 각 항목을 설명하는 Swift-KR 문서 위치를 연결합니다.
---

# Collection Views 공식 문서 인벤토리

> **면접 답변 한 줄 요약:** Collection Views 공식 문서 인벤토리는 Apple의 현재 문서 계층과 Swift-KR 설명 위치를 연결해 View, Data, Cells, Layouts, Selection, Drag and Drop 범위의 누락을 확인하는 목록이에요.

이 페이지는 Apple의 [Collection views](https://developer.apple.com/documentation/uikit/collection-views)와 [Layouts](https://developer.apple.com/documentation/uikit/layouts)에서 직접 연결하는 문서와 API 심볼을 추적해요. Apple 원문을 그대로 옮기지 않고, 관련 개념을 입문자 흐름으로 묶은 Swift-KR 문서와 연결해요.

## 먼저 알아둘 인벤토리 용어

| 용어           | 쉬운 뜻                                                                                                               |
| -------------- | --------------------------------------------------------------------------------------------------------------------- |
| API Collection | 특정 주제와 관련된 문서·클래스·프로토콜·구조체를 Apple이 한곳에 모은 문서 페이지예요.                                 |
| API symbol     | 코드에서 사용하는 클래스, 구조체, 프로토콜, 열거형, type alias 같은 이름 있는 선언이에요.                             |
| Sample Code    | Apple이 실행 가능한 프로젝트와 함께 API 사용 흐름을 설명하는 문서예요.                                                |
| Article        | 특정 기능의 구성 순서와 동작을 설명하는 공식 글이에요.                                                                |
| 직접 하위 항목 | 기준 API Collection의 topic section에서 바로 연결하는 항목이에요. 각 심볼의 모든 프로퍼티 페이지까지 뜻하지는 않아요. |

조사 기준은 **2026년 7월 23일**이에요. Apple이 문서 계층을 바꾸면 이 목록도 다시 확인해야 해요.

## Collection Views — View

| Apple 공식 문서                                                                                            | 종류  | Swift-KR 설명                                   |
| ---------------------------------------------------------------------------------------------------------- | ----- | ----------------------------------------------- |
| [`UICollectionView`](https://developer.apple.com/documentation/uikit/uicollectionview)                     | Class | [한눈에 보기](./index) · [화면과 역할](./views) |
| [`UICollectionViewController`](https://developer.apple.com/documentation/uikit/uicollectionviewcontroller) | Class | [화면과 역할](./views)                          |

## Collection Views — Data

| Apple 공식 문서                                                                                                                                                | 종류        | Swift-KR 설명                                  |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------- | ---------------------------------------------- |
| [Updating collection views using diffable data sources](https://developer.apple.com/documentation/uikit/updating-collection-views-using-diffable-data-sources) | Sample Code | [데이터와 Diffable Data Source](./data)        |
| [Implementing modern collection views](https://developer.apple.com/documentation/uikit/implementing-modern-collection-views)                                   | Sample Code | [한눈에 보기](./index) · [레이아웃](./layouts) |
| [Building high-performance lists and collection views](https://developer.apple.com/documentation/uikit/building-high-performance-lists-and-collection-views)   | Sample Code | [데이터와 Diffable Data Source](./data)        |
| [`UICollectionViewDiffableDataSource`](https://developer.apple.com/documentation/uikit/uicollectionviewdiffabledatasource-9tqpa)                               | Class       | [데이터와 Diffable Data Source](./data)        |
| [`UICollectionViewDataSource`](https://developer.apple.com/documentation/uikit/uicollectionviewdatasource)                                                     | Protocol    | [데이터와 Diffable Data Source](./data)        |
| [`UICollectionViewDataSourcePrefetching`](https://developer.apple.com/documentation/uikit/uicollectionviewdatasourceprefetching)                               | Protocol    | [데이터와 Diffable Data Source](./data)        |
| [`NSDiffableDataSourceSnapshot`](https://developer.apple.com/documentation/uikit/nsdiffabledatasourcesnapshot-swift.struct)                                    | Structure   | [데이터와 Diffable Data Source](./data)        |
| [`NSDiffableDataSourceSectionSnapshot`](https://developer.apple.com/documentation/uikit/nsdiffabledatasourcesectionsnapshot-swift.struct)                      | Structure   | [데이터와 Diffable Data Source](./data)        |
| [`UIRefreshControl`](https://developer.apple.com/documentation/uikit/uirefreshcontrol)                                                                         | Class       | [데이터와 Diffable Data Source](./data)        |

## Collection Views — Cells

| Apple 공식 문서                                                                                        | 종류  | Swift-KR 설명                                |
| ------------------------------------------------------------------------------------------------------ | ----- | -------------------------------------------- |
| [`UICollectionViewCell`](https://developer.apple.com/documentation/uikit/uicollectionviewcell)         | Class | [셀과 재사용 뷰](./cells-and-reusable-views) |
| [`UICollectionViewListCell`](https://developer.apple.com/documentation/uikit/uicollectionviewlistcell) | Class | [셀과 재사용 뷰](./cells-and-reusable-views) |
| [`UICollectionReusableView`](https://developer.apple.com/documentation/uikit/uicollectionreusableview) | Class | [셀과 재사용 뷰](./cells-and-reusable-views) |

## Collection Views — Layouts

| Apple 공식 문서                                                                                                              | 종류           | Swift-KR 설명                              |
| ---------------------------------------------------------------------------------------------------------------------------- | -------------- | ------------------------------------------ |
| [Implementing modern collection views](https://developer.apple.com/documentation/uikit/implementing-modern-collection-views) | Sample Code    | [레이아웃](./layouts)                      |
| [Layouts](https://developer.apple.com/documentation/uikit/layouts)                                                           | API Collection | [레이아웃](./layouts) · 아래 세부 인벤토리 |

## Collection Views — Selection management

| Apple 공식 문서                                                                                                                                                        | 종류        | Swift-KR 설명            |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------- | ------------------------ |
| [Changing the appearance of selected and highlighted cells](https://developer.apple.com/documentation/uikit/changing-the-appearance-of-selected-and-highlighted-cells) | Sample Code | [선택 상태](./selection) |
| [Selecting multiple items with a two-finger pan gesture](https://developer.apple.com/documentation/uikit/selecting-multiple-items-with-a-two-finger-pan-gesture)       | Sample Code | [선택 상태](./selection) |

## Collection Views — Drag and drop

| Apple 공식 문서                                                                                                                              | 종류     | Swift-KR 설명                     |
| -------------------------------------------------------------------------------------------------------------------------------------------- | -------- | --------------------------------- |
| [Supporting Drag and Drop in Collection Views](https://developer.apple.com/documentation/uikit/supporting-drag-and-drop-in-collection-views) | Article  | [드래그 앤 드롭](./drag-and-drop) |
| [`UICollectionViewDragDelegate`](https://developer.apple.com/documentation/uikit/uicollectionviewdragdelegate)                               | Protocol | [드래그 앤 드롭](./drag-and-drop) |
| [`UICollectionViewDropDelegate`](https://developer.apple.com/documentation/uikit/uicollectionviewdropdelegate)                               | Protocol | [드래그 앤 드롭](./drag-and-drop) |
| [`UICollectionViewDropCoordinator`](https://developer.apple.com/documentation/uikit/uicollectionviewdropcoordinator)                         | Protocol | [드래그 앤 드롭](./drag-and-drop) |
| [`UICollectionViewDropPlaceholder`](https://developer.apple.com/documentation/uikit/uicollectionviewdropplaceholder)                         | Class    | [드래그 앤 드롭](./drag-and-drop) |
| [`UICollectionViewDropProposal`](https://developer.apple.com/documentation/uikit/uicollectionviewdropproposal)                               | Class    | [드래그 앤 드롭](./drag-and-drop) |
| [`UICollectionViewDropItem`](https://developer.apple.com/documentation/uikit/uicollectionviewdropitem)                                       | Protocol | [드래그 앤 드롭](./drag-and-drop) |
| [`UICollectionViewDropPlaceholderContext`](https://developer.apple.com/documentation/uikit/uicollectionviewdropplaceholdercontext)           | Protocol | [드래그 앤 드롭](./drag-and-drop) |
| [`UIDataSourceTranslating`](https://developer.apple.com/documentation/uikit/uidatasourcetranslating)                                         | Protocol | [드래그 앤 드롭](./drag-and-drop) |
| [`UICollectionViewPlaceholder`](https://developer.apple.com/documentation/uikit/uicollectionviewplaceholder)                                 | Class    | [드래그 앤 드롭](./drag-and-drop) |

## Layouts — Essentials

| Apple 공식 문서                                                                                                              | 종류        | Swift-KR 설명         |
| ---------------------------------------------------------------------------------------------------------------------------- | ----------- | --------------------- |
| [Implementing modern collection views](https://developer.apple.com/documentation/uikit/implementing-modern-collection-views) | Sample Code | [레이아웃](./layouts) |
| [`UICollectionViewCompositionalLayout`](https://developer.apple.com/documentation/uikit/uicollectionviewcompositionallayout) | Class       | [레이아웃](./layouts) |

## Layouts — Components

| Apple 공식 문서                                                                                          | 종류  | Swift-KR 설명         |
| -------------------------------------------------------------------------------------------------------- | ----- | --------------------- |
| [`NSCollectionLayoutItem`](https://developer.apple.com/documentation/uikit/nscollectionlayoutitem)       | Class | [레이아웃](./layouts) |
| [`NSCollectionLayoutGroup`](https://developer.apple.com/documentation/uikit/nscollectionlayoutgroup)     | Class | [레이아웃](./layouts) |
| [`NSCollectionLayoutSection`](https://developer.apple.com/documentation/uikit/nscollectionlayoutsection) | Class | [레이아웃](./layouts) |

## Layouts — Size and spacing

| Apple 공식 문서                                                                                                  | 종류     | Swift-KR 설명         |
| ---------------------------------------------------------------------------------------------------------------- | -------- | --------------------- |
| [`NSCollectionLayoutDimension`](https://developer.apple.com/documentation/uikit/nscollectionlayoutdimension)     | Class    | [레이아웃](./layouts) |
| [`NSCollectionLayoutSize`](https://developer.apple.com/documentation/uikit/nscollectionlayoutsize)               | Class    | [레이아웃](./layouts) |
| [`NSCollectionLayoutSpacing`](https://developer.apple.com/documentation/uikit/nscollectionlayoutspacing)         | Class    | [레이아웃](./layouts) |
| [`NSCollectionLayoutEdgeSpacing`](https://developer.apple.com/documentation/uikit/nscollectionlayoutedgespacing) | Class    | [레이아웃](./layouts) |
| [`NSCollectionLayoutContainer`](https://developer.apple.com/documentation/uikit/nscollectionlayoutcontainer)     | Protocol | [레이아웃](./layouts) |

## Layouts — Configuration

| Apple 공식 문서                                                                                                                                            | 종류       | Swift-KR 설명         |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- | --------------------- |
| [`UICollectionViewCompositionalLayoutConfiguration`](https://developer.apple.com/documentation/uikit/uicollectionviewcompositionallayoutconfiguration)     | Class      | [레이아웃](./layouts) |
| [`UICollectionViewCompositionalLayoutSectionProvider`](https://developer.apple.com/documentation/uikit/uicollectionviewcompositionallayoutsectionprovider) | Type Alias | [레이아웃](./layouts) |
| [`NSCollectionLayoutEnvironment`](https://developer.apple.com/documentation/uikit/nscollectionlayoutenvironment)                                           | Protocol   | [레이아웃](./layouts) |

## Layouts — Interaction

| Apple 공식 문서                                                                                                                                                | 종류        | Swift-KR 설명         |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------- | --------------------- |
| [`UICollectionLayoutSectionOrthogonalScrollingBehavior`](https://developer.apple.com/documentation/uikit/uicollectionlayoutsectionorthogonalscrollingbehavior) | Enumeration | [레이아웃](./layouts) |

## Layouts — Appearance

| Apple 공식 문서                                                                                                                              | 종류  | Swift-KR 설명         |
| -------------------------------------------------------------------------------------------------------------------------------------------- | ----- | --------------------- |
| [`NSCollectionLayoutAnchor`](https://developer.apple.com/documentation/uikit/nscollectionlayoutanchor)                                       | Class | [레이아웃](./layouts) |
| [`NSCollectionLayoutSupplementaryItem`](https://developer.apple.com/documentation/uikit/nscollectionlayoutsupplementaryitem)                 | Class | [레이아웃](./layouts) |
| [`NSCollectionLayoutBoundarySupplementaryItem`](https://developer.apple.com/documentation/uikit/nscollectionlayoutboundarysupplementaryitem) | Class | [레이아웃](./layouts) |
| [`NSCollectionLayoutDecorationItem`](https://developer.apple.com/documentation/uikit/nscollectionlayoutdecorationitem)                       | Class | [레이아웃](./layouts) |

## Layouts — Advanced layouts

| Apple 공식 문서                                                                                                                          | 종류       | Swift-KR 설명         |
| ---------------------------------------------------------------------------------------------------------------------------------------- | ---------- | --------------------- |
| [`NSCollectionLayoutGroupCustomItem`](https://developer.apple.com/documentation/uikit/nscollectionlayoutgroupcustomitem)                 | Class      | [레이아웃](./layouts) |
| [`NSCollectionLayoutGroupCustomItemProvider`](https://developer.apple.com/documentation/uikit/nscollectionlayoutgroupcustomitemprovider) | Type Alias | [레이아웃](./layouts) |

## Layouts — Layout updates

| Apple 공식 문서                                                                                                                                                        | 종류       | Swift-KR 설명         |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- | --------------------- |
| [`NSCollectionLayoutVisibleItem`](https://developer.apple.com/documentation/uikit/nscollectionlayoutvisibleitem)                                                       | Protocol   | [레이아웃](./layouts) |
| [`NSCollectionLayoutSectionVisibleItemsInvalidationHandler`](https://developer.apple.com/documentation/uikit/nscollectionlayoutsectionvisibleitemsinvalidationhandler) | Type Alias | [레이아웃](./layouts) |
| [`UICollectionViewUpdateItem`](https://developer.apple.com/documentation/uikit/uicollectionviewupdateitem)                                                             | Class      | [레이아웃](./layouts) |
| [`UICollectionViewFocusUpdateContext`](https://developer.apple.com/documentation/uikit/uicollectionviewfocusupdatecontext)                                             | Class      | [레이아웃](./layouts) |
| [`UICollectionViewLayoutInvalidationContext`](https://developer.apple.com/documentation/uikit/uicollectionviewlayoutinvalidationcontext)                               | Class      | [레이아웃](./layouts) |

## Layouts — Manual layouts

| Apple 공식 문서                                                                                                                                  | 종류        | Swift-KR 설명         |
| ------------------------------------------------------------------------------------------------------------------------------------------------ | ----------- | --------------------- |
| [Customizing collection view layouts](https://developer.apple.com/documentation/uikit/customizing-collection-view-layouts)                       | Sample Code | [레이아웃](./layouts) |
| [`UICollectionViewLayout`](https://developer.apple.com/documentation/uikit/uicollectionviewlayout)                                               | Class       | [레이아웃](./layouts) |
| [`UICollectionViewFlowLayout`](https://developer.apple.com/documentation/uikit/uicollectionviewflowlayout)                                       | Class       | [레이아웃](./layouts) |
| [`UICollectionViewTransitionLayout`](https://developer.apple.com/documentation/uikit/uicollectionviewtransitionlayout)                           | Class       | [레이아웃](./layouts) |
| [`UICollectionViewLayoutAttributes`](https://developer.apple.com/documentation/uikit/uicollectionviewlayoutattributes)                           | Class       | [레이아웃](./layouts) |
| [`UICollectionViewFlowLayoutInvalidationContext`](https://developer.apple.com/documentation/uikit/uicollectionviewflowlayoutinvalidationcontext) | Class       | [레이아웃](./layouts) |

## Layouts — Data

| Apple 공식 문서                                                                                                             | 종류      | Swift-KR 설명                           |
| --------------------------------------------------------------------------------------------------------------------------- | --------- | --------------------------------------- |
| [`NSDiffableDataSourceSnapshot`](https://developer.apple.com/documentation/uikit/nsdiffabledatasourcesnapshot-swift.struct) | Structure | [데이터와 Diffable Data Source](./data) |

## 인벤토리를 갱신하는 방법

Apple 문서가 바뀌었는지 확인할 때 다음 순서로 점검해요.

1. Collection Views API Collection의 topic section 이름과 직접 링크를 확인해요.
2. Layouts API Collection의 topic section과 직접 링크를 확인해요.
3. 새 문서·심볼이 있으면 이 인벤토리의 알맞은 영역에 추가해요.
4. 기존 학습 문서에서 개념과 사용 기준을 설명하는지 확인해요.
5. 설명이 너무 커지면 새 학습 문서로 분리하고 `_meta.json`에 연결해요.
6. deprecated 또는 새 API의 배포 가능 버전을 Apple 원문에서 다시 확인해요.

이 목록은 API의 모든 프로퍼티와 메서드를 한국어로 복제하는 레퍼런스가 아니에요. 직접 하위 항목의 목적, 핵심 관계, 적용 기준을 Swift-KR 학습 문서에서 이해할 수 있게 연결하는 것이 목표예요.

## 면접에서 이어질 수 있는 질문

### Collection Views 하위 API를 어떤 기준으로 나눌 수 있나요?

무엇을 표시할지는 data source, 어떤 뷰로 표현할지는 cell과 reusable view, 어디에 배치할지는 layout, 사용자의 입력은 selection과 drag/drop delegate가 담당한다고 나눌 수 있어요.

### API 문서의 모든 메서드를 외워야 하나요?

아니요. 먼저 객체의 책임과 데이터 흐름을 이해하고, 구체적인 initializer나 delegate 메서드는 요구사항이 생길 때 공식 문서에서 확인하는 편이 좋아요. 인벤토리는 어떤 API를 어디에서 찾아야 하는지 알려 주는 지도예요.

## 참고 자료

- [Collection views](https://developer.apple.com/documentation/uikit/collection-views)
- [Layouts](https://developer.apple.com/documentation/uikit/layouts)
