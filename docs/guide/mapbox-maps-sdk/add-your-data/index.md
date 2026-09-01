---
title: Swift로 이해하는 지도에 데이터 추가하기
description: Mapbox의 Markers, Annotation, View Annotation, Style Layer를 비교하고 매장 지도 예제로 표시 규모와 상호작용에 맞는 데이터 표현 방식을 선택해요.
source: https://docs.mapbox.com/ios/maps/guides/add-your-data/
reviewed: '2026-08-31'
---

# Swift로 이해하는 지도에 데이터 추가하기

> **면접 답변 한 줄 요약:** 지도 데이터 표현은 좌표에 간단한 표시를 붙일지, 화면 구성 요소를 올릴지, 지도 자체의 그리기 규칙에 데이터를 연결할지 선택하는 작업이에요.

공식 [Add your data to the map](https://docs.mapbox.com/ios/maps/guides/add-your-data/)에 대응하는 학습 문서예요. 매장 검색 화면을 만든다고 생각하며 네 가지 선택지를 비교해요.

## 먼저 알아둘 용어

| 용어          | 쉬운 뜻                                                      |
| ------------- | ------------------------------------------------------------ |
| 좌표          | 지구 위 위치를 위도와 경도로 표현한 값이에요.                |
| Feature       | 좌표 모양과 매장명 같은 속성을 묶은 지리 데이터 한 건이에요. |
| Source        | 지도에 전달할 지리 데이터의 공급원이에요.                    |
| Layer         | 그 데이터를 어떤 모양으로 그릴지 정하는 규칙이에요.          |
| SwiftUI·UIKit | Apple 플랫폼에서 화면을 만드는 프레임워크예요.               |

## 무엇을 그릴지 먼저 정해요

[공식 개요](https://docs.mapbox.com/ios/maps/guides/add-your-data/)는 표시 방식 선택에 데이터 양, 표현 복잡도, 상호작용을 함께 고려하도록 안내해요.

| 화면 요구                  | 첫 검토 대상         | 다음 문서                                        |
| -------------------------- | -------------------- | ------------------------------------------------ |
| 이미지 없이 간단한 핀      | SwiftUI Markers      | [기본 마커](./markers.md)                        |
| 개별 핀·원·선·면           | Annotation API       | [어노테이션](./annotations.md)                   |
| 버튼이 있는 매장 카드      | View Annotation      | [뷰 어노테이션](./view-annotations.md)           |
| 많은 지점과 공통 표현 규칙 | Source와 Style Layer | [스타일 레이어로 데이터 추가](./style-layers.md) |

`Markers`는 현재 실험적 기능이에요. 안정화 여부와 설치한 SDK 버전을 확인한 뒤 선택해요.

## 화면 위 표시와 지도 내부 표현을 구분해요

“지도 위에 보인다”는 말만으로 렌더링 방식을 판단하면 안 돼요. 실제 `UIView`나 SwiftUI `View`를 올리는 View Annotation과, SDK가 Source·Layer를 관리하는 일반 Annotation은 달라요. 일반 Annotation도 내부 Layer를 사용한다는 점은 [PointAnnotationManager 구현](https://github.com/mapbox/mapbox-maps-ios/blob/11.29.1/Sources/MapboxMaps/Annotations/Generated/PointAnnotationManager.swift)에서 확인할 수 있어요.

따라서 모든 핀을 독립적인 `UIView`라고 설명하거나, Annotation이면 무조건 느리다고 결론 내리지 않아요.

## 매장 지도를 단계적으로 설계해요

다음은 공식 예제가 아닌 설계 연습이에요.

1. 즐겨찾기 매장 세 곳만 있다면 간단한 표시부터 시작해요.
2. 선택된 매장의 영업시간과 예약 버튼은 별도 카드로 보여줘요.
3. 전국 매장을 동시에 다뤄야 한다면 표시 데이터와 카드 데이터를 분리해요.
4. 선택을 해제하면 카드만 사라지게 하고, 매장 목록은 그대로 유지해요.

이렇게 분리하면 “매장 수 증가”와 “카드 디자인 변경”을 서로 다른 문제로 다룰 수 있어요. 하나의 지도에서 여러 표현 방식을 섞어도 괜찮아요.

## 숫자 하나로 성능을 단정하지 않아요

많은 데이터에는 Style Layer와 타일 기반 데이터가 유리한 선택지가 될 수 있어요. 하지만 기기, 좌표 밀도, 업데이트 빈도, 이미지와 카드 복잡도에 따라 비용이 달라져요. 개수만으로 적용 가능한 최대치를 정하지 않아요.

설계할 때는 전체 데이터 수와 **현재 화면에서 실제로 보이는 수**를 따로 기록하는 방법을 권해요. 검색 결과 갱신 중 스크롤·줌이 끊기는지도 함께 확인해요.

## 적용 체크리스트

- [ ] 간단한 표시와 상세 카드의 역할을 나눴나요?
- [ ] 화면에서 동시에 보이는 데이터 수를 측정했나요?
- [ ] 선택 상태를 지도 표시 객체가 아닌 앱 모델에서도 식별할 수 있나요?
- [ ] 실험적 API 사용 여부와 대체 방식을 정했나요?
- [ ] 지도를 닫거나 검색 조건을 바꿀 때 표시가 정리되나요?

## 면접에서 이어질 수 있는 질문

### 모든 매장을 View Annotation으로 만들면 되나요?

가능 여부보다 비용과 요구 사항을 먼저 봐요. 모든 매장에 버튼이 필요한지, 선택한 매장 하나에만 카드가 필요한지 분리해 보면 더 단순한 구성이 나와요.

### Annotation과 Style Layer는 완전히 다른 렌더러인가요?

그렇게 이분법으로 설명하지 않아요. 일반 Annotation API는 내부 Source·Layer 관리를 감싸는 상위 API이고, View Annotation은 실제 화면 뷰를 다룬다는 차이가 중요해요.

### 언제 구현 방식을 바꾸나요?

요구 사항이나 측정 결과가 현재 방식의 한계를 보여줄 때예요. 예상 숫자만으로 모든 화면을 복잡한 구조로 시작할 필요는 없어요.

## 참고 자료

- [Mapbox — Add your data to the map](https://docs.mapbox.com/ios/maps/guides/add-your-data/)
- [Mapbox Maps SDK 11.29.1 — PointAnnotationManager](https://github.com/mapbox/mapbox-maps-ios/blob/11.29.1/Sources/MapboxMaps/Annotations/Generated/PointAnnotationManager.swift)
