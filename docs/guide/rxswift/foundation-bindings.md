---
title: RxCocoa Foundation 바인딩
description: NotificationCenter, URLSession, NSObject KVO·메서드 interception·deallocated 등 RxCocoa Foundation 확장의 구독 수명, 오류와 swizzling 주의점을 설명합니다.
source: https://github.com/ReactiveX/RxSwift/tree/6.10.2/RxCocoa/Foundation
reviewed: '2026-09-06'
---

# RxCocoa Foundation 바인딩

> **면접 답변 한 줄 요약:** RxCocoa는 NotificationCenter observer, URLSession task, KVO와 Objective-C 메시지를 Observable로 감싸며, dispose에서 등록을 해제하고 KVO 소유 관계·swizzling·구독별 네트워크 실행을 호출자가 이해해야 해요.

RxCocoa는 UIKit뿐 아니라 Foundation 객체도 `.rx`로 연결해요. 이 API들은 기존 시스템 메커니즘을 감싼 것이므로 KVO와 NotificationCenter의 수명, URLSession의 HTTP 오류 기준이 사라지는 것은 아니에요.

## NotificationCenter를 Observable로 바꿔요

```swift
NotificationCenter.default.rx
  .notification(UIApplication.didEnterBackgroundNotification)
  .subscribe(onNext: { notification in
    print(notification.name)
  })
  .disposed(by: disposeBag)
```

`notification(_:object:)`는 이름과 선택적 발신 객체로 알림을 필터링해요. 구독할 때 NotificationCenter observer를 등록하고 dispose할 때 제거해요.

```swift
NotificationCenter.default.rx
  .notification(
    .NSManagedObjectContextDidSave,
    object: context
  )
  .subscribe(onNext: { notification in
    merger.merge(notification)
  })
  .disposed(by: disposeBag)
```

전달 Scheduler는 알림을 게시한 실행 문맥을 따라갈 수 있어요. UI를 갱신한다면 Driver로 변환하거나 MainScheduler로 이동하세요.

## URLSession 요청은 구독마다 시작해요

```swift
let request = URLRequest(
  url: URL(string: "https://example.com/profile")!
)

let data = URLSession.shared.rx.data(request: request)

data
  .decode(type: Profile.self, decoder: JSONDecoder())
  .subscribe(onNext: { profile in
    print(profile.name)
  })
  .disposed(by: disposeBag)
```

공식 구현은 Observable을 호출할 때가 아니라 **구독할 때** data task를 만들고 시작해요. Subscriber가 둘이면 요청도 둘이에요. dispose하면 `URLSessionTask.cancel()`을 호출해요.

```swift
let sharedProfile = URLSession.shared.rx
  .data(request: request)
  .decode(type: Profile.self, decoder: JSONDecoder())
  .share(replay: 1, scope: .whileConnected)
```

하나의 화면에서 같은 응답을 여러 UI가 쓸 때만 적절한 범위로 공유하세요. 서로 다른 호출자가 독립 재시도·취소를 원하면 요청도 분리해야 해요.

## response, data, json의 차이

| API                  | 출력                      | HTTP 상태 처리                                           |
| -------------------- | ------------------------- | -------------------------------------------------------- |
| `response(request:)` | `(HTTPURLResponse, Data)` | HTTP 응답인지 확인하지만 상태 코드 실패는 직접 판단해요. |
| `data(request:)`     | `Data`                    | `200..<300`이 아니면 `RxCocoaURLError`로 실패해요.       |
| `json(request:)`     | `Any`                     | data 검사 뒤 JSONSerialization으로 역직렬화해요.         |
| `json(url:)`         | `Any`                     | GET URL 편의 API예요.                                    |

Codable 모델에는 `json`의 `Any`보다 `data`와 `decode` 조합이 타입 안전해요.

```swift
URLSession.shared.rx
  .response(request: request)
  .map { response, data in
    guard response.statusCode == 304 else {
      return data
    }
    return cache.data
  }
```

`response`를 사용할 때는 허용할 상태 코드를 호출자가 직접 검증해야 해요.

## URL 요청 로그에 민감 정보를 남기지 않아요

RxCocoa는 `URLSession.rx.shouldLogRequest`로 요청을 curl 형태로 출력할지 정해요. 공식 기본 구현은 DEBUG에서 true예요.

```swift
URLSession.rx.shouldLogRequest = { request in
  request.url?.host == "staging.example.com"
}
```

Authorization, Cookie, 개인 데이터가 포함된 body가 로그에 노출될 수 있으므로 운영·공유 로그 정책을 반드시 확인하세요.

## 타입 안전한 KeyPath KVO를 사용해요

```swift
player.rx
  .observe(\.status)
  .distinctUntilChanged()
  .subscribe(onNext: { status in
    print(status)
  })
  .disposed(by: disposeBag)
```

Swift KeyPath 오버로드는 기본 `.new`, `.initial` 옵션으로 현재 값과 이후 변화를 내보내고 대상이 해제되면 완료해요. 해당 속성이 KVO 호환인지 확인해야 해요.

## 문자열 KeyPath와 소유 관계를 이해해요

```swift
view.rx
  .observe(
    CGRect.self,
    "layer.bounds",
    retainSelf: true
  )
  .subscribe(onNext: { bounds in
    print(bounds as Any)
  })
  .disposed(by: disposeBag)
```

공식 구현은 문자열 경로의 `observe`에 대해 다음 기준을 설명해요.

- 자식 객체를 관찰하는 경로는 대상을 유지하는 것이 필요한 경우가 많아요.
- 부모 방향의 경로는 `retainSelf: false`가 필요할 수 있어요.
- 경로 안에 weak 속성이 있거나 소유 관계를 모르면 단순 observe는 안전하지 않을 수 있어요.
- 문자열 오타는 컴파일러가 검증하지 못해요.

가능하면 타입 안전한 Swift KeyPath API를 우선 사용하세요.

## `observeWeakly`는 swizzling 비용이 있어요

```swift
controller.rx
  .observeWeakly(
    String.self,
    "child.title"
  )
  .subscribe(onNext: { title in
    print(title as Any)
  })
  .disposed(by: disposeBag)
```

`observeWeakly`는 관찰 대상을 유지하지 않고 weak 속성과 임의 소유 그래프를 다룰 수 있지만, 객체의 dealloc을 감지하기 위해 Objective-C runtime swizzling이 필요해요. 여러 라이브러리가 같은 dealloc을 swizzle하거나 swizzling이 비활성화된 빌드에서는 제약을 확인해야 해요.

## 객체 해제를 이벤트로 받아요

```swift
viewController.rx.deallocated
  .subscribe(onNext: {
    print("화면 해제")
  })
  .disposed(by: disposeBag)
```

`deallocated`는 객체가 해제된 뒤 Void 하나를 보내고 완료해요. `take(until: object.rx.deallocated)`처럼 구독 수명을 객체와 연결할 수 있어요.

```swift
updates
  .take(until: viewController.rx.deallocated)
  .subscribe(onNext: { print($0) })
  .disposed(by: disposeBag)
```

DisposeBag으로 같은 수명을 이미 관리하고 있다면 중복일 수 있어요. 객체 밖에서 해당 객체의 수명에 맞춰 스트림을 끝내야 할 때 유용해요.

## Objective-C 메서드 전후를 관찰해요

```swift
let selector = #selector(UIViewController.viewDidAppear(_:))

viewController.rx.sentMessage(selector)
  .subscribe(onNext: { _ in
    print("호출 전")
  })
  .disposed(by: disposeBag)

viewController.rx.methodInvoked(selector)
  .subscribe(onNext: { _ in
    print("호출 후")
  })
  .disposed(by: disposeBag)
```

이 기능도 runtime interception과 swizzling에 의존하고 인자가 `[Any]`로 전달돼요. 컴파일 타임 타입 안전성이 필요한 공개 기능에서는 명시적인 delegate·method override·adapter가 더 나은지 검토하세요.

## URLSession async API와 선택해요

| 상황                                      | 선택                                  |
| ----------------------------------------- | ------------------------------------- |
| 기존 Rx 파이프라인 안에서 요청을 조합해요 | `URLSession.rx.data/response`         |
| 새 코드가 단일 요청 중심이에요            | `URLSession.data(for:)`와 async/await |
| Rx 소비자와 async 서비스가 만나요         | Repository adapter 한 곳에서 변환     |
| 세밀한 인증·delegate·streaming이 필요해요 | URLSession delegate 또는 별도 client  |

RxCocoa URLSession 확장은 간단한 요청 adapter예요. 캐시 정책, 인증 갱신, multipart, retry 정책을 모두 제공하는 네트워크 프레임워크는 아니에요.

## 자주 하는 실수

- URLSession Observable을 두 번 구독해 요청을 중복 실행해요.
- `response(request:)`가 모든 비정상 HTTP 코드를 오류로 만든다고 생각해요.
- debug curl 로그에 토큰과 사용자 데이터를 남겨요.
- Notification을 게시한 백그라운드 실행 문맥에서 UI를 갱신해요.
- 문자열 KVO의 weak 경로와 retainSelf 관계를 확인하지 않아요.
- 여러 runtime swizzling 라이브러리의 충돌 가능성을 무시해요.

## 적용 체크리스트

- Notification 전달 실행 문맥을 확인했나요?
- URL 요청이 구독마다 실행된다는 사실을 반영했나요?
- response와 data의 HTTP 상태 처리 차이를 이해했나요?
- 네트워크 로그에서 비밀값을 제거했나요?
- KVO 속성이 Objective-C 관찰 가능한가요?
- retainSelf와 weak 경로의 소유 관계를 검토했나요?
- runtime interception보다 타입 안전한 대안이 없는지 확인했나요?

## 면접에서 이어질 수 있는 질문

### `URLSession.rx.response`와 `data`는 무엇이 다른가요?

response는 HTTPURLResponse와 Data를 함께 보내고 상태 코드를 호출자가 판단해요. data는 `200..<300`만 성공으로 보고 그 밖의 상태를 RxCocoaURLError로 종료해요.

### `observe`와 `observeWeakly`는 어떻게 선택하나요?

강한 속성 경로와 명확한 소유 관계에서는 단순 observe가 더 빠르고 단순해요. weak 속성이나 알 수 없는 소유 그래프에서는 observeWeakly가 필요할 수 있지만 dealloc swizzling 비용과 충돌 가능성을 감수해야 해요.

## 참고 자료

- [RxCocoa Foundation 공식 소스](https://github.com/ReactiveX/RxSwift/tree/6.10.2/RxCocoa/Foundation)
- [NotificationCenter Rx 구현](https://github.com/ReactiveX/RxSwift/blob/6.10.2/RxCocoa/Foundation/NotificationCenter%2BRx.swift)
- [URLSession Rx 구현](https://github.com/ReactiveX/RxSwift/blob/6.10.2/RxCocoa/Foundation/URLSession%2BRx.swift)
- [NSObject KVO와 deallocated 구현](https://github.com/ReactiveX/RxSwift/blob/6.10.2/RxCocoa/Foundation/NSObject%2BRx.swift)
- [Getting Started — KVO](https://github.com/ReactiveX/RxSwift/blob/6.10.2/Documentation/GettingStarted.md#kvo)
