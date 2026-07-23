---
title: 'UICollectionViewDataSource'
description: 'UICollectionViewDataSource는 Collection View가 표시할 section·item 개수와 각 위치에서 사용할 셀을 제공하는 프로토콜이에요. 주요 API, 사용 예제, 주의점을 함께 정리합니다.'
---

# UICollectionViewDataSource

> **면접 답변 한 줄 요약:** `UICollectionViewDataSource`는 Collection View가 표시할 section·item 개수와 각 위치에서 사용할 셀을 제공하는 프로토콜이에요.

Apple 공식 문서의 **Collection Views — Data** 영역에 있는 프로토콜예요. 이 페이지는 공식 topic section 순서를 유지하면서 실제 코드에서 무엇을 선택해야 하는지 한국어로 설명해요.

## 먼저 알아둘 용어

| 용어     | 쉬운 뜻                                                        |
| -------- | -------------------------------------------------------------- |
| 식별자   | item이 이동해도 같은 데이터임을 구분하는 `Hashable` 값이에요.  |
| Snapshot | 특정 시점의 section과 item 순서를 표현한 값이에요.             |
| Prefetch | 화면에 나타나기 전에 필요한 데이터를 미리 준비하는 작업이에요. |

## 이 API가 맡는 역할

데이터 계층은 “무엇을 어떤 순서로 보여 줄지”를 책임져요. 현대적인 코드에서는 모델을 먼저 변경하고 식별자로 snapshot을 만든 다음 diffable data source에 적용하는 흐름을 기본으로 삼아요.

UICollectionViewDataSource는 Collection View가 표시할 section·item 개수와 각 위치에서 사용할 셀을 제공하는 프로토콜이에요.

## 선언과 지원 범위를 확인해요

```swift
@MainActor protocol UICollectionViewDataSource : NSObjectProtocol
```

**지원 플랫폼:** iOS · iPadOS · Mac Catalyst · tvOS · visionOS

## 가장 작은 사용 예제

아래 예제에서는 이 API가 속한 역할이 전체 Collection View 구성에서 어디에 놓이는지 확인해요. 핵심 호출에 집중할 수 있도록 모델 선언과 주변 화면 구성은 생략했어요.

```swift
import UIKit

final class PhotoDataSource: NSObject, UICollectionViewDataSource {
  var photos: [Photo] = []

  func collectionView(
    _ collectionView: UICollectionView,
    numberOfItemsInSection section: Int
  ) -> Int {
    photos.count
  }

  func collectionView(
    _ collectionView: UICollectionView,
    cellForItemAt indexPath: IndexPath
  ) -> UICollectionViewCell {
    collectionView.dequeueReusableCell(
      withReuseIdentifier: "PhotoCell",
      for: indexPath
    )
  }
}
```

## 공식 API 목차대로 살펴봐요

### item and section metrics 확인하기 (Getting item and section metrics)

현재 상태에서 필요한 값이나 위치를 안전하게 조회하는 API예요.

| API                                         | 하는 일                                              |
| ------------------------------------------- | ---------------------------------------------------- |
| `collectionView(_:numberOfItemsInSection:)` | item의 현재 값이나 설정을 읽고 필요한 경우 변경해요. |
| `numberOfSections(in:)`                     | 현재 item의 개수를 반환해요.                         |

### views for items 확인하기 (Getting views for items)

현재 상태에서 필요한 값이나 위치를 안전하게 조회하는 API예요.

| API                                                       | 하는 일                                                 |
| --------------------------------------------------------- | ------------------------------------------------------- |
| `collectionView(_:cellForItemAt:)`                        | item의 현재 값이나 설정을 읽고 필요한 경우 변경해요.    |
| `collectionView(_:viewForSupplementaryElementOfKind:at:)` | 보조 뷰의 현재 값이나 설정을 읽고 필요한 경우 변경해요. |

### items 순서 바꾸기 (Reordering items)

데이터 또는 화면 상태를 변경할 때 사용하는 API예요. 모델과 표시 상태의 순서를 함께 확인해요.

| API                                | 하는 일                                              |
| ---------------------------------- | ---------------------------------------------------- |
| `collectionView(_:canMoveItemAt:)` | item의 현재 값이나 설정을 읽고 필요한 경우 변경해요. |
| `collectionView(_:moveItemAt:to:)` | item의 현재 값이나 설정을 읽고 필요한 경우 변경해요. |

### an index 설정하기 (Configuring an index)

동작과 표시 방식을 요구사항에 맞게 설정하는 API예요.

| API                                            | 하는 일                                                   |
| ---------------------------------------------- | --------------------------------------------------------- |
| `indexTitles(for:)`                            | 지정한 관련 값과 동작의 현재 위치를 반환해요.             |
| `collectionView(_:indexPathForIndexTitle:at:)` | IndexPath의 현재 값이나 설정을 읽고 필요한 경우 변경해요. |

## 타입 관계를 확인해요

| 관계           | 타입                                                                                                              |
| -------------- | ----------------------------------------------------------------------------------------------------------------- |
| 상속           | `NSObjectProtocol`                                                                                                |
| 대표 구현 타입 | `UICollectionViewController`, `UICollectionViewDiffableDataSource`, `UICollectionViewDiffableDataSourceReference` |

## 사용할 때 주의할 점

식별자의 `Hashable` 값은 item의 내용이 바뀌어도 안정적이어야 해요. 같은 식별자를 snapshot에 두 번 넣지 말고, UI 갱신과 모델 갱신의 순서를 섞지 않으며, prefetch 작업은 취소할 수 있게 관리해요.

## 함께 읽으면 좋은 문서

- [Collection Views 한눈에 보기](./index)
- [Data 학습 가이드](./data)
- [공식 문서 인벤토리](./official-document-inventory)

## 참고 자료

- [Apple Developer Documentation — UICollectionViewDataSource](https://developer.apple.com/documentation/uikit/uicollectionviewdatasource)
