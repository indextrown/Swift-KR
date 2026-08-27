---
title: Swift로 이해하는 VIPER (SwiftUI)
description: SwiftUI 상품 목록으로 VIPER를 구현하며 Observation 기반 Presenter, State와 Bindable의 역할, NavigationStack 라우팅, 비동기 작업 수명과 독립적인 테스트를 설명합니다.
---

# Swift로 이해하는 VIPER (SwiftUI)

> **면접 답변 한 줄 요약:** SwiftUI의 VIPER는 업무 규칙을 Interactor, 화면 상태를 Presenter, 이동 경로를 Router로 분리하고 View가 그 상태를 관찰하게 해서, 화면 없이도 사용 사례와 표현·이동 요청을 테스트하는 설계예요.

이 문서는 **SwiftUI 버전**이에요. UIKit을 감싸는 방식이 아니라 SwiftUI의 상태 관찰과 `NavigationStack`으로 상품 목록부터 상세 화면 이동까지 연결해요. [VIPER (UIKit)](./viper.md)은 View 프로토콜 호출, 뷰 컨트롤러의 작업 관리, UIKit 화면 전환을 별도로 설명해요.

UIKit 문서를 먼저 구현하지 않아도 이 페이지의 코드만으로 예제를 구성할 수 있어요. 두 문서는 같은 상품 도메인과 타입 이름을 사용하지만 **각각 별도의 예제 타깃**을 전제로 해요. 두 버전의 동명 Presenter나 View를 하나의 타깃에 중복해서 붙여 넣지 않아요.

예제는 **iOS 17 이상, Swift 6 언어 모드, 기본 액터 격리 `nonisolated`**를 기준으로 해요. 네트워크·파일 입출력은 데모 저장소로 대체하고, 외부 VIPER 라이브러리는 사용하지 않아요.

## 먼저 알아둘 설계·SwiftUI 용어

| 용어                   | 쉬운 뜻                                                                                                                                            |
| ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| SwiftUI와 View         | SwiftUI는 상태로 UI를 선언하는 Apple 프레임워크예요. `View`는 화면을 설명하는 값이며, 이 예제에서는 `struct`로 만들어요.                           |
| 사용 사례와 Interactor | 사용 사례는 사용자가 달성할 기능이에요. Interactor는 “판매 가능한 상품을 조회한다” 같은 사용 사례의 업무 규칙을 실행해요.                          |
| Presenter              | 결과를 화면용 값으로 바꾸고 로딩·성공·실패 상태와 사용자 입력을 처리하는 객체예요.                                                                 |
| Observation            | 객체의 프로퍼티 접근과 변경을 추적하는 Swift 기능이에요. `@Observable` 매크로가 관찰에 필요한 코드를 생성해요.                                     |
| `@State`               | View의 값이 다시 만들어져도 같은 화면 정체성에 연결된 저장소를 유지하도록 SwiftUI에 맡기는 표시예요.                                               |
| Binding과 `@Bindable`  | Binding은 값을 읽고 쓰는 연결이에요. `@Bindable`은 관찰 가능한 객체의 프로퍼티에 그런 연결을 만들어요. 객체의 수명 관리와는 다른 역할이에요.       |
| Router와 경로          | Router는 이동할 목적지를 경로 상태로 관리해요. 이 예제의 경로는 상세 화면 목적지를 순서대로 담은 배열이에요.                                       |
| 저장소와 모듈 조립     | 저장소는 데이터 공급 계약이에요. 모듈 조립은 기능에 필요한 객체를 만들고 연결하는 단계예요. 여기서 모듈은 별도 패키지가 아니라 기능 묶음을 뜻해요. |

이 문서에서는 다음 내용을 설명해요.

- SwiftUI에서 VIPER의 다섯 역할을 나누는 기준
- View에 섞인 업무 규칙·표현·이동을 분리하는 과정
- 관찰 가능한 Presenter와 경로 기반 Router
- 모듈의 수명, 초기 조회, 재시도와 새로고침
- 화면과 서버 없이 실행하는 테스트
- UIKit·MVVM과의 차이와 과도한 분리를 피하는 기준

## VIPER의 책임은 유지하고 화면 연결은 SwiftUI에 맞춰요

VIPER는 **View, Interactor, Presenter, Entity, Routing**의 약자예요. [objc.io 원전](https://www.objc.io/issues/13-architecture/viper/)의 역할 분리를 따르되, 화면 상태를 전달하는 구체적인 방법은 SwiftUI에 맞춰 바꿔요.

| 역할       | 이 문서의 타입          | 책임                                                           |
| ---------- | ----------------------- | -------------------------------------------------------------- |
| View       | `ProductListScreen`     | 상태를 읽어 목록을 그리고 사용자 입력을 전달해요.              |
| Interactor | `ProductListInteractor` | 공개되어 있고 재고가 있는 상품만 반환해요.                     |
| Presenter  | `ProductListPresenter`  | 가격 표시, 로딩·빈 결과·실패 상태, 상품 선택을 처리해요.       |
| Entity     | `Product`               | 화면과 독립적인 상품 데이터예요.                               |
| Routing    | `ProductListRouter`     | 목적지 값을 경로에 추가하고 SwiftUI가 그 경로로 이동하게 해요. |

SwiftUI의 `View`는 값 타입이므로 UIKit 예제의 `weak var view`나 클래스 전용 `ProductListViewing: AnyObject`를 그대로 적용하지 않아요. Presenter가 View를 호출하는 대신 **View가 Presenter의 상태를 읽도록** 구성해요.

이 구현은 Apple이 규정한 “공식 SwiftUI VIPER”가 아니라, VIPER의 경계를 SwiftUI의 공식 데이터 흐름 API로 구성한 학습용 변형이에요. 상태를 관찰한다는 사실만으로 VIPER가 완성되는 것은 아니에요.

## View에 조회·판매 규칙·화면 이동이 모이면 테스트가 어려워져요

먼저 두 버전에서 사용하는 상품과 저장소 계약을 정의해요. `Identifiable`은 목록 항목의 식별자를, `Equatable`은 값 비교를 제공해요. `Sendable`은 동시성 경계를 넘어 안전하게 전달할 수 있다는 계약이며, 여기서는 불변 값 타입을 사용해요.

```swift
// ProductDomain.swift
struct Product: Identifiable, Equatable, Sendable {
  let id: Int
  let name: String
  let price: Int
  let stock: Int
  let isPublished: Bool
}

protocol ProductRepository: Sendable {
  func fetchProducts() async throws -> [Product]
}
```

`async`는 함수가 기다리는 동안 실행을 잠시 멈출 수 있음을, `await`는 그 지점을 나타내요. `@MainActor`는 UI 관련 접근을 메인 액터라는 격리 영역으로 모아요. `async` 자체가 백그라운드 스레드 실행을 의미하지는 않아요.

분리 전에는 다음처럼 한 View에서 조회, 판매 조건 검사, 문자열 생성, 이동을 모두 처리할 수 있어요.

```swift
// 분리 전 예제: 완성 앱에는 추가하지 않아요.
import SwiftUI

@MainActor
struct UnsplitProductListScreen: View {
  let repository: any ProductRepository
  @State private var products: [Product] = []
  @State private var path: [Int] = []
  @State private var errorMessage: String?

  var body: some View {
    NavigationStack(path: $path) {
      List {
        ForEach(products) { product in
          Button("\(product.name): \(product.price)원") {
            path.append(product.id)
          }
        }
        if let errorMessage {
          Text(errorMessage)
        }
      }
      .navigationDestination(for: Int.self) { id in
        Text("상품 \(id)")
      }
      .task {
        do {
          let loaded = try await repository.fetchProducts()
          products = loaded.filter { $0.isPublished && $0.stock > 0 }
        } catch {
          errorMessage = "상품을 불러오지 못했어요."
        }
      }
    }
  }
}
```

작은 화면에서는 이런 코드도 출발점이 될 수 있어요. 하지만 판매 조건을 검사하려면 View 안의 조회 코드를 따라가야 하고, 가격 표시와 선택에 따른 이동도 같은 위치에 있어요. 로딩·재시도·늦은 응답 처리까지 추가하면 View의 변경 이유가 더 많아져요.

위 예제는 문제를 보여주기 위해 로딩과 취소 처리를 생략했어요. 이제 업무 규칙부터 옮기고, 화면의 입력·출력과 이동을 차례로 분리해요.

## Interactor는 화면과 관계없는 판매 규칙을 실행해요

원본 상품을 직접 화면으로 넘기는 대신, 사용 사례의 결과를 별도 값으로 정의해요.

```swift
// ProductListInteractor.swift
import Foundation

struct AvailableProduct: Equatable, Sendable {
  let id: Int
  let name: String
  let price: Int
}

protocol ProductListInteracting: Sendable {
  func fetchAvailableProducts() async throws -> [AvailableProduct]
}

struct ProductListInteractor: ProductListInteracting {
  let repository: any ProductRepository

  func fetchAvailableProducts() async throws -> [AvailableProduct] {
    let products = try await repository.fetchProducts()
    try Task.checkCancellation()

    return products
      .filter { $0.isPublished && $0.stock > 0 }
      .map { AvailableProduct(id: $0.id, name: $0.name, price: $0.price) }
  }
}
```

Interactor는 SwiftUI, 셀, 내비게이션 경로를 몰라요. `ProductRepository`에 필요한 데이터를 요청하고 “공개되어 있으며 재고가 있다”는 규칙만 적용해요. 네트워크나 데이터베이스의 구체적인 구현은 저장소 뒤에 둬요.

`any ProductRepository`는 같은 계약을 만족하는 데모·실서비스·테스트 저장소를 바꿔 넣기 위한 선택이에요. 이처럼 협력 객체를 외부에서 전달하는 방식을 **의존성 주입**이라고 해요.

`Product`는 업무 데이터, `AvailableProduct`는 사용 사례 결과, 뒤에서 만들 `ProductRow`는 화면용 데이터예요. 재고 검사는 Interactor에 남고 가격 문자열 생성은 Presenter로 이동해요. 금액은 원화 정수로 단순화했으며, 목록 조회가 실제 주문 시점의 재고·결제 검증을 대신하지는 않아요.

## Presenter는 관찰 가능한 화면 상태를 제공해요

화면 상태를 먼저 정해요. `idle`은 아직 조회하지 않은 상태이고, 나머지는 로딩·빈 결과·성공·실패를 표현해요. 선택 입력은 행 번호가 아니라 상품 ID로 전달해요.

```swift
// ProductListInterfaces.swift
struct ProductRow: Identifiable, Equatable {
  let id: Int
  let title: String
  let priceText: String
}

enum ProductListViewState: Equatable {
  case idle
  case loading
  case empty
  case content([ProductRow])
  case failed(message: String)
}

@MainActor
protocol ProductListRouting: AnyObject {
  func showProductDetail(id: Int)
}
```

Presenter는 `@Observable` 객체예요. View가 읽는 `state`만 관찰하고, 내부 요청 번호와 선택 가능한 ID 집합은 `@ObservationIgnored`로 관찰에서 제외해요.

```swift
// ProductListPresenter.swift
import Foundation
import Observation

@MainActor
@Observable
final class ProductListPresenter {
  private(set) var state: ProductListViewState = .idle

  private let interactor: any ProductListInteracting
  private let router: any ProductListRouting
  @ObservationIgnored private var requestID = 0
  @ObservationIgnored private var selectableIDs: Set<Int> = []

  init(
    interactor: any ProductListInteracting,
    router: any ProductListRouting
  ) {
    self.interactor = interactor
    self.router = router
  }

  func load() async {
    guard !Task.isCancelled else { return }

    requestID += 1
    let currentRequestID = requestID
    selectableIDs = []
    state = .loading

    do {
      let products = try await interactor.fetchAvailableProducts()
      try Task.checkCancellation()
      guard currentRequestID == requestID else { return }

      selectableIDs = Set(products.map(\.id))
      let rows = products.map { product in
        ProductRow(
          id: product.id,
          title: product.name,
          priceText: product.price.formatted(
            .number.locale(Locale(identifier: "ko_KR"))
          ) + "원"
        )
      }
      state = rows.isEmpty ? .empty : .content(rows)
    } catch is CancellationError {
      // 화면 이탈이나 재요청에 따른 취소를 실패로 표시하지 않아요.
    } catch {
      guard !Task.isCancelled, currentRequestID == requestID else { return }
      state = .failed(message: "상품을 불러오지 못했어요. 다시 시도해 주세요.")
    }
  }

  func didSelectProduct(id: Int) {
    guard selectableIDs.contains(id) else { return }
    router.showProductDetail(id: id)
  }
}
```

Apple의 [모델 데이터 관리 문서](https://developer.apple.com/documentation/swiftui/managing-model-data-in-your-app)와 [WWDC23 Observation 세션](https://developer.apple.com/videos/play/wwdc2023/10149/)은 View가 관찰 가능한 프로퍼티를 읽으면 그 접근을 추적하고 변경 시 관련 UI를 갱신하는 방식을 설명해요.

따라서 Presenter가 View를 저장하거나 `render()`를 호출할 필요가 없어요. `state`는 외부에서 읽을 수 있지만 직접 바꿀 수 없도록 `private(set)`으로 제한해요. View가 업무 상태를 임의로 덮어쓰지 않고 `load()`, `didSelectProduct(id:)` 같은 입력을 보내게 해요.

이 예제에서는 View가 구체적인 관찰 가능 Presenter 타입을 사용해요. UIKit의 View 프로토콜 개수를 맞추기 위해 인터페이스를 추가하지는 않았어요. 대신 부수 동작을 일으키는 Interactor와 Router를 프로토콜로 받아 테스트에서 교체해요.

### 메인 액터 격리와 요청 순서는 별도로 관리해요

`@MainActor`는 UI 상태 접근을 격리하지만, `load()` 전체가 중간에 끊기지 않고 끝난다는 뜻은 아니에요. 첫 조회가 `await`에서 기다리는 사이 두 번째 조회가 시작될 수 있어요. 그래서 결과를 반영할 때 `requestID`를 확인해 이전 응답을 버려요.

`Task.checkCancellation()`은 취소 상태에서 `CancellationError`를 던져요. 취소된 작업이 결과를 반환하더라도 화면에 성공·실패 상태를 반영하지 않아요. 이 예제의 취소는 화면 이탈 또는 새 조회에 따른 것이므로 취소 메시지는 표시하지 않아요. 별도 “취소” 버튼을 추가한다면 취소 후 어떤 상태로 돌아갈지도 설계해야 해요.

기본 격리가 `MainActor`인 프로젝트에서는 업무·데이터 타입의 격리 설정도 확인해요. `Sendable`이나 `async`를 붙이는 것만으로 무거운 계산이 UI 실행 영역에서 자동으로 분리되지는 않아요.

## Router는 ViewController 대신 목적지 값을 관리해요

`NavigationStack`은 경로에 들어 있는 값으로 추가 화면을 표현할 수 있어요. 여기서는 목적지 종류가 하나라서 `NavigationPath`로 타입을 지우지 않고 `[ProductRoute]` 배열을 사용해요. `Hashable`은 경로 값의 동일성 비교와 해시 계산을 제공해요.

```swift
// ProductListRouter.swift
import Observation

enum ProductRoute: Hashable {
  case detail(productID: Int)
}

@MainActor
@Observable
final class ProductListRouter: ProductListRouting {
  var path: [ProductRoute] = []

  func showProductDetail(id: Int) {
    path.append(.detail(productID: id))
  }
}
```

Presenter는 이동할 상품 ID를 Router에 전달하고, Router는 상세 목적지를 경로에 추가해요. 실제 화면 전환과 뒤로 가기 UI는 SwiftUI가 처리해요. [NavigationStack 공식 문서](https://developer.apple.com/documentation/swiftui/navigationstack)는 앱이 경로를 바꿔 이동할 수 있고, 사용자가 뒤로 가면 스택이 바인딩된 경로도 갱신한다고 설명해요.

그래서 `path`는 읽기 전용이 아니에요. 시스템의 뒤로 가기 결과가 같은 경로 저장소에 반영되어야 해요. Presenter의 업무 상태를 읽기 전용으로 노출하는 것과, 내비게이션 경로를 양방향 연결하는 것은 목적이 달라요.

이 구현의 R은 UIKit 전환 메서드를 호출하는 객체가 아니라 **목적지 상태를 관리하는 역할**이에요. 목적지 값과 실제 SwiftUI 화면의 연결은 뒤의 `navigationDestination`에서 선언해요.

## Builder가 연결한 모듈을 State에 보관해요

**Builder**는 기능에 필요한 객체를 만들고 연결하는 조립 코드예요. 이 예제에서는 별도 클래스 대신 `ProductListModule.make(repository:)` 함수로 표현해요.

```swift
// ProductListModule.swift
@MainActor
struct ProductListModule {
  let presenter: ProductListPresenter
  let router: ProductListRouter

  static func make(repository: any ProductRepository) -> ProductListModule {
    let router = ProductListRouter()
    let interactor = ProductListInteractor(repository: repository)
    let presenter = ProductListPresenter(interactor: interactor, router: router)
    return ProductListModule(presenter: presenter, router: router)
  }
}
```

Presenter가 이동을 요청하는 Router와 View가 경로를 읽는 Router가 **같은 인스턴스**여야 해요. View에서 다른 Router를 새로 만들면 버튼 입력은 처리되는데 화면은 이동하지 않는 문제가 생길 수 있어요. 둘을 하나의 모듈 값으로 묶어 조립 결과를 함께 보관해요.

이 모듈 값은 뒤의 View가 `@State`에 저장해요. 모듈 자체에 `@Observable`을 붙이지 않아도, 안에 있는 Presenter의 `state`와 Router의 `path`를 읽는 UI는 각각 그 관찰 가능한 객체에 의존하게 돼요.

## SwiftUI 화면은 상태를 읽고 입력을 전달해요

아래는 목록 화면 전체 코드예요. 로딩·빈 결과·오류에서도 `List` 자체는 유지하고, 그 안의 내용만 바꿔요. 조회 작업도 이 안정적인 목록 위치에 연결해요.

```swift
// ProductListScreen.swift
import SwiftUI

@MainActor
struct ProductListScreen: View {
  @State private var module: ProductListModule
  @State private var reloadID = 0

  init(repository: any ProductRepository) {
    _module = State(initialValue: ProductListModule.make(repository: repository))
  }

  var body: some View {
    @Bindable var router = module.router

    NavigationStack(path: $router.path) {
      List {
        switch module.presenter.state {
        case .idle, .loading:
          ProgressView("불러오는 중…")
        case .empty:
          Text("판매 가능한 상품이 없어요.")
        case let .content(rows):
          ForEach(rows) { row in
            Button {
              module.presenter.didSelectProduct(id: row.id)
            } label: {
              HStack {
                Text(row.title)
                Spacer()
                Text(row.priceText)
                  .foregroundStyle(.secondary)
              }
            }
            .foregroundStyle(.primary)
          }
        case let .failed(message):
          VStack(alignment: .leading, spacing: 8) {
            Text(message)
            Button("다시 시도") {
              reloadID += 1
            }
          }
        }
      }
      .navigationTitle("상품 목록")
      .toolbar {
        Button("새로고침") {
          reloadID += 1
        }
      }
      .navigationDestination(for: ProductRoute.self) { route in
        switch route {
        case let .detail(productID):
          ProductDetailScreen(productID: productID)
        }
      }
      .task(id: reloadID) { [presenter = module.presenter] in
        await presenter.load()
      }
      .refreshable { [presenter = module.presenter] in
        await presenter.load()
      }
    }
  }
}

struct ProductDetailScreen: View {
  let productID: Int

  var body: some View {
    // 실제 상세 조회·결제 기능은 이 예제의 범위에서 제외해요.
    Text("선택한 상품 ID: \(productID)")
      .navigationTitle("상품 상세")
  }
}
```

`body`는 화면 상태를 읽기만 하고 판매 조건이나 가격 형식을 계산하지 않아요. 상품 버튼도 직접 경로를 바꾸지 않고 Presenter로 선택을 전달해요. 반면 상세 화면에 어떤 View를 연결할지는 UI 구성 책임이므로 `navigationDestination`에서 선언해요. 상세 기능이 커지면 이 위치에서 상세 모듈의 조립 함수를 호출할 수 있어요.

`@State`는 같은 View 정체성에 연결된 모듈 저장소를 유지해요. **View 초기화 함수가 한 번만 실행된다는 뜻은 아니에요.** `State(initialValue:)`에 전달할 후보 모듈은 View 초기화가 반복될 때 다시 생성될 수 있어요. 그래서 `make`와 각 객체의 초기화는 가벼운 연결만 수행하고, 조회는 `.task`에서 시작해요. [State 공식 문서](https://developer.apple.com/documentation/swiftui/state)도 초기값 생성에 비싼 작업이나 부수 효과를 넣지 않도록 설명해요.

같은 View 정체성에서 생성자에 다른 저장소를 넘긴다고 기존 State의 모듈이 자동 교체되지는 않아요. 로그인 계정 변경처럼 기능 전체를 다시 만들어야 하는 상황에서는 상위 화면에서 정체성을 바꾸거나 명시적인 모듈 교체 정책을 정해야 해요.

### State와 Bindable을 바꿔 생각하지 않아요

`@Bindable var router = module.router`는 새 Router를 만들지 않아요. 기존 Router의 `path`에 접근하는 바인딩을 만들어 `NavigationStack`에 전달해요. [Bindable 공식 문서](https://developer.apple.com/documentation/swiftui/bindable)는 `body` 안의 지역 변수에도 이 방법을 사용할 수 있다고 설명해요.

| 필요한 동작         | 이 예제의 선택                           | 하지 않는 일                                         |
| ------------------- | ---------------------------------------- | ---------------------------------------------------- |
| 모듈·객체 수명 유지 | `@State private var module`              | View 초기화 횟수를 한 번으로 고정하지 않아요.        |
| 화면 상태 변경 감지 | Presenter의 `@Observable`과 `state` 읽기 | 관찰을 위해 읽기 전용 상태에 바인딩을 만들지 않아요. |
| 경로 읽기·쓰기      | `@Bindable`로 만든 `$router.path`        | 별도 Router나 두 번째 경로 저장소를 만들지 않아요.   |

UIKit 버전의 Presenter는 View를 약하게 참조하지만, 이 버전은 아예 View를 저장하지 않아요. 모듈은 Presenter와 Router를 보관하고, Presenter는 Router와 Interactor를 보관해요. Router가 다시 View나 Presenter를 보관하지 않으므로 이 구성에는 서로를 강하게 붙잡는 참조 고리가 없어요.

### 초기 조회·재시도·새로고침의 진입점을 구분해요

이 예제에서는 아래 순서로 작업이 시작돼요.

1. 목록이 나타나면 `.task(id: reloadID)`가 `load()`를 실행해요.
2. 실패 화면의 “다시 시도” 또는 상단 “새로고침”을 누르면 `reloadID`가 바뀌어요.
3. `.task(id:)`는 이전 작업을 취소하고 새 ID의 작업을 실행해요.
4. 아래로 당겨 새로고침하면 `.refreshable`의 비동기 클로저가 `load()`를 기다려요.

[task(id:) 공식 문서](<https://developer.apple.com/documentation/swiftui/view/task(id:name:priority:file:line:_:)>)는 ID 변경 시 취소·재시작과 View 수명에 연동된 작업을 설명해요. View가 사라지는 정확한 순간에 작업이 강제로 종료된다고 가정하지는 않아요. Swift의 취소는 협력적이므로 의존성도 취소에 반응해야 하고, Presenter는 결과를 반영하기 전에 취소 여부를 확인해요.

[refreshable 공식 문서](<https://developer.apple.com/documentation/swiftui/view/refreshable(action:)>)에서 새로고침 표시는 비동기 작업이 진행되는 동안 유지돼요. 따라서 이 클로저 안에서 별도 `Task { ... }`를 만들어 즉시 반환하지 않고 직접 `await`해요.

두 진입점의 작업은 별개예요. 예를 들어 `reloadID` 변경이 이미 진행 중인 `.refreshable` 작업까지 자동으로 취소하지는 않아요. 이 예제에서는 Presenter의 요청 번호로 **가장 나중에 시작한 조회만 화면에 반영**해요. 자원 낭비를 막기 위해 모든 중복 네트워크 요청까지 취소해야 한다면 작업을 한곳에서 관리하는 추가 정책이 필요해요.

로딩 때 기존 목록을 비우는 것은 예제의 선택이에요. 새로고침 중에도 기존 목록을 유지하거나 상세 화면에서 돌아올 때 캐시를 표시해야 한다면, 상태와 재조회 정책을 그 요구에 맞게 확장해요.

## 데모 저장소와 앱 진입점을 연결해요

아래 데모는 공개된 상품 중 재고가 있는 “노트”만 목록에 표시해요.

```swift
// DemoProductRepository.swift
struct DemoProductRepository: ProductRepository {
  func fetchProducts() async throws -> [Product] {
    [
      Product(id: 1, name: "노트", price: 12000, stock: 3, isPublished: true),
      Product(id: 2, name: "펜", price: 3000, stock: 0, isPublished: true),
      Product(id: 3, name: "비공개 상품", price: 5000, stock: 2, isPublished: false)
    ]
  }
}
```

새 SwiftUI 앱 타깃에서는 다음 진입점을 사용해요. 기존 프로젝트에 붙이는 경우 이미 있는 `@main`을 또 추가하지 않고, 기존 앱의 `WindowGroup`에서 `ProductListScreen`을 표시해요.

```swift
// VIPERExampleApp.swift
import SwiftUI

@main
@MainActor
struct VIPERExampleApp: App {
  var body: some Scene {
    WindowGroup {
      ProductListScreen(repository: DemoProductRepository())
    }
  }
}
```

지금까지 파일명을 붙인 완성 예제 블록들을 같은 앱 타깃에 추가하면 돼요. “분리 전 예제”는 제외해요. 첫 화면에는 “노트 / 12,000원”이 나타나고, 누르면 상품 ID 1의 상세 화면으로 이동해요. 시스템 뒤로 가기는 Router의 경로를 갱신해 목록으로 돌아와요.

실제 네트워크·영속 저장소·인증과 상세 상품 조회는 생략했어요. 테스트에서 실패나 지연된 응답을 주입해 화면 상태와 이동 요청을 별도로 확인해요.

## ViewSpy 없이 상태와 이동 요청을 테스트해요

**단위 테스트**는 작은 코드 단위의 동작을 검사해요. 정해진 결과를 반환하는 대역은 Stub, 받은 호출을 기록하는 대역은 Spy라고 불러요.

아래는 [Swift Testing](https://developer.apple.com/xcode/swift-testing/) 예제예요. `@Test`가 테스트를 선언하고 `#expect`가 조건을 검사해요. 테스트 타깃의 `VIPERExample`은 실제 앱 또는 예제 모듈 이름으로 바꿔요.

UIKit 버전에서는 ViewSpy가 받은 `render` 호출을 검사했지만, 여기서는 Presenter의 `state`를 직접 읽어요. 각 테스트가 별도의 객체를 만들어 상태를 공유하지 않아요.

```swift
// ProductListTests.swift
import Testing
@testable import VIPERExample

private struct RepositoryStub: ProductRepository {
  let products: [Product]

  func fetchProducts() async throws -> [Product] {
    products
  }
}

private enum TestFailure: Error {
  case offline
}

private struct InteractorStub: ProductListInteracting {
  let result: Result<[AvailableProduct], TestFailure>

  func fetchAvailableProducts() async throws -> [AvailableProduct] {
    try result.get()
  }
}

@MainActor
private final class RouterSpy: ProductListRouting {
  var selectedIDs: [Int] = []

  func showProductDetail(id: Int) {
    selectedIDs.append(id)
  }
}

@MainActor
private func makePresenter(interactor: any ProductListInteracting) -> (
  presenter: ProductListPresenter,
  router: RouterSpy
) {
  let router = RouterSpy()
  let presenter = ProductListPresenter(interactor: interactor, router: router)
  return (presenter, router)
}

@Test
func interactorExcludesUnpublishedAndOutOfStockProducts() async throws {
  let repository = RepositoryStub(products: [
    Product(id: 1, name: "노트", price: 12000, stock: 3, isPublished: true),
    Product(id: 2, name: "펜", price: 3000, stock: 0, isPublished: true),
    Product(id: 3, name: "비공개", price: 5000, stock: 2, isPublished: false)
  ])

  let result = try await ProductListInteractor(repository: repository)
    .fetchAvailableProducts()

  #expect(result == [AvailableProduct(id: 1, name: "노트", price: 12000)])
}

@Test @MainActor
func presenterFormatsContent() async {
  let sut = makePresenter(interactor: InteractorStub(result: .success([
    AvailableProduct(id: 1, name: "노트", price: 12000)
  ])))
  #expect(sut.presenter.state == .idle)

  await sut.presenter.load()

  #expect(sut.presenter.state == .content([
    ProductRow(id: 1, title: "노트", priceText: "12,000원")
  ]))
}

@Test @MainActor
func presenterShowsEmptyState() async {
  let sut = makePresenter(interactor: InteractorStub(result: .success([])))
  await sut.presenter.load()
  #expect(sut.presenter.state == .empty)
}

@Test @MainActor
func presenterShowsFailureState() async {
  let sut = makePresenter(interactor: InteractorStub(result: .failure(.offline)))
  await sut.presenter.load()
  #expect(sut.presenter.state == .failed(
    message: "상품을 불러오지 못했어요. 다시 시도해 주세요."
  ))
}

@Test @MainActor
func presenterRoutesOnlyLoadedProducts() async {
  let sut = makePresenter(interactor: InteractorStub(result: .success([
    AvailableProduct(id: 1, name: "노트", price: 12000)
  ])))
  sut.presenter.didSelectProduct(id: 1)
  #expect(sut.router.selectedIDs.isEmpty)

  await sut.presenter.load()
  sut.presenter.didSelectProduct(id: 1)
  sut.presenter.didSelectProduct(id: 999)

  #expect(sut.router.selectedIDs == [1])
}

@Test @MainActor
func moduleUsesSameRouterForSelectionAndPath() async {
  let module = ProductListModule.make(repository: RepositoryStub(products: [
    Product(id: 1, name: "노트", price: 12000, stock: 3, isPublished: true)
  ]))

  await module.presenter.load()
  module.presenter.didSelectProduct(id: 1)
  #expect(module.router.path == [.detail(productID: 1)])

  // 시스템의 뒤로 가기가 바인딩된 경로를 줄이는 상태 변화를 재현해요.
  module.router.path.removeLast()
  #expect(module.router.path.isEmpty)
}
```

`sut`는 System Under Test, 즉 검사 대상을 뜻하는 변수 이름이에요. 마지막 테스트는 실제 조립 함수를 사용해 Presenter의 이동 요청과 View가 읽을 경로가 같은 Router에 연결되는지 확인해요.

이 테스트가 실제 뒤로 가기 제스처나 화면 애니메이션까지 검사하는 것은 아니에요. 경로 배열의 동작과 실제 SwiftUI 전환은 검증 범위가 달라요.

### 재시도·늦은 응답·취소를 제어해요

**actor**는 자신의 가변 상태를 격리하는 Swift 타입이에요. **continuation**은 기다리는 비동기 함수를 나중에 재개할 수 있는 값이에요. 다음 대역은 조회를 대기시켜 두고 테스트가 정한 순서에 따라 성공·실패를 돌려줘요.

아래 코드를 앞과 **같은 테스트 파일**에 이어서 추가해요. 임의로 몇 초 기다리지 않고 요청이 접수된 시점을 확인하며, 테스트 자체에는 1분의 실행 제한을 둬요.

```swift
// ProductListTests.swift에 이어서 추가
private actor ControlledInteractor: ProductListInteracting {
  private var requestCount = 0
  private var pending: [Int: CheckedContinuation<[AvailableProduct], any Error>] = [:]
  private var waiters: [(count: Int, continuation: CheckedContinuation<Void, Never>)] = []

  func fetchAvailableProducts() async throws -> [AvailableProduct] {
    requestCount += 1
    let id = requestCount

    return try await withCheckedThrowingContinuation { continuation in
      pending[id] = continuation
      let ready = waiters.filter { $0.count <= requestCount }
      waiters.removeAll { $0.count <= requestCount }
      for waiter in ready {
        waiter.continuation.resume()
      }
    }
  }

  func waitForRequests(_ count: Int) async {
    guard requestCount < count else { return }
    await withCheckedContinuation { continuation in
      waiters.append((count, continuation))
    }
  }

  func complete(
    _ id: Int,
    with result: Result<[AvailableProduct], TestFailure>
  ) {
    pending.removeValue(forKey: id)?.resume(with: result)
  }
}

@Test(.timeLimit(.minutes(1))) @MainActor
func presenterCanRetryAfterFailure() async {
  let interactor = ControlledInteractor()
  let sut = makePresenter(interactor: interactor)

  let first = Task { await sut.presenter.load() }
  await interactor.waitForRequests(1)
  #expect(sut.presenter.state == .loading)
  await interactor.complete(1, with: .failure(.offline))
  await first.value
  #expect(sut.presenter.state == .failed(
    message: "상품을 불러오지 못했어요. 다시 시도해 주세요."
  ))

  let retry = Task { await sut.presenter.load() }
  await interactor.waitForRequests(2)
  #expect(sut.presenter.state == .loading)
  await interactor.complete(2, with: .success([]))
  await retry.value
  #expect(sut.presenter.state == .empty)
}

@Test(.timeLimit(.minutes(1))) @MainActor
func presenterIgnoresOlderResponse() async {
  let interactor = ControlledInteractor()
  let sut = makePresenter(interactor: interactor)

  let first = Task { await sut.presenter.load() }
  await interactor.waitForRequests(1)
  let second = Task { await sut.presenter.load() }
  await interactor.waitForRequests(2)

  await interactor.complete(2, with: .success([
    AvailableProduct(id: 2, name: "최신 상품", price: 2000)
  ]))
  await second.value
  await interactor.complete(1, with: .success([
    AvailableProduct(id: 1, name: "이전 상품", price: 1000)
  ]))
  await first.value

  #expect(sut.presenter.state == .content([
    ProductRow(id: 2, title: "최신 상품", priceText: "2,000원")
  ]))
  sut.presenter.didSelectProduct(id: 1)
  sut.presenter.didSelectProduct(id: 2)
  #expect(sut.router.selectedIDs == [2])
}

@Test(.timeLimit(.minutes(1))) @MainActor
func presenterDoesNotRenderCancelledResult() async {
  let interactor = ControlledInteractor()
  let sut = makePresenter(interactor: interactor)

  let request = Task { await sut.presenter.load() }
  await interactor.waitForRequests(1)
  request.cancel()
  await interactor.complete(1, with: .success([
    AvailableProduct(id: 1, name: "노트", price: 12000)
  ]))
  await request.value

  #expect(sut.presenter.state == .loading)
  sut.presenter.didSelectProduct(id: 1)
  #expect(sut.router.selectedIDs.isEmpty)
}
```

재시도 테스트는 실패 뒤에 다시 로딩과 성공 상태로 갈 수 있는지 확인해요. 응답 순서 테스트는 오래된 상품이 화면과 선택 가능 ID를 덮어쓰지 못하는지 확인해요. 취소 테스트는 의존성이 취소를 즉시 반영하지 않고 결과를 반환해도 Presenter가 그 결과를 버리는지 검사해요.

이 대역은 테스트용이에요. 보관한 continuation은 반드시 한 번씩 재개해야 하고, 실제 네트워크 클라이언트에서는 요청 취소와 자원 정리도 별도로 구현해야 해요. 테스트의 시간 제한 역시 작업을 강제로 종료하는 구현을 대신하지는 않아요.

## UIKit·MVVM과 비교하면 설계의 기준이 보여요

| 비교 기준             | UIKit VIPER                          | 이 SwiftUI VIPER                       |
| --------------------- | ------------------------------------ | -------------------------------------- |
| View의 출력 연결      | View 프로토콜의 `render` 호출        | 관찰 가능한 `state` 읽기               |
| Presenter의 View 참조 | 약한 참조                            | 참조하지 않음                          |
| 기능 객체의 소유자    | ViewController                       | View 정체성에 연결된 `@State` 저장소   |
| 화면 전환             | Router의 UIKit 메서드 호출           | Router의 경로 변경과 `NavigationStack` |
| 비동기 작업 진입점    | ViewController의 Task 생성·보관·취소 | View의 `.task(id:)`, `.refreshable`    |
| Presenter 테스트      | ViewSpy에 전달된 상태 확인           | Presenter의 상태와 Router 호출 확인    |

두 구현은 판매 규칙과 데이터 공급 계약을 UI에서 분리한다는 점이 같아요. 실제 앱에서 두 UI를 함께 지원한다면 `Product`, 저장소 계약, Interactor와 결과 타입은 공유할 수 있어요. 다만 이 문서들은 독립 학습을 위해 같은 타입을 각각 제시했어요.

[MVVM](./mvvm.md)은 Model·View·ViewModel의 관계를 통해 화면 상태와 동작을 분리하는 패턴이에요. 이 SwiftUI Presenter도 관찰 가능한 상태를 제공하므로 ViewModel과 모양이 비슷할 수 있어요. 차이를 `@Observable` 사용 여부로 구분하지 않고, **업무 규칙을 Interactor에 두고 이동 경로를 Router로 분리했는지**로 설명하는 편이 정확해요.

MVVM에서도 사용 사례와 Router를 분리할 수 있으므로, 이름만으로 두 구조가 완전히 배타적이라고 보지는 않아요. 이 문서는 VIPER의 다섯 책임을 학습하기 위해 역할을 명시한 예제예요.

### 프로토콜이 있으면 자동으로 좋은 경계가 되나요

그렇지는 않아요. 이 예제의 Interactor는 `ProductRepository` 계약만 알며 구체적인 서버 클라이언트나 화면을 몰라요. 중요한 것은 계약이 어떤 세부 사항을 숨기는지예요.

별도 패키지로 나눈다면 업무 쪽이 데이터 구현이나 UI 패키지를 통째로 가져오지 않도록 계약의 위치도 정해야 해요. 여기서는 같은 타깃 안에서 책임을 나눈 것이지 패키지 의존성을 컴파일러로 차단한 것은 아니에요. [의존성·DI·DIP](./dependency-injection.md) 문서에서 더 자세히 다뤄요.

## 언제 사용하고 언제 단순하게 유지하나요

업무 규칙, 화면 상태, 화면 이동이 서로 다른 이유로 자주 바뀌고 각각의 테스트가 필요할 때 검토해요. 같은 사용 사례를 여러 화면에서 재사용하거나 기능별 조립 규칙을 팀이 공유해야 하는 경우에도 도움이 될 수 있어요.

반면 간단한 조회 화면에서 Interactor가 의미 없는 전달만 하고 Router에 이동 하나만 있다면, 별도 타입이 읽기 비용을 더할 수 있어요. 이미 명확한 MVVM 구조가 있다면 VIPER라는 이름에 맞추기 위해 계층을 늘릴 필요는 없어요.

관찰 대상 상태가 있다고 모든 화면 상태를 전역 객체로 옮기지도 않아요. `reloadID`처럼 이 View의 작업 재시작에만 필요한 값은 View에 둘 수 있어요. 업무 규칙과 공유해야 하는 상태인지, UI의 일시적인 동작 값인지 구분해요.

이 구조가 화면 성능이나 네트워크 속도를 자동으로 개선하는 것도 아니에요. 목적은 변경과 테스트 경계를 정하는 데 있어요. 추가 타입과 조립, 상태 관리 비용이 그 이득보다 크지 않은지 확인해요.

## 적용 순서와 확인 항목

1. **사용 사례를 정해요.** 화면과 무관한 판매 조건과 데이터 공급 계약부터 분리해요.
2. **화면 상태를 정의해요.** 초기·로딩·빈 결과·성공·실패와 재시도 정책을 정해요.
3. **Presenter를 테스트해요.** View 없이 상태와 이동 요청을 검사해요.
4. **Router와 모듈을 조립해요.** Presenter와 NavigationStack이 같은 경로 객체를 사용하는지 확인해요.
5. **View 수명과 작업을 연결해요.** `@State`, `.task(id:)`, `.refreshable` 각각의 역할을 확인해요.
6. **실제 화면에서 검증해요.** 재시도·새로고침·빠른 연속 입력·상세 이동·뒤로 가기와 화면 재등장을 확인해요.

단위 테스트 통과가 SwiftUI의 View 정체성, 접근성, 애니메이션까지 검증했다는 뜻은 아니에요. 화면 테스트와 함께 확인하고, UIKit 구현이 필요한 경우에는 [VIPER (UIKit)](./viper.md)의 별도 예제를 사용해요.

## 면접에서 이어질 수 있는 질문

### SwiftUI VIPER에서 Presenter는 View를 알아야 하나요

이 구현에서는 알 필요가 없어요. Presenter는 관찰 가능한 상태를 제공하고 View가 그것을 읽어요. UIKit 방식의 View 프로토콜과 약한 참조를 그대로 옮기지 않아도 책임을 분리할 수 있어요.

### State와 Bindable의 역할은 어떻게 다른가요

`@State`는 같은 View 정체성에 연결된 저장소를 유지하고, `@Bindable`은 관찰 가능한 객체의 프로퍼티에 바인딩을 만들어요. 이 예제는 State로 모듈을 유지하고 Bindable로 Router의 경로를 연결해요. Bindable을 사용한다고 객체의 최초 생성과 수명까지 관리되는 것은 아니에요.

### Router에 UIKit 코드가 없는데도 Router인가요

이 예제에서는 화면 전환을 위한 목적지 상태를 관리하는 역할이에요. Router가 경로를 바꾸면 NavigationStack이 그 상태에 따라 실제 전환을 수행해요. UIKit의 push 호출을 그대로 사용하는 대신 SwiftUI의 경로 기반 전환에 맞춘 구현이에요.

### MainActor가 있는데 왜 요청 번호를 확인하나요

메인 액터 격리와 비동기 응답 순서는 다른 문제이기 때문이에요. 조회가 await에서 대기하는 동안 다음 조회가 시작될 수 있어요. 요청 번호는 먼저 시작했지만 늦게 끝난 응답이 최신 상태를 덮어쓰지 못하게 해요.

### Observable Presenter를 쓰면 MVVM과 같은 것 아닌가요

관찰 가능한 상태를 제공한다는 점만 보면 비슷해요. 이 예제에서는 사용 사례·표현·이동을 각각 Interactor·Presenter·Router로 구분한 책임 배치를 함께 봐야 해요. MVVM도 같은 분리를 적용할 수 있으므로 타입 이름만으로 우열이나 절대적인 경계를 정하지 않아요.

## 참고 자료

- [objc.io — Architecting iOS Apps with VIPER](https://www.objc.io/issues/13-architecture/viper/)
- [Apple Developer — Managing model data in your app](https://developer.apple.com/documentation/swiftui/managing-model-data-in-your-app)
- [WWDC23 — Discover Observation in SwiftUI](https://developer.apple.com/videos/play/wwdc2023/10149/)
- [Apple Developer — State](https://developer.apple.com/documentation/swiftui/state)
- [Apple Developer — Bindable](https://developer.apple.com/documentation/swiftui/bindable)
- [Apple Developer — NavigationStack](https://developer.apple.com/documentation/swiftui/navigationstack)
- [Apple Developer — task(id:name:priority:file:line:_:)](<https://developer.apple.com/documentation/swiftui/view/task(id:name:priority:file:line:_:)>)
- [Apple Developer — refreshable(action:)](<https://developer.apple.com/documentation/swiftui/view/refreshable(action:)>)
- [Apple Developer — Task.checkCancellation()](<https://developer.apple.com/documentation/swift/task/checkcancellation()>)
- [Apple Developer — Swift Testing](https://developer.apple.com/xcode/swift-testing/)
- [관련 문서 — Swift로 이해하는 VIPER (UIKit)](./viper.md)
- [관련 문서 — SwiftUI Observation](../swiftui/state-management/observation.md)
