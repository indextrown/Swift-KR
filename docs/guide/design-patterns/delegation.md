---
title: Swift로 이해하는 Delegation 패턴
description: Swift 프로토콜로 객체의 책임과 사건 처리를 delegate에 위임하고, weak 참조·클로저·Observer·Data Source와의 차이 및 테스트 방법을 설명합니다.
---

# Swift로 이해하는 Delegation 패턴

> **면접 답변 한 줄 요약:** Delegation 패턴은 한 객체가 처리할 일이나 발생한 사건을 미리 정한 약속을 통해 다른 객체에 맡겨, 구체적인 처리 방법을 몰라도 동작을 확장할 수 있게 하는 설계 패턴이에요.

Delegation은 한국어로 **위임 패턴**이라고 불러요. 위임하는 구조 전체가 Delegation 패턴이고, 실제 일을 전달받는 객체가 **delegate**예요. 두 표현을 같은 뜻으로 사용하기도 하지만, 패턴과 참여 객체를 구분하면 코드를 이해하기 쉬워요.

## 먼저 알아둘 설계 용어

| 용어           | 쉬운 뜻                                                                                    |
| -------------- | ------------------------------------------------------------------------------------------ |
| 위임하는 객체  | 자신의 일부 책임이나 사건 처리를 다른 객체에 맡기는 객체예요.                              |
| delegate       | 위임받은 일을 처리하는 객체예요.                                                           |
| 프로토콜       | delegate가 제공해야 할 프로퍼티와 메서드를 정한 Swift의 약속이에요.                        |
| 콜백(callback) | 어떤 작업이나 사건이 일어났을 때 나중에 호출되는 코드예요.                                 |
| 소유권         | 객체를 메모리에 계속 유지할 책임이 누구에게 있는지 나타내는 관계예요.                      |
| 강한 참조      | 대상 객체를 메모리에 유지하는 참조예요. Swift에서는 기본 참조 방식이에요.                  |
| 약한 참조      | 대상 객체를 메모리에 유지하지 않는 `weak` 참조예요. 대상이 사라지면 자동으로 `nil`이 돼요. |
| `AnyObject`    | 프로토콜을 클래스 인스턴스만 따를 수 있도록 제한하는 Swift 문법이에요.                     |
| Data Source    | 화면이나 객체가 표시하고 처리할 데이터를 외부에서 공급하는 역할이에요.                     |
| Observer       | 한 객체에서 생긴 변화나 사건을 여러 구독자에게 알리는 설계 패턴이에요.                     |
| Strategy       | 같은 목적의 여러 계산 방법을 교체할 수 있게 분리하는 설계 패턴이에요.                      |
| `async/await`  | 비동기 작업이 끝날 때까지 기다린 뒤 결과를 이어서 처리하는 Swift 문법이에요.               |
| MainActor      | UI처럼 메인 실행 흐름에서 다뤄야 하는 코드를 격리하는 Swift의 전역 actor예요.              |
| Spy            | 호출 횟수와 전달 값을 기록해 동작을 검증하는 테스트용 객체예요.                            |

이 문서에서는 다음 내용을 설명해요.

- Delegation이 객체 사이의 책임을 분리하는 방법
- Swift 프로토콜로 delegate의 약속을 만드는 과정
- `weak` delegate와 순환 참조의 관계
- 클로저, Observer, Strategy, Data Source와의 차이
- delegate 호출을 테스트하는 방법
- Delegation보다 `async/await`가 단순한 경우

## Delegation은 처리 방법을 다른 객체에 맡겨요

파일을 내려받는 객체를 생각해 볼게요. 다운로드 작업은 진행률과 완료 시점을 알지만, 그 정보를 화면에 표시할지 로그로 남길지는 알 필요가 없어요.

```text
DownloadTask ── 진행률·완료 사건 ──> delegate
     │                                  │
     └─ 다운로드 흐름 담당              └─ 앱에 맞는 반응 담당
```

Delegation 패턴에서는 다운로드 흐름과 사건에 반응하는 코드를 서로 다른 객체에 둬요. `DownloadTask`는 약속된 메서드를 호출할 뿐이고, delegate는 화면 갱신이나 상태 저장처럼 앱에 맞는 동작을 수행해요.

Swift 공식 문서의 [Protocols](https://docs.swift.org/swift-book/documentation/the-swift-programming-language/protocols/)도 Delegation을 클래스나 구조체가 자신의 책임 일부를 다른 타입의 인스턴스에 넘기는 디자인 패턴으로 설명해요.

## 구체적인 화면을 직접 알면 재사용하기 어려워요

먼저 다운로드 객체가 특정 화면을 직접 사용하는 코드를 볼게요.

```swift
final class DownloadScreen {
  func showProgress(_ progress: Double) {
    print("진행률: \(progress)")
  }

  func showDownloadedFile(named fileName: String) {
    print("완료: \(fileName)")
  }
}

final class DownloadTask {
  private let screen: DownloadScreen

  init(screen: DownloadScreen) {
    self.screen = screen
  }

  func start() {
    screen.showProgress(0.5)
    screen.showProgress(1.0)
    screen.showDownloadedFile(named: "guide.pdf")
  }
}
```

이 예제에서 `DownloadTask`는 다운로드 흐름뿐 아니라 결과를 표시할 구체적인 화면까지 알아요.

- 콘솔 앱이나 백그라운드 작업에서 재사용하기 어려워요.
- 다른 화면에 연결하려면 `DownloadTask`를 수정해야 해요.
- 다운로드 사건이 제대로 발생했는지 화면 없이 테스트하기 어려워요.
- 작업 객체와 표현 객체의 변경 이유가 서로 얽혀요.

`DownloadTask`가 꼭 알아야 하는 것은 특정 화면이 아니라, 진행률과 완료 사건을 전달할 상대가 있다는 사실이에요.

## 프로토콜로 delegate의 약속을 만들어요

delegate가 처리해야 할 사건을 프로토콜로 표현해요.

```swift
protocol DownloadTaskDelegate: AnyObject {
  func downloadTask(
    _ task: DownloadTask,
    didUpdate progress: Double
  )

  func downloadTask(
    _ task: DownloadTask,
    didFinishWith fileName: String
  )
}
```

이름에는 보통 위임하는 타입과 `Delegate`를 함께 사용해 `DownloadTaskDelegate`처럼 역할을 드러내요. 메서드의 첫 번째 인자로 사건을 보낸 객체를 전달하면, 하나의 delegate가 여러 작업을 처리할 때 출처를 구분할 수 있어요.

`AnyObject`는 이 프로토콜을 클래스만 채택할 수 있게 해요. 잠시 뒤 delegate 프로퍼티를 `weak`로 선언하려면 클래스 인스턴스라는 제한이 필요해요.

## 위임하는 객체는 delegate의 구체 타입을 몰라요

`DownloadTask`는 프로토콜 타입의 delegate만 보관하고 사건이 생길 때 약속된 메서드를 호출해요.

```swift
final class DownloadTask {
  weak var delegate: (any DownloadTaskDelegate)?

  func start() {
    delegate?.downloadTask(
      self,
      didUpdate: 0.5
    )

    delegate?.downloadTask(
      self,
      didUpdate: 1.0
    )

    delegate?.downloadTask(
      self,
      didFinishWith: "guide.pdf"
    )
  }
}
```

`DownloadTask`는 delegate가 화면인지, 뷰 모델인지, 테스트 객체인지 몰라요. 메서드가 존재한다는 약속만 알아요.

앱에 필요한 반응은 별도 타입에서 구현해요.

```swift
final class DownloadViewModel: DownloadTaskDelegate {
  private(set) var progress = 0.0
  private(set) var downloadedFileName: String?

  func downloadTask(
    _ task: DownloadTask,
    didUpdate progress: Double
  ) {
    self.progress = progress
  }

  func downloadTask(
    _ task: DownloadTask,
    didFinishWith fileName: String
  ) {
    downloadedFileName = fileName
  }
}
```

두 객체를 조립하는 코드는 delegate를 연결해요.

```swift
let task = DownloadTask()
let viewModel = DownloadViewModel()

task.delegate = viewModel
task.start()

viewModel.progress // 1.0
viewModel.downloadedFileName // "guide.pdf"
```

이제 `DownloadTask`를 고치지 않고도 새로운 delegate를 연결해 다른 동작을 만들 수 있어요.

## weak는 흔한 선택이지만 항상 규칙은 아니에요

delegate를 `weak`로 선언하는 가장 흔한 이유는 **강한 참조 순환**을 피하기 위해서예요. 강한 참조 순환은 두 클래스 인스턴스가 서로를 강하게 붙잡아 더 이상 사용하지 않아도 메모리에서 해제되지 않는 상태예요.

```text
DownloadViewModel ── strong ──> DownloadTask
        ▲                            │
        └──────── weak delegate ─────┘
```

뷰 모델이 작업을 강하게 소유하고, 작업은 뷰 모델을 약하게 참조하면 순환이 만들어지지 않아요. Swift의 참조 관계와 해제 규칙은 [Automatic Reference Counting](https://docs.swift.org/swift-book/documentation/the-swift-programming-language/automaticreferencecounting/)에서 자세히 확인할 수 있어요.

다만 “delegate는 무조건 `weak`”이라고 외우면 안 돼요. 소유권은 각 API의 계약에 따라 달라요.

- 커스텀 UI 객체처럼 delegate가 소유자를 다시 가리키는 구조에서는 `weak`가 자연스러운 경우가 많아요.
- 다른 곳에서 delegate를 강하게 보관하지 않으면 `weak` delegate는 바로 사라져 콜백을 받지 못할 수 있어요.
- Foundation의 [`URLSession`](https://developer.apple.com/documentation/foundation/urlsession)은 세션이 무효화될 때까지 delegate를 강하게 참조해요.

따라서 메모리 관계를 먼저 그린 뒤, 누가 누구의 수명을 책임지는지 정하고 참조 방식을 선택해야 해요.

## delegate는 한 명, Observer는 여러 명이 자연스러워요

Delegation과 Observer는 모두 사건을 전달하지만 관계의 의도가 달라요. Observer는 한 객체의 변경을 여러 구독자에게 알리는 패턴이에요.

| 기준        | Delegation                               | Observer                                     |
| ----------- | ---------------------------------------- | -------------------------------------------- |
| 주요 목적   | 책임이나 처리 결정을 다른 객체에 맡겨요. | 상태 변화나 사건을 구독자에게 알려요.        |
| 수신자 수   | 보통 대표 delegate 한 명이에요.          | 여러 observer가 자연스러워요.                |
| 양방향 질문 | delegate에게 값을 요청할 수 있어요.      | 주로 사건을 한 방향으로 전달해요.            |
| 관계의 강도 | 두 역할이 비교적 명확하게 협력해요.      | 발신자는 각 구독자의 구체적인 역할을 몰라요. |

여러 화면과 서비스가 같은 사건을 동시에 받아야 한다면 NotificationCenter, Combine 같은 발행·구독 방식이나 별도의 Observer 구현이 더 잘 맞을 수 있어요.

## 사건이 하나라면 클로저가 더 간단할 수 있어요

완료 사건 하나만 전달한다면 프로토콜과 별도 타입보다 클로저가 읽기 쉬울 수 있어요.

```swift
final class ClosureDownloadTask {
  var onFinish: ((String) -> Void)?

  func start() {
    onFinish?("guide.pdf")
  }
}
```

호출하는 쪽에서 필요한 동작을 바로 연결해요.

```swift
let task = ClosureDownloadTask()

task.onFinish = { fileName in
  print("완료: \(fileName)")
}

task.start()
```

클로저가 바깥 객체의 `self`를 강하게 캡처하고, 그 객체가 다시 작업을 소유하면 참조 순환이 생길 수 있어요. 저장되는 클로저의 캡처 관계도 delegate의 소유권과 마찬가지로 확인해야 해요. Swift 클로저의 캡처 규칙은 [Closures](https://docs.swift.org/swift-book/documentation/the-swift-programming-language/closures/)에서 확인할 수 있어요.

선택 기준은 다음처럼 정리할 수 있어요.

| 상황                                          | 적합한 표현   |
| --------------------------------------------- | ------------- |
| 단순한 완료 콜백 하나가 필요해요.             | 클로저        |
| 여러 관련 사건과 질문이 하나의 역할을 이뤄요. | Delegation    |
| 여러 수신자가 같은 사건을 받아야 해요.        | Observer      |
| 작업 결과를 한 번 기다렸다가 받으면 돼요.     | `async/await` |

## Delegation, Data Source, Strategy는 역할이 달라요

iOS 프레임워크에서는 delegate와 data source를 함께 사용하는 경우가 많아요. [`UITableViewDelegate`](https://developer.apple.com/documentation/uikit/uitableviewdelegate)는 행 선택이나 표시 같은 동작을 조정하고, data source는 테이블이 표시할 데이터를 제공해요.

비슷해 보이는 패턴을 질문에 따라 구분해 볼게요.

| 개념                                     | 답하는 질문                                     | 예                                     |
| ---------------------------------------- | ----------------------------------------------- | -------------------------------------- |
| Delegation                               | 이 객체의 사건이나 일부 책임을 누가 처리하나요? | 다운로드 진행률을 누가 반영하나요?     |
| Data Source                              | 이 객체에 필요한 데이터를 누가 제공하나요?      | 목록의 행 개수와 내용을 누가 주나요?   |
| [Strategy](./strategy.md)                | 교체 가능한 계산 방법을 어떻게 분리하나요?      | 어떤 할인 계산법을 사용하나요?         |
| [의존성 주입](./dependency-injection.md) | 필요한 협력 객체를 외부에서 어떻게 전달하나요?  | delegate나 Strategy를 누가 연결하나요? |

실제 API에서는 delegate가 데이터를 요청하기도 하고 data source가 동작을 조정하기도 해 이름의 경계가 완벽하지 않을 수 있어요. 타입 이름만 보지 말고 메서드가 맡은 책임을 확인하는 것이 중요해요.

## 한 번의 결과라면 async/await를 먼저 검토해요

비동기 작업이 성공 값 하나를 반환하거나 오류를 던지고 끝난다면 delegate 없이 함수의 반환 관계를 그대로 표현할 수 있어요.

```swift
func downloadFile() async throws -> String {
  // 실제 앱에서는 네트워크 요청을 수행해요.
  "guide.pdf"
}

let fileName = try await downloadFile()
```

반면 진행률, 인증 요청, 연결 상태 변경처럼 작업 도중 여러 사건을 계속 주고받아야 한다면 delegate가 여전히 유용할 수 있어요. Apple의 [`URLSessionDelegate`](https://developer.apple.com/documentation/foundation/urlsessiondelegate) 계열 API가 이런 예예요.

새 코드에서는 익숙한 패턴이라는 이유만으로 delegate를 선택하기보다 데이터의 흐름을 먼저 살펴봐야 해요.

- 결과가 한 번 오는가, 여러 사건이 이어지는가?
- 수신자는 한 명인가, 여러 명인가?
- 발신자가 수신자에게 값을 다시 물어봐야 하는가?
- 호출 순서와 객체 수명을 누가 관리하는가?

## UI를 갱신한다면 실행 위치도 계약에 포함해요

`weak`는 객체의 수명만 다루고, 콜백이 어느 실행 흐름에서 호출되는지는 보장하지 않아요. delegate가 UI 상태를 바꾼다면 메인 액터에서 실행되도록 설계해야 해요.

Swift의 [`MainActor`](https://developer.apple.com/documentation/swift/mainactor)는 메인 실행기에서 수행해야 하는 코드를 격리하는 전역 actor예요. 프로토콜 전체나 UI를 다루는 구현을 `@MainActor`로 표시할 수 있지만, 위임하는 쪽도 그 격리 규칙에 맞춰 호출해야 해요.

프레임워크 delegate를 구현할 때는 임의로 추측하지 말고 API 문서의 호출 스레드와 actor 표기를 확인해야 해요.

## 테스트에서는 사건을 기록하는 Spy를 연결해요

Spy는 호출 여부와 전달된 값을 기록하는 테스트용 객체예요.

```swift
private final class DownloadTaskDelegateSpy:
  DownloadTaskDelegate
{
  private(set) var progresses: [Double] = []
  private(set) var downloadedFileName: String?

  func downloadTask(
    _ task: DownloadTask,
    didUpdate progress: Double
  ) {
    progresses.append(progress)
  }

  func downloadTask(
    _ task: DownloadTask,
    didFinishWith fileName: String
  ) {
    downloadedFileName = fileName
  }
}
```

테스트에서는 Spy를 강한 지역 변수로 유지한 채 delegate로 연결해요.

```swift
import Testing

@Test
func startNotifiesProgressAndCompletion() {
  let task = DownloadTask()
  let spy = DownloadTaskDelegateSpy()

  task.delegate = spy
  task.start()

  #expect(spy.progresses == [0.5, 1.0])
  #expect(spy.downloadedFileName == "guide.pdf")
}
```

이 테스트는 실제 화면 없이도 `DownloadTask`가 약속된 사건을 올바른 순서와 값으로 전달하는지 확인해요.

## 언제 사용하면 좋을까요?

다음 상황에서는 Delegation을 고려할 수 있어요.

- 재사용 가능한 객체가 앱마다 다른 반응을 외부에 맡겨야 해요.
- 한 객체가 여러 관련 사건을 대표 수신자 한 명에게 전달해요.
- 사건을 알리는 것뿐 아니라 delegate에게 값이나 결정을 요청해야 해요.
- 프레임워크가 delegate 프로토콜을 확장 지점으로 제공해요.
- 구현을 교체해 작업 객체와 반응 코드를 따로 테스트하고 싶어요.

## 언제 사용하지 않는 편이 좋을까요?

다음 상황에서는 더 단순한 방법을 먼저 검토해요.

- 작은 완료 동작 하나뿐이라 클로저 하나로 충분해요.
- 여러 객체가 동시에 사건을 받아야 해서 Observer가 더 자연스러워요.
- 비동기 결과 하나만 필요해 `async/await` 반환으로 흐름을 표현할 수 있어요.
- 위임할 책임이 불분명해 모든 동작을 하나의 거대한 delegate에 모으게 돼요.
- delegate의 선택과 수명이 전역에서 바뀌어 실행 흐름을 추적하기 어려워져요.

Delegation의 목적은 메서드를 다른 파일로 옮기는 것이 아니라, 두 객체의 역할과 협력 계약을 분명하게 만드는 것이에요.

## 적용 순서

기존 코드에 Delegation을 도입할 때는 다음 순서로 진행해 보세요.

1. 위임하는 객체가 직접 처리하지만 외부 정책에 가까운 책임이나 사건을 찾습니다.
2. delegate가 반드시 제공해야 할 동작을 작은 프로토콜로 정의합니다.
3. 위임하는 객체는 구체 타입 대신 프로토콜 타입을 참조합니다.
4. 사건이 발생한 정확한 지점에서 delegate 메서드를 호출합니다.
5. 객체 그래프를 그려 delegate를 `weak`로 둘지 강하게 소유할지 정합니다.
6. 단일 클로저, Observer, `async/await`가 더 단순하지 않은지 비교합니다.
7. Spy를 연결해 호출 횟수, 순서, 전달 값을 테스트합니다.

## 면접에서 자주 나오는 질문

### Q1. Delegation 패턴은 무엇인가요?

한 객체가 자신의 일부 책임이나 사건 처리를 프로토콜로 약속한 다른 객체에 맡기는 설계 패턴이에요. 위임하는 객체는 구체 구현을 몰라도 되고, delegate를 교체해 동작을 확장할 수 있어요.

### Q2. delegate 프로퍼티를 왜 weak로 선언하나요?

위임하는 객체와 delegate가 서로를 강하게 참조할 때 생기는 강한 참조 순환을 피하기 위해서예요. 다만 delegate의 수명을 위임하는 객체가 책임져야 하는 API도 있으므로, 항상 `weak`라고 외우기보다 소유권 계약을 확인해야 해요.

### Q3. Delegation과 클로저는 어떻게 선택하나요?

완료 처리처럼 동작 하나만 전달하면 클로저가 간단해요. 여러 관련 사건, 상태 변경, 값 요청이 하나의 역할을 이룬다면 이름 있는 프로토콜로 계약을 표현하는 Delegation이 읽고 확장하기 쉬워요.

### Q4. Delegation과 Observer의 차이는 무엇인가요?

Delegation은 보통 대표 객체 한 명에게 책임이나 결정을 맡기는 일대일 관계예요. Observer는 한 발신자의 사건을 여러 구독자에게 알리는 일대다 관계에 더 적합해요.

### Q5. weak delegate를 연결했는데 콜백이 오지 않는 이유는 무엇일 수 있나요?

delegate를 다른 곳에서 강하게 보관하지 않아 연결 직후 해제됐을 수 있어요. `weak` 참조는 대상의 수명을 늘리지 않으므로, 화면이나 coordinator처럼 적절한 소유자가 delegate를 유지해야 해요.

## 참고 자료

- [The Swift Programming Language - Protocols](https://docs.swift.org/swift-book/documentation/the-swift-programming-language/protocols/)
- [The Swift Programming Language - Automatic Reference Counting](https://docs.swift.org/swift-book/documentation/the-swift-programming-language/automaticreferencecounting/)
- [The Swift Programming Language - Closures](https://docs.swift.org/swift-book/documentation/the-swift-programming-language/closures/)
- [Apple Developer Documentation - URLSession](https://developer.apple.com/documentation/foundation/urlsession)
- [Apple Developer Documentation - URLSessionDelegate](https://developer.apple.com/documentation/foundation/urlsessiondelegate)
- [Apple Developer Documentation - UITableViewDelegate](https://developer.apple.com/documentation/uikit/uitableviewdelegate)
- [Apple Developer Documentation - MainActor](https://developer.apple.com/documentation/swift/mainactor)
