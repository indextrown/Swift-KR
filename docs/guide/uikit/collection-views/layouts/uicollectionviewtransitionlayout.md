---
title: 'UICollectionViewTransitionLayout'
description: 'UICollectionViewTransitionLayout은 두 Collection View Layout 사이 전환 진행률과 사용자 정의 애니메이션 값을 관리해요. 주요 API, 사용 예제, 주의점을 함께 정리합니다.'
---

# UICollectionViewTransitionLayout

> **면접 답변 한 줄 요약:** `UICollectionViewTransitionLayout`은 두 Collection View Layout 사이 전환 진행률과 사용자 정의 애니메이션 값을 관리해요.

Apple 공식 문서의 **Layouts — Manual layouts** 영역에 있는 클래스예요. 이 페이지는 공식 topic section 순서를 유지하면서 실제 코드에서 무엇을 선택해야 하는지 한국어로 설명해요.

## 먼저 알아둘 용어

| 용어    | 쉬운 뜻                                                        |
| ------- | -------------------------------------------------------------- |
| Item    | 셀 하나가 차지할 크기와 간격을 정의하는 레이아웃 단위예요.     |
| Group   | 여러 item을 가로·세로 또는 사용자 정의 방식으로 묶는 단위예요. |
| Section | group을 반복하고 헤더·배경·스크롤 동작을 설정하는 단위예요.    |

## 이 API가 맡는 역할

`UICollectionViewLayout` 하위 클래스는 `prepare()`에서 결과를 준비하고 요청된 rect와 IndexPath에 맞는 attributes를 반환해요.

UICollectionViewTransitionLayout은 두 Collection View Layout 사이 전환 진행률과 사용자 정의 애니메이션 값을 관리해요.

## 선언과 지원 범위를 확인해요

```swift
@MainActor class UICollectionViewTransitionLayout
```

**지원 플랫폼:** iOS 7.0+ · iPadOS 7.0+ · Mac Catalyst 13.1+ · tvOS · visionOS 1.0+

## 가장 작은 사용 예제

아래 예제에서는 이 API가 속한 역할이 전체 Collection View 구성에서 어디에 놓이는지 확인해요. 핵심 호출에 집중할 수 있도록 모델 선언과 주변 화면 구성은 생략했어요.

```swift
import UIKit

let transition = UICollectionViewTransitionLayout(
  currentLayout: gridLayout,
  nextLayout: listLayout
)
transition.transitionProgress = gestureProgress
transition.updateValue(cardScale, forAnimatedKey: "cardScale")
```

## 공식 API 목차대로 살펴봐요

### Initializing the transition layout object

`UICollectionViewTransitionLayout`를 만들거나 필요한 구성 요소를 연결하는 API예요.

| API                               | 하는 일                                                        |
| --------------------------------- | -------------------------------------------------------------- |
| `init(currentLayout:nextLayout:)` | 현재 layout과 다음 layout 사이의 transition layout을 만들어요. |
| `init(coder:)`                    | NSCoder에 저장된 구성으로 인스턴스를 복원해요.                 |

### the transition information 갱신하기 (Updating the transition information)

데이터 또는 화면 상태를 변경할 때 사용하는 API예요. 모델과 표시 상태의 순서를 함께 확인해요.

| API                              | 하는 일                                                 |
| -------------------------------- | ------------------------------------------------------- |
| `transitionProgress`             | 기존 layout에서 새 layout로 전환한 진행률이에요.        |
| `updateValue(_:forAnimatedKey:)` | 레이아웃 전환을 최신 값으로 갱신해요.                   |
| `value(forAnimatedKey:)`         | transition 중 사용자 정의 key의 현재 보간값을 반환해요. |

### layout objects 접근하기 (Accessing the layout objects)

현재 상태에서 필요한 값이나 위치를 안전하게 조회하는 API예요.

| API             | 하는 일                                  |
| --------------- | ---------------------------------------- |
| `currentLayout` | 전환을 시작한 기존 layout이에요.         |
| `nextLayout`    | 전환이 끝났을 때 적용할 새 layout이에요. |

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

- [Apple Developer Documentation — UICollectionViewTransitionLayout](https://developer.apple.com/documentation/uikit/uicollectionviewtransitionlayout)
