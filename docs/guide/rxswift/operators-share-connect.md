---
title: RxSwift 연산자 — 공유와 연결
description: multicast, publish, replay, share, connect, refCount로 하나의 원본 구독을 여러 Observer가 안전하게 공유하는 방법을 설명합니다.
---

# RxSwift 연산자 — 공유와 연결

> **면접 답변 한 줄 요약:** `publish`와 `replay`는 원본을 Connectable Observable로 만들고 `connect`가 공유 구독을 시작하며, `refCount`와 `share`는 구독자 수에 맞춰 연결 수명을 자동 관리해요.

일반적인 cold Observable은 Observer마다 원본 작업을 새로 시작해요. 네트워크 요청 하나를 여러 화면 상태가 구독하면 요청도 여러 번 실행될 수 있어요. 공유 연산자는 원본 구독 하나의 이벤트를 여러 Observer에게 전달해 이런 중복을 제어해요.

## Subject를 통해 원본 구독을 공유해요

<!-- rxswift-operator: multicast -->

### `multicast(...)`

원본 이벤트를 지정한 Subject에 전달하는 `ConnectableObservable`을 만들어요. Observer들은 원본이 아니라 같은 Subject를 구독해요.

```swift
let shared = source.multicast(PublishSubject<Int>())

shared
  .subscribe(onNext: { print("A:", $0) })
  .disposed(by: disposeBag)

shared
  .subscribe(onNext: { print("B:", $0) })
  .disposed(by: disposeBag)

let connection = shared.connect()
connection.disposed(by: disposeBag)
```

Subject 인스턴스, 구독 연결마다 Subject를 만드는 팩터리, 공유 범위 안에서 결과 Observable을 선택하는 오버로드가 있어요. 직접 사용할 때는 Subject의 버퍼와 종료 이벤트 보존 특성이 공유 결과에도 적용된다는 점을 확인하세요.

<!-- rxswift-operator: publish -->

### `publish()`

`PublishSubject`를 사용한 `multicast`의 간단한 형태예요. 연결 뒤에 도착한 이벤트만 현재 구독자에게 전달하고 이전 값은 재생하지 않아요.

```swift
let connectable = request().publish()
```

모든 Observer를 먼저 등록한 다음 `connect()`를 호출해 같은 시작점에서 이벤트를 받게 할 때 유용해요.

<!-- rxswift-operator: replay -->

### `replay(_:)`

지정한 개수만큼 최근 값을 보관하는 Connectable Observable을 만들어요. 늦게 구독한 Observer는 버퍼의 최근 값을 먼저 받고 이어서 새 값을 받아요.

```swift
let connectable = request()
  .replay(1)
```

상태나 마지막 응답을 늦은 구독자에게 전달할 때 `replay(1)`을 자주 사용해요. 버퍼 수가 크고 값이 무거우면 메모리 사용량도 커져요.

<!-- rxswift-operator: replayAll -->

### `replayAll()`

연결 뒤에 발생한 모든 값을 보관해 늦은 구독자에게 다시 보내요.

```swift
let history = events.replayAll()
```

완료되지 않는 장기 스트림에서는 버퍼가 제한 없이 커질 수 있어요. 전체 기록이 정말 필요하고 시퀀스 길이가 제한된 경우가 아니라면 `replay(_:)`로 상한을 두세요.

## 공유 연결을 직접 시작하고 끝내요

<!-- rxswift-operator: connect -->

### `connect()`

Connectable Observable을 원본에 연결해 실제 구독을 시작하고, 연결을 끊을 수 있는 `Disposable`을 반환해요.

```swift
let connectable = ticks.publish()

let first = connectable
  .subscribe(onNext: { print("A:", $0) })
let second = connectable
  .subscribe(onNext: { print("B:", $0) })

let connection = connectable.connect()

first.disposed(by: disposeBag)
second.disposed(by: disposeBag)
connection.disposed(by: disposeBag)
```

Observer의 구독 Disposable과 원본 연결 Disposable은 역할이 달라요. Observer 하나를 폐기해도 다른 Observer와 원본 연결은 유지되고, 연결 Disposable을 폐기하면 공유 중인 원본 구독이 종료돼요.

## 구독자 수로 연결 수명을 관리해요

<!-- rxswift-operator: refCount -->

### `refCount()`

Connectable Observable의 첫 Observer가 구독할 때 자동으로 `connect()`하고, 마지막 Observer가 떠나면 원본 연결을 폐기해요.

```swift
let shared = request()
  .replay(1)
  .refCount()
```

Observer가 모두 사라진 뒤 다시 구독하면 새 연결이 시작돼요. 다만 Connectable Observable이 같은 Subject를 계속 사용하는 경우 Subject에 남은 값이나 종료 이벤트가 다음 연결에 영향을 줄 수 있으므로 원하는 격리 범위를 확인해야 해요.

<!-- rxswift-operator: share -->

### `share(replay:scope:)`

`multicast`와 `refCount`를 자주 쓰는 형태로 묶은 연산자예요. 구독자가 있을 때만 원본을 연결하고 하나의 구독을 공유해요.

```swift
let profile = api.loadProfile()
  .share(replay: 1, scope: .whileConnected)
```

`replay`는 새 Observer에게 다시 보낼 최근 값의 개수예요.

| 설정        | 늦게 구독한 Observer가 받는 값                   |
| ----------- | ------------------------------------------------ |
| `replay: 0` | 구독 뒤 새로 발생한 값부터 받아요.               |
| `replay: 1` | 가장 최근 값 하나를 먼저 받은 뒤 새 값을 받아요. |
| `replay: n` | 최근 값 최대 `n`개를 먼저 받아요.                |

`share()`는 원본을 자동으로 비동기 실행하거나 스레드를 바꾸지 않아요. 실행 위치는 `subscribe(on:)`과 `observe(on:)`으로 별도 결정해야 해요.

## 공유 범위를 선택해요

`SubjectLifetimeScope`는 연결이 끊긴 뒤 다음 구독이 같은 Subject를 재사용할지 정해요.

### `.whileConnected`

연결마다 별도의 Subject를 만들어요. 모든 Observer가 떠나 연결이 끊기면 그 연결의 버퍼와 상태도 분리되고, 다음 Observer는 새 Subject와 새 원본 구독을 사용해요.

```swift
let shared = source
  .share(replay: 1, scope: .whileConnected)
```

서로 다른 연결의 이벤트가 섞이지 않아 일반적으로 권장되는 기본값이에요. 종료 뒤 이어지는 `retry`나 `concat`도 새 연결을 만들 수 있어요.

### `.forever`

여러 연결이 하나의 Subject를 공유해요. 연결이 잠시 끊겨도 Subject의 재생 버퍼와 종료 상태가 다음 구독에 영향을 줄 수 있어요.

```swift
let shared = source
  .share(replay: 1, scope: .forever)
```

Subject가 오류나 완료를 받으면 이후 Observer도 보존된 종료 이벤트를 받을 수 있어요. 이 경우 `retry`나 `concat`을 `share` 뒤에 배치해도 원본의 새 실행을 기대한 대로 만들지 못할 수 있어요. 결과를 애플리케이션 수명 동안 캐시해야 하는 경우처럼 재사용 의도가 분명할 때 선택하세요.

## 연산자를 선택해요

| 원하는 제어 수준                                   | 선택                   |
| -------------------------------------------------- | ---------------------- |
| Subject 종류와 선택 클로저를 직접 구성해요         | `multicast`            |
| 재생 없이 연결 시점을 직접 정해요                  | `publish` + `connect`  |
| 최근 값 버퍼와 연결 시점을 직접 정해요             | `replay` + `connect`   |
| Connectable Observable을 구독자 수로 자동 연결해요 | `refCount`             |
| 일반적인 공유와 최근 값 재생을 간단히 구성해요     | `share(replay:scope:)` |
| 유한한 전체 값을 늦은 구독자에게 다시 보내요       | `replayAll`            |

## 흔한 실수를 피해요

- 동일 요청이 여러 번 실행된다면 각 구독마다 cold Observable이 새로 시작되는지 확인하세요.
- `share(replay: 1)`은 영구 캐시가 아니에요. 기본 `.whileConnected`에서는 마지막 구독자가 떠난 뒤 다음 연결이 새로 시작돼요.
- `replayAll()`과 큰 재생 버퍼에 무거운 모델이나 이미지를 넣으면 메모리를 오래 점유할 수 있어요.
- 원본이 완료되지 않아도 마지막 Observer가 떠나면 `refCount` 연결은 폐기돼요. Disposable이 실제 기반 작업을 취소하도록 구현되어 있어야 자원도 해제돼요.

## 참고 자료

- [ConnectableObservableType 공식 API](https://docs.rxswift.org/protocols/connectableobservabletype)
- [공유 연산자 구현](https://github.com/ReactiveX/RxSwift/blob/6.10.2/RxSwift/Observables/ShareReplayScope.swift)
- [Multicast 구현](https://github.com/ReactiveX/RxSwift/blob/6.10.2/RxSwift/Observables/Multicast.swift)
- [Subjects 공식 API](https://docs.rxswift.org/rxswift/subjects)
