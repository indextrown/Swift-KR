---
title: Mapbox SwiftUI 지도와 카메라
description: MapboxMaps의 SwiftUI Map과 Viewport로 초기 카메라, 양방향 상태, 애니메이션과 고빈도 카메라 이벤트를 안전하게 다루는 방법을 설명합니다.
pageType: doc-wide
outline: false
---

# Mapbox SwiftUI 지도와 카메라

> 면접용 한 줄 요약: **SwiftUI의 `Map`은 지도 내용을 선언하고 `Viewport`는 카메라의 목적을 표현하며, 연속 카메라 이벤트는 매번 `@State`에 복사하지 않고 필요한 시점에만 축약해야 합니다.**

## 먼저 알아둘 카메라 용어

| 용어     | 쉬운 뜻                                                                        |
| -------- | ------------------------------------------------------------------------------ |
| center   | 화면 중심이 바라보는 위도·경도예요.                                            |
| zoom     | 지도를 얼마나 확대했는지 나타내며 값이 클수록 가까이 보여요.                   |
| bearing  | 북쪽을 기준으로 지도를 시계 방향으로 회전한 각도예요.                          |
| pitch    | 카메라를 수직 지도에서 얼마나 기울였는지 나타내요.                             |
| padding  | 시트나 버튼이 지도를 가릴 때 실제로 보여 줄 영역 안쪽에 확보하는 여백이에요.   |
| Viewport | 고정 카메라, 현재 위치 추적, geometry 전체 보기 같은 카메라 동작의 목적이에요. |

## 한 번만 정할 카메라는 `initialViewport`로 시작해요

화면이 처음 나타날 때 서울시청을 보여 주고 이후에는 사용자가 자유롭게 움직이게 한다면 초기 Viewport만 전달하면 됩니다.

```swift
import MapboxMaps
import SwiftUI

struct SeoulMap: View {
  private let seoulCityHall = CLLocationCoordinate2D(
    latitude: 37.5666,
    longitude: 126.9784
  )

  var body: some View {
    Map(
      initialViewport: .camera(
        center: seoulCityHall,
        zoom: 14,
        bearing: 0,
        pitch: 30
      )
    )
  }
}
```

`initialViewport`는 이름처럼 초기화에만 사용해요. 부모 View가 다시 그려져도 이 값을 바꿔 카메라를 계속 명령할 수 있는 binding은 아닙니다.

## 버튼이 카메라를 움직여야 하면 binding을 사용해요

검색 결과, 현재 위치 버튼, 경로 전체 보기처럼 앱이 나중에 카메라를 바꿔야 하면 `Viewport`를 상태로 보관하고 `Map(viewport:)`에 binding을 전달합니다.

```swift
import MapboxMaps
import SwiftUI

struct PlaceMap: View {
  private let cityHall = CLLocationCoordinate2D(
    latitude: 37.5666,
    longitude: 126.9784
  )

  private let seoulStation = CLLocationCoordinate2D(
    latitude: 37.5547,
    longitude: 126.9707
  )

  @State private var viewport: Viewport = .styleDefault

  var body: some View {
    ZStack(alignment: .bottomTrailing) {
      Map(viewport: $viewport)

      VStack {
        Button("시청") {
          move(to: cityHall)
        }

        Button("서울역") {
          move(to: seoulStation)
        }
      }
      .buttonStyle(.borderedProminent)
      .padding()
    }
  }

  private func move(to coordinate: CLLocationCoordinate2D) {
    withViewportAnimation(.easeInOut(duration: 0.6)) {
      viewport = .camera(center: coordinate, zoom: 15)
    }
  }
}
```

이 예제의 상태는 좌표 숫자 모음이 아니라 “이 좌표를 줌 15로 보여 줘요”라는 카메라 목적이에요.

## Viewport 모드를 역할에 맞게 골라요

| Viewport               | 적합한 상황                                   |
| ---------------------- | --------------------------------------------- |
| `.styleDefault`        | Style에 저장된 기본 카메라로 시작할 때        |
| `.camera(...)`         | 중심, 확대, 회전, 기울기를 직접 지정할 때     |
| `.overview(geometry:)` | 경로나 여러 지점 전체가 화면에 들어오게 할 때 |
| `.followPuck(...)`     | 사용자 위치 Puck을 카메라가 따라갈 때         |
| `.idle`                | Viewport가 카메라를 더 이상 제어하지 않을 때  |

사용자가 손가락으로 지도를 움직이면 Viewport는 `.idle`로 전환돼요. 이는 사용자의 제스처와 앱의 자동 추적이 동시에 카메라를 잡고 싸우지 않게 하는 중요한 규칙입니다. 다시 추적하려면 “내 위치” 버튼처럼 명시적인 동작에서 `.followPuck`을 설정하세요.

## 애니메이션은 목적에 맞게 선택해요

고정 장소로 이동할 때는 ease 계열 애니메이션이 자연스럽습니다.

```swift
withViewportAnimation(.easeOut(duration: 0.5)) {
  viewport = .camera(center: cityHall, zoom: 15)
}
```

동적으로 움직이는 사용자 Puck을 따라갈 때는 고정된 목표로 끝나는 ease보다 기본 Viewport transition을 권장해요.

```swift
withViewportAnimation(.default(maxDuration: 1.0)) {
  viewport = .followPuck(
    zoom: 16,
    bearing: .heading,
    pitch: 45
  )
}
```

[공식 SwiftUI 가이드](https://docs.mapbox.com/ios/maps/guides/swift-ui/)는 `followPuck`으로 전환할 때 `.default(maxDuration:)` 사용을 권장합니다. 움직이는 위치를 정적인 목표처럼 보간하면 애니메이션 끝에서 점프가 생길 수 있기 때문이에요.

## 카메라 이벤트를 매 프레임 상태로 복사하지 않아요

지도 영역이 바뀔 때 주변 장소를 다시 검색하려고 다음처럼 작성하기 쉬워요.

```swift
Map(viewport: $viewport)
  .onCameraChanged { context in
    // 나쁜 예: 카메라가 움직이는 모든 프레임에 View를 다시 그려요.
    visibleCenter = context.cameraState.center
  }
```

`onCameraChanged`는 제스처와 애니메이션 중 수백 번 호출될 수 있어요. 고빈도 값을 곧바로 `@State`에 넣으면 SwiftUI `body` 평가와 네트워크 요청이 과도하게 늘어날 수 있습니다.

화면 요구에 따라 경계를 정하세요.

```text
카메라가 이동 중
  └─ lightweight한 모델에 마지막 CameraState만 저장

카메라가 멈춤 또는 사용자가 "이 지역 검색" 선택
  ├─ 현재 보이는 좌표 영역 계산
  ├─ 이전 검색 Task 취소
  └─ 최신 영역 한 번만 요청
```

연속 이벤트가 꼭 필요하면 model에서 throttle하거나 debounce하고, UI에 필요한 축약된 값만 MainActor 상태로 전달합니다.

## 지도 이벤트와 콘텐츠 제스처를 구분해요

`onCameraChanged`는 카메라 상태가 변했다는 **지도 이벤트**예요. Annotation이나 Layer를 눌렀다는 **콘텐츠 제스처**와 목적이 다릅니다.

```swift
Map {
  PointAnnotation(coordinate: cityHall)
    .image(named: "place-pin")
    .onTapGesture { context in
      print("선택 좌표: \(context.coordinate)")
      return true
    }
}
```

handler가 `true`를 반환하면 아래의 다른 지도 요소로 이벤트를 전파하지 않겠다는 뜻이에요. 겹친 Layer와 지도의 탭 동작을 함께 설계할 때 반환값을 명시적으로 정합니다.

## `MapReader`는 필요한 API만 꺼내는 탈출구예요

SwiftUI modifier로 노출되지 않은 기능이나 현재 카메라의 상세 계산이 필요하면 `MapReader`로 내부 `MapboxMap`에 접근할 수 있어요.

```swift
struct DebugMap: View {
  var body: some View {
    MapReader { proxy in
      Map()
        .onAppear {
          guard let map = proxy.map else { return }
          print(map.cameraState)
        }
    }
  }
}
```

`MapReader`가 있다고 모든 작업을 명령형 API로 바꿀 필요는 없습니다. Style, Source, Layer와 Annotation이 SwiftUI `Map` content로 표현된다면 선언을 single source of truth로 두세요. 내부 지도 객체는 쿼리, 고급 클러스터 확장, 아직 노출되지 않은 API처럼 필요한 곳에서만 사용합니다.

## UIKit에서는 `MapView`와 `CameraOptions`를 사용해요

UIKit 화면의 진입점은 `MapView`입니다.

```swift
import MapboxMaps
import UIKit

final class MapViewController: UIViewController {
  override func viewDidLoad() {
    super.viewDidLoad()

    let mapView = MapView(frame: view.bounds)
    mapView.autoresizingMask = [.flexibleWidth, .flexibleHeight]
    view.addSubview(mapView)

    mapView.mapboxMap.setCamera(
      to: CameraOptions(
        center: CLLocationCoordinate2D(
          latitude: 37.5666,
          longitude: 126.9784
        ),
        zoom: 14
      )
    )
  }
}
```

SwiftUI에서 지원되는 기능을 위해 `UIViewRepresentable`로 `MapView`부터 감싸기보다 공식 SwiftUI `Map`을 먼저 검토하세요. 현재 SwiftUI API는 Viewport, Annotation, Puck, 이벤트, 제스처, Style API를 직접 지원합니다.

## 언제 어떤 방식을 사용하나요?

- 첫 화면 위치만 필요하면 `initialViewport`를 사용해요.
- 버튼과 검색 결과가 카메라를 바꾸면 `@State Viewport` binding을 사용해요.
- 사용자 위치를 계속 따라가면 `followPuck`과 기본 transition을 사용해요.
- 경로나 여러 지점을 한 번에 보여주면 `overview(geometry:)`를 사용해요.
- 카메라 변화 중 모든 좌표가 필요하지 않다면 종료 시점이나 사용자 액션에서만 조회해요.
- SwiftUI에 없는 고급 API가 필요할 때만 `MapReader`를 사용해요.

## 체크리스트

- [ ] 초기 카메라와 이후 앱 명령 카메라를 구분했나요?
- [ ] 사용자 제스처 후 `.idle` 상태를 존중하나요?
- [ ] `followPuck` 전환에 동적 목표에 맞는 애니메이션을 사용하나요?
- [ ] `onCameraChanged`에서 무거운 계산이나 즉시 네트워크 요청을 하지 않나요?
- [ ] Annotation 탭의 event propagation을 의도대로 반환하나요?
- [ ] `MapReader`로 얻은 객체를 SwiftUI 선언과 중복 관리하지 않나요?

## 면접에서 이어질 수 있는 질문

### `initialViewport`와 `Map(viewport:)`의 차이는 무엇인가요?

`initialViewport`는 지도가 만들어질 때 한 번 적용할 시작 상태입니다. `Map(viewport:)`는 binding을 통해 앱이 나중에도 카메라의 목적을 바꿀 수 있어 검색 결과 이동이나 위치 추적에 적합해요.

### 왜 `onCameraChanged` 값을 바로 `@State`에 저장하면 안 되나요?

카메라 이벤트는 한 번의 제스처에도 매우 자주 발생합니다. 매번 SwiftUI 상태를 바꾸면 `body` 재평가와 후속 작업이 폭증할 수 있으므로 model에 보관하거나 throttle한 뒤 필요한 값만 UI에 전달해야 해요.

### 사용자가 지도를 드래그하면 위치 추적은 어떻게 되나요?

Viewport가 `.idle`로 바뀌어 자동 카메라 제어가 멈춥니다. 앱은 사용자의 조작을 존중하고, 명시적인 “내 위치” 동작에서 `.followPuck`으로 다시 전환하는 편이 자연스러워요.

## 참고 자료

- [Mapbox Maps SDK SwiftUI 가이드](https://docs.mapbox.com/ios/maps/guides/swift-ui/)
- [Mapbox Camera와 Animation 가이드](https://docs.mapbox.com/ios/maps/guides/camera-and-animation/)
- [Mapbox Camera Animation](https://docs.mapbox.com/ios/maps/guides/camera-and-animation/animations/)
- [`Map` API Reference](https://docs.mapbox.com/ios/maps/api/latest/documentation/mapboxmaps/map/)
- [Map Content Gestures](https://docs.mapbox.com/ios/maps/guides/user-interaction/map-content-gestures/)
