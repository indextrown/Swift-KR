---
title: 리스트 바인딩과 DelegateProxy
description: UITableView·UICollectionView의 rx.items, 모델 선택·prefetch 이벤트, data source 수명과 DelegateProxy의 전달·메서드 interception 제약을 설명합니다.
source: https://github.com/ReactiveX/RxSwift/blob/6.10.2/RxCocoa/Common/DelegateProxy.swift
reviewed: '2026-09-06'
---

# 리스트 바인딩과 DelegateProxy

> **면접 답변 한 줄 요약:** RxCocoa는 data source와 delegate 자리에 프록시를 설치해 목록 값과 UIKit 콜백을 Observable로 연결하며, 프록시는 메인 스레드에서 사용하고 반환값이 없는 알림형 메서드만 동적으로 관찰할 수 있어요.

UITableView와 UICollectionView는 data source와 delegate가 각각 한 자리예요. RxCocoa는 이 자리를 무시하지 않고 proxy 객체를 설치한 뒤 Rx 구독과 실제 delegate에 호출을 나눠 전달해요.

## `rx.items`가 data source를 설치해요

```swift
let products: Driver<[Product]> = viewModel.products

products
  .drive(
    collectionView.rx.items(
      cellIdentifier: "ProductCell",
      cellType: ProductCell.self
    )
  ) { _, product, cell in
    cell.render(product)
  }
  .disposed(by: disposeBag)
```

구독이 시작되면 RxCocoa가 reactive array data source를 설치하고, 새 배열이 올 때 셀 개수와 구성을 갱신해요. 반환된 Disposable이 폐기될 때 data source 바인딩도 정리돼요.

## 제공되는 items 형태를 구분해요

| 형태                              | 특징                                                    |
| --------------------------------- | ------------------------------------------------------- |
| `items(cellIdentifier:)`          | 등록한 identifier로 셀을 dequeue해요.                   |
| `items(cellIdentifier:cellType:)` | 구체적인 셀 타입을 추론해 configuration을 제공해요.     |
| `items(dataSource:)`              | `RxTableViewDataSourceType` 등 별도 data source를 써요. |
| 사용자 정의 data source           | 섹션·모델 조회·업데이트 정책을 직접 구현해요.           |

기본 array data source는 단순 목록에 적합해요. 섹션 모델, diff 애니메이션, 헤더·푸터가 필요하면 RxDataSources 같은 별도 라이브러리나 UIKit Diffable Data Source를 비교하세요. RxDataSources는 RxCocoa 본체에 포함된 제품이 아니에요.

## 모델 선택은 data source의 모델 조회를 사용해요

```swift
collectionView.rx.modelSelected(Product.self)
  .bind(to: viewModel.select)
  .disposed(by: disposeBag)
```

`modelSelected`는 선택된 IndexPath를 reactive data source의 `model(at:)`으로 변환해요. `rx.items` 계열 또는 `SectionedViewDataSourceType`을 구현한 data source가 설치돼 있어야 해요.

```swift
collectionView.rx.itemSelected
  .withLatestFrom(products) { indexPath, products in
    products[indexPath.item]
  }
  .bind(to: viewModel.select)
  .disposed(by: disposeBag)
```

직접 IndexPath를 배열에 적용하는 방식은 업데이트 시점이 어긋나면 범위를 벗어날 수 있어요. 가능한 경우 data source의 모델 조회 계약을 사용하세요.

## 셀 표시와 종료 사건을 관찰해요

```swift
collectionView.rx.willDisplayCell
  .subscribe(onNext: { cell, indexPath in
    analytics.recordVisible(indexPath)
  })
  .disposed(by: disposeBag)

collectionView.rx.didEndDisplayingCell
  .subscribe(onNext: { cell, indexPath in
    imageLoader.cancel(indexPath)
  })
  .disposed(by: disposeBag)
```

didEndDisplaying의 IndexPath는 데이터 갱신 뒤 현재 모델 위치와 일치하지 않을 수 있어요. 장기 작업을 취소하려면 셀이나 요청이 모델 ID를 직접 소유하게 하는 방법도 고려하세요.

## prefetch data source도 프록시를 사용해요

```swift
collectionView.rx.prefetchItems
  .subscribe(onNext: { indexPaths in
    imageLoader.prefetch(indexPaths)
  })
  .disposed(by: disposeBag)

collectionView.rx.cancelPrefetchingForItems
  .subscribe(onNext: { indexPaths in
    imageLoader.cancelPrefetch(indexPaths)
  })
  .disposed(by: disposeBag)
```

직접 `UICollectionViewDataSourcePrefetching`도 구현한다면 `rx.setPrefetchDataSource`로 forwarding 대상을 설치하세요. 직접 프로퍼티를 덮어쓰면 Rx 프록시가 분리될 수 있어요.

## DelegateProxy의 구조

```text
UICollectionView
      │ delegate
      ▼
RxCollectionViewDelegateProxy
      ├─ PublishSubject로 Rx Observer에게 전달
      └─ forward delegate로 UIKit delegate 호출 전달
```

DelegateProxy는 부모 객체에 associated object로 연결되고, 현재 delegate를 proxy로 교체해요. `setForwardToDelegate`를 통해 일반 delegate도 호출을 받을 수 있어요.

공식 구현은 DelegateProxy가 thread-safe하지 않으며 **메인 스레드 한 곳에서 사용해야 한다**고 명시해요.

## `sentMessage`와 `methodInvoked` 시점이 달라요

| API                       | Observer에게 보내는 시점   |
| ------------------------- | -------------------------- |
| `sentMessage(selector)`   | 대상 메서드를 호출하기 전  |
| `methodInvoked(selector)` | 대상 메서드 호출이 끝난 뒤 |

```swift
let selector = #selector(UIViewController.viewDidAppear(_:))

viewController.rx.methodInvoked(selector)
  .subscribe(onNext: { arguments in
    print("viewDidAppear 완료:", arguments)
  })
  .disposed(by: disposeBag)
```

인자 배열은 `[Any]`이므로 타입 캐스팅과 selector 인덱스를 직접 관리해야 해요. RxCocoa가 이미 타입 안전한 `itemSelected` 같은 API를 제공하면 그것을 우선 사용하세요.

## 반환값 없는 delegate 메서드만 동적 관찰해요

DelegateProxy의 `sentMessage`와 `methodInvoked`는 반환값이 `Void`인 알림형 메서드를 관찰하는 용도예요. 반환값이 있는 메서드는 다음 이유로 자동 관찰하기 어려워요.

- 프록시가 어떤 기본 반환값을 사용해야 할지 알 수 없어요.
- 해당 메서드는 사건 알림이 아니라 동작 정책을 결정하는 경우가 많아요.
- 여러 Observer가 서로 다른 반환값을 요구할 수 있어요.

`shouldSelect`, 내비게이션 정책처럼 반환값이 필요한 메서드는 실제 delegate에서 구현하고, 필요하다면 내부 Subject로 결과 사건만 별도 노출하세요.

## 일반 delegate를 함께 설치해요

```swift
tableView.rx.setDelegate(self)
  .disposed(by: disposeBag)
```

RxCocoa의 `setDelegate`는 forwarding delegate를 설치하고 폐기 시 연결을 되돌리는 Disposable을 반환해요. 일반적으로 delegate를 retain하지 않으므로 View Controller 같은 별도 소유자가 살아 있어야 해요.

다음 코드는 피하세요.

```swift
tableView.rx.itemSelected
  .subscribe()
  .disposed(by: disposeBag)

tableView.delegate = anotherDelegate
```

마지막 직접 대입이 proxy를 덮어 Rx 이벤트가 멈추거나 예측하기 어려운 동작을 만들 수 있어요.

## 재사용 셀의 구독을 모델 수명과 맞춰요

```swift
final class ProductCell: UICollectionViewCell {
  var disposeBag = DisposeBag()

  override func prepareForReuse() {
    super.prepareForReuse()
    disposeBag = DisposeBag()
  }
}
```

셀의 버튼·이미지 로딩처럼 현재 모델에 속한 구독은 셀 bag에 보관하고 재사용 때 폐기해요. View Model의 전체 목록 Driver는 화면의 bag이 소유해야 해요.

## diff 갱신 도구와 역할을 구분해요

| 도구                       | Rx 연결      | diff 계산·애니메이션 | 데이터 소유 방식             |
| -------------------------- | ------------ | -------------------- | ---------------------------- |
| RxCocoa 기본 `rx.items`    | 직접         | 기본 reload 성격     | 단순 배열                    |
| RxDataSources              | 직접         | animated data source | 섹션 모델과 identity         |
| UIKit Diffable Data Source | adapter 필요 | snapshot diff        | Hashable identifier snapshot |
| DifferenceKit              | adapter 필요 | staged changeset     | Differentiable 모델          |

목록 바인딩과 diff 계산은 별개 책임이에요. 데이터 크기와 애니메이션 요구사항에 맞는 data source를 고르세요.

## 자주 하는 실수

- `rx.items`를 쓰면서 별도 dataSource를 직접 대입해요.
- Rx delegate 구독 뒤 일반 delegate를 프로퍼티에 직접 덮어써요.
- 반환값이 있는 delegate 메서드를 `methodInvoked`만으로 처리하려 해요.
- DelegateProxy를 백그라운드에서 설치해요.
- 모델 변경과 IndexPath 사용 시점을 분리하지 않아요.
- 셀 재사용 뒤 이전 모델 구독을 남겨요.

## 적용 체크리스트

- 기본 items와 custom data source 중 요구사항에 맞는 방식을 골랐나요?
- 모델 선택이 현재 data source의 모델 조회를 사용하나요?
- delegate·dataSource proxy를 직접 대입으로 덮지 않나요?
- 반환값이 필요한 delegate 정책의 실제 소유자가 있나요?
- proxy 설치와 구독이 메인에서 이뤄지나요?
- 셀·화면·prefetch 작업의 Disposable 수명을 분리했나요?

## 면접에서 이어질 수 있는 질문

### DelegateProxy가 필요한 이유는 무엇인가요?

UIKit delegate 프로퍼티는 하나뿐이므로 Rx Observer와 일반 delegate가 호출을 함께 받으려면 중간에서 사건을 관찰하고 forwarding하는 객체가 필요해요.

### `methodInvoked`로 모든 delegate 메서드를 관찰할 수 있나요?

아니요. 동적 관찰은 기본적으로 반환값이 없는 알림형 메서드에 적합해요. 반환값이 필요한 정책 메서드는 실제 delegate 구현에서 처리해야 해요.

## 참고 자료

- [DelegateProxy 공식 구현](https://github.com/ReactiveX/RxSwift/blob/6.10.2/RxCocoa/Common/DelegateProxy.swift)
- [UITableView Rx 구현](https://github.com/ReactiveX/RxSwift/blob/6.10.2/RxCocoa/iOS/UITableView%2BRx.swift)
- [UICollectionView Rx 구현](https://github.com/ReactiveX/RxSwift/blob/6.10.2/RxCocoa/iOS/UICollectionView%2BRx.swift)
- [SectionedViewDataSourceType](https://github.com/ReactiveX/RxSwift/blob/6.10.2/RxCocoa/Common/SectionedViewDataSourceType.swift)
- [CollectionView Prefetching Proxy](https://github.com/ReactiveX/RxSwift/blob/6.10.2/RxCocoa/iOS/Proxies/RxCollectionViewDataSourcePrefetchingProxy.swift)
