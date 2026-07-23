---
title: 'UICollectionViewCompositionalLayoutSectionProvider'
description: 'UICollectionViewCompositionalLayoutSectionProvider는 section 번호와 환경을 받아 해당 section의 레이아웃을 동적으로 반환하는 클로저예요. 주요 API, 사용 예제, 주의점을 함께 정리합니다.'
---

# UICollectionViewCompositionalLayoutSectionProvider

> **면접 답변 한 줄 요약:** `UICollectionViewCompositionalLayoutSectionProvider`는 section 번호와 환경을 받아 해당 section의 레이아웃을 동적으로 반환하는 클로저예요.

Apple 공식 문서의 **Layouts — Configuration** 영역에 있는 타입 별칭예요. 이 페이지는 공식 topic section 순서를 유지하면서 실제 코드에서 무엇을 선택해야 하는지 한국어로 설명해요.

## 먼저 알아둘 용어

| 용어    | 쉬운 뜻                                                        |
| ------- | -------------------------------------------------------------- |
| Item    | 셀 하나가 차지할 크기와 간격을 정의하는 레이아웃 단위예요.     |
| Group   | 여러 item을 가로·세로 또는 사용자 정의 방식으로 묶는 단위예요. |
| Section | group을 반복하고 헤더·배경·스크롤 동작을 설정하는 단위예요.    |

## 이 API가 맡는 역할

Configuration과 section provider를 사용하면 전체 스크롤 방향과 각 section의 배치를 환경에 맞게 동적으로 결정할 수 있어요.

UICollectionViewCompositionalLayoutSectionProvider는 section 번호와 환경을 받아 해당 section의 레이아웃을 동적으로 반환하는 클로저예요.

## 선언과 지원 범위를 확인해요

```swift
typealias UICollectionViewCompositionalLayoutSectionProvider = (Int, any NSCollectionLayoutEnvironment) -> NSCollectionLayoutSection?
```

**지원 플랫폼:** iOS · iPadOS · Mac Catalyst · tvOS · visionOS

## 가장 작은 사용 예제

아래 예제에서는 이 API가 속한 역할이 전체 Collection View 구성에서 어디에 놓이는지 확인해요. 핵심 호출에 집중할 수 있도록 모델 선언과 주변 화면 구성은 생략했어요.

```swift
import UIKit

let sectionProvider:
  UICollectionViewCompositionalLayoutSectionProvider = {
    sectionIndex, environment in
    makeSection(at: sectionIndex, environment: environment)
  }

let layout = UICollectionViewCompositionalLayout(
  sectionProvider: sectionProvider
)
```

## 호출 규칙을 이해해요

이 타입 별칭은 독립적으로 호출하기보다 위 예제의 레이아웃·데이터·상호작용 구성 과정에서 사용해요. 선언의 매개변수와 반환값을 현재 section의 책임에 맞춰 읽으면 돼요.

## 사용할 때 주의할 점

비율 크기는 바로 바깥 컨테이너를 기준으로 계산해요. 예상 크기를 사용한다면 셀이 Auto Layout으로 실제 높이를 계산할 수 있어야 하며, layout 객체와 데이터 상태의 책임을 섞지 않아요.

## 함께 읽으면 좋은 문서

- [Collection Views 한눈에 보기](./../index)
- [레이아웃 학습 가이드](../layout-guide)
- [공식 문서 인벤토리](./../official-document-inventory)

## 참고 자료

- [Apple Developer Documentation — UICollectionViewCompositionalLayoutSectionProvider](https://developer.apple.com/documentation/uikit/uicollectionviewcompositionallayoutsectionprovider)
