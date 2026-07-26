---
title: 'UICollectionView 실무 확장 예제'
description: 'Diffable Collection View에 빈 상태, pull-to-refresh, 이미지 prefetch, 페이지네이션, 선택 상태 유지와 drag 재배치를 안전하게 추가하는 실무 예제를 설명합니다.'
---

# UICollectionView 실무 확장 예제

> **면접 답변 한 줄 요약:** Collection View의 새로고침·prefetch·페이지네이션·선택·재배치는 변하는 `IndexPath`가 아니라 안정적인 item ID로 작업과 상태를 추적해야 데이터 변경 뒤에도 같은 item을 가리킬 수 있어요.

이 문서는 [Diffable Data Source 예제](./diffable-data-source)의 `DiffablePhotoGridViewController`에 실무 기능을 하나씩 추가해요. 각 예제는 독립적으로 적용할 수 있으며, 앱의 repository와 이미지 loader 부분은 프로젝트 구조에 맞게 연결하세요.

## 먼저 알아둘 용어

| 용어            | 쉬운 뜻                                                                            |
| --------------- | ---------------------------------------------------------------------------------- |
| empty state     | 표시할 데이터가 없을 때 이유와 다음 행동을 안내하는 화면 상태예요.                 |
| pull-to-refresh | 사용자가 스크롤 영역을 아래로 당겨 최신 데이터를 요청하는 동작이에요.              |
| prefetch        | item이 보이기 전에 필요한 데이터를 준비하는 작업이에요.                            |
| pagination      | 전체 데이터를 한 번에 받지 않고 페이지나 cursor 단위로 이어서 불러오는 방식이에요. |
| cache           | 이미 준비한 이미지나 데이터를 다시 사용하기 위해 잠시 저장하는 공간이에요.         |
| cursor          | 서버가 다음 페이지 위치를 나타내기 위해 주는 안정적인 값이에요.                    |

## 예제 1: 빈 상태를 Collection View 안에 표시해요

데이터가 없을 때 빈 셀을 억지로 만들기보다 `backgroundView`를 사용하면 data source와 안내 화면을 분리할 수 있어요.

```swift
private lazy var emptyLabel: UILabel = {
  let label = UILabel()
  label.text = "아직 사진이 없어요."
  label.textAlignment = .center
  label.textColor = .secondaryLabel
  label.font = .preferredFont(forTextStyle: .headline)
  return label
}()

private func updateEmptyState() {
  collectionView.backgroundView =
    photos.isEmpty ? emptyLabel : nil
}
```

`show(_:)`와 `applyCurrentSnapshot()`이 끝날 때 `updateEmptyState()`를 호출해요. 로딩 중과 오류 상태를 같은 label 하나로 표현하기 어려우면 상태 enum을 두고 서로 다른 안내 뷰를 선택하세요.

```swift
private enum ContentState {
  case loading
  case content
  case empty
  case failed(String)
}
```

iOS 17 이상만 지원한다면 `UIContentUnavailableConfiguration`으로 빈 상태, 검색 결과 없음, 오류 상태를 더 체계적으로 구성할 수도 있어요.

## 예제 2: Pull-to-refresh를 비동기 갱신과 연결해요

`UIRefreshControl`은 Collection View를 포함한 `UIScrollView`에 연결할 수 있어요.

```swift
private func configureRefreshControl() {
  let refreshControl = UIRefreshControl()
  refreshControl.addTarget(
    self,
    action: #selector(refreshPhotos),
    for: .valueChanged
  )
  collectionView.refreshControl = refreshControl
}
```

비동기 작업의 성공과 실패에 상관없이 진행 표시를 종료해야 해요.

```swift
@objc
private func refreshPhotos() {
  Task { [weak self] in
    guard let self else {
      return
    }

    defer {
      self.collectionView.refreshControl?.endRefreshing()
    }

    do {
      let photos = try await self.photoRepository.fetchPhotos()
      self.show(photos)
    } catch {
      self.presentRefreshError(error)
    }
  }
}
```

`photoRepository`와 오류 표시는 앱 구조에 맞게 구현해요. 핵심은 새 데이터를 받은 뒤 backing store를 바꾸고 snapshot을 적용한 다음 refresh control을 끝내는 순서예요.

사용자가 연속으로 당길 수 있다면 이미 새로고침 중인지 검사하거나 이전 요청을 취소하는 정책도 정하세요.

## 예제 3: 곧 보일 이미지를 prefetch해요

이미지 로딩은 네트워크 요청, downsampling, cache 조회가 필요할 수 있어요. Prefetch callback에서 현재 `IndexPath`를 identifier로 바꾼 뒤 loader에 전달해요.

```swift
protocol PhotoImageLoading: AnyObject {
  func prefetchImage(for id: Photo.ID)
  func cancelPrefetch(for id: Photo.ID)
}
```

```swift
extension DiffablePhotoGridViewController:
  UICollectionViewDataSourcePrefetching
{
  func collectionView(
    _ collectionView: UICollectionView,
    prefetchItemsAt indexPaths: [IndexPath]
  ) {
    for indexPath in indexPaths {
      guard let id = dataSource.itemIdentifier(
        for: indexPath
      ) else {
        continue
      }
      imageLoader.prefetchImage(for: id)
    }
  }

  func collectionView(
    _ collectionView: UICollectionView,
    cancelPrefetchingForItemsAt indexPaths: [IndexPath]
  ) {
    for indexPath in indexPaths {
      guard let id = dataSource.itemIdentifier(
        for: indexPath
      ) else {
        continue
      }
      imageLoader.cancelPrefetch(for: id)
    }
  }
}
```

View controller에서 prefetch data source를 연결해요.

```swift
collectionView.prefetchDataSource = self
```

Prefetch는 모든 item에 대해 호출된다고 보장되지 않아요. 셀 구성 시점에는 다음 세 경우를 처리해야 해요.

1. 이미지가 cache에 있어 바로 표시해요.
2. prefetch 작업이 진행 중이라 같은 작업의 결과를 기다려요.
3. prefetch가 호출되지 않아 셀 구성 코드가 직접 로딩을 시작해요.

스크롤 방향이 바뀌면 필요 없어진 작업을 취소하고, 같은 ID의 요청을 중복 생성하지 않도록 loader에서 task를 관리하세요.

## 예제 4: 재사용된 셀에 이전 이미지를 넣지 않아요

네트워크 결과가 도착할 때 셀이 이미 다른 item을 표시할 수 있어요. 셀이 표현 중인 ID를 저장하고 완료 시점에 다시 확인해요.

```swift
final class AsyncPhotoCell: UICollectionViewCell {
  private var representedID: Photo.ID?
  private var imageTask: Task<Void, Never>?
  private let imageView = UIImageView()

  func configure(
    photo: Photo,
    imageLoader: PhotoImageLoader
  ) {
    representedID = photo.id
    imageView.image = imageLoader.cachedImage(
      for: photo.id
    )

    imageTask?.cancel()
    imageTask = Task { [weak self] in
      let image = await imageLoader.image(for: photo.id)

      guard
        !Task.isCancelled,
        self?.representedID == photo.id
      else {
        return
      }
      self?.imageView.image = image
    }
  }

  override func prepareForReuse() {
    super.prepareForReuse()

    representedID = nil
    imageTask?.cancel()
    imageTask = nil
    imageView.image = nil
  }
}
```

`PhotoImageLoader`의 구체적인 네트워크 구현은 생략했어요. 중요한 점은 task 취소와 ID 검사를 둘 다 수행하는 것이에요. 취소가 늦게 반영되더라도 ID 검사가 다른 item에 이미지를 넣는 것을 막아요.

## 예제 5: 마지막 item 근처에서 다음 페이지를 불러와요

`willDisplay`는 같은 셀에 대해 여러 번 호출될 수 있어요. 로딩 중 여부와 다음 페이지 존재 여부를 함께 검사해야 중복 요청을 막을 수 있어요.

```swift
private var isLoadingNextPage = false
private var hasNextPage = true

func collectionView(
  _ collectionView: UICollectionView,
  willDisplay cell: UICollectionViewCell,
  forItemAt indexPath: IndexPath
) {
  guard
    !isLoadingNextPage,
    hasNextPage,
    indexPath.item >= max(0, photos.count - 5)
  else {
    return
  }

  loadNextPage()
}
```

```swift
private func loadNextPage() {
  isLoadingNextPage = true

  Task { [weak self] in
    guard let self else {
      return
    }

    defer {
      self.isLoadingNextPage = false
    }

    do {
      let page = try await self.photoRepository.fetchNextPage()
      self.hasNextPage = page.hasNextPage

      var knownIDs = Set(self.photos.map(\.id))
      self.photos.append(
        contentsOf: page.photos.filter {
          knownIDs.insert($0.id).inserted
        }
      )
      self.applyCurrentSnapshot()
    } catch {
      self.presentPaginationError(error)
    }
  }
}
```

실제 서버가 cursor를 제공한다면 마지막 `IndexPath` 대신 서버 cursor를 저장하세요. 실패했을 때 `isLoadingNextPage`를 되돌려 재시도할 수 있게 하고, 이미 받은 ID는 중복 append하지 않아요.

## 예제 6: 선택 상태를 ID로 저장해요

여러 item을 선택할 때 `IndexPath` 집합을 저장하면 삽입과 정렬 뒤 다른 사진을 가리킬 수 있어요.

```swift
private var selectedPhotoIDs: Set<Photo.ID> = []

func collectionView(
  _ collectionView: UICollectionView,
  didSelectItemAt indexPath: IndexPath
) {
  guard let id = dataSource.itemIdentifier(
    for: indexPath
  ) else {
    return
  }
  selectedPhotoIDs.insert(id)
}

func collectionView(
  _ collectionView: UICollectionView,
  didDeselectItemAt indexPath: IndexPath
) {
  guard let id = dataSource.itemIdentifier(
    for: indexPath
  ) else {
    return
  }
  selectedPhotoIDs.remove(id)
}
```

Snapshot을 크게 다시 구성하거나 전체 reload 뒤 선택을 복원해야 한다면 ID의 현재 위치를 다시 조회해요.

```swift
private func restoreSelection() {
  for id in selectedPhotoIDs {
    guard let indexPath = dataSource.indexPath(for: id) else {
      continue
    }
    collectionView.selectItem(
      at: indexPath,
      animated: false,
      scrollPosition: []
    )
  }
}
```

삭제된 ID는 `selectedPhotoIDs`에서도 제거해 모델 상태와 화면 상태를 맞춰요.

## 예제 7: Diffable 재배치 결과를 모델에 반영해요

```swift
private func configureReordering() {
  dataSource.reorderingHandlers.canReorderItem = { _ in
    true
  }

  dataSource.reorderingHandlers.didReorder = {
    [weak self] transaction in

    guard let self else {
      return
    }

    let photosByID = Dictionary(
      uniqueKeysWithValues: photos.map { ($0.id, $0) }
    )
    photos = transaction.finalSnapshot.itemIdentifiers
      .compactMap { photosByID[$0] }
  }
}
```

Snapshot만 바뀌고 `photos` 배열 순서를 갱신하지 않으면 다음 데이터 갱신 때 이전 순서로 돌아가요. 여기서 `photosByID`는 재정렬 순간에만 만드는 읽기용 index이며, 별도의 가변 데이터 원본이 아니에요. 영구 저장이 필요하면 새 ID 순서를 repository에 전달하고 실패 시 복구 정책을 정하세요.

여러 section을 사용한다면 `transaction.finalSnapshot.itemIdentifiers(inSection:)`로 section별 순서를 가져와 각 backing store에 반영해요.

## 기능을 붙이는 순서를 정리해요

1. 초기 snapshot과 셀 재사용이 정상인지 먼저 확인해요.
2. 빈 상태와 오류 상태를 데이터 개수와 분리해 표현해요.
3. Pull-to-refresh에 중복 요청 방지와 항상 종료되는 경로를 추가해요.
4. 이미지 로딩을 ID로 추적하고 cache·취소·셀 재사용을 확인해요.
5. 페이지네이션에 로딩 중·마지막 페이지·중복 ID 검사를 추가해요.
6. 선택과 재배치 결과를 ID 기반 모델 상태에 반영해요.
7. 빠른 스크롤, 화면 회전, 요청 실패, 새로고침과 페이지 요청이 겹치는 상황을 테스트해요.

## 자주 발생하는 문제를 점검해요

| 증상                                | 먼저 확인할 것                                                            |
| ----------------------------------- | ------------------------------------------------------------------------- |
| 새로고침 indicator가 계속 돌아요.   | 성공·실패·취소 모든 경로에서 `endRefreshing()`이 호출되는지 확인해요.     |
| 스크롤하면 다른 이미지가 나타나요.  | 완료 시 셀의 `representedID`를 다시 확인하고 이전 task를 취소하는지 봐요. |
| 같은 페이지가 여러 번 요청돼요.     | 로딩 중 flag, 다음 cursor, 중복 ID 제거가 모두 있는지 확인해요.           |
| 정렬 뒤 선택한 사진이 달라져요.     | 선택 상태를 `IndexPath` 대신 `Photo.ID`로 저장했는지 확인해요.            |
| 재배치 뒤 순서가 원래대로 돌아가요. | transaction의 최종 snapshot 순서를 backing store에 반영했는지 확인해요.   |

## 면접에서 이어질 수 있는 질문

### Prefetch만 구현하면 셀에서 직접 로딩하지 않아도 되나요?

아니요. Prefetch callback은 모든 item에 대해 호출된다고 보장되지 않아요. 셀 구성 코드는 cache 완료, 진행 중, 요청 전 세 상태를 모두 처리할 수 있어야 해요.

### 비동기 이미지 작업을 왜 IndexPath로 관리하면 안 되나요?

`IndexPath`는 현재 위치라서 삽입·삭제·이동 뒤 다른 item을 가리킬 수 있어요. 안정적인 ID로 task와 cache를 관리하고 셀에 결과를 적용할 때도 같은 ID인지 확인해야 해요.

## 참고 자료

- [Apple Developer Documentation — UICollectionViewDataSourcePrefetching](https://developer.apple.com/documentation/uikit/uicollectionviewdatasourceprefetching)
- [Apple Developer Documentation — Building high-performance lists and collection views](https://developer.apple.com/documentation/uikit/building-high-performance-lists-and-collection-views)
- [Apple Developer Documentation — UIRefreshControl](https://developer.apple.com/documentation/uikit/uirefreshcontrol)
- [Apple Developer Documentation — UICollectionViewDiffableDataSource](https://developer.apple.com/documentation/uikit/uicollectionviewdiffabledatasource)
