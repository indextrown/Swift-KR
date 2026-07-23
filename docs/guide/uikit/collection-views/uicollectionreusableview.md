---
title: 'UICollectionReusableView'
description: 'UICollectionReusableView는 셀과 헤더·푸터 같은 보조 뷰가 공통으로 따르는 재사용 및 레이아웃 갱신 동작을 정의해요. 주요 API, 사용 예제, 주의점을 함께 정리합니다.'
---

# UICollectionReusableView

> **면접 답변 한 줄 요약:** `UICollectionReusableView`는 셀과 헤더·푸터 같은 보조 뷰가 공통으로 따르는 재사용 및 레이아웃 갱신 동작을 정의해요.

Apple 공식 문서의 **Collection Views — Cells** 영역에 있는 클래스예요. 이 페이지는 공식 topic section 순서를 유지하면서 실제 코드에서 무엇을 선택해야 하는지 한국어로 설명해요.

## 먼저 알아둘 용어

| 용어                | 쉬운 뜻                                                               |
| ------------------- | --------------------------------------------------------------------- |
| Cell                | item 하나의 콘텐츠와 상태를 화면에 표현하는 재사용 가능한 뷰예요.     |
| Reusable View       | 헤더·푸터처럼 Collection View가 재사용하는 보조 뷰의 기반 타입이에요. |
| Configuration State | 선택, 하이라이트, 비활성화 같은 현재 셀 상태를 모은 값이에요.         |

## 이 API가 맡는 역할

셀 계층은 모델의 현재 상태를 뷰 구성으로 변환해요. 재사용될 때 이전 item의 이미지나 선택 표시가 남지 않도록, 현재 모델과 configuration state만으로 결과를 다시 만들 수 있어야 해요.

UICollectionReusableView는 셀과 헤더·푸터 같은 보조 뷰가 공통으로 따르는 재사용 및 레이아웃 갱신 동작을 정의해요.

## 개요 (Overview)

재사용 뷰라는 이름은 화면의 보이는 영역 밖으로 스크롤됐을 때 Collection View가 뷰를 삭제하지 않고 reuse queue에 넣는 동작에서 나왔어요. Queue에 들어간 뷰는 나중에 꺼내 다른 콘텐츠를 표시하도록 다시 구성할 수 있어요.

### 하위 클래스 구현 시 참고할 점 (Subclassing notes)

이 class는 하위 클래스를 만들어 사용하도록 설계됐어요. class에 정의된 메서드 대부분은 기본 구현이 없거나 최소한의 동작만 제공해요. 반드시 재정의해야 하는 메서드는 없지만, 뷰의 사용 방식이나 layout 변화에 대응해야 할 때 필요한 메서드를 재정의할 수 있어요.

## 선언과 지원 범위를 확인해요

```swift
@MainActor class UICollectionReusableView
```

**지원 플랫폼:** iOS 6.0+ · iPadOS 6.0+ · Mac Catalyst 13.1+ · tvOS · visionOS 1.0+

## 가장 작은 사용 예제

아래 예제에서는 이 API가 속한 역할이 전체 Collection View 구성에서 어디에 놓이는지 확인해요. 핵심 호출에 집중할 수 있도록 모델 선언과 주변 화면 구성은 생략했어요.

```swift
import UIKit

final class SectionHeaderView: UICollectionReusableView {
  let titleLabel = UILabel()

  override init(frame: CGRect) {
    super.init(frame: frame)
    addSubview(titleLabel)
  }

  required init?(coder: NSCoder) {
    fatalError("init(coder:) has not been implemented")
  }

  override func prepareForReuse() {
    super.prepareForReuse()
    titleLabel.text = nil
  }
}
```

## 공식 API 목차대로 살펴봐요

### Reusing cells

`UICollectionReusableView`에서 Reusing cells 책임을 담당하는 API예요.

| API                 | 하는 일                                    |
| ------------------- | ------------------------------------------ |
| `reuseIdentifier`   | 등록과 dequeue에 사용한 재사용 식별자예요. |
| `prepareForReuse()` | 셀을 사용하기 전에 필요한 상태를 준비해요. |

### layout changes 관리하기 (Managing layout changes)

동작과 표시 방식을 요구사항에 맞게 설정하는 API예요.

| API                                    | 하는 일                                                        |
| -------------------------------------- | -------------------------------------------------------------- |
| `preferredLayoutAttributesFitting(_:)` | Auto Layout 측정을 반영한 선호 layout attributes를 반환해요.   |
| `apply(_:)`                            | 레이아웃을 현재 화면 상태에 적용해요.                          |
| `willTransition(from:to:)`             | layout 전환이나 update 전후의 임시 상태를 준비하거나 정리해요. |
| `didTransition(from:to:)`              | layout 전환이나 update 전후의 임시 상태를 준비하거나 정리해요. |

## 타입 관계를 확인해요

| 관계              | 타입                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 상속              | `UIView`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| 상속하는 타입     | `UICollectionViewCell`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| 준수하는 프로토콜 | `CALayerDelegate`, `CLBodyIdentifiable`, `CMBodyIdentifiable`, `CVarArg`, `CustomDebugStringConvertible`, `CustomStringConvertible`, `Equatable`, `Hashable`, `NSCoding`, `NSObjectProtocol`, `NSTouchBarProvider`, `Sendable`, `SendableMetatype`, `UIAccessibilityIdentification`, `UIActivityItemsConfigurationProviding`, `UIAppearance`, `UIAppearanceContainer`, `UICoordinateSpace`, `UIDynamicItem`, `UIFocusEnvironment`, `UIFocusItem`, `UIFocusItemContainer`, `UILargeContentViewerItem`, `UIPasteConfigurationSupporting`, `UIPopoverPresentationControllerSourceItem`, `UIResponderStandardEditActions`, `UITraitChangeObservable`, `UITraitEnvironment`, `UIUserActivityRestoring` |

## 사용할 때 주의할 점

셀 안에 IndexPath를 장기간 저장하거나 비동기 이미지 작업을 취소하지 않으면 재사용 뒤 다른 item의 결과가 나타날 수 있어요. `prepareForReuse()`는 기본값 복구에 사용하고 실제 콘텐츠는 registration이나 configuration에서 매번 설정해요.

## 함께 읽으면 좋은 문서

- [Collection Views 한눈에 보기](./index)
- [Cells 학습 가이드](./cells-and-reusable-views)
- [공식 문서 인벤토리](./official-document-inventory)

## 참고 자료

- [Apple Developer Documentation — UICollectionReusableView](https://developer.apple.com/documentation/uikit/uicollectionreusableview)
