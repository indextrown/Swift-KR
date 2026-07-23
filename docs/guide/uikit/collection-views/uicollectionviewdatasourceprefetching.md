---
title: 'UICollectionViewDataSourcePrefetching'
description: 'UICollectionViewDataSourcePrefetching은 곧 보일 item의 IndexPath를 미리 전달해 이미지나 원격 데이터를 비동기로 준비하게 해요. 주요 API, 사용 예제, 주의점을 함께 정리합니다.'
---

# UICollectionViewDataSourcePrefetching

> **면접 답변 한 줄 요약:** `UICollectionViewDataSourcePrefetching`은 곧 보일 item의 IndexPath를 미리 전달해 이미지나 원격 데이터를 비동기로 준비하게 해요.

Apple 공식 문서의 **Collection Views — Data** 영역에 있는 프로토콜예요. 이 페이지는 공식 topic section 순서를 유지하면서 실제 코드에서 무엇을 선택해야 하는지 한국어로 설명해요.

## 먼저 알아둘 용어

| 용어     | 쉬운 뜻                                                        |
| -------- | -------------------------------------------------------------- |
| 식별자   | item이 이동해도 같은 데이터임을 구분하는 `Hashable` 값이에요.  |
| Snapshot | 특정 시점의 section과 item 순서를 표현한 값이에요.             |
| Prefetch | 화면에 나타나기 전에 필요한 데이터를 미리 준비하는 작업이에요. |

## 이 API가 맡는 역할

데이터 계층은 “무엇을 어떤 순서로 보여 줄지”를 책임져요. 현대적인 코드에서는 모델을 먼저 변경하고 식별자로 snapshot을 만든 다음 diffable data source에 적용하는 흐름을 기본으로 삼아요.

UICollectionViewDataSourcePrefetching은 곧 보일 item의 IndexPath를 미리 전달해 이미지나 원격 데이터를 비동기로 준비하게 해요.

## 개요 (Overview)

Prefetch data source는 Collection View의 일반 data source와 함께 사용해요. `collectionView(_:cellForItemAt:)`이 호출되기 전에 셀에 필요한 데이터 로딩을 시작할 수 있게 해 줘요.

Collection View에 prefetch data source를 추가하는 순서는 다음과 같아요.

1. Collection View와 일반 data source를 만들어요.
2. `UICollectionViewDataSourcePrefetching`을 채택한 객체를 만들고 Collection View의 `prefetchDataSource`에 연결해요.
3. `collectionView(_:prefetchItemsAt:)`에서 전달받은 IndexPath의 셀에 필요한 데이터를 비동기로 불러오기 시작해요.
4. `collectionView(_:cellForItemAt:)`에서 미리 불러온 데이터로 셀을 구성해요.
5. `collectionView(_:cancelPrefetchingForItemsAt:)`으로 더 이상 필요하지 않다고 전달된 데이터 로딩 작업을 취소해요.

> **참고:** Collection View의 모든 셀에 대해 prefetch 메서드가 반드시 호출되는 것은 아니에요. 어떤 상황에서도 셀을 구성할 수 있도록 아래의 비동기 로딩 방식을 함께 고려해야 해요.

자세한 Collection View 동작은 `UICollectionView` 문서에서 확인할 수 있어요.

### 데이터를 비동기로 불러오기 (Load data asynchronously)

`collectionView(_:prefetchItemsAt:)`은 모든 셀에 대해 호출된다는 보장이 없어요. 따라서 `collectionView(_:cellForItemAt:)`은 다음 세 상황을 모두 처리할 수 있어야 해요.

- prefetch 요청으로 데이터 로딩이 끝나 바로 표시할 수 있는 상태
- prefetch가 진행 중이어서 아직 데이터가 준비되지 않은 상태
- 해당 데이터가 아직 한 번도 요청되지 않은 상태

세 경우를 모두 처리하는 한 가지 방법은 각 item의 데이터를 불러오는 `Operation`을 사용하는 것이에요. prefetch 메서드에서 `Operation`을 만들고 저장해 두면, 일반 data source 메서드는 기존 작업과 결과를 가져오거나 작업이 없다면 새로 만들 수 있어요. Swift Concurrency의 `Task`를 사용하더라도 같은 원칙으로 진행 중인 작업과 결과를 item 단위로 추적해야 해요.

## 선언과 지원 범위를 확인해요

```swift
@MainActor protocol UICollectionViewDataSourcePrefetching : NSObjectProtocol
```

**지원 플랫폼:** iOS · iPadOS · Mac Catalyst · tvOS · visionOS

## 가장 작은 사용 예제

아래 예제에서는 이 API가 속한 역할이 전체 Collection View 구성에서 어디에 놓이는지 확인해요. 핵심 호출에 집중할 수 있도록 모델 선언과 주변 화면 구성은 생략했어요.

```swift
import UIKit

final class PhotoPrefetcher: NSObject,
  UICollectionViewDataSourcePrefetching {
  func collectionView(
    _ collectionView: UICollectionView,
    prefetchItemsAt indexPaths: [IndexPath]
  ) {
    imageStore.prepareImages(at: indexPaths)
  }

  func collectionView(
    _ collectionView: UICollectionView,
    cancelPrefetchingForItemsAt indexPaths: [IndexPath]
  ) {
    imageStore.cancelRequests(at: indexPaths)
  }
}
```

## 공식 API 목차대로 살펴봐요

### data prefetching 관리하기 (Managing data prefetching)

동작과 표시 방식을 요구사항에 맞게 설정하는 API예요.

| API                                              | 하는 일                                             |
| ------------------------------------------------ | --------------------------------------------------- |
| `Prefetching collection view data`               | Collection View 구현 흐름을 설명하는 관련 문서예요. |
| `collectionView(_:prefetchItemsAt:)`             | 곧 보일 item의 데이터 준비를 시작해요.              |
| `collectionView(_:cancelPrefetchingForItemsAt:)` | 더는 필요하지 않은 prefetch 작업을 취소해요.        |

## 타입 관계를 확인해요

| 관계 | 타입               |
| ---- | ------------------ |
| 상속 | `NSObjectProtocol` |

## 사용할 때 주의할 점

식별자의 `Hashable` 값은 item의 내용이 바뀌어도 안정적이어야 해요. 같은 식별자를 snapshot에 두 번 넣지 말고, UI 갱신과 모델 갱신의 순서를 섞지 않으며, prefetch 작업은 취소할 수 있게 관리해요.

## 함께 읽으면 좋은 문서

- [Collection Views 한눈에 보기](./index)
- [Data 학습 가이드](./data)
- [공식 문서 인벤토리](./official-document-inventory)

## 참고 자료

- [Apple Developer Documentation — UICollectionViewDataSourcePrefetching](https://developer.apple.com/documentation/uikit/uicollectionviewdatasourceprefetching)
