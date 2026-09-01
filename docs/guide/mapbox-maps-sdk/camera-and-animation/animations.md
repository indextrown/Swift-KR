---
title: Swift로 이해하는 Mapbox 카메라 애니메이션
description: Mapbox의 fly·ease와 저수준 카메라 애니메이터를 구분하고 연속 장소 선택, 완료와 취소, 화면 종료 때의 제어권을 안전하게 설계하는 방법을 설명해요.
source: https://docs.mapbox.com/ios/maps/guides/camera-and-animation/animations/
reviewed: '2026-08-31'
---

# Swift로 이해하는 Mapbox 카메라 애니메이션

> **면접 답변 한 줄 요약:** 카메라 애니메이션은 목표 위치까지의 변화를 시간에 나누어 보여주며, 정상 완료뿐 아니라 다른 이동 명령과 사용자 조작에 의한 취소도 고려해야 해요.

공식 [Animations](https://docs.mapbox.com/ios/maps/guides/camera-and-animation/animations/)에 대응해요. 여기서는 매장 목록을 빠르게 연속 선택하는 화면을 예로 들어 전환 정책을 설계해요.

## 먼저 알아둘 용어

| 용어       | 쉬운 뜻                                                                       |
| ---------- | ----------------------------------------------------------------------------- |
| 고수준 API | 목적지와 시간만 전달해 흔한 이동 효과를 실행하는 방식이에요.                  |
| 애니메이터 | 진행률·시작·중단 등을 직접 관리하는 애니메이션 객체예요.                      |
| 완료 콜백  | 애니메이션이 종료되었을 때 호출되는 코드예요. 목표 도달과 항상 같지는 않아요. |
| 소유자     | 어떤 화면 기능이 애니메이션을 시작하고 끝낼 책임이 있는지 나타내요.           |

`fly`는 확대와 이동을 결합하고 `ease`는 값의 변화를 부드럽게 연결해요. `setCamera(to:)`는 즉시 적용해요. 고수준 애니메이션은 하나만 실행되며 새 고수준 명령이 이전 것을 취소해요. 저수준에서도 같은 카메라 속성을 동시에 제어할 수 없어요. [공식 가이드](https://docs.mapbox.com/ios/maps/guides/camera-and-animation/animations/)

## 먼저 애니메이션이 꼭 필요한지 결정해요

앱을 열자마자 먼 나라에서 목적지로 길게 날아오는 효과는 사용자에게 필요한 정보일까요? 이 학습 화면에서는 첫 진입은 정해진 장소를 즉시 보여주고, 목록을 눌러 장소를 바꿀 때만 짧은 전환을 사용해요.

이렇게 역할을 나누면 애니메이션이 실패하거나 중단되어도 “선택된 매장” 자체는 변하지 않아요. 도메인 상태를 애니메이션 완료 뒤에만 저장하지 않는 것이 핵심이에요.

## SwiftUI에서는 상태 변경을 애니메이션으로 감싸요

아래 예제는 접근성의 동작 줄이기 설정도 반영한 학습용 화면이에요. SDK 설치와 Access Token 설정은 완료된 상태를 가정해요.

```swift
import MapboxMaps
import SwiftUI

struct StoreFocusMap: View {
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var viewport = Viewport.camera(
        center: CLLocationCoordinate2D(latitude: 37.55, longitude: 126.98),
        zoom: 12
    )
    private let store = CLLocationCoordinate2D(latitude: 37.566, longitude: 126.978)

    var body: some View {
        VStack {
            Map(viewport: $viewport)
            Button("선택한 매장 보기") {
                let target = Viewport.camera(center: store, zoom: 15)
                if reduceMotion {
                    viewport = target
                } else {
                    withViewportAnimation(.easeOut(duration: 0.6)) {
                        viewport = target
                    }
                }
            }
        }
    }
}
```

이 화면의 0.6초는 정해진 SDK 권장값이 아니에요. 단말과 이동 거리에 따라 제품에서 조정할 값이에요. “상세 화면 열기”를 애니메이션 완료에 묶지 않았으므로 이동 효과를 줄여도 기능은 같아요.

## 직접 만든 애니메이터는 수명을 드러내요

UIKit에서 확대 진행을 직접 제어해야 할 때의 작은 보조 객체예요. 지도 뷰가 화면에 붙은 뒤 실행하고, 화면 소유자가 `stop()`을 호출하도록 연결하세요.

```swift
import MapboxMaps
import UIKit

@MainActor
final class StoreZoomAnimation {
    private var animator: BasicCameraAnimator?

    /// 지도 확대 전환을 시작해요.
    /// - Parameters:
    ///   - mapView: 화면에 표시 중인 지도예요.
    ///   - zoom: 전환할 목표 확대 수준이에요.
    func start(
        on mapView: MapView,
        zoom: CGFloat
    ) {
        stop()
        mapView.viewport.idle()
        let next = mapView.camera.makeAnimator(duration: 0.4, curve: .easeOut) {
            $0.zoom.toValue = zoom
        }
        animator = next
        next.startAnimation()
    }

    func stop() {
        animator?.stopAnimation()
        animator = nil
    }
}
```

이 객체는 자신이 만든 애니메이터만 중단해요. 다른 기능이 시작한 지도 애니메이션 전체를 지우지 않도록 범위를 좁힌 예제예요. 화면이 사라질 때 호출할 책임은 자동으로 생기지 않으므로 컨트롤러 수명 주기에 연결해야 해요.

## 종료를 성공으로 단정하지 않아요

완료 콜백은 취소에도 호출될 수 있어요. `BasicCameraAnimator`에는 실행 상태와 종료 관련 API가 있고, 연결된 애니메이션은 정상 완료 여부를 확인한 뒤 시작해야 해요. 지도 변경 이벤트는 애니메이션 외의 원인으로도 발생해요. [공식 가이드](https://docs.mapbox.com/ios/maps/guides/camera-and-animation/animations/)

이 학습 화면의 검증 시나리오는 “A 선택 → 이동 중 B 선택 → 뒤로 가기”예요. 뒤늦게 끝난 A의 콜백이 B를 덮어쓰거나 종료된 화면을 다시 움직이지 않아야 해요. 비동기 매장 조회까지 붙인다면 요청 식별자와 작업 취소는 별도로 설계하세요.

## 적용 순서를 정리해요

1. 목표 장소와 화면 효과를 별도 상태로 다뤄요.
2. 흔한 이동이면 고수준 전환부터 사용해요.
3. 직접 만든 애니메이터의 소유자와 중단 시점을 정해요.
4. 새 선택·사용자 드래그·화면 종료를 테스트해요.
5. 동작 줄이기에서도 기능이 동일한지 확인해요.

## 면접에서 이어질 수 있는 질문

### 완료 콜백이 호출되면 목적지에 도착했나요?

항상 그렇지는 않아요. 취소로 종료되었는지 확인하고 다음 동작을 결정해야 해요.

### 저수준 애니메이터가 항상 더 좋은가요?

아니요. 세부 제어가 필요한 대신 소유권·중단·중복 실행을 직접 다뤄야 해요. 단순 장소 이동은 고수준 API로 충분할 수 있어요.

### 카메라가 움직이면 애니메이션 중이라고 판단해도 되나요?

사용자 제스처나 다른 카메라 설정도 움직임을 만들 수 있어요. 특정 전환의 완료는 해당 전환의 수명으로 판단해요.

## 참고 자료

- [Mapbox Animations](https://docs.mapbox.com/ios/maps/guides/camera-and-animation/animations/)
- [Mapbox BasicCameraAnimator 구현 · 11.29.1](https://github.com/mapbox/mapbox-maps-ios/blob/11.29.1/Sources/MapboxMaps/Camera/BasicCameraAnimator.swift)
