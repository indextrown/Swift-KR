---
title: 'NSCollectionLayoutDimension'
description: 'NSCollectionLayoutDimension은 절대값, 부모 대비 비율, 예상값 중 하나로 item과 group의 너비 또는 높이를 표현해요. 주요 API, 사용 예제, 주의점을 함께 정리합니다.'
---

# NSCollectionLayoutDimension

> **면접 답변 한 줄 요약:** `NSCollectionLayoutDimension`은 절대값, 부모 대비 비율, 예상값 중 하나로 item과 group의 너비 또는 높이를 표현해요.

Apple 공식 문서의 **Layouts — Size and spacing** 영역에 있는 클래스예요. 이 페이지는 공식 topic section 순서를 유지하면서 실제 코드에서 무엇을 선택해야 하는지 한국어로 설명해요.

## 먼저 알아둘 용어

| 용어    | 쉬운 뜻                                                        |
| ------- | -------------------------------------------------------------- |
| Item    | 셀 하나가 차지할 크기와 간격을 정의하는 레이아웃 단위예요.     |
| Group   | 여러 item을 가로·세로 또는 사용자 정의 방식으로 묶는 단위예요. |
| Section | group을 반복하고 헤더·배경·스크롤 동작을 설정하는 단위예요.    |

## 이 API가 맡는 역할

크기는 절대값·비율·예상값으로 표현하고, content inset은 요소 안쪽을 줄이며 edge spacing은 요소 바깥 간격을 예약해요.

NSCollectionLayoutDimension은 절대값, 부모 대비 비율, 예상값 중 하나로 item과 group의 너비 또는 높이를 표현해요.

## 공식 설명에서 놓치면 안 되는 동작

item과 group은 width와 height dimension을 하나씩 가져 명시적인 size를 만들어요.

- `.absolute(44)`는 항상 44 point예요.
- `.fractionalWidth(0.5)`는 바로 바깥 컨테이너 폭의 절반이에요.
- `.fractionalHeight(1)`은 바로 바깥 컨테이너 높이 전체예요.
- `.estimated(120)`은 초기 예상값이고 Auto Layout과 콘텐츠 측정으로 실제 크기를 결정해요.

```swift
let fixedSquare = NSCollectionLayoutSize(
  widthDimension: .absolute(44),
  heightDimension: .absolute(44)
)

let selfSizing = NSCollectionLayoutSize(
  widthDimension: .fractionalWidth(1),
  heightDimension: .estimated(120)
)
```

```swift
let fractionalSquare = NSCollectionLayoutSize(
  widthDimension: .fractionalWidth(0.2),
  heightDimension: .fractionalWidth(0.2)
)
```

비율의 기준은 화면 전체가 아니라 **직접 감싸는 group 또는 container**예요. estimated height를 쓰려면 셀 내부 Auto Layout 제약이 실제 높이를 결정할 수 있어야 해요.

## 선언과 지원 범위를 확인해요

```swift
@MainActor class NSCollectionLayoutDimension
```

**지원 플랫폼:** iOS 13.0+ · iPadOS 13.0+ · Mac Catalyst 13.1+ · tvOS 13.0+ · visionOS 1.0+

## 가장 작은 사용 예제

아래 예제에서는 이 API가 속한 역할이 전체 Collection View 구성에서 어디에 놓이는지 확인해요. 핵심 호출에 집중할 수 있도록 모델 선언과 주변 화면 구성은 생략했어요.

```swift
import UIKit

let width: NSCollectionLayoutDimension = .fractionalWidth(1)
let height: NSCollectionLayoutDimension = .estimated(120)
let size = NSCollectionLayoutSize(
  widthDimension: width,
  heightDimension: height
)
```

## 공식 API 목차대로 살펴봐요

### dimension 만들기 (Creating a dimension)

`NSCollectionLayoutDimension`를 만들거나 필요한 구성 요소를 연결하는 API예요.

| API                                | 하는 일                                                          |
| ---------------------------------- | ---------------------------------------------------------------- |
| `absolute(_:)`                     | point 단위의 고정 dimension을 만들어요.                          |
| `estimated(_:)`                    | 콘텐츠를 측정하기 전 사용할 예상 dimension을 만들어요.           |
| `fractionalHeight(_:)`             | 바깥 container 높이에 대한 비율 dimension을 만들어요.            |
| `fractionalWidth(_:)`              | 바깥 container 폭에 대한 비율 dimension을 만들어요.              |
| `uniformAcrossSiblings(estimate:)` | 형제 요소가 같은 측정 크기를 공유하는 예상 dimension을 만들어요. |

### dimension value 확인하기 (Getting the dimension value)

현재 상태에서 필요한 값이나 위치를 안전하게 조회하는 API예요.

| API         | 하는 일                                                    |
| ----------- | ---------------------------------------------------------- |
| `dimension` | dimension에 저장된 absolute·estimated·fractional 수치예요. |

### dimension type 확인하기 (Getting the dimension type)

현재 상태에서 필요한 값이나 위치를 안전하게 조회하는 API예요.

| API                       | 하는 일                                                       |
| ------------------------- | ------------------------------------------------------------- |
| `isAbsolute`              | point 단위의 고정 dimension인지 나타내요.                     |
| `isEstimated`             | 런타임 측정을 위한 예상 dimension인지 나타내요.               |
| `isFractionalHeight`      | container 높이 비율 dimension인지 나타내요.                   |
| `isFractionalWidth`       | container 폭 비율 dimension인지 나타내요.                     |
| `isUniformAcrossSiblings` | 형제 요소가 같은 측정 크기를 공유하는 dimension인지 나타내요. |

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

- [Apple Developer Documentation — NSCollectionLayoutDimension](https://developer.apple.com/documentation/uikit/nscollectionlayoutdimension)
