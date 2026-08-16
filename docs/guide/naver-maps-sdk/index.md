---
title: Swift로 이해하는 Naver Maps iOS SDK
description: Naver Maps iOS SDK가 담당하는 동적 지도 렌더링과 별도 REST API의 역할을 구분하고, 설치부터 위치 표시까지의 학습 순서를 정리합니다.
pageType: doc-wide
outline: false
---

# Swift로 이해하는 Naver Maps iOS SDK

> 면접용 한 줄 요약: **Naver Maps iOS SDK는 앱 안에서 벡터 지도를 그리고 카메라·제스처·오버레이를 다루는 도구이며, 주소 검색이나 경로 탐색은 별도의 Maps REST API가 담당합니다.**

## 먼저 역할부터 구분해요

지도 화면을 만든다고 해서 하나의 SDK가 모든 지도 기능을 제공하는 것은 아니에요. NAVER Cloud Platform Maps는 사용 목적에 따라 기능을 나눠 제공합니다.

```text
SwiftUI / UIKit 화면
        │
        ▼
NMFNaverMapView 또는 NMFMapView
        │
        ▼
NMapsMap + NMapsGeometry
        │
        ▼
Mobile Dynamic Map

앱 ── HTTPS ── 우리 서버 ── Directions / Geocoding REST API
```

[Maps 개요](https://guide.ncloud-docs.com/docs/maps-overview)에 따르면 Mobile Dynamic Map은 지도 유형, 카메라, UI, 오버레이 같은 화면 기능을 제공합니다. 반면 Directions, Geocoding, Reverse Geocoding은 별도의 REST API예요. 따라서 지도 SDK만 설치했다고 `주소 → 좌표` 변환이나 자동차 경로 탐색까지 생기는 것은 아닙니다.

| 만들 기능                     | 선택할 제품                | 호출 위치                             |
| ----------------------------- | -------------------------- | ------------------------------------- |
| 손가락으로 움직이는 벡터 지도 | Mobile Dynamic Map iOS SDK | iOS 앱                                |
| 고정된 지도 이미지            | Static Map                 | 서버 또는 요구 사항에 맞는 클라이언트 |
| 주소를 위도·경도로 변환       | Geocoding                  | 보통 우리 서버                        |
| 위도·경도를 주소로 변환       | Reverse Geocoding          | 보통 우리 서버                        |
| 자동차·도보 경로 계산         | Directions 계열            | 보통 우리 서버                        |

:::warning REST API 비밀 키는 앱에 넣지 않아요
모바일 지도용 `NMFNcpKeyId`는 등록한 Bundle ID로 사용 범위를 제한하지만, REST API의 Client Secret은 앱 번들에 포함하면 안 돼요. 앱은 우리 서버에 요청하고, 서버가 Secret을 보관한 채 NAVER Cloud API를 호출하도록 경계를 나누는 편이 안전합니다.
:::

## 이 문서를 읽기 전에 알아둘 용어

| 용어       | 의미                                                                           |
| ---------- | ------------------------------------------------------------------------------ |
| 좌표       | 지구 위 위치를 나타내는 값이에요. SDK에서는 주로 `NMGLatLng`을 사용합니다.     |
| 카메라     | 지도에서 현재 보이는 중심, 확대 수준, 기울기, 회전 상태를 묶은 개념이에요.     |
| 오버레이   | 지도 위에 올리는 마커, 선, 원, 다각형, 정보 창 같은 객체예요.                  |
| 프로젝션   | 지도 좌표와 화면의 점 좌표를 서로 변환하는 규칙이에요.                         |
| 클러스터링 | 가까이 모인 여러 마커를 확대 수준에 따라 하나의 그룹 마커로 합치는 기법이에요. |
| NCP Key ID | NAVER Cloud Platform 애플리케이션을 식별하는 모바일 지도용 값이에요.           |

## 어떤 지도 뷰를 선택할까요?

SDK는 두 가지 대표 진입점을 제공합니다.

| 타입              | 포함하는 것                                 | 적합한 상황                                   |
| ----------------- | ------------------------------------------- | --------------------------------------------- |
| `NMFMapView`      | 지도 자체                                   | 모든 컨트롤을 앱 디자인에 맞게 직접 배치할 때 |
| `NMFNaverMapView` | `mapView`와 나침반·축척·줌·현재 위치 컨트롤 | 기본 컨트롤을 빠르게 조합할 때                |

`NMFNaverMapView`를 사용해도 실제 카메라와 오버레이 작업은 내부의 `mapView`에서 합니다.

```swift
import NMapsMap

let naverMapView = NMFNaverMapView(frame: .zero)
let mapView = naverMapView.mapView

naverMapView.showZoomControls = true
naverMapView.showCompass = true

let seoulCityHall = NMGLatLng(lat: 37.5666102, lng: 126.9783881)
mapView.moveCamera(NMFCameraUpdate(scrollTo: seoulCityHall))
```

## 여섯 페이지로 나눈 이유

설치, 화면 수명 주기, 카메라 상태, 대량 오버레이, 위치 권한은 실패 원인과 테스트 방법이 서로 달라요. 한 페이지에 모두 넣으면 예제를 복사하기는 쉬워도 책임의 경계를 놓치기 쉽기 때문에 다음 순서로 나눴습니다.

1. [설치와 인증](/guide/naver-maps-sdk/setup-and-authentication)에서 NCP 등록, SPM/CocoaPods, 오류 코드를 확인해요.
2. [좌표, 카메라, 상호작용](/guide/naver-maps-sdk/map-camera-interaction)에서 지도 이동과 탭 이벤트를 배워요.
3. [SwiftUI 연동](/guide/naver-maps-sdk/swiftui-integration)에서 `UIViewRepresentable`과 Coordinator의 역할을 나눠요.
4. [오버레이와 클러스터링](/guide/naver-maps-sdk/overlays-and-clustering)에서 마커 수명 주기와 대량 데이터를 다뤄요.
5. [사용자 위치와 권한](/guide/naver-maps-sdk/user-location)에서 Core Location 권한과 위치 표시 모드를 연결해요.

## 버전 문서는 서로 다를 수 있어요

공식 시작 가이드의 오래된 배포 조건과 현재 배포 패키지의 조건이 다를 수 있습니다. 예를 들어 2026년 8월에 확인한 [SPM-NMapsMap의 3.23.3 `Package.swift`](https://github.com/navermaps/SPM-NMapsMap/blob/3.23.3/Package.swift)는 iOS 12 이상을 선언해요. 실제 프로젝트에서는 블로그나 가이드의 숫자보다 **선택한 패키지 태그의 `Package.swift`와 릴리스 노트**를 기준으로 Deployment Target을 정하세요.

업데이트 전에는 [iOS SDK 변경 내역](https://github.com/navermaps/ios-map-sdk/blob/master/CHANGELOG.md)에서 인증 키 이름, 지원 환경, 동작 변경을 확인하는 습관이 중요합니다.

## 언제 유용한가요?

- 장소 검색 결과를 지도와 목록으로 함께 보여줄 때
- 배달, 모빌리티, 부동산처럼 카메라 영역에 따라 데이터를 다시 조회할 때
- 여러 지점을 마커·경로·영역으로 시각화할 때
- 사용자의 현재 위치를 기준으로 주변 정보를 보여줄 때

반대로 주소 한 줄을 좌표로 바꾸거나 경로만 계산하는 서버 작업에는 iOS SDK가 아니라 해당 REST API가 맞습니다.

## 시작 전 체크리스트

- [ ] 화면 표시와 검색·경로 계산의 제품 경계를 구분했나요?
- [ ] NCP 애플리케이션에 Dynamic Map과 실제 Bundle ID를 등록했나요?
- [ ] 선택한 SDK 버전의 최소 iOS 버전을 확인했나요?
- [ ] REST API Client Secret을 iOS 앱에 넣지 않았나요?
- [ ] 지도 뷰, 오버레이, 위치 추적의 수명 주기를 각각 설계했나요?

## 면접에서 이어질 수 있는 질문

### Naver Maps SDK가 Geocoding도 직접 제공하나요?

아니요. iOS SDK는 동적 지도 렌더링과 상호작용을 담당하고, Geocoding은 별도 REST API입니다. 비밀 키가 필요한 REST 호출은 보통 서버를 경유하게 설계합니다.

### `NMFMapView`와 `NMFNaverMapView`의 차이는 무엇인가요?

`NMFMapView`는 지도 자체이고, `NMFNaverMapView`는 그 지도와 기본 UI 컨트롤을 함께 제공하는 컨테이너입니다. 커스텀 UI가 중요하면 전자를, 빠른 기본 구성이 중요하면 후자를 선택할 수 있어요.

## 참고 자료

- [NAVER Maps iOS SDK 공식 가이드](https://navermaps.github.io/ios-map-sdk/guide-ko/)
- [NAVER Maps iOS SDK API Reference](https://navermaps.github.io/ios-map-sdk/reference/)
- [NAVER Cloud Platform Maps 개요](https://guide.ncloud-docs.com/docs/maps-overview)
- [NAVER Maps iOS SDK 데모 저장소](https://github.com/navermaps/ios-map-sdk)
- [SPM-NMapsMap 공식 패키지](https://github.com/navermaps/SPM-NMapsMap)
