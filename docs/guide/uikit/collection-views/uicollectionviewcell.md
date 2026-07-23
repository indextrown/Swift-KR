---
title: 'UICollectionViewCell'
description: 'UICollectionViewCell은 item 하나를 표현하며 재사용 과정에서도 콘텐츠, 배경, 선택·하이라이트 상태를 일관되게 구성하는 뷰예요. 주요 API, 사용 예제, 주의점을 함께 정리합니다.'
---

# UICollectionViewCell

> **면접 답변 한 줄 요약:** `UICollectionViewCell`은 item 하나를 표현하며 재사용 과정에서도 콘텐츠, 배경, 선택·하이라이트 상태를 일관되게 구성하는 뷰예요.

Apple 공식 문서의 **Collection Views — Cells** 영역에 있는 클래스예요. 이 페이지는 공식 topic section 순서를 유지하면서 실제 코드에서 무엇을 선택해야 하는지 한국어로 설명해요.

## 먼저 알아둘 용어

| 용어                | 쉬운 뜻                                                               |
| ------------------- | --------------------------------------------------------------------- |
| Cell                | item 하나의 콘텐츠와 상태를 화면에 표현하는 재사용 가능한 뷰예요.     |
| Reusable View       | 헤더·푸터처럼 Collection View가 재사용하는 보조 뷰의 기반 타입이에요. |
| Configuration State | 선택, 하이라이트, 비활성화 같은 현재 셀 상태를 모은 값이에요.         |

## 이 API가 맡는 역할

셀 계층은 모델의 현재 상태를 뷰 구성으로 변환해요. 재사용될 때 이전 item의 이미지나 선택 표시가 남지 않도록, 현재 모델과 configuration state만으로 결과를 다시 만들 수 있어야 해요.

UICollectionViewCell은 item 하나를 표현하며 재사용 과정에서도 콘텐츠, 배경, 선택·하이라이트 상태를 일관되게 구성하는 뷰예요.

## 공식 설명에서 놓치면 안 되는 동작

셀을 그대로 사용하거나 하위 클래스로 만들어 속성과 동작을 추가할 수 있어요. 콘텐츠는 `contentConfiguration`으로 구성하거나 사용자 정의 subview를 `contentView`에 넣어요. 셀 자체에 subview를 바로 추가하지 마세요. 셀은 content view뿐 아니라 기본·선택 배경 등 여러 layer를 관리해요.

`backgroundView`는 기본 배경, `selectedBackgroundView`는 선택·하이라이트 상태의 배경이에요. 더 복잡한 상태별 모양은 `updateConfiguration(using:)`에서 `UICellConfigurationState`를 기준으로 계산해요.

일반적으로 셀 인스턴스를 직접 만들지 않아요. cell registration 또는 재사용 식별자로 타입을 등록하고 `dequeueConfiguredReusableCell`이나 `dequeueReusableCell`로 받아요. 재사용 시 이전 item의 비동기 이미지, accessory, 선택 표시가 남지 않도록 현재 모델만으로 모든 값을 다시 설정하세요.

## 선언과 지원 범위를 확인해요

```swift
@MainActor class UICollectionViewCell
```

**지원 플랫폼:** iOS 6.0+ · iPadOS 6.0+ · Mac Catalyst 13.1+ · tvOS · visionOS 1.0+

## 가장 작은 사용 예제

아래 예제에서는 이 API가 속한 역할이 전체 Collection View 구성에서 어디에 놓이는지 확인해요. 핵심 호출에 집중할 수 있도록 모델 선언과 주변 화면 구성은 생략했어요.

```swift
import UIKit

final class PhotoCell: UICollectionViewCell {
  override func updateConfiguration(using state: UICellConfigurationState) {
    var background = UIBackgroundConfiguration.clear()
    background.backgroundColor = state.isSelected
      ? .systemBlue
      : .secondarySystemBackground
    backgroundConfiguration = background
  }
}
```

## 공식 API 목차대로 살펴봐요

### background 설정하기 (Configuring the background)

동작과 표시 방식을 요구사항에 맞게 설정하는 API예요.

| API                                           | 하는 일                                                      |
| --------------------------------------------- | ------------------------------------------------------------ |
| `defaultBackgroundConfiguration()`            | 현재 셀에 맞는 기본 배경 configuration을 반환해요.           |
| `backgroundConfiguration`                     | 현재 셀에 적용할 배경 configuration이에요.                   |
| `automaticallyUpdatesBackgroundConfiguration` | 셀 상태가 바뀔 때 배경 configuration을 자동 갱신할지 정해요. |
| `backgroundView`                              | 셀의 기본 상태에서 표시할 배경 뷰예요.                       |
| `selectedBackgroundView`                      | 셀이 선택됐을 때 기본 배경 대신 표시할 뷰예요.               |

### content 관리하기 (Managing the content)

동작과 표시 방식을 요구사항에 맞게 설정하는 API예요.

| API                                        | 하는 일                                                        |
| ------------------------------------------ | -------------------------------------------------------------- |
| `contentConfiguration`                     | 셀의 현재 콘텐츠 configuration이에요.                          |
| `automaticallyUpdatesContentConfiguration` | 셀 상태가 바뀔 때 콘텐츠 configuration을 자동 갱신할지 정해요. |
| `contentView`                              | 셀의 사용자 콘텐츠를 넣는 container view예요.                  |

### state 관리하기 (Managing the state)

동작과 표시 방식을 요구사항에 맞게 설정하는 API예요.

| API                                               | 하는 일                                          |
| ------------------------------------------------- | ------------------------------------------------ |
| `configurationState`                              | 선택·하이라이트 등 현재 셀 상태를 모은 값이에요. |
| `setNeedsUpdateConfiguration()`                   | configuration에 새 설정이나 상태를 적용해요.     |
| `updateConfiguration(using:)`                     | configuration을 최신 값으로 갱신해요.            |
| `configurationUpdateHandler`                      | configuration 변화에 실행할 클로저나 처리기예요. |
| `UICollectionViewCell.ConfigurationUpdateHandler` | 셀 변화에 실행할 클로저나 처리기예요.            |
| `isSelected`                                      | 셀이 현재 선택된 상태인지 나타내요.              |
| `isHighlighted`                                   | 셀이 터치로 일시 하이라이트된 상태인지 나타내요. |

### drag state changes 관리하기 (Managing drag state changes)

동작과 표시 방식을 요구사항에 맞게 설정하는 API예요.

| API                              | 하는 일                                                              |
| -------------------------------- | -------------------------------------------------------------------- |
| `dragStateDidChange(_:)`         | 셀의 drag state가 바뀔 때 사용자 정의 모양을 갱신할 기회를 제공해요. |
| `UICollectionViewCell.DragState` | 셀이 lifting·dragging 등 어떤 drag 상태인지 나타내요.                |

## 타입 관계를 확인해요

| 관계              | 타입                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 상속              | `UICollectionReusableView`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| 상속하는 타입     | `UICollectionViewListCell`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| 준수하는 프로토콜 | `CALayerDelegate`, `CLBodyIdentifiable`, `CMBodyIdentifiable`, `CVarArg`, `CustomDebugStringConvertible`, `CustomStringConvertible`, `Equatable`, `Hashable`, `NSCoding`, `NSObjectProtocol`, `NSTouchBarProvider`, `Sendable`, `SendableMetatype`, `UIAccessibilityIdentification`, `UIActivityItemsConfigurationProviding`, `UIAppearance`, `UIAppearanceContainer`, `UICoordinateSpace`, `UIDynamicItem`, `UIFocusEnvironment`, `UIFocusItem`, `UIFocusItemContainer`, `UILargeContentViewerItem`, `UIPasteConfigurationSupporting`, `UIPopoverPresentationControllerSourceItem`, `UIResponderStandardEditActions`, `UITraitChangeObservable`, `UITraitEnvironment`, `UIUserActivityRestoring` |

## 사용할 때 주의할 점

셀 안에 IndexPath를 장기간 저장하거나 비동기 이미지 작업을 취소하지 않으면 재사용 뒤 다른 item의 결과가 나타날 수 있어요. `prepareForReuse()`는 기본값 복구에 사용하고 실제 콘텐츠는 registration이나 configuration에서 매번 설정해요.

## 함께 읽으면 좋은 문서

- [Collection Views 한눈에 보기](./index)
- [Cells 학습 가이드](./cells-and-reusable-views)
- [공식 문서 인벤토리](./official-document-inventory)

## 참고 자료

- [Apple Developer Documentation — UICollectionViewCell](https://developer.apple.com/documentation/uikit/uicollectionviewcell)
