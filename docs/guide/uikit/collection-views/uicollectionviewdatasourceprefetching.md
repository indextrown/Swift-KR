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

## 공식 설명에서 놓치면 안 되는 동작

공식 문서가 제시하는 연결 순서는 Collection View와 기본 data source를 만든 뒤, prefetch protocol을 채택한 별도 객체를 `prefetchDataSource`에 지정하는 방식이에요. `prefetchItemsAt`은 `cellForItemAt`보다 먼저 호출될 수 있으므로 이미지 다운로드·DB 조회처럼 시간이 걸리는 작업을 시작해요.

prefetch callback의 IndexPath는 장기 식별자가 아니에요. 호출 시점에 item 식별자로 바꾸고 그 식별자로 작업을 추적하세요.

```swift
func collectionView(
  _ collectionView: UICollectionView,
  prefetchItemsAt indexPaths: [IndexPath]
) {
  for indexPath in indexPaths {
    guard let id = dataSource.itemIdentifier(for: indexPath) else {
      continue
    }
    thumbnailLoader.start(id: id)
  }
}

func collectionView(
  _ collectionView: UICollectionView,
  cancelPrefetchingForItemsAt indexPaths: [IndexPath]
) {
  for indexPath in indexPaths {
    guard let id = dataSource.itemIdentifier(for: indexPath) else {
      continue
    }
    thumbnailLoader.cancel(id: id)
  }
}
```

> **중요:** prefetch 순서는 셀 표시 순서와 같지 않고, 요청한 셀이 반드시 나타나는 것도 아니에요. 중복 요청을 합치고 취소를 지원해야 prefetch가 오히려 CPU·네트워크 사용량을 늘리는 일을 피할 수 있어요.

비동기 결과를 셀에 직접 밀어 넣기보다 캐시에 저장하고, 결과가 도착했을 때 현재 셀이 여전히 같은 item 식별자를 나타내는지 확인한 뒤 재구성하세요.

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
