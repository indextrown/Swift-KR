---
title: RxSwift 연산자 — Observable 결합
description: combineLatest, zip, merge, concat, withLatestFrom과 flatMap 계열로 여러 Observable의 최신 값·순서·내부 구독을 조합하는 방법을 설명합니다.
---

# RxSwift 연산자 — Observable 결합

> **면접 답변 한 줄 요약:** 결합 연산자는 최신 값, 같은 순번, 도착 순서 중 어떤 규칙으로 여러 Observable을 합칠지 정하고, `flatMap` 계열은 입력마다 만든 내부 Observable의 동시 구독 정책을 정해요.

결합 연산자를 고를 때는 “어떤 값끼리 결과 하나를 만들까요?”와 “새 내부 작업이 들어오면 기존 작업을 어떻게 할까요?”를 나눠 생각해야 해요.

## 여러 Observable의 최신 상태를 합쳐요

<!-- rxswift-operator: combineLatest -->

### `combineLatest`

모든 소스가 적어도 값 하나씩을 보낸 뒤, 어느 소스든 새 값을 보낼 때 각 소스의 최신 값을 조합해요.

```swift
let query = PublishSubject<String>()
let isOnline = PublishSubject<Bool>()

Observable.combineLatest(
  query,
  isOnline
) { query, isOnline in
  !query.isEmpty && isOnline
}
.subscribe(onNext: { print("검색 가능:", $0) })
.disposed(by: disposeBag)

query.onNext("Rx")
isOnline.onNext(true)   // 검색 가능: true
query.onNext("")        // 검색 가능: false
```

`query`가 첫 값을 보냈어도 `isOnline`의 첫 값 전에는 결과를 만들 수 없어요. 한번 값이 생긴 뒤에는 최신 값을 다시 사용해요.

두 개부터 여덟 개까지 받는 오버로드와 컬렉션 오버로드가 있어요. 결과 선택 클로저로 튜플이나 도메인 상태를 만들 수 있고, 같은 타입의 컬렉션은 `[Element]` 결과로 모을 수 있어요.

## 같은 순번의 값을 한 번씩 짝지어요

<!-- rxswift-operator: zip -->

### `zip`

각 소스에서 아직 소비하지 않은 가장 오래된 값을 같은 순번끼리 묶어요.

```swift
let names = PublishSubject<String>()
let scores = PublishSubject<Int>()

Observable.zip(names, scores) { name, score in
  "\(name): \(score)점"
}
.subscribe(onNext: { print($0) })
.disposed(by: disposeBag)

names.onNext("Blob")
names.onNext("Rx")
scores.onNext(90)  // Blob: 90점
scores.onNext(80)  // Rx: 80점
```

빠른 소스의 소비되지 않은 값은 느린 소스의 다음 값을 기다려요. 속도 차이가 크거나 한쪽이 오래 멈추면 대기 값이 쌓일 수 있어요.

두 개부터 여덟 개까지의 오버로드와 컬렉션 오버로드가 있으며, 결과 선택 클로저로 묶음을 즉시 변환할 수 있어요.

## 도착하는 값을 한 흐름에 섞어요

<!-- rxswift-operator: merge -->

### `merge`

여러 Observable의 같은 타입 값을 도착하는 대로 한 Observable에 전달해요. 짝을 기다리지 않아요.

```swift
let refreshTap = PublishSubject<String>()
let foreground = PublishSubject<String>()

Observable.merge(refreshTap, foreground)
  .subscribe(onNext: { print($0) })
  .disposed(by: disposeBag)
```

정적 오버로드는 배열, 컬렉션, 가변 인자를 받고, `Observable<Observable<Element>>.merge()`는 내부 Observable들을 평탄화해요.

`merge(maxConcurrent:)`는 동시에 구독할 내부 Observable 수를 제한해요.

```swift
let requests: Observable<Observable<Response>> = requestQueue

let responses = requests
  .merge(maxConcurrent: 3)
```

한 내부 Observable이 실패하면 합쳐진 Observable도 실패하고 다른 내부 구독도 폐기돼요.

## Observable을 앞에서부터 순서대로 이어요

<!-- rxswift-operator: concat -->

### `concat`

첫 Observable이 정상 완료한 뒤 다음 Observable을 구독해 값을 이어 붙여요.

```swift
let cached = Observable.just("캐시")
let remote = Observable.just("원격")

Observable.concat(cached, remote)
// 캐시, 원격
```

배열·시퀀스·가변 인자 정적 오버로드와 인스턴스 오버로드가 있어요. `Observable<Observable<Element>>.concat()`은 내부 Observable을 한 번에 하나씩 구독해 순서를 지켜요.

앞 Observable이 완료하지 않으면 다음 Observable을 시작하지 않고, 오류가 나면 이어 가지 않고 실패해요.

<!-- rxswift-operator: concatMap -->

### `concatMap(_:)`

각 입력을 내부 Observable로 바꾼 뒤 하나씩 순서대로 구독해 결과를 이어요. `map`과 `concat`을 합친 연산이에요.

```swift
let uploads = fileURLs
  .concatMap { url in
    upload(url)
  }
```

입력 순서대로 작업을 수행해야 하는 업로드나 저장에 적합해요. 앞 작업이 끝나지 않으면 뒤 작업이 시작되지 않아 전체 처리 시간이 길어질 수 있어요.

## 먼저 반응한 Observable을 선택해요

<!-- rxswift-operator: amb -->

### `amb(_:)`

여러 Observable 중 **가장 먼저 이벤트를 보낸** 하나를 선택하고, 나머지 구독은 폐기해요. 첫 이벤트는 값뿐 아니라 오류나 완료일 수도 있어요.

```swift
let fastest = primaryRequest
  .amb(backupRequest)
```

동일 데이터를 가져오는 여러 소스 중 먼저 응답한 결과를 쓰는 경주에 적합해요. 선택되지 않은 작업이 실제로 중단되려면 각 Observable의 Disposable이 기반 작업 취소를 구현해야 해요.

컬렉션을 받는 정적 오버로드도 있어요.

## 한 Observable을 트리거로 다른 최신 값을 가져와요

<!-- rxswift-operator: withLatestFrom -->

### `withLatestFrom`

원본 Observable이 값을 보낼 때 두 번째 Observable의 최신 값을 가져와요. 두 번째 Observable이 아직 값을 보내지 않았다면 원본 값은 결과를 만들지 못하고 버려져요.

```swift
let submitTap = PublishSubject<Void>()
let latestForm = BehaviorSubject(value: Form.empty)

submitTap
  .withLatestFrom(latestForm)
  .subscribe(onNext: { form in
    submit(form)
  })
  .disposed(by: disposeBag)
```

결과 선택 오버로드는 원본 값과 최신 값을 함께 원하는 결과로 바꿔요.

```swift
submitTap.withLatestFrom(latestForm) {
  tap,
  form in
  Submission(form: form)
}
```

버튼 탭이 폼의 최신 상태를 읽는 것처럼 한쪽이 **언제**, 다른 쪽이 **무엇을** 결정할 때 적합해요.

## 모든 내부 Observable을 함께 유지해요

<!-- rxswift-operator: flatMap -->

### `flatMap(_:)`

각 입력을 내부 Observable로 바꾸고 모든 활성 내부 Observable의 값을 합쳐요.

```swift
userIDs
  .flatMap { id in
    loadUser(id: id)
  }
```

입력이 빠르면 여러 내부 구독이 동시에 살아 있고 결과 순서는 입력 순서와 달라질 수 있어요. 동시 수를 제한하려면 중첩 Observable을 만든 뒤 `merge(maxConcurrent:)`, 순서를 보장하려면 `concatMap`을 사용해요.

## 최신 내부 Observable로 전환해요

<!-- rxswift-operator: flatMapLatest -->

### `flatMapLatest(_:)`

각 입력을 내부 Observable로 바꾸고 새 입력이 오면 이전 내부 구독을 폐기해 최신 Observable의 값만 보내요. `map`과 `switchLatest`의 조합이에요.

```swift
query
  .debounce(
    .milliseconds(300),
    scheduler: MainScheduler.instance
  )
  .flatMapLatest { query in
    search(query)
      .catchAndReturn([])
  }
```

검색 자동 완성처럼 이전 결과가 더 이상 필요 없는 흐름에 적합해요. 구독 폐기가 실제 네트워크 요청 취소로 이어지는지는 소스 구현에 달려 있어요.

<!-- rxswift-operator: switchLatest -->

### `switchLatest()`

원본의 `Element` 자체가 Observable일 때 새 내부 Observable이 오면 이전 내부 구독을 폐기하고 최신 값만 전달해요.

```swift
let requestStreams: Observable<Observable<[Product]>> = query
  .map(search)

let latestResults = requestStreams
  .switchLatest()
```

이미 중첩 Observable이 있다면 `switchLatest`, 입력을 중첩 Observable로 바꾸는 단계까지 함께 표현하려면 `flatMapLatest`를 사용해요.

## 첫 내부 Observable이 끝날 때까지 새 입력을 무시해요

<!-- rxswift-operator: flatMapFirst -->

### `flatMapFirst(_:)`

내부 Observable이 활성화된 동안 새 원본 입력을 무시해요. 내부 Observable이 끝난 뒤 들어오는 다음 입력부터 새 작업을 만들어요.

```swift
saveButtonTap
  .flatMapFirst {
    saveDocument()
  }
```

저장 버튼 중복 탭처럼 실행 중인 작업을 유지하고 추가 요청을 버려야 할 때 적합해요. 새 요청을 대기열에 쌓아야 한다면 `concatMap`, 최신 요청으로 교체해야 한다면 `flatMapLatest`를 사용하세요.

## 내부 작업 정책을 비교해요

| 새 입력이 왔을 때 원하는 동작             | 연산자                          |
| ----------------------------------------- | ------------------------------- |
| 기존 작업을 모두 유지하고 결과를 섞어요   | `flatMap`                       |
| 기존 작업을 취소하고 최신 작업으로 바꿔요 | `flatMapLatest`                 |
| 기존 작업 중이면 새 입력을 버려요         | `flatMapFirst`                  |
| 새 입력을 기다렸다가 순서대로 실행해요    | `concatMap`                     |
| 동시 작업 수만 제한해요                   | `map` + `merge(maxConcurrent:)` |

## 결합 기준을 비교해요

| 질문                                          | 연산자           |
| --------------------------------------------- | ---------------- |
| 모든 소스의 최신 상태가 필요한가요?           | `combineLatest`  |
| 같은 순번의 값을 한 번씩 짝지어야 하나요?     | `zip`            |
| 같은 타입 이벤트를 도착하는 대로 합칠까요?    | `merge`          |
| 앞 소스가 끝난 뒤 다음 소스를 시작할까요?     | `concat`         |
| 트리거 순간 다른 소스의 최신 값이 필요한가요? | `withLatestFrom` |
| 여러 대안 중 먼저 반응한 소스만 쓸까요?       | `amb`            |

## 참고 자료

- [ObservableType 공식 API](https://docs.rxswift.org/protocols/observabletype)
- [Combining 연산자 구현](https://github.com/ReactiveX/RxSwift/tree/6.10.2/RxSwift/Observables)
- [ReactiveX Operators](https://reactivex.io/documentation/operators.html)
