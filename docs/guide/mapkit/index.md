---
title: Swift로 이해하는 Apple MapKit
description: Apple MapKit의 SwiftUI·UIKit 지도 구조와 검색, 위치, 경로, Look Around, 클러스터링, 스냅샷 학습 순서를 한눈에 정리합니다.
pageType: doc-wide
outline: false
---

# Swift로 이해하는 Apple MapKit

> 면접용 한 줄 요약: **MapKit은 Apple 지도 데이터를 SwiftUI의 선언형 `Map` 또는 UIKit의 `MKMapView`로 표시하고, `MKMapItem`을 중심으로 검색·장소·경로·Look Around 기능을 연결하는 시스템 프레임워크입니다.**

## 먼저 MapKit의 범위를 구분해요

MapKit은 단순한 지도 View 하나가 아니에요. 앱 화면, 장소 검색, 경로 계산, 정적 이미지까지 여러 API가 한 프레임워크 안에 있습니다.

| 만들 기능         | 선택할 API                                        | 핵심 역할                                                |
| ----------------- | ------------------------------------------------- | -------------------------------------------------------- |
| SwiftUI 지도 화면 | `Map`, `MapContentBuilder`                        | Marker, Annotation, Overlay와 카메라를 선언해요.         |
| UIKit 지도 화면   | `MKMapView`, `MKMapViewDelegate`                  | 재사용 Annotation View와 클러스터링을 세밀하게 제어해요. |
| 장소·주소 검색    | `MKLocalSearch`, `MKLocalSearchCompleter`         | 자연어 검색과 자동 완성 결과를 `MKMapItem`으로 반환해요. |
| 주소와 좌표 변환  | `MKGeocodingRequest`, `MKReverseGeocodingRequest` | 주소를 좌표로, 좌표를 주소로 바꿔요.                     |
| 경로와 예상 시간  | `MKDirections`, `MKRoute`                         | 출발지와 목적지 사이 경로, 단계, 거리와 시간을 계산해요. |
| 거리 수준 탐색    | `MKLookAroundSceneRequest`, `LookAroundPreview`   | 지원 지역의 Look Around 장면을 표시해요.                 |
| 정적 지도 이미지  | `MKMapSnapshotter`                                | 공유 카드나 미리 보기에 쓸 지도 이미지를 만들어요.       |
| 커스텀 타일       | `MKTileOverlay`, `MKTileOverlayRenderer`          | 앱이 제공하는 래스터 타일을 기본 지도 위나 대신 그려요.  |

전체 흐름은 `MKMapItem`을 중심으로 이어집니다.

```text
검색어 ──> MKLocalSearch ──> MKMapItem ──┬─> Marker로 표시
주소   ──> MKGeocodingRequest ───────────┤
선택한 장소 ──────────────────────────────┼─> Look Around 장면 요청
현재 위치 + 목적지 ───────────────────────┴─> MKDirections ──> MKRoute
```

## 설치형 SDK가 아니에요

네이티브 MapKit은 Apple 플랫폼 SDK에 포함된 시스템 프레임워크입니다. Swift Package Manager로 패키지를 추가하거나 Mapbox·네이버 지도처럼 클라이언트 ID나 Access Token을 넣지 않고 Target 코드에서 import해 시작해요.

```swift
import MapKit
import SwiftUI

struct FirstMap: View {
  var body: some View {
    Map()
  }
}
```

`MapKit JS`, Maps Server API, Maps Embed API는 별도 제품입니다. 웹과 서버 API는 Maps Token을 사용하므로 네이티브 `MapKit`의 설정과 섞지 마세요.

:::warning Maps capability를 무조건 켜지 않아요
일반적인 지도 표시를 위해 별도 Maps capability를 추가할 필요는 없습니다. Xcode의 Maps capability와 routing app coverage 파일은 앱이 다른 앱에 길 안내를 제공하는 **routing app**으로 동작할 때 검토하는 설정이에요.
:::

## 지도 표시와 현재 위치 접근은 달라요

지도를 보여 주거나 고정 좌표에 Marker를 놓는 것만으로는 위치 권한이 필요하지 않습니다. 사용자의 실제 위치를 읽을 때 Core Location 권한이 필요해요.

```text
고정된 서울시청 좌표 표시 ──> 위치 권한 불필요
사용자가 지도를 이동·확대 ──> 위치 권한 불필요
현재 위치 표시·추적 ─────────> Core Location 권한 필요
```

권한은 앱 시작과 동시에 요청하기보다 사용자가 “내 위치” 기능을 선택한 시점에 목적을 설명하고 최소 범위로 요청합니다.

## SwiftUI와 UIKit 중 무엇을 고르나요?

| 기준            | SwiftUI `Map`                                     | UIKit `MKMapView`                                   |
| --------------- | ------------------------------------------------- | --------------------------------------------------- |
| 화면 구성       | `MapContentBuilder`로 선언해요.                   | delegate와 add/remove 메서드로 갱신해요.            |
| 카메라          | `MapCameraPosition` binding을 사용해요.           | `region`, `camera`, `setVisibleMapRect`를 사용해요. |
| 커스텀 표시     | `Marker`, `Annotation`, `MapPolyline`이 간결해요. | 재사용 Annotation View와 Renderer를 직접 제어해요.  |
| 자동 클러스터링 | SwiftUI 전용 설정이 없어요.                       | `clusteringIdentifier`를 제공합니다.                |
| 기존 UIKit 화면 | wrapping 비용이 생길 수 있어요.                   | 자연스럽게 통합돼요.                                |

새로운 iOS 17 이상 SwiftUI 화면은 `Map`부터 시작하세요. Annotation View 재사용, 자동 클러스터링, 세밀한 delegate 동작이 제품의 핵심이면 `MKMapView`가 더 명확합니다. SwiftUI에서 `MKMapView`가 필요하면 `UIViewRepresentable`로 감싸되 두 상태 체계가 서로 카메라를 계속 덮어쓰지 않게 경계를 정해야 해요.

## 지도 SDK를 고르는 기준도 달라요

| 기준                   | Apple MapKit                      | 네이버 지도 SDK            | Mapbox Maps SDK                |
| ---------------------- | --------------------------------- | -------------------------- | ------------------------------ |
| 배포 방식              | Apple SDK에 포함                  | 외부 SDK 설치              | 외부 SDK 설치                  |
| 기본 지도 데이터       | Apple Maps                        | NAVER 지도                 | Mapbox Style·Tileset           |
| 시작 인증              | 네이티브 앱은 별도 Token 없음     | Client ID 설정             | 공개 Access Token 설정         |
| 선언형 SwiftUI API     | 공식 `Map` 제공                   | `UIViewRepresentable` 중심 | 공식 SwiftUI `Map` 제공        |
| 데이터 시각화 자유도   | Annotation·Overlay 중심           | Overlay 중심               | Source·Layer·Expression이 강점 |
| 오프라인 영역 다운로드 | Apple 기본 지도 다운로드 API 없음 | 별도 요구 사항 확인        | Tile Region·Style Pack 제공    |

MapKit이 항상 정답이라는 뜻은 아니에요. 서비스 국가의 지도 품질, 브랜드 Style, 대량 지리 데이터, 오프라인 요구, 검색·길 안내 결과 품질을 실제 제품 지역에서 비교해야 합니다.

## API 가용성을 먼저 정해요

- iOS 17부터 확장된 SwiftUI `Map`, `MapCameraPosition`, `MapContentBuilder`를 이 섹션의 기본 예제로 사용해요.
- iOS 16 이하를 지원하면 deprecated된 예제를 그대로 복사하기보다 `MKMapView` bridge 또는 별도 호환 계층을 검토해요.
- iOS 26의 `MKGeocodingRequest`와 `MKReverseGeocodingRequest`를 쓸 때는 deployment target을 확인하고, 이전 OS에서는 기존 Core Location 지오코딩 경로를 유지해야 해요.
- Look Around와 검색 결과는 모든 장소에서 같은 수준으로 제공되지 않으므로 “결과 없음” UI가 필요해요.

## 여섯 페이지를 이 순서로 읽어요

1. [SwiftUI 지도와 카메라](/guide/mapkit/swiftui-map-and-camera)에서 지도 콘텐츠와 카메라 상태를 연결해요.
2. [UIKit MKMapView](/guide/mapkit/uikit-map-view)에서 delegate, 재사용, SwiftUI bridge를 배워요.
3. [Annotation·Overlay·클러스터링](/guide/mapkit/annotations-overlays-and-clustering)에서 점·선·면과 대량 지점을 구분해요.
4. [검색·지오코딩·Look Around](/guide/mapkit/search-geocoding-and-look-around)에서 문자열과 좌표를 장소 정보로 바꿔요.
5. [사용자 위치와 경로](/guide/mapkit/user-location-and-directions)에서 권한과 `MKDirections`를 연결해요.
6. [스냅샷과 커스텀 타일](/guide/mapkit/snapshots-and-tile-overlays)에서 상호작용 없는 이미지와 외부 타일을 다뤄요.

시작 페이지를 포함해 총 7개 문서예요.

## 시작 전 체크리스트

- [ ] 지원 OS에 맞는 SwiftUI `Map` API를 선택했나요?
- [ ] 지도 표시와 현재 위치 권한을 분리했나요?
- [ ] 장소의 공통 모델로 `MKMapItem`을 사용할지 정했나요?
- [ ] 검색·경로 요청을 화면 수명과 함께 취소하나요?
- [ ] Look Around와 검색 결과가 없을 때 대체 UI가 있나요?
- [ ] Apple 지도 로고와 Legal 링크를 다른 UI로 가리지 않나요?

## 면접에서 이어질 수 있는 질문

### MapKit과 Core Location은 어떻게 다른가요?

MapKit은 지도 표시, 장소 검색, 경로, Look Around 같은 지도 경험을 담당합니다. Core Location은 사용자 위치와 방향, 위치 권한을 담당해요. MapKit 지도만 표시할 때는 권한이 필요 없지만 실제 현재 위치를 읽으면 Core Location 규칙을 따라야 합니다.

### MapKit 네이티브 앱에도 Maps Token이 필요한가요?

네이티브 `MapKit` 프레임워크의 일반 지도 표시는 별도 Maps Token을 요구하지 않습니다. Maps Token은 MapKit JS, Maps Server API, Maps Embed API 같은 웹·서버 제품의 인증에 사용돼요.

## 참고 자료

- [Apple MapKit 공식 문서](https://developer.apple.com/documentation/mapkit)
- [MapKit for SwiftUI 공식 문서](https://developer.apple.com/documentation/mapkit/mapkit-for-swiftui)
- [MapKit for AppKit and UIKit 공식 문서](https://developer.apple.com/documentation/mapkit/mapkit-for-appkit-and-uikit)
- [Meet MapKit for SwiftUI](https://developer.apple.com/videos/play/wwdc2023/10043/)
- [Go further with MapKit](https://developer.apple.com/videos/play/wwdc2025/204/)
- [MapKit JS 공식 문서](https://developer.apple.com/documentation/mapkitjs)
