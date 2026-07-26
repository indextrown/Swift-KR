---
title: 'UICollectionViewDataSource 예제'
description: 'UICollectionViewDataSource의 필수 메서드로 사진 격자를 구성하고, 모델과 batch update의 순서를 맞춰 item을 삽입·삭제·이동하는 방법을 설명합니다.'
---

# UICollectionViewDataSource 예제

> **면접 답변 한 줄 요약:** `UICollectionViewDataSource`는 Collection View가 요청한 item 개수와 재사용 셀을 `IndexPath` 기준으로 제공하며, 화면 갱신 시 모델과 update 명령을 개발자가 직접 일치시켜야 해요.

이 예제에서는 [공통 `Photo` 모델과 `PhotoCell`](./index)을 사용해 두 열 사진 격자를 만들어요. 기존 UIKit 프로젝트에서 가장 자주 만나는 protocol 기반 data source의 전체 흐름을 확인할 수 있어요.

## 먼저 알아둘 용어

| 용어             | 쉬운 뜻                                                                                             |
| ---------------- | --------------------------------------------------------------------------------------------------- |
| `IndexPath`      | section과 item의 현재 위치예요. `IndexPath(item: 2, section: 0)`은 첫 section의 세 번째 item이에요. |
| reuse identifier | 등록한 셀 종류와 dequeue할 셀을 연결하는 문자열이에요.                                              |
| batch update     | 여러 삽입·삭제·이동을 하나의 화면 갱신 단위로 실행하는 작업이에요.                                  |
| backing store    | 화면이 참조하는 실제 모델 저장소예요. 이 예제에서는 `photos` 배열이에요.                            |

## Flow Layout으로 기본 격자를 준비해요

이 문서에서는 data source에 집중하기 위해 고정된 두 열 격자를 사용해요. 화면 너비에 따라 열 수를 바꾸는 방법은 [`UICollectionViewFlowLayout` 예제](./flow-layout)에서 다뤄요.

```swift
private func makeGridLayout() -> UICollectionViewFlowLayout {
  let layout = UICollectionViewFlowLayout()
  layout.scrollDirection = .vertical
  layout.minimumInteritemSpacing = 12
  layout.minimumLineSpacing = 12
  layout.sectionInset = UIEdgeInsets(
    top: 16,
    left: 16,
    bottom: 16,
    right: 16
  )
  layout.itemSize = CGSize(width: 160, height: 160)
  return layout
}
```

`minimumInteritemSpacing`은 같은 행의 item 사이 최소 간격이고, `minimumLineSpacing`은 행 사이 최소 간격이에요.

## Collection View를 만들고 data source를 연결해요

```swift
@MainActor
final class ClassicPhotoGridViewController: UIViewController {
  private var photos = Photo.samples
  var onSelectPhoto: ((Photo.ID) -> Void)?

  private lazy var collectionView = UICollectionView(
    frame: .zero,
    collectionViewLayout: makeGridLayout()
  )

  override func viewDidLoad() {
    super.viewDidLoad()

    collectionView.translatesAutoresizingMaskIntoConstraints = false
    collectionView.backgroundColor = .systemBackground
    collectionView.dataSource = self
    collectionView.delegate = self
    collectionView.register(
      PhotoCell.self,
      forCellWithReuseIdentifier: PhotoCell.reuseIdentifier
    )

    view.addSubview(collectionView)
    NSLayoutConstraint.activate([
      collectionView.topAnchor.constraint(
        equalTo: view.safeAreaLayoutGuide.topAnchor
      ),
      collectionView.leadingAnchor.constraint(
        equalTo: view.leadingAnchor
      ),
      collectionView.trailingAnchor.constraint(
        equalTo: view.trailingAnchor
      ),
      collectionView.bottomAnchor.constraint(
        equalTo: view.bottomAnchor
      ),
    ])
  }
}
```

Collection View는 data source를 강하게 보유하지 않아요. 이 예제처럼 view controller 자신을 연결하거나, 별도 data source 객체를 프로퍼티로 강하게 보관해야 해요.

## 필수 data source 메서드 두 개를 구현해요

```swift
extension ClassicPhotoGridViewController:
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

`numberOfItemsInSection`이 반환한 개수와 배열의 실제 개수는 항상 같아야 해요. `cellForItemAt`에서는 셀을 직접 생성하지 않고 등록된 재사용 셀을 dequeue해요.

## 선택한 위치를 모델 식별자로 바꿔요

```swift
extension ClassicPhotoGridViewController:
  UICollectionViewDelegate
{
  func collectionView(
    _ collectionView: UICollectionView,
    didSelectItemAt indexPath: IndexPath
  ) {
    let selectedPhotoID = photos[indexPath.item].id
    onSelectPhoto?(selectedPhotoID)
  }
}
```

Delegate가 전달한 `IndexPath`는 선택 순간의 위치예요. 다음 화면이나 비동기 작업에는 위치 대신 `Photo.ID`를 전달해야 중간에 item이 삽입되어도 같은 사진을 가리켜요.

## item을 삽입할 때 모델을 먼저 바꿔요

```swift
extension ClassicPhotoGridViewController {
  func append(_ photo: Photo) {
    let newIndexPath = IndexPath(
      item: photos.count,
      section: 0
    )

    photos.append(photo)
    collectionView.performBatchUpdates {
      collectionView.insertItems(at: [newIndexPath])
    }
  }
}
```

새 `IndexPath`는 배열을 변경하기 전의 `photos.count`로 계산해요. 그 위치는 append 뒤 새 item의 마지막 위치가 돼요.

## item을 삭제할 때도 모델을 먼저 바꿔요

```swift
extension ClassicPhotoGridViewController {
  func deletePhoto(id: Photo.ID) {
    guard let index = photos.firstIndex(
      where: { $0.id == id }
    ) else {
      return
    }

    photos.remove(at: index)
    collectionView.performBatchUpdates {
      collectionView.deleteItems(
        at: [IndexPath(item: index, section: 0)]
      )
    }
  }
}
```

화면만 삭제하고 배열을 그대로 두거나, 배열은 바꿨지만 다른 위치를 삭제하면 update 전후 item 개수가 일치하지 않아 예외가 발생할 수 있어요.

## 재배치 결과를 모델 배열에 반영해요

`UICollectionViewDataSource`의 선택 메서드를 구현하면 Collection View가 재배치 결과를 알려 줄 수 있어요.

```swift
extension ClassicPhotoGridViewController {
  func collectionView(
    _ collectionView: UICollectionView,
    canMoveItemAt indexPath: IndexPath
  ) -> Bool {
    true
  }

  func collectionView(
    _ collectionView: UICollectionView,
    moveItemAt sourceIndexPath: IndexPath,
    to destinationIndexPath: IndexPath
  ) {
    let movedPhoto = photos.remove(
      at: sourceIndexPath.item
    )
    photos.insert(
      movedPhoto,
      at: destinationIndexPath.item
    )
  }
}
```

화면 위치만 바꾸고 배열 순서를 갱신하지 않으면 다음 `reloadData()`에서 원래 순서로 돌아가요. 서버에 순서를 저장해야 한다면 배열을 바꾼 뒤 새 ID 순서를 repository에 전달하세요.

## 여러 section을 사용할 때는 이차원 모델을 준비해요

```swift
struct PhotoSection {
  let title: String
  var photos: [Photo]
}

private var sections: [PhotoSection] = []

func numberOfSections(
  in collectionView: UICollectionView
) -> Int {
  sections.count
}

func collectionView(
  _ collectionView: UICollectionView,
  numberOfItemsInSection section: Int
) -> Int {
  sections[section].photos.count
}
```

화면의 section 구조와 backing store 구조를 같은 모양으로 유지하면 `IndexPath.section`과 `IndexPath.item`을 안전하게 해석하기 쉬워요.

## 자주 발생하는 문제를 점검해요

| 증상                                    | 먼저 확인할 것                                                                     |
| --------------------------------------- | ---------------------------------------------------------------------------------- |
| 셀이 하나도 나타나지 않아요.            | `dataSource` 연결과 `numberOfItemsInSection` 반환값을 확인해요.                    |
| dequeue 시 예외가 발생해요.             | 등록과 dequeue에 같은 reuse identifier를 사용했는지 확인해요.                      |
| batch update에서 item 개수 예외가 나요. | 모델 변경과 insert·delete 명령의 전후 개수가 맞는지 확인해요.                      |
| 스크롤 뒤 셀에 이전 내용이 남아요.      | `configure(with:)`가 모든 상태를 덮어쓰고 `prepareForReuse()`가 초기화하는지 봐요. |
| 정렬 뒤 선택한 사진이 달라져요.         | 선택 상태와 비동기 작업을 `IndexPath`가 아니라 `Photo.ID`로 저장했는지 확인해요.   |

## 언제 이 방식을 사용해야 하나요

- item 변경이 거의 없는 작은 기존 화면이라면 protocol 방식으로도 충분해요.
- 낮은 배포 대상이나 오래된 코드 구조를 유지해야 할 때 자연스럽게 연결돼요.
- 삽입·삭제·이동이 자주 겹친다면 직접 batch update를 맞추는 비용이 커질 수 있어요.
- 목표 상태를 한 값으로 표현하고 싶다면 [Diffable Data Source 예제](./diffable-data-source)를 검토하세요.

## 면접에서 이어질 수 있는 질문

### 필수 메서드는 무엇인가요?

`collectionView(_:numberOfItemsInSection:)`과 `collectionView(_:cellForItemAt:)` 두 개예요. 여러 section, supplementary view, 재배치가 필요할 때 선택 메서드를 추가해요.

### 모델을 먼저 바꿔야 하는 이유는 무엇인가요?

Collection View는 update 전후 data source가 보고한 item 개수와 삽입·삭제 명령을 검증해요. 화면과 backing store가 같은 최종 상태를 설명해야 갱신을 안전하게 완료할 수 있어요.

## 다음 예제로 이동해요

데이터와 셀을 표시했다면 [전통적인 `UICollectionViewDelegate` 예제](./traditional-delegate)에서 배열의 `IndexPath`를 모델 ID로 바꾸어 선택·하이라이트·메뉴를 처리해 보세요.

원격 이미지가 있다면 [`UICollectionViewDataSourcePrefetching` 예제](./data-source-prefetching)에서 곧 보일 item의 작업을 미리 준비해 보세요.

## 전체 최종 코드

아래 코드는 [공통 `Photo`와 `PhotoCell`](./index)을 사용해 초기 표시, 선택, 삽입, 삭제, 재배치를 한 화면에 합친 최종본이에요.

<details>
<summary>전체 코드 펼쳐보기</summary>

```swift
import UIKit

@MainActor
final class ClassicPhotoGridViewController: UIViewController {
  private var photos = Photo.samples
  var onSelectPhoto: ((Photo.ID) -> Void)?

  private lazy var collectionView = UICollectionView(
    frame: .zero,
    collectionViewLayout: makeGridLayout()
  )

  override func viewDidLoad() {
    super.viewDidLoad()

    view.backgroundColor = .systemBackground
    collectionView.translatesAutoresizingMaskIntoConstraints = false
    collectionView.backgroundColor = .systemBackground
    collectionView.dataSource = self
    collectionView.delegate = self
    collectionView.register(
      PhotoCell.self,
      forCellWithReuseIdentifier: PhotoCell.reuseIdentifier
    )

    view.addSubview(collectionView)
    NSLayoutConstraint.activate([
      collectionView.topAnchor.constraint(
        equalTo: view.safeAreaLayoutGuide.topAnchor
      ),
      collectionView.leadingAnchor.constraint(
        equalTo: view.leadingAnchor
      ),
      collectionView.trailingAnchor.constraint(
        equalTo: view.trailingAnchor
      ),
      collectionView.bottomAnchor.constraint(
        equalTo: view.bottomAnchor
      ),
    ])
  }

  private func makeGridLayout() -> UICollectionViewFlowLayout {
    let layout = UICollectionViewFlowLayout()
    layout.minimumInteritemSpacing = 12
    layout.minimumLineSpacing = 12
    layout.sectionInset = UIEdgeInsets(
      top: 16,
      left: 16,
      bottom: 16,
      right: 16
    )
    layout.itemSize = CGSize(width: 160, height: 160)
    return layout
  }

  func append(_ photo: Photo) {
    let indexPath = IndexPath(item: photos.count, section: 0)
    photos.append(photo)
    collectionView.insertItems(at: [indexPath])
  }

  func deletePhoto(id: Photo.ID) {
    guard let index = photos.firstIndex(
      where: { $0.id == id }
    ) else {
      return
    }

    photos.remove(at: index)
    collectionView.deleteItems(
      at: [IndexPath(item: index, section: 0)]
    )
  }
}

extension ClassicPhotoGridViewController:
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

  func collectionView(
    _ collectionView: UICollectionView,
    canMoveItemAt indexPath: IndexPath
  ) -> Bool {
    true
  }

  func collectionView(
    _ collectionView: UICollectionView,
    moveItemAt sourceIndexPath: IndexPath,
    to destinationIndexPath: IndexPath
  ) {
    let photo = photos.remove(at: sourceIndexPath.item)
    photos.insert(photo, at: destinationIndexPath.item)
  }
}

extension ClassicPhotoGridViewController:
  UICollectionViewDelegate
{
  func collectionView(
    _ collectionView: UICollectionView,
    didSelectItemAt indexPath: IndexPath
  ) {
    onSelectPhoto?(photos[indexPath.item].id)
  }
}
```

</details>

## 참고 자료

- [Apple Developer Documentation — UICollectionViewDataSource](https://developer.apple.com/documentation/uikit/uicollectionviewdatasource)
- [Apple Developer Documentation — UICollectionView](https://developer.apple.com/documentation/uikit/uicollectionview)
