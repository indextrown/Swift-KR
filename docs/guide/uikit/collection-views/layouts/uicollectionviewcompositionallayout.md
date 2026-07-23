---
title: 'UICollectionViewCompositionalLayout'
description: 'UICollectionViewCompositionalLayout은 item·group·section 계층을 조합해 서로 다른 목록, 격자, 가로 스크롤 영역을 한 화면에 배치해요. 주요 API, 사용 예제, 주의점을 함께 정리합니다.'
---

# UICollectionViewCompositionalLayout

> **면접 답변 한 줄 요약:** `UICollectionViewCompositionalLayout`은 item·group·section 계층을 조합해 서로 다른 목록, 격자, 가로 스크롤 영역을 한 화면에 배치해요.

Apple 공식 문서의 **Layouts — Essentials** 영역에 있는 클래스예요. 이 페이지는 공식 topic section 순서를 유지하면서 실제 코드에서 무엇을 선택해야 하는지 한국어로 설명해요.

## 먼저 알아둘 용어

| 용어    | 쉬운 뜻                                                        |
| ------- | -------------------------------------------------------------- |
| Item    | 셀 하나가 차지할 크기와 간격을 정의하는 레이아웃 단위예요.     |
| Group   | 여러 item을 가로·세로 또는 사용자 정의 방식으로 묶는 단위예요. |
| Section | group을 반복하고 헤더·배경·스크롤 동작을 설정하는 단위예요.    |

## 이 API가 맡는 역할

Compositional Layout은 item, group, section을 조립해 서로 다른 배치를 선언해요.

UICollectionViewCompositionalLayout은 item·group·section 계층을 조합해 서로 다른 목록, 격자, 가로 스크롤 영역을 한 화면에 배치해요.

## 개요 (Overview)

Compositional Layout은 Collection View Layout의 한 종류예요. 작은 구성 요소를 차례대로 조합해 전체 layout을 만드는 방식이라서 구성 가능하고 유연하며 빠르게 동작하도록 설계됐어요. 이 구조를 사용하면 다양한 형태의 콘텐츠 배치를 선언적으로 만들 수 있어요.

Compositional Layout은 화면을 서로 다른 시각적 묶음으로 나누는 하나 이상의 section으로 이루어져요. 각 section에는 개별 item을 묶은 group이 들어가요. item은 표시하려는 데이터의 가장 작은 layout 단위이며, group은 item을 가로 행·세로 열 또는 사용자 정의 형태로 배치할 수 있어요.

<!-- Apple DocC image: media-3568664 -->

![item이 group을 이루고 group이 section을 이루어 전체 Compositional Layout으로 조합되는 계층](../assets/apple-docs/media-3568664@2x.png)

item으로 group을 만들고, group으로 section을 만든 다음, section을 전체 layout으로 조합해요. 다음은 기본적인 한 줄 목록 layout을 만드는 공식 예제의 흐름이에요.

```swift
func createBasicListLayout() -> UICollectionViewLayout {
    let itemSize = NSCollectionLayoutSize(widthDimension: .fractionalWidth(1.0),
                                         heightDimension: .fractionalHeight(1.0))
    let item = NSCollectionLayoutItem(layoutSize: itemSize)

    let groupSize = NSCollectionLayoutSize(widthDimension: .fractionalWidth(1.0),
                                          heightDimension: .absolute(44))
    let group = NSCollectionLayoutGroup.horizontal(layoutSize: groupSize,
                                                     subitems: [item])

    let section = NSCollectionLayoutSection(group: group)


    let layout = UICollectionViewCompositionalLayout(section: section)
    return layout
}
```

## 선언과 지원 범위를 확인해요

```swift
@MainActor class UICollectionViewCompositionalLayout
```

**지원 플랫폼:** iOS 13.0+ · iPadOS 13.0+ · Mac Catalyst 13.1+ · tvOS 13.0+ · visionOS 1.0+

## 가장 작은 사용 예제

아래 예제에서는 이 API가 속한 역할이 전체 Collection View 구성에서 어디에 놓이는지 확인해요. 핵심 호출에 집중할 수 있도록 모델 선언과 주변 화면 구성은 생략했어요.

```swift
import UIKit

let layout = UICollectionViewCompositionalLayout { _, environment in
  let columns = environment.container.effectiveContentSize.width > 600 ? 4 : 2
  return makeGridSection(columnCount: columns)
}
```

## 공식 API 목차대로 살펴봐요

### layout 만들기 (Creating a layout)

`UICollectionViewCompositionalLayout`를 만들거나 필요한 구성 요소를 연결하는 API예요.

| API                                    | 하는 일                                                  |
| -------------------------------------- | -------------------------------------------------------- |
| `init(section:)`                       | 지정한 section 구성으로 Compositional Layout을 만들어요. |
| `init(section:configuration:)`         | 지정한 section 구성으로 Compositional Layout을 만들어요. |
| `init(sectionProvider:)`               | section provider로 Compositional Layout을 만들어요.      |
| `init(sectionProvider:configuration:)` | section provider로 Compositional Layout을 만들어요.      |

### list layout 만들기 (Creating a list layout)

`UICollectionViewCompositionalLayout`를 만들거나 필요한 구성 요소를 연결하는 API예요.

| API                                   | 하는 일                                                                |
| ------------------------------------- | ---------------------------------------------------------------------- |
| `list(using:)`                        | list configuration으로 list layout 또는 section을 만들어요.            |
| `UICollectionLayoutListConfiguration` | List section의 appearance·header·separator·swipe action 설정을 담아요. |

### layout 설정하기 (Configuring the layout)

동작과 표시 방식을 요구사항에 맞게 설정하는 API예요.

| API             | 하는 일                                 |
| --------------- | --------------------------------------- |
| `configuration` | 현재 layout의 전역 configuration이에요. |

## 타입 관계를 확인해요

| 관계              | 타입                                                                                                                                                          |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 상속              | `UICollectionViewLayout`                                                                                                                                      |
| 준수하는 프로토콜 | `CVarArg`, `CustomDebugStringConvertible`, `CustomStringConvertible`, `Equatable`, `Hashable`, `NSCoding`, `NSObjectProtocol`, `Sendable`, `SendableMetatype` |

## 사용할 때 주의할 점

비율 크기는 바로 바깥 컨테이너를 기준으로 계산해요. 예상 크기를 사용한다면 셀이 Auto Layout으로 실제 높이를 계산할 수 있어야 하며, layout 객체와 데이터 상태의 책임을 섞지 않아요.

## 함께 읽으면 좋은 문서

- [Collection Views 한눈에 보기](./../index)
- [레이아웃 학습 가이드](../layout-guide)
- [공식 문서 인벤토리](./../official-document-inventory)

## 참고 자료

- [Apple Developer Documentation — UICollectionViewCompositionalLayout](https://developer.apple.com/documentation/uikit/uicollectionviewcompositionallayout)
