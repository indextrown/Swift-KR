---
title: Mapbox Maps SDK 설치와 Access Token
description: Swift Package Manager로 Mapbox Maps SDK를 설치하고 공개·비밀 Access Token을 구분해 Info.plist와 빌드 환경에 안전하게 연결하는 방법을 설명합니다.
pageType: doc-wide
outline: false
---

# Mapbox Maps SDK 설치와 Access Token

> 면접용 한 줄 요약: **Mapbox 지도는 앱 시작 전에 읽기 권한의 공개 `pk` Token이 필요하며, 계정 변경 권한이 있는 비밀 `sk` Token은 서버·CI 같은 보호된 환경에만 두어야 합니다.**

## 먼저 알아둘 설치 용어

| 용어                       | 쉬운 뜻                                                                       |
| -------------------------- | ----------------------------------------------------------------------------- |
| Swift Package Manager(SPM) | Xcode가 Swift 패키지의 버전과 의존성을 내려받아 프로젝트에 연결하는 도구예요. |
| Access Token               | Mapbox 리소스 요청의 계정과 허용 동작을 식별하는 문자열이에요.                |
| Scope                      | `styles:read`, `downloads:read`처럼 Token에 허용한 작업 범위예요.             |
| `Info.plist`               | 앱의 설정과 권한 설명을 번들에 담는 속성 목록 파일이에요.                     |
| `.xcconfig`                | 빌드 구성별 값을 Xcode Build Setting으로 주입하는 텍스트 설정 파일이에요.     |

## 1단계: 지원 환경을 확인해요

2026년 8월에 확인한 [공식 Maps SDK 페이지](https://docs.mapbox.com/ios/maps/guides/)는 다음 요구 사항을 안내합니다.

- iOS 14 이상
- Swift 5.9 이상
- Maps SDK v11에는 Xcode 16 이상

현재 공식 문서의 버전은 `11.28.2`지만, 새 버전이 배포되면 달라질 수 있어요. 프로젝트가 선택한 버전의 [changelog](https://github.com/mapbox/mapbox-maps-ios/blob/main/CHANGELOG.md)와 Package Resolution을 기준으로 실제 지원 범위를 확인합니다.

## 2단계: SPM으로 패키지를 추가해요

Xcode에서 **File → Add Package Dependencies…**를 열고 공식 저장소 URL을 입력합니다.

```text
https://github.com/mapbox/mapbox-maps-ios.git
```

[공식 설치 가이드](https://docs.mapbox.com/ios/maps/guides/install/)는 `11.0.0`부터 **Up to Next Major Version** 규칙을 사용하는 방법을 예로 듭니다. 팀이 업데이트 전에 회귀 테스트를 거쳐야 한다면 Exact Version이나 별도 버전 고정 정책을 선택할 수 있어요.

소스 빌드 시간이 부담되면 공식 pre-built XCFramework 패키지도 검토할 수 있습니다.

```text
https://github.com/mapbox/mapbox-maps-ios-binary.git
```

공식 안내에 따르면 binary 배포는 `11.20.0`부터 제공되며 소스 저장소와 같은 버전 번호를 사용해요. 어느 배포 방식을 선택하든 앱 Target에 `MapboxMaps` 제품이 연결되었는지 확인합니다.

:::warning CocoaPods 신규 도입은 피하는 편이 좋아요
Mapbox는 2026년 12월에 Maps SDK for iOS의 CocoaPods 배포 지원을 종료할 예정이라고 안내합니다. 기존 프로젝트라면 마이그레이션 일정을 세우고, 새 프로젝트는 SPM을 우선 검토하세요.
:::

## 3단계: 앱 전용 공개 Token을 만들어요

Mapbox 계정의 Access Tokens 화면에서 앱과 환경을 구분한 공개 Token을 만들어요. 지도 Style과 글꼴을 읽으려면 보통 `styles:read`, `fonts:read` 같은 공개 scope가 필요합니다.

Token은 접두어와 권한에 따라 역할이 달라요.

| 종류      | 접두어 | 두는 위치                    | 대표 용도                                         |
| --------- | ------ | ---------------------------- | ------------------------------------------------- |
| Public    | `pk`   | 모바일 앱·웹 클라이언트      | Style, 글꼴, 공개 리소스 읽기                     |
| Secret    | `sk`   | 서버, 비밀 저장소, 보호된 CI | Style 쓰기, 업로드, Token 관리, 일부 SDK 다운로드 |
| Temporary | `tk`   | 짧은 서버 작업               | 최대 1시간처럼 제한된 임시 권한                   |

[공식 Token 관리 문서](https://docs.mapbox.com/accounts/guides/tokens/)는 비밀 scope가 있는 Token을 클라이언트에 노출하지 말고 서버에서만 사용하라고 설명합니다. 모바일 앱에 필요한 것은 공개 Token이에요.

:::danger `sk` Token은 `Info.plist`에 넣지 않아요
앱 번들과 설치된 바이너리는 사용자가 분석할 수 있습니다. `.xcconfig`나 난독화 문자열로 옮겨도 비밀 `sk` Token을 안전하게 숨길 수 없어요. 쓰기·관리 권한이 필요한 요청은 서버에서 수행하세요.
:::

## 4단계: `MBXAccessToken`을 설정해요

가장 단순한 방법은 앱 Target의 `Info.plist`에 공개 Token을 넣는 것입니다.

```xml
<key>MBXAccessToken</key>
<string>$(MAPBOX_PUBLIC_TOKEN)</string>
```

실제 값은 빌드 구성에서 주입할 수 있어요.

```text
// Config/Debug.xcconfig — 저장소에는 실제 값 대신 예시 파일만 둬요.
MAPBOX_PUBLIC_TOKEN = YOUR_PUBLIC_MAPBOX_ACCESS_TOKEN
```

`.xcconfig`를 사용하면 개발·스테이징·운영 값을 나누고 Git 실수를 줄일 수 있지만, 최종 앱에서 공개 Token 자체를 숨기는 보안 장치는 아니에요. 공개 Token은 최소 scope와 환경 분리, 사용량 모니터링, 교체 절차로 관리합니다.

오픈 소스 프로젝트라면 [모바일 Token 보관 공식 가이드](https://docs.mapbox.com/help/dive-deeper/private-access-token-android-and-ios/)처럼 실제 값을 버전 관리 밖의 파일에 두고 `.gitignore`로 제외하세요. 저장소에는 `Config.example.xcconfig`처럼 키 이름만 있는 예시를 남길 수 있습니다.

## 코드에서 주입할 수도 있어요

서버에서 공개 Token을 받아 교체하는 고급 구성이 필요하면 첫 `Map`이나 `MapView`를 만들기 전에 설정합니다.

```swift
import MapboxMaps
import SwiftUI

@main
struct MapSampleApp: App {
  init() {
    // 예제 값이에요. 실제 앱은 안전한 구성 계층에서 공개 Token을 읽어요.
    MapboxOptions.accessToken = "YOUR_PUBLIC_MAPBOX_ACCESS_TOKEN"
  }

  var body: some Scene {
    WindowGroup {
      ContentView()
    }
  }
}
```

`MapboxOptions.accessToken`은 Mapbox SDK들이 공유하는 설정이에요. 지도 생성 후에 값을 바꾸기보다 앱의 composition root에서 먼저 구성하세요.

## 첫 지도를 표시해요

Token과 패키지를 연결한 뒤 서울시청을 중심으로 지도를 띄워 봅니다.

```swift
import MapboxMaps
import SwiftUI

struct ContentView: View {
  private let seoulCityHall = CLLocationCoordinate2D(
    latitude: 37.5666,
    longitude: 126.9784
  )

  var body: some View {
    Map(
      initialViewport: .camera(
        center: seoulCityHall,
        zoom: 13,
        bearing: 0,
        pitch: 0
      )
    )
    .mapStyle(.standard)
    .ignoresSafeArea()
  }
}
```

빈 화면이 보이면 SwiftUI 레이아웃보다 먼저 Token과 Target 연결을 확인하세요.

## 설치용 비밀 Token이 등장하는 경우를 구분해요

과거 버전이나 특정 binary 다운로드 경로의 공식 troubleshooting은 `downloads:read` scope가 있는 비밀 Token을 `~/.netrc`나 CI secret에 두도록 안내할 수 있어요. 이 Token은 **SDK 파일을 받는 빌드 환경용**이며 지도 실행에 쓰는 공개 Token과 다릅니다.

```text
machine api.mapbox.com
  login mapbox
  password YOUR_SECRET_DOWNLOAD_TOKEN
```

이 예시는 위치와 형식만 보여 줍니다. 실제 `sk` 값을 저장소, PR, CI 로그에 남기면 안 돼요. 현재 공식 source SPM 저장소로 정상 설치된다면 불필요한 비밀 Token을 추가하지 않습니다.

## Token을 제한할 때 모바일의 특성을 알아둬요

Mapbox의 URL restriction은 웹 요청의 origin을 제한하는 기능입니다. [Tokens API 문서](https://docs.mapbox.com/api/accounts/tokens/)는 URL restriction을 추가한 Token이 native mobile SDK와 호환되지 않는다고 안내해요. iOS 앱 Token에는 웹 URL 제한을 그대로 적용하지 말고 다음 방어를 조합합니다.

- 앱·환경마다 별도 공개 Token을 발급해 영향 범위를 줄여요.
- 지도 표시와 관계없는 scope를 제거해요.
- Statistics에서 비정상 사용량을 확인해요.
- 문제가 생기면 새 Token 배포 후 이전 Token을 폐기해요.
- 쓰기·관리 기능은 비밀 Token을 가진 서버로 이동해요.

## 흔한 실패를 순서대로 진단해요

| 증상                          | 먼저 확인할 것                                                                           |
| ----------------------------- | ---------------------------------------------------------------------------------------- |
| `No such module 'MapboxMaps'` | 앱 Target에 `MapboxMaps` 제품이 연결되었는지 확인해요.                                   |
| 지도 타일이 비어 있음         | `MBXAccessToken` 이름, 공개 Token 값과 `styles:read` 권한을 확인해요.                    |
| package 다운로드 401          | 선택한 배포 경로의 공식 설치 안내가 `downloads:read` 비밀 Token을 요구하는지 확인해요.   |
| Simulator에서 실행되지 않음   | 실행 대상을 구체적인 iOS Simulator로 선택했는지 확인해요.                                |
| 운영에서만 실패               | Release `.xcconfig`가 `Info.plist` 변수에 연결되는지 Archive의 build setting을 확인해요. |

## 적용 순서를 정리해요

1. 선택할 SDK 버전의 iOS·Swift·Xcode 조건을 확인해요.
2. 공식 source 또는 binary SPM 패키지를 앱 Target에 연결해요.
3. 환경별 최소 scope의 공개 `pk` Token을 만들어요.
4. 실제 값은 버전 관리 밖에서 `MBXAccessToken`으로 주입해요.
5. 첫 지도 생성 전에 Token이 준비되는지 확인해요.
6. 비밀 `sk` Token은 서버·CI secret 밖으로 나오지 않게 해요.
7. 실제 기기와 Release 구성에서도 지도 로드와 attribution을 점검해요.

## 면접에서 이어질 수 있는 질문

### 공개 Token을 Git에 커밋해도 괜찮나요?

공개 Token은 클라이언트 사용을 전제로 하므로 최종 앱에서 완전히 숨길 수는 없지만, 저장소에 직접 커밋할 이유는 없습니다. 환경별 최소 권한 Token을 버전 관리 밖에서 주입하면 실수와 교체 범위를 줄일 수 있어요.

### `Info.plist`와 `MapboxOptions.accessToken` 중 무엇을 선택하나요?

고정된 앱 구성이면 `MBXAccessToken`이 가장 단순합니다. 서버에서 공개 Token을 받아 회전시키는 등 런타임 구성이 필요하면 첫 지도 생성 전에 `MapboxOptions.accessToken`을 설정하되, 초기화 실패와 오프라인 시작 정책까지 함께 설계해야 해요.

### `downloads:read` Token과 지도 실행 Token은 같은가요?

아니요. `downloads:read`는 일부 SDK 배포물을 내려받는 빌드 환경용 비밀 권한이고, 지도 실행에는 공개 읽기 Token을 사용합니다. 비밀 다운로드 Token을 앱에 포함하면 안 됩니다.

## 참고 자료

- [Mapbox Maps SDK for iOS 설치 가이드](https://docs.mapbox.com/ios/maps/guides/install/)
- [Mapbox Maps SDK for iOS 요구 사항](https://docs.mapbox.com/ios/maps/guides/)
- [Mapbox Token 관리](https://docs.mapbox.com/accounts/guides/tokens/)
- [Mapbox Access Tokens 설명](https://docs.mapbox.com/help/dive-deeper/access-tokens/)
- [오픈 소스 모바일 앱의 Token 보관](https://docs.mapbox.com/help/dive-deeper/private-access-token-android-and-ios/)
- [iOS SDK 설치 문제 해결](https://docs.mapbox.com/help/troubleshooting/ios-sdk-installation/)
- [Mapbox Maps SDK 공식 저장소](https://github.com/mapbox/mapbox-maps-ios)
