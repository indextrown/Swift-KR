---
title: 'UICollectionViewDropPlaceholder'
description: 'UICollectionViewDropPlaceholder는 비동기 데이터가 준비되는 동안 Collection View에 임시 셀을 삽입하고 사용자에게 진행 상태를 보여 줘요. 주요 API, 사용 예제, 주의점을 함께 정리합니다.'
---

# UICollectionViewDropPlaceholder

> **면접 답변 한 줄 요약:** `UICollectionViewDropPlaceholder`는 비동기 데이터가 준비되는 동안 Collection View에 임시 셀을 삽입하고 사용자에게 진행 상태를 보여 줘요.

Apple 공식 문서의 **Collection Views — Drag and drop** 영역에 있는 클래스예요. 이 페이지는 공식 topic section 순서를 유지하면서 실제 코드에서 무엇을 선택해야 하는지 한국어로 설명해요.

## 먼저 알아둘 용어

| 용어          | 쉬운 뜻                                                     |
| ------------- | ----------------------------------------------------------- |
| Drag Session  | 사용자가 하나 이상의 item을 끄는 전체 상호작용이에요.       |
| Drop Proposal | 현재 위치에서 복사·이동·금지와 삽입 방식을 표현한 값이에요. |
| Item Provider | 앱 안팎으로 전달할 데이터를 지연 로딩하는 표준 객체예요.    |

## 이 API가 맡는 역할

드래그 앤 드롭 계층은 이동할 데이터 생성, 목적 위치 결정, 모델 변경, 애니메이션을 분리해요. 같은 앱 내부 이동이라도 화면만 옮기지 말고 모델과 snapshot을 먼저 일관되게 갱신해야 해요.

UICollectionViewDropPlaceholder는 비동기 데이터가 준비되는 동안 Collection View에 임시 셀을 삽입하고 사용자에게 진행 상태를 보여 줘요.

## 공식 설명에서 놓치면 안 되는 동작

placeholder cell은 `NSItemProvider` 같은 비동기 데이터가 도착하기 전까지 progress indicator나 “불러오는 중” 메시지를 보여 주는 임시 UI예요. placeholder를 coordinator의 `drop(_:to:)`에 전달하기 전에 사용할 셀 클래스나 nib과 reuse identifier를 Collection View에 등록해야 해요.

`cellUpdateHandler`에서 임시 셀을 구성하고, `previewParametersProvider`가 필요하면 drop preview 모양도 바꿀 수 있어요. 데이터가 도착하면 `UICollectionViewDropPlaceholderContext.commitInsertion`으로 실제 모델과 셀로 교체해요.

> **중요:** placeholder는 일시적인 item이에요. 가능한 한 빨리 최종 셀로 교체하고, 로딩 실패나 취소 시 `deletePlaceholder()`로 반드시 제거하세요.

## 선언과 지원 범위를 확인해요

```swift
@MainActor class UICollectionViewDropPlaceholder
```

**지원 플랫폼:** iOS 11.0+ · iPadOS 11.0+ · Mac Catalyst 13.1+ · visionOS 1.0+

## 가장 작은 사용 예제

아래 예제에서는 이 API가 속한 역할이 전체 Collection View 구성에서 어디에 놓이는지 확인해요. 핵심 호출에 집중할 수 있도록 모델 선언과 주변 화면 구성은 생략했어요.

```swift
import UIKit

let placeholder = UICollectionViewDropPlaceholder(
  insertionIndexPath: destinationIndexPath,
  reuseIdentifier: "LoadingCell"
)
placeholder.previewParametersProvider = { cell in
  UIDragPreviewParameters()
}
```

## 공식 API 목차대로 살펴봐요

### a Custom Preview 제공하기 (Providing a Custom Preview)

`UICollectionViewDropPlaceholder`에서 Providing a Custom Preview 책임을 담당하는 API예요.

| API                         | 하는 일                                      |
| --------------------------- | -------------------------------------------- |
| `previewParametersProvider` | 관련 값과 동작을 만들어 반환하는 클로저예요. |

## 타입 관계를 확인해요

| 관계              | 타입                                                                                                              |
| ----------------- | ----------------------------------------------------------------------------------------------------------------- |
| 상속              | `UICollectionViewPlaceholder`                                                                                     |
| 준수하는 프로토콜 | `CVarArg`, `CustomDebugStringConvertible`, `CustomStringConvertible`, `Equatable`, `Hashable`, `NSObjectProtocol` |

## 사용할 때 주의할 점

Drop Coordinator의 목적 IndexPath는 제안일 뿐이며 데이터 범위에 맞게 보정해야 해요. 외부 데이터 로딩은 비동기일 수 있으므로 placeholder를 사용하고 실패 시 제거하는 경로까지 준비해요.

## 함께 읽으면 좋은 문서

- [Collection Views 한눈에 보기](./index)
- [Drag and drop 학습 가이드](./drag-and-drop)
- [공식 문서 인벤토리](./official-document-inventory)

## 참고 자료

- [Apple Developer Documentation — UICollectionViewDropPlaceholder](https://developer.apple.com/documentation/uikit/uicollectionviewdropplaceholder)
