---
title: Mapbox 설치와 첫 지도
description: Mapbox Maps SDK를 Swift Package Manager로 연결하고 공개 토큰을 구성한 뒤 SwiftUI와 UIKit에서 첫 지도를 표시하며 설치 실패를 구분하는 방법을 정리해요.
source: https://docs.mapbox.com/ios/maps/guides/install/
reviewed: '2026-08-31'
---

# Mapbox 설치와 첫 지도

> **면접 답변 한 줄 요약:** Mapbox 설치는 SDK 의존성과 공개 토큰을 앱에 연결한 뒤 지도 화면을 초기화하는 과정이에요.

공식 [Get Started](https://docs.mapbox.com/ios/maps/guides/install/)에 대응해요. 토큰을 발급받거나 외부 지도를 호출하지 않고도 먼저 Target 연결과 코드 구성을 검토할 수 있어요.

## 먼저 알아둘 용어

| 용어        | 쉬운 뜻                                                            |
| ----------- | ------------------------------------------------------------------ |
| SPM         | Swift Package Manager의 약자로, 패키지와 버전을 연결하는 도구예요. |
| Target      | 앱·위젯처럼 독립적으로 빌드하는 결과물 단위예요.                   |
| 공개 토큰   | 클라이언트가 Mapbox 리소스를 읽는 데 사용하는 권한 값이에요.       |
| XCFramework | 플랫폼별 프레임워크 바이너리를 묶은 배포 형식이에요.               |

## 의존성과 인증 실패를 분리해요

Xcode의 **File → Add Package Dependencies…**에서 공식 소스 패키지를 추가하고 앱 Target에 `MapboxMaps`를 연결해요.

```text
https://github.com/mapbox/mapbox-maps-ios.git
```

확인일의 버전은 `11.29.1`이에요. 업데이트를 자동 수용할지 정확한 버전을 고정할지는 팀 정책으로 정해요. 공식 binary 패키지 `mapbox-maps-ios-binary.git`은 소스 빌드 시간을 줄이는 대안이에요.

:::warning 배포 방식의 수명이 달라요
공식 가이드는 2026년 12월 CocoaPods 지원 종료를 예고해요. 기존 프로젝트는 SPM 전환 일정을 확인하세요. 직접 다운로드 방식은 프레임워크 추가·임베딩·서명 설정을 직접 관리해야 해요.
:::

## 첫 지도보다 토큰 구성이 먼저예요

Mapbox 계정에서 준비한 공개 토큰을 앱의 `Info.plist`에 연결해요. 아래는 실제 비밀값이 아닌 빌드 설정 자리표시자예요.

```xml
<key>MBXAccessToken</key>
<string>$(MAPBOX_PUBLIC_TOKEN)</string>
```

코드로 설정한다면 첫 `Map`·`MapView` 생성 전에 `MapboxOptions.accessToken`을 지정해요. 공개 토큰을 빌드 설정으로 옮기는 것은 환경 분리 방법이지, 최종 앱에서 추출을 막는 방법은 아니에요. 비밀 다운로드 토큰은 앱에 넣지 않아요. 자세한 구성은 [기존 토큰 가이드](./installation-and-access-token.md)에서 이어 볼 수 있어요.

## SwiftUI에서는 지도를 화면 값으로 선언해요

이 예제는 별도 이미지 없이 서울의 초기 영역을 보여 줘요. MapKit의 같은 이름과 혼동하지 않도록 모듈을 표시했어요.

```swift
import SwiftUI
import MapboxMaps

@MainActor
struct FirstMapScreen: View {
    var body: some View {
        MapboxMaps.Map(initialViewport: .camera(
            center: CLLocationCoordinate2D(latitude: 37.57, longitude: 126.98),
            zoom: 12
        ))
        .mapStyle(.standard)
    }
}
```

처음 보이는 영역만 정했어요. 사용자가 이동할 때마다 초기 좌표로 되돌리는 코드가 필요하다는 뜻은 아니에요.

## UIKit에서는 뷰 계층에 지도를 배치해요

화면 크기 변경에 대응하도록 Auto Layout을 사용한 독립 예제예요.

```swift
import UIKit
import MapboxMaps

@MainActor
final class FirstMapController: UIViewController {
    override func viewDidLoad() {
        super.viewDidLoad()
        let map = MapView(frame: .zero)
        map.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(map)
        NSLayoutConstraint.activate([
            map.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            map.trailingAnchor.constraint(equalTo: view.trailingAnchor),
            map.topAnchor.constraint(equalTo: view.topAnchor),
            map.bottomAnchor.constraint(equalTo: view.bottomAnchor)
        ])
        map.mapboxMap.setCamera(to: CameraOptions(
            center: CLLocationCoordinate2D(latitude: 37.57, longitude: 126.98),
            zoom: 12
        ))
    }
}
```

이제 화면에 공간을 배정하는 책임과 지도 내용을 불러오는 책임이 분리됐어요. 위치 권한을 요청하는 기능은 아직 없어요.

## 실패를 단계별로 확인해요

| 실패                             | 첫 확인 지점                           |
| -------------------------------- | -------------------------------------- |
| 모듈을 찾지 못함                 | 앱 Target에 패키지 제품이 연결됐는지   |
| 지도 영역 자체가 없음            | 뷰 크기와 제약 조건                    |
| 영역은 있지만 데이터가 비어 있음 | 토큰·네트워크·스타일 로드 오류         |
| 특정 빌드 구성만 실패            | Release 설정의 토큰 치환과 패키지 버전 |

위 순서는 학습용 진단 제안이에요. 실패했다고 바로 토큰을 다시 발급하기 전에 어떤 단계가 성공했는지 기록하세요.

## 적용 체크리스트

- [ ] SDK·Xcode·배포 대상을 함께 기록했나요?
- [ ] 실제 토큰 없이 예제 코드를 공유하나요?
- [ ] 구체적인 iOS 실행 대상에서 화면을 검증했나요?
- [ ] attribution 표시를 유지했나요?

## 면접에서 이어질 수 있는 질문

### SPM과 binary 패키지는 다른 지도 엔진인가요

주된 차이는 배포·빌드 방식이에요. 선택한 버전과 포함 제품을 비교해야 해요.

### 화면이 비면 무조건 인증 문제인가요

아니에요. 레이아웃, 네트워크와 스타일 오류도 분리해서 확인해요.

### 설치가 끝나면 위치도 표시되나요

위치 표현과 권한은 별도 기능이에요. 다음 [사용자 위치](./user-location.md)로 이어가세요.

## 참고 자료

- [Get Started](https://docs.mapbox.com/ios/maps/guides/install/)
- [지원 환경](https://docs.mapbox.com/ios/maps/guides/)
- [11.29.1 Package.swift](https://github.com/mapbox/mapbox-maps-ios/blob/11.29.1/Package.swift)
