---
title: Swift로 이해하는 Network 프레임워크
description: Apple Network 프레임워크의 역할을 URLSession과 비교하고 TCP·UDP·TLS·QUIC, 연결과 경로의 차이, 기존 API와 iOS 26 비동기 API의 학습 순서를 설명합니다.
---

# Swift로 이해하는 Network 프레임워크

> **면접 답변 한 줄 요약:** Network는 앱이 직접 정한 통신 규칙에 맞춰 연결과 데이터 송수신을 구성하는 Apple 프레임워크로, 전송 방식과 보안을 조합하면서 이름 해석과 연결 상태 처리를 시스템에 맡길 수 있어요.

상품 목록을 웹 서버에서 받아오는 일과 근처 장비에 직접 명령을 보내는 일은 모두 네트워킹이지만, 필요한 API는 같지 않아요. 이 섹션은 [Apple Network 공식 문서](https://developer.apple.com/documentation/network)를 출발점으로 **언제 Network가 필요하고, 어떻게 연결·데이터·수명을 다루는지** 설명해요.

기본 Swift 문법을 아는 독자를 대상으로 해요. 코드는 학습용으로 작성한 예제이며 Apple 샘플의 번역본은 아니에요. HTTP 클라이언트 전체 구현이나 VPN 개발은 이번 범위에 포함하지 않아요.

## 먼저 알아둘 네트워크 용어

| 용어                               | 쉬운 뜻                                                                                               |
| ---------------------------------- | ----------------------------------------------------------------------------------------------------- |
| 프로토콜                           | 통신하는 양쪽이 합의한 데이터 형식과 처리 순서예요. 여기서는 Swift의 `protocol` 선언과 구별해요.      |
| 엔드포인트(Endpoint)               | 연결의 한쪽 끝이에요. 호스트 이름과 포트, 또는 발견한 서비스로 나타낼 수 있어요.                      |
| 포트(Port)                         | 같은 기기 안에서 어느 서비스와 통신할지 구분하는 번호예요.                                            |
| HTTP·HTTPS                         | 웹 요청과 응답의 규칙이에요. HTTPS는 HTTP 통신을 TLS로 보호해요.                                      |
| TCP(Transmission Control Protocol) | 순서 있는 바이트 흐름을 제공하는 전송 프로토콜이에요. 앱 메시지의 경계는 별도로 정해야 해요.          |
| UDP(User Datagram Protocol)        | 개별 데이터그램 단위로 보내는 전송 프로토콜이에요. 전달·순서를 보장하지 않아요.                       |
| TLS(Transport Layer Security)      | 통신 내용을 암호화하고 상대의 신원을 검증하는 보안 프로토콜이에요.                                    |
| QUIC                               | UDP 위에서 암호화된 연결과 여러 스트림 등을 제공하는 전송 프로토콜이에요. HTTP/3도 이를 사용해요.     |
| DNS(Domain Name System)            | 호스트 이름을 네트워크 주소와 연결하는 체계예요.                                                      |
| 경로(Path)                         | 현재 통신에 사용할 수 있는 네트워크 조건과 인터페이스의 정보를 나타내요. 서버의 응답 결과와는 달라요. |

이 섹션에서는 다음 내용을 배워요.

- HTTP 요청과 직접 연결을 구분하는 기준
- 연결 상태와 송수신 완료의 의미
- TCP에서 메시지를 나누는 방법
- 기존 콜백 API와 Swift Concurrency API의 차이
- 네트워크 상태 관찰과 로컬 서비스 탐색

## HTTP 요청에는 먼저 URLSession을 검토해요

`Foundation`은 데이터·날짜·URL 처리 등 기본 기능을 제공하는 Apple 프레임워크예요. 그 안의 `URLSession`은 URL 기반 리소스를 요청하는 API예요.

웹 API를 호출하려고 소켓 연결을 직접 열고 HTTP 문자열을 조립하면, 응답 파싱 외에도 인증·리다이렉트·캐시·취소 등을 떠안게 돼요. Apple의 [Network 개요](https://developer.apple.com/documentation/network)는 HTTP와 URL 기반 리소스에는 URLSession을 계속 사용하라고 안내해요.

아래는 HTTPS 응답을 검사하고 Swift 값으로 변환하는 최소 예제예요. `Codable`은 값을 외부 데이터로 인코딩하고 다시 디코딩할 수 있게 하는 Swift 프로토콜 조합이에요.

```swift
import Foundation

struct DeviceStatus: Codable, Sendable {
    let name: String
    let isOnline: Bool
}

enum HTTPStatusError: Error {
    case invalidResponse
    case unsuccessful(Int)
}

func fetchDeviceStatus(from url: URL) async throws -> DeviceStatus {
    let (data, response) = try await URLSession.shared.data(from: url)
    guard let http = response as? HTTPURLResponse else {
        throw HTTPStatusError.invalidResponse
    }
    guard (200..<300).contains(http.statusCode) else {
        throw HTTPStatusError.unsuccessful(http.statusCode)
    }
    return try JSONDecoder().decode(DeviceStatus.self, from: data)
}
```

호출자는 자신이 운영하는 HTTPS API의 URL을 전달해요. `async`는 작업이 기다리는 동안 실행을 양보할 수 있다는 뜻이며, 성공이나 백그라운드 실행을 보장한다는 뜻은 아니에요. `Sendable`은 값을 동시성 경계 너머로 안전하게 전달할 수 있음을 나타내요.

이 예제는 연결 오류뿐 아니라 HTTP 오류 상태도 검사해요. 응답 크기 제한, 인증, 재시도 정책, 캐시와 화면 연결은 서비스 요구에 맞춰 추가해야 해요. Network로 옮긴다고 이런 앱 정책이 자동으로 생기지는 않아요.

## Network가 필요한 질문은 따로 있어요

아래 선택 기준은 [TN3151: Choosing the right networking API](https://developer.apple.com/documentation/technotes/tn3151-choosing-the-right-networking-api)의 권장 사항을 학습 순서에 맞춰 정리한 것이에요.

| 하고 싶은 일                             | 먼저 검토할 API                       | 이유                                                                                                       |
| ---------------------------------------- | ------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| HTTP·HTTPS API 호출, URL 리소스 다운로드 | `URLSession`                          | HTTP의 상위 기능을 제공해요.                                                                               |
| 앱이 중단되어도 이어질 HTTP 파일 전송    | URLSession의 background session       | 직접 연결과 다른 시스템 전송 수명이 필요해요.                                                              |
| 자체 TCP·UDP·QUIC 프로토콜               | Network의 연결 API                    | 바이트·메시지와 프로토콜 구성을 직접 다뤄요.                                                               |
| 새 WebSocket 구현                        | Network를 우선 검토                   | Apple은 특별한 이유가 없으면 새 WebSocket 코드에 Network를 권장해요. URLSessionWebSocketTask도 선택지예요. |
| 근처 서비스 광고·탐색·연결               | Network의 Listener·Browser·Connection | Bonjour 탐색 결과를 연결에 사용할 수 있어요.                                                               |

HTTP/3를 사용하고 싶다는 이유만으로 QUIC 연결을 직접 구현하지 않아요. **HTTP/3 클라이언트는 URLSession, 자체 QUIC 프로토콜은 Network**로 목적을 구분해요. 크로스플랫폼 라이브러리 같은 제약이 없다면 Apple 플랫폼에서 TCP를 직접 다룰 때도 BSD 소켓보다 Network를 먼저 검토해요.

Network와 **Network Extension**도 다른 프레임워크예요. Network가 앱의 통신에 초점을 둔다면, Network Extension은 VPN·필터 등 네트워크 기능을 확장하는 제공자 구현을 다뤄요. 이름이 비슷하다고 같은 설정이나 권한을 요구하지는 않아요.

## 엔드포인트·프로토콜·정책을 나눠 생각해요

같은 목적지에 연결하더라도 무엇으로 통신하고 어떤 조건을 허용할지 따로 정해요.

```text
NWEndpoint        어디로?  → 서비스 이름 또는 호스트·포트
프로토콜 구성     어떻게?  → 메시지 형식 → TLS → TCP → IP
연결 파라미터     어떤 조건? → 비용·저데이터 모드·인터페이스 제약
                          ↓
                 Connection의 연결·송수신
```

`NWEndpoint`는 목적지, `NWParameters`는 프로토콜과 정책을 담아요. Network에 호스트 이름을 전달하면 시스템이 주소 해석과 연결 시도를 처리해요. 앱이 DNS를 먼저 조회하고 IPv4 주소 하나를 고정하는 설계는 IPv6나 네트워크 변화에 불리할 수 있어요.

`TLS`를 골랐다고 HTTP가 되는 것은 아니에요. TLS 위에서 주고받을 메시지 규칙은 여전히 양쪽이 합의해야 해요. 반대로 `.tcp`는 암호화를 켜는 설정이 아니에요. 실서비스에서는 인증서 검증을 유지하는 TLS나 보안이 포함된 전송 구성을 사용해요.

## API 세대와 배포 대상을 구분해요

[WWDC25](https://developer.apple.com/videos/play/wwdc2025/250/)는 기존 API를 유지하면서 Swift의 구조적 동시성에 맞춘 API를 소개했어요. 구조적 동시성은 부모·자식 작업의 수명과 취소를 정해진 범위에서 관리하는 방식이에요.

| 역할           | 기존 Swift API            | 새로운 Swift API                                    |
| -------------- | ------------------------- | --------------------------------------------------- |
| 연결·송수신    | `NWConnection` — iOS 12+  | `NetworkConnection` — iOS 26+                       |
| 연결 수락      | `NWListener` — iOS 12+    | `NetworkListener` — iOS 26+                         |
| 서비스 탐색    | `NWBrowser` — iOS 13+     | `NetworkBrowser` — iOS 26+                          |
| 앱의 경로 관찰 | `NWPathMonitor` — iOS 12+ | 같은 타입이 iOS 17+에서 `AsyncSequence`도 지원해요. |

기존 타입을 모두 폐기된 API로 부르거나, `async/await` 문법을 썼다는 이유로 iOS 26 API라고 판단하지 않아요. 각 심벌의 도입 버전을 확인해야 해요. 이 섹션은 **일반 예제는 iOS 17+, 신규 연결 API 예제는 iOS 26+**, Swift 6 언어 모드와 기본 액터 격리 `nonisolated`를 기준으로 해요.

watchOS는 저수준 네트워킹에 별도 제약이 있어요. iOS 예제를 그대로 확장하지 말고 [TN3135: Low-level networking on watchOS](https://developer.apple.com/documentation/technotes/tn3135-low-level-networking-on-watchos)를 확인해요.

## 어떤 문서부터 읽으면 좋을까요

| 문서                                                      | 확인할 질문                                                        |
| --------------------------------------------------------- | ------------------------------------------------------------------ |
| [NWConnection과 메시지 경계](./connections-and-data.md)   | 연결 상태, 수신 반복, TCP 조각을 어떻게 처리하나요?                |
| [Swift Concurrency 네트워킹](./swift-concurrency.md)      | iOS 26에서는 연결과 작업 수명이 어떻게 연결되나요?                 |
| [네트워크 경로 관찰](./path-monitoring.md)                | 연결 상태 표시와 실제 요청 성공을 어떻게 구분하나요?               |
| [Bonjour와 로컬 네트워크](./bonjour-and-local-network.md) | 주소를 모르는 서비스는 어떻게 찾고, 권한·보안은 어떻게 준비하나요? |

## 적용 순서를 정리해요

1. 상대가 사용하는 프로토콜과 앱의 최소 OS 버전을 확인해요.
2. HTTP 기능인지, 직접 제어할 연결인지 먼저 결정해요.
3. 메시지 경계·최대 크기·응답 규칙을 양쪽에서 합의해요.
4. 연결 실패·취소·시간 제한·재시도의 책임을 정해요.
5. 로컬 네트워크 권한과 TLS 신뢰 구성을 준비해요.
6. 실제 네트워크 시험과 데이터 처리 단위 테스트를 나눠 검증해요.

## 면접에서 이어질 수 있는 질문

### Network가 URLSession보다 더 좋은 API인가요

우열보다 다루는 계층이 달라요. HTTP 기능은 URLSession에 맡기고, 자체 전송 규칙이나 장비 통신처럼 직접 연결 제어가 필요할 때 Network를 검토해요.

### NWConnection과 NetworkConnection은 이름만 다른가요

아니에요. 상태·완료 콜백 중심의 API와, 타입으로 프로토콜 구성을 표현하고 비동기 작업과 수명을 연결하는 API라는 차이가 있어요. 지원 OS도 확인해야 해요.

### 네트워크 경로가 정상이라면 서버에 연결할 수 있나요

그것만으로는 알 수 없어요. DNS, TLS, 서버 장애나 인증 실패는 실제 요청에서 발생할 수 있어요. 경로 정보는 관찰·정책에 쓰고 실제 작업의 성공은 그 작업의 결과로 판단해요.

## 참고 자료

- [Apple Developer — Network](https://developer.apple.com/documentation/network)
- [Apple Developer — TN3151: Choosing the right networking API](https://developer.apple.com/documentation/technotes/tn3151-choosing-the-right-networking-api)
- [Apple Developer — URLSession](https://developer.apple.com/documentation/foundation/urlsession)
- [WWDC25 — Use structured concurrency with Network framework](https://developer.apple.com/videos/play/wwdc2025/250/)
- [Apple Developer — NWPathMonitor](https://developer.apple.com/documentation/network/nwpathmonitor)
- [Apple Developer — TN3135: Low-level networking on watchOS](https://developer.apple.com/documentation/technotes/tn3135-low-level-networking-on-watchos)
