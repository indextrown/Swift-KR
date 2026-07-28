---
title: 'reloadData()와 performBatchUpdates 예제'
description: 'UICollectionViewDataSource와 배열을 직접 관리할 때 reloadData()와 performBatchUpdates를 선택하고, CollectionDifference와 DifferenceKit의 차이 계산 방식을 비교합니다.'
---

# reloadData()와 performBatchUpdates 예제

> **면접 답변 한 줄 요약:** `reloadData()`는 최신 배열을 한 번에 다시 표시하는 안전한 갱신이고, `performBatchUpdates`는 배열 변경과 insert·delete·move 명령을 같은 batch에 맞춰 부분 변경을 애니메이션으로 보여 주는 방식이에요.

이 문서는 `UICollectionViewDiffableDataSource`를 사용하지 않고, `UICollectionViewDataSource`와 `[Photo]` 배열을 직접 관리하는 상황을 다뤄요. 화면이 새 배열을 받았을 때 단순하게 다시 그릴지, 변경된 item만 애니메이션으로 반영할지 판단할 수 있게 돼요.

공통 모델과 셀은 [예제 한눈에 보기](./index), 기본 data source 연결은 [`UICollectionViewDataSource` 예제](./data-source)에서 먼저 확인하세요.

## 먼저 알아둘 용어

| 용어                  | 쉬운 뜻                                                                                                   |
| --------------------- | --------------------------------------------------------------------------------------------------------- |
| backing store         | Collection View가 보여 줄 실제 데이터예요. 이 문서에서는 `photos` 배열이에요.                             |
| `reloadData()`        | 현재 backing store를 기준으로 모든 section·item 수와 셀 구성을 다시 요청하게 하는 메서드예요.             |
| `performBatchUpdates` | 삽입·삭제·이동·다시 구성 명령을 하나의 애니메이션 묶음으로 실행하는 메서드예요.                           |
| diff                  | 이전 배열과 새 배열을 비교해 무엇이 삽입·삭제·이동·변경됐는지 나타낸 결과예요.                            |
| offset                | 배열의 정수 위치예요. `CollectionDifference`는 `IndexPath`가 아니라 배열 offset을 사용해요.               |
| changeset             | 여러 변경 명령과 각 단계의 데이터를 함께 나타낸 값이에요. DifferenceKit에서는 안전한 batch 갱신 단위예요. |

## 먼저 `UICollectionViewDataSource`와 배열을 연결해요

두 방식 모두 data source가 읽는 배열 하나를 진실 공급원으로 둬요. `numberOfItemsInSection`이 반환하는 수와 `photos.count`가 다르면 Collection View 갱신 중 예외가 발생할 수 있어요.

```swift
@MainActor
final class ManualPhotoGridViewController: UIViewController {
  private var photos = Photo.samples

  private lazy var collectionView = UICollectionView(
    frame: .zero,
    collectionViewLayout: makeGridLayout()
  )
}

extension ManualPhotoGridViewController:
  UICollectionViewDataSource
{
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
    guard let cell = collectionView.dequeueReusableCell(
      withReuseIdentifier: PhotoCell.reuseIdentifier,
      for: indexPath
    ) as? PhotoCell else {
      preconditionFailure("PhotoCell 등록을 확인하세요.")
    }

    cell.configure(with: photos[indexPath.item])
    return cell
  }
}
```

실제 화면에서는 `viewDidLoad()`에서 `collectionView.dataSource = self`와 셀 등록을 마쳐야 해요. 이 문서에서는 갱신 흐름에 집중하기 위해 해당 설정은 생략해요.

## 새 배열 전체를 받았다면 `reloadData()`부터 시작해요

서버 검색 결과처럼 새 배열 전체를 받았고, 어떤 item이 어떻게 바뀌었는지 보여 줄 필요가 없다면 `reloadData()`가 가장 짧고 안전해요.

```swift
extension ManualPhotoGridViewController {
  func show(_ newPhotos: [Photo]) {
    photos = newPhotos
    collectionView.reloadData()
  }
}
```

먼저 `photos`를 새 값으로 바꾼 뒤 `reloadData()`를 호출해요. 그러면 Collection View가 다시 data source에 item 수와 셀을 요청하므로, 새 배열 상태와 화면 상태가 자연스럽게 맞아요.

### `reloadData()`가 잘 맞는 상황

| 상황                                                    | 이유                                                           |
| ------------------------------------------------------- | -------------------------------------------------------------- |
| 첫 화면을 표시해요.                                     | 이전 화면 상태가 없으므로 item별 애니메이션이 필요하지 않아요. |
| 검색 조건·정렬 기준·계정이 한 번에 크게 바뀌어요.       | 대부분의 item이 달라져 개별 변경을 계산하는 이점이 작아요.     |
| 오류 상태에서 안전하게 최신 상태를 다시 보여 줘야 해요. | 삽입·삭제 위치를 직접 맞출 필요가 없어요.                      |
| 목록이 작고 갱신 빈도가 낮아요.                         | 구현 복잡도보다 단순성이 더 중요해요.                          |

대신 기존 셀의 삽입·삭제·이동 전환을 보여 주지 못하고, 화면 상태가 크게 바뀔 수 있어요. 선택 상태, 스크롤 위치, 진행 중인 셀 애니메이션을 세밀하게 이어야 한다면 부분 갱신을 검토하세요.

## 한두 개의 사용자 동작은 `performBatchUpdates`로 반영해요

`performBatchUpdates(_:completion:)`는 여러 insert·delete·reload·move 명령을 하나의 애니메이션으로 묶어요. Apple은 data model을 updates closure 안에서 바꾸거나, 호출 전에 layout이 최신 상태인지 보장하라고 안내해요. 이 예제는 두 상태가 어긋나지 않도록 **배열 변경과 Collection View 명령을 같은 closure에 둬요.**

### 마지막에 item을 추가해요

```swift
extension ManualPhotoGridViewController {
  func append(_ photo: Photo) {
    let indexPath = IndexPath(
      item: photos.count,
      section: 0
    )

    collectionView.performBatchUpdates {
      photos.append(photo)
      collectionView.insertItems(at: [indexPath])
    }
  }
}
```

`indexPath`는 변경 전 배열의 마지막 다음 위치예요. 배열에 item을 추가한 뒤에는 그 위치가 새 item의 위치가 되므로, `insertItems(at:)`과 일치해요.

### 선택한 item을 삭제해요

```swift
extension ManualPhotoGridViewController {
  func deletePhoto(id: Photo.ID) {
    guard let index = photos.firstIndex(
      where: { $0.id == id }
    ) else {
      return
    }

    let indexPath = IndexPath(item: index, section: 0)

    collectionView.performBatchUpdates {
      photos.remove(at: index)
      collectionView.deleteItems(at: [indexPath])
    }
  }
}
```

삭제 `IndexPath`는 **변경 전** 배열에서 찾은 위치예요. Apple은 한 batch 안에서 삭제를 먼저 처리하고 삽입을 처리한다고 설명해요. 삭제 후의 index로 `deleteItems(at:)`를 호출하지 않도록 주의하세요.

### 같은 item의 표시 내용만 다시 구성해요

```swift
extension ManualPhotoGridViewController {
  func toggleFavorite(id: Photo.ID) {
    guard let index = photos.firstIndex(
      where: { $0.id == id }
    ) else {
      return
    }

    let indexPath = IndexPath(item: index, section: 0)

    collectionView.performBatchUpdates {
      photos[index].isFavorite.toggle()
      collectionView.reloadItems(at: [indexPath])
    }
  }
}
```

이 경우 item의 정체성과 위치는 유지되고 셀 표시만 바뀌어요. `reloadItems(at:)`와 `insertItems(at:)` 또는 `deleteItems(at:)`에 같은 `IndexPath`를 동시에 넣으면 충돌할 수 있으므로, 한 item에는 한 종류의 변경을 적용하세요.

### item 순서를 옮겨요

```swift
extension ManualPhotoGridViewController {
  func movePhoto(from source: Int, to destination: Int) {
    guard photos.indices.contains(source),
          photos.indices.contains(destination),
          source != destination else {
      return
    }

    let sourceIndexPath = IndexPath(item: source, section: 0)
    let destinationIndexPath = IndexPath(
      item: destination,
      section: 0
    )

    collectionView.performBatchUpdates {
      let photo = photos.remove(at: source)
      photos.insert(photo, at: destination)
      collectionView.moveItem(
        at: sourceIndexPath,
        to: destinationIndexPath
      )
    }
  }
}
```

화면만 이동시키면 다음 갱신에서 원래 순서로 돌아와요. `moveItem(at:to:)`와 배열 순서 변경을 반드시 함께 실행하세요.

## `reloadData()`와 `performBatchUpdates`를 비교해요

| 기준               | `reloadData()`                                        | `performBatchUpdates`                                    |
| ------------------ | ----------------------------------------------------- | -------------------------------------------------------- |
| 입력               | 최신 배열 전체                                        | 삽입·삭제·이동·내용 변경과 각각의 정확한 `IndexPath`     |
| 모델 갱신          | 호출 전에 배열을 새 상태로 바꿔요.                    | 배열 변경과 UI 명령을 같은 updates closure에 맞춰요.     |
| 화면 전환          | 전체를 다시 요청하므로 item별 전환을 보장하지 않아요. | 변경된 item을 하나의 애니메이션 묶음으로 보여 줘요.      |
| 구현 비용          | 낮아요.                                               | 높아요. update 전후 item 수와 위치를 직접 맞춰야 해요.   |
| 실패하기 쉬운 지점 | 셀 구성에서 이전 상태를 덮어쓰지 않는 경우예요.       | 배열과 `IndexPath` 또는 명령 종류가 불일치하는 경우예요. |
| 적합한 경우        | 초기 로드, 전면 교체, 변경이 매우 많을 때예요.        | 추가·삭제·이동처럼 사용자가 즉시 실행한 작은 변경이에요. |

`reloadData()`는 “최종 배열만 보여 주면 된다”는 문제를 풀고, `performBatchUpdates`는 “최종 배열까지 가는 변화를 보여 준다”는 문제를 풀어요. 더 복잡한 갱신이 항상 더 나은 것은 아니에요.

## 직접 배열 관리에 `performBatchUpdates`가 항상 필요한 것은 아니에요

아니요. `UICollectionViewDataSource`와 배열을 직접 관리한다고 해서 `performBatchUpdates`를 반드시 호출할 필요는 없어요. 화면 갱신 방법은 **어떤 Collection View 갱신 API를 선택하는지**에 따라 달라져요.

| 배열에 한 작업                             | Collection View 호출          | `performBatchUpdates` 필요 여부 | 적합한 상황                                                                   |
| ------------------------------------------ | ----------------------------- | ------------------------------- | ----------------------------------------------------------------------------- |
| 새 배열 전체를 대입해요.                   | `reloadData()`                | 필요 없어요.                    | 최초 표시, 검색 결과 교체, 정렬 기준 변경처럼 화면 상태를 통째로 바꿀 때예요. |
| item 하나를 추가해요.                      | `insertItems(at:)`            | 필수는 아니에요.                | 아주 단순한 한 건 삽입만 애니메이션할 때예요.                                 |
| item 하나를 삭제해요.                      | `deleteItems(at:)`            | 필수는 아니에요.                | 한 건 삭제만 있고 다른 변경과 묶을 이유가 없을 때예요.                        |
| 여러 삽입·삭제·이동·내용 변경을 함께 해요. | `performBatchUpdates { ... }` | 권장해요.                       | 사용자가 하나의 행동으로 만든 여러 변화를 한 전환으로 보여 줄 때예요.         |
| 변경 순서와 위치를 확신할 수 없어요.       | `reloadData()`                | 사용하지 않는 편이 안전해요.    | 서버 동기화 직후처럼 차이가 크거나 복잡할 때예요.                             |

`insertItems(at:)`, `deleteItems(at:)`, `moveItem(at:to:)`, `reloadItems(at:)` 자체도 부분 갱신 API예요. `performBatchUpdates`는 이 명령을 사용할 수 있게 만드는 필수 관문이 아니라, **여러 명령을 하나의 애니메이션과 검증 단위로 묶는 API**예요.

```swift
func appendWithoutBatch(_ photo: Photo) {
  let indexPath = IndexPath(
    item: photos.count,
    section: 0
  )

  photos.append(photo)
  collectionView.insertItems(at: [indexPath])
}
```

이 한 건 삽입은 동작할 수 있어요. 하지만 삭제와 삽입, 이동을 함께 적용하거나 그 사이에 layout 변경까지 섞이면 각 명령이 따로 애니메이션되고, update 전후 item 수를 추적하기가 어려워져요. 그런 경우에는 앞에서 본 것처럼 배열 변경과 UI 명령을 `performBatchUpdates`의 closure 하나에 모으세요.

반대로 다음 코드는 피해야 해요.

```swift
collectionView.performBatchUpdates {
  photos.append(newPhoto)
  collectionView.insertItems(at: [newIndexPath])
  collectionView.reloadData() // batch 안의 부분 갱신과 전체 갱신을 섞지 않아요.
}
```

같은 갱신에서 전체 재로드와 부분 update 명령을 함께 쓰면 무엇을 애니메이션할지 모호해지고, 배열과 화면 item 수를 맞추기도 어려워져요. 전체 갱신이 필요하다면 batch를 만들지 말고 `reloadData()`만 호출하세요.

## 직접 배열 관리와 Diffable Data Source의 책임을 비교해요

두 방식 모두 앱이 최신 모델을 가져오고, 셀을 구성하고, 선택·네트워크·저장소 상태를 관리해야 한다는 점은 같아요. 차이는 **누가 이전 화면과 새 화면의 차이를 해석해 Collection View 명령으로 바꾸는가**예요.

```text
직접 배열 관리
새 배열 또는 사용자 동작
  └─ 개발자가 배열 변경 + IndexPath + insert/delete/move/reload 명령을 결정
       └─ UICollectionViewDataSource가 변경된 배열을 읽음

Diffable Data Source
새 배열 또는 사용자 동작
  └─ 앱이 안정적인 ID로 snapshot을 만듦
       └─ UICollectionViewDiffableDataSource가 이전 snapshot과 비교해 화면 변경을 적용
```

| 기준                | 직접 배열 관리 + `UICollectionViewDataSource`                                              | `UICollectionViewDiffableDataSource`                                                                |
| ------------------- | ------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------- |
| data source 작성    | `numberOfItemsInSection`, `cellForItemAt`를 직접 구현해요.                                 | cell provider closure 또는 cell registration으로 셀을 제공해요.                                     |
| 화면 상태 표현      | 보통 `[Photo]` 배열과 현재 `IndexPath`예요.                                                | section·item identifier로 만든 snapshot이에요. 모델 배열은 별도 backing store로 유지할 수 있어요.   |
| 변경 명령 작성자    | 개발자가 `insertItems`, `deleteItems`, `moveItem`, `reloadItems`를 골라요.                 | 앱은 목표 snapshot을 `apply`하고, data source가 화면 변경을 계산해요.                               |
| 위치와 정체성       | `IndexPath`를 직접 계산하므로 위치를 중심으로 생각하기 쉬워요.                             | item identifier가 중심이에요. 위치가 바뀌어도 같은 ID면 같은 item으로 다뤄요.                       |
| 삽입·삭제·이동 검증 | 배열의 update 전후 개수와 모든 `IndexPath`를 개발자가 맞춰야 해요.                         | snapshot 안에서 section·item identifier가 유일해야 해요. 위치별 update 명령을 직접 맞추지는 않아요. |
| 내용만 변경         | 배열을 바꾼 뒤 `reloadItems(at:)`의 위치를 찾아야 해요.                                    | ID를 유지하고 `reconfigureItems(_:)` 또는 `reloadItems(_:)`로 해당 ID를 표시 갱신해요.              |
| 복잡한 전환         | 여러 명령을 `performBatchUpdates`로 묶거나, DifferenceKit처럼 diff 결과를 단계화해야 해요. | snapshot 하나가 목표 상태이므로 여러 삽입·삭제·이동을 함께 표현하기 쉬워요.                         |
| 오래된 코드 연결    | 기존 protocol data source와 배열을 그대로 유지하기 쉬워요.                                 | data source 교체와 identifier 설계가 필요해요.                                                      |
| 주의할 점           | 잘못된 순서·중복 `IndexPath`·개수 불일치가 invalid update 예외로 이어질 수 있어요.         | snapshot 적용이 모델 저장소를 자동으로 바꾸지는 않으며, identifier 중복은 허용되지 않아요.          |

### 직접 배열 관리는 명령형이에요

직접 배열 관리에서는 개발자가 “이 index의 item을 삭제하고, 저 index에 삽입한다”처럼 **변경 과정**을 명령해요. 그래서 작은 사용자 동작을 정확한 애니메이션으로 보여 주기 좋지만, 화면이 복잡해질수록 `IndexPath`의 기준이 변경 전인지 변경 후인지 계속 확인해야 해요.

```swift
collectionView.performBatchUpdates {
  photos.remove(at: deletedIndex)
  collectionView.deleteItems(
    at: [IndexPath(item: deletedIndex, section: 0)]
  )
}
```

### Diffable Data Source는 선언형에 가까워요

Diffable Data Source에서는 “이제 화면에 이 section과 이 ID 순서가 있어야 한다”는 **목표 상태**를 snapshot으로 전달해요. data source가 이전 snapshot과 새 snapshot을 비교하므로, 개별 `IndexPath` 기반 insert·delete·move 명령을 작성하지 않아요.

```swift
photos = newPhotos

var snapshot = NSDiffableDataSourceSnapshot<Section, Photo.ID>()
snapshot.appendSections([.main])
snapshot.appendItems(photos.map(\.id), toSection: .main)

dataSource.apply(snapshot, animatingDifferences: true)
```

이 방식도 `photos` 배열을 자동으로 업데이트하지는 않아요. 위 코드처럼 backing store를 먼저 최신 상태로 만들고 snapshot에는 안정적인 ID를 넣어야 cell provider가 올바른 모델을 찾을 수 있어요.

### 어느 쪽을 선택할지 판단해요

- 기존 화면이 `UICollectionViewDataSource`와 배열 중심이고, 변경이 적거나 단순한 사용자 동작만 있다면 직접 관리가 자연스러워요.
- 서버 결과처럼 목록의 최종 상태를 자주 받거나, 삽입·삭제·이동이 한 번에 섞인다면 Diffable Data Source가 `IndexPath` 관리 부담을 줄여 줘요.
- 직접 배열 관리가 곧 `performBatchUpdates` 사용을 뜻하지는 않아요. 전체 교체는 `reloadData()`가 더 단순하고 안전할 수 있어요.
- Diffable Data Source를 도입해도 셀 구성, 모델 갱신, 페이지네이션, 오류 처리 같은 앱 책임은 남아요.

## `Collection.difference(from:)`는 Swift 기본 diff예요

Swift 표준 라이브러리의 `difference(from:)`는 새 컬렉션을 기준으로 이전 컬렉션에서 여기까지 오기 위해 필요한 삽입과 삭제를 계산해 `CollectionDifference`를 반환해요. element가 `Equatable`이면 사용할 수 있어요.

```swift
let oldIDs = ["A", "B", "C"]
let newIDs = ["B", "C", "D"]

let difference = newIDs
  .difference(from: oldIDs)
  .inferringMoves()

for change in difference {
  print(change)
}
```

기본 difference에는 move가 포함되지 않아요. `inferringMoves()`를 호출하면 한 번만 제거되고 한 번만 삽입된 같은 element를 이동으로 연결해 볼 수 있어요. 다만 이 결과는 배열 offset이며, 바로 `IndexPath` 목록으로 바꿔 무작정 batch update를 호출하면 삭제·삽입·이동이 겹치는 경우에 잘못된 순서를 만들 수 있어요.

또한 `difference(from:)`의 최악 시간 복잡도는 O(n × m)이에요. 공유 element가 많거나 element가 `Hashable`이면 더 빠를 수 있지만, 큰 목록을 고빈도로 비교하는 전용 UI diff 도구로 설계된 API는 아니에요.

## `CollectionDifference`와 DifferenceKit을 비교해요

DifferenceKit은 UIKit 목록의 batch update에 맞춘 외부 라이브러리예요. `Differentiable`로 안정적인 identity와 내용 동일성 판단을 분리하고, 한 번에 적용하면 충돌할 수 있는 변경 조합을 `StagedChangeset` 여러 단계로 나눠 적용해요.

### 알고리즘부터 비교해요

Swift 표준 라이브러리의 현재 소스 구현은 내부적으로 **Myers diff algorithm**을 사용해요. Myers 알고리즘은 두 순서 컬렉션을 삽입과 삭제만으로 바꿀 때 필요한 **최소 편집 경로(shortest edit script)**를 찾는 알고리즘이에요. 다만 공개 API가 보장하는 성능은 병적인 입력에서 최악 O(n × m)이고, 구현 알고리즘 자체에 의존해 앱의 동작을 설계하면 안 돼요.

DifferenceKit은 **Paul Heckel 알고리즘을 Swift 컬렉션에 맞게 최적화한 방식**을 사용해요. 이 방식은 안정적인 identifier를 먼저 연결해 이동과 내용 변경을 목록 UI에 맞게 표현하고 O(n)을 목표로 해요. 대신 항상 가장 적은 수의 삽입·삭제 조합, 즉 최단 edit script를 선택한다고 보장하지는 않아요.

| 비교 기준                 | `Collection.difference(from:)`                                                                                                                                 | DifferenceKit                                                                                                                                        |
| ------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| 제공 위치                 | Swift 5.1부터 제공하는 표준 라이브러리 API예요. 별도 의존성이 없어요.                                                                                          | 외부 Swift Package예요. UIKit용 extension까지 쓰려면 패키지를 추가해야 해요.                                                                         |
| 현재 구현 알고리즘        | Myers diff algorithm이에요. 두 순서의 차이를 삽입·삭제 edit script로 계산해요.                                                                                 | Paul Heckel 기반 알고리즘이에요. identifier를 활용해 목록 UI의 이동과 갱신을 계산해요.                                                               |
| 알고리즘이 우선하는 목표  | 삽입·삭제로 표현되는 최소 편집 경로를 찾는 데 초점이 있어요.                                                                                                   | 큰 목록의 빠른 변화 계산과 UI batch update 적용에 초점이 있어요.                                                                                     |
| 공개 성능 계약            | 병적인 입력의 최악 시간 복잡도는 O(n × m)예요. 공통 element가 많거나 element가 `Hashable`이면 더 빠를 수 있어요.                                               | 문서상 O(n)이에요. 단, 항상 가장 짧은 diff를 계산하지는 않아요.                                                                                      |
| “같은 element”의 기준     | `Equatable` 또는 `difference(from:by:)`의 동등성 closure 하나예요.                                                                                             | `differenceIdentifier`는 정체성, `isContentEqual(to:)`는 표시 내용 동일성을 따로 표현해요.                                                           |
| ID와 내용 변경 분리       | 기본 API에는 없어요. ID만 비교하면 내용 변경을 감지하지 못하고, 모델 전체를 비교하면 내용 변경이 remove + insert처럼 보일 수 있어요.                           | ID가 같고 내용만 다르면 update로 표현할 수 있어 셀을 다시 구성하기 쉬워요.                                                                           |
| 기본 결과 타입            | `CollectionDifference`예요. `.remove`와 `.insert` change만 담아요.                                                                                             | `Changeset`과 여러 단계의 `StagedChangeset`이에요. 삭제·삽입·이동·내용 갱신 정보를 담아요.                                                           |
| 이동 처리                 | 기본 `difference(from:)`는 move를 추론하지 않아요. `inferringMoves()`가 한 번씩만 제거·삽입된 `Hashable` element를 연결해요.                                   | 같은 `differenceIdentifier`를 기준으로 이동을 계산해요. 중복 identifier는 잘못된 모델이므로 금지해야 해요.                                           |
| 중복 값                   | 같은 값이 여러 번 있으면 어느 값이 이동했는지 모호할 수 있어요. `inferringMoves()`도 한 번씩만 나타난 값에만 안전하게 연결해요.                                | 중복 element 자체는 다룰 수 있지만, 같은 identifier가 중복되면 move는 최선의 결과만 나와요. 목록 item에는 고유 ID가 필요해요.                        |
| change 순서와 offset      | remove offset은 원본 배열 기준, insert offset은 최종 배열 기준이에요. 순회하면 remove를 높은 offset부터, insert를 낮은 offset부터 제공해 배열 적용이 안전해요. | 각 `Changeset`이 그 stage 뒤의 `data`와 함께 와요. 이전 stage의 data를 data source에 반영한 뒤 다음 stage를 적용해요.                                |
| section 모델              | 1차원 차이만 제공해요. section이 있으면 2차원 모델, section 변화, `IndexPath` 변환을 직접 설계해야 해요.                                                       | 선형 collection과 sectioned collection을 모두 지원해요. section과 item 변경을 함께 다룰 수 있어요.                                                   |
| UIKit batch update 안전성 | `CollectionDifference`는 UIKit API가 아니에요. offset을 `IndexPath`로 바꾸고, model 갱신·삭제·삽입·이동 순서를 개발자가 보장해야 해요.                         | 한 batch에 함께 넣으면 충돌할 수 있는 변경 조합을 최소 stage로 나눠 `UICollectionView`에 적용해요. 각 stage 직전 data source 배열을 동기화해야 해요. |
| 잘 맞는 문제              | 값 목록의 비교·패치, undo/redo, 작은 목록의 단순한 diff처럼 UI와 무관한 순서 컬렉션 차이예요.                                                                  | Diffable Data Source 없이 기존 `UICollectionViewDataSource`를 유지하면서 복합 삽입·삭제·이동을 애니메이션해야 하는 목록 UI예요.                      |

### `CollectionDifference`는 UI 명령 목록이 아니에요

예를 들어 이전 배열이 `[A, B, C]`이고 새 배열이 `[B, C, D]`라면, `CollectionDifference`는 원본 offset 0의 `A` 제거와 최종 offset 2의 `D` 삽입을 나타내요. 이 결과는 배열에 적용하기 좋은 순서로 제공되지만, UIKit이 원하는 section·item의 `IndexPath`, 셀 내용 갱신, 여러 변경의 batch 분할까지 자동으로 해결하지는 않아요.

```swift
let oldIDs = ["A", "B", "C"]
let newIDs = ["B", "C", "D"]

let difference = newIDs.difference(from: oldIDs)

for change in difference {
  switch change {
  case let .remove(offset, element, _):
    print("원본 offset \(offset)의 \(element)를 제거")
  case let .insert(offset, element, _):
    print("최종 offset \(offset)에 \(element)를 삽입")
  }
}
```

따라서 `CollectionDifference`는 “두 배열의 차이를 계산하는 표준 도구”로 보고, 복잡한 Collection View 애니메이션을 자동으로 만들어 주는 도구로 기대하면 안 돼요. UI까지 직접 연결하려면 변화 조합을 충분히 테스트하거나 DifferenceKit처럼 UIKit batch update를 지원하는 도구를 사용하세요.

DifferenceKit도 배열을 자동으로 소유하지 않아요. 매 stage 직전에 data source가 읽는 배열을 그 stage의 `data`로 동기화해야 해요.

```swift
import DifferenceKit

extension Photo: Differentiable {
  var differenceIdentifier: UUID {
    id
  }

  func isContentEqual(to source: Photo) -> Bool {
    title == source.title &&
      symbolName == source.symbolName &&
      isFavorite == source.isFavorite
  }
}

extension ManualPhotoGridViewController {
  func showAnimated(_ newPhotos: [Photo]) {
    let changeset = StagedChangeset(
      source: photos,
      target: newPhotos
    )

    collectionView.reload(
      using: changeset,
      interrupt: { $0.changeCount > 100 }
    ) { [weak self] data in
      self?.photos = data
    }
  }
}
```

`interrupt` 조건은 변경이 너무 많을 때 애니메이션을 중단하고 `reloadData()`로 돌아가게 하는 안전장치예요. 이 코드는 DifferenceKit의 UIKit extension을 쓸 때만 컴파일돼요.

## 어떤 방식을 선택할지 정리해요

1. 화면을 처음 표시하거나 목록 전체가 바뀌면 먼저 `photos = newPhotos` 후 `reloadData()`를 사용하세요.
2. 버튼 탭처럼 추가·삭제·이동이 한두 개이고 사용자가 전환을 봐야 한다면 `performBatchUpdates` 안에서 배열과 UI 명령을 함께 바꾸세요.
3. 서버에서 온 큰 배열 두 개를 자주 비교하고, 삽입·삭제·이동이 한 번에 섞인다면 DifferenceKit 또는 Diffable Data Source를 검토하세요.
4. `CollectionDifference`를 UI 갱신에 연결한다면 삭제·삽입·이동 순서와 offset을 충분히 테스트하세요. 단순 diff 계산만 필요하면 UI API를 연결하지 마세요.
5. 어떤 방식을 쓰든 `IndexPath`는 위치이고 `Photo.ID`는 정체성이므로, 비동기 작업과 선택 상태는 ID로 보관하세요.

## 면접에서 이어질 수 있는 질문

### `reloadData()`와 `performBatchUpdates` 중 무엇을 먼저 선택하나요?

목록 전체를 새 상태로 바꾸거나 변경 전환이 중요하지 않다면 `reloadData()`를 먼저 선택해요. 사용자가 방금 실행한 삽입·삭제·이동을 자연스럽게 보여 줘야 하고, 모델과 `IndexPath`를 정확히 관리할 수 있을 때만 `performBatchUpdates`를 사용해요.

### `performBatchUpdates`에서 왜 배열과 UI 명령을 함께 바꾸나요?

Collection View는 data source에 update 전후 item 수를 물어봐요. 배열 변경과 insert·delete 명령이 어긋나면 화면의 수와 모델 수가 달라져 invalid update 예외가 발생할 수 있으므로, 같은 batch에서 두 상태를 일치시켜야 해요.

### `CollectionDifference`만으로 UIKit 목록을 안전하게 갱신할 수 있나요?

가능하지만 diff의 offset을 `IndexPath`로 바꾸고, 삭제·삽입·이동 순서와 모델 갱신 시점을 직접 설계해야 해요. 변경이 복잡할수록 단계 분리를 제공하는 DifferenceKit이나 snapshot 기반 Diffable Data Source가 더 안전할 수 있어요.

### DifferenceKit은 Diffable Data Source를 대체하나요?

둘 다 목록 차이를 화면에 반영하지만 API와 책임이 달라요. DifferenceKit은 기존 `UICollectionViewDataSource`와 배열을 유지하면서 staged batch update를 돕고, Diffable Data Source는 identifier snapshot을 data source API 자체로 제공해요.

## 참고 자료

- [Apple Developer Documentation — performBatchUpdates(_:completion:)](<https://developer.apple.com/documentation/uikit/uicollectionview/performbatchupdates(_:completion:)>)
- [Apple Developer Documentation — Array.difference(from:)](<https://developer.apple.com/documentation/swift/array/difference(from:)>)
- [Apple Developer Documentation — CollectionDifference](https://developer.apple.com/documentation/swift/collectiondifference)
- [Swift Evolution — SE-0240 Ordered Collection Diffing](https://github.com/swiftlang/swift-evolution/blob/main/proposals/0240-ordered-collection-diffing.md)
- [Swift Standard Library Source — CollectionDifference](https://github.com/swiftlang/swift/blob/main/stdlib/public/core/CollectionDifference.swift)
- [DifferenceKit — UICollectionView Extension Reference](https://ra1028.github.io/DifferenceKit/Extensions/UICollectionView.html)
- [DifferenceKit — StagedChangeset Reference](https://ra1028.github.io/DifferenceKit/Structs/StagedChangeset.html)
