---
title: Naver Maps iOS SDK 설치와 인증
description: NAVER Cloud Platform 애플리케이션 등록부터 SPM·CocoaPods 설치, NCP Key ID 설정과 401·429·800 인증 오류 진단까지 단계별로 설명합니다.
pageType: doc-wide
outline: false
---

# Naver Maps iOS SDK 설치와 인증

> 면접용 한 줄 요약: **SDK 설치만으로 지도 인증이 끝나는 것은 아니며, NCP에서 Dynamic Map과 Bundle ID를 등록하고 `NMFNcpKeyId`를 앱 시작 시점에 설정해야 합니다.**

## 준비물과 용어

| 용어             | 역할                                                                                  |
| ---------------- | ------------------------------------------------------------------------------------- |
| NCP 애플리케이션 | Maps 상품과 인증 정보를 묶어 관리하는 단위예요.                                       |
| Dynamic Map      | iOS 앱 안에 동적 벡터 지도를 표시하는 상품이에요.                                     |
| Bundle ID        | `com.example.MyApp`처럼 앱을 식별하며, 등록된 앱의 요청인지 확인하는 제한 조건이에요. |
| `NMFNcpKeyId`    | iOS SDK가 인증에 사용할 NCP Key ID를 읽는 `Info.plist` 키예요.                        |

## 1단계: NCP 애플리케이션을 등록해요

[공식 시작 가이드](https://navermaps.github.io/ios-map-sdk/guide-ko/1.html)의 순서는 다음과 같아요.

1. NAVER Cloud Platform 콘솔에서 **Services → Application Services → Maps**로 이동해요.
2. 새 Application을 등록하고 **Dynamic Map**을 선택해요.
3. iOS 앱의 실제 Bundle ID를 등록해요.
4. 인증 정보에서 NCP Key ID를 확인해요.

개발·스테이징·운영 앱의 Bundle ID가 다르면 모두 등록 여부를 확인해야 합니다. `PRODUCT_BUNDLE_IDENTIFIER`가 빌드 구성마다 바뀌는데 운영 Bundle ID 하나만 등록하면 디버그 빌드에서 401 오류가 날 수 있어요.

## 2단계: SDK를 설치해요

### Swift Package Manager

Xcode에서 **File → Add Package Dependencies**를 선택하고 다음 공식 패키지 URL을 입력해요.

```text
https://github.com/navermaps/SPM-NMapsMap
```

버전 규칙은 무조건 최신을 선택하기보다 팀의 업데이트 정책에 맞춰 정하세요. 버전을 올릴 때는 [SDK 변경 내역](https://github.com/navermaps/ios-map-sdk/blob/master/CHANGELOG.md)을 확인합니다.

:::warning 최소 iOS 버전은 선택한 태그에서 확인해요
2026년 8월에 확인한 3.23.3 태그의 `Package.swift`는 iOS 12 이상을 선언합니다. 공식 웹 가이드의 오래된 설치 조건과 다를 수 있으므로, 프로젝트가 실제로 선택한 태그의 [`Package.swift`](https://github.com/navermaps/SPM-NMapsMap/blob/3.23.3/Package.swift)를 기준으로 판단하세요.
:::

### CocoaPods

공식 가이드의 Pod 이름은 `NMapsMap`이에요.

```ruby
platform :ios, '12.0'

target 'MapSample' do
  use_frameworks!
  pod 'NMapsMap'
end
```

```bash
pod install
```

CocoaPods를 사용했다면 `.xcodeproj`가 아니라 생성된 `.xcworkspace`를 열어야 해요. 최소 버전은 위 예시의 값을 그대로 복사하지 말고, 설치할 SDK 버전과 앱 정책을 함께 확인해 결정합니다.

## 3단계: NCP Key ID를 설정해요

### 방법 A: `Info.plist`

```xml
<key>NMFNcpKeyId</key>
<string>YOUR_NCP_KEY_ID</string>
```

SDK가 지도 뷰를 초기화할 때 이 값을 읽으므로 가장 단순한 방법이에요. 값이 환경마다 다르면 `.xcconfig` 변수를 `Info.plist`에 주입할 수 있습니다.

```text
// Debug.xcconfig
NAVER_MAP_NCP_KEY_ID = your_debug_key_id
```

```xml
<key>NMFNcpKeyId</key>
<string>$(NAVER_MAP_NCP_KEY_ID)</string>
```

`.xcconfig`로 옮겨도 빌드된 앱 안에서 값 자체가 사라지는 것은 아니에요. 이 값은 등록한 Bundle ID로 사용 범위를 제한하고, 저장소에는 실제 운영 값을 커밋하지 않는 방식으로 관리하세요.

### 방법 B: 앱 시작 시점에 코드로 설정해요

```swift
import NMapsMap
import UIKit

final class AppDelegate: NSObject, UIApplicationDelegate {
  func application(
    _ application: UIApplication,
    didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil
  ) -> Bool {
    NMFAuthManager.shared().ncpKeyId = "YOUR_NCP_KEY_ID"
    return true
  }
}
```

SwiftUI 생명 주기에서는 `UIApplicationDelegateAdaptor`로 연결할 수 있어요.

```swift
import SwiftUI

@main
struct MapSampleApp: App {
  @UIApplicationDelegateAdaptor(AppDelegate.self) private var appDelegate

  var body: some Scene {
    WindowGroup {
      ContentView()
    }
  }
}
```

중요한 것은 **첫 지도 뷰가 만들어지기 전에** 설정하는 것입니다. `ContentView.onAppear`처럼 지도 생성보다 늦을 수 있는 위치는 피하세요.

## 인증 결과를 관찰해요

`NMFAuthManager.delegate`는 약한 참조이므로, 델리게이트 객체를 강하게 보관해야 합니다.

```swift
import NMapsMap

final class MapAuthenticationObserver: NSObject, NMFAuthManagerDelegate {
  func authorized(_ state: NMFAuthState, error: (any Error)?) {
    if let error {
      print("지도 인증 실패: \(error.localizedDescription)")
      return
    }

    print("지도 인증 상태: \(state)")
  }
}

final class MapBootstrap {
  private let observer = MapAuthenticationObserver()

  func configure(keyID: String) {
    let manager = NMFAuthManager.shared()
    manager.ncpKeyId = keyID
    manager.delegate = observer
  }
}
```

운영 앱에서는 콘솔 로그만 남기기보다 오류 코드, 앱 버전, Bundle ID, 네트워크 상태를 개인정보 없이 수집해 진단 가능하게 만드는 편이 좋아요. 실제 NCP Key ID 전체 값은 로그에 기록하지 않습니다.

## 오류 코드로 원인을 좁혀요

[공식 시작 가이드의 인증 오류 표](https://navermaps.github.io/ios-map-sdk/guide-ko/1.html)를 기준으로 먼저 다음 항목을 확인하세요.

| 상태 코드 | 대표 원인                                  | 확인 순서                                                             |
| --------- | ------------------------------------------ | --------------------------------------------------------------------- |
| 800       | NCP Key ID가 지정되지 않음                 | `NMFNcpKeyId` 철자, Target Membership, 앱 시작 시 설정 순서           |
| 401       | 잘못된 Key ID 또는 등록되지 않은 Bundle ID | 실행 중인 `Bundle.main.bundleIdentifier`, NCP 등록 값, 개발·운영 환경 |
| 429       | Dynamic Map 미선택 또는 사용량 한도 초과   | Maps 상품 선택, 이용량·쿼터, 결제 상태                                |

```swift
let actualBundleID = Bundle.main.bundleIdentifier ?? "unknown"
print("실행 중인 Bundle ID: \(actualBundleID)")
```

오류가 날 때는 코드를 계속 바꾸기보다 다음 순서로 진단해요.

1. 현재 Target이 SDK를 링크하고 `import NMapsMap`이 되는지 확인해요.
2. 실행 중인 Bundle ID와 NCP 콘솔 등록 값을 문자 단위로 비교해요.
3. `NMFNcpKeyId`가 지도 생성 전에 설정됐는지 확인해요.
4. Dynamic Map 선택과 쿼터를 확인해요.
5. 프록시·VPN을 끈 네트워크와 실제 기기에서도 재현되는지 확인해요.

## Client Secret과 혼동하지 않아요

| 값                          | 사용 위치                        | 앱 번들 포함                         |
| --------------------------- | -------------------------------- | ------------------------------------ |
| 모바일 지도용 NCP Key ID    | `NMFNcpKeyId` 또는 `ncpKeyId`    | 필요하지만 Bundle ID 제한을 설정해요 |
| Maps REST API Client Secret | 우리 서버가 REST API를 호출할 때 | 포함하지 않아요                      |

앱에 들어간 문자열은 결국 추출될 수 있습니다. Client Secret이 필요한 Geocoding이나 Directions 요청은 서버로 옮기고, 서버에 인증·호출 제한·레이트 리밋을 적용하세요.

## 체크리스트

- [ ] NCP 애플리케이션에서 Dynamic Map을 선택했나요?
- [ ] 현재 빌드 구성의 Bundle ID를 등록했나요?
- [ ] SDK 버전의 최소 iOS 조건을 확인했나요?
- [ ] 첫 지도 뷰 생성 전에 NCP Key ID를 설정했나요?
- [ ] 인증 델리게이트 객체를 강하게 보관했나요?
- [ ] 실제 Key ID와 Client Secret을 로그나 저장소에 남기지 않았나요?

## 면접에서 이어질 수 있는 질문

### 왜 `Info.plist`의 Key ID를 완전한 비밀로 볼 수 없나요?

앱 번들은 사용자 기기에 배포되므로 내부 문자열을 추출할 수 있기 때문입니다. 모바일 지도 키는 Bundle ID 제한으로 오용 범위를 줄이고, 진짜 비밀인 REST API Client Secret은 서버에만 보관해야 합니다.

### 인증 델리게이트가 호출되지 않는 원인은 무엇일 수 있나요?

델리게이트 속성이 약한 참조인데 관찰자 객체를 지역 변수로만 만들면 즉시 해제될 수 있습니다. 강한 프로퍼티로 보관하고, 지도 인증이 시작되기 전에 등록했는지 확인해야 해요.

## 참고 자료

- [NAVER Maps iOS SDK 시작하기](https://navermaps.github.io/ios-map-sdk/guide-ko/1.html)
- [`NMFAuthManager` API Reference](https://navermaps.github.io/ios-map-sdk/reference/Classes/NMFAuthManager.html)
- [`NMFAuthManagerDelegate` API Reference](https://navermaps.github.io/ios-map-sdk/reference/Protocols/NMFAuthManagerDelegate.html)
- [SPM-NMapsMap 공식 패키지](https://github.com/navermaps/SPM-NMapsMap)
- [NAVER Maps 애플리케이션 사용 가이드](https://guide.ncloud-docs.com/docs/en/maps-app/)
