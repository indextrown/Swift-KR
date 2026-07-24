---
title: 'UICollectionViewDragDelegate 예제'
description: 'UICollectionViewDragDelegate로 단일·다중 사진 drag를 시작하고 NSItemProvider와 localObject를 구성하며 drag preview와 허용 조건을 안전하게 제어합니다.'
---

# UICollectionViewDragDelegate 예제

> **면접 답변 한 줄 요약:** `UICollectionViewDragDelegate`는 사용자가 item을 들어 올릴 때 외부 전달용 `NSItemProvider`와 앱 내부 최적화용 `localObject`를 담은 `UIDragItem`을 제공해 drag를 시작하는 프로토콜이에요.

이 문서는 사진 갤러리에서 drag를 시작하는 쪽을 구현해요. 실제 위치 변경과 외부 데이터 수신은 [`UICollectionViewDropDelegate` 예제](./drop-delegate)에서 이어서 다뤄요.

## 먼저 알아둘 용어

| 용어             | 쉬운 뜻                                                                     |
| ---------------- | --------------------------------------------------------------------------- |
| drag session     | 사용자가 하나 이상의 item을 들어 올려 이동하는 동안 유지되는 작업 단위예요. |
| `NSItemProvider` | 다른 앱과도 교환할 수 있도록 데이터 타입과 로딩 방법을 설명하는 객체예요.   |
| `UIDragItem`     | Drag 하나에 포함되는 데이터 한 건과 로컬 객체를 묶는 값이에요.              |
| `localObject`    | 같은 앱 안에서 drag할 때 직렬화 없이 빠르게 전달하는 임시 객체예요.         |
| drag preview     | 손가락을 따라 움직이는 item의 시각적 모양이에요.                            |

## Drag Delegate를 연결해요

```swift
override func viewDidLoad() {
  super.viewDidLoad()

  collectionView.dragDelegate = self
  collectionView.dragInteractionEnabled = true
}
```

iPhone에서는 `dragInteractionEnabled`를 명시적으로 켜야 하는 경우가 있어요. `dragDelegate`는 Collection View의 선택을 다루는 일반 `delegate`와 별도 프로퍼티예요.

## 필수 메서드에서 Drag Item을 만들어요

```swift
extension ClassicPhotoGridViewController:
  UICollectionViewDragDelegate
{
  func collectionView(
    _ collectionView: UICollectionView,
    itemsForBeginning session: UIDragSession,
    at indexPath: IndexPath
  ) -> [UIDragItem] {
    guard photos.indices.contains(indexPath.item) else {
      return []
    }

    let photo = photos[indexPath.item]
    let provider = NSItemProvider(
      object: photo.title as NSString
    )
    let dragItem = UIDragItem(itemProvider: provider)
    dragItem.localObject = photo.id

    return [dragItem]
  }
}
```

빈 배열을 반환하면 해당 item의 drag를 시작하지 않아요. `NSItemProvider`에는 다른 앱이 이해할 수 있는 문자열·이미지·파일 표현을 넣고, `localObject`에는 같은 앱 안에서 모델을 빠르게 찾을 `Photo.ID`를 넣었어요.

## Drag 가능 여부를 모델에서 판단해요

```swift
func collectionView(
  _ collectionView: UICollectionView,
  itemsForBeginning session: UIDragSession,
  at indexPath: IndexPath
) -> [UIDragItem] {
  let photo = photos[indexPath.item]

  guard !photo.title.isEmpty else {
    return []
  }

  return [makeDragItem(for: photo)]
}

private func makeDragItem(
  for photo: Photo
) -> UIDragItem {
  let provider = NSItemProvider(
    object: photo.title as NSString
  )
  let item = UIDragItem(itemProvider: provider)
  item.localObject = photo.id
  return item
}
```

다운로드 중이거나 이동할 수 없는 고정 item이라면 빈 배열을 반환해요. 단, 사용자가 이유를 이해할 수 있도록 잠금 모양이나 안내 문구 같은 화면 피드백도 제공하세요.

## 진행 중인 Session에 Item을 추가해요

```swift
func collectionView(
  _ collectionView: UICollectionView,
  itemsForAddingTo session: UIDragSession,
  at indexPath: IndexPath,
  point: CGPoint
) -> [UIDragItem] {
  guard photos.indices.contains(indexPath.item) else {
    return []
  }

  return [makeDragItem(for: photos[indexPath.item])]
}
```

사용자가 drag 도중 다른 item을 탭하면 같은 session에 추가할 수 있어요. 선택된 item을 한꺼번에 drag하는 화면이라면 중복 ID가 session에 들어가지 않도록 현재 `session.items`의 `localObject`도 확인하세요.

## 다중 선택을 한 번에 Drag해요

```swift
func collectionView(
  _ collectionView: UICollectionView,
  itemsForBeginning session: UIDragSession,
  at indexPath: IndexPath
) -> [UIDragItem] {
  let selected = collectionView.indexPathsForSelectedItems
    ?? []
  let sourceIndexPaths = selected.contains(indexPath)
    ? selected
    : [indexPath]

  return sourceIndexPaths.compactMap { path in
    guard photos.indices.contains(path.item) else {
      return nil
    }
    return makeDragItem(for: photos[path.item])
  }
}
```

사용자가 선택하지 않은 item에서 drag를 시작했다면 그 item 하나만 반환해요. 정렬이나 삽입이 자주 일어나는 화면에서는 각 `IndexPath`를 즉시 모델 ID로 바꿔 이후 상태를 ID로 관리하세요.

## Preview의 보이는 영역을 조정해요

```swift
func collectionView(
  _ collectionView: UICollectionView,
  dragPreviewParametersForItemAt indexPath: IndexPath
) -> UIDragPreviewParameters? {
  guard let cell = collectionView.cellForItem(
    at: indexPath
  ) else {
    return nil
  }

  let parameters = UIDragPreviewParameters()
  parameters.visiblePath = UIBezierPath(
    roundedRect: cell.bounds,
    cornerRadius: 14
  )
  parameters.backgroundColor = .clear
  return parameters
}
```

셀 전체의 사각형 대신 실제 카드 모양만 preview에 포함했어요. Preview는 표현만 바꾸며 drag 데이터나 허용 정책은 바꾸지 않아요.

## `NSItemProvider`와 `localObject`의 역할을 구분해요

| 이동 범위                 | 읽는 값                 | 이유                                                        |
| ------------------------- | ----------------------- | ----------------------------------------------------------- |
| 같은 Collection View 내부 | `localObject`의 모델 ID | 직렬화와 비동기 로딩 없이 현재 모델을 바로 찾을 수 있어요.  |
| 같은 앱의 다른 화면       | `localObject` 우선      | 같은 프로세스라면 빠른 전달이 가능해요.                     |
| 다른 앱에서 들어온 Drop   | `NSItemProvider`        | 로컬 객체를 공유할 수 없으므로 등록된 데이터 표현을 읽어요. |
| 다른 앱으로 나가는 Drag   | `NSItemProvider`        | 받는 앱이 지원하는 타입을 선택해 비동기로 로드해요.         |

`localObject`만 설정하고 `NSItemProvider`를 비워 두는 방식은 다른 앱과의 교환을 막아요. 반대로 앱 내부 재배치인데도 provider를 매번 역직렬화하면 불필요한 비용이 생겨요.

## 자주 발생하는 문제를 점검해요

| 증상                                | 먼저 확인할 것                                                              |
| ----------------------------------- | --------------------------------------------------------------------------- |
| Drag가 시작되지 않아요.             | `dragDelegate`, `dragInteractionEnabled`, 필수 메서드 반환 배열을 확인해요. |
| 다른 앱에 데이터가 전달되지 않아요. | `NSItemProvider`가 받는 앱이 이해할 표현을 등록했는지 확인해요.             |
| 내부 이동도 느려요.                 | `localObject`에 안정적인 모델 ID를 넣고 Drop에서 우선 사용하는지 봐요.      |
| 여러 item이 중복으로 drag돼요.      | 선택 목록과 session의 기존 item을 ID로 중복 제거하는지 확인해요.            |
| Preview가 셀 바깥까지 보여요.       | `visiblePath`가 셀의 실제 좌표계와 corner radius를 사용하는지 확인해요.     |

## 면접에서 이어질 수 있는 질문

### Drag Delegate의 필수 메서드는 무엇인가요?

`collectionView(_:itemsForBeginning:at:)`이에요. 여기에서 빈 배열을 반환하면 drag가 시작되지 않고, 하나 이상의 `UIDragItem`을 반환하면 Collection View가 drag interaction을 진행해요.

### 왜 `localObject`와 `NSItemProvider`를 함께 사용하나요?

`localObject`는 같은 앱 안에서 모델 ID를 빠르게 전달하고, `NSItemProvider`는 프로세스 경계를 넘어 데이터를 교환해요. 두 경로를 함께 준비하면 내부 재배치와 외부 공유를 모두 지원할 수 있어요.

## 다음 예제로 이동해요

Drag item을 만들었다면 [`UICollectionViewDropDelegate` 예제](./drop-delegate)에서 내부 재배치와 외부 데이터 삽입을 구현해 보세요.

## 참고 자료

- [Apple Developer Documentation — UICollectionViewDragDelegate](https://developer.apple.com/documentation/uikit/uicollectionviewdragdelegate)
- [Apple Developer Documentation — Supporting drag and drop in collection views](https://developer.apple.com/documentation/uikit/supporting-drag-and-drop-in-collection-views)
- [Apple Developer Documentation — UIDragItem](https://developer.apple.com/documentation/uikit/uidragitem)
