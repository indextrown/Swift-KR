---
title: RxCocoa 공개 프로토콜과 오류
description: RxCocoa 6.10.2의 Control·SharedSequence·DelegateProxy·DataSource·KVO 공개 계약과 오류 타입, SharingScheduler 테스트 방법을 설명합니다.
source: https://github.com/ReactiveX/RxSwift/tree/6.10.2/RxCocoa
reviewed: '2026-09-19'
---

# RxCocoa 공개 프로토콜과 오류

> **면접 답변 한 줄 요약:** RxCocoa의 공개 프로토콜은 UI 입력·공유 시퀀스·delegate와 data source의 연결 규칙을 표현하고, 오류 타입은 바인딩·KVO·런타임 가로채기·HTTP 실패 지점을 구분해요.

RxCocoa의 일반 사용자는 `button.rx.tap`, `textField.rx.text`, `Driver`만으로도 화면을 연결할 수 있어요. 사용자 정의 UI Trait, delegate proxy, data source adapter를 만들거나 런타임 오류를 진단하려면 그 아래의 공개 프로토콜과 오류 계층을 알아야 해요.

이 문서는 RxCocoa 6.10.2 공식 소스에서 기존 컨트롤·리스트·Foundation 문서가 사용법 위주로 다루느라 이름을 생략했던 공개 계약을 정리해요. 프레임워크 확장용 API와 일반 화면 코드용 API를 구분하는 것이 목표예요.

## 먼저 알아둘 용어

| 용어                | 뜻                                                                                                      |
| ------------------- | ------------------------------------------------------------------------------------------------------- |
| Trait               | Observable이 지켜야 할 오류, 실행 문맥, 공유 규칙을 타입으로 표현한 래퍼예요.                           |
| 공유 전략           | 여러 Subscriber가 하나의 업스트림을 어떻게 공유하고 최근 값을 replay할지 정하는 정책이에요.             |
| delegate proxy      | UIKit 객체가 하나만 가질 수 있는 delegate 호출을 Observable과 기존 delegate 양쪽에 전달하는 중계자예요. |
| data source adapter | Observable의 새 모델을 UIKit data source 메서드 호출로 바꾸는 객체예요.                                 |
| KVO                 | Key-Value Observing의 약자로, Objective-C 호환 속성 변화를 런타임에서 관찰하는 기능이에요.              |
| swizzling           | Objective-C 런타임에서 메서드 구현을 바꾸거나 가로채는 기법이에요.                                      |

## Control Trait 프로토콜은 구체 래퍼로 돌아오는 계약이에요

| 프로토콜              | 상속 관계                        | 핵심 요구사항                                            |
| --------------------- | -------------------------------- | -------------------------------------------------------- |
| `ControlEventType`    | `ObservableType`                 | `asControlEvent()`로 `ControlEvent<Element>`를 반환해요. |
| `ControlPropertyType` | `ObservableType`, `ObserverType` | `asControlProperty()`로 읽기·쓰기 Trait을 반환해요.      |

이 프로토콜을 채택한다고 메인 Scheduler, 무오류, 해제 시 완료 규칙이 자동으로 생기지는 않아요. 공식 소스도 생성자에 전달하는 Observable이 계약을 만족하도록 **구현자가 책임져야 한다고** 설명해요.

```swift
let editingEnded = ControlEvent(
  events: textField.rx.controlEvent(.editingDidEnd)
)
```

기존 RxCocoa 바인딩이 이미 `ControlEvent`나 `ControlProperty`를 돌려준다면 다시 감쌀 필요가 없어요. 사용자 정의 UIKit 컴포넌트의 공개 반응형 API가 같은 UI 계약을 가져야 할 때만 이 타입을 고려하세요.

## SharedSequence는 전략을 타입 매개변수로 받아요

```text
SharingStrategyProtocol
        │
        ├─ DriverSharingStrategy ─▶ Driver<Element>
        └─ SignalSharingStrategy ─▶ Signal<Element>

SharedSequenceConvertibleType ─▶ SharedSequence<Strategy, Element>
```

| 공개 타입                       | 역할                                                         |
| ------------------------------- | ------------------------------------------------------------ |
| `SharingStrategyProtocol`       | 이벤트를 전달할 Scheduler와 업스트림 공유 함수를 정의해요.   |
| `SharedSequenceConvertibleType` | 자신을 특정 전략의 `SharedSequence`로 바꾸는 계약이에요.     |
| `DriverSharingStrategy`         | 메인 Scheduler, 최신 값 1개 replay, 연결 중 공유를 적용해요. |
| `SignalSharingStrategy`         | 메인 Scheduler, replay 없음, 연결 중 공유를 적용해요.        |
| `SharingScheduler`              | 내장 SharedSequence 전략이 사용할 Scheduler를 제공해요.      |

`Driver`와 `Signal`은 별도 클래스가 아니라 각각 전략이 정해진 `SharedSequence` 타입 별칭이에요. 일반 앱에서 새 공유 전략을 만드는 것보다 Driver·Signal·Infallible·Observable 가운데 실제 계약에 맞는 타입을 선택하는 편이 단순해요.

### SharingScheduler.mock으로 Driver 시간을 테스트해요

`SharingScheduler.mock`은 테스트 범위에서 내장 SharedSequence의 기본 Scheduler를 다른 Scheduler로 바꾸고, 클로저가 끝나면 원래 Scheduler를 복원해요.

```swift
import XCTest
import RxSwift
import RxCocoa
import RxTest

let scheduler = TestScheduler(initialClock: 0)
let disposeBag = DisposeBag()

SharingScheduler.mock(scheduler: scheduler) {
  let observer = scheduler.createObserver(String.self)

  Observable.just("완료")
    .asDriver(onErrorDriveWith: .empty())
    .drive(observer)
    .disposed(by: disposeBag)

  scheduler.start()
  XCTAssertEqual(
    observer.events.compactMap { $0.value.element },
    ["완료"]
  )
}
```

공식 구현은 이 API를 단위 테스트에서만 사용하라고 명시해요. `SharingScheduler`는 정적 전역 상태를 잠시 교체하므로 같은 프로세스에서 이 범위를 병렬 실행하지 않는 편이 안전해요. 제품 코드의 Driver 정책을 바꾸는 설정 API로 사용하지 마세요.

## DelegateProxyType은 설치와 전달 규칙을 정의해요

`DelegateProxyType`은 proxy 생성, UIKit 객체의 현재 delegate 읽기·쓰기, 원래 delegate로의 전달을 정의해요. RxCocoa는 `proxy(for:)`에서 필요하면 proxy를 설치하고 기존 delegate를 forward delegate로 연결해요.

| 공개 계약               | 표현하는 UIKit 형태                                     |
| ----------------------- | ------------------------------------------------------- |
| `HasDelegate`           | `delegate` 속성이 있는 객체                             |
| `HasDataSource`         | `dataSource` 속성이 있는 객체                           |
| `HasPrefetchDataSource` | `prefetchDataSource` 속성이 있는 객체                   |
| `DelegateProxyType`     | 위 속성에 proxy를 설치하고 원래 객체로 호출을 전달해요. |

사용자 정의 proxy는 다음 책임을 함께 져요.

1. 지원할 부모 객체와 delegate 타입을 연결해요.
2. `registerKnownImplementations()`에서 구현을 등록해요.
3. 현재 delegate를 읽고 쓰는 방법을 제공해요.
4. 기존 delegate와 Rx Observer에 호출이 전달되는 순서를 확인해요.
5. UI delegate 설치와 사용을 메인 스레드에서 수행해요.

RxCocoa가 UIKit 표준 컨트롤용 proxy를 이미 제공한다면 직접 구현하지 마세요. 직접 구현은 자체 delegate 기반 컴포넌트를 Rx API로 노출해야 할 때 필요한 프레임워크 확장 작업이에요.

## reactive data source 프로토콜의 역할을 구분해요

| 프로토콜                         | 받는 대상          | 역할                                                     |
| -------------------------------- | ------------------ | -------------------------------------------------------- |
| `RxTableViewDataSourceType`      | `UITableView`      | 새 `Event<Element>`를 table data source에 반영해요.      |
| `RxCollectionViewDataSourceType` | `UICollectionView` | 새 `Event<Element>`를 collection data source에 반영해요. |
| `RxPickerViewDataSourceType`     | `UIPickerView`     | 새 `Event<Element>`를 picker data source에 반영해요.     |
| `SectionedViewDataSourceType`    | section 기반 목록  | `IndexPath`에 해당하는 원본 모델을 반환해요.             |

`SectionedViewDataSourceType.model(at:)`가 있기 때문에 `modelSelected`와 `modelDeselected`가 화면 위치를 실제 모델로 변환할 수 있어요. 아직 items가 바인딩되지 않았다면 `RxCocoaError.itemsNotYetBound`가 발생할 수 있어요.

`RxPickerViewDataSourceProxy`는 `UIPickerViewDataSource`의 필수 메서드를 기존 data source로 전달하는 공개 proxy 구현이에요. 일반 화면에서는 이를 직접 생성하기보다 `pickerView.rx.items(...)`와 공식 adapter를 사용하세요.

## 리스트 사건 별칭은 튜플의 필드 이름을 보존해요

RxCocoa는 자주 쓰는 UIKit delegate 결과에 읽기 쉬운 이름을 붙여요.

| 타입 별칭                   | 실제 튜플                                               |
| --------------------------- | ------------------------------------------------------- |
| `ItemMovedEvent`            | `(sourceIndex: IndexPath, destinationIndex: IndexPath)` |
| `WillDisplayCellEvent`      | `(cell: UITableViewCell, indexPath: IndexPath)`         |
| `DidEndDisplayingCellEvent` | `(cell: UITableViewCell, indexPath: IndexPath)`         |

```swift
tableView.rx.willDisplayCell
  .subscribe(onNext: { event in
    prefetcher.prepare(at: event.indexPath)
  })
  .disposed(by: disposeBag)
```

이 별칭은 새 구조체를 만들지 않아요. 기존 튜플에 의미 있는 필드 이름을 제공하므로 destructuring이나 점 문법으로 읽을 수 있어요.

## TextInput은 텍스트 컨트롤의 공통 표면이에요

`TextInput<Base>`는 원본 텍스트 입력 객체인 `base`와 `ControlProperty<String?>`인 `text`를 묶어요. iOS에서는 `UITextField`와 `UITextView`의 `rx.textInput`이 이 공통 래퍼를 제공해요.

```swift
let input = textView.rx.textInput

input.text.orEmpty
  .distinctUntilChanged()
  .bind(to: viewModel.query)
  .disposed(by: disposeBag)
```

구체 컨트롤의 다른 사건까지 필요하면 `UITextField.rx`나 `UITextView.rx` 확장을 직접 사용하세요. `TextInput`은 텍스트 읽기·쓰기만 공통화하려는 어댑터에 적합해요.

## KVO 표현과 옵션을 RxCocoa 타입으로 연결해요

| 공개 타입                          | 역할                                                      |
| ---------------------------------- | --------------------------------------------------------- |
| `KVORepresentable`                 | Objective-C KVO 값에서 Swift 값으로 변환할 수 있다는 계약 |
| `KeyValueObservingOptions.initial` | 구독 직후 현재 값을 보내요.                               |
| `KeyValueObservingOptions.new`     | 이후의 새 값을 보내요.                                    |

`Int`, `Bool`, `CGRect`처럼 Swift 값과 Objective-C KVO 표현이 다른 경우 `KVORepresentable.KVOType`을 거쳐 변환해요. RxCocoa의 `KeyValueObservingOptions`는 Foundation의 같은 이름을 그대로 노출한 것이 아니라 RxCocoa 관찰 오버로드에 쓰는 별도 옵션 타입이에요.

문자열 key path보다 컴파일러가 확인하는 Swift KeyPath 오버로드를 우선하고, KVO 호환 속성인지 확인하세요. `KVORepresentable`을 채택한다고 임의의 Swift 저장 프로퍼티가 자동으로 KVO 대상이 되지는 않아요.

## RxCocoa 오류를 발생 계층별로 읽어요

### RxCocoaError는 바인딩과 변환 오류예요

| 대표 case                | 뜻                                                       |
| ------------------------ | -------------------------------------------------------- |
| `unknown`                | 구체적으로 분류되지 않은 RxCocoa 오류                    |
| `invalidOperation`       | 대상에 허용되지 않은 작업을 시도했어요.                  |
| `itemsNotYetBound`       | 목록 모델을 요청했지만 아직 items가 바인딩되지 않았어요. |
| `invalidPropertyName`    | KVO 문자열 경로에 해당 속성이 없어요.                    |
| `invalidObjectOnKeyPath` | key path 중간 객체를 관찰할 수 없어요.                   |
| `errorDuringSwizzling`   | 런타임 메서드 교체 중 실패했어요.                        |
| `castingError`           | Objective-C 런타임 값이 기대한 Swift 타입과 달라요.      |

### RxCocoaObjCRuntimeError는 메시지 가로채기 오류예요

`RxCocoaObjCRuntimeError`는 `sentMessage`, `methodInvoked`, weak KVO처럼 Objective-C 런타임을 사용하는 경로에서 발생할 수 있어요. 구현되지 않은 selector, Core Foundation toll-free bridged 객체, 다른 가로채기 라이브러리와의 충돌, 지원하지 않는 반환 타입 등을 구분해요.

`RxCocoaInterceptionMechanism`은 충돌한 방식이 KVO인지 다른 가로채기인지 표시해요. 공식 소스는 같은 객체에서 KVO와 `sentMessage`를 함께 쓸 때 **메시지 관찰을 먼저 설치하고 KVO를 나중에 설치하는 순서**로 충돌을 피할 수 있는 사례를 설명해요. 더 안전한 delegate나 override가 있다면 런타임 가로채기보다 그 경로를 우선하세요.

이 런타임 오류와 가로채기 타입은 swizzling을 비활성화한 빌드나 지원하지 않는 플랫폼에서는 컴파일 범위에서 제외될 수 있어요. iOS에서도 프로젝트가 `DISABLE_SWIZZLING` 설정을 사용하는지 먼저 확인하세요.

### RxCocoaURLError는 URLSession adapter 오류예요

`RxCocoaURLError`는 HTTP 응답이 아니거나, 상태 코드가 `200..<300` 밖이거나, JSON 역직렬화가 실패한 경우를 나눠요. 자세한 요청별 차이는 [Foundation 바인딩](./foundation-bindings#response-data-json의-차이)에서 확인할 수 있어요.

| 오류 타입                 | 주로 확인할 경계                  |
| ------------------------- | --------------------------------- |
| `RxCocoaError`            | UI 바인딩, 모델 조회, KVO 값 변환 |
| `RxCocoaObjCRuntimeError` | selector 가로채기와 swizzling     |
| `RxCocoaURLError`         | URLSession 응답과 HTTP·역직렬화   |

## 자주 하는 실수

- `ControlEventType`을 채택하면 전달 Scheduler와 무오류 규칙도 자동 적용된다고 생각해요.
- `SharingScheduler.mock`을 제품 설정이나 병렬 테스트에서 전역적으로 사용해요.
- 표준 UIKit proxy가 있는데 같은 delegate proxy를 새로 구현해요.
- reactive data source와 UIKit의 실제 data source 책임을 같은 것으로 생각해요.
- `KVORepresentable`을 채택하면 순수 Swift 속성도 자동 관찰된다고 생각해요.
- 모든 RxCocoa 오류를 네트워크 오류 하나로 변환해 실제 실패 계층을 잃어요.

## 적용 체크리스트

- 사용자 정의 Control Trait의 메인 실행·무오류·수명 계약을 직접 보장했나요?
- Driver와 Signal의 공유 전략 차이를 공개 타입에 맞게 선택했나요?
- custom delegate proxy가 정말 필요한 자체 컴포넌트인가요?
- data source가 모델 조회까지 제공해야 하면 `SectionedViewDataSourceType`을 구현했나요?
- 문자열 KVO와 런타임 가로채기보다 타입 안전한 대안을 먼저 확인했나요?
- 오류를 바인딩, 런타임 가로채기, HTTP 계층으로 구분해 기록하나요?

## 면접에서 이어질 수 있는 질문

### ControlEventType을 채택하면 ControlEvent 규칙이 자동 보장되나요?

아니요. 프로토콜은 `asControlEvent()` 변환 표면을 제공할 뿐이에요. 메인 Scheduler 전달, 오류 없음, 컨트롤 해제 시 완료 같은 규칙은 생성자에 넣는 Observable과 구현 코드가 지켜야 해요.

### Driver와 Signal은 어떻게 같은 SharedSequence에서 다른 동작을 하나요?

각각 `DriverSharingStrategy`와 `SignalSharingStrategy`를 타입 매개변수로 사용해요. 두 전략 모두 메인 Scheduler와 무오류 공유를 제공하지만 Driver는 최신 값 1개를 replay하고 Signal은 replay하지 않아요.

### DelegateProxyType을 앱에서 직접 구현해야 하나요?

대부분은 아니에요. RxCocoa가 표준 UIKit 객체용 proxy를 제공하므로 일반 화면에서는 기존 `.rx` API를 사용해요. 직접 구현은 자체 delegate 기반 컴포넌트에 반응형 표면을 제공하는 라이브러리 작업에 가까워요.

## 참고 자료

- [RxCocoa 6.10.2 공개 소스](https://github.com/ReactiveX/RxSwift/tree/6.10.2/RxCocoa)
- [ControlEvent 구현](https://github.com/ReactiveX/RxSwift/blob/6.10.2/RxCocoa/Traits/ControlEvent.swift)
- [ControlProperty 구현](https://github.com/ReactiveX/RxSwift/blob/6.10.2/RxCocoa/Traits/ControlProperty.swift)
- [SharedSequence 구현](https://github.com/ReactiveX/RxSwift/blob/6.10.2/RxCocoa/Traits/SharedSequence/SharedSequence.swift)
- [SharingScheduler 구현](https://github.com/ReactiveX/RxSwift/blob/6.10.2/RxCocoa/Traits/SharedSequence/SchedulerType%2BSharedSequence.swift)
- [DelegateProxyType 구현](https://github.com/ReactiveX/RxSwift/blob/6.10.2/RxCocoa/Common/DelegateProxyType.swift)
- [RxCocoa 오류 구현](https://github.com/ReactiveX/RxSwift/blob/6.10.2/RxCocoa/RxCocoa.swift)
- [RxCocoa Objective-C 런타임 오류 구현](https://github.com/ReactiveX/RxSwift/blob/6.10.2/RxCocoa/Common/RxCocoaObjCRuntimeError%2BExtensions.swift)
- [KVORepresentable 구현](https://github.com/ReactiveX/RxSwift/blob/6.10.2/RxCocoa/Foundation/KVORepresentable.swift)
- [TextInput 구현](https://github.com/ReactiveX/RxSwift/blob/6.10.2/RxCocoa/Common/TextInput.swift)
