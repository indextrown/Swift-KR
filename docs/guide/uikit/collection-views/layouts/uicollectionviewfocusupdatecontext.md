---
title: 'UICollectionViewFocusUpdateContext'
description: 'UICollectionViewFocusUpdateContext는 tvOS나 키보드 탐색에서 이전과 다음 포커스 item의 IndexPath를 제공해요. 주요 API, 사용 예제, 주의점을 함께 정리합니다.'
---

# UICollectionViewFocusUpdateContext

> **면접 답변 한 줄 요약:** `UICollectionViewFocusUpdateContext`는 tvOS나 키보드 탐색에서 이전과 다음 포커스 item의 IndexPath를 제공해요.

Apple 공식 문서의 **Layouts — Layout updates** 영역에 있는 클래스예요. 이 페이지는 공식 topic section 순서를 유지하면서 실제 코드에서 무엇을 선택해야 하는지 한국어로 설명해요.

## 먼저 알아둘 용어

| 용어    | 쉬운 뜻                                                        |
| ------- | -------------------------------------------------------------- |
| Item    | 셀 하나가 차지할 크기와 간격을 정의하는 레이아웃 단위예요.     |
| Group   | 여러 item을 가로·세로 또는 사용자 정의 방식으로 묶는 단위예요. |
| Section | group을 반복하고 헤더·배경·스크롤 동작을 설정하는 단위예요.    |

## 이 API가 맡는 역할

레이아웃 갱신 API는 보이는 item의 표시 속성을 바꾸거나 필요한 범위만 무효화해 불필요한 전체 재계산을 줄여요.

UICollectionViewFocusUpdateContext는 tvOS나 키보드 탐색에서 이전과 다음 포커스 item의 IndexPath를 제공해요.

## 선언과 지원 범위를 확인해요

```swift
@MainActor class UICollectionViewFocusUpdateContext
```

**지원 플랫폼:** iOS 9.0+ · iPadOS 9.0+ · Mac Catalyst 13.1+ · tvOS 9.0+ · visionOS 1.0+

## 가장 작은 사용 예제

아래 예제에서는 이 API가 속한 역할이 전체 Collection View 구성에서 어디에 놓이는지 확인해요. 핵심 호출에 집중할 수 있도록 모델 선언과 주변 화면 구성은 생략했어요.

```swift
import UIKit

func nextFocusedItem(
  from context: UICollectionViewFocusUpdateContext
) -> IndexPath? {
  context.nextFocusedIndexPath
}
```

## 공식 API 목차대로 살펴봐요

### focusable items in the collection view 찾기 (Locating focusable items in the collection view)

현재 상태에서 필요한 값이나 위치를 안전하게 조회하는 API예요.

| API                          | 하는 일                                                    |
| ---------------------------- | ---------------------------------------------------------- |
| `previouslyFocusedIndexPath` | focus update 직전에 focus된 item의 IndexPath예요.          |
| `nextFocusedIndexPath`       | focus update가 성공하면 새로 focus될 item의 IndexPath예요. |

## 타입 관계를 확인해요

| 관계              | 타입                                                                                                                                              |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| 상속              | `UIFocusUpdateContext`                                                                                                                            |
| 준수하는 프로토콜 | `CVarArg`, `CustomDebugStringConvertible`, `CustomStringConvertible`, `Equatable`, `Hashable`, `NSObjectProtocol`, `Sendable`, `SendableMetatype` |

## 사용할 때 주의할 점

비율 크기는 바로 바깥 컨테이너를 기준으로 계산해요. 예상 크기를 사용한다면 셀이 Auto Layout으로 실제 높이를 계산할 수 있어야 하며, layout 객체와 데이터 상태의 책임을 섞지 않아요.

## 함께 읽으면 좋은 문서

- [Collection Views 한눈에 보기](./../index)
- [레이아웃 학습 가이드](../layout-guide)
- [공식 문서 인벤토리](./../official-document-inventory)

## 참고 자료

- [Apple Developer Documentation — UICollectionViewFocusUpdateContext](https://developer.apple.com/documentation/uikit/uicollectionviewfocusupdatecontext)
