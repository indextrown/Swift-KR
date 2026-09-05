---
title: Disposable과 Rx 자원 수명 관리
description: Disposable, DisposeBag, CompositeDisposable, SerialDisposable 등 RxSwift의 폐기 타입을 소유권 상황별로 비교하고 자원 누수와 취소 경계를 설명합니다.
source: https://docs.rxswift.org/rxswift/disposables
reviewed: '2026-09-06'
---

# Disposable과 Rx 자원 수명 관리

> **면접 답변 한 줄 요약:** Disposable은 구독 연결과 기반 작업을 취소하는 소유권 토큰이며, DisposeBag은 객체 수명, SerialDisposable은 교체 가능한 작업, CompositeDisposable은 동적으로 추가·제거하는 작업 묶음에 맞춰 사용해요.

RxSwift에서 메모리 누수와 불필요한 작업은 서로 다른 문제예요. 객체가 해제되더라도 네트워크·타이머가 계속 돌 수 있고, 작업은 끝났어도 강한 캡처 때문에 화면이 남을 수 있어요. Disposable과 참조 관계를 함께 점검해야 해요.

## Disposable은 취소 가능한 연결이에요

```swift
public protocol Disposable {
  func dispose()
}
```

`dispose()`는 여러 번 호출해도 한 번 정리한 자원을 다시 정리하지 않는 방식으로 구현돼야 해요. 구독이 `.completed`나 `.error`로 끝나면 Rx 체인도 자원을 정리하지만, 끝나지 않는 UI 이벤트와 타이머는 소비자가 명시적으로 폐기해야 해요.

```swift
let disposable = Observable<Int>
  .interval(
    .seconds(1),
    scheduler: MainScheduler.instance
  )
  .subscribe(onNext: { value in
    print(value)
  })

disposable.dispose()
```

`dispose()`는 Observer에게 `.completed`를 보내는 API가 아니에요. 더는 이벤트를 받지 않고 연결 자원을 정리하겠다는 소비자 동작이에요.

## DisposeBag은 객체 수명에 구독을 묶어요

```swift
final class SearchViewController: UIViewController {
  private let disposeBag = DisposeBag()

  override func viewDidLoad() {
    super.viewDidLoad()

    searchBar.rx.text.orEmpty
      .bind(to: viewModel.query)
      .disposed(by: disposeBag)
  }
}
```

View Controller가 해제되면 bag도 해제되고 내부 Disposable이 모두 폐기돼요. 다음 두 조건이 모두 성립해야 화면도 정상 해제돼요.

1. 화면 수명에 속한 구독이 화면의 DisposeBag에 들어 있어요.
2. 구독 클로저가 화면을 강하게 캡처해 `화면 → bag → 구독 → 화면` 순환을 만들지 않아요.

```swift
viewModel.title
  .subscribe(with: self) { owner, title in
    owner.titleLabel.text = title
  }
  .disposed(by: disposeBag)
```

`subscribe(with:)`나 `withUnretained`는 소유자를 비보유로 전달할 때 유용해요. 비동기 이벤트가 owner 해제 뒤 조용히 무시돼도 되는지 도메인 의미를 함께 확인하세요.

## DisposeBag을 교체하면 이전 묶음을 한 번에 취소해요

재사용 셀이나 다시 바인딩되는 화면은 bag을 교체할 수 있어요.

```swift
final class ProductCell: UITableViewCell {
  var disposeBag = DisposeBag()

  override func prepareForReuse() {
    super.prepareForReuse()
    disposeBag = DisposeBag()
  }
}
```

기존 bag의 참조가 사라지면서 이전 모델에 연결된 구독이 폐기돼요. 화면이 다시 나타날 때마다 bag을 바꾸는 패턴을 쓴다면, 고정 구독까지 중복 생성하지 않는지 확인하세요.

## 상황별 Disposable 타입을 구분해요

| 타입                         | 핵심 동작                                                    | 대표 상황                        |
| ---------------------------- | ------------------------------------------------------------ | -------------------------------- |
| `BooleanDisposable`          | 폐기 여부를 `isDisposed`로 확인하는 단순 토큰이에요.         | 사용자 정의 작업의 취소 플래그   |
| `SingleAssignmentDisposable` | 기반 Disposable을 한 번만 나중에 지정할 수 있어요.           | 구독 생성 중 재진입 가능한 구현  |
| `SerialDisposable`           | 새 Disposable을 대입하면 이전 것을 즉시 폐기해요.            | 최신 요청 하나만 유지            |
| `CompositeDisposable`        | 여러 Disposable을 동적으로 추가·제거하고 함께 폐기해요.      | 작업 집합의 부분 취소            |
| `RefCountDisposable`         | 기본 자원과 모든 종속 토큰이 폐기된 뒤 실제 자원을 정리해요. | 여러 소비자가 공유하는 기반 자원 |
| `ScheduledDisposable`        | 지정한 Scheduler에서 기반 Disposable을 폐기해요.             | 해제 스레드 제약이 있는 자원     |
| `DisposeBag`                 | 자신이 deinit될 때 보관한 모든 Disposable을 폐기해요.        | 객체 수명에 맞춘 일반 구독 관리  |
| `Disposables.create`         | 하나 이상의 정리 클로저·Disposable을 하나의 토큰으로 묶어요. | 사용자 정의 Observable 정리      |

앱 코드에서는 대부분 DisposeBag으로 충분하고, 나머지는 인프라나 사용자 정의 연산자에서 더 자주 사용해요.

## SerialDisposable로 최신 작업을 교체해요

```swift
let currentRequest = SerialDisposable()

currentRequest.disposable = api
  .search(query: "Swift")
  .subscribe(onNext: { print($0) })

currentRequest.disposable = api
  .search(query: "RxSwift")
  .subscribe(onNext: { print($0) })
```

두 번째 Disposable을 대입하는 순간 첫 번째 구독이 폐기돼요. 검색 입력처럼 최신 작업만 필요할 때 쓸 수 있지만, 보통 `flatMapLatest`가 값 흐름과 취소 관계를 더 선언적으로 보여 줘요.

SerialDisposable 자체를 이미 폐기한 뒤 새 Disposable을 대입하면 새 값도 즉시 폐기돼요. 소유 객체가 끝난 뒤 작업이 다시 살아나지 않는다는 장점이 있어요.

## CompositeDisposable은 동적 작업 집합을 관리해요

```swift
let subscriptions = CompositeDisposable()

subscriptions.insert(
  notifications.subscribe(onNext: { print($0) })
)
subscriptions.insert(
  locationUpdates.subscribe(onNext: { print($0) })
)

subscriptions.dispose()
```

각 `insert`가 돌려주는 키를 보관하면 특정 Disposable만 `remove(for:)`로 제거하고 폐기할 수 있어요. 고정된 구독 묶음이라면 DisposeBag이 더 단순하고, 실행 중 구독이 자주 추가·제거되는 관리자라면 CompositeDisposable이 어울려요.

## 사용자 정의 Observable은 실제 자원을 정리해요

```swift
let observable = Observable<Void>.create { observer in
  let token = NotificationCenter.default.addObserver(
    forName: UIApplication.didBecomeActiveNotification,
    object: nil,
    queue: nil
  ) { _ in
    observer.onNext(())
  }

  return Disposables.create {
    NotificationCenter.default.removeObserver(token)
  }
}
```

빈 `Disposables.create()`만 반환하면 구독 객체는 정리돼도 NotificationCenter observer 같은 외부 자원은 남을 수 있어요. Timer, URLSessionTask, 파일 핸들, delegate 등록마다 대응하는 취소·해제 동작을 연결하세요.

## Resources.total로 개발 중 누수를 추적해요

공식 `Resources.total`은 Observable, Observer, Disposable 등 내부 Rx 자원 할당 수를 세어 개발 중 누수 신호를 찾는 데 사용할 수 있어요. `TRACE_RESOURCES` 빌드 플래그가 필요한 구성인지 프로젝트의 RxSwift 통합 방식을 확인하세요.

일반적인 검사는 다음과 같아요.

1. 테스트할 화면 진입 전 `Resources.total`을 기록해요.
2. 화면에 들어가 이벤트를 발생시켜요.
3. 화면을 닫고 비동기 정리가 끝난 뒤 다시 기록해요.
4. 진입·종료를 반복할 때 기준값이 계속 증가하는지 관찰해요.

수치가 즉시 같아야 한다고 단정하지 마세요. 전역 공유 시퀀스, 캐시, 비동기 정리처럼 의도적으로 오래 사는 자원도 있으므로 반복 실행의 추세와 객체 메모리 그래프를 함께 봐야 해요.

## 자주 하는 실수

- `subscribe`가 반환한 Disposable을 사용하지 않아요.
- 전역 DisposeBag에 화면 구독을 넣어 화면보다 오래 유지해요.
- `[weak self]`만 붙이면 기반 네트워크 작업도 자동 취소된다고 생각해요.
- DisposeBag 안의 구독 클로저가 bag 소유자를 강하게 잡아요.
- `dispose()`가 정상 완료 콜백을 호출한다고 기대해요.
- 사용자 정의 Observable이 등록한 외부 observer와 timer를 정리하지 않아요.

## 적용 체크리스트

- 구독의 소유자와 기대 수명을 한 문장으로 설명할 수 있나요?
- 끝나지 않는 스트림이 반드시 Disposable에 연결되나요?
- 객체 수명, 최신 작업, 동적 작업 집합 중 맞는 컨테이너를 골랐나요?
- 폐기할 때 실제 기반 작업도 취소되나요?
- 클로저 캡처 그래프에 순환이 없나요?
- 반복 진입 테스트에서 Rx 자원과 객체 수가 계속 증가하지 않나요?

## 면접에서 이어질 수 있는 질문

### DisposeBag과 CompositeDisposable은 무엇이 다른가요?

DisposeBag은 자신의 deinit 시점에 내부 구독을 모두 폐기하는 객체 수명 컨테이너예요. CompositeDisposable은 실행 중 개별 Disposable을 키로 추가·제거하고 명시적으로 전체 폐기할 수 있는 동적 집합이에요.

### 약한 캡처와 dispose는 같은 문제를 해결하나요?

아니요. 약한 캡처는 객체 참조 순환을 막고, dispose는 이벤트 연결과 기반 작업을 중단해요. 안전한 수명 관리를 위해 둘 다 필요한 경우가 많아요.

## 참고 자료

- [RxSwift Disposables 공식 API](https://docs.rxswift.org/rxswift/disposables)
- [DisposeBag 공식 API](https://docs.rxswift.org/classes/disposebag)
- [Disposable 공식 API](https://docs.rxswift.org/protocols/disposable)
- [RxSwift Warnings](https://github.com/ReactiveX/RxSwift/blob/6.10.2/Documentation/Warnings.md)
- [Resources 공식 API](https://docs.rxswift.org/enums/resources)
