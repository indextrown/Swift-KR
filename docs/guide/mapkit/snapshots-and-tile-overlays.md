---
title: MapKit 스냅샷과 커스텀 타일
description: MKMapSnapshotter로 정적 지도 이미지를 만들고 Annotation을 합성하는 방법과 MKTileOverlay의 좌표·캐시·저작권·오프라인 경계를 설명합니다.
pageType: doc-wide
outline: false
---

# MapKit 스냅샷과 커스텀 타일

> 면접용 한 줄 요약: **상호작용 없는 지도 이미지는 `MKMapSnapshotter`, 앱이 소유하거나 사용권을 가진 래스터 타일은 `MKTileOverlay`를 사용하며, snapshot에는 custom Annotation과 Overlay가 자동으로 포함되지 않습니다.**

## 상호작용 목적부터 구분해요

| 요구 사항                                | 선택할 API                     |
| ---------------------------------------- | ------------------------------ |
| 사용자가 이동·확대하는 지도              | SwiftUI `Map` 또는 `MKMapView` |
| 공유 카드·목록 thumbnail                 | `MKMapSnapshotter`             |
| 거리 수준 정적 이미지                    | `MKLookAroundSnapshotter`      |
| 날씨·지적도 등 custom 래스터 타일        | `MKTileOverlay`                |
| Apple 기본 지도의 오프라인 영역 다운로드 | 공개된 전용 다운로드 API 없음  |

스크롤 목록의 모든 셀에 대화형 `MKMapView`를 넣으면 renderer와 네트워크 비용이 커질 수 있어요. 조작이 필요 없는 셀은 snapshot을 만들어 캐시하는 편이 적합합니다.

## 기본 지도 snapshot을 만들어요

```swift
import MapKit
import UIKit

@MainActor
func makeMapSnapshot(
  region: MKCoordinateRegion,
  size: CGSize
) async throws -> UIImage {
  let options = MKMapSnapshotter.Options()
  options.region = region
  options.size = size
  options.scale = UIScreen.main.scale
  options.mapType = .standard

  let snapshotter = MKMapSnapshotter(options: options)
  let snapshot = try await snapshotter.start()
  return snapshot.image
}
```

`region`, `mapRect`, `camera` 중 목적에 맞는 framing을 지정할 수 있어요. point 단위 `size`와 화면 scale을 함께 설정해야 Retina 결과가 흐릿하지 않습니다.

화면이 사라지거나 새 장소를 선택하면 실행 중인 Task를 취소하세요. 같은 장소·크기·appearance의 결과는 메모리 또는 디스크 캐시를 검토하되 지도 정보가 최신이어야 하는 수명도 함께 정합니다.

## custom 핀은 결과 이미지에 직접 합성해요

Apple 공식 문서에 따르면 snapshot은 앱이 만든 Annotation과 Overlay의 화면 표현을 자동으로 캡처하지 않습니다. `Snapshot.point(for:)`로 좌표를 이미지 점으로 바꿔 직접 그려요.

```swift
func snapshotWithPin(
  snapshot: MKMapSnapshotter.Snapshot,
  coordinate: CLLocationCoordinate2D
) -> UIImage {
  let renderer = UIGraphicsImageRenderer(size: snapshot.image.size)

  return renderer.image { _ in
    snapshot.image.draw(at: .zero)

    let point = snapshot.point(for: coordinate)
    let pin = UIImage(systemName: "mappin.circle.fill")?
      .withTintColor(.systemRed, renderingMode: .alwaysOriginal)
    let pinSize = CGSize(width: 34, height: 34)
    let origin = CGPoint(
      x: point.x - pinSize.width / 2,
      y: point.y - pinSize.height
    )
    pin?.draw(in: CGRect(origin: origin, size: pinSize))
  }
}
```

이미지 아래쪽을 좌표에 맞추는 이유는 핀 끝이 실제 장소를 가리키기 때문이에요. 선과 다각형도 지리 좌표를 point로 변환해 그릴 수 있지만 복잡한 Overlay는 scale, clipping, line join을 신중하게 구현해야 합니다.

## snapshot cache key를 명확히 만들어요

```text
SnapshotCacheKey
  ├─ 중심과 span 또는 mapRect
  ├─ 출력 size와 scale
  ├─ mapType·elevation·POI filter
  ├─ light/dark appearance
  └─ custom 핀·경로 데이터 버전
```

좌표만 key로 쓰면 같은 장소라도 다른 크기나 다크 모드 결과가 섞여요. 반대로 카메라의 작은 부동소수점 차이를 모두 다른 key로 만들면 cache hit가 사라지므로 제품 단위로 값을 정규화합니다.

## `MKTileOverlay`는 앱이 제공하는 타일을 그려요

```swift
final class WeatherTileController: NSObject, MKMapViewDelegate {
  func install(on mapView: MKMapView) {
    let tiles = MKTileOverlay(
      urlTemplate: "https://tiles.example.com/weather/{z}/{x}/{y}@2x.png"
    )
    tiles.minimumZ = 3
    tiles.maximumZ = 18
    tiles.canReplaceMapContent = false
    mapView.addOverlay(tiles, level: .aboveLabels)
  }

  func mapView(
    _ mapView: MKMapView,
    rendererFor overlay: any MKOverlay
  ) -> MKOverlayRenderer {
    guard let tiles = overlay as? MKTileOverlay else {
      return MKOverlayRenderer(overlay: overlay)
    }
    return MKTileOverlayRenderer(tileOverlay: tiles)
  }
}
```

URL template의 `{z}`, `{x}`, `{y}`, `@2x`는 확대 수준, 타일 좌표, scale에 맞게 치환됩니다. 제공자가 쓰는 좌표 원점과 Retina URL 규칙이 다르면 `geometryFlipped` 설정이나 `url(forTilePath:)` override를 검토하세요.

`canReplaceMapContent = true`는 custom 타일이 Apple 기본 지도를 대신한다는 뜻입니다. 날씨처럼 기본 지도 위에 겹칠 데이터라면 `false`를 유지해요.

## 네트워크와 캐시 정책은 TileOverlay 밖의 책임이에요

기본 `MKTileOverlay`는 URL을 구성해 타일을 요청하지만 제품의 인증, 만료, 재시도, 디스크 제한을 설계해 주지 않습니다. 제어가 필요하면 subclass에서 `loadTile(at:result:)`를 구현하고 별도 loader/cache를 연결할 수 있어요.

```text
MKTileOverlay 요청
  └─ TileLoader
       ├─ 메모리 cache
       ├─ 허용된 디스크 cache
       ├─ HTTP 재검증
       └─ provider 사용 조건과 만료 정책
```

동일 타일의 동시 요청을 합치고, 실패를 무한 재시도하지 않으며, 취소와 최대 디스크 용량을 정하세요.

## 오프라인 지도와 custom 타일을 혼동하지 않아요

`MKTileOverlay`가 있다고 Apple 기본 지도 데이터를 임의로 내려받아 오프라인 패키지로 만들 수 있는 것은 아닙니다. 공개 MapKit API에는 Mapbox Tile Region 같은 Apple basemap 영역 다운로드 관리 API가 없습니다. 이는 현재 공개 API 범위를 비교한 결론이며 향후 SDK에서는 다시 확인해야 해요.

오프라인이 필수라면 다음을 검토합니다.

- 직접 제작하거나 오프라인 사용권을 가진 custom 타일을 제공해요.
- 타일 제공자의 저장·재배포·attribution 조건을 확인해요.
- 용량 제한, 만료, 데이터 갱신, 부분 다운로드 복구 UI를 설계해요.
- 지도 SDK 선택 단계에서 공식 오프라인 영역 API를 제공하는 제품과 비교해요.

## Legal과 attribution을 가리지 않아요

MapKit의 대화형 지도나 snapshot을 최종 UI에 배치할 때 Apple Maps 로고와 Legal 정보를 자르거나 다른 UI로 덮지 않도록 확인하세요. custom tile도 원본 데이터 제공자가 요구하는 attribution을 별도로 표시해야 할 수 있습니다. 출시 시점의 Apple 약관과 타일 제공자 계약을 기준으로 검토해요.

## 체크리스트

- [ ] 조작 없는 화면에 불필요한 `MKMapView`를 여러 개 만들지 않나요?
- [ ] snapshot의 size와 scale, appearance가 cache key에 들어가나요?
- [ ] custom Annotation과 Overlay를 snapshot에 직접 합성했나요?
- [ ] TileOverlay의 좌표 원점과 최대 zoom을 확인했나요?
- [ ] custom 타일의 캐시·오프라인 사용권과 attribution을 확인했나요?
- [ ] Apple 기본 지도 다운로드 API가 있다고 가정하지 않나요?

## 면접에서 이어질 수 있는 질문

### `MKMapSnapshotter`가 Annotation도 함께 찍어 주나요?

시스템 지도 콘텐츠를 이미지로 만들지만 앱이 추가한 Annotation과 Overlay 표현은 자동으로 포함하지 않습니다. snapshot의 좌표 변환 API로 이미지 점을 구해 custom 핀과 경로를 직접 합성해야 해요.

### `MKTileOverlay`는 완전한 오프라인 지도 기능인가요?

아니요. 앱의 custom 래스터 타일을 요청하고 그리는 Overlay입니다. Apple basemap 다운로드를 제공하지 않으며 custom 타일의 다운로드, cache, 만료, 사용권은 앱과 데이터 제공자가 책임져요.

## 참고 자료

- [MKMapSnapshotter 공식 문서](https://developer.apple.com/documentation/mapkit/mkmapsnapshotter)
- [MKMapSnapshotter.Options 공식 문서](https://developer.apple.com/documentation/mapkit/mkmapsnapshotter/options)
- [MKTileOverlay 공식 문서](https://developer.apple.com/documentation/mapkit/mktileoverlay)
- [MKTileOverlayRenderer 공식 문서](https://developer.apple.com/documentation/mapkit/mktileoverlayrenderer)
