---
title: Mapbox v10에서 v11로 전환하기
description: Mapbox v11의 스타일·이벤트·토큰·위치 API 변경과 제거된 기능을 구분하고 작은 변경 단위와 회귀 검증으로 기존 v10 앱을 전환하는 방법을 정리해요.
source: https://docs.mapbox.com/ios/maps/guides/migrate-to-v11/
reviewed: '2026-08-31'
---

# Mapbox v10에서 v11로 전환하기

> **면접 답변 한 줄 요약:** v11 전환은 이름 치환만이 아니라 스타일 구성, 이벤트 구독 수명과 리소스 설정의 책임을 새 API에 맞추는 작업이에요.

공식 [Migrate to v11](https://docs.mapbox.com/ios/maps/guides/migrate-to-v11/)에 대응해요. 원문의 방대한 변경 목록은 링크로 확인하고, 여기서는 전환 순서와 검증 경계를 정리해요.

:::warning 최초 버전 표와 현재 요구 사항은 달라요
원문의 호환성 표는 `11.0.0` 기준이에요. 그 표의 iOS 12·Xcode 14.1을 현재 전체 v11 요구 사항으로 사용하지 않아요. 선택한 릴리스의 요구 사항은 [설치](./install.md)와 패키지에서 확인해요.
:::

## 먼저 알아둘 용어

| 용어            | 쉬운 뜻                                                             |
| --------------- | ------------------------------------------------------------------- |
| Breaking change | 기존 호출이나 동작 가정이 그대로 유지되지 않는 변경이에요.          |
| Deprecated      | 다른 API로 옮기도록 안내된 상태예요. 즉시 제거됐다는 뜻은 아니에요. |
| 구독 토큰       | 이벤트를 받는 기간을 관리하는 취소 가능한 객체예요.                 |
| 회귀 테스트     | 변경 전 되던 동작이 유지되는지 확인하는 시험이에요.                 |

## 변경 영역을 먼저 분류해요

| 영역        | 주요 변화                                                    | 확인할 문서                                                      |
| ----------- | ------------------------------------------------------------ | ---------------------------------------------------------------- |
| 스타일      | Standard·import·slot과 직접 Style API 접근                   | [지도 스타일](./styles/index.md)                                 |
| 이벤트      | 타입이 있는 Signal과 구독 토큰                               | [SwiftUI](./swift-ui.md)                                         |
| 토큰·리소스 | `MapboxOptions`, `MapboxMapsOptions`; `ResourceOptions` 제거 | [설치](./install.md)                                             |
| 위치        | 위치와 heading 공급자 분리                                   | [사용자 위치](./user-location.md)                                |
| 화면 입력   | 콘텐츠별 핸들러와 전파                                       | [지도 콘텐츠 제스처](./user-interaction/map-content-gestures.md) |
| 오프라인    | 생성·삭제 콜백과 옵션 변경                                   | [오프라인 데이터](./offline/manage-offline-data.md)              |
| 진단        | 기록·추적 API                                                | [디버깅](./debugging-and-profiling/index.md)                     |

Source 생성 시 ID와 Layer 생성 시 Source를 명시하는 변화도 확인해요. `cameraState`는 `mapView.mapboxMap`에서 읽고, 필요한 `UIKit` import는 직접 추가해요. v10의 사용자 정의 HTTP 스택 교체 가능성을 v11에도 그대로 가정하면 안 돼요.

## 이벤트는 이름보다 수명이 중요해요

기존 `onEvery`·`onNext` 호출을 새 관찰 API로 바꾼 뒤, 토큰을 버리면 기대한 업데이트가 유지되지 않을 수 있어요.

아래는 화면에서 줌을 관찰하는 독립 예제예요. 관찰 시작과 중지를 명시해 재연결 시 구독이 쌓이지 않게 했어요.

```swift
import MapboxMaps

@MainActor
final class ZoomReadout {
    private var observation: AnyCancelable?
    private(set) var zoom: Double = 0

    /// 기존 구독을 교체하고 지정한 지도의 줌을 관찰해요.
    /// - Parameter map: 관찰 기간 동안 화면이 사용하는 지도 객체예요.
    func attach(
        to map: MapboxMap
    ) {
        stop()
        zoom = map.cameraState.zoom
        observation = map.onCameraChanged.observe { [weak self] event in
            self?.zoom = event.cameraState.zoom
        }
    }

    func stop() {
        observation?.cancel()
        observation = nil
    }
}
```

타입이 있는 이벤트에서 값을 읽으므로 문자열 키를 추측할 필요가 없어요. 다만 이 모델은 UI 바인딩을 구현하지 않았어요. 매 프레임 상태를 화면에 전달해야 하는지도 별도로 판단하세요.

## 신규 기능 도입과 버전 전환을 분리해요

학습용 전환 계획은 다음처럼 구성할 수 있어요.

1. 현재 앱의 지도 화면과 기능별 성공·실패 시나리오를 기록해요.
2. SDK 의존성을 바꾸고 제거된 API부터 고쳐 빌드를 복구해요.
3. 토큰·관찰·위치·오프라인 소유 경계를 점검해요.
4. 같은 카메라와 데이터로 전후 화면을 비교해요.
5. 마지막에 Standard나 새로운 SwiftUI 화면을 별도 변경으로 도입해요.

스타일과 데이터 처리, UI 프레임워크까지 한 번에 바꾸면 시각적 차이의 원인을 찾기 어려워요. 전환이 완료되기 전에 이전 저장 데이터를 삭제하거나 사용자가 받은 오프라인 지도를 초기화하지 않도록 주의하세요.

## 회귀 체크리스트

- [ ] 스타일 재로드 뒤 사용자 레이어가 복구되나요?
- [ ] 화면 재진입과 구독 해제가 정상인가요?
- [ ] 위치 권한·방향 표시·카메라 추적을 별도로 시험했나요?
- [ ] 기존 오프라인 다운로드와 오류 처리가 유지되나요?
- [ ] 배경 지도, 3D 표현과 레이어 순서의 변화가 의도한 것인가요?

## 면접에서 이어질 수 있는 질문

### Deprecated와 removed는 같은가요

아니에요. 전자는 이전을 권장하는 상태이고 후자는 호출 자체를 유지할 수 없는 상태예요.

### 코드가 컴파일되면 전환이 끝났나요

아니에요. 기본 스타일, 구독 수명과 위치·오프라인 동작은 실행 검증이 필요해요.

### v6 앱도 이 문서만 보면 되나요

v6에서 v10으로 바뀐 구조를 먼저 확인해야 해요. [v10 전환](./old-versions/migrate-to-v10.md)과 함께 읽으세요.

## 참고 자료

- [Migrate to v11](https://docs.mapbox.com/ios/maps/guides/migrate-to-v11/)
- [11.29.1 SDK](https://github.com/mapbox/mapbox-maps-ios/tree/11.29.1)
