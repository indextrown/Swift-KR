---
title: Swift로 이해하는 선언적 지도 스타일링
description: MapStyleContent와 setMapStyleContent로 지도 상태를 선언하고 SwiftUI·UIKit에서 재사용하는 예제를 통해 전체 콘텐츠 소유권, 갱신 비용과 Layer 순서를 정리해요.
source: https://docs.mapbox.com/ios/maps/guides/styles/declarative-map-styling/
reviewed: '2026-08-31'
---

# Swift로 이해하는 선언적 지도 스타일링

> **면접 답변 한 줄 요약:** 선언적 지도 스타일링은 추가·삭제 명령을 직접 맞추는 대신 현재 필요한 Source·Layer 구성을 선언하고 SDK가 변경분을 반영하도록 하는 방식이에요.

공식 [Declarative Map Styling](https://docs.mapbox.com/ios/maps/guides/styles/declarative-map-styling/)에 대응해요. 11.4.0부터 도입된 방식이며 이 문서는 SDK 11.29.1 기준으로 읽어요.

## 먼저 알아둘 용어

| 용어            | 쉬운 뜻                                                  |
| --------------- | -------------------------------------------------------- |
| 선언적 구성     | 최종적으로 어떤 상태여야 하는지 표현하는 방식이에요.     |
| Primitive       | Source·Layer·조명 같은 작은 스타일 구성 요소예요.        |
| MapStyleContent | 여러 스타일 요소를 한 구성으로 묶는 규약이에요.          |
| Reconciliation  | 이전 구성과 새 구성을 비교해 차이를 반영하는 과정이에요. |

## 추가와 제거 명령이 어긋나는 문제를 줄여요

필터를 켤 때 Source와 Layer를 추가하고, 끌 때 제거하는 코드를 여러 곳에 작성하면 순서가 어긋날 수 있어요. 화면이 원하는 상태를 한곳에서 선언하면 누가 표시를 결정하는지 드러나요.

공식 가이드는 SwiftUI의 `Map` 콘텐츠와 UIKit의 `setMapStyleContent`를 제공해요. 선언한 내용은 스타일 로딩 후 적용되므로 이를 위해 별도 로딩 이벤트를 기다릴 필요는 없어요. [시작 방법](https://docs.mapbox.com/ios/maps/guides/styles/declarative-map-styling/#getting-started)

## 작은 스타일 구성 요소를 만들어요

다음은 매장 표시를 묶는 작성 예제예요. `stores`는 호출자가 준비한 점 Feature 목록이고, `visible`은 화면의 필터 상태예요.

```swift
import MapboxMaps
import Turf
import UIKit

struct StoreStyleContent: MapStyleContent {
    let stores: FeatureCollection
    let visible: Bool

    var body: some MapStyleContent {
        if visible {
            GeoJSONSource(id: "stores")
                .data(.featureCollection(stores))

            CircleLayer(id: "store-dots", source: "stores")
                .circleColor(.systemTeal)
                .circleRadius(7)
        }
    }
}
```

구성 요소는 데이터를 입력받기만 해요. 앱의 선택 상태를 직접 저장하거나 `MapView`를 소유하지 않아요.

## UIKit에서는 전체 선언을 전달해요

앞에서 만든 구성 요소를 전달하는 함수예요. 이 예제 지도에는 매장 외의 선언적 콘텐츠가 없다고 가정해요.

```swift
/// 지도에 필요한 매장 스타일 구성을 갱신해요.
/// - Parameters:
///   - mapView: 구성을 적용할 지도예요.
///   - stores: 현재 표시 대상인 매장 데이터예요.
///   - showStores: 매장 Source와 Layer를 표시하려면 true예요.
@MainActor
func renderStoreStyle(
    on mapView: MapView,
    stores: FeatureCollection,
    showStores: Bool
) {
    mapView.mapboxMap.setMapStyleContent {
        StoreStyleContent(stores: stores, visible: showStores)
    }
}
```

`setMapStyleContent`는 “이번에 바뀐 Layer만 추가”하는 호출이 아니에요. 매번 **현재 필요한 전체 선언적 구성**을 포함해야 해요. 서로 다른 기능이 각자 호출하면 다른 기능의 선언을 빠뜨릴 수 있어요. [StyleManager 계약](https://github.com/mapbox/mapbox-maps-ios/blob/11.29.1/Sources/MapboxMaps/Style/StyleManager.swift)

## SwiftUI에서는 화면 상태를 입력으로 줘요

같은 구성 요소를 `Map` 안에서도 사용할 수 있어요. SwiftUI만 위한 구성 요소라면 `MapContent`도 검토해요.

```swift
import SwiftUI

struct DeclarativeStoreMap: View {
    let stores: FeatureCollection
    @State private var showStores = true

    var body: some View {
        VStack {
            Map {
                StoreStyleContent(stores: stores, visible: showStores)
            }
            Toggle("매장 표시", isOn: $showStores)
                .padding()
        }
    }
}
```

화면이 상태를 소유하고 구성 요소는 값으로 받아요. 스타일 콘텐츠 안에 `@State`를 넣어 또 다른 상태 저장소를 만드는 방식은 피하라는 것이 공식 가이드의 권장 사항이에요.

## 순서와 성능은 여전히 설계해야 해요

Layer는 Slot 위치를 먼저 고려하고 같은 Slot 안에서는 선언 순서를 따라요. 더 세밀한 삽입에는 `SlotLayer`를 사용할 수 있어요. 실제 뷰인 View Annotation은 Layer와 같은 삽입 모델이 아니에요. [콘텐츠 위치](https://docs.mapbox.com/ios/maps/guides/styles/declarative-map-styling/#content-positioning)

전체 구성을 선언해도 모든 항목을 매번 제거하고 다시 추가하는 것은 아니에요. 다만 큰 GeoJSON과 잦은 상태 변경은 비교 비용을 만들 수 있어요. 공식 가이드는 작은 구성 요소로 나누는 최적화를 설명해요.

설계 제안으로 검색 결과 데이터와 단순 토글 상태를 구분해서 측정해요. “선언적이므로 공짜”나 “함수 호출마다 지도 전체 재생성”이라는 두 극단을 모두 피해야 해요.

## 적용 체크리스트

- [ ] 전체 선언을 조합하는 소유자가 하나인가요?
- [ ] Source와 Layer가 같은 조건에서 나타나고 사라지나요?
- [ ] 같은 리소스 ID를 명령형 코드에서도 수정하지 않나요?
- [ ] 구성 요소가 MapView를 강하게 소유하지 않나요?
- [ ] 큰 데이터가 관계없는 UI 상태 변화마다 비교되는지 측정했나요?

## 면접에서 이어질 수 있는 질문

### UIKit에서도 선언적 스타일링을 사용할 수 있나요?

네. 화면 프레임워크와 스타일 구성 방식은 별개예요. `setMapStyleContent`에 현재 구성을 전달해요.

### 전체 구성을 전달하면 전체 지도를 다시 만드나요?

그렇지 않아요. SDK가 변경을 비교해 반영해요. 비교 자체의 비용은 별도로 측정할 필요가 있어요.

### 두 화면 기능이 각각 호출해도 되나요?

같은 지도라면 주의해야 해요. 각 호출이 전체 선언을 나타내므로 한곳에서 여러 기능의 콘텐츠를 조합하는 편이 안전해요.

## 참고 자료

- [Mapbox — Declarative Map Styling](https://docs.mapbox.com/ios/maps/guides/styles/declarative-map-styling/)
- [Mapbox Maps SDK 11.29.1 — StyleManager](https://github.com/mapbox/mapbox-maps-ios/blob/11.29.1/Sources/MapboxMaps/Style/StyleManager.swift)
- [Mapbox Maps SDK 11.29.1 — MapStyleContent](https://github.com/mapbox/mapbox-maps-ios/blob/11.29.1/Sources/MapboxMaps/ContentBuilders/MapStyleContent/MapStyleContent.swift)
