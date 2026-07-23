---
title: 'UICollectionViewDropPlaceholderContext'
description: 'UICollectionViewDropPlaceholderContext는 임시 셀을 실제 데이터로 교체하거나 제거하고 표시 내용을 갱신하는 작업을 관리해요. 주요 API, 사용 예제, 주의점을 함께 정리합니다.'
---

# UICollectionViewDropPlaceholderContext

> **면접 답변 한 줄 요약:** `UICollectionViewDropPlaceholderContext`는 임시 셀을 실제 데이터로 교체하거나 제거하고 표시 내용을 갱신하는 작업을 관리해요.

Apple 공식 문서의 **Collection Views — Drag and drop** 영역에 있는 프로토콜예요. 이 페이지는 공식 topic section 순서를 유지하면서 실제 코드에서 무엇을 선택해야 하는지 한국어로 설명해요.

## 먼저 알아둘 용어

| 용어          | 쉬운 뜻                                                     |
| ------------- | ----------------------------------------------------------- |
| Drag Session  | 사용자가 하나 이상의 item을 끄는 전체 상호작용이에요.       |
| Drop Proposal | 현재 위치에서 복사·이동·금지와 삽입 방식을 표현한 값이에요. |
| Item Provider | 앱 안팎으로 전달할 데이터를 지연 로딩하는 표준 객체예요.    |

## 이 API가 맡는 역할

드래그 앤 드롭 계층은 이동할 데이터 생성, 목적 위치 결정, 모델 변경, 애니메이션을 분리해요. 같은 앱 내부 이동이라도 화면만 옮기지 말고 모델과 snapshot을 먼저 일관되게 갱신해야 해요.

UICollectionViewDropPlaceholderContext는 임시 셀을 실제 데이터로 교체하거나 제거하고 표시 내용을 갱신하는 작업을 관리해요.

## 선언과 지원 범위를 확인해요

```swift
@MainActor protocol UICollectionViewDropPlaceholderContext : UIDragAnimating
```

**지원 플랫폼:** iOS 11.0+ · iPadOS 11.0+ · Mac Catalyst 13.1+ · visionOS 1.0+

## 가장 작은 사용 예제

아래 예제에서는 이 API가 속한 역할이 전체 Collection View 구성에서 어디에 놓이는지 확인해요. 핵심 호출에 집중할 수 있도록 모델 선언과 주변 화면 구성은 생략했어요.

```swift
import UIKit

func loadDroppedPhoto(
  using context: any UICollectionViewDropPlaceholderContext
) {
  Task {
    do {
      let photo = try await photoLoader.load(context.dragItem.itemProvider)
      context.commitInsertion { insertionIndexPath in
        photos.insert(photo, at: insertionIndexPath.item)
      }
    } catch {
      context.deletePlaceholder()
    }
  }
}
```

## 공식 API 목차대로 살펴봐요

### the Placeholder Cell 갱신하기 (Updating the Placeholder Cell)

데이터 또는 화면 상태를 변경할 때 사용하는 API예요. 모델과 표시 상태의 순서를 함께 확인해요.

| API                                   | 하는 일                                                |
| ------------------------------------- | ------------------------------------------------------ |
| `commitInsertion(dataSourceUpdates:)` | 로딩을 마친 placeholder를 최종 모델 item으로 교체해요. |
| `setNeedsCellUpdate()`                | 셀에 새 설정이나 상태를 적용해요.                      |

### the Placeholder Cell 제거하기 (Removing the Placeholder Cell)

데이터 또는 화면 상태를 변경할 때 사용하는 API예요. 모델과 표시 상태의 순서를 함께 확인해요.

| API                   | 하는 일               |
| --------------------- | --------------------- |
| `deletePlaceholder()` | 지정한 셀을 제거해요. |

### Drag Item 확인하기 (Getting the Drag Item)

현재 상태에서 필요한 값이나 위치를 안전하게 조회하는 API예요.

| API        | 하는 일                                                |
| ---------- | ------------------------------------------------------ |
| `dragItem` | drop 대상 데이터와 localObject를 담은 drag item이에요. |

## 타입 관계를 확인해요

| 관계 | 타입                                  |
| ---- | ------------------------------------- |
| 상속 | `NSObjectProtocol`, `UIDragAnimating` |

## 사용할 때 주의할 점

Drop Coordinator의 목적 IndexPath는 제안일 뿐이며 데이터 범위에 맞게 보정해야 해요. 외부 데이터 로딩은 비동기일 수 있으므로 placeholder를 사용하고 실패 시 제거하는 경로까지 준비해요.

## 함께 읽으면 좋은 문서

- [Collection Views 한눈에 보기](./index)
- [Drag and drop 학습 가이드](./drag-and-drop)
- [공식 문서 인벤토리](./official-document-inventory)

## 참고 자료

- [Apple Developer Documentation — UICollectionViewDropPlaceholderContext](https://developer.apple.com/documentation/uikit/uicollectionviewdropplaceholdercontext)
