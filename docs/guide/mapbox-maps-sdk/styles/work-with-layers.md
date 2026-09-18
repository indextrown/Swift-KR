---
title: Swift로 이해하는 Source와 Layer 관리
description: Mapbox Source와 Layer의 연결·생성·수정·제거 순서를 살펴보고 UIKit 예제로 리소스 ID, Standard 슬롯, 지형 렌더링 순서와 데이터 유형을 정리해요.
source: https://docs.mapbox.com/ios/maps/guides/styles/work-with-layers/
reviewed: '2026-09-19'
---

# Swift로 이해하는 Source와 Layer 관리

> **면접 답변 한 줄 요약:** Source는 지리 데이터를 제공하고 Layer는 표현을 정하며, 명령형 관리에서는 참조 순서와 스타일 수명에 맞춰 두 리소스를 생성·갱신·정리해야 해요.

공식 [Work with sources and layers](https://docs.mapbox.com/ios/maps/guides/styles/work-with-layers/)에 대응해요. [첫 데이터 연결](../add-your-data/style-layers.md) 다음 단계로, UIKit에서 픽업 지점 표시를 관리해요.

## 먼저 알아둘 용어

| 용어   | 쉬운 뜻                                                            |
| ------ | ------------------------------------------------------------------ |
| Source | 지리 데이터 공급원이에요.                                          |
| Layer  | 데이터를 그릴 모양과 색 등의 규칙이에요.                           |
| Slot   | Standard가 제공하는 삽입 위치예요.                                 |
| DEM    | Digital Elevation Model의 약자로, 지표 높이를 표현하는 데이터예요. |

## 데이터 종류와 표현 종류를 맞춰요

[공식 가이드](https://docs.mapbox.com/ios/maps/guides/styles/work-with-layers/)에서 다루는 Source는 Vector, GeoJSON, Raster, Raster DEM, Image예요. 다음은 선택을 위한 축약표예요.

| 표현할 데이터       | 대표 Layer              |
| ------------------- | ----------------------- |
| 점·지점 밀도        | Circle, Symbol, Heatmap |
| 경로                | Line                    |
| 영역·높이 있는 영역 | Fill, FillExtrusion     |
| 영상·높이 음영      | Raster, Hillshade       |
| 배경·하늘           | Background, Sky         |

“매장은 점”이라는 데이터 의미와 “아이콘 대신 원으로 표시”라는 디자인 결정을 분리해요.

## Source를 만든 뒤 Layer를 연결해요

다음 함수는 **스타일 로딩을 확인한 뒤, 해당 ID가 없는 상태에서 한 번** 호출하는 작성 예제예요. `FeatureCollection`은 호출자가 준비해요. 스타일 이벤트 구독과 화면 수명 관리는 생략했어요.

```swift
import MapboxMaps
import Turf
import UIKit

/// 매장 데이터와 원 레이어를 현재 스타일에 추가해요.
/// - Parameters:
///   - mapView: 스타일 로딩이 끝난 지도예요.
///   - stores: 점 Feature로 구성한 매장 데이터예요.
/// - Throws: 데이터 공급원 또는 레이어 추가에 실패하면 오류를 전달해요.
@MainActor
func installStoreDots(
    on mapView: MapView,
    stores: FeatureCollection
) throws {
    var source = GeoJSONSource(id: "stores")
    source.data = .featureCollection(stores)
    try mapView.mapboxMap.addSource(source)

    var layer = CircleLayer(id: "store-dots", source: "stores")
    layer.circleRadius = .constant(7)
    layer.circleColor = .constant(StyleColor(.systemTeal))

    do {
        try mapView.mapboxMap.addLayer(layer)
    } catch {
        // 방금 추가한 전용 Source를 가능한 범위에서 정리해요.
        try? mapView.mapboxMap.removeSource(withId: "stores")
        throw error
    }
}
```

이름 충돌과 실패를 숨기지 않도록 `throws`로 전달해요. 롤백도 실패할 수 있으므로 실제 앱에서는 남은 리소스 상태와 정리 실패 로그를 함께 점검해야 해요.

## 표현만 바뀌면 Layer만 수정해요

다음 함수는 기존 `store-dots`를 새로 만들지 않고 반지름만 바꿔요.

```swift
/// 기존 매장 원의 강조 크기를 변경해요.
/// - Parameters:
///   - mapView: store-dots 레이어가 있는 지도예요.
///   - emphasized: 큰 원으로 강조하려면 true예요.
/// - Throws: 레이어 조회·타입 확인·속성 갱신 실패를 전달해요.
@MainActor
func setStoreEmphasis(
    on mapView: MapView,
    emphasized: Bool
) throws {
    try mapView.mapboxMap.updateLayer(withId: "store-dots", type: CircleLayer.self) { layer in
        layer.circleRadius = .constant(emphasized ? 11 : 7)
    }
}
```

매장 좌표가 바뀌는 상황이라면 Source 데이터를 갱신해야 해요. 반지름 변경 때문에 좌표를 다시 내려받을 이유는 없어요.

제거할 때는 참조하는 Layer부터 제거하고, 다른 Layer가 사용하지 않는 Source를 정리해요. `removeLayer(withId:)`와 `removeSource(withId:)`는 별도 호출이에요. [StyleManager API 구현](https://github.com/mapbox/mapbox-maps-ios/blob/11.31.0/Sources/MapboxMaps/Style/StyleManager.swift)

## 런타임 추가·수정·제거 순서를 완성해요

공식 가이드의 명령형 흐름을 한 사이클로 정리하면 다음과 같아요.

1. 스타일 로딩 완료 뒤 Source ID와 Layer ID 충돌을 확인해요.
2. `addSource`로 데이터를 먼저 등록해요.
3. `addLayer`로 그 Source를 참조하는 표현을 추가하고 위치를 지정해요.
4. 데이터가 바뀌면 GeoJSON Source를, 표현이 바뀌면 `updateLayer`를 갱신해요.
5. 제거할 때는 참조 Layer를 먼저 제거하고 더 이상 공유되지 않는 Source를 제거해요.

한 속성만 바꾸려 해도 먼저 Layer의 구체 타입을 알아야 해요. `CircleLayer`를 `LineLayer.self`로 갱신하려 하면 실패해요. 스타일이 교체되면 같은 ID라도 이전 객체가 아니라 새 스타일의 리소스이므로 style loaded 이후 다시 확인해요.

## Source 종류의 입력 계약을 확인해요

| Source     | 입력 계약과 대표 용도                                           |
| ---------- | --------------------------------------------------------------- |
| Vector     | Mapbox Tileset·TileJSON과 내부 `source-layer`; 큰 지리 데이터   |
| GeoJSON    | URL·FeatureCollection·Geometry; 앱이 만드는 점·선·면과 클러스터 |
| Raster     | 이미지 타일 URL·TileJSON; 위성·스캔 지도                        |
| Raster DEM | 고도 타일; Hillshade와 Terrain                                  |
| Image      | 이미지 한 장과 네 모서리 좌표; 과거 지도·평면도 오버레이        |

Vector Source ID와 타일 안의 `source-layer` 이름은 다르며 둘 다 맞아야 해요. GeoJSON은 편리하지만 큰 전체 문서를 자주 교체하면 직렬화·전송 비용이 커질 수 있어 부분 갱신이나 타일 기반 전환을 검토해요.

## Layer 종류를 표현 목적에 맞춰요

| Layer         | 그리는 대상                            |
| ------------- | -------------------------------------- |
| Fill          | Polygon 면                             |
| Line          | 경로·경계선                            |
| Symbol        | 아이콘·텍스트                          |
| Circle        | Point를 화면 픽셀 반지름의 원으로 표시 |
| FillExtrusion | 높이 있는 3D Polygon                   |
| Hillshade     | Raster DEM의 음영                      |
| Heatmap       | Point 밀도를 열 분포로 표시            |
| Raster        | 이미지 타일·Image Source               |
| Sky           | 지평선 위 하늘 표현                    |
| Background    | 지도 전체 배경색·패턴                  |

Layer마다 지원하는 Source·속성·최소/최대 줌이 달라요. 데이터 모양만 맞추는 데서 끝내지 않고 Style Specification의 해당 Layer 항목을 확인해요.

## 겹치는 순서는 Slot과 렌더링 조건을 함께 봐요

Standard에서는 `bottom`, `middle`, `top` 슬롯과 슬롯 안의 상대 순서를 사용해요. 배경 지도의 내부 ID에 의존하지 않는 것이 핵심이에요. 지구본이나 지형을 사용하는 경우 표면에 붙는 Layer들이 Symbol 아래로 묶여 그려질 수 있어요. [렌더링 순서](https://docs.mapbox.com/ios/maps/guides/styles/work-with-layers/#rendering-order)

Standard·Standard Satellite에서는 `slot`을 우선 사용하고, 슬롯 밖 사용자 Layer끼리만 `above`·`below` 상대 위치를 안정적으로 사용해요. 다른 스타일에서는 `LayerPosition`의 `at`, `above`, `below`로 기존 Layer를 기준 삼을 수 있어요. 드레이핑이 적용되는 Globe·Terrain에서는 Fill·Line·Background·Hillshade·Raster가 최적화를 위해 다른 순서로 묶일 수 있다는 제한도 함께 테스트해요.

보이지 않는다고 바로 색을 바꾸기보다 다음 순서로 원인을 좁혀봐요.

1. Source에 데이터가 있나요?
2. 좌표가 카메라 안에 있나요?
3. Layer 종류와 데이터 모양이 맞나요?
4. 필터·줌 범위·투명도가 가리지 않나요?
5. Slot과 지형 조건이 예상과 같은가요?

## 적용 체크리스트

- [ ] Source와 Layer ID를 기능별로 소유하나요?
- [ ] 생성 실패 후 남은 리소스를 확인하나요?
- [ ] 데이터 갱신과 표현 갱신을 구분하나요?
- [ ] 공유 Source를 너무 일찍 제거하지 않나요?
- [ ] 스타일 재로딩 뒤 복원 전략이 있나요?

## 면접에서 이어질 수 있는 질문

### Layer부터 추가하면 안 되나요?

데이터를 참조하는 Layer는 해당 Source가 먼저 필요해요. 명령형 코드에서는 순서를 지켜야 해요.

### 맨 나중에 추가한 Layer는 항상 맨 위인가요?

아니요. Slot과 지형·지구본의 렌더링 조건을 함께 봐야 해요. 코드 순서만으로 모든 시각적 겹침을 설명하지 않아요.

### 오류를 무시하고 다시 추가하면 되나요?

권하지 않아요. 일부 생성만 성공했을 수 있어요. 현재 상태를 확인하고 재시도 범위를 정해야 해요.

## 참고 자료

- [Mapbox — Work with sources and layers](https://docs.mapbox.com/ios/maps/guides/styles/work-with-layers/)
- [Mapbox Maps SDK 11.31.0 — StyleManager](https://github.com/mapbox/mapbox-maps-ios/blob/11.31.0/Sources/MapboxMaps/Style/StyleManager.swift)
