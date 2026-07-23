---
title: 'UICollectionViewFlowLayout'
description: 'UICollectionViewFlowLayout은 item을 한 줄씩 채워 나가는 격자 배치와 section inset, 간격, 헤더·푸터, 고정 동작을 제공해요. 주요 API, 사용 예제, 주의점을 함께 정리합니다.'
---

# UICollectionViewFlowLayout

> **면접 답변 한 줄 요약:** `UICollectionViewFlowLayout`은 item을 한 줄씩 채워 나가는 격자 배치와 section inset, 간격, 헤더·푸터, 고정 동작을 제공해요.

Apple 공식 문서의 **Layouts — Manual layouts** 영역에 있는 클래스예요. 이 페이지는 공식 topic section 순서를 유지하면서 실제 코드에서 무엇을 선택해야 하는지 한국어로 설명해요.

## 먼저 알아둘 용어

| 용어    | 쉬운 뜻                                                        |
| ------- | -------------------------------------------------------------- |
| Item    | 셀 하나가 차지할 크기와 간격을 정의하는 레이아웃 단위예요.     |
| Group   | 여러 item을 가로·세로 또는 사용자 정의 방식으로 묶는 단위예요. |
| Section | group을 반복하고 헤더·배경·스크롤 동작을 설정하는 단위예요.    |

## 이 API가 맡는 역할

`UICollectionViewLayout` 하위 클래스는 `prepare()`에서 결과를 준비하고 요청된 rect와 IndexPath에 맞는 attributes를 반환해요.

UICollectionViewFlowLayout은 item을 한 줄씩 채워 나가는 격자 배치와 section inset, 간격, 헤더·푸터, 고정 동작을 제공해요.

## 개요 (Overview)

Flow Layout은 Collection View Layout의 한 종류예요. 스크롤 방향에 따라 item을 한 행이나 한 열에 들어갈 수 있는 만큼 배치한 뒤 다음 행이나 열로 이어 가요. 모든 셀의 크기를 같게 만들 수도 있고 서로 다르게 만들 수도 있어요.

Flow Layout은 Collection View의 delegate와 협력해 각 section과 grid의 item, header, footer 크기를 정해요. 이 delegate는 `UICollectionViewDelegateFlowLayout`을 준수해야 해요. delegate를 사용하면 grid item마다 서로 다른 크기를 반환하는 것처럼 layout 정보를 동적으로 조정할 수 있어요. delegate가 값을 제공하지 않으면 Flow Layout은 이 class의 프로퍼티에 설정한 기본값을 사용해요.

Flow Layout은 한 방향의 길이는 고정하고 다른 방향의 길이는 스크롤할 수 있게 콘텐츠를 배치해요. 세로로 스크롤하는 grid에서는 콘텐츠 width가 Collection View width에 맞춰지고, 콘텐츠 height는 section과 item 수에 따라 동적으로 늘어나요. 기본 스크롤 방향은 세로이며 `scrollDirection`으로 바꿀 수 있어요.

각 section은 별도의 header와 footer를 가질 수 있어요. header나 footer를 표시하려면 delegate 메서드에서 0이 아닌 크기를 반환하거나 `headerReferenceSize`, `footerReferenceSize`에 크기를 지정해요. 크기가 `.zero`이면 대응하는 supplementary view는 Collection View에 추가되지 않아요.

## 선언과 지원 범위를 확인해요

```swift
@MainActor class UICollectionViewFlowLayout
```

**지원 플랫폼:** iOS 6.0+ · iPadOS 6.0+ · Mac Catalyst 13.1+ · tvOS · visionOS 1.0+

## 가장 작은 사용 예제

아래 예제에서는 이 API가 속한 역할이 전체 Collection View 구성에서 어디에 놓이는지 확인해요. 핵심 호출에 집중할 수 있도록 모델 선언과 주변 화면 구성은 생략했어요.

```swift
import UIKit

let flowLayout = UICollectionViewFlowLayout()
flowLayout.scrollDirection = .vertical
flowLayout.itemSize = CGSize(width: 120, height: 120)
flowLayout.minimumInteritemSpacing = 8
flowLayout.minimumLineSpacing = 12
flowLayout.sectionHeadersPinToVisibleBounds = true
```

## 공식 API 목차대로 살펴봐요

### flow layout 설정하기 (Configuring the flow layout)

동작과 표시 방식을 요구사항에 맞게 설정하는 API예요.

| API                                  | 하는 일                                             |
| ------------------------------------ | --------------------------------------------------- |
| `UICollectionViewDelegateFlowLayout` | 레이아웃 관련 판단과 이벤트 처리를 위임할 객체예요. |

### scroll direction 설정하기 (Configuring the scroll direction)

동작과 표시 방식을 요구사항에 맞게 설정하는 API예요.

| API                                | 하는 일                                    |
| ---------------------------------- | ------------------------------------------ |
| `scrollDirection`                  | Flow Layout의 가로·세로 스크롤 방향이에요. |
| `UICollectionView.ScrollDirection` | Flow Layout의 주 스크롤 방향을 나타내요.   |

### item spacing 설정하기 (Configuring item spacing)

동작과 표시 방식을 요구사항에 맞게 설정하는 API예요.

| API                                                | 하는 일                                                                            |
| -------------------------------------------------- | ---------------------------------------------------------------------------------- |
| `minimumLineSpacing`                               | Flow Layout 행 또는 열 사이 최소 간격이에요.                                       |
| `minimumInteritemSpacing`                          | 같은 행이나 열의 item 사이 최소 간격이에요.                                        |
| `itemSize`                                         | Flow Layout item의 기본 크기예요.                                                  |
| `estimatedItemSize`                                | self-sizing cell을 측정하기 전의 예상 크기예요.                                    |
| `automaticSize`                                    | Collection View가 콘텐츠와 layout으로 계산하는 자동 item 크기예요.                 |
| `sectionInset`                                     | Flow Layout section 둘레의 inset이에요.                                            |
| `sectionInsetReference`                            | section inset 계산의 기준 영역이에요.                                              |
| `UICollectionViewFlowLayout.SectionInsetReference` | section inset을 safe area·content inset·layout margin 중 어디서 계산할지 나타내요. |

### headers and footers 설정하기 (Configuring headers and footers)

동작과 표시 방식을 요구사항에 맞게 설정하는 API예요.

| API                               | 하는 일                                                  |
| --------------------------------- | -------------------------------------------------------- |
| `headerReferenceSize`             | Flow Layout header의 기본 크기예요. 0이면 만들지 않아요. |
| `footerReferenceSize`             | Flow Layout footer의 기본 크기예요. 0이면 만들지 않아요. |
| `Flow layout supplementary views` | 보조 뷰 구현 흐름을 설명하는 관련 문서예요.              |

### headers and footers 고정하기 (Pinning headers and footers)

`UICollectionViewFlowLayout`에서 Pinning headers and footers 책임을 담당하는 API예요.

| API                                | 하는 일                                         |
| ---------------------------------- | ----------------------------------------------- |
| `sectionHeadersPinToVisibleBounds` | section header를 보이는 경계에 고정할지 정해요. |
| `sectionFootersPinToVisibleBounds` | section footer를 보이는 경계에 고정할지 정해요. |

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

- [Apple Developer Documentation — UICollectionViewFlowLayout](https://developer.apple.com/documentation/uikit/uicollectionviewflowlayout)
