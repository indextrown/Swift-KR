---
title: 'UICollectionView 예제 한눈에 보기'
description: 'UICollectionView의 Data Source·Delegate·Layout 역할을 전체 구조로 비교하고 prefetch, drag and drop, List·Custom·Transition Layout 예제로 이어지는 공통 모델을 준비합니다.'
---

# UICollectionView 예제 한눈에 보기

> **면접 답변 한 줄 요약:** `UICollectionView` 예제는 data source로 데이터와 셀을 연결하고 layout으로 배치를 정하며, 안정적인 item 식별자를 기준으로 갱신할 때 안전하게 확장할 수 있어요.

이 섹션은 Collection View를 실제 화면으로 조립하는 예제를 역할별 문서로 나누어 설명해요. 모든 문서는 같은 사진 갤러리 모델과 셀을 사용하므로 데이터 제공, 사용자 상호작용, layout의 차이에 집중할 수 있어요.

## 전체 역할 지도를 먼저 봐요

```text
UICollectionView
├── Data Source
│   ├── UICollectionViewDataSource
│   ├── UICollectionViewDiffableDataSource
│   └── UICollectionViewDataSourcePrefetching
├── Delegate
│   ├── UICollectionViewDelegate
│   ├── UICollectionViewDelegateFlowLayout
│   ├── UICollectionViewDragDelegate
│   └── UICollectionViewDropDelegate
└── Layout
    ├── UICollectionViewFlowLayout
    ├── UICollectionViewCompositionalLayout
    │   └── List Layout
    ├── Custom UICollectionViewLayout
    └── UICollectionViewTransitionLayout
```

Data Source는 무엇을 표시할지, Delegate는 사용자와 item의 상호작용을 어떻게 처리할지, Layout은 어디에 배치할지를 결정해요. 각 역할은 조합할 수 있으므로 Diffable Data Source에 Flow Layout을 붙이는 것도 가능해요.

## 어떤 예제부터 읽어야 하나요

| 역할        | 구현하려는 내용                                | 예제 문서                                                            |
| ----------- | ---------------------------------------------- | -------------------------------------------------------------------- |
| Data Source | 배열로 item 개수와 셀 제공하기                 | [`UICollectionViewDataSource`](./data-source)                        |
| Data Source | snapshot으로 삽입·삭제·내용 변경하기           | [`UICollectionViewDiffableDataSource`](./diffable-data-source)       |
| Data Source | 곧 보일 이미지 작업을 미리 시작하기            | [`UICollectionViewDataSourcePrefetching`](./data-source-prefetching) |
| Delegate    | 배열 기반 선택·하이라이트·메뉴 처리하기        | [전통적인 `UICollectionViewDelegate`](./traditional-delegate)        |
| Delegate    | identifier 기반 선택·상호작용 처리하기         | [현대적인 `UICollectionViewDelegate`](./modern-delegate)             |
| Delegate    | Flow Layout의 item 크기·간격을 동적으로 정하기 | [`UICollectionViewDelegateFlowLayout`](./flow-layout-delegate)       |
| Delegate    | Item을 들어 올려 drag 시작하기                 | [`UICollectionViewDragDelegate`](./drag-delegate)                    |
| Delegate    | 내부 재배치와 외부 drop 처리하기               | [`UICollectionViewDropDelegate`](./drop-delegate)                    |
| Layout      | 균일한 목록·반응형 격자 만들기                 | [`UICollectionViewFlowLayout`](./flow-layout)                        |
| Layout      | 가로 카드와 격자를 한 화면에 조합하기          | [`UICollectionViewCompositionalLayout`](./compositional-layout)      |
| Layout      | 설정 화면과 표준 목록 만들기                   | [Collection View List Layout](./list-layout)                         |
| Layout      | 직접 layout attributes를 계산하기              | [Custom `UICollectionViewLayout`](./custom-layout)                   |
| Layout      | 두 layout 사이를 gesture로 전환하기            | [`UICollectionViewTransitionLayout`](./transition-layout)            |
| 공통 확장   | 빈 상태·새로고침·페이지네이션 추가하기         | [실무 확장 예제](./practical-recipes)                                |

처음이라면 전통적인 흐름이나 현대적인 흐름 하나를 먼저 완성한 뒤, 필요한 prefetch·drag and drop·고급 layout 예제로 확장하세요.

## 먼저 알아둘 용어

| 용어                 | 쉬운 뜻                                                                                   |
| -------------------- | ----------------------------------------------------------------------------------------- |
| data source          | Collection View가 item 개수와 셀을 물을 때 답하는 객체예요.                               |
| `IndexPath`          | 현재 section과 item의 위치예요. 앞에 item이 추가되면 같은 데이터의 위치도 바뀔 수 있어요. |
| item identifier      | 위치가 바뀌어도 같은 데이터임을 나타내는 안정적인 `Hashable` 값이에요.                    |
| snapshot             | 특정 시점에 어떤 section과 item이 어떤 순서로 존재하는지 표현한 값이에요.                 |
| cell registration    | 셀 타입과 셀 구성 코드를 묶어 재사용하는 값이에요.                                        |
| Flow Layout          | item을 한 줄에 가능한 만큼 놓고 다음 줄로 넘기는 격자형 layout이에요.                     |
| Compositional Layout | item, group, section을 조합해 section마다 서로 다른 배치를 만드는 layout이에요.           |

## 공통 사진 모델을 만들어요

모든 예제에서 아래 `Photo`를 사용해요. Diffable Data Source의 item identifier에는 바뀔 수 있는 모델 전체가 아니라 `Photo.ID`를 사용해요.

```swift
import UIKit

struct Photo: Identifiable {
  let id: UUID
  var title: String
  let symbolName: String
  var isFavorite: Bool
}

extension Photo {
  static let samples: [Photo] = [
    Photo(
      id: UUID(),
      title: "여름 바다",
      symbolName: "beach.umbrella.fill",
      isFavorite: true
    ),
    Photo(
      id: UUID(),
      title: "도시 산책",
      symbolName: "building.2.fill",
      isFavorite: false
    ),
    Photo(
      id: UUID(),
      title: "주말 캠핑",
      symbolName: "tent.fill",
      isFavorite: false
    ),
    Photo(
      id: UUID(),
      title: "저녁 노을",
      symbolName: "sunset.fill",
      isFavorite: true
    ),
  ]
}
```

제목이나 즐겨찾기 여부가 바뀌어도 같은 사진이라는 정체성은 유지되어야 해요. 모델 전체를 자동 생성 `Hashable` 값으로 사용하면 내용 변경을 삭제와 삽입으로 오해할 수 있으므로, 별도의 안정적인 ID를 두는 편이 안전해요.

## 공통 재사용 셀을 만들어요

전통적인 reuse identifier와 현대적인 cell registration 모두 같은 `PhotoCell`을 사용할 수 있어요.

```swift
final class PhotoCell: UICollectionViewCell {
  static let reuseIdentifier = "PhotoCell"

  private let imageView = UIImageView()
  private let titleLabel = UILabel()
  private let favoriteImageView = UIImageView(
    image: UIImage(systemName: "heart.fill")
  )

  override init(frame: CGRect) {
    super.init(frame: frame)

    imageView.contentMode = .scaleAspectFit
    imageView.tintColor = .systemIndigo

    titleLabel.font = .preferredFont(forTextStyle: .headline)
    titleLabel.numberOfLines = 1

    favoriteImageView.tintColor = .systemPink
    favoriteImageView.setContentHuggingPriority(
      .required,
      for: .horizontal
    )

    let titleRow = UIStackView(
      arrangedSubviews: [titleLabel, favoriteImageView]
    )
    titleRow.axis = .horizontal
    titleRow.spacing = 8
    titleRow.alignment = .center

    let stack = UIStackView(arrangedSubviews: [imageView, titleRow])
    stack.axis = .vertical
    stack.spacing = 10
    stack.translatesAutoresizingMaskIntoConstraints = false

    contentView.addSubview(stack)
    contentView.backgroundColor = .secondarySystemBackground
    contentView.layer.cornerRadius = 14
    contentView.layer.cornerCurve = .continuous

    NSLayoutConstraint.activate([
      stack.topAnchor.constraint(
        equalTo: contentView.topAnchor,
        constant: 12
      ),
      stack.leadingAnchor.constraint(
        equalTo: contentView.leadingAnchor,
        constant: 12
      ),
      stack.trailingAnchor.constraint(
        equalTo: contentView.trailingAnchor,
        constant: -12
      ),
      stack.bottomAnchor.constraint(
        equalTo: contentView.bottomAnchor,
        constant: -12
      ),
      imageView.heightAnchor.constraint(
        greaterThanOrEqualToConstant: 72
      ),
    ])
  }

  @available(*, unavailable)
  required init?(coder: NSCoder) {
    fatalError("init(coder:)는 사용하지 않아요.")
  }

  func configure(with photo: Photo) {
    imageView.image = UIImage(systemName: photo.symbolName)
    titleLabel.text = photo.title
    favoriteImageView.isHidden = !photo.isFavorite
  }

  override func prepareForReuse() {
    super.prepareForReuse()

    imageView.image = nil
    titleLabel.text = nil
    favoriteImageView.isHidden = true
  }

  override var isSelected: Bool {
    didSet {
      contentView.layer.borderWidth = isSelected ? 3 : 0
      contentView.layer.borderColor = UIColor.systemBlue.cgColor
    }
  }
}
```

셀의 하위 뷰는 `contentView`에 넣어요. `prepareForReuse()`에서는 이전 item의 표시 상태를 초기화해요. 네트워크 이미지를 사용한다면 진행 중인 작업도 취소하고, 완료 시점에 셀이 여전히 같은 `Photo.ID`를 표시하는지 확인해야 해요.

## Data Source와 layout은 독립적으로 선택해요

| 선택 기준              | 단순한 출발점                       | 변경·배치가 복잡할 때                               |
| ---------------------- | ----------------------------------- | --------------------------------------------------- |
| 데이터 제공과 갱신     | `UICollectionViewDataSource`        | `UICollectionViewDiffableDataSource`                |
| 셀 등록과 구성         | reuse identifier + protocol 메서드  | cell registration + cell provider                   |
| 한 방향 목록·균일 격자 | `UICollectionViewFlowLayout`        | 둘 다 가능하지만 Flow Layout이 더 짧아요.           |
| section별 다른 배치    | delegate 분기가 복잡해질 수 있어요. | `UICollectionViewCompositionalLayout`이 잘 맞아요.  |
| 삽입·삭제              | 모델과 batch update를 직접 맞춰요.  | 목표 상태 snapshot을 적용해 차이를 계산하게 맡겨요. |

전통적인 data source에 Compositional Layout을 붙이거나 Diffable Data Source에 Flow Layout을 붙이는 것도 가능해요. 데이터 제공과 화면 배치는 서로 다른 책임이기 때문이에요.

## 예제의 지원 범위를 확인해요

| API                                   | 최소 버전 |
| ------------------------------------- | --------- |
| `UICollectionViewDiffableDataSource`  | iOS 13    |
| `UICollectionViewCompositionalLayout` | iOS 13    |
| `UICollectionView.CellRegistration`   | iOS 14    |
| Collection View List Layout           | iOS 14    |
| Drag and Drop                         | iOS 11    |
| Data Source Prefetching               | iOS 10    |
| Interactive Layout Transition         | iOS 7     |
| snapshot `reconfigureItems(_:)`       | iOS 15    |

예제는 iOS 15 이상을 기준으로 작성해요. 더 낮은 배포 대상을 지원한다면 cell registration 대신 class·nib 등록을 사용하거나 `reconfigureItems(_:)` 대신 갱신 범위를 검토해 `reloadItems(_:)`를 사용하세요.

## 다음 예제로 이동해요

전통적인 흐름은 [`UICollectionViewDataSource` 예제](./data-source) → [전통적인 `UICollectionViewDelegate` 예제](./traditional-delegate) → [`UICollectionViewFlowLayout` 예제](./flow-layout) 순서로 읽어 보세요.

현대적인 흐름은 [`UICollectionViewDiffableDataSource` 예제](./diffable-data-source) → [현대적인 `UICollectionViewDelegate` 예제](./modern-delegate) → [`UICollectionViewCompositionalLayout` 예제](./compositional-layout) 순서로 이어져요.

기본 화면을 완성했다면 [`UICollectionViewDataSourcePrefetching`](./data-source-prefetching)으로 이미지 준비를 앞당기고, [`UICollectionViewDragDelegate`](./drag-delegate)와 [`UICollectionViewDropDelegate`](./drop-delegate)로 재배치를 추가해 보세요.

## 참고 자료

- [Apple Developer Documentation — UICollectionView](https://developer.apple.com/documentation/uikit/uicollectionview)
- [Apple Developer Documentation — UICollectionViewCell](https://developer.apple.com/documentation/uikit/uicollectionviewcell)
- [Apple Developer Documentation — UICollectionView.CellRegistration](https://developer.apple.com/documentation/uikit/uicollectionview/cellregistration)
