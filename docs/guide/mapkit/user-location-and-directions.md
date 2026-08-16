---
title: MapKit 사용자 위치와 경로
description: Core Location 최소 권한으로 MapKit 사용자 위치를 표시하고 MKDirections의 경로·예상 시간·Polyline을 취소 가능한 비동기 흐름으로 연결합니다.
pageType: doc-wide
outline: false
---

# MapKit 사용자 위치와 경로

> 면접용 한 줄 요약: **MapKit은 위치를 지도에 표현하고 경로를 계산하지만, 사용자 위치의 권한·정확도·업데이트는 Core Location이 담당하며 위치 표시와 카메라 추적도 별도 상태입니다.**

## 네 가지 책임을 먼저 분리해요

```text
Core Location
  ├─ 위치 권한과 정확도
  └─ 현재 CLLocation 전달

MapKit
  ├─ UserAnnotation으로 위치 표현
  ├─ MapCameraPosition으로 카메라 추적
  ├─ MKDirections로 경로 계산
  └─ MapPolyline으로 경로 표현
```

지도의 파란 점이 보이는 것, 카메라가 그 점을 따라가는 것, 출발지로 사용하는 것은 서로 다른 결정이에요.

## 1단계: 기능에 필요한 최소 권한을 설명해요

앱을 사용하는 동안 현재 위치에서 목적지까지 경로를 보여 준다면 `Info.plist`에 When In Use 목적 문구를 추가합니다.

```xml
<key>NSLocationWhenInUseUsageDescription</key>
<string>현재 위치에서 선택한 장소까지의 경로를 안내하기 위해 위치를 사용합니다.</string>
```

위치가 필요하지 않은 지도 화면에서 앱 시작 즉시 요청하지 마세요. 사용자가 “내 위치”나 “여기서 출발”을 선택한 직후 요청하면 권한의 가치를 이해하기 쉽습니다.

:::warning Always 권한은 지도 화면의 기본 설정이 아니에요
백그라운드에서도 지속적으로 위치를 처리해야 하는 실제 기능이 있을 때만 Always 권한과 background mode를 검토합니다. 일반적인 지도 표시와 foreground 경로 탐색은 When In Use부터 시작해요.
:::

## 2단계: 권한 상태를 한곳에서 관리해요

```swift
import Combine
import CoreLocation

@MainActor
final class LocationPermissionModel: NSObject, ObservableObject {
  @Published private(set) var authorizationStatus: CLAuthorizationStatus

  private let manager = CLLocationManager()

  override init() {
    authorizationStatus = manager.authorizationStatus
    super.init()
    manager.delegate = self
  }

  func requestWhenInUse() {
    manager.requestWhenInUseAuthorization()
  }
}

extension LocationPermissionModel: CLLocationManagerDelegate {
  func locationManagerDidChangeAuthorization(_ manager: CLLocationManager) {
    authorizationStatus = manager.authorizationStatus
  }
}
```

`.denied`나 `.restricted` 상태에서 요청 메서드를 반복 호출해도 시스템 prompt가 다시 나타나지 않습니다. 설정 안내와 주소 검색, 지도 직접 선택 같은 대체 흐름을 제공하세요.

## 3단계: 위치 표시와 추적을 선언해요

```swift
struct UserLocationMap: View {
  @State private var position: MapCameraPosition = .userLocation(
    followsHeading: false,
    fallback: .region(
      MKCoordinateRegion(
        center: .init(latitude: 37.5666, longitude: 126.9784),
        span: .init(latitudeDelta: 0.1, longitudeDelta: 0.1)
      )
    )
  )

  var body: some View {
    Map(position: $position) {
      UserAnnotation()
    }
    .mapControls {
      MapUserLocationButton()
      MapCompass()
    }
  }
}
```

`UserAnnotation()`은 위치를 표현하고 `.userLocation(...)` position은 카메라가 위치를 따라가게 합니다. 권한이 없거나 아직 위치를 얻지 못하면 fallback을 사용해 빈 세계 지도에서 시작하지 않아요.

사용자가 지도를 드래그하면 추적이 풀릴 수 있습니다. 즉시 다시 사용자 위치로 강제 이동하지 말고 내 위치 버튼을 눌렀을 때만 추적을 재개해 사용자의 탐색 의도를 존중하세요.

## 권한과 정확도별 대체 UI를 준비해요

| 상태                     | 권장 동작                                                     |
| ------------------------ | ------------------------------------------------------------- |
| `.notDetermined`         | 기능을 설명한 뒤 사용자 액션에서 요청해요.                    |
| `.authorizedWhenInUse`   | 사용자 위치와 출발지 기능을 활성화해요.                       |
| reduced accuracy         | 대략적인 주변 기능은 유지하고 정밀 지점 선택 대안을 제공해요. |
| `.denied`, `.restricted` | 설정 안내와 수동 주소·핀 선택을 제공해요.                     |
| 신호 대기                | 마지막 위치를 현재 위치라고 단정하지 말고 loading을 표시해요. |

Simulator에서는 **Debug → Location**에서 테스트 좌표나 GPX 경로를 선택해야 실제 위치 흐름을 확인할 수 있어요.

## 4단계: 출발지와 목적지로 경로를 요청해요

```swift
import Combine
import MapKit

@MainActor
final class DirectionsModel: ObservableObject {
  @Published private(set) var route: MKRoute?
  @Published private(set) var errorMessage: String?

  private var activeDirections: MKDirections?

  func calculate(to destination: MKMapItem) async {
    activeDirections?.cancel()

    let request = MKDirections.Request()
    request.source = .forCurrentLocation()
    request.destination = destination
    request.transportType = .automobile
    request.requestsAlternateRoutes = true

    let directions = MKDirections(request: request)
    activeDirections = directions

    do {
      let response = try await directions.calculate()
      guard activeDirections === directions else { return }
      route = response.routes.first
      errorMessage = route == nil ? "이동 가능한 경로가 없습니다." : nil
    } catch is CancellationError {
      // 새 목적지를 선택한 정상 흐름이에요.
    } catch {
      guard activeDirections === directions else { return }
      route = nil
      errorMessage = "경로를 계산하지 못했습니다."
    }
  }
}
```

`MKDirections` 한 인스턴스는 한 요청을 담당합니다. 목적지가 바뀌면 이전 요청을 취소하고 새 인스턴스를 만들어요. 짧은 시간에 너무 많은 요청을 보내면 `MKError.Code.loadingThrottled`가 발생할 수 있으므로 지도 이동이나 위치 update마다 재계산하지 않습니다.

## 5단계: 경로와 전체 영역을 지도에 표시해요

```swift
struct RouteMap: View {
  let destination: MKMapItem
  let route: MKRoute?

  @State private var position: MapCameraPosition = .automatic

  var body: some View {
    Map(position: $position) {
      UserAnnotation()
      Marker(item: destination)

      if let route {
        MapPolyline(route)
          .stroke(.blue, style: .init(lineWidth: 7, lineCap: .round))
      }
    }
    .onChange(of: route) { _, newRoute in
      guard let newRoute else { return }
      withAnimation {
        position = .rect(newRoute.polyline.boundingMapRect)
      }
    }
  }
}
```

하단 시트가 지도 일부를 가리면 route의 bounding rect만 맞추지 말고 safe area나 UIKit의 edge padding을 고려합니다. 출발·도착 Marker와 Polyline이 모두 실제 가시 영역에 들어와야 해요.

## 경로 결과에서 무엇을 사용할 수 있나요?

| 속성                 | 의미                                                               |
| -------------------- | ------------------------------------------------------------------ |
| `distance`           | 전체 이동 거리예요. 미터 단위라 `MeasurementFormatter`로 표시해요. |
| `expectedTravelTime` | 예상 이동 시간이에요. 교통 상황과 요청 시점에 따라 바뀔 수 있어요. |
| `polyline`           | 지도에 그릴 경로의 지리 형태예요.                                  |
| `steps`              | 구간별 안내, 거리와 polyline이에요.                                |
| `advisoryNotices`    | 경로와 관련된 주의 문구예요.                                       |

예상 시간은 저장된 상수가 아니므로 오래 캐시한 값을 현재 시간처럼 보여 주지 않습니다. alternate route를 요청했다면 시간만 비교하지 말고 거리, 통행 제한, 사용자 선택을 함께 보여 주세요.

## `MKDirections`와 턴 바이 턴 내비게이션은 달라요

`MKDirections`는 경로 데이터와 단계 정보를 계산하지만 자동차 내비게이션 앱의 전체 주행 세션, 경로 이탈 재탐색, 음성 안내, 잠금 화면 경험을 자동으로 제공하지 않습니다.

요구 사항에 따라 다음 중 하나를 선택해요.

- 앱 안에서 간단한 경로와 예상 시간을 보여 줘요.
- `MKMapItem.openInMaps`로 Apple Maps 앱에 목적지를 넘겨 실제 안내를 시작해요.
- 자체 navigation app을 만든다면 위치 업데이트, 재탐색, 안전 UI와 관련 capability·정책을 별도 설계해요.

```swift
destination.openInMaps(
  launchOptions: [
    MKLaunchOptionsDirectionsModeKey: MKLaunchOptionsDirectionsModeDriving
  ]
)
```

## 체크리스트

- [ ] 지도 표시와 실제 위치 접근 권한을 구분했나요?
- [ ] 사용자 동작 직후 최소 권한을 요청하나요?
- [ ] denied·reduced accuracy 상태에서 수동 선택이 가능한가요?
- [ ] 목적지가 바뀌면 이전 `MKDirections`를 취소하나요?
- [ ] 위치 update마다 경로를 무조건 재계산하지 않나요?
- [ ] route 없음, network 오류와 throttling을 사용자에게 구분해 처리하나요?

## 면접에서 이어질 수 있는 질문

### `UserAnnotation`을 추가하면 카메라도 자동으로 따라가나요?

아니요. `UserAnnotation`은 위치 표시이고 카메라 추적은 `.userLocation` `MapCameraPosition`이 담당합니다. 권한, 위치 표시, 카메라 추적을 각각 설계해야 해요.

### `MKDirections`는 내비게이션 SDK인가요?

출발지와 목적지 사이의 경로, 예상 시간, 단계와 geometry를 제공하지만 완전한 주행 세션 UI를 만들어 주지는 않습니다. 앱 안의 경로 표시와 Apple Maps로 안내 넘기기를 요구에 맞게 구분해요.

## 참고 자료

- [Core Location 위치 권한 공식 문서](https://developer.apple.com/documentation/corelocation/requesting-authorization-to-use-location-services)
- [UserAnnotation 공식 문서](https://developer.apple.com/documentation/mapkit/userannotation)
- [MapUserLocationButton 공식 문서](https://developer.apple.com/documentation/mapkit/mapuserlocationbutton)
- [MKDirections 공식 문서](https://developer.apple.com/documentation/mapkit/mkdirections)
- [MKRoute 공식 문서](https://developer.apple.com/documentation/mapkit/mkroute)
