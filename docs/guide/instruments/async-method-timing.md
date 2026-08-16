---
title: Instruments로 비동기 메서드 시간 측정하기
description: ContinuousClock과 OSSignposter로 await를 포함한 비동기 메서드의 전체 지연 시간을 측정하고 Swift Tasks에서 실행·중단·Main Actor 구간을 분석하는 방법을 설명합니다.
---

# Instruments로 비동기 메서드 시간 측정하기

> **면접 답변 한 줄 요약:** 비동기 메서드의 전체 지연은 `OSSignposter` interval로 `await` 전후를 표시하고, 같은 구간의 Swift Tasks와 CPU profile을 함께 봐야 실행 시간, 대기 시간과 task scheduling 원인을 구분할 수 있어요.

`async` 함수가 2초 걸렸다는 말에는 여러 시간이 섞여 있어요. CPU에서 코드를 실행한 시간일 수도 있고, network 응답을 기다린 시간일 수도 있으며, actor에 진입할 차례를 기다리거나 task가 scheduling되기 전의 시간일 수도 있어요.

Time Profiler만 열어 함수 이름을 찾으면 CPU에서 sample된 구간은 볼 수 있지만, `await`에서 task가 중단된 시간은 함수의 CPU 비용으로 잡히지 않아요. 반대로 시작과 종료 시각만 빼면 사용자가 기다린 전체 시간은 알 수 있지만 왜 느렸는지는 알 수 없어요.

이 문서에서는 다음 질문을 나누어 측정해요.

- `async` 메서드 호출부터 반환까지 실제로 얼마나 걸렸나요?
- 그중 CPU에서 코드를 실행한 시간은 얼마나 되나요?
- task는 언제 생성되고 실행·중단·재개됐나요?
- Main Actor나 다른 actor의 경합이 있었나요?
- 여러 동시 호출과 throw·취소 상황에서도 interval이 정확히 닫히나요?

## 먼저 알아둘 비동기 측정 용어

| 용어                      | 쉬운 뜻                                                                                                                                           |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| elapsed time, wall time   | 시작부터 종료까지 실제 시계로 흐른 시간이에요. CPU 실행뿐 아니라 `await`, network, file I/O와 scheduling 대기를 포함해요.                         |
| CPU time                  | thread가 실제 CPU에서 명령을 실행한 시간이에요. 기다리느라 실행되지 않은 시간은 포함하지 않아요.                                                  |
| suspension point          | `await`에서 task가 잠시 실행을 멈추고 thread를 양보할 수 있는 지점이에요. 나중에 같은 thread가 아닌 다른 thread에서 재개될 수도 있어요.           |
| task lifetime             | task가 생성되어 완료되거나 취소될 때까지 살아 있는 구간이에요. 특정 메서드 한 번의 시작과 종료 범위와 반드시 같지는 않아요.                       |
| signpost event와 interval | event는 한 시점을 표시하고, interval은 begin과 end 사이의 지속 시간을 표시해요. Instruments timeline에서 앱 의미가 있는 구간을 찾는 표지예요.     |
| subsystem과 category      | 여러 log와 signpost를 앱과 기능 단위로 분류하는 문자열이에요. 같은 이름의 interval도 subsystem과 category로 필터링할 수 있어요.                   |
| signpost ID               | 같은 이름의 interval 여러 개가 동시에 실행될 때 begin과 end를 올바르게 짝짓는 식별자예요.                                                         |
| Points of Interest        | 중요한 앱 동작을 timeline에 표시하는 Instruments track이에요. `.pointsOfInterest` category의 signpost를 사용하면 관련 구간을 쉽게 찾을 수 있어요. |

## 먼저 어떤 시간을 원하는지 정해요

사진 목록을 불러오는 메서드를 예로 들어 볼게요.

```swift
func loadFeed() async throws -> [FeedItem] {
  let response = try await client.fetchFeed()
  return try decoder.decode(response.data)
}
```

이 메서드에는 적어도 세 종류의 시간이 있어요.

```text
loadFeed 전체 elapsed time
├─ request 생성과 response decode의 CPU time
├─ network response를 기다린 suspension time
└─ task가 executor에서 실행 차례를 기다린 scheduling time
```

사용자가 새로고침 indicator를 보는 시간은 전체 elapsed time에 가까워요. decode 알고리즘을 최적화하려면 CPU time이 중요하고, Main Actor에서 밀리는 문제를 찾으려면 task와 executor 상태가 중요해요. 하나의 숫자로 세 질문을 모두 답하려 하지 마세요.

| 측정 질문                          | 사용할 도구                          | 결과의 의미                                           |
| ---------------------------------- | ------------------------------------ | ----------------------------------------------------- |
| 호출부터 반환까지 몇 초인가요?     | `ContinuousClock`, signpost interval | `await` 대기를 포함한 elapsed time이에요.             |
| 어떤 함수가 CPU를 많이 사용하나요? | CPU Profiler, Time Profiler          | CPU에서 sample된 호출 경로와 비용 비중이에요.         |
| task가 언제 중단되고 재개됐나요?   | Swift Tasks                          | task lifetime과 running·suspended 같은 상태 변화예요. |
| actor 때문에 병렬성이 줄었나요?    | Swift Actors와 task 상세 정보        | actor별 task 실행과 경합 관계를 조사할 단서예요.      |
| 같은 성능이 계속 유지되나요?       | performance test와 metric            | 반복 가능한 입력에서 회귀 여부를 확인하는 수치예요.   |

## ContinuousClock으로 코드 안에서 elapsed time을 확인해요

Instruments를 열기 전에 stopwatch 형태의 값만 빠르게 확인하고 싶다면 `ContinuousClock`을 사용할 수 있어요. `ContinuousClock`은 고해상도 실행 시간 측정에 적합한 단조 증가 clock이에요. 비동기 closure를 받는 `measure(_:)`도 제공해요.

```swift
let clock = ContinuousClock()

let elapsed = try await clock.measure {
  _ = try await repository.loadFeed()
}

print("loadFeed elapsed:", elapsed)
```

이 값은 `await`에서 중단된 시간도 포함해요. 따라서 “사용자가 결과를 받을 때까지 얼마나 기다렸는가”를 확인하는 데는 적합하지만 network, CPU, actor 대기 중 무엇이 원인인지는 알려 주지 않아요. 여러 도구와 같은 시간축에서 원인을 조사하려면 signpost를 사용하세요.

`Date()` 두 값을 빼는 방식보다 성능 구간에는 단조 증가 clock을 사용하는 편이 좋아요. 달력 시각은 사용자나 system의 시각 보정 대상이지만 `ContinuousClock`은 stopwatch처럼 경과 시간을 측정하기 위한 타입이에요. API의 정확한 동작은 [ContinuousClock](https://developer.apple.com/documentation/swift/continuousclock)과 [비동기 measure(_:)](https://developer.apple.com/documentation/swift/clock/measure%28_%3A%29-7l47m)에서 확인할 수 있어요.

## OSSignposter로 async 메서드 전체를 표시해요

`OSSignposter`는 unified logging system에 interval과 event를 기록하고, Instruments의 signpost instrument가 이를 timeline에 표시하게 해요. begin에서 반환한 `OSSignpostIntervalState`를 같은 이름의 end에 전달해야 해요.

다음 예제는 여러 `loadFeed()` 호출이 동시에 실행돼도 각각을 구분하고, 성공·throw·취소 경로 모두에서 interval을 끝내요.

```swift
import Foundation
import OSLog

struct FeedItem: Decodable, Sendable {
  let id: Int
  let title: String
}

protocol FeedClient: Sendable {
  func fetchFeed() async throws -> Data
}

private enum PerformanceLog {
  static let signposter = OSSignposter(
    subsystem: Bundle.main.bundleIdentifier
      ?? "com.example.PhotoApp",
    category: .pointsOfInterest
  )
}

struct FeedRepository: Sendable {
  let client: any FeedClient

  func loadFeed() async throws -> [FeedItem] {
    let signposter = PerformanceLog.signposter
    let signpostID = signposter.makeSignpostID()
    let state = signposter.beginInterval(
      "LoadFeed",
      id: signpostID
    )

    defer {
      signposter.endInterval("LoadFeed", state)
    }

    let data = try await client.fetchFeed()
    return try JSONDecoder().decode(
      [FeedItem].self,
      from: data
    )
  }
}
```

코드에서 중요한 부분을 하나씩 살펴볼게요.

1. subsystem은 앱을, category는 성능 측정 목적을 구분해요.
2. `.pointsOfInterest` category를 사용해 Instruments에서 관심 구간으로 찾기 쉽게 만들어요.
3. `makeSignpostID()`를 호출마다 새로 만들어 동시에 실행되는 `LoadFeed` interval을 구분해요.
4. `beginInterval`을 첫 `await` 전에 호출해 network 대기를 포함해요.
5. `defer`에서 같은 이름과 state로 `endInterval`을 호출해 정상 반환, throw와 task 취소 경로 모두 닫아요.

Apple의 [`OSSignposter`](https://developer.apple.com/documentation/os/ossignposter) 문서도 동시에 존재하는 같은 이름의 interval을 signpost ID로 구분하고, begin에서 받은 state를 end에 전달하도록 설명해요. interval state는 begin과 end의 이름, signposter와 중복 종료가 일치하는지도 검사해요.

### withIntervalSignpost는 async closure용이 아니에요

`OSSignposter.withIntervalSignpost`는 동기 closure를 감싸는 편의 API예요. 현재 공개된 signature의 closure에는 `async`가 없으므로 내부에서 `await`해야 하는 메서드를 직접 감쌀 수 없어요.

동기 작업이라면 다음처럼 사용할 수 있어요.

```swift
let decoded = try signposter.withIntervalSignpost(
  "DecodeFeed"
) {
  try decoder.decode([FeedItem].self, from: data)
}
```

비동기 작업은 앞 예제처럼 `beginInterval`과 `defer`의 `endInterval`을 직접 사용하세요. 정확한 signature는 [withIntervalSignpost(_:id:around:)](https://developer.apple.com/documentation/os/ossignposter/withintervalsignpost%28_%3Aid%3Aaround%3A%29)에서 확인할 수 있어요.

## Instruments에서 signpost duration을 읽어요

코드를 추가했으면 다음 순서로 기록해요.

1. 물리 기기를 선택하고 Xcode에서 `Product > Profile`을 실행해요.
2. 전체 CPU 흐름도 함께 볼 때는 Time Profiler template을 선택해요.
3. Points of Interest track이 없다면 `+ Instrument`에서 추가해요.
4. Record를 누르고 `loadFeed()`가 실행되는 새로고침 동작을 여러 번 반복해요.
5. Stop을 누르고 Points of Interest에서 subsystem, category와 `LoadFeed` 이름을 찾아요.
6. interval summary에서 각 duration과 반복 결과를 확인해요.
7. 느린 interval을 선택해 inspection range로 설정해요.
8. 같은 구간의 CPU profile과 Swift Tasks를 확인해요.

signpost interval은 timeline에서 앱의 의미를 붙여 주는 기준점이에요. Apple의 [Analyzing CPU profiles with call tree views](https://developer.apple.com/documentation/xcode/analyzing-cpu-profiles-with-call-tree-views)도 interval span을 선택해 해당 구간으로 call tree를 제한하는 흐름을 안내해요.

### metadata에는 민감한 값을 넣지 않아요

signpost message에 page 번호, item 개수처럼 분석에 필요한 값을 추가할 수 있어요.

```swift
let state = signposter.beginInterval(
  "LoadFeed",
  id: signpostID,
  "page: \(page, privacy: .public)"
)
```

token, 전체 URL query, 사용자 ID, 검색어와 개인 데이터는 trace에 남기지 마세요. 꼭 구분값이 필요하면 privacy option을 명시하고 원문 대신 안전한 범주나 hash를 사용하세요. `.trace` 파일을 공유할 때는 앱 log와 signpost metadata가 포함될 수 있다고 가정해야 해요.

## 전체 interval을 단계별로 나눠요

`LoadFeed`가 느리다는 사실을 확인했다면 큰 interval 안의 단계를 따로 표시해요. 처음부터 모든 작은 함수에 signpost를 넣으면 기록이 복잡해지므로 원인 후보가 되는 경계만 선택하세요.

```swift
func loadFeed() async throws -> [FeedItem] {
  let signposter = PerformanceLog.signposter
  let loadState = signposter.beginInterval("LoadFeed")
  defer {
    signposter.endInterval("LoadFeed", loadState)
  }

  let requestState = signposter.beginInterval("FetchFeed")
  let data = try await client.fetchFeed()
  signposter.endInterval("FetchFeed", requestState)

  return try signposter.withIntervalSignpost(
    "DecodeFeed"
  ) {
    try JSONDecoder().decode([FeedItem].self, from: data)
  }
}
```

이 예제는 이해하기 쉽게 각 단계가 한 번만 실행된다고 가정해 기본 `.exclusive` ID를 사용해요. `FetchFeed`나 `DecodeFeed`가 같은 signposter 안에서 동시에 여러 번 실행될 수 있다면 단계별로 `makeSignpostID()`를 만들어 전달하세요.

결과를 다음처럼 해석할 수 있어요.

| 관찰 결과                                      | 다음 가설과 도구                                                                 |
| ---------------------------------------------- | -------------------------------------------------------------------------------- |
| `FetchFeed`가 길고 CPU는 낮아요.               | network 또는 server 대기일 수 있어요. Network template과 URLSession 지표를 봐요. |
| `DecodeFeed`가 길고 CPU sample이 많아요.       | decode가 CPU-bound일 수 있어요. CPU call tree와 allocation을 확인해요.           |
| 두 하위 interval은 짧지만 `LoadFeed`가 길어요. | scheduling, actor hop 또는 빠진 단계를 의심하고 Swift Tasks를 확인해요.          |
| 반복할수록 모든 interval이 길어져요.           | thermal, memory pressure, 누적 task와 cache 상태를 함께 확인해요.                |

## Swift Tasks에서 중단과 재개를 확인해요

signpost는 “얼마나 오래”를 잘 보여 주지만 task가 왜 그 시간을 보냈는지는 설명하지 않아요. Swift Concurrency template의 Swift Tasks와 Swift Actors instrument를 함께 사용하세요.

1. `Product > Profile`에서 Swift Concurrency template을 선택하거나 현재 trace에 Swift Tasks를 추가해요.
2. 같은 `LoadFeed` 동작을 기록해요.
3. Running Tasks, Alive Tasks와 Total Tasks의 변화를 먼저 봐요.
4. signpost interval과 겹치는 task를 선택해 lifetime과 상태 변화를 확인해요.
5. Task Forest에서 부모·자식 task 관계를 확인해요.
6. creation backtrace에서 task가 만들어진 호출 위치를 찾아요.
7. Swift Actors에서 특정 actor가 긴 작업을 직렬로 처리하는지 조사해요.

Apple은 [Visualize and optimize Swift concurrency](https://developer.apple.com/videos/play/wwdc2022/110350/)에서 Swift Tasks의 Running, Alive, Total 통계와 Task Forest를 사용해 Main Actor blocking, actor contention, thread pool exhaustion과 continuation 문제를 좁히는 방법을 보여 줘요.

### task lifetime을 메서드 duration으로 읽지 않아요

하나의 task는 `loadFeed()` 전후의 다른 비동기 작업도 실행할 수 있어요. 반대로 `loadFeed()` 안에서 child task 여러 개를 만들 수도 있어요. task lifetime의 길이와 특정 메서드의 interval은 서로 다른 경계예요.

- 메서드 API 경계는 signpost interval로 표시해요.
- task의 생성, 중단, 재개와 부모·자식 관계는 Swift Tasks로 봐요.
- CPU에서 실행한 함수의 비용은 CPU profile로 봐요.

세 데이터를 같은 inspection range에서 겹쳐 봐야 잘못된 결론을 피할 수 있어요.

## Main Actor에서 실행됐다는 것과 CPU 병렬성을 구분해요

`async`라는 이유만으로 작업이 Main Actor 밖에서 실행되는 것은 아니에요. Main Actor에 격리된 context에서 생성한 task가 CPU 계산을 이어받으면 UI event와 경쟁할 수 있어요. timeline에서 다음을 확인하세요.

- `LoadFeed` interval 동안 Main Thread에 긴 Swift task 실행 구간이 있는지
- Hangs track과 Main Thread의 높은 CPU가 같은 시간에 나타나는지
- actor에 실행 대기 중인 task가 계속 쌓이는지
- child task가 실제로 겹쳐 실행되는지, 직렬로 이어지는지

Main Actor와 actor 격리의 언어 규칙은 [MainActor 문서](../swift/concurrency/main-actor.md)와 [Actor 문서](../swift/concurrency/actors.md)에서 이어서 볼 수 있어요. 성능 때문에 격리를 제거하기 전에 전달하는 값의 `Sendable` 안전성과 UI 갱신 경계를 먼저 확인하세요.

## 여러 번 측정하고 분포를 비교해요

network가 포함된 `async` 함수는 같은 코드라도 결과 변동이 커요. 평균 하나만 기록하지 말고 다음 값을 함께 봐요.

- 첫 호출과 준비 후 호출을 분리한 duration
- 최소, 중앙값, 상위 지연과 최대 duration
- 성공, server 오류, 취소 경로의 duration
- Wi-Fi, cellular과 network conditioning별 결과
- 같은 구간의 CPU와 memory peak

OSSignposter interval summary는 여러 interval의 duration을 비교하는 데 유용해요. 그러나 signpost는 회귀 test의 pass/fail 기준 자체가 아니에요. 안정된 입력을 만들 수 있는 decode나 local database 작업은 performance test로 옮기고, 실제 network가 포함된 end-to-end 지연은 별도 환경과 관측 지표로 관리하세요.

## 도구별 역할을 정리해요

| 방법                       | 장점                                                            | 한계                                                              |
| -------------------------- | --------------------------------------------------------------- | ----------------------------------------------------------------- |
| `ContinuousClock`          | 코드에서 async elapsed time을 간단히 얻어요.                    | 다른 Instruments track과 자동으로 연결되지 않아요.                |
| `OSSignposter` interval    | 앱의 의미 있는 구간을 timeline에 표시하고 반복 duration을 봐요. | interval 경계는 개발자가 올바르게 정해야 해요.                    |
| Swift Tasks                | task의 생성, 상태, lifetime과 구조를 보여 줘요.                 | 특정 메서드 API 경계와 항상 일치하지 않아요.                      |
| CPU Profiler/Time Profiler | CPU에서 무거운 함수와 호출 경로를 찾아요.                       | `await`와 I/O 대기를 메서드 CPU 비용으로 보여 주지 않아요.        |
| performance test           | 고정된 입력으로 성능 회귀를 자동 검증해요.                      | 실제 사용자 환경의 network와 scheduling 전체를 재현하기 어려워요. |

## 흔한 실수를 피해야 해요

### begin과 end에서 다른 이름을 쓰지 않아요

interval state는 이름과 signposter의 일관성을 검사해요. 이름을 동적으로 만들지 말고 `StaticString` literal을 사용해 같은 경계를 유지하세요.

### 동시에 실행되는 interval에 기본 exclusive ID를 공유하지 않아요

같은 이름과 scope의 interval이 겹칠 수 있다면 호출마다 `makeSignpostID()`를 만들어요. 그렇지 않으면 begin과 end를 올바르게 구분할 수 없어요.

### 성공 경로에서만 endInterval을 호출하지 않아요

`try await`가 throw하거나 task가 취소돼도 interval은 닫혀야 해요. begin 직후 `defer`를 선언하면 모든 scope 종료 경로를 처리할 수 있어요.

### elapsed time을 CPU 최적화 근거로 사용하지 않아요

2초 interval의 대부분이 server response 대기라면 Swift decode 코드를 미세 최적화해도 사용자가 느끼는 시간은 거의 달라지지 않아요. 같은 범위의 CPU와 task 상태를 확인하세요.

### 너무 작은 함수마다 signpost를 넣지 않아요

측정 자체에도 비용이 있고 timeline이 읽기 어려워져요. 사용자 동작, request, decode, database transaction처럼 의미 있는 경계를 먼저 표시하고 필요한 곳만 세분화하세요.

## 적용 순서를 정리해요

1. 메서드의 시작과 종료 중 사용자가 기다리는 경계를 정해요.
2. 빠른 숫자가 필요하면 `ContinuousClock`으로 elapsed time을 확인해요.
3. 같은 시간축의 분석이 필요하면 `.pointsOfInterest` `OSSignposter`를 만들어요.
4. 동시 호출에는 고유 signpost ID를 사용하고 `defer`에서 interval을 닫아요.
5. Instruments에서 여러 번 기록해 duration 분포를 확인해요.
6. 느린 interval을 inspection range로 설정해 CPU와 Swift Tasks를 함께 봐요.
7. network, CPU, scheduling과 actor 경합 중 주된 원인을 분류해요.
8. 수정 후 같은 조건으로 다시 측정하고 안정된 구간은 performance test로 보호해요.

## 면접에서 이어질 수 있는 질문

### 비동기 함수의 실행 시간은 Time Profiler만으로 잴 수 있나요?

정확한 호출 시작부터 반환까지의 elapsed time은 Time Profiler sample만으로 재기 어려워요. Time Profiler는 CPU에서 실행 중인 call stack을 주기적으로 sample하므로 `await`에서 중단된 대기는 빠져요. 메서드 경계에는 signpost interval을 사용하고 원인은 CPU profile과 Swift Tasks로 나눠 봐야 해요.

### `ContinuousClock`과 `OSSignposter`는 무엇이 다른가요?

`ContinuousClock`은 코드에서 경과 시간 값을 바로 계산하는 stopwatch 역할을 해요. `OSSignposter`는 같은 구간을 Instruments timeline에 표시해 CPU, task, Hangs 같은 다른 데이터와 연결하고 반복 interval의 분포를 분석할 수 있게 해요.

### 왜 `defer`에서 `endInterval`을 호출하나요?

비동기 메서드는 정상 반환 외에도 throw와 취소로 scope를 빠져나갈 수 있어요. begin 직후 `defer`를 두면 모든 종료 경로에서 동일한 state로 interval을 한 번 닫을 수 있어요.

### async 함수가 느리면 background thread로 옮기면 되나요?

먼저 느린 시간이 CPU 실행인지 I/O와 actor 대기인지 측정해야 해요. network 대기가 원인이라면 thread를 바꿔도 latency가 줄지 않고, CPU 계산이 Main Actor를 막는 경우에만 격리와 실행 위치를 바꾸는 방향이 의미 있어요.

### task lifetime과 signpost interval이 왜 다른가요?

task는 여러 async 함수를 차례로 실행하거나 child task를 만들 수 있는 실행 단위예요. signpost interval은 개발자가 선택한 한 기능이나 메서드의 의미적 경계이므로 task 전체 수명보다 짧거나 여러 task에 걸칠 수 있어요.

## 참고 자료

- [Apple Developer — OSSignposter](https://developer.apple.com/documentation/os/ossignposter)
- [Apple Developer — Recording Performance Data](https://developer.apple.com/documentation/os/recording-performance-data)
- [Apple Developer — beginInterval(_:id:)](https://developer.apple.com/documentation/os/ossignposter/begininterval%28_%3Aid%3A%29)
- [Apple Developer — endInterval(_:_:)](https://developer.apple.com/documentation/os/ossignposter/endinterval%28_%3A_%3A%29)
- [Apple Developer — withIntervalSignpost(_:id:around:)](https://developer.apple.com/documentation/os/ossignposter/withintervalsignpost%28_%3Aid%3Aaround%3A%29)
- [Apple Developer — ContinuousClock](https://developer.apple.com/documentation/swift/continuousclock)
- [Apple Developer — Clock.measure(_:)](https://developer.apple.com/documentation/swift/clock/measure%28_%3A%29-7l47m)
- [Apple Developer — Analyzing CPU profiles with call tree views](https://developer.apple.com/documentation/xcode/analyzing-cpu-profiles-with-call-tree-views)
- [WWDC22 — Visualize and optimize Swift concurrency](https://developer.apple.com/videos/play/wwdc2022/110350/)
- [WWDC18 — Measuring Performance Using Logging](https://developer.apple.com/videos/play/wwdc2018/405/)
- [SwiftLee — Using Xcode Instruments to optimize Swift Concurrency code](https://www.avanderlee.com/concurrency/using-xcode-instruments-to-optimize-swift-concurrency-code/)
