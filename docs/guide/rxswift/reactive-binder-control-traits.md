---
title: Reactive, Binder와 Control Traits
description: RxCocoa의 .rx Reactive 프록시, ReactiveCompatible, Binder, ControlProperty, ControlEvent와 UIControl target-action 연결 원리를 공식 구현 기준으로 설명합니다.
source: https://github.com/ReactiveX/RxSwift/tree/6.10.2/RxCocoa
reviewed: '2026-09-06'
---

# Reactive, Binder와 Control Traits

> **면접 답변 한 줄 요약:** RxCocoa의 `.rx`는 원본 객체를 감싼 Reactive 프록시이고, ControlProperty·ControlEvent가 UI 입력을 내보내며 Binder가 오류 없는 값을 메인 Scheduler에서 UI에 적용해요.

`button.rx.tap`과 `label.rx.text`는 겉으로 비슷하지만 같은 종류의 API가 아니에요. 하나는 UI에서 나오는 source이고 다른 하나는 UI로 들어가는 sink예요. 방향과 replay 규칙을 구분해야 순환 바인딩과 오류 종료를 피할 수 있어요.

## ReactiveCompatible과 Reactive를 구분해요

`ReactiveCompatible`을 채택한 타입은 `.rx` 네임스페이스를 얻어요. `Reactive<Base>`는 원본 객체를 `base`에 보관하는 가벼운 프록시예요.

```swift
let reactiveSearchBar: Reactive<UISearchBar> = searchBar.rx
let originalSearchBar: UISearchBar = reactiveSearchBar.base
```

NSObject 계열은 RxCocoa가 호환성을 제공하므로 UIKit 객체에 직접 채택 코드를 쓸 필요가 없어요. 사용자 정의 참조 타입도 ReactiveCompatible을 채택해 `.rx` 확장에 보조 API를 모을 수 있어요.

```swift
final class Player: ReactiveCompatible {
  var volume: Float = 0
}

extension Reactive where Base: Player {
  var volume: Binder<Float> {
    Binder(base) { player, volume in
      player.volume = min(max(volume, 0), 1)
    }
  }
}
```

Reactive 확장은 비즈니스 로직 저장소가 아니라 원본 타입과 Rx 세계를 연결하는 adapter로 유지하세요.

## UI source와 sink를 구분해요

| 방향    | 대표 API                               | 타입                       |
| ------- | -------------------------------------- | -------------------------- |
| UI → Rx | `button.rx.tap`                        | `ControlEvent<Void>`       |
| UI → Rx | `textField.rx.text`                    | `ControlProperty<String?>` |
| Rx → UI | `label.rx.text`                        | `Binder<String?>`          |
| Rx → UI | `button.rx.isEnabled`                  | `Binder<Bool>`             |
| UI ↔ Rx | ControlProperty를 source와 sink로 사용 | `ControlProperty<Element>` |

UI 값을 읽는 것과 UI에 값을 쓰는 것을 같은 Relay로 무조건 양방향 연결하면 피드백 루프가 생길 수 있어요. 사용자 입력과 렌더링 상태를 별도 흐름으로 두고 `distinctUntilChanged()` 같은 동등성 경계를 명시하세요.

## Binder는 오류를 받지 않는 UI Observer예요

```swift
viewModel.title
  .bind(to: titleLabel.rx.text)
  .disposed(by: disposeBag)
```

공식 Binder의 성질은 다음과 같아요.

- 기본적으로 `MainScheduler`에서 바인딩해요.
- 대상 객체를 강하게 보관하지 않아요.
- next 값만 처리하고 error 이벤트를 허용하지 않아요.
- 디버그에서 오류가 들어오면 실패하고 릴리스에서는 오류를 기록해요.

따라서 오류 가능한 Observable은 Binder 전에 사용자 상태로 변환해야 해요.

```swift
profileTitle
  .catch { error in
    logger.record(error)
    return .just("프로필을 불러오지 못했어요")
  }
  .bind(to: titleLabel.rx.text)
  .disposed(by: disposeBag)
```

## 동적 멤버 Binder를 이해해요

Reactive는 참조 타입의 쓰기 가능한 속성을 동적 멤버 Binder로 만들 수 있어요.

```swift
viewModel.isHidden
  .bind(to: emptyView.rx.isHidden)
  .disposed(by: disposeBag)
```

단순 속성 대입에는 편리하지만, 값 변환이나 애니메이션처럼 별도 의미가 있으면 이름 있는 Binder를 만들어 의도를 드러내세요.

```swift
extension Reactive where Base: UIView {
  var animatedVisibility: Binder<Bool> {
    Binder(base) { view, isVisible in
      UIView.animate(withDuration: 0.2) {
        view.alpha = isVisible ? 1 : 0
      }
    }
  }
}
```

## ControlProperty는 현재 값과 사용자 변경을 제공해요

```swift
let text: ControlProperty<String?> = textField.rx.text

text.orEmpty
  .subscribe(onNext: { value in
    print(value)
  })
  .disposed(by: disposeBag)
```

ControlProperty의 공식 계약은 다음과 같아요.

1. 구독하면 현재 값을 먼저 보내요.
2. 이후 사용자 조작으로 생긴 값을 보내요.
3. 컨트롤이 해제되면 완료해요.
4. 오류를 보내지 않아요.
5. 메인 Scheduler에서 구독·관찰해요.
6. 최신 값을 하나 공유하는 성격을 가져요.

현재 값을 건너뛰고 이후 변경만 필요하면 `changed`를 사용해요.

```swift
textField.rx.text.orEmpty.changed
  .subscribe(onNext: { text in
    analytics.recordEdited(text)
  })
  .disposed(by: disposeBag)
```

`textField.text = "새 값"`처럼 코드로 속성을 바꿨다고 사용자 control event가 항상 발생하는 것은 아니에요. 상태 입력은 View Model이나 Relay의 명시적인 메서드로 전달하세요.

## ControlEvent는 초기값 없는 UI 사건이에요

```swift
let tap: ControlEvent<Void> = submitButton.rx.tap

tap
  .subscribe(onNext: {
    print("제출")
  })
  .disposed(by: disposeBag)
```

ControlEvent는 오류와 초기 replay가 없고, 컨트롤 해제 시 완료하며, 메인 Scheduler에서 구독·관찰해요. 탭·선택·편집 시작처럼 현재 상태가 아닌 순간 사건에 적합해요.

## UIControl은 target-action을 Rx로 연결해요

```swift
slider.rx.controlEvent(.valueChanged)
  .withLatestFrom(slider.rx.value)
  .subscribe(onNext: { value in
    print("볼륨:", value)
  })
  .disposed(by: disposeBag)
```

RxCocoa의 ControlTarget이 UIKit target-action 등록을 관리하고, 구독이 폐기되면 연결을 정리해요. 컨트롤별 확장은 이를 이용해 `tap`, `value`, `isOn` 같은 타입 안전한 API를 제공해요.

## 양방향 바인딩은 순환을 점검해요

```swift
textField.rx.text.orEmpty
  .distinctUntilChanged()
  .bind(to: queryRelay)
  .disposed(by: disposeBag)

queryRelay
  .distinctUntilChanged()
  .bind(to: textField.rx.text)
  .disposed(by: disposeBag)
```

ControlProperty의 setter가 동일한 사용자 event를 다시 발생시키지 않는 경우가 많지만, 모든 사용자 정의 컨트롤이 같은 것은 아니에요. 두 방향의 변환이 비대칭이거나 값 정규화가 반복되면 루프가 생길 수 있으므로 한쪽을 상태의 단일 소유자로 정하는 편이 안전해요.

## 타입 선택 기준

| 질문                                       | 선택              |
| ------------------------------------------ | ----------------- |
| 컨트롤의 현재 값과 이후 변경이 필요한가요? | `ControlProperty` |
| 지금 발생한 UI 사건만 필요한가요?          | `ControlEvent`    |
| Observable 값을 UI 속성에 적용하나요?      | `Binder`          |
| 여러 UI가 소비할 View Model 상태인가요?    | `Driver`          |
| replay하면 안 되는 View Model 사건인가요?  | `Signal`          |

## 자주 하는 실수

- source와 sink 방향을 구분하지 않고 양방향 연결해요.
- 오류 가능한 Observable을 Binder에 직접 연결해요.
- ControlProperty가 코드로 바꾼 모든 속성 변경을 event로 보낸다고 생각해요.
- Binder 안에 네트워크 요청과 상태 전이를 넣어요.
- UI 구독을 백그라운드에서 만들고 초기 replay 위치를 놓쳐요.

## 적용 체크리스트

- UI 값이 상태인지 사건인지 구분했나요?
- Binder 이전에 오류를 처리했나요?
- 사용자 정의 Reactive API가 adapter 역할만 하나요?
- 양방향 바인딩의 단일 상태 소유자와 중복 제거 기준이 있나요?
- 컨트롤과 구독의 수명이 DisposeBag에 연결됐나요?

## 면접에서 이어질 수 있는 질문

### `.rx`가 원본 객체를 바꾸나요?

아니요. `Reactive<Base>`가 원본 객체를 base로 감싸고 확장 API를 제공해요. 원본 타입의 별도 복사본이나 subclass를 만드는 것은 아니에요.

### Binder가 대상을 강하게 잡지 않는 이유는 무엇인가요?

구독이 Binder 대상 UI를 불필요하게 연장하지 않게 해 참조 순환 가능성을 줄이기 위해서예요. 구독 자체의 수명 관리는 여전히 DisposeBag으로 해야 해요.

## 참고 자료

- [Reactive 공식 API](https://docs.rxswift.org/structs/reactive)
- [Binder 공식 API](https://docs.rxswift.org/structs/binder)
- [ControlProperty 구현](https://github.com/ReactiveX/RxSwift/blob/6.10.2/RxCocoa/Traits/ControlProperty.swift)
- [ControlEvent 구현](https://github.com/ReactiveX/RxSwift/blob/6.10.2/RxCocoa/Traits/ControlEvent.swift)
- [UIControl Rx 구현](https://github.com/ReactiveX/RxSwift/blob/6.10.2/RxCocoa/iOS/UIControl%2BRx.swift)
