---
title: 'UICollectionViewDropProposal'
description: 'UICollectionViewDropProposal은 현재 드롭 세션을 복사·이동·금지 중 어떻게 처리하고 item 사이 또는 안쪽 어디에 놓을지 표현해요. 주요 API, 사용 예제, 주의점을 함께 정리합니다.'
---

# UICollectionViewDropProposal

> **면접 답변 한 줄 요약:** `UICollectionViewDropProposal`은 현재 드롭 세션을 복사·이동·금지 중 어떻게 처리하고 item 사이 또는 안쪽 어디에 놓을지 표현해요.

Apple 공식 문서의 **Collection Views — Drag and drop** 영역에 있는 클래스예요. 이 페이지는 공식 topic section 순서를 유지하면서 실제 코드에서 무엇을 선택해야 하는지 한국어로 설명해요.

## 먼저 알아둘 용어

| 용어          | 쉬운 뜻                                                     |
| ------------- | ----------------------------------------------------------- |
| Drag Session  | 사용자가 하나 이상의 item을 끄는 전체 상호작용이에요.       |
| Drop Proposal | 현재 위치에서 복사·이동·금지와 삽입 방식을 표현한 값이에요. |
| Item Provider | 앱 안팎으로 전달할 데이터를 지연 로딩하는 표준 객체예요.    |

## 이 API가 맡는 역할

드래그 앤 드롭 계층은 이동할 데이터 생성, 목적 위치 결정, 모델 변경, 애니메이션을 분리해요. 같은 앱 내부 이동이라도 화면만 옮기지 말고 모델과 snapshot을 먼저 일관되게 갱신해야 해요.

UICollectionViewDropProposal은 현재 드롭 세션을 복사·이동·금지 중 어떻게 처리하고 item 사이 또는 안쪽 어디에 놓을지 표현해요.

## 선언과 지원 범위를 확인해요

```swift
@MainActor class UICollectionViewDropProposal
```

**지원 플랫폼:** iOS 11.0+ · iPadOS 11.0+ · Mac Catalyst 13.1+ · visionOS 1.0+

## 가장 작은 사용 예제

아래 예제에서는 이 API가 속한 역할이 전체 Collection View 구성에서 어디에 놓이는지 확인해요. 핵심 호출에 집중할 수 있도록 모델 선언과 주변 화면 구성은 생략했어요.

```swift
import UIKit

func proposal(for session: UIDropSession)
  -> UICollectionViewDropProposal {
  UICollectionViewDropProposal(
    operation: session.localDragSession == nil ? .copy : .move,
    intent: .insertAtDestinationIndexPath
  )
}
```

## 공식 API 목차대로 살펴봐요

### Drop Proposal 만들기 (Creating a Drop Proposal)

`UICollectionViewDropProposal`를 만들거나 필요한 구성 요소를 연결하는 API예요.

| API                       | 하는 일                                         |
| ------------------------- | ----------------------------------------------- |
| `init(operation:intent:)` | 드롭에 필요한 값을 받아 새 인스턴스를 만들어요. |

### Proposed Drop Location 확인하기 (Getting the Proposed Drop Location)

현재 상태에서 필요한 값이나 위치를 안전하게 조회하는 API예요.

| API                                   | 하는 일                                              |
| ------------------------------------- | ---------------------------------------------------- |
| `intent`                              | 드롭의 현재 값이나 설정을 읽고 필요한 경우 변경해요. |
| `UICollectionViewDropProposal.Intent` | 드롭의 현재 값이나 설정을 읽고 필요한 경우 변경해요. |
| `UIDropOperation`                     | 드롭의 현재 값이나 설정을 읽고 필요한 경우 변경해요. |

### 초기화

`UICollectionViewDropProposal`를 만들거나 필요한 구성 요소를 연결하는 API예요.

| API                           | 하는 일                                         |
| ----------------------------- | ----------------------------------------------- |
| `init(dropOperation:intent:)` | 드롭에 필요한 값을 받아 새 인스턴스를 만들어요. |

## 타입 관계를 확인해요

| 관계              | 타입                                                                                                                                                           |
| ----------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 상속              | `UIDropProposal`                                                                                                                                               |
| 준수하는 프로토콜 | `CVarArg`, `CustomDebugStringConvertible`, `CustomStringConvertible`, `Equatable`, `Hashable`, `NSCopying`, `NSObjectProtocol`, `Sendable`, `SendableMetatype` |

## 사용할 때 주의할 점

Drop Coordinator의 목적 IndexPath는 제안일 뿐이며 데이터 범위에 맞게 보정해야 해요. 외부 데이터 로딩은 비동기일 수 있으므로 placeholder를 사용하고 실패 시 제거하는 경로까지 준비해요.

## 함께 읽으면 좋은 문서

- [Collection Views 한눈에 보기](./index)
- [Drag and drop 학습 가이드](./drag-and-drop)
- [공식 문서 인벤토리](./official-document-inventory)

## 참고 자료

- [Apple Developer Documentation — UICollectionViewDropProposal](https://developer.apple.com/documentation/uikit/uicollectionviewdropproposal)
