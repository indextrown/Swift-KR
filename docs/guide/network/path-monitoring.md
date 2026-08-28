---
title: Swift로 이해하는 NWPathMonitor와 네트워크 경로
description: NWPathMonitor로 경로 상태와 데이터 비용을 관찰하고 실제 요청 성공과 구분합니다. 콜백·AsyncSequence·SwiftUI 예제, 저데이터 모드 정책과 테스트 방법을 설명합니다.
---

# Swift로 이해하는 NWPathMonitor와 네트워크 경로

> **면접 답변 한 줄 요약:** NWPathMonitor는 앱에서 사용할 수 있는 네트워크 경로의 변화를 알려 주는 관찰자이며, 서버 성공 여부를 미리 보장하는 검사기가 아니라 상태 표시와 전송 정책을 돕는 도구예요.

화면 위에 “오프라인”을 표시하거나 데이터 비용이 큰 환경에서 자동 다운로드를 미루고 싶을 수 있어요. 이때 필요한 정보와 실제 서버 요청의 성공 여부를 하나의 `isConnected` 값으로 합치면 오해가 생겨요.

예제 기준은 iOS 17+, Swift 6 언어 모드예요. `NWPathMonitor`는 iOS 12부터, `isConstrained`는 iOS 13부터, 비동기 시퀀스 지원은 iOS 17부터 사용할 수 있어요.

## 먼저 알아둘 용어

| 용어                | 쉬운 뜻                                                                                                    |
| ------------------- | ---------------------------------------------------------------------------------------------------------- |
| 경로(Path)          | 통신에 사용할 수 있는 네트워크의 조건과 인터페이스 정보예요.                                               |
| 인터페이스          | Wi-Fi·셀룰러·유선처럼 네트워크로 통하는 통로예요.                                                          |
| expensive           | 셀룰러나 개인용 핫스팟처럼 시스템이 비용이 크다고 판단한 경로예요. 실제 요금표나 속도 측정값이 아니에요.   |
| constrained         | 사용자가 저데이터 모드를 켠 경로예요. 단순히 신호가 약하다는 뜻이 아니에요.                                |
| preflight 검사      | 실제 요청 전에 성공할지를 별도 정보로 미리 판단하는 방식이에요.                                            |
| Observation·SwiftUI | Observation은 읽은 모델 상태의 변경을 추적하고, SwiftUI는 그 상태에 따라 화면을 선언하는 Apple 기술이에요. |

경로의 의미, 잘못된 사전 검사, 콜백과 비동기 관찰, UI 연결, 데이터 정책과 테스트를 순서대로 설명해요.

## 경로·연결·서버 응답은 서로 다른 정보예요

[`NWPath.Status`](https://developer.apple.com/documentation/network/nwpath/status-swift.enum)의 상태를 다음처럼 읽어요.

| 값                    | 의미                                                     | 주의점                                                            |
| --------------------- | -------------------------------------------------------- | ----------------------------------------------------------------- |
| `.satisfied`          | 연결과 데이터 전송에 사용할 수 있는 경로예요.            | 특정 호스트의 DNS·TLS·서버·인증 성공은 보장하지 않아요.           |
| `.requiresConnection` | 현재는 경로가 없지만 연결을 시작하면 활성화될 수 있어요. | 이 상태를 보고 모든 요청을 차단하면 활성화 기회도 막을 수 있어요. |
| `.unsatisfied`        | 현재 조건을 만족하는 경로가 없어요.                      | 영구적인 장애라는 뜻은 아니에요.                                  |

기본 `NWPathMonitor()`는 앱 관점의 경로를 관찰해요. 특정 연결은 파라미터와 목적지가 다르므로 `NWConnection.currentPath`·`pathUpdateHandler` 등 그 연결의 정보가 필요할 수 있어요.

`NWPathMonitor(requiredInterfaceType: .wifi)`는 **Wi-Fi에 한정한 관찰자**예요. 이 모니터가 불만족 상태라고 셀룰러까지 사용할 수 없다는 뜻은 아니에요. [`usesInterfaceType`](<https://developer.apple.com/documentation/network/nwpath/usesinterfacetype(_:)>)도 경로가 해당 통로를 사용할 수 있는지 확인하는 API이지 Wi-Fi 이름(SSID)이나 실제 전송 속도를 얻는 API가 아니에요.

## 요청 전에 모든 작업을 차단하지 않아요

아래 코드는 상태값이 최신이고, 경로가 정상이어야만 요청을 시작할 수 있다고 가정해요.

```swift
// 권장하지 않는 제어 흐름이에요.
func loadOnlyWhenPreflightAllows(isConnected: Bool, load: () -> Void) {
    guard isConnected else { return }
    load()
}
```

관찰값을 읽은 다음 실제 연결을 시작하기 전에도 네트워크는 바뀔 수 있어요. 앱 시작 직후 아직 첫 경로 업데이트가 오지 않았을 수도 있어요. 반대로 `.satisfied` 상태에서도 서버는 실패할 수 있어요.

사용자가 요청한 작업은 해당 API로 시도하고 실제 오류를 처리하는 흐름을 기본으로 삼아요. 경로 정보로 상태 안내나 불필요한 자동 작업을 조절하는 것은 별도의 정책이에요. Apple의 [TN3151](https://developer.apple.com/documentation/technotes/tn3151-choosing-the-right-networking-api)도 이름으로 연결하고 시스템의 연결 동작을 활용하도록 권장해요.

## UI에서 사용할 작은 값으로 변환해요

테스트에서 실제 `NWPath`를 마음대로 생성하거나 네트워크를 바꾸는 대신, 앱이 사용할 정보만 값 타입으로 옮겨요. 초기 상태는 오프라인이 아니라 **아직 모름**으로 표현해요.

```swift
import Network

enum PathAvailability: Sendable, Equatable {
    case unknown, available, needsConnection, unavailable
}

struct NetworkSnapshot: Sendable, Equatable {
    let availability: PathAvailability
    let isExpensive: Bool
    let isConstrained: Bool

    static let unknown = NetworkSnapshot(
        availability: .unknown, isExpensive: false, isConstrained: false
    )

    init(availability: PathAvailability, isExpensive: Bool, isConstrained: Bool) {
        self.availability = availability
        self.isExpensive = isExpensive
        self.isConstrained = isConstrained
    }

    init(path: NWPath) {
        switch path.status {
        case .satisfied: availability = .available
        case .requiresConnection: availability = .needsConnection
        case .unsatisfied: availability = .unavailable
        @unknown default: availability = .unknown
        }
        isExpensive = path.isExpensive
        isConstrained = path.isConstrained
    }
}
```

`Sendable`은 이 값이 동시성 경계 너머로 전달될 수 있음을 나타내요. 초기 비용 플래그의 `false`만 따로 읽어 무료 경로라고 판단하지 않고 `availability`와 함께 해석해요.

## 기존 콜백 API는 소유자가 시작과 종료를 관리해요

콜백 방식은 작업을 받을 큐와 핸들러를 설정해요. 다음 함수가 반환하는 모니터는 호출자가 보관하고 필요 없을 때 `cancel()`해야 해요.

```swift
import Foundation
import Network

func makeCallbackMonitor(
    onChange: @escaping @Sendable (NetworkSnapshot) -> Void
) -> NWPathMonitor {
    let monitor = NWPathMonitor()
    monitor.pathUpdateHandler = { path in
        onChange(NetworkSnapshot(path: path))
    }
    monitor.start(queue: DispatchQueue(label: "swiftkr.path-monitor"))
    return monitor
}
```

이 콜백은 MainActor 콜백이 아니에요. UI 상태를 바꾸려면 MainActor로 전달해야 해요. 화면을 다시 열 때 취소한 인스턴스를 재사용하는 대신 새 모니터로 새 관찰 수명을 시작해요.

## iOS 17부터는 for await로 직접 관찰할 수 있어요

[`NWPathMonitor.Iterator`](https://developer.apple.com/documentation/network/nwpathmonitor/iterator)는 iOS 17부터 제공돼요. 기존 콜백을 반드시 직접 `AsyncStream`으로 감싸야 하는 것은 아니에요.

아래 모델은 호출한 비동기 작업이 살아 있는 동안 경로를 관찰해요. `defer`에서 이 호출이 만든 모니터만 정리하므로, 다음 관찰의 모니터를 잘못 취소하지 않아요.

```swift
import Network
import Observation

@MainActor
@Observable
final class NetworkStatusModel {
    private(set) var snapshot = NetworkSnapshot.unknown

    var message: String {
        switch snapshot.availability {
        case .unknown: "네트워크 상태 확인 중"
        case .unavailable: "현재 사용할 수 있는 경로가 없어요"
        case .needsConnection: "연결을 시작하면 경로가 활성화될 수 있어요"
        case .available:
            snapshot.isConstrained ? "저데이터 모드예요" : "사용 가능한 경로가 있어요"
        }
    }

    func observe() async {
        let monitor = NWPathMonitor()
        defer { monitor.cancel() }
        for await path in monitor {
            guard !Task.isCancelled else { break }
            snapshot = NetworkSnapshot(path: path)
        }
    }
}
```

비동기 반복을 사용할 때는 `pathUpdateHandler`와 `start(queue:)`를 함께 설치하지 않아요. 모니터 하나를 두 가지 소비 방식으로 동시에 다루지 않도록 수명을 단순하게 유지해요.

SwiftUI 화면에서는 모델을 `@State`에 보관하고 `.task`에서 직접 기다려요. 여기서 `@State`는 View의 값이 다시 만들어져도 같은 화면 정체성의 저장소를 유지하고, `.task`는 화면 수명에 연결된 비동기 작업을 시작해요.

```swift
import SwiftUI

@MainActor
struct NetworkStatusView: View {
    @State private var model = NetworkStatusModel()

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(model.message)
            Text("실제 요청의 성공 여부는 요청 결과로 확인해요.")
                .font(.caption)
        }
        .task { await model.observe() }
    }
}
```

이 예제는 화면마다 모델을 소유하고 한 관찰 작업을 연결해요. 앱 전체의 공통 배너라면 화면마다 새 모니터를 늘리지 말고 앱 범위의 소유자가 모델을 공유하는 구성을 검토해요. 취소 신호가 오더라도 실제 정리는 비동기 작업이 취소에 반응하며 이루어져요.

## 자동 다운로드 정책을 요청 정책과 분리해요

다음 정책은 **미리 받아 두는 선택적 데이터**에만 적용해요. 사용자가 직접 누른 핵심 요청을 무조건 차단하는 용도가 아니에요.

```swift
enum PrefetchDecision: Equatable {
    case waitForPath, deferForCost, allowed
}

func prefetchDecision(for snapshot: NetworkSnapshot) -> PrefetchDecision {
    guard snapshot.availability == .available else { return .waitForPath }
    if snapshot.isConstrained || snapshot.isExpensive { return .deferForCost }
    return .allowed
}
```

[`isExpensive`](https://developer.apple.com/documentation/network/nwpath/isexpensive)와 [`isConstrained`](https://developer.apple.com/documentation/network/nwpath/isconstrained)는 다른 정보예요. 비용이 큰 경로가 반드시 저데이터 모드인 것도, Wi-Fi가 언제나 비용이 낮은 것도 아니에요.

실제 전송의 제약은 가능하면 전송 API에도 전달해요. HTTP 자동 다운로드라면 URLSession 설정을 사용할 수 있어요.

```swift
import Foundation

func makePrefetchSession() -> URLSession {
    let configuration = URLSessionConfiguration.default
    configuration.waitsForConnectivity = true
    configuration.allowsExpensiveNetworkAccess = false
    configuration.allowsConstrainedNetworkAccess = false
    configuration.timeoutIntervalForResource = 300
    return URLSession(configuration: configuration)
}
```

이 세션은 비용·저데이터 모드 제약을 만족하는 연결을 기다리도록 구성한 예시예요. `waitsForConnectivity`는 연결 수립 단계의 대기 정책이지 이미 전송 중인 연결 단절을 무제한 복구하는 옵션이 아니에요. 불필요해진 세션은 소유자가 `invalidateAndCancel()` 또는 적절한 종료 메서드로 정리해요.

Network 직접 연결은 `NWParameters`의 관련 제약을 설정해요. 경로를 미리 읽고 비교하는 코드만으로 실제 전송이 같은 네트워크를 사용할 것이라고 보장할 수는 없어요.

## 정책은 가짜 값으로 테스트해요

아래 테스트는 실제 Wi-Fi나 셀룰러 환경 없이 실행할 수 있어요. Swift Testing 테스트 타깃에 앞의 값 타입과 정책 함수를 노출해요.

```swift
import Testing

@Test func unknownPathDoesNotStartPrefetch() {
    #expect(prefetchDecision(for: .unknown) == .waitForPath)
}

@Test func constrainedPathDefersPrefetch() {
    let snapshot = NetworkSnapshot(
        availability: .available, isExpensive: false, isConstrained: true
    )
    #expect(prefetchDecision(for: snapshot) == .deferForCost)
}

@Test func inexpensiveAvailablePathAllowsPrefetch() {
    let snapshot = NetworkSnapshot(
        availability: .available, isExpensive: false, isConstrained: false
    )
    #expect(prefetchDecision(for: snapshot) == .allowed)
}
```

이 테스트는 운영 정책만 검증해요. 실제 장비에서 Wi-Fi↔셀룰러 전환, 저데이터 모드, 개인용 핫스팟, 앱 복귀와 관찰 종료를 별도로 시험해야 해요. 공유기 연결은 유지한 채 인터넷만 끊긴 상황도 확인하면 “Wi-Fi면 요청 성공”이라는 가정을 찾기 좋아요.

## 적용 순서를 정리해요

1. 경로 안내가 필요한 이유를 정해요. 필요 없다면 모니터 없이 요청 오류만 처리해도 돼요.
2. 앱 전체인지 화면 단위인지 관찰의 소유 범위를 정해요.
3. 첫 업데이트 전에는 알 수 없는 상태를 표시해요.
4. UI 갱신과 전송 성공 판단을 분리해요.
5. 비용 정책은 작은 값·함수로 분리하고 테스트해요.
6. 취소·재관찰과 실제 네트워크 변화를 기기에서 확인해요.

## 면접에서 이어질 수 있는 질문

### satisfied면 인터넷이 된다고 표시해도 되나요

정확하게는 사용할 수 있는 경로가 있다는 뜻이에요. 목적지 서버까지의 성공을 확인한 것이 아니므로 UI 문구도 그 차이를 반영해야 해요.

### isExpensive와 isConstrained는 같은 값인가요

아니에요. 하나는 시스템이 판단한 네트워크 비용, 다른 하나는 저데이터 모드예요. 사용자 요청과 자동 다운로드의 정책도 따로 정할 수 있어요.

### NWPathMonitor로 로컬 네트워크 권한을 조회할 수 있나요

범용적인 권한 상태 조회 API로 사용할 수 없어요. 실제 로컬 작업의 오류와 앱의 권한 안내 흐름을 구분해 처리해야 해요. 자세한 내용은 [로컬 네트워크 문서](./bonjour-and-local-network.md)에서 다뤄요.

## 참고 자료

- [Apple Developer — NWPathMonitor](https://developer.apple.com/documentation/network/nwpathmonitor)
- [Apple Developer — NWPathMonitor.Iterator](https://developer.apple.com/documentation/network/nwpathmonitor/iterator)
- [Apple Developer — NWPath](https://developer.apple.com/documentation/network/nwpath)
- [Apple Developer — isExpensive](https://developer.apple.com/documentation/network/nwpath/isexpensive)
- [Apple Developer — isConstrained](https://developer.apple.com/documentation/network/nwpath/isconstrained)
- [Apple Developer — URLSessionConfiguration.waitsForConnectivity](https://developer.apple.com/documentation/foundation/urlsessionconfiguration/waitsforconnectivity)
- [Apple Developer — TN3151](https://developer.apple.com/documentation/technotes/tn3151-choosing-the-right-networking-api)
- [Apple Developer — TN3179: Understanding local network privacy](https://developer.apple.com/documentation/technotes/tn3179-understanding-local-network-privacy)
