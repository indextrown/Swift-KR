---
title: 'UICollectionViewCompositionalLayoutConfiguration'
description: 'UICollectionViewCompositionalLayoutConfiguration은 전체 Compositional Layout의 스크롤 방향, section 간격, 전역 헤더·푸터를 설정해요. 주요 API, 사용 예제, 주의점을 함께 정리합니다.'
---

# UICollectionViewCompositionalLayoutConfiguration

> **면접 답변 한 줄 요약:** `UICollectionViewCompositionalLayoutConfiguration`은 전체 Compositional Layout의 스크롤 방향, section 간격, 전역 헤더·푸터를 설정해요.

Apple 공식 문서의 **Layouts — Configuration** 영역에 있는 클래스예요. 이 페이지는 공식 topic section 순서를 유지하면서 실제 코드에서 무엇을 선택해야 하는지 한국어로 설명해요.

## 먼저 알아둘 용어

| 용어    | 쉬운 뜻                                                        |
| ------- | -------------------------------------------------------------- |
| Item    | 셀 하나가 차지할 크기와 간격을 정의하는 레이아웃 단위예요.     |
| Group   | 여러 item을 가로·세로 또는 사용자 정의 방식으로 묶는 단위예요. |
| Section | group을 반복하고 헤더·배경·스크롤 동작을 설정하는 단위예요.    |

## 이 API가 맡는 역할

Configuration과 section provider를 사용하면 전체 스크롤 방향과 각 section의 배치를 환경에 맞게 동적으로 결정할 수 있어요.

UICollectionViewCompositionalLayoutConfiguration은 전체 Compositional Layout의 스크롤 방향, section 간격, 전역 헤더·푸터를 설정해요.

## 공식 설명에서 놓치면 안 되는 동작

이 configuration은 개별 section이 아니라 전체 layout에 적용돼요. `scrollDirection`으로 주축, `interSectionSpacing`으로 section 간격, `boundarySupplementaryItems`로 모든 section 바깥의 layout-level header와 footer를 지정해요.

```swift
let size = NSCollectionLayoutSize(
  widthDimension: .fractionalWidth(1),
  heightDimension: .estimated(44)
)
let header = NSCollectionLayoutBoundarySupplementaryItem(
  layoutSize: size,
  elementKind: ElementKind.layoutHeader,
  alignment: .top
)
let footer = NSCollectionLayoutBoundarySupplementaryItem(
  layoutSize: size,
  elementKind: ElementKind.layoutFooter,
  alignment: .bottom
)

let configuration = UICollectionViewCompositionalLayoutConfiguration()
configuration.interSectionSpacing = 20
configuration.scrollDirection = .horizontal
configuration.boundarySupplementaryItems = [header, footer]
```

기존 layout의 `configuration`을 변경하면 UIKit이 layout을 무효화해 새 설정을 반영해요.

## 선언과 지원 범위를 확인해요

```swift
@MainActor class UICollectionViewCompositionalLayoutConfiguration
```

**지원 플랫폼:** iOS 13.0+ · iPadOS 13.0+ · Mac Catalyst 13.1+ · tvOS 13.0+ · visionOS 1.0+

## 가장 작은 사용 예제

아래 예제에서는 이 API가 속한 역할이 전체 Collection View 구성에서 어디에 놓이는지 확인해요. 핵심 호출에 집중할 수 있도록 모델 선언과 주변 화면 구성은 생략했어요.

```swift
import UIKit

let configuration = UICollectionViewCompositionalLayoutConfiguration()
configuration.scrollDirection = .vertical
configuration.interSectionSpacing = 20

let layout = UICollectionViewCompositionalLayout(
  sectionProvider: { sectionIndex, environment in
    makeSection(at: sectionIndex, environment: environment)
  },
  configuration: configuration
)
```

## 공식 API 목차대로 살펴봐요

### scroll direction 지정하기 (Specifying scroll direction)

동작과 표시 방식을 요구사항에 맞게 설정하는 API예요.

| API               | 하는 일                                    |
| ----------------- | ------------------------------------------ |
| `scrollDirection` | Flow Layout의 가로·세로 스크롤 방향이에요. |

### spacing 설정하기 (Configuring spacing)

동작과 표시 방식을 요구사항에 맞게 설정하는 API예요.

| API                        | 하는 일                                       |
| -------------------------- | --------------------------------------------- |
| `interSectionSpacing`      | Compositional Layout section 사이 간격이에요. |
| `contentInsetsReference`   | content inset을 계산할 기준 영역이에요.       |
| `UIContentInsetsReference` | content inset 계산의 기준 영역을 나타내요.    |

### additional views 설정하기 (Configuring additional views)

동작과 표시 방식을 요구사항에 맞게 설정하는 API예요.

| API                          | 하는 일                                              |
| ---------------------------- | ---------------------------------------------------- |
| `boundarySupplementaryItems` | section 경계에 배치할 header·footer item 배열이에요. |

## 타입 관계를 확인해요

| 관계              | 타입                                                                                                                                       |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| 상속              | `NSObject`                                                                                                                                 |
| 준수하는 프로토콜 | `CVarArg`, `CustomDebugStringConvertible`, `CustomStringConvertible`, `Equatable`, `Hashable`, `NSCopying`, `NSObjectProtocol`, `Sendable` |

## 사용할 때 주의할 점

비율 크기는 바로 바깥 컨테이너를 기준으로 계산해요. 예상 크기를 사용한다면 셀이 Auto Layout으로 실제 높이를 계산할 수 있어야 하며, layout 객체와 데이터 상태의 책임을 섞지 않아요.

## 함께 읽으면 좋은 문서

- [Collection Views 한눈에 보기](./../index)
- [레이아웃 학습 가이드](../layout-guide)
- [공식 문서 인벤토리](./../official-document-inventory)

## 참고 자료

- [Apple Developer Documentation — UICollectionViewCompositionalLayoutConfiguration](https://developer.apple.com/documentation/uikit/uicollectionviewcompositionallayoutconfiguration)
