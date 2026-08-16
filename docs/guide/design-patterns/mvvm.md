---
title: Swift로 이해하는 MVVM
description: SwiftUI와 Observation 상품 목록 예제로 Model·View·ViewModel의 책임, 상태 관찰, 입력 처리, 테스트와 비대화 방지 기준을 설명합니다.
---

# Swift로 이해하는 MVVM

> **면접 답변 한 줄 요약:** MVVM은 화면에 필요한 상태와 표현 로직을 ViewModel에 두고 View가 이를 관찰하거나 바인딩하게 해서, UI 코드와 상태 변경 로직을 분리하고 View 없이도 동작을 테스트할 수 있게 하는 패턴이에요.

MVVM(Model-View-ViewModel)은 UI와 화면에 필요한 상태·동작을 분리하는 아키텍처 패턴이에요. SwiftUI가 상태를 읽고 자동으로 화면을 다시 만드는 방식과 잘 어울리지만, `@Observable`이나 `ObservableObject`를 사용한다고 자동으로 MVVM이 되는 것은 아니에요.

이 문서에서는 상품 목록 화면을 SwiftUI와 Observation으로 만들며 ViewModel의 역할과 경계를 살펴봐요.

## 먼저 알아둘 설계 용어

| 용어             | 쉬운 뜻                                                                                                      |
| ---------------- | ------------------------------------------------------------------------------------------------------------ |
| Model            | 화면과 독립적인 데이터, 도메인 규칙, 저장소를 포함하는 영역이에요.                                           |
| View             | 상태를 읽어 화면을 그리고 사용자 입력을 전달하는 UI예요. SwiftUI의 `View`가 한 예예요.                       |
| ViewModel        | View가 바로 표시할 상태와 사용자 입력을 처리하는 동작을 제공하는 객체예요. 구체적인 View 타입은 몰라야 해요. |
| 표현 로직        | 가격 문자열, 로딩 여부, 버튼 활성화처럼 Model을 화면에 맞는 형태로 바꾸는 규칙이에요.                        |
| 관찰             | 값이 바뀌었을 때 이를 사용하는 View가 갱신될 수 있도록 변경을 추적하는 방식이에요.                           |
| 바인딩           | View의 입력 값과 상태를 연결해 한쪽의 변경을 다른 쪽에 전달하는 연결이에요.                                  |
| Observation      | `@Observable` 모델의 프로퍼티 접근과 변경을 추적하는 Apple 프레임워크예요.                                   |
| 단일 진실 공급원 | 같은 상태를 여러 곳에 따로 저장하지 않고 한 위치를 기준으로 삼는 원칙이에요.                                 |

이 문서에서는 다음 내용을 설명해요.

- Model, View, ViewModel의 책임과 의존 방향
- View에 비동기 처리와 상태를 모두 둘 때 생기는 문제
- `@Observable` ViewModel과 SwiftUI View를 연결하는 방법
- 입력, 출력, 오류, 로딩 상태를 설계하는 기준
- ViewModel 테스트와 의존성 주입
- MVC, MVI와 비교해 MVVM을 선택하는 기준

## View는 ViewModel을 알고 ViewModel은 View를 몰라요

Microsoft의 [MVVM 설명](https://learn.microsoft.com/en-us/dotnet/architecture/maui/mvvm)은 View가 ViewModel을 알고, ViewModel이 Model을 알지만, Model과 ViewModel은 자신을 사용하는 View를 모르는 관계로 설명해요.

```text
사용자 입력
    │
    ▼
  View ─────> ViewModel ─────> Model
    ▲             │
    └──── 상태 관찰·바인딩 ────┘
```

ViewModel은 특정 `Text`, `List`, `UILabel`을 직접 조작하지 않아요. 대신 View가 표시할 값과 실행할 동작을 제공해요. 같은 ViewModel 상태를 SwiftUI View와 UIKit View가 서로 다른 방식으로 표현할 수도 있어요.

## Model은 화면과 독립적인 데이터를 표현해요

상품과 저장소를 먼저 정의해요.

```swift
struct Product: Identifiable, Equatable, Sendable {
  let id: Int
  let name: String
  let price: Int
}

protocol ProductRepository: Sendable {
  func fetchProducts() async throws -> [Product]
}
```

이 Model은 상품을 어떤 색상의 셀로 보여줄지, 로딩 표시를 어디에 배치할지 몰라요. 상품 데이터와 이를 제공하는 동작만 표현해요.

## 상태와 비동기 처리를 View에 모으면 테스트 경계가 흐려져요

작은 SwiftUI 화면은 다음처럼 View 안에서 바로 구현할 수 있어요.

```swift
import SwiftUI

struct ProductListView: View {
  let repository: any ProductRepository

  @State private var products: [Product] = []
  @State private var isLoading = false
  @State private var errorMessage: String?
  @State private var query = ""

  var body: some View {
    List(products.filter { product in
      query.isEmpty || product.name.localizedCaseInsensitiveContains(query)
    }) { product in
      Text(product.name)
    }
    .task {
      isLoading = true

      do {
        products = try await repository.fetchProducts()
      } catch {
        errorMessage = error.localizedDescription
      }

      isLoading = false
    }
  }
}
```

기능이 작다면 이 코드도 충분할 수 있어요. 하지만 로딩, 재시도, 검색, 정렬, 페이지네이션이 추가되면 View가 다음 책임을 모두 갖게 돼요.

- 화면 선언
- 비동기 작업 순서
- 로딩과 오류 상태 전환
- 상품 검색 규칙
- 저장소 호출

상태 전환을 테스트하려면 View를 만들고 SwiftUI 생명주기를 실행해야 해요. 같은 표현 로직을 다른 View에서 재사용하기도 어려워져요.

## ViewModel에 화면 상태를 모아요

iOS 17 이상에서는 `@Observable` 매크로로 ViewModel의 변경을 SwiftUI가 관찰하게 만들 수 있어요.

```swift
import Foundation
import Observation

@MainActor
@Observable
final class ProductListViewModel {
  enum ViewState: Equatable {
    case idle
    case loading
    case loaded([Product])
    case failed(message: String)
  }

  private(set) var state: ViewState = .idle
  var query = ""

  private let repository: any ProductRepository

  init(repository: any ProductRepository) {
    self.repository = repository
  }

  var visibleProducts: [Product] {
    guard case let .loaded(products) = state else {
      return []
    }

    guard !query.isEmpty else {
      return products
    }

    return products.filter { product in
      product.name.localizedCaseInsensitiveContains(query)
    }
  }

  func load() async {
    state = .loading

    do {
      let products = try await repository.fetchProducts()
      state = .loaded(products)
    } catch {
      state = .failed(message: error.localizedDescription)
    }
  }
}
```

ViewModel은 화면에서 필요한 네 상태를 명시적으로 표현해요. `visibleProducts`는 원본 상품을 검색어에 맞춰 View가 바로 사용할 값으로 바꾸는 표현 로직이에요.

`@MainActor`는 UI가 관찰하는 상태 변경을 메인 액터에 격리해요. 저장소의 비동기 작업이 끝난 뒤에도 `state` 변경이 같은 격리 영역에서 일어나도록 해요.

## View는 상태를 읽고 입력을 전달해요

View는 ViewModel의 상태를 어떤 UI로 표현할지 결정해요.

```swift
import SwiftUI

struct ProductListView: View {
  @State private var viewModel: ProductListViewModel

  @MainActor
  init(viewModel: ProductListViewModel) {
    _viewModel = State(initialValue: viewModel)
  }

  var body: some View {
    @Bindable var viewModel = viewModel

    NavigationStack {
      Group {
        switch viewModel.state {
        case .idle, .loading:
          ProgressView("상품을 불러오는 중이에요")

        case .loaded:
          List(viewModel.visibleProducts) { product in
            VStack(alignment: .leading) {
              Text(product.name)
              Text(product.price, format: .currency(code: "KRW"))
            }
          }

        case let .failed(message):
          ContentUnavailableView {
            Label("불러오기 실패", systemImage: "exclamationmark.triangle")
          } description: {
            Text(message)
          } actions: {
            Button("다시 시도") {
              Task { await viewModel.load() }
            }
          }
        }
      }
      .navigationTitle("상품")
      .searchable(text: $viewModel.query)
      .task {
        guard case .idle = viewModel.state else { return }
        await viewModel.load()
      }
    }
  }
}
```

Apple의 [Managing model data in your app](https://developer.apple.com/documentation/SwiftUI/Managing-model-data-in-your-app) 문서는 `@Observable` 모델의 프로퍼티를 View의 `body`가 읽으면 SwiftUI가 그 의존성을 추적하고, 관련 값이 바뀔 때 View를 갱신한다고 설명해요.

`@Bindable`은 `query`를 검색창과 연결하기 위해 사용해요. 관찰은 상태 변경을 알아차리는 기능이고, 바인딩은 View가 값을 다시 쓸 수 있는 연결이라는 차이가 있어요.

## ViewModel은 View의 모양을 직접 결정하지 않아요

ViewModel에는 화면이 필요한 정보가 들어가지만 구체 UI 객체는 넣지 않는 편이 좋아요.

```swift
// 피하는 편이 좋은 예
final class ProductListViewModel {
  var titleLabel: UILabel?
  var errorAlert: UIAlertController?
}
```

이렇게 작성하면 ViewModel을 UIKit 없이 테스트하기 어렵고 다른 UI에서 재사용할 수도 없어요. 대신 다음처럼 UI와 무관한 값으로 표현하세요.

```swift
enum ViewState: Equatable {
  case loading
  case loaded([Product])
  case failed(message: String)
}
```

오류를 경고창으로 보여줄지, 화면 전체 메시지로 보여줄지는 View가 결정해요. ViewModel은 사용자에게 전달할 오류 상태와 문구를 제공해요.

## 입력 메서드는 사용자의 의도를 드러내게 이름 지어요

View가 ViewModel의 프로퍼티를 아무 곳에서나 바꾸게 하면 상태 변경 경로를 찾기 어려워질 수 있어요. 의미 있는 작업은 메서드로 표현할 수 있어요.

```swift
@MainActor
extension ProductListViewModel {
  func retryButtonTapped() async {
    await load()
  }

  func searchQueryChanged(_ query: String) {
    self.query = query
  }
}
```

단순한 텍스트 입력은 바인딩이 간단하고, 로드·저장·삭제처럼 규칙과 부수 효과가 있는 작업은 메서드가 의도를 더 잘 드러내요. 모든 프로퍼티를 기계적으로 `input`과 `output` 타입으로 감싸야 하는 것은 아니에요.

## 테스트에서는 View 없이 상태 전환을 확인해요

저장소를 외부에서 주입하면 ViewModel 테스트에서 준비된 결과를 사용할 수 있어요.

```swift
private struct StubProductRepository: ProductRepository {
  let products: [Product]

  func fetchProducts() async throws -> [Product] {
    products
  }
}
```

Swift Testing으로 로드 결과와 검색 표현을 검증해요.

```swift
import Testing

@Test
@MainActor
func 상품을_불러오고_검색어로_필터링해요() async {
  let products = [
    Product(id: 1, name: "Swift 책", price: 30_000),
    Product(id: 2, name: "키보드", price: 100_000)
  ]
  let viewModel = ProductListViewModel(
    repository: StubProductRepository(products: products)
  )

  await viewModel.load()
  viewModel.query = "Swift"

  #expect(viewModel.state == .loaded(products))
  #expect(viewModel.visibleProducts == [products[0]])
}
```

View를 띄우지 않아도 저장소 응답이 어떤 상태로 바뀌는지 확인할 수 있어요. View의 레이아웃과 접근성은 별도의 View 또는 UI 테스트에서 검증해요.

## `@Observable`은 MVVM 자체가 아니에요

`@Observable`, `ObservableObject`, `@Published`는 상태 변경을 전달하는 도구예요. 다음 코드는 관찰 가능하지만 역할이 분리됐다고 보기는 어려워요.

```swift
@Observable
final class AppData {
  var products: [Product] = []
  var selectedTab = 0
  var loginToken = ""
  var cartCount = 0
}
```

앱 전체의 관련 없는 상태가 하나의 객체에 모이면 변경 이유와 생명주기가 다시 섞여요. MVVM의 핵심은 프로퍼티 래퍼가 아니라 **화면 표현 책임을 ViewModel이라는 경계에 모으고 View와 Model을 분리하는 것**이에요.

iOS 16 이하를 지원한다면 `ObservableObject`와 `@Published`, `@StateObject`를 사용할 수 있어요. 관찰 기술이 달라져도 ViewModel의 책임은 같아요.

## ViewModel도 지나치게 커질 수 있어요

View Controller의 코드를 전부 ViewModel로 옮기면 **Massive ViewModel**이 돼요.

다음 코드는 별도 역할로 나눌 수 있어요.

- 서버·데이터베이스 접근은 Repository
- 할인·주문 가능 여부는 도메인 Model
- 날짜·가격 문자열 규칙이 복잡하면 Formatter
- 여러 화면의 전환과 생명주기는 Coordinator 또는 Router
- 여러 기능에서 공유하는 작업 흐름은 Use Case나 Service

ViewModel은 해당 View가 표시할 상태와 입력을 조정하는 데 집중해야 해요. 화면과 무관한 업무 규칙까지 모두 소유하지 않도록 경계를 확인하세요.

## MVC, MVVM, MVI의 차이를 비교해요

| 기준          | MVC                                 | MVVM                                     | MVI                                   |
| ------------- | ----------------------------------- | ---------------------------------------- | ------------------------------------- |
| 중간 역할     | Controller가 View와 Model을 조정    | ViewModel이 표현 상태와 입력 동작을 제공 | Store·Reducer가 Intent를 State로 변환 |
| View 갱신     | Controller가 명령하거나 관찰을 연결 | View가 ViewModel 상태를 관찰·바인딩      | View가 하나의 State를 렌더링          |
| 상태 변경 API | Controller 메서드마다 다름          | ViewModel 메서드와 쓰기 가능한 상태      | Intent 전송으로 제한                  |
| 테스트 초점   | Model과 Controller 조정             | ViewModel의 입력과 출력 상태             | State 전이와 Effect                   |
| 주의할 점     | Massive View Controller             | Massive ViewModel, 숨은 양방향 변경      | 타입과 보일러플레이트 증가            |

[MVC](./mvc.md)는 UIKit의 View Controller 중심 흐름에 자연스럽고, [MVI](./mvi.md)는 가능한 모든 상태와 입력 경로를 명시해 복잡한 상태 전이를 추적하는 데 유리해요.

MVVM에서도 상태를 값 타입 하나로 모으고 Action을 사용하면 단방향 흐름을 만들 수 있어요. 패턴 경계는 구현 방식에 따라 겹칠 수 있으므로 이름보다 실제 의존 방향과 상태 변경 경로를 확인하세요.

## 언제 사용해야 하나요

MVVM이 잘 맞는 경우는 다음과 같아요.

- View에 비동기 처리와 표현 로직이 쌓이고 있어요.
- 같은 상태를 SwiftUI가 관찰해 자동으로 갱신해야 해요.
- View 없이 로딩, 오류, 입력 검증을 단위 테스트하고 싶어요.
- Model의 데이터를 화면에 맞게 조합하거나 변환할 필요가 있어요.
- UIKit과 SwiftUI가 같은 표현 상태를 공유해야 해요.

다음 경우에는 더 단순한 구조를 고려하세요.

- 상태가 거의 없는 정적 화면이에요.
- ViewModel이 View의 프로퍼티를 그대로 복사하기만 해요.
- 도메인 규칙까지 ViewModel에 몰아넣어 또 다른 거대한 타입을 만들고 있어요.
- 상태 전이가 매우 복잡해 누가 언제 값을 바꿨는지 추적하기 어려워요. 이 경우 MVI 같은 명시적인 단방향 흐름이 도움이 될 수 있어요.

## 적용 순서를 정리해요

1. View에 있는 상태와 비동기 작업을 목록으로 적으세요.
2. 화면과 무관한 데이터와 업무 규칙은 Model에 남기세요.
3. View가 표시할 상태와 표현 로직을 ViewModel로 옮기세요.
4. 저장소와 외부 환경은 ViewModel 이니셜라이저로 주입하세요.
5. View는 상태를 읽어 그리는 코드와 입력 전달에 집중하세요.
6. ViewModel 상태 전환을 View 없이 테스트하세요.
7. ViewModel이 커지면 Repository, Use Case, Formatter, Coordinator처럼 실제 책임에 따라 나누세요.

## 면접에서 이어질 수 있는 질문

### MVVM에서 ViewModel의 역할은 무엇인가요

Model을 View가 표시하기 쉬운 상태로 바꾸고 사용자 입력에 따른 작업을 조정해요. 구체적인 View 타입을 직접 조작하지 않아야 View 없이 테스트하고 다른 UI에서도 재사용할 수 있어요.

### SwiftUI에서 `@Observable`을 사용하면 MVVM인가요

아니에요. `@Observable`은 상태 관찰을 제공하는 기술일 뿐이에요. View, 표현 상태, 도메인 Model의 책임과 의존 방향을 분리했는지가 MVVM 판단의 핵심이에요.

### ViewModel에 비즈니스 로직을 넣어도 되나요

화면 상태를 만들기 위한 표현 로직은 ViewModel에 둘 수 있어요. 할인이나 주문 가능 여부처럼 화면과 무관한 도메인 규칙은 Model이나 별도 Use Case에 두어 여러 화면에서 재사용하는 편이 좋아요.

### MVVM의 단점은 무엇인가요

ViewModel과 관찰 상태가 늘어나고, 양방향 바인딩이 많으면 값이 바뀐 경로를 추적하기 어려워질 수 있어요. 작은 화면에 기계적으로 적용하면 타입과 연결 코드만 늘어날 수도 있어요.

## 참고 자료

- [Microsoft Learn — Model-View-ViewModel](https://learn.microsoft.com/en-us/dotnet/architecture/maui/mvvm)
- [Apple — Managing model data in your app](https://developer.apple.com/documentation/SwiftUI/Managing-model-data-in-your-app)
- [Apple — Migrating from the ObservableObject protocol to the Observable macro](https://developer.apple.com/documentation/swiftui/migrating-from-the-observable-object-protocol-to-the-observable-macro)
- [The Swift Programming Language — Properties](https://docs.swift.org/swift-book/documentation/the-swift-programming-language/properties/)
