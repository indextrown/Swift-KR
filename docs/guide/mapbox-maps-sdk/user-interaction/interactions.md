---
title: Swift로 이해하는 Mapbox Interactions API
description: Mapbox Interactions API로 레이어·Standard featureset·지도 전체의 탭을 처리하고 선택 상태, 이벤트 전파, UIKit 등록 토큰의 수명과 취소를 구분해요.
source: https://docs.mapbox.com/ios/maps/guides/user-interaction/Interactions/
reviewed: '2026-08-31'
---

# Swift로 이해하는 Mapbox Interactions API

> **면접 답변 한 줄 요약:** Interactions API는 지도 레이어나 지리 객체 집합, 지도 자체를 대상으로 탭과 길게 누르기를 등록하고 처리 결과에 따라 다음 대상으로 입력을 전달해요.

공식 [Interactions API](https://docs.mapbox.com/ios/maps/guides/user-interaction/Interactions/)에 대응해요. 원문의 URL은 `Interactions`의 첫 글자가 대문자예요. 아래에서는 장소 이름 선택과 해제를 새 학습 예제로 만들어요.

## 먼저 알아둘 용어

| 용어          | 쉬운 뜻                                                            |
| ------------- | ------------------------------------------------------------------ |
| Layer         | 지도 데이터를 그리는 규칙을 가진 표시 층이에요.                    |
| Featureset    | 스타일이 외부에서 다룰 수 있도록 공개한 지리 객체 집합이에요.      |
| POI           | Point of Interest의 약자로 매장·시설 같은 관심 장소예요.           |
| Feature state | 원래 지도 데이터와 별개로 선택·강조 같은 상태를 붙이는 기능이에요. |
| Cancelable    | 등록한 동작을 취소할 수 있는 토큰의 인터페이스예요.                |

API는 v11.13.0부터 안정 API이며, `TapInteraction`과 `LongPressInteraction`을 제공해요. SwiftUI에서는 Map 내부에 선언하고 UIKit에서는 `mapboxMap.addInteraction`으로 등록해요. Standard의 POI·장소 라벨·건물 featureset은 각각 맞는 타입의 결과를 제공해요. [공식 가이드](https://docs.mapbox.com/ios/maps/guides/user-interaction/Interactions/)

## 장소 선택과 빈 지도 선택을 나눠요

모든 탭을 “선택 해제”로 처리하면 장소를 누른 직후 상세 카드가 닫힐 수 있어요. 이 학습 화면은 장소가 입력을 처리하면 종료하고, 처리할 장소가 없을 때만 선택을 지워요.

```swift
import MapboxMaps
import SwiftUI

struct PlaceSelectionMap: View {
    @State private var selectedName: String?

    var body: some View {
        VStack {
            Map {
                TapInteraction(.standardPoi) { poi, _ in
                    selectedName = poi.name ?? "이름 없는 장소"
                    return true
                }
                TapInteraction { _ in
                    selectedName = nil
                    return true
                }
            }
            .mapStyle(.standard)
            Text(selectedName ?? "지도에서 장소를 선택해 보세요.")
        }
    }
}
```

이름은 표시용이에요. 같은 이름의 매장이 여러 개 있을 수 있으므로 이름을 서버의 매장 ID처럼 사용하지 않아요. 실제 서비스 연결이 필요하면 지도 객체와 앱의 식별자를 어떻게 대응시킬지 별도 정책을 정해요.

## 이벤트를 처리하면 true를 반환해요

겹친 객체는 화면의 렌더링 순서에 따라 위쪽부터 처리돼요. 같은 대상에 여러 핸들러를 등록하면 나중에 등록한 것이 먼저 호출돼요. `true`는 전파 종료, `false`는 계속 전달을 의미해요. [공식 가이드](https://docs.mapbox.com/ios/maps/guides/user-interaction/Interactions/)

학습 화면에서 장소 핸들러가 `false`를 반환하면 아래 지도 핸들러도 실행되어 선택을 지울 수 있어요. 따라서 반환값은 “네트워크 요청이 성공했는가?”가 아니라 “이번 사용자 입력을 이 대상에서 처리했는가?”를 기준으로 정해요.

## UIKit에서는 짧은 등록 수명을 직접 종료해요

아래 보조 객체는 화면 소유자가 보관해요. `start`를 다시 부르면 이전 등록을 취소하고, 화면이 사라질 때 `stop()`을 호출해야 해요.

```swift
import MapboxMaps
import UIKit

@MainActor
final class PoiSelectionRegistration {
    private var token: (any Cancelable)?

    /// 장소 선택을 화면의 콜백에 연결해요.
    /// - Parameters:
    ///   - mapView: 장소 선택을 받을 지도예요.
    ///   - onSelection: 표시용 장소 이름을 받는 콜백이에요. 이름이 없으면 nil이에요.
    func start(
        on mapView: MapView,
        onSelection: @escaping (String?) -> Void
    ) {
        stop()
        token = mapView.mapboxMap.addInteraction(
            TapInteraction(.standardPoi) { poi, _ in
                onSelection(poi.name)
                return true
            }
        )
    }

    func stop() {
        token?.cancel()
        token = nil
    }
}
```

등록을 지도 전체 수명 동안 유지하려면 토큰을 생략할 수 있어요. 반면 이 예제처럼 일부분만 활성화하는 기능은 명시적으로 취소해요. 콜백이 화면을 캡처한다면 약한 참조 등으로 화면 → 지도 → 콜백 → 화면 관계를 피해야 해요. [공식 등록 안내](https://docs.mapbox.com/ios/maps/guides/user-interaction/Interactions/)

## 레이어와 featureset을 선택하는 기준

직접 소유하는 커스텀 레이어라면 `.layer("레이어-ID")`를 사용할 수 있어요. Standard의 내부 레이어 이름을 추측하기보다 공개 featureset을 사용해요. 대상이 현재 스타일에 없으면 사용자가 눌러도 기대한 핸들러가 실행되지 않으므로 스타일 교체 시 검증해야 해요.

건물 선택 강조처럼 지도 객체의 표현을 바꾸는 기능은 해당 타입의 feature state를 사용해요. 다만 앱의 영속적인 즐겨찾기와 렌더링용 강조 상태는 같지 않아요. 즐겨찾기를 저장하려면 앱 데이터 모델을 따로 두고 화면 진입 시 표현을 복원하는 기준이 필요해요.

## 적용 순서를 정리해요

1. 현재 스타일이 공개한 선택 대상을 확인해요.
2. 장소·건물·지도 빈 곳의 동작을 나눠요.
3. 각 핸들러의 true·false 정책을 정해요.
4. 표시용 이름과 앱 식별자를 구분해요.
5. 빠른 연속 선택·스타일 변경·화면 종료를 테스트해요.

## 면접에서 이어질 수 있는 질문

### Standard 내부 레이어 이름을 사용하면 안 되나요?

앱이 의존하는 공개 경계를 먼저 확인해야 해요. 공개 featureset을 사용하면 스타일 내부 구성을 직접 추측하는 의존을 줄일 수 있어요.

### 토큰을 보관하지 않으면 등록이 즉시 없어지나요?

Interactions 등록은 지도 수명 동안 유지할 수 있어요. 더 짧은 수명이 필요할 때 취소 토큰을 관리하는 방식이에요.

### feature state에 앱 즐겨찾기를 저장해도 되나요?

지도 표현 상태와 앱 데이터 저장소는 책임이 달라요. 앱이 보존할 정보는 별도 모델로 관리하고 렌더링 상태로 반영해요.

## 참고 자료

- [Mapbox Interactions API](https://docs.mapbox.com/ios/maps/guides/user-interaction/Interactions/)
- [Mapbox Interaction 구현 · 11.29.1](https://github.com/mapbox/mapbox-maps-ios/blob/11.29.1/Sources/MapboxMaps/Interactions/Interactions.swift)
