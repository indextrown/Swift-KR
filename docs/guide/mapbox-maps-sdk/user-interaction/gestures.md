---
title: Swift로 이해하는 Mapbox 기본 제스처
description: Mapbox GestureOptions로 이동·확대·회전·기울기 조작을 조정하고 제스처 종료와 관성 애니메이션 종료, 직접 만든 제스처의 충돌을 구분해요.
source: https://docs.mapbox.com/ios/maps/guides/user-interaction/gestures/
reviewed: '2026-08-31'
---

# Swift로 이해하는 Mapbox 기본 제스처

> **면접 답변 한 줄 요약:** 기본 제스처 설정은 사용자가 지도를 이동·확대·회전하는 방법을 제어하며, 손을 뗀 시점과 관성 이동이 끝난 시점을 구분해야 해요.

공식 [Gestures](https://docs.mapbox.com/ios/maps/guides/user-interaction/gestures/)에 대응해요. 아래에서는 회전하지 않는 매장 탐색 화면을 별도 학습 예제로 구성해요.

## 먼저 알아둘 용어

| 용어               | 쉬운 뜻                                             |
| ------------------ | --------------------------------------------------- |
| pan                | 지도를 손가락으로 끌어 위치를 바꾸는 조작이에요.    |
| pinch              | 두 손가락의 간격을 바꿔 확대·축소하는 조작이에요.   |
| pitch              | 지도를 기울여 보는 각도예요.                        |
| 관성               | 손을 뗀 뒤에도 감속하면서 지도가 움직이는 효과예요. |
| Gesture recognizer | 손가락 입력이 어떤 제스처인지 판별하는 객체예요.    |

기본 제스처에는 이동·기울기·확대·회전·더블 탭 확대·두 손가락 탭 축소·빠른 확대가 있어요. `GestureOptions`로 허용 여부, 이동 방향, 감속을 조정해요. 조작을 막아도 코드의 카메라 변경은 막히지 않아요. [공식 가이드](https://docs.mapbox.com/ios/maps/guides/user-interaction/gestures/)

## 모든 제스처를 끄기 전에 문제를 좁혀요

매장 이름을 읽는 화면에서 기울기만 불필요한데 모든 조작을 끄면 주변 탐색도 불편해져요. 이 학습 화면의 목적은 평면 지도에서 거리 관계를 읽는 것이므로 이동과 확대는 남겨두고 회전과 기울기만 막아요.

```swift
import MapboxMaps
import SwiftUI

struct FlatStoreMap: View {
    @State private var lastGestureEvent = "지도를 움직여 보세요."

    var body: some View {
        VStack {
            Map()
                .gestureOptions(GestureOptions(
                    rotateEnabled: false,
                    simultaneousRotateAndPinchZoomEnabled: false,
                    pitchEnabled: false
                ))
                .gestureHandlers(MapGestureHandlers(
                    onBegin: { _ in
                        lastGestureEvent = "최근 이벤트: 조작 시작"
                    },
                    onEnd: { _, willAnimate in
                        lastGestureEvent = willAnimate
                            ? "최근 이벤트: 손을 뗐고 관성이 이어져요."
                            : "최근 이벤트: 조작 종료"
                    },
                    onEndAnimation: { _ in
                        lastGestureEvent = "최근 이벤트: 관성 종료"
                    }
                ))
            Text(lastGestureEvent)
                .font(.caption)
        }
    }
}
```

문구는 “최근 이벤트”이지 모든 카메라 움직임을 합친 상태가 아니에요. 여러 제스처가 겹치거나 앱 코드로 카메라가 움직일 수 있으므로 한 콜백만으로 “지도는 완전히 멈춤”이라고 단정하지 않아요.

SwiftUI의 `gestureHandlers`와 UIKit의 `GestureManagerDelegate`는 시작·종료·관성 종료를 나누어 제공해요. UIKit delegate는 약하게 보관되므로 별도 객체를 사용한다면 화면 소유자가 유지해야 해요. [11.29.1 구현](https://github.com/mapbox/mapbox-maps-ios/blob/11.29.1/Sources/MapboxMaps/Gestures/GestureManager.swift)

## UIKit에서도 같은 목적의 설정을 적용해요

다음은 기존 화면의 지도에 적용하는 보조 함수예요. 새 지도 뷰를 만드는 코드는 포함하지 않았어요.

```swift
import MapboxMaps
import UIKit

/// 매장 탐색을 위한 평면 조작 정책을 적용해요.
/// - Parameter mapView: 화면에서 보관 중인 지도예요.
@MainActor
func configureStoreMapGestures(
    on mapView: MapView
) {
    mapView.gestures.options.rotateEnabled = false
    mapView.gestures.options.simultaneousRotateAndPinchZoomEnabled = false
    mapView.gestures.options.pitchEnabled = false
}
```

회전을 막는 정책은 사용자 입력에만 적용돼요. “북쪽이 위”인 화면이 요구라면 초기 bearing과 이후 코드의 카메라 설정도 같은 정책을 따라야 해요. 사용자 조작 설정만 바꿔서는 이전 화면의 회전을 바로잡지 못할 수 있어요.

## 콘텐츠 탭과 카메라 조작을 섞지 않아요

매장 선택은 [Interactions API](./interactions.md), 주석 선택은 [지도 콘텐츠 제스처](./map-content-gestures.md)를 참고해요. 11.29.1의 기존 `onMapTap`·`onLayerTap` 계열에는 deprecated 표시가 있으므로 새 예제에서는 Interactions를 사용해요. [GestureManager 구현](https://github.com/mapbox/mapbox-maps-ios/blob/11.29.1/Sources/MapboxMaps/Gestures/GestureManager.swift)

사용자 정의 recognizer를 추가한다면 기본 recognizer의 delegate나 target/action을 바꾸지 말고 충돌 관계를 설계해요. [공식 가이드](https://docs.mapbox.com/ios/maps/guides/user-interaction/gestures/)

예를 들어 지도 위 하단 시트와 pan이 충돌한다면 “세로 드래그는 항상 지도 소유”라는 가정부터 확인해요. 손가락 시작 위치, 시트 펼침 상태, 지도 확대 제스처를 나눠 재현하면 어느 입력이 가로채지는지 찾기 쉬워요.

## 적용 순서를 정리해요

1. 사용자가 해야 할 탐색과 막아야 할 조작을 적어요.
2. 필요한 GestureOptions만 바꿔요.
3. 손을 뗀 뒤 관성까지 테스트해요.
4. 시트·스크롤 뷰·버튼과 겹친 입력을 확인해요.
5. 코드가 직접 바꾸는 카메라도 같은 화면 정책을 따르는지 확인해요.

## 면접에서 이어질 수 있는 질문

### 제스처를 막으면 카메라 API도 막히나요?

아니요. 사용자 입력 허용과 코드로 설정하는 카메라는 다른 경로예요.

### didEnd가 호출되면 이동이 끝났나요?

손가락 조작은 끝났지만 관성이 남을 수 있어요. `willAnimate`와 관성 종료 이벤트를 구분해야 해요.

### 내 recognizer를 추가할 때 무엇을 조심하나요?

기존 제스처 내부를 덮어쓰지 않고 우선순위와 실패 관계를 정해요. 화면의 다른 스크롤·버튼과 함께 테스트해야 해요.

## 참고 자료

- [Mapbox Gestures](https://docs.mapbox.com/ios/maps/guides/user-interaction/gestures/)
- [Mapbox GestureManager · 11.29.1](https://github.com/mapbox/mapbox-maps-ios/blob/11.29.1/Sources/MapboxMaps/Gestures/GestureManager.swift)
- [Mapbox SwiftUI 제스처 · 11.29.1](https://github.com/mapbox/mapbox-maps-ios/blob/11.29.1/Sources/MapboxMaps/SwiftUI/Map+Gestures.swift)
