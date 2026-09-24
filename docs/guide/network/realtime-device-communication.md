---
title: 'Swift로 이해하는 실시간 장비 통신: HTTP·SSE·UDP·TCP'
description: RTK 장비 통신 사례로 HTTP 요청, SSE 상태 이벤트, UDP 측정값, TCP 바이너리 중계를 조합하고 메시지 경계·재연결·취소·보안을 설계하는 방법을 설명합니다.
---

# Swift로 이해하는 실시간 장비 통신: HTTP·SSE·UDP·TCP

> **면접 답변 한 줄 요약:** 실시간 통신은 가장 빠른 프로토콜 하나를 고르는 문제가 아니라, 명령·이벤트·최신 측정값·연속 바이너리처럼 데이터의 성격에 맞춰 HTTP·SSE·UDP·TCP를 나누고 각 연결의 경계와 수명을 관리하는 문제예요.

장비 설정은 성공 여부를 정확히 알아야 하고, 상태 이벤트는 서버에서 앱으로만 이어서 보내면 돼요. 초당 여러 번 바뀌는 위치는 오래된 값보다 최신 값이 중요하고, 보정 데이터는 순서가 바뀌거나 중간이 빠지면 쓸 수 없어요. 이 네 종류를 한 연결에 억지로 넣기보다 각 요구에 맞는 통신 방식을 선택할 수 있어요.

이 문서는 실제 RTK(Real-Time Kinematic) iOS 샘플에서 확인한 구조를 일반적인 장비 통신 사례로 바꿔 설명해요. 특정 제품의 주소·인증 정보·전용 API는 사용하지 않으며, 코드는 원본을 복사하지 않은 학습용 예제예요. 기준은 iOS 17+, Swift 6 언어 모드와 기존 `NWConnection`·`NWListener` API예요.

## 먼저 알아둘 용어

| 용어                    | 쉬운 뜻                                                                                                       |
| ----------------------- | ------------------------------------------------------------------------------------------------------------- |
| 전송 프로토콜           | 양 끝 사이에서 바이트를 운반하는 규칙이에요. 이 문서에서는 TCP와 UDP가 해당해요.                              |
| 응용 프로토콜           | 운반된 바이트를 요청·응답·이벤트 같은 의미로 해석하는 규칙이에요. HTTP, SSE, NTRIP 등이 해당해요.             |
| 스트림                  | 시작과 끝이 있는 바이트의 연속이에요. TCP는 앱 메시지 경계를 보존하지 않아요.                                 |
| 데이터그램              | 한 번에 보내고 받는 독립된 메시지 단위예요. UDP는 데이터그램 경계를 보존하지만 전달과 순서를 보장하지 않아요. |
| 프레이밍(Framing)       | 연속 바이트에서 메시지 하나의 시작과 끝을 알아내는 규칙이에요.                                                |
| SSE(Server-Sent Events) | 서버가 HTTP 응답을 닫지 않고 UTF-8 텍스트 이벤트를 클라이언트로 보내는 응용 형식이에요.                       |
| NMEA                    | GNSS 수신기가 위치·시간·방위 등을 텍스트 문장으로 표현하는 형식이에요.                                        |
| RTCM                    | GNSS 보정 정보를 표현하는 바이너리 메시지 형식이에요.                                                         |
| NTRIP                   | GNSS 데이터 스트림을 인터넷으로 전달하는 HTTP 기반 응용 프로토콜이에요.                                       |
| 백프레셔(Backpressure)  | 생산 속도가 소비 속도보다 빠를 때 버퍼가 끝없이 늘지 않도록 흐름을 조절하는 방식이에요.                       |
| 멱등성(Idempotency)     | 같은 작업을 여러 번 요청해도 의도한 최종 효과가 중복되지 않는 성질이에요.                                     |

## 먼저 계층을 분리해요

SSE와 TCP를 같은 단계의 선택지로 보면 설계가 꼬여요. SSE는 보통 HTTP 응답 본문 형식이고, HTTP/1.1은 일반적으로 TCP 위에서 동작해요. NTRIP도 TCP 그 자체가 아니라 GNSS 스트림을 전달하기 위한 응용 프로토콜이에요.

```text
도메인 데이터      장비 설정      상태 이벤트      위치 문장       보정 바이너리
                     │              │               │              │
응용 프로토콜       HTTP            SSE             NMEA           NTRIP / RTCM
                     │              │               │              │
전송 프로토콜       TCP·QUIC 등     HTTP의 전송      UDP            TCP 등
                     │              │               │              │
네트워크 경로        Wi-Fi · 셀룰러 · 유선 · 로컬 네트워크
```

HTTP/3는 QUIC을 사용하므로 **HTTP는 언제나 TCP**라고 외우면 안 돼요. 반대로 `NWConnection(using: .tcp)`을 만들었다고 HTTP가 되는 것도 아니에요. TCP 위에 요청 줄, 헤더, 본문 길이와 상태 코드 규칙을 구현해야 HTTP로 해석할 수 있어요.

## 한 앱에서도 통신 목적을 네 갈래로 나눌 수 있어요

RTK 장비를 설정하고 위치와 보정을 중계하는 앱은 다음처럼 구성할 수 있어요.

```text
                         ┌── HTTP 요청/응답 ───────▶ 설정 조회·변경
                         │
 iOS 앱 ◀───────────────┼── HTTP + SSE ────────── 장비 상태 이벤트
   ▲                     │
   └── UDP 데이터그램 ───┴──────────────────────── NMEA 위치·방위

 NTRIP Caster ── HTTP/TCP의 RTCM 스트림 ──▶ iOS 앱 ── TCP ──▶ RTK 장비
                    수신 연결                         송신 연결
```

각 흐름을 나누는 이유는 구현 취향이 아니라 데이터의 성질 때문이에요.

| 흐름               | 먼저 검토할 방식                 | 맞는 이유                                                                                    |
| ------------------ | -------------------------------- | -------------------------------------------------------------------------------------------- |
| 설정 조회·변경     | `URLSession`의 HTTP 요청/응답    | 상태 코드와 응답 한 건이 작업 완료를 표현하고 인증·리다이렉트 같은 HTTP 기능을 쓸 수 있어요. |
| 장비 상태 변화     | HTTP + SSE                       | 서버에서 앱으로 작은 텍스트 이벤트를 계속 보내고, 요청·응답과 같은 HTTP 인프라를 써요.       |
| 고주기 위치·방위   | UDP 데이터그램                   | 늦게 도착한 과거 값보다 최신 값이 중요하고, 연결 설정 없이 메시지를 보낼 수 있어요.          |
| NTRIP 보정 수신    | HTTP 기반의 연속 바이너리 스트림 | 캐스터 인증과 마운트포인트 선택 뒤 순서 있는 RTCM 바이트를 계속 받아야 해요.                 |
| 앱에서 장비로 보정 | TCP 바이트 스트림                | 바이너리의 순서와 누락 없는 전달이 중요하고 양쪽이 이미 단순 TCP 입력을 합의했어요.          |

이 표는 출발점이지 절대 규칙은 아니에요. 장비가 WebSocket만 지원하거나, UDP 위에 자체 순서·재전송 규칙을 정의했다면 서버 계약을 따라야 해요.

## TCP·UDP·SSE·WebSocket을 비교해요

| 기준           | TCP                                 | UDP                                 | SSE                                   | WebSocket                               |
| -------------- | ----------------------------------- | ----------------------------------- | ------------------------------------- | --------------------------------------- |
| 계층           | 전송 프로토콜                       | 전송 프로토콜                       | HTTP 기반 응용 형식                   | HTTP 핸드셰이크 뒤의 응용 프로토콜      |
| 방향           | 양방향                              | 양방향                              | 주로 서버 → 클라이언트                | 양방향                                  |
| 앱이 받는 경계 | 연속 바이트, 메시지 경계 없음       | 데이터그램 경계                     | 빈 줄로 끝나는 UTF-8 이벤트           | 텍스트·바이너리 메시지                  |
| 전달·순서 보장 | 연결이 유지되는 동안 순서 있게 전달 | 전달·순서·중복 제거를 보장하지 않음 | 사용하는 HTTP 전송의 성질을 따름      | 사용하는 연결 위에서 메시지를 전달      |
| 잘 맞는 데이터 | 순서가 중요한 연속 바이너리         | 최신성이 중요한 짧은 측정값         | 단방향 알림·상태·진행 이벤트          | 채팅·협업처럼 양쪽이 계속 보내는 메시지 |
| 앱의 주요 책임 | 프레이밍, 시간 제한, 재연결         | 유실·중복·순서, 크기, 발신자 검증   | 이벤트 파싱, 재연결, 마지막 이벤트 ID | 수신 반복, ping/pong, 종료, 재연결      |

SSE가 UDP보다 느리다거나 TCP보다 가볍다고 한 줄로 결론 내릴 수 없어요. 이벤트 빈도, 메시지 크기, 무선 품질, 프록시, 서버 구현과 전력 사용을 함께 측정해야 해요.

## TCP는 순서를 보장하지만 메시지를 나누지 않아요

[TCP 표준인 RFC 9293](https://www.rfc-editor.org/rfc/rfc9293.html)은 TCP를 신뢰할 수 있는 순서 있는 바이트 스트림으로 정의해요. 여기서 신뢰할 수 있다는 말은 앱의 작업이 성공했다는 뜻이 아니에요. 연결이 끊어지기 전까지 TCP가 재전송과 순서 복원을 수행한다는 뜻이에요.

송신 측이 `send(A)`와 `send(B)`를 호출해도 수신 측은 다음 중 어느 형태로든 읽을 수 있어요.

```text
송신: [AAAA] [BBBB]

수신 가능 형태:
1) [AAAA] [BBBB]
2) [AAA] [AB] [BBB]
3) [AAAABBBB]
```

따라서 길이 접두어, 구분자, 고정 길이, `NWProtocolFramer` 같은 **앱 수준 프레이밍**이 필요해요. 자세한 구현은 [NWConnection과 메시지 경계](./connections-and-data.md)에서 이어서 볼 수 있어요.

### TCP 위에 HTTP를 직접 구현하면 책임이 늘어나요

대부분의 HTTP에는 `URLSession`을 먼저 사용해요. `URLSession`은 상태 코드, 인증, 리다이렉트, 쿠키, 프록시와 응답 본문 전달을 다뤄요. `NWConnection`으로 HTTP/1.1 요청 문자열을 직접 보내면 다음 규칙을 앱이 책임져야 해요.

- 헤더가 여러 TCP 읽기에 나뉘거나 본문과 함께 오는 경우
- `Content-Length`, `Transfer-Encoding: chunked`, 연결 종료 등 본문 길이 규칙
- 청크 크기, 청크 확장, 마지막 `0` 청크와 트레일러
- 상태 코드, 인증, 리다이렉트, 프록시와 TLS 검증
- 최대 헤더·본문·청크 크기와 시간 제한

[RFC 9112의 chunked transfer coding](https://www.rfc-editor.org/rfc/rfc9112.html#section-7.1)은 각 HTTP 청크 앞에 16진수 길이를 붙여, 전체 길이를 미리 모르는 본문도 연결을 유지하며 전송하게 해요. 이 청크는 TCP가 한 번에 돌려준 `Data`와 같은 단위가 아니에요.

| 흔히 모두 “청크”라고 부르는 것  | 실제 경계                                                  |
| ------------------------------- | ---------------------------------------------------------- |
| `NWConnection.receive`의 `Data` | 지금 읽을 수 있었던 임의의 TCP 바이트 조각                 |
| HTTP chunked의 청크             | 16진수 길이와 CRLF로 표현한 HTTP/1.1 전송 경계             |
| SSE 이벤트                      | 빈 줄로 끝나는 `text/event-stream`의 응용 메시지           |
| RTCM 메시지                     | RTCM 규격이 정한 프리앰블·길이·검사값을 가진 도메인 메시지 |

RTK 사례에서는 NTRIP 캐스터가 HTTP chunked로 RTCM을 보낼 수 있어요. 앱은 먼저 TCP 조각을 모아 HTTP 청크를 해제하고, 그 결과인 RTCM 바이트만 장비에 전달해야 해요. 크기 줄 `4b0\r\n`까지 장비로 보내면 장비는 이를 RTCM으로 해석할 수 없어요.

### 전송 완료와 업무 완료를 구분해요

[`NWConnection.SendCompletion.contentProcessed`](<https://developer.apple.com/documentation/network/nwconnection/sendcompletion/contentprocessed(_:)>)는 보낸 내용이 **로컬 네트워크 스택에서 처리된 시점**을 알려 줘요. 상대 장비가 바이트를 받았거나 보정을 적용했다는 확인은 아니에요. 업무 완료가 중요하면 응답, 시퀀스 번호나 별도 확인 메시지를 응용 프로토콜에 넣어야 해요.

`.idempotent`도 “전송 성공”을 뜻하지 않아요. 빠른 연결 설정에서 같은 데이터가 다시 보내질 수 있음을 허용하는 표식이므로, 실제로 반복 전송해도 안전한 데이터에만 사용해요.

작은 데이터를 지연 없이 보내야 할 때 [`NWProtocolTCP.Options.noDelay`](https://developer.apple.com/documentation/network/nwprotocoltcp/options)를 검토할 수 있어요. 이 옵션은 Nagle 알고리즘을 끄므로 지연을 줄일 수 있지만 작은 패킷 수가 늘 수 있어요. 이름만 보고 모든 TCP 연결에 켜지 말고 실제 지연과 전력·트래픽을 측정해요.

## UDP는 한 데이터그램을 한 메시지 후보로 다뤄요

[UDP 표준인 RFC 768](https://www.rfc-editor.org/rfc/rfc768.html)은 최소한의 전송 기능을 제공해요. TCP처럼 연결 설정과 재전송을 제공하지 않으므로 지연된 과거 값을 기다리지 않는 측정 데이터에 잘 맞을 수 있어요. 대신 손실, 중복, 순서 변경을 앱이 허용하거나 보완해야 해요.

`NWListener(using: .udp, on:)`가 전달한 연결에서는 `receiveMessage`로 데이터그램 하나를 받아요. 이 메서드도 한 번 등록하면 한 번 완료되므로 계속 받으려면 다시 호출해야 해요.

```swift
import Foundation
import Network

/// 준비된 UDP 연결에서 데이터그램을 계속 받습니다.
///
/// - Parameters:
///   - connection: `NWListener`가 전달하고 이미 시작한 UDP 연결입니다.
///   - onMessage: 데이터그램 하나를 처리할 동작입니다.
func receiveDatagrams(
    from connection: NWConnection,
    onMessage: @escaping @Sendable (Data) -> Void
) {
    connection.receiveMessage { data, _, _, error in
        if let data, !data.isEmpty {
            onMessage(data)
        }

        guard error == nil else {
            connection.cancel()
            return
        }

        receiveDatagrams(from: connection, onMessage: onMessage)
    }
}
```

UDP 데이터그램 하나가 도메인 메시지 하나라는 보장도 서버 계약에 달려 있어요. 예를 들어 장비는 한 데이터그램에 NMEA 문장 여러 개를 줄바꿈으로 묶을 수 있어요. 데이터그램 경계는 보존하면서 내부 문장을 다시 나눠요.

```swift
import Foundation

/// UDP 데이터그램에서 NMEA 형태의 텍스트 줄을 꺼냅니다.
///
/// - Parameter datagram: 장비가 보낸 데이터그램 한 개입니다.
/// - Returns: `$` 또는 `!`로 시작하는 비어 있지 않은 줄입니다.
func nmeaLines(
    in datagram: Data
) -> [String] {
    String(decoding: datagram, as: UTF8.self)
        .components(separatedBy: .newlines)
        .map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }
        .filter { $0.hasPrefix("$") || $0.hasPrefix("!") }
}
```

접두어 필터만으로 데이터를 신뢰하면 안 돼요. NMEA라면 체크섬과 필드 범위, 발신 장비, 시각을 검증해요. 순번이 있는 형식이라면 오래되거나 중복된 데이터그램을 버릴 수 있어요. 데이터그램을 크게 만들어 IP 단편화가 발생하면 조각 하나의 손실이 전체 데이터그램 손실로 이어질 수 있으므로, `maximumDatagramSize`와 실제 경로를 기준으로 크기를 제한해요.

## SSE는 HTTP 연결 안에서 이벤트 경계를 만들어요

[WHATWG의 Server-sent events 표준](https://html.spec.whatwg.org/multipage/server-sent-events.html)은 MIME 타입을 `text/event-stream`, 문자 인코딩을 UTF-8로 정의해요. 각 이벤트는 빈 줄로 끝나고, 같은 이벤트의 여러 `data:` 줄은 줄바꿈으로 합쳐져요.

```text
: 이 줄은 연결 유지용 주석이에요
event: device-status
id: 42
data: {"battery": 81,
data: "fix": "rtk"}

```

주요 필드의 의미는 다음과 같아요.

| 필드     | 의미                                                                                   |
| -------- | -------------------------------------------------------------------------------------- |
| `data:`  | 이벤트 본문이에요. 여러 줄이면 줄바꿈으로 합쳐요.                                      |
| `event:` | 이벤트 종류예요. 없으면 기본 종류 `message`를 사용해요.                                |
| `id:`    | 마지막 이벤트 ID예요. 재연결할 때 `Last-Event-ID`로 이어받는 데 사용할 수 있어요.      |
| `retry:` | 브라우저 `EventSource`가 재연결 전에 기다릴 밀리초를 서버가 제안해요.                  |
| `:`      | 주석이에요. 프록시의 유휴 종료를 피하는 heartbeat로 자주 사용하지만 이벤트는 아니에요. |

브라우저의 `EventSource`는 재연결 동작까지 정의하지만 iOS의 `URLSession.AsyncBytes`는 바이트 스트림을 제공하는 API예요. 네이티브 앱에서 SSE를 읽는다면 이벤트 파싱, `id` 저장, 재시도 시간과 `Last-Event-ID` 전송을 직접 설계하거나 검증된 라이브러리를 사용해야 해요.

### SSE 프레임을 상태를 가진 파서로 잘라요

한 번 받은 `Data`에 이벤트 절반만 있거나 여러 이벤트가 붙을 수 있어요. `URLSession.AsyncBytes.lines`로 줄 경계까지 처리한 뒤에도 빈 줄이 올 때까지 필드를 모아야 해요.

```swift
import Foundation

struct ServerSentEvent: Sendable, Equatable {
    let name: String
    let data: String
    let id: String?
}

struct SSEParser {
    private var eventName = ""
    private var dataLines: [String] = []
    private var lastEventID: String?

    /// SSE 텍스트 한 줄을 넣고 완성된 이벤트를 꺼냅니다.
    ///
    /// - Parameter line: 줄 끝 문자를 제외한 UTF-8 텍스트 한 줄입니다.
    /// - Returns: 빈 줄로 이벤트가 완성됐으면 해당 이벤트이고, 아니면 `nil`입니다.
    mutating func consume(
        _ line: String
    ) -> ServerSentEvent? {
        if line.isEmpty {
            defer {
                self.eventName = ""
                self.dataLines.removeAll(keepingCapacity: true)
            }

            guard !self.dataLines.isEmpty else { return nil }

            return ServerSentEvent(
                name: self.eventName.isEmpty ? "message" : self.eventName,
                data: self.dataLines.joined(separator: "\n"),
                id: self.lastEventID
            )
        }

        guard !line.hasPrefix(":") else { return nil }

        let field: String
        var value: String
        if let separator = line.firstIndex(of: ":") {
            field = String(line[..<separator])
            value = String(line[line.index(after: separator)...])
            if value.first == " " {
                value.removeFirst()
            }
        } else {
            field = line
            value = ""
        }

        switch field {
        case "event":
            self.eventName = value
        case "data":
            self.dataLines.append(value)
        case "id" where !value.contains("\0"):
            self.lastEventID = value
        default:
            break
        }

        return nil
    }
}
```

이 예제는 `event`·`data`·`id`와 주석을 처리해요. `retry`는 연결을 소유한 계층의 정책이므로 파서 밖에서 숫자 범위까지 검증해 적용하는 편이 좋아요. 무제한 길이의 한 줄이나 이벤트를 계속 버퍼링하지 않도록 운영 코드에는 최대 크기를 추가해요.

### URLSession의 비동기 바이트로 SSE를 읽어요

HTTP 경로를 특별히 고정할 필요가 없다면 직접 TCP 요청을 조립하기보다 `URLSession`을 먼저 검토해요. [`bytes(for:)`](<https://developer.apple.com/documentation/foundation/urlsession/bytes(for:delegate:)>)는 응답을 모두 메모리에 모으지 않고 `AsyncSequence`로 전달해요.

```swift
import Foundation

enum ServerEventStreamError: Error {
    case invalidResponse
    case unsuccessfulStatus(Int)
    case invalidContentType(String?)
}

/// HTTP SSE 응답을 이벤트 스트림으로 바꿉니다.
///
/// - Parameters:
///   - request: SSE 엔드포인트를 가리키는 요청입니다.
///   - session: 요청을 수행할 URL 세션입니다.
/// - Returns: 연결이 유지되는 동안 파싱한 이벤트를 내보내는 스트림입니다.
func makeServerEventStream(
    for request: URLRequest,
    session: URLSession = .shared
) -> AsyncThrowingStream<ServerSentEvent, Error> {
    AsyncThrowingStream { continuation in
        let task = Task {
            do {
                var request = request
                request.setValue("text/event-stream", forHTTPHeaderField: "Accept")
                request.setValue("no-cache", forHTTPHeaderField: "Cache-Control")

                let (bytes, response) = try await session.bytes(for: request)
                guard let response = response as? HTTPURLResponse else {
                    throw ServerEventStreamError.invalidResponse
                }
                guard (200..<300).contains(response.statusCode) else {
                    throw ServerEventStreamError.unsuccessfulStatus(response.statusCode)
                }

                let contentType = response.value(forHTTPHeaderField: "Content-Type")
                guard contentType?.lowercased().hasPrefix("text/event-stream") == true else {
                    throw ServerEventStreamError.invalidContentType(contentType)
                }

                var parser = SSEParser()
                for try await line in bytes.lines {
                    guard !Task.isCancelled else { throw CancellationError() }
                    if let event = parser.consume(line) {
                        continuation.yield(event)
                    }
                }

                continuation.finish()
            } catch is CancellationError {
                continuation.finish()
            } catch {
                continuation.finish(throwing: error)
            }
        }

        continuation.onTermination = { _ in
            task.cancel()
        }
    }
}
```

이 함수는 연결 한 번의 수명만 표현하고 자동 재연결은 하지 않아요. 호출자가 스트림 종료 원인을 분류하고, 취소가 아니라 일시적인 연결 실패일 때만 제한된 횟수와 backoff·jitter를 적용해 다시 연결해야 해요. 마지막으로 처리 완료한 `id`를 저장했다면 다음 요청의 `Last-Event-ID` 헤더에 넣어요.

## WebSocket은 양쪽이 계속 말해야 할 때 검토해요

SSE 연결에서 클라이언트가 서버로 보낼 때는 별도의 HTTP 요청을 사용해요. 같은 지속 연결에서 양쪽이 독립적으로 메시지를 자주 보내야 한다면 WebSocket이 더 자연스러울 수 있어요.

[`URLSessionWebSocketTask`](https://developer.apple.com/documentation/foundation/urlsessionwebsockettask)는 RFC 6455의 텍스트·바이너리 메시지, ping과 종료를 제공해요. WebSocket 메시지는 TCP 읽기 조각과 달리 API가 재조립한 메시지 단위예요. 다만 다음 책임은 남아요.

- `receive()`도 한 메시지를 받으므로 다음 메시지를 계속 읽는 반복
- 최대 메시지 크기와 JSON·바이너리 스키마 검증
- ping/pong, 앱이 백그라운드로 갈 때의 수명, 정상 종료
- 연결 실패의 분류와 재연결, 중복 명령 방지
- TLS를 쓰는 `wss:`와 서버 인증

서버가 단방향 상태 알림만 보내고 기존 HTTP 인증·프록시를 활용해야 한다면 SSE가 단순해요. 양방향이라는 이유만으로 원시 TCP를 선택하지 말고 서버 호환성, 메시지 경계와 보안을 함께 비교해요.

## 특정 Wi-Fi 장비에는 경로 선택이 필요할 수 있어요

인터넷이 없는 장비 AP에 iPhone이 연결되면 인터넷 요청은 셀룰러를 사용할 수 있어요. 장비의 로컬 주소로 보내는 연결만 Wi-Fi로 제한해야 하는 요구가 있다면 Network의 [`requiredInterfaceType`](https://developer.apple.com/documentation/network/nwparameters/requiredinterfacetype)을 검토할 수 있어요.

```swift
import Network

/// Wi-Fi 경로만 허용하는 TCP 연결을 만듭니다.
///
/// - Parameters:
///   - host: 연결할 장비의 호스트 이름 또는 주소입니다.
///   - port: 장비가 수신하는 TCP 포트입니다.
/// - Returns: 아직 시작하지 않은 연결입니다.
func makeWiFiTCPConnection(
    host: NWEndpoint.Host,
    port: NWEndpoint.Port
) -> NWConnection {
    let parameters = NWParameters.tcp
    parameters.requiredInterfaceType = .wifi
    return NWConnection(host: host, port: port, using: parameters)
}
```

`.wifi`는 특정 SSID나 신뢰한 장비를 뜻하지 않아요. 사용자가 다른 Wi-Fi로 전환할 수 있고 같은 주소를 다른 장비가 쓸 수도 있어요. 가능한 경우 TLS로 상대를 인증하고, 로컬 평문 프로토콜이라면 장비 식별자와 응답 형식을 검증해요.

경로를 고정하려고 HTTP 파싱을 전부 직접 구현하는 비용도 비교해야 해요. 서버를 바꿀 수 있다면 이름 해석, TLS와 표준 HTTP 클라이언트 사용이 가능한 구조가 더 안전할 수 있어요.

## 연결마다 소유자와 재시도 범위를 정해요

실시간 앱에서는 “끊기면 다시 연결”만으로 충분하지 않아요. 무엇을 함께 끊고 무엇을 유지할지 정해야 해요.

| 실패                              | 먼저 할 일                                        | 재시도 판단                                                     |
| --------------------------------- | ------------------------------------------------- | --------------------------------------------------------------- |
| DNS·경로·일시적 연결 실패         | 현재 연결을 정리하고 오류 원인을 기록해요.        | 횟수 제한과 backoff·jitter를 둬요.                              |
| 인증 실패                         | 계정·토큰을 갱신하거나 사용자 조치를 요청해요.    | 같은 자격 증명으로 무한 재시도하지 않아요.                      |
| 존재하지 않는 스트림·마운트포인트 | 설정 오류를 표시해요.                             | 입력이 바뀌기 전에는 재시도하지 않아요.                         |
| 장비 TCP만 끊김                   | 장비 송신 연결과 대기 버퍼를 정리해요.            | 원격 수신 연결을 유지할 가치가 있는지 별도로 결정해요.          |
| SSE 유휴 시간 초과                | heartbeat 주기와 프록시 제한, 앱 상태를 확인해요. | 마지막 이벤트 ID 이후부터 다시 받을 수 있는지 확인해요.         |
| UDP 일부 누락                     | 최신 시각·순번과 품질 상태를 갱신해요.            | 연결 재시도보다 다음 데이터그램을 기다리는 편이 나을 수 있어요. |

예를 들어 캐스터에서 받은 보정을 장비로 중계할 때 두 TCP 연결의 실패 영역은 달라요. 장비가 잠깐 끊겼다고 인증된 캐스터 연결까지 매번 닫으면 캐스터의 재접속 제한에 걸릴 수 있어요. 반대로 장비가 받지 못하는 동안 바이너리를 무제한 쌓으면 오래된 보정과 메모리 사용량이 늘어요. 유지할 연결, 버릴 데이터, 최대 버퍼를 도메인 요구로 결정해요.

연결 객체와 수신 작업은 하나의 소유자가 관리해요.

1. 시작 전에 상태·수신·오류 핸들러를 설치해요.
2. 화면이 아니라 세션·기능의 수명에 연결을 묶어요.
3. 취소할 때 타이머, 재시도 Task, Listener와 수락한 Connection을 모두 정리해요.
4. 이전 세대 연결의 늦은 콜백이 새 상태를 덮지 않게 세션 식별자를 확인해요.
5. 재연결할 때는 새 `NWConnection`·`NWListener` 인스턴스를 만들어요.

## 백프레셔와 버퍼 제한을 빠뜨리지 않아요

TCP가 흐름 제어를 제공해도 앱 메모리의 `Data` 배열이나 반응형 스트림이 자동으로 제한되는 것은 아니에요. 수신은 빠르고 장비 송신이 느리면 중간 큐가 계속 커질 수 있어요.

- 동시에 진행할 `send` 수와 대기 바이트를 제한해요.
- `.contentProcessed`를 다음 전송을 시작할 신호로 쓸 수 있지만 상대의 업무 완료로 해석하지 않아요.
- 최신 값만 의미 있는 UDP 측정은 이전 화면 갱신을 합칠 수 있어요.
- 순서가 중요한 RTCM·파일 바이트는 임의의 `Data` 조각을 버리면 프레임이 깨질 수 있어요.
- 최대 버퍼를 넘으면 연결을 재설정할지, 생산자를 늦출지, 완전한 도메인 메시지만 버릴지 합의해요.
- 수신 바이트 수와 장비가 확인한 처리량을 같은 지표로 기록하지 않아요.

## 보안과 로컬 네트워크 권한도 설계의 일부예요

인터넷 서버에는 HTTPS·WSS처럼 TLS로 보호된 연결을 기본으로 사용해요. Basic 인증을 평문 HTTP로 보내면 같은 네트워크의 공격자가 자격 증명을 볼 수 있어요. 인증서 검증을 무조건 통과시키는 콜백으로 개발 인증서 문제를 숨기지 않아요.

로컬 장비 통신에서는 다음 항목도 확인해요.

- `NSLocalNetworkUsageDescription`과 실제 권한 요청 시점
- Bonjour를 쓴다면 `NSBonjourServices`와 서비스 타입
- UDP 발신 주소, NMEA 체크섬, 값 범위와 시각 검증
- 고정 IP 하나를 장비 신원으로 믿지 않는 식별 절차
- 로그에서 Authorization, 토큰, 위치 원문과 장비 식별자 마스킹
- 앱이 백그라운드로 갔을 때 연결 유지가 정말 필요한지와 허용된 실행 방식

권한과 서비스 탐색은 [Bonjour와 로컬 네트워크](./bonjour-and-local-network.md), 경로 상태는 [NWPathMonitor와 네트워크 경로](./path-monitoring.md)에서 자세히 설명해요.

## 파서와 연결을 나눠 테스트해요

실제 네트워크를 열지 않아도 SSE 이벤트 경계, NMEA 줄, HTTP 청크와 바이너리 헤더는 값 기반 테스트로 검증할 수 있어요.

```swift
import Testing

@Test func sseParserWaitsForBlankLine() {
    var parser = SSEParser()

    #expect(parser.consume("event: status") == nil)
    #expect(parser.consume("data: first") == nil)
    #expect(parser.consume("data: second") == nil)
    #expect(
        parser.consume("")
            == ServerSentEvent(
                name: "status",
                data: "first\nsecond",
                id: nil
            )
    )
}

@Test func sseParserKeepsLastEventID() {
    var parser = SSEParser()

    #expect(parser.consume("id: 42") == nil)
    #expect(parser.consume("data: ready") == nil)
    #expect(parser.consume("")?.id == "42")
    #expect(parser.consume("data: next") == nil)
    #expect(parser.consume("")?.id == "42")
}
```

테스트를 다음 세 층으로 나누면 원인을 찾기 쉬워요.

1. **파서 단위 테스트:** 경계가 모든 바이트 위치에서 나뉘는 경우, 여러 메시지가 붙는 경우, 최대 크기와 잘못된 입력을 검사해요.
2. **루프백 통합 테스트:** 로컬 Listener와 Connection으로 분할 전송, 종료, 취소, 시간 제한과 backpressure를 확인해요.
3. **실기기 시험:** 장비 AP 전환, 화면 잠금·복귀, Wi-Fi 단절, 패킷 손실, 느린 소비자와 장시간 유휴 연결을 확인해요.

성공 경로만 확인하지 말고 TCP 헤더 중간 종료, HTTP 청크 크기 줄 분할, SSE 빈 이벤트, UDP 중복·순서 변경, 인증 실패처럼 경계 조건을 표로 만들어 시험해요.

## 적용 체크리스트

- [ ] 데이터가 명령, 단방향 이벤트, 최신 측정값, 순서 있는 스트림 중 무엇인지 분류했나요?
- [ ] 전송 프로토콜과 HTTP·SSE·NTRIP 같은 응용 프로토콜을 구분했나요?
- [ ] TCP 읽기, HTTP 청크, SSE 이벤트, 도메인 메시지의 경계를 각각 처리하나요?
- [ ] `URLSession`으로 충분한 HTTP를 직접 `NWConnection`으로 다시 구현하고 있지 않나요?
- [ ] UDP 유실·중복·순서 변경과 데이터그램 크기를 허용하거나 보완하나요?
- [ ] 연결 대기, 수신 유휴, 작업 전체에 서로 다른 시간 제한을 두었나요?
- [ ] 인증·설정 오류와 일시적 연결 오류의 재시도 정책이 다른가요?
- [ ] 취소가 Listener, Connection, 타이머와 재시도 작업까지 정리하나요?
- [ ] 버퍼 상한과 느린 소비자 정책이 있나요?
- [ ] TLS, 로컬 네트워크 권한, 입력 검증과 로그 마스킹을 확인했나요?

## 면접에서 이어질 수 있는 질문

### TCP를 쓰면 한 번 send한 Data를 한 번 receive로 받나요

아니에요. TCP는 순서 있는 바이트 스트림을 제공할 뿐 앱의 `send` 호출 경계를 보존하지 않아요. 수신 조각은 합쳐지거나 나뉠 수 있으므로 길이·구분자·고정 길이 같은 프레이밍이 필요해요.

### SSE는 TCP 대신 사용하는 프로토콜인가요

같은 계층이 아니에요. SSE는 HTTP 응답 본문의 이벤트 형식이고, HTTP/1.1 연결은 보통 TCP 위에서 동작해요. 앱은 URLSession으로 HTTP 바이트를 받고 SSE 규칙으로 이벤트를 해석할 수 있어요.

### UDP가 빠르니 실시간 데이터는 모두 UDP가 좋은가요

아니에요. 재전송과 순서 복원이 없어 늦은 과거 값보다 최신 값이 중요한 데이터에 유리할 수 있지만, 명령·파일·보정처럼 누락과 순서 변경을 허용할 수 없다면 별도 신뢰성 설계나 TCP 같은 선택지가 필요해요.

### SSE와 WebSocket은 언제 나누나요

서버에서 클라이언트로 상태를 보내고 클라이언트 명령은 일반 HTTP로 충분하면 SSE가 단순해요. 같은 지속 연결에서 양쪽이 독립적으로 메시지를 자주 보내야 하면 WebSocket을 검토해요. 서버 지원, 인증, 프록시, 재연결과 메시지 형식까지 함께 비교해요.

### send 완료 콜백이 성공하면 장비가 처리한 건가요

아니에요. Network 스택이 보낼 내용을 처리한 것이지 원격 장비의 업무 처리를 확인한 것은 아니에요. 중요한 명령에는 요청 ID와 응답·확인 메시지를 설계해야 해요.

## 참고 자료

- [Apple Developer — Network](https://developer.apple.com/documentation/network)
- [Apple Developer — TN3151: Choosing the right networking API](https://developer.apple.com/documentation/technotes/tn3151-choosing-the-right-networking-api)
- [Apple Developer — NWConnection](https://developer.apple.com/documentation/network/nwconnection)
- [Apple Developer — NWConnection.SendCompletion](https://developer.apple.com/documentation/network/nwconnection/sendcompletion)
- [Apple Developer — NWParameters.requiredInterfaceType](https://developer.apple.com/documentation/network/nwparameters/requiredinterfacetype)
- [Apple Developer — URLSession](https://developer.apple.com/documentation/foundation/urlsession)
- [Apple Developer — URLSessionWebSocketTask](https://developer.apple.com/documentation/foundation/urlsessionwebsockettask)
- [WHATWG — Server-sent events](https://html.spec.whatwg.org/multipage/server-sent-events.html)
- [RFC 9293 — Transmission Control Protocol](https://www.rfc-editor.org/rfc/rfc9293.html)
- [RFC 768 — User Datagram Protocol](https://www.rfc-editor.org/rfc/rfc768.html)
- [RFC 9112 — HTTP/1.1](https://www.rfc-editor.org/rfc/rfc9112.html)
- [RFC 6455 — The WebSocket Protocol](https://www.rfc-editor.org/rfc/rfc6455.html)
- [RTCM — RTCM Standards](https://www.rtcm.org/rtcm-standards)
- [BKG GNSS Data Center — Ntrip](https://igs.bkg.bund.de/ntrip/)
