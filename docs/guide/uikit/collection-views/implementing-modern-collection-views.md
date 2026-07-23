---
title: '현대적인 Collection View 구현하기'
description: '현대적인 Collection View 구성은 Compositional Layout으로 배치를 만들고 Diffable Data Source와 registration으로 데이터와 셀을 연결해요. 주요 API, 사용 예제, 주의점을 함께 정리합니다.'
---

# 현대적인 Collection View 구현하기

> **면접 답변 한 줄 요약:** 현대적인 Collection View 구성은 Compositional Layout으로 배치를 만들고 Diffable Data Source와 registration으로 데이터와 셀을 연결해요.

Apple 공식 문서의 **Collection Views — Data** 영역에 대응하는 한국어 실습 문서예요. 원문의 구조와 핵심 API를 확인하되, 코드는 작은 사진 목록 예제로 다시 구성했어요.

## 먼저 알아둘 용어

| 용어     | 쉬운 뜻                                                        |
| -------- | -------------------------------------------------------------- |
| 식별자   | item이 이동해도 같은 데이터임을 구분하는 `Hashable` 값이에요.  |
| Snapshot | 특정 시점의 section과 item 순서를 표현한 값이에요.             |
| Prefetch | 화면에 나타나기 전에 필요한 데이터를 미리 준비하는 작업이에요. |

## 현대적인 구성의 세 축을 나눠요

| 질문                  | 담당 API                                        |
| --------------------- | ----------------------------------------------- |
| 어디에 배치하나요?    | `UICollectionViewCompositionalLayout`           |
| 무엇을 보여 주나요?   | `UICollectionViewDiffableDataSource`와 snapshot |
| 어떤 셀로 표현하나요? | `CellRegistration`과 content configuration      |

## Compositional Layout을 만들어요

```swift
private func makeLayout() -> UICollectionViewLayout {
  let item = NSCollectionLayoutItem(
    layoutSize: .init(
      widthDimension: .fractionalWidth(1),
      heightDimension: .fractionalHeight(1)
    )
  )
  item.contentInsets = .init(top: 4, leading: 4, bottom: 4, trailing: 4)

  let group = NSCollectionLayoutGroup.horizontal(
    layoutSize: .init(
      widthDimension: .fractionalWidth(1),
      heightDimension: .fractionalWidth(0.5)
    ),
    repeatingSubitem: item,
    count: 2
  )
  return UICollectionViewCompositionalLayout(
    section: NSCollectionLayoutSection(group: group)
  )
}
```

## Registration, Data Source, Snapshot을 연결해요

```swift
let registration = UICollectionView.CellRegistration<
  UICollectionViewCell,
  Photo
> { cell, _, photo in
  var content = UIListContentConfiguration.cell()
  content.text = photo.title
  content.image = photo.thumbnail
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

세 역할을 한 객체에 합치지 않으면 데이터 갱신, 셀 디자인, 화면 배치를 서로 독립적으로 바꿀 수 있어요. 자세한 조합 과정은 [Collection Views 한눈에 보기](./index)에서 이어서 확인해요.

## 적용 순서를 정리해요

1. 화면에서 변하지 않는 item 식별자를 먼저 정해요.
2. 데이터, 셀, 레이아웃, 상호작용 중 이 문서가 바꾸는 책임을 구분해요.
3. 가장 작은 데이터로 정상 동작을 확인해요.
4. 삽입·삭제·이동과 셀 재사용 상황을 각각 확인해요.
5. 비동기 작업은 성공뿐 아니라 취소와 실패 경로도 검사해요.

## 참고 자료

- [Apple Developer Documentation — Implementing modern collection views](https://developer.apple.com/documentation/uikit/implementing-modern-collection-views)
- [Collection Views 한눈에 보기](./index)
