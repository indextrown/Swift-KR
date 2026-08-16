---
title: Mapbox 사용자 위치와 권한
description: Core Location 권한과 Mapbox Puck2D, heading·course, followPuck Viewport를 연결하고 정확도·Simulator·사용자 제스처를 안전하게 처리하는 방법을 설명합니다.
pageType: doc-wide
outline: false
---

# Mapbox 사용자 위치와 권한

> 면접용 한 줄 요약: **Mapbox의 Puck은 위치를 지도에 표현하고 Viewport는 카메라 추적을 담당하지만, 위치 접근의 목적과 권한·정확도 정책은 앱이 Core Location 규칙에 맞게 설계해야 합니다.**

## 먼저 알아둘 위치 용어

| 용어             | 쉬운 뜻                                                                         |
| ---------------- | ------------------------------------------------------------------------------- |
| Core Location    | iOS에서 위치 권한과 GPS·Wi-Fi·기지국 기반 위치를 제공하는 Apple 프레임워크예요. |
| Puck             | 지도 위에 사용자의 현재 위치와 방향을 표시하는 2D 또는 3D 표시예요.             |
| heading          | 기기가 가리키는 나침반 방향이에요. 가만히 있어도 얻을 수 있어요.                |
| course           | 실제 이동 경로가 향하는 방향이에요. 움직임이 있어야 의미가 생겨요.              |
| reduced accuracy | 사용자가 정확한 위치 대신 대략적인 위치만 허용한 상태예요.                      |
| follow-puck      | 카메라가 Puck의 위치를 계속 따라가는 Viewport 상태예요.                         |

## 위치 표시와 카메라 추적은 다른 책임이에요

`Puck2D`를 추가하면 사용자 위치가 지도에 그려집니다. 카메라를 사용자에게 고정하려면 별도로 `.followPuck` Viewport를 사용해요.

```text
AppleLocationProvider
        │ Location / Heading
        ▼
   LocationManager
     │        │
     ▼        ▼
  Puck2D    followPuck Viewport
 위치 표현      카메라 추적
```

Puck이 보인다고 카메라가 자동으로 따라가는 것은 아니며, 카메라가 따라간다고 위치 접근 목적 설명이 생략되는 것도 아닙니다.

## 1단계: 사용 이유를 `Info.plist`에 설명해요

앱을 사용하는 동안 주변 장소를 보여 주는 기능이라면 다음 키를 추가합니다.

```xml
<key>NSLocationWhenInUseUsageDescription</key>
<string>현재 위치 주변의 장소를 지도에 보여드리기 위해 위치를 사용합니다.</string>
```

“서비스 제공을 위해 필요합니다”처럼 추상적인 문장보다 사용자가 보게 될 기능을 구체적으로 설명하세요. 위치를 쓰지 않는 화면에서 앱 시작 즉시 권한을 요청하기보다 사용자가 “내 위치” 기능을 선택한 맥락에서 요청하는 편이 이해하기 쉽습니다.

:::warning Always 권한을 기본값으로 요청하지 않아요
백그라운드 위치 기능이 실제 제품 요구 사항이고 사용자가 가치를 이해할 수 있을 때만 `NSLocationAlwaysAndWhenInUseUsageDescription`과 관련 capability를 검토하세요. 지도에 현재 위치를 보여 주는 일반 화면은 When In Use로 시작할 수 있습니다.
:::

## 2단계: Puck을 지도에 선언해요

```swift
import MapboxMaps
import SwiftUI

struct UserLocationMap: View {
  var body: some View {
    Map {
      Puck2D(bearing: .heading)
        .showsAccuracyRing(true)
    }
  }
}
```

`Puck2D()`는 위치만 표시하고, `bearing: .heading`을 전달하면 기기의 방향을 함께 보여줘요. 정확도 ring은 현재 위치가 한 점이 아니라 오차 범위를 가진 측정값이라는 사실을 사용자에게 전달합니다.

공식 User Location 가이드에 따르면 Maps SDK의 `LocationManager`는 기본 `AppleLocationProvider`를 사용합니다. custom provider가 필요하지 않다면 앱에서 별도 `CLLocationManager`를 만들어 같은 권한과 위치 흐름을 중복 관리하지 마세요.

## 3단계: 카메라가 사용자를 따라가게 해요

```swift
struct FollowingMap: View {
  @State private var viewport: Viewport = .followPuck(
    zoom: 15,
    bearing: .heading,
    pitch: 45
  )

  var body: some View {
    ZStack(alignment: .bottomTrailing) {
      Map(viewport: $viewport) {
        Puck2D(bearing: .heading)
          .showsAccuracyRing(true)
      }

      Button {
        withViewportAnimation(.default(maxDuration: 1.0)) {
          viewport = .followPuck(
            zoom: 15,
            bearing: .heading,
            pitch: 45
          )
        }
      } label: {
        Image(systemName: "location.fill")
      }
      .buttonStyle(.borderedProminent)
      .padding()
    }
  }
}
```

사용자가 지도를 드래그하면 Viewport가 `.idle`이 되어 추적이 멈춥니다. 위 버튼은 사용자가 원할 때만 follow-puck으로 돌아가게 해요. 드래그 직후 자동으로 추적을 재개하면 사용자가 보려던 위치를 빼앗게 됩니다.

## heading과 course를 상황에 맞게 골라요

| 기준      | heading                            | course                            |
| --------- | ---------------------------------- | --------------------------------- |
| 의미      | 기기 윗부분이 가리키는 나침반 방향 | 실제 위치 변화가 향하는 이동 방향 |
| 정지 상태 | 사용할 수 있음                     | 신뢰하기 어려움                   |
| 대표 화면 | 주변 탐색, AR 방향                 | 차량·자전거 이동                  |
| 주의점    | 자력계 간섭과 calibration          | 느린 이동과 위치 오차에 민감      |

사용자가 걷지 않는데 course로 Puck을 회전시키면 방향이 없거나 오래된 값이 남을 수 있어요. 주변 지도는 heading, 이동 경로 중심 화면은 course를 검토하되 품질이 낮을 때의 fallback을 정합니다.

## 정확한 위치를 거부해도 앱이 동작하게 해요

iOS 14 이상에서는 사용자가 정확한 위치를 끄고 reduced accuracy만 허용할 수 있어요. 주변 도시나 대략적인 지역을 보여 주는 기능이라면 그대로 동작하게 설계합니다.

정확한 승하차 지점처럼 특정 기능에만 full accuracy가 꼭 필요하면 임시 정확도 요청의 목적 key를 준비할 수 있어요.

```xml
<key>NSLocationTemporaryUsageDescriptionDictionary</key>
<dict>
  <key>PickupLocationAccuracy</key>
  <string>정확한 승차 위치를 기사에게 전달하기 위해 잠시 정확한 위치가 필요합니다.</string>
</dict>
```

정확도를 항상 요구하지 말고 기능을 실행하는 시점에 목적을 설명한 뒤 요청하세요. 거부한 경우 지도를 직접 움직여 위치를 고르거나 주소를 검색하는 대안을 제공하면 기능 전체가 막히지 않습니다.

## 권한 상태별 UI를 설계해요

| 상태              | 화면 동작                                                        |
| ----------------- | ---------------------------------------------------------------- |
| not determined    | 기능을 설명한 뒤 사용자 액션에서 권한을 요청해요.                |
| authorized        | Puck과 내 위치 버튼을 활성화해요.                                |
| reduced accuracy  | 대략적 위치임을 고려하고 정밀 기능에 대안을 제공해요.            |
| denied/restricted | 설정 이동 안내와 수동 장소 선택을 제공해요.                      |
| 위치 신호 대기 중 | 마지막 위치를 현재 위치로 단정하지 말고 loading 상태를 보여줘요. |

권한 거부를 오류처럼 반복 alert로 막기보다 위치 없이도 쓸 수 있는 기본 지도와 검색 기능을 유지하세요.

## 위치가 안 보일 때 순서대로 확인해요

1. `NSLocationWhenInUseUsageDescription`이 실제 앱 Target의 `Info.plist`에 들어갔는지 확인해요.
2. Simulator에서 **Debug → Simulate Location**으로 테스트 위치를 선택해요.
3. Settings → Privacy & Security → Location Services에서 앱 권한을 확인해요.
4. `Map` content에 Puck이 하나만 선언되었는지 확인해요.
5. 카메라가 다른 대륙을 보고 있다면 `.followPuck`으로 이동해요.
6. 실제 기기에서 위치 서비스, 비행기 모드와 실내 GPS 환경을 확인해요.

공식 가이드는 한 지도에 Puck을 여러 개 선언하면 마지막 Puck만 표시된다고 안내합니다.

## custom location provider는 테스트·특수 센서에 사용해요

기본 GPS가 아니라 재생 경로, 외부 센서, 테스트 위치를 지도에 공급해야 할 수 있어요. 이때 `LocationProvider`와 `HeadingProvider`를 override할 수 있습니다.

```text
프로덕션: AppleLocationProvider ──> LocationManager ──> Puck
테스트:   RecordedLocationProvider ─> LocationManager ──> Puck
```

custom provider를 사용해도 위치 권한 책임이 자동으로 사라지지는 않아요. 실제 사용자 위치를 얻는 주체가 앱이라면 적절한 권한을 요청해야 합니다. provider의 update 주기, MainActor 전달, 종료와 재시작 수명 주기도 명시적으로 관리하세요.

## 위치 이벤트와 비즈니스 요청을 분리해요

위치가 갱신될 때마다 주변 API를 호출하면 배터리와 네트워크 사용량이 커질 수 있어요.

```text
위치 update
  ├─ Puck은 부드럽게 갱신
  └─ 앱 model은 거리·시간 조건 검사
         └─ 의미 있게 이동했을 때만 주변 장소 재조회
```

지도 표현은 빠른 update를 받을 수 있지만 서버 요청은 거리 threshold, debounce, 사용자 새로고침 같은 별도 정책을 적용합니다. 위치 provider나 View 안에서 네트워크 요청을 직접 섞지 않는 편이 테스트하기 쉬워요.

## 개인정보와 telemetry를 함께 확인해요

위치 권한 문구만 추가했다고 개인정보 검토가 끝난 것은 아닙니다.

- 수집하는 위치의 정확도와 보관 기간을 정했나요?
- 위치를 서버로 보낼 때 꼭 필요한가요?
- 사용자가 위치 기능을 끈 뒤 기존 데이터 삭제 경로가 있나요?
- 앱 개인정보 처리방침과 App Store Privacy 응답이 실제 동작과 맞나요?
- Mapbox attribution control을 통한 telemetry opt-out 경로가 유지되나요?

법적 요구와 Mapbox 약관은 출시 시점에 다시 검토하세요.

## 적용 순서를 정리해요

1. 위치가 필요한 사용자 기능과 대체 흐름을 먼저 정의해요.
2. 그 기능에 필요한 최소 권한과 정확도를 선택해요.
3. 사용자 액션 시점에 구체적인 목적을 설명하고 요청해요.
4. Puck으로 위치를 표시하고 카메라 추적은 별도 Viewport로 연결해요.
5. 사용자 제스처가 추적을 멈추게 하고 버튼으로 다시 시작해요.
6. denied·reduced accuracy·신호 대기 상태의 UI를 각각 준비해요.
7. 위치 update와 서버 요청의 빈도를 분리해 배터리와 비용을 관리해요.

## 면접에서 이어질 수 있는 질문

### Puck과 follow-puck Viewport의 차이는 무엇인가요?

Puck은 사용자 위치를 지도에 그리는 콘텐츠이고, follow-puck은 카메라가 그 위치를 따라가게 하는 상태입니다. 하나만 사용해도 다른 하나가 자동으로 생기지 않아요.

### heading과 course는 어떻게 다른가요?

heading은 기기가 향한 나침반 방향이고 course는 실제 이동 방향입니다. 정지 중 방향이 필요하면 heading이 맞고, 차량처럼 움직임을 기준으로 회전하려면 course를 검토해요.

### reduced accuracy에서는 어떻게 대응하나요?

정밀 위치가 없어도 가능한 기능은 대략적 위치로 계속 제공합니다. 정말 필요한 특정 기능에서만 임시 full accuracy를 설명하고 요청하며, 거부하면 주소 검색이나 지도 핀 이동 같은 대안을 제공해요.

## 참고 자료

- [Mapbox User Location 가이드](https://docs.mapbox.com/ios/maps/guides/user-location/)
- [Mapbox SwiftUI의 사용자 위치](https://docs.mapbox.com/ios/maps/guides/swift-ui/#displaying-a-users-location)
- [Apple 위치 서비스 권한 요청](https://developer.apple.com/documentation/corelocation/requesting-authorization-to-use-location-services)
- [Apple `accuracyAuthorization`](https://developer.apple.com/documentation/corelocation/cllocationmanager/accuracyauthorization)
- [Mapbox 모바일 앱과 telemetry 안내](https://docs.mapbox.com/help/dive-deeper/mobile-apps/)
