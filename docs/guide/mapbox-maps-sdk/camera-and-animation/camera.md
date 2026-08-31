---
title: Swift로 이해하는 Mapbox 카메라 위치
description: Mapbox CameraOptions의 중심·확대·방향·기울기와 padding을 구분하고 여러 장소를 화면에 맞추는 방법, 카메라 조회와 이동 제한을 예제로 정리해요.
source: https://docs.mapbox.com/ios/maps/guides/camera-and-animation/camera/
reviewed: '2026-08-31'
---

# Swift로 이해하는 Mapbox 카메라 위치

> **면접 답변 한 줄 요약:** 카메라 위치는 지도의 중심·확대·방향·기울기를 조합한 화면 설정이며, 여러 좌표를 보여줄 때는 화면 여백까지 고려해 계산해야 해요.

공식 [Camera position](https://docs.mapbox.com/ios/maps/guides/camera-and-animation/camera/)에 대응해요. 아래 코드는 “검색된 매장을 모두 보여준다”라는 별도의 학습 상황으로 구성했어요.

## 먼저 알아둘 용어

| 용어            | 쉬운 뜻                                                               |
| --------------- | --------------------------------------------------------------------- |
| center          | 카메라가 바라보는 위도·경도예요.                                      |
| zoom            | 지도를 얼마나 가까이 확대할지 나타내요.                               |
| bearing / pitch | 각각 지도의 회전 방향과 위에서 내려다보는 기울기예요.                 |
| padding         | 지도의 네 가장자리에서 확보할 화면 여백이에요.                        |
| anchor          | 확대·회전의 기준이 되는 화면상의 점이에요. 중심 좌표와 역할이 달라요. |
| UIKit           | 뷰와 화면 컨트롤러로 iOS 화면을 만드는 Apple 프레임워크예요.          |

`center`와 `anchor`는 대체 관계이므로 의도 없이 동시에 지정하지 않아요. 초기 위치, 현재 위치 조회, 좌표 묶음에 맞추기, 이동 제한은 각각 다른 작업이에요. [공식 카메라 가이드](https://docs.mapbox.com/ios/maps/guides/camera-and-animation/camera/)

## 첫 번째 장소만 보여주면 무엇이 빠질까요?

매장 검색 결과가 세 개인데 첫 번째 좌표와 고정 zoom만 사용하면 나머지 결과가 화면 밖에 있을 수 있어요. 반대로 결과가 하나인데 지나치게 멀리 축소하면 선택한 매장을 찾기 어려워요.

학습용 정책을 먼저 정해 볼게요.

- 결과가 없으면 현재 화면을 유지해요.
- 하나이면 해당 장소를 적당히 확대해요.
- 둘 이상이면 모든 좌표를 포함해요.
- 하단 결과 카드가 가리는 영역만큼 여백을 남겨요.

## 결과 수와 실제 화면 크기를 반영해요

지도 SDK 설치와 토큰 설정을 마친 UIKit 화면에서 호출하는 보조 함수예요. 자동 추적을 멈추고 카메라 제어권을 이 함수에 넘겨요.

```swift
import MapboxMaps
import UIKit

/// 검색 결과가 보이도록 카메라를 맞춰요.
/// - Parameters:
///   - coordinates: 표시할 매장 좌표예요. 빈 배열이면 이동하지 않아요.
///   - mapView: 레이아웃이 끝나 유효한 크기를 가진 지도예요.
///   - bottomInset: 하단 카드가 가리는 높이이며 단위는 포인트예요.
/// - Throws: SDK에서 카메라 맞춤 계산에 실패하면 전달해요.
@MainActor
func showSearchResults(
    coordinates: [CLLocationCoordinate2D],
    on mapView: MapView,
    bottomInset: CGFloat
) throws {
    guard !coordinates.isEmpty else { return }
    guard mapView.bounds.width > 0, mapView.bounds.height > 0 else { return }

    let padding = UIEdgeInsets(
        top: 24, left: 24, bottom: max(24, bottomInset), right: 24
    )
    let target: CameraOptions
    if coordinates.count == 1, let coordinate = coordinates.first {
        target = CameraOptions(center: coordinate, padding: padding, zoom: 15)
    } else {
        target = try mapView.mapboxMap.camera(
            for: coordinates,
            camera: CameraOptions(padding: padding, bearing: 0, pitch: 0),
            coordinatesPadding: .zero,
            maxZoom: 16,
            offset: nil
        )
    }
    mapView.viewport.idle()
    mapView.mapboxMap.setCamera(to: target)
}
```

함수의 숫자 15·16·24는 제품의 정답이 아니라 학습용 화면 정책이에요. 실제 카드 높이와 화면 회전 후 크기를 전달하세요. 오류를 무조건 무시하는 대신 호출 화면에서 현재 지도를 유지하면서 재시도나 안내를 제공할 수 있어요.

카메라 계산은 화면에 좌표가 들어오게 하는 작업이지 서버 검색 범위를 결정하는 작업은 아니에요. 두 기능을 결합하면 화면 크기 변경 때문에 검색 결과까지 바뀌는 문제가 생길 수 있어요.

## 현재 값 읽기와 제한 설정을 구분해요

현재 값은 `mapView.mapboxMap.cameraState`에서 읽고, 변화는 `onCameraChanged`로 관찰해요. `setCameraBounds(with:)`는 사용자가 이동 가능한 범위를 제한하는 API예요. 한 번 화면에 맞추는 것만으로 이후 이동까지 금지되지는 않아요. [공식 가이드](https://docs.mapbox.com/ios/maps/guides/camera-and-animation/camera/)

화면 설계에서는 아래 세 질문을 따로 확인하는 편이 좋아요.

| 질문                       | 앱에서 사용하는 시점                     |
| -------------------------- | ---------------------------------------- |
| 지금 어디를 보고 있나요?   | “이 지역 검색” 버튼을 눌렀을 때          |
| 어디로 이동할까요?         | 검색 결과 목록을 선택했을 때             |
| 어디까지 움직일 수 있나요? | 특정 시설 내부만 보여주는 화면을 만들 때 |

관찰 콜백마다 네트워크 검색을 실행하는 방식은 피하세요. 이 예제에서는 사용자가 “이 지역 검색”을 누를 때 현재 중심을 한 번 읽도록 정하면 이동 중 불필요한 요청을 줄일 수 있어요. 이벤트 구독을 추가한다면 반환 토큰을 화면 소유자가 보관하고 종료 시 취소해요.

## 검증할 경계 상황

- 좌표가 없을 때 카메라가 엉뚱한 기본 위치로 돌아가지 않나요?
- 한 좌표와 같은 좌표의 중복 목록이 화면을 지나치게 확대하지 않나요?
- 하단 카드가 커져도 목적지가 보이나요?
- 가로 화면과 작은 기기에서 여백을 제외한 표시 영역이 남나요?
- 날짜 변경선 주변 좌표도 의도한 범위로 보이나요?

마지막 항목은 한국 내 좌표만으로는 발견하기 어려운 테스트예요. 여러 나라를 지원한다면 실제 SDK 렌더링 결과를 확인하세요.

## 면접에서 이어질 수 있는 질문

### 좌표에 맞추기와 이동 제한은 같은가요?

아니요. 맞추기는 현재 화면의 목표를 계산하고, 제한은 이후 사용자가 갈 수 있는 범위를 정해요.

### 하단 카드가 있으면 왜 중심 좌표만 옮기지 않나요?

좌표를 임의로 보정하면 확대 수준과 기기 크기에 따라 결과가 달라져요. 가려진 영역을 화면 여백으로 표현하면 의도를 더 직접적으로 전달할 수 있어요.

### 카메라 이벤트를 모두 SwiftUI 상태에 저장해도 되나요?

화면에서 정말 필요한 값과 갱신 빈도를 먼저 정해야 해요. 카메라 전체를 저장하기보다 버튼을 누를 때 읽거나 필요한 변화만 반영하는 설계를 검토해요.

## 참고 자료

- [Mapbox Camera position](https://docs.mapbox.com/ios/maps/guides/camera-and-animation/camera/)
- [Mapbox MapboxMap API](https://docs.mapbox.com/ios/maps/api/latest/documentation/mapboxmaps/mapboxmap/)
