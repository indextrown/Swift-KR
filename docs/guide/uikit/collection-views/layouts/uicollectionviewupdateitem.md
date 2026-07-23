---
title: 'UICollectionViewUpdateItem'
description: 'UICollectionViewUpdateItem은 batch update 중 발생한 삽입·삭제·이동·갱신 한 건의 전후 IndexPath와 동작 종류를 설명해요. 주요 API, 사용 예제, 주의점을 함께 정리합니다.'
---

# UICollectionViewUpdateItem

> **면접 답변 한 줄 요약:** `UICollectionViewUpdateItem`은 batch update 중 발생한 삽입·삭제·이동·갱신 한 건의 전후 IndexPath와 동작 종류를 설명해요.

Apple 공식 문서의 **Layouts — Layout updates** 영역에 있는 클래스예요. 이 페이지는 공식 topic section 순서를 유지하면서 실제 코드에서 무엇을 선택해야 하는지 한국어로 설명해요.

## 먼저 알아둘 용어

| 용어    | 쉬운 뜻                                                        |
| ------- | -------------------------------------------------------------- |
| Item    | 셀 하나가 차지할 크기와 간격을 정의하는 레이아웃 단위예요.     |
| Group   | 여러 item을 가로·세로 또는 사용자 정의 방식으로 묶는 단위예요. |
| Section | group을 반복하고 헤더·배경·스크롤 동작을 설정하는 단위예요.    |

## 이 API가 맡는 역할

레이아웃 갱신 API는 보이는 item의 표시 속성을 바꾸거나 필요한 범위만 무효화해 불필요한 전체 재계산을 줄여요.

UICollectionViewUpdateItem은 batch update 중 발생한 삽입·삭제·이동·갱신 한 건의 전후 IndexPath와 동작 종류를 설명해요.

## 선언과 지원 범위를 확인해요

```swift
@MainActor class UICollectionViewUpdateItem
```

**지원 플랫폼:** iOS 6.0+ · iPadOS 6.0+ · Mac Catalyst 13.1+ · tvOS · visionOS 1.0+

## 가장 작은 사용 예제

아래 예제에서는 이 API가 속한 역할이 전체 Collection View 구성에서 어디에 놓이는지 확인해요. 핵심 호출에 집중할 수 있도록 모델 선언과 주변 화면 구성은 생략했어요.

```swift
import UIKit

override func prepare(
  forCollectionViewUpdates updateItems: [UICollectionViewUpdateItem]
) {
  super.prepare(forCollectionViewUpdates: updateItems)

  for update in updateItems where update.updateAction == .insert {
    insertedIndexPaths.insert(update.indexPathAfterUpdate)
  }
}
```

## 공식 API 목차대로 살펴봐요

### item changes 접근하기 (Accessing the item changes)

현재 상태에서 필요한 값이나 위치를 안전하게 조회하는 API예요.

| API                                 | 하는 일                                              |
| ----------------------------------- | ---------------------------------------------------- |
| `indexPathBeforeUpdate`             | Collection View update 이전의 IndexPath예요.         |
| `indexPathAfterUpdate`              | Collection View update 이후의 IndexPath예요.         |
| `updateAction`                      | item을 최신 값으로 갱신해요.                         |
| `UICollectionViewUpdateItem.Action` | update가 삽입·삭제·이동·reload 중 무엇인지 나타내요. |

## 타입 관계를 확인해요

| 관계              | 타입                                                                                                                          |
| ----------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| 상속              | `NSObject`                                                                                                                    |
| 준수하는 프로토콜 | `CVarArg`, `CustomDebugStringConvertible`, `CustomStringConvertible`, `Equatable`, `Hashable`, `NSObjectProtocol`, `Sendable` |

## 사용할 때 주의할 점

비율 크기는 바로 바깥 컨테이너를 기준으로 계산해요. 예상 크기를 사용한다면 셀이 Auto Layout으로 실제 높이를 계산할 수 있어야 하며, layout 객체와 데이터 상태의 책임을 섞지 않아요.

## 함께 읽으면 좋은 문서

- [Collection Views 한눈에 보기](./../index)
- [레이아웃 학습 가이드](../layout-guide)
- [공식 문서 인벤토리](./../official-document-inventory)

## 참고 자료

- [Apple Developer Documentation — UICollectionViewUpdateItem](https://developer.apple.com/documentation/uikit/uicollectionviewupdateitem)
