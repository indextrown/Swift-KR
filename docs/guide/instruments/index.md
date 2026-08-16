---
title: Xcode Instruments 시작하기
description: Xcode의 Product > Profile에서 Instruments trace를 기록하고 timeline, inspection range, detail view를 읽어 성능 문제를 재현·분석·검증하는 기본 흐름을 설명합니다.
---

# Xcode Instruments 시작하기

> **면접 답변 한 줄 요약:** Instruments는 실행 중인 앱의 CPU, 메모리, task, thread, 응답성 같은 데이터를 시간축에 기록하고, 느린 구간의 원인을 실제 측정값으로 좁혀 가는 Xcode 성능 분석 도구예요.

앱이 “느린 것 같다”는 느낌만으로는 무엇을 고쳐야 할지 결정하기 어려워요. 같은 1초의 지연도 CPU 계산이 길어서 생길 수 있고, 파일이나 lock을 기다려 생길 수 있으며, 네트워크 응답이나 Main Actor 경합 때문일 수도 있어요.

Instruments는 하나의 정답을 자동으로 알려 주는 도구가 아니에요. **증상을 재현하고, 관련 구간을 좁히고, 적절한 instrument의 상세 데이터를 읽어 가설을 검증하는 도구**예요. Apple도 성능 개선을 현재 상태 측정, 중요한 문제 선택, profiling, 변경, 재측정의 반복 과정으로 설명해요. 자세한 흐름은 [Improving your app’s performance](https://developer.apple.com/documentation/xcode/improving-your-app-s-performance/)에서 확인할 수 있어요.

이 섹션에서는 다음 내용을 다뤄요.

- Instruments를 열고 trace를 기록하는 기본 순서
- timeline, track, inspection range, detail view를 읽는 방법
- 질문에 맞는 template과 instrument를 고르는 기준
- 비동기 메서드의 전체 지연 시간을 측정하는 방법
- CPU 병목, 메모리 증가, UI 멈춤을 분석하는 방법
- 수정 전후 trace를 비교해 개선을 검증하는 방법

## 먼저 알아둘 Instruments 용어

| 용어                    | 쉬운 뜻                                                                                                                                  |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| profiling               | 실행 중인 앱의 자원 사용과 호출 정보를 기록해 성능 특성을 조사하는 일이에요.                                                             |
| instrument              | CPU sample, allocation, Swift task처럼 한 종류의 데이터를 수집하고 보여 주는 측정 도구예요.                                              |
| template                | 목적에 맞는 여러 instrument와 기본 설정을 묶은 시작 구성이에요. Time Profiler, Allocations, Swift Concurrency 등이 있어요.               |
| trace와 run             | trace는 Instruments 문서 전체이고, run은 Record부터 Stop까지 한 번 수집한 결과예요. 한 trace 안에 여러 run을 기록할 수 있어요.           |
| timeline과 track        | timeline은 시간이 왼쪽에서 오른쪽으로 흐르는 영역이고, track은 CPU, Hangs, Points of Interest처럼 한 종류의 변화를 한 줄로 표시해요.     |
| inspection range        | 현재 분석 대상으로 선택한 시간 구간이에요. detail view의 통계와 call tree는 이 범위를 기준으로 다시 계산돼요.                            |
| detail view와 inspector | detail view는 선택한 track의 표, call tree, flame graph를 보여 주고, inspector는 선택한 event나 symbol의 추가 정보를 보여 줘요.          |
| call tree               | 호출한 함수와 호출된 함수의 관계를 계층으로 묶은 표예요. CPU sample이나 task 생성 backtrace를 코드 경로로 읽을 때 사용해요.              |
| symbolication           | 기계 주소를 `PhotoRepository.load()` 같은 함수 이름과 소스 위치로 바꾸는 과정이에요. 알맞은 debug symbol이 없으면 주소만 보일 수 있어요. |
| baseline                | 최적화 전의 기준 측정값이에요. 같은 조건의 수정 후 결과와 비교해야 실제 개선인지 판단할 수 있어요.                                       |

## 먼저 질문을 정하고 instrument를 골라요

template 이름부터 고르면 눈앞의 그래프에 맞춰 문제를 해석하기 쉬워요. 먼저 사용자가 겪는 증상과 알고 싶은 값을 문장으로 적어 보세요.

| 알고 싶은 것                                       | 먼저 선택할 도구                    | 이 도구가 답하는 질문                                                 |
| -------------------------------------------------- | ----------------------------------- | --------------------------------------------------------------------- |
| 특정 `async` 메서드가 끝날 때까지 몇 초 걸리나요?  | `OSSignposter`와 Points of Interest | `await`로 중단된 시간을 포함한 시작부터 종료까지의 지연은 얼마인가요? |
| task가 왜 늦게 실행되거나 어디서 중단되나요?       | Swift Concurrency의 Swift Tasks     | task의 수명, 상태 변화, 부모·자식 관계는 어떤가요?                    |
| 실행 중 CPU를 가장 많이 쓰는 코드는 무엇인가요?    | CPU Profiler 또는 Time Profiler     | CPU가 코드를 실행할 때 자주 관측되는 호출 경로는 무엇인가요?          |
| 화면이 터치에 늦게 반응하는 이유는 무엇인가요?     | Hangs, Time Profiler, System Trace  | Main Thread가 계산 중인가요, 다른 자원을 기다리나요?                  |
| 기능을 반복할수록 메모리가 늘어나는 이유는 뭔가요? | Allocations의 Generations, Leaks    | 어떤 allocation이 살아남고, 도달할 수 없는 누수는 무엇인가요?         |
| 네트워크 요청과 응답 구간이 느린가요?              | Network template와 URLSession 지표  | 연결, 전송, 응답 단계 중 어디서 시간이 걸리나요?                      |
| 배터리를 많이 쓰는 원인은 무엇인가요?              | Power Profiler                      | CPU, GPU, network, wake-up 가운데 전력 영향이 큰 활동은 무엇인가요?   |

한 trace 문서에 instrument를 더 추가할 수도 있어요. 예를 들어 Hangs가 표시된 구간에 Swift Tasks를 추가하면 Main Actor에서 실행된 비동기 작업을 함께 볼 수 있어요. 그러나 처음부터 모든 instrument를 넣으면 기록 비용과 화면 복잡도가 커지므로 현재 가설을 검증하는 도구부터 선택하세요.

## 측정 전에 재현 절차를 고정해요

좋은 trace는 Record 버튼을 누르기 전에 결정돼요. “앱을 둘러본다”보다 다음처럼 시작과 끝이 분명한 절차를 준비하세요.

```text
앱을 완전히 종료한다
  → 사진 목록을 연다
  → 첫 번째 사진을 선택한다
  → 편집 화면이 나타날 때까지 기다린다
  → Stop을 누른다
```

측정 조건도 함께 기록해요.

- 앱 commit과 build configuration
- Xcode, iOS와 기기 모델
- 네트워크 종류와 cache가 비어 있는지 여부
- 로그인 상태와 사용한 테스트 데이터
- 발열 상태와 저전력 모드 여부
- 첫 실행인지, 한 번 준비한 뒤의 반복 실행인지

Simulator는 빠른 반복과 기능 확인에는 유용하지만 Mac의 CPU와 자원을 사용해요. Apple은 실제 성능을 판단할 때 물리 기기에서 더 높은 충실도의 측정을 얻을 수 있다고 안내해요. 특히 문제가 특정 저사양 기기에서 발생하면 그 기기에서 다시 측정하세요. 자세한 내용은 [Running your app on simulated or physical devices](https://developer.apple.com/documentation/xcode/running-your-app-on-simulated-or-physical-devices)와 [Improving your app’s performance](https://developer.apple.com/documentation/xcode/improving-your-app-s-performance/)에서 확인할 수 있어요.

## Product > Profile로 trace를 기록해요

Xcode 프로젝트에서 앱을 profiling하는 기본 흐름은 다음과 같아요.

1. Xcode toolbar에서 scheme과 측정할 물리 기기를 선택해요.
2. `Product > Scheme > Edit Scheme`의 Profile action이 의도한 build configuration을 사용하는지 확인해요.
3. `Product > Profile`을 선택하거나 `Command-I`를 눌러요.
4. template 선택 창에서 현재 질문에 맞는 template을 골라 `Choose`를 눌러요.
5. Instruments toolbar의 target이 원하는 기기와 앱인지 확인해요.
6. 왼쪽 위 Record 버튼을 누르고 준비한 절차만 재현해요.
7. 문제가 나타나면 Stop을 눌러 기록을 끝내요.

Instruments 앱을 `Xcode > Open Developer Tool > Instruments`로 직접 열고 target을 선택할 수도 있어요. 처음에는 Xcode의 `Product > Profile`이 scheme, build와 target을 자연스럽게 이어 주므로 더 단순해요. 전체 UI의 기본 사용법은 Apple의 [Getting Started with Instruments](https://developer.apple.com/videos/play/wwdc2019/411/)에서도 단계별로 볼 수 있어요.

### Profile build와 symbol을 확인해요

Debug build는 최적화되지 않은 코드, 진단 기능과 debugger의 영향 때문에 배포 코드와 다른 결과를 낼 수 있어요. Profile action은 보통 Release configuration을 사용하지만 프로젝트에서 바꿀 수 있으므로 Scheme Editor에서 직접 확인하세요.

최적화된 build를 읽으려면 debug symbol도 필요해요. Release binary와 dSYM은 build UUID가 일치해야 하고, 앱과 포함된 framework마다 대응하는 dSYM이 있어요. 함수 이름 대신 주소만 보인다면 다음 항목을 확인하세요.

- `Debug Information Format`이 `DWARF with dSYM File`인지
- 분석 중인 binary와 dSYM이 같은 archive에서 나왔는지
- Instruments의 `File > Symbols`에 올바른 dSYM이 연결됐는지

자세한 symbol 생성과 보관 기준은 [Building your app to include debugging information](https://developer.apple.com/documentation/xcode/building-your-app-to-include-debugging-information)에서 확인할 수 있어요.

## timeline에서 문제 구간을 먼저 좁혀요

전체 recording의 call tree를 바로 펼치면 앱 시작, 화면 전환, background 작업이 모두 섞여요. 다음 순서로 관심 구간부터 제한하세요.

1. timeline에서 증상이 발생한 track을 찾아요.
2. 마우스로 시작과 끝을 드래그해 inspection range를 선택해요.
3. `Option`을 누른 채 범위를 드래그하거나 관련 메뉴로 확대해요.
4. 분석하려는 track을 선택해 아래 detail view를 바꿔요.
5. table, call tree 또는 flame graph에서 무거운 항목을 찾고 source로 이동해요.

`OSSignposter`로 “LoadFeed” 같은 interval을 남겨 두면 사용자 동작을 눈으로 추측하지 않아도 돼요. interval을 inspection range로 설정하면 같은 구간의 CPU, thread, task 데이터도 함께 걸러져요. 비동기 측정 코드는 [비동기 메서드 시간 측정](./async-method-timing.md) 문서에서 자세히 다뤄요.

## timeline, detail view, inspector의 역할을 나눠 읽어요

Instruments 화면은 다음 질문 순서로 읽으면 덜 복잡해요.

```text
Timeline
  “언제 이상했나요?”
        ↓ 범위를 선택
Detail View
  “그 구간에서 무엇이 많거나 무거웠나요?”
        ↓ 항목을 선택
Inspector / Source Viewer
  “어떤 코드 경로와 상태가 이 결과를 만들었나요?”
```

timeline의 높이가 크다는 이유만으로 원인을 확정하지 마세요. CPU graph가 높다면 call tree로 앱 코드를 찾아야 하고, Hangs 표시가 있다면 Main Thread가 실행 중인지 blocked 상태인지 추가로 구분해야 해요. instrument마다 수집 방식과 weight의 의미도 달라요.

## 한 번의 수치보다 반복 가능한 비교를 만들어요

성능은 background process, cache, 네트워크와 발열에 따라 달라져요. 하나의 가장 빠른 결과만 골라 결론 내리지 말고 다음 과정을 사용하세요.

1. 준비 실행으로 shader, cache와 lazy initialization 영향을 구분해요.
2. 같은 입력과 조작으로 여러 번 기록해 분포와 이상치를 봐요.
3. 개선 전 trace를 baseline으로 저장해요.
4. 한 번에 하나의 중요한 변경만 적용해요.
5. 같은 기기와 조건에서 다시 기록해요.
6. 목표 구간뿐 아니라 메모리, 응답성, 전력의 부작용도 확인해요.

Instruments의 run comparison을 사용할 수 있는 버전이라면 같은 trace의 이전 run과 새 run을 비교하세요. 자동 회귀 검사가 필요하면 Instruments에서 찾은 구간을 XCTest 또는 Swift Testing의 성능 test로 옮겨 지속적으로 측정하는 편이 좋아요.

## 흔한 실수를 피해야 해요

### recording 전체의 가장 무거운 함수를 바로 고치지 않아요

앱이 오래 머문 idle loop나 시작 과정이 사용자 문제와 무관할 수 있어요. 먼저 증상 구간을 inspection range로 제한하세요.

### sample 수를 메서드의 정확한 실행 시간으로 읽지 않아요

Time Profiler와 CPU Profiler는 모든 함수 호출을 stopwatch처럼 재는 도구가 아니에요. call stack을 sample해 CPU 비용의 비중을 추정해요. 한 비동기 메서드의 시작부터 끝까지 걸린 시간은 signpost interval로 표시하세요.

### CPU가 낮으면 코드가 빠르다고 단정하지 않아요

thread가 file I/O, lock, network나 actor를 기다리면 사용자는 느리다고 느끼지만 CPU graph는 낮을 수 있어요. 이때는 System Trace, Network 또는 Swift Concurrency instrument가 더 적합해요.

### Simulator 결과를 기기 시간으로 일반화하지 않아요

Simulator와 실제 기기는 CPU, GPU, memory pressure와 thermal 조건이 달라요. Simulator는 가설을 빠르게 확인하는 도구로 사용하고 최종 판단은 목표 기기에서 검증하세요.

### 개선 후 재측정을 생략하지 않아요

코드가 단순해졌다는 이유만으로 성능이 좋아졌다고 단정할 수 없어요. 같은 절차의 after trace를 만들고 baseline과 비교하세요.

## 문제별 다음 문서를 선택해요

- `async` 함수의 전체 지연과 task 중단 구간을 알고 싶다면 [비동기 메서드 시간 측정](./async-method-timing.md)을 읽어요.
- CPU를 실제로 많이 사용하는 함수와 call path를 찾고 싶다면 [CPU Profiler와 Time Profiler](./cpu-profiling.md)를 읽어요.
- 반복 동작 뒤 살아남는 객체와 누수를 찾고 싶다면 [Allocations와 Leaks](./memory-profiling.md)를 읽어요.
- 터치나 화면 전환이 멈추는 원인을 찾고 싶다면 [Hangs와 앱 응답성](./responsiveness-and-hangs.md)을 읽어요.

## 적용 순서를 정리해요

1. 사용자가 느끼는 증상을 한 문장으로 적어요.
2. 시작과 끝이 분명한 재현 절차와 목표 기기를 정해요.
3. 질문에 맞는 가장 작은 template을 선택해요.
4. Record, 재현, Stop 순서로 짧은 trace를 만들어요.
5. timeline에서 문제 구간을 inspection range로 제한해요.
6. detail view와 source에서 원인 가설을 세워요.
7. 한 가지 변경을 적용하고 같은 조건으로 다시 기록해요.
8. baseline과 비교해 개선과 부작용을 함께 확인해요.

## 면접에서 이어질 수 있는 질문

### Instruments와 Xcode debugger는 무엇이 다른가요?

debugger는 breakpoint에서 실행을 멈추고 값과 제어 흐름을 조사하는 데 적합해요. Instruments는 앱을 계속 실행하면서 시간에 따른 CPU, memory, task, thread와 응답성 데이터를 수집해 성능 특성을 분석해요.

### Time Profiler에서 가장 위에 있는 함수가 항상 문제인가요?

아니에요. recording 전체가 아니라 사용자가 느낀 문제 구간으로 inspection range를 제한하고, 앱 코드인지와 self weight·호출 경로를 함께 봐야 해요. CPU가 아닌 대기 문제라면 Time Profiler의 무거운 함수가 원인이 아닐 수도 있어요.

### 왜 실제 기기에서 다시 측정해야 하나요?

Simulator는 Mac의 하드웨어와 운영 환경을 사용하므로 기기의 CPU, GPU, memory pressure와 thermal 특성을 그대로 재현하지 못해요. 최종 성능 판단은 사용자가 실제로 실행할 기기, 특히 문제가 발생하는 기기 등급에서 해야 해요.

### dSYM은 profiling에 왜 필요한가요?

dSYM은 최적화된 binary의 기계 주소를 함수와 소스 위치로 바꾸는 debug symbol을 담아요. binary와 UUID가 맞는 dSYM이 없으면 call tree가 주소나 알아보기 어려운 symbol로 표시돼 원인 코드를 찾기 어려워요.

## 참고 자료

- [Apple Developer — Instruments Tutorials](https://developer.apple.com/tutorials/instruments)
- [WWDC19 — Getting Started with Instruments](https://developer.apple.com/videos/play/wwdc2019/411/)
- [Apple Developer — Improving your app’s performance](https://developer.apple.com/documentation/xcode/improving-your-app-s-performance/)
- [Apple Developer — Performance and metrics](https://developer.apple.com/documentation/xcode/performance-and-metrics)
- [Apple Developer — Running your app on simulated or physical devices](https://developer.apple.com/documentation/xcode/running-your-app-on-simulated-or-physical-devices)
- [Apple Developer — Customizing the build schemes for a project](https://developer.apple.com/documentation/xcode/customizing-the-build-schemes-for-a-project)
- [Apple Developer — Building your app to include debugging information](https://developer.apple.com/documentation/xcode/building-your-app-to-include-debugging-information)
