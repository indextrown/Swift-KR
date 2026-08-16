---
title: Allocations와 Leaks로 메모리 분석하기
description: Xcode Memory Graph와 Instruments의 Allocations, Generations, Leaks를 구분하고 반복 동작 뒤 살아남는 객체, 일시적 peak와 retain cycle의 할당 경로를 찾는 방법을 설명합니다.
---

# Allocations와 Leaks로 메모리 분석하기

> **면접 답변 한 줄 요약:** 메모리 분석은 Allocations로 언제 무엇이 할당되고 반복 동작 뒤 무엇이 살아남는지 찾고, Leaks와 Memory Graph로 도달할 수 없는 allocation과 retain cycle의 참조 경로를 확인하는 과정이에요.

앱의 memory graph가 올라간다는 사실만으로 leak이라고 부를 수는 없어요. 큰 이미지를 처리하는 동안 잠깐 올라갔다가 내려오는 **일시적 증가**일 수 있고, cache가 계속 보관하는 **도달 가능한 미사용 객체**일 수 있으며, 참조를 잃었지만 해제되지 못한 실제 **leak**일 수도 있어요.

도구마다 보는 대상이 달라요.

- Xcode memory gauge는 현재 사용량과 peak를 빠르게 알려 줘요.
- Allocations는 heap과 anonymous VM allocation의 수, 크기와 생성 stack을 기록해요.
- Generations는 기능 실행 전후에 만들어져 계속 살아 있는 allocation을 좁혀요.
- Leaks는 앱에서 도달할 수 없지만 해제되지 않은 memory 영역을 주기적으로 찾아요.
- Memory Graph Debugger는 한 시점의 객체와 strong reference 경로를 보여 줘요.

## 먼저 알아둘 메모리 분석 용어

| 용어                 | 쉬운 뜻                                                                                                                                                             |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| heap                 | 실행 중 크기와 수명이 동적으로 정해지는 객체와 buffer가 저장되는 memory 영역이에요. Swift class, closure context와 여러 collection storage가 여기에 놓일 수 있어요. |
| allocation           | 실행 중 memory block을 확보하는 일이에요. 하나의 Swift 객체가 내부 buffer를 포함해 여러 allocation을 만들 수도 있어요.                                              |
| live allocation      | 아직 deallocate되지 않고 현재 살아 있는 allocation이에요. 앱이 실제로 유용하게 사용 중인지와는 별개의 의미예요.                                                     |
| transient growth     | 작업 중 memory가 증가하지만 작업이 끝나면 내려오는 일시적 증가예요. Peak가 너무 크면 leak이 없어도 system 종료 위험이 생겨요.                                       |
| persistent growth    | 화면을 닫거나 기능을 끝낸 뒤에도 이전보다 높은 memory가 남고 반복할수록 증가하는 상태예요.                                                                          |
| leak                 | 더는 유용하게 접근할 방법이 없는데도 deallocate되지 않은 memory예요. strong reference cycle이나 수동 memory 관리 오류가 원인이 될 수 있어요.                        |
| reachable memory     | root나 전역 cache처럼 앱이 여전히 참조 경로를 가진 memory예요. 사용하지 않아도 참조가 남아 있으면 Leaks가 leak으로 판단하지 않을 수 있어요.                         |
| retain cycle         | 둘 이상의 객체나 closure가 strong reference로 서로를 붙잡아 외부 사용이 끝나도 reference count가 0이 되지 않는 구조예요.                                            |
| generation           | Allocations에서 특정 시점 사이에 생긴 allocation을 묶어 비교하는 표식이에요. 기능 전, 실행 후, 화면 종료 후를 나누는 데 사용해요.                                   |
| allocation backtrace | memory가 만들어진 시점의 call stack이에요. 현재 사용 위치가 아니라 누가 할당했는지 찾는 단서예요.                                                                   |
| memory footprint     | 앱 process가 system memory에 미치는 전체적인 점유 규모예요. Swift heap allocation 합계와 완전히 같은 값은 아니에요.                                                 |

ARC와 strong·weak reference의 언어 규칙을 먼저 복습하려면 [Swift 메모리 관리와 ARC](../swift/memory-management.md)를 읽어 보세요.

## 먼저 증가 모양을 세 종류로 나눠요

사진 편집 화면을 열어 filter를 적용하고 닫는 동작을 반복한다고 가정해 볼게요.

```text
Transient
기준 100 MB → 편집 중 260 MB → 닫은 후 105 MB

Persistent
기준 100 MB → 1회 후 140 MB → 2회 후 180 MB → 3회 후 220 MB

Plateau / Cache
기준 100 MB → 1회 후 180 MB → 이후에도 약 180 MB 유지
```

세 모양의 조사 방향은 달라요.

| 관찰 모양                 | 먼저 확인할 것                                                                   |
| ------------------------- | -------------------------------------------------------------------------------- |
| 순간 peak가 너무 커요.    | 같은 시점에 살아 있는 image buffer, autorelease object와 중간 collection을 봐요. |
| 반복마다 바닥이 올라가요. | Generations로 각 반복 뒤 남은 객체와 allocation backtrace를 비교해요.            |
| 한 번 올라간 뒤 유지돼요. | 의도한 cache인지, 최대 크기와 memory warning 정리 정책이 있는지 확인해요.        |
| Leaks가 표시돼요.         | leak 상세의 allocation stack과 Memory Graph의 reference cycle을 확인해요.        |

memory peak가 원래 수준으로 돌아오더라도 peak가 기기 한계를 넘으면 앱이 종료될 수 있어요. 반대로 앱이 살아 있는 객체를 의도적으로 cache하면 Leaks 표시가 없어도 footprint는 높을 수 있어요.

## Xcode memory gauge로 증상을 빠르게 확인해요

앱을 Xcode에서 실행하고 Debug navigator의 Memory report를 열면 현재 memory 사용량과 기록 중 peak를 볼 수 있어요. 다음 용도로 사용하세요.

- 어떤 사용자 동작에서 memory가 갑자기 증가하는지 찾기
- 화면을 닫은 뒤 대략적인 수준이 내려오는지 확인하기
- 반복 동작에서 바닥과 peak가 계속 올라가는지 관찰하기
- Memory Graph Debugger를 캡처할 시점을 정하기

gauge 하나로 allocation 종류와 생성 stack을 알 수는 없어요. 재현 가능한 증가를 확인했으면 Allocations trace로 넘어가세요. Apple의 [Gathering information about memory use](https://developer.apple.com/documentation/xcode/gathering-information-about-memory-use)는 gauge, Memory Graph와 Allocations의 역할을 함께 설명해요.

## Allocations로 할당 종류와 생성 경로를 찾아요

Allocations instrument는 heap과 anonymous virtual memory allocation을 category별로 모으고 수, 크기와 생성 stack을 보여 줘요.

1. 물리 기기를 선택하고 `Product > Profile`을 실행해요.
2. Allocations template을 선택해요.
3. Record를 누르고 앱을 기준 화면까지 이동해요.
4. target process의 Allocations track과 Statistics를 선택해요.
5. 사진 편집처럼 조사할 기능을 한 번 실행하고 닫아요.
6. Stop한 뒤 inspection range와 allocation category를 좁혀요.
7. persistent bytes, live count와 allocation backtrace를 확인해요.

모든 allocation을 줄이는 것이 목표는 아니에요. 사용자 경험에 필요한 object와 buffer도 정상적으로 allocation돼요. 다음 질문으로 우선순위를 정하세요.

- 크기가 큰가요, 수가 지나치게 많은가요?
- 기능 종료 뒤에도 live 상태인가요?
- 반복할수록 live count나 persistent bytes가 증가하나요?
- allocation stack이 앱의 어느 소스 경로로 이어지나요?
- 같은 결과를 위해 너무 많은 임시 값과 copy를 만들고 있나요?

### allocation 시점과 현재 소유자를 구분해요

Allocations의 stack은 객체가 **만들어진 위치**를 보여 줘요. 지금 누가 그 객체를 붙잡고 있는지는 Memory Graph의 reference path가 더 직접적인 단서예요.

```text
Allocations
  “이 객체는 어디서 만들어졌나요?”

Memory Graph
  “지금 누가 이 객체를 strong reference로 붙잡나요?”
```

두 질문을 함께 사용하면 “Repository가 만들었고, 닫힌 View Controller의 callback chain이 아직 소유한다”처럼 원인을 연결할 수 있어요.

## Generations로 기능 전후를 분리해요

recording 전체 allocation에는 앱 시작, system framework와 다른 화면의 작업이 섞여요. Generations를 사용하면 관심 기능 사이에 생긴 allocation만 상대적으로 좁힐 수 있어요.

사진 상세 화면의 persistent growth를 조사하는 순서는 다음과 같아요.

1. 앱을 실행하고 사진 목록에서 안정될 때까지 기다려요.
2. Allocations의 `Mark Generation`을 눌러 기준을 만들어요.
3. 사진 상세 화면을 열고 이미지를 불러와요.
4. 다시 `Mark Generation`을 눌러 기능 실행 구간을 나눠요.
5. 상세 화면을 닫고 비동기 작업이 정리될 시간을 줘요.
6. 다시 `Mark Generation`을 눌러 종료 뒤 상태를 나눠요.
7. 같은 동작을 두세 번 반복해 각 generation에 계속 남는 타입을 비교해요.

| generation 구간       | 기대하는 관찰                                                     |
| --------------------- | ----------------------------------------------------------------- |
| 기준 → 화면 열기      | View Controller, image, task와 cell이 만들어질 수 있어요.         |
| 화면 열기 → 화면 닫기 | 화면 전용 객체 대부분이 deallocate되어야 해요.                    |
| 2회·3회 반복          | 의도하지 않은 같은 타입의 live allocation이 누적되지 않아야 해요. |

generation 사이에 만들어진 모든 allocation이 해당 기능의 것은 아니에요. system과 background activity도 함께 기록될 수 있으므로 type, size, backtrace와 반복 패턴을 함께 확인하세요.

## Leaks가 찾는 것과 찾지 못하는 것을 구분해요

Leaks instrument는 앱의 memory를 주기적으로 scan해 할당됐지만 도달할 수 없는 영역을 보고하고 allocation stack을 제공해요. C API로 할당한 memory를 free하지 않은 경우나 외부 참조가 끊긴 retain cycle을 찾는 데 도움이 돼요.

그러나 다음 memory 증가는 Leaks에 나타나지 않을 수 있어요.

- 전역 dictionary가 계속 보관하는 이미지 cache
- 화면은 사라졌지만 coordinator가 실수로 계속 참조하는 View Controller
- 완료되지 않은 task가 붙잡은 큰 response
- 필요 없어졌지만 reachable 상태인 model graph
- 기능 중 잠깐 발생하는 매우 큰 transient buffer

Apple의 [Making changes to reduce memory use](https://developer.apple.com/documentation/xcode/making-changes-to-reduce-memory-use)도 앱이 접근 가능하지만 사용하지 않는 memory는 사용량을 높여도 Leaks 같은 leak detection tool에 나타나지 않을 수 있다고 설명해요. “Leaks가 0이므로 memory 문제가 없다”는 결론을 내리면 안 돼요.

## Memory Graph로 retain cycle을 따라가요

다음 View Model은 자신이 저장한 closure가 다시 자신을 strong capture해 cycle을 만들어요.

```swift
final class PhotoDetailViewModel {
  var onRefresh: (() -> Void)?
  private(set) var title = ""

  func start() {
    onRefresh = {
      self.title = "새로고침 완료"
    }
  }

  deinit {
    print("PhotoDetailViewModel deinit")
  }
}
```

참조 관계는 다음과 같아요.

```text
PhotoDetailViewModel
  └─ strong → onRefresh closure
                   └─ strong → PhotoDetailViewModel
```

화면을 닫은 뒤 `deinit`이 호출되지 않고 같은 타입이 Generations에 남는다면 Xcode의 Debug Memory Graph 버튼으로 snapshot을 만들어요.

1. 검색창에서 `PhotoDetailViewModel`을 찾아요.
2. 의도보다 많은 instance가 남았는지 확인해요.
3. instance를 선택해 incoming strong reference path를 따라가요.
4. closure context나 coordinator가 소유하는 경로를 source와 대조해요.

closure가 View Model을 소유할 필요가 없다면 weak capture로 cycle을 끊을 수 있어요.

```swift
func start() {
  onRefresh = { [weak self] in
    self?.title = "새로고침 완료"
  }
}
```

`weak`을 기계적으로 모든 closure에 추가하지 마세요. closure가 실행되는 동안 객체가 반드시 살아 있어야 하는 소유 관계라면 다른 lifecycle 설계가 필요할 수 있어요. `unowned`는 객체가 먼저 해제되면 runtime crash가 발생할 수 있으므로 수명이 논리적으로 보장될 때만 사용해요.

### deinit log는 단서이지 전체 검사가 아니에요

`deinit`에 breakpoint나 임시 log를 넣으면 화면 전용 객체가 해제되는지 빠르게 확인할 수 있어요. 그러나 모든 allocation이 Swift class는 아니고 compiler 최적화와 object lifecycle에 따라 timing이 달라질 수 있어요. 최종 원인은 Generations, allocation stack과 reference graph로 확인하세요.

## transient memory peak를 줄여요

leak이 없어도 큰 image나 file을 한꺼번에 처리하면 peak가 높아질 수 있어요. 다음 패턴을 확인하세요.

- 원본 image, 변환 image와 encoded `Data`를 동시에 오래 보관해요.
- 큰 배열을 `map`, `filter`, `sorted`로 연속 변환해 중간 buffer를 만들어요.
- loop 안의 Objective-C autoreleased object가 iteration 끝까지 쌓여요.
- 전체 file을 memory에 올린 뒤 다시 복사해요.
- 화면 크기보다 훨씬 큰 image를 decode해요.

대안은 원인에 따라 달라요.

- image를 실제 표시 크기에 맞춰 downsample해요.
- stream이나 chunk 단위 API로 전체 buffer 동시 보유를 피합니다.
- 중간 collection 수명 범위를 줄이고 필요한 경우 lazy sequence를 검토해요.
- 독립적인 큰 작업 iteration에 `autoreleasepool`이 도움이 되는지 trace로 확인해요.
- cache에 count 또는 cost limit과 memory pressure 정리 정책을 둬요.

작업을 여러 chunk로 나누면 총 allocation 횟수나 I/O가 늘어날 수도 있어요. peak만 줄인 뒤 CPU와 latency가 크게 나빠지지 않았는지 함께 측정하세요.

## async task가 객체 수명을 늘리는지 확인해요

비동기 작업은 시작한 화면보다 오래 살아남을 수 있어요. task closure가 View Model이나 큰 입력을 capture하고 취소되지 않으면 화면을 닫은 뒤에도 memory가 유지될 수 있어요.

다음 항목을 Allocations와 Swift Tasks에서 함께 확인하세요.

- 화면 종료 시 task를 취소하는 lifecycle이 있는지
- 취소가 underlying operation까지 전달되는지
- task가 큰 `Data`, image 배열이나 actor를 capture하는지
- continuation이 모든 경로에서 resume되는지
- Alive Tasks와 같은 타입의 live allocation이 함께 증가하는지

task가 살아 있다는 사실만으로 leak은 아니에요. background upload처럼 의도된 lifetime일 수 있어요. 중요한 것은 누가 task를 소유하고 언제 끝나야 하는지 코드와 trace에서 설명할 수 있는가예요.

## 도구별 역할을 비교해요

| 도구               | 가장 잘 답하는 질문                               | 놓칠 수 있는 것                                |
| ------------------ | ------------------------------------------------- | ---------------------------------------------- |
| Xcode memory gauge | 언제 footprint와 peak가 증가하나요?               | 구체적인 allocation type과 소유 경로           |
| Allocations        | 어떤 type이 어디서 얼마나 만들어지고 살아 있나요? | 현재 strong reference chain의 의미             |
| Generations        | 기능 전후와 반복 사이에 무엇이 계속 남나요?       | generation 밖에서 만들어진 오래된 객체의 원인  |
| Leaks              | 도달할 수 없고 해제되지 않은 memory가 있나요?     | reachable cache와 필요 없지만 참조가 남은 객체 |
| Memory Graph       | 현재 snapshot에서 누가 객체를 참조하나요?         | 시간에 따른 allocation rate와 transient peak   |
| Swift Tasks        | task lifetime이 객체와 작업을 오래 붙잡고 있나요? | heap allocation 전체의 크기와 종류             |

## 흔한 실수를 피해야 해요

### memory가 증가하면 모두 retain cycle이라고 단정하지 않아요

large buffer, cache, VM mapping과 framework memory도 footprint를 높일 수 있어요. 증가 모양과 allocation category를 먼저 분류하세요.

### object count만 보고 byte 비용을 놓치지 않아요

작은 객체 수천 개보다 큰 image buffer 몇 개가 더 많은 memory를 사용할 수 있어요. live count와 persistent bytes를 함께 정렬해요.

### 화면을 닫자마자 snapshot 하나만 보지 않아요

animation, async cleanup과 autorelease drain이 끝날 시간을 주고 반복 결과를 비교하세요. 단, 무작정 오래 기다려 문제를 숨기지 말고 앱 lifecycle에서 기대하는 해제 시점을 먼저 정해요.

### Leaks 결과만으로 통과 여부를 정하지 않아요

reachable하지만 사용하지 않는 cache와 객체는 leak scan에 잡히지 않을 수 있어요. Allocations의 persistent growth와 Memory Graph를 함께 사용하세요.

### 최적화 전후 조건을 바꾸지 않아요

같은 image 크기, 반복 횟수, 기기와 화면 경로에서 peak와 바닥을 비교하세요. cache가 warm한 after run과 cold baseline을 비교하면 잘못된 개선처럼 보일 수 있어요.

## 적용 순서를 정리해요

1. memory가 증가하는 기능과 반복 절차를 고정해요.
2. gauge에서 transient, persistent와 plateau 모양을 구분해요.
3. Allocations를 기록하고 Generations로 기능 전후를 나눠요.
4. 남은 type의 live count, bytes와 allocation backtrace를 확인해요.
5. Leaks 결과와 Memory Graph의 incoming reference를 대조해요.
6. retain cycle, reachable cache, task lifetime과 peak buffer 중 원인을 분류해요.
7. 가장 큰 원인을 하나 고치고 같은 조건으로 다시 기록해요.
8. memory 감소가 CPU, latency와 기능 lifecycle을 해치지 않았는지 확인해요.

## 면접에서 이어질 수 있는 질문

### Allocations와 Leaks는 무엇이 다른가요?

Allocations는 만들어진 heap과 anonymous VM allocation의 수, 크기, 수명과 생성 stack을 폭넓게 기록해요. Leaks는 그중 앱에서 도달할 수 없지만 해제되지 않은 memory를 찾아 보고하므로 reachable cache와 모든 persistent growth를 잡지는 못해요.

### Leaks가 0이면 메모리 문제가 없나요?

아니에요. 앱이 참조는 유지하지만 더는 사용하지 않는 객체, 제한 없는 cache와 transient peak는 Leaks에 표시되지 않을 수 있어요. footprint 모양, Generations와 Memory Graph를 함께 확인해야 해요.

### Generations는 왜 사용하나요?

recording 전체 allocation에서 특정 기능 사이에 만들어진 객체를 상대적으로 분리하기 위해 사용해요. 기능 전, 실행 후, 화면 종료 후에 mark하고 반복하면 매번 새로 남는 type과 allocation stack을 찾기 쉬워져요.

### Memory Graph와 allocation backtrace는 무엇이 다른가요?

allocation backtrace는 객체가 만들어진 과거의 호출 경로를 보여 줘요. Memory Graph는 snapshot 시점에 어떤 객체가 strong reference로 붙잡고 있는지 보여 주므로 생성 원인과 현재 소유 원인을 서로 보완해요.

### weak와 unowned 중 무엇을 선택해야 하나요?

참조 대상이 먼저 해제될 수 있으면 `weak`으로 optional 접근을 사용해요. closure가 실행되는 동안 대상이 반드시 살아 있다는 수명 규칙을 증명할 수 있을 때만 `unowned`를 선택하며, 보장이 깨지면 crash가 발생할 수 있어요.

## 참고 자료

- [Apple Developer — Gathering information about memory use](https://developer.apple.com/documentation/xcode/gathering-information-about-memory-use)
- [Apple Developer — Making changes to reduce memory use](https://developer.apple.com/documentation/xcode/making-changes-to-reduce-memory-use)
- [WWDC24 — Analyze heap memory](https://developer.apple.com/videos/play/wwdc2024/10173/)
- [WWDC21 — Detect and diagnose memory issues](https://developer.apple.com/videos/play/wwdc2021/10180/)
- [Apple Developer — Diagnosing memory, thread, and crash issues early](https://developer.apple.com/documentation/xcode/diagnosing-memory-thread-and-crash-issues-early)
- [Apple Developer — Finding Memory Leaks](https://developer.apple.com/library/archive/documentation/Performance/Conceptual/ManagingMemory/Articles/FindingLeaks.html)
