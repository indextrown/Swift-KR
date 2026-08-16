---
title: Mapbox 스타일·Source·Layer
description: Mapbox Style과 GeoJSON·Vector Source, Layer의 역할을 분리하고 SwiftUI 선언형 Map Styling으로 앱 데이터를 표현하고 갱신하는 방법을 설명합니다.
pageType: doc-wide
outline: false
---

# Mapbox 스타일·Source·Layer

> 면접용 한 줄 요약: **Source는 지도에 그릴 지리 데이터를 제공하고 Layer는 그 데이터를 표현하는 규칙을 정의하며, Style은 배경 지도와 여러 Source·Layer의 전체 구성을 묶습니다.**

## 먼저 알아둘 렌더링 용어

| 용어        | 쉬운 뜻                                                                   |
| ----------- | ------------------------------------------------------------------------- |
| Style       | 배경, 도로, 건물, 글꼴과 앱이 추가한 Layer까지 지도 모양 전체를 정의해요. |
| Source      | 좌표와 속성을 가진 원본 데이터를 지도 엔진에 공급해요.                    |
| Layer       | Source의 Feature를 원, 선, 면, 아이콘, 글자처럼 그리는 규칙이에요.        |
| GeoJSON     | 점·선·다각형과 속성을 JSON으로 표현하는 공개 지리 데이터 형식이에요.      |
| Vector Tile | 큰 지리 데이터를 확대 수준과 영역별 작은 타일로 나눈 벡터 형식이에요.     |
| Expression  | Feature 속성이나 zoom에 따라 색·크기 같은 Layer 값을 계산하는 식이에요.   |
| Layer order | 같은 위치에 여러 Layer가 있을 때 어느 것을 위에 그릴지 정하는 순서예요.   |

## 데이터와 표현을 한 타입에 섞으면 바꾸기 어려워요

산책 경로 좌표를 View가 직접 반복해 선 조각으로 만든다고 생각해 볼게요. 좌표가 많아질수록 View가 데이터 변환, 렌더링 선택, 색상 정책을 모두 맡게 됩니다.

Mapbox는 이를 두 책임으로 나눠요.

```text
FeatureCollection / GeoJSON / Vector Tile
                  │
                  ▼
               Source
                  │ source id
        ┌─────────┼─────────┐
        ▼         ▼         ▼
    LineLayer  CircleLayer  SymbolLayer
     경로 선     지점 원      아이콘·라벨
```

Source 하나를 여러 Layer가 공유할 수 있어요. 같은 매장 데이터에서 `CircleLayer`로 위치를 그리고 `SymbolLayer`로 이름을 올리는 식입니다.

## Style은 배경 지도의 시작점이에요

Maps SDK의 기본 Style은 Mapbox Standard입니다.

```swift
import MapboxMaps
import SwiftUI

struct StyledMap: View {
  @Environment(\.colorScheme) private var colorScheme

  var body: some View {
    Map()
      .mapStyle(
        .standard(
          lightPreset: colorScheme == .light ? .day : .dusk
        )
      )
  }
}
```

Mapbox Studio에서 만든 Style은 Style URI로 불러올 수 있어요.

```swift
extension MapStyle {
  static let brand = MapStyle(
    uri: StyleURI(
      rawValue: "mapbox://styles/example-account/example-style-id"
    )!
  )
}

struct BrandMap: View {
  var body: some View {
    Map()
      .mapStyle(.brand)
  }
}
```

실제 URI는 환경 설정에서 관리하고, 해당 Style을 읽을 수 있는 공개 Token scope를 확인합니다.

## SwiftUI에서는 Source와 Layer를 선언해요

서울의 두 지점을 연결하는 산책 경로를 `GeoJSONSource`와 `LineLayer`로 표현해 볼게요.

```swift
import MapboxMaps
import SwiftUI
import Turf

struct WalkingRouteMap: View {
  private let route = LineString([
    CLLocationCoordinate2D(latitude: 37.5666, longitude: 126.9784),
    CLLocationCoordinate2D(latitude: 37.5700, longitude: 126.9830),
    CLLocationCoordinate2D(latitude: 37.5729, longitude: 126.9769),
  ])

  var body: some View {
    Map(
      initialViewport: .overview(
        geometry: Geometry.lineString(route)
      )
    ) {
      GeoJSONSource(id: "walking-route-source")
        .data(.geometry(.lineString(route)))

      LineLayer(
        id: "walking-route-layer",
        source: "walking-route-source"
      )
      .lineColor(StyleColor(.systemBlue))
      .lineWidth(5)
      .lineCap(.round)
      .lineJoin(.round)
    }
  }
}
```

확인할 연결은 두 가지예요.

1. `LineLayer`의 `source` 문자열이 `GeoJSONSource`의 ID와 같아야 해요.
2. Source에는 선 geometry가 있고 이를 그릴 `LineLayer`를 선택해야 해요.

`FillLayer`에 점 Source를 연결하거나 ID를 오타 내면 원하는 결과가 나오지 않습니다.

## 선언형 Map Styling이 수명 주기를 관리해요

Mapbox Maps SDK v11.4부터 Source, Layer, Image, Light 같은 style primitive를 선언형으로 구성할 수 있어요. SwiftUI에서는 `Map` content에 선언하면 상태가 바뀔 때 필요한 차이를 반영하고 Style을 다시 불러온 뒤에도 선언된 content를 다시 연결합니다.

```swift
struct RouteStyle: MapStyleContent {
  let route: LineString
  let isHighlighted: Bool

  var body: some MapStyleContent {
    GeoJSONSource(id: "route-source")
      .data(.geometry(.lineString(route)))

    LineLayer(id: "route-layer", source: "route-source")
      .lineColor(
        isHighlighted
          ? StyleColor(.systemOrange)
          : StyleColor(.systemBlue)
      )
      .lineWidth(isHighlighted ? 8 : 4)
  }
}

struct RouteMap: View {
  let route: LineString
  @State private var isHighlighted = false

  var body: some View {
    Map {
      RouteStyle(
        route: route,
        isHighlighted: isHighlighted
      )
    }
    .overlay(alignment: .bottom) {
      Toggle("경로 강조", isOn: $isHighlighted)
        .padding()
        .background(.regularMaterial)
    }
  }
}
```

`MapStyleContent`로 관련 Source와 Layer를 묶으면 ID와 스타일 규칙을 재사용할 수 있어요. 단순한 한 화면에는 직접 선언하고, 여러 화면에서 같은 지도 표현을 쓸 때 컴포넌트로 추출합니다.

## Source 종류는 데이터가 만들어지는 방식으로 골라요

| Source            | 데이터 특성                            | 대표 사용                           |
| ----------------- | -------------------------------------- | ----------------------------------- |
| `GeoJSONSource`   | 앱 메모리, bundle 파일, URL의 점·선·면 | 실시간 장소, 경로, 작은·중간 데이터 |
| `VectorSource`    | 서버에서 영역·zoom별 vector tile 제공  | 도시·국가 규모의 큰 데이터          |
| `RasterSource`    | 이미 그려진 이미지 tile                | 위성, 날씨, 스캔 지도               |
| `RasterDemSource` | 지형 높이 데이터                       | 3D terrain, hillshade               |
| `ImageSource`     | 좌표 네 모서리에 한 이미지를 배치      | 평면도, 행사장 이미지               |

큰 GeoJSON 파일 전체를 매번 앱에서 내려받는 방식은 초기 로딩과 메모리 비용이 커져요. 데이터가 넓은 지역과 여러 zoom에 걸치면 Vector Tile이나 Mapbox Tileset으로 전처리하는 방식을 검토합니다.

## Layer는 geometry와 시각화 목적에 맞춰요

| Layer                | 그리는 것                         |
| -------------------- | --------------------------------- |
| `CircleLayer`        | 점을 화면 크기의 원으로 표현      |
| `SymbolLayer`        | 아이콘과 텍스트 라벨 표현         |
| `LineLayer`          | 경로, 도로, 경계선 표현           |
| `FillLayer`          | 다각형 내부 영역 표현             |
| `FillExtrusionLayer` | 높이가 있는 3D 면 표현            |
| `HeatmapLayer`       | 많은 점의 밀도를 연속 색으로 표현 |
| `RasterLayer`        | Raster Source 이미지를 표현       |

Layer 하나가 모든 역할을 맡게 하기보다 같은 Source를 여러 Layer가 읽게 하면 선택 상태나 라벨을 독립적으로 바꿀 수 있습니다.

## Expression으로 zoom과 속성에 반응해요

매장 Feature에 `isOpen` 속성이 있다면 영업 중인 매장을 다른 색으로 표시할 수 있어요.

```swift
CircleLayer(id: "stores-layer", source: "stores-source")
  .circleColor(
    .expression(
      Exp(.match) {
        Exp(.get) { "isOpen" }
        true
        UIColor.systemGreen
        UIColor.systemGray
      }
    )
  )
  .circleRadius(
    .expression(
      Exp(.interpolate) {
        Exp(.linear)
        Exp(.zoom)
        10
        4
        16
        10
      }
    )
  )
```

Expression은 Swift에서 Feature마다 색을 계산해 새 배열을 만드는 대신 렌더링 규칙을 지도 엔진에 전달합니다. 다만 복잡한 식은 디버깅 비용이 있으므로 속성 이름과 예상 타입을 문서화하세요.

## Mapbox Standard에서는 Layer 위치를 의식해요

Layer 순서는 겹침과 탭 우선순위를 결정합니다. Mapbox Standard와 Standard Satellite는 basemap을 style import로 구성하므로 앱이 만든 custom layer를 배치할 때 slot 개념을 사용합니다. 다른 Style에서 특정 layer ID 위아래에 놓는 방식과 동일하다고 가정하면 안 돼요.

[Source와 Layer 공식 가이드](https://docs.mapbox.com/ios/maps/guides/styles/work-with-layers/)의 현재 Style별 위치 지정 규칙을 확인하고 다음 요구를 먼저 정합니다.

- 경로가 도로 라벨 아래에 있어도 되나요?
- 선택 핀은 모든 지도 콘텐츠보다 위에 있어야 하나요?
- 3D 건물이나 terrain이 Layer 순서에 영향을 주나요?
- 탭할 Layer가 다른 Layer에 가려지지 않나요?

## Annotation과 Source·Layer 중 무엇을 선택하나요?

| 기준        | Annotation                             | Source + Layer                              |
| ----------- | -------------------------------------- | ------------------------------------------- |
| 시작 난이도 | 좌표와 스타일을 바로 선언해 낮음       | 데이터·표현 ID 연결이 필요해 높음           |
| 개별 스타일 | 각 Annotation별 설정이 편함            | 속성과 Expression으로 데이터 기반 설정      |
| 대량 데이터 | 종류에 따라 비효율적일 수 있음         | tile·GeoJSON과 renderer를 활용하기 좋음     |
| 클러스터링  | `PointAnnotationGroup`에서 간단히 시작 | cluster Source와 여러 Layer로 세밀하게 제어 |
| Layer 순서  | group modifier 범위에서 조절           | 전체 Style 구조에서 정밀하게 조절           |

핀 몇 개와 간단한 탭은 Annotation으로 시작해도 충분해요. 데이터가 크거나 줌별 스타일, 여러 Layer 공유, cluster 집계가 중요하면 Source·Layer 구조를 선택합니다.

## 흔한 오류를 진단해요

- Source와 Layer ID가 중복되거나 서로 다르지 않은지 확인해요.
- Source의 geometry 타입과 Layer 종류가 맞는지 확인해요.
- 앱에서 읽는 Feature 속성 이름과 실제 GeoJSON key가 같은지 확인해요.
- Style 변경 뒤 명령형으로 추가한 Layer가 사라지지 않았는지 확인해요.
- Mapbox Standard에서 custom Layer의 slot과 렌더링 순서를 확인해요.
- 큰 GeoJSON을 메인 스레드에서 반복 변환하고 있지 않은지 Instruments로 측정해요.

## 적용 순서를 정리해요

1. 지도에 표시할 데이터를 점·선·면과 속성으로 모델링해요.
2. 앱 크기라면 GeoJSON, 넓은 지역이라면 Vector Tile 등 Source를 골라요.
3. 하나의 Source에 안정적이고 고유한 ID를 정해요.
4. 원하는 표현마다 Layer를 나누고 같은 Source ID에 연결해요.
5. 색·크기가 데이터와 zoom에 따라 바뀌면 Expression을 추가해요.
6. Layer order와 탭 우선순위를 실제 Style에서 확인해요.
7. 데이터 규모가 커지면 로딩·메모리·프레임 시간을 측정해요.

## 면접에서 이어질 수 있는 질문

### 하나의 Source를 여러 Layer가 사용할 수 있나요?

네. Source는 데이터이고 Layer는 표현이므로 같은 매장 Source를 원, 아이콘, 라벨 Layer가 공유할 수 있습니다. 데이터 갱신과 표현 규칙을 분리할 수 있다는 것이 핵심이에요.

### 선언형 Styling과 명령형 `addLayer`의 차이는 무엇인가요?

선언형 방식은 현재 SwiftUI 상태가 어떤 Source와 Layer를 가져야 하는지 기술하고 SDK가 갱신과 Style reload 뒤 재연결을 맡습니다. 명령형 방식은 추가 순서와 중복, Style 수명 주기를 앱이 직접 관리해야 해요.

### 큰 GeoJSON을 그대로 사용하면 어떤 문제가 생기나요?

파일 다운로드, JSON 해석, 메모리 점유와 Source 갱신 비용이 커질 수 있습니다. 넓은 지역과 여러 확대 수준을 다루면 Vector Tile로 전처리하고 필요한 영역만 읽는 구조를 검토해야 해요.

## 참고 자료

- [Mapbox Map Styles 가이드](https://docs.mapbox.com/ios/maps/guides/styles/)
- [Source와 Layer 다루기](https://docs.mapbox.com/ios/maps/guides/styles/work-with-layers/)
- [Declarative Map Styling](https://docs.mapbox.com/ios/maps/guides/styles/declarative-map-styling/)
- [Mapbox Style Specification](https://docs.mapbox.com/style-spec/)
- [Mapbox Maps SDK SwiftUI 가이드](https://docs.mapbox.com/ios/maps/guides/swift-ui/)
- [GeoJSON Specification](https://datatracker.ietf.org/doc/html/rfc7946)
