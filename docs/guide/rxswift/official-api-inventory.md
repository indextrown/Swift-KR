---
title: RxSwift 공식 API 범위와 학습 순서
description: RxSwift 6.10.2의 RxSwift·RxCocoa·RxRelay·RxTest·RxBlocking 공개 API를 문서별로 연결하고 포함 범위와 권장 학습 순서를 안내합니다.
source: https://github.com/ReactiveX/RxSwift/tree/6.10.2
reviewed: '2026-09-06'
---

# RxSwift 공식 API 범위와 학습 순서

> **면접 답변 한 줄 요약:** RxSwift 생태계는 코어 스트림을 담당하는 RxSwift, Apple UI 연결을 담당하는 RxCocoa, 종료 없는 값 통로인 RxRelay, 가상 시간과 동기 검사를 제공하는 RxTest·RxBlocking으로 나뉘어요.

RxSwift 문서가 몇 개인지만 세면 실제 범위를 판단하기 어려워요. 한 문서에 개념을 모두 넣으면 찾기 힘들고, API 이름만 나열하면 왜 쓰는지 알기 어려워요. 이 페이지는 **RxSwift 6.10.2 공식 저장소의 공개 제품과 API 계열**을 기준으로 각 내용을 어느 문서에서 설명하는지 연결해요.

## 먼저 알아둘 용어

| 용어           | 뜻                                                                                                         |
| -------------- | ---------------------------------------------------------------------------------------------------------- |
| 제품(product)  | Swift Package Manager에서 target이 의존성으로 선택하는 배포 단위예요. RxSwift에는 다섯 제품이 있어요.      |
| 모듈(module)   | `import RxSwift`처럼 코드에서 가져오는 컴파일 단위예요.                                                    |
| 공개 API       | 앱 코드가 직접 사용하도록 노출된 타입·메서드·프로토콜이에요.                                               |
| 구현 세부 사항 | `Producer`, `Sink`, lock과 내부 자료 구조처럼 공개 API를 동작시키지만 일반 앱에서 직접 쓰지 않는 코드예요. |
| API 인벤토리   | 어떤 기능 계열을 어느 문서에서 설명하는지 추적하는 목록이에요.                                             |
| 플랫폼 바인딩  | UIKit·AppKit·Foundation 객체의 이벤트와 속성을 Rx source·sink로 바꾸는 확장이에요.                         |

## 다섯 제품의 경계를 확인해요

```text
RxCocoa ───────┐
   │           │
   ▼           ▼
RxRelay ───▶ RxSwift ◀── RxTest
                 ▲
                 └────── RxBlocking
```

| 제품         | 공식 공개 범위                                                             | 이 섹션에서 시작할 문서              |
| ------------ | -------------------------------------------------------------------------- | ------------------------------------ |
| `RxSwift`    | Observable, Observer, Event, 연산자, Disposable, Scheduler, Subject, Trait | [RxSwift 핵심 구조](./rxswift-core)  |
| `RxCocoa`    | Reactive, Binder, UI Trait, UIKit·AppKit·Foundation 바인딩, DelegateProxy  | [RxCocoa 시작하기](./rxcocoa)        |
| `RxRelay`    | PublishRelay, BehaviorRelay, ReplayRelay와 `bind(to:)`                     | [RxRelay 시작하기](./rxrelay)        |
| `RxTest`     | TestScheduler, hot·cold Observable, 기록 가능한 Observer와 Subscription    | [RxTest 가상 시간](./rxtest)         |
| `RxBlocking` | Observable을 테스트에서 동기적으로 검사하는 BlockingObservable             | [RxBlocking 동기 검사](./rxblocking) |

설치 방법과 제품 의존 관계는 [설치와 모듈 구성](./installation-and-modules)에서 먼저 확인할 수 있어요.

## RxSwift 코어 범위를 문서별로 찾아봐요

| 공식 API 계열                             | 다루는 내용                                                               | 상세 문서                                                                                 |
| ----------------------------------------- | ------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| `ObservableType`, `ObserverType`, `Event` | 생성, 구독, 이벤트 문법, 타입 지우기, 이벤트를 값으로 바꾸기              | [Observable·Observer·Event](./observable-observer-event)                                  |
| `Disposable`과 구현 타입                  | DisposeBag, 교체·복합·참조 카운트·예약 폐기, 취소와 자원 수명             | [Disposable과 자원](./disposables-and-resources)                                          |
| `SchedulerType`과 구현 타입               | 구독 위치, 관찰 위치, 직렬·병렬·메인·가상 시간, async 브리지              | [Scheduler와 동시성](./schedulers-and-concurrency)                                        |
| 네 가지 Subject와 코어 Trait              | Publish·Behavior·Replay·AsyncSubject, Single·Maybe·Completable·Infallible | [Subject와 Traits](./subjects-and-traits)                                                 |
| 연산자                                    | 생성·변환·필터·결합·시간·오류·공유·Trait·폐기 API                         | [모든 연산자](./operators-create-convert)                                                 |
| `debug`, `do`, `Hooks`, `Resources`       | 파이프라인 관찰, 전역 오류 처리, 자원 추적, 사용자 정의 연산자            | [디버깅과 사용자 정의 연산자](./debugging-hooks-and-custom-operators)                     |
| Swift Concurrency 브리지                  | Observable의 `values`, AsyncSequence의 `asObservable`, 취소 전파          | [Scheduler와 동시성](./schedulers-and-concurrency#rxswift와-swift-concurrency를-연결해요) |

“모든 연산자” 문서는 RxSwift 6.10.2 공개 심볼에서 추출한 **서로 다른 연산자 이름 89개**를 목적별 일곱 문서에 나눠 설명해요. 오버로드마다 같은 이름을 반복해 별도 페이지로 만들지는 않고, 의미가 달라지는 오버로드를 해당 항목에서 비교해요.

## RxCocoa 범위를 문서별로 찾아봐요

| 공식 API 계열                              | 다루는 내용                                                        | 상세 문서                                                          |
| ------------------------------------------ | ------------------------------------------------------------------ | ------------------------------------------------------------------ |
| `Reactive`, `ReactiveCompatible`, `Binder` | `.rx` 네임스페이스, source와 sink, 안전한 UI 출력                  | [Reactive·Binder·Control Traits](./reactive-binder-control-traits) |
| `ControlProperty`, `ControlEvent`          | UI 입력의 읽기·쓰기 계약과 컨트롤 사건                             | [Reactive·Binder·Control Traits](./reactive-binder-control-traits) |
| `SharedSequence`, `Driver`, `Signal`       | 메인 Scheduler, 오류 없는 UI 출력, replay와 공유 범위              | [Driver·Signal·SharedSequence](./driver-signal-shared-sequence)    |
| UIKit 확장                                 | 버튼·텍스트·스크롤·내비게이션·웹 뷰·애플리케이션 이벤트            | [UIKit 컨트롤 바인딩](./uikit-control-bindings)                    |
| 리스트와 delegate·data source              | `items`, 선택·표시·prefetch 사건, 프록시 등록과 전달               | [리스트와 DelegateProxy](./list-bindings-and-delegate-proxy)       |
| Foundation 확장                            | NotificationCenter, URLSession, KVO, deallocation, 메서드 가로채기 | [Foundation 바인딩](./foundation-bindings)                         |

RxCocoa 저장소에는 iOS와 함께 macOS용 AppKit 확장도 있어요. 이 사이트는 iOS 학습 문서이므로 UIKit을 전체 학습 경로로 설명하고, AppKit은 동일한 `Reactive`·`Binder`·delegate proxy 원리가 적용되는 플랫폼 범위로 안내해요. 컨트롤별 속성 오버로드를 한 줄씩 복제하기보다 공통 계약과 대표 API를 다루고, 정확한 최신 심볼은 공식 API 레퍼런스로 연결해요.

## RxRelay와 테스트 범위를 문서별로 찾아봐요

| 범위                 | 핵심 질문                                                         | 상세 문서                                                  |
| -------------------- | ----------------------------------------------------------------- | ---------------------------------------------------------- |
| 세 Relay의 재생 규칙 | 새 Subscriber가 과거 값이나 현재 값을 받아야 하나요?              | [Relay 종류와 replay](./relay-types-and-replay)            |
| 상태 Store와 동시성  | 변경 경로를 캡슐화하고 read-modify-write 경쟁을 어떻게 막을까요?  | [상태 Store와 동시성](./relay-state-store-and-concurrency) |
| RxTest               | 시간 기반 흐름을 실제로 기다리지 않고 어떻게 검증할까요?          | [RxTest 가상 시간](./rxtest)                               |
| RxBlocking           | 짧게 끝나는 시퀀스의 값·오류를 동기 테스트에서 어떻게 확인할까요? | [RxBlocking 동기 검사](./rxblocking)                       |

## 포함하지 않은 범위도 명확히 해요

이 섹션의 “빠짐없이”는 **일반 iOS 앱 개발자가 선택하고 조합하는 공개 제품, 핵심 개념, 공개 API 계열과 RxSwift 연산자 이름**을 빠뜨리지 않는다는 뜻이에요. 다음 항목은 의도적으로 줄 단위 해설 범위에서 제외해요.

- `Producer`, `Sink`, lock, tail-recursive sink stack, 플랫폼별 원자 연산처럼 라이브러리 내부 구현을 위한 비공개 또는 저수준 구조
- 같은 의미를 갖는 모든 generic 제약·플랫폼·타입 오버로드의 선언 복제
- 공식 샘플 앱 전체 코드와 공식 문서의 문장별 번역
- 일반 iOS 앱에서 사용하지 않는 macOS 컨트롤별 바인더의 개별 사용 예제

내부 구현은 동작 원리를 설명할 때 필요한 부분만 인용 없이 해설하고 공식 소스에 연결해요. 공개 API가 추가되거나 의미가 달라지면 기준 버전을 올리고 인벤토리와 검증 목록을 함께 갱신해야 해요.

## 권장 학습 순서를 정리해요

1. [설치와 모듈 구성](./installation-and-modules)에서 필요한 제품만 target에 연결해요.
2. [Observable·Observer·Event](./observable-observer-event)에서 스트림의 이벤트 계약을 익혀요.
3. [Disposable과 자원](./disposables-and-resources), [Scheduler와 동시성](./schedulers-and-concurrency)으로 수명과 실행 위치를 설계해요.
4. [Subject와 Traits](./subjects-and-traits)에서 값의 개수와 종료 가능성을 타입으로 표현해요.
5. 목적에 맞는 [연산자](./operators-create-convert)를 골라 파이프라인을 만들어요.
6. UIKit 화면에서는 [RxCocoa](./rxcocoa), 상태 입력에서는 [RxRelay](./rxrelay)를 필요한 경계에만 추가해요.
7. [RxTest](./rxtest)와 [RxBlocking](./rxblocking)으로 값·시간·구독·폐기를 검증해요.

## 적용 체크리스트

- 현재 프로젝트가 사용하는 RxSwift 버전과 문서 기준 버전이 같은가요?
- target마다 RxSwift, RxCocoa, RxRelay 중 실제 필요한 제품만 가져오나요?
- Event 종료 규칙, Disposable 수명, Scheduler 위치를 함께 설계했나요?
- UI 상태와 단발 사건에 Driver·Signal·Relay를 의미에 맞게 골랐나요?
- 시간 기반 로직은 RxTest로 구독·폐기 시점까지 검증하나요?
- 새 공식 공개 API가 생겼을 때 이 인벤토리와 관련 문서를 함께 갱신하나요?

## 면접에서 이어질 수 있는 질문

### RxSwift와 RxCocoa는 왜 별도 모듈인가요?

RxSwift는 플랫폼에 덜 의존하는 Observable 코어이고, RxCocoa는 UIKit·AppKit·Foundation 객체를 위한 바인딩과 UI Trait을 제공해요. 도메인 계층이 RxCocoa에 의존하지 않게 분리하면 UI 프레임워크 결합을 화면 경계에 제한할 수 있어요.

### 공개 API를 빠짐없이 설명한다는 것은 모든 소스 파일을 번역한다는 뜻인가요?

아니에요. 앱 개발자가 사용하는 공개 개념과 API 계열, 연산자 이름을 추적한다는 뜻이에요. 내부 구현과 반복 오버로드는 원리를 이해하는 데 필요한 만큼 설명하고 정확한 선언은 공식 소스로 연결해요.

## 참고 자료

- [RxSwift 6.10.2 공식 저장소](https://github.com/ReactiveX/RxSwift/tree/6.10.2)
- [RxSwift 공식 API 레퍼런스](https://docs.rxswift.org/)
- [RxSwift 공식 문서 목록](https://github.com/ReactiveX/RxSwift/tree/6.10.2/Documentation)
- [RxSwift 구성 요소 관계](https://github.com/ReactiveX/RxSwift/blob/6.10.2/Documentation/GettingStarted.md)
- [RxSwift 모듈 의존 관계](https://github.com/ReactiveX/RxSwift/blob/6.10.2/Documentation/GettingStarted.md#what-are-the-components-of-rxswift)
