---
title: 'NSCollectionLayoutEnvironment'
description: 'NSCollectionLayoutEnvironment는 section을 만들 때 컨테이너 크기와 size class, 화면 배율 같은 trait 정보를 제공해요. 주요 API, 사용 예제, 주의점을 함께 정리합니다.'
---

# NSCollectionLayoutEnvironment

> **면접 답변 한 줄 요약:** `NSCollectionLayoutEnvironment`는 section을 만들 때 컨테이너 크기와 size class, 화면 배율 같은 trait 정보를 제공해요.

Apple 공식 문서의 **Layouts — Configuration** 영역에 있는 프로토콜예요. 이 페이지는 공식 topic section 순서를 유지하면서 실제 코드에서 무엇을 선택해야 하는지 한국어로 설명해요.

## 먼저 알아둘 용어

| 용어    | 쉬운 뜻                                                        |
| ------- | -------------------------------------------------------------- |
| Item    | 셀 하나가 차지할 크기와 간격을 정의하는 레이아웃 단위예요.     |
| Group   | 여러 item을 가로·세로 또는 사용자 정의 방식으로 묶는 단위예요. |
| Section | group을 반복하고 헤더·배경·스크롤 동작을 설정하는 단위예요.    |

## 이 API가 맡는 역할

Configuration과 section provider를 사용하면 전체 스크롤 방향과 각 section의 배치를 환경에 맞게 동적으로 결정할 수 있어요.

NSCollectionLayoutEnvironment는 section을 만들 때 컨테이너 크기와 size class, 화면 배율 같은 trait 정보를 제공해요.

## 개요 (Overview)

Section Provider에서는 Layout Environment를 사용해 현재 layout이 표시되는 맥락을 확인해요. `container`에서 크기와 content inset을 가져오고, 환경 trait에서 size class, display scale, 사용자 인터페이스 idiom 같은 정보를 확인할 수 있어요. Section을 만들 때 이 정보를 이용하면 현재 화면 환경에 적합한 배치를 선택할 수 있어요.

다음 코드는 Layout Environment의 trait collection을 확인해 Dark Mode 여부에 따라 다른 section을 반환해요.

```swift
let layout = UICollectionViewCompositionalLayout { (sectionIndex: Int,
    layoutEnvironment: NSCollectionLayoutEnvironment) -> NSCollectionLayoutSection in

    if layoutEnvironment.traitCollection.userInterfaceStyle == .dark {
        return sectionForUserInterfaceStyle(.dark)
    } else {
        return sectionForUserInterfaceStyle(.light)
    }
}
```

## 선언과 지원 범위를 확인해요

```swift
@MainActor protocol NSCollectionLayoutEnvironment : NSObjectProtocol
```

**지원 플랫폼:** iOS 13.0+ · iPadOS 13.0+ · Mac Catalyst 13.1+ · tvOS 13.0+ · visionOS 1.0+

## 가장 작은 사용 예제

아래 예제에서는 이 API가 속한 역할이 전체 Collection View 구성에서 어디에 놓이는지 확인해요. 핵심 호출에 집중할 수 있도록 모델 선언과 주변 화면 구성은 생략했어요.

```swift
import UIKit

let layout = UICollectionViewCompositionalLayout {
  (_: Int, environment: any NSCollectionLayoutEnvironment) in
  let width = environment.container.effectiveContentSize.width
  return makeGridSection(columnCount: width >= 600 ? 4 : 2)
}
```

## 공식 API 목차대로 살펴봐요

### layout’s container 확인하기 (Getting the layout’s container)

현재 상태에서 필요한 값이나 위치를 안전하게 조회하는 API예요.

| API         | 하는 일                                            |
| ----------- | -------------------------------------------------- |
| `container` | 현재 section을 배치하는 layout container 정보예요. |

### trait collection 확인하기 (Getting the trait collection)

현재 상태에서 필요한 값이나 위치를 안전하게 조회하는 API예요.

| API               | 하는 일                            |
| ----------------- | ---------------------------------- |
| `traitCollection` | 현재 layout 환경의 trait 정보예요. |

## 타입 관계를 확인해요

| 관계 | 타입               |
| ---- | ------------------ |
| 상속 | `NSObjectProtocol` |

## 사용할 때 주의할 점

비율 크기는 바로 바깥 컨테이너를 기준으로 계산해요. 예상 크기를 사용한다면 셀이 Auto Layout으로 실제 높이를 계산할 수 있어야 하며, layout 객체와 데이터 상태의 책임을 섞지 않아요.

## 함께 읽으면 좋은 문서

- [Collection Views 한눈에 보기](./../index)
- [레이아웃 학습 가이드](../layout-guide)
- [공식 문서 인벤토리](./../official-document-inventory)

## 참고 자료

- [Apple Developer Documentation — NSCollectionLayoutEnvironment](https://developer.apple.com/documentation/uikit/nscollectionlayoutenvironment)
