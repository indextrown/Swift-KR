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

| API                                | 하는 일                                                        |
| ---------------------------------- | -------------------------------------------------------------- |
| `scrollDirection`                  | 관련 값과 동작의 현재 값이나 설정을 읽고 필요한 경우 변경해요. |
| `UICollectionView.ScrollDirection` | 관련 값과 동작의 현재 값이나 설정을 읽고 필요한 경우 변경해요. |

### item spacing 설정하기 (Configuring item spacing)

동작과 표시 방식을 요구사항에 맞게 설정하는 API예요.

| API                                                | 하는 일                                                  |
| -------------------------------------------------- | -------------------------------------------------------- |
| `minimumLineSpacing`                               | 간격의 현재 값이나 설정을 읽고 필요한 경우 변경해요.     |
| `minimumInteritemSpacing`                          | 간격의 현재 값이나 설정을 읽고 필요한 경우 변경해요.     |
| `itemSize`                                         | 간격의 현재 값이나 설정을 읽고 필요한 경우 변경해요.     |
| `estimatedItemSize`                                | 간격의 현재 값이나 설정을 읽고 필요한 경우 변경해요.     |
| `automaticSize`                                    | 간격의 현재 값이나 설정을 읽고 필요한 경우 변경해요.     |
| `sectionInset`                                     | inset의 현재 값이나 설정을 읽고 필요한 경우 변경해요.    |
| `sectionInsetReference`                            | inset의 현재 값이나 설정을 읽고 필요한 경우 변경해요.    |
| `UICollectionViewFlowLayout.SectionInsetReference` | 레이아웃의 현재 값이나 설정을 읽고 필요한 경우 변경해요. |

### headers and footers 설정하기 (Configuring headers and footers)

동작과 표시 방식을 요구사항에 맞게 설정하는 API예요.

| API                               | 하는 일                                              |
| --------------------------------- | ---------------------------------------------------- |
| `headerReferenceSize`             | 크기의 현재 값이나 설정을 읽고 필요한 경우 변경해요. |
| `footerReferenceSize`             | 크기의 현재 값이나 설정을 읽고 필요한 경우 변경해요. |
| `Flow layout supplementary views` | 보조 뷰 구현 흐름을 설명하는 관련 문서예요.          |

### headers and footers 고정하기 (Pinning headers and footers)

`UICollectionViewFlowLayout`에서 Pinning headers and footers 책임을 담당하는 API예요.

| API                                | 하는 일                                                     |
| ---------------------------------- | ----------------------------------------------------------- |
| `sectionHeadersPinToVisibleBounds` | 위치와 영역의 현재 값이나 설정을 읽고 필요한 경우 변경해요. |
| `sectionFootersPinToVisibleBounds` | 위치와 영역의 현재 값이나 설정을 읽고 필요한 경우 변경해요. |

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
