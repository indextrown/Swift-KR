---
title: 'Diffable Data Source로 Collection View 업데이트하기'
description: 'Diffable Data Source는 안정적인 식별자로 현재 목록 상태를 표현한 snapshot을 적용해 삽입·삭제·이동을 안전하게 화면에 반영해요. 주요 API, 사용 예제, 주의점을 함께 정리합니다.'
---

# Diffable Data Source로 Collection View 업데이트하기

> **면접 답변 한 줄 요약:** Diffable Data Source는 안정적인 식별자로 현재 목록 상태를 표현한 snapshot을 적용해 삽입·삭제·이동을 안전하게 화면에 반영해요.

Apple 공식 문서의 **Collection Views — Data** 영역에 대응하는 한국어 실습 문서예요. 원문의 구조와 핵심 API를 확인하되, 코드는 작은 사진 목록 예제로 다시 구성했어요.

## 먼저 알아둘 용어

| 용어     | 쉬운 뜻                                                        |
| -------- | -------------------------------------------------------------- |
| 식별자   | item이 이동해도 같은 데이터임을 구분하는 `Hashable` 값이에요.  |
| Snapshot | 특정 시점의 section과 item 순서를 표현한 값이에요.             |
| Prefetch | 화면에 나타나기 전에 필요한 데이터를 미리 준비하는 작업이에요. |

## 상태를 위치가 아니라 식별자로 표현해요

기존 data source에서는 모델 배열과 Collection View의 삽입·삭제 호출 순서를 개발자가 직접 맞춰야 했어요. 둘이 어긋나면 잘못된 업데이트 예외가 발생할 수 있어요. Diffable Data Source에서는 **완성된 다음 상태**를 snapshot으로 전달하고 UIKit이 이전 상태와 차이를 계산해요.

```swift
enum Section {
  case favorites
  case all
}

struct Photo: Identifiable {
  let id: UUID
  var title: String
  var isFavorite: Bool
}
```

## Cell registration과 데이터 소스를 연결해요

```swift
let registration = UICollectionView.CellRegistration<
  UICollectionViewListCell,
  Photo
> { cell, _, photo in
  var content = cell.defaultContentConfiguration()
  content.text = photo.title
  cell.contentConfiguration = content
}

dataSource = UICollectionViewDiffableDataSource<Section, Photo.ID>(
  collectionView: collectionView
) { [weak self] collectionView, indexPath, id in
  guard let photo = self?.photosByID[id] else { return nil }
  return collectionView.dequeueConfiguredReusableCell(
    using: registration,
    for: indexPath,
    item: photo
  )
}
```

## 모델을 바꾼 뒤 새 snapshot을 적용해요

```swift
private func applyPhotos(_ photos: [Photo], animated: Bool) {
  photosByID = Dictionary(uniqueKeysWithValues: photos.map { ($0.id, $0) })

  var snapshot = NSDiffableDataSourceSnapshot<Section, Photo.ID>()
  snapshot.appendSections([.favorites, .all])
  snapshot.appendItems(
    photos.filter(\.isFavorite).map(\.id),
    toSection: .favorites
  )
  snapshot.appendItems(
    photos.filter { !$0.isFavorite }.map(\.id),
    toSection: .all
  )
  dataSource.apply(snapshot, animatingDifferences: animated)
}
```

식별자는 중복되면 안 돼요. 같은 사진을 두 section에 동시에 보여 줘야 한다면 화면 item용 별도 식별자를 만들어야 해요. 기존 item의 내용만 바뀌었다면 `reconfigureItems(_:)`로 정체성과 선택 상태를 유지한 채 셀 구성을 다시 실행해요.

## 적용 순서를 정리해요

1. 화면에서 변하지 않는 item 식별자를 먼저 정해요.
2. 데이터, 셀, 레이아웃, 상호작용 중 이 문서가 바꾸는 책임을 구분해요.
3. 가장 작은 데이터로 정상 동작을 확인해요.
4. 삽입·삭제·이동과 셀 재사용 상황을 각각 확인해요.
5. 비동기 작업은 성공뿐 아니라 취소와 실패 경로도 검사해요.

## 참고 자료

- [Apple Developer Documentation — Updating collection views using diffable data sources](https://developer.apple.com/documentation/uikit/updating-collection-views-using-diffable-data-sources)
- [Collection Views 한눈에 보기](./index)
