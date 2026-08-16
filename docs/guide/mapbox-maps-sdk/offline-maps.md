---
title: Mapbox 오프라인 지도
description: OfflineManager의 Style Pack과 TileStore의 Tile Region을 구분하고 영역·zoom별 다운로드, 진행률, 갱신, 삭제와 저장 공간 정책을 설계하는 방법을 설명합니다.
pageType: doc-wide
outline: false
---

# Mapbox 오프라인 지도

> 면접용 한 줄 요약: **Mapbox 오프라인 지도는 Style Pack으로 글꼴·sprite 같은 표현 리소스를, Tile Region으로 지정 영역과 zoom의 지도 타일을 내려받아 두 수명 주기를 함께 관리합니다.**

## 먼저 알아둘 오프라인 용어

| 용어               | 쉬운 뜻                                                                    |
| ------------------ | -------------------------------------------------------------------------- |
| Style Pack         | Style 정의, sprite, 글꼴 등 타일이 아닌 렌더링 리소스 묶음이에요.          |
| Tile Pack          | 특정 Tileset의 여러 지도 tile을 저장하는 내부 묶음이에요.                  |
| Tile Region        | 영역 geometry와 zoom 범위에 필요한 Tile Pack을 다운로드·관리하는 단위예요. |
| `OfflineManager`   | Style Pack을 관리하고 Tile 다운로드용 descriptor를 만들어요.               |
| `TileStore`        | Tile Region을 저장, 조회, 갱신, 삭제해요.                                  |
| Tileset descriptor | 어떤 Style과 zoom 범위의 tile이 필요한지 설명해요.                         |
| `acceptExpired`    | 만료된 리소스를 그대로 허용할지 정하는 옵션이에요.                         |

## 캐시와 오프라인 다운로드는 달라요

온라인에서 한 번 본 지도 tile이 disk cache에 남아 네트워크 없이 보일 수 있어요. 하지만 cache는 앱이 보존 범위를 약속하거나 사용자에게 진행률을 보여 주는 기능이 아닙니다.

명시적인 오프라인 기능은 다음 두 부분을 준비해요.

```text
Style URI
  └─ OfflineManager ──> Style Pack
                        style JSON, sprite, glyph, model...

영역 Geometry + Zoom Range
  └─ TilesetDescriptor ──> TileStore ──> Tile Region
                                      vector/raster tile packs

Style Pack + Tile Region이 모두 준비됨
  └─ 네트워크가 없어도 지정 범위 렌더링
```

Tile Region만 받고 Style Pack을 빠뜨리면 글꼴이나 sprite 같은 리소스가 없어 지도가 비거나 일부가 누락될 수 있어요.

## 다운로드 범위를 먼저 작게 설계해요

“서울 전체를 최대 확대까지” 같은 요구는 영역과 zoom 조합이 커져 저장 공간과 다운로드 시간이 급격히 늘어날 수 있어요. 다음 값을 제품 요구로 명시합니다.

- 사용자가 선택할 수 있는 영역의 최대 크기
- 실제 기능에 필요한 최소·최대 zoom
- Wi-Fi 전용 다운로드 여부
- 예상 크기와 남은 저장 공간 안내
- 다운로드 취소·재시도 정책
- 오래된 지역 자동 삭제와 수동 삭제 UI
- 현재 Mapbox 가격·tile pack 제한

오프라인 지도는 버튼 하나가 아니라 저장소 수명 주기 기능이에요.

## 1단계: Style Pack을 준비해요

```swift
import MapboxMaps

final class OfflineMapStore {
  private let offlineManager = OfflineManager()
  private let tileStore = TileStore.default

  private var stylePackTask: Cancelable?
  private var tileRegionTask: Cancelable?

  func downloadStandardStyle(
    progress: @escaping (UInt64, UInt64) -> Void,
    completion: @escaping (Result<StylePack, Error>) -> Void
  ) {
    let options = StylePackLoadOptions(
      glyphsRasterizationMode: .ideographsRasterizedLocally,
      metadata: ["purpose": "offline-map"],
      acceptExpired: false
    )

    stylePackTask = offlineManager.loadStylePack(
      for: .standard,
      loadOptions: options
    ) { value in
      DispatchQueue.main.async {
        progress(value.completedResourceCount, value.requiredResourceCount)
      }
    } completion: { result in
      DispatchQueue.main.async {
        completion(result)
      }
    }
  }
}
```

공식 가이드는 progress와 completion closure가 main thread에서 호출된다고 보장하지 않는다고 안내합니다. SwiftUI 상태를 바꾸기 전에 MainActor나 main queue로 전환하세요.

한글·한자 glyph를 기기에서 rasterize하면 원격 glyph 다운로드를 줄일 수 있지만 글꼴과 디자인 요구를 함께 확인해야 해요. 앱의 Style과 다른 Style Pack을 받으면 원하는 지도를 오프라인으로 그릴 수 없습니다.

## 2단계: 영역과 zoom의 Tileset descriptor를 만들어요

서울 중심의 예시를 작게 만들어 볼게요. 실제 서비스는 점 한 개보다 polygon이나 bounding box로 영역을 정의하는 경우가 많습니다.

```swift
import MapboxMaps
import Turf

extension OfflineMapStore {
  func downloadSeoulCenter(
    progress: @escaping (UInt64, UInt64) -> Void,
    completion: @escaping (Result<TileRegion, Error>) -> Void
  ) {
    let descriptorOptions = TilesetDescriptorOptions(
      styleURI: .standard,
      zoomRange: 10...14
    )

    let descriptor = offlineManager.createTilesetDescriptor(
      for: descriptorOptions
    )

    let center = CLLocationCoordinate2D(
      latitude: 37.5666,
      longitude: 126.9784
    )

    guard let loadOptions = TileRegionLoadOptions(
      geometry: Geometry(coordinate: center),
      descriptors: [descriptor],
      metadata: [
        "name": "seoul-center",
        "minZoom": 10,
        "maxZoom": 14,
      ],
      acceptExpired: false
    ) else {
      completion(.failure(OfflineMapError.invalidRegion))
      return
    }

    tileRegionTask = tileStore.loadTileRegion(
      forId: "seoul-center-10-14",
      loadOptions: loadOptions
    ) { value in
      DispatchQueue.main.async {
        progress(value.completedResourceCount, value.requiredResourceCount)
      }
    } completion: { result in
      DispatchQueue.main.async {
        completion(result)
      }
    }
  }
}

enum OfflineMapError: Error {
  case invalidRegion
}
```

이 코드는 오프라인 API의 연결 관계를 보여 주는 최소 예제예요. 실제 기능에서는 polygon으로 영역을 정의하고, Style Pack 완료와 Tile Region 완료를 하나의 화면 상태로 조합하며, 오류 타입별 재시도 정책을 둡니다.

`TileRegionLoadOptions`의 geometry가 점이면 그 점을 덮는 tile만 대상으로 삼아요. 사용자가 지도를 움직일 실제 범위를 제공하려면 bounding box를 닫힌 polygon으로 변환하세요.

## 진행률 상태는 하나의 모델로 합쳐요

Style Pack과 Tile Region은 서로 다른 작업이라 완료 시점도 다릅니다.

```swift
enum OfflineRegionState: Equatable {
  case notDownloaded
  case downloading(style: Double, tiles: Double)
  case ready
  case failed(message: String)
}
```

화면에는 전체 상태를 보여 주되 내부에서는 두 작업의 progress, completion, cancel token을 각각 보관해요. 한쪽만 성공했을 때 `.ready`로 표시하면 비행기 모드에서 지도가 누락될 수 있습니다.

## 취소와 화면 종료는 구분해요

`loadStylePack`과 `loadTileRegion`은 `Cancelable`을 반환합니다.

```swift
extension OfflineMapStore {
  func cancelCurrentDownload() {
    stylePackTask?.cancel()
    tileRegionTask?.cancel()
    stylePackTask = nil
    tileRegionTask = nil
  }
}
```

화면이 잠깐 사라진다고 사용자 요청 다운로드를 항상 취소할지는 제품 정책이에요. View가 작업을 소유하면 탭 전환에 취소될 수 있으므로 오래 걸리는 다운로드는 앱 수준 store나 background 정책과 함께 설계합니다.

iOS background execution 시간이 무한하지 않다는 점도 고려하세요. 앱이 background로 갔을 때 중단·재개되는 동작을 실제 기기에서 검증합니다.

## 기존 데이터는 같은 ID로 갱신해요

공식 오프라인 가이드에 따르면 같은 Style URI와 Tile Region ID로 다시 load하고 `acceptExpired: false`를 전달하면 누락되거나 만료된 리소스를 갱신할 수 있어요.

```text
앱 시작
  ├─ 저장된 Style Pack과 Tile Region 목록 조회
  ├─ 만료·정책 버전 확인
  ├─ Wi-Fi와 사용자 설정 확인
  └─ 같은 ID로 refresh
```

`acceptExpired: true`는 오래된 데이터를 허용해 즉시 사용할 수 있게 하지만 새 리소스로 바꾸지 않을 수 있어요. “오래돼도 우선 보이기”와 “연결되면 최신화” 정책을 나누고 사용자에게 마지막 업데이트 시각을 보여 주세요.

지도 화면이 `TileStore`의 오래된 pack을 온라인에서 자동 갱신하게 하려면 `MapboxMapsOptions.tileStoreUsageMode`의 `.readAndUpdate` 동작을 검토할 수 있습니다. 네트워크와 비용 정책을 확인하지 않고 전역 옵션부터 켜지는 마세요.

## 목록과 삭제 수명 주기를 제공해요

`OfflineManager.allStylePacks`와 `TileStore.allTileRegions`로 현재 저장 항목을 조회할 수 있어요. 사용자가 지역을 삭제하면 Tile Region을 먼저 제거하고, 다른 지역이 공유하지 않는 Style Pack과 cache 정책을 함께 정리합니다.

```swift
extension OfflineMapStore {
  func removeSeoulCenter(
    completion: @escaping (Result<TileRegion, Error>) -> Void
  ) {
    tileStore.removeTileRegion(
      forId: "seoul-center-10-14"
    ) { result in
      DispatchQueue.main.async {
        completion(result)
      }
    }
  }
}
```

삭제 API를 호출했다고 disk byte가 즉시 모두 사라진다고 가정하면 안 돼요. 공식 가이드는 region에서 resource 참조를 제거한 뒤 disk cache의 일반 정리 과정에서 실제 파일이 삭제될 수 있다고 설명합니다.

## 오프라인 테스트는 cache를 통제해요

온라인에서 이미 본 영역은 cache만으로 보일 수 있어 잘못된 성공 판정을 만들어요.

1. 새 Simulator 또는 **Erase All Content and Settings**로 cache를 비워요.
2. 지정 Style Pack과 Tile Region을 내려받아요.
3. 다운로드 완료 상태를 확인해요.
4. 네트워크를 끄고 앱을 완전히 다시 실행해요.
5. 지정한 zoom 범위 안과 밖을 각각 확인해요.
6. 앱 업데이트, Style 변경, 만료 데이터, 저장 공간 부족을 테스트해요.
7. 취소 후 재시작과 일부 다운로드 실패를 테스트해요.

zoom 10...14만 받았다면 zoom 15에서 상세 tile이 안 보이는 것은 오류가 아니라 다운로드 계약입니다.

## 저장 공간과 비용을 함께 관리해요

- zoom 한 단계가 늘 때 필요한 tile 수가 크게 증가할 수 있어요.
- 서로 겹치는 Region이 내부 Tile Pack을 공유할 수 있지만 앱이 항상 정확한 byte 절감을 가정하면 안 돼요.
- 오래된 Region을 자동 삭제할 때 최근 사용 시각과 사용자의 고정 여부를 보존해요.
- 다운로드 전에 예상 크기와 네트워크 종류를 안내해요.
- Mapbox의 offline pricing과 tile pack 한도는 변경될 수 있으므로 출시 시점 공식 정책을 확인해요.
- Mapbox 서버에서 받은 오프라인 데이터를 다른 사용자나 앱에 재배포하지 않아요.

## 언제 오프라인 지도를 사용해야 하나요?

- 등산, 여행, 현장 업무처럼 연결이 자주 끊기는 제한된 지역
- 사용자가 출발 전에 지역을 명시적으로 선택할 수 있는 기능
- 필요한 zoom과 Style이 명확하고 저장 공간을 안내할 수 있는 기능

반대로 전 세계를 항상 최대 zoom으로 저장하거나, 잠깐 네트워크가 느릴 때 cache만으로 충분한 화면이라면 명시적 offline region은 비용과 관리 복잡도가 과할 수 있어요.

## 적용 순서를 정리해요

1. 사용자 시나리오에서 영역과 필요한 zoom 범위를 제한해요.
2. 사용할 Style URI와 Style Pack 정책을 정해요.
3. 영역 ID, geometry, descriptor와 metadata 모델을 설계해요.
4. Style Pack과 Tile Region을 각각 다운로드하고 하나의 UI 상태로 합쳐요.
5. progress callback을 MainActor 상태로 안전하게 전달해요.
6. 취소, 재시도, 갱신, 목록, 삭제 수명 주기를 구현해요.
7. 깨끗한 cache와 실제 기기에서 offline·저장 공간·앱 재실행을 검증해요.

## 면접에서 이어질 수 있는 질문

### Style Pack과 Tile Region은 왜 둘 다 필요한가요?

Style Pack은 Style 정의, 글꼴, sprite처럼 지도를 어떻게 그릴지에 필요한 리소스를 담습니다. Tile Region은 지정 영역과 zoom의 실제 지도 tile을 담으므로 둘 중 하나가 없으면 완전한 오프라인 렌더링을 보장할 수 없어요.

### cache와 offline region의 차이는 무엇인가요?

cache는 최근 온라인 사용의 부산물이며 보존 범위와 완료 상태를 앱이 제어하지 못합니다. Offline region은 앱이 geometry, zoom, progress, 갱신과 삭제를 명시적으로 관리하는 사용자 기능이에요.

### zoom 범위를 넓히면 왜 비용이 크게 늘 수 있나요?

확대할수록 같은 영역을 더 작은 tile들로 나눠야 하므로 필요한 tile 수가 빠르게 증가합니다. 사용자가 실제로 볼 상세 수준만 선택하고 예상 저장 공간과 가격을 함께 검토해야 해요.

## 참고 자료

- [Mapbox 오프라인 데이터 관리](https://docs.mapbox.com/ios/maps/guides/offline/manage-offline-data/)
- [Mapbox iOS 오프라인 지도 튜토리얼](https://docs.mapbox.com/help/tutorials/ios-offline-maps/)
- [`OfflineManager` API Reference](https://docs.mapbox.com/ios/maps/api/latest/documentation/mapboxmaps/offlinemanager/)
- [`TileStore` API Reference](https://docs.mapbox.com/ios/maps/api/latest/documentation/mapboxmaps/tilestore/)
- [Mapbox Maps SDK 공식 예제](https://docs.mapbox.com/ios/maps/examples/)
- [Mapbox 계정과 가격 문서](https://docs.mapbox.com/accounts/)
