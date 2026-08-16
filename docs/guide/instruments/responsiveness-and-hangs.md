---
title: Hangs와 앱 응답성 분석하기
description: Instruments의 Hangs, Time Profiler, System Trace와 Swift Tasks를 함께 사용해 Main Thread가 CPU 작업, lock·I/O 대기 또는 Main Actor task로 멈추는 원인을 구분합니다.
---

# Hangs와 앱 응답성 분석하기

> **면접 답변 한 줄 요약:** 앱의 hang은 Main Thread가 사용자 event와 다음 frame을 제때 처리하지 못한 구간이며, Hangs로 증상을 찾고 CPU가 높으면 profiler, 낮으면 thread state, 비동기 작업이면 Swift Tasks를 겹쳐 원인을 구분해요.

버튼을 눌렀는데 화면이 늦게 바뀌거나 scrolling이 잠깐 멎으면 사용자는 앱이 자신의 입력을 무시했다고 느껴요. 이때 “background로 보내면 된다”는 처방부터 적용하면 실제 원인이 lock이나 Main Actor task 경합일 때 문제를 옮기거나 새로운 data race를 만들 수 있어요.

응답성 문제는 먼저 Main Thread가 무엇을 하고 있었는지에 따라 나눠야 해요.

- Main Thread가 CPU 계산을 계속 실행하는 **busy hang**
- lock, file I/O나 다른 thread를 기다리는 **blocked hang**
- 나중에 예약된 Main Actor task가 긴 작업을 실행해 event를 늦추는 **비동기 hang**

Apple의 [Analyze hangs with Instruments](https://developer.apple.com/videos/play/wwdc2023/10248/)도 이 세 종류를 실제 trace에서 구분해 분석해요.

## 먼저 알아둘 응답성 용어

| 용어                 | 쉬운 뜻                                                                                                                                                   |
| -------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Main Thread          | UIKit과 AppKit의 event 처리와 많은 UI update가 실행되는 process의 중심 thread예요. 오래 점유하거나 막으면 입력과 rendering이 늦어질 수 있어요.            |
| Main Actor           | Swift Concurrency에서 UI 관련 상태를 직렬화하는 전역 actor예요. 보통 Main Thread에서 실행되지만 actor는 thread 자체가 아니라 격리와 실행 순서를 나타내요. |
| event loop와 frame   | system이 입력 event를 받고 앱 코드를 실행한 뒤 화면을 update하는 반복 흐름이에요. 한 작업이 길면 다음 event와 frame이 기다려요.                           |
| hang                 | 앱이 사용자 입력에 눈에 띄게 늦게 응답하는 정지 구간이에요. crash와 달리 process는 살아 있고 나중에 다시 진행할 수 있어요.                                |
| hitch                | animation이나 scrolling의 frame이 제시간에 준비되지 않아 시각적으로 끊기는 현상이에요. hang과 겹칠 수 있지만 rendering pipeline 문제일 수도 있어요.       |
| running              | thread가 CPU에서 명령을 실행 중인 상태예요.                                                                                                               |
| blocked 또는 waiting | thread가 lock, I/O, sleep나 다른 자원을 기다려 CPU에서 실행되지 않는 상태예요.                                                                            |
| synchronous hang     | 사용자 action이 바로 긴 함수를 호출해 그 호출이 돌아올 때까지 Main Thread를 막는 경우예요.                                                                |
| asynchronous hang    | 나중에 실행된 queue block이나 Main Actor task가 Main Thread를 오래 차지해 다른 event를 늦추는 경우예요.                                                   |
| critical path        | 사용자의 action부터 결과가 보일 때까지 반드시 지나야 하는 작업 경로예요. 이 경로의 지연이 직접 체감돼요.                                                  |

Main Actor의 격리와 실행 규칙은 [MainActor 문서](../swift/concurrency/main-actor.md)에서 먼저 볼 수 있어요.

## 100ms보다 긴 Main Thread 작업을 조사 대상으로 봐요

사람이 느끼는 “즉시 반응”에는 여유가 크지 않아요. Apple의 WWDC23 hang 분석 세션은 Main Thread의 개별 작업을 100ms 아래로 유지하는 목표를 제시해요. 이 값은 모든 device와 UX에 똑같이 적용되는 합격선이 아니라, 눈에 띄는 지연을 피하기 위한 조사 기준이에요.

frame budget은 display refresh rate에 따라 더 짧을 수 있어요. 60Hz 화면은 frame 하나당 약 16.7ms이고 120Hz는 약 8.3ms예요. Main Thread 작업이 100ms보다 짧더라도 여러 frame을 놓쳐 scrolling hitch가 생길 수 있어요.

따라서 두 목표를 나눠요.

- tap과 화면 전환 같은 interaction latency는 Hangs와 event 처리 구간으로 조사해요.
- animation과 scrolling의 매끄러움은 hitch와 frame 관련 instrument로 조사해요.

## Time Profiler template으로 hang을 기록해요

원인을 모르는 UI 멈춤은 Time Profiler template이 좋은 출발점이에요. 현재 template에는 Time Profiler와 Hangs를 비롯한 관련 track이 포함될 수 있어 시간과 CPU를 함께 볼 수 있어요.

1. 문제가 발생하는 물리 기기와 scheme을 선택해요.
2. `Product > Profile`에서 Time Profiler template을 열어요.
3. Record를 누르고 문제가 생기는 action만 재현해요.
4. UI가 다시 반응하면 Stop을 눌러 짧은 trace를 만들어요.
5. Hangs track에서 표시된 interval을 찾아 inspection range로 설정해요.
6. Main Thread track과 Time Profiler의 CPU graph를 같은 범위에서 봐요.

자동 표시된 hang이 없어도 사용자가 지연을 느낀 정확한 구간을 signpost로 표시할 수 있어요. 버튼 action 시작부터 첫 결과 표시까지 interval을 추가하고 그 범위에서 Main Thread를 조사하세요.

### 먼저 Main Thread CPU가 높은지 확인해요

hang 구간을 선택한 뒤 첫 분기는 단순해요.

```text
Main Thread의 CPU가 높아요?
├─ 예 → CPU에서 긴 코드를 실행 중
│      Time Profiler / CPU Profiler call tree
└─ 아니요 → 다른 자원을 기다릴 가능성
       Thread State / System Trace / Swift Tasks
```

CPU가 높다는 이유만으로 무조건 계산 알고리즘 문제는 아니에요. 같은 함수를 지나치게 자주 호출하거나 Main Actor에 필요 없는 작업을 올렸을 수도 있어요. call tree에서 앱의 호출 경로와 반복 횟수를 함께 확인하세요.

## busy Main Thread hang은 call tree로 내려가요

Main Thread가 hang interval 내내 running이고 CPU가 높다면 Time Profiler의 call tree를 열어요.

1. inspection range를 hang interval로 제한해요.
2. Main Thread를 pin하거나 해당 process track을 선택해요.
3. call tree에서 앱 symbol이 나올 때까지 경로를 펼쳐요.
4. `Hide System Libraries`와 `Invert Call Tree`로 무거운 앱 leaf를 찾아요.
5. Source Viewer에서 반복 loop, decode, image 처리와 layout 호출을 확인해요.

다음 코드는 `async`로 선언됐지만 실제 decode를 Main Actor에서 동기적으로 실행해요.

```swift
import Foundation

struct ImportRecord: Decodable, Sendable {
  let id: Int
  let title: String
}

@MainActor
final class ImportViewModel {
  private(set) var records: [ImportRecord] = []

  func importData(_ data: Data) async throws {
    records = try JSONDecoder().decode(
      [ImportRecord].self,
      from: data
    )
  }
}
```

`async` keyword는 함수 본문의 CPU 계산을 자동으로 background thread에 보내지 않아요. 이 메서드에는 suspension point도 없고 `ImportViewModel`이 Main Actor에 격리되어 있으므로 큰 decode가 UI event와 경쟁할 수 있어요.

별도 worker actor가 decode를 소유하도록 경계를 바꿀 수 있어요.

```swift
actor ImportWorker {
  private let decoder = JSONDecoder()

  func decode(_ data: Data) throws -> [ImportRecord] {
    try decoder.decode(
      [ImportRecord].self,
      from: data
    )
  }
}

@MainActor
final class ImportViewModel {
  private let worker = ImportWorker()
  private(set) var records: [ImportRecord] = []

  func importData(_ data: Data) async throws {
    let decoded = try await worker.decode(data)
    records = decoded
  }
}
```

이 변경은 decode가 Main Actor의 UI 상태와 분리된 actor에서 실행될 수 있게 해요. `Data`와 결과 모델처럼 경계를 넘는 값은 concurrency safety를 만족해야 해요. actor를 추가하면 scheduling과 구조 비용도 생기므로 before/after trace에서 Main Thread hang과 전체 latency가 실제로 줄었는지 확인하세요.

CPU 병목의 call tree 읽기는 [CPU Profiler와 Time Profiler](./cpu-profiling.md)에서 더 자세히 다뤄요.

## blocked Main Thread hang은 기다리는 대상을 찾아요

hang은 긴데 Main Thread의 CPU가 낮다면 thread가 실행할 수 없는 상태일 수 있어요. 다음 원인이 흔해요.

- synchronous file read 또는 database I/O
- serial queue의 `sync` 호출
- mutex, unfair lock, semaphore 대기
- 다른 thread 작업의 완료를 `wait`로 기다림
- IPC나 system service 응답 대기
- page fault와 memory pressure

System Trace와 thread state를 추가해 Main Thread가 blocked된 시점과 이를 깨우는 thread를 찾아요.

1. hang interval로 inspection range를 설정해요.
2. Main Thread의 running, runnable, blocked 상태를 확인해요.
3. blocked 전의 stack에서 lock, file와 queue API를 찾아요.
4. 같은 시점에 관련 background thread가 무엇을 실행했는지 봐요.
5. Main Thread를 깨운 event와 dependency 방향을 확인해요.

blocked stack에 `Data(contentsOf:)`가 보인다면 file 읽기를 Main Thread 밖으로 옮기고 async 결과만 UI에 적용하는 구조를 검토해요. lock 대기라면 lock을 더 빠르게 만드는 것보다 공유 상태 범위와 Main Thread가 그 lock을 꼭 가져야 하는지 먼저 봐요.

### CPU가 낮은 blocked time을 빠른 코드로 오해하지 않아요

Time Profiler sample이 적다는 것은 CPU를 적게 사용했다는 뜻이지 사용자가 덜 기다렸다는 뜻이 아니에요. Main Thread는 1초 동안 CPU를 거의 쓰지 않고 lock을 기다려도 앱을 1초간 멈출 수 있어요.

## asynchronous hang은 Swift Tasks를 겹쳐 봐요

버튼 action 자체는 빨랐는데 잠시 뒤 scrolling이 멎는다면 Main Actor에 예약된 task가 긴 CPU 작업을 실행했을 수 있어요.

1. 기존 trace에 Swift Tasks instrument를 추가하거나 Swift Concurrency template으로 다시 기록해요.
2. hang interval에 Main Thread에서 실행된 task lane을 찾아요.
3. task의 creation backtrace를 열어 어디서 생성됐는지 확인해요.
4. task가 Main Actor를 상속했는지와 어떤 함수가 CPU를 사용했는지 봐요.
5. Task Forest에서 child task가 병렬인지 직렬인지 확인해요.
6. Swift Actors에서 하나의 actor에 긴 task가 몰리는지 확인해요.

SwiftUI의 `.task`, `Task {}`와 `async` 함수 이름만 보고 background 실행이라고 가정하지 마세요. actor isolation과 생성 context에 따라 Main Actor에서 실행될 수 있어요. Apple의 [Visualize and optimize Swift concurrency](https://developer.apple.com/videos/play/wwdc2022/110350/)와 [Analyze hangs with Instruments](https://developer.apple.com/videos/play/wwdc2023/10248/)는 Swift Tasks lane으로 Main Thread의 비동기 CPU 작업을 찾는 과정을 보여 줘요.

## 호출 횟수와 한 번의 비용을 나눠요

한 함수가 한 번에 2ms밖에 걸리지 않아도 한 frame에 100번 호출되면 200ms가 돼요. 반대로 150ms 함수가 사용자가 기다리지 않는 background 시점에 한 번 실행된다면 hang의 원인이 아닐 수 있어요.

| 관찰                              | 개선 방향                                                          |
| --------------------------------- | ------------------------------------------------------------------ |
| 한 번의 호출이 너무 길어요.       | 알고리즘, I/O 경계, 입력 크기와 실행 actor를 개선해요.             |
| 짧은 호출이 너무 많아요.          | 중복 update, 불필요한 view recomputation과 반복 API 호출을 줄여요. |
| Main Actor task가 연속돼요.       | UI update를 batch하고 CPU-only 작업의 격리를 분리해요.             |
| background 결과가 너무 자주 와요. | throttle, coalescing 또는 최신 결과만 반영하는 정책을 검토해요.    |

최적화 목표는 모든 함수의 시간을 줄이는 것이 아니라 Main Thread가 다음 event와 frame을 처리할 기회를 제때 돌려주는 것이에요.

## 수정 전후 응답성을 검증해요

hang을 없앤 뒤 전체 작업이 훨씬 느려지거나 memory를 과도하게 쓸 수도 있어요. 같은 재현 절차에서 다음을 함께 비교하세요.

- Hangs interval의 수와 duration
- 사용자 action부터 첫 결과 표시까지 signpost duration
- Main Thread CPU와 blocked time
- Swift task lifetime과 Alive Tasks
- peak memory와 energy 영향
- 취소, 화면 이탈과 app background 전환의 동작

Apple의 [Improving app responsiveness](https://developer.apple.com/documentation/xcode/improving-app-responsiveness)는 실제 기기에서 hitch를 측정하고, 배포 후에는 Xcode Organizer와 MetricKit 같은 field data로 사용자 환경의 문제를 확인하도록 안내해요. 개발 기기의 한 trace로 모든 사용자 문제를 대표할 수는 없어요.

## 증상별 도구를 정리해요

| trace에서 보이는 것                  | 다음 instrument                   | 확인할 핵심                                 |
| ------------------------------------ | --------------------------------- | ------------------------------------------- |
| Main Thread CPU가 계속 높아요.       | Time Profiler 또는 CPU Profiler   | 무거운 call tree와 반복 호출                |
| Main Thread CPU는 낮고 blocked돼요.  | System Trace와 Thread State       | lock, I/O와 unblock dependency              |
| Main Actor task가 길게 실행돼요.     | Swift Tasks, Swift Actors         | 생성 context, actor isolation과 task 구조   |
| scrolling frame만 끊겨요.            | Hitches, Core Animation 관련 도구 | frame budget과 rendering pipeline           |
| network 결과를 기다리며 UI가 멈춰요. | Network와 System Trace            | synchronous wait와 Main Thread 호출         |
| 반복할수록 멈춤이 심해져요.          | Allocations와 Swift Tasks         | 누적 객체, 살아 있는 task와 memory pressure |

## 흔한 실수를 피해야 해요

### `async`를 붙이면 Main Thread 문제가 해결된다고 생각하지 않아요

`async`는 suspension 가능성을 표현하지만 CPU work의 실행 actor를 자동으로 바꾸지 않아요. Instruments에서 실제 thread, task와 actor를 확인하세요.

### Main Thread의 모든 작업을 background로 보내지 않아요

UI 상태 접근과 framework API는 Main Thread 또는 Main Actor가 필요할 수 있어요. CPU-only와 I/O 작업의 경계를 분리하고 결과 적용만 Main Actor에서 짧게 수행하세요.

### sleep이나 인위적인 delay로 경합을 숨기지 않아요

실행 순서를 우연히 바꿔 증상이 줄 수 있지만 dependency 문제는 남아요. thread state와 task 구조에서 실제 기다림 관계를 찾아요.

### hang interval 밖의 무거운 함수를 고치지 않아요

recording 전체의 CPU hotspot이 background indexing일 수 있어요. 사용자가 멈춤을 느낀 inspection range와 Main Thread에 해당하는지 먼저 확인하세요.

### 최신 기기에서만 검증하지 않아요

같은 Main Thread 작업도 오래된 기기에서는 더 긴 hang이 돼요. 최소 지원 기기와 실제 보고가 많은 기기 등급에서 확인하세요.

## 적용 순서를 정리해요

1. 멈춤이 시작되고 끝나는 사용자 action을 정해요.
2. 물리 기기에서 Time Profiler template으로 짧은 trace를 기록해요.
3. Hangs 또는 signpost interval로 inspection range를 제한해요.
4. Main Thread CPU가 높은지 낮은지 먼저 나눠요.
5. 높으면 call tree, 낮으면 System Trace의 wait 원인을 확인해요.
6. Swift task가 관련되면 creation context, actor와 Task Forest를 봐요.
7. CPU-only·I/O 작업과 UI update 경계를 분리해 수정해요.
8. 같은 조건의 after trace와 field metric으로 개선을 검증해요.

## 면접에서 이어질 수 있는 질문

### hang과 crash는 무엇이 다른가요?

crash는 process가 비정상 종료되는 사건이고, hang은 process는 살아 있지만 Main Thread가 event에 제때 응답하지 못하는 구간이에요. hang은 나중에 회복될 수 있어도 사용자에게 앱이 멈춘 경험을 줘요.

### Main Actor와 Main Thread는 같은가요?

Main Actor는 Swift Concurrency의 격리와 직렬 실행 개념이고 Main Thread는 운영체제 thread예요. UI 관련 Main Actor 작업은 일반적으로 Main Thread에서 수행되지만, 코드를 분석할 때 actor isolation과 실제 thread state를 구분해 보는 것이 좋아요.

### CPU가 낮은데도 hang이 생길 수 있나요?

네. Main Thread가 lock, file I/O, semaphore나 다른 thread의 결과를 기다리면 CPU를 거의 사용하지 않으면서 event 처리를 멈출 수 있어요. System Trace와 Thread State로 blocked 원인과 깨우는 dependency를 찾아야 해요.

### `Task {}`로 감싸면 CPU 작업이 Main Actor 밖으로 가나요?

항상 그렇지 않아요. task는 생성 context의 actor isolation을 상속할 수 있어 Main Actor에서 긴 계산을 계속 실행할 수 있어요. Swift Tasks와 Main Thread track에서 실제 실행 위치를 확인하고 명시적인 격리 경계를 설계해야 해요.

### Hangs를 수정한 뒤 무엇을 검증해야 하나요?

hang duration뿐 아니라 사용자 action의 전체 latency, Main Thread CPU와 blocked time, task 수, memory와 취소 동작을 같은 조건에서 확인해야 해요. 작업을 background로 옮기면서 결과가 늦거나 lifecycle bug가 생기지 않았는지도 검증해요.

## 참고 자료

- [WWDC23 — Analyze hangs with Instruments](https://developer.apple.com/videos/play/wwdc2023/10248/)
- [Apple Developer — Improving app responsiveness](https://developer.apple.com/documentation/xcode/improving-app-responsiveness)
- [Apple Developer — Executing work asynchronously](https://developer.apple.com/tutorials/instruments/executing-work-asynchronously)
- [WWDC22 — Visualize and optimize Swift concurrency](https://developer.apple.com/videos/play/wwdc2022/110350/)
- [WWDC26 — Profile, fix, and verify: Improve app responsiveness with Instruments](https://developer.apple.com/videos/play/wwdc2026/268/)
- [Apple Developer — Analyzing CPU profiles with call tree views](https://developer.apple.com/documentation/xcode/analyzing-cpu-profiles-with-call-tree-views)
