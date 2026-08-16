---
title: MapKit SwiftUI 지도와 카메라
description: SwiftUI Map의 MapContentBuilder와 MapCameraPosition, 카메라 경계·이벤트·선택·좌표 변환을 단계적으로 연결하는 방법을 설명합니다.
pageType: doc-wide
outline: false
---

# MapKit SwiftUI 지도와 카메라

> 면접용 한 줄 요약: **SwiftUI `Map`은 `MapContentBuilder`로 지도 콘텐츠를 선언하고, `MapCameraPosition` binding은 앱과 사용자의 카메라 변경을 연결하므로 초기 위치와 지속 제어를 구분해야 합니다.**

## 먼저 알아둘 카메라 용어

| 용어       | 쉬운 뜻                                                                     |
| ---------- | --------------------------------------------------------------------------- |
| coordinate | 위도와 경도로 표현한 지구 위 한 점이에요.                                   |
| region     | 중심 좌표와 위도·경도 범위인 span으로 표현한 사각 영역이에요.               |
| map rect   | Mercator 지도 평면의 점과 크기로 표현한 영역이에요.                         |
| camera     | 중심, 지면과의 거리, heading, pitch를 가진 가상 시점이에요.                 |
| position   | 자동 맞춤, 영역, 장소, 현재 위치, 직접 camera 중 무엇을 보여 줄지 나타내요. |
| bounds     | 사용자가 이동할 중심 영역과 최소·최대 camera 거리를 제한해요.               |

## `MapContentBuilder`로 지도 내용을 선언해요

iOS 17 이상의 현대적인 SwiftUI MapKit API에서는 Marker와 Overlay를 `Map`의 content closure에 작성합니다.

```swift
import MapKit
import SwiftUI

struct Place: Identifiable {
  let id: String
  let name: String
  let coordinate: CLLocationCoordinate2D
}

struct PlaceMap: View {
  private let places = [
    Place(
      id: "city-hall",
      name: "서울시청",
      coordinate: .init(latitude: 37.5666, longitude: 126.9784)
    ),
    Place(
      id: "seoul-station",
      name: "서울역",
      coordinate: .init(latitude: 37.5547, longitude: 126.9707)
    )
  ]

  var body: some View {
    Map {
      ForEach(places) { place in
        Marker(place.name, coordinate: place.coordinate)
      }
    }
  }
}
```

`Map`도 `List`처럼 result builder가 데이터 반복과 조건을 받아 하나의 지도 콘텐츠를 만들어요. 예전 `Map(coordinateRegion:annotationItems:)`, `MapMarker`, `MapAnnotation`은 deprecated되었으므로 새 프로젝트에서 복사하지 않습니다.

## 한 번만 정할 위치는 `initialPosition`을 사용해요

처음 서울시청을 보여 준 뒤 사용자가 자유롭게 지도를 움직이게 하려면 초기 위치만 전달합니다.

```swift
struct InitialCameraMap: View {
  private let initialPosition = MapCameraPosition.region(
    MKCoordinateRegion(
      center: .init(latitude: 37.5666, longitude: 126.9784),
      span: .init(latitudeDelta: 0.04, longitudeDelta: 0.04)
    )
  )

  var body: some View {
    Map(initialPosition: initialPosition)
  }
}
```

`initialPosition`은 View를 만든 뒤 계속 카메라를 명령하는 상태가 아니에요.

## 앱이 카메라를 바꾸면 binding을 사용해요

검색 결과 전체 보기, 장소 선택, 내 위치 복귀처럼 화면이 나타난 뒤에도 카메라를 움직여야 하면 `MapCameraPosition`을 상태로 둡니다.

```swift
struct ControllableMap: View {
  @State private var position: MapCameraPosition = .automatic

  private let cityHall = MKCoordinateRegion(
    center: .init(latitude: 37.5666, longitude: 126.9784),
    span: .init(latitudeDelta: 0.02, longitudeDelta: 0.02)
  )

  var body: some View {
    ZStack(alignment: .bottomTrailing) {
      Map(position: $position)

      Button("서울시청") {
        withAnimation {
          position = .region(cityHall)
        }
      }
      .buttonStyle(.borderedProminent)
      .padding()
    }
  }
}
```

`MapCameraPosition`에는 다음과 같은 의미 기반 선택지가 있어요.

| 위치                 | 사용할 때                                                |
| -------------------- | -------------------------------------------------------- |
| `.automatic`         | Marker와 Overlay 전체가 보이도록 MapKit에 맞춤을 맡겨요. |
| `.region(...)`       | 사용자가 이해하기 쉬운 중심과 span으로 영역을 정해요.    |
| `.rect(...)`         | 여러 좌표나 Overlay의 정확한 지도 평면 경계를 맞춰요.    |
| `.item(...)`         | `MKMapItem` 한 곳을 주변 맥락과 함께 보여 줘요.          |
| `.camera(...)`       | distance, heading, pitch를 직접 정해 3D 시점을 만들어요. |
| `.userLocation(...)` | 사용자 위치를 따라가고 실패할 때 fallback을 사용해요.    |

사용자가 드래그하면 binding의 `positionedByUser`가 `true`인 위치로 바뀝니다. 앱이 매 렌더링마다 원래 region을 다시 넣으면 사용자 제스처와 카메라가 싸우므로 버튼이나 검색 완료 같은 명확한 사건에서만 위치를 변경하세요.

## 카메라 이동 범위와 확대를 제한해요

캠퍼스나 행사장 지도처럼 특정 영역 밖으로 벗어날 이유가 없다면 `MapCameraBounds`를 전달할 수 있습니다.

```swift
let campusBounds = MapCameraBounds(
  centerCoordinateBounds: MKCoordinateRegion(
    center: .init(latitude: 37.5666, longitude: 126.9784),
    span: .init(latitudeDelta: 0.08, longitudeDelta: 0.08)
  ),
  minimumDistance: 300,
  maximumDistance: 20_000
)

Map(position: $position, bounds: campusBounds)
```

`minimumDistance`와 `maximumDistance`는 zoom 숫자가 아니라 camera와 중심 사이의 미터 거리예요. 너무 강한 제한은 사용자가 위치 관계를 이해하지 못하게 할 수 있으므로 제품 목적이 분명할 때 사용합니다.

## 카메라가 멈춘 뒤 보이는 영역을 읽어요

현재 화면에서 장소를 검색할 때는 카메라 이동이 끝난 뒤 region을 저장하는 방식이 적합해요.

```swift
@State private var visibleRegion: MKCoordinateRegion?

Map(position: $position)
  .onMapCameraChange(frequency: .onEnd) { context in
    visibleRegion = context.region
  }
```

`.continuous`는 제스처 도중에도 자주 호출됩니다. 매번 검색 API를 요청하거나 무거운 SwiftUI 상태를 갱신하지 말고, 애니메이션에 꼭 필요한 값만 처리하거나 throttle해야 해요.

## 선택 상태는 안정적인 Hashable 값으로 연결해요

```swift
@State private var selectedPlaceID: String?

Map(selection: $selectedPlaceID) {
  ForEach(places) { place in
    Marker(place.name, coordinate: place.coordinate)
      .tag(place.id)
  }
}
```

`Map`의 selection 타입과 각 콘텐츠의 `tag` 타입이 같아야 합니다. 화면 갱신마다 바뀌는 임의 UUID 대신 서버 장소 ID처럼 안정적인 값을 사용하세요.

## 화면 점과 지도 좌표는 `MapReader`로 변환해요

사용자가 누른 화면 위치에 핀을 놓으려면 `MapReader`가 제공하는 `MapProxy`를 사용합니다.

```swift
MapReader { proxy in
  Map(position: $position) {
    if let droppedCoordinate {
      Marker("선택 위치", coordinate: droppedCoordinate)
    }
  }
  .onTapGesture { point in
    droppedCoordinate = proxy.convert(point, from: .local)
  }
}
```

`CGPoint`를 위도·경도로 비례 변환하면 Mercator 투영, camera pitch와 회전을 무시하게 됩니다. 화면과 지도의 좌표계 변환은 MapKit에 맡기세요.

## 시스템 지도 컨트롤을 연결해요

```swift
Map(position: $position)
  .mapControls {
    MapCompass()
    MapScaleView()
    MapPitchToggle()
    MapUserLocationButton()
  }
```

내 위치 버튼은 위치 권한과 신호가 없을 때도 고려해야 합니다. 지도 위 시트나 버튼은 `safeAreaInset`으로 배치해 Apple Maps 로고, Legal 링크와 시스템 컨트롤을 가리지 않게 하세요.

## 체크리스트

- [ ] deprecated된 `coordinateRegion` initializer 대신 현대적인 `Map` API를 사용하나요?
- [ ] 초기 위치와 이후 앱이 제어하는 위치를 구분했나요?
- [ ] 사용자 제스처 뒤 카메라 상태를 매번 덮어쓰지 않나요?
- [ ] 카메라 연속 이벤트에서 네트워크 요청을 직접 실행하지 않나요?
- [ ] selection의 ID가 화면 갱신 사이에도 안정적인가요?
- [ ] 좌표계 변환을 `MapProxy`에 맡기나요?

## 면접에서 이어질 수 있는 질문

### `initialPosition`과 `position` binding은 어떻게 다른가요?

`initialPosition`은 지도가 생성될 때 한 번 적용할 시작 위치입니다. binding은 앱과 사용자가 바꾼 카메라 상태를 양방향으로 전달하므로 검색 결과 이동이나 사용자 위치 추적처럼 지속 제어가 필요할 때 사용해요.

### `.onEnd`와 `.continuous`는 언제 사용하나요?

주변 검색이나 결과 저장은 카메라 이동이 끝나는 `.onEnd`가 적합합니다. 이동 중 UI를 실시간으로 바꿔야 할 때만 `.continuous`를 사용하고, 고빈도 이벤트의 계산과 상태 갱신 비용을 제한해요.

## 참고 자료

- [SwiftUI Map 공식 문서](https://developer.apple.com/documentation/mapkit/map)
- [MapCameraPosition 공식 문서](https://developer.apple.com/documentation/mapkit/mapcameraposition)
- [MapCameraBounds 공식 문서](https://developer.apple.com/documentation/mapkit/mapcamerabounds)
- [MapReader 공식 문서](https://developer.apple.com/documentation/mapkit/mapreader)
- [Meet MapKit for SwiftUI](https://developer.apple.com/videos/play/wwdc2023/10043/)
