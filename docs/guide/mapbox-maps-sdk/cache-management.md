---
title: Mapbox 지도 캐시 관리
description: Mapbox 디스크 캐시와 오프라인 저장의 차이, 만료·ETag 재검증, volatile 타일 및 clearData의 범위를 구분하고 안전한 캐시 문제 조사 절차를 정리합니다.
source: https://docs.mapbox.com/ios/maps/guides/cache-management/
reviewed: '2026-08-31'
---

# Mapbox 지도 캐시 관리

> **면접 답변 한 줄 요약:** Mapbox 캐시는 지도 리소스를 재사용하고 만료 시 재검증하는 최적화이며, 명시적으로 보존하는 오프라인 데이터와 삭제 범위를 구분해야 해요.

지도를 다시 열 때 빨라지는 것과 다운로드한 여행 지도를 보존하는 것은 다른 요구예요. 이 페이지는 “캐시를 지우면 모두 초기화된다”는 가정 없이 저장과 요청을 조사하는 방법을 다뤄요.

## 먼저 알아둘 용어

| 용어        | 쉬운 뜻                                                                  |
| ----------- | ------------------------------------------------------------------------ |
| 디스크 캐시 | 다시 요청할 리소스를 기기 저장 공간에 남겨 두는 임시 저장이에요.         |
| 만료        | 서버와 다시 확인할 시점에 도달한 상태예요. 즉시 파일 삭제와는 달라요.    |
| ETag        | 서버가 리소스 버전을 구분하는 표식이에요.                                |
| volatile    | 타일 응답을 디스크에 유지하지 않는 설정이에요. 메모리 재사용과는 달라요. |

## 저장된 값이 있어도 재검증할 수 있어요

공식 가이드는 타일·스타일 리소스를 디스크에 캐시하고, 만료 시 ETag 등으로 유효성을 확인한다고 설명해요. 서버가 변경 없음을 알리면 전체 내용 대신 갱신 정보만 받을 수 있어요. `volatile` 타일은 메모리에는 캐시될 수 있지만 앱 실행 사이에 디스크로 보존되지 않아요. [공식 캐시 관리](https://docs.mapbox.com/ios/maps/guides/cache-management/)

아래는 동작을 이해하기 위한 단순화예요. Mapbox 내부의 완전한 요청 알고리즘은 아니에요.

```text
지도 리소스가 필요함
  ├─ 사용할 저장 데이터가 있음 ─> 재사용
  └─ 없거나 확인이 필요함 ─> 서버 요청 또는 재검증
                              ├─ 변경 없음 ─> 기존 내용 유지
                              └─ 새 내용 ─> 갱신
```

네트워크 이벤트가 있었다고 항상 같은 지도 데이터를 통째로 다시 받았다고 판단하지 마세요. 요청 수와 전송량은 다른 측정값이에요.

## 실제 경로는 SDK 설정에서 확인해요

공식 문서가 안내하는 기본 캐시 파일은 앱 컨테이너의 `Library/Application Support/.mapbox/map_data/map_data.db`예요. 다만 앱이 `MapboxMapsOptions.dataPath`를 바꿀 수 있으므로, 조사에는 현재 설정을 확인하세요. 경로 문자열을 하드코딩해 데이터베이스를 직접 삭제하는 방식은 피하세요. [캐시 위치 안내](https://docs.mapbox.com/ios/maps/guides/cache-management/)

```swift
import MapboxMaps

@MainActor
func printMapCacheLocationForDebugging() {
    #if DEBUG
    print("Mapbox data path:", MapboxMapsOptions.dataPath.path)
    #endif
}
```

이 함수는 위치 확인용이며 데이터를 지우지 않아요. 경로 로그도 진단 목적으로만 남기고 사용자에게 전송하는 분석 로그와 섞지 않는 편이 좋아요.

## clearData는 모든 지도 데이터의 초기화가 아니에요

`11.29.1`의 `MapboxMap.clearData(completion:)`는 **정적 메서드**예요. 같은 dataPath를 사용하는 지도들의 임시 데이터에 영향을 주며, 오프라인 Style Pack 같은 영구 데이터는 제거하지 않는다고 명시되어 있어요. [MapboxMap 구현](https://github.com/mapbox/mapbox-maps-ios/blob/11.29.1/Sources/MapboxMaps/Foundation/MapboxMap.swift)

아래는 사용자가 진단 도구에서 캐시 정리를 선택했을 때 호출할 함수예요. 자동으로 실행하거나 지도 화면 진입마다 호출하지 마세요.

```swift
import MapboxMaps

@MainActor
func clearTemporaryMapCache() {
    MapboxMap.clearData { error in
        if let error {
            print("임시 지도 데이터 정리 실패:", error.localizedDescription)
        } else {
            print("임시 지도 데이터 정리 요청 완료")
        }
    }
}
```

UI를 바꿀 때는 콜백에서 MainActor로 전달하는 단계를 추가하세요. 오프라인 지역 제거는 별도 [데이터 관리](./offline/manage-offline-data.md) 작업이에요. 캐시 정리 후 다음 로드가 느려지는 것도 재다운로드에 따른 예상 가능한 비용이에요.

## 요청 조절은 관찰 뒤에 적용해요

`ResourceRequest` 이벤트로 리소스 요청을 관찰할 수 있어요. 로그에는 URL 전체보다 요청 종류·결과·시각처럼 조사에 필요한 정보만 남기는 편이 좋아요. 토큰이나 사용자 좌표를 외부 로그에 실수로 보내지 않도록 주의하세요.

다음 세 설정은 이름이 비슷해도 목적이 달라요. `11.29.1` 소스는 뒤의 두 지연이 진행 중인 애니메이션·제스처에 적용되고, 둘을 지정하면 `tileRequestsDelay`가 우선한다고 설명해요. [VectorSource 정의](https://github.com/mapbox/mapbox-maps-ios/blob/11.29.1/Sources/MapboxMaps/Style/Generated/Sources/VectorSource.swift)

| 설정                        | 조절하는 것                              | 주의할 점                                          |
| --------------------------- | ---------------------------------------- | -------------------------------------------------- |
| `minimumTileUpdateInterval` | 타일 갱신 요청의 최소 간격, 초 단위예요. | 데이터가 요구하는 최신성보다 과하게 늘리지 않아요. |
| `tileRequestsDelay`         | 타일 요청 지연이에요.                    | 일시적으로 지나가는 타일 작업을 줄이는 용도예요.   |
| `tileNetworkRequestsDelay`  | 네트워크 타일 요청 지연이에요.           | 모든 캐시 읽기를 똑같이 늦추는 값은 아니에요.      |

원문 가이드는 두 delay를 밀리초 값으로 설명해요. 사용 버전의 API 정의와 함께 확인하고, 갱신 간격의 초 단위와 혼용하지 마세요.

## 적용 체크리스트

- [ ] 캐시와 오프라인 보존 데이터를 구분했나요?
- [ ] 요청 수만이 아니라 전송량·응답 결과도 확인했나요?
- [ ] 현재 dataPath와 공유하는 지도들을 파악했나요?
- [ ] 캐시 정리 성공을 오프라인 전체 삭제로 안내하지 않나요?
- [ ] cold cache와 warm cache 결과를 별도 기록하나요?
- [ ] 지연 옵션을 바꾼 뒤 화면이 늦게 채워지는 부작용도 시험했나요?

## 면접에서 이어질 수 있는 질문

### 캐시가 있는데 왜 네트워크 요청이 생기나요?

저장 데이터가 여전히 유효한지 확인할 수 있기 때문이에요. 요청 발생만으로 캐시 미사용을 단정할 수 없어요.

### volatile이면 메모리에도 저장하지 않나요?

아니에요. 디스크 보존과 메모리 재사용은 다른 정책이에요. 앱 종료 후 유지가 필요한 데이터에 volatile을 기대하면 안 돼요.

### 캐시 삭제가 성능 개선 방법인가요?

손상 의심 상태를 조사할 수는 있지만 반복 호출은 재사용 이점을 없애요. 원인을 확인하는 실험과 제품의 상시 동작을 구분해야 해요.

## 참고 자료

- [Mapbox: Cache Management](https://docs.mapbox.com/ios/maps/guides/cache-management/)
- [Mapbox 11.29.1: MapboxMap](https://github.com/mapbox/mapbox-maps-ios/blob/11.29.1/Sources/MapboxMaps/Foundation/MapboxMap.swift)
- [Mapbox 11.29.1: VectorSource](https://github.com/mapbox/mapbox-maps-ios/blob/11.29.1/Sources/MapboxMaps/Style/Generated/Sources/VectorSource.swift)
