---
title: 'UICollectionViewDropDelegate'
description: 'UICollectionViewDropDelegate는 들어온 드롭을 처리할 수 있는지 판단하고 목적 위치와 동작을 제안한 뒤 실제 데이터를 반영해요. 주요 API, 사용 예제, 주의점을 함께 정리합니다.'
---

# UICollectionViewDropDelegate

> **면접 답변 한 줄 요약:** `UICollectionViewDropDelegate`는 들어온 드롭을 처리할 수 있는지 판단하고 목적 위치와 동작을 제안한 뒤 실제 데이터를 반영해요.

Apple 공식 문서의 **Collection Views — Drag and drop** 영역에 있는 프로토콜예요. 이 페이지는 공식 topic section 순서를 유지하면서 실제 코드에서 무엇을 선택해야 하는지 한국어로 설명해요.

## 먼저 알아둘 용어

| 용어          | 쉬운 뜻                                                     |
| ------------- | ----------------------------------------------------------- |
| Drag Session  | 사용자가 하나 이상의 item을 끄는 전체 상호작용이에요.       |
| Drop Proposal | 현재 위치에서 복사·이동·금지와 삽입 방식을 표현한 값이에요. |
| Item Provider | 앱 안팎으로 전달할 데이터를 지연 로딩하는 표준 객체예요.    |

## 이 API가 맡는 역할

드래그 앤 드롭 계층은 이동할 데이터 생성, 목적 위치 결정, 모델 변경, 애니메이션을 분리해요. 같은 앱 내부 이동이라도 화면만 옮기지 말고 모델과 snapshot을 먼저 일관되게 갱신해야 해요.

UICollectionViewDropDelegate는 들어온 드롭을 처리할 수 있는지 판단하고 목적 위치와 동작을 제안한 뒤 실제 데이터를 반영해요.

## 선언과 지원 범위를 확인해요

```swift
@MainActor protocol UICollectionViewDropDelegate : NSObjectProtocol
```

**지원 플랫폼:** iOS 11.0+ · iPadOS 11.0+ · Mac Catalyst 13.1+ · visionOS 1.0+

## 가장 작은 사용 예제

아래 예제에서는 이 API가 속한 역할이 전체 Collection View 구성에서 어디에 놓이는지 확인해요. 핵심 호출에 집중할 수 있도록 모델 선언과 주변 화면 구성은 생략했어요.

```swift
import UIKit

final class PhotoDropDelegate: NSObject, UICollectionViewDropDelegate {
  func collectionView(
    _ collectionView: UICollectionView,
    dropSessionDidUpdate session: UIDropSession,
    withDestinationIndexPath destinationIndexPath: IndexPath?
  ) -> UICollectionViewDropProposal {
    UICollectionViewDropProposal(
      operation: session.localDragSession == nil ? .copy : .move,
      intent: .insertAtDestinationIndexPath
    )
  }

  func collectionView(
    _ collectionView: UICollectionView,
    performDropWith coordinator: UICollectionViewDropCoordinator
  ) {
    applyDrop(coordinator)
  }
}
```

## 공식 API 목차대로 살펴봐요

### handling drops 지원 여부 정하기 (Declaring support for handling drops)

`UICollectionViewDropDelegate`에서 Declaring support for handling drops 책임을 담당하는 API예요.

| API                            | 하는 일                                          |
| ------------------------------ | ------------------------------------------------ |
| `collectionView(_:canHandle:)` | drop session의 데이터를 받을 수 있는지 결정해요. |

### the dropped data 반영하기 (Incorporating the dropped data)

`UICollectionViewDropDelegate`에서 Incorporating the dropped data 책임을 담당하는 API예요.

| API                                  | 하는 일                                               |
| ------------------------------------ | ----------------------------------------------------- |
| `collectionView(_:performDropWith:)` | drop 데이터를 모델과 Collection View에 실제 반영해요. |

### the drag movements 추적하기 (Tracking the drag movements)

`UICollectionViewDropDelegate`에서 Tracking the drag movements 책임을 담당하는 API예요.

| API                                                                | 하는 일                                                   |
| ------------------------------------------------------------------ | --------------------------------------------------------- |
| `collectionView(_:dropSessionDidUpdate:withDestinationIndexPath:)` | 현재 목적 위치의 drop operation과 intent를 제안해요.      |
| `collectionView(_:dropSessionDidEnter:)`                           | drop session이 Collection View 안으로 들어올 때 호출돼요. |
| `collectionView(_:dropSessionDidExit:)`                            | drop session이 Collection View 밖으로 나갈 때 호출돼요.   |
| `collectionView(_:dropSessionDidEnd:)`                             | drop session이 끝난 뒤 호출돼요.                          |

### a custom preview 제공하기 (Providing a custom preview)

`UICollectionViewDropDelegate`에서 Providing a custom preview 책임을 담당하는 API예요.

| API                                                 | 하는 일                                         |
| --------------------------------------------------- | ----------------------------------------------- |
| `collectionView(_:dropPreviewParametersForItemAt:)` | drop preview 모양을 구성할 매개변수를 반환해요. |

## 타입 관계를 확인해요

| 관계 | 타입               |
| ---- | ------------------ |
| 상속 | `NSObjectProtocol` |

## 사용할 때 주의할 점

Drop Coordinator의 목적 IndexPath는 제안일 뿐이며 데이터 범위에 맞게 보정해야 해요. 외부 데이터 로딩은 비동기일 수 있으므로 placeholder를 사용하고 실패 시 제거하는 경로까지 준비해요.

## 함께 읽으면 좋은 문서

- [Collection Views 한눈에 보기](./index)
- [Drag and drop 학습 가이드](./drag-and-drop)
- [공식 문서 인벤토리](./official-document-inventory)

## 참고 자료

- [Apple Developer Documentation — UICollectionViewDropDelegate](https://developer.apple.com/documentation/uikit/uicollectionviewdropdelegate)
