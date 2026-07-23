---
title: '고성능 목록과 Collection View 만들기'
description: '고성능 목록은 화면에 곧 나타날 데이터를 미리 준비하고, 이미지 디코딩과 취소 가능한 비동기 작업을 셀 재사용 주기와 분리해요. 주요 API, 사용 예제, 주의점을 함께 정리합니다.'
---

# 고성능 목록과 Collection View 만들기

> **면접 답변 한 줄 요약:** 고성능 목록은 화면에 곧 나타날 데이터를 미리 준비하고, 이미지 디코딩과 취소 가능한 비동기 작업을 셀 재사용 주기와 분리해요.

원문: [Apple Developer Documentation — Building high-performance lists and collection views](https://developer.apple.com/documentation/uikit/building-high-performance-lists-and-collection-views)

## 개요 (Overview)

Prefetch와 이미지 준비를 사용해 앱의 List와 Collection 성능을 개선해요.

> **참고:** 이 샘플 코드 프로젝트는 WWDC21 세션 **10252: Make Blazing Fast Lists and Collection Views**와 연결되어 있어요.

공식 페이지에는 별도의 단계별 본문이나 코드가 없어요. 아래 내용은 공식 페이지의 범위를 넘어 성능 주제를 실제 앱에 적용하는 **Swift-KR 보충 학습 자료**예요.

## Swift-KR 보충: 먼저 알아둘 용어

| 용어     | 쉬운 뜻                                                        |
| -------- | -------------------------------------------------------------- |
| 식별자   | item이 이동해도 같은 데이터임을 구분하는 `Hashable` 값이에요.  |
| Snapshot | 특정 시점의 section과 item 순서를 표현한 값이에요.             |
| Prefetch | 화면에 나타나기 전에 필요한 데이터를 미리 준비하는 작업이에요. |

## 느린 작업을 셀 표시 시점과 분리해요

스크롤 중 끊김은 네트워크 요청 자체보다 큰 이미지를 메인 스레드에서 디코딩하거나, 재사용된 셀에 이전 요청 결과를 적용할 때 자주 발생해요. 데이터 로딩, 이미지 준비, 셀 표시를 서로 다른 단계로 나눠야 해요.

## Prefetch 요청을 시작하고 취소해요

```swift
private var imageTasks: [Photo.ID: Task<Void, Never>] = [:]

func collectionView(
  _ collectionView: UICollectionView,
  prefetchItemsAt indexPaths: [IndexPath]
) {
  for indexPath in indexPaths {
    guard let id = dataSource.itemIdentifier(for: indexPath),
          imageTasks[id] == nil else { continue }

    imageTasks[id] = Task { [weak self] in
      await self?.imageStore.prepareThumbnail(for: id)
    }
  }
}

func collectionView(
  _ collectionView: UICollectionView,
  cancelPrefetchingForItemsAt indexPaths: [IndexPath]
) {
  for indexPath in indexPaths {
    guard let id = dataSource.itemIdentifier(for: indexPath) else { continue }
    imageTasks[id]?.cancel()
    imageTasks[id] = nil
  }
}
```

## 성능 점검 기준

1. 원본 이미지를 셀 크기에 맞게 downsampling해요.
2. 메모리 캐시는 비용 제한을 두고 메모리 경고에서 비워요.
3. item 식별자로 작업을 추적하고 IndexPath를 장기 저장하지 않아요.
4. 셀이 사라지거나 prefetch가 취소되면 불필요한 작업을 중단해요.
5. snapshot 적용과 이미지 디코딩 같은 무거운 작업의 측정 지점을 분리해요.

Prefetch는 “반드시 필요할 데이터”가 아니라 “곧 필요할 가능성이 있는 데이터”를 알려 줘요. 취소와 중복 제거가 없는 prefetch는 오히려 네트워크와 CPU 사용량을 늘릴 수 있어요.

## 적용 순서를 정리해요

1. 화면에서 변하지 않는 item 식별자를 먼저 정해요.
2. 데이터, 셀, 레이아웃, 상호작용 중 이 문서가 바꾸는 책임을 구분해요.
3. 가장 작은 데이터로 정상 동작을 확인해요.
4. 삽입·삭제·이동과 셀 재사용 상황을 각각 확인해요.
5. 비동기 작업은 성공뿐 아니라 취소와 실패 경로도 검사해요.

## 참고 자료

- [Apple Developer Documentation — Building high-performance lists and collection views](https://developer.apple.com/documentation/uikit/building-high-performance-lists-and-collection-views)
- [Collection Views 한눈에 보기](./index)
