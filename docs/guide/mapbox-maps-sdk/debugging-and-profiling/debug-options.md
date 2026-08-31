---
title: Mapbox 지도 디버그 옵션
description: 카메라·여백·타일·라벨 충돌·겹쳐 그리기 디버그 표시를 문제 유형별로 선택하고 SwiftUI와 UIKit에서 개발용으로만 적용하는 방법을 정리합니다.
source: https://docs.mapbox.com/ios/maps/guides/debugging-and-profiling/debug-options/
reviewed: '2026-08-31'
---

# Mapbox 지도 디버그 옵션

> **면접 답변 한 줄 요약:** 지도 디버그 옵션은 평소 숨겨진 카메라·타일·라벨 배치 정보를 화면에 드러내 시각 오류의 원인을 좁히는 개발용 도구예요.

매장 이름이 사라졌다고 곧바로 데이터 요청 실패로 판단하지 마세요. 데이터는 있어도 화면 배치 과정에서 라벨이 충돌하거나 카메라 여백 밖에 놓일 수 있어요.

## 먼저 알아둘 용어

| 용어            | 쉬운 뜻                                                   |
| --------------- | --------------------------------------------------------- |
| Camera          | 지도를 바라보는 중심·확대·회전·기울기 등의 상태예요.      |
| Tile            | 지도를 나누어 요청하고 그리는 조각이에요.                 |
| Collision       | 라벨이나 기호를 배치할 때 서로 겹치는 상태예요.           |
| Overdraw        | 같은 화면 영역을 여러 번 그리는 일이에요.                 |
| UIKit / SwiftUI | Apple의 화면 구성 프레임워크이며 지도 설정 방식이 달라요. |

## 확인할 원인과 표시를 짝지어요

Mapbox는 SwiftUI의 `.debugOptions(...)`와 UIKit `MapView.debugOptions`로 진단 표시를 켤 수 있어요. 이 표시는 렌더링과 성능에 영향을 줄 수 있어 **개발 전용**이에요. [공식 디버그 옵션](https://docs.mapbox.com/ios/maps/guides/debugging-and-profiling/debug-options/)

| 조사할 것           | 원문의 옵션                                     | 화면에서 확인할 단서                 |
| ------------------- | ----------------------------------------------- | ------------------------------------ |
| 바라보는 위치·여백  | Camera, Padding                                 | 좌표·확대와 카메라 여백이에요.       |
| 지도 조각 경계·로드 | Tile borders, Parse status, Timestamps          | 경계, 타일 좌표와 로드 시각이에요.   |
| 라벨 배치           | Collision                                       | 글자·기호의 충돌 경계예요.           |
| 겹친 그리기         | Overdraw                                        | 겹칠수록 두드러지는 화면 영역이에요. |
| 3D·렌더링 내부      | Model bounds, Light, Stencil clip, Depth buffer | 모델 경계·조명·버퍼의 상태예요.      |

표는 관찰 도구의 범위를 정리한 것이지, 표시가 보이면 오류라는 뜻은 아니에요. 정상 지도도 타일 경계와 라벨 충돌을 처리해요.

## SwiftUI에서는 조사용 지도를 작게 만들어요

처음부터 모든 표시를 켜면 지도와 진단선이 겹쳐 읽기 어려워요. 아래 예제는 “카메라가 맞는가, 라벨 충돌이 있는가”만 보는 개발용 화면이에요.

```swift
import MapboxMaps
import SwiftUI

struct LabelDiagnosticsMap: View {
    var body: some View {
        #if DEBUG
        Map()
            .debugOptions([.camera, .collision])
        #else
        Map()
        #endif
    }
}
```

`DEBUG`는 빌드 구성에 따라 달라요. 실제 배포용 구성의 컴파일 조건을 확인해야 하며, 테스트 화면을 앱에 연결하는 코드까지 자동으로 제외하는 것은 아니에요.

## UIKit에서는 기존 MapView에 적용해요

아래 함수는 이미 만든 지도에 카메라·여백 표시를 적용해요. 지도 객체를 새로 생성하지 않아요.

```swift
import MapboxMaps

/// 개발 빌드에서 카메라 위치와 여백을 확인합니다.
/// - Parameter mapView: 조사하려는 기존 지도 뷰입니다.
@MainActor
func inspectCameraLayout(
    mapView: MapView
) {
    #if DEBUG
    mapView.debugOptions = [.camera, .padding]
    #else
    mapView.debugOptions = []
    #endif
}
```

UIKit 예제와 SwiftUI 예제는 같은 목적의 대안이에요. 둘을 중첩해 사용할 필요는 없어요. 문제를 좁힌 뒤에는 다른 옵션으로 교체하거나 빈 배열로 해제해요.

## 관찰에서 수정으로 넘어가는 절차

다음은 매장 라벨 누락을 조사하는 작성자 실험 예시예요.

1. 같은 좌표·확대 수준에서 문제가 반복되는지 확인해요.
2. 충돌 표시만 켜고 주변 라벨이 겹치는지 봐요.
3. 데이터가 실제 존재하는지 별도의 조회 결과와 비교해요.
4. 라벨 크기나 표시 조건 하나만 바꾸어 다시 봐요.
5. 진단 표시를 끄고 제품 화면에서 읽기 쉬운지 확인해요.

충돌을 피하려고 모든 라벨을 강제로 보이게 하면 지도는 오히려 읽기 어려워질 수 있어요. 표시 개수보다 사용자가 선택할 장소를 구분할 수 있는지가 기준이에요.

## 적용 체크리스트

- [ ] 가설 하나를 확인하는 최소 옵션만 켰나요?
- [ ] 진단선 자체를 렌더링 오류로 오해하지 않았나요?
- [ ] 캡처에 좌표·개인 위치가 남으면 공유 전에 확인하나요?
- [ ] 성능 비교 시 진단 옵션을 같은 조건으로 맞췄나요?
- [ ] 배포 구성에서 옵션과 조사용 화면을 제외했나요?

## 면접에서 이어질 수 있는 질문

### Collision 표시만 보고 데이터 유무를 확정할 수 있나요?

아니에요. 충돌 표시는 배치 문제를 조사하는 단서예요. Source 데이터와 표시 조건도 따로 확인해야 해요.

### Overdraw가 보이면 무조건 줄여야 하나요?

시각 효과를 위해 필요한 겹침도 있어요. 사용자 가치가 있는 표현인지 판단하고, 실제 성능 영향을 측정한 뒤 줄여야 해요.

### 왜 개발 전용인가요?

제품 화면과 실행 비용을 바꾸는 진단 기능이기 때문이에요. 원인 조사에는 유용하지만 사용자에게 제공할 화면의 일부는 아니에요.

## 참고 자료

- [Mapbox: Map Debug Options](https://docs.mapbox.com/ios/maps/guides/debugging-and-profiling/debug-options/)
