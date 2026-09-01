---
title: Swift로 이해하는 Expression 기반 스타일링
description: Mapbox Expression으로 매장 상태별 색상과 줌별 원 크기를 계산하는 예제를 만들고 값의 타입, 기본값, 조명 영향과 렌더링 규칙의 검증 방법을 정리해요.
source: https://docs.mapbox.com/ios/maps/guides/styles/style-layers/
reviewed: '2026-08-31'
---

# Swift로 이해하는 Expression 기반 스타일링

> **면접 답변 한 줄 요약:** Expression은 Feature 속성과 줌 같은 입력으로 색·크기·필터 값을 계산하는 지도 규칙이며, Swift에서 계산한 값 하나를 모든 Feature에 적용하는 것과 달라요.

공식 [Styling layers with expressions](https://docs.mapbox.com/ios/maps/guides/styles/style-layers/)에 대응해요. 매장 상태별 색과 줌별 크기를 한 Layer로 표현해요.

## 먼저 알아둘 용어

| 용어                | 쉬운 뜻                                        |
| ------------------- | ---------------------------------------------- |
| Expression          | 입력을 받아 지도 속성값을 계산하는 규칙이에요. |
| Operator            | 읽기·비교·보간 같은 계산 종류예요.             |
| Property expression | 개별 Feature의 데이터 속성을 읽는 식이에요.    |
| Camera expression   | 줌 수준을 읽어 표현을 바꾸는 식이에요.         |
| Interpolation       | 두 기준값 사이의 중간값을 계산하는 보간이에요. |

## 고정값만으로는 매장별 차이를 표현하기 어려워요

모든 원에 같은 색을 주면 예약 가능 매장과 혼잡한 매장을 구별할 수 없어요. 상태마다 Source를 복제하기 전에, 동일한 데이터 안의 속성으로 색을 계산할 수 있는지 살펴봐요.

[공식 가이드](https://docs.mapbox.com/ios/maps/guides/styles/style-layers/)는 `Exp(.get)`으로 속성을 읽고 `match`로 값을 분기하며, `interpolate`와 `zoom`으로 크기를 변화시키는 방법을 설명해요.

## 상태와 줌에 두 규칙을 적용해요

다음 작성 예제는 점 Feature마다 문자열 `pickupStatus`가 있다고 가정해요. Source를 만드는 단계에서 데이터 형식을 검증해야 해요.

```swift
import MapboxMaps
import SwiftUI
import Turf
import UIKit

struct StoreExpressionMap: View {
    let stores: FeatureCollection

    var body: some View {
        Map {
            GeoJSONSource(id: "stores")
                .data(.featureCollection(stores))

            CircleLayer(id: "store-status", source: "stores")
                .circleColor(Exp(.match) {
                    Exp(.get) { "pickupStatus" }
                    "open"
                    UIColor.systemTeal
                    "busy"
                    UIColor.systemOrange
                    UIColor.systemGray
                })
                .circleRadius(Exp(.interpolate) {
                    Exp(.linear)
                    Exp(.zoom)
                    10
                    3
                    16
                    9
                })
                .circleEmissiveStrength(1)
        }
    }
}
```

색상은 각 매장의 상태를 읽고, 크기는 같은 줌 입력을 사용해요. `Exp` 내부는 임의의 Swift 클로저를 매장마다 실행하는 자리가 아니라 지도 Expression을 구성하는 문법이에요.

## 출력부터 예상하고 확인해요

다음 표는 위 작성 예제의 기대 결과예요.

| 입력                      | 기대 결과        |
| ------------------------- | ---------------- |
| `pickupStatus = "open"`   | 청록색           |
| `pickupStatus = "busy"`   | 주황색           |
| 그 밖의 정상 문자열       | 회색             |
| 줌 10 이하 / 13 / 16 이상 | 반지름 3 / 6 / 9 |

입력 누락과 숫자·문자열 혼용은 별도 오류 사례로 넣어요. 마지막 색을 작성했다고 모든 형식 오류가 안전하게 처리된다고 가정하지 않아요.

## Swift 타입 검사와 데이터 검증은 달라요

Swift 코드가 작성 가능해도 서버가 보낸 Feature 속성의 실제 타입은 실행 중에 확인돼요. Expression의 입력·출력 타입이 맞지 않으면 해당 속성의 기본값으로 돌아갈 수 있어요. `filter`는 참·거짓 결과가 필요하고 색 속성은 색 결과가 필요해요. [Expression 타입 규칙](https://docs.mapbox.com/style-spec/reference/expressions/#type-system)

설계 제안으로 서버 응답을 지도 데이터로 변환하는 경계에서 `pickupStatus`를 정규화해요. `"OPEN"`, `"open"`, 누락을 어떤 업무 상태로 볼지 앱에서 먼저 정하면 지도 표현도 예측하기 쉬워져요.

## 조명과 줌 평가도 확인해요

Standard의 야간 조명은 사용자 Layer에도 영향을 줘요. 예제의 `circleEmissiveStrength`는 원이 조명에 반응하는 정도를 조정하기 위한 선택이에요. 밝게 만드는 것과 접근성 대비를 만족하는 것은 별도 검증 사항이에요. [조명 기반 스타일링](https://docs.mapbox.com/ios/maps/guides/styles/style-layers/#light-driven-styling-in-standard-and-standard-satellite)

줌 식은 Style Specification의 배치 제약이 있고, paint와 layout 속성은 줌 변경 평가 시점도 달라요. 복잡한 식을 만들기 전에 해당 속성의 지원 범위를 확인해요. [Camera expressions](https://docs.mapbox.com/style-spec/reference/expressions/#camera-expressions)

## 적용 체크리스트

- [ ] 데이터 속성 이름과 타입을 정의했나요?
- [ ] 알 수 없는 정상 값과 잘못된 형식의 값을 구분했나요?
- [ ] 줌 경계값과 중간값을 확인했나요?
- [ ] 색만으로 상태를 구별하도록 만들지 않았나요?
- [ ] 야간 조명과 밀집 지역을 확인했나요?

## 면접에서 이어질 수 있는 질문

### Expression은 일반 Swift 함수인가요?

아니요. SDK의 표현식 트리를 구성해 지도 렌더링 규칙으로 전달해요. 네트워크 요청이나 앱의 업무 처리를 넣는 곳이 아니에요.

### `match`와 보간은 언제 구분하나요?

매장 상태처럼 범주를 나눌 때는 분기를 사용해요. 줌에 따라 크기를 부드럽게 바꿀 때는 보간이 맞아요.

### 기본 색이 있으면 데이터 검증을 생략해도 되나요?

아니요. 정상 범주에 없는 값과 입력 타입 오류는 다를 수 있어요. 데이터 경계에서 검증하고 지도에서도 오류 표시를 관찰해요.

## 참고 자료

- [Mapbox — Styling layers with expressions](https://docs.mapbox.com/ios/maps/guides/styles/style-layers/)
- [Mapbox Style Specification — Expressions](https://docs.mapbox.com/style-spec/reference/expressions/)
