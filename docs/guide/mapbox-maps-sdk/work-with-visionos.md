---
title: visionOS에서 Mapbox 지도 사용하기
description: visionOS용 Mapbox의 설치 경로와 SwiftUI 지도 구성을 확인하고, 네이티브 뷰의 시선 피드백 및 나침반 제한에 맞춰 지도 상호작용을 설계합니다.
source: https://docs.mapbox.com/ios/maps/guides/work-with-visionos/
reviewed: '2026-08-31'
---

# visionOS에서 Mapbox 지도 사용하기

> **면접 답변 한 줄 요약:** visionOS의 Mapbox 지도는 iOS와 비슷한 지도 API를 쓰지만, 시선 피드백과 방향 센서의 제약을 반영해 네이티브 UI와 지도 렌더링의 역할을 나눠야 해요.

지도는 나타났는데 사용자가 어느 장소를 선택할 수 있는지 알아보기 어렵다면 플랫폼의 상호작용을 다시 확인해야 해요. 컴파일 가능한 화면과 편하게 조작할 수 있는 공간형 화면은 같은 기준이 아니에요.

## 먼저 알아둘 용어

| 용어            | 쉬운 뜻                                                                      |
| --------------- | ---------------------------------------------------------------------------- |
| visionOS        | Apple Vision Pro에서 앱을 실행하는 운영체제예요.                             |
| SwiftUI / UIKit | Apple의 화면 구성 프레임워크예요. 각각 `Map`과 `MapView`를 사용할 수 있어요. |
| Metal           | 지도 기호와 선·면 등을 그리는 그래픽 API예요.                                |
| View Annotation | 지도 좌표에 네이티브 화면 요소를 붙이는 방식이에요.                          |
| Puck            | 지도 위에서 사용자 위치를 나타내는 표시예요.                                 |
| Heading         | 기기가 가리키는 방위 정보예요. 지도 위쪽 방향과는 달라요.                    |

## 지원되는 설치 경로부터 확인해요

공식 가이드는 SDK `11.2.0`부터 visionOS를 지원하며, visionOS에서는 CocoaPods 대신 **Swift Package Manager 또는 바이너리 배포**를 사용하도록 안내해요. 지도 진입점은 SwiftUI의 `Map`, UIKit의 `MapView`예요. [공식 visionOS 가이드](https://docs.mapbox.com/ios/maps/guides/work-with-visionos/)

설치 단계는 [설치 문서](./install.md), 선언형 지도 구성은 [SwiftUI 가이드](./swift-ui.md)로 이어져요. iOS 앱에 추가했다는 사실만으로 visionOS 타깃의 패키지 연결과 실행 구성이 끝났다고 판단하지 마세요.

## 렌더링 기호와 선택 버튼을 구분해요

원문은 Metal로 그리는 지도 기호·선·면에는 네이티브 뷰와 같은 시선 피드백이 자동 적용되지 않는다고 설명해요. 상호작용할 요소는 View Annotation으로 네이티브 뷰를 올리고 `hoverEffect`를 적용할 수 있어요. 탭 처리 가능 여부와 시선 피드백 제공 여부는 다른 질문이에요. [시선 피드백 제약](https://docs.mapbox.com/ios/maps/guides/work-with-visionos/)

아래는 지도 위에 “산책 시작” 버튼 하나를 놓는 작성자 예제예요. 지도 전체를 버튼 수백 개로 바꾸는 설계는 아니에요.

```swift
import CoreLocation
import MapboxMaps
import SwiftUI

struct SpatialWalkMap: View {
    @State private var didSelectStart = false

    private let start = CLLocationCoordinate2D(
        latitude: 37.5713,
        longitude: 126.9769
    )

    var body: some View {
        VStack {
            Map(initialViewport: .camera(center: start, zoom: 15)) {
                MapViewAnnotation(coordinate: start) {
                    Button("산책 시작점 선택") {
                        didSelectStart = true
                    }
                    .buttonStyle(.borderedProminent)
                    .hoverEffect()
                }
            }

            Text(didSelectStart ? "시작점을 선택했어요" : "시작점을 선택해 주세요")
        }
    }
}
```

지도는 위치 관계를 보여 주고, 네이티브 버튼은 선택 가능한 행동을 표현해요. 실제 앱에서는 선택 해제·상세 보기·접근성 안내를 함께 설계하세요. `hoverEffect`를 붙인다고 앱이 사용자의 정밀 시선 좌표를 직접 받는다는 뜻은 아니에요.

## 나침반이 없는데 방향을 꾸며 내지 마세요

원문은 visionOS에서 나침반 데이터를 사용할 수 없어 `.heading`을 쓰는 Puck이 북쪽을 가리킨다고 안내해요. 기본 `Puck2D()`처럼 방향 표시를 사용하지 않거나, 실제 근거가 있는 별도 heading 제공자를 연결하는 선택지가 있어요. [위치 서비스 제한](https://docs.mapbox.com/ios/maps/guides/work-with-visionos/)

“방향을 보여 주기 위해 상수 15도를 넣는다”는 코드는 데모에는 가능해도 사용자 방향을 의미하지 않아요. 다음처럼 제품 요구를 나누는 편이 좋아요.

| 제품 요구           | 작성자 권장 표현                                      |
| ------------------- | ----------------------------------------------------- |
| 현재 위치만 찾기    | 방향 화살표 없이 위치를 보여 줘요.                    |
| 지도 북쪽을 알기    | 사용자 heading과 분리된 지도 방향 UI를 제공해요.      |
| 실제 진행 방향 안내 | 플랫폼에서 얻을 수 있는 데이터와 정확도부터 검토해요. |

위치 권한과 위치 데이터의 정확도는 별도로 처리해야 해요. 지도 SDK의 Puck을 추가한 사실이 권한 승인이나 센서 지원을 만들어 주지는 않아요.

## 실기기에서 상호작용을 검증해요

- [ ] visionOS 타깃에 지원되는 패키지 배포 방식으로 연결했나요?
- [ ] 선택 가능한 요소가 보기만 해도 구분되나요?
- [ ] 네이티브 버튼과 배경 지도 제스처가 의도대로 동작하나요?
- [ ] 작은 지도 창에서도 주요 행동을 선택할 수 있나요?
- [ ] 나침반이 없는 상태를 임의의 heading 값으로 숨기지 않나요?
- [ ] Simulator 확인과 실제 Vision Pro의 입력 경험 검증을 나눴나요?

지도 렌더링과 네이티브 뷰가 함께 있는 화면이므로, 장소 수가 늘어날 때 모두 View Annotation으로 만드는 비용도 따로 측정하세요. 선택된 장소만 버튼으로 보여 주는 설계부터 시작할 수 있어요.

## 면접에서 이어질 수 있는 질문

### PointAnnotation에 탭이 되면 시선 피드백도 되나요?

같은 보장이 아니에요. 지도 렌더링 콘텐츠의 탭 처리와 네이티브 뷰의 시선 반응을 구분해야 해요.

### 왜 View Annotation을 사용하나요?

지도 좌표에 플랫폼의 네이티브 UI 행동을 연결하기 위해서예요. 다만 지도 데이터 전체를 네이티브 뷰로 대체할 필요는 없어요.

### heading 데이터가 없으면 무엇을 보여 줘야 하나요?

사용자 방향을 안다고 오해하게 만들지 않는 표현이 좋아요. 위치만 표시하거나 별도의 지도 방향 표시로 역할을 나눠요.

## 참고 자료

- [Mapbox: Work with visionOS](https://docs.mapbox.com/ios/maps/guides/work-with-visionos/)
