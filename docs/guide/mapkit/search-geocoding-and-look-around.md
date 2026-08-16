---
title: MapKit 검색·지오코딩·Look Around
description: MKLocalSearch와 자동 완성, iOS 26 MapKit 지오코딩, MKMapItem, Look Around를 취소 가능한 비동기 흐름으로 연결하는 방법을 설명합니다.
pageType: doc-wide
outline: false
---

# MapKit 검색·지오코딩·Look Around

> 면접용 한 줄 요약: **장소 탐색은 자연어 검색·주소 변환·좌표 역변환을 구분하고 결과를 `MKMapItem`으로 통합하며, 입력과 선택이 바뀔 때 이전 비동기 요청을 취소해야 합니다.**

## 먼저 네 가지 요청을 구분해요

| 입력과 목적                 | API                         | 결과                           |
| --------------------------- | --------------------------- | ------------------------------ |
| “근처 카페”처럼 장소를 찾기 | `MKLocalSearch`             | 여러 `MKMapItem`               |
| 입력 중 검색어 제안         | `MKLocalSearchCompleter`    | `MKLocalSearchCompletion` 목록 |
| 완전한 주소를 좌표로 변환   | `MKGeocodingRequest`        | 주소 지점 `MKMapItem`          |
| 좌표를 주소로 변환          | `MKReverseGeocodingRequest` | 주소 지점 `MKMapItem`          |
| 선택한 장소의 거리 사진     | `MKLookAroundSceneRequest`  | `MKLookAroundScene?`           |

지오코딩은 주소 변환이고 Local Search는 관련 장소를 찾는 검색이에요. “스타벅스”를 geocoder에 넣어 지점 목록을 기대하거나, 정확한 도로명 주소를 넓은 POI 검색만으로 처리하지 않습니다.

## `MKMapItem`을 장소의 연결점으로 사용해요

`MKMapItem`에는 위치, 이름, 주소, 전화번호, URL과 장소 식별 정보가 들어올 수 있어요. 모든 값이 항상 존재한다고 가정하지 않습니다.

```swift
struct PlaceSummary: Identifiable {
  let id: String
  let name: String
  let coordinate: CLLocationCoordinate2D

  init(item: MKMapItem) {
    id = item.identifier?.rawValue
      ?? "\(item.location.coordinate.latitude),\(item.location.coordinate.longitude)"
    name = item.name ?? "이름 없는 장소"
    coordinate = item.location.coordinate
  }
}
```

장소를 장기간 저장한다면 좌표만 고유 키로 쓰지 마세요. 건물 안 여러 매장이 같은 좌표를 가질 수 있고 좌표가 보정될 수도 있어 MapKit Place ID처럼 지속 가능한 식별자를 우선 검토합니다.

## 현재 보이는 영역에서 장소를 검색해요

```swift
import Combine
import MapKit

@MainActor
final class PlaceSearchModel: ObservableObject {
  @Published private(set) var results: [MKMapItem] = []
  @Published private(set) var errorMessage: String?

  private var activeSearch: MKLocalSearch?

  func search(query: String, region: MKCoordinateRegion) async {
    activeSearch?.cancel()

    let request = MKLocalSearch.Request()
    request.naturalLanguageQuery = query
    request.region = region
    request.resultTypes = [.pointOfInterest, .address]

    let search = MKLocalSearch(request: request)
    activeSearch = search

    do {
      let response = try await search.start()
      guard activeSearch === search else { return }
      results = response.mapItems
      errorMessage = nil
    } catch is CancellationError {
      // 새 검색으로 교체된 정상 흐름이에요.
    } catch {
      guard activeSearch === search else { return }
      results = []
      errorMessage = "장소를 검색하지 못했습니다."
    }
  }
}
```

region은 결과를 제한하는 힌트이며 현재 화면 주변 검색의 관련도를 높입니다. 검색 버튼을 누를 때나 debounce가 끝난 뒤 요청하고, 키 입력마다 동시에 요청하지 마세요. MapKit은 짧은 시간에 너무 많은 요청을 보내면 throttling 오류를 반환할 수 있습니다.

## 자동 완성과 실제 검색은 두 단계예요

`MKLocalSearchCompleter`는 입력 중 title과 subtitle 제안을 빠르게 제공합니다. 제안 하나를 선택한 뒤 그 completion으로 `MKLocalSearch.Request`를 만들어 실제 `MKMapItem`을 얻어요.

```swift
final class SearchCompleterModel: NSObject,
  ObservableObject,
  MKLocalSearchCompleterDelegate {
  @Published private(set) var completions: [MKLocalSearchCompletion] = []

  let completer = MKLocalSearchCompleter()

  override init() {
    super.init()
    completer.delegate = self
    completer.resultTypes = [.pointOfInterest, .address]
  }

  func update(query: String, region: MKCoordinateRegion) {
    completer.region = region
    completer.queryFragment = query
  }

  func completerDidUpdateResults(_ completer: MKLocalSearchCompleter) {
    completions = completer.results
  }

  func completer(
    _ completer: MKLocalSearchCompleter,
    didFailWithError error: any Error
  ) {
    completions = []
  }
}
```

```swift
func resolve(_ completion: MKLocalSearchCompletion) async throws -> MKMapItem? {
  let request = MKLocalSearch.Request(completion: completion)
  return try await MKLocalSearch(request: request).start().mapItems.first
}
```

completion의 title·subtitle만 저장해 장소 데이터처럼 사용하면 좌표와 최신 상세 정보가 없습니다. 사용자가 선택했을 때 실제 검색으로 해석하세요.

## iOS 26부터 지오코딩이 MapKit으로 이동했어요

Apple은 iOS 26 계열에서 `CLGeocoder`를 deprecated하고 `MKGeocodingRequest`, `MKReverseGeocodingRequest`를 제공합니다. 새 API는 결과를 `MKMapItem`으로 반환해 검색·지도·경로와 연결하기 쉬워요.

```swift
@available(iOS 26.0, *)
func geocode(address: String) async throws -> MKMapItem? {
  guard let request = MKGeocodingRequest(addressString: address) else {
    return nil
  }

  request.preferredLocale = Locale(identifier: "ko_KR")
  request.region = MKCoordinateRegion(
    center: .init(latitude: 37.5666, longitude: 126.9784),
    span: .init(latitudeDelta: 1, longitudeDelta: 1)
  )
  return try await request.mapItems.first
}
```

```swift
@available(iOS 26.0, *)
func reverseGeocode(_ coordinate: CLLocationCoordinate2D) async throws -> MKMapItem? {
  let location = CLLocation(
    latitude: coordinate.latitude,
    longitude: coordinate.longitude
  )
  guard let request = MKReverseGeocodingRequest(location: location) else {
    return nil
  }
  return try await request.mapItems.first
}
```

initializer가 optional인 이유는 빈 주소나 유효하지 않은 좌표로 요청을 만들 수 없기 때문입니다. 지오코딩 결과는 주소 지점 정보이며, 주변 영업시간 같은 풍부한 POI 정보가 항상 포함되는 것은 아니에요.

### iOS 25 이하도 지원한다면

구버전 배포 대상에서는 Core Location의 `CLGeocoder` 호환 경로가 필요합니다.

```swift
func legacyGeocode(address: String) async throws -> CLPlacemark? {
  try await CLGeocoder()
    .geocodeAddressString(address)
    .first
}
```

새 코드 전부를 deprecated API로 유지하기보다 availability를 경계로 결과를 앱의 `PlaceSummary` 같은 공통 모델로 변환하세요.

## 선택한 장소에 Look Around를 연결해요

```swift
struct PlaceDetailView: View {
  let item: MKMapItem
  @State private var scene: MKLookAroundScene?

  var body: some View {
    Group {
      if let scene {
        LookAroundPreview(initialScene: scene)
          .frame(height: 220)
          .clipShape(RoundedRectangle(cornerRadius: 16))
      } else {
        ContentUnavailableView(
          "Look Around 없음",
          systemImage: "binoculars",
          description: Text("이 장소에서는 거리 이미지를 제공하지 않습니다.")
        )
      }
    }
    .task(id: item) {
      scene = nil
      scene = try? await MKLookAroundSceneRequest(mapItem: item).scene
    }
  }
}
```

Look Around는 지역별 제공 범위가 다르고 요청이 실패하거나 장면이 없을 수 있습니다. loading, unavailable, error를 같은 빈 화면으로 뭉개지 말고 제품 요구에 따라 구분하세요. `.task(id:)`는 선택 장소가 바뀌면 이전 Task를 취소하므로 늦게 도착한 이전 장면이 새 선택을 덮는 문제를 줄여요.

## 하나의 화면 요청 흐름을 정리해요

```text
검색어 입력
  └─ debounce ─> MKLocalSearchCompleter
                    └─ completion 선택
                         └─ MKLocalSearch ─> MKMapItem
                                              ├─ Marker 표시
                                              ├─ 장소 상세 표시
                                              ├─ Look Around 요청
                                              └─ Directions 목적지
```

View가 각 API를 직접 호출하기보다 요청 취소와 최신 결과 판별을 model/service에 모으면 테스트하기 쉬워요.

## 체크리스트

- [ ] 장소 검색과 주소 지오코딩을 구분했나요?
- [ ] 검색 입력을 debounce하고 이전 요청을 취소하나요?
- [ ] completion 선택 후 실제 `MKLocalSearch`로 장소를 해석하나요?
- [ ] iOS 26 지오코딩과 이전 OS 호환 경계를 정했나요?
- [ ] `MKMapItem`의 optional 정보를 안전하게 표시하나요?
- [ ] Look Around 장면이 없는 장소의 UI가 있나요?

## 면접에서 이어질 수 있는 질문

### `MKLocalSearchCompleter` 결과를 바로 지도에 표시하면 안 되나요?

completion은 입력 문자열 제안이지 완전한 장소 객체가 아닙니다. 선택한 completion으로 `MKLocalSearch.Request`를 만들고 `MKMapItem`을 얻은 뒤 좌표와 상세 정보를 사용해야 해요.

### Local Search와 geocoding의 차이는 무엇인가요?

Local Search는 자연어와 지역 힌트로 관련 장소 여러 개를 찾습니다. 지오코딩은 주소와 좌표를 서로 변환하는 작업이므로 입력 의도와 결과 개수가 달라요.

## 참고 자료

- [MKLocalSearch 공식 문서](https://developer.apple.com/documentation/mapkit/mklocalsearch)
- [MKLocalSearch.Request 공식 문서](https://developer.apple.com/documentation/mapkit/mklocalsearch/request)
- [MKLocalSearchCompleter 공식 문서](https://developer.apple.com/documentation/mapkit/mklocalsearchcompleter)
- [MKGeocodingRequest 공식 문서](https://developer.apple.com/documentation/mapkit/mkgeocodingrequest)
- [MKReverseGeocodingRequest 공식 문서](https://developer.apple.com/documentation/mapkit/mkreversegeocodingrequest)
- [MKLookAroundSceneRequest 공식 문서](https://developer.apple.com/documentation/mapkit/mklookaroundscenerequest)
- [Go further with MapKit](https://developer.apple.com/videos/play/wwdc2025/204/)
