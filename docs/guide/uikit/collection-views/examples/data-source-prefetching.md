---
title: 'UICollectionViewDataSourcePrefetching 예제'
description: 'UICollectionViewDataSourcePrefetching으로 곧 표시될 이미지 작업을 미리 시작하고, 모델 ID를 기준으로 중복 요청·취소·셀 재사용을 안전하게 처리합니다.'
---

# UICollectionViewDataSourcePrefetching 예제

> **면접 답변 한 줄 요약:** `UICollectionViewDataSourcePrefetching`은 곧 필요할 데이터의 위치를 미리 알려 주어 비동기 로딩을 앞당기되, 실제 셀 구성은 prefetch 성공 여부와 관계없이 동작하게 만드는 프로토콜이에요.

이 문서는 [공통 사진 모델](./index)과 Data Source 예제에 원격 썸네일 로딩을 추가해요. Prefetch는 전통적인 `UICollectionViewDataSource`와 `UICollectionViewDiffableDataSource` 양쪽에서 사용할 수 있어요.

## 먼저 알아둘 용어

| 용어           | 쉬운 뜻                                                                      |
| -------------- | ---------------------------------------------------------------------------- |
| prefetch       | 화면에 나타나기 전에 필요할 가능성이 높은 데이터를 미리 준비하는 작업이에요. |
| cache          | 이미 만든 결과를 다시 사용하기 위해 메모리나 디스크에 저장하는 공간이에요.   |
| in-flight task | 시작했지만 아직 끝나지 않은 비동기 작업이에요.                               |
| cancellation   | 더 이상 필요하지 않은 작업에 중단을 요청해 자원 낭비를 줄이는 동작이에요.    |
| best effort    | 호출이 반드시 보장되지는 않으므로 성능 최적화로만 사용해야 한다는 뜻이에요.  |

## Prefetch Data Source를 연결해요

```swift
override func viewDidLoad() {
  super.viewDidLoad()

  collectionView.prefetchDataSource = self
}
```

`prefetchDataSource`는 item 개수와 셀을 제공하는 `dataSource`와 다른 역할이에요. Data Source가 화면에 필요한 셀을 제공한다면, prefetch data source는 앞으로 필요할 가능성이 있는 데이터 작업을 미리 시작해요.

## 이미지 작업을 ID로 관리해요

`IndexPath`는 삽입·삭제·정렬 뒤 달라질 수 있으므로 장기 작업의 key로 사용하지 않아요. Callback을 받은 즉시 `Photo.ID`와 URL로 바꿔요.

```swift
@MainActor
final class PhotoThumbnailStore {
  private let cache = NSCache<NSUUID, UIImage>()
  private var tasks: [Photo.ID: Task<Void, Never>] = [:]

  func cachedImage(for id: Photo.ID) -> UIImage? {
    cache.object(forKey: id as NSUUID)
  }

  func prepare(id: Photo.ID, url: URL) {
    guard cachedImage(for: id) == nil else {
      return
    }
    guard tasks[id] == nil else {
      return
    }

    tasks[id] = Task { [weak self] in
      guard let self else {
        return
      }

      defer {
        tasks[id] = nil
      }

      do {
        let (data, _) = try await URLSession.shared.data(
          from: url
        )
        try Task.checkCancellation()

        if let image = UIImage(data: data) {
          cache.setObject(image, forKey: id as NSUUID)
        }
      } catch is CancellationError {
        // 화면에서 멀어져 취소된 정상 흐름이에요.
      } catch {
        print("썸네일 준비 실패: \(error)")
      }
    }
  }

  func cancel(id: Photo.ID) {
    tasks[id]?.cancel()
  }
}
```

같은 ID의 작업이 이미 진행 중이거나 cache에 결과가 있으면 새 요청을 만들지 않아요. 취소할 때 dictionary에서 즉시 제거하지 않는 이유는 취소된 task가 `defer`에서 스스로 정리되기 전에 같은 ID의 새 task가 등록되어 덮어써지는 경쟁을 피하기 위해서예요. 실제 앱에서는 URL 응답 상태와 MIME type도 검증하고, 화면을 다시 열어도 유지해야 한다면 디스크 cache를 함께 고려하세요.

## Callback에서 모델 ID와 URL을 찾아요

예제 view controller가 ID별 이미지 URL을 가진다고 가정해요.

```swift
private let thumbnailStore = PhotoThumbnailStore()
private var imageURLsByID: [Photo.ID: URL] = [:]
```

전통적인 배열 기반 Data Source에서는 현재 배열을 조회해요.

```swift
extension ClassicPhotoGridViewController:
  UICollectionViewDataSourcePrefetching
{
  func collectionView(
    _ collectionView: UICollectionView,
    prefetchItemsAt indexPaths: [IndexPath]
  ) {
    for indexPath in indexPaths {
      guard photos.indices.contains(indexPath.item) else {
        continue
      }

      let id = photos[indexPath.item].id
      guard let url = imageURLsByID[id] else {
        continue
      }
      thumbnailStore.prepare(id: id, url: url)
    }
  }

  func collectionView(
    _ collectionView: UICollectionView,
    cancelPrefetchingForItemsAt indexPaths: [IndexPath]
  ) {
    for indexPath in indexPaths {
      guard photos.indices.contains(indexPath.item) else {
        continue
      }
      thumbnailStore.cancel(id: photos[indexPath.item].id)
    }
  }
}
```

Diffable Data Source에서는 배열 위치 대신 현재 snapshot의 identifier를 조회해요.

```swift
private func photoID(
  at indexPath: IndexPath
) -> Photo.ID? {
  dataSource.itemIdentifier(for: indexPath)
}
```

Prefetch와 취소 callback 모두 이 helper로 ID를 찾으면 돼요.

## 셀 구성은 Prefetch 없이도 동작해야 해요

Prefetch callback은 모든 item에 대해 호출된다고 보장되지 않아요. 셀 구성 시 cache miss가 발생하면 그 자리에서 같은 로딩 경로를 시작해야 해요.

```swift
func configureThumbnail(
  for cell: RemotePhotoCell,
  photoID: Photo.ID
) {
  cell.representedPhotoID = photoID

  if let image = thumbnailStore.cachedImage(
    for: photoID
  ) {
    cell.setThumbnail(image)
    return
  }

  cell.setPlaceholder()

  guard let url = imageURLsByID[photoID] else {
    return
  }
  thumbnailStore.prepare(id: photoID, url: url)
}
```

비동기 결과를 셀에 직접 전달한다면 완료 시점에 `representedPhotoID`가 여전히 같은 ID인지 확인하세요. 셀은 재사용되므로 요청을 시작한 위치만 기억하면 다른 사진에 이전 이미지가 들어갈 수 있어요.

## 취소는 Cache 삭제가 아니에요

`cancelPrefetchingForItemsAt`은 화면에서 멀어진 작업을 줄일 기회예요. 이미 완성된 cache까지 지우라는 뜻은 아니에요. 또한 같은 ID를 보이는 다른 셀이 작업 결과를 기다릴 수 있다면 단순히 하나의 취소 callback만으로 공유 작업을 중단하면 안 돼요.

실무에서는 다음 중 하나를 선택해요.

- 화면 전용 작업이면 ID별 task를 바로 취소해요.
- 여러 소비자가 공유한다면 참조 수나 subscriber를 관리해 마지막 소비자가 사라질 때 취소해요.
- HTTP cache와 이미지 pipeline이 중복·취소를 관리한다면 prefetch callback에서 해당 라이브러리 API를 호출해요.

## 자주 발생하는 문제를 점검해요

| 증상                                  | 먼저 확인할 것                                                                  |
| ------------------------------------- | ------------------------------------------------------------------------------- |
| 같은 이미지가 여러 번 다운로드돼요.   | cache와 진행 중 task를 ID 기준으로 함께 확인하는지 봐요.                        |
| 스크롤 뒤 다른 이미지가 나타나요.     | 셀의 현재 ID와 완료된 요청의 ID를 비교하는지 확인해요.                          |
| Prefetch를 껐더니 이미지가 안 나와요. | 셀 구성 경로도 cache miss에서 로딩을 시작하는지 확인해요.                       |
| 취소 뒤 다시 나타난 이미지가 비어요.  | 재요청이 가능하고 취소가 완성된 cache를 지우지 않는지 확인해요.                 |
| 삽입 뒤 엉뚱한 작업이 취소돼요.       | 오래된 `IndexPath`가 아니라 callback 시점에 변환한 ID로 task를 관리하는지 봐요. |

## 면접에서 이어질 수 있는 질문

### Prefetch는 데이터 정확성을 보장하는 기능인가요?

아니요. Prefetch는 데이터를 조금 일찍 준비하는 성능 최적화예요. 호출되지 않거나 취소될 수 있으므로 실제 셀 구성 경로가 독립적으로 데이터를 준비할 수 있어야 해요.

### `IndexPath` 대신 ID로 작업을 관리하는 이유는 무엇인가요?

`IndexPath`는 현재 위치라서 삽입·삭제·정렬 뒤 다른 모델을 가리킬 수 있어요. 안정적인 모델 ID를 task와 cache의 key로 사용하면 item이 이동해도 같은 요청과 결과를 찾을 수 있어요.

## 참고 자료

- [Apple Developer Documentation — UICollectionViewDataSourcePrefetching](https://developer.apple.com/documentation/uikit/uicollectionviewdatasourceprefetching)
- [Apple Developer Documentation — Building high-performance lists and collection views](https://developer.apple.com/documentation/uikit/building-high-performance-lists-and-collection-views)
- [Apple Developer Documentation — UICollectionView](https://developer.apple.com/documentation/uikit/uicollectionview)
