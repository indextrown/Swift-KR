---
title: SwiftUI에서 네이버 지도 SDK 연동하기
description: UIViewRepresentable과 Coordinator로 NMFNaverMapView를 감싸고, 카메라 양방향 상태 동기화와 Identifiable 기반 마커 재조정을 안전하게 구현합니다.
pageType: doc-wide
outline: false
---

# SwiftUI에서 네이버 지도 SDK 연동하기

> 면접용 한 줄 요약: **UIKit 지도 뷰의 생성은 `makeUIView`, SwiftUI 상태 반영은 `updateUIView`, 델리게이트와 명령형 객체 보관은 Coordinator가 맡도록 수명 주기를 나눕니다.**

:::info 예제의 근거
네이버 지도 iOS SDK는 UIKit 뷰를 제공하고, Apple은 UIKit 뷰를 SwiftUI에 연결할 때 `UIViewRepresentable`을 사용하도록 안내합니다. 아래 코드는 [네이버 지도·카메라 계약](https://navermaps.github.io/ios-map-sdk/guide-ko/3-2.html)과 Apple의 [`UIViewRepresentable`](https://developer.apple.com/documentation/swiftui/uiviewrepresentable) 수명 주기를 조합한 구현 예시예요.
:::

## 세 수명 주기를 먼저 나눠요

| 구성 요소         | 수명 주기                         | 맡길 책임                              |
| ----------------- | --------------------------------- | -------------------------------------- |
| SwiftUI `View` 값 | 상태가 바뀔 때 자주 다시 생성     | 선언적 입력과 화면 조합                |
| `NMFNaverMapView` | Representable이 관리하는 UIKit 뷰 | 지도 렌더링과 제스처                   |
| `Coordinator`     | Representable의 UIKit 연결 수명   | 델리게이트, 마커 저장소, 양방향 이벤트 |

가장 흔한 실수는 `updateUIView`에서 지도 뷰나 모든 마커를 매번 새로 만드는 것입니다. SwiftUI 업데이트는 매우 자주 일어날 수 있으므로, 이 메서드는 **현재 UIKit 상태와 새 입력의 차이만 반영**해야 해요.

## 1단계: SwiftUI가 이해할 카메라 모델을 만들어요

SDK 객체를 앱의 화면 상태로 그대로 노출하기보다 필요한 값만 담은 Swift 모델을 두면 테스트와 비교가 쉬워집니다.

```swift
struct MapViewport: Equatable {
  var latitude: Double
  var longitude: Double
  var zoom: Double

  static let seoul = MapViewport(
    latitude: 37.5666102,
    longitude: 126.9783881,
    zoom: 15
  )

  func isApproximatelyEqual(to other: MapViewport) -> Bool {
    abs(latitude - other.latitude) < 0.000_001
      && abs(longitude - other.longitude) < 0.000_001
      && abs(zoom - other.zoom) < 0.001
  }
}
```

부동소수점 카메라 값을 `==`로만 비교하면 아주 작은 오차 때문에 같은 이동을 반복할 수 있어요. 화면 요구 사항에 맞는 허용 오차를 사용합니다.

## 2단계: 지도 뷰와 카메라를 양방향으로 연결해요

```swift
import NMapsMap
import SwiftUI

struct NaverMapContainer: UIViewRepresentable {
  @Binding var viewport: MapViewport
  var onMapTap: (NMGLatLng) -> Void = { _ in }

  func makeCoordinator() -> Coordinator {
    Coordinator(viewport: $viewport, onMapTap: onMapTap)
  }

  func makeUIView(context: Context) -> NMFNaverMapView {
    let naverMapView = NMFNaverMapView(frame: .zero)
    let mapView = naverMapView.mapView

    naverMapView.showCompass = true
    naverMapView.showScaleBar = true
    naverMapView.showZoomControls = false

    mapView.touchDelegate = context.coordinator
    mapView.addCameraDelegate(delegate: context.coordinator)
    return naverMapView
  }

  func updateUIView(_ uiView: NMFNaverMapView, context: Context) {
    context.coordinator.viewport = $viewport
    context.coordinator.onMapTap = onMapTap
    context.coordinator.apply(viewport, to: uiView.mapView)
  }

  static func dismantleUIView(
    _ uiView: NMFNaverMapView,
    coordinator: Coordinator
  ) {
    coordinator.detach(from: uiView.mapView)
  }

  final class Coordinator: NSObject {
    var viewport: Binding<MapViewport>
    var onMapTap: (NMGLatLng) -> Void
    private var lastAppliedViewport: MapViewport?

    init(
      viewport: Binding<MapViewport>,
      onMapTap: @escaping (NMGLatLng) -> Void
    ) {
      self.viewport = viewport
      self.onMapTap = onMapTap
    }

    func apply(_ newViewport: MapViewport, to mapView: NMFMapView) {
      if let lastAppliedViewport,
         newViewport.isApproximatelyEqual(to: lastAppliedViewport) {
        return
      }

      lastAppliedViewport = newViewport
      let target = NMGLatLng(
        lat: newViewport.latitude,
        lng: newViewport.longitude
      )
      let position = NMFCameraPosition(target, zoom: newViewport.zoom)
      let update = NMFCameraUpdate(position: position)
      update.animation = .easeIn
      mapView.moveCamera(update)
    }

    func detach(from mapView: NMFMapView) {
      mapView.touchDelegate = nil
      mapView.removeCameraDelegate(delegate: self)
    }
    func reportCameraIdle(_ mapView: NMFMapView) {
      let camera = mapView.cameraPosition
      let current = MapViewport(
        latitude: camera.target.lat,
        longitude: camera.target.lng,
        zoom: camera.zoom
      )

      lastAppliedViewport = current
      guard !current.isApproximatelyEqual(to: viewport.wrappedValue) else {
        return
      }

      DispatchQueue.main.async { [weak self] in
        self?.viewport.wrappedValue = current
      }
    }
  }
}

extension NaverMapContainer.Coordinator: NMFMapViewCameraDelegate {
  func mapViewCameraIdle(_ mapView: NMFMapView) {
    reportCameraIdle(mapView)
  }
}

extension NaverMapContainer.Coordinator: NMFMapViewTouchDelegate {
  func mapView(
    _ mapView: NMFMapView,
    didTapMap latlng: NMGLatLng,
    point: CGPoint
  ) {
    onMapTap(latlng)
  }
}
```

`lastAppliedViewport`가 중요한 이유는 다음 순환을 끊기 위해서예요.

```text
사용자 제스처 → 카메라 idle → Binding 변경 → updateUIView
      ▲                                      │
      └──── 같은 카메라 이동을 다시 실행 ────┘
```

Coordinator가 방금 보고한 카메라와 SwiftUI 입력을 비교하면 같은 이동을 되풀이하지 않습니다.

## 3단계: SwiftUI 화면에서 사용해요

```swift
struct PlaceMapScreen: View {
  @State private var viewport = MapViewport.seoul
  @State private var selectedCoordinate: String?

  var body: some View {
    ZStack(alignment: .bottom) {
      NaverMapContainer(viewport: $viewport) { coordinate in
        selectedCoordinate = "\(coordinate.lat), \(coordinate.lng)"
      }
      .ignoresSafeArea()

      if let selectedCoordinate {
        Text(selectedCoordinate)
          .padding(12)
          .background(.regularMaterial, in: Capsule())
          .padding(.bottom, 24)
      }
    }
  }
}
```

SwiftUI가 레이아웃을 소유하므로 `makeUIView`에서 화면 크기를 직접 읽어 프레임을 고정하지 않습니다. `ignoresSafeArea`, `frame`, `safeAreaInset` 같은 SwiftUI 수정자로 배치를 결정해요.

## 마커는 안정적인 ID로 재조정해요

마커 배열이 바뀔 때 기존 마커를 모두 `nil`로 떼고 다시 만들면 아이콘 생성, 터치 핸들러 등록, 렌더링이 반복됩니다. `Identifiable`의 ID를 키로 사용해 추가·변경·삭제만 반영하세요.

```swift
struct PlacePin: Identifiable, Equatable {
  let id: String
  var title: String
  var latitude: Double
  var longitude: Double
}

final class MarkerStore {
  private var markersByID: [PlacePin.ID: NMFMarker] = [:]

  func synchronize(
    pins: [PlacePin],
    on mapView: NMFMapView,
    onTap: @escaping (PlacePin.ID) -> Void
  ) {
    let incomingIDs = Set(pins.map(\.id))
    let removedIDs = Set(markersByID.keys).subtracting(incomingIDs)

    for id in removedIDs {
      markersByID[id]?.mapView = nil
      markersByID[id] = nil
    }

    for pin in pins {
      let marker = markersByID[pin.id] ?? NMFMarker()
      marker.position = NMGLatLng(
        lat: pin.latitude,
        lng: pin.longitude
      )
      marker.captionText = pin.title
      marker.touchHandler = { _ in
        onTap(pin.id)
        return true
      }
      marker.mapView = mapView
      markersByID[pin.id] = marker
    }
  }

  func removeAll() {
    markersByID.values.forEach { $0.mapView = nil }
    markersByID.removeAll()
  }
}
```

이 저장소는 Coordinator가 소유하는 것이 자연스러워요. `updateUIView`에서는 `markerStore.synchronize(...)`만 호출하고, `dismantleUIView`에서 `removeAll()`을 호출합니다.

마커가 수천 개로 늘어나면 ID 기반 재조정만으로 충분하지 않을 수 있어요. 화면 가독성과 렌더링 비용을 함께 줄이려면 [클러스터링](/guide/naver-maps-sdk/overlays-and-clustering)을 적용합니다.

## 비동기 검색 결과와 카메라를 연결할 때

카메라가 멈출 때마다 주변 장소를 조회하는 화면은 다음 경계를 가져야 해요.

```text
카메라 idle
  → SwiftUI viewport 갱신
  → 이전 Task 취소
  → 서버에 현재 영역 조회
  → 최신 요청의 결과만 pins에 반영
  → MarkerStore가 차이만 지도에 반영
```

Coordinator 안에서 네트워크를 직접 호출하면 UIKit 수명 주기와 비즈니스 로직이 강하게 결합됩니다. Coordinator는 카메라 이벤트를 SwiftUI 상태로 전달하고, 검색 Task는 ViewModel이나 화면 모델이 소유하도록 나누세요.

## 체크리스트

- [ ] 지도 뷰는 `makeUIView`에서 한 번 만들고 있나요?
- [ ] `updateUIView`는 입력 차이만 반영하나요?
- [ ] 카메라 양방향 바인딩의 되먹임을 차단했나요?
- [ ] 델리게이트 등록과 해제를 같은 수명 주기로 묶었나요?
- [ ] 마커를 안정적인 ID로 추가·변경·삭제하나요?
- [ ] 네트워크 검색을 Coordinator 밖의 화면 모델이 소유하나요?

## 면접에서 이어질 수 있는 질문

### Coordinator가 필요한 이유는 무엇인가요?

SwiftUI `View`는 값 타입이고 자주 다시 만들어지지만 UIKit 델리게이트와 오버레이 저장소는 참조 수명과 정체성이 필요합니다. Coordinator가 두 세계 사이에서 이벤트와 명령형 객체를 안정적으로 보관해요.

### `updateUIView`에서 지도를 매번 새로 만들면 왜 안 되나요?

카메라와 제스처 상태가 초기화되고, 네트워크 타일 로딩과 오버레이 생성이 반복되며, SwiftUI 상태 변경 때 화면이 깜빡일 수 있습니다. UIKit 인스턴스는 유지하고 바뀐 속성만 업데이트해야 해요.

## 참고 자료

- [Apple `UIViewRepresentable`](https://developer.apple.com/documentation/swiftui/uiviewrepresentable)
- [Apple SwiftUI의 UIKit 통합](https://developer.apple.com/documentation/swiftui/uikit-integration)
- [NAVER 지도 객체 공식 가이드](https://navermaps.github.io/ios-map-sdk/guide-ko/2-1.html)
- [NAVER 카메라 이동 공식 가이드](https://navermaps.github.io/ios-map-sdk/guide-ko/3-2.html)
- [`NMFMapView` API Reference](https://navermaps.github.io/ios-map-sdk/reference/Classes/NMFMapView.html)
