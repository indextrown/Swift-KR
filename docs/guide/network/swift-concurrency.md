---
title: Swift로 이해하는 Network의 Swift Concurrency API
description: iOS 26의 NetworkConnection·NetworkListener·NetworkBrowser를 기존 API와 비교하고 TLS·TLV·Coder 구성, 타입 안전한 메시지 교환, 작업 취소와 시간 제한을 설명합니다.
---

# Swift로 이해하는 Network의 Swift Concurrency API

> **면접 답변 한 줄 요약:** iOS 26의 Network API는 프로토콜 구성을 타입으로 표현하고 송수신을 비동기 함수로 제공해, 연결과 메시지 처리를 Swift 작업의 수명 안에서 구성하게 해요.

기존 콜백 코드를 단순히 `Task`로 감싸는 것과, 작업의 수명에 맞춰 설계된 API를 사용하는 것은 달라요. 이 문서에서는 **iOS 26+ / macOS 26+, Xcode 26 계열, Swift 6 언어 모드**를 기준으로 새로운 연결·수락·탐색 API를 사용해요.

[WWDC25](https://developer.apple.com/videos/play/wwdc2025/250/)에서 설명한 원리를 바탕으로 온도 장비 예제를 새로 작성했어요. 낮은 OS도 지원해야 한다면 [NWConnection 문서](./connections-and-data.md)와 비교해요.

## 먼저 알아둘 용어

| 용어                   | 쉬운 뜻                                                                                                                                     |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| Swift Concurrency      | `async/await`, Task, 액터 등 비동기 실행과 격리를 표현하는 Swift 기능이에요.                                                                |
| 구조적 동시성          | 자식 작업이 부모의 범위 안에서 완료되도록 하고 취소를 전달하는 구조예요. 임의로 만든 모든 `Task`가 자동으로 자식 작업이 되는 것은 아니에요. |
| 프로토콜 스택          | 메시지 형식·보안·전송 규칙을 위아래로 조합한 구성이에요.                                                                                    |
| Result Builder         | 코드 블록의 표현식을 조합하는 Swift 기능이에요. 여기서는 통신 규칙을 선언하는 데 사용해요.                                                  |
| TLV(Type-Length-Value) | 메시지 종류·길이·내용을 함께 보내 경계를 구분하는 방식이에요.                                                                               |
| Coder                  | Swift의 인코딩·디코딩 가능한 값을 메시지로 다루는 Network의 구체적인 타입이에요.                                                            |
| AsyncSequence          | 시간이 지나면서 생기는 값을 `for await`로 하나씩 읽는 비동기 시퀀스예요.                                                                    |

프로토콜 구성, 송수신, 메시지 직렬화, Listener·Browser, 취소와 시간 제한을 차례로 다뤄요.

## 콜백의 수동 연결을 줄여요

| 작업        | 기존 API                                | 새 API                                     |
| ----------- | --------------------------------------- | ------------------------------------------ |
| 연결        | `NWConnection`과 `start(queue:)`        | `NetworkConnection`과 비동기 송수신        |
| 송수신 결과 | 완료 콜백의 데이터·오류                 | `try await send` / `receive`의 반환값·오류 |
| 연결 수락   | `NWListener.newConnectionHandler`       | `NetworkListener.run`의 비동기 핸들러      |
| 서비스 탐색 | `NWBrowser.browseResultsChangedHandler` | `NetworkBrowser.run`의 결과 집합           |
| 수명        | 객체 보관·취소·큐를 직접 연결           | 작업 범위와 취소에 맞춘 수명 관리          |

기존 API도 비동기 API예요. 새 API의 차이는 “동기에서 비동기로 바뀌었다”가 아니라 **Swift의 비동기 제어 흐름에 직접 연결된다**는 데 있어요. 기존 URLSession이나 정상 동작하는 콜백 구현을 일괄 교체할 필요는 없어요.

## TLS 연결도 먼저 메시지 규칙이 필요해요

아래는 요청 4바이트 `READ`에 대해 서버가 정확히 8바이트를 반환한다는 가상의 고정 길이 프로토콜이에요. [`withNetworkConnection`](<https://developer.apple.com/documentation/network/withnetworkconnection(to:using:_:)-887ho>)으로 연결을 사용하는 범위를 묶어요.

```swift
import Foundation
import Network

@available(iOS 26.0, macOS 26.0, *)
func readFixedReply(from endpoint: NWEndpoint) async throws {
    try await withNetworkConnection(to: endpoint, using: .parameters {
        TLS()
    }) { connection in
        try await connection.send(Data("READ".utf8))
        let reply = try await connection.receive(exactly: 8).content
        print("응답 바이트 수: \(reply.count)")
    }
}
```

[`TLS`](https://developer.apple.com/documentation/network/tls) 아래의 기본 TCP·IP 구성은 추론돼요. 연결을 사용하는 동안 `send`·`receive`가 필요에 따라 연결을 시작하고 준비 상태를 기다려요. 다만 상대가 8바이트를 보내지 않으면 계속 기다리거나 오류로 끝날 수 있으므로, 아래의 시간 제한 정책도 필요해요.

`exactly: 8`은 TCP를 메시지 프로토콜로 바꾸는 설정이 아니에요. 길이가 정해지지 않았다면 앞에서 길이를 읽고 검증하거나 별도 프레이밍을 사용해야 해요. `send`의 반환 역시 상대 앱의 업무 완료를 보장하지 않아요.

## TLV와 Coder는 해결하는 범위가 달라요

[`TLV`](https://developer.apple.com/documentation/network/tlv)는 바이트의 종류와 길이를 포함한 메시지를 제공해요. [`Coder`](https://developer.apple.com/documentation/network/coder)는 그 위의 값 인코딩·디코딩까지 줄여 줘요.

| 구성                                  | 앱이 송수신하는 값        | 앱이 정해야 할 일                  |
| ------------------------------------- | ------------------------- | ---------------------------------- |
| `TLS { TCP() }`                       | 바이트 흐름               | 메시지 경계, 형식, 길이 제한       |
| `TLV { TLS() }`                       | 종류가 붙은 데이터 메시지 | 종류별 의미, 데이터 형식·내용 검증 |
| `Coder(타입, using: .json) { TLS() }` | Swift 값                  | 스키마 호환성, 업무 규칙·입력 검증 |

TLV를 사용하는 작은 예제예요. `type: 1`을 조회 요청으로 해석한다는 약속도 서버와 같아야 해요.

```swift
import Foundation
import Network

@available(iOS 26.0, macOS 26.0, *)
func requestWithTLV(from endpoint: NWEndpoint) async throws {
    try await withNetworkConnection(to: endpoint, using: .parameters {
        TLV {
            TLS()
        }
    }) { connection in
        try await connection.send(Data("READ".utf8), type: 1)
        let message = try await connection.receive()
        print("종류: \(message.metadata.type), 길이: \(message.content.count)")
    }
}
```

서버가 이미 다른 TLV 형식을 사용한다면 타입·길이 필드의 크기와 인코딩까지 대조해요. 이름이 TLV라는 이유만으로 모든 서버와 바로 호환되는 것은 아니에요. 앞 문서의 줄바꿈 프로토콜과도 호환되지 않아요.

## Coder로 온도 요청과 응답을 교환해요

`Codable`은 값의 직렬화를 위한 `Encodable`과 `Decodable`의 조합이에요. `Sendable`은 동시성 경계에서 전달할 값의 안전성을 나타내요. 자세한 차이는 [Codable](../swift/protocols/codable.md)에서 읽을 수 있어요.

요청 식별자를 응답에 돌려줘서 다른 요청의 결과를 잘못 처리하지 않게 해요. 디코딩에 성공했더라도 응답 종류·식별자·값의 범위를 검사해요.

```swift
import Foundation

enum DeviceMessage: Codable, Sendable, Equatable {
    case read(id: UUID)
    case reading(id: UUID, celsius: Double)
}

enum DeviceProtocolError: Error, Equatable {
    case unexpectedReply
    case invalidTemperature
    case noReply
}

func validatedTemperature(_ message: DeviceMessage, for id: UUID) throws -> Double {
    guard case .reading(let replyID, let celsius) = message, replyID == id else {
        throw DeviceProtocolError.unexpectedReply
    }
    guard celsius.isFinite, (-80...100).contains(celsius) else {
        throw DeviceProtocolError.invalidTemperature
    }
    return celsius
}
```

이 범위는 예제 장비의 정책이에요. Coder가 업무상 유효한 값인지까지 검증해 주지는 않아요. 요청 식별자도 자동으로 중복 실행을 방지하는 키가 되지는 않으며 서버의 처리 규칙이 필요해요.

실서비스용 연결은 TLS를 유지해요. 서버도 같은 Coder 메시지 형식과 인증서 구성을 지원해야 해요.

```swift
import Foundation
import Network

@available(iOS 26.0, macOS 26.0, *)
func readTemperature(from endpoint: NWEndpoint) async throws -> Double {
    let id = UUID()
    var reply: DeviceMessage?
    try await withNetworkConnection(to: endpoint, using: .parameters {
        Coder(DeviceMessage.self, using: .json) {
            TLS()
        }
    }) { connection in
        try await connection.send(DeviceMessage.read(id: id))
        reply = try await connection.receive().content
    }
    guard let reply else { throw DeviceProtocolError.noReply }
    return try validatedTemperature(reply, for: id)
}
```

`Coder`는 Network의 통신 프로토콜을 구성하는 **struct**예요. 문서에서 “프로토콜”이라고 설명하더라도 Swift의 `protocol` 선언을 뜻하는 것은 아니에요. JSON은 직렬화 형식이고, TCP 메시지 경계와 보안까지 모두 대신하는 형식은 아니에요.

Coder가 추가하는 프레이밍까지 포함해 양쪽이 호환돼야 하므로 임의의 JSON HTTP 서버에 이 코드를 연결하면 안 돼요. 외부 입력의 메시지 크기·허용 값·스키마 변경 정책도 별도로 설계해야 해요.

## Listener를 로컬 실험으로 확인해요

아래 서버는 **자기 기기의 loopback 주소 `127.0.0.1`에만 바인딩하는 평문 테스트용**이에요. 인증서 준비 없이 메시지 교환을 확인하기 위한 것이며, 외부 기기에 공개하거나 민감한 데이터를 보내지 않아요.

```swift
import Foundation
import Network

@available(iOS 26.0, macOS 26.0, *)
func runLoopbackDevice(
    port: NWEndpoint.Port = 8787,
    onReady: @escaping @Sendable (NWEndpoint.Port) -> Void = { _ in }
) async throws {
    let listener = try NetworkListener(using: .parameters {
        Coder(DeviceMessage.self, using: .json) {
            TCP()
        }
    }.localEndpoint(.hostPort(host: "127.0.0.1", port: port)))

    listener.onStateUpdate { listener, state in
        if case .ready = state, let port = listener.port {
            onReady(port)
        }
    }
    try await listener.run { connection in
        do {
            let request = try await connection.receive().content
            guard case .read(let id) = request else {
                throw DeviceProtocolError.unexpectedReply
            }
            try await connection.send(DeviceMessage.reading(id: id, celsius: 23.5))
        } catch {
            // 개별 연결의 오류를 처리하고 다른 연결의 수락은 유지해요.
            print("장비 요청 실패: \(error)")
        }
    }
}

@available(iOS 26.0, macOS 26.0, *)
func readLoopbackTemperature(port: NWEndpoint.Port = 8787) async throws -> Double {
    let id = UUID()
    var reply: DeviceMessage?
    try await withNetworkConnection(
        to: .hostPort(host: "127.0.0.1", port: port),
        using: .parameters {
            Coder(DeviceMessage.self, using: .json) { TCP() }
        }
    ) { connection in
        try await connection.send(DeviceMessage.read(id: id))
        reply = try await connection.receive().content
    }
    guard let reply else { throw DeviceProtocolError.noReply }
    return try validatedTemperature(reply, for: id)
}
```

[`NetworkListener.run`](<https://developer.apple.com/documentation/network/networklistener/run(_:)-4iov3>)은 수락한 연결을 비동기 핸들러로 전달해요. 서버를 먼저 실행해 준비된 뒤 클라이언트를 실행하고, 소유한 Task를 취소해 서버를 끝내요. 이미 포트가 사용 중이면 다른 포트를 양쪽에 동일하게 전달해요. 테스트에서는 `port: .any`와 `onReady`를 사용해 실제 선택된 포트를 받은 뒤 클라이언트를 연결할 수 있어요.

Listener는 각 연결을 처리할 작업을 만들기 때문에 한 클라이언트의 수신을 기다린다고 다른 클라이언트 수락이 직렬로 막히는 형태는 아니에요. 그래도 연결 수 제한과 유휴 시간 제한은 필요해요. 이 서버는 요청 하나만 받고 끝내는 실습용이며, 장시간 서비스를 운영하는 서버 구현은 아니에요.

실기기 간 서버를 만들 때는 `TLS()`로 바꾸는 것만으로 끝나지 않아요. 서버의 인증서·개인 키인 identity와 클라이언트의 신뢰 정책을 준비해야 해요. 인증서 검증을 무조건 통과시키는 콜백은 사용하지 않아요. [로컬 네트워크 TLS 공식 가이드](https://developer.apple.com/documentation/network/creating-an-identity-for-local-network-tls)를 함께 확인해요.

## Browser는 연결할 대상을 찾아요

[`NetworkBrowser`](https://developer.apple.com/documentation/network/networkbrowser)는 연결이 아니라 탐색을 담당해요. 아래 코드는 같은 서비스 이름을 찾을 때까지 기다린 뒤 탐색을 끝내요. 실제 앱에서는 발견한 목록을 보여주고 사용자가 대상을 선택하게 하는 편이 적절할 수 있어요.

```swift
import Network

@available(iOS 26.0, macOS 26.0, *)
func findDevice(named name: String) async throws -> NWEndpoint {
    let endpoint: Bonjour.Endpoint = try await NetworkBrowser(
        for: .bonjour("_swiftkr._tcp")
    ).run { endpoints in
        guard let match = endpoints.first(where: { $0.name == name }) else {
            return .continue
        }
        return .finish(match)
    }
    return endpoint.nwEndpoint
}
```

서비스 이름은 인증 수단이 아니에요. 검색 결과가 없을 수 있으므로 `first!`로 꺼내지 않아요. 탐색에도 취소·시간 제한이 필요하며, 발견한 엔드포인트는 연결할 때 사라질 수 있어요.

위 loopback 서버는 Bonjour 광고를 하지 않기 때문에 이 Browser로 발견되지 않아요. Bonjour 광고, 서비스 타입 선언과 권한은 [Bonjour와 로컬 네트워크](./bonjour-and-local-network.md)에서 별도로 설명해요.

## 작업 취소와 시간 제한을 함께 설계해요

비동기 작업이 취소되어도 이미 상대 서버가 수행한 업무는 되돌아가지 않아요. 새 API는 연결·수락·탐색의 작업 수명을 연결해 주지만, 재시도 횟수나 업무의 멱등성까지 자동으로 정하지는 않아요. 멱등성은 같은 요청을 반복해도 의도한 효과가 중복되지 않는 성질이에요.

다음은 **취소에 반응하는 작업**과 시간 제한 작업을 경쟁시키는 도우미예요.

```swift
enum NetworkDeadlineError: Error {
    case timedOut
}

func withNetworkDeadline<Value: Sendable>(
    _ duration: Duration,
    operation: @escaping @Sendable () async throws -> Value
) async throws -> Value {
    try await withThrowingTaskGroup(of: Value.self) { group in
        group.addTask { try await operation() }
        group.addTask {
            try await Task.sleep(for: duration)
            throw NetworkDeadlineError.timedOut
        }
        defer { group.cancelAll() }
        guard let result = try await group.next() else {
            throw CancellationError()
        }
        return result
    }
}
```

호출은 다음과 같이 구성해요. 실습용 loopback 서버가 실행 중일 때 사용해요.

```swift
@available(iOS 26.0, macOS 26.0, *)
func runTimedRead() async throws -> Double {
    try await withNetworkDeadline(.seconds(5)) {
        try await readLoopbackTemperature()
    }
}
```

시간 제한 쪽이 먼저 실패하면 나머지 자식 작업을 취소해요. **Task Group은 자식이 끝날 때까지 범위를 떠나지 않으므로**, 취소를 무시하는 임의의 작업을 강제로 5초에 종료시키는 도구는 아니에요. 여기서는 Network의 작업 취소 처리에 의존해요.

SwiftUI 화면에서 사용할 때는 `.task`의 작업 안에서 직접 기다리거나, 버튼으로 만든 Task의 핸들을 소유하고 적절한 시점에 취소해요. `Task.detached`를 만든 뒤 화면을 떠나면 자동으로 끝날 것이라고 가정하지 않아요.

## 테스트와 적용 기준을 정리해요

다음 검사는 네트워크 없이 응답 검증을 확인해요. 테스트 타깃에 앞의 메시지 타입과 검증 함수를 노출하고 Swift Testing으로 실행해요.

```swift
import Foundation
import Testing

@Test func responseMustMatchRequest() throws {
    let id = UUID()
    #expect(try validatedTemperature(.reading(id: id, celsius: 23.5), for: id) == 23.5)
    #expect(throws: DeviceProtocolError.unexpectedReply) {
        try validatedTemperature(.reading(id: UUID(), celsius: 23.5), for: id)
    }
    #expect(throws: DeviceProtocolError.invalidTemperature) {
        try validatedTemperature(.reading(id: id, celsius: 500), for: id)
    }
}
```

운영 코드에 적용하기 전에는 다음 순서를 확인해요.

1. 배포 대상이 iOS 26 이상인지 확인해요.
2. 서버의 프레이밍·직렬화·TLS 구성과 맞춰요.
3. 단위 테스트와 loopback 송수신을 먼저 확인해요.
4. 연결 대기·무응답·취소·잘못된 응답을 시험해요.
5. 실기기의 네트워크 변화·권한 거부·인증서 오류를 확인해요.

낮은 OS 지원이 중요하거나 기존 콜백 코드가 충분히 검증되어 있다면 즉시 마이그레이션하지 않아도 돼요. 새 코드에서 중첩 콜백과 수명 관리의 부담이 클 때 도입 효과를 비교해요.

## 면접에서 이어질 수 있는 질문

### Coder를 쓰면 서버의 JSON API에 바로 붙을 수 있나요

아니에요. 값 직렬화뿐 아니라 Network의 메시지 프레이밍까지 서로 맞아야 해요. HTTP 서버에는 URLSession을 사용해요.

### send와 receive에 await가 있으면 MainActor를 막지 않나요

네트워크를 기다리는 동안에는 작업이 실행을 양보할 수 있어요. 하지만 같은 액터에서 실행하는 대량의 동기 파싱·변환까지 자동으로 다른 실행 영역으로 옮겨 주지는 않아요.

### 새 API를 쓰면 취소와 재시도가 모두 해결되나요

연결과 작업 수명의 연결은 쉬워지지만 업무 정책은 남아요. 시간 제한, 사용자 취소, 재시도와 중복 처리 방지, 응답 검증은 앱과 서버가 함께 정해야 해요.

## 참고 자료

- [WWDC25 — Use structured concurrency with Network framework](https://developer.apple.com/videos/play/wwdc2025/250/)
- [Apple Developer — NetworkConnection](https://developer.apple.com/documentation/network/networkconnection)
- [Apple Developer — withNetworkConnection(to:using:_:)](<https://developer.apple.com/documentation/network/withnetworkconnection(to:using:_:)-887ho>)
- [Apple Developer — NetworkListener](https://developer.apple.com/documentation/network/networklistener)
- [Apple Developer — NetworkBrowser](https://developer.apple.com/documentation/network/networkbrowser)
- [Apple Developer — TLV](https://developer.apple.com/documentation/network/tlv)
- [Apple Developer — Coder](https://developer.apple.com/documentation/network/coder)
- [Apple Developer — Creating an Identity for Local Network TLS](https://developer.apple.com/documentation/network/creating-an-identity-for-local-network-tls)
