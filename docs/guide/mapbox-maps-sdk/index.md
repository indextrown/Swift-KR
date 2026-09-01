---
title: Mapbox Maps SDK 공식 가이드 학습 목차
description: Mapbox Maps SDK for iOS 공식 Guides의 38개 페이지를 한국어 문서와 일대일로 연결하고 지도 데이터, 스타일, 카메라, 운영과 버전 전환의 학습 순서를 정리해요.
source: https://docs.mapbox.com/ios/maps/guides/
reviewed: '2026-08-31'
---

# Mapbox Maps SDK 공식 가이드 학습 목차

> **면접 답변 한 줄 요약:** Mapbox Maps SDK는 앱의 지도 화면과 지리 데이터 표현을 담당하며, 데이터·스타일·카메라·사용자 입력을 나눠 구성할 수 있는 지도 개발 도구예요.

공식 [Maps SDK for iOS — Guides](https://docs.mapbox.com/ios/maps/guides/)에 대응하는 학습 섹션이에요. **공식 개요 1개와 메뉴·하위 가이드 37개를 각각 한 페이지로 연결**했어요. 원문 전체 번역이 아니라 항목별 개념, 사용법과 주의점을 직접 정리했으며, 아래 대응표에서 원문으로 이동할 수 있어요.

## 먼저 알아둘 용어

| 용어                          | 쉬운 뜻                                                  |
| ----------------------------- | -------------------------------------------------------- |
| SDK(Software Development Kit) | 앱에 특정 기능을 붙이는 코드와 도구 묶음이에요.          |
| Style                         | 지도에 무엇을 어떤 모습으로 그릴지 정하는 설계예요.      |
| Source / Layer                | 지도 데이터의 공급원과 그 데이터를 그리는 규칙이에요.    |
| Camera                        | 어느 위치를 어느 방향과 크기로 바라볼지 정하는 값이에요. |
| SwiftUI / UIKit               | Apple 플랫폼의 화면을 만드는 두 UI 프레임워크예요.       |

## 무엇을 만들 수 있나요

공식 개요는 기본 지도 스타일, 앱 데이터 표시, 화면 이동과 상호작용을 소개해요. 지도 디자인은 Mapbox Studio와 연결할 수 있고, 정적 이미지만 필요하다면 `Snapshotter`도 선택지예요.

학습할 때는 “지도에 보여 줄 데이터”와 “지도에서 실행할 업무”를 구분해 보세요. 예를 들어 매장 좌표를 그리는 일과 예약을 처리하는 일은 서로 다른 책임이에요. 지도를 바꾸더라도 예약 모델까지 바꿔야 하는 구조는 피하는 편이 좋아요.

## 버전과 표시 조건을 먼저 확인해요

2026-08-31 확인 시 공식 개요의 SDK 버전은 **11.29.1**, 최소 환경은 **iOS 14·Swift 5.9·Xcode 16**이며 Xcode 권장 버전은 26.4예요. 이 문서의 기준은 확인 당시의 가이드와 [11.29.1 소스](https://github.com/mapbox/mapbox-maps-ios/tree/11.29.1)예요. 각 기능의 도입 버전과 실험 상태는 별도로 확인해요.

새 예제의 공통 검증 대상은 **iOS 17 이상·Swift 5 언어 모드**예요. SDK의 최소 지원 버전과 예제 UI가 사용하는 Apple API의 가용 버전은 다를 수 있어요. 같은 페이지의 코드 블록은 앞에서 선언한 타입·import를 이어서 사용하는 경우가 있어요. 실제 지도 렌더링에는 유효한 공개 토큰과 실행 환경이 필요하며, 위치·백그라운드 동작과 visionOS 입력은 해당 기기에서 별도로 확인해야 해요.

Mapbox wordmark, 데이터 attribution, telemetry 선택 해제 경로는 출시 전에 공식 조건과 대조해야 해요. 기본 표시를 없앤다면 대체 UI의 의무도 확인하세요. 예제에서 지도가 보이는 것만으로 출시 준비가 끝나지는 않아요.

## 공식 목차와 일대일 대응표

좌측 목차는 공식 Guides의 순서와 부모·자식 관계를 따르되 한국어로 표시해요. 펼칠 수 있는 그룹은 기본적으로 닫혀 있어요. Examples, API Reference, 다른 제품의 Tutorial 전체는 이번 38페이지 범위와 별개예요.

| 순서 | 공식 항목                         | 한국어 문서                                                      | 출처                                                                                       |
| ---- | --------------------------------- | ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| 1    | Maps SDK for iOS                  | [가이드 개요](./index.md)                                        | [원문](https://docs.mapbox.com/ios/maps/guides/)                                           |
| 2    | Get Started                       | [설치와 시작하기](./install.md)                                  | [원문](https://docs.mapbox.com/ios/maps/guides/install/)                                   |
| 3    | User Location                     | [사용자 위치](./user-location.md)                                | [원문](https://docs.mapbox.com/ios/maps/guides/user-location/)                             |
| 4    | Add your Data                     | [데이터 추가](./add-your-data/index.md)                          | [원문](https://docs.mapbox.com/ios/maps/guides/add-your-data/)                             |
| 5    | ↳ Markers                         | [마커](./add-your-data/markers.md)                               | [원문](https://docs.mapbox.com/ios/maps/guides/add-your-data/markers/)                     |
| 6    | ↳ Annotations                     | [어노테이션](./add-your-data/annotations.md)                     | [원문](https://docs.mapbox.com/ios/maps/guides/add-your-data/annotations/)                 |
| 7    | ↳ View annotations                | [뷰 어노테이션](./add-your-data/view-annotations.md)             | [원문](https://docs.mapbox.com/ios/maps/guides/add-your-data/view-annotations/)            |
| 8    | ↳ Style layers                    | [스타일 레이어로 데이터 표시](./add-your-data/style-layers.md)   | [원문](https://docs.mapbox.com/ios/maps/guides/add-your-data/style-layers/)                |
| 9    | Map Styles                        | [지도 스타일](./styles/index.md)                                 | [원문](https://docs.mapbox.com/ios/maps/guides/styles/)                                    |
| 10   | ↳ Set a style                     | [스타일 설정](./styles/set-a-style.md)                           | [원문](https://docs.mapbox.com/ios/maps/guides/styles/set-a-style/)                        |
| 11   | ↳ Work with sources and layers    | [소스와 레이어 다루기](./styles/work-with-layers.md)             | [원문](https://docs.mapbox.com/ios/maps/guides/styles/work-with-layers/)                   |
| 12   | ↳ Styling layers with expressions | [표현식으로 레이어 스타일 지정](./styles/style-layers.md)        | [원문](https://docs.mapbox.com/ios/maps/guides/styles/style-layers/)                       |
| 13   | ↳ Declarative Map Styling         | [선언적 지도 스타일](./styles/declarative-map-styling.md)        | [원문](https://docs.mapbox.com/ios/maps/guides/styles/declarative-map-styling/)            |
| 14   | SwiftUI                           | [SwiftUI 통합](./swift-ui.md)                                    | [원문](https://docs.mapbox.com/ios/maps/guides/swift-ui/)                                  |
| 15   | Camera and Animations             | [카메라와 애니메이션](./camera-and-animation/index.md)           | [원문](https://docs.mapbox.com/ios/maps/guides/camera-and-animation/)                      |
| 16   | ↳ Camera position                 | [카메라 위치](./camera-and-animation/camera.md)                  | [원문](https://docs.mapbox.com/ios/maps/guides/camera-and-animation/camera/)               |
| 17   | ↳ Animations                      | [애니메이션](./camera-and-animation/animations.md)               | [원문](https://docs.mapbox.com/ios/maps/guides/camera-and-animation/animations/)           |
| 18   | ↳ Viewport                        | [뷰포트](./camera-and-animation/viewport.md)                     | [원문](https://docs.mapbox.com/ios/maps/guides/camera-and-animation/viewport/)             |
| 19   | User Interaction                  | [사용자 상호작용](./user-interaction/index.md)                   | [원문](https://docs.mapbox.com/ios/maps/guides/user-interaction/)                          |
| 20   | ↳ Gestures                        | [제스처](./user-interaction/gestures.md)                         | [원문](https://docs.mapbox.com/ios/maps/guides/user-interaction/gestures/)                 |
| 21   | ↳ Interactions API                | [상호작용 API](./user-interaction/interactions.md)               | [원문](https://docs.mapbox.com/ios/maps/guides/user-interaction/Interactions/)             |
| 22   | ↳ Map Content Gestures            | [지도 콘텐츠 제스처](./user-interaction/map-content-gestures.md) | [원문](https://docs.mapbox.com/ios/maps/guides/user-interaction/map-content-gestures/)     |
| 23   | Geofencing                        | [지오펜싱](./geofencing.md)                                      | [원문](https://docs.mapbox.com/ios/maps/guides/geofencing/)                                |
| 24   | Indoor mapping                    | [실내 지도](./indoor.md)                                         | [원문](https://docs.mapbox.com/ios/maps/guides/indoor/)                                    |
| 25   | Offline Maps                      | [오프라인 지도](./offline/index.md)                              | [원문](https://docs.mapbox.com/ios/maps/guides/offline/)                                   |
| 26   | ↳ Concepts and Constraints        | [개념과 제약](./offline/concepts.md)                             | [원문](https://docs.mapbox.com/ios/maps/guides/offline/concepts/)                          |
| 27   | ↳ Manage Offline Data             | [오프라인 데이터 관리](./offline/manage-offline-data.md)         | [원문](https://docs.mapbox.com/ios/maps/guides/offline/manage-offline-data/)               |
| 28   | Cache Management                  | [캐시 관리](./cache-management.md)                               | [원문](https://docs.mapbox.com/ios/maps/guides/cache-management/)                          |
| 29   | Debugging and Profiling           | [디버깅과 성능 분석](./debugging-and-profiling/index.md)         | [원문](https://docs.mapbox.com/ios/maps/guides/debugging-and-profiling/)                   |
| 30   | ↳ MapRecorder                     | [지도 기록과 재생](./debugging-and-profiling/map-recorder.md)    | [원문](https://docs.mapbox.com/ios/maps/guides/debugging-and-profiling/map-recorder/)      |
| 31   | ↳ Map Debug Options               | [지도 디버그 옵션](./debugging-and-profiling/debug-options.md)   | [원문](https://docs.mapbox.com/ios/maps/guides/debugging-and-profiling/debug-options/)     |
| 32   | ↳ Tracing                         | [트레이싱](./debugging-and-profiling/tracing.md)                 | [원문](https://docs.mapbox.com/ios/maps/guides/debugging-and-profiling/tracing/)           |
| 33   | ↳ Performance Statistics          | [성능 통계](./debugging-and-profiling/performance-stats.md)      | [원문](https://docs.mapbox.com/ios/maps/guides/debugging-and-profiling/performance-stats/) |
| 34   | Work with visionOS                | [visionOS 통합](./work-with-visionos.md)                         | [원문](https://docs.mapbox.com/ios/maps/guides/work-with-visionos/)                        |
| 35   | Migrate to v11                    | [v11 마이그레이션](./migrate-to-v11.md)                          | [원문](https://docs.mapbox.com/ios/maps/guides/migrate-to-v11/)                            |
| 36   | Pricing                           | [요금 산정](./pricing.md)                                        | [원문](https://docs.mapbox.com/ios/maps/guides/pricing/)                                   |
| 37   | Previous versions                 | [이전 버전](./old-versions/index.md)                             | [원문](https://docs.mapbox.com/ios/maps/guides/old-versions/)                              |
| 38   | ↳ Migrate to v10                  | [v10 마이그레이션](./old-versions/migrate-to-v10.md)             | [원문](https://docs.mapbox.com/ios/maps/guides/old-versions/migrate-to-v10/)               |

대응 관계는 `guide-manifest.json`에도 기록했어요. `npm run docs:check-mapbox-guides`는 로컬 대응과 목차를, 뒤에 `-- --online`을 붙이면 공식 문서 색인과의 누락·추가도 검사해요. 온라인 검사는 변경 감지용이며 원문과 번역 문장의 동등성을 검사하는 것은 아니에요.

## 목적에 따라 읽는 순서가 달라요

- 첫 지도: 설치 → 사용자 위치 → 데이터 추가 → SwiftUI
- 데이터 시각화: 지도 스타일 → 소스와 레이어 → 표현식 → 상호작용
- 제품 운영: 오프라인 → 캐시 → 성능 분석 → 요금
- 기존 앱 전환: 이전 버전 → v10 전환 → v11 전환

각 경로는 학습 제안이에요. 원문의 목차 순서를 바꾸지 않고도 지금 해결할 문제에 맞춰 읽을 수 있어요.

## 기존 실전 예제도 유지해요

이전의 묶음 문서는 기존 링크를 위해 남겨 두었어요. 공식 목차 대응은 위 38페이지를 기준으로 하고, 아래 문서는 여러 개념을 이어 읽는 보충 자료로 사용해요.

- [설치와 토큰 상세 예제](./installation-and-access-token.md)
- [SwiftUI 지도와 카메라 통합 예제](./swiftui-map-and-camera.md)
- [스타일·소스·레이어 통합 예제](./styles-sources-and-layers.md)
- [어노테이션과 클러스터링 예제](./annotations-and-clustering.md)
- [오프라인 다운로드 통합 예제](./offline-maps.md)

## 학습을 마친 뒤 확인해요

- [ ] 선택한 SDK 버전과 각 기능의 안정화 상태를 구분했나요?
- [ ] 화면, 데이터, 카메라, 업무 로직의 책임이 나뉘어 있나요?
- [ ] 토큰·권한·attribution·비용을 함께 점검했나요?
- [ ] 네트워크 단절과 화면 재진입에서도 동작을 확인했나요?

## 면접에서 이어질 수 있는 질문

### 공식 목차와 예제 모음은 어떻게 다른가요

목차는 개념을 빠짐없이 찾는 색인이에요. 예제 모음은 여러 개념이 실제 화면에서 어떻게 연결되는지 보여 줘요.

### Style과 앱의 데이터 모델은 같은가요

아니에요. 앱 모델은 업무 의미를, Style은 지도 표현을 맡아요. 모델을 지도 Feature로 바꾸는 경계를 두면 바꾸기 쉬워요.

### 오래된 예제는 모두 틀렸나요

아니에요. 그 버전에서는 맞을 수 있어요. 지금 선택한 SDK와 같은 세대인지부터 확인해야 해요.

## 참고 자료

- [Mapbox Maps SDK for iOS](https://docs.mapbox.com/ios/maps/guides/)
- [공식 전체 문서 색인](https://docs.mapbox.com/ios/maps/llms.txt)
- [11.29.1 SDK 소스](https://github.com/mapbox/mapbox-maps-ios/tree/11.29.1)
