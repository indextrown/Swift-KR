---
title: Swift로 이해하는 Mapbox SwiftUI 지도
description: Mapbox의 SwiftUI Map과 Viewport 바인딩, 지도 콘텐츠 선언, MapReader의 역할을 나누고 상태 갱신과 지도 수명 주기를 안전하게 설계하는 방법을 설명해요.
source: https://docs.mapbox.com/ios/maps/guides/swift-ui/
reviewed: '2026-08-31'
---

# Swift로 이해하는 Mapbox SwiftUI 지도

> **면접 답변 한 줄 요약:** Mapbox의 SwiftUI 지도는 화면 상태를 지도 콘텐츠와 카메라 의도로 선언하게 하며, 선언으로 부족한 기능만 MapReader를 통해 직접 접근할 수 있어요.

공식 [SwiftUI](https://docs.mapbox.com/ios/maps/guides/swift-ui/) 가이드에 대응해요. “선택한 매장으로 돌아가는 지도”를 새 예제로 구성해 상태와 지도 명령의 경계를 살펴봐요.

## 먼저 알아둘 용어

| 용어       | 쉬운 뜻                                                                      |
| ---------- | ---------------------------------------------------------------------------- |
| SwiftUI    | 상태가 바뀌면 화면을 다시 설명하는 방식의 Apple UI 프레임워크예요.           |
| Map        | UIKit 지도 뷰를 SwiftUI에서 사용하도록 감싼 Mapbox 타입이에요.               |
| Viewport   | 카메라의 숫자 또는 사용자 추적 같은 동작 목표예요.                           |
| MapContent | 지도 안에 들어갈 콘텐츠를 설명하는 선언이에요. 일반 SwiftUI View와 구분해요. |
| MapReader  | 내부 지도의 API를 읽거나 호출할 수 있는 proxy를 제공하는 컨테이너예요.       |

가이드의 지원 범위에는 카메라·주석·클러스터·Puck·이벤트·스타일이 포함돼요. 다만 모든 UIKit API가 같은 형태로 노출되지는 않으며 Layer Annotation의 `isDraggable`·`isSelected`와 사용자 정의 카메라 애니메이션 같은 차이를 확인해야 해요. [공식 지원 표](https://docs.mapbox.com/ios/maps/guides/swift-ui/#feature-support)

## 지도의 초기 위치와 반복되는 명령을 구분해요

검색 화면에서 첫 지도 위치만 지정했는데 “선택한 매장으로 돌아가기” 버튼이 필요해졌다고 생각해 보세요. 버튼을 누를 때마다 지도 전체를 새로 만들도록 식별자를 바꾸는 방식은 불필요한 초기화를 만들 수 있어요.

초깃값만 필요하면 `initialViewport`, 이후에도 화면 코드에서 제어해야 한다면 `viewport` 바인딩을 사용해요. 아래 예제는 후자에 해당해요. 설치와 Access Token 설정은 [설치](./install.md)를 먼저 마쳐야 해요.

```swift
import MapboxMaps
import SwiftUI

struct SelectedStoreMap: View {
    @State private var viewport = Viewport.camera(
        center: CLLocationCoordinate2D(latitude: 37.566, longitude: 126.978),
        zoom: 14
    )
    @State private var showsStore = true
    private let coordinate = CLLocationCoordinate2D(
        latitude: 37.566, longitude: 126.978
    )

    var body: some View {
        VStack {
            Map(viewport: $viewport) {
                if showsStore {
                    MapViewAnnotation(coordinate: coordinate) {
                        Text("선택한 매장")
                            .padding(8)
                            .background(.regularMaterial)
                            .clipShape(RoundedRectangle(cornerRadius: 8))
                    }
                }
            }
            .mapStyle(.standard)

            HStack {
                Toggle("매장 표시", isOn: $showsStore)
                Button("매장으로") {
                    viewport = .camera(center: coordinate, zoom: 14)
                }
            }
            .padding()
        }
    }
}
```

매장 표시 여부는 앱 상태이고, 화면에 해당 주석이 존재하는지는 그 상태의 결과예요. 같은 주석을 다른 콜백에서 직접 추가·삭제하지 않았기 때문에 “토글은 꺼졌는데 핀이 남는” 두 개의 관리 경로가 생기지 않아요.

## View와 지도 콘텐츠는 같은 것이 아니에요

일반 버튼과 텍스트는 SwiftUI View이고, 지도 주석·소스·레이어는 지도 콘텐츠예요. 위치에 붙일 작은 카드라면 위 예제처럼 `MapViewAnnotation` 내부에 View를 넣어요. 많은 지리 데이터를 표시하는 방식은 [데이터 추가](./add-your-data/index.md)에서 따로 비교해요.

선언형 스타일 콘텐츠는 스타일을 다시 불러올 때 재적용되며, `ForEvery`는 지도 콘텐츠의 반복 선언에 사용해요. View Annotation은 지도 위의 네이티브 뷰인 반면 Layer Annotation은 지도 렌더링 콘텐츠라는 차이가 있어요. [공식 SwiftUI 가이드](https://docs.mapbox.com/ios/maps/guides/swift-ui/)

학습 화면에서는 “선택된 매장 하나의 풍부한 카드”와 “전체 매장 위치 수천 개”를 같은 UI 방식으로 만들 필요가 없어요. 두 표현의 요구를 나눈 뒤 데이터 수와 제스처를 기준으로 검증해 보세요.

## MapReader는 필요한 순간에만 사용해요

아래는 현재 지도의 중심을 버튼으로 확인하는 별도 예제예요. 카메라 상태를 매 프레임 SwiftUI 상태로 복사하지 않고 사용자가 요청한 순간에 읽어요.

```swift
struct InspectMapCenter: View {
    @State private var message = "중심 좌표를 확인해 보세요."

    var body: some View {
        MapReader { proxy in
            VStack {
                Map()
                Button("현재 중심 확인") {
                    guard let map = proxy.map else {
                        message = "지도가 아직 준비되지 않았어요."
                        return
                    }
                    let center = map.cameraState.center
                    message = "위도 \(center.latitude), 경도 \(center.longitude)"
                }
                Text(message)
            }
        }
    }
}
```

`proxy.map`은 optional이므로 지도가 준비되지 않은 상황을 처리해요. proxy 자체를 장기 보관하는 앱 전역 모델로 옮기기보다, 화면이 존재하는 범위에서 API를 사용하는 식으로 경계를 좁혀요. [MapProxy 구현](https://github.com/mapbox/mapbox-maps-ios/blob/11.29.1/Sources/MapboxMaps/SwiftUI/MapProxy.swift)

## 상태가 서로를 갱신하는 순환을 피하세요

카메라 변경 → 상태 저장 → 지도 카메라 설정 → 카메라 변경 흐름을 만들면 누가 카메라를 제어하는지 불명확해져요. 카메라 이벤트를 모두 `@State`에 저장하는 방식은 피하고, UI에 필요한 값과 주기를 먼저 정해요.

이 학습 예제에서는 카메라 숫자를 앱의 영속 데이터로 취급하지 않아요. 저장해야 할 정보가 “선택한 매장”이면 매장 ID를 저장하고, 지도 카메라는 화면에 진입할 때 그 의도에서 계산할 수 있어요.

## 적용 순서를 정리해요

1. 지도를 만들기 전에 토큰 설정을 마쳐요.
2. 초기 위치만 필요한지 반복 제어가 필요한지 구분해요.
3. 화면 상태를 지도 콘텐츠 선언의 기준으로 삼아요.
4. 네이티브 카드와 대량 지도 데이터를 구분해요.
5. 직접 API가 필요한 경우만 MapReader를 사용해요.
6. 빠른 상태 변경·스타일 재로딩·화면 재진입을 확인해요.

## 면접에서 이어질 수 있는 질문

### SwiftUI Map은 UIKit MapView와 무관한 지도인가요?

아니요. 내부 지도 구현을 SwiftUI에서 사용하도록 연결한 타입이에요. 따라서 선언 방식과 실제 지도 수명을 함께 생각해야 해요.

### initialViewport만으로 이후 버튼 이동을 표현할 수 있나요?

초기 설정과 이후 제어는 구분해야 해요. 반복해서 목적지를 바꾸려면 바인딩된 Viewport를 사용하는 구성이 적합해요.

### 모든 카메라 값을 상태에 저장해야 하나요?

아니요. 필요한 순간에 읽거나 표시할 값만 제한적으로 반영할 수 있어요. 앱이 실제로 보존하려는 사용자 의도를 먼저 정해요.

## 참고 자료

- [Mapbox SwiftUI](https://docs.mapbox.com/ios/maps/guides/swift-ui/)
- [Mapbox MapProxy 구현 · 11.29.1](https://github.com/mapbox/mapbox-maps-ios/blob/11.29.1/Sources/MapboxMaps/SwiftUI/MapProxy.swift)
