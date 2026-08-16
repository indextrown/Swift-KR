---
title: 네이버 지도 사용자 위치와 권한
description: 최신 코어 로케이션 권한 정책에 맞춰 앱 사용 중 위치 권한을 요청하고, 내장 위치 추적 모드와 NMFLocationOverlay 직접 갱신 방식을 비교해 구현합니다.
pageType: doc-wide
outline: false
---

# 네이버 지도 사용자 위치와 권한

> 면접용 한 줄 요약: **네이버 지도 SDK는 기본적으로 위치를 사용하지 않으며, 기능을 실행하는 순간 최소 권한을 요청한 뒤 내장 추적 모드 또는 단일 위치 오버레이를 선택해 표시합니다.**

## 세 가지 책임을 구분해요

```text
코어 로케이션 권한
  └─ 사용자가 위치 접근을 허용했는가?

위치 제공자
  └─ 현재 좌표·정확도·방향을 누가 갱신하는가?

네이버 지도 표현
  └─ 위치 오버레이와 카메라를 어떻게 보여주는가?
```

지도 SDK를 설치했다고 위치 권한이 자동으로 생기지는 않아요. [NAVER 위치 가이드](https://navermaps.github.io/ios-map-sdk/guide-ko/4-2.html)도 SDK가 기본적으로 위치 정보를 사용하지 않는다고 설명합니다.

## 앱을 사용하는 동안의 위치 권한을 선택해요

지도를 보는 동안 주변 장소를 보여주는 기능이라면 `Info.plist`에 목적 문자열을 추가합니다.

```xml
<key>NSLocationWhenInUseUsageDescription</key>
<string>현재 위치 주변의 장소를 지도에 표시하기 위해 위치가 필요합니다.</string>
```

목적 문자열은 “서비스 제공을 위해 필요합니다”처럼 추상적으로 쓰기보다 **어떤 기능에서 어떤 이점을 주는지** 사용자가 이해할 수 있게 적으세요.

:::warning 오래된 Always 키 예제를 그대로 복사하지 않아요
NAVER 위치 가이드에는 과거의 `NSLocationAlwaysUsageDescription` 예제가 남아 있지만, 이 키는 현재 Apple SDK에서 폐기된 키예요. Apple의 [위치 서비스 권한 요청 가이드](https://developer.apple.com/documentation/corelocation/requesting-authorization-to-use-location-services)에 따라 화면 사용 중 기능은 `NSLocationWhenInUseUsageDescription`을 우선 사용하세요. 실제 백그라운드 위치가 제품의 핵심일 때만 더 강한 권한과 Background Modes를 별도로 설계합니다.
:::

Always 권한이 정말 필요하다면 현재는 `NSLocationWhenInUseUsageDescription`과 `NSLocationAlwaysAndWhenInUseUsageDescription`을 요구 사항에 맞게 구성해야 해요. 단순 지도 화면을 위해 Always를 요청하면 권한 거부 가능성과 개인정보 부담만 커집니다.

## 권한은 기능을 누른 시점에 요청해요

앱 시작 직후 설명 없이 권한 팝업을 띄우기보다 “내 위치” 버튼처럼 맥락이 생긴 순간 요청하세요.

```swift
import CoreLocation

final class LocationPermissionController: NSObject, CLLocationManagerDelegate {
  private let manager = CLLocationManager()
  var onAuthorized: (() -> Void)?
  var onDenied: (() -> Void)?

  override init() {
    super.init()
    manager.delegate = self
  }

  func requestWhenInUse() {
    switch manager.authorizationStatus {
    case .notDetermined:
      manager.requestWhenInUseAuthorization()
    case .authorizedWhenInUse, .authorizedAlways:
      onAuthorized?()
    case .denied, .restricted:
      onDenied?()
    @unknown default:
      onDenied?()
    }
  }

  func locationManagerDidChangeAuthorization(_ manager: CLLocationManager) {
    switch manager.authorizationStatus {
    case .authorizedWhenInUse, .authorizedAlways:
      onAuthorized?()
    case .denied, .restricted:
      onDenied?()
    case .notDetermined:
      break
    @unknown default:
      onDenied?()
    }
  }
}
```

거부 상태에서는 권한 요청 팝업을 반복해서 띄울 수 없어요. 기능이 왜 필요한지 설명하고 사용자가 원할 때 설정 앱으로 이동할 수 있는 선택지를 제공하되, 권한 없이도 지도를 탐색하거나 주소를 검색할 수 있게 대체 흐름을 남겨두세요.

## 내장 위치 추적 모드를 사용해요

SDK가 제공하는 현재 위치 버튼과 카메라 추적을 빠르게 연결할 때 적합합니다.

```swift
naverMapView.showLocationButton = true
naverMapView.positionMode = .direction
```

| 모드         | 위치 오버레이    | 카메라 중심               | 카메라 방향             |
| ------------ | ---------------- | ------------------------- | ----------------------- |
| `.disabled`  | 추적하지 않음    | 유지                      | 유지                    |
| `.normal`    | 현재 위치로 이동 | 사용자가 움직인 상태 유지 | 유지                    |
| `.direction` | 현재 위치로 이동 | 현재 위치를 따라감        | 사용자의 지도 회전 유지 |
| `.compass`   | 현재 위치로 이동 | 현재 위치를 따라감        | 기기 방향을 따라감      |

`.direction`이나 `.compass` 상태에서 사용자가 제스처로 지도를 움직이면 `.normal`로 바뀔 수 있어요. 이는 사용자가 다른 지역을 탐색하려는 동작을 카메라가 즉시 되돌리지 않도록 하는 자연스러운 UX입니다.

공식 데모는 `NMFLocationManager.sharedInstance()`에 `NMFLocationManagerDelegate`를 등록하고 화면이 사라질 때 제거합니다.

```swift
final class TrackingViewController: UIViewController, NMFLocationManagerDelegate {
  private let locationManager = NMFLocationManager.sharedInstance()

  override func viewDidLoad() {
    super.viewDidLoad()
    locationManager?.add(self)
  }

  override func viewDidDisappear(_ animated: Bool) {
    super.viewDidDisappear(animated)
    locationManager?.remove(self)
  }
}
```

등록과 해제를 같은 화면 수명에 묶어 중복 콜백과 불필요한 참조를 피하세요.

## 코어 로케이션 결과를 직접 표시해요

위치 필터링, 정확도 정책, 자체 상태 모델, 서버 업로드가 필요하다면 `CLLocationManager`를 직접 소유하고 지도에는 결과만 전달하는 편이 명확합니다.

```swift
import CoreLocation
import NMapsMap

final class MapLocationController: NSObject, CLLocationManagerDelegate {
  private let manager = CLLocationManager()
  private weak var mapView: NMFMapView?

  init(mapView: NMFMapView) {
    self.mapView = mapView
    super.init()
    manager.delegate = self
    manager.desiredAccuracy = kCLLocationAccuracyBest
  }

  func start() {
    switch manager.authorizationStatus {
    case .authorizedWhenInUse, .authorizedAlways:
      manager.startUpdatingLocation()
      manager.startUpdatingHeading()
    case .notDetermined:
      manager.requestWhenInUseAuthorization()
    case .denied, .restricted:
      hideLocation()
    @unknown default:
      hideLocation()
    }
  }

  func stop() {
    manager.stopUpdatingLocation()
    manager.stopUpdatingHeading()
  }

  func locationManagerDidChangeAuthorization(_ manager: CLLocationManager) {
    start()
  }

  func locationManager(
    _ manager: CLLocationManager,
    didUpdateLocations locations: [CLLocation]
  ) {
    guard let latest = locations.last,
          latest.horizontalAccuracy >= 0,
          let overlay = mapView?.locationOverlay else {
      return
    }

    overlay.location = NMGLatLng(
      lat: latest.coordinate.latitude,
      lng: latest.coordinate.longitude
    )
    overlay.hidden = false
  }

  func locationManager(
    _ manager: CLLocationManager,
    didUpdateHeading newHeading: CLHeading
  ) {
    let heading = newHeading.trueHeading >= 0
      ? newHeading.trueHeading
      : newHeading.magneticHeading
    mapView?.locationOverlay.heading = heading
  }

  private func hideLocation() {
    mapView?.locationOverlay.hidden = true
  }
}
```

`NMFLocationOverlay`는 지도마다 하나만 존재하며 `mapView.locationOverlay`로 가져옵니다. 일반 마커처럼 `mapView = nil`로 제거하는 객체가 아니므로 `hidden`으로 표시를 제어해야 해요.

`locationOverlay.circleRadius`의 단위는 미터가 아니라 화면의 pt입니다. `CLLocation.horizontalAccuracy`처럼 실제 지리적 반경을 보여주려면 `NMFCircleOverlay`를 별도로 만들고 위치와 반경을 갱신하세요.

## 두 방법을 비교해요

| 기준                    | 내장 위치 추적     | 직접 코어 로케이션 연동          |
| ----------------------- | ------------------ | -------------------------------- |
| 구현 속도               | 빠름               | 상태와 권한 코드를 직접 작성     |
| 현재 위치 버튼          | 바로 연결하기 쉬움 | 앱 버튼과 직접 연결              |
| 카메라 추적             | 모드로 제공        | 카메라 업데이트를 직접 구현      |
| 위치 필터·정확도 정책   | 제한적             | 제품 요구에 맞게 제어            |
| 서버 업로드·도메인 모델 | 별도 연결 필요     | 같은 파이프라인에서 구성 가능    |
| 테스트 대역             | SDK 추적에 의존    | 위치 제공자 프로토콜로 분리 가능 |

주변 장소 화면처럼 단순히 현 위치를 보여주고 따라가면 내장 모드가 편해요. 운동 기록이나 배달 추적처럼 위치 품질을 검사하고 도메인 이벤트로 처리해야 하면 직접 연동이 적합합니다.

## 배터리와 개인정보를 함께 설계해요

- 화면이 사라지거나 기능이 끝나면 위치와 방향 업데이트를 중지해요.
- 제품이 허용하는 가장 낮은 `desiredAccuracy`를 선택해요.
- 서버 전송이 필요하다면 보관 기간, 전송 주기, 사용 목적을 명확히 해요.
- 원본 위치를 로그·분석 이벤트에 무심코 남기지 않아요.
- 권한 거부, 위치 서비스 꺼짐, 정확한 위치 비활성화 상태의 UI를 준비해요.

## 테스트 방법

1. 시뮬레이터의 **Features → Location**에서 고정 위치와 이동 경로를 바꿔요.
2. 권한을 허용, 거부, 다시 설정한 각 상태에서 버튼 동작을 확인해요.
3. 사용자가 지도를 드래그했을 때 `.direction`에서 `.normal`로 바뀌는지 확인해요.
4. 화면 전환 후에도 위치 업데이트가 계속되는지 Instruments의 Energy Log와 로그로 확인해요.
5. 실제 기기에서 나침반 방향과 위치 정확도 변화도 확인해요.

## 체크리스트

- [ ] 위치 기능을 사용자가 요청한 순간에 권한을 묻나요?
- [ ] 단순 지도 화면에 Always 권한을 요구하지 않나요?
- [ ] 거부·제한 상태에서도 사용할 대체 흐름이 있나요?
- [ ] 내장 추적과 직접 연동 중 책임에 맞는 방식을 선택했나요?
- [ ] 화면이 사라질 때 추적과 델리게이트를 정리하나요?
- [ ] 위치 정확도와 원본 위치의 로그·보관 정책을 검토했나요?

## 면접에서 이어질 수 있는 질문

### 지도 SDK를 설치하면 위치 권한 문구가 반드시 필요한가요?

아니요. 네이버 지도 SDK는 기본적으로 사용자 위치를 사용하지 않습니다. 현재 위치 기능이나 직접 코어 로케이션 추적을 실제로 사용할 때 목적에 맞는 권한 문구를 추가해야 해요.

### 위치 정확도 원을 `locationOverlay.circleRadius`로 표현해도 되나요?

정확도 값은 미터인데 `circleRadius`는 화면의 pt 단위라서 의미가 맞지 않습니다. 지리적 반경은 `NMFCircleOverlay`의 미터 단위 반경으로 표현해야 해요.

## 참고 자료

- [NAVER 위치 공식 가이드](https://navermaps.github.io/ios-map-sdk/guide-ko/4-2.html)
- [NAVER 위치 오버레이 공식 가이드](https://navermaps.github.io/ios-map-sdk/guide-ko/5-5.html)
- [NAVER Maps iOS SDK 위치 추적 데모](https://github.com/navermaps/ios-map-sdk/blob/master/NaverMapDemo/LocationTrackingViewController.swift)
- [Apple 위치 서비스 권한 요청](https://developer.apple.com/documentation/corelocation/requesting-authorization-to-use-location-services)
- [Apple `CLLocationManager`](https://developer.apple.com/documentation/corelocation/cllocationmanager)
