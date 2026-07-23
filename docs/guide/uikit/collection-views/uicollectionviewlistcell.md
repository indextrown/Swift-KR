---
title: 'UICollectionViewListCell'
description: 'UICollectionViewListCell은 목록에 맞는 기본 콘텐츠 구성, 들여쓰기, 구분선, accessory를 제공하는 Collection View 셀이에요. 주요 API, 사용 예제, 주의점을 함께 정리합니다.'
---

# UICollectionViewListCell

> **면접 답변 한 줄 요약:** `UICollectionViewListCell`은 목록에 맞는 기본 콘텐츠 구성, 들여쓰기, 구분선, accessory를 제공하는 Collection View 셀이에요.

Apple 공식 문서의 **Collection Views — Cells** 영역에 있는 클래스예요. 이 페이지는 공식 topic section 순서를 유지하면서 실제 코드에서 무엇을 선택해야 하는지 한국어로 설명해요.

## 먼저 알아둘 용어

| 용어                | 쉬운 뜻                                                               |
| ------------------- | --------------------------------------------------------------------- |
| Cell                | item 하나의 콘텐츠와 상태를 화면에 표현하는 재사용 가능한 뷰예요.     |
| Reusable View       | 헤더·푸터처럼 Collection View가 재사용하는 보조 뷰의 기반 타입이에요. |
| Configuration State | 선택, 하이라이트, 비활성화 같은 현재 셀 상태를 모은 값이에요.         |

## 이 API가 맡는 역할

셀 계층은 모델의 현재 상태를 뷰 구성으로 변환해요. 재사용될 때 이전 item의 이미지나 선택 표시가 남지 않도록, 현재 모델과 configuration state만으로 결과를 다시 만들 수 있어야 해요.

UICollectionViewListCell은 목록에 맞는 기본 콘텐츠 구성, 들여쓰기, 구분선, accessory를 제공하는 Collection View 셀이에요.

## 선언과 지원 범위를 확인해요

```swift
@MainActor class UICollectionViewListCell
```

**지원 플랫폼:** iOS 14.0+ · iPadOS 14.0+ · Mac Catalyst 14.0+ · tvOS 14.0+ · visionOS 1.0+

## 가장 작은 사용 예제

아래 예제에서는 이 API가 속한 역할이 전체 Collection View 구성에서 어디에 놓이는지 확인해요. 핵심 호출에 집중할 수 있도록 모델 선언과 주변 화면 구성은 생략했어요.

```swift
import UIKit

let registration = UICollectionView.CellRegistration<
  UICollectionViewListCell,
  Photo
> { cell, _, photo in
  var content = cell.defaultContentConfiguration()
  content.text = photo.title
  cell.contentConfiguration = content
}
```

## 공식 API 목차대로 살펴봐요

### a configuration 확인하기 (Getting a configuration)

현재 상태에서 필요한 값이나 위치를 안전하게 조회하는 API예요.

| API                             | 하는 일                                                       |
| ------------------------------- | ------------------------------------------------------------- |
| `defaultContentConfiguration()` | configuration의 현재 값이나 설정을 읽고 필요한 경우 변경해요. |

### cell accessories 관리하기 (Managing cell accessories)

동작과 표시 방식을 요구사항에 맞게 설정하는 API예요.

| API               | 하는 일                                            |
| ----------------- | -------------------------------------------------- |
| `accessories`     | 셀의 현재 값이나 설정을 읽고 필요한 경우 변경해요. |
| `UICellAccessory` | 셀의 현재 값이나 설정을 읽고 필요한 경우 변경해요. |

### Customizing layout

`UICollectionViewListCell`에서 Customizing layout 책임을 담당하는 API예요.

| API                    | 하는 일                                                  |
| ---------------------- | -------------------------------------------------------- |
| `indentationLevel`     | 레이아웃의 현재 값이나 설정을 읽고 필요한 경우 변경해요. |
| `indentationWidth`     | 레이아웃의 현재 값이나 설정을 읽고 필요한 경우 변경해요. |
| `indentsAccessories`   | 레이아웃의 현재 값이나 설정을 읽고 필요한 경우 변경해요. |
| `separatorLayoutGuide` | 레이아웃의 현재 값이나 설정을 읽고 필요한 경우 변경해요. |

## 타입 관계를 확인해요

| 관계              | 타입                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 상속              | `UICollectionViewCell`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| 준수하는 프로토콜 | `CALayerDelegate`, `CLBodyIdentifiable`, `CMBodyIdentifiable`, `CVarArg`, `CustomDebugStringConvertible`, `CustomStringConvertible`, `Equatable`, `Hashable`, `NSCoding`, `NSObjectProtocol`, `NSTouchBarProvider`, `Sendable`, `SendableMetatype`, `UIAccessibilityIdentification`, `UIActivityItemsConfigurationProviding`, `UIAppearance`, `UIAppearanceContainer`, `UICoordinateSpace`, `UIDynamicItem`, `UIFocusEnvironment`, `UIFocusItem`, `UIFocusItemContainer`, `UILargeContentViewerItem`, `UIPasteConfigurationSupporting`, `UIPopoverPresentationControllerSourceItem`, `UIResponderStandardEditActions`, `UITraitChangeObservable`, `UITraitEnvironment`, `UIUserActivityRestoring` |

## 사용할 때 주의할 점

셀 안에 IndexPath를 장기간 저장하거나 비동기 이미지 작업을 취소하지 않으면 재사용 뒤 다른 item의 결과가 나타날 수 있어요. `prepareForReuse()`는 기본값 복구에 사용하고 실제 콘텐츠는 registration이나 configuration에서 매번 설정해요.

## 함께 읽으면 좋은 문서

- [Collection Views 한눈에 보기](./index)
- [Cells 학습 가이드](./cells-and-reusable-views)
- [공식 문서 인벤토리](./official-document-inventory)

## 참고 자료

- [Apple Developer Documentation — UICollectionViewListCell](https://developer.apple.com/documentation/uikit/uicollectionviewlistcell)
