---
title: 네이버 지도 좌표와 카메라 조작
description: NMGLatLng 좌표와 지도 카메라의 중심·줌·기울기·회전을 이해하고, 카메라 이동·화면 투영·탭 이벤트를 UIKit 전체 예제로 연결합니다.
pageType: doc-wide
outline: false
---

# 네이버 지도 좌표와 카메라 조작

> 면접용 한 줄 요약: **지도 상태는 중심 좌표만이 아니라 줌·기울기·헤딩을 포함한 카메라로 표현하며, 화면 좌표 변환과 사용자 탭은 `projection`과 전용 델리게이트로 처리합니다.**

## 먼저 좌표계를 구분해요

| 타입              | 나타내는 것                             | 예시                    |
| ----------------- | --------------------------------------- | ----------------------- |
| `NMGLatLng`       | 위도와 경도로 표현한 한 지점            | 서울시청 위치           |
| `NMGLatLngBounds` | 남서·북동 좌표로 만든 영역              | 검색 결과 전체 범위     |
| `CGPoint`         | 지도 뷰 왼쪽 위를 원점으로 한 화면 좌표 | 말풍선이나 버튼 위치    |
| `NMFProjection`   | 지도 좌표와 화면 좌표 사이의 변환기     | 좌표 위에 UIKit 뷰 배치 |

```swift
let cityHall = NMGLatLng(lat: 37.5666102, lng: 126.9783881)
let gyeongbokgung = NMGLatLng(lat: 37.579617, lng: 126.977041)

let bounds = NMGLatLngBounds(
  southWest: NMGLatLng(lat: 37.55, lng: 126.96),
  northEast: NMGLatLng(lat: 37.59, lng: 126.99)
)
```

좌표의 숫자는 `위도, 경도` 순서예요. API 응답 모델을 만들 때 `x`, `y` 또는 `longitude`, `latitude`의 순서를 확인하지 않고 그대로 전달하면 전혀 다른 위치가 표시될 수 있습니다.

## 카메라는 네 값을 가져요

`NMFCameraPosition`은 다음 값을 묶은 읽기 전용 객체입니다.

| 값        | 의미                               | 주의할 점                         |
| --------- | ---------------------------------- | --------------------------------- |
| `target`  | 카메라가 바라보는 지도 좌표        | 화면 중심과 항상 같지는 않아요.   |
| `zoom`    | 확대 수준                          | 클수록 더 가까이 봅니다.          |
| `tilt`    | 지면을 비스듬히 보는 각도          | 기울기 제스처로도 바뀔 수 있어요. |
| `heading` | 정북에서 시계 방향으로 회전한 각도 | 동쪽은 90도예요.                  |

```swift
let position = NMFCameraPosition(
  NMGLatLng(lat: 37.5666102, lng: 126.9783881),
  zoom: 15,
  tilt: 0,
  heading: 0
)

mapView.moveCamera(NMFCameraUpdate(position: position))
```

## UIKit에서 하나의 흐름으로 연결해요

다음 예제는 지도 생성, 제약 조건, 카메라 이동, 탭 좌표, 카메라 완료 이벤트를 한 화면에 연결합니다.

```swift
import NMapsMap
import UIKit

final class PlaceMapViewController: UIViewController {
  private let naverMapView = NMFNaverMapView(frame: .zero)

  private var mapView: NMFMapView {
    naverMapView.mapView
  }

  override func viewDidLoad() {
    super.viewDidLoad()
    configureLayout()
    configureMap()
    moveToCityHall()
  }

  deinit {
    mapView.removeCameraDelegate(delegate: self)
  }

  private func configureLayout() {
    naverMapView.translatesAutoresizingMaskIntoConstraints = false
    view.addSubview(naverMapView)

    NSLayoutConstraint.activate([
      naverMapView.topAnchor.constraint(equalTo: view.topAnchor),
      naverMapView.leadingAnchor.constraint(equalTo: view.leadingAnchor),
      naverMapView.trailingAnchor.constraint(equalTo: view.trailingAnchor),
      naverMapView.bottomAnchor.constraint(equalTo: view.bottomAnchor)
    ])
  }

  private func configureMap() {
    naverMapView.showCompass = true
    naverMapView.showScaleBar = true
    naverMapView.showZoomControls = false

    mapView.touchDelegate = self
    mapView.addCameraDelegate(delegate: self)
    mapView.minZoomLevel = 8
    mapView.maxZoomLevel = 19
  }

  private func moveToCityHall() {
    let target = NMGLatLng(lat: 37.5666102, lng: 126.9783881)
    let update = NMFCameraUpdate(scrollTo: target)
    update.animation = .easeIn
    update.animationDuration = 0.5
    mapView.moveCamera(update)
  }
}

extension PlaceMapViewController: NMFMapViewTouchDelegate {
  func mapView(
    _ mapView: NMFMapView,
    didTapMap latlng: NMGLatLng,
    point: CGPoint
  ) {
    print("지도 좌표: \(latlng.lat), \(latlng.lng)")
    print("화면 좌표: \(point.x), \(point.y)")
  }
}

extension PlaceMapViewController: NMFMapViewCameraDelegate {
  func mapViewCameraIdle(_ mapView: NMFMapView) {
    let camera = mapView.cameraPosition
    print("조회할 중심: \(camera.target.lat), \(camera.target.lng)")
  }
}
```

`NMFMapView`의 예전 통합 `delegate`는 사용이 권장되지 않아요. [API Reference](https://navermaps.github.io/ios-map-sdk/reference/Classes/NMFMapView.html)는 탭에는 `touchDelegate`, 카메라에는 `addCameraDelegate`/`removeCameraDelegate`를 사용하라고 안내합니다. 역할별로 등록하면 콜백의 책임과 해제 시점도 명확해져요.

## 카메라 이동 방법을 선택해요

| 요구 사항                    | 시작점                          | 설명                                   |
| ---------------------------- | ------------------------------- | -------------------------------------- |
| 특정 위치로 이동             | `NMFCameraUpdate(scrollTo:)`    | 중심 좌표만 바꿔요.                    |
| 줌만 변경                    | `NMFCameraUpdate(zoomTo:)`      | 현재 중심을 유지해요.                  |
| 중심·줌·기울기·회전 지정     | `NMFCameraUpdate(position:)`    | 전체 카메라 상태를 한 번에 정해요.     |
| 여러 장소가 모두 보이게 이동 | 영역을 사용하는 카메라 업데이트 | 마커 범위와 화면 여백을 함께 고려해요. |
| 복합 변화                    | `NMFCameraUpdateParams`         | scroll, zoom, tilt, rotate를 조합해요. |

카메라 애니메이션 중 새 이동이 시작되면 이전 작업이 취소될 수 있습니다. 후속 작업이 꼭 필요하면 완료 클로저의 `isCancelled`를 확인하세요.

```swift
let update = NMFCameraUpdate(scrollTo: cityHall)
update.animation = .fly
update.animationDuration = 1

mapView.moveCamera(update) { isCancelled in
  guard !isCancelled else { return }
  print("카메라 이동 완료")
}
```

검색 API를 카메라 이동 중 매 프레임 호출하지 마세요. `cameraIsChangingByReason`은 매우 자주 호출될 수 있으므로 화면 표시용 값에 적합하고, 네트워크 재조회는 `mapViewCameraIdle` 이후 디바운스하는 편이 안정적입니다.

## 아래 패널이 지도를 가리면 `contentInset`을 써요

바텀 시트가 지도 아래 240pt를 덮으면 뷰의 물리적 중앙과 사용자가 실제로 보는 영역의 중앙이 달라집니다.

```swift
func updateMapInsets(bottomSheetHeight: CGFloat) {
  mapView.contentInset = UIEdgeInsets(
    top: 0,
    left: 0,
    bottom: bottomSheetHeight,
    right: 0
  )
}
```

공식 [카메라와 투영 가이드](https://navermaps.github.io/ios-map-sdk/guide-ko/3-1.html)는 `contentInset`을 제외한 영역의 중심에 카메라가 위치한다고 설명합니다. 오토레이아웃으로 지도 프레임만 억지로 줄이는 것과 목적이 달라요.

## 화면 좌표와 지도 좌표를 변환해요

```swift
let mapCoordinate = mapView.projection.latlng(
  from: CGPoint(x: 120, y: 240)
)

let screenPoint = mapView.projection.point(
  from: NMGLatLng(lat: 37.5666102, lng: 126.9783881)
)

let metersPerPoint = mapView.projection.metersPerPixel()
```

- `latlng(from:)`은 사용자가 누른 화면 지점을 지도 좌표로 바꿀 때 유용해요.
- `point(from:)`은 UIKit 말풍선을 특정 지도 좌표 위에 배치할 때 유용해요.
- 축척은 위도와 줌 레벨에 따라 달라지므로 고정된 `pt → m` 비율을 가정하면 안 돼요.

## 이벤트 전파를 이해해요

지도 심벌과 오버레이의 탭 핸들러는 `Bool`을 반환합니다.

```swift
func mapView(_ mapView: NMFMapView, didTap symbol: NMFSymbol) -> Bool {
  guard symbol.caption == "서울특별시청" else {
    return false // 지도 탭 이벤트로 전파
  }

  print("서울시청 심벌 탭")
  return true // 이벤트 소비
}
```

`true`는 해당 객체가 이벤트를 소비한다는 뜻이고, `false`는 지도 탭으로 전달한다는 뜻이에요. 선택 해제 로직을 지도 탭에 두었다면 오버레이가 `true`를 반환할 때 선택이 유지된다는 점까지 의도해야 합니다.

## 네이버 로고를 가리지 않아요

[사용자 인터페이스 공식 가이드](https://navermaps.github.io/ios-map-sdk/guide-ko/4-1.html)에 따르면 NAVER 로고는 비활성화할 수 없고 앱 UI에 가려져서도 안 됩니다. `logoAlign`과 `logoMargin`으로 위치를 조정하세요. `logoInteractionEnabled`를 끈다면 앱 안에서 `showLegalNotice`와 `showOpenSourceLicense`를 열 수 있는 메뉴를 별도로 제공해야 합니다.

## 체크리스트

- [ ] 위도와 경도의 입력 순서를 확인했나요?
- [ ] 중심뿐 아니라 줌·기울기·헤딩까지 화면 상태로 정의했나요?
- [ ] 네트워크 재조회는 카메라가 멈춘 뒤 실행하나요?
- [ ] 델리게이트를 등록한 수명 주기에서 해제하나요?
- [ ] 바텀 시트 높이를 `contentInset`에 반영했나요?
- [ ] NAVER 로고와 법적 고지를 가리지 않았나요?

## 면접에서 이어질 수 있는 질문

### 카메라 이동 콜백마다 서버를 호출하면 왜 문제가 되나요?

사용자의 한 번의 드래그에도 이동 중 콜백이 여러 번 발생해 요청 폭주, 순서 역전, 화면 깜빡임이 생길 수 있습니다. idle 시점에 디바운스하고, 이전 요청 취소나 요청 식별자를 함께 사용해야 해요.

### `contentInset`과 지도 뷰 프레임 축소는 무엇이 다른가요?

프레임 축소는 지도 자체의 크기를 바꾸지만 `contentInset`은 지도 렌더링 영역을 유지한 채 카메라가 기준으로 삼는 가시 영역을 조정합니다. 지도 위에 겹치는 패널이 있을 때 후자가 자연스럽습니다.

## 참고 자료

- [좌표 공식 가이드](https://navermaps.github.io/ios-map-sdk/guide-ko/2-2.html)
- [카메라와 투영 공식 가이드](https://navermaps.github.io/ios-map-sdk/guide-ko/3-1.html)
- [카메라 이동 공식 가이드](https://navermaps.github.io/ios-map-sdk/guide-ko/3-2.html)
- [사용자 인터페이스 공식 가이드](https://navermaps.github.io/ios-map-sdk/guide-ko/4-1.html)
- [`NMFMapViewCameraDelegate` API Reference](https://navermaps.github.io/ios-map-sdk/reference/Protocols/NMFMapViewCameraDelegate.html)
