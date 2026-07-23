---
title: UICollectionView와 화면 역할 이해하기
description: UICollectionView와 UICollectionViewController의 책임을 구분하고 화면 생성, 레이아웃 교체, delegate 연결과 생명주기를 Swift 코드로 설명합니다.
---

# UICollectionView와 화면 역할 이해하기

> **면접 답변 한 줄 요약:** `UICollectionView`는 반복 콘텐츠의 표시와 재사용을 담당하는 뷰이고, 화면의 데이터 요청과 상태 조정은 이를 소유한 `UIViewController` 또는 `UICollectionViewController`가 담당해요.

Collection View를 처음 만들 때 `UICollectionViewController`부터 상속해야 하는지, 일반 `UIViewController` 안에 `UICollectionView`를 넣어야 하는지 헷갈릴 수 있어요. 두 방식 모두 같은 Collection View 기능을 사용해요. 차이는 **화면 전체를 Collection View가 차지하는가**, 그리고 **다른 뷰와 함께 배치할 필요가 있는가**예요.

## 먼저 알아둘 화면 용어

| 용어               | 쉬운 뜻                                                                                                                                   |
| ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `UIView`           | 화면에 그려지고 터치 입력을 받을 수 있는 UIKit 객체의 기본 타입이에요.                                                                    |
| `UIViewController` | 한 화면의 뷰 계층과 생명주기를 관리하는 객체예요. 데이터를 불러올 시점과 화면 전환도 보통 여기서 조정해요.                                |
| view hierarchy     | 화면 안에서 뷰가 부모와 자식 관계로 들어 있는 구조예요.                                                                                   |
| safe area          | 노치, 상태 표시줄, 홈 인디케이터와 겹치지 않도록 콘텐츠를 배치할 수 있는 영역이에요.                                                      |
| delegate           | 다른 객체에서 일어난 사건을 메서드 호출로 전달받는 역할이에요. Collection View는 선택과 표시 시점 등을 delegate에 알려 줘요.              |
| `@MainActor`       | 해당 타입이나 함수가 UI 작업에 사용하는 메인 실행 영역에서 동작해야 한다는 Swift 동시성 표시예요. UIKit 화면 코드는 메인 영역에서 다뤄요. |

## `UICollectionView`는 표시 장치예요

Apple은 `UICollectionView`를 순서가 있는 데이터 item을 사용자 지정 가능한 layout으로 보여 주는 객체라고 정의해요. Collection View 자체는 다음 일을 해요.

- 현재 보이는 영역에 필요한 cell과 supplementary view를 요청해요.
- 화면 밖으로 나간 뷰를 재사용할 수 있도록 관리해요.
- layout attributes를 받아 각 뷰의 위치와 크기를 적용해요.
- 스크롤, 선택, 포커스, 편집 상태를 관리해요.
- 삽입, 삭제, 이동과 snapshot 적용 결과를 화면에 반영해요.

반면 Collection View가 직접 결정하지 않는 것도 있어요.

- 서버나 데이터베이스에서 어떤 데이터를 가져올지
- 사진의 제목이 바뀌었을 때 모델을 어떻게 저장할지
- 그리드와 목록 중 어떤 화면 정책을 선택할지
- item을 눌렀을 때 어느 화면으로 이동할지

이 결정은 화면 컨트롤러, 별도 모델 객체, data source, coordinator처럼 더 적합한 역할에서 맡아요.

## 일반 View Controller 안에 넣어 봐요

검색창과 Collection View를 함께 배치하는 사진 화면을 만들어 볼게요. 다른 뷰와 자유롭게 조합해야 하므로 `UIViewController`를 사용해요.

```swift
import UIKit

@MainActor
final class PhotoSearchViewController: UIViewController {
  private let searchBar = UISearchBar()

  private lazy var collectionView = UICollectionView(
    frame: .zero,
    collectionViewLayout: makeGridLayout()
  )

  override func viewDidLoad() {
    super.viewDidLoad()

    title = "사진"
    view.backgroundColor = .systemBackground
    configureHierarchy()
  }

  private func configureHierarchy() {
    searchBar.translatesAutoresizingMaskIntoConstraints = false
    collectionView.translatesAutoresizingMaskIntoConstraints = false

    view.addSubview(searchBar)
    view.addSubview(collectionView)

    NSLayoutConstraint.activate([
      searchBar.topAnchor.constraint(
        equalTo: view.safeAreaLayoutGuide.topAnchor
      ),
      searchBar.leadingAnchor.constraint(equalTo: view.leadingAnchor),
      searchBar.trailingAnchor.constraint(equalTo: view.trailingAnchor),

      collectionView.topAnchor.constraint(equalTo: searchBar.bottomAnchor),
      collectionView.leadingAnchor.constraint(equalTo: view.leadingAnchor),
      collectionView.trailingAnchor.constraint(equalTo: view.trailingAnchor),
      collectionView.bottomAnchor.constraint(equalTo: view.bottomAnchor),
    ])
  }
}
```

이 방식에서는 Collection View의 크기와 위치를 직접 제약해요. 빈 상태 안내, 필터, 로딩 표시처럼 다른 뷰가 추가되어도 같은 계층 안에서 배치하기 쉬워요.

## 화면 전체가 목록이면 `UICollectionViewController`도 쓸 수 있어요

`UICollectionViewController`는 Collection View 하나를 중심으로 동작하도록 특화된 `UIViewController`예요. layout을 이니셜라이저로 전달하면 Collection View 생성과 기본 연결을 맡아 줘요.

```swift
@MainActor
final class FavoritePhotosViewController: UICollectionViewController {
  init() {
    super.init(collectionViewLayout: makeGridLayout())
  }

  @available(*, unavailable)
  required init?(coder: NSCoder) {
    fatalError("init(coder:)는 사용하지 않아요.")
  }

  override func viewDidLoad() {
    super.viewDidLoad()

    title = "즐겨찾기"
    collectionView.backgroundColor = .systemBackground
  }
}
```

`UICollectionViewController`는 다음과 같은 기본 동작도 제공해요.

- `collectionView` 프로퍼티로 관리 대상에 접근해요.
- 화면이 다시 나타날 때 선택을 지우는 `clearsSelectionOnViewWillAppear`를 제공해요.
- interactive movement용 표준 제스처 설치를 제어해요.
- navigation controller 안에서 layout 전환을 연결할 수 있어요.

화면 대부분이 Collection View이고 별도 형제 뷰가 많지 않을 때 편리해요. 다만 나중에 화면 구조가 복잡해질 가능성이 크다면 일반 `UIViewController`가 더 유연할 수 있어요.

## 두 방식의 선택 기준을 비교해요

| 기준                 | `UIViewController` + Collection View                | `UICollectionViewController`                              |
| -------------------- | --------------------------------------------------- | --------------------------------------------------------- |
| 화면 구성            | 검색창, 버튼, 빈 상태 등 여러 뷰와 조합하기 쉬워요. | Collection View 중심 화면을 빠르게 만들어요.              |
| Collection View 생성 | 직접 생성하고 계층·제약을 연결해요.                 | layout을 전달하면 기본 Collection View를 관리해요.        |
| 화면 확장            | 형제 뷰 추가가 자연스러워요.                        | Collection View 바깥 구조가 커지면 제약이 생길 수 있어요. |
| 기본 선택·이동 지원  | 필요한 동작을 직접 연결해요.                        | 일부 표준 동작을 프로퍼티로 제공해요.                     |
| 기능 차이            | 핵심 Collection View 기능은 같아요.                 | 핵심 Collection View 기능은 같아요.                       |

상속 타입 자체가 아키텍처를 결정하지는 않아요. 데이터 저장소와 화면 정책을 컨트롤러 안에 모두 넣으면 어느 방식을 사용해도 커질 수 있어요.

## 화면 생명주기에 맞춰 구성을 나눠요

한 메서드에서 Collection View, data source, snapshot을 모두 만들면 실행 순서를 파악하기 어려워요. 생명주기와 책임에 맞게 작은 단계로 나눠 보세요.

```swift
override func viewDidLoad() {
  super.viewDidLoad()

  configureHierarchy()
  configureDataSource()
  configureInteractions()
  loadInitialPhotos()
}
```

각 단계의 역할은 다음과 같아요.

| 단계                      | 하는 일                                                |
| ------------------------- | ------------------------------------------------------ |
| `configureHierarchy()`    | 뷰 생성, 계층 연결, Auto Layout 제약 설정              |
| `configureDataSource()`   | cell registration과 diffable data source 생성          |
| `configureInteractions()` | delegate, prefetch, drag/drop처럼 사용자 상호작용 연결 |
| `loadInitialPhotos()`     | 모델을 읽고 첫 snapshot 적용                           |

`viewDidLoad()`는 뷰가 메모리에 올라온 뒤 한 번 실행되는 구성을 배치하기 좋아요. 매번 화면이 나타날 때 선택 상태를 갱신해야 한다면 `viewWillAppear(_:)`처럼 목적에 맞는 시점을 사용해요.

## delegate는 사건을 전달해요

선택을 허용하고 item을 눌렀을 때 상세 화면으로 이동해 볼게요.

```swift
private func configureInteractions() {
  collectionView.delegate = self
  collectionView.allowsSelection = true
}

extension PhotoSearchViewController: UICollectionViewDelegate {
  func collectionView(
    _ collectionView: UICollectionView,
    didSelectItemAt indexPath: IndexPath
  ) {
    guard let photoID = dataSource.itemIdentifier(for: indexPath) else {
      return
    }

    showPhotoDetail(id: photoID)
  }
}
```

여기서도 `IndexPath`를 그대로 상세 화면에 전달하지 않고 data source를 통해 `Photo.ID`로 바꿔요. 사용자가 누른 뒤 데이터가 갱신되어 위치가 변하더라도 사진의 정체성은 유지되기 때문이에요.

delegate는 화면 사건을 알려 주지만 비즈니스 상태를 대신 저장하지 않아요. 선택된 사진을 앱의 다른 화면에서도 알아야 한다면 별도 모델에 `Photo.ID`를 저장해야 해요.

## layout은 생성할 때 필요하지만 바꿀 수도 있어요

`UICollectionView`는 이니셜라이저에서 layout을 요구해요. 하지만 화면이 살아 있는 동안 격자에서 목록으로 전환할 수도 있어요.

```swift
private func changeToListLayout() {
  let configuration = UICollectionLayoutListConfiguration(
    appearance: .insetGrouped
  )
  let listLayout = UICollectionViewCompositionalLayout.list(
    using: configuration
  )

  collectionView.setCollectionViewLayout(
    listLayout,
    animated: true
  )
}
```

`collectionViewLayout` 프로퍼티를 직접 바꾸면 즉시 전환되고, `setCollectionViewLayout(_:animated:)`를 사용하면 전환을 애니메이션으로 보여 줄 수 있어요. 제스처에 따라 진행률을 제어하는 interactive transition과 `UICollectionViewTransitionLayout`은 [레이아웃 문서](./layouts)에서 다뤄요.

layout을 바꿔도 data source의 item 식별자와 순서는 그대로 유지할 수 있어요. 데이터와 배치를 분리했기 때문에 가능한 일이에요.

## 화면 상태는 모델에서 다시 만들 수 있어야 해요

Collection View의 보이는 셀을 직접 순회하며 내용을 바꾸는 방식은 재사용과 충돌하기 쉬워요.

```swift
// 피하는 편이 좋은 방식
for cell in collectionView.visibleCells {
  cell.alpha = isFiltering ? 0.5 : 1
}
```

화면 밖의 셀은 바뀌지 않고, 나중에 재사용된 셀이 이전 상태를 유지할 수도 있어요. 대신 상태를 모델에 두고 cell provider나 `configurationUpdateHandler`가 현재 상태에서 화면을 다시 만들게 해요.

```swift
private var dimmedPhotoIDs: Set<Photo.ID> = []

private func setFiltering(_ isFiltering: Bool) {
  dimmedPhotoIDs = isFiltering
    ? Set(dataSource.snapshot().itemIdentifiers)
    : []

  var snapshot = dataSource.snapshot()
  snapshot.reconfigureItems(snapshot.itemIdentifiers)
  dataSource.apply(snapshot, animatingDifferences: false)
}
```

cell provider는 item identifier로 `dimmedPhotoIDs`를 확인하고 alpha나 content configuration을 정할 수 있어요. 이 방식은 화면 밖에서 다시 나타난 셀에도 같은 규칙을 적용해요.

## 언제 어떤 컨트롤러를 사용해야 하나요

다음 조건이면 일반 `UIViewController` 안에 Collection View를 넣는 방식이 잘 맞아요.

- 검색창, 지도, 편집 패널처럼 다른 뷰와 함께 배치해요.
- 화면의 일부만 Collection View예요.
- 자식 View Controller나 별도 컨테이너와 조합해요.

다음 조건이면 `UICollectionViewController`가 단순해요.

- 화면 전체가 Collection View예요.
- 기본 선택 해제와 interactive movement 지원이 유용해요.
- 화면 구조가 크게 확장되지 않을 것이 분명해요.

둘 중 무엇을 선택해도 data source, cell registration, layout API는 동일하게 사용할 수 있어요.

## 적용 순서를 정리해요

1. 화면에 Collection View 외의 형제 뷰가 필요한지 확인해요.
2. 조건에 맞춰 `UIViewController` 또는 `UICollectionViewController`를 선택해요.
3. 가장 단순한 layout으로 Collection View를 만들어요.
4. 뷰 계층과 safe area 제약을 연결해요.
5. data source와 첫 snapshot을 구성해요.
6. delegate 사건에서 `IndexPath`를 안정적인 식별자로 변환해요.
7. 화면 상태를 보이는 셀에 직접 저장하지 않았는지 확인해요.

## 면접에서 이어질 수 있는 질문

### `UICollectionViewController`를 꼭 사용해야 하나요?

아니요. 일반 `UIViewController` 안에 `UICollectionView`를 넣어도 모든 핵심 기능을 사용할 수 있어요. 화면 전체가 Collection View인지, 다른 뷰와 얼마나 조합해야 하는지를 기준으로 선택해요.

### Collection View의 delegate와 data source는 어떻게 다른가요?

data source는 보여 줄 section, item과 셀을 제공하고, delegate는 선택이나 표시 시점 같은 사건과 정책을 처리해요. 하나는 화면의 **내용**, 다른 하나는 화면과 사용자의 **상호작용**에 답한다고 구분할 수 있어요.

### Collection View를 왜 메인 액터에서 다뤄야 하나요?

UIKit 뷰 계층과 화면 상태는 메인 실행 영역에서 일관되게 변경해야 해요. 이미지 다운로드처럼 무거운 작업은 다른 실행 영역에서 수행할 수 있지만, 결과를 셀이나 snapshot에 반영하는 작업은 메인 액터로 돌아와야 해요.

## 참고 자료

- [UICollectionView](https://developer.apple.com/documentation/uikit/uicollectionview)
- [UICollectionViewController](https://developer.apple.com/documentation/uikit/uicollectionviewcontroller)
- [UICollectionViewDelegate](https://developer.apple.com/documentation/uikit/uicollectionviewdelegate)
- [About app development with UIKit](https://developer.apple.com/documentation/uikit/about-app-development-with-uikit)
