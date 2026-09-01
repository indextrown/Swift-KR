---
title: Mapbox 오프라인 데이터 다운로드·갱신·삭제
description: OfflineManager와 TileStore의 다운로드 API를 연결하고 완료·취소·목록·갱신·삭제를 구분해 오프라인 지도 관리 화면을 설계합니다.
source: https://docs.mapbox.com/ios/maps/guides/offline/manage-offline-data/
reviewed: '2026-08-31'
---

# Mapbox 오프라인 데이터 다운로드·갱신·삭제

> **면접 답변 한 줄 요약:** 오프라인 데이터 관리는 Style Pack과 Tile Region을 각각 내려받고 결과를 합치는 작업이며, 진행률이 아닌 완료 결과를 기준으로 사용 가능 상태를 결정해야 해요.

“다운로드 100%”가 떴는데 재실행 후 지도가 비어 있다면 먼저 어느 작업의 100%인지 확인해요. 이 문서는 [개념과 제약](./concepts.md)을 알고 있다는 전제로 두 다운로드를 연결하는 방법을 설명해요.

## 먼저 알아둘 용어

| 용어                  | 쉬운 뜻                                                        |
| --------------------- | -------------------------------------------------------------- |
| Style URI             | 어떤 지도 스타일을 사용할지 지정하는 식별자예요.               |
| Region ID             | 앱에서 다운로드한 지역을 다시 찾는 식별자예요.                 |
| Cancelable            | 진행 중인 요청을 취소할 수 있게 반환되는 핸들이에요.           |
| progress / completion | 작업 중간 상황과 최종 성공·실패를 알리는 서로 다른 콜백이에요. |

## 두 API의 입력을 먼저 맞춰요

`OfflineManager.loadStylePack`은 Style Pack을, `TileStore.loadTileRegion`은 지역 데이터를 내려받아요. 둘 다 진행률·완료 콜백과 취소 핸들을 제공해요. UI 갱신은 콜백의 실행 스레드를 가정하지 말고 MainActor로 전달해야 해요. [공식 데이터 관리 가이드](https://docs.mapbox.com/ios/maps/guides/offline/manage-offline-data/)

아래는 서울 시청의 테스트용 **점 범위**를 만드는 예제예요. 토큰 설정은 [설치](../install.md)에서 완료했다고 가정해요. 점 하나가 서울 전체를 의미하지는 않아요.

```swift
import CoreLocation
import MapboxMaps
import Turf

/// 시청 좌표를 덮는 테스트용 지역 옵션을 만듭니다.
/// - Parameters:
///   - manager: 지도와 동일한 리소스 설정을 사용하는 오프라인 관리자입니다.
///   - center: 테스트할 점의 위도·경도입니다.
/// - Returns: 옵션을 만들 수 없으면 nil, 만들 수 있으면 지역 요청 옵션입니다.
@MainActor
func makeCityHallRegionOptions(
    manager: OfflineManager,
    center: CLLocationCoordinate2D
) -> TileRegionLoadOptions? {
    let descriptor = manager.createTilesetDescriptor(
        for: TilesetDescriptorOptions(
            styleURI: .outdoors,
            zoomRange: 11...14,
            tilesets: nil
        )
    )

    return TileRegionLoadOptions(
        geometry: .point(Point(center)),
        descriptors: [descriptor],
        metadata: ["name": "서울 시청 테스트"],
        acceptExpired: false
    )
}
```

이 옵션과 `.outdoors` Style Pack을 짝지어 요청해요. `11.29.1`의 초기화 시그니처에 맞춰 추가 tileset 목록은 `nil`로 전달했어요. 다운로드에 사용한 TileStore와 지도에서 읽는 TileStore의 설정도 일치해야 해요. 실제 앱에서는 사용자가 선택한 면이나 경로로 geometry를 바꿔야 해요. [TilesetDescriptorOptions 구현](https://github.com/mapbox/mapbox-maps-ios/blob/11.29.1/Sources/MapboxMaps/Offline/TilesetDescriptorOptions%2BMapboxMaps.swift)

## 요청을 보내는 순서와 상태를 분리해요

다음 표는 SDK 호출 순서와 앱의 책임을 함께 정리한 구현 계획이에요.

| 단계           | SDK 작업                                                 | 앱에서 보관할 것                                   |
| -------------- | -------------------------------------------------------- | -------------------------------------------------- |
| 표현 준비      | `loadStylePack(for:loadOptions:progress:completion:)`    | Style URI, 결과, 취소 핸들이에요.                  |
| 지역 준비      | `loadTileRegion(forId:loadOptions:progress:completion:)` | Region ID, 결과, 취소 핸들이에요.                  |
| 저장 목록 복원 | `allStylePacks`, `allTileRegions`                        | 다운로드 화면에 보여 줄 실제 항목이에요.           |
| 갱신           | 같은 URI·ID로 다시 load                                  | 갱신 중 기존 데이터를 보여 줄지에 대한 정책이에요. |
| 제거           | `removeStylePack`, `removeTileRegion`                    | 다른 지역과 공유하는 자원·삭제 결과예요.           |

초보 단계에서는 Style Pack 성공 후 Tile Region을 요청하면 실패 경로를 읽기 쉬워요. 나중에 병렬로 받아도 사용 가능 상태의 조건은 동일해야 해요.

아래는 SDK 콜백을 UI 모델에 전달한 **후** 적용할 수 있는 순수 Swift 상태예요.

```swift
struct OfflinePreparation: Equatable {
    var styleCompleted = false
    var regionCompleted = false
    var wasCanceled = false

    var isReady: Bool {
        styleCompleted && regionCompleted && !wasCanceled
    }
}

var preparation = OfflinePreparation()
preparation.regionCompleted = true
assert(!preparation.isReady)

preparation.styleCompleted = true
assert(preparation.isReady)
```

앱에서는 실패 이유와 요청 식별자도 추가하세요. 이전 다운로드 콜백이 재시도 상태를 덮어쓰지 않게, 현재 요청 ID가 맞을 때만 상태를 변경하는 정책이 필요해요.

## 갱신은 새 지역을 계속 추가하는 작업이 아니에요

같은 Style URI·Region ID로 다시 load하고 `acceptExpired: false`로 설정하면 누락되거나 만료된 리소스를 갱신할 수 있어요. `true`는 만료 리소스의 사용을 허용하므로 최신화를 보장하는 값이 아니에요. [공식 갱신 설명](https://docs.mapbox.com/ios/maps/guides/offline/manage-offline-data/)

작성자 권장 모델에서는 `lastSuccessfulUpdate`와 `lastAttempt`를 나눠요. 갱신을 시도했다가 실패한 날짜를 “지도 업데이트 완료”로 표시하지 않기 위해서예요. 화면 이탈 시 취소할지, 앱 수준 객체가 계속 소유할지도 제품 정책으로 정해요. 비동기 API를 쓴다고 iOS에서 무제한 백그라운드 실행이 보장되지는 않아요.

## 삭제 완료와 바이트 회수는 구분해요

remove API가 관리 대상에서 리소스를 해제해도 실제 디스크 정리는 지연될 수 있어요. 특히 다른 지역과 공유하는 리소스가 있어요. 원문의 quota를 0으로 만드는 설명은 저장소 전체에 영향을 줄 수 있으므로, **한 지역 삭제 버튼에서 실행할 처방으로 사용하지 마세요.**

삭제 UI의 성공 문구는 우선 “저장 지역 목록에서 제거했어요”처럼 실제 확인한 결과와 맞추세요. 앱이 추정한 다운로드 크기를 기기에서 즉시 확보한 공간으로 그대로 표시하지 않는 편이 안전해요.

## 실패를 분리해서 테스트해요

- [ ] Style Pack만 성공한 상태에서는 준비 완료로 표시하지 않나요?
- [ ] 취소 버튼이 두 작업의 핸들을 처리하나요?
- [ ] 재시도 전에 이전 요청의 결과를 무시할 기준이 있나요?
- [ ] 재실행 시 SDK 목록에서 저장 상태를 복원하나요?
- [ ] 같은 ID의 갱신 실패 시 마지막 성공 시각을 보존하나요?
- [ ] 저장 범위를 벗어난 지도와 다운로드 실패를 구분하나요?
- [ ] 삭제 결과를 확인한 뒤 목록과 용량 안내를 갱신하나요?

## 면접에서 이어질 수 있는 질문

### progress가 끝났는데 왜 completion이 필요한가요?

진행 상황과 최종 결과는 다른 정보예요. UI의 사용 가능 여부는 두 요청의 성공 결과를 확인한 뒤 결정해야 해요.

### 취소 핸들은 누가 가져야 하나요?

다운로드의 수명을 결정하는 객체가 소유해야 해요. 화면 이동과 무관하게 유지할 다운로드를 일시적인 화면 객체에만 맡기면 정책과 수명이 어긋나요.

### 같은 지역 갱신마다 새 ID를 쓰면 어떤 문제가 있나요?

앱의 목록에서 같은 여행 데이터가 여러 항목으로 남을 수 있어요. 사용자에게 새 지역인지 기존 지역의 갱신인지 먼저 구분한 뒤 식별자를 정해야 해요.

## 참고 자료

- [Mapbox: Manage Offline Data](https://docs.mapbox.com/ios/maps/guides/offline/manage-offline-data/)
- [Mapbox: Concepts and Constraints](https://docs.mapbox.com/ios/maps/guides/offline/concepts/)
- [Mapbox 11.29.1: TilesetDescriptorOptions](https://github.com/mapbox/mapbox-maps-ios/blob/11.29.1/Sources/MapboxMaps/Offline/TilesetDescriptorOptions%2BMapboxMaps.swift)
