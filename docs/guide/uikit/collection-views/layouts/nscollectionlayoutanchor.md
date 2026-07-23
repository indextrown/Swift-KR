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

<!-- Apple DocC image: media-3570665 -->

![top, bottom, leading, trailing edge 조합에 따라 anchor가 놓이는 위치](../assets/apple-docs/media-3570665@2x.png)

## 공식 설명에서 놓치면 안 되는 동작

anchor는 supplementary item을 특정 item이나 container에 붙일 edge와 offset을 담아요. 한 edge를 지정하면 변 중앙에, 인접한 두 edge를 지정하면 모서리에 붙어요.

offset을 생략하면 anchor는 지정한 edge 안쪽에 놓여요. `absoluteOffset`은 point, `fractionalOffset`은 supplementary item 크기 비율로 중심을 이동해 badge 일부를 셀 밖으로 내보낼 수 있어요. leading/trailing은 읽기 방향에 맞춰 자동으로 바뀌어요.

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
