---
title: 'NSDiffableDataSourceSnapshot'
description: 'NSDiffableDataSourceSnapshot은 특정 시점에 존재하는 section과 item의 식별자 및 순서를 값으로 표현하는 목록 상태예요. 주요 API, 사용 예제, 주의점을 함께 정리합니다.'
---

# NSDiffableDataSourceSnapshot

> **면접 답변 한 줄 요약:** `NSDiffableDataSourceSnapshot`은 특정 시점에 존재하는 section과 item의 식별자 및 순서를 값으로 표현하는 목록 상태예요.

Apple 공식 문서의 **Collection Views — Data** 영역에 있는 구조체예요. 이 페이지는 공식 topic section 순서를 유지하면서 실제 코드에서 무엇을 선택해야 하는지 한국어로 설명해요.

## 먼저 알아둘 용어

| 용어     | 쉬운 뜻                                                        |
| -------- | -------------------------------------------------------------- |
| 식별자   | item이 이동해도 같은 데이터임을 구분하는 `Hashable` 값이에요.  |
| Snapshot | 특정 시점의 section과 item 순서를 표현한 값이에요.             |
| Prefetch | 화면에 나타나기 전에 필요한 데이터를 미리 준비하는 작업이에요. |

## 이 API가 맡는 역할

데이터 계층은 “무엇을 어떤 순서로 보여 줄지”를 책임져요. 현대적인 코드에서는 모델을 먼저 변경하고 식별자로 snapshot을 만든 다음 diffable data source에 적용하는 흐름을 기본으로 삼아요.

NSDiffableDataSourceSnapshot은 특정 시점에 존재하는 section과 item의 식별자 및 순서를 값으로 표현하는 목록 상태예요.

## 선언과 지원 범위를 확인해요

```swift
@preconcurrency struct NSDiffableDataSourceSnapshot<SectionIdentifierType, ItemIdentifierType> where SectionIdentifierType : Hashable, SectionIdentifierType : Sendable, ItemIdentifierType : Hashable, ItemIdentifierType : Sendable
```

**지원 플랫폼:** iOS 13.0+ · iPadOS 13.0+ · Mac Catalyst 13.0+ · tvOS 13.0+ · visionOS

## 가장 작은 사용 예제

아래 예제에서는 이 API가 속한 역할이 전체 Collection View 구성에서 어디에 놓이는지 확인해요. 핵심 호출에 집중할 수 있도록 모델 선언과 주변 화면 구성은 생략했어요.

```swift
import UIKit

enum Section {
  case main
}

var snapshot = NSDiffableDataSourceSnapshot<Section, UUID>()
snapshot.appendSections([.main])
snapshot.appendItems(photoIDs, toSection: .main)
dataSource.apply(snapshot, animatingDifferences: true)
```

## 공식 API 목차대로 살펴봐요

### snapshot 만들기 (Creating a snapshot)

`NSDiffableDataSourceSnapshot`를 만들거나 필요한 구성 요소를 연결하는 API예요.

| API                         | 하는 일                                                         |
| --------------------------- | --------------------------------------------------------------- |
| `init()`                    | section과 item이 없는 빈 snapshot을 만들어요.                   |
| `appendSections(_:)`        | section 식별자를 현재 section 순서의 끝에 추가해요.             |
| `appendItems(_:toSection:)` | item 식별자를 지정한 section 또는 마지막 section 끝에 추가해요. |

### item and section metrics 확인하기 (Getting item and section metrics)

현재 상태에서 필요한 값이나 위치를 안전하게 조회하는 API예요.

| API                         | 하는 일                                     |
| --------------------------- | ------------------------------------------- |
| `numberOfItems`             | snapshot 전체 item 개수를 반환해요.         |
| `numberOfSections`          | snapshot의 section 개수를 반환해요.         |
| `numberOfItems(inSection:)` | 지정한 section에 속한 item 개수를 반환해요. |

### items and sections 식별하기 (Identifying items and sections)

현재 상태에서 필요한 값이나 위치를 안전하게 조회하는 API예요.

| API                                  | 하는 일                                                    |
| ------------------------------------ | ---------------------------------------------------------- |
| `itemIdentifiers`                    | snapshot에 있는 모든 item 식별자를 현재 순서대로 반환해요. |
| `sectionIdentifiers`                 | 모든 section 식별자를 현재 순서대로 반환해요.              |
| `indexOfItem(_:)`                    | 지정한 item의 현재 위치를 반환해요.                        |
| `indexOfSection(_:)`                 | 지정한 section 식별자의 현재 위치를 반환해요.              |
| `itemIdentifiers(inSection:)`        | 지정한 section의 item 식별자를 순서대로 반환해요.          |
| `sectionIdentifier(containingItem:)` | 지정한 item을 포함한 section 식별자를 반환해요.            |

### items and sections 삽입하기 (Inserting items and sections)

데이터 또는 화면 상태를 변경할 때 사용하는 API예요. 모델과 표시 상태의 순서를 함께 확인해요.

| API                                | 하는 일                                    |
| ---------------------------------- | ------------------------------------------ |
| `insertItems(_:afterItem:)`        | item을 지정한 위치의 앞이나 뒤에 삽입해요. |
| `insertItems(_:beforeItem:)`       | item을 지정한 위치의 앞이나 뒤에 삽입해요. |
| `insertSections(_:afterSection:)`  | section을 기준 section 뒤에 삽입해요.      |
| `insertSections(_:beforeSection:)` | section을 기준 section 앞에 삽입해요.      |

### items and sections 제거하기 (Removing items and sections)

데이터 또는 화면 상태를 변경할 때 사용하는 API예요. 모델과 표시 상태의 순서를 함께 확인해요.

| API                  | 하는 일                                   |
| -------------------- | ----------------------------------------- |
| `deleteAllItems()`   | 현재 포함된 모든 item을 제거해요.         |
| `deleteItems(_:)`    | 지정한 item을 제거해요.                   |
| `deleteSections(_:)` | 지정한 section과 그 안의 item을 제거해요. |

### items and sections 순서 바꾸기 (Reordering items and sections)

데이터 또는 화면 상태를 변경할 때 사용하는 API예요. 모델과 표시 상태의 순서를 함께 확인해요.

| API                             | 하는 일                               |
| ------------------------------- | ------------------------------------- |
| `moveItem(_:afterItem:)`        | 지정한 item의 순서를 옮겨요.          |
| `moveItem(_:beforeItem:)`       | 지정한 item의 순서를 옮겨요.          |
| `moveSection(_:afterSection:)`  | section을 기준 section 뒤로 옮겨요.   |
| `moveSection(_:beforeSection:)` | section을 기준 section 앞으로 옮겨요. |

### data 다시 불러오기 (Reloading data)

데이터 또는 화면 상태를 변경할 때 사용하는 API예요. 모델과 표시 상태의 순서를 함께 확인해요.

| API                           | 하는 일                                               |
| ----------------------------- | ----------------------------------------------------- |
| `reconfigureItems(_:)`        | item의 정체성을 유지하면서 표시 구성을 다시 실행해요. |
| `reconfiguredItemIdentifiers` | reconfigure 대상으로 표시한 item 식별자 목록이에요.   |
| `reloadItems(_:)`             | item을 다시 불러오도록 표시해요.                      |
| `reloadedItemIdentifiers`     | reload 대상으로 표시한 item 식별자 목록이에요.        |
| `reloadSections(_:)`          | section을 다시 불러오도록 표시해요.                   |
| `reloadedSectionIdentifiers`  | reload 대상으로 표시한 section 식별자 목록이에요.     |

### bridging 지원하기 (Supporting bridging)

`NSDiffableDataSourceSnapshot`에서 Supporting bridging 책임을 담당하는 API예요.

| API                                     | 하는 일                                                      |
| --------------------------------------- | ------------------------------------------------------------ |
| `NSDiffableDataSourceSnapshotReference` | Objective-C에서 snapshot을 다룰 때 사용하는 참조 타입이에요. |

## 타입 관계를 확인해요

| 관계              | 타입                                                    |
| ----------------- | ------------------------------------------------------- |
| 준수하는 프로토콜 | `Copyable`, `Escapable`, `Sendable`, `SendableMetatype` |

## 사용할 때 주의할 점

식별자의 `Hashable` 값은 item의 내용이 바뀌어도 안정적이어야 해요. 같은 식별자를 snapshot에 두 번 넣지 말고, UI 갱신과 모델 갱신의 순서를 섞지 않으며, prefetch 작업은 취소할 수 있게 관리해요.

## 함께 읽으면 좋은 문서

- [Collection Views 한눈에 보기](./index)
- [Data 학습 가이드](./data)
- [공식 문서 인벤토리](./official-document-inventory)

## 참고 자료

- [Apple Developer Documentation — NSDiffableDataSourceSnapshot](https://developer.apple.com/documentation/uikit/nsdiffabledatasourcesnapshot-swift.struct)
