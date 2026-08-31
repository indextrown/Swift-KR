---
title: Swift로 이해하는 스타일 레이어로 데이터 추가하기
description: 매장 GeoJSON을 Source로 제공하고 CircleLayer로 표현하는 예제를 통해 데이터와 스타일 분리, Vector Tile 선택, 좌표 순서와 로딩 실패 점검 기준을 배워요.
source: https://docs.mapbox.com/ios/maps/guides/add-your-data/style-layers/
reviewed: '2026-08-31'
---

# Swift로 이해하는 스타일 레이어로 데이터 추가하기

> **면접 답변 한 줄 요약:** Style Layer로 데이터를 추가한다는 것은 지리 데이터 공급원인 Source와 표현 규칙인 Layer를 연결해 지도 내부에서 여러 Feature를 함께 그리게 하는 일이에요.

공식 [Style layers](https://docs.mapbox.com/ios/maps/guides/add-your-data/style-layers/)에 대응해요. 이 페이지는 첫 데이터 연결에 집중하고, 생성·수정·제거는 [Source와 Layer 관리](../styles/work-with-layers.md)에서 이어가요.

## 먼저 알아둘 용어

| 용어         | 쉬운 뜻                                                      |
| ------------ | ------------------------------------------------------------ |
| GeoJSON      | 점·선·면과 속성을 JSON으로 표현하는 형식이에요.              |
| Vector Tile  | 지리 데이터를 영역별 조각으로 나누어 전달하는 형식이에요.    |
| Source ID    | 앱이 지도 안에서 데이터 공급원을 찾는 이름이에요.            |
| source-layer | Vector Tile 내부의 데이터 묶음 이름이며, Source ID와 달라요. |

## Source만 추가하면 아직 그림이 없어요

매장 데이터를 메모리에 읽었다고 버튼이 저절로 생기지 않는 것처럼, 지도 Source를 추가했다고 원하는 원이 바로 생기지는 않아요. 데이터를 참조하는 Layer가 필요해요.

공식 가이드는 GeoJSON과 Vector Source를 대표 선택지로 안내해요. GeoJSON은 한 데이터 집합을 전달하고, Vector Tile은 영역별 데이터를 다루므로 넓은 범위의 큰 데이터에 유리해요. [데이터 공급원 선택](https://docs.mapbox.com/ios/maps/guides/add-your-data/style-layers/#add-your-data-as-a-source)

## 두 매장을 하나의 규칙으로 표시해요

다음 작성 예제는 네트워크 주소와 이미지 없이 Source·Layer 연결만 확인하도록 구성했어요.

```swift
import CoreLocation
import MapboxMaps
import SwiftUI

struct StoreDataMap: View {
    private let stores = """
    {
      "type": "FeatureCollection",
      "features": [
        {
          "type": "Feature", "id": "city-hall",
          "geometry": { "type": "Point", "coordinates": [126.9780, 37.5665] },
          "properties": { "name": "시청점" }
        },
        {
          "type": "Feature", "id": "euljiro",
          "geometry": { "type": "Point", "coordinates": [126.9910, 37.5660] },
          "properties": { "name": "을지로점" }
        }
      ]
    }
    """

    var body: some View {
        Map(initialViewport: .camera(
            center: CLLocationCoordinate2D(latitude: 37.5665, longitude: 126.9840),
            zoom: 14
        )) {
            GeoJSONSource(id: "stores")
                .data(.string(stores))

            CircleLayer(id: "store-dots", source: "stores")
                .circleRadius(7)
                .circleColor(.systemTeal)
                .circleStrokeWidth(2)
                .circleStrokeColor(.white)
        }
    }
}
```

`stores`는 데이터 공급원 이름이고 `store-dots`는 표현 규칙 이름이에요. 같은 Source를 다른 Layer가 참조하면 원과 이름을 별도로 표현할 수도 있어요.

GeoJSON 좌표 배열은 **경도, 위도** 순서예요. Swift의 `CLLocationCoordinate2D(latitude:longitude:)` 호출 순서와 혼동하지 않아요.

## 데이터와 표현이 바뀌는 이유를 나눠요

다음은 이 예제를 확장하는 설계 연습이에요.

| 변경 요청           | 먼저 바꿀 대상                   |
| ------------------- | -------------------------------- |
| 새 매장 추가        | Feature 목록                     |
| 모든 원을 크게 표시 | Layer 반지름                     |
| 매장 이름을 표시    | 같은 Source를 참조할 SymbolLayer |
| 매장 종류별 색상    | Feature 속성과 Expression        |

매장 색상 변경 때문에 서버의 모든 좌표를 다시 요청하는 구조라면 데이터와 표현의 경계가 섞였는지 돌아봐요.

## 데이터가 커지면 운반 방식도 검토해요

큰 GeoJSON을 넘기는 것과 화면에 필요한 타일을 불러오는 것은 비용 구조가 달라요. 데이터 갱신 주기와 전체 범위에 따라 서버의 타일 생성 과정까지 설계해야 할 수 있어요.

타일을 사용한다면 URL뿐 아니라 내부 `source-layer` 이름을 확인해요. 이미지 기반 SymbolLayer는 이미지 준비도 필요하지만, 위의 CircleLayer는 이미지 자산 없이 원을 그려요. “모든 Style Layer에 이미지가 필수”라는 뜻은 아니에요.

## 적용 체크리스트

- [ ] GeoJSON의 경도·위도 순서가 맞나요?
- [ ] Layer가 존재하는 Source ID를 참조하나요?
- [ ] 데이터 모양과 Layer 종류가 맞나요?
- [ ] 큰 데이터는 준비·전달·표시 비용을 각각 측정했나요?
- [ ] 실패와 빈 결과를 같은 상태로 취급하지 않나요?

## 면접에서 이어질 수 있는 질문

### Source와 Layer의 ID는 같아야 하나요?

아니요. 서로 다른 역할의 이름이에요. Layer의 `source` 값이 연결할 Source ID와 일치해야 해요.

### Style Layer가 많으면 항상 빠른가요?

아니요. 데이터 크기뿐 아니라 그리기 규칙과 갱신 빈도에도 비용이 들어요. 측정 없이 Layer 수를 늘리는 것은 최적화가 아니에요.

### 지도에 추가하면 탭 이벤트도 완성되나요?

아니요. 표시와 상호작용은 구분해요. Feature 선택은 [상호작용 API](../user-interaction/interactions.md) 같은 별도 API와 연결해요.

## 참고 자료

- [Mapbox — Add your data: Style layers](https://docs.mapbox.com/ios/maps/guides/add-your-data/style-layers/)
