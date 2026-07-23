---
title: 'UICollectionViewDiffableDataSource'
description: 'UICollectionViewDiffableDataSource는 item 식별자와 셀 생성 클로저를 연결하고 snapshot의 차이를 Collection View에 반영하는 데이터 소스예요. 주요 API, 사용 예제, 주의점을 함께 정리합니다.'
---

# UICollectionViewDiffableDataSource

> **면접 답변 한 줄 요약:** `UICollectionViewDiffableDataSource`는 item 식별자와 셀 생성 클로저를 연결하고 snapshot의 차이를 Collection View에 반영하는 데이터 소스예요.

Apple 공식 문서의 **Collection Views — Data** 영역에 있는 클래스예요. 이 페이지는 공식 topic section 순서를 유지하면서 실제 코드에서 무엇을 선택해야 하는지 한국어로 설명해요.

## 먼저 알아둘 용어

| 용어     | 쉬운 뜻                                                        |
| -------- | -------------------------------------------------------------- |
| 식별자   | item이 이동해도 같은 데이터임을 구분하는 `Hashable` 값이에요.  |
| Snapshot | 특정 시점의 section과 item 순서를 표현한 값이에요.             |
| Prefetch | 화면에 나타나기 전에 필요한 데이터를 미리 준비하는 작업이에요. |

## 이 API가 맡는 역할

데이터 계층은 “무엇을 어떤 순서로 보여 줄지”를 책임져요. 현대적인 코드에서는 모델을 먼저 변경하고 식별자로 snapshot을 만든 다음 diffable data source에 적용하는 흐름을 기본으로 삼아요.

UICollectionViewDiffableDataSource는 item 식별자와 셀 생성 클로저를 연결하고 snapshot의 차이를 Collection View에 반영하는 데이터 소스예요.

## 개요 (Overview)

Diffable Data Source는 Collection View와 함께 동작하는 특수한 data source예요. Collection View의 데이터와 사용자 인터페이스를 간단하고 효율적으로 갱신하는 동작을 제공해요. `UICollectionViewDataSource`를 이미 채택하고 있으며, 그 프로토콜의 모든 필수 메서드 구현도 포함해요.

Collection View에 데이터를 표시하는 순서는 다음과 같아요.

1. Diffable Data Source를 Collection View에 연결해요.
2. cell provider를 구현해 각 셀을 구성해요.
3. 현재 데이터 상태를 snapshot으로 만들어요.
4. snapshot을 적용해 데이터를 화면에 표시해요.

Diffable Data Source를 연결할 때는 `init(collectionView:cellProvider:)`에 대상 Collection View와 cell provider를 전달해요. cell provider에서는 각 item 식별자에 맞는 셀을 구성해 화면에 데이터가 어떻게 나타날지 정해요.

```swift
dataSource = UICollectionViewDiffableDataSource<Int, UUID>(collectionView: collectionView) {
    (collectionView: UICollectionView, indexPath: IndexPath, itemIdentifier: UUID) -> UICollectionViewCell? in
    // Configure and return cell.
}
```

그다음 현재 데이터 상태를 나타내는 snapshot을 만들어 적용해요. snapshot 작성과 적용 방법은 `NSDiffableDataSourceSnapshot` 문서에서 자세히 설명해요.

> **중요:** Diffable Data Source로 Collection View를 구성한 뒤에는 그 Collection View의 `dataSource`를 다른 객체로 바꾸지 마세요. 다른 data source가 필요하다면 새 Collection View와 새 Diffable Data Source를 만들어 다시 구성해야 해요.

## 선언과 지원 범위를 확인해요

```swift
@MainActor @preconcurrency class UICollectionViewDiffableDataSource<SectionIdentifierType, ItemIdentifierType> where SectionIdentifierType : Hashable, SectionIdentifierType : Sendable, ItemIdentifierType : Hashable, ItemIdentifierType : Sendable
```

**지원 플랫폼:** iOS 13.0+ · iPadOS 13.0+ · Mac Catalyst 13.0+ · tvOS 13.0+ · visionOS

## 가장 작은 사용 예제

아래 예제에서는 이 API가 속한 역할이 전체 Collection View 구성에서 어디에 놓이는지 확인해요. 핵심 호출에 집중할 수 있도록 모델 선언과 주변 화면 구성은 생략했어요.

```swift
import UIKit

let dataSource = UICollectionViewDiffableDataSource<
  Section,
  Photo.ID
>(collectionView: collectionView) { collectionView, indexPath, photoID in
  collectionView.dequeueConfiguredReusableCell(
    using: photoRegistration,
    for: indexPath,
    item: photoID
  )
}

var snapshot = NSDiffableDataSourceSnapshot<Section, Photo.ID>()
snapshot.appendSections([.main])
snapshot.appendItems(photoIDs)
dataSource.apply(snapshot, animatingDifferences: true)
```

## 공식 API 목차대로 살펴봐요

### diffable data source 만들기 (Creating a diffable data source)

`UICollectionViewDiffableDataSource`를 만들거나 필요한 구성 요소를 연결하는 API예요.

| API                                               | 하는 일                                                                |
| ------------------------------------------------- | ---------------------------------------------------------------------- |
| `init(collectionView:cellProvider:)`              | Collection View와 셀 제공 클로저를 연결해 데이터 소스를 만들어요.      |
| `UICollectionViewDiffableDataSource.CellProvider` | IndexPath와 item 식별자를 받아 구성된 셀을 반환하는 클로저 타입이에요. |

### supplementary views 만들기 (Creating supplementary views)

`UICollectionViewDiffableDataSource`를 만들거나 필요한 구성 요소를 연결하는 API예요.

| API                                                            | 하는 일                                                               |
| -------------------------------------------------------------- | --------------------------------------------------------------------- |
| `supplementaryViewProvider`                                    | 헤더·푸터 같은 보조 뷰를 구성해 반환할 클로저를 저장해요.             |
| `UICollectionViewDiffableDataSource.SupplementaryViewProvider` | element kind와 IndexPath를 받아 보조 뷰를 반환하는 클로저 타입이에요. |

### items 식별하기 (Identifying items)

현재 상태에서 필요한 값이나 위치를 안전하게 조회하는 API예요.

| API                    | 하는 일                                         |
| ---------------------- | ----------------------------------------------- |
| `itemIdentifier(for:)` | 지정한 IndexPath에 있는 item 식별자를 반환해요. |
| `indexPath(for:)`      | 지정한 item 식별자의 현재 IndexPath를 반환해요. |

### sections 식별하기 (Identifying sections)

현재 상태에서 필요한 값이나 위치를 안전하게 조회하는 API예요.

| API                       | 하는 일                                                |
| ------------------------- | ------------------------------------------------------ |
| `sectionIdentifier(for:)` | 지정한 section index에 있는 section 식별자를 반환해요. |
| `index(for:)`             | 지정한 section 식별자의 현재 index를 반환해요.         |

### data 갱신하기 (Updating data)

데이터 또는 화면 상태를 변경할 때 사용하는 API예요. 모델과 표시 상태의 순서를 함께 확인해요.

| API                                           | 하는 일                                                               |
| --------------------------------------------- | --------------------------------------------------------------------- |
| `snapshot()`                                  | 현재 snapshot 상태를 값으로 반환해요.                                 |
| `apply(_:animatingDifferences:)`              | 새 snapshot과 기존 상태의 차이를 계산해 화면에 적용해요.              |
| `apply(_:animatingDifferences:completion:)`   | snapshot을 적용하고 갱신이 끝나면 completion을 호출해요.              |
| `applySnapshotUsingReloadData(_:)`            | 차이 계산과 애니메이션 없이 전체 reload 방식으로 snapshot을 적용해요. |
| `applySnapshotUsingReloadData(_:completion:)` | 전체 reload 방식으로 적용하고 끝나면 completion을 호출해요.           |

### section data 갱신하기 (Updating section data)

데이터 또는 화면 상태를 변경할 때 사용하는 API예요. 모델과 표시 상태의 순서를 함께 확인해요.

| API                                            | 하는 일                                                            |
| ---------------------------------------------- | ------------------------------------------------------------------ |
| `snapshot(for:)`                               | 지정한 section의 현재 계층형 section snapshot을 반환해요.          |
| `apply(_:to:animatingDifferences:completion:)` | 계층형 snapshot을 지정한 section에 적용하고 completion을 호출해요. |
| `apply(_:to:animatingDifferences:)`            | 계층형 snapshot을 지정한 section에 적용해요.                       |

### reordering 지원하기 (Supporting reordering)

데이터 또는 화면 상태를 변경할 때 사용하는 API예요. 모델과 표시 상태의 순서를 함께 확인해요.

| API                                                     | 하는 일                                                    |
| ------------------------------------------------------- | ---------------------------------------------------------- |
| `reorderingHandlers`                                    | item 이동 가능 여부와 이동 뒤 모델 갱신 처리를 설정해요.   |
| `UICollectionViewDiffableDataSource.ReorderingHandlers` | 재배치 판단과 결과 처리 클로저를 묶는 구조체예요.          |
| `NSDiffableDataSourceTransaction`                       | 재배치 전후 snapshot과 변경 내역을 담는 transaction이에요. |
| `NSDiffableDataSourceSectionTransaction`                | 한 section의 재배치 전후 상태와 변경 내역을 담아요.        |

### expanding and collapsing 지원하기 (Supporting expanding and collapsing)

`UICollectionViewDiffableDataSource`에서 Supporting expanding and collapsing 책임을 담당하는 API예요.

| API                                                          | 하는 일                                                        |
| ------------------------------------------------------------ | -------------------------------------------------------------- |
| `sectionSnapshotHandlers`                                    | 계층형 item의 펼침·접힘 가능 여부와 상태 변경 처리를 설정해요. |
| `UICollectionViewDiffableDataSource.SectionSnapshotHandlers` | 계층형 section snapshot의 펼침·접힘 처리 클로저를 묶어요.      |

### a diffable data source 디버깅하기 (Debugging a diffable data source)

`UICollectionViewDiffableDataSource`에서 Debugging a diffable data source 책임을 담당하는 API예요.

| API             | 하는 일                                                   |
| --------------- | --------------------------------------------------------- |
| `description()` | 현재 데이터 소스 구조를 디버깅 가능한 문자열로 보여 줘요. |

### bridging 지원하기 (Supporting bridging)

`UICollectionViewDiffableDataSource`에서 Supporting bridging 책임을 담당하는 API예요.

| API                                           | 하는 일                                                              |
| --------------------------------------------- | -------------------------------------------------------------------- |
| `UICollectionViewDiffableDataSourceReference` | Objective-C에서 사용할 수 있는 Diffable Data Source 참조 타입이에요. |

## 타입 관계를 확인해요

| 관계              | 타입                                                                                                                                                                            |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 상속              | `NSObject`                                                                                                                                                                      |
| 준수하는 프로토콜 | `CVarArg`, `CustomDebugStringConvertible`, `CustomStringConvertible`, `Equatable`, `Hashable`, `NSObjectProtocol`, `Sendable`, `SendableMetatype`, `UICollectionViewDataSource` |

## 사용할 때 주의할 점

식별자의 `Hashable` 값은 item의 내용이 바뀌어도 안정적이어야 해요. 같은 식별자를 snapshot에 두 번 넣지 말고, UI 갱신과 모델 갱신의 순서를 섞지 않으며, prefetch 작업은 취소할 수 있게 관리해요.

## 함께 읽으면 좋은 문서

- [Collection Views 한눈에 보기](./index)
- [Data 학습 가이드](./data)
- [공식 문서 인벤토리](./official-document-inventory)

## 참고 자료

- [Apple Developer Documentation — UICollectionViewDiffableDataSource](https://developer.apple.com/documentation/uikit/uicollectionviewdiffabledatasource-9tqpa)
