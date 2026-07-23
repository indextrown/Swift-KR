---
title: 'Collection View Layout 사용자 정의하기'
description: 'Apple 공식 샘플의 ColumnFlowLayout과 MosaicLayout을 따라 동적 열 계산, attributes 캐시와 content size, rect 조회, invalidation, batch update 순서를 코드와 함께 설명합니다.'
---

# Collection View Layout 사용자 정의하기

> **면접 답변 한 줄 요약:** 단순 grid는 `UICollectionViewFlowLayout`을 조정하고, 자유 배치는 `UICollectionViewLayout`을 상속해 attributes·콘텐츠 크기·무효화·업데이트를 직접 제공해요.

이 문서는 Apple의 **Customizing collection view layouts** 샘플이 다루는 두 레이아웃과 batch update 과정을 공식 순서대로 설명해요.

## 먼저 알아둘 용어

| 용어              | 쉬운 뜻                                                                         |
| ----------------- | ------------------------------------------------------------------------------- |
| Layout Attributes | 셀·보조 뷰·장식 뷰의 frame, 중심, 투명도, z-index 같은 배치 결과예요.           |
| Content Size      | Collection View가 스크롤할 수 있는 전체 콘텐츠 영역의 크기예요.                 |
| Invalidation      | 이전 계산이 더는 유효하지 않으니 필요한 layout 정보를 다시 계산하는 과정이에요. |
| Batch Update      | 여러 삽입·삭제·이동·reload를 하나의 일관된 애니메이션으로 적용하는 작업이에요.  |

## 개요 (Overview)

단순한 행·열 grid는 `UICollectionViewFlowLayout`을 바로 사용하거나 상속하면 돼요. 더 자유로운 배치가 필요하면 `UICollectionViewLayout`을 상속해 각 요소의 위치와 크기를 직접 계산해요.

공식 샘플은 두 구현을 비교해요.

- `ColumnFlowLayout`: 좁은 폭에서는 한 열 목록, 넓은 폭에서는 여러 열 grid가 되는 `UICollectionViewFlowLayout` 하위 클래스
- `MosaicLayout`: 크기와 비율이 다른 셀을 네 종류의 행으로 조합하는 `UICollectionViewLayout` 하위 클래스

앱은 Friends 화면에서 시작하고 Column Flow Layout으로 사람 목록을 표시해요. 셀을 탭하면 사용자의 사진 라이브러리를 Mosaic Layout으로 표시하는 Feed 화면으로 이동해요.

내비게이션 바 오른쪽의 cloud 버튼을 탭하면 Collection View item의 삽입·삭제·이동·reload가 batch animation으로 실행돼요. Collection View에서 pull-to-refresh를 수행하면 데이터가 초기 상태로 돌아가요.

### 단순한 Grid에서는 Cell 크기를 동적으로 계산해요 (For a simple grid, size cells dynamically)

`ColumnFlowLayout`은 `UICollectionViewFlowLayout`의 하위 클래스이며 Collection View 크기로 셀의 너비를 결정해요. 가로 방향에 셀 하나만 여유 있게 들어간다면 셀이 Collection View의 전체 폭을 차지하고, 그렇지 않다면 고정 너비를 가진 여러 열로 표시해요.

실제로 iPhone 세로 모드에서는 셀을 세로 한 열로 표시하고, 가로 모드나 iPad에서는 grid로 표시해요.

`prepare()`에서 기기의 사용 가능한 화면 폭을 계산하고 그 결과로 `itemSize`를 설정해요.

```swift
override func prepare() {
    super.prepare()

    guard let collectionView = collectionView else { return }

    let availableWidth = collectionView.bounds.inset(by: collectionView.layoutMargins).width
    let maxNumColumns = Int(availableWidth / minColumnWidth)
    let cellWidth = (availableWidth / CGFloat(maxNumColumns)).rounded(.down)

    self.itemSize = CGSize(width: cellWidth, height: cellHeight)
    self.sectionInset = UIEdgeInsets(top: self.minimumInteritemSpacing, left: 0.0, bottom: 0.0, right: 0.0)
    self.sectionInsetReference = .fromSafeArea
}
```

### 복잡한 Grid에서는 Cell 크기를 명시적으로 정의해요 (For a complex grid, define cell sizes explicitly)

`UICollectionViewFlowLayout` 하위 클래스로 가능한 범위보다 더 많은 사용자 정의가 필요하다면 `UICollectionViewLayout`을 직접 상속해요.

`MosaicLayout`은 크기와 종횡비가 다른 임의 개수의 셀을 표시하는 `UICollectionViewLayout` 하위 클래스예요. `FeedViewController`는 이 Layout으로 사용자의 사진 라이브러리 이미지를 보여 주며, 셀을 하나 또는 여러 개씩 네 가지 형태의 row로 구성해요.

공식 예제는 다음 네 가지 segment를 반복해요.

1. 전체 폭 셀 하나
2. 절반 폭 셀 두 개
3. 왼쪽 2/3 셀 하나 + 오른쪽 1/3 셀 두 개
4. 왼쪽 1/3 셀 두 개 + 오른쪽 2/3 셀 하나

<!-- Apple DocC image: CellLayouts -->

![단일 셀부터 큰 셀과 작은 셀을 조합한 형태까지 네 가지 Mosaic Layout 행 배치](../assets/apple-docs/CellLayouts.png)

**Cell 크기 계산하기**

Layout이 무효화될 때마다 `prepare()`가 호출돼요. 이 메서드를 재정의해 모든 셀의 위치와 크기뿐 아니라 전체 Layout의 전체 크기도 계산해요.

```swift
override func prepare() {
    super.prepare()

    guard let collectionView = collectionView else { return }

    // Reset cached information.
    cachedAttributes.removeAll()
    contentBounds = CGRect(origin: .zero, size: collectionView.bounds.size)

    // For every item in the collection view:
    //  - Prepare the attributes.
    //  - Store attributes in the cachedAttributes array.
    //  - Combine contentBounds with attributes.frame.
    let count = collectionView.numberOfItems(inSection: 0)

    var currentIndex = 0
    var segment: MosaicSegmentStyle = .fullWidth
    var lastFrame: CGRect = .zero

    let cvWidth = collectionView.bounds.size.width

    while currentIndex < count {
        let segmentFrame = CGRect(x: 0, y: lastFrame.maxY + 1.0, width: cvWidth, height: 200.0)

        var segmentRects = [CGRect]()
        switch segment {
        case .fullWidth:
            segmentRects = [segmentFrame]

        case .fiftyFifty:
            let horizontalSlices = segmentFrame.dividedIntegral(fraction: 0.5, from: .minXEdge)
            segmentRects = [horizontalSlices.first, horizontalSlices.second]

        case .twoThirdsOneThird:
            let horizontalSlices = segmentFrame.dividedIntegral(fraction: (2.0 / 3.0), from: .minXEdge)
            let verticalSlices = horizontalSlices.second.dividedIntegral(fraction: 0.5, from: .minYEdge)
            segmentRects = [horizontalSlices.first, verticalSlices.first, verticalSlices.second]

        case .oneThirdTwoThirds:
            let horizontalSlices = segmentFrame.dividedIntegral(fraction: (1.0 / 3.0), from: .minXEdge)
            let verticalSlices = horizontalSlices.first.dividedIntegral(fraction: 0.5, from: .minYEdge)
            segmentRects = [verticalSlices.first, verticalSlices.second, horizontalSlices.second]
        }

        // Create and cache layout attributes for calculated frames.
        for rect in segmentRects {
            let attributes = UICollectionViewLayoutAttributes(forCellWith: IndexPath(item: currentIndex, section: 0))
            attributes.frame = rect

            cachedAttributes.append(attributes)
            contentBounds = contentBounds.union(lastFrame)

            currentIndex += 1
            lastFrame = rect
        }

        // Determine the next segment style.
        switch count - currentIndex {
        case 1:
            segment = .fullWidth
        case 2:
            segment = .fiftyFifty
        default:
            switch segment {
            case .fullWidth:
                segment = .fiftyFifty
            case .fiftyFifty:
                segment = .twoThirdsOneThird
            case .twoThirdsOneThird:
                segment = .oneThirdTwoThirds
            case .oneThirdTwoThirds:
                segment = .fiftyFifty
            }
        }
    }
}
```

**전체 Content Size 제공하기**

`collectionViewContentSize`를 재정의해 Collection View에 전체 콘텐츠 크기를 제공해요.

```swift
override var collectionViewContentSize: CGSize {
    return contentBounds.size
}
```

**Layout Attributes 정의하기**

`layoutAttributesForElements(in:)`을 재정의해 특정 기하 영역에 포함되는 Layout Attributes를 제공해요. Collection View는 item을 표시하기 위해 이 메서드를 주기적으로 호출하며, 이 과정을 기하 영역을 이용한 조회라고 해요.

```swift
override func layoutAttributesForElements(in rect: CGRect) -> [UICollectionViewLayoutAttributes]? {
    var attributesArray = [UICollectionViewLayoutAttributes]()

    // Find any cell that sits within the query rect.
    guard let lastIndex = cachedAttributes.indices.last,
          let firstMatchIndex = binSearch(rect, start: 0, end: lastIndex) else { return attributesArray }

    // Starting from the match, loop up and down through the array until all the attributes
    // have been added within the query rect.
    for attributes in cachedAttributes[..<firstMatchIndex].reversed() {
        guard attributes.frame.maxY >= rect.minY else { break }
        attributesArray.append(attributes)
    }

    for attributes in cachedAttributes[firstMatchIndex...] {
        guard attributes.frame.minY <= rect.maxY else { break }
        attributesArray.append(attributes)
    }

    return attributesArray
}
```

특정 item 하나의 Layout Attributes도 제공하도록 `layoutAttributesForItem(at:)`을 구현해요. Collection View는 특정 item을 표시하기 위해 이 메서드도 주기적으로 호출하며, 이 과정을 IndexPath를 이용한 조회라고 해요.

```swift
override func layoutAttributesForItem(at indexPath: IndexPath) -> UICollectionViewLayoutAttributes? {
    return cachedAttributes[indexPath.item]
}
```

이 두 메서드는 자주 호출되므로 앱 성능에 영향을 줄 수 있어요. 가능한 한 효율적으로 구현해야 해요.

**Bounds 변경 처리하기**

Collection View의 크기나 origin이 달라져 bounds가 변경될 때마다 `shouldInvalidateLayout(forBoundsChange:)`이 호출돼요. 스크롤하는 동안에도 자주 호출되며, 기본 구현은 보통 `false`를 반환하고 크기와 origin이 바뀐 경우 `true`를 반환해요.

```swift
override func shouldInvalidateLayout(forBoundsChange newBounds: CGRect) -> Bool {
    guard let collectionView = collectionView else { return false }
    return !newBounds.size.equalTo(collectionView.bounds.size)
}
```

샘플은 최적의 성능을 위해 `layoutAttributesForElements(in:)`에서 매번 attributes를 선형 탐색하는 대신, 주어진 bounds 영역에 필요한 attributes를 이진 탐색으로 찾도록 구현해요.

### Batch Update 수행하기 (Perform batch updates)

내비게이션 바 오른쪽 버튼을 탭하면 Collection View가 여러 셀의 삽입·삭제·이동·reload를 한 번에 애니메이션하는 batch update를 실행해요.

`performBatchUpdates(_:completion:)` 호출 안에서 시스템은 모든 삽입·삭제·이동·reload 작업을 동시에 애니메이션해요. 이 샘플은 업데이트 하나를 나타내는 `PersonUpdate` 배열을 처리해 변경을 묶어요.

- `insert`: `Person` 객체와 삽입할 index를 포함해요.
- `delete`: 삭제할 index를 포함해요.
- `move`: 출발 index와 도착 index를 포함해요.
- `reload`: 다시 불러올 index를 포함해요.

먼저 셀 이동이 없는 `reload` 작업을 애니메이션 없이 수행해요.

```swift
// Perform any cell reloads without animation because there is no movement.
UIView.performWithoutAnimation {
    collectionView.performBatchUpdates({
        for update in remoteUpdates {
            if case let .reload(index) = update {
                people[index].isUpdated = true
                collectionView.reloadItems(at: [IndexPath(item: index, section: 0)])
            }
        }
    })
}
```

다음으로 나머지 작업을 함께 애니메이션해요.

```swift
// Animate all other update types together.
collectionView.performBatchUpdates({
    var deletes = [Int]()
    var inserts = [(person:Person, index:Int)]()

    for update in remoteUpdates {
        switch update {
        case let .delete(index):
            collectionView.deleteItems(at: [IndexPath(item: index, section: 0)])
            deletes.append(index)

        case let .insert(person, index):
            collectionView.insertItems(at: [IndexPath(item: index, section: 0)])
            inserts.append((person, index))

        case let .move(fromIndex, toIndex):
            // Updates that move a person are split into an addition and a deletion.
            collectionView.moveItem(at: IndexPath(item: fromIndex, section: 0),
                                    to: IndexPath(item: toIndex, section: 0))
            deletes.append(fromIndex)
            inserts.append((people[fromIndex], toIndex))

        default: break
        }
    }

    // Apply deletions in descending order.
    for deletedIndex in deletes.sorted().reversed() {
        people.remove(at: deletedIndex)
    }

    // Apply insertions in ascending order.
    let sortedInserts = inserts.sorted(by: { (personA, personB) -> Bool in
        return personA.index <= personB.index
    })
    for insertion in sortedInserts {
        people.insert(insertion.person, at: insertion.index)
    }

    // The update button is enabled only if the list still has people in it.
    navigationItem.rightBarButtonItem?.isEnabled = !people.isEmpty
})
```

## Swift-KR 보충: 어떤 방식을 선택할까요?

| 요구사항                                | 먼저 선택할 방식                      |
| --------------------------------------- | ------------------------------------- |
| 같은 크기의 단순 행·열 grid             | `UICollectionViewFlowLayout`          |
| item/group/section을 조합한 복합 화면   | `UICollectionViewCompositionalLayout` |
| 데이터에 따라 완전히 자유로운 frame     | `UICollectionViewLayout` 하위 클래스  |
| 수동 insert/delete/move의 일관성이 부담 | Diffable Data Source snapshot         |

## 참고 자료

- [Apple Developer Documentation — Customizing collection view layouts](https://developer.apple.com/documentation/uikit/customizing-collection-view-layouts)
- [UICollectionViewLayout](./uicollectionviewlayout)
- [UICollectionViewFlowLayout](./uicollectionviewflowlayout)
- [Layouts](./index)
