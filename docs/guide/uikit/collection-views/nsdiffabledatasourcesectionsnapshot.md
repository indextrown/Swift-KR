---
title: 'NSDiffableDataSourceSectionSnapshot'
description: 'NSDiffableDataSourceSectionSnapshot은 한 section 안의 계층형 item과 펼침·접힘 상태를 트리 형태로 표현해요. 주요 API, 사용 예제, 주의점을 함께 정리합니다.'
---

# NSDiffableDataSourceSectionSnapshot

> **면접 답변 한 줄 요약:** `NSDiffableDataSourceSectionSnapshot`은 한 section 안의 계층형 item과 펼침·접힘 상태를 트리 형태로 표현해요.

Apple 공식 문서의 **Collection Views — Data** 영역에 있는 구조체예요. 이 페이지는 공식 topic section 순서를 유지하면서 실제 코드에서 무엇을 선택해야 하는지 한국어로 설명해요.

## 먼저 알아둘 용어

| 용어     | 쉬운 뜻                                                        |
| -------- | -------------------------------------------------------------- |
| 식별자   | item이 이동해도 같은 데이터임을 구분하는 `Hashable` 값이에요.  |
| Snapshot | 특정 시점의 section과 item 순서를 표현한 값이에요.             |
| Prefetch | 화면에 나타나기 전에 필요한 데이터를 미리 준비하는 작업이에요. |

## 이 API가 맡는 역할

데이터 계층은 “무엇을 어떤 순서로 보여 줄지”를 책임져요. 현대적인 코드에서는 모델을 먼저 변경하고 식별자로 snapshot을 만든 다음 diffable data source에 적용하는 흐름을 기본으로 삼아요.

NSDiffableDataSourceSectionSnapshot은 한 section 안의 계층형 item과 펼침·접힘 상태를 트리 형태로 표현해요.

## 공식 설명에서 놓치면 안 되는 동작

전체 화면 snapshot과 달리 section snapshot은 **한 section 내부의 계층 관계와 펼침 상태**를 표현해요. section마다 데이터 출처가 다르거나 outline처럼 parent-child 구조가 필요할 때 전체 snapshot과 함께 또는 독립적으로 사용할 수 있어요.

```swift
var outline = NSDiffableDataSourceSectionSnapshot<Node.ID>()
outline.append([rootID])
outline.append(childIDs, to: rootID)
outline.expand([rootID])

dataSource.apply(
  outline,
  to: .library,
  animatingDifferences: true
)
```

`append(_:to:)`의 parent를 생략하면 root item이 되고, 지정하면 child가 돼요. `expand`와 `collapse`는 item을 삭제하지 않고 보이는 계층만 바꿔요. `visibleItems`와 `level(of:)`로 현재 표현 상태를 확인하고, 디버깅할 때는 `visualDescription()`으로 트리 구조를 읽을 수 있어요.

## 선언과 지원 범위를 확인해요

```swift
@preconcurrency struct NSDiffableDataSourceSectionSnapshot<ItemIdentifierType> where ItemIdentifierType : Hashable, ItemIdentifierType : Sendable
```

**지원 플랫폼:** iOS 14.0+ · iPadOS 14.0+ · Mac Catalyst 14.0+ · tvOS 14.0+ · visionOS

## 가장 작은 사용 예제

아래 예제에서는 이 API가 속한 역할이 전체 Collection View 구성에서 어디에 놓이는지 확인해요. 핵심 호출에 집중할 수 있도록 모델 선언과 주변 화면 구성은 생략했어요.

```swift
import UIKit

var outline = NSDiffableDataSourceSectionSnapshot<Folder.ID>()
outline.append([rootFolder.id])
outline.append(childFolders.map(\.id), to: rootFolder.id)
outline.expand([rootFolder.id])

dataSource.apply(outline, to: .main, animatingDifferences: true)
```

## 공식 API 목차대로 살펴봐요

### section snapshot 만들기 (Creating a section snapshot)

`NSDiffableDataSourceSectionSnapshot`를 만들거나 필요한 구성 요소를 연결하는 API예요.

| API                             | 하는 일                                       |
| ------------------------------- | --------------------------------------------- |
| `init()`                        | item이 없는 빈 section snapshot을 만들어요.   |
| `init(_:)`                      | 전달한 section snapshot의 복사본을 만들어요.  |
| `snapshot(of:includingParent:)` | 현재 section snapshot 상태를 값으로 반환해요. |
| `append(_:to:)`                 | section snapshot을 현재 상태의 끝에 추가해요. |

### items 접근하기 (Accessing items)

현재 상태에서 필요한 값이나 위치를 안전하게 조회하는 API예요.

| API            | 하는 일                                                |
| -------------- | ------------------------------------------------------ |
| `items`        | 현재 객체가 담고 있는 item 목록이에요.                 |
| `rootItems`    | section snapshot 계층의 최상위 item 배열이에요.        |
| `visibleItems` | 계층의 펼침 상태를 반영해 현재 보이는 item 배열이에요. |

### item metrics 확인하기 (Getting item metrics)

현재 상태에서 필요한 값이나 위치를 안전하게 조회하는 API예요.

| API             | 하는 일                                                  |
| --------------- | -------------------------------------------------------- |
| `index(of:)`    | 지정한 item 식별자의 현재 순서 index를 반환해요.         |
| `level(of:)`    | 계층에서 지정한 item의 깊이를 반환해요.                  |
| `parent(of:)`   | 지정한 item의 부모 식별자를 반환해요.                    |
| `contains(_:)`  | 지정한 item이 포함되어 있는지 확인해요.                  |
| `isVisible(_:)` | 펼침 상태를 반영했을 때 지정한 item이 보이는지 확인해요. |

### items 삽입하기 (Inserting items)

데이터 또는 화면 상태를 변경할 때 사용하는 API예요. 모델과 표시 상태의 순서를 함께 확인해요.

| API                 | 하는 일                                    |
| ------------------- | ------------------------------------------ |
| `insert(_:after:)`  | item을 지정한 위치의 앞이나 뒤에 삽입해요. |
| `insert(_:after:)`  | item을 지정한 위치의 앞이나 뒤에 삽입해요. |
| `insert(_:before:)` | item을 지정한 위치의 앞이나 뒤에 삽입해요. |
| `insert(_:before:)` | item을 지정한 위치의 앞이나 뒤에 삽입해요. |

### items 제거하기 (Removing items)

데이터 또는 화면 상태를 변경할 때 사용하는 API예요. 모델과 표시 상태의 순서를 함께 확인해요.

| API           | 하는 일                           |
| ------------- | --------------------------------- |
| `delete(_:)`  | 지정한 item을 제거해요.           |
| `deleteAll()` | 현재 포함된 모든 item을 제거해요. |

### items 교체하기 (Replacing items)

데이터 또는 화면 상태를 변경할 때 사용하는 API예요. 모델과 표시 상태의 순서를 함께 확인해요.

| API                          | 하는 일                                                |
| ---------------------------- | ------------------------------------------------------ |
| `replace(childrenOf:using:)` | 지정한 parent의 child를 새 snapshot 내용으로 교체해요. |

### items 펼치고 접기 (Expanding and collapsing items)

`NSDiffableDataSourceSectionSnapshot`에서 Expanding and collapsing items 책임을 담당하는 API예요.

| API              | 하는 일                                           |
| ---------------- | ------------------------------------------------- |
| `isExpanded(_:)` | 지정한 parent item이 현재 펼쳐져 있는지 확인해요. |
| `expand(_:)`     | 지정한 parent item을 펼쳐 child를 보이게 해요.    |
| `collapse(_:)`   | 지정한 parent item을 접어 child를 숨겨요.         |

### section snapshots 디버깅하기 (Debugging section snapshots)

`NSDiffableDataSourceSectionSnapshot`에서 Debugging section snapshots 책임을 담당하는 API예요.

| API                   | 하는 일                                                        |
| --------------------- | -------------------------------------------------------------- |
| `visualDescription()` | 현재 section snapshot 구조를 디버깅 가능한 문자열로 보여 줘요. |

### bridging 지원하기 (Supporting bridging)

`NSDiffableDataSourceSectionSnapshot`에서 Supporting bridging 책임을 담당하는 API예요.

| API                                            | 하는 일                                                              |
| ---------------------------------------------- | -------------------------------------------------------------------- |
| `NSDiffableDataSourceSectionSnapshotReference` | Objective-C에서 section snapshot을 다루기 위한 reference 타입이에요. |

### 인스턴스 프로퍼티

`NSDiffableDataSourceSectionSnapshot`에서 Instance Properties 책임을 담당하는 API예요.

| API             | 하는 일                                           |
| --------------- | ------------------------------------------------- |
| `expandedItems` | section snapshot에서 현재 펼쳐진 item 배열이에요. |

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

- [Apple Developer Documentation — NSDiffableDataSourceSectionSnapshot](https://developer.apple.com/documentation/uikit/nsdiffabledatasourcesectionsnapshot-swift.struct)
