---
title: CPU Profiler와 Time Profiler로 병목 찾기
description: Instruments의 CPU Profiler와 Time Profiler가 call stack을 sampling하는 방식을 이해하고 call tree, flame graph, Weight와 Self Weight로 Swift CPU 병목을 찾는 방법을 설명합니다.
---

# CPU Profiler와 Time Profiler로 병목 찾기

> **면접 답변 한 줄 요약:** CPU profiling은 실행 중인 call stack을 반복해서 sample하고 자주 관측되는 함수와 호출 경로를 찾아, CPU 시간을 크게 차지하는 병목부터 측정 기반으로 최적화하는 과정이에요.

느린 메서드 이름을 알고 있어도 그 메서드 자체가 비싼지, 내부에서 호출한 정렬이나 decode가 비싼지는 코드만 보고 확정하기 어려워요. 반대로 앱 전체에서 CPU를 많이 쓰는 함수만 찾으면 사용자가 기다리는 기능과 무관한 background 작업을 고칠 수 있어요.

CPU profiling에서는 두 범위를 함께 정해야 해요.

1. 사용자가 문제를 겪은 **시간 구간**을 signpost나 timeline으로 고정해요.
2. 그 구간의 call tree에서 **CPU sample이 집중된 호출 경로**를 찾아요.

이 문서에서는 현재 Instruments에서 널리 사용하는 Time Profiler와 Apple silicon의 CPU Profiler를 중심으로 설명해요. 특정 Xcode나 기기에서 CPU Profiler template이 보이지 않으면 Time Profiler로 같은 조사 흐름을 시작할 수 있어요.

## 먼저 알아둘 CPU profiling 용어

| 용어                | 쉬운 뜻                                                                                                                                             |
| ------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| CPU-bound           | 처리 속도가 network나 disk 대기보다 CPU 계산량에 주로 제한되는 상태예요.                                                                            |
| sample              | profiler가 특정 순간에 CPU에서 실행 중인 thread의 call stack을 관측한 한 번의 기록이에요.                                                           |
| call stack          | 현재 함수에 도달하기까지 겹쳐진 함수 호출 순서예요.                                                                                                 |
| call tree           | 여러 call stack sample을 같은 호출 경로끼리 합쳐 계층으로 보여 주는 표예요.                                                                         |
| Weight              | 한 함수와 그 아래에서 호출한 함수까지 포함해 부여된 CPU sample 비중이에요. 정확한 stopwatch duration이 아니라 profiler 방식에 따른 추정 비용이에요. |
| Self Weight         | 하위 함수에 넘긴 sample을 제외하고 그 함수 본문 자체에 귀속된 비중이에요.                                                                           |
| flame graph         | call stack을 막대 너비로 시각화한 그래프예요. 넓은 막대일수록 선택한 weight 기준에서 더 많은 sample이 포함돼요.                                     |
| aliasing            | 일정 주기의 profiler sample과 앱의 반복 작업 주기가 우연히 맞아 특정 함수가 실제보다 과대·과소 표현되는 sampling 왜곡이에요.                        |
| on-CPU와 off-CPU    | on-CPU는 실제 명령을 실행 중인 상태이고, off-CPU는 lock, I/O, sleep나 scheduling 때문에 실행되지 않는 상태예요.                                     |
| hot path와 hot spot | hot path는 비용이 누적되는 무거운 호출 경로이고, hot spot은 sample이 집중된 함수나 코드 영역이에요.                                                 |

## Time Profiler와 CPU Profiler의 sampling 기준이 달라요

두 instrument 모두 call stack sample을 모아 call tree와 flame graph로 보여 주지만 sample을 발생시키는 기준이 달라요.

| 비교 기준     | Time Profiler                                                         | CPU Profiler                                                        |
| ------------- | --------------------------------------------------------------------- | ------------------------------------------------------------------- |
| sampling 기준 | 일정한 시간 간격으로 실행 중인 thread stack을 관측해요.               | Apple silicon CPU별 cycle counter를 기반으로 독립적으로 sample해요. |
| 강점          | 시간에 따른 thread 활동과 CPU 사용을 폭넓게 보기 좋아요.              | 순수 CPU 비용을 더 공정하게 가중해 최적화 대상을 찾는 데 유리해요.  |
| 주의점        | 주기적인 작업과 sampler 주기가 겹치는 aliasing이 생길 수 있어요.      | 지원 Xcode와 Apple silicon 환경을 확인해야 해요.                    |
| 공통 한계     | 모든 함수 호출을 기록하지 않으므로 짧거나 드문 호출을 놓칠 수 있어요. | 모든 함수 호출의 정확한 duration을 자동으로 제공하는 것은 아니에요. |

Apple은 [Optimize CPU performance with Instruments](https://developer.apple.com/videos/play/wwdc2025/308/)에서 CPU 최적화가 목적이라면 Time Profiler의 timer sampling보다 CPU별로 sampling하는 CPU Profiler를 선호하도록 안내해요. 반면 UI 멈춤이 언제 발생했고 thread가 어떻게 움직였는지 넓게 볼 때는 Time Profiler template이 좋은 출발점이 될 수 있어요.

### Processor Trace는 더 깊은 단계의 도구예요

Processor Trace는 sampling 대신 지원 기기의 hardware branch trace로 user-space의 함수 실행 흐름을 재구성해요. 짧은 함수 한 번의 호출과 compiler가 생성한 ARC 코드까지 조사할 수 있지만 지원 hardware와 OS 조건이 있고 매우 많은 trace 데이터를 만들 수 있어요.

처음부터 Processor Trace로 들어가기보다 다음 순서를 사용하세요.

1. signpost와 CPU Profiler 또는 Time Profiler로 중요한 구간을 찾습니다.
2. 불필요한 작업 제거, cache와 알고리즘 변경을 먼저 검토합니다.
3. 여전히 CPU-bound인 짧은 핵심 구간의 instruction-level 비용이 필요할 때 Processor Trace와 CPU Counters를 검토합니다.

지원 조건과 기록 방법은 [Analyzing CPU usage with the Processor Trace instrument](https://developer.apple.com/documentation/xcode/analyzing-cpu-usage-with-processor-trace)에서 확인하세요.

## 최적화할 사용자 시나리오를 먼저 고정해요

CPU graph 전체가 높다는 사실만으로 어떤 코드를 고칠지 결정할 수 없어요. 예를 들어 이미지 검색 결과가 나타나는 시간이 문제라면 다음처럼 경계를 정해요.

```text
검색 버튼 탭
  → local index 검색
  → 결과 정렬
  → cell model 생성
  → 첫 결과 화면 표시
```

이 구간을 `OSSignposter`의 “SearchPhotos” interval로 표시하면 profiling 결과를 같은 경계로 반복해서 볼 수 있어요. signpost 작성법은 [비동기 메서드 시간 측정](./async-method-timing.md)에서 설명해요.

측정 전에는 다음 조건도 확인하세요.

- Profile action이 최적화된 configuration을 사용하는지
- 앱과 framework의 symbol을 읽을 수 있는지
- 같은 입력 데이터와 검색어를 사용하는지
- 물리 기기의 thermal 상태가 비슷한지
- 첫 실행 준비 비용과 반복 실행 비용을 구분했는지

## CPU trace를 기록해요

Time Profiler를 기준으로 기본 순서를 따라가 볼게요. CPU Profiler에서도 inspection range와 call tree를 읽는 핵심 흐름은 같아요.

1. Xcode에서 scheme과 물리 기기를 선택해요.
2. `Product > Profile`을 실행해요.
3. 넓은 조사는 Time Profiler, CPU 최적화는 지원되는 경우 CPU Profiler template을 선택해요.
4. Record를 누르고 준비한 동작을 반복해 profiler가 충분한 sample을 모으게 해요.
5. Stop을 누르고 signpost나 증상 구간을 찾습니다.
6. 목표 구간만 inspection range로 설정하고 확대해요.
7. app process나 관련 thread track을 선택해 call tree를 열어요.

아주 짧은 코드는 sample 사이에 실행을 끝내 profiler가 놓칠 수 있어요. 이때는 production과 같은 코드를 일정 시간 반복하는 benchmark harness를 만들되, 반복문 자체나 test framework 비용이 결과를 지배하지 않는지 확인하세요. 실제 기능의 latency를 인위적인 반복 횟수로 대신하지 말고 CPU hotspot을 안정적으로 sample하기 위한 용도로만 사용해요.

## call tree에서 Weight와 Self Weight를 나눠 봐요

다음 호출 관계를 생각해 볼게요.

```text
SearchViewModel.search()
└─ PhotoRepository.search()
   ├─ Array.filter(_:)
   └─ Array.sorted(by:)
```

`PhotoRepository.search()`의 Weight가 높지만 Self Weight가 낮다면 실제 CPU sample은 `filter`와 `sorted` 같은 하위 호출에 있을 가능성이 커요. 반대로 Self Weight도 높다면 repository 함수 본문의 loop, hash 계산이나 값 복사가 직접 비용을 만들 수 있어요.

| 관찰 결과                           | 해석과 다음 행동                                                           |
| ----------------------------------- | -------------------------------------------------------------------------- |
| Weight와 Self Weight가 모두 높아요. | 함수 본문 자체의 알고리즘, copy와 ARC 비용을 source에서 확인해요.          |
| Weight는 높고 Self Weight는 낮아요. | disclosure를 열어 무거운 callee를 따라가요.                                |
| system library가 가장 무거워요.     | 호출자를 확인해 앱이 API를 너무 자주 또는 잘못된 방식으로 호출하는지 봐요. |
| 앱 코드 sample이 거의 없어요.       | symbolication, inspection range와 target process가 맞는지 먼저 확인해요.   |
| latency는 긴데 CPU sample은 적어요. | I/O, lock, task scheduling 같은 off-CPU 대기를 의심해요.                   |

함수 이름만 보고 system framework 비용을 숨겨 버리면 앱 코드가 어떤 API를 호출했는지 놓칠 수 있어요. 처음에는 전체 경로를 읽고, 원인 범위를 이해한 뒤 `Hide System Libraries`를 사용해 앱 코드에 집중하세요.

## Invert Call Tree로 무거운 leaf를 모아 봐요

일반 call tree는 진입점에서 callee 방향으로 내려가요. 같은 낮은 수준 함수가 여러 경로에서 호출되면 sample이 여러 branch에 나뉘어 보여요. `Invert Call Tree`는 sample이 끝난 leaf 쪽을 위로 올려 같은 hotspot을 찾기 쉽게 해요.

다음 순서가 실용적이에요.

1. 목표 inspection range를 설정해요.
2. app process의 call tree를 선택해요.
3. `Hide System Libraries`로 앱 symbol을 우선 봐요.
4. `Invert Call Tree`를 켜 leaf hotspot을 찾아요.
5. 무거운 symbol을 선택해 callers와 callees를 번갈아 확인해요.
6. `Focus on Subtree`로 관련 경로만 남겨요.
7. Source Viewer에서 sample이 집중된 line을 확인해요.

call tree, flame graph와 Top Functions가 같은 profile을 서로 다른 관점에서 보여 주는 방식은 [Analyzing CPU profiles with call tree views](https://developer.apple.com/documentation/xcode/analyzing-cpu-profiles-with-call-tree-views)에서 자세히 설명해요.

## flame graph에서는 넓이와 호출 깊이를 읽어요

flame graph의 가로 폭은 선택한 weight 기준의 sample 비중이고 세로 방향은 call stack 깊이예요. 시간 순서 그래프가 아니므로 왼쪽 함수 다음에 오른쪽 함수가 실행됐다고 해석하면 안 돼요.

- 넓은 상위 막대는 여러 하위 호출을 포함한 비싼 경로일 수 있어요.
- 넓은 leaf 막대는 특정 함수 자체가 hotspot일 가능성이 있어요.
- 같은 symbol이 여러 위치에 나타나면 서로 다른 caller에서 호출된 것이에요.
- bar가 좁거나 보이지 않는다고 호출이 전혀 없었다는 뜻은 아니에요. sampling 사이에 끝났을 수 있어요.

세부 호출 순서와 정확한 단일 호출 시간을 알아야 한다면 signpost, 지원 기기의 Processor Trace나 별도 benchmark가 필요해요.

## 예제로 반복 정렬 병목을 줄여요

검색할 때마다 전체 사진을 filter하고 정렬하는 코드를 살펴볼게요.

```swift
struct PhotoSearch {
  func search(
    _ photos: [Photo],
    query: String
  ) -> [Photo] {
    photos
      .filter { $0.title.localizedCaseInsensitiveContains(query) }
      .sorted { $0.createdAt > $1.createdAt }
  }
}
```

call tree에서 `sorted(by:)` 아래 비교 closure와 문자열 비교가 반복해서 넓게 보인다고 가정해 볼게요. 곧바로 비교 함수를 미세 최적화하기 전에 작업 자체를 줄일 수 있는지 확인해요.

```swift
struct PhotoIndex {
  private let newestFirst: [Photo]

  init(photos: [Photo]) {
    newestFirst = photos.sorted {
      $0.createdAt > $1.createdAt
    }
  }

  func search(query: String) -> [Photo] {
    newestFirst.filter {
      $0.title.localizedCaseInsensitiveContains(query)
    }
  }
}
```

정렬 결과를 입력이 바뀔 때만 만들면 검색마다 정렬하는 비용을 피할 수 있어요. 대신 index를 보관하는 memory와 데이터 변경 시 갱신 책임이 생겨요. 실제로 좋아졌는지는 같은 사진 수, 검색어와 기기에서 before/after trace를 기록해 검증해야 해요.

### sample 결과만 보고 cache를 무한히 늘리지 않아요

CPU를 줄이기 위한 cache가 memory pressure와 오래된 데이터 문제를 만들 수 있어요. cache hit 비율, 최대 크기, 무효화 시점과 memory trace를 함께 확인하세요. CPU 최적화는 다른 자원의 비용을 옮기는 결정일 수 있어요.

## CPU가 낮은 느림은 다른 instrument로 넘겨요

사용자 latency가 긴데 목표 구간의 CPU 사용이 낮다면 다음 상태를 의심해요.

| 가능한 원인                  | 확인할 도구와 단서                                                 |
| ---------------------------- | ------------------------------------------------------------------ |
| network response 대기        | Network template, URLSession task metrics와 signpost 하위 interval |
| synchronous file I/O         | System Trace의 thread state와 system call                          |
| lock 또는 semaphore 대기     | System Trace에서 blocked thread와 이를 깨우는 thread               |
| actor 또는 executor 대기     | Swift Tasks, Swift Actors와 최신 Instruments의 executor 관련 track |
| Main Thread event 지연       | Hangs track과 Main Thread의 running·blocked 상태                   |
| memory pressure와 page fault | Allocations, VM 관련 instrument와 memory warning                   |

CPU profile은 on-CPU 코드에 답하는 도구예요. off-CPU 대기를 억지로 call tree 안에서 찾지 말고 같은 inspection range에 적합한 instrument를 추가하세요.

## 최적화 순서를 크게 잡아요

Apple의 CPU 성능 세션도 복잡한 micro-optimization보다 불필요한 작업 제거, 중요한 경로 밖으로 미루기, precomputation과 cache, 알고리즘·자료구조 변경을 먼저 검토하도록 권해요.

1. 실행하지 않아도 되는 작업을 제거해요.
2. 사용자 critical path 밖으로 미룰 수 있는지 봐요.
3. 같은 결과를 반복 계산한다면 안전한 cache나 precomputation을 검토해요.
4. 더 나은 알고리즘과 자료구조로 계산량을 줄여요.
5. API 호출 횟수와 값 copy를 줄여요.
6. 마지막에 compiler와 CPU 수준의 micro-optimization을 검토해요.

각 단계에서 before/after를 다시 측정하세요. 더 복잡한 코드로 바꾸었는데 사용자가 느끼는 latency가 달라지지 않았다면 유지보수 비용만 늘어난 셈이에요.

## 흔한 실수를 피해야 해요

### sample 비율을 정확한 함수 duration으로 쓰지 않아요

sampling profiler의 30% weight는 그 함수가 stopwatch로 전체 시간의 정확히 30% 실행됐다는 뜻이 아니에요. 선택 구간과 sampling 방식에서 해당 stack이 관측된 비중으로 읽으세요.

### 호출 횟수가 많은 함수와 느린 함수를 혼동하지 않아요

아주 짧은 함수가 수백만 번 호출되어 hotspot이 될 수 있고, 한 번 호출되지만 대부분 I/O를 기다리는 함수는 CPU sample이 적을 수 있어요. CPU 비용과 elapsed time을 나눠 봐야 해요.

### Release symbol이 없다고 Debug build만 측정하지 않아요

Debug build의 실행 특성은 최적화된 배포 build와 크게 다를 수 있어요. Profile configuration과 dSYM을 바로 구성해 최적화된 code를 symbolicate하세요.

### 평균 기기 한 대만 보지 않아요

성능 목표 기기와 문제가 보고된 기기 등급에서 측정하세요. 최신 기기에서 짧은 구간이 오래된 지원 기기에서는 user-visible hang이 될 수 있어요.

### 가장 넓은 system symbol을 직접 고치려 하지 않아요

system framework 구현은 바꿀 수 없지만 이를 호출하는 앱의 입력 크기, 호출 횟수와 API 선택은 바꿀 수 있어요. caller를 따라 앱 코드의 결정을 찾으세요.

## 적용 순서를 정리해요

1. 느린 사용자 동작을 재현하고 signpost로 경계를 표시해요.
2. 최적화된 build, symbol과 물리 기기를 준비해요.
3. CPU Profiler가 지원되면 CPU 최적화에 사용하고, 넓은 조사는 Time Profiler로 시작해요.
4. 여러 번 실행해 충분한 sample을 수집해요.
5. 목표 interval로 inspection range를 제한해요.
6. Weight와 Self Weight를 나누고 Invert Call Tree로 hotspot을 찾아요.
7. 불필요한 작업, cache, 알고리즘 순서로 큰 개선부터 적용해요.
8. 같은 조건의 after run으로 latency와 CPU 감소를 함께 검증해요.

## 면접에서 이어질 수 있는 질문

### Time Profiler는 함수 실행 시간을 정확히 재나요?

아니에요. Time Profiler는 일정한 시간 간격으로 실행 중인 thread의 call stack을 sample해 CPU 비용의 분포를 추정해요. 특정 함수 한 번의 elapsed time은 signpost나 clock으로 별도 측정해야 해요.

### Weight와 Self Weight는 무엇이 다른가요?

Weight는 함수와 그 함수가 호출한 하위 함수의 sample을 함께 포함해요. Self Weight는 하위 호출을 제외하고 함수 본문 자체에 귀속된 sample이므로, 높은 Weight의 실제 비용이 본문인지 callee인지 구분할 때 사용해요.

### CPU 사용률이 낮은데 앱이 느리면 무엇을 봐야 하나요?

thread나 task가 CPU 밖에서 network, file I/O, lock 또는 actor를 기다리는지 확인해야 해요. System Trace, Network, Swift Tasks와 Hangs를 같은 inspection range에 추가해 blocked 원인을 조사해요.

### Invert Call Tree는 언제 사용하나요?

같은 leaf 함수가 여러 caller 경로에서 호출되어 일반 call tree의 여러 branch에 흩어질 때 사용해요. 무거운 leaf를 위로 모은 뒤 caller를 따라가면 앱의 어떤 경로가 반복 비용을 만드는지 찾기 쉬워요.

### Processor Trace를 언제 사용하나요?

sampling으로 중요한 CPU 구간을 좁혔지만 짧은 함수의 정확한 호출 흐름이나 compiler·runtime 비용까지 확인해야 할 때 사용해요. 지원 hardware와 OS가 필요하고 데이터가 매우 커질 수 있으므로 짧은 핵심 구간에 적용해요.

## 참고 자료

- [WWDC25 — Optimize CPU performance with Instruments](https://developer.apple.com/videos/play/wwdc2025/308/)
- [Apple Developer — Analyzing CPU profiles with call tree views](https://developer.apple.com/documentation/xcode/analyzing-cpu-profiles-with-call-tree-views)
- [Apple Developer — Analyzing CPU usage with the Processor Trace instrument](https://developer.apple.com/documentation/xcode/analyzing-cpu-usage-with-processor-trace)
- [Apple Developer — Addressing CPU bottlenecks](https://developer.apple.com/documentation/xcode/addressing-cpu-bottlenecks)
- [Apple Developer — Improving your app’s performance](https://developer.apple.com/documentation/xcode/improving-your-app-s-performance/)
- [WWDC26 — Profile, fix, and verify: Improve app responsiveness with Instruments](https://developer.apple.com/videos/play/wwdc2026/268/)
- [WWDC25 — Improve memory usage and performance with Swift](https://developer.apple.com/videos/play/wwdc2025/312/)
