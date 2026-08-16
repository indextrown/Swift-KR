---
title: MapKit Annotation·Overlay·클러스터링
description: SwiftUI Marker·Annotation·Overlay와 UIKit MKAnnotationView 자동 클러스터링을 비교하고 데이터 규모에 맞는 지도 표현 방법을 설명합니다.
pageType: doc-wide
outline: false
---

# MapKit Annotation·Overlay·클러스터링

> 면접용 한 줄 요약: **한 지점의 정보와 선택은 Annotation, 선·면처럼 지리 범위를 가진 데이터는 Overlay로 표현하고, 겹치는 대량 지점은 `MKAnnotationView.clusteringIdentifier`로 묶습니다.**

## 먼저 점·선·면을 구분해요

| 데이터    | SwiftUI MapKit            | UIKit MapKit                       | 대표 예시               |
| --------- | ------------------------- | ---------------------------------- | ----------------------- |
| 한 지점   | `Marker`, `Annotation`    | `MKAnnotation`, `MKAnnotationView` | 매장, 정류장, 사고 지점 |
| 현재 위치 | `UserAnnotation`          | `MKUserLocation`                   | 사용자 위치와 정확도    |
| 선        | `MapPolyline`             | `MKPolyline`, `MKPolylineRenderer` | 경로, 산책로            |
| 닫힌 면   | `MapPolygon`              | `MKPolygon`, `MKPolygonRenderer`   | 배달 가능 구역          |
| 원        | `MapCircle`               | `MKCircle`, `MKCircleRenderer`     | 반경 검색 범위          |
| 타일      | SwiftUI 전용 content 없음 | `MKTileOverlay`, Renderer          | 날씨·지적도 타일        |

Annotation과 Overlay는 둘 다 지도 위에 보이지만 수명과 렌더링 구조가 다릅니다. 경로의 모든 좌표를 작은 Annotation 수백 개로 만들지 마세요.

## `Marker`는 표준 핀을 빠르게 만들어요

```swift
Map {
  Marker(
    "서울시청",
    systemImage: "building.columns.fill",
    coordinate: .init(latitude: 37.5666, longitude: 126.9784)
  )
  .tint(.blue)
}
```

검색 결과가 `MKMapItem`이라면 `Marker(item:)`을 사용해 장소 이름과 Apple Maps의 아이콘·색 정보를 활용할 수 있어요.

```swift
Map {
  ForEach(searchResults, id: \.self) { item in
    Marker(item: item)
  }
}
```

표준 장소 표현에는 `Marker`를 먼저 선택하세요. 모든 핀을 custom SwiftUI View로 만들면 레이아웃과 렌더링 비용이 커질 수 있습니다.

## `Annotation`은 custom View가 필요할 때 사용해요

```swift
Annotation(
  "예약 가능",
  coordinate: place.coordinate,
  anchor: .bottom
) {
  VStack(spacing: 2) {
    Text("3석")
      .font(.caption.bold())
      .padding(6)
      .background(.blue, in: Capsule())
      .foregroundStyle(.white)

    Image(systemName: "mappin")
      .foregroundStyle(.blue)
  }
  .accessibilityLabel("\(place.name), 예약 가능 3석")
}
```

`anchor: .bottom`은 custom View의 아래쪽을 좌표에 맞춥니다. 화면에 보이는 말풍선 전체의 중심을 좌표에 놓는 실수를 피할 수 있어요. 텍스트와 선택 상태가 있는 custom View에는 VoiceOver label도 함께 설계합니다.

## 선택은 콘텐츠의 정체성과 연결해요

```swift
@State private var selectedID: String?

Map(selection: $selectedID) {
  ForEach(places) { place in
    Marker(place.name, coordinate: place.coordinate)
      .tag(place.id)
  }
}
```

좌표는 변경될 수 있으므로 장소 ID로 선택을 추적하는 편이 안전합니다. 선택된 핀을 별도 배열로 복제하기보다 `selectedID`에서 표현을 계산하세요.

## 경로와 영역은 Overlay로 그려요

```swift
Map {
  MapPolyline(coordinates: routeCoordinates)
    .stroke(.blue, style: StrokeStyle(lineWidth: 6, lineCap: .round))

  MapCircle(
    center: .init(latitude: 37.5666, longitude: 126.9784),
    radius: 500
  )
  .foregroundStyle(.blue.opacity(0.12))
  .stroke(.blue.opacity(0.6), lineWidth: 2)
}
```

직선 좌표 배열은 `MapPolyline(coordinates:)`, 계산된 길 안내는 `MapPolyline(route)`로 표시할 수 있어요. 아주 먼 두 지점의 최단 곡선을 표현하려면 contour style의 `.geodesic`을 검토합니다.

Overlay의 터치 영역은 선 두께와 일치하지 않을 수 있어요. 경로 선택이 핵심이면 접근 가능한 목록이나 버튼을 함께 제공하고, 화면 좌표 변환 뒤 선과의 거리를 계산하는 별도 hit testing 정책을 둡니다.

## UIKit 자동 클러스터링은 View 식별자로 켜요

MapKit은 같은 `clusteringIdentifier`를 가진 Annotation View가 화면에서 충돌하면 여러 지점을 `MKClusterAnnotation` 하나로 바꿉니다.

```swift
final class MapCoordinator: NSObject, MKMapViewDelegate {
  private let placeID = "place"

  func registerViews(on mapView: MKMapView) {
    mapView.register(
      MKMarkerAnnotationView.self,
      forAnnotationViewWithReuseIdentifier: placeID
    )
    mapView.register(
      MKMarkerAnnotationView.self,
      forAnnotationViewWithReuseIdentifier:
        MKMapViewDefaultClusterAnnotationViewReuseIdentifier
    )
  }

  func mapView(
    _ mapView: MKMapView,
    viewFor annotation: any MKAnnotation
  ) -> MKAnnotationView? {
    guard !(annotation is MKUserLocation) else {
      return nil
    }

    if annotation is MKClusterAnnotation {
      let cluster = mapView.dequeueReusableAnnotationView(
        withIdentifier: MKMapViewDefaultClusterAnnotationViewReuseIdentifier,
        for: annotation
      ) as? MKMarkerAnnotationView
      cluster?.markerTintColor = .systemIndigo
      return cluster
    }

    let marker = mapView.dequeueReusableAnnotationView(
      withIdentifier: placeID,
      for: annotation
    ) as? MKMarkerAnnotationView
    marker?.clusteringIdentifier = "places"
    marker?.displayPriority = .defaultHigh
    marker?.canShowCallout = true
    return marker
  }
}
```

기본값 `nil`은 클러스터링에 참여하지 않는다는 뜻이에요. 서로 다른 종류를 별도 그룹으로 묶고 싶다면 `"restaurants"`, `"stations"`처럼 식별자를 나눕니다.

## 클러스터 표시를 custom으로 만들 수 있어요

delegate의 `mapView(_:clusterAnnotationForMemberAnnotations:)`에서 cluster 데이터 구성을 바꾸거나 custom `MKAnnotationView`에서 `MKClusterAnnotation.memberAnnotations`를 읽어 개수와 유형 비율을 표시할 수 있어요.

```swift
final class CountClusterView: MKMarkerAnnotationView {
  override func prepareForDisplay() {
    super.prepareForDisplay()

    guard let cluster = annotation as? MKClusterAnnotation else {
      return
    }

    glyphText = String(cluster.memberAnnotations.count)
    markerTintColor = .systemIndigo
    displayPriority = .defaultHigh
  }
}
```

재사용되므로 `prepareForDisplay()`에서 이전 cluster의 모든 가변 상태를 다시 설정해야 합니다.

## SwiftUI `Map`의 클러스터링 경계를 알아둬요

현재 SwiftUI `MapContent`의 `Marker`와 `Annotation`에는 UIKit의 `clusteringIdentifier`에 해당하는 공개 설정이 없습니다. 이 판단은 SwiftUI API 목록과 UIKit 클러스터링 API를 비교한 결과예요.

클러스터링이 꼭 필요하면 두 방법을 검토합니다.

1. `MKMapView`를 `UIViewRepresentable`로 감싸 시스템 자동 클러스터링을 사용해요.
2. 화면 영역과 확대 수준에 따라 앱 모델에서 지점을 미리 묶고, 결과 cluster를 SwiftUI Marker로 표현해요.

두 번째 방식은 반경·확대 수준·animation·selection을 모두 앱이 책임져야 합니다. 단순히 핀이 많다는 이유만으로 즉시 custom 알고리즘을 만들기보다 실제 기기에서 가독성과 frame time을 측정하고 `MKMapView`도 비교하세요.

## 표시 우선순위는 클러스터링과 별개예요

`displayPriority`는 Annotation이 겹칠 때 무엇을 먼저 보일지 정합니다. `collisionMode`는 충돌 영역을 사각형이나 원으로 판단하게 해요. 둘은 “같은 그룹으로 합친다”는 `clusteringIdentifier`와 역할이 다릅니다.

```text
clusteringIdentifier ──> 겹친 View를 하나의 cluster로 묶을 수 있는가?
displayPriority ───────> 겹쳤을 때 어떤 Annotation을 우선 보일 것인가?
collisionMode ─────────> 화면상의 충돌 영역을 어떤 모양으로 판단할 것인가?
```

## 체크리스트

- [ ] 한 점은 Annotation, 선·면은 Overlay로 표현하나요?
- [ ] 표준 핀으로 충분할 때 custom View를 만들지 않나요?
- [ ] 선택과 갱신에 안정적인 장소 ID를 사용하나요?
- [ ] UIKit leaf View에 non-nil `clusteringIdentifier`를 설정했나요?
- [ ] cluster와 leaf 재사용 View 상태를 매번 초기화하나요?
- [ ] 대량 핀 전후 성능을 실제 기기에서 측정했나요?

## 면접에서 이어질 수 있는 질문

### `MKAnnotation`과 `MKOverlay`는 어떻게 다른가요?

Annotation은 특정 좌표의 점 정보와 선택 UI에 적합하고, Overlay는 선·면처럼 지도상의 넓은 영역을 나타냅니다. UIKit에서는 각각 재사용 Annotation View와 Overlay Renderer가 화면 표현을 담당해요.

### MapKit 자동 클러스터링은 언제 발생하나요?

같은 non-nil `clusteringIdentifier`를 가진 Annotation View들이 화면에서 충돌할 때 MapKit이 `MKClusterAnnotation`으로 대체합니다. 원본 Annotation 데이터가 삭제되는 것은 아니며 확대하면 다시 개별 View로 나타날 수 있어요.

## 참고 자료

- [SwiftUI Marker 공식 문서](https://developer.apple.com/documentation/mapkit/marker)
- [SwiftUI Annotation 공식 문서](https://developer.apple.com/documentation/mapkit/annotation)
- [MapPolyline 공식 문서](https://developer.apple.com/documentation/mapkit/mappolyline)
- [MapKit Annotation Clustering 공식 예제](https://developer.apple.com/documentation/mapkit/decluttering-a-map-with-mapkit-annotation-clustering)
- [MKAnnotationView.clusteringIdentifier 공식 문서](https://developer.apple.com/documentation/mapkit/mkannotationview/clusteringidentifier)
- [MKClusterAnnotation 공식 문서](https://developer.apple.com/documentation/mapkit/mkclusterannotation)
