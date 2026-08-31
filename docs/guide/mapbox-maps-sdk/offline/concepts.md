---
title: Mapbox 오프라인 지도의 개념과 제약
description: Style Pack·Tile Pack·Tile Region·TileStore의 책임을 나누고, 오프라인 영역과 확대 수준이 저장량에 미치는 영향 및 750개 제한을 정리합니다.
source: https://docs.mapbox.com/ios/maps/guides/offline/concepts/
reviewed: '2026-08-31'
---

# Mapbox 오프라인 지도의 개념과 제약

> **면접 답변 한 줄 요약:** Style Pack은 지도 표현에 필요한 리소스를, Tile Region은 지역에 필요한 Tile Pack을 관리하므로, 오프라인 지도는 두 자원과 저장 제약을 함께 맞춰야 해요.

지도 다운로드 용량이 예상보다 크다면 “좌표 몇 개를 저장했는데 왜 크지?”라고 생각하기 쉬워요. 좌표 목록 자체가 아니라 그 주변을 그리는 지도 리소스를 내려받기 때문이에요.

## 먼저 알아둘 용어

| 용어               | 쉬운 뜻                                                        |
| ------------------ | -------------------------------------------------------------- |
| Style Pack         | 스타일 정의·글꼴·이미지 등 타일 이외의 표현 리소스 묶음이에요. |
| Tile Pack          | 지도 타일을 정해진 확대 구간으로 묶은 저장 단위예요.           |
| Tile Region        | 저장할 지리 범위와 필요한 타일 구성을 지정하는 관리 단위예요.  |
| TileStore          | Tile Pack을 보관하고 Tile Region을 관리하는 저장소예요.        |
| Tileset Descriptor | 어떤 스타일·확대 범위 등의 타일이 필요한지 기술하는 값이에요.  |
| Geometry           | 점·선·면 등으로 지리 범위를 표현한 값이에요.                   |

위 책임 구분과 다음 제한은 [공식 Concepts and Constraints](https://docs.mapbox.com/ios/maps/guides/offline/concepts/)를 기준으로 정리했어요.

## 저장소의 책임을 나누어 읽어요

```text
OfflineManager
  ├─ Style Pack 관리
  └─ Tileset Descriptor 생성
              │
Geometry ──────┼─> Tile Region ─> TileStore 안의 Tile Pack
              │
              └─ 필요한 스타일·확대 범위

일반 지도 탐색 ─> 디스크 캐시 (TileStore와 별도)
```

`OfflineManager`로 표현 리소스를 준비하고, descriptor와 geometry를 `TileStore`에 전달해 지역 데이터를 준비해요. 이미 본 타일의 일반 디스크 캐시를 TileStore의 보존 대상으로 생각하면 안 돼요.

## 750개는 지역 개수가 아니에요

공식 기본 제한은 여러 Tile Region이 사용하는 **누적 고유 Tile Pack 수 750개**예요. `11.29.1` API 주석도 전체 지역에 걸친 기본 한도를 명시해요. 겹치는 지역이 공유하는 pack이 있으므로, 지역 목록 개수로 남은 한도를 계산할 수 없어요. [TileStore 구현](https://github.com/mapbox/mapbox-maps-ios/blob/11.29.1/Sources/MapboxMaps/Offline/TileStore%2BMapboxMaps.swift)

아래는 제한을 설명하는 가상 집합이에요. SDK의 실제 pack ID를 조회하는 예제는 아니에요.

```swift
let tripAPacks: Set<String> = ["pack-a", "pack-b", "pack-c"]
let tripBPacks: Set<String> = ["pack-b", "pack-c", "pack-d"]

let uniquePackCount = tripAPacks.union(tripBPacks).count
assert(uniquePackCount == 4)
```

여행 두 개에 각각 세 pack이 필요해도 고유 pack은 네 개예요. 실제 다운로드 가능 여부는 geometry·스타일·확대 범위로 결정되는 SDK 결과를 처리해야 해요.

## 확대 수준 하나를 더 요구하면 저장량이 뛰기도 해요

`11.29.1`의 descriptor 구현 주석은 기본 pack의 확대 구간을 `0...5`, `6...10`, `11...14`, `15...16`으로 설명해요. 가이드의 `8...15` 요청 예시도 묶음 때문에 `6...16`까지 확대됨을 보여 줘요. 원하는 확대 값만 낱개로 저장한다고 계산하지 마세요. [TilesetDescriptorOptions 구현](https://github.com/mapbox/mapbox-maps-ios/blob/11.29.1/Sources/MapboxMaps/Offline/TilesetDescriptorOptions%2BMapboxMaps.swift)

작성자 권장 검증은 같은 산책로로 다음 세 실험을 하는 거예요.

| 실험 | 바꿀 값                         | 관찰할 결과                             |
| ---- | ------------------------------- | --------------------------------------- |
| A    | 최대 확대 14                    | 기본 다운로드 시간·용량이에요.          |
| B    | 최대 확대 15                    | 확대 구간 경계를 넘을 때 증가량이에요.  |
| C    | B와 같은 확대, 더 좁은 geometry | 지역 축소가 증가량을 줄이는지 확인해요. |

점은 점 주변 pack을 선택하는 입력이지 여행자가 걸을 전체 구역을 뜻하지 않아요. 반대로 큰 사각형은 실제 이동하지 않는 곳까지 포함할 수 있어요. 테스트용 좌표 한 개를 서비스 범위로 그대로 쓰지 마세요.

## 저장 한도와 보존 대상을 따로 판단해요

`TileStoreOptions.diskQuota`는 저장 용량 한도를 설정해요. 현행 설명에서 정리는 기본적으로 한도의 50%부터 시작하지만, 지역에 필요한 pack을 마음대로 지우는 방식은 아니에요. 제거할 대상이 없으면 한도까지 증가하고 새 저장이 실패할 수 있어요. 한도를 낮췄다고 기존 여행 지도가 자동으로 적절하게 정리된다고 가정하지 마세요.

예를 들어 앱의 정책을 “500 MB 이하면 항상 새 지역 추가 허용”으로 구현하지 말고, 다운로드 실패 시 기존 지역을 유지하면서 삭제·범위 축소·재시도를 안내하도록 설계해요. 숫자 하나보다 실패 후 복구 경로가 중요해요.

## 지도 엔진의 TileStore 사용 정책도 따로 있어요

`MapboxMapsOptions.tileStoreUsageMode`는 지도 엔진이 TileStore를 사용하는 정책이에요. 기본값은 `.readOnly`이며, 이는 앱이 직접 요청하는 지역 다운로드까지 금지한다는 뜻이 아니에요. [기본 설정 구현](https://github.com/mapbox/mapbox-maps-ios/blob/11.29.1/Sources/MapboxMaps/Foundation/MapboxMapsOptions.swift)

| 값               | 지도 엔진의 동작                                                    |
| ---------------- | ------------------------------------------------------------------- |
| `.readOnly`      | 저장된 pack을 읽고, 없으면 개별 타일을 요청해 일반 캐시에 저장해요. |
| `.readAndUpdate` | 필요한 Tile Pack의 네트워크 로딩·갱신을 허용해요.                   |
| `.disabled`      | TileStore 사용을 끄므로 Tile Region 기능을 사용할 수 없어요.        |

이 구분은 [오프라인 동작 설정](https://docs.mapbox.com/ios/maps/guides/offline/concepts/)에 따른 것이에요. 사용자에게 Wi-Fi에서만 다운로드한다고 약속했다면, 전역 모드를 바꾸기 전에 그 약속과 네트워크 동작이 맞는지 시험하세요.

## 스타일을 바꾸는 배포도 오프라인 테스트 대상이에요

지원하는 타일 소스와 지도 데이터 재배포에는 제약이 있어요. 원문은 Mapbox 호스팅 타일 중심의 지원 범위와, 내려받은 Mapbox 데이터를 앱에 미리 묶거나 재배포할 수 없다는 조건을 명시해요. 임의 외부 타일 서버나 앱 번들 복사 방식으로 확장하지 마세요.

스타일의 Source는 데이터 공급원을 뜻해요. Source를 바꾸면 이전 다운로드에 없는 데이터를 요구할 수 있어요. 여러 소스를 합치는 compositing도 오프라인 제약이 있으므로, 스타일 배포 전 **이전 앱에서 받은 지역 + 새 스타일** 조합을 별도로 시험하세요.

## 적용 체크리스트

- [ ] 스타일과 지역의 완료 여부를 따로 보관하나요?
- [ ] 일반 캐시를 오프라인 보존 보장으로 표시하지 않나요?
- [ ] 영역 개수와 고유 pack 한도를 구분했나요?
- [ ] 확대 구간 경계에서 용량 증가를 측정했나요?
- [ ] Source 변경 후 기존 다운로드가 동작하는지 시험했나요?
- [ ] 데이터 호스팅·배포 조건을 현재 계약과 대조했나요?

## 면접에서 이어질 수 있는 질문

### Style Pack만 받아도 지도가 나오나요?

지역에 필요한 타일도 있어야 해요. 표현 규칙을 준비하는 작업과 지리 데이터를 준비하는 작업을 분리해 이해해야 해요.

### 용량을 줄이려면 확대 수준만 낮추면 되나요?

geometry도 함께 검토해야 해요. 필요한 행동을 유지하면서 지역 범위와 확대 구간을 하나씩 바꾸어 측정하는 편이 원인을 찾기 좋아요.

### 삭제와 저장 용량 감소는 같은 사건인가요?

아니에요. 관리 단위의 제거와 공유 리소스의 실제 정리는 다를 수 있어요. [오프라인 데이터 관리](./manage-offline-data.md)에서 삭제 후 상태를 다뤄요.

## 참고 자료

- [Mapbox: Concepts and Constraints](https://docs.mapbox.com/ios/maps/guides/offline/concepts/)
- [Mapbox: Manage Offline Data](https://docs.mapbox.com/ios/maps/guides/offline/manage-offline-data/)
- [Mapbox 11.29.1: TileStore](https://github.com/mapbox/mapbox-maps-ios/blob/11.29.1/Sources/MapboxMaps/Offline/TileStore%2BMapboxMaps.swift)
- [Mapbox 11.29.1: TilesetDescriptorOptions](https://github.com/mapbox/mapbox-maps-ios/blob/11.29.1/Sources/MapboxMaps/Offline/TilesetDescriptorOptions%2BMapboxMaps.swift)
- [Mapbox 11.29.1: MapboxMapsOptions](https://github.com/mapbox/mapbox-maps-ios/blob/11.29.1/Sources/MapboxMaps/Foundation/MapboxMapsOptions.swift)
