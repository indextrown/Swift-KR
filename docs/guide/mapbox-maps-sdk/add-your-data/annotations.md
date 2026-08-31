---
title: Swift로 이해하는 Mapbox 어노테이션
description: Mapbox Point·Circle·Polyline·Polygon Annotation을 구분하고 SwiftUI의 조건부 선언과 UIKit AnnotationManager의 생성·갱신·제거 수명 주기를 정리해요.
source: https://docs.mapbox.com/ios/maps/guides/add-your-data/annotations/
reviewed: '2026-08-31'
---

# Swift로 이해하는 Mapbox 어노테이션

> **면접 답변 한 줄 요약:** Annotation은 지도 좌표에 개별 점·선·면을 표시하는 상위 API이며, SwiftUI에서는 선언으로, UIKit에서는 유형별 관리 객체로 표시 목록을 제어해요.

공식 [Annotations](https://docs.mapbox.com/ios/maps/guides/add-your-data/annotations/)에 대응해요. 픽업 장소를 원으로 표시하며 UIKit과 SwiftUI의 관리 방식 차이를 배워요.

## 먼저 알아둘 용어

| 용어          | 쉬운 뜻                                                                            |
| ------------- | ---------------------------------------------------------------------------------- |
| Annotation    | 좌표에 연결된 개별 표시 요소예요.                                                  |
| Manager       | 같은 종류의 표시 목록을 관리하는 SDK 객체예요.                                     |
| Orchestrator  | `MapView.annotations`에서 유형별 Manager를 만드는 진입점이에요.                    |
| UIKit·SwiftUI | 각각 화면 객체를 직접 다루거나 상태 기반으로 화면을 선언하는 Apple 프레임워크예요. |

## 모양에 맞는 타입을 골라요

[공식 가이드](https://docs.mapbox.com/ios/maps/guides/add-your-data/annotations/)가 소개하는 기본 유형은 다음과 같아요.

| 타입               | 입력과 표시                    |
| ------------------ | ------------------------------ |
| PointAnnotation    | 좌표와 직접 준비한 이미지      |
| CircleAnnotation   | 좌표를 중심으로 하는 원        |
| PolylineAnnotation | 순서가 있는 좌표들을 연결한 선 |
| PolygonAnnotation  | 닫힌 경계로 표현한 면          |

일반 Annotation을 모두 `UIView`라고 생각하면 안 돼요. UIKit Manager도 내부 Source·Layer를 관리해요. 실제 카드 뷰는 [View Annotation](./view-annotations.md)에서 다뤄요.

## SwiftUI에서는 현재 목록을 선언해요

다음 작성 예제는 전달받은 좌표에 원을 표시해요. `pickup`이 `nil`이면 지도의 다른 콘텐츠는 유지하면서 표시만 제거해요.

```swift
import CoreLocation
import MapboxMaps
import SwiftUI

struct PickupAnnotationMap: View {
    let pickup: CLLocationCoordinate2D?

    var body: some View {
        Map {
            if let pickup {
                CircleAnnotation(centerCoordinate: pickup)
                    .circleRadius(9)
                    .circleColor(.systemBlue)
            }
        }
    }
}
```

실제 화면에서는 픽업 좌표를 포함하도록 카메라도 별도로 설정해야 해요. 표시 데이터 추가와 카메라 이동은 같은 작업이 아니에요.

## UIKit에서는 Manager의 목록을 교체해요

다음 함수는 화면 초기화 때 한 번 호출하고 반환한 Manager를 화면 소유자가 보관하는 예제예요.

```swift
import CoreLocation
import MapboxMaps
import UIKit

/// 픽업 지점을 표시할 원 어노테이션 관리자를 만들어요.
/// - Parameters:
///   - mapView: 표시할 대상 지도예요.
///   - coordinate: 픽업 장소의 위도와 경도예요.
/// - Returns: 이후 표시 목록을 갱신할 관리자예요.
@MainActor
func installPickupAnnotation(
    on mapView: MapView,
    coordinate: CLLocationCoordinate2D
) -> CircleAnnotationManager {
    let manager = mapView.annotations.makeCircleAnnotationManager(id: "pickup")
    var annotation = CircleAnnotation(centerCoordinate: coordinate)
    annotation.circleRadius = 9
    annotation.circleColor = StyleColor(.systemBlue)
    manager.annotations = [annotation]
    return manager
}
```

검색 결과가 바뀔 때는 같은 Manager의 `annotations`를 새 목록으로 교체하는 방법을 권해요. 매번 Manager를 생성하면 생성·제거 책임을 추적하기 어려워져요.

`annotations.removeAll()`은 표시 목록을 비워요. Manager 자체를 끝내려면 `removeAnnotationManager(withId:)`를 사용해요. 같은 ID로 새 Manager를 만들면 기존 Manager가 대체되므로 오래된 참조를 계속 갱신하지 않아요. [제거 규칙](https://docs.mapbox.com/ios/maps/guides/add-your-data/annotations/#removing-annotations)

## 이벤트와 상태를 분리해요

탭 콜백에서 선택된 매장 ID를 앱 상태에 전달하고, 상세 화면은 그 ID로 구성하는 설계를 권해요. SDK 표시 객체를 앱의 유일한 데이터 저장소로 삼지 않아요.

탭 처리의 반환값은 아래 콘텐츠로 이벤트를 전달할지에 영향을 줘요. 중첩된 표시의 전파는 [지도 콘텐츠 제스처](../user-interaction/map-content-gestures.md)에서 이어서 확인해요.

## 적용 체크리스트

- [ ] 이미지가 필요 없는 모양에 불필요한 자산을 만들지 않았나요?
- [ ] 선의 좌표 순서와 다각형 경계를 확인했나요?
- [ ] Manager 생성과 목록 갱신을 구분했나요?
- [ ] 선택 상태를 안정적인 매장 ID로 저장하나요?
- [ ] 화면 종료 후 제거된 Manager를 갱신하지 않나요?

## 면접에서 이어질 수 있는 질문

### 목록을 비우는 것과 Manager를 제거하는 것은 같나요?

아니요. 전자는 표시 데이터를 비우고, 후자는 관리 객체가 사용하는 지도 리소스까지 제거해요. 다시 사용할 계획이 있는지에 따라 구분해요.

### 좌표를 추가했는데 왜 보이지 않나요?

카메라 밖일 수 있어요. 좌표, 이미지 존재 여부, 목록 반영, 카메라 범위를 각각 확인해요.

### 매장 ID와 Annotation ID를 같게 써야 하나요?

반드시 같아야 하지는 않아요. 다만 표시에서 앱 데이터로 돌아가는 대응 관계가 안정적이어야 해요.

## 참고 자료

- [Mapbox — Annotations](https://docs.mapbox.com/ios/maps/guides/add-your-data/annotations/)
- [Mapbox Maps SDK 11.29.1 — PointAnnotationManager](https://github.com/mapbox/mapbox-maps-ios/blob/11.29.1/Sources/MapboxMaps/Annotations/Generated/PointAnnotationManager.swift)
