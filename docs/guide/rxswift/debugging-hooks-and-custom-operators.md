---
title: RxSwift 디버깅, Hooks와 사용자 정의 연산자
description: debug·do 연산자, 처리하지 않은 오류 Hooks, Resources 누수 추적, 재진입·동기화 경고와 안전한 사용자 정의 연산자 작성 기준을 설명합니다.
source: https://github.com/ReactiveX/RxSwift/blob/6.10.2/Documentation/Tips.md
reviewed: '2026-09-06'
---

# RxSwift 디버깅, Hooks와 사용자 정의 연산자

> **면접 답변 한 줄 요약:** Rx 파이프라인은 `debug`와 `do`로 이벤트·구독 수명을 관찰하고, 처리하지 않은 오류는 Hooks에서 기록하며, 반복 조합은 기존 연산자를 감싼 사용자 정의 연산자로 추출하는 것이 안전해요.

Rx 코드는 선언적으로 보이지만 실제 문제는 구독 횟수, 이벤트 실행 스레드, 종료·폐기 순서에서 생겨요. 값을 `print`하는 것만으로는 소스가 두 번 구독됐는지, 오류로 끝났는지, 소비자가 취소했는지 구분하기 어려워요.

## `debug`로 전체 이벤트와 수명을 봐요

```swift
api.loadProfile()
  .debug("profile", trimOutput: true)
  .subscribe(
    onNext: { profile in
      print(profile.name)
    },
    onError: { error in
      print(error)
    }
  )
  .disposed(by: disposeBag)
```

`debug`는 보통 다음 정보를 출력해요.

- subscribed
- next 이벤트와 값
- error 또는 completed
- isDisposed

같은 identifier가 두 번 subscribed되면 cold 요청을 중복 구독했을 가능성을 찾을 수 있어요. 값이 크거나 개인정보가 포함되면 `trimOutput`과 로그 정책을 사용하고 운영 로그에 원문을 남기지 마세요.

## `do`는 이벤트를 바꾸지 않고 관찰해요

```swift
let profile = api.loadProfile()
  .do(
    onNext: { profile in
      metrics.markLoaded(profile.id)
    },
    onError: { error in
      metrics.markFailed(error)
    },
    onSubscribe: {
      metrics.markStarted()
    },
    onDispose: {
      metrics.markFinished()
    }
  )
```

`do`는 원래 이벤트를 그대로 통과시키며 로깅·측정 같은 부수 효과를 삽입해요. `map` 안에서 로그와 상태 변경을 함께 하는 것보다 의도가 드러나지만, `do`에 비즈니스 상태 전이를 숨기면 테스트와 재사용이 어려워져요.

| 목적                         | 도구              |
| ---------------------------- | ----------------- |
| 이벤트·구독 전체를 콘솔 확인 | `debug`           |
| 특정 이벤트에서 측정·로깅    | `do`              |
| 오류를 복구                  | `catch`, `retry`  |
| 오류를 값으로 검사           | `materialize`     |
| 자원 할당 추세 확인          | `Resources.total` |

## 처리하지 않은 오류는 Hooks로 들어가요

`subscribe`에서 `onError`를 제공하지 않은 상태로 오류가 도착하면 `Hooks.defaultErrorHandler`가 호출돼요.

```swift
Hooks.recordCallStackOnError = true

Hooks.defaultErrorHandler = { subscriptionCallStack, error in
  logger.record(
    error: error,
    subscriptionCallStack: subscriptionCallStack
  )
}
```

`recordCallStackOnError`를 켜면 구독 시점의 호출 스택을 캡처해 처리되지 않은 오류가 어디에서 시작됐는지 찾을 수 있어요. 비용이 있으므로 빌드 환경과 진단 목적에 맞게 사용하세요.

Hooks는 프로세스 전체에 영향을 주는 전역 설정이에요. 앱 시작 시 한 번 구성하고, 테스트마다 바꾼다면 원래 값을 복구해 다른 테스트에 영향을 주지 않게 하세요. Hooks를 설정했다고 각 파이프라인의 오류 복구 정책을 생략하면 안 돼요.

## Rx 동기화 경고를 원인부터 해결해요

디버그 빌드에서 Subject가 이벤트 처리를 끝내기 전에 같은 Subject로 다시 이벤트를 보내거나, 서로 다른 스레드가 동시에 이벤트를 보내면 재진입·동기화 anomaly 경고가 나타날 수 있어요.

```swift
let subject = PublishSubject<Int>()

subject
  .subscribe(onNext: { value in
    if value < 3 {
      subject.onNext(value + 1)
    }
  })
  .disposed(by: disposeBag)

subject.onNext(0)
```

이런 순환은 이벤트가 겹치고 호출 스택이 깊어질 수 있어요. 상태 전이를 `scan`으로 바꾸거나, 의도적인 비동기 경계라면 serial Scheduler에 enqueue하세요. 경고만 숨기는 Scheduler 전환보다 순환 의존성을 제거할 수 있는지 먼저 확인해야 해요.

## Resources.total로 누수 추세를 확인해요

`TRACE_RESOURCES`를 활성화한 RxSwift 빌드에서는 `Resources.total`이 Observable, Observer, Disposable 같은 내부 자원 수를 제공해요.

```swift
#if TRACE_RESOURCES
let baseline = Resources.total
print("Rx 기준값:", baseline)
#endif
```

화면 진입·종료를 반복하고 비동기 정리가 끝난 뒤 수치가 계속 증가하는지 봐요. 한 번의 앞뒤 값만 비교하면 캐시와 전역 스트림을 누수로 오인할 수 있으므로 반복 추세, Memory Graph, deinit 로그를 함께 확인하세요.

## RxError는 연산자 계약 위반을 표현해요

`RxError`에는 요소가 없거나 둘 이상인 경우, 인자 범위 오류, 시간 초과, 이미 폐기된 자원 같은 Rx 계층의 공통 오류가 포함돼요. 예를 들어 값 둘인 Observable을 `asSingle()`로 바꾸면 “첫 값을 선택”하지 않고 요소 개수 계약 위반으로 실패해요.

도메인 오류를 전부 RxError로 바꾸지 마세요. RxError는 스트림 연산 자체의 조건을 설명하고, 인증 실패·재고 부족 같은 비즈니스 오류는 도메인 오류나 상태로 유지하는 편이 좋아요.

## 중첩 subscribe를 연산자로 바꿔요

다음 구조는 내부 구독의 오류와 Disposable을 따로 관리해야 해서 복잡해져요.

```swift
query
  .subscribe(onNext: { query in
    api.search(query: query)
      .subscribe(onNext: { result in
        print(result)
      })
      .disposed(by: disposeBag)
  })
  .disposed(by: disposeBag)
```

연산자로 평탄화하면 최신 요청 취소, 오류, 완료가 하나의 체인에 남아요.

```swift
query
  .flatMapLatest { query in
    api.search(query: query)
  }
  .subscribe(onNext: { result in
    print(result)
  })
  .disposed(by: disposeBag)
```

공식 Tips 문서도 subscribe를 중첩하지 말고 내장 연산자를 조합하라고 권장해요.

## 반복 조합은 사용자 정의 연산자로 추출해요

도메인 여러 곳에서 같은 조합을 반복한다면 `ObservableType` 확장으로 이름을 붙일 수 있어요.

```swift
extension ObservableType where Element == String? {
  func nonEmptyText() -> Observable<String> {
    compactMap { text in
      guard let text else {
        return nil
      }

      let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
      return trimmed.isEmpty ? nil : trimmed
    }
    .distinctUntilChanged()
  }
}
```

좋은 사용자 정의 연산자는 다음 성질을 가져요.

- 입력과 출력 계약이 이름과 타입에서 보여요.
- 기존 연산자를 조합해 오류·완료·폐기 의미를 보존해요.
- 내부에서 몰래 subscribe하지 않아요.
- Scheduler를 불필요하게 고정하지 않아요.
- hot으로 바꾸거나 replay하는 등 공유 의미를 숨기지 않아요.

직접 `Observable.create`로 연산자를 만들기 전에 `map`, `flatMap`, `materialize`, `share` 조합으로 표현할 수 있는지 확인하세요.

## 사용자 정의 연산자를 테스트해요

```swift
func testNonEmptyText() {
  let scheduler = TestScheduler(initialClock: 0)
  let source = scheduler.createColdObservable([
    .next(10, "  "),
    .next(20, " Rx "),
    .next(30, "Rx"),
    .completed(40),
  ])

  let result = scheduler.start {
    source.nonEmptyText()
  }

  XCTAssertEqual(
    result.events,
    [
      .next(220, "Rx"),
      .completed(240),
    ]
  )
}
```

값뿐 아니라 완료·오류 시간과 source subscriptions도 검증하면 폐기 계약이 깨진 구현을 찾을 수 있어요.

## 자주 하는 실수

- 운영 로그에 전체 사용자 데이터가 포함된 `debug()` 출력을 남겨요.
- `do` 안에서 숨은 상태 전이와 추가 subscribe를 만들어요.
- 전역 Hooks가 오류를 기록하므로 로컬 오류 처리를 생략해요.
- 동기화 경고를 무조건 무시하거나 Scheduler 하나로 덮어요.
- 사용자 정의 연산자 내부에서 subscribe해 취소와 오류를 분리해요.
- Resources.total의 일시적 증가 하나만 보고 누수라고 단정해요.

## 적용 체크리스트

- 중복 구독 여부를 `debug`의 subscribed 로그로 확인했나요?
- 측정용 `do`가 스트림 의미를 바꾸지 않나요?
- 모든 실패 가능한 구독에 의도적인 오류 처리 경로가 있나요?
- 전역 Hooks 설정을 앱 시작 한곳에서 관리하나요?
- 재진입·동기화 경고의 순환 또는 동시 입력 원인을 찾았나요?
- 사용자 정의 연산자가 기존 연산자로 조합되고 독립 테스트되나요?

## 면접에서 이어질 수 있는 질문

### `debug`와 `do`의 차이는 무엇인가요?

`debug`는 구독과 모든 이벤트를 정해진 형식으로 출력하는 진단 연산자이고, `do`는 선택한 생명 주기 지점에 사용자 부수 효과를 넣어요. 둘 다 원래 이벤트를 변환하지 않아요.

### 처리하지 않은 Rx 오류는 어떻게 되나요?

subscribe에 onError가 없으면 `Hooks.defaultErrorHandler`가 호출돼요. 전역 기록의 마지막 안전망일 뿐이므로 복구나 사용자 상태 변환은 각 파이프라인 경계에서 처리해야 해요.

## 참고 자료

- [RxSwift Tips](https://github.com/ReactiveX/RxSwift/blob/6.10.2/Documentation/Tips.md)
- [RxSwift Warnings](https://github.com/ReactiveX/RxSwift/blob/6.10.2/Documentation/Warnings.md)
- [Hooks 공식 API](https://docs.rxswift.org/enums/hooks)
- [Resources 공식 API](https://docs.rxswift.org/enums/resources)
- [debug 연산자 구현](https://github.com/ReactiveX/RxSwift/blob/6.10.2/RxSwift/Observables/Debug.swift)
- [Unit Tests 공식 문서](https://github.com/ReactiveX/RxSwift/blob/6.10.2/Documentation/UnitTests.md)
