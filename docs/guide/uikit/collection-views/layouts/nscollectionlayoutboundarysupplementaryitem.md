---
title: 'NSCollectionLayoutBoundarySupplementaryItem'
description: 'NSCollectionLayoutBoundarySupplementaryItem은 section이나 전체 레이아웃 경계에 헤더·푸터를 배치하고 고정 여부를 설정해요. 주요 API, 사용 예제, 주의점을 함께 정리합니다.'
---

# NSCollectionLayoutBoundarySupplementaryItem

> **면접 답변 한 줄 요약:** `NSCollectionLayoutBoundarySupplementaryItem`은 section이나 전체 레이아웃 경계에 헤더·푸터를 배치하고 고정 여부를 설정해요.

Apple 공식 문서의 **Layouts — Appearance** 영역에 있는 클래스예요. 이 페이지는 공식 topic section 순서를 유지하면서 실제 코드에서 무엇을 선택해야 하는지 한국어로 설명해요.

## 먼저 알아둘 용어

| 용어    | 쉬운 뜻                                                        |
| ------- | -------------------------------------------------------------- |
| Item    | 셀 하나가 차지할 크기와 간격을 정의하는 레이아웃 단위예요.     |
| Group   | 여러 item을 가로·세로 또는 사용자 정의 방식으로 묶는 단위예요. |
| Section | group을 반복하고 헤더·배경·스크롤 동작을 설정하는 단위예요.    |

## 이 API가 맡는 역할

보조 item은 셀이나 section의 의미 있는 콘텐츠를, decoration item은 데이터와 무관한 section 배경을 표현해요.

NSCollectionLayoutBoundarySupplementaryItem은 section이나 전체 레이아웃 경계에 헤더·푸터를 배치하고 고정 여부를 설정해요.

## 개요 (Overview)

Boundary Supplementary Item은 `NSCollectionLayoutSupplementaryItem`의 특수한 형태예요. section 또는 전체 Collection View의 경계에 header와 footer를 추가할 때 사용해요.

Supplementary Item 종류마다 고유한 element kind가 필요해요. 문자열을 쉽게 식별하고 같은 곳에서 관리할 수 있도록 다음처럼 모아 둘 수 있어요.

```swift
struct ElementKind {
    static let badge = "badge-element-kind"
    static let background = "background-element-kind"
    static let sectionHeader = "section-header-element-kind"
    static let sectionFooter = "section-footer-element-kind"
    static let layoutHeader = "layout-header-element-kind"
    static let layoutFooter = "layout-footer-element-kind"
}
```

section의 `boundarySupplementaryItems`에 Boundary Supplementary Item 배열을 지정하면 header와 footer를 추가할 수 있어요.

```swift
let section = NSCollectionLayoutSection(group: group)

let headerFooterSize = NSCollectionLayoutSize(widthDimension: .fractionalWidth(1.0),
                                             heightDimension: .estimated(44))

let sectionHeader = NSCollectionLayoutBoundarySupplementaryItem(layoutSize: headerFooterSize,
                                                               elementKind: ElementKind.sectionHeader,
                                                                 alignment: .top)
let sectionFooter = NSCollectionLayoutBoundarySupplementaryItem(layoutSize: headerFooterSize,
                                                               elementKind: ElementKind.sectionFooter,
                                                                 alignment: .bottom)

section.boundarySupplementaryItems = [sectionHeader, sectionFooter]
```

## 선언과 지원 범위를 확인해요

```swift
@MainActor class NSCollectionLayoutBoundarySupplementaryItem
```

**지원 플랫폼:** iOS 13.0+ · iPadOS 13.0+ · Mac Catalyst 13.1+ · tvOS 13.0+ · visionOS 1.0+

## 가장 작은 사용 예제

아래 예제에서는 이 API가 속한 역할이 전체 Collection View 구성에서 어디에 놓이는지 확인해요. 핵심 호출에 집중할 수 있도록 모델 선언과 주변 화면 구성은 생략했어요.

```swift
import UIKit

let header = NSCollectionLayoutBoundarySupplementaryItem(
  layoutSize: .init(
    widthDimension: .fractionalWidth(1),
    heightDimension: .estimated(44)
  ),
  elementKind: UICollectionView.elementKindSectionHeader,
  alignment: .top
)
section.boundarySupplementaryItems = [header]
```

## 공식 API 목차대로 살펴봐요

### boundary supplementary item 만들기 (Creating a boundary supplementary item)

`NSCollectionLayoutBoundarySupplementaryItem`를 만들거나 필요한 구성 요소를 연결하는 API예요.

| API                                                      | 하는 일                                                        |
| -------------------------------------------------------- | -------------------------------------------------------------- |
| `init(layoutSize:elementKind:alignment:)`                | 크기·element kind·경계 정렬로 header나 footer item을 만들어요. |
| `init(layoutSize:elementKind:alignment:absoluteOffset:)` | 크기·element kind·경계 정렬로 header나 footer item을 만들어요. |

### scrolling behavior 지정하기 (Specifying scrolling behavior)

동작과 표시 방식을 요구사항에 맞게 설정하는 API예요.

| API                  | 하는 일                                                     |
| -------------------- | ----------------------------------------------------------- |
| `pinToVisibleBounds` | 스크롤 중 supplementary item을 화면 경계에 고정할지 정해요. |

### position 지정하기 (Specifying position)

동작과 표시 방식을 요구사항에 맞게 설정하는 API예요.

| API               | 하는 일                                                   |
| ----------------- | --------------------------------------------------------- |
| `offset`          | anchor가 기준 edge에서 이동할 offset이에요.               |
| `alignment`       | supplementary item을 section의 어느 경계에 맞출지 정해요. |
| `extendsBoundary` | supplementary item이 section 경계를 넘어 확장될지 정해요. |

## 타입 관계를 확인해요

| 관계              | 타입                                                                                                                           |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| 상속              | `NSCollectionLayoutSupplementaryItem`                                                                                          |
| 준수하는 프로토콜 | `CVarArg`, `CustomDebugStringConvertible`, `CustomStringConvertible`, `Equatable`, `Hashable`, `NSCopying`, `NSObjectProtocol` |

## 사용할 때 주의할 점

비율 크기는 바로 바깥 컨테이너를 기준으로 계산해요. 예상 크기를 사용한다면 셀이 Auto Layout으로 실제 높이를 계산할 수 있어야 하며, layout 객체와 데이터 상태의 책임을 섞지 않아요.

## 함께 읽으면 좋은 문서

- [Collection Views 한눈에 보기](./../index)
- [레이아웃 학습 가이드](../layout-guide)
- [공식 문서 인벤토리](./../official-document-inventory)

## 참고 자료

- [Apple Developer Documentation — NSCollectionLayoutBoundarySupplementaryItem](https://developer.apple.com/documentation/uikit/nscollectionlayoutboundarysupplementaryitem)
