---
title: Mapbox v6에서 v10으로 바뀐 구조
description: Mapbox v6의 MGL API가 v10의 MapView·컴포넌트·타입 기반 스타일로 바뀐 구조를 살펴보고 위치, 이벤트와 오프라인 데이터 전환의 검증 기준을 정리해요.
source: https://docs.mapbox.com/ios/maps/guides/old-versions/migrate-to-v10/
reviewed: '2026-09-19'
---

# Mapbox v6에서 v10으로 바뀐 구조

> **면접 답변 한 줄 요약:** v10은 하나의 MGL 지도·delegate에 모이던 역할을 지도, 카메라, 스타일, 위치와 어노테이션 컴포넌트로 나눈 전환점이에요.

공식 [Migrate to v10](https://docs.mapbox.com/ios/maps/guides/old-versions/migrate-to-v10/)에 대응하는 **과거 버전 해설**이에요. 새 앱의 설치 안내는 [현재 설치 문서](../install.md)를 사용해요.

:::warning 원문 안에서도 시점이 섞여 있어요
v10 초기 요구 사항과 기능 제약을 현재 버전으로 일반화하지 않아요. 예를 들어 원문에는 뷰 어노테이션 미지원 설명과 v10.2 이후 지원 안내가 함께 있어요. 실제 목표 릴리스의 API를 확인하세요.
:::

## 먼저 알아둘 용어

| 용어       | 쉬운 뜻                                                      |
| ---------- | ------------------------------------------------------------ |
| Delegate   | 이벤트 처리를 대신 맡는 객체를 지정하는 방식이에요.          |
| 컴포넌트   | 카메라나 위치처럼 한 책임을 묶은 구성 요소예요.              |
| 표현식 DSL | 데이터·줌에 따른 표현 규칙을 작은 언어처럼 작성하는 API예요. |
| Metal      | Apple 플랫폼의 GPU 그래픽 API예요.                           |

## 이름 치환이 아니라 책임 이동을 확인해요

| v6에서 찾을 부분     | v10에서 확인할 경계                     |
| -------------------- | --------------------------------------- |
| `MGLMapView`         | `MapView`와 지도 동작의 `MapboxMap`     |
| `MGLMapViewDelegate` | 이벤트 콜백과 각 컴포넌트 처리          |
| `MGLMapCamera`       | `CameraOptions`, 카메라 애니메이션·경계 |
| `MGLShapeSource`     | GeoJSON Source와 Turf 기하 타입         |
| `NSExpression`       | `Exp` 기반 표현식                       |
| `MGLAnnotation`      | 타입별 AnnotationManager                |
| OpenGL 렌더링        | Metal 렌더링                            |
| 이전 오프라인 캐시   | 저장 위치와 마이그레이션 절차           |

v10에서는 토큰·리소스 설정에 `ResourceOptionsManager`가 등장하지만, **v11에서는 다시 제거된 API**예요. 마지막 목표가 v11이면 [다음 전환 문서](../migrate-to-v11.md)까지 이어서 확인해요.

## 새 MapView의 구조를 단계별로 옮겨요

v10은 `MapView` 생성, 지도 동작을 가진 `MapboxMap`, camera·location·gestures·annotations 같은 컴포넌트를 분리했어요. v6 delegate 한곳의 코드를 그대로 새 delegate로 옮기기보다 각 책임의 소유자를 정해요.

| 공식 전환 항목               | v10에서 확인할 경계                                           |
| ---------------------------- | ------------------------------------------------------------- |
| ResourceOptions·Access Token | MapView 생성 전 token·cache·tile store 옵션 구성              |
| 지도 표시                    | `MapInitOptions`로 생성 옵션과 frame을 전달                   |
| Style loading                | URI·JSON 로드와 완료·오류 이벤트의 비동기 순서                |
| 지도 lifecycle               | style/map load·idle·render 이벤트를 이름 있는 구독으로 처리   |
| MapOptions                   | context mode, constrain mode, viewport mode, orientation 등   |
| Modular architecture         | 필요한 컴포넌트만 접근하고 교체 가능한 HTTP stack 범위를 분리 |

v10 예제의 ResourceOptions와 HTTP 교체 API는 현재 v11에서 다시 바뀌었어요. 오래된 앱을 바로 최신으로 옮길 때 v10 코드를 최종 형태로 복사하지 말고, v6 개념이 어느 책임으로 이동했는지 이해하는 중간 지도처럼 사용해요.

## 카메라 API를 네 가지 작업으로 나눠요

- 현재 camera state를 읽거나 `CameraOptions`로 즉시 설정해요.
- center·zoom·bearing·pitch·padding을 필요한 값만 바꿔요.
- 좌표·Geometry가 화면에 들어오도록 camera를 계산해요.
- min/max zoom·bounds와 기본 camera behavior를 별도 설정해요.

v6의 `setCenterCoordinate`, `setVisibleCoordinateBounds`, `MGLMapCamera` 호출을 단순 일대일 치환하지 말고 padding·애니메이션·경계 제한 의도를 분류해요. 도형 맞춤과 사용자의 이후 이동 제한은 서로 다른 기능이에요.

## 스타일과 표현식을 타입 안전 API로 옮겨요

v10은 Style Specification을 따르는 GeoJSON Source, Background·Fill·Line·Symbol 등 Layer 타입을 Swift 구조체로 제공하고 `NSExpression` 대신 `Exp` DSL을 사용해요. Style load 완료 뒤 Source를 먼저 추가하고 이를 참조하는 Layer를 추가해요.

| v6 작업                | v10에서의 검토                                |
| ---------------------- | --------------------------------------------- |
| `MGLShapeSource`       | GeoJSON Source와 Turf Feature·Geometry        |
| `MGLStyleLayer` 하위형 | 타입 안전한 Layer 구조체와 paint·layout 속성  |
| `NSExpression`         | `Exp`로 get·match·interpolate 등을 조합       |
| style localization     | 언어 설정 API와 앱 locale·대체 언어 정책      |
| runtime style 수정     | style load 이후 add·update·remove 순서와 오류 |

## 과거 코드의 검색 목록을 만들어요

다음은 실행 코드가 아니라 저장소에서 책임을 찾기 위한 문자열 목록이에요.

```text
MGLMapView / MGLMapViewDelegate → 지도 생성과 이벤트 처리
MGLAccountManager / MGLMapboxAccessToken → 토큰 초기화
MGLMapCamera → 카메라 이동과 화면 맞춤
MGLShapeSource / NSExpression → 데이터와 표현 규칙
MGLAnnotationView → 뷰 기반 어노테이션 요구
cache.db → 기존 저장 데이터가 있는지 조사
```

찾은 결과를 UI·업무 로직·저장소로 분류해 보세요. 예를 들어 delegate에서 선택된 장소를 예약 모델로 전달했다면 그 예약 로직은 유지하고 입력 연결만 교체할 수 있어요. SDK 모델이 앱 전체로 퍼져 있다면 변환 경계를 먼저 만드는 편이 전환을 나눠 검증하기 쉬워요.

## 위치와 스타일의 시간 순서를 다시 시험해요

스타일을 만들자마자 Source를 추가하는 방식과 스타일 로드를 확인한 뒤 추가하는 방식은 달라요. 초기 표시뿐 아니라 스타일 교체도 테스트해야 해요.

위치 표시는 권한, 정확도와 사용자 추적 요구를 나눠 확인하세요. 원문의 v10 기본 위치 공급자 동작을 현재 v11의 모든 공급자가 수행한다고 가정하지 않아요.

## Annotation과 위치 책임을 분리해요

Point·Line·Polygon Annotation은 타입별 Manager가 목록과 선택 이벤트를 관리해요. v6 Annotation View를 그대로 기대하지 말고 이미지 기반 Annotation인지 실제 UIKit 뷰가 필요한지 구분해요. Manager 생성, 배열 교체, 선택과 제거의 수명을 화면에 연결해요.

사용자 위치는 다음 단계를 따로 이전해요.

1. Info.plist와 CLLocation 권한 요청·거부 처리를 유지해요.
2. Puck 표시와 카메라 추적을 구분해요.
3. custom location provider의 시작·중지와 정확도 값을 새 protocol에 연결해요.
4. reduced accuracy·임시 정밀 위치 등 privacy 변경을 처리해요.

SDK가 위치 privacy 변경을 맡기는 방식과 앱 delegate가 직접 처리하는 방식 중 하나를 선택하고, 두 경로가 중복으로 권한 UI를 갱신하지 않게 해요.

## 캐시 파일을 무조건 옮기지 않아요

원문은 v6와 v10의 오프라인 데이터베이스 위치가 다르며 앱 차원의 이전이 필요하다고 설명해요. 하지만 문서의 예시 번들 ID와 경로를 실제 앱에 그대로 적용하면 안 돼요.

전환 설계에서는 다음을 먼저 검증하세요.

1. 실제 이전 버전, 저장 위치와 데이터 존재 여부를 확인해요.
2. 새 SDK가 파일을 열기 전에 실행할 단계인지 확인해요.
3. 백업과 실패 후 복구 방법을 정해요.
4. 이미 이전한 경우 다시 실행해도 안전한지 시험해요.
5. 저장 공간 부족과 중간 종료를 시험해요.

이 절차는 데이터 보호를 위한 설계 제안이에요. 이번 문서는 실제 앱의 캐시 파일을 이동하거나 삭제하지 않아요.

## v10의 새 기능을 호환성 복구와 분리해요

공식 가이드는 플랫폼 기반 카메라 animator, 여러 애니메이터 연결과 `AnimationOwner`, 3D Terrain·Sky Layer, custom rendered layer, 새 OfflineManager를 소개해요. 이 기능들은 v6 코드가 빌드되게 만드는 필수 치환과 분리해 도입해요.

특히 애니메이터는 같은 camera 속성을 동시에 제어할 때 취소 규칙이 있고, Terrain은 Layer 순서·camera pitch·성능을 바꿀 수 있어요. 새 OfflineManager는 기존 캐시 파일 보존·이전 검증을 끝낸 뒤 사용하고, 새 설치 성공으로 업데이트 설치의 데이터 보존을 대신 판단하지 않아요.

## 제거·비권장 API를 마지막에 다시 검색해요

공식 문서의 Deprecations and removals에는 MGL 타입 삭제뿐 아니라 기본 동작·지원 기능 변화가 포함돼요. `MGL` 접두어, delegate 메서드, `NSExpression`, `MGLAccountManager`, 이전 offline pack과 OpenGL 관련 코드를 전체 검색하고 “호출이 없어짐”과 “제품 기능이 대체됨”을 각각 확인해요.

## 회귀 체크리스트

- [ ] 지도 표시·선택·제스처·카메라 경계를 비교했나요?
- [ ] 같은 ID의 어노테이션과 Source가 의도대로 갱신되나요?
- [ ] 권한 거부·대략적 위치·재시작을 시험했나요?
- [ ] 이전 앱의 오프라인 지도를 보존하는지 검증했나요?
- [ ] 목표 v10 릴리스와 현재 v11 API를 구분했나요?
- [ ] style load와 map lifecycle 이벤트의 구독을 해제하나요?
- [ ] camera fit·animation·bounds를 서로 다른 회귀 항목으로 확인했나요?
- [ ] Point·Line·Polygon Annotation 선택이 모두 유지되나요?
- [ ] Terrain·Sky·custom layer를 도입했다면 구형 기기 성능을 비교했나요?

## 면접에서 이어질 수 있는 질문

### MGL 접두어만 지우면 전환되나요

아니에요. 역할을 맡는 객체, 이벤트와 데이터 표현 방식도 바뀌어요.

### AnnotationManager는 단순 배열인가요

표시할 데이터뿐 아니라 어노테이션 묶음의 관리 경계예요. 생성·교체·제거 시점을 함께 봐야 해요.

### 새 설치에서 성공하면 캐시 이전도 검증됐나요

아니에요. 이전 앱의 데이터를 가진 업데이트 설치가 별도 시험 대상이에요.

## 참고 자료

- [Migrate to v10](https://docs.mapbox.com/ios/maps/guides/old-versions/migrate-to-v10/)
- [Migrate to v11](https://docs.mapbox.com/ios/maps/guides/migrate-to-v11/)
