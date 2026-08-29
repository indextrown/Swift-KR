---
title: Swift로 이해하는 NWConnection과 메시지 경계
description: NWConnection의 연결 상태, TLS 설정과 송수신 완료의 의미를 설명하고 TCP 수신 조각을 한 줄 메시지로 복원하는 예제에 크기 제한·시간 제한·취소·테스트를 연결합니다.
---

# Swift로 이해하는 NWConnection과 메시지 경계

> **면접 답변 한 줄 요약:** NWConnection은 연결 상태와 송수신을 비동기 콜백으로 제공하며, TCP를 사용할 때 앱은 수신된 바이트 조각에서 메시지 경계를 복원하고 오류·종료·취소를 처리해야 해요.

장비가 `temperature=23.5`라는 문자열을 보냈는데 앱에서 앞부분만 보이거나 두 응답이 붙어 보일 수 있어요. TCP에서는 이상 현상이 아니에요. **한 번 보낸 데이터가 한 번의 수신으로 그대로 돌아온다고 가정한 코드**를 고쳐야 해요.

이 문서는 iOS 17+, Swift 6 언어 모드를 기준으로 기존 `NWConnection` API를 설명해요. API 자체는 iOS 12부터 사용할 수 있어요. iOS 26 전용 비동기 연결 API는 [별도 문서](./swift-concurrency.md)에서 다뤄요.

## 먼저 알아둘 용어

| 용어                  | 쉬운 뜻                                                                       |
| --------------------- | ----------------------------------------------------------------------------- |
| 바이트 스트림         | 순서가 있는 바이트의 연속이에요. 앱이 보낸 덩어리의 구분선은 보존하지 않아요. |
| 프레이밍(Framing)     | 바이트 흐름에서 메시지의 시작과 끝을 정하는 규칙이에요.                       |
| 콜백                  | 나중에 상태나 결과가 생겼을 때 시스템이 호출할 함수예요.                      |
| EOF(End of File)      | 이 문서에서는 상대의 송신이 끝나 더 받을 바이트가 없는 상태를 뜻해요.         |
| 반쪽 종료(Half-close) | TCP의 송신 방향만 닫는 동작이에요. 연결 전체 취소와 달라요.                   |
| MainActor             | UI 상태 등 지정한 작업을 직렬로 격리하는 Swift의 전역 액터예요.               |

여기서는 연결 상태, 송수신 완료의 의미, 메시지 복원, 작업 수명, 독립적인 파서 테스트를 순서대로 확인해요.

## 연결은 생성 직후부터 준비된 상태가 아니에요

아래 코드는 TLS로 보호되는 연결을 구성해요. 목적지에는 실제로 해당 포트에서 동작하는 TLS 서버가 필요해요.

```swift
import Network

func makeSecureConnection(host: NWEndpoint.Host,
                          port: NWEndpoint.Port) -> NWConnection {
    NWConnection(host: host, port: port, using: .tls)
}
```

`.tls`는 TLS와 TCP를 사용하는 구성이에요. `.tcp`로 바꾸면 암호화 없는 TCP가 되므로 실서비스 연결 오류를 피하려고 바꾸지 않아요. HTTP 서버에 연결했다면 TLS 위에서 HTTP 규칙도 지켜야 해요. 웹 API 호출에는 [URLSession](./index.md)을 먼저 사용해요.

[`NWConnection.State`](https://developer.apple.com/documentation/network/nwconnection/state-swift.enum)의 상태를 구분해요.

| 상태              | 의미와 처리                                                                      |
| ----------------- | -------------------------------------------------------------------------------- |
| `.setup`          | 생성됐지만 아직 시작하지 않았어요.                                               |
| `.preparing`      | 주소 해석·연결·프로토콜 준비가 진행 중이에요.                                    |
| `.waiting(error)` | 현재 조건에서 연결할 수 없어 기다려요. 즉시 영구 실패로 단정하지 않아요.         |
| `.ready`          | 연결을 사용해 데이터를 주고받을 수 있어요. 서버 업무의 성공이라는 뜻은 아니에요. |
| `.failed(error)`  | 연결이 실패했어요. 필요하면 정책에 따라 새 연결을 만들어요.                      |
| `.cancelled`      | 연결이 취소됐어요. 같은 인스턴스를 다시 시작하는 용도로 사용하지 않아요.         |

`stateUpdateHandler`를 설치하고 `start(queue:)`를 호출해요. 콜백이 실행되는 큐와 앱 상태가 격리되는 액터는 별개의 개념이므로, 아래 전체 예제는 콜백에서 MainActor로 명시적으로 이동해요.

## send 한 번과 receive 한 번은 짝이 아니에요

다음과 같은 처리는 UTF-8 문자열 하나조차 안전하게 복원하지 못해요.

```swift
import Foundation
import Network

func receiveOneChunkIncorrectly(on connection: NWConnection) {
    connection.receive(minimumIncompleteLength: 1,
                       maximumLength: 4096) { data, _, _, _ in
        guard let data else { return }
        print(String(decoding: data, as: UTF8.self))
        // 잘못된 가정: 이 조각이 응답 메시지 전체라고 생각해요.
    }
}
```

한글 한 글자의 바이트도 여러 수신에 나뉠 수 있어요. 조각마다 문자열로 바꾸면 아직 완성되지 않은 UTF-8을 잘못 해석할 수 있어요. 두 메시지가 한 조각에 들어오는 경우도 처리하지 못해요.

[`receive`](<https://developer.apple.com/documentation/network/nwconnection/receive(minimumincompletelength:maximumlength:completion:)>)는 **호출 한 번당 완료 콜백 한 번**을 예약해요. 계속 받으려면 결과를 처리한 다음 다시 호출해야 해요. `maximumLength`는 이번 수신 조각의 상한이지, 전체 메시지의 상한이 아니에요.

## 먼저 한 줄 프로토콜의 규칙을 정해요

예제에서는 양쪽이 다음 규칙을 사용한다고 가정해요.

- 메시지는 UTF-8이고 줄바꿈 바이트 `0x0A`로 끝나요.
- 본문에는 줄바꿈을 넣지 않아요. 최대 본문 크기는 4,096바이트예요.
- 요청은 `READ\n`, 응답은 예를 들어 `temperature=23.5\n`이에요.
- 요청 하나에 응답 한 줄을 받은 뒤 클라이언트가 연결을 닫아요.

실제로 `\`와 `n` 두 문자를 보내는 것이 아니라 줄바꿈 바이트를 보내요. 바이너리 데이터에는 길이 헤더 같은 다른 프레이밍이 더 적합할 수 있어요. 양쪽의 규칙은 반드시 같아야 해요.

다음 파서는 네트워크와 무관한 값 타입이에요. 바이트를 누적하고 줄이 완성된 시점에만 문자열로 바꿔요.

```swift
import Foundation

enum LineProtocolError: Error, Equatable {
    case tooLong
    case invalidUTF8
    case incompleteLine
}

struct LineDecoder {
    let maximumBytes: Int
    private var pending: [UInt8] = []

    init(maximumBytes: Int = 4096) {
        precondition(maximumBytes > 0)
        self.maximumBytes = maximumBytes
    }

    mutating func append(_ chunk: Data) throws -> [String] {
        var lines: [String] = []
        for byte in chunk {
            if byte == 0x0A {
                guard let line = String(bytes: pending, encoding: .utf8) else {
                    throw LineProtocolError.invalidUTF8
                }
                lines.append(line)
                pending.removeAll(keepingCapacity: true)
            } else {
                guard pending.count < maximumBytes else {
                    throw LineProtocolError.tooLong
                }
                pending.append(byte)
            }
        }
        return lines
    }

    func finish() throws {
        guard pending.isEmpty else {
            throw LineProtocolError.incompleteLine
        }
    }
}
```

분리된 한 메시지와 합쳐진 여러 메시지를 모두 다뤄요. 줄바꿈 없이 계속 보내는 상대가 메모리를 무한히 늘리지 못하도록 누적 크기를 제한해요. 파싱 오류 뒤에는 이 파서를 계속 사용하지 않고 연결을 종료하는 정책을 선택해요.

## 연결·취소·시간 제한까지 묶어요

아래 `LineRequest`는 **한 번만 사용하는 요청 객체**예요. 앞의 파서와 함께 넣으면 컴파일할 수 있어요. 콜백은 MainActor에서 전달되며, 동시에 겹친 종료 원인 중 첫 결과만 호출자에게 전달해요.

```swift
import Foundation
import Network

enum LineRequestError: Error {
    case invalidRequest
    case alreadyStarted
    case endedBeforeResponse
    case timedOut
}

@MainActor
final class LineRequest {
    private let connection: NWConnection
    private var decoder = LineDecoder()
    private var started = false
    private var finished = false
    private var sent = false
    private var deadlineTask: Task<Void, Never>?
    private var completion: ((Result<String, any Error>) -> Void)?

    init(endpoint: NWEndpoint, parameters: NWParameters = .tls) {
        connection = NWConnection(to: endpoint, using: parameters)
    }

    func start(command: String = "READ", timeout: Duration = .seconds(10),
               completion: @escaping (Result<String, any Error>) -> Void) {
        guard !started, !finished else {
            completion(.failure(LineRequestError.alreadyStarted))
            return
        }
        started = true
        self.completion = completion
        guard !command.contains("\n"), command.utf8.count <= 4096 else {
            finish(.failure(LineRequestError.invalidRequest))
            return
        }
        let payload = Data((command + "\n").utf8)

        connection.stateUpdateHandler = { [weak self] state in
            Task { @MainActor [weak self] in
                guard let self, !self.finished else { return }
                switch state {
                case .ready:
                    guard !self.sent else { return }
                    self.sent = true
                    self.receiveNext()
                    self.connection.send(content: payload,
                                         completion: .contentProcessed { [weak self] error in
                        guard let error else { return }
                        Task { @MainActor [weak self] in
                            self?.finish(.failure(error))
                        }
                    })
                case .failed(let error):
                    self.finish(.failure(error))
                case .cancelled:
                    self.finish(.failure(CancellationError()))
                default:
                    break // waiting에서는 전체 시간 제한까지 기다려요.
                }
            }
        }

        deadlineTask = Task { [weak self] in
            do {
                try await Task.sleep(for: timeout)
                self?.finish(.failure(LineRequestError.timedOut))
            } catch {
                // 정상 종료나 사용자 취소로 시간 제한 작업도 취소됐어요.
            }
        }
        connection.start(queue: .main)
    }

    func cancel() {
        finish(.failure(CancellationError()))
    }

    private func receiveNext() {
        connection.receive(minimumIncompleteLength: 1,
                           maximumLength: 4096) { [weak self] data, _, isComplete, error in
            Task { @MainActor [weak self] in
                guard let self, !self.finished else { return }
                do {
                    if let data, let line = try self.decoder.append(data).first {
                        self.finish(.success(line))
                        return
                    }
                    if let error {
                        self.finish(.failure(error))
                    } else if isComplete {
                        try self.decoder.finish()
                        self.finish(.failure(LineRequestError.endedBeforeResponse))
                    } else {
                        self.receiveNext()
                    }
                } catch {
                    self.finish(.failure(error))
                }
            }
        }
    }

    private func finish(_ result: Result<String, any Error>) {
        guard !finished else { return }
        finished = true
        deadlineTask?.cancel()
        deadlineTask = nil
        connection.cancel()
        let callback = completion
        completion = nil
        callback?(result)
    }

    deinit {
        deadlineTask?.cancel()
        connection.cancel()
    }
}
```

`.waiting`에서는 연결 조건이 개선될 가능성을 남겨 두되 전체 시간 제한은 유지해요. 이 10초는 서버와 사용자 경험에 맞춰 정할 **예제의 정책**이지 Network의 기본 시간 제한이 아니에요. 완료 콜백에서 오류를 받아 재시도하려면 새 `LineRequest`를 만들어요.

수신 데이터와 종료 표시가 함께 올 수 있어 데이터를 먼저 파싱해요. 첫 완성 줄을 받으면 성공으로 마치며, 이후 추가 줄을 처리하는 스트리밍 클라이언트는 아니에요. 응답을 받은 뒤 데이터베이스 반영까지 보장하려면 별도 업무 응답 규칙이 필요해요.

### 호출자가 요청 객체의 수명을 유지해요

지역 변수로 만들고 즉시 버리지 말고 화면의 모델이나 서비스가 보관해요. 아래는 호출 방식만 보여주는 소유자예요.

```swift
import Network

@MainActor
final class DeviceReader {
    private var request: LineRequest?
    private(set) var message = "대기 중"

    func read(endpoint: NWEndpoint) {
        request?.cancel()
        let next = LineRequest(endpoint: endpoint)
        request = next
        next.start { [weak self] result in
            switch result {
            case .success(let line): self?.message = line
            case .failure(let error): self?.message = String(describing: error)
            }
            self?.request = nil
        }
    }

    func stop() {
        request?.cancel()
        request = nil
    }
}
```

UI 관찰 코드는 생략했어요. UIKit의 화면 종료나 SwiftUI에서 작업을 소유한 계층의 종료 정책에 맞춰 `stop()`을 호출해요. 단순히 화면이 잠시 가려졌다는 이유만으로 언제나 취소해야 하는 것은 아니에요.

## 송신 완료·수신 완료·업무 완료를 구분해요

[`send`](<https://developer.apple.com/documentation/network/nwconnection/send(content:contentcontext:iscomplete:completion:)-5ecuz>)의 완료는 상대 앱이 요청을 처리했다는 업무 응답이 아니에요.

| 신호                     | 알 수 있는 것                              | 알 수 없는 것                            |
| ------------------------ | ------------------------------------------ | ---------------------------------------- |
| `.contentProcessed(nil)` | 연결이 송신 데이터를 오류 없이 처리했어요. | 상대의 저장·결제 등 업무 완료            |
| TCP 수신의 `isComplete`  | 수신 콘텐츠/스트림이 완료됐어요.           | 방금 받은 조각 하나가 앱 메시지 하나인지 |
| 앱이 정한 성공 응답      | 합의한 프로토콜의 성공 조건이 충족됐어요.  | 그 프로토콜에 포함하지 않은 후속 작업    |

`send`의 기본 `isComplete: true`는 송신 콘텐츠 컨텍스트의 완료 표시예요. TCP에서 그 값만으로 줄바꿈이 삽입되거나 상대 수신이 메시지별로 나뉘지 않아요. 송신 방향을 닫으려면 `.finalMessage` 같은 최종 컨텍스트의 의미를 확인해요. `cancel()`은 정상적인 업무 종료 응답을 대신하지 않아요.

UDP에서는 메시지 단위 API인 [`receiveMessage`](<https://developer.apple.com/documentation/network/nwconnection/receivemessage(completion:)>)를 검토해요. 데이터그램 경계가 있다고 전달이나 순서까지 보장되지는 않으며, 이 TCP 한 줄 파서를 그대로 적용할 필요도 없어요.

## 파서는 네트워크 없이 테스트해요

Swift Testing은 `@Test`와 `#expect`로 기대 결과를 표현하는 Apple의 테스트 도구예요. 테스트 타깃에서 파서 타입을 볼 수 있게 한 뒤 아래 코드를 실행해요.

```swift
import Foundation
import Testing

@Test func fragmentedUTF8AndCombinedLines() throws {
    var decoder = LineDecoder()
    let bytes = Array("온도=23.5\nOK\n".utf8)
    #expect(try decoder.append(Data(bytes.prefix(1))).isEmpty)
    #expect(try decoder.append(Data(bytes.dropFirst(1))) == ["온도=23.5", "OK"])
    try decoder.finish()
}

@Test func oversizedLineIsRejected() throws {
    var decoder = LineDecoder(maximumBytes: 3)
    #expect(throws: LineProtocolError.tooLong) {
        try decoder.append(Data("1234".utf8))
    }
}

@Test func unfinishedLineIsRejected() throws {
    var decoder = LineDecoder()
    _ = try decoder.append(Data("partial".utf8))
    #expect(throws: LineProtocolError.incompleteLine) {
        try decoder.finish()
    }
}

@Test func invalidUTF8IsRejected() throws {
    var decoder = LineDecoder()
    #expect(throws: LineProtocolError.invalidUTF8) {
        try decoder.append(Data([0xFF, 0x0A]))
    }
}
```

이 테스트는 네트워크 속도에 의존하지 않아요. 실제 연결의 인증서 오류, 시간 제한, 상대 종료와 사용자 취소는 별도의 통합 테스트로 확인해야 해요. 한 번에 한 조각만 오는 서버로만 시험하면 스트림 처리 버그를 놓칠 수 있어요.

## 적용 순서를 정리해요

1. 상대의 프로토콜과 TLS 구성을 확인해요.
2. 메시지 경계와 크기 제한을 먼저 구현하고 테스트해요.
3. 콜백을 설치한 뒤 연결을 시작해요.
4. 상태·송수신·시간 제한 중 어느 경로에서도 한 번만 완료되게 해요.
5. 소유자가 객체를 보관하고 필요할 때 취소하게 해요.
6. 재시도는 새 연결과 중복 처리 방지 정책을 함께 설계해요.

큰 파일을 한 줄로 받거나, 많은 연결의 파싱을 MainActor에 모으는 구조에는 이 예제가 적합하지 않아요. 이때는 스트리밍 형식과 별도 데이터 처리 격리 영역을 설계해요.

## 면접에서 이어질 수 있는 질문

### TCP에서도 메시지가 분리되나요

TCP는 바이트 순서를 제공하지만 앱 메시지의 경계를 보존하지 않아요. 구분자·길이 헤더·고정 길이 등 양쪽이 합의한 프레이밍이 필요해요.

### maximumLength만 설정하면 큰 메시지 공격을 막을 수 있나요

아니에요. 한 번의 수신량만 제한하므로 누적 버퍼와 전체 메시지 크기도 제한해야 해요. 메시지가 끝나지 않는 경우를 위해 시간 제한도 필요해요.

### 송신 완료 콜백에서 저장 성공 화면을 보여도 되나요

상대 앱의 저장 성공을 뜻하지 않아요. 저장 여부를 나타내는 응답, 요청 식별자, 실패 후 재시도의 중복 처리 규칙을 앱 프로토콜로 정해야 해요.

## 참고 자료

- [Apple Developer — NWConnection](https://developer.apple.com/documentation/network/nwconnection)
- [Apple Developer — NWConnection.State](https://developer.apple.com/documentation/network/nwconnection/state-swift.enum)
- [Apple Developer — receive(minimumIncompleteLength:maximumLength:completion:)](<https://developer.apple.com/documentation/network/nwconnection/receive(minimumincompletelength:maximumlength:completion:)>)
- [Apple Developer — send(content:contentContext:isComplete:completion:)](<https://developer.apple.com/documentation/network/nwconnection/send(content:contentcontext:iscomplete:completion:)-5ecuz>)
- [Apple Developer — receiveMessage(completion:)](<https://developer.apple.com/documentation/network/nwconnection/receivemessage(completion:)>)
- [WWDC25 — Use structured concurrency with Network framework](https://developer.apple.com/videos/play/wwdc2025/250/)
