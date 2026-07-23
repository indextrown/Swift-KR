---
title: 'UICollectionViewPlaceholder'
description: 'UICollectionViewPlaceholder는 드래그 또는 드롭 도중 삽입할 임시 셀의 위치, 재사용 식별자, 구성 클로저를 담아요. 주요 API, 사용 예제, 주의점을 함께 정리합니다.'
---

# UICollectionViewPlaceholder

> **면접 답변 한 줄 요약:** `UICollectionViewPlaceholder`는 드래그 또는 드롭 도중 삽입할 임시 셀의 위치, 재사용 식별자, 구성 클로저를 담아요.

Apple 공식 문서의 **Collection Views — Drag and drop** 영역에 있는 클래스예요. 이 페이지는 공식 topic section 순서를 유지하면서 실제 코드에서 무엇을 선택해야 하는지 한국어로 설명해요.

## 먼저 알아둘 용어

| 용어          | 쉬운 뜻                                                     |
| ------------- | ----------------------------------------------------------- |
| Drag Session  | 사용자가 하나 이상의 item을 끄는 전체 상호작용이에요.       |
| Drop Proposal | 현재 위치에서 복사·이동·금지와 삽입 방식을 표현한 값이에요. |
| Item Provider | 앱 안팎으로 전달할 데이터를 지연 로딩하는 표준 객체예요.    |

## 이 API가 맡는 역할

드래그 앤 드롭 계층은 이동할 데이터 생성, 목적 위치 결정, 모델 변경, 애니메이션을 분리해요. 같은 앱 내부 이동이라도 화면만 옮기지 말고 모델과 snapshot을 먼저 일관되게 갱신해야 해요.

UICollectionViewPlaceholder는 드래그 또는 드롭 도중 삽입할 임시 셀의 위치, 재사용 식별자, 구성 클로저를 담아요.

## 선언과 지원 범위를 확인해요

```swift
@MainActor class UICollectionViewPlaceholder
```

**지원 플랫폼:** iOS 11.0+ · iPadOS 11.0+ · Mac Catalyst 13.1+ · visionOS 1.0+

## 가장 작은 사용 예제

아래 예제에서는 이 API가 속한 역할이 전체 Collection View 구성에서 어디에 놓이는지 확인해요. 핵심 호출에 집중할 수 있도록 모델 선언과 주변 화면 구성은 생략했어요.

```swift
import UIKit

let placeholder = UICollectionViewPlaceholder(
  insertionIndexPath: destinationIndexPath,
  reuseIdentifier: "LoadingCell"
)
placeholder.cellUpdateHandler = { cell in
  cell.contentView.alpha = 0.5
}
```

## 공식 API 목차대로 살펴봐요

### Initializing a Placeholder

`UICollectionViewPlaceholder`를 만들거나 필요한 구성 요소를 연결하는 API예요.

| API                                         | 하는 일                                              |
| ------------------------------------------- | ---------------------------------------------------- |
| `init(insertionIndexPath:reuseIdentifier:)` | IndexPath에 필요한 값을 받아 새 인스턴스를 만들어요. |

### the Cell’s Content 갱신하기 (Updating the Cell’s Content)

데이터 또는 화면 상태를 변경할 때 사용하는 API예요. 모델과 표시 상태의 순서를 함께 확인해요.

| API                 | 하는 일                               |
| ------------------- | ------------------------------------- |
| `cellUpdateHandler` | 셀 변화에 실행할 클로저나 처리기예요. |

## 타입 관계를 확인해요

| 관계              | 타입                                                                                                                          |
| ----------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| 상속              | `NSObject`                                                                                                                    |
| 상속하는 타입     | `UICollectionViewDropPlaceholder`                                                                                             |
| 준수하는 프로토콜 | `CVarArg`, `CustomDebugStringConvertible`, `CustomStringConvertible`, `Equatable`, `Hashable`, `NSObjectProtocol`, `Sendable` |

## 사용할 때 주의할 점

Drop Coordinator의 목적 IndexPath는 제안일 뿐이며 데이터 범위에 맞게 보정해야 해요. 외부 데이터 로딩은 비동기일 수 있으므로 placeholder를 사용하고 실패 시 제거하는 경로까지 준비해요.

## 함께 읽으면 좋은 문서

- [Collection Views 한눈에 보기](./index)
- [Drag and drop 학습 가이드](./drag-and-drop)
- [공식 문서 인벤토리](./official-document-inventory)

## 참고 자료

- [Apple Developer Documentation — UICollectionViewPlaceholder](https://developer.apple.com/documentation/uikit/uicollectionviewplaceholder)
