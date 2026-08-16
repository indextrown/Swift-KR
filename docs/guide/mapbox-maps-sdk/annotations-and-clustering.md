---
title: Mapbox Annotation과 클러스터링
description: Marker·View Annotation·Layer Annotation의 차이를 비교하고 PointAnnotationGroup과 GeoJSON Source로 많은 지점을 클러스터링하는 기준을 설명합니다.
pageType: doc-wide
outline: false
---

# Mapbox Annotation과 클러스터링

> 면접용 한 줄 요약: **소수의 개별 지점은 Annotation으로 빠르게 표현하고, 지점이 많아지면 Layer 기반 그룹이나 GeoJSON Source 클러스터링으로 draw call과 화면 겹침을 줄입니다.**

## 먼저 알아둘 표현 용어

| 용어             | 쉬운 뜻                                                                 |
| ---------------- | ----------------------------------------------------------------------- |
| Marker           | SwiftUI에서 기본 핀 모양을 빠르게 만드는 편의 API예요.                  |
| View Annotation  | 지도 좌표 위에 실제 SwiftUI View나 UIKit View를 배치해요.               |
| Layer Annotation | `PointAnnotation`, `CircleAnnotation`처럼 지도 Layer로 렌더링해요.      |
| Annotation Group | 여러 Annotation을 하나의 Layer 구성으로 묶어 효율과 공통 설정을 높여요. |
| 클러스터링       | 가까운 여러 점을 zoom 수준에 따라 하나의 그룹 점으로 합쳐요.            |
| cluster radius   | 화면상 어느 거리 안의 점을 같은 cluster로 볼지 정하는 반경이에요.       |

## 세 가지 표현 방법은 비용이 달라요

| 방식             | 장점                                          | 비용·제약                                              | 적합한 상황                           |
| ---------------- | --------------------------------------------- | ------------------------------------------------------ | ------------------------------------- |
| Marker           | 기본 핀 자산 없이 가장 빠르게 시작            | SwiftUI 전용이며 현재 experimental, 큰 데이터에 부적합 | 프로토타입과 적은 기본 핀             |
| View Annotation  | 임의의 SwiftUI View, 복잡한 상호작용          | 지도 Layer보다 무겁고 항상 지도 콘텐츠 위에 표시       | 선택 카드, 가격표, 소수의 복잡한 UI   |
| Layer Annotation | 지도 renderer가 처리하고 Layer 사이 배치 가능 | 이미지 자산과 지도 스타일 개념이 필요                  | 일반 핀, 선·면, 그룹·클러스터링       |
| Source + Layer   | 대량 데이터와 표현을 가장 세밀하게 제어       | 설정 코드와 ID 관리가 늘어남                           | 많은 지점, zoom별 집계, 데이터 시각화 |

[공식 SwiftUI 가이드](https://docs.mapbox.com/ios/maps/guides/swift-ui/)는 Layer Annotation이 보통 View Annotation보다 성능에 유리하고, `PointAnnotation`에 한해 클러스터링을 지원한다고 설명합니다.

## 한 개의 지점은 `PointAnnotation`으로 시작해요

```swift
import MapboxMaps
import SwiftUI

struct OnePlaceMap: View {
  private let cityHall = CLLocationCoordinate2D(
    latitude: 37.5666,
    longitude: 126.9784
  )

  var body: some View {
    Map(initialViewport: .camera(center: cityHall, zoom: 15)) {
      PointAnnotation(coordinate: cityHall)
        .image(named: "place-pin")
        .iconAnchor(.bottom)
        .onTapGesture { context in
          print("선택: \(context.coordinate)")
          return true
        }
    }
  }
}
```

`place-pin`은 Asset Catalog에 있는 이미지 이름이에요. 공식 Annotation 가이드는 `PointAnnotation`이 기본 핀 이미지를 제공하지 않으므로 앱이 자산을 준비해야 한다고 안내합니다.

## SwiftUI View가 꼭 필요할 때만 View Annotation을 사용해요

가격과 선택 상태를 SwiftUI로 꾸미고 싶다면 `MapViewAnnotation`을 사용할 수 있어요.

```swift
struct PriceTag: View {
  let price: Int

  var body: some View {
    Text("\(price.formatted())원")
      .font(.caption.bold())
      .padding(.horizontal, 8)
      .padding(.vertical, 5)
      .background(.white)
      .foregroundStyle(.black)
      .clipShape(Capsule())
      .shadow(radius: 2)
  }
}

Map {
  MapViewAnnotation(coordinate: cityHall) {
    PriceTag(price: 12_000)
  }
  .allowOverlap(false)
}
```

View Annotation은 UIKit/SwiftUI View 계층의 비용을 가져요. 지도에 가격표 수백 개를 항상 띄우기보다 화면 안의 선택 항목이나 제한된 수만 표시하고, 나머지는 Layer Annotation이나 cluster로 표현하는 방식을 검토합니다.

## 배열은 `PointAnnotationGroup`으로 묶어요

같은 종류의 장소를 안정적인 ID로 그룹에 전달합니다.

```swift
import MapboxMaps
import SwiftUI

struct Place: Identifiable {
  let id: UUID
  let name: String
  let coordinate: CLLocationCoordinate2D
}

struct PlacesMap: View {
  let places: [Place]

  var body: some View {
    Map {
      PointAnnotationGroup(places, id: \.id) { place in
        PointAnnotation(coordinate: place.coordinate)
          .image(named: "place-pin")
          .iconAnchor(.bottom)
      }
      .iconAllowOverlap(false)
    }
  }
}
```

Group은 여러 Annotation을 하나의 Layer로 렌더링하고 group 공통 설정을 적용할 수 있어요. 배열 index보다 서버 ID나 UUID처럼 삽입·삭제 후에도 같은 장소를 가리키는 식별자를 사용하세요.

## 기본 클러스터링은 `ClusterOptions`로 켜요

`PointAnnotationGroup`에 cluster 설정을 추가하면 가까운 지점을 묶을 수 있습니다.

```swift
Map {
  PointAnnotationGroup(places, id: \.id) { place in
    PointAnnotation(coordinate: place.coordinate)
      .image(named: "place-pin")
      .iconAnchor(.bottom)
  }
  .clusterOptions(
    ClusterOptions(
      circleRadius: .constant(22),
      circleColor: .constant(StyleColor(.systemBlue)),
      textColor: .constant(StyleColor(.white)),
      textSize: .constant(13),
      clusterRadius: 60,
      clusterMaxZoom: 14,
      clusterMinPoints: 2
    )
  )
}
```

- `clusterRadius`는 가까운 점을 어느 화면 반경까지 묶을지 정해요.
- `clusterMaxZoom`보다 더 확대하면 cluster를 풀어 개별 점을 보여줘요.
- `clusterMinPoints`는 몇 개부터 cluster로 만들지 정해요.
- 원 크기와 색은 Expression으로 `point_count`에 따라 바꿀 수 있어요.

cluster 옵션과 Layer 위치는 Group이 생성된 뒤 자유롭게 바꾸는 일반 View 상태와 다를 수 있어요. SDK 버전의 API Reference를 확인하고, 설정 자체가 바뀌어야 한다면 명시적인 identity 변경이나 Source·Layer 방식으로 수명 주기를 설계합니다.

## cluster를 누르면 확장 zoom으로 이동해요

사용자가 cluster를 눌렀을 때 무조건 `zoom + 1`을 적용하면 일부 점이 계속 겹칠 수 있어요. 지도 엔진이 계산한 cluster expansion zoom을 조회하는 편이 정확합니다.

```swift
MapReader { proxy in
  Map(viewport: $viewport) {
    TapInteraction(.layer("cluster-circle-layer")) { feature, context in
      proxy.map?.getGeoJsonClusterExpansionZoom(
        forSourceId: "places-source",
        feature: feature.originalFeature
      ) { result in
        guard
          case let .success(value) = result,
          let zoom = value.value as? Double
        else { return }

        withViewportAnimation(.easeIn(duration: 0.4)) {
          viewport = .camera(
            center: context.coordinate,
            zoom: zoom
          )
        }
      }

      return true
    }
  }
}
```

이 예제는 `places-source`와 `cluster-circle-layer`를 Source·Layer로 구성한 고급 방식의 interaction 부분이에요. `MapReader`로 내부 map에 cluster 질의를 보내고 결과로 카메라를 이동합니다.

## 고급 클러스터링은 Source와 세 Layer로 구성해요

색, 집계 속성, 탭 대상, 아이콘을 완전히 제어하려면 `GeoJSONSource`의 cluster를 켜고 보통 다음 Layer를 둡니다.

```text
GeoJSONSource(cluster = true)
  ├─ CircleLayer: point_count가 있는 cluster 원
  ├─ SymbolLayer: cluster 안의 point_count 글자
  └─ SymbolLayer: point_count가 없는 개별 지점 아이콘
```

핵심 설정은 다음과 같아요.

```swift
var source = GeoJSONSource(id: "places-source")
source.data = .featureCollection(placeFeatures)
source.cluster = true
source.clusterRadius = 60
source.clusterMaxZoom = 14

var clusters = CircleLayer(
  id: "cluster-circle-layer",
  source: "places-source"
)
clusters.filter = Exp(.has) { "point_count" }
clusters.circleRadius = .constant(22)
clusters.circleColor = .constant(StyleColor(.systemBlue))

var individualPlaces = CircleLayer(
  id: "individual-place-layer",
  source: "places-source"
)
individualPlaces.filter = Exp(.not) {
  Exp(.has) { "point_count" }
}
individualPlaces.circleRadius = .constant(7)
individualPlaces.circleColor = .constant(StyleColor(.systemOrange))
```

실제 지도에는 Source를 먼저 추가한 뒤 cluster 원, 개수 글자, 개별 지점 Layer를 순서대로 추가해야 해요. SwiftUI에서는 선언형 Map Styling으로 같은 구조를 표현할 수 있고, 명령형 API를 사용한다면 Style reload와 중복 ID를 직접 관리합니다.

## 클러스터링이 성능 문제를 모두 해결하지는 않아요

클러스터링은 화면에 그릴 점 수와 겹침을 줄이지만 원본 데이터 다운로드와 GeoJSON 해석 비용까지 없애지는 않습니다.

- 도시 전체 데이터를 하나의 거대한 GeoJSON으로 받는다면 network와 decoding 비용은 남아요.
- cluster Source를 매 프레임 새로 만들면 갱신 비용이 커져요.
- 이미지가 크고 다양하면 texture와 메모리 비용이 늘어요.
- 화면 밖 데이터까지 앱 메모리에 모두 유지하면 초기 로딩이 느려질 수 있어요.

데이터가 매우 크면 서버 측 Tileset이나 Vector Tile로 공간 분할하고, 현재 카메라 영역에 필요한 데이터만 읽는 구조를 검토하세요. 숫자 하나를 절대 기준으로 정하기보다 Instruments에서 로딩 시간, 메모리, 프레임 드롭과 실제 기기 성능을 측정합니다.

## 삭제와 선택 상태도 데이터로 표현해요

SwiftUI에서는 배열에서 `Place`가 사라지면 Group의 해당 Annotation도 사라져요. 지도 객체를 별도 Dictionary에 중복 저장하기보다 장소 배열을 single source of truth로 두는 편이 단순합니다.

선택 상태는 다음 중 하나로 표현할 수 있어요.

- 선택된 한 항목만 `MapViewAnnotation` 카드로 추가해요.
- 선택 여부를 Feature 속성으로 넣고 Expression에서 색을 바꿔요.
- 선택 Layer를 별도로 두어 일반 Layer 위에 그려요.

모든 핀을 View Annotation으로 바꾸는 방식은 선택 하나 때문에 전체 렌더링 비용을 높일 수 있습니다.

## 적용 기준을 정리해요

1. 소수의 단순 핀은 `PointAnnotation`으로 시작해요.
2. 같은 종류의 배열은 안정적인 ID를 가진 Group으로 묶어요.
3. 복잡한 SwiftUI UI는 화면에 필요한 소수만 View Annotation으로 올려요.
4. 점이 겹치기 시작하면 `ClusterOptions`로 기본 cluster를 적용해요.
5. cluster 색·집계·탭 동작이 복잡하면 GeoJSON Source와 Layer로 내려가요.
6. 원본 데이터가 크면 Vector Tile과 영역 단위 조회를 검토해요.
7. 실제 기기에서 프레임 시간과 메모리를 측정해 선택을 검증해요.

## 면접에서 이어질 수 있는 질문

### View Annotation이 Layer Annotation보다 느릴 수 있는 이유는 무엇인가요?

View Annotation은 각 항목이 UIKit·SwiftUI View 계층과 layout 비용을 가져요. Layer Annotation은 지도 renderer가 하나의 Layer에서 처리할 수 있어 많은 항목에 일반적으로 더 적합합니다.

### 클러스터링과 필터링은 어떤 차이가 있나요?

클러스터링은 가까운 여러 점을 zoom에 따라 집계 Feature로 바꾸고 `point_count` 같은 속성을 만듭니다. 필터링은 조건에 맞는 Feature만 특정 Layer가 그리게 할 뿐 여러 점을 하나로 합치지는 않아요.

### `PointAnnotationGroup`과 GeoJSON Source 방식 중 무엇을 선택하나요?

기본 cluster와 개별 Annotation 스타일이면 Group이 단순합니다. cluster별 Expression, 집계 속성, Layer 순서와 탭 동작을 세밀하게 제어하거나 데이터가 커지면 GeoJSON Source와 Layer 구성이 더 적합해요.

## 참고 자료

- [Mapbox Annotations 가이드](https://docs.mapbox.com/ios/maps/guides/add-your-data/annotations/)
- [Mapbox SwiftUI Annotation 가이드](https://docs.mapbox.com/ios/maps/guides/swift-ui/#annotations)
- [Mapbox SwiftUI 클러스터링 공식 예제](https://docs.mapbox.com/ios/maps/examples/swiftui-clustering/)
- [Map Content Gestures](https://docs.mapbox.com/ios/maps/guides/user-interaction/map-content-gestures/)
- [`PointAnnotationGroup` API Reference](https://docs.mapbox.com/ios/maps/api/latest/documentation/mapboxmaps/pointannotationgroup/)
- [`ClusterOptions` API Reference](https://docs.mapbox.com/ios/maps/api/latest/documentation/mapboxmaps/clusteroptions/)
- [Source와 Layer 다루기](https://docs.mapbox.com/ios/maps/guides/styles/work-with-layers/)
