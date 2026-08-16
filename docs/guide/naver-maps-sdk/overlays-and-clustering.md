---
title: 네이버 지도 요소와 마커 묶기
description: 마커·정보 창·경로·도형의 공통 수명 주기와 스레드 규칙을 익히고, 대량 마커를 NMCClusterer로 묶어 성능과 가독성을 개선합니다.
pageType: doc-wide
outline: false
---

# 네이버 지도 요소와 마커 묶기

> 면접용 한 줄 요약: **오버레이는 `mapView` 연결 여부로 표시 수명을 관리하고, 대량 마커는 같은 이미지를 재사용하며 안정적인 키를 가진 클러스터러로 묶어야 합니다.**

## 오버레이란 무엇인가요?

기본 지도 위에 앱의 데이터를 표현하는 객체를 오버레이라고 해요.

| 요구 사항               | 대표 타입                                           | 예시                     |
| ----------------------- | --------------------------------------------------- | ------------------------ |
| 한 지점 표시            | `NMFMarker`                                         | 매장, 정류장, 사고 지점  |
| 선택한 지점의 부가 정보 | `NMFInfoWindow`                                     | 장소명 말풍선            |
| 경로 표시               | `NMFPath`, `NMFMultipartPath`, `NMFPolylineOverlay` | 이동 경로, 단순 선       |
| 영역 표시               | `NMFPolygonOverlay`, `NMFCircleOverlay`             | 배달 가능 구역, 반경     |
| 지도 위 이미지          | `NMFGroundOverlay`                                  | 행사장 도면, 이미지 영역 |
| 사용자 위치             | `NMFLocationOverlay`                                | 현재 위치와 방향         |

타입은 달라도 표시와 제거 방식은 같습니다.

```swift
let marker = NMFMarker(
  position: NMGLatLng(lat: 37.5666102, lng: 126.9783881)
)

marker.mapView = mapView // 지도에 표시
marker.mapView = nil     // 지도에서 제거
```

[오버레이 공통 가이드](https://navermaps.github.io/ios-map-sdk/guide-ko/5-1.html)에 따르면 한 오버레이는 동시에 하나의 지도에만 추가할 수 있어요. 화면 전환이나 데이터 삭제 시 `mapView = nil`로 연결을 끊는 수명 주기를 명시적으로 가져야 합니다.

## 마커와 정보 창을 하나의 선택 흐름으로 만들어요

여러 장소마다 정보 창을 만들 필요는 없어요. 정보 창 하나의 데이터 소스를 갱신해 선택된 마커 위로 옮기면 됩니다.

```swift
import NMapsMap

final class PlaceMarkerController {
  private let infoWindow = NMFInfoWindow()
  private let infoSource = NMFInfoWindowDefaultTextSource.data()
  private var markers: [NMFMarker] = []

  init() {
    infoWindow.dataSource = infoSource
  }

  func showPlaces(_ places: [Place], on mapView: NMFMapView) {
    removeAll()

    markers = places.map { place in
      let marker = NMFMarker(
        position: NMGLatLng(
          lat: place.latitude,
          lng: place.longitude
        )
      )
      marker.captionText = place.name
      marker.userInfo = ["placeName": place.name]
      marker.touchHandler = { [weak self] overlay in
        guard let self,
              let marker = overlay as? NMFMarker,
              let title = marker.userInfo["placeName"] as? String else {
          return false
        }

        self.infoSource.title = title
        self.infoWindow.open(with: marker)
        return true
      }
      marker.mapView = mapView
      return marker
    }
  }

  func closeInfoWindow() {
    infoWindow.close()
  }

  func removeAll() {
    infoWindow.close()
    markers.forEach { $0.mapView = nil }
    markers.removeAll()
  }
}

struct Place {
  let name: String
  let latitude: Double
  let longitude: Double
}
```

`dataSource`는 `open(with:)`보다 먼저 지정해야 합니다. 마커의 `touchHandler`가 `true`를 반환했으므로 이벤트는 소비되고 지도 탭까지 전파되지 않아요. 지도를 탭했을 때 정보 창을 닫고 싶다면 지도 `touchDelegate`에서 `closeInfoWindow()`를 호출합니다.

:::tip 전체 삭제보다 차이 반영이 좋아요
위 코드는 수명 주기를 한눈에 보여주기 위해 전체를 교체합니다. 실제 SwiftUI나 실시간 검색 화면에서는 [SwiftUI 연동 문서의 `MarkerStore`](/guide/naver-maps-sdk/swiftui-integration)처럼 안정적인 ID를 기준으로 추가·변경·삭제만 반영하세요.
:::

## 표시 순서와 확대 수준을 조절해요

오버레이가 겹치면 `globalZIndex`로 타입 사이의 큰 순서를, `zIndex`로 같은 타입 안의 상대 순서를 조절할 수 있어요. 선택된 마커를 위로 올리기 위해 모든 마커의 값을 반복해서 바꾸기보다 선택된 하나의 `zIndex`만 변경하세요.

```swift
marker.minZoom = 12
marker.maxZoom = 19
marker.zIndex = isSelected ? 10 : 0
marker.hidden = !isVisible
```

`minZoom`, `maxZoom`으로 상세 데이터가 너무 축소된 지도에 노출되지 않게 하면 가독성과 렌더링 부담을 함께 줄일 수 있습니다.

## 비트맵 이미지를 재사용해요

`NMFOverlayImage`는 같은 이미지를 쓰는 여러 오버레이가 공유해야 해요. 공식 가이드는 같은 비트맵 인스턴스를 중복 생성하면 텍스처 아틀라스가 넘치거나 메모리 문제가 생길 수 있다고 경고합니다.

```swift
final class MapImageCatalog {
  static let shared = MapImageCatalog()

  let store = NMFOverlayImage(name: "marker_store")
  let selectedStore = NMFOverlayImage(name: "marker_store_selected")

  private init() {}
}

marker.iconImage = MapImageCatalog.shared.store
```

네트워크 이미지가 필요하다면 다운로드 결과를 캐시하고 `NMFOverlayImage` 생성도 재사용하는 계층을 두세요. 스크롤이나 카메라 이동 때마다 같은 이미지를 다시 디코딩하면 안 됩니다.

## 지도에 붙은 오버레이는 메인 스레드에서 다뤄요

[오버레이 공통 가이드](https://navermaps.github.io/ios-map-sdk/guide-ko/5-1.html)는 오버레이가 지도에 추가된 뒤 속성을 메인 스레드에서만 접근해야 하며, 그렇지 않으면 `NSObjectInaccessibleException`이 발생할 수 있다고 설명합니다.

```swift
Task.detached {
  let models = await loadPlaceModels()

  await MainActor.run {
    markerController.showPlaces(models, on: mapView)
  }
}
```

백그라운드에서 서버 응답을 파싱하고 표시 모델을 계산하는 것은 좋지만, `mapView`에 연결된 마커의 위치·캡션·이미지를 바꾸는 구간은 `MainActor`로 넘기세요.

## 마커가 많아지면 클러스터링해요

마커가 수천 개면 두 문제가 동시에 생겨요.

- 모든 마커가 겹쳐 사용자가 개별 장소를 읽기 어려워요.
- 화면에 많은 오버레이를 유지하면서 렌더링과 업데이트 비용이 커져요.

클러스터링은 확대 수준과 화면상 거리에 따라 가까운 항목을 하나의 그룹 마커로 묶습니다. 고정된 “몇 개부터”라는 정답은 없어요. 아이콘 복잡도, 기기, 카메라 범위가 다르므로 Instruments와 실제 기기에서 프레임, 메모리, 상호작용 지연을 측정해 결정합니다.

## 안정적인 클러스터 키를 만들어요

`NMCClusteringKey`는 위치뿐 아니라 항목 정체성을 표현해야 해요. 공식 데모처럼 `NSObject`를 상속하고 동등성, 해시, 복사를 일관되게 구현합니다.

```swift
import NMapsMap

final class PlaceKey: NSObject, NMCClusteringKey {
  let identifier: Int
  let position: NMGLatLng

  init(identifier: Int, position: NMGLatLng) {
    self.identifier = identifier
    self.position = position
  }

  override func isEqual(_ object: Any?) -> Bool {
    guard let other = object as? PlaceKey else {
      return false
    }
    return identifier == other.identifier
  }

  override var hash: Int {
    identifier
  }

  func copy(with zone: NSZone? = nil) -> Any {
    PlaceKey(identifier: identifier, position: position)
  }
}
```

같은 `identifier`인데 `hash`가 달라지거나, 화면 업데이트마다 새 임의 ID를 만들면 기존 항목을 안정적으로 찾을 수 없어요. 서버의 장소 ID처럼 변하지 않는 값을 사용합니다.

## `NMCClusterer`에 데이터를 연결해요

```swift
final class PlaceClusterController {
  private var clusterer: NMCClusterer<PlaceKey>?

  func show(_ places: [ClusterPlace], on mapView: NMFMapView) {
    let builder = NMCBuilder<PlaceKey>()
    let clusterer = builder.build()

    var items: [PlaceKey: NSObject] = [:]
    for place in places {
      let key = PlaceKey(
        identifier: place.id,
        position: NMGLatLng(
          lat: place.latitude,
          lng: place.longitude
        )
      )
      items[key] = place.name as NSString
    }

    clusterer.addAll(items)
    clusterer.mapView = mapView
    self.clusterer = clusterer
  }

  func removeAll() {
    clusterer?.clear()
    clusterer?.mapView = nil
    clusterer = nil
  }
}

struct ClusterPlace {
  let id: Int
  let name: String
  let latitude: Double
  let longitude: Double
}
```

공식 [클러스터링 가이드](https://navermaps.github.io/ios-map-sdk/guide-ko/5-8.html)는 항목을 하나씩 여러 번 추가하기보다 `addAll`을 한 번 호출하는 편이 성능에 유리하다고 안내합니다. 화면이 사라지거나 데이터 세트가 교체되면 `clear()`로 정리하세요.

기본 전략으로 부족하면 `NMCComplexBuilder`에서 거리, 임계값, 태그 병합, 마커 업데이트 전략을 바꿀 수 있어요. 먼저 기본 클러스터러를 측정하고, 실제 UX 요구가 확인된 뒤 복잡한 전략으로 확장하는 편이 좋습니다.

## 일반 마커와 클러스터링을 비교해요

| 기준          | 일반 `NMFMarker`              | `NMCClusterer`                              |
| ------------- | ----------------------------- | ------------------------------------------- |
| 소량 장소     | 구현이 단순해요               | 오히려 설정이 늘 수 있어요                  |
| 대량 장소     | 겹침과 업데이트 비용이 커져요 | 화면 가독성과 표시 수를 줄여요              |
| 개별 커스텀   | 마커마다 직접 설정하기 쉬워요 | Leaf/Cluster updater 전략을 사용해요        |
| 데이터 정체성 | 앱의 ID 저장소가 관리해요     | `NMCClusteringKey` 동등성·해시가 핵심이에요 |
| 제거          | `mapView = nil`               | 개별 remove 또는 `clear()`                  |

## 체크리스트

- [ ] 오버레이를 제거할 때 `mapView = nil` 또는 `clear()`를 호출하나요?
- [ ] 지도에 연결된 오버레이는 메인 스레드에서 변경하나요?
- [ ] 같은 `NMFOverlayImage` 인스턴스를 재사용하나요?
- [ ] 정보 창의 `dataSource`를 열기 전에 지정했나요?
- [ ] 대량 마커의 안정적인 ID와 클러스터 키를 정의했나요?
- [ ] 클러스터링 전후를 실제 기기와 Instruments에서 비교했나요?

## 면접에서 이어질 수 있는 질문

### `NMCClusteringKey`의 `isEqual`과 `hash`가 중요한 이유는 무엇인가요?

클러스터러가 데이터의 추가·변경·삭제를 같은 항목으로 식별하는 기준이기 때문입니다. 동등한 두 키는 반드시 같은 해시를 가져야 하며, 위치가 바뀌어도 항목 정체성이 같다면 식별자는 유지해야 해요.

### 마커 이미지를 매번 새로 만들면 어떤 문제가 생기나요?

같은 비트맵의 디코딩과 GPU 텍스처 사용이 중복됩니다. 공식 가이드가 권장하듯 `NMFOverlayImage` 인스턴스를 캐시해 여러 마커가 공유하도록 설계해야 해요.

## 참고 자료

- [오버레이 공통 공식 가이드](https://navermaps.github.io/ios-map-sdk/guide-ko/5-1.html)
- [마커 공식 가이드](https://navermaps.github.io/ios-map-sdk/guide-ko/5-2.html)
- [정보 창 공식 가이드](https://navermaps.github.io/ios-map-sdk/guide-ko/5-3.html)
- [경로선 오버레이 공식 가이드](https://navermaps.github.io/ios-map-sdk/guide-ko/5-7.html)
- [마커 클러스터링 공식 가이드](https://navermaps.github.io/ios-map-sdk/guide-ko/5-8.html)
- [NAVER Maps iOS SDK 공식 데모](https://github.com/navermaps/ios-map-sdk)
