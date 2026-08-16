---
title: UIKit에서 MKMapView 사용하기
description: MKMapView의 카메라·delegate·Annotation View 재사용과 Overlay Renderer 구조를 익히고 SwiftUI bridge의 상태 동기화 원칙을 설명합니다.
pageType: doc-wide
outline: false
---

# UIKit에서 MKMapView 사용하기

> 면접용 한 줄 요약: **`MKMapView`는 Annotation 모델과 화면에 보이는 재사용 View를 분리하고, `MKMapViewDelegate`가 표현과 사용자 이벤트를 연결하는 명령형 지도 View입니다.**

## `MKMapView`가 필요한 경우부터 구분해요

SwiftUI `Map`으로 대부분의 새 지도 화면을 만들 수 있지만 다음 요구가 핵심이면 `MKMapView`가 더 직접적입니다.

- 기존 UIKit View Controller와 수명 주기를 함께 사용해요.
- `MKAnnotationView`의 재사용, callout, drag, 표시 우선순위를 세밀하게 제어해요.
- `clusteringIdentifier`로 자동 클러스터링해요.
- custom `MKOverlayRenderer`를 구현해요.
- `MKMapViewDelegate`의 렌더링·선택·카메라 이벤트가 필요해요.

## 가장 작은 지도 화면을 만들어요

```swift
import MapKit
import UIKit

final class PlaceMapViewController: UIViewController {
  private let mapView = MKMapView()

  override func viewDidLoad() {
    super.viewDidLoad()

    mapView.translatesAutoresizingMaskIntoConstraints = false
    view.addSubview(mapView)

    NSLayoutConstraint.activate([
      mapView.topAnchor.constraint(equalTo: view.topAnchor),
      mapView.leadingAnchor.constraint(equalTo: view.leadingAnchor),
      mapView.trailingAnchor.constraint(equalTo: view.trailingAnchor),
      mapView.bottomAnchor.constraint(equalTo: view.bottomAnchor)
    ])

    let region = MKCoordinateRegion(
      center: .init(latitude: 37.5666, longitude: 126.9784),
      latitudinalMeters: 3_000,
      longitudinalMeters: 3_000
    )
    mapView.setRegion(region, animated: false)
  }
}
```

Apple 공식 문서는 `MKMapView` 자체를 subclass하지 말고 delegate로 동작을 확장하라고 안내합니다.

## 카메라 API를 목적별로 선택해요

| API                                          | 적합한 상황                                   |
| -------------------------------------------- | --------------------------------------------- |
| `setRegion(_:animated:)`                     | 중심과 가로·세로 범위를 지정해요.             |
| `setVisibleMapRect(_:edgePadding:animated:)` | 여러 지점이나 경로 전체를 여백과 함께 맞춰요. |
| `setCamera(_:animated:)`                     | 고도, pitch, heading을 직접 제어해요.         |
| `cameraBoundary`                             | 카메라 중심이 벗어날 영역을 제한해요.         |
| `cameraZoomRange`                            | 최소·최대 camera 거리를 제한해요.             |

하단 시트가 경로를 가린다면 화면 크기를 임의로 줄이지 말고 `edgePadding`으로 실제 가시 영역을 표현하세요.

## Annotation 데이터와 View를 분리해요

```swift
final class PlaceAnnotation: NSObject, MKAnnotation {
  let id: String
  let title: String?
  dynamic var coordinate: CLLocationCoordinate2D

  init(id: String, title: String, coordinate: CLLocationCoordinate2D) {
    self.id = id
    self.title = title
    self.coordinate = coordinate
  }
}
```

`MKAnnotation`은 좌표와 제목 같은 **데이터**예요. 실제 핀 UI는 `MKAnnotationView`가 담당합니다. MapKit은 화면 밖의 View를 reuse queue에 넣으므로 수천 개 Annotation이 있어도 모든 View를 동시에 만들지 않아요.

```swift
final class PlaceMapViewController: UIViewController, MKMapViewDelegate {
  private let mapView = MKMapView()
  private let placeReuseID = "place"

  override func viewDidLoad() {
    super.viewDidLoad()
    mapView.delegate = self
    mapView.register(
      MKMarkerAnnotationView.self,
      forAnnotationViewWithReuseIdentifier: placeReuseID
    )
  }

  func mapView(
    _ mapView: MKMapView,
    viewFor annotation: any MKAnnotation
  ) -> MKAnnotationView? {
    guard !(annotation is MKUserLocation) else {
      return nil
    }

    let view = mapView.dequeueReusableAnnotationView(
      withIdentifier: placeReuseID,
      for: annotation
    ) as? MKMarkerAnnotationView

    view?.canShowCallout = true
    view?.markerTintColor = .systemBlue
    view?.glyphImage = UIImage(systemName: "cup.and.saucer.fill")
    return view
  }
}
```

`MKUserLocation`에 custom 장소 View를 반환하면 시스템 위치 표시가 깨질 수 있으므로 먼저 제외합니다. 재사용 View의 색, 이미지, accessory, 선택 상태는 매번 완전히 재설정해 이전 Annotation의 상태가 남지 않게 하세요.

## 데이터 갱신은 ID 차이만 반영해요

서버 응답마다 `removeAnnotations` 후 `addAnnotations`를 반복하면 선택과 callout이 사라지고 화면이 깜빡일 수 있어요.

```swift
func apply(_ places: [Place]) {
  let existing = mapView.annotations
    .compactMap { $0 as? PlaceAnnotation }
  let oldByID = Dictionary(uniqueKeysWithValues: existing.map { ($0.id, $0) })
  let newByID = Dictionary(uniqueKeysWithValues: places.map { ($0.id, $0) })

  let removed = existing.filter { newByID[$0.id] == nil }
  mapView.removeAnnotations(removed)

  for place in places {
    if let annotation = oldByID[place.id] {
      annotation.coordinate = place.coordinate
    } else {
      mapView.addAnnotation(
        PlaceAnnotation(
          id: place.id,
          title: place.name,
          coordinate: place.coordinate
        )
      )
    }
  }
}
```

동일 ID의 위치가 바뀌면 기존 Annotation을 갱신하고, 없어진 항목과 새 항목만 제거·추가합니다.

## Overlay는 데이터와 Renderer를 분리해요

`MKPolyline`, `MKPolygon`, `MKCircle`은 지리 데이터이고 화면 표현은 delegate가 반환한 Renderer예요.

```swift
func mapView(
  _ mapView: MKMapView,
  rendererFor overlay: any MKOverlay
) -> MKOverlayRenderer {
  if let polyline = overlay as? MKPolyline {
    let renderer = MKPolylineRenderer(polyline: polyline)
    renderer.strokeColor = .systemBlue
    renderer.lineWidth = 5
    return renderer
  }

  return MKOverlayRenderer(overlay: overlay)
}
```

Annotation View와 Overlay Renderer를 혼동하지 마세요. 한 점의 상호작용 UI는 Annotation, 넓은 영역이나 경로는 Overlay가 적합합니다.

## SwiftUI에서 감쌀 때 두 상태 체계를 중복시키지 않아요

```swift
struct LegacyMapView: UIViewRepresentable {
  let places: [Place]

  func makeCoordinator() -> Coordinator {
    Coordinator()
  }

  func makeUIView(context: Context) -> MKMapView {
    let mapView = MKMapView()
    mapView.delegate = context.coordinator
    return mapView
  }

  func updateUIView(_ mapView: MKMapView, context: Context) {
    context.coordinator.apply(places, to: mapView)
  }

  final class Coordinator: NSObject, MKMapViewDelegate {
    func apply(_ places: [Place], to mapView: MKMapView) {
      // 안정적인 ID로 추가·변경·삭제만 반영해요.
    }
  }
}
```

`updateUIView`는 SwiftUI 상태 변경 때 여러 번 호출될 수 있어요. 호출될 때마다 카메라를 초기화하거나 모든 Annotation을 교체하지 않습니다. delegate에서 발생한 사용자 카메라 변경을 binding으로 보낼 때도 다시 `updateUIView`가 같은 카메라를 명령하지 않도록 출처를 구분해야 해요.

## 체크리스트

- [ ] `MKMapView`를 subclass하지 않고 delegate를 사용하나요?
- [ ] Annotation 데이터와 재사용 View의 책임을 분리했나요?
- [ ] 재사용 View의 모든 변경 가능한 상태를 다시 설정하나요?
- [ ] 서버 갱신에서 전체 삭제 대신 안정적인 ID 차이를 반영하나요?
- [ ] 경로 전체 보기에서 sheet 크기만큼 edge padding을 주나요?
- [ ] SwiftUI `updateUIView`가 사용자의 카메라를 반복 초기화하지 않나요?

## 면접에서 이어질 수 있는 질문

### Annotation과 Annotation View를 왜 분리하나요?

Annotation은 지리 데이터라 지도에 모두 등록할 수 있고, Annotation View는 현재 화면에 필요한 수만 재사용할 수 있습니다. 이 분리 덕분에 메모리 사용을 줄이고 View 생성 비용을 완화해요.

### SwiftUI 화면에서도 `MKMapView`를 선택할 이유가 있나요?

자동 클러스터링, custom reuse View, drag와 callout, 세밀한 delegate callback처럼 SwiftUI `Map`이 직접 제공하지 않는 제어가 제품 핵심이면 bridge가 유효합니다. 그렇지 않다면 공식 SwiftUI `Map`이 상태 동기화 비용이 더 적어요.

## 참고 자료

- [MKMapView 공식 문서](https://developer.apple.com/documentation/mapkit/mkmapview)
- [MKMapViewDelegate 공식 문서](https://developer.apple.com/documentation/mapkit/mkmapviewdelegate)
- [MKAnnotationView 공식 문서](https://developer.apple.com/documentation/mapkit/mkannotationview)
- [MapKit for AppKit and UIKit 공식 문서](https://developer.apple.com/documentation/mapkit/mapkit-for-appkit-and-uikit)
