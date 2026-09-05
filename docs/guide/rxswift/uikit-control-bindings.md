---
title: RxCocoa UIKit 컨트롤 바인딩 모음
description: UIButton부터 UITextField, UISwitch, UIScrollView, UINavigationController, WKWebView까지 RxCocoa가 제공하는 UIKit 입력·출력 API를 역할별로 정리합니다.
source: https://github.com/ReactiveX/RxSwift/tree/6.10.2/RxCocoa/iOS
reviewed: '2026-09-06'
---

# RxCocoa UIKit 컨트롤 바인딩 모음

> **면접 답변 한 줄 요약:** RxCocoa의 UIKit 확장은 target-action·delegate·KVO 속성을 ControlEvent, ControlProperty, Binder, Observable로 변환하므로 값의 방향과 replay 규칙을 확인해 선택해야 해요.

RxCocoa는 UIKit의 모든 API를 Rx로 다시 만들지 않아요. 반복적으로 관찰하거나 바인딩할 가치가 있는 속성과 사건을 `.rx` 아래에 제공하고, 반환값이 필요한 delegate 메서드나 명령형 화면 전환은 UIKit API를 그대로 쓰기도 해요.

## 버튼과 기본 컨트롤

| UIKit 타입                | 대표 Rx source                  | 대표 Rx sink                      |
| ------------------------- | ------------------------------- | --------------------------------- |
| `UIButton`                | `tap`                           | `title()`, `image()`, `isEnabled` |
| `UIBarButtonItem`         | `tap`                           | `isEnabled`                       |
| `UISwitch`                | `isOn`, `value`                 | 같은 ControlProperty sink         |
| `UISlider`                | `value`                         | 같은 ControlProperty sink         |
| `UIStepper`               | `value`                         | 같은 ControlProperty sink         |
| `UISegmentedControl`      | `selectedSegmentIndex`, `value` | 같은 ControlProperty sink         |
| `UIDatePicker`            | `date`                          | 같은 ControlProperty sink         |
| `UIRefreshControl`        | `controlEvent(.valueChanged)`   | `isRefreshing`                    |
| `UIActivityIndicatorView` | 해당 없음                       | `isAnimating`                     |

```swift
submitButton.rx.tap
  .withLatestFrom(formState)
  .bind(to: viewModel.submit)
  .disposed(by: disposeBag)

viewModel.canSubmit
  .drive(submitButton.rx.isEnabled)
  .disposed(by: disposeBag)

viewModel.isLoading
  .drive(activityIndicator.rx.isAnimating)
  .disposed(by: disposeBag)
```

컨트롤 source는 보통 메인 Scheduler에서 사용자 사건을 내보내고, Binder는 메인에서 UI를 갱신해요.

## 텍스트 입력 컨트롤

| UIKit 타입           | 대표 API                                                          |
| -------------------- | ----------------------------------------------------------------- |
| `UITextField`        | `text`, `attributedText`, `controlEvent`, `isEditing` 관련 바인딩 |
| `UITextView`         | `text`, `attributedText`, `didBeginEditing`, `didEndEditing` 등   |
| `UISearchBar`        | `text`, `value`, `textDidChange`, 검색·취소 버튼 사건             |
| `UISearchController` | `isActive`, presentation·dismiss 관련 delegate 사건               |
| `NSTextStorage`      | 편집 처리와 layout manager 관련 이벤트                            |

```swift
let query = searchBar.rx.text.orEmpty
  .debounce(
    .milliseconds(300),
    scheduler: MainScheduler.instance
  )
  .distinctUntilChanged()

query
  .bind(to: viewModel.query)
  .disposed(by: disposeBag)
```

`orEmpty`는 `String?`을 빈 문자열 기본값으로 바꿔요. nil과 빈 문자열이 도메인에서 다른 의미라면 무조건 사용하지 말고 Optional을 유지하세요.

## UIScrollView 계열의 공통 API

UITableView와 UICollectionView는 UIScrollView delegate 프록시를 기반으로 공통 이벤트를 사용할 수 있어요.

| API                            | 의미                             |
| ------------------------------ | -------------------------------- |
| `contentOffset`                | 현재 스크롤 위치 ControlProperty |
| `contentSize`                  | 콘텐츠 크기 변화                 |
| `contentInset`                 | 콘텐츠 inset 변화                |
| `didScroll`                    | 스크롤 delegate 사건             |
| `willBeginDragging`            | 드래그 시작                      |
| `didEndDragging`               | 감속 여부와 함께 드래그 종료     |
| `didEndDecelerating`           | 감속 종료                        |
| `isDragging`, `isDecelerating` | 현재 스크롤 상태                 |

```swift
scrollView.rx.contentOffset
  .map { $0.y > 200 }
  .distinctUntilChanged()
  .bind(to: floatingButton.rx.isHidden)
  .disposed(by: disposeBag)
```

고빈도 스크롤 이벤트에서 레이아웃 계산과 네트워크 요청을 직접 실행하지 마세요. 필요한 값만 map하고 `distinctUntilChanged`, `throttle`을 의미에 맞게 적용하세요.

## 선택과 표시 수명 이벤트

UITableView와 UICollectionView는 다음과 같은 ControlEvent를 제공해요.

- `itemSelected`, `itemDeselected`
- `modelSelected`, `modelDeselected`
- `willDisplayCell`, `didEndDisplayingCell`
- accessory button, highlight, supplementary view 관련 이벤트
- iOS 10 이상 prefetch와 cancel prefetch 이벤트

```swift
collectionView.rx.modelSelected(Product.self)
  .bind(to: viewModel.selectProduct)
  .disposed(by: disposeBag)

collectionView.rx.prefetchItems
  .bind(to: imageLoader.prefetch)
  .disposed(by: disposeBag)
```

`modelSelected`는 `rx.items` 또는 `SectionedViewDataSourceType`을 구현한 data source가 모델 조회를 제공할 때 사용할 수 있어요. 일반 UIKit data source를 직접 설정했다면 모델 매핑을 별도로 관리하세요.

## 제스처를 관찰해요

RxCocoa는 `UIGestureRecognizer.rx.event`로 인식기 자체를 내보내요.

```swift
let tapGesture = UITapGestureRecognizer()
contentView.addGestureRecognizer(tapGesture)

tapGesture.rx.event
  .filter { $0.state == .recognized }
  .subscribe(onNext: { gesture in
    print(gesture.location(in: gesture.view))
  })
  .disposed(by: disposeBag)
```

RxCocoa는 기본 UIGestureRecognizer 연결을 제공하지만 여러 제스처 조합과 편의 연산자를 제공하는 외부 RxGesture 라이브러리와는 범위가 달라요.

## 내비게이션과 탭 UI

| 타입                     | 관찰 가능한 대표 사건                    |
| ------------------------ | ---------------------------------------- |
| `UINavigationController` | willShow, didShow와 delegate 프록시      |
| `UITabBar`               | 항목 선택·customizing 관련 delegate 사건 |
| `UITabBarController`     | View Controller 선택과 delegate 사건     |

화면 전환 명령 자체를 무조건 Binder로 감쌀 필요는 없어요. View Model은 `Signal<Route>`처럼 전환 의도만 내보내고 View Controller가 UIKit 내비게이션을 수행하면 책임이 선명해요.

```swift
viewModel.route
  .emit(with: self) { owner, route in
    owner.router.navigate(route)
  }
  .disposed(by: disposeBag)
```

## WKWebView 상태와 내비게이션 사건

RxCocoa의 WKWebView 확장은 KVO 상태와 `WKNavigationDelegate` 프록시를 제공해요.

| 종류            | 대표 값                                                     |
| --------------- | ----------------------------------------------------------- |
| 페이지 상태     | `title`, `url`, `isLoading`, `estimatedProgress`            |
| 이동 가능 여부  | `canGoBack`, `canGoForward`                                 |
| 내비게이션 사건 | didStart, didCommit, didFinish, provisional·navigation 실패 |

```swift
webView.rx.estimatedProgress
  .map(Float.init)
  .bind(to: progressView.rx.progress)
  .disposed(by: disposeBag)

webView.rx.title
  .bind(to: titleLabel.rx.text)
  .disposed(by: disposeBag)
```

인증 challenge나 정책 결정처럼 delegate 반환 completion handler가 필요한 동작은 단순 관찰 이벤트만으로 처리할 수 있는지 확인하고, 필요하면 실제 WKNavigationDelegate를 함께 설치하세요.

## UIApplication 사건

UIApplication 확장은 앱 상태와 메모리 경고 같은 시스템 사건을 Observable로 연결해요. 시스템 Notification을 직접 사용할 수도 있으므로 팀에서 한 접근을 정하고 중복 구독하지 마세요.

앱 생명 주기를 영구 Relay 하나로 다시 방송하기보다 필요한 화면·서비스가 적절한 수명으로 구독하도록 설계하세요.

## macOS 바인딩도 별도 제공돼요

RxCocoa에는 `NSButton`, `NSControl`, `NSSlider`, `NSTextField`, `NSTextView`, `NSView`용 확장도 있어요. iOS의 UIKit 타입과 이름이 같다고 가정하지 말고 플랫폼 조건과 반환 Trait을 확인하세요.

## UIKit API를 그대로 쓰는 편이 나은 경우

- 한 번만 값을 설정하고 이후 변화가 없어요.
- delegate 반환값으로 동기 정책을 결정해야 해요.
- Rx로 바꾸면 작은 명령 하나가 여러 Relay와 바인딩을 거쳐야 해요.
- Swift Concurrency 기반 화면과 섞을 이유가 없어요.
- RxCocoa가 해당 API를 제공하지 않아 런타임 interception이 지나치게 복잡해져요.

RxCocoa는 UIKit을 대체하는 프레임워크가 아니라 반복되는 비동기 UI 연결을 조합 가능하게 만드는 adapter예요.

## 자주 하는 실수

- Optional 의미를 확인하지 않고 모든 text에 `orEmpty`를 적용해요.
- 스크롤 이벤트마다 무거운 동기 작업을 실행해요.
- `modelSelected`를 Rx data source 없이 사용해요.
- 화면 이동 사건을 Driver로 replay해 같은 화면을 다시 열어요.
- RxCocoa가 UIKit의 모든 delegate 반환 정책을 자동 처리한다고 생각해요.
- 셀 재사용 시 이전 모델 구독을 폐기하지 않아요.

## 적용 체크리스트

- 사용할 API가 source, sink, 양방향 속성 중 무엇인지 확인했나요?
- 상태는 Driver, 사건은 Signal이라는 replay 기준을 검토했나요?
- 고빈도 이벤트에서 필요한 값만 추출하고 중복을 줄였나요?
- table·collection 모델 매핑이 data source와 일치하나요?
- delegate 반환값이 필요한 기능의 소유자가 명확한가요?
- 컨트롤과 셀의 DisposeBag 수명이 올바른가요?

## 면접에서 이어질 수 있는 질문

### RxCocoa가 모든 UIKit API를 제공하나요?

아니요. 자주 쓰는 속성·target-action·delegate 사건을 Rx로 제공하지만, 반환값이 필요한 delegate 정책이나 명령형 API는 직접 UIKit으로 처리하거나 별도 adapter가 필요해요.

### ControlProperty에 값을 bind하면 사용자 이벤트도 다시 발생하나요?

일반적으로 property setter는 값을 설정할 뿐 동일한 UIControl event를 자동 발생시키지 않아요. 하지만 사용자 정의 컨트롤은 구현이 다를 수 있으므로 양방향 흐름의 순환 여부를 확인해야 해요.

## 참고 자료

- [RxCocoa iOS 공식 소스](https://github.com/ReactiveX/RxSwift/tree/6.10.2/RxCocoa/iOS)
- [UIButton Rx 구현](https://github.com/ReactiveX/RxSwift/blob/6.10.2/RxCocoa/iOS/UIButton%2BRx.swift)
- [UIScrollView Rx 구현](https://github.com/ReactiveX/RxSwift/blob/6.10.2/RxCocoa/iOS/UIScrollView%2BRx.swift)
- [UIGestureRecognizer Rx 구현](https://github.com/ReactiveX/RxSwift/blob/6.10.2/RxCocoa/iOS/UIGestureRecognizer%2BRx.swift)
- [WKWebView Rx 구현](https://github.com/ReactiveX/RxSwift/blob/6.10.2/RxCocoa/iOS/WKWebView%2BRx.swift)
