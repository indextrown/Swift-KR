---
title: 'NSCollectionLayoutAnchor'
description: 'NSCollectionLayoutAnchor는 badge 같은 보조 item을 컨테이너나 item의 어느 모서리에 어떤 offset으로 붙일지 정의해요. 주요 API, 사용 예제, 주의점을 함께 정리합니다.'
---

# NSCollectionLayoutAnchor

> **면접 답변 한 줄 요약:** `NSCollectionLayoutAnchor`는 badge 같은 보조 item을 컨테이너나 item의 어느 모서리에 어떤 offset으로 붙일지 정의해요.

Apple 공식 문서의 **Layouts — Appearance** 영역에 있는 클래스예요. 이 페이지는 공식 topic section 순서를 유지하면서 실제 코드에서 무엇을 선택해야 하는지 한국어로 설명해요.

## 먼저 알아둘 용어

| 용어    | 쉬운 뜻                                                        |
| ------- | -------------------------------------------------------------- |
| Item    | 셀 하나가 차지할 크기와 간격을 정의하는 레이아웃 단위예요.     |
| Group   | 여러 item을 가로·세로 또는 사용자 정의 방식으로 묶는 단위예요. |
| Section | group을 반복하고 헤더·배경·스크롤 동작을 설정하는 단위예요.    |

## 이 API가 맡는 역할

보조 item은 셀이나 section의 의미 있는 콘텐츠를, decoration item은 데이터와 무관한 section 배경을 표현해요.

NSCollectionLayoutAnchor는 badge 같은 보조 item을 컨테이너나 item의 어느 모서리에 어떤 offset으로 붙일지 정의해요.

## 개요 (Overview)

Anchor는 supplementary item을 특정 item에 붙일 때 사용해요. Anchor에는 supplementary item을 어디에 붙일지 정하는 다음 정보가 들어 있어요.

- 하나 또는 여러 edge: edge 하나에 붙이거나, 서로 인접한 edge 두 개를 지정해 모서리에 붙일 수 있어요.
- item으로부터의 offset: 기본적으로 supplementary item은 지정한 edge 안쪽에 배치돼요. Anchor를 만들 때 사용자 정의 offset을 전달하면 그 위치를 조정할 수 있어요.

### Edge (Edges)

Anchor의 `leading`과 `trailing` edge가 실제로 놓이는 방향은 LTR과 RTL 환경에서 달라요. LTR 환경에서는 leading이 왼쪽이고 trailing이 오른쪽이에요. RTL 환경에서는 leading이 오른쪽이고 trailing이 왼쪽이에요. 이 동작 덕분에 Collection View Layout이 오른쪽에서 왼쪽으로 읽는 언어에도 대응해요.

다음 그림은 LTR 환경에서 지정한 edge 조합에 따라 Anchor가 배치되는 위치를 보여 줘요.

<!-- Apple DocC image: media-3570665 -->

![top, bottom, leading, trailing edge 조합에 따라 anchor가 놓이는 위치](../assets/apple-docs/media-3570665@2x.png)

### Offset

Anchor offset은 다음 두 방식으로 표현할 수 있어요.

- **Absolute 값:** point 단위로 계산해요. x offset이 `30.0`이면 supplementary item의 원점을 x축 양의 방향으로 30 point 이동해요.
- **Fractional 값:** supplementary item 자체의 dimension에 대한 비율로 계산해요. x offset이 `0.3`이면 supplementary item 원점을 자신의 width 30%만큼 x축 양의 방향으로 이동해요.

다음 코드는 기본 badge를 만들고 item의 top-trailing 모서리에 붙여요.

```swift
let itemSize = NSCollectionLayoutSize(widthDimension: .absolute(44),
                                     heightDimension: .absolute(44))

let badgeAnchor = NSCollectionLayoutAnchor(edges: [.top, .trailing],
                                fractionalOffset: CGPoint(x: 0.3, y: -0.3))

let badgeSize = NSCollectionLayoutSize(widthDimension: .absolute(20),
                                      heightDimension: .absolute(20))

let badge = NSCollectionLayoutSupplementaryItem(layoutSize: badgeSize,
                                               elementKind: "badge",
                                           containerAnchor: badgeAnchor)

let item = NSCollectionLayoutItem(layoutSize: itemSize,
                          supplementaryItems: [badge])

```

## 선언과 지원 범위를 확인해요

```swift
@MainActor class NSCollectionLayoutAnchor
```

**지원 플랫폼:** iOS 13.0+ · iPadOS 13.0+ · Mac Catalyst 13.1+ · tvOS 13.0+ · visionOS 1.0+

## 가장 작은 사용 예제

아래 예제에서는 이 API가 속한 역할이 전체 Collection View 구성에서 어디에 놓이는지 확인해요. 핵심 호출에 집중할 수 있도록 모델 선언과 주변 화면 구성은 생략했어요.

```swift
import UIKit

let badgeAnchor = NSCollectionLayoutAnchor(
  edges: [.top, .trailing],
  fractionalOffset: CGPoint(x: 0.5, y: -0.5)
)
let badge = NSCollectionLayoutSupplementaryItem(
  layoutSize: .init(
    widthDimension: .absolute(24),
    heightDimension: .absolute(24)
  ),
  elementKind: "badge",
  containerAnchor: badgeAnchor
)
```

## 공식 API 목차대로 살펴봐요

### anchor 만들기 (Creating an anchor)

`NSCollectionLayoutAnchor`를 만들거나 필요한 구성 요소를 연결하는 API예요.

| API                             | 하는 일                                     |
| ------------------------------- | ------------------------------------------- |
| `init(edges:)`                  | 지정한 edge와 offset으로 anchor를 만들어요. |
| `init(edges:absoluteOffset:)`   | 지정한 edge와 offset으로 anchor를 만들어요. |
| `init(edges:fractionalOffset:)` | 지정한 edge와 offset으로 anchor를 만들어요. |

### edges 확인하기 (Getting the edges)

현재 상태에서 필요한 값이나 위치를 안전하게 조회하는 API예요.

| API     | 하는 일                        |
| ------- | ------------------------------ |
| `edges` | anchor가 붙을 edge 집합이에요. |

### offset 확인하기 (Getting the offset)

현재 상태에서 필요한 값이나 위치를 안전하게 조회하는 API예요.

| API                  | 하는 일                                                 |
| -------------------- | ------------------------------------------------------- |
| `offset`             | anchor가 기준 edge에서 이동할 offset이에요.             |
| `isAbsoluteOffset`   | `offset`이 point 단위 absolute 값인지 나타내요.         |
| `isFractionalOffset` | `offset`이 요소 크기 비율인 fractional 값인지 나타내요. |

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

- [Apple Developer Documentation — NSCollectionLayoutAnchor](https://developer.apple.com/documentation/uikit/nscollectionlayoutanchor)
