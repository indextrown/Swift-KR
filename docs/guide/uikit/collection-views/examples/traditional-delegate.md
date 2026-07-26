---
title: '전통적인 UICollectionViewDelegate 예제'
description: '배열 기반 UICollectionView에서 UICollectionViewDelegate로 선택·하이라이트·표시 생명주기·다중 선택·컨텍스트 메뉴를 처리하고 IndexPath를 안전하게 해석합니다.'
---

# 전통적인 UICollectionViewDelegate 예제

> **면접 답변 한 줄 요약:** `UICollectionViewDelegate`는 Collection View item의 선택·하이라이트·표시·메뉴 같은 사용자 상호작용을 전달하며, 배열 기반 화면에서는 받은 `IndexPath`를 즉시 모델 ID로 변환해 처리해야 해요.

이 문서는 [`UICollectionViewDataSource` 예제](./data-source)의 `ClassicPhotoGridViewController`에 상호작용을 추가해요. Data source는 무엇을 표시할지 제공하고, delegate는 사용자가 표시된 item과 어떻게 상호작용했는지 전달받아요.

아래 extension은 예제 view controller와 같은 Swift 파일에 두는 것을 기준으로 해요. 파일을 분리한다면 delegate가 필요한 모델과 helper에 접근할 수 있도록 `private` 접근 수준을 조정하거나, view controller 내부 메서드로 동작을 노출하세요.

## 먼저 알아둘 용어

| 용어              | 쉬운 뜻                                                                             |
| ----------------- | ----------------------------------------------------------------------------------- |
| selection         | 사용자가 하나 이상의 item을 선택한 상태예요.                                        |
| highlight         | 손가락을 누르고 있는 짧은 동안 item이 반응하는 상태예요.                            |
| display lifecycle | 셀이 화면에 나타나기 직전과 화면에서 사라진 뒤의 시점을 알려 주는 callback이에요.   |
| context menu      | item을 길게 눌렀을 때 표시하는 빠른 작업 메뉴예요.                                  |
| delegate          | 다른 객체에서 발생한 사건을 대신 전달받아 판단하거나 후속 동작을 실행하는 객체예요. |

## Delegate를 Collection View에 연결해요

```swift
override func viewDidLoad() {
  super.viewDidLoad()

  collectionView.dataSource = self
  collectionView.delegate = self
}
```

`dataSource`와 `delegate`는 모두 weak reference예요. View controller 자신을 연결하면 화면이 살아 있는 동안 함께 유지돼요. 별도 delegate 객체를 연결한다면 프로퍼티로 강하게 보관하세요.

## 선택 가능 여부를 먼저 판단해요

특정 사진을 선택하지 못하게 하려면 선택 전에 판단할 수 있어요.

```swift
extension ClassicPhotoGridViewController:
  UICollectionViewDelegate
{
  func collectionView(
    _ collectionView: UICollectionView,
    shouldSelectItemAt indexPath: IndexPath
  ) -> Bool {
    let photo = photos[indexPath.item]
    return !photo.title.isEmpty
  }
}
```

`false`를 반환하면 `didSelectItemAt`이 호출되지 않아요. 로그인이나 권한이 필요한 item이라면 여기에서 선택을 막되, 사용자가 이유를 알 수 있도록 별도 안내도 제공하세요.

## 선택된 위치를 모델 ID로 바꿔요

```swift
func collectionView(
  _ collectionView: UICollectionView,
  didSelectItemAt indexPath: IndexPath
) {
  let selectedPhotoID = photos[indexPath.item].id
  onSelectPhoto?(selectedPhotoID)
}
```

`IndexPath`는 callback이 발생한 순간의 위치예요. 다음 화면, 비동기 작업, 선택 상태에는 `Photo.ID`를 전달해요. 그 사이 앞쪽에 item이 삽입되거나 정렬되면 같은 사진의 위치가 바뀔 수 있기 때문이에요.

화면 이동 뒤 선택 표시를 없애려면 Collection View를 통해 deselect해요.

```swift
collectionView.deselectItem(
  at: indexPath,
  animated: true
)
```

셀의 `isSelected`를 직접 바꾸기보다 `selectItem(at:animated:scrollPosition:)`과 `deselectItem(at:animated:)`을 사용해야 Collection View의 선택 상태와 셀 상태가 함께 바뀌어요.

## Highlight에 눌림 피드백을 추가해요

Highlight는 손가락을 누르는 동안의 짧은 상태이고, selection은 선택이 완료된 뒤 유지될 수 있는 상태예요.

```swift
func collectionView(
  _ collectionView: UICollectionView,
  didHighlightItemAt indexPath: IndexPath
) {
  guard let cell = collectionView.cellForItem(
    at: indexPath
  ) else {
    return
  }

  UIView.animate(withDuration: 0.12) {
    cell.transform = CGAffineTransform(
      scaleX: 0.96,
      y: 0.96
    )
  }
}

func collectionView(
  _ collectionView: UICollectionView,
  didUnhighlightItemAt indexPath: IndexPath
) {
  guard let cell = collectionView.cellForItem(
    at: indexPath
  ) else {
    return
  }

  UIView.animate(withDuration: 0.12) {
    cell.transform = .identity
  }
}
```

선택 모양은 공통 `PhotoCell`의 `isSelected`에서 border를 갱신하고, highlight는 delegate에서 일시적인 scale만 적용했어요. 두 상태의 역할을 분리하면 손가락을 뗀 뒤에도 눌림 효과가 남는 문제를 피하기 쉬워요.

## 셀이 나타날 때 모델을 확인해요

```swift
func collectionView(
  _ collectionView: UICollectionView,
  willDisplay cell: UICollectionViewCell,
  forItemAt indexPath: IndexPath
) {
  let photoID = photos[indexPath.item].id
  print("사진 노출: \(photoID)")
}
```

`willDisplay`는 스크롤을 되돌리면 같은 item에 대해 여러 번 호출될 수 있어요. 노출을 한 번만 기록해야 한다면 `Set<Photo.ID>`로 이미 기록한 ID를 따로 관리하세요.

```swift
protocol ImageRequestCancelling: AnyObject {
  func cancelImageRequest()
}

func collectionView(
  _ collectionView: UICollectionView,
  didEndDisplaying cell: UICollectionViewCell,
  forItemAt indexPath: IndexPath
) {
  // 이 시점에는 배열이 변경되어 indexPath가 더 이상
  // 같은 모델을 가리키지 않을 수 있어요.
  (cell as? any ImageRequestCancelling)?
    .cancelImageRequest()
}
```

`didEndDisplaying` 시점에는 item이 삭제되거나 이동했을 수 있어요. 전달된 셀 자체의 작업을 정리하고, 오래된 `IndexPath`로 현재 배열을 다시 조회하는 코드는 피하세요.

## 다중 선택을 ID 집합으로 관리해요

다중 선택을 사용하는 화면에서는 앞의 단일 선택 구현 대신 아래처럼 선택 상태를 ID 집합에 반영해요.

```swift
private var selectedPhotoIDs: Set<Photo.ID> = []

private func configureMultipleSelection() {
  collectionView.allowsMultipleSelection = true
}

func collectionView(
  _ collectionView: UICollectionView,
  didSelectItemAt indexPath: IndexPath
) {
  selectedPhotoIDs.insert(photos[indexPath.item].id)
}

func collectionView(
  _ collectionView: UICollectionView,
  didDeselectItemAt indexPath: IndexPath
) {
  selectedPhotoIDs.remove(photos[indexPath.item].id)
}
```

배열을 삭제·정렬한 뒤에는 선택한 ID의 현재 index를 다시 찾아 `selectItem`으로 화면 상태를 복원할 수 있어요.

```swift
private func restoreSelection() {
  for id in selectedPhotoIDs {
    guard let item = photos.firstIndex(
      where: { $0.id == id }
    ) else {
      continue
    }

    collectionView.selectItem(
      at: IndexPath(item: item, section: 0),
      animated: false,
      scrollPosition: []
    )
  }
}
```

## Context menu 동작도 ID를 캡처해요

먼저 배열에서 ID를 찾아 모델을 바꾸고, 변경된 위치만 다시 표시하는 helper를 추가해요.

```swift
private func toggleFavorite(id: Photo.ID) {
  guard let index = photos.firstIndex(
    where: { $0.id == id }
  ) else {
    return
  }

  photos[index].isFavorite.toggle()
  collectionView.reloadItems(
    at: [IndexPath(item: index, section: 0)]
  )
}
```

```swift
func collectionView(
  _ collectionView: UICollectionView,
  contextMenuConfigurationForItemAt indexPath: IndexPath,
  point: CGPoint
) -> UIContextMenuConfiguration? {
  let photoID = photos[indexPath.item].id

  return UIContextMenuConfiguration(
    identifier: photoID as NSUUID,
    previewProvider: nil
  ) { [weak self] _ in
    let favorite = UIAction(
      title: "즐겨찾기 전환",
      image: UIImage(systemName: "heart")
    ) { _ in
      self?.toggleFavorite(id: photoID)
    }

    let delete = UIAction(
      title: "삭제",
      image: UIImage(systemName: "trash"),
      attributes: .destructive
    ) { _ in
      self?.deletePhoto(id: photoID)
    }

    return UIMenu(children: [favorite, delete])
  }
}
```

메뉴가 열린 뒤 실행될 때는 처음의 `IndexPath`가 달라졌을 수 있어요. 메뉴 구성 시 `Photo.ID`로 바꾸어 action closure가 안정적인 ID를 캡처하게 해요.

## Delegate, Data Source, Flow Layout Delegate를 구분해요

| 타입                                 | 답하는 질문                                            |
| ------------------------------------ | ------------------------------------------------------ |
| `UICollectionViewDataSource`         | item이 몇 개이고 어떤 셀을 표시하나요?                 |
| `UICollectionViewDelegate`           | 어떤 item을 선택·강조·표시했고 어떤 동작을 실행할까요? |
| `UICollectionViewDelegateFlowLayout` | 이 section의 셀 크기와 간격은 얼마인가요?              |
| `UICollectionViewFlowLayout`         | 계산한 크기와 간격으로 item을 어떤 순서로 배치할까요?  |

`UICollectionViewDelegateFlowLayout`은 `UICollectionViewDelegate`를 상속해요. 하나의 view controller가 두 역할을 함께 구현할 수 있지만, 코드에서는 상호작용과 layout 계산을 extension으로 나누면 읽기 쉬워요.

## 자주 발생하는 문제를 점검해요

| 증상                             | 먼저 확인할 것                                                              |
| -------------------------------- | --------------------------------------------------------------------------- |
| 선택 callback이 호출되지 않아요. | `delegate` 연결, `allowsSelection`, `shouldSelectItemAt` 반환값을 확인해요. |
| 선택한 셀과 모델이 달라져요.     | callback의 `IndexPath`를 즉시 `Photo.ID`로 바꾸는지 확인해요.               |
| 눌림 효과가 셀 재사용 뒤 남아요. | `didUnhighlight`와 셀의 재사용 초기화에서 transform을 되돌리는지 확인해요.  |
| 노출 이벤트가 여러 번 기록돼요.  | `willDisplay`가 한 item에 여러 번 호출될 수 있음을 고려했는지 확인해요.     |
| 메뉴에서 다른 item이 삭제돼요.   | action이 `IndexPath`가 아니라 메뉴 생성 시점의 ID를 캡처하는지 확인해요.    |

## 면접에서 이어질 수 있는 질문

### Highlight와 selection의 차이는 무엇인가요?

Highlight는 사용자가 손가락을 누르고 있는 동안의 일시적인 상태예요. Selection은 선택 동작이 끝난 뒤에도 유지될 수 있는 상태이며, Collection View의 선택 API와 delegate callback으로 관리해요.

### Delegate 메서드에서 IndexPath를 저장하면 왜 위험한가요?

`IndexPath`는 현재 위치이므로 item 삽입·삭제·이동 뒤 다른 모델을 가리킬 수 있어요. Callback 안에서 안정적인 ID로 변환하고 장기 상태와 비동기 작업은 ID로 관리해야 해요.

## 다음 예제로 이동해요

상호작용을 연결했다면 [`UICollectionViewFlowLayout` 예제](./flow-layout)에서 같은 전통적인 화면의 셀 크기와 간격을 반응형으로 구성해 보세요.

## 전체 최종 코드

아래 코드는 [공통 `Photo`와 `PhotoCell`](./index)을 사용해 전통적인 Data Source와 선택·하이라이트·노출·다중 선택·Context Menu를 한 화면에 연결한 최종본이에요.

<details>
<summary>전체 코드 펼쳐보기</summary>

```swift
import UIKit

@MainActor
final class ClassicInteractivePhotoGridViewController:
  UIViewController
{
  private var photos = Photo.samples
  private var selectedPhotoIDs: Set<Photo.ID> = []
  private var exposedPhotoIDs: Set<Photo.ID> = []
  var onSelectPhoto: ((Photo.ID) -> Void)?

  private lazy var collectionView = UICollectionView(
    frame: .zero,
    collectionViewLayout: makeGridLayout()
  )

  override func viewDidLoad() {
    super.viewDidLoad()

    collectionView.translatesAutoresizingMaskIntoConstraints = false
    collectionView.backgroundColor = .systemBackground
    collectionView.allowsMultipleSelection = true
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
    layout.itemSize = CGSize(width: 160, height: 160)
    layout.minimumInteritemSpacing = 12
    layout.minimumLineSpacing = 12
    layout.sectionInset = UIEdgeInsets(
      top: 16,
      left: 16,
      bottom: 16,
      right: 16
    )
    return layout
  }

  private func toggleFavorite(id: Photo.ID) {
    guard let index = photos.firstIndex(
      where: { $0.id == id }
    ) else {
      return
    }

    photos[index].isFavorite.toggle()
    collectionView.reloadItems(
      at: [IndexPath(item: index, section: 0)]
    )
  }

  private func deletePhoto(id: Photo.ID) {
    guard let index = photos.firstIndex(
      where: { $0.id == id }
    ) else {
      return
    }

    photos.remove(at: index)
    selectedPhotoIDs.remove(id)
    collectionView.deleteItems(
      at: [IndexPath(item: index, section: 0)]
    )
  }
}

extension ClassicInteractivePhotoGridViewController:
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

extension ClassicInteractivePhotoGridViewController:
  UICollectionViewDelegate
{
  func collectionView(
    _ collectionView: UICollectionView,
    shouldSelectItemAt indexPath: IndexPath
  ) -> Bool {
    !photos[indexPath.item].title.isEmpty
  }

  func collectionView(
    _ collectionView: UICollectionView,
    didSelectItemAt indexPath: IndexPath
  ) {
    let id = photos[indexPath.item].id
    selectedPhotoIDs.insert(id)
    onSelectPhoto?(id)
  }

  func collectionView(
    _ collectionView: UICollectionView,
    didDeselectItemAt indexPath: IndexPath
  ) {
    selectedPhotoIDs.remove(photos[indexPath.item].id)
  }

  func collectionView(
    _ collectionView: UICollectionView,
    didHighlightItemAt indexPath: IndexPath
  ) {
    UIView.animate(withDuration: 0.12) {
      collectionView.cellForItem(at: indexPath)?
        .transform = CGAffineTransform(
          scaleX: 0.96,
          y: 0.96
        )
    }
  }

  func collectionView(
    _ collectionView: UICollectionView,
    didUnhighlightItemAt indexPath: IndexPath
  ) {
    UIView.animate(withDuration: 0.12) {
      collectionView.cellForItem(at: indexPath)?
        .transform = .identity
    }
  }

  func collectionView(
    _ collectionView: UICollectionView,
    willDisplay cell: UICollectionViewCell,
    forItemAt indexPath: IndexPath
  ) {
    let id = photos[indexPath.item].id
    if exposedPhotoIDs.insert(id).inserted {
      print("첫 사진 노출: \(id)")
    }
  }

  func collectionView(
    _ collectionView: UICollectionView,
    contextMenuConfigurationForItemAt indexPath: IndexPath,
    point: CGPoint
  ) -> UIContextMenuConfiguration? {
    let id = photos[indexPath.item].id

    return UIContextMenuConfiguration(
      identifier: id as NSUUID,
      previewProvider: nil
    ) { [weak self] _ in
      let favorite = UIAction(
        title: "즐겨찾기 전환",
        image: UIImage(systemName: "heart")
      ) { _ in
        self?.toggleFavorite(id: id)
      }
      let delete = UIAction(
        title: "삭제",
        image: UIImage(systemName: "trash"),
        attributes: .destructive
      ) { _ in
        self?.deletePhoto(id: id)
      }
      return UIMenu(children: [favorite, delete])
    }
  }
}
```

</details>

## 참고 자료

- [Apple Developer Documentation — UICollectionViewDelegate](https://developer.apple.com/documentation/uikit/uicollectionviewdelegate)
- [Apple Developer Documentation — Changing the appearance of selected and highlighted cells](https://developer.apple.com/documentation/uikit/changing-the-appearance-of-selected-and-highlighted-cells)
- [Apple Developer Documentation — UICollectionView](https://developer.apple.com/documentation/uikit/uicollectionview)
