---
title: RxCocoa로 UIKit 입력과 출력을 바인딩하기
description: RxCocoa의 Reactive 프록시, Binder, ControlProperty, ControlEvent, Driver, Signal과 DelegateProxy를 UIKit 검색 화면 예제로 자세히 설명합니다.
source: https://github.com/ReactiveX/RxSwift/tree/6.10.2/RxCocoa
reviewed: '2026-09-06'
---

# RxCocoa로 UIKit 입력과 출력을 바인딩하기

> **면접 답변 한 줄 요약:** RxCocoa는 UIKit의 속성·컨트롤 이벤트·delegate를 Observable과 Binder로 연결하고, `Driver`와 `Signal`로 메인 스레드·오류 없음·공유 정책을 UI 계약에 담는 모듈이에요.

RxSwift만으로도 Observable을 만들 수 있지만, `UITextField`의 문자열을 읽고 `UILabel`의 텍스트를 갱신하려면 UIKit의 target-action, delegate, 속성 대입을 직접 연결해야 해요. RxCocoa는 이 경계를 `searchBar.rx.text`, `button.rx.tap`, `label.rx.text`처럼 일관된 형태로 제공해요.

이 문서는 **RxSwift 6.10.2의 RxCocoa 공식 구현과 Traits 문서**를 기준으로 해요. Observable의 구독·공유·Scheduler가 아직 낯설다면 [RxSwift 핵심 구조와 생명 주기](./rxswift-core)를 먼저 읽어 보세요.

## 먼저 알아둘 용어

| 용어            | 뜻                                                                                                          |
| --------------- | ----------------------------------------------------------------------------------------------------------- |
| Reactive 프록시 | 원본 객체를 `base`로 보관하고 `.rx` 아래에 반응형 API를 제공하는 `Reactive<Base>` 래퍼예요.                 |
| source          | UI에서 Observable 쪽으로 값을 내보내는 API예요. `button.rx.tap`, `textField.rx.text`가 대표적이에요.        |
| sink            | Observable 값을 UI에 적용하는 소비 지점이에요. `label.rx.text` 같은 Binder가 대표적이에요.                  |
| binding         | source의 값을 sink에 연결해 자동으로 전달하는 관계예요.                                                     |
| UI Trait        | 메인 Scheduler, 오류 없음, 공유 같은 UI 전용 규칙을 타입에 담은 RxCocoa 래퍼예요.                           |
| DelegateProxy   | UIKit delegate·data source 호출을 가로채 Observable로 전달하면서 원래 delegate 전달도 중계하는 프록시예요.  |
| replay          | 새 Subscriber에게 구독 전의 최근 값을 다시 보내는 동작이에요. 상태에는 유용하지만 일회성 사건에는 주의해요. |

## `.rx`는 원본 객체를 감싼 Reactive 프록시예요

RxCocoa에서 `NSObject` 계열은 `ReactiveCompatible`을 채택하므로 `.rx`를 사용할 수 있어요.

```swift
let text: ControlProperty<String?> = searchBar.rx.text
let tap: ControlEvent<Void> = searchButton.rx.tap
let title: Binder<String?> = titleLabel.rx.text
```

이 세 값은 방향이 달라요.

```text
UITextField ── ControlProperty ──▶ Observable 파이프라인
UIButton    ── ControlEvent ─────▶ Observable 파이프라인
Observable ── Binder ────────────▶ UILabel
```

`.rx`는 UIKit 객체를 복제하지 않아요. `Reactive<Base>`가 원본 객체를 `base`로 참조하고, RxCocoa가 확장으로 source와 sink를 제공해요.

## Binder는 UI에 값을 쓰는 안전한 출구예요

`Binder<Value>`는 Observable의 값을 특정 객체에 적용하는 Observer예요. 공식 API 기준으로 다음 성질을 가져요.

- 지정한 Scheduler에서 바인딩하며 기본값은 `MainScheduler`예요.
- 바인딩 대상 객체를 강하게 붙잡지 않아요.
- 오류 이벤트를 받을 수 있는 일반 Observer가 아니며, 오류가 들어오면 디버그 빌드에서 실패하고 릴리스 빌드에서는 로그를 남겨요.

```swift
let disposeBag = DisposeBag()

viewModel.title
  .bind(to: titleLabel.rx.text)
  .disposed(by: disposeBag)

viewModel.isLoading
  .bind(to: activityIndicator.rx.isAnimating)
  .disposed(by: disposeBag)
```

따라서 Binder에 연결하기 전 업스트림 오류를 반드시 처리해야 해요.

```swift
viewModel.title
  .catch { error in
    logger.record(error)
    return .just("불러오지 못했어요")
  }
  .bind(to: titleLabel.rx.text)
  .disposed(by: disposeBag)
```

오류를 빈 값으로 무조건 숨기기보다 사용자에게 보여 줄 실패 상태, 재시도 경로, 기록할 오류를 먼저 정하세요.

## 사용자 정의 Binder로 명령형 UI 코드를 감춰요

반복되는 속성 변경은 `Reactive` 확장에 Binder로 모을 수 있어요.

```swift
import UIKit
import RxCocoa

extension Reactive where Base: UIView {
  var isDimmed: Binder<Bool> {
    Binder(base) { view, isDimmed in
      view.alpha = isDimmed ? 0.45 : 1.0
      view.isUserInteractionEnabled = !isDimmed
    }
  }
}

viewModel.isLoading
  .bind(to: contentView.rx.isDimmed)
  .disposed(by: disposeBag)
```

또한 `Reactive`의 동적 멤버 Binder는 참조 타입의 쓰기 가능한 속성을 sink로 만들 수 있어요. RxCocoa가 명시적인 Binder를 이미 제공한다면 그 API를 먼저 사용하고, 단순 속성 대입에만 동적 멤버를 고려하세요.

```swift
viewModel.isHidden
  .bind(to: emptyView.rx.isHidden)
  .disposed(by: disposeBag)
```

Binder는 도메인 로직을 넣는 장소가 아니에요. 값의 의미를 결정하는 변환은 View Model에서 끝내고, Binder는 색상·텍스트·표시 여부처럼 UI 적용만 담당하게 두세요.

## ControlProperty는 현재 값이 있는 컨트롤 속성이에요

`UITextField.rx.text`는 `ControlProperty<String?>`예요. 공식 Traits 문서가 설명하는 성질은 다음과 같아요.

- 구독하면 컨트롤의 현재 값부터 받아요.
- 사용자 조작으로 생긴 변경을 이어서 받아요.
- 컨트롤이 해제되면 시퀀스가 완료해요.
- 오류를 보내지 않아요.
- 메인 Scheduler에서 구독·관찰해요.
- 마지막 값을 하나 공유하는 성격을 가져요.
- Observer이기도 해서 값을 컨트롤에 다시 바인딩할 수 있어요.

```swift
searchBar.rx.text.orEmpty
  .distinctUntilChanged()
  .subscribe(onNext: { query in
    print("검색어:", query)
  })
  .disposed(by: disposeBag)
```

::::warning 코드로 바꾼 값이 항상 UI 이벤트가 되지는 않아요
ControlProperty는 주로 **사용자가 컨트롤을 조작해 발생한 변경**을 전달해요. `textField.text = "RxSwift"`처럼 프로그래밍 방식으로 속성을 바꿨다고 동일한 control event가 자동 발생한다고 가정하지 마세요. 앱 상태를 바꾸려면 View Model 입력이나 Relay 같은 명시적 경로를 사용하세요.
::::

현재 값을 제외하고 이후 사용자 변경만 필요하면 `ControlProperty.changed`를 사용할 수 있어요.

```swift
searchBar.rx.text.orEmpty.changed
  .subscribe(onNext: { query in
    print("이후 변경:", query)
  })
  .disposed(by: disposeBag)
```

## ControlEvent는 replay하지 않는 UI 사건이에요

`button.rx.tap`은 `ControlEvent<Void>`예요.

- 구독 직후 과거 사건이나 초기값을 보내지 않아요.
- 컨트롤이 해제되면 완료해요.
- 오류를 보내지 않아요.
- 메인 Scheduler에서 구독·관찰해요.

```swift
retryButton.rx.tap
  .subscribe(onNext: {
    print("재시도")
  })
  .disposed(by: disposeBag)
```

버튼 탭, 선택, 편집 시작처럼 “지금 발생한 사건”에는 ControlEvent가 자연스러워요. 화면이 다시 바인딩될 때 과거 탭이 재생되면 안 되므로 최신 값을 보존하는 상태 스트림과 구분하세요.

## Driver는 UI 상태를 구동해요

`Driver<Element>`는 `SharedSequence<DriverSharingStrategy, Element>`의 별칭이에요. 공식 구현이 보장하는 핵심은 세 가지예요.

1. 오류를 전달하지 않아요.
2. 이벤트를 `MainScheduler`에서 관찰해요.
3. 하나의 업스트림 구독을 공유하고, 연결된 동안 최신 값 1개를 replay해요.

개념적으로 다음 공유 정책과 같아요.

```swift
source
  .observe(on: MainScheduler.instance)
  .catchAndReturn(fallback)
  .share(replay: 1, scope: .whileConnected)
```

실제 코드에서는 `asDriver`로 오류 대체 정책을 명시해요.

```swift
let title: Driver<String> = titleService.loadTitle()
  .asDriver(onErrorJustReturn: "제목을 불러오지 못했어요")

title
  .drive(titleLabel.rx.text)
  .disposed(by: disposeBag)
```

`drive`, `drive(onNext:)` 같은 Driver 전용 구독은 메인 스레드에서 호출해야 해요. Driver가 이벤트 관찰 위치를 보장한다고 해서 백그라운드에서 UI 바인딩 구독 자체를 만드는 습관까지 권장되는 것은 아니에요.

## Signal은 replay하지 않는 UI 사건을 전달해요

`Signal<Element>`도 오류 없이 메인 Scheduler에서 관찰하고 업스트림을 공유해요. Driver와 달리 새 Subscriber에게 과거 값을 replay하지 않아요.

```swift
let message: Signal<String> = viewModel.message

message
  .emit(onNext: { [weak self] text in
    self?.showToast(text)
  })
  .disposed(by: disposeBag)
```

화면 표시 상태, 버튼 활성화처럼 새 구독자가 현재 값을 알아야 하면 Driver가 어울려요. 토스트, 화면 이동, 햅틱처럼 과거 사건을 다시 실행하면 안 되면 Signal이 더 잘 맞아요.

## UI 타입을 한 표에서 비교해요

| 타입              | 방향        | 오류 | 메인 관찰 | 초기·최근 값 replay          | 대표 용도                |
| ----------------- | ----------- | ---- | --------- | ---------------------------- | ------------------------ |
| `Binder<T>`       | 스트림 → UI | 거부 | 기본 보장 | 해당 없음                    | UI 속성 적용             |
| `ControlProperty` | UI ↔ 스트림 | 없음 | 보장      | 현재 값 1개                  | 텍스트, 선택 상태        |
| `ControlEvent`    | UI → 스트림 | 없음 | 보장      | 없음                         | 탭, 편집 시작            |
| `Driver<T>`       | 스트림 → UI | 없음 | 보장      | 연결 중 최신 값 1개          | 화면 상태                |
| `Signal<T>`       | 스트림 → UI | 없음 | 보장      | 없음                         | 일회성 화면 사건         |
| `Observable<T>`   | 일반 스트림 | 가능 | 미보장    | 소스와 연산자에 따라 달라요. | 도메인·데이터 파이프라인 |

`ControlProperty`와 `ControlEvent`는 컨트롤에서 만들어지는 Trait이고, Driver와 Signal은 View Model 출력처럼 일반 Observable을 UI 계약으로 변환할 때 주로 사용해요. Binder는 반대편에서 UI에 값을 적용하는 sink예요.

## 검색 화면을 입력부터 출력까지 연결해요

GitHub 저장소를 검색하는 화면을 예로 들어 볼게요. `searchAPI.search(query:)`는 `Observable<[Repository]>`를 반환한다고 가정해요.

```swift
import UIKit
import RxSwift
import RxCocoa

struct Repository {
  let name: String
}

enum SearchViewState {
  case idle
  case loading
  case loaded([Repository])
  case failed(String)
}

let disposeBag = DisposeBag()

let query = searchBar.rx.text.orEmpty
  .asDriver()
  .debounce(.milliseconds(300))
  .distinctUntilChanged()

let state: Driver<SearchViewState> = query
  .flatMapLatest { query in
    guard !query.isEmpty else {
      return .just(.idle)
    }

    return searchAPI.search(query: query)
      .map(SearchViewState.loaded)
      .asDriver { error in
        logger.record(error)
        return .just(.failed("검색 결과를 불러오지 못했어요"))
      }
      .startWith(.loading)
  }

let repositories = state
  .map { state -> [Repository] in
    guard case let .loaded(items) = state else {
      return []
    }
    return items
  }

repositories
  .drive(
    tableView.rx.items(
      cellIdentifier: "RepositoryCell",
      cellType: UITableViewCell.self
    )
  ) { _, repository, cell in
    cell.textLabel?.text = repository.name
  }
  .disposed(by: disposeBag)

state
  .map { state in
    if case .loading = state {
      return true
    }
    return false
  }
  .drive(activityIndicator.rx.isAnimating)
  .disposed(by: disposeBag)

state
  .compactMap { state -> String? in
    guard case let .failed(message) = state else {
      return nil
    }
    return message
  }
  .drive(errorLabel.rx.text)
  .disposed(by: disposeBag)
```

이 흐름에서 각 도구의 역할은 분명해요.

1. `ControlProperty`가 현재 검색어와 사용자 변경을 입력으로 제공해요.
2. Driver의 `debounce`와 `flatMapLatest`가 최신 검색만 유지해요.
3. 네트워크 오류를 UI가 표현할 `failed` 상태로 바꿔 Driver 계약을 만들어요.
4. Driver가 동일한 상태 흐름을 테이블, 로딩 표시, 오류 문구에 공유해요.
5. Binder와 `tableView.rx.items`가 명령형 UI 갱신을 화면 경계에 모아요.

단순히 `asDriver(onErrorJustReturn: [])`로 바꾸면 “검색 결과가 없음”과 “네트워크 실패”가 모두 빈 배열이 돼요. 사용자 경험에서 둘을 구분해야 한다면 예제처럼 상태 enum으로 모델링하세요.

## UITableView와 UICollectionView 바인딩을 이해해요

RxCocoa의 `tableView.rx.items`와 `collectionView.rx.items`는 데이터 시퀀스를 UIKit data source 호출로 연결해요.

```swift
repositories
  .drive(
    collectionView.rx.items(
      cellIdentifier: "RepositoryCell",
      cellType: RepositoryCell.self
    )
  ) { _, repository, cell in
    cell.configure(with: repository)
  }
  .disposed(by: disposeBag)
```

`rx.items`가 반환하는 Disposable은 data source 프록시의 수명과 연결돼요. 구독이 살아 있는 동안 RxCocoa가 data source를 유지하고, 폐기되면 바인딩 관계도 정리돼요.

단순 배열 바인딩은 편리하지만 삽입·삭제 애니메이션과 복잡한 섹션 diff가 필요하면 RxDataSources, DifferenceKit, UIKit Diffable Data Source 같은 별도 전략을 비교하세요. 모든 값 방출마다 전체 셀을 직접 다시 만드는 방식이 항상 최선은 아니에요.

## DelegateProxy는 delegate 호출을 Observable로 바꿔요

UIKit의 delegate는 한 객체 프로퍼티에 하나만 설정할 수 있어요. RxCocoa는 `DelegateProxy`로 delegate 호출을 가로채 Observable 이벤트로 전달하고, 필요하면 원래 delegate에도 호출을 넘겨요.

```swift
tableView.rx.itemSelected
  .subscribe(onNext: { indexPath in
    print("선택:", indexPath)
  })
  .disposed(by: disposeBag)
```

직접 delegate도 설정해야 한다면 RxCocoa가 제공하는 경로를 사용해 충돌을 피하세요.

```swift
tableView.rx.setDelegate(self)
  .disposed(by: disposeBag)
```

다음 실수를 주의하세요.

- Rx 바인딩 뒤에 `tableView.delegate = anotherObject`를 직접 대입해 프록시를 덮지 않아요.
- `rx.items`와 별도의 `dataSource`를 동시에 소유하지 않아요.
- delegate 반환값이 필요한 고급 API는 단순 `methodInvoked` 관찰만으로 충분한지 확인해요.
- Rx가 지원하지 않는 custom delegate라면 `DelegateProxy` 구현 비용과 단순 adapter의 비용을 비교해요.

## 재사용 셀은 셀 단위 구독 수명을 가져요

셀을 재사용할 때 이전 모델의 구독이 남아 있으면 새 셀 내용에 옛 이벤트가 섞일 수 있어요.

```swift
final class RepositoryCell: UITableViewCell {
  var disposeBag = DisposeBag()

  override func prepareForReuse() {
    super.prepareForReuse()
    disposeBag = DisposeBag()
  }
}
```

셀 내부 버튼처럼 셀 수명에 종속되는 구독은 셀의 bag에 보관하고, 화면 전체 상태 구독은 View Controller의 bag에 보관하세요. 다만 매번 재사용 때 바인딩을 다시 만들기보다 셀의 고정 UI 이벤트를 한 번 외부로 노출하는 구조가 더 단순한지도 함께 검토해야 해요.

## 자주 하는 실수를 점검해요

### UI에 일반 Observable을 바로 구독해요

스케줄러와 오류 처리가 호출부마다 흩어져요. View Model 출력 경계에서 Driver 또는 Signal로 변환하면 UI 계약이 한곳에 모여요.

### Driver를 모든 스트림에 사용해요

Driver는 최신 값을 replay하므로 일회성 사건을 다시 실행할 수 있어요. 상태는 Driver, 사건은 Signal이라는 출발점을 두고 실제 replay 요구사항으로 판단하세요.

### `asDriver(onErrorJustReturn:)`로 오류를 숨겨요

오류가 계약에서 사라진 대신 대체 값의 의미를 사용자가 구분하지 못할 수 있어요. 실패 상태, 로깅, 재시도를 함께 설계하세요.

### 하나의 cold 요청을 여러 UI 출력에서 따로 구독해요

요청이 중복될 수 있어요. View Model에서 공유된 Driver 하나를 만들고 여러 Binder가 그 출력을 구동하게 하세요.

### Binder 안에 비즈니스 로직을 넣어요

Binder는 UI 적용 경계예요. 필터링, 권한 판정, 상태 전이는 View Model이나 도메인 계층에서 처리하세요.

## 적용 체크리스트

- UI 입력이 현재 값을 가진 속성인지, replay하면 안 되는 사건인지 구분했나요?
- View Model 출력이 Driver와 Signal 중 어떤 계약을 요구하는지 정했나요?
- Binder에 도달하기 전에 오류를 사용자 상태로 변환했나요?
- 동일한 cold 작업을 여러 UI가 소비할 때 구독이 공유되나요?
- `rx.items`와 직접 data source 설정이 충돌하지 않나요?
- delegate를 직접 설정한다면 RxCocoa 프록시를 보존하나요?
- 화면과 재사용 셀의 DisposeBag 수명을 구분했나요?
- 프로그래밍 방식의 속성 변경을 사용자 control event로 오해하지 않았나요?

## 면접에서 이어질 수 있는 질문

### Driver와 Signal의 가장 중요한 차이는 무엇인가요?

둘 다 오류 없이 메인 Scheduler에서 관찰하고 업스트림을 공유하지만, Driver는 연결 중 최신 값 하나를 replay하고 Signal은 과거 값을 replay하지 않아요. 그래서 상태와 일회성 사건을 구분하는 기준이 돼요.

### Binder가 일반 Observer보다 UI에 적합한 이유는 무엇인가요?

기본적으로 메인 Scheduler에서 값을 적용하고 대상을 강하게 붙잡지 않으며 오류를 허용하지 않아서, UI sink가 지켜야 할 제약을 타입과 구현에 모아 두기 때문이에요.

### ControlProperty와 ControlEvent는 무엇이 다른가요?

ControlProperty는 현재 값을 먼저 보내고 이후 사용자 변경을 전달하는 양방향 속성이며, ControlEvent는 초기값이나 과거 replay 없이 지금 발생한 사건만 전달하는 읽기 전용 흐름이에요.

### RxCocoa가 delegate를 Observable로 만드는 방식은 무엇인가요?

DelegateProxy가 UIKit delegate 자리에 들어가 메서드 호출을 관찰 가능한 이벤트로 전달하고, 필요하면 실제 delegate로 호출을 중계해요. 직접 delegate를 덮어쓰면 프록시와 충돌할 수 있어요.

## 참고 자료

- [ReactiveX/RxSwift 6.10.2 — RxCocoa](https://github.com/ReactiveX/RxSwift/tree/6.10.2/RxCocoa)
- [RxCocoa Traits 공식 설명](https://github.com/ReactiveX/RxSwift/blob/6.10.2/Documentation/Traits.md#rxcocoa-traits)
- [Binder 공식 API](https://docs.rxswift.org/structs/binder)
- [ControlProperty 구현](https://github.com/ReactiveX/RxSwift/blob/6.10.2/RxCocoa/Traits/ControlProperty.swift)
- [ControlEvent 구현](https://github.com/ReactiveX/RxSwift/blob/6.10.2/RxCocoa/Traits/ControlEvent.swift)
- [Driver 구현](https://github.com/ReactiveX/RxSwift/blob/6.10.2/RxCocoa/Traits/Driver/Driver.swift)
- [Signal 구현](https://github.com/ReactiveX/RxSwift/blob/6.10.2/RxCocoa/Traits/Signal/Signal.swift)
- [DelegateProxy 구현](https://github.com/ReactiveX/RxSwift/blob/6.10.2/RxCocoa/Common/DelegateProxy.swift)
- [UITableView Rx 확장 구현](https://github.com/ReactiveX/RxSwift/blob/6.10.2/RxCocoa/iOS/UITableView%2BRx.swift)
