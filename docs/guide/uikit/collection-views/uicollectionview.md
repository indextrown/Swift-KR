---
title: 'UICollectionView'
description: 'UICollectionView는 section과 item으로 구성된 데이터를 재사용 가능한 셀에 표시하고, 별도의 레이아웃 객체로 위치를 계산하는 스크롤 뷰예요. 주요 API, 사용 예제, 주의점을 함께 정리합니다.'
---

# UICollectionView

> **면접 답변 한 줄 요약:** `UICollectionView`는 section과 item으로 구성된 데이터를 재사용 가능한 셀에 표시하고, 별도의 레이아웃 객체로 위치를 계산하는 스크롤 뷰예요.

Apple 공식 문서의 **Collection Views — View** 영역에 있는 클래스예요. 이 페이지는 공식 topic section 순서를 유지하면서 실제 코드에서 무엇을 선택해야 하는지 한국어로 설명해요.

## 먼저 알아둘 용어

| 용어            | 쉬운 뜻                                                 |
| --------------- | ------------------------------------------------------- |
| View Controller | 화면의 생명주기와 여러 뷰를 조정하는 객체예요.          |
| Layout          | 셀과 보조 뷰의 크기와 위치를 계산하는 객체예요.         |
| Data Source     | 표시할 item과 셀을 Collection View에 제공하는 객체예요. |

## 이 API가 맡는 역할

화면 객체는 데이터를 직접 소유하거나 배치 규칙을 모두 계산하기보다 data source와 layout에 역할을 나눠요. Collection View 자체는 스크롤, 재사용, 선택, 표시 중인 요소 조회처럼 화면 동작을 관리해요.

UICollectionView는 section과 item으로 구성된 데이터를 재사용 가능한 셀에 표시하고, 별도의 레이아웃 객체로 위치를 계산하는 스크롤 뷰예요.

<!-- Apple DocC image: uicollectionview-1 -->

![Flow Layout을 사용해 여러 셀을 격자로 배치한 Collection View](./assets/apple-docs/uicollectionview-1@2x.png)

## 선언과 지원 범위를 확인해요

```swift
@MainActor class UICollectionView
```

**지원 플랫폼:** iOS 6.0+ · iPadOS 6.0+ · Mac Catalyst 13.1+ · tvOS · visionOS 1.0+

## 가장 작은 사용 예제

아래 예제에서는 이 API가 속한 역할이 전체 Collection View 구성에서 어디에 놓이는지 확인해요. 핵심 호출에 집중할 수 있도록 모델 선언과 주변 화면 구성은 생략했어요.

```swift
import UIKit

@MainActor
final class PhotoGridViewController: UIViewController {
  private let collectionView = UICollectionView(
    frame: .zero,
    collectionViewLayout: UICollectionViewFlowLayout()
  )

  override func viewDidLoad() {
    super.viewDidLoad()
    collectionView.frame = view.bounds
    collectionView.autoresizingMask = [.flexibleWidth, .flexibleHeight]
    view.addSubview(collectionView)
  }
}
```

## 공식 API 목차대로 살펴봐요

### collection view 만들기 (Creating a collection view)

`UICollectionView`를 만들거나 필요한 구성 요소를 연결하는 API예요.

| API                                 | 하는 일                                                    |
| ----------------------------------- | ---------------------------------------------------------- |
| `init(frame:collectionViewLayout:)` | 레이아웃에 필요한 값을 받아 새 인스턴스를 만들어요.        |
| `init(coder:)`                      | Collection View에 필요한 값을 받아 새 인스턴스를 만들어요. |

### Collection View 데이터 제공하기 (Providing the collection view data)

표시할 section과 item, 셀을 제공할 데이터 소스를 연결해요. 기존 프로토콜 방식과 snapshot 기반 Diffable Data Source 중 화면 갱신 방식에 맞는 구현을 선택해요.

| API                                                    | 하는 일                                                                       |
| ------------------------------------------------------ | ----------------------------------------------------------------------------- |
| `dataSource`                                           | section·item 개수와 셀을 제공할 데이터 소스 객체예요.                         |
| `UICollectionViewDiffableDataSource`                   | 식별자 snapshot의 차이를 계산해 화면을 갱신하는 데이터 소스 구현체예요.       |
| `UICollectionViewDataSource`                           | section·item 개수와 셀 제공 규칙을 정의하는 기본 데이터 소스 프로토콜이에요.  |
| `Building high-performance lists and collection views` | prefetch와 이미지 준비로 목록 성능을 개선하는 Apple 샘플에 대응하는 문서예요. |

### 셀과 데이터를 미리 준비하기 (Prefetching collection view cells and data)

곧 화면에 나타날 가능성이 있는 item을 미리 알려 비동기 로딩을 시작하고, 필요 없어지면 취소할 수 있게 해요.

| API                                     | 하는 일                                                   |
| --------------------------------------- | --------------------------------------------------------- |
| `isPrefetchingEnabled`                  | Collection View가 셀·데이터 prefetch를 요청할지 결정해요. |
| `prefetchDataSource`                    | prefetch 시작과 취소 요청을 받을 객체예요.                |
| `UICollectionViewDataSourcePrefetching` | 데이터 준비와 취소 콜백을 정의하는 프로토콜이에요.        |

### collection view interactions 관리하기 (Managing collection view interactions)

동작과 표시 방식을 요구사항에 맞게 설정하는 API예요.

| API                        | 하는 일                                                    |
| -------------------------- | ---------------------------------------------------------- |
| `delegate`                 | Collection View 관련 판단과 이벤트 처리를 위임할 객체예요. |
| `UICollectionViewDelegate` | Collection View 관련 판단과 이벤트 처리를 위임할 객체예요. |

### cells 만들기 (Creating cells)

`UICollectionView`를 만들거나 필요한 구성 요소를 연결하는 API예요.

| API                                              | 하는 일                                                   |
| ------------------------------------------------ | --------------------------------------------------------- |
| `UICollectionView.CellRegistration`              | 셀 타입과 현재 item을 셀에 반영하는 구성 클로저를 묶어요. |
| `dequeueConfiguredReusableCell(using:for:item:)` | 등록·재사용 풀에서 item을 꺼내 구성해요.                  |
| `register(_:forCellWithReuseIdentifier:)`        | 재사용할 셀 클래스 또는 nib을 식별자와 연결해 등록해요.   |
| `register(_:forCellWithReuseIdentifier:)`        | 재사용할 셀 클래스 또는 nib을 식별자와 연결해 등록해요.   |
| `dequeueReusableCell(withReuseIdentifier:for:)`  | 지정한 IndexPath에서 사용할 재사용 셀을 반환해요.         |

### headers and footers 만들기 (Creating headers and footers)

`UICollectionView`를 만들거나 필요한 구성 요소를 연결하는 API예요.

| API                                                                 | 하는 일                                                    |
| ------------------------------------------------------------------- | ---------------------------------------------------------- |
| `UICollectionView.SupplementaryRegistration`                        | 보조 뷰 타입과 element kind, 구성 클로저를 묶어요.         |
| `dequeueConfiguredReusableSupplementary(using:for:)`                | registration으로 헤더·푸터 같은 보조 뷰를 구성해 반환해요. |
| `register(_:forSupplementaryViewOfKind:withReuseIdentifier:)`       | 재사용할 보조 뷰 타입이나 nib을 등록해요.                  |
| `register(_:forSupplementaryViewOfKind:withReuseIdentifier:)`       | 재사용할 보조 뷰 타입이나 nib을 등록해요.                  |
| `dequeueReusableSupplementaryView(ofKind:withReuseIdentifier:for:)` | 등록된 element kind와 식별자에 맞는 보조 뷰를 반환해요.    |

### background view 설정하기 (Configuring the background view)

동작과 표시 방식을 요구사항에 맞게 설정하는 API예요.

| API              | 하는 일                                                    |
| ---------------- | ---------------------------------------------------------- |
| `backgroundView` | item이 차지하지 않는 Collection View 배경에 표시할 뷰예요. |

### 레이아웃 변경하기 (Changing the layout)

현재 레이아웃을 조회하거나 다른 레이아웃으로 즉시·애니메이션·대화형 전환해요.

| API                                                      | 하는 일                                                       |
| -------------------------------------------------------- | ------------------------------------------------------------- |
| `collectionViewLayout`                                   | 현재 셀과 보조 뷰를 배치하는 레이아웃 객체예요.               |
| `setCollectionViewLayout(_:animated:)`                   | 레이아웃에 새 설정이나 상태를 적용해요.                       |
| `setCollectionViewLayout(_:animated:completion:)`        | 새 레이아웃을 적용하고 전환이 끝나면 completion을 호출해요.   |
| `startInteractiveTransition(to:completion:)`             | 제스처 진행률로 제어할 대화형 레이아웃 전환을 시작해요.       |
| `finishInteractiveTransition()`                          | 레이아웃을 완료해 최종 상태를 적용해요.                       |
| `cancelInteractiveTransition()`                          | 진행 중인 레이아웃을 취소하고 이전 상태로 돌아가요.           |
| `UICollectionView.LayoutInteractiveTransitionCompletion` | 대화형 전환이 끝난 뒤 결과와 완료 여부를 전달하는 클로저예요. |

### state of the collection view 확인하기 (Getting the state of the collection view)

현재 상태에서 필요한 값이나 위치를 안전하게 조회하는 API예요.

| API                         | 하는 일                                         |
| --------------------------- | ----------------------------------------------- |
| `numberOfSections`          | 현재 Collection View의 section 개수를 반환해요. |
| `numberOfItems(inSection:)` | 지정한 section의 item 개수를 반환해요.          |
| `visibleCells`              | 현재 화면에 보이는 셀 목록을 반환해요.          |

### Items 삽입·이동·삭제하기 (Inserting, moving, and deleting Items)

데이터 또는 화면 상태를 변경할 때 사용하는 API예요. 모델과 표시 상태의 순서를 함께 확인해요.

| API                | 하는 일                                    |
| ------------------ | ------------------------------------------ |
| `insertItems(at:)` | item을 지정한 위치의 앞이나 뒤에 삽입해요. |
| `moveItem(at:to:)` | 지정한 item의 순서를 옮겨요.               |
| `deleteItems(at:)` | 지정한 item을 제거해요.                    |

### sections 삽입·이동·삭제하기 (Inserting, moving, and deleting sections)

데이터 또는 화면 상태를 변경할 때 사용하는 API예요. 모델과 표시 상태의 순서를 함께 확인해요.

| API                         | 하는 일                                       |
| --------------------------- | --------------------------------------------- |
| `insertSections(_:)`        | section을 지정한 위치의 앞이나 뒤에 삽입해요. |
| `moveSection(_:toSection:)` | 지정한 section의 순서를 옮겨요.               |
| `deleteSections(_:)`        | 지정한 section을 제거해요.                    |

### items interactively 순서 바꾸기 (Reordering items interactively)

데이터 또는 화면 상태를 변경할 때 사용하는 API예요. 모델과 표시 상태의 순서를 함께 확인해요.

| API                                           | 하는 일                                             |
| --------------------------------------------- | --------------------------------------------------- |
| `beginInteractiveMovementForItem(at:)`        | 지정한 item의 대화형 이동을 시작해요.               |
| `updateInteractiveMovementTargetPosition(_:)` | 이동 중인 item이 따라갈 화면 좌표를 갱신해요.       |
| `endInteractiveMovement()`                    | 대화형 이동을 현재 목적 위치에서 완료해요.          |
| `cancelInteractiveMovement()`                 | 대화형 이동을 취소하고 item을 원래 위치로 되돌려요. |

### drag interactions 관리하기 (Managing drag interactions)

동작과 표시 방식을 요구사항에 맞게 설정하는 API예요.

| API                            | 하는 일                                                           |
| ------------------------------ | ----------------------------------------------------------------- |
| `dragDelegate`                 | 드래그 관련 판단과 이벤트 처리를 위임할 객체예요.                 |
| `UICollectionViewDragDelegate` | 드래그 관련 판단과 이벤트 처리를 위임할 객체예요.                 |
| `hasActiveDrag`                | 드래그의 활성화 여부나 현재 상태를 나타내요.                      |
| `dragInteractionEnabled`       | iPhone에서 Collection View의 드래그 상호작용을 활성화할지 정해요. |

### drop interactions 관리하기 (Managing drop interactions)

동작과 표시 방식을 요구사항에 맞게 설정하는 API예요.

| API                                  | 하는 일                                                              |
| ------------------------------------ | -------------------------------------------------------------------- |
| `dropDelegate`                       | 드롭 관련 판단과 이벤트 처리를 위임할 객체예요.                      |
| `UICollectionViewDropDelegate`       | 드롭 관련 판단과 이벤트 처리를 위임할 객체예요.                      |
| `hasActiveDrop`                      | 드롭의 활성화 여부나 현재 상태를 나타내요.                           |
| `reorderingCadence`                  | 드래그 item이 지나갈 때 기존 item을 얼마나 빠르게 재배치할지 정해요. |
| `UICollectionView.ReorderingCadence` | 즉시·빠르게·느리게 중 재배치 반응 속도를 나타내는 열거형이에요.      |

### 셀 선택하기 (Selecting cells)

선택 가능 여부를 설정하고 코드로 item을 선택·해제하거나 현재 선택 목록을 조회해요.

| API                                       | 하는 일                                                  |
| ----------------------------------------- | -------------------------------------------------------- |
| `indexPathsForSelectedItems`              | 현재 선택된 모든 item의 IndexPath를 반환해요.            |
| `selectItem(at:animated:scrollPosition:)` | 지정한 item을 선택하고 필요하면 해당 위치로 스크롤해요.  |
| `deselectItem(at:animated:)`              | 지정한 item의 선택을 해제해요.                           |
| `allowsSelection`                         | 선택 상태의 활성화 여부나 현재 상태를 나타내요.          |
| `allowsMultipleSelection`                 | 선택 상태의 활성화 여부나 현재 상태를 나타내요.          |
| `allowsSelectionDuringEditing`            | 선택 상태의 활성화 여부나 현재 상태를 나타내요.          |
| `allowsMultipleSelectionDuringEditing`    | 선택 상태의 활성화 여부나 현재 상태를 나타내요.          |
| `selectionFollowsFocus`                   | 포커스가 이동할 때 해당 item도 자동으로 선택할지 정해요. |

### 편집 모드 설정하기 (Putting the collection view into edit mode)

Collection View가 삭제·재배치 같은 편집 동작을 수행하는 상태인지 나타내요.

| API         | 하는 일                                                        |
| ----------- | -------------------------------------------------------------- |
| `isEditing` | Collection View가 현재 편집 모드인지 나타내고 상태를 변경해요. |

### items and views in the collection view 찾기 (Locating items and views in the collection view)

현재 상태에서 필요한 값이나 위치를 안전하게 조회하는 API예요.

| API                                                  | 하는 일                                                       |
| ---------------------------------------------------- | ------------------------------------------------------------- |
| `indexPathForItem(at:)`                              | Collection View 좌표에 있는 item의 IndexPath를 반환해요.      |
| `indexPathsForVisibleItems`                          | 현재 화면에 보이는 item의 IndexPath 목록을 반환해요.          |
| `indexPath(for:)`                                    | 지정한 셀이 현재 표현하는 item의 IndexPath를 반환해요.        |
| `cellForItem(at:)`                                   | 지정한 IndexPath의 셀이 현재 생성되어 있으면 반환해요.        |
| `indexPathsForVisibleSupplementaryElements(ofKind:)` | 현재 보이는 특정 element kind 보조 뷰의 IndexPath를 반환해요. |
| `supplementaryView(forElementKind:at:)`              | 특정 kind와 IndexPath의 보조 뷰가 생성되어 있으면 반환해요.   |
| `visibleSupplementaryViews(ofKind:)`                 | 현재 보이는 특정 element kind의 보조 뷰 목록을 반환해요.      |

### layout information 확인하기 (Getting layout information)

현재 상태에서 필요한 값이나 위치를 안전하게 조회하는 API예요.

| API                                                   | 하는 일                                         |
| ----------------------------------------------------- | ----------------------------------------------- |
| `layoutAttributesForItem(at:)`                        | 지정한 item의 현재 레이아웃 속성을 반환해요.    |
| `layoutAttributesForSupplementaryElement(ofKind:at:)` | 지정한 보조 뷰의 현재 레이아웃 속성을 반환해요. |

### item이 보이도록 스크롤하기 (Scrolling an item into view)

지정한 item을 화면의 위·가운데·아래 또는 leading·trailing에 맞춰 보이게 스크롤해요.

| API                                | 하는 일                                                  |
| ---------------------------------- | -------------------------------------------------------- |
| `scrollToItem(at:at:animated:)`    | 지정한 item이 요청한 위치에 오도록 스크롤해요.           |
| `UICollectionView.ScrollPosition`  | 스크롤 뒤 item을 맞출 가로·세로 위치 옵션이에요.         |
| `UICollectionView.ScrollDirection` | Collection View의 가로 또는 세로 스크롤 방향을 나타내요. |

### multiple changes to the collection view 애니메이션 처리하기 (Animating multiple changes to the collection view)

`UICollectionView`에서 Animating multiple changes to the collection view 책임을 담당하는 API예요.

| API                                  | 하는 일                                                    |
| ------------------------------------ | ---------------------------------------------------------- |
| `performBatchUpdates(_:completion:)` | 여러 삽입·삭제·이동을 하나의 애니메이션 묶음으로 실행해요. |

### content 다시 불러오기 (Reloading content)

데이터 또는 화면 상태를 변경할 때 사용하는 API예요. 모델과 표시 상태의 순서를 함께 확인해요.

| API                     | 하는 일                                                 |
| ----------------------- | ------------------------------------------------------- |
| `hasUncommittedUpdates` | 아직 화면 반영이 끝나지 않은 update가 있는지 나타내요.  |
| `reconfigureItems(at:)` | item의 정체성을 유지하면서 표시 구성을 다시 실행해요.   |
| `reloadData()`          | 데이터 소스 전체를 다시 읽고 모든 표시 내용을 갱신해요. |
| `reloadSections(_:)`    | section을 다시 불러오도록 표시해요.                     |
| `reloadItems(at:)`      | item을 다시 불러오도록 표시해요.                        |

### collection view elements 식별하기 (Identifying collection view elements)

현재 상태에서 필요한 값이나 위치를 안전하게 조회하는 API예요.

| API                                | 하는 일                                                  |
| ---------------------------------- | -------------------------------------------------------- |
| `UICollectionView.ElementCategory` | 요소가 셀·보조 뷰·장식 뷰 중 무엇인지 구분하는 값이에요. |
| `elementKindSectionFooter`         | 표준 section footer의 element kind 문자열이에요.         |
| `elementKindSectionHeader`         | 표준 section header의 element kind 문자열이에요.         |

### focus 다루기 (Working with focus)

`UICollectionView`에서 Working with focus 책임을 담당하는 API예요.

| API                             | 하는 일                                                   |
| ------------------------------- | --------------------------------------------------------- |
| `allowsFocus`                   | 포커스의 활성화 여부나 현재 상태를 나타내요.              |
| `allowsFocusDuringEditing`      | 포커스의 활성화 여부나 현재 상태를 나타내요.              |
| `selectionFollowsFocus`         | 포커스를 받은 item을 자동으로 선택할지 정해요.            |
| `remembersLastFocusedIndexPath` | 다시 진입할 때 마지막 포커스 IndexPath를 복원할지 정해요. |

### context menus 관리하기 (Managing context menus)

동작과 표시 방식을 요구사항에 맞게 설정하는 API예요.

| API                      | 하는 일                                                     |
| ------------------------ | ----------------------------------------------------------- |
| `contextMenuInteraction` | Collection View가 관리하는 컨텍스트 메뉴 상호작용 객체예요. |

### Resizing self-sizing cells

`UICollectionView`에서 Resizing self-sizing cells 책임을 담당하는 API예요.

| API                                       | 하는 일                                                          |
| ----------------------------------------- | ---------------------------------------------------------------- |
| `selfSizingInvalidation`                  | self-sizing 셀의 실제 크기가 달라질 때 무효화하는 방식을 정해요. |
| `UICollectionView.SelfSizingInvalidation` | self-sizing 변화에 사용할 무효화 정책을 나타내요.                |

### 인스턴스 프로퍼티

`UICollectionView`에서 Instance Properties 책임을 담당하는 API예요.

| API                    | 하는 일                                                                     |
| ---------------------- | --------------------------------------------------------------------------- |
| `appIntentsDataSource` | App Intents가 Collection View의 item을 조회하도록 제공하는 데이터 소스예요. |

### 인스턴스 메서드

`UICollectionView`에서 Instance Methods 책임을 담당하는 API예요.

| API                                | 하는 일                                     |
| ---------------------------------- | ------------------------------------------- |
| `indexPath(forSupplementaryView:)` | 지정한 보조 뷰의 현재 IndexPath를 반환해요. |

## 타입 관계를 확인해요

| 관계              | 타입                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 상속              | `UIScrollView`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| 준수하는 프로토콜 | `CALayerDelegate`, `CLBodyIdentifiable`, `CMBodyIdentifiable`, `CVarArg`, `Copyable`, `CustomDebugStringConvertible`, `CustomStringConvertible`, `Equatable`, `Escapable`, `Hashable`, `NSCoding`, `NSObjectProtocol`, `NSTouchBarProvider`, `Sendable`, `SendableMetatype`, `UIAccessibilityIdentification`, `UIActivityItemsConfigurationProviding`, `UIAppearance`, `UIAppearanceContainer`, `UICoordinateSpace`, `UIDataSourceTranslating`, `UIDynamicItem`, `UIFocusEnvironment`, `UIFocusItem`, `UIFocusItemContainer`, `UIFocusItemScrollableContainer`, `UILargeContentViewerItem`, `UIPasteConfigurationSupporting`, `UIPopoverPresentationControllerSourceItem`, `UIResponderStandardEditActions`, `UISpringLoadedInteractionSupporting`, `UITraitChangeObservable`, `UITraitEnvironment`, `UIUserActivityRestoring` |

## 사용할 때 주의할 점

Collection View를 만들 때 layout은 필수예요. 데이터 원본을 바꾼 뒤 화면 갱신 API를 호출하지 않거나, `IndexPath`를 데이터의 영구 식별자로 저장하면 삽입·삭제 뒤 잘못된 item을 가리킬 수 있어요.

## 함께 읽으면 좋은 문서

- [Collection Views 한눈에 보기](./index)
- [View 학습 가이드](./views)
- [공식 문서 인벤토리](./official-document-inventory)

## 참고 자료

- [Apple Developer Documentation — UICollectionView](https://developer.apple.com/documentation/uikit/uicollectionview)
