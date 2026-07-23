---
title: 'NSCollectionLayoutSupplementaryItem'
description: 'NSCollectionLayoutSupplementaryItem은 셀에 붙는 badge처럼 item 또는 container anchor를 기준으로 배치되는 보조 요소예요. 주요 API, 사용 예제, 주의점을 함께 정리합니다.'
---

# NSCollectionLayoutSupplementaryItem

> **면접 답변 한 줄 요약:** `NSCollectionLayoutSupplementaryItem`은 셀에 붙는 badge처럼 item 또는 container anchor를 기준으로 배치되는 보조 요소예요.

Apple 공식 문서의 **Layouts — Appearance** 영역에 있는 클래스예요. 이 페이지는 공식 topic section 순서를 유지하면서 실제 코드에서 무엇을 선택해야 하는지 한국어로 설명해요.

## 먼저 알아둘 용어

| 용어    | 쉬운 뜻                                                        |
| ------- | -------------------------------------------------------------- |
| Item    | 셀 하나가 차지할 크기와 간격을 정의하는 레이아웃 단위예요.     |
| Group   | 여러 item을 가로·세로 또는 사용자 정의 방식으로 묶는 단위예요. |
| Section | group을 반복하고 헤더·배경·스크롤 동작을 설정하는 단위예요.    |

## 이 API가 맡는 역할

보조 item은 셀이나 section의 의미 있는 콘텐츠를, decoration item은 데이터와 무관한 section 배경을 표현해요.

NSCollectionLayoutSupplementaryItem은 셀에 붙는 badge처럼 item 또는 container anchor를 기준으로 배치되는 보조 요소예요.

## 공식 설명에서 놓치면 안 되는 동작

supplementary item은 badge나 group 둘레의 프레임처럼 콘텐츠를 보완하는 뷰예요. header·footer처럼 section 경계에 붙는 요소는 `NSCollectionLayoutBoundarySupplementaryItem`을 사용해요.

종류마다 고유한 element kind 문자열이 필요하므로 한곳에 모아 관리하세요.

```swift
enum ElementKind {
  static let badge = "badge-element-kind"
  static let sectionHeader = "section-header-element-kind"
  static let sectionFooter = "section-footer-element-kind"
  static let layoutHeader = "layout-header-element-kind"
  static let layoutFooter = "layout-footer-element-kind"
  static let background = "background-element-kind"
}
```

item에 붙은 supplementary view는 그 item의 IndexPath를 따라가요. layout에 item을 만들 때 `supplementaryItems` 배열로 연결하고 data source의 provider에서 같은 element kind로 실제 뷰를 구성해요.

## 선언과 지원 범위를 확인해요

```swift
@MainActor class NSCollectionLayoutSupplementaryItem
```

**지원 플랫폼:** iOS 13.0+ · iPadOS 13.0+ · Mac Catalyst 13.1+ · tvOS 13.0+ · visionOS 1.0+

## 가장 작은 사용 예제

아래 예제에서는 이 API가 속한 역할이 전체 Collection View 구성에서 어디에 놓이는지 확인해요. 핵심 호출에 집중할 수 있도록 모델 선언과 주변 화면 구성은 생략했어요.

```swift
import UIKit

let badge = NSCollectionLayoutSupplementaryItem(
  layoutSize: .init(
    widthDimension: .absolute(24),
    heightDimension: .absolute(24)
  ),
  elementKind: "badge",
  containerAnchor: .init(edges: [.top, .trailing])
)
item.supplementaryItems = [badge]
```

## 공식 API 목차대로 살펴봐요

### supplementary item 만들기 (Creating a supplementary item)

`NSCollectionLayoutSupplementaryItem`를 만들거나 필요한 구성 요소를 연결하는 API예요.

| API                                                        | 하는 일                                                   |
| ---------------------------------------------------------- | --------------------------------------------------------- |
| `init(layoutSize:elementKind:containerAnchor:)`            | 크기·element kind·anchor로 supplementary item을 만들어요. |
| `init(layoutSize:elementKind:containerAnchor:itemAnchor:)` | 크기·element kind·anchor로 supplementary item을 만들어요. |

### anchors 확인하기 (Getting the anchors)

현재 상태에서 필요한 값이나 위치를 안전하게 조회하는 API예요.

| API               | 하는 일                                         |
| ----------------- | ----------------------------------------------- |
| `itemAnchor`      | supplementary item 자체의 기준 anchor예요.      |
| `containerAnchor` | supplementary item이 붙을 container anchor예요. |

### element kind 확인하기 (Getting the element kind)

현재 상태에서 필요한 값이나 위치를 안전하게 조회하는 API예요.

| API           | 하는 일                                                     |
| ------------- | ----------------------------------------------------------- |
| `elementKind` | supplementary·decoration view 종류를 구분하는 문자열이에요. |

### stacking order 지정하기 (Specifying stacking order)

동작과 표시 방식을 요구사항에 맞게 설정하는 API예요.

| API      | 하는 일                                |
| -------- | -------------------------------------- |
| `zIndex` | 겹친 요소의 앞뒤 그리기 순서를 정해요. |

## 타입 관계를 확인해요

| 관계              | 타입                                                                                                                           |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| 상속              | `NSCollectionLayoutItem`                                                                                                       |
| 상속하는 타입     | `NSCollectionLayoutBoundarySupplementaryItem`                                                                                  |
| 준수하는 프로토콜 | `CVarArg`, `CustomDebugStringConvertible`, `CustomStringConvertible`, `Equatable`, `Hashable`, `NSCopying`, `NSObjectProtocol` |

## 사용할 때 주의할 점

비율 크기는 바로 바깥 컨테이너를 기준으로 계산해요. 예상 크기를 사용한다면 셀이 Auto Layout으로 실제 높이를 계산할 수 있어야 하며, layout 객체와 데이터 상태의 책임을 섞지 않아요.

## 함께 읽으면 좋은 문서

- [Collection Views 한눈에 보기](./../index)
- [레이아웃 학습 가이드](../layout-guide)
- [공식 문서 인벤토리](./../official-document-inventory)

## 참고 자료

- [Apple Developer Documentation — NSCollectionLayoutSupplementaryItem](https://developer.apple.com/documentation/uikit/nscollectionlayoutsupplementaryitem)
