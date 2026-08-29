---
title: Swift로 이해하는 Bonjour와 로컬 네트워크
description: NWBrowser와 NWListener로 Bonjour 서비스를 탐색·광고하고 발견한 엔드포인트에 연결하는 흐름을 설명합니다. 로컬 네트워크 권한, TLS 신뢰, 객체 수명과 실기기 검증 기준을 정리합니다.
---

# Swift로 이해하는 Bonjour와 로컬 네트워크

> **면접 답변 한 줄 요약:** Bonjour는 주소를 미리 알지 못하는 서비스를 이름과 타입으로 찾게 해 주며, Network의 Browser·Listener·Connection을 나눠 사용하면 탐색·광고·실제 통신과 권한·보안을 구분해 설계할 수 있어요.

사용자에게 장비의 IP 주소와 포트를 직접 입력하게 하면 주소가 바뀔 때마다 설정을 수정해야 해요. Bonjour를 사용하면 서비스가 자신을 알리고 앱이 그 서비스를 찾아 연결할 수 있어요.

이 문서는 iOS 17+, Swift 6 언어 모드의 `NWBrowser`·`NWListener` 예제예요. iOS 26의 `NetworkBrowser`·`NetworkListener`는 [Swift Concurrency 문서](./swift-concurrency.md)에서 비교해요.

## 먼저 알아둘 용어

| 용어         | 쉬운 뜻                                                                                             |
| ------------ | --------------------------------------------------------------------------------------------------- |
| Bonjour      | 기기와 서비스가 로컬 네트워크에서 서로를 발견하도록 돕는 기술 묶음이에요.                           |
| mDNS·DNS-SD  | mDNS는 로컬 이름을 찾는 방식이고, DNS-SD는 DNS 레코드로 서비스의 종류와 위치를 발견하는 방식이에요. |
| 서비스 타입  | `_swiftkr._tcp`처럼 “무슨 통신 규칙을 어떤 전송 방식으로 제공하는가”를 나타내요.                    |
| 광고·탐색    | 광고는 서비스의 존재를 알리는 동작, 탐색은 원하는 타입의 서비스를 찾는 동작이에요.                  |
| TXT 레코드   | 서비스의 버전·기능 같은 작은 부가 정보를 전달하는 키-값 데이터예요. 비밀이나 신원 증명이 아니에요.  |
| Entitlement  | 앱의 코드 서명에 포함되는 기능 권한이에요. 사용자에게 묻는 개인정보 접근 허용과는 달라요.           |
| TLS identity | 서버가 TLS에서 사용할 인증서와 개인 키의 조합이에요.                                                |

탐색·광고·연결의 경계, 서비스 목록의 수명, 권한 설명, TLS 신뢰와 실기기 시험을 배워요.

## 세 가지 객체의 역할을 나눠요

[Apple의 네트워킹 API 선택 가이드](https://developer.apple.com/documentation/technotes/tn3151-choosing-the-right-networking-api)는 Bonjour 광고·탐색·연결에 Network를 권장해요.

```text
서버 앱                                  클라이언트 앱
NWListener + service ── Bonjour 광고 ──→ NWBrowser
       │                                  │ 발견된 서비스 목록
       │                                  ↓ 사용자가 선택
       └── 새 NWConnection 수락 ←──── NWConnection(to: endpoint)
                       ↕ 실제 메시지 송수신
```

Browser는 서버에 로그인하거나 업무 데이터를 읽는 객체가 아니에요. Listener는 검색 목록이 아니라 새 연결을 받는 객체예요. 발견됐다는 사실은 **현재 연결 성공이나 신뢰할 수 있는 장비임을 보장하지 않아요**.

### IP 주소를 저장하는 대신 서비스 엔드포인트를 사용해요

서비스 발견 결과를 IP 주소 문자열로 바꿔 영구 저장하기보다, 선택한 `NWBrowser.Result.endpoint`로 연결해요. 이름 해석과 주소 선택을 시스템에 맡길 수 있어요.

같은 표시 이름을 사용하는 서비스가 있을 수 있으므로 이름 문자열만으로 목록의 ID를 만들지도 않아요. 아래 예제는 엔드포인트를 항목의 ID로 사용해요.

## 검색 목록을 관찰 가능한 모델로 만들어요

Observation은 모델의 상태 변경을 UI에서 관찰하는 Swift 기능이에요. 모델은 MainActor에 격리하고, Network 콜백은 `Task { @MainActor ... }`로 전달해요.

중지 직전에 예약된 콜백이 나중에 실행될 수 있으므로, `generation`이라는 실행 식별자로 오래된 탐색 결과를 무시해요.

```swift
import Foundation
import Network
import Observation

struct DiscoveredDevice: Identifiable, Sendable {
    let endpoint: NWEndpoint
    var id: NWEndpoint { endpoint }

    var name: String {
        if case .service(let name, _, _, _) = endpoint { return name }
        return endpoint.debugDescription
    }
}

@MainActor
@Observable
final class DeviceBrowser {
    private(set) var devices: [DiscoveredDevice] = []
    private(set) var message = "검색 버튼을 눌러 주세요"
    @ObservationIgnored private var browser: NWBrowser?
    @ObservationIgnored private var generation = UUID()

    func start() {
        stop()
        let token = UUID()
        generation = token
        let browser = NWBrowser(
            for: .bonjour(type: "_swiftkr._tcp", domain: nil), using: .tcp
        )
        self.browser = browser
        message = "장비를 찾는 중"

        browser.stateUpdateHandler = { [weak self] state in
            Task { @MainActor [weak self] in
                guard let self, self.generation == token else { return }
                switch state {
                case .ready:
                    self.message = "검색 중 — 결과가 없을 수도 있어요"
                case .waiting(let error):
                    self.message = "검색 대기: \(error)"
                case .failed(let error):
                    self.stop()
                    self.message = "검색 실패: \(error)"
                case .cancelled:
                    self.stop()
                default:
                    break
                }
            }
        }
        browser.browseResultsChangedHandler = { [weak self] results, _ in
            let devices = results.map { DiscoveredDevice(endpoint: $0.endpoint) }
                .sorted { $0.name < $1.name }
            Task { @MainActor [weak self] in
                guard let self, self.generation == token else { return }
                self.devices = devices
            }
        }
        browser.start(queue: DispatchQueue(label: "swiftkr.device-browser"))
    }

    func stop() {
        generation = UUID()
        browser?.cancel()
        browser = nil
        devices = []
        message = "검색이 중지됐어요"
    }
}
```

이 모델은 새 결과 집합으로 목록을 교체해 사라진 서비스도 반영해요. 결과를 계속 append만 하면 중복되거나 이미 사라진 장비가 남을 수 있어요. 같은 탐색 안에서 아주 빈번한 업데이트의 엄격한 순서 보장이 필요하다면 이벤트를 하나의 직렬 소비 경로로 전달하는 설계를 추가해요.

Browser의 `.tcp`는 탐색 조건이지 실제 업무 연결을 암호화하는 설정이 아니에요. 연결을 만들 때는 서버와 맞는 TLS 등 별도의 파라미터가 필요해요.

### 화면에서 검색 시점을 사용자에게 맡겨요

SwiftUI는 상태에 따라 화면을 선언하는 Apple UI 프레임워크예요. 아래 화면은 검색 버튼으로 탐색을 시작하고, 선택한 엔드포인트를 호출자에게 넘겨요.

```swift
import SwiftUI
import Network

@MainActor
struct DevicePicker: View {
    @State private var model = DeviceBrowser()
    let onSelect: (NWEndpoint) -> Void

    var body: some View {
        List {
            Text(model.message)
            Button("장비 검색") { model.start() }
            ForEach(model.devices) { device in
                Button(device.name) {
                    model.stop()
                    onSelect(device.endpoint)
                }
            }
        }
        .onDisappear { model.stop() }
    }
}
```

호출자는 [NWConnection 예제](./connections-and-data.md)의 `DeviceReader.read(endpoint:)`처럼 선택한 서비스에 연결해요. 발견과 연결 사이에도 서비스가 종료될 수 있으므로 연결 실패를 처리해야 해요. 검색 결과가 없어도 곧바로 권한 거부로 단정하지 않아요.

## 서버는 identity를 갖춘 Listener로 광고해요

다음 함수는 **광고와 연결 수락을 구성하는 부분**이에요. 실제 명령 파싱·응답·접속별 시간 제한은 `onConnection`으로 전달받은 연결의 소유자가 구현해요. 앞 문서의 줄바꿈 규칙을 사용한다면 서버도 동일하게 읽고 응답해야 해요.

```swift
import Foundation
import Network
import Security

func startDeviceAdvertisement(
    identity: sec_identity_t,
    onState: @escaping @Sendable (NWListener.State) -> Void,
    onConnection: @escaping @Sendable (NWConnection) -> Void
) throws -> NWListener {
    let tls = NWProtocolTLS.Options()
    sec_protocol_options_set_local_identity(tls.securityProtocolOptions, identity)
    let parameters = NWParameters(tls: tls, tcp: NWProtocolTCP.Options())
    let listener = try NWListener(using: parameters, on: .any)
    listener.service = NWListener.Service(name: "SwiftKR 온도계", type: "_swiftkr._tcp")
    listener.newConnectionLimit = 8
    listener.stateUpdateHandler = onState
    listener.newConnectionHandler = onConnection
    listener.start(queue: DispatchQueue(label: "swiftkr.device-listener"))
    return listener
}
```

호출자는 반환된 Listener를 보관하고, 서버 기능을 종료할 때 `cancel()`해요. `onConnection`으로 받은 연결도 따로 보관하고 상태 핸들러를 설치한 뒤 `start(queue:)`해야 해요. **Listener의 취소와 이미 수락한 연결의 종료를 같은 것으로 보지 않고**, 각 연결도 명시적으로 정리해요.

`.any`는 시스템이 사용 가능한 포트를 선택하게 해요. 클라이언트는 번호를 하드코딩하지 않고 광고된 서비스 엔드포인트로 연결해요. Listener가 준비되기 전에는 포트나 서비스 등록이 완료됐다고 가정하지 않아요. `newConnectionLimit` 외에도 앱의 동시 처리량·요청 크기·유휴 시간 제한을 설계해요.

### 인증서 검증을 끄지 않고 신뢰를 준비해요

[`Creating an Identity for Local Network TLS`](https://developer.apple.com/documentation/network/creating-an-identity-for-local-network-tls)는 서버 identity와 클라이언트 신뢰 체인을 준비하는 방법을 설명해요. 위 함수는 이미 안전하게 준비한 identity를 인자로 받으며 개인 키를 코드에 넣지 않아요.

개발 인증서라서 연결이 실패한다면 인증서의 신뢰 체인과 접속 이름을 확인해요. 무조건 `true`를 반환하는 인증서 검증 콜백으로 해결하지 않아요. Bonjour 표시 이름·TXT 레코드는 누구나 주장할 수 있는 정보이므로 장비 인증이나 사용자 권한을 대신할 수 없어요.

TLS는 통신 보안이고, 사용자 계정의 권한 검사와 메시지 유효성 검사는 앱 프로토콜의 책임이에요. 로컬 네트워크라서 신뢰할 수 있다고 가정하지 않아요.

## Info.plist의 설명과 서비스 타입을 준비해요

앱 타깃의 Info 설정에 다음 값을 추가해요. `_swiftkr._tcp`는 예제용 서비스 타입이므로 실제 앱의 광고·탐색 코드와 일치시켜요.

```xml
<key>NSLocalNetworkUsageDescription</key>
<string>같은 네트워크의 온도 장비를 찾아 측정값을 읽습니다.</string>
<key>NSBonjourServices</key>
<array>
    <string>_swiftkr._tcp</string>
</array>
```

[`NSLocalNetworkUsageDescription`](https://developer.apple.com/documentation/bundleresources/information-property-list/nslocalnetworkusagedescription)은 접근 이유를 사용자에게 설명하고, [`NSBonjourServices`](https://developer.apple.com/documentation/bundleresources/information-property-list/nsbonjourservices)는 사용하는 Bonjour 서비스 타입을 선언해요. 둘 다 그 자체로 접근을 허용해 주는 스위치는 아니에요.

Apple의 [TN3179](https://developer.apple.com/documentation/technotes/tn3179-understanding-local-network-privacy)에 따르면 iOS의 로컬 네트워크 개인정보 보호는 iOS 14부터 적용돼요. 앱의 실제 로컬 작업을 계기로 시스템이 사용자에게 물어보므로, 기능과 무관하게 앱 시작 직후 검색을 켜기보다 사용자가 “장비 검색”을 선택한 시점에 시작하는 구성을 권장해요.

미결정 상태에서 첫 작업이 먼저 실패할 수 있어요. 한 번의 실패로 영구 거부라고 단정하지 않고 대기·다시 검색·설정 안내를 제공해요. 검색 중지와 앱의 다른 기능 이용도 가능하게 해요.

### 로컬 권한과 multicast entitlement는 달라요

Info.plist에 선언한 특정 타입의 일반 Bonjour 탐색·광고를 한다고 언제나 multicast entitlement까지 필요한 것은 아니에요. 직접 UDP multicast·broadcast를 사용하거나 임의의 서비스 타입을 폭넓게 찾는 작업은 별도의 요건을 확인해야 해요. [TN3179의 Multicast operations](https://developer.apple.com/documentation/technotes/tn3179-understanding-local-network-privacy#Multicast-operations)를 기준으로 실제 작업을 분류해요.

macOS의 App Sandbox에서 요구하는 네트워크 capability도 사용자에게 받는 로컬 네트워크 접근 허용과 다른 층의 설정이에요. 플랫폼마다 권한·서명·실행 환경을 나눠 확인해요.

## 실패 원인을 하나의 권한 값으로 합치지 않아요

| 현상                   | 먼저 구분할 내용                                                          |
| ---------------------- | ------------------------------------------------------------------------- |
| 검색 결과가 없음       | 서버가 광고 중인지, 서비스 타입이 같은지, 같은 네트워크에서 탐색 가능한지 |
| Browser가 `.waiting`   | 관련 오류와 정책 제한 여부, 사용자 응답 전인지                            |
| 발견했지만 연결 실패   | 서비스 종료, 접속 파라미터, 방화벽, TLS 신뢰                              |
| 연결했지만 응답이 없음 | 양쪽 메시지 형식, 요청 처리 상태, 수신 루프와 시간 제한                   |

TN3179는 범용적인 로컬 네트워크 허용 상태 조회 API가 없다고 설명해요. 특정 Bonjour 작업의 `kDNSServiceErr_PolicyDenied`나 해당 로컬 연결의 `unsatisfiedReason == .localNetworkDenied`처럼 **그 작업이 제공하는 단서**를 사용해요. `NWPathMonitor`의 일반 경로 상태를 권한 조회 결과로 바꾸지 않아요.

## 실기기에서 검증해요

권한 창은 iOS Simulator에서 검증할 수 없으므로 실제 iPhone·iPad를 사용해요. Mac의 커맨드라인 도구가 통신에 성공한 결과도 iOS 앱의 권한 동작을 증명하지 않아요.

다음 시나리오를 구분해서 시험해요.

1. 서버의 서비스 광고와 실제 요청·응답을 각각 확인해요.
2. 처음 허용, 거부, 설정에서 변경 후 다시 검색을 확인해요.
3. 서버가 없는 상태와 같은 이름의 여러 서비스가 있는 상태를 확인해요.
4. 탐색 중지 직후 늦은 콜백과 화면 재진입을 확인해요.
5. 잘못된 인증서·메시지·무응답을 별도로 시험해요.
6. 서버와 클라이언트의 객체·작업이 종료될 때 연결도 정리되는지 확인해요.

Bonjour를 이용해 앱이 백그라운드에서도 무제한 서버로 동작할 수 있다고 가정하지 않아요. 앱 수명과 허용된 백그라운드 실행 범위는 별도 제약이에요. 공용 웹 서버만 호출하는 앱에는 이 탐색 기능 자체가 필요하지 않을 수 있어요.

## 면접에서 이어질 수 있는 질문

### Bonjour에서 발견한 이름을 로그인 증명으로 사용할 수 있나요

아니에요. 발견은 위치와 서비스 정보를 얻는 과정이지 신원 인증이 아니에요. TLS 신뢰와 앱 수준의 장비·사용자 인증이 필요해요.

### Listener를 취소하면 모든 클라이언트 작업도 끝나나요

기존 NWListener와 수락한 NWConnection은 각각 수명을 관리해야 해요. 새 연결 수락을 멈추는 것과 기존 연결을 취소하는 것을 별도로 처리해요.

### 검색 결과가 없으면 권한이 거부된 건가요

그렇게 단정할 수 없어요. 광고 중인 서비스가 없거나 서비스 타입·네트워크가 다를 수 있어요. 실제 작업의 상태와 오류를 확인해 원인을 구분해요.

## 참고 자료

- [Apple Developer — NWBrowser](https://developer.apple.com/documentation/network/nwbrowser)
- [Apple Developer — NWListener](https://developer.apple.com/documentation/network/nwlistener)
- [Apple Developer — TN3151: Choosing the right networking API](https://developer.apple.com/documentation/technotes/tn3151-choosing-the-right-networking-api)
- [Apple Developer — TN3179: Understanding local network privacy](https://developer.apple.com/documentation/technotes/tn3179-understanding-local-network-privacy)
- [Apple Developer — NSBonjourServices](https://developer.apple.com/documentation/bundleresources/information-property-list/nsbonjourservices)
- [Apple Developer — NSLocalNetworkUsageDescription](https://developer.apple.com/documentation/bundleresources/information-property-list/nslocalnetworkusagedescription)
- [Apple Developer — Creating an Identity for Local Network TLS](https://developer.apple.com/documentation/network/creating-an-identity-for-local-network-tls)
