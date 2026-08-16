---
title: Swift로 이해하는 DifferenceKit
description: DifferenceKit의 Differentiable과 StagedChangeset을 이해하고, 적용 전후의 전체 UICollectionView 예제로 수동 갱신과 staged diff 흐름을 비교합니다.
---

# Swift로 이해하는 DifferenceKit

> **면접 답변 한 줄 요약:** DifferenceKit은 모델의 안정적인 식별자와 표시 내용의 동등성을 분리해 선형·section 컬렉션의 삽입, 삭제, 이동, 갱신을 계산하고, 위험한 UIKit batch update를 여러 안전한 단계로 나누는 Swift 오픈소스 라이브러리예요.

`UICollectionView`의 데이터가 바뀌면 새 배열을 화면에 반영해야 해요. `reloadData()`는 간단하지만 어떤 item이 이동하거나 내용만 바뀌었는지 표현하지 못해요. 반대로 `deleteItems`, `insertItems`, `moveItem`, `reloadItems`를 직접 호출하면 모델과 화면의 개수 및 순서를 정확히 맞춰야 해요.

[DifferenceKit](https://github.com/ra1028/DifferenceKit)은 두 컬렉션의 차이를 계산하고 UIKit의 batch update에 적용하는 과정을 도와줘요. 이 문서는 2026년 8월에 확인한 최신 공개 릴리스 `1.3.0`을 기준으로 해요. 이 릴리스는 2022년 6월에 게시되었으므로 새 프로젝트에서는 아래의 대안과 유지보수 상태도 함께 판단해야 해요.

이 문서에서는 다음 내용을 살펴봐요.

- DifferenceKit이 해결하는 Collection View 갱신 문제
- `Differentiable`, `ContentIdentifiable`, `ContentEquatable`의 관계
- `Equatable`, `Hashable`, `Identifiable`과 다른 점
- `StagedChangeset`을 `UICollectionView`에 적용하는 방법
- DifferenceKit 적용 전후를 비교하는 전체 Collection View 예제
- Swift `difference(from:)`, DifferenceKit diff의 시간 복잡도와 차이
- `reloadData()`와 부분 batch update를 선택하는 기준
- UIKit diffable data source와의 차이
- 오래된 배포 대상과 새 프로젝트에서 선택하는 기준

## 먼저 알아둘 diff 용어

| 용어                          | 쉬운 뜻                                                                                                                                         |
| ----------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| diff                          | 이전 상태와 새 상태 사이에서 무엇이 삽입, 삭제, 이동 또는 변경되었는지 나타내는 차이예요.                                                       |
| identity, 정체성              | 순서나 내용이 바뀌어도 같은 item인지 판단하는 기준이에요. 서버 ID나 UUID처럼 안정적인 값을 사용해요.                                            |
| content equality, 내용 동등성 | 정체성이 같은 두 item의 화면에 표시할 내용도 같은지 판단하는 기준이에요.                                                                        |
| changeset                     | 한 상태에서 다음 상태로 가기 위한 삽입, 삭제, 이동, 갱신 작업과 그 단계의 데이터를 묶은 값이에요.                                               |
| batch update                  | 여러 Collection View 변경을 한 번에 적용해 일관된 애니메이션으로 보여 주는 갱신 방식이에요.                                                     |
| stage                         | 동시에 적용하면 충돌할 수 있는 변경을 나누어 순서대로 실행하는 한 단계예요.                                                                     |
| sectioned collection          | section과 그 안의 item으로 이루어진 2차원 컬렉션이에요.                                                                                         |
| Heckel algorithm              | 값의 등장 정보를 이용해 두 시퀀스의 차이를 찾는 알고리즘 계열이에요. DifferenceKit은 Paul Heckel의 알고리즘을 Swift 컬렉션에 맞게 최적화했어요. |
| diffable data source          | section과 item 식별자로 만든 snapshot을 적용하면 UIKit이 화면 차이를 처리하는 iOS 13 이후의 data source예요.                                    |

## 수동 batch update는 모델과 화면을 직접 맞춰야 해요

사진 목록에서 첫 item을 지우고, 새 item을 추가하며, 기존 item의 즐겨찾기 표시까지 바꾼다고 해 볼게요. 가장 단순한 방법은 배열을 교체하고 전체를 다시 불러오는 거예요.

```swift
photos = newPhotos
collectionView.reloadData()
```

결과는 맞지만 삭제와 삽입 애니메이션이 사라지고 보이는 셀을 전부 다시 구성할 수 있어요. 세부 변경을 직접 표현하려면 다음처럼 모델 변경과 UI 명령을 맞춰야 해요.

```swift
collectionView.performBatchUpdates {
  photos.remove(at: 0)
  collectionView.deleteItems(
    at: [IndexPath(item: 0, section: 0)]
  )

  photos.append(newPhoto)
  collectionView.insertItems(
    at: [IndexPath(item: photos.count - 1, section: 0)]
  )
}
```

실제 화면에서는 section 삽입과 삭제, item 이동과 갱신이 함께 일어날 수 있어요. 배열의 개수와 Collection View가 예상하는 개수가 한 순간이라도 다르거나 각 작업이 참조하는 이전·이후 위치를 혼동하면 내부 일관성 오류가 발생할 수 있어요.

DifferenceKit은 호출자가 각 `IndexPath`를 직접 계산하는 대신 **이전 컬렉션과 목표 컬렉션**을 전달하게 해요.

```text
이전 모델 + 목표 모델
        │
        ▼
DifferenceKit이 diff 계산
        │
        ▼
StagedChangeset
        │
        ▼
각 단계의 모델을 동기적으로 교체하며 UICollectionView 갱신
```

## DifferenceKit은 식별과 내용 비교를 분리해요

DifferenceKit `1.3.0`의 소스에서 `Differentiable`은 독립적인 protocol 선언이 아니라 두 protocol을 합친 typealias예요. 개념만 남겨 단순화하면 다음과 같은 관계예요.

```swift
typealias Differentiable =
  ContentIdentifiable & ContentEquatable

protocol ContentIdentifiable {
  associatedtype DifferenceIdentifier: Hashable
  var differenceIdentifier: DifferenceIdentifier { get }
}

protocol ContentEquatable {
  func isContentEqual(to source: Self) -> Bool
}
```

두 요구사항은 서로 다른 질문에 답해요.

1. `differenceIdentifier`는 “이전과 이후의 값이 같은 item인가요?”에 답해요.
2. `isContentEqual(to:)`는 “같은 item의 표시 내용도 그대로인가요?”에 답해요.

사진 모델에 적용해 볼게요.

```swift
import DifferenceKit
import Foundation

struct Photo: Identifiable, Equatable, Differentiable {
  let id: UUID
  var title: String
  var isFavorite: Bool

  var differenceIdentifier: UUID {
    id
  }

  func isContentEqual(to source: Photo) -> Bool {
    title == source.title &&
      isFavorite == source.isFavorite
  }
}
```

`id`가 같다면 순서가 달라져도 같은 사진이에요. 같은 사진의 `title`이나 `isFavorite`가 달라지면 삭제 후 삽입이 아니라 내용 갱신 후보가 돼요.

`isContentEqual`에서 `id`를 다시 비교할 필요는 없어요. 이 메서드는 diff 알고리즘이 이미 같은 `differenceIdentifier`로 연결한 두 값의 내용을 비교할 때 사용하기 때문이에요. 화면에 영향을 주는 프로퍼티를 빠뜨리면 모델은 바뀌었는데 셀이 갱신되지 않을 수 있어요.

### 전체 모델을 식별자로 사용하지 않아요

`Hashable` 타입에는 `differenceIdentifier`의 기본 구현이 제공되므로 아래 코드도 가능해요.

```swift
struct Photo: Hashable, Differentiable {
  let id: UUID
  var title: String
  var isFavorite: Bool
}
```

하지만 합성된 `Hashable`은 세 프로퍼티를 모두 사용해요. 즐겨찾기만 바뀌어도 이전 값과 새 값의 식별자가 달라져 같은 사진의 내용 갱신이 아니라 삭제와 삽입으로 해석될 수 있어요.

바뀔 수 있는 모델에는 안정적인 식별자를 명시하는 편이 안전해요.

```swift
var differenceIdentifier: UUID { id }
```

문자열 상수처럼 값 자체가 곧 정체성이고 내용도 변하지 않는 타입에는 기본 구현이 편리해요.

```swift
extension String: Differentiable {}
```

## Swift 핵심 프로토콜과 역할이 달라요

DifferenceKit의 이름은 Swift 표준 프로토콜과 비슷하지만 계약의 범위가 달라요.

| 계약                                                  | 답하는 질문                                             | DifferenceKit에서의 관계                                                                                    |
| ----------------------------------------------------- | ------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| [`Equatable`](/guide/swift/protocols/equatable)       | 두 값 전체를 `==`로 같다고 볼 수 있나요?                | `ContentEquatable` 타입이 `Equatable`도 따르면 `==`를 사용하는 `isContentEqual` 기본 구현을 받을 수 있어요. |
| [`Hashable`](/guide/swift/protocols/hashable)         | 같은 값을 같은 hash 입력으로 표현할 수 있나요?          | 전체 모델이 아니라 `DifferenceIdentifier`가 반드시 `Hashable`이어야 해요.                                   |
| [`Identifiable`](/guide/swift/protocols/identifiable) | 한 값의 정체성을 `id`로 표현할 수 있나요?               | `ContentIdentifiable`과 목적이 비슷하지만 프로퍼티 이름이 `differenceIdentifier`이고 diff 계산에 사용돼요.  |
| `ContentEquatable`                                    | 정체성이 같은 두 값의 표시 내용도 같은가요?             | 다르면 `elementUpdated` 또는 `sectionUpdated`를 만들 수 있어요.                                             |
| `ContentIdentifiable`                                 | diff 계산에서 같은 item으로 연결할 식별자는 무엇인가요? | `DifferenceIdentifier: Hashable`과 `differenceIdentifier`를 요구해요.                                       |
| `Differentiable`                                      | 식별과 내용 비교를 모두 제공하나요?                     | 앞의 두 DifferenceKit protocol을 합친 conformance 계약이에요.                                               |

`Identifiable`을 이미 따르는 모델이라면 같은 `id`를 DifferenceKit에 연결할 수 있어요.

```swift
struct Photo: Identifiable, Differentiable {
  let id: UUID
  let title: String

  var differenceIdentifier: ID { id }

  func isContentEqual(to source: Photo) -> Bool {
    title == source.title
  }
}
```

두 프로토콜의 식별자가 우연히 같은 값을 쓰는 것이지, `Identifiable` conformance만으로 `Differentiable`이 자동 충족되지는 않아요. DifferenceKit은 내용 비교까지 필요하기 때문이에요.

## StagedChangeset은 이전 상태에서 목표 상태로 가는 과정을 만들어요

모델을 준비했으면 두 배열로 `StagedChangeset`을 만들어요.

```swift
let before = [
  Photo(id: firstID, title: "서울", isFavorite: false),
  Photo(id: secondID, title: "부산", isFavorite: false),
]

let after = [
  Photo(id: secondID, title: "부산", isFavorite: true),
  Photo(id: thirdID, title: "제주", isFavorite: false),
]

let stagedChangeset = StagedChangeset(
  source: before,
  target: after
)
```

이 예제에는 세 종류의 변화가 있어요.

| 변화           | DifferenceKit의 해석                                                   |
| -------------- | ---------------------------------------------------------------------- |
| 서울 사진 제거 | 첫 번째 item의 `differenceIdentifier`가 목표 배열에 없으므로 삭제예요. |
| 부산 즐겨찾기  | 식별자는 같고 `isContentEqual`이 `false`이므로 내용 갱신이에요.        |
| 제주 사진 추가 | 새 `differenceIdentifier`가 생겼으므로 삽입이에요.                     |

`StagedChangeset`은 `Changeset`의 순서 있는 컬렉션이에요. 각 `Changeset`에는 다음 단계의 `data`와 변경 위치가 함께 들어 있어요.

```swift
for changeset in stagedChangeset {
  print(changeset.data)
  print(changeset.elementDeleted)
  print(changeset.elementInserted)
  print(changeset.elementUpdated)
  print(changeset.elementMoved)
}
```

주요 값은 다음과 같아요.

| 프로퍼티            | 의미                                                                  |
| ------------------- | --------------------------------------------------------------------- |
| `data`              | 해당 stage의 변경을 적용한 직후 data source가 가져야 할 컬렉션이에요. |
| `elementDeleted`    | 삭제할 item의 `ElementPath` 목록이에요.                               |
| `elementInserted`   | 삽입할 item의 `ElementPath` 목록이에요.                               |
| `elementUpdated`    | 내용이 달라 다시 구성할 item의 `ElementPath` 목록이에요.              |
| `elementMoved`      | 이전 경로와 목표 경로를 묶은 이동 목록이에요.                         |
| `sectionDeleted` 등 | section의 삭제, 삽입, 갱신, 이동을 같은 방식으로 표현해요.            |

DifferenceKit은 UIKit batch update에서 동시에 처리하기 어려운 변경 조합을 최소 stage로 나눠요. 따라서 중간 `data`는 최종 목표 배열과 다를 수 있어요. 모든 stage가 끝난 마지막 `data`가 목표 상태예요.

## UICollectionView에 각 stage를 적용해요

DifferenceKit은 `UICollectionView` extension으로 `reload(using:interrupt:setData:)`를 제공해요. 기존 `UICollectionViewDataSource`를 유지한 채 사용할 수 있어요.

```swift
import DifferenceKit
import UIKit

@MainActor
final class PhotoGridViewController: UICollectionViewController {
  private var photos: [Photo] = []

  func apply(_ newPhotos: [Photo]) {
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

`setData` closure에서 받은 `data`를 data source가 읽는 저장소에 **동기적으로** 대입해야 해요. extension은 각 stage마다 대략 다음 순서로 동작해요.

1. `setData(changeset.data)`를 호출해 모델을 해당 stage에 맞춰요.
2. `deleteSections`, `insertSections`, `reloadSections`, `moveSection`을 호출해요.
3. `deleteItems`, `insertItems`, `reloadItems`, `moveItem`을 호출해요.
4. 다음 stage로 넘어가 같은 과정을 반복해요.

아래처럼 최종 배열만 나중에 대입하면 안 돼요.

```swift
// 잘못된 예: stage마다 data source가 참조하는 데이터가 바뀌지 않아요.
collectionView.reload(using: changeset) { _ in }
photos = newPhotos
```

Collection View는 batch update 중에도 data source에 section과 item 개수를 물어볼 수 있어요. 화면 명령은 첫 stage를 반영하는데 data source가 이전 상태나 최종 상태를 반환하면 개수가 일치하지 않아 충돌할 수 있어요.

### 변경이 너무 많으면 reloadData로 전환해요

수백 개의 변경을 모두 애니메이션하면 diff 계산보다 layout, 셀 구성, 애니메이션 비용이 더 커질 수 있어요. `interrupt`가 `true`를 반환하면 DifferenceKit extension은 마지막 데이터를 대입하고 `reloadData()`로 전환해요.

```swift
collectionView.reload(
  using: changeset,
  interrupt: { stage in
    stage.changeCount > 100
  }
) { [weak self] data in
  self?.photos = data
}
```

`100`은 라이브러리가 정한 정답이 아니에요. 셀 복잡도, 기기 성능, layout 비용을 측정해 화면별 기준을 정해야 해요. Collection View가 window에 올라가 있지 않을 때도 extension은 마지막 데이터와 `reloadData()`를 사용하는 경로를 제공해요.

## 전체 예제로 DifferenceKit 적용 전후를 비교해요

앞에서는 diff를 계산하고 적용하는 핵심 코드만 분리해서 살펴봤어요. 이제 같은 사진 목록 화면을 DifferenceKit 없이 구현한 코드와 DifferenceKit을 사용한 코드로 비교해 볼게요.

두 예제는 다음 변경을 한 번에 화면에 반영해요.

| 이전 상태                 | 목표 상태                 | 필요한 화면 변경            |
| ------------------------- | ------------------------- | --------------------------- |
| 서울, 부산, 대전          | 대전, 부산★, 제주         | 삭제, 이동, 삽입, 내용 갱신 |
| 서울은 `indexPath.item 0` | 서울은 목표 배열에 없음   | 삭제                        |
| 대전은 `indexPath.item 2` | 대전은 `indexPath.item 0` | 이동                        |
| 부산은 즐겨찾기 아님      | 부산은 즐겨찾기           | 내용 갱신                   |
| 제주 없음                 | 제주는 `indexPath.item 2` | 삽입                        |

화면 구성 코드가 diff의 차이를 가리지 않도록 두 예제 모두 iOS 14의 list layout과 cell registration을 사용해요. DifferenceKit의 diff 원리 자체가 이 API에 의존하는 것은 아니므로 기존 custom cell과 flow layout에서도 데이터 갱신 부분만 같은 방식으로 적용할 수 있어요.

### DifferenceKit 없이 수동으로 부분 갱신해요

먼저 외부 diff 라이브러리를 사용하지 않고 `performBatchUpdates`에 필요한 위치를 직접 전달해 볼게요. 아래 코드는 한 파일에 넣어 실행할 수 있는 전체 View Controller예요.

```swift
import UIKit

private struct Photo: Equatable {
  let id: UUID
  let title: String
  let isFavorite: Bool
}

private enum PhotoSamples {
  static let seoulID = UUID()
  static let busanID = UUID()
  static let daejeonID = UUID()
  static let jejuID = UUID()

  static let before = [
    Photo(
      id: seoulID,
      title: "서울",
      isFavorite: false
    ),
    Photo(
      id: busanID,
      title: "부산",
      isFavorite: false
    ),
    Photo(
      id: daejeonID,
      title: "대전",
      isFavorite: false
    ),
  ]

  static let after = [
    Photo(
      id: daejeonID,
      title: "대전",
      isFavorite: false
    ),
    Photo(
      id: busanID,
      title: "부산",
      isFavorite: true
    ),
    Photo(
      id: jejuID,
      title: "제주",
      isFavorite: false
    ),
  ]
}

@MainActor
final class ManualPhotoGridViewController:
  UICollectionViewController
{
  private var photos = PhotoSamples.before

  private lazy var cellRegistration =
    UICollectionView.CellRegistration<
      UICollectionViewListCell,
      Photo
    > { cell, _, photo in
      var content = cell.defaultContentConfiguration()
      content.text = photo.isFavorite
        ? "★ \(photo.title)"
        : photo.title
      cell.contentConfiguration = content
    }

  init() {
    let configuration = UICollectionLayoutListConfiguration(
      appearance: .insetGrouped
    )
    let layout = UICollectionViewCompositionalLayout.list(
      using: configuration
    )
    super.init(collectionViewLayout: layout)
  }

  @available(*, unavailable)
  required init?(coder: NSCoder) {
    fatalError("init(coder:)는 지원하지 않아요.")
  }

  override func viewDidLoad() {
    super.viewDidLoad()
    title = "수동 부분 갱신"
    navigationItem.rightBarButtonItem = UIBarButtonItem(
      title: "변경",
      style: .plain,
      target: self,
      action: #selector(applySampleUpdate(_:))
    )
  }

  override func collectionView(
    _ collectionView: UICollectionView,
    numberOfItemsInSection section: Int
  ) -> Int {
    photos.count
  }

  override func collectionView(
    _ collectionView: UICollectionView,
    cellForItemAt indexPath: IndexPath
  ) -> UICollectionViewCell {
    collectionView.dequeueConfiguredReusableCell(
      using: cellRegistration,
      for: indexPath,
      item: photos[indexPath.item]
    )
  }

  @objc
  private func applySampleUpdate(
    _ sender: UIBarButtonItem
  ) {
    // 이 IndexPath들은 before에서 after로 바뀌는 경우에만 맞아요.
    let deleted = [IndexPath(item: 0, section: 0)]
    let inserted = [IndexPath(item: 2, section: 0)]
    let movedFrom = IndexPath(item: 2, section: 0)
    let movedTo = IndexPath(item: 0, section: 0)
    let updated = [IndexPath(item: 1, section: 0)]

    sender.isEnabled = false

    collectionView.performBatchUpdates {
      // Collection View가 새 개수를 물을 때 목표 데이터를 반환해요.
      self.photos = PhotoSamples.after
      self.collectionView.deleteItems(at: deleted)
      self.collectionView.insertItems(at: inserted)
      self.collectionView.moveItem(at: movedFrom, to: movedTo)
    } completion: { [weak self] finished in
      guard let self else { return }

      // 이동과 내용 갱신을 직접 다른 단계로 나눠요.
      if finished {
        self.collectionView.reloadItems(at: updated)
      } else {
        self.collectionView.reloadData()
      }
    }
  }
}
```

이 코드에서 개발자가 직접 책임지는 부분을 순서대로 짚어 볼게요.

1. 삭제와 이동의 출발지는 이전 배열의 위치로 계산해요.
2. 삽입과 이동의 도착지는 목표 배열의 위치로 계산해요.
3. batch update 중 data source가 목표 item 개수를 반환하도록 `photos`를 동기적으로 바꿔요.
4. 이동과 내용 갱신을 한 번에 적용하면서 생길 수 있는 충돌을 피하려고 부산 셀의 reload를 다음 단계로 나눠요.
5. 이 예제의 `IndexPath`는 정확히 `before → after` 변경에만 맞으므로 다른 배열을 받으려면 위치 계산과 안전한 단계 분리 로직을 새로 만들어야 해요.

전체 재로딩으로 바꾸면 `photos = newPhotos`와 `reloadData()`만으로 단순해져요. 대신 삭제, 삽입, 이동의 의미와 각각의 애니메이션을 잃고 현재 보이는 셀을 다시 구성할 수 있어요. 부분 갱신을 유지하려면 위와 같은 bookkeeping을 직접 감당해야 해요. 여기서 bookkeeping은 이전 위치, 목표 위치, 적용 순서처럼 화면과 모델을 맞추는 기록 작업을 뜻해요.

### DifferenceKit으로 같은 화면을 갱신해요

이제 같은 화면에서 수동 `IndexPath` 계산을 `StagedChangeset`으로 교체해요. 앞 예제와 별개로 복사해 실행할 수 있도록 모델과 화면 코드를 모두 포함했어요.

```swift
import DifferenceKit
import UIKit

private struct Photo: Differentiable {
  let id: UUID
  let title: String
  let isFavorite: Bool

  var differenceIdentifier: UUID { id }

  func isContentEqual(to source: Photo) -> Bool {
    title == source.title
      && isFavorite == source.isFavorite
  }
}

private enum PhotoSamples {
  static let seoulID = UUID()
  static let busanID = UUID()
  static let daejeonID = UUID()
  static let jejuID = UUID()

  static let before = [
    Photo(
      id: seoulID,
      title: "서울",
      isFavorite: false
    ),
    Photo(
      id: busanID,
      title: "부산",
      isFavorite: false
    ),
    Photo(
      id: daejeonID,
      title: "대전",
      isFavorite: false
    ),
  ]

  static let after = [
    Photo(
      id: daejeonID,
      title: "대전",
      isFavorite: false
    ),
    Photo(
      id: busanID,
      title: "부산",
      isFavorite: true
    ),
    Photo(
      id: jejuID,
      title: "제주",
      isFavorite: false
    ),
  ]
}

@MainActor
final class DifferenceKitPhotoGridViewController:
  UICollectionViewController
{
  private var photos = PhotoSamples.before

  private lazy var cellRegistration =
    UICollectionView.CellRegistration<
      UICollectionViewListCell,
      Photo
    > { cell, _, photo in
      var content = cell.defaultContentConfiguration()
      content.text = photo.isFavorite
        ? "★ \(photo.title)"
        : photo.title
      cell.contentConfiguration = content
    }

  init() {
    let configuration = UICollectionLayoutListConfiguration(
      appearance: .insetGrouped
    )
    let layout = UICollectionViewCompositionalLayout.list(
      using: configuration
    )
    super.init(collectionViewLayout: layout)
  }

  @available(*, unavailable)
  required init?(coder: NSCoder) {
    fatalError("init(coder:)는 지원하지 않아요.")
  }

  override func viewDidLoad() {
    super.viewDidLoad()
    title = "DifferenceKit 갱신"
    navigationItem.rightBarButtonItem = UIBarButtonItem(
      title: "변경",
      style: .plain,
      target: self,
      action: #selector(applySampleUpdate(_:))
    )
  }

  override func collectionView(
    _ collectionView: UICollectionView,
    numberOfItemsInSection section: Int
  ) -> Int {
    photos.count
  }

  override func collectionView(
    _ collectionView: UICollectionView,
    cellForItemAt indexPath: IndexPath
  ) -> UICollectionViewCell {
    collectionView.dequeueConfiguredReusableCell(
      using: cellRegistration,
      for: indexPath,
      item: photos[indexPath.item]
    )
  }

  @objc
  private func applySampleUpdate(
    _ sender: UIBarButtonItem
  ) {
    sender.isEnabled = false
    apply(PhotoSamples.after)
  }

  private func apply(_ newPhotos: [Photo]) {
    let changeset = StagedChangeset(
      source: photos,
      target: newPhotos
    )

    collectionView.reload(
      using: changeset,
      interrupt: { $0.changeCount > 100 }
    ) { [weak self] stagePhotos in
      // 각 stage의 performBatchUpdates 안에서 동기적으로 호출돼요.
      self?.photos = stagePhotos
    }
  }
}
```

셀과 화면 구성은 수동 예제와 같아요. 달라진 핵심은 다음 두 곳이에요.

- `Photo`가 안정적인 `id`를 `differenceIdentifier`로 제공하고, 화면 내용인 `title`과 `isFavorite`을 `isContentEqual`에서 비교해요.
- `apply(_:)`는 고정된 `IndexPath` 대신 현재 `photos`와 임의의 `newPhotos`로 `StagedChangeset`을 만들어요. DifferenceKit이 삭제, 삽입, 이동, 갱신 위치를 계산하고 안전한 stage로 나눠 적용해요.

`setData`에서 받는 값의 이름을 `stagePhotos`로 지은 이유도 중요해요. 이 값은 항상 최종 `newPhotos`인 것이 아니라 현재 batch update가 끝났을 때 data source가 가져야 할 중간 배열일 수 있어요. 따라서 `self?.photos = newPhotos`로 바꾸지 말고 전달받은 값을 그대로 저장해야 해요.

두 구현의 책임을 비교하면 DifferenceKit이 줄이는 코드의 범위가 선명해져요.

| 확인할 점          | 수동 부분 갱신                         | DifferenceKit 사용                          |
| ------------------ | -------------------------------------- | ------------------------------------------- |
| 변경 위치 계산     | 이전·목표 `IndexPath`를 직접 계산해요. | 두 컬렉션에서 changeset을 계산해요.         |
| 내용 변경 판별     | 갱신할 item을 직접 찾아요.             | `isContentEqual` 결과로 판별해요.           |
| 위험한 변경 조합   | 개발자가 적용 단계를 나눠요.           | `StagedChangeset`이 최소 stage로 나눠요.    |
| data source 동기화 | 각 단계의 올바른 배열을 직접 만들어요. | `setData`가 각 stage의 배열을 전달해요.     |
| 다른 목표 배열     | diff와 단계 구성 로직을 다시 계산해요. | 같은 `apply(_:)`에 새 배열을 전달하면 돼요. |
| 추가 비용          | 라이브러리는 없지만 구현 부담이 커요.  | 외부 의존성과 모델 conformance가 생겨요.    |

## section과 item의 diff를 함께 계산해요

여러 section을 사용하려면 section도 식별하고 내용을 비교할 수 있어야 해요. 직접 `DifferentiableSection`을 구현할 수도 있지만, 보통은 `ArraySection`으로 section 모델과 item 배열을 묶으면 간단해요.

```swift
struct PhotoSectionModel: Differentiable {
  enum ID: Hashable {
    case favorites
    case all
  }

  let id: ID
  let title: String

  var differenceIdentifier: ID { id }

  func isContentEqual(
    to source: PhotoSectionModel
  ) -> Bool {
    title == source.title
  }
}

typealias PhotoSection =
  ArraySection<PhotoSectionModel, Photo>
```

section 배열은 다음처럼 만들어요.

```swift
let sections: [PhotoSection] = [
  PhotoSection(
    model: PhotoSectionModel(
      id: .favorites,
      title: "즐겨찾기"
    ),
    elements: favoritePhotos
  ),
  PhotoSection(
    model: PhotoSectionModel(
      id: .all,
      title: "모든 사진"
    ),
    elements: allPhotos
  ),
]
```

이전 section과 새 section으로 같은 API를 사용해요.

```swift
let changeset = StagedChangeset(
  source: currentSections,
  target: newSections
)

collectionView.reload(using: changeset) {
  [weak self] sections in
  self?.currentSections = sections
}
```

section의 `differenceIdentifier`가 같고 제목이 달라지면 `sectionUpdated`, item의 식별자는 같고 내용이 달라지면 `elementUpdated`가 될 수 있어요. `ArraySection`은 section 모델과 item 배열을 연결하지만 계층형 부모·자식 트리를 표현하는 UIKit `NSDiffableDataSourceSectionSnapshot`과는 목적이 달라요.

## Swift CollectionDifference와 비교해요

Swift 표준 라이브러리에는 `CollectionDifference`가 있어요. `BidirectionalCollection.difference(from:)`으로 두 컬렉션의 삽입과 삭제를 계산하고 `applying(_:)`으로 다른 컬렉션에 적용할 수 있어요.

### difference(from:)은 이전 상태를 목표 상태로 바꾸는 차이를 만들어요

호출 방향을 먼저 읽어야 해요. `after.difference(from: before)`는 `before`가 `after`가 되기 위해 필요한 차이를 반환해요.

```swift
let before = [1, 2, 3, 4]
let after = [1, 3, 4, 5]

let difference = after.difference(from: before)
```

결과에는 이전 배열의 offset `1`에 있는 `2`를 제거하고, 최종 배열의 offset `3`에 `5`를 삽입하라는 정보가 들어 있어요.

```swift
for change in difference {
  switch change {
  case let .remove(offset, element, _):
    print("\(offset)의 \(element)를 제거해요")

  case let .insert(offset, element, _):
    print("\(offset)에 \(element)를 삽입해요")
  }
}
```

`CollectionDifference.Change`는 기본적으로 `insert`와 `remove` 두 case를 가져요. `remove`의 offset은 이전 상태를 기준으로 하고 `insert`의 offset은 모든 변경이 끝난 최종 상태를 기준으로 해요.

계산한 차이는 원래 컬렉션에 적용할 수도 있어요.

```swift
let result = before.applying(difference)

print(result == after) // true
```

`applying(_:)`의 결과가 optional인 이유는 diff를 만든 기반 상태와 적용할 컬렉션이 호환되지 않을 수 있기 때문이에요.

[difference(from:)와 applying(_:)을 설명한 글](https://jeong9216.tistory.com/716)도 이전 배열이 새 배열로 바뀌기 위해 필요한 삽입과 삭제를 읽고, 그 차이를 원본에 적용하는 흐름을 작은 정수 배열로 보여 줘요. 이 아이디어는 목록 전체를 무조건 다시 적재하지 않고 바뀐 위치만 갱신하는 출발점이 돼요.

### 이동은 별도로 추론해요

`difference(from:)`은 기본적으로 이동을 추론하지 않아요. 같은 값이 한 번 삭제되고 다른 위치에 한 번 삽입되었다면 `inferringMoves()`로 두 변경의 연관 관계를 만들 수 있어요.

```swift
let before = ["서울", "부산", "제주"]
let after = ["제주", "서울", "부산"]

let difference = after
  .difference(from: before)
  .inferringMoves()
```

이동이 독립적인 `move` case로 바뀌는 것은 아니에요. 연결된 `remove`와 `insert`의 `associatedWith` offset이 서로를 가리켜요. UI에서 이동 애니메이션을 사용하려면 호출자가 이 연결을 읽어 `moveItem`이나 `moveRow`로 변환해야 해요.

### difference(from:)의 시간 복잡도를 나눠 봐요

기호를 먼저 정할게요.

- `N`은 목표 컬렉션인 `after.count`예요.
- `M`은 이전 컬렉션인 `before.count`예요.
- `C`는 계산된 삽입과 삭제의 전체 개수예요.

Swift 공식 문서와 SE-0240에 공개된 복잡도는 다음과 같아요.

| 작업                          | 공개된 시간 복잡도 | 의미                                                                               |
| ----------------------------- | ------------------ | ---------------------------------------------------------------------------------- |
| `difference(from:by:)`        | 최악 `O(N × M)`    | 두 컬렉션에 공통 원소가 많으면 더 빠른 실행을 기대할 수 있어요.                    |
| `difference(from:)`           | 최악 `O(N × M)`    | 공통 원소가 많거나 `Element`가 `Hashable`이면 더 빠를 수 있어요.                   |
| `inferringMoves()`            | `O(C)`             | `Element: Hashable`일 때 이미 계산한 diff의 변경 수에 선형으로 이동 관계를 찾아요. |
| `before.applying(difference)` | `O(M + C)`         | 기반 컬렉션 크기와 적용할 변경 수에 비례해 새 컬렉션을 만들어요.                   |

최악 `O(N × M)`은 두 입력을 곱한 만큼의 작업이 항상 발생한다는 뜻이 아니에요. 공통 값이 많은 일반적인 입력에서는 더 빨라질 수 있지만, 공개 API가 보장하는 최악의 상한은 이차 시간이에요. Swift 표준 API 문서는 구체 구현 알고리즘의 이름보다 이 복잡도와 결과 계약을 공개하므로, 특정 내부 알고리즘이 영원히 유지된다고 가정하지 않는 편이 안전해요.

### DifferenceKit은 입력 크기에 선형인 diff를 제공해요

DifferenceKit의 `StagedChangeset(source:target:)` 공식 문서는 Paul Heckel의 diff 알고리즘을 바탕으로 `O(n)`에 변경을 계산한다고 설명해요. 이 문서에서는 전체 입력 크기를 `L`이라고 부를게요. 선형 컬렉션에서는 `L = N + M`이고, section 컬렉션에서는 이전·목표 상태의 모든 section과 item을 합친 크기예요.

| 작업                                  | 공개된 시간 복잡도 | 함께 알아둘 점                                                                                |
| ------------------------------------- | ------------------ | --------------------------------------------------------------------------------------------- |
| 선형 컬렉션 `StagedChangeset` 생성    | `O(L)`             | 식별자로 item을 연결하고 삽입, 삭제, 이동, 내용 갱신을 계산해요.                              |
| section 컬렉션 `StagedChangeset` 생성 | `O(L)`             | section과 그 안의 item 변경을 계산하고 UIKit에 적용할 stage도 만들어요.                       |
| `collectionView.reload(using:)` 적용  | 별도 Big-O 미공개  | 각 stage의 변경 경로를 실행하며 셀 구성, layout, animation 비용은 Collection View가 부담해요. |

선형 시간의 대가도 있어요. DifferenceKit 공식 문서는 결과가 항상 가장 짧은 변경 집합은 아니며, 같은 식별자가 중복되면 이동을 최선 노력으로 처리한다고 밝혀요. 따라서 `O(L)`만 보고 결과 품질과 실제 화면 비용까지 우월하다고 결론 내리면 안 돼요.

### 두 diff pipeline의 계산 비용을 비교해요

복잡도 차이를 한 흐름으로 보면 다음과 같아요.

```text
Swift 표준 방식
difference(from:) 최악 O(N × M)
  + 선택적인 move 추론 O(C)
  + 앱이 UIKit 변경 명령으로 변환하고 적용하는 비용

DifferenceKit 방식
StagedChangeset 생성 O(L)
  + 안전한 stage별 UIKit batch update 비용
```

두 Big-O는 **diff를 계산하는 시간**을 비교해요. 실제 사용자가 느끼는 전체 시간에는 셀 구성, Auto Layout, 이미지 처리, layout invalidation, animation까지 들어가므로 `O(L)`이라는 이유만으로 화면이 언제나 더 빠르다고 보장할 수는 없어요.

### 변경이 적으면 부분 갱신이 reloadData보다 효율적일 수 있어요

제시한 글의 실전 요점처럼, 계산한 diff로 `UITableView`나 `UICollectionView`의 바뀐 위치만 갱신하면 매번 `reloadData()`로 전체 목록을 다시 적재하도록 알리는 것보다 효율적일 수 있어요. 특히 전체 item 수에 비해 변경 수 `C`가 작고 셀 구성이 비쌀 때 이점이 커져요.

아래 코드는 **단일 section의 삽입과 삭제만 있는 경우** `CollectionDifference`를 batch update로 옮기는 최소 예제예요.

```swift
let difference = after.difference(from: before)

let deletedPaths = difference.removals.compactMap {
  change -> IndexPath? in
  guard case let .remove(offset, _, _) = change else {
    return nil
  }
  return IndexPath(item: offset, section: 0)
}

let insertedPaths = difference.insertions.compactMap {
  change -> IndexPath? in
  guard case let .insert(offset, _, _) = change else {
    return nil
  }
  return IndexPath(item: offset, section: 0)
}

items = after

collectionView.performBatchUpdates {
  collectionView.deleteItems(at: deletedPaths)
  collectionView.insertItems(at: insertedPaths)
}
```

`difference(from:)`만 호출한다고 Table View나 Collection View가 자동으로 갱신되지는 않아요. 앱이 결과를 UIKit 명령으로 변환하고 data source 상태를 정확히 맞춰야 해요. section 변경, 이동, 내용 갱신이 섞이면 이 코드는 충분하지 않으며, 잘못된 조합은 batch update 충돌을 만들 수 있어요.

DifferenceKit은 이 빈 공간을 채워요. `Changeset`에 item·section의 삽입, 삭제, 이동, 갱신을 담고 `StagedChangeset`으로 위험한 조합을 나눈 뒤 `reload(using:)` extension으로 적용해요.

반대로 대부분의 item이 한꺼번에 바뀌면 diff 계산과 많은 애니메이션을 추가하는 것이 `reloadData()`보다 비쌀 수 있어요. DifferenceKit이 `interrupt` closure로 변경 수가 큰 stage를 전체 reload로 전환할 수 있게 한 이유예요.

### 기능과 목적을 한눈에 비교해요

두 도구는 “컬렉션 차이”를 다루지만 결과의 목적이 달라요.

| 기준               | Swift `CollectionDifference`                                                      | DifferenceKit `StagedChangeset`                                            |
| ------------------ | --------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| 소속               | Swift 표준 라이브러리                                                             | 외부 오픈소스 package                                                      |
| 기본 입력 계약     | `Equatable` 또는 비교 closure                                                     | `Differentiable`, 즉 식별자와 내용 비교                                    |
| 기본 변경 표현     | 삽입과 삭제                                                                       | 삽입, 삭제, 이동, 내용 갱신                                                |
| 이동               | `inferringMoves()`가 삭제·삽입의 연관 관계를 추론해요.                            | 식별자를 이용해 이동 정보를 계산해요.                                      |
| section-aware diff | 한 번의 diff는 1차원 컬렉션을 다루며 중첩 section/item 의미를 별도로 알지 못해요. | `DifferentiableSection`으로 section과 item 변경을 함께 표현해요.           |
| 중간 상태          | 하나의 완전한 차이를 표현해요.                                                    | UIKit에 적용할 수 있도록 여러 안전한 stage와 각 stage의 데이터를 제공해요. |
| UI 적용            | UIKit 적용 API가 없어요.                                                          | `UITableView`와 `UICollectionView` extension을 제공해요.                   |
| diff 적용 결과     | 호환되지 않는 기반 컬렉션이면 `applying`이 `nil`을 반환해요.                      | `setData`와 UIKit batch update를 stage별로 실행해요.                       |
| diff 계산 복잡도   | 최악 `O(N × M)`, 공통 값이 많거나 `Hashable`이면 더 빠를 수 있어요.               | Heckel 기반 `O(L)`, 항상 가장 짧은 변경 집합을 보장하지는 않아요.          |

`CollectionDifference`에는 “같은 ID인데 제목이 달라졌다”는 별도 내용 갱신 개념이 없어요. `Photo` 전체의 `Equatable` 결과를 사용하면 내용 변경을 삭제와 삽입으로 표현할 수 있고, ID만 비교하는 closure를 사용하면 내용 변경은 diff에 나타나지 않아요. UI의 reload 의미까지 필요하면 호출자가 별도로 계산해야 해요.

undo/redo, 텍스트 줄 변경, 서버에 전달할 patch처럼 UIKit과 무관한 일반 컬렉션 차이가 필요하면 표준 `CollectionDifference`가 더 작은 선택이에요. section과 item의 내용 변경을 계산해 기존 Collection View data source에 적용하려면 DifferenceKit이 더 직접적일 수 있어요.

## UIKit Diffable Data Source와 비교해요

[`UICollectionViewDiffableDataSource`](./data)는 iOS 13부터 제공되는 UIKit의 기본 해법이에요. 앱은 목표 상태를 `NSDiffableDataSourceSnapshot`으로 만들고 data source에 적용해요.

| 기준           | DifferenceKit                                                        | UIKit diffable data source                                                                    |
| -------------- | -------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| 최소 iOS       | 공식 README 기준 iOS 9                                               | iOS 13                                                                                        |
| data source    | 기존 `UICollectionViewDataSource`와 모델 배열을 유지해요.            | `UICollectionViewDiffableDataSource`가 data source 역할을 맡아요.                             |
| 목표 상태 표현 | 이전·목표 모델 컬렉션으로 `StagedChangeset`을 만들어요.              | section과 item 식별자를 `NSDiffableDataSourceSnapshot`에 넣어요.                              |
| 모델 계약      | `differenceIdentifier`와 `isContentEqual`을 제공해요.                | section과 item 식별자가 `Hashable`이어야 하고 현재 SDK에서는 `Sendable` 제약도 가져요.        |
| 내용 갱신      | `isContentEqual`이 다르면 `elementUpdated`를 자동 계산해요.          | backing store를 바꾼 뒤 `reconfigureItems` 또는 `reloadItems`로 의도를 표시해요.              |
| batch 적용     | 공개된 `Changeset`을 stage별 `performBatchUpdates`로 적용해요.       | snapshot을 적용하면 UIKit이 변경을 처리해요.                                                  |
| 계층형 목록    | section과 평평한 item 컬렉션의 차이를 계산해요.                      | `NSDiffableDataSourceSectionSnapshot`으로 부모·자식 계층과 펼침 상태도 표현할 수 있어요.      |
| 의존성         | 외부 package와 라이브러리 유지보수 상태를 관리해야 해요.             | UIKit에 포함돼 별도 의존성이 없어요.                                                          |
| 변경 결과 검사 | 삭제, 삽입, 이동, 갱신 경로를 `Changeset`에서 직접 검사할 수 있어요. | 일반적으로 현재와 목표 snapshot을 중심으로 사용하고 UIKit 내부 diff 구현에는 의존하지 않아요. |

새 화면이 iOS 13 이상만 지원하고 기존 data source 구조를 유지할 이유가 없다면 UIKit diffable data source를 먼저 검토하는 편이 자연스러워요. DifferenceKit은 다음과 같은 조건에서 여전히 의미가 있어요.

- iOS 9~12를 지원해야 해요.
- 기존 `UICollectionViewDataSource` 구조를 크게 바꾸기 어려워요.
- UI에 적용하기 전에 명시적인 삽입, 삭제, 이동, 갱신 결과를 검사해야 해요.
- section과 item의 내용 변경을 모델 protocol에서 일관되게 정의하고 싶어요.
- 이미 DifferenceKit 기반 프레임워크나 사내 목록 구조를 사용하고 있어요.

## 실제 화면 성능은 diff 복잡도만으로 결정되지 않아요

DifferenceKit은 Paul Heckel의 알고리즘을 바탕으로 `O(n)` diff 계산을 제공한다고 설명해요. 다만 공식 API 문서에는 두 가지 중요한 제한도 적혀 있어요.

- 계산된 변경 집합이 항상 가장 짧지는 않아요.
- 같은 식별자가 중복되면 이동은 최선 노력으로 계산하고 나머지는 삽입 또는 삭제로 처리할 수 있어요.

가능하면 section과 item 식별자를 고유하게 유지하세요. 중복을 기술적으로 처리할 수 있다는 설명을 중복 식별자를 권장한다는 뜻으로 해석하면 안 돼요.

공식 README의 성능 비교는 Xcode 11.1과 Swift 5.1 환경에서 측정된 오래된 결과예요. 현재 앱의 기기, Swift 버전, 데이터 크기, 셀과 layout 비용을 대표하지 않으므로 “항상 다른 도구보다 빠르다”는 근거로 사용하면 안 돼요.

같은 이유로 `difference(from:)`의 최악 `O(N × M)`만 보고 표준 API가 실제 화면에서 항상 느리다고 단정할 수도 없어요. 공통 값이 많은 입력은 더 빠를 수 있고, 작은 목록에서는 외부 package와 모델 conformance를 추가하는 비용이 더 클 수 있어요.

실제 성능은 다음 항목을 함께 측정해요.

- source와 target의 item 수
- 한 번에 발생하는 변경 수
- section 이동과 item 이동의 비율
- 셀 구성과 이미지 디코딩 비용
- layout invalidation과 애니메이션 비용
- `interrupt`로 `reloadData()`에 전환할 기준

## diff 계약을 작은 테스트로 고정해요

UI 없이도 모델의 식별과 내용 비교가 원하는 changeset을 만드는지 테스트할 수 있어요.

```swift
import DifferenceKit
import Foundation
import Testing

@Test
func samePhotoWithChangedContentBecomesUpdate() {
  let id = UUID()
  let before = [
    Photo(id: id, title: "서울", isFavorite: false),
  ]
  let after = [
    Photo(id: id, title: "서울", isFavorite: true),
  ]

  let staged = StagedChangeset(
    source: before,
    target: after
  )

  let updates = staged.flatMap(\.elementUpdated)

  #expect(
    updates.contains(
      ElementPath(element: 0, section: 0)
    )
  )
  #expect(staged.last?.data == after)
}
```

이 테스트가 실패한다면 다음을 확인해요.

1. `differenceIdentifier`가 내용과 함께 바뀌지 않았나요?
2. `isContentEqual`이 화면에 표시하는 모든 값을 비교하나요?
3. 서로 다른 item이 같은 식별자를 공유하지 않나요?
4. section 모델에도 같은 문제가 있지 않나요?

UIKit 통합 테스트에서는 변경 후 item 수와 보이는 셀뿐 아니라 `setData`가 각 stage에서 동기적으로 호출되는 구조인지도 확인해야 해요.

## 언제 사용해야 하나요

DifferenceKit을 사용하기 좋은 경우는 다음과 같아요.

- 오래된 iOS를 지원하면서 Collection View의 세부 애니메이션이 필요해요.
- 수동 `performBatchUpdates`의 위치 계산과 일관성 오류를 줄이고 싶어요.
- 정체성과 내용 변경을 분리한 모델 계약이 필요해요.
- section과 item의 diff 결과를 UIKit 밖에서도 검사하거나 테스트하고 싶어요.
- 기존 data source와 셀 제공 구조는 유지하고 diff 계층만 교체하고 싶어요.

다음 조건에서는 도입하지 않아도 돼요.

- item이 거의 바뀌지 않는 작은 목록이라 `reloadData()`로 충분해요.
- iOS 13 이상만 지원하며 UIKit diffable data source가 요구사항을 충족해요.
- 단순한 컬렉션 patch만 필요해 표준 `CollectionDifference`로 충분해요.
- 외부 의존성의 릴리스 주기와 Swift 버전 호환성을 관리하기 어려워요.
- 계층형 outline을 UIKit section snapshot으로 직접 표현해야 해요.

최신 공개 릴리스가 오래되었다는 사실만으로 기존 사용처를 즉시 제거할 필요는 없어요. 반대로 과거 성능 수치만 보고 새 프로젝트에 자동 채택해서도 안 돼요. 현재 배포 대상, 필요한 변경 의미, 유지보수 비용을 함께 비교하세요.

## Swift Package Manager로 설치해요

재현 가능한 예제를 위해 현재 최신 릴리스 `1.3.0`을 고정하면 다음과 같아요.

```swift
dependencies: [
  .package(
    url: "https://github.com/ra1028/DifferenceKit.git",
    exact: "1.3.0"
  ),
]
```

앱 target에는 product를 연결해요.

```swift
.target(
  name: "PhotoApp",
  dependencies: [
    .product(
      name: "DifferenceKit",
      package: "DifferenceKit"
    ),
  ]
)
```

Xcode의 Package Dependencies 화면에서 저장소 URL을 추가할 수도 있어요. 실제 프로젝트에서는 새 버전이나 fork를 선택하기 전에 release, commit, issue, Swift toolchain 호환성을 다시 확인하세요.

## 적용 순서를 정리해요

1. 기존 data source가 참조하는 section과 item 저장소를 찾아요.
2. 각 모델에서 위치나 표시 내용과 무관한 안정적인 식별자를 정해요.
3. `differenceIdentifier`와 `isContentEqual`을 각각 구현해요.
4. 식별자 중복과 빠진 내용 프로퍼티를 단위 테스트로 확인해요.
5. 이전·목표 컬렉션으로 `StagedChangeset`을 만들어요.
6. `reload(using:)`의 `setData`에서 stage 데이터를 동기적으로 저장해요.
7. 삽입, 삭제, 이동, 내용 갱신, section 변경을 각각 검증해요.
8. 대량 변경을 측정하고 필요하면 `interrupt` 기준을 정해요.
9. 배포 대상이 올라가면 UIKit diffable data source로 단순화할 이점도 다시 검토해요.

## 면접에서 이어질 수 있는 질문

### DifferenceKit의 `Differentiable`과 Swift `Identifiable`은 무엇이 다른가요?

`Identifiable`은 값의 정체성을 `id`로 표현하는 표준 protocol이에요. DifferenceKit의 `Differentiable`은 diff에 사용할 식별자뿐 아니라 정체성이 같은 두 값의 내용이 같은지 비교하는 계약까지 합쳐, 이동과 내용 갱신을 구분해요.

### 왜 `setData`에서 stage 데이터를 즉시 저장해야 하나요?

Collection View는 각 batch update 중 data source의 section과 item 개수를 다시 조회할 수 있기 때문이에요. 화면에 적용하는 변경과 모델이 서로 다른 stage를 가리키면 내부 일관성 오류가 발생할 수 있으므로, 각 `Changeset.data`를 동기적으로 반영해야 해요.

### `CollectionDifference` 대신 DifferenceKit이 필요한 경우는 언제인가요?

표준 `CollectionDifference`는 일반 컬렉션의 삽입과 삭제를 표현하고 적용하는 데 적합해요. section과 item의 내용 갱신, 명시적인 이동, UIKit에서 안전하게 실행할 중간 stage와 적용 extension까지 필요하면 DifferenceKit이 더 직접적인 도구가 될 수 있어요.

### 새 Collection View에도 DifferenceKit을 먼저 선택해야 하나요?

그렇지는 않아요. iOS 13 이상이라면 별도 의존성이 없고 snapshot과 계층형 section을 지원하는 UIKit diffable data source를 먼저 검토하고, 오래된 배포 대상, 기존 data source 유지, 명시적인 changeset 같은 요구가 있을 때 DifferenceKit을 선택해요.

### `difference(from:)`과 DifferenceKit의 시간 복잡도는 어떻게 다른가요?

Swift `difference(from:)`의 공개된 최악 시간 복잡도는 `O(N × M)`이고, 공통 값이 많거나 원소가 `Hashable`이면 더 빨라질 수 있어요. DifferenceKit은 전체 입력 크기 `L`에 대해 `O(L)`인 Heckel 기반 diff를 제공하지만 항상 가장 짧은 변경 집합을 만들지는 않아요. 어느 쪽도 실제 UI가 더 빠르다고 보장하지 않으므로 셀 구성, layout, animation을 포함해 앱 데이터로 측정해야 해요.

## 참고 자료

- [DifferenceKit 공식 저장소](https://github.com/ra1028/DifferenceKit)
- [DifferenceKit 1.3.0 릴리스](https://github.com/ra1028/DifferenceKit/releases/tag/1.3.0)
- [DifferenceKit — ContentIdentifiable.swift](https://github.com/ra1028/DifferenceKit/blob/1.3.0/Sources/ContentIdentifiable.swift)
- [DifferenceKit — ContentEquatable.swift](https://github.com/ra1028/DifferenceKit/blob/1.3.0/Sources/ContentEquatable.swift)
- [DifferenceKit — Differentiable.swift](https://github.com/ra1028/DifferenceKit/blob/1.3.0/Sources/Differentiable.swift)
- [DifferenceKit — StagedChangeset](https://ra1028.github.io/DifferenceKit/Structs/StagedChangeset.html)
- [DifferenceKit — UICollectionView extension](https://ra1028.github.io/DifferenceKit/Extensions/UICollectionView.html)
- [DifferenceKit — UIKitExtension.swift](https://github.com/ra1028/DifferenceKit/blob/1.3.0/Sources/Extensions/UIKitExtension.swift)
- [Apple Developer — CollectionDifference](https://developer.apple.com/documentation/swift/collectiondifference)
- [Apple Developer — difference(from:)](https://developer.apple.com/documentation/swift/array/difference%28from%3A%29)
- [Apple Developer — inferringMoves()](https://developer.apple.com/documentation/swift/collectiondifference/inferringmoves%28%29)
- [Apple Developer — applying(_:)](https://developer.apple.com/documentation/swift/array/applying%28_%3A%29)
- [Swift Evolution SE-0240 — Ordered Collection Diffing](https://github.com/swiftlang/swift-evolution/blob/main/proposals/0240-ordered-collection-diffing.md)
- [정주는 개발 중 — difference(from:)와 applying(_:)](https://jeong9216.tistory.com/716)
- [Apple Developer — NSDiffableDataSourceSnapshot](https://developer.apple.com/documentation/uikit/nsdiffabledatasourcesnapshot-swift.struct)
- [Apple Developer — Updating collection views using diffable data sources](https://developer.apple.com/documentation/uikit/updating-collection-views-using-diffable-data-sources)
