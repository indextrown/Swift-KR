---
title: Swift로 이해하는 Mapbox Maps SDK for iOS
description: Mapbox Maps SDK의 지도 렌더링 구조와 Navigation·Search SDK의 경계를 구분하고 설치부터 오프라인 지도까지의 학습 순서를 정리합니다.
pageType: doc-wide
outline: false
---

# Swift로 이해하는 Mapbox Maps SDK for iOS

> 면접용 한 줄 요약: **Mapbox Maps SDK는 Style이 참조하는 지리 데이터를 Source에서 읽어 Layer 규칙대로 Metal로 그리며, SwiftUI에서는 `Map`과 `Viewport`로 화면과 카메라를 선언적으로 구성하는 지도 렌더링 SDK입니다.**

## 먼저 제품의 역할부터 구분해요

Mapbox에는 지도 화면 외에도 검색, 길 안내, 지도 디자인을 담당하는 제품이 있어요. Maps SDK 하나를 설치했다고 장소 검색이나 턴 바이 턴 내비게이션까지 자동으로 생기지는 않습니다.

| 만들 기능               | 선택할 제품                | 핵심 역할                                  |
| ----------------------- | -------------------------- | ------------------------------------------ |
| 앱 안의 대화형 지도     | Maps SDK for iOS           | 지도 렌더링, 카메라, 제스처, 데이터 표현   |
| 주소·장소 검색          | Search SDK 또는 Search API | 검색어와 주변 위치를 장소 결과로 변환      |
| 경로 계산과 길 안내     | Navigation SDK             | 경로, 진행 상태, 음성 안내와 내비게이션 UI |
| 지도의 색·데이터 디자인 | Mapbox Studio              | Style과 Tileset을 웹에서 제작·게시         |
| 고정된 지도 이미지      | Static Images API          | 상호작용 없는 지도 이미지를 생성           |

앱의 전체 흐름을 단순화하면 다음과 같아요.

```text
SwiftUI Map / UIKit MapView
          │
          ▼
       Map Style
          │
    ┌─────┴─────┐
    ▼           ▼
  Source      Layer
(어디의 어떤 데이터)  (어떻게 그릴지)
    └─────┬─────┘
          ▼
      Metal 렌더링

검색어 ──> Search SDK/API ──> 좌표·장소 ──> Maps SDK에 표현
목적지 ──> Navigation SDK ──> 경로·안내 ──> 지도 위에 표현
```

[공식 Maps SDK 저장소](https://github.com/mapbox/mapbox-maps-ios)는 SDK가 Mapbox Style Specification에 맞는 스타일과 Vector Tile 데이터를 받아 Metal로 렌더링한다고 설명합니다. 지도 화면은 Maps SDK가 맡고, 검색이나 경로 계산 결과를 지도에 어떻게 보여줄지는 앱이 연결해요.

## 먼저 알아둘 용어

| 용어         | 쉬운 뜻                                                                                |
| ------------ | -------------------------------------------------------------------------------------- |
| Style        | 배경 지도와 데이터의 색, 글꼴, 배치, 표시 규칙을 묶은 지도 설계도예요.                 |
| Source       | GeoJSON, Vector Tile, Raster처럼 지도에 그릴 원본 데이터를 제공해요.                   |
| Layer        | Source의 점·선·면을 어떤 색과 크기, 순서로 그릴지 정해요.                              |
| Feature      | 위치와 속성을 함께 가진 지리 데이터 한 건이에요.                                       |
| Annotation   | 좌표에 핀, 원, 선, 다각형이나 SwiftUI View를 비교적 간단히 올리는 API예요.             |
| Camera       | 지도에서 바라보는 중심 좌표, 확대 수준, 회전, 기울기, 여백을 묶은 상태예요.            |
| Viewport     | 고정 카메라, 사용자 위치 추적, 영역 전체 보기처럼 카메라의 목적을 나타내는 추상화예요. |
| Access Token | Mapbox 리소스를 어떤 권한으로 요청할 수 있는지 나타내는 문자열이에요.                  |

## Mapbox의 강점은 데이터와 표현을 분리하는 데 있어요

장소 세 곳을 지도에 표시한다고 생각해 볼게요. 작은 데이터라면 `PointAnnotation`으로 빠르게 시작할 수 있습니다. 데이터가 커지거나 줌 수준에 따라 모양을 바꾸려면 Source와 Layer를 사용해요.

```swift
import MapboxMaps
import SwiftUI

struct StoreMap: View {
  private let cityHall = CLLocationCoordinate2D(
    latitude: 37.5666,
    longitude: 126.9784
  )

  var body: some View {
    Map(initialViewport: .camera(center: cityHall, zoom: 13)) {
      PointAnnotation(coordinate: cityHall)
        .image(named: "store-pin")
        .iconAnchor(.bottom)
    }
    .mapStyle(.standard)
  }
}
```

이 예제에서 좌표와 이미지가 바뀌어도 배경 지도 Style은 그대로 둘 수 있어요. 반대로 같은 데이터에 `CircleLayer`, `SymbolLayer`, `HeatmapLayer`를 적용하면 앱 모델을 다시 설계하지 않고 표현 방식을 바꿀 수 있습니다.

## Maps SDK와 Apple MapKit은 같은 타입이 아니에요

두 프레임워크 모두 지도를 표시하지만 타입과 데이터 생태계가 다릅니다. Mapbox의 `Map`, `Viewport`, `PointAnnotation`은 SwiftUI MapKit의 같은 이름과 호환되지 않아요. 한 파일에서 두 프레임워크를 함께 import하면 `Map` 같은 이름이 모호해질 수 있으므로 모듈 접두어를 사용하거나 지도 화면의 import 범위를 좁히세요.

선택할 때는 다음 질문부터 확인합니다.

- Mapbox Studio로 만든 Style과 Tileset이 필요한가요?
- Source·Layer·Expression을 사용한 데이터 시각화가 중요한가요?
- 오프라인 영역을 앱이 직접 내려받아 관리해야 하나요?
- Search와 Navigation을 포함한 Mapbox 제품군을 함께 사용할 계획인가요?
- 외부 서비스 비용과 attribution·telemetry 운영 조건을 감당할 수 있나요?

플랫폼 기본 지도만으로 요구 사항을 충족한다면 외부 의존성과 토큰 관리가 없는 MapKit이 더 단순할 수 있어요. 반대로 브랜드 전용 지도 스타일과 복잡한 지리 데이터 표현이 핵심이면 Mapbox의 Source·Layer 구조가 잘 맞습니다.

## 일곱 페이지로 나눈 이유

토큰, SwiftUI 상태, 렌더링 데이터, 위치 권한, 오프라인 저장은 실패 원인과 수명 주기가 달라요. 다음 순서로 학습하면 각 책임을 분리하기 쉽습니다.

1. [설치와 Access Token](/guide/mapbox-maps-sdk/installation-and-access-token)에서 SPM과 공개·비밀 Token의 경계를 확인해요.
2. [SwiftUI 지도와 카메라](/guide/mapbox-maps-sdk/swiftui-map-and-camera)에서 `Map`, `Viewport`, 이벤트를 연결해요.
3. [스타일·Source·Layer](/guide/mapbox-maps-sdk/styles-sources-and-layers)에서 지도 데이터와 표현 규칙을 나눠요.
4. [Annotation과 클러스터링](/guide/mapbox-maps-sdk/annotations-and-clustering)에서 적은 핀과 대량 지점을 다르게 다뤄요.
5. [사용자 위치와 권한](/guide/mapbox-maps-sdk/user-location)에서 `Puck2D`와 위치 추적을 연결해요.
6. [오프라인 지도](/guide/mapbox-maps-sdk/offline-maps)에서 Style Pack과 Tile Region의 다운로드 수명 주기를 배워요.

첫 페이지를 포함해 총 7개 문서예요.

## 버전 숫자는 선택한 패키지와 함께 확인해요

2026년 8월에 확인한 [공식 시작 페이지](https://docs.mapbox.com/ios/maps/guides/)는 Maps SDK `11.28.2`, iOS 14 이상, Swift 5.9 이상을 안내합니다. 이 숫자를 영구적인 최신 버전으로 외우기보다 프로젝트가 실제로 선택한 패키지 버전의 릴리스 노트와 요구 사항을 확인하세요.

v6의 `MGLMapView` 예제와 v10·v11의 `MapView` 예제는 API가 크게 달라요. 검색으로 찾은 코드에 `MGL` 접두어가 보이면 현재 v11 문서인지 먼저 확인합니다.

## 출시 전에 법적·운영 조건을 확인해요

[공식 조건 안내](https://docs.mapbox.com/ios/maps/guides/#conditions)에 따르면 Mapbox 지도를 사용할 때 wordmark와 attribution을 표시해야 하며, Mapbox 데이터가 전혀 없는 예외를 제외하면 attribution을 임의로 없애면 안 됩니다. 기본 attribution control은 telemetry opt-out 경로도 제공합니다.

기본 control을 숨기거나 커스텀 UI로 바꾼다면 다음을 제품·법무 체크리스트에 포함하세요.

- Mapbox wordmark와 데이터 출처를 읽을 수 있게 유지했나요?
- attribution에 필요한 링크와 현재 카메라 정보를 제공하나요?
- 사용자가 telemetry를 개별적으로 끌 수 있는 경로가 있나요?
- 예상 월간 사용자와 지도 로드, 오프라인 사용량을 현재 가격 정책으로 계산했나요?

가격과 약관은 바뀔 수 있으므로 출시 시점의 [Mapbox 계정·가격 문서](https://docs.mapbox.com/accounts/)와 계약을 다시 확인합니다.

## 시작 전 체크리스트

- [ ] Maps, Search, Navigation SDK의 책임을 구분했나요?
- [ ] 실제 비밀 Token을 앱 번들이나 저장소에 넣지 않았나요?
- [ ] Style, Source, Layer와 Annotation 중 데이터 규모에 맞는 표현을 골랐나요?
- [ ] 카메라 변경 이벤트를 매 프레임 SwiftUI 상태로 복사하지 않나요?
- [ ] 위치 권한과 오프라인 저장의 사용자 가치를 설명할 수 있나요?
- [ ] attribution, telemetry와 비용 정책을 출시 전에 검토했나요?

## 면접에서 이어질 수 있는 질문

### Source와 Layer는 왜 분리하나요?

Source는 데이터가 어디에 있고 어떤 지리 정보인지 정의하며, Layer는 그 데이터를 어떻게 그릴지 정합니다. 하나의 Source를 여러 Layer가 공유할 수 있어 같은 데이터를 점, 라벨, 열 지도처럼 서로 다른 방식으로 표현할 수 있어요.

### Maps SDK만으로 장소 검색과 길 안내가 가능한가요?

Maps SDK의 주 역할은 지도 렌더링과 상호작용입니다. 장소 검색은 Search 제품, 경로와 턴 바이 턴 안내는 Navigation 제품이 담당하며 앱이 결과를 Maps SDK 화면에 연결합니다.

### 공개 Access Token도 숨겨야 하나요?

공개 `pk` Token은 모바일 클라이언트에서 사용하는 제한된 권한의 값이라 최종 앱에서 추출될 수 있습니다. 저장소 노출은 피하고 환경별 최소 권한 Token을 사용하되, 쓰기 권한이 있는 비밀 `sk` Token은 절대 앱에 포함하지 않아야 해요.

## 참고 자료

- [Mapbox Maps SDK for iOS 공식 가이드](https://docs.mapbox.com/ios/maps/guides/)
- [Mapbox Maps SDK for iOS 공식 저장소](https://github.com/mapbox/mapbox-maps-ios)
- [Mapbox Maps SDK SwiftUI 가이드](https://docs.mapbox.com/ios/maps/guides/swift-ui/)
- [Mapbox Style Specification](https://docs.mapbox.com/style-spec/)
- [Mapbox attribution 안내](https://docs.mapbox.com/help/dive-deeper/attribution/)
- [Mapbox 모바일 앱과 telemetry 안내](https://docs.mapbox.com/help/dive-deeper/mobile-apps/)
