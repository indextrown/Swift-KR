---
title: Swift로 이해하는 MVI
description: SwiftUI 상품 목록 예제로 Model·View·Intent의 단방향 데이터 흐름과 State·Reducer·Effect·Store 구현, 테스트와 적용 기준을 설명합니다.
---

# Swift로 이해하는 MVI

> **면접 답변 한 줄 요약:** MVI는 사용자와 시스템의 모든 입력을 Intent로 표현하고 이전 State에서 다음 State를 만드는 한 방향 경로를 거쳐 View가 상태를 렌더링하게 해서, 복잡한 화면 변화를 예측하고 테스트하기 쉽게 만드는 패턴이에요.

MVI(Model-View-Intent)는 화면 상태와 입력이 흐르는 경로를 명시적으로 제한하는 UI 아키텍처 패턴이에요. 로딩, 검색, 재시도, 페이지네이션처럼 동시에 고려할 상태가 많을 때 “누가 이 값을 바꿨는가”를 추적하기 쉽게 해요.

MVI 구현마다 사용하는 이름은 달라요. 이 문서에서는 Swift에서 이해하기 쉽도록 `State`, `Intent`, `Reducer`, `Effect`, `Store`라는 이름을 사용해요.

## 먼저 알아둘 설계 용어

| 용어               | 쉬운 뜻                                                                                                                              |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------ |
| Model              | MVI에서 View를 그리는 데 필요한 현재 상태와 상태를 바꾸는 규칙을 뜻해요. 도메인 데이터만 뜻하는 MVC의 Model보다 넓게 쓰일 수 있어요. |
| View               | 현재 State를 읽어 UI를 그리고 사용자 입력을 Intent로 보내는 역할이에요.                                                              |
| Intent             | 사용자가 무엇을 하려는지 또는 시스템에서 무엇이 일어났는지를 표현한 입력 값이에요.                                                   |
| State              | 특정 시점의 화면 전체를 표현하는 값이에요. 같은 State라면 같은 화면을 그릴 수 있어야 해요.                                           |
| 단방향 데이터 흐름 | 입력, 상태 변경, 화면 렌더링이 정해진 한 방향으로만 순환하는 구조예요.                                                               |
| Reducer            | 이전 State와 Intent를 받아 다음 State와 필요한 Effect를 계산하는 함수예요.                                                           |
| Effect             | 네트워크, 데이터베이스, 시각처럼 순수한 상태 계산 밖에서 실행해야 하는 작업이에요.                                                   |
| Store              | 현재 State를 보관하고 Intent를 Reducer에 전달하며 Effect 실행을 조정하는 객체예요.                                                   |
| 순수 함수          | 같은 입력에 항상 같은 결과를 내고 함수 바깥의 상태를 직접 바꾸지 않는 함수예요.                                                      |

이 문서에서는 다음 내용을 설명해요.

- Model, View, Intent의 의미와 단방향 데이터 흐름
- 여러 Bool 상태가 만들 수 있는 모순
- State, Intent, Reducer, Effect, Store를 순서대로 구현하는 방법
- SwiftUI와 Observation으로 Store를 관찰하는 방법
- Reducer와 비동기 Effect를 테스트하는 방법
- MVVM, Redux, TCA와 MVI의 관계 및 선택 기준

## MVI는 입력과 상태 변경 경로를 하나로 모아요

Cycle.js의 [Model-View-Intent 문서](https://cycle.js.org/model-view-intent.html)는 사용자의 입력을 Intent로 해석하고, Model이 이를 상태로 바꾸며, View가 Model을 렌더링하는 순환 구조를 설명해요.

현대적인 모바일 앱 구현에서는 다음처럼 표현하는 경우가 많아요.

```text
┌─────────────────────────────────────────────────────┐
│                                                     │
│  View ── Intent ──> Store·Reducer ──> State ──> View │
│                         │                           │
│                         └── Effect ──> 새 Intent ───┘
└─────────────────────────────────────────────────────┘
```

View는 State를 직접 수정하지 않고 Intent를 보내요. Reducer는 이전 State와 Intent를 보고 다음 State를 계산해요. 네트워크 응답도 다시 Intent가 되어 같은 경로로 들어와요.

## 서로 독립적인 상태는 모순을 만들 수 있어요

상품 목록 화면에 여러 프로퍼티를 따로 두어 볼게요.

```swift
@Observable
final class ProductListModel {
  var products: [Product] = []
  var isLoading = false
  var isEmpty = false
  var errorMessage: String?
}
```

각 값은 단순하지만 조합이 늘면 허용하면 안 되는 상태가 생겨요.

- `isLoading == true`인데 오류도 표시돼요.
- 상품이 있는데 `isEmpty == true`예요.
- 이전 요청의 응답이 새 요청의 상태를 덮어써요.
- View와 비동기 콜백이 같은 프로퍼티를 서로 다른 순서로 바꿔요.

MVI는 모든 문제를 자동으로 없애지는 않아요. 대신 현재 화면을 State 하나로 표현하고 변경 입구를 Intent로 제한해, 모순이 어디에서 만들어졌는지 찾기 쉽게 해요.

## State는 화면을 다시 그릴 수 있는 값이에요

상품 목록의 상태를 값 타입으로 정의해요.

```swift
struct Product: Identifiable, Equatable, Sendable {
  let id: Int
  let name: String
  let price: Int
}

struct ProductListState: Equatable {
  var products: [Product] = []
  var query = ""
  var isLoading = false
  var errorMessage: String?

  var visibleProducts: [Product] {
    guard !query.isEmpty else {
      return products
    }

    return products.filter { product in
      product.name.localizedCaseInsensitiveContains(query)
    }
  }
}
```

`ProductListState`만 있으면 상품 목록, 검색어, 로딩 표시, 오류 메시지를 다시 그릴 수 있어요. `struct`의 값 의미를 사용하면 상태 변경 전후의 스냅샷도 비교하기 쉬워요.

모든 UI 세부 값을 State에 넣을 필요는 없어요. 셀 그림자나 고정된 여백처럼 상태에 따라 달라지지 않는 표현은 View에 두세요.

## Intent는 일어난 일을 값으로 표현해요

View와 시스템에서 들어올 수 있는 입력을 열거형으로 정의해요.

```swift
enum ProductListIntent: Equatable {
  case appeared
  case queryChanged(String)
  case retryButtonTapped
  case productsLoaded([Product])
  case productsLoadingFailed(message: String)
}
```

Intent 이름은 구현 명령보다 **무슨 일이 일어났는가**를 드러내는 편이 좋아요.

- `appeared`는 화면이 나타났다는 이벤트예요.
- `queryChanged`는 검색어 입력이 바뀌었다는 이벤트예요.
- `productsLoaded`는 비동기 작업이 성공했다는 이벤트예요.

여기서 Intent는 Siri·단축어에 사용하는 Apple의 `AppIntent` 타입과 다른 설계 용어예요. 프로젝트에 혼동이 있다면 `Action`, `Event`, `Msg` 같은 이름을 사용해도 괜찮아요.

## Reducer는 다음 State를 계산해요

네트워크처럼 외부 작업이 필요하다는 사실은 Effect 값으로 표현해요.

```swift
enum ProductListEffect: Equatable {
  case loadProducts
}

struct ProductListTransition: Equatable {
  let state: ProductListState
  let effect: ProductListEffect?
}
```

Reducer는 이전 State를 복사해 다음 State를 만들어요.

```swift
func reduce(
  state: ProductListState,
  intent: ProductListIntent
) -> ProductListTransition {
  var nextState = state

  switch intent {
  case .appeared, .retryButtonTapped:
    guard !state.isLoading else {
      return ProductListTransition(state: state, effect: nil)
    }

    nextState.isLoading = true
    nextState.errorMessage = nil

    return ProductListTransition(
      state: nextState,
      effect: .loadProducts
    )

  case let .queryChanged(query):
    nextState.query = query

  case let .productsLoaded(products):
    nextState.products = products
    nextState.isLoading = false
    nextState.errorMessage = nil

  case let .productsLoadingFailed(message):
    nextState.isLoading = false
    nextState.errorMessage = message
  }

  return ProductListTransition(state: nextState, effect: nil)
}
```

이 함수는 네트워크를 호출하거나 전역 값을 읽지 않아요. 같은 State와 Intent에는 항상 같은 Transition을 반환하므로 상태 전이만 빠르게 테스트할 수 있어요.

Reducer가 `inout` State를 수정하는 구현도 가능해요. 중요한 점은 외부 상태를 몰래 바꾸지 않고 Intent를 통해 변경 이유가 드러나는 것이에요.

## Effect는 상태 계산 밖에서 실행해요

상품을 제공하는 저장소의 약속을 정의해요.

```swift
protocol ProductRepository: Sendable {
  func fetchProducts() async throws -> [Product]
}
```

Store는 현재 State를 보관하고 Reducer가 반환한 Effect를 실행해요.

```swift
import Foundation
import Observation

@MainActor
@Observable
final class ProductListStore {
  private(set) var state = ProductListState()

  private let repository: any ProductRepository
  @ObservationIgnored
  private var loadTask: Task<Void, Never>?

  init(repository: any ProductRepository) {
    self.repository = repository
  }

  func send(_ intent: ProductListIntent) {
    let transition = reduce(state: state, intent: intent)
    state = transition.state

    guard let effect = transition.effect else {
      return
    }

    run(effect)
  }

  private func run(_ effect: ProductListEffect) {
    switch effect {
    case .loadProducts:
      loadTask?.cancel()
      loadTask = Task { [weak self] in
        guard let self else { return }

        do {
          let products = try await repository.fetchProducts()
          guard !Task.isCancelled else { return }
          send(.productsLoaded(products))
        } catch {
          guard !Task.isCancelled else { return }
          send(
            .productsLoadingFailed(
              message: error.localizedDescription
            )
          )
        }
      }
    }
  }
}
```

네트워크 성공과 실패도 `productsLoaded`, `productsLoadingFailed` Intent로 돌아와요. 따라서 State를 바꾸는 최종 경로는 다시 Reducer 하나로 모여요.

실무에서는 Effect의 식별자와 취소 정책, 재시도, debounce, 우선순위를 더 정교하게 관리해야 할 수 있어요. 작은 화면에서는 위처럼 직접 구현하고, 기능이 커지면 검증된 아키텍처 라이브러리를 고려할 수 있어요.

## View는 State를 렌더링하고 Intent만 보내요

SwiftUI View는 Store의 State를 읽고 사용자 입력을 Intent로 바꿔요.

```swift
import SwiftUI

struct ProductListView: View {
  @State private var store: ProductListStore

  @MainActor
  init(store: ProductListStore) {
    _store = State(initialValue: store)
  }

  var body: some View {
    NavigationStack {
      Group {
        if store.state.isLoading && store.state.products.isEmpty {
          ProgressView("상품을 불러오는 중이에요")
        } else if let message = store.state.errorMessage {
          ContentUnavailableView {
            Label("불러오기 실패", systemImage: "exclamationmark.triangle")
          } description: {
            Text(message)
          } actions: {
            Button("다시 시도") {
              store.send(.retryButtonTapped)
            }
          }
        } else {
          List(store.state.visibleProducts) { product in
            VStack(alignment: .leading) {
              Text(product.name)
              Text(product.price, format: .currency(code: "KRW"))
            }
          }
        }
      }
      .navigationTitle("상품")
      .searchable(
        text: Binding(
          get: { store.state.query },
          set: { store.send(.queryChanged($0)) }
        )
      )
      .task {
        store.send(.appeared)
      }
    }
  }
}
```

검색창도 `state.query`를 직접 쓰지 않고 `queryChanged` Intent를 보내요. View는 같은 State가 들어오면 같은 UI를 만들고, 상태 변경 규칙은 알지 못해요.

## State와 일회성 동작을 구분해요

화면을 다시 만들 때 복원되어야 하는 정보는 State에 잘 맞아요.

- 현재 검색어
- 선택한 상품 ID
- 로딩과 오류 상태
- 표시 중인 상품 목록

한 번만 실행해야 하는 동작은 별도 Effect나 목적지 State로 모델링할 수 있어요.

- 토스트를 한 번 표시하기
- 외부 브라우저 열기
- 햅틱 실행하기
- 분석 이벤트 보내기

화면 전환은 두 방식 모두 가능해요. 선택된 목적지를 State로 두면 복원과 딥 링크에 유리하고, 외부 시스템 호출은 Effect로 두는 편이 자연스러워요. 일회성 이벤트를 State에 넣고 소비 후 즉시 `nil`로 만드는 방식은 화면 재생성 시 중복 처리되지 않는지 주의해야 해요.

## Reducer는 상태 전이 표처럼 테스트해요

Reducer는 저장소나 View 없이 입력과 출력만 검증할 수 있어요.

```swift
import Testing

@Test
func 화면이_나타나면_로딩을_시작해요() {
  let transition = reduce(
    state: ProductListState(),
    intent: .appeared
  )

  #expect(transition.state.isLoading)
  #expect(transition.state.errorMessage == nil)
  #expect(transition.effect == .loadProducts)
}

@Test
func 상품을_받으면_로딩을_끝내요() {
  let products = [
    Product(id: 1, name: "Swift 책", price: 30_000)
  ]
  var state = ProductListState()
  state.isLoading = true

  let transition = reduce(
    state: state,
    intent: .productsLoaded(products)
  )

  #expect(transition.state.products == products)
  #expect(!transition.state.isLoading)
  #expect(transition.effect == nil)
}
```

복잡한 화면은 다음처럼 전이 표를 먼저 만들면 빠진 상태를 찾기 쉬워요.

| 이전 State | Intent                  | 다음 State | Effect    |
| ---------- | ----------------------- | ---------- | --------- |
| 대기       | `appeared`              | 로딩       | 상품 요청 |
| 로딩       | `productsLoaded`        | 상품 표시  | 없음      |
| 로딩       | `productsLoadingFailed` | 오류       | 없음      |
| 오류       | `retryButtonTapped`     | 로딩       | 상품 요청 |

Effect 테스트에서는 Stub Repository를 주입하고 최종 Intent와 State를 확인할 수 있어요. Reducer 테스트와 비동기 통합 테스트를 분리하면 실패 원인을 찾기 쉬워져요.

## MVI, Redux, TCA는 같은 이름의 패턴이 아니에요

MVI는 단방향 흐름을 강조하는 패턴이고, Redux와 The Composable Architecture(TCA)는 비슷한 원리를 구체적인 도구와 규칙으로 제공해요.

| 개념  | 핵심 구성                                         | MVI와의 관계                                                                   |
| ----- | ------------------------------------------------- | ------------------------------------------------------------------------------ |
| MVI   | Model, View, Intent                               | Intent가 Model을 바꾸고 View가 Model을 렌더링하는 패턴이에요.                  |
| Redux | Store, State, Action, Reducer                     | 읽기 전용 State와 Action, 순수 Reducer를 사용하는 단방향 상태 관리 방식이에요. |
| TCA   | State, Action, Reducer, Store, Effect, Dependency | Swift 기능의 합성, 효과, 의존성, 테스트를 함께 제공하는 라이브러리예요.        |

Redux 공식 문서는 Action을 발생한 사건, Reducer를 이전 State와 Action으로 다음 State를 계산하는 함수로 설명하고 한 방향 데이터 흐름을 사용해요. TCA 공식 저장소도 State, Action, Reducer, Store를 핵심 도구로 설명해요.

공통점이 많지만 TCA를 단순히 “MVI 라이브러리”라고 단정할 필요는 없어요. 실제 코드의 상태 변경 경로와 도구가 제공하는 규칙을 설명하는 편이 더 정확해요.

## MVVM과 MVI의 경계는 구현에 따라 겹쳐요

| 기준        | MVVM                                | MVI                                         |
| ----------- | ----------------------------------- | ------------------------------------------- |
| 화면 상태   | 여러 관찰 프로퍼티 또는 하나의 상태 | 보통 화면 전체를 표현하는 State 하나        |
| 사용자 입력 | ViewModel 메서드, Command, Binding  | Intent 또는 Action 값                       |
| 상태 변경   | ViewModel 내부의 여러 메서드        | Reducer 같은 한 경로로 제한                 |
| 비동기 작업 | ViewModel이 직접 조정할 수 있음     | Effect로 분리하고 결과를 다시 Intent로 보냄 |
| 테스트      | ViewModel의 입력 후 상태 확인       | State와 Intent의 전이, Effect를 분리해 확인 |
| 비용        | 관찰과 ViewModel 타입               | State·Intent·Reducer·Effect·Store 타입      |

[MVVM](./mvvm.md)도 State와 Action, 단방향 흐름을 적용할 수 있어요. 반대로 MVI Store가 화면별 표현 상태를 제공한다는 점에서는 ViewModel처럼 보일 수 있어요. 팀이 같은 용어로 책임과 흐름을 이해하는지가 패턴 이름보다 중요해요.

## 언제 사용해야 하나요

MVI가 잘 맞는 경우는 다음과 같아요.

- 로딩, 오류, 빈 화면, 재시도, 페이지네이션 상태 조합이 복잡해요.
- 여러 비동기 이벤트가 같은 화면 상태를 바꿔요.
- 상태 변경 원인을 Action 로그나 전이 테스트로 추적하고 싶어요.
- 기능을 값 타입 State와 순수 Reducer로 합성하고 싶어요.
- 동일한 이벤트를 재생해 문제 상황을 재현할 필요가 있어요.

다음 경우에는 더 단순한 MVC나 MVVM으로 충분할 수 있어요.

- 상태가 적고 사용자 입력이 단순한 화면이에요.
- Intent와 Effect 타입이 실제 문제보다 더 많은 코드를 만들어요.
- 팀이 Effect 취소, 상태 소유권, Reducer 합성 규칙을 합의하지 않았어요.
- 일회성 이벤트를 모두 State로 넣어 오히려 수명주기가 불분명해졌어요.

MVI의 목적은 열거형과 `switch`를 늘리는 것이 아니에요. 복잡한 상태 변경의 경로를 제한해 예측 가능성을 얻는 것이 목적이에요.

## 적용 순서를 정리해요

1. 화면을 다시 그리는 데 필요한 값을 하나의 State로 적으세요.
2. 사용자 입력과 시스템 이벤트를 Intent로 나열하세요.
3. 각 Intent에 대한 이전 State와 다음 State를 전이 표로 만드세요.
4. 순수한 상태 계산을 Reducer로 분리하세요.
5. 네트워크, 저장소, 시각 같은 작업을 Effect로 분리하세요.
6. Effect 결과를 새 Intent로 보내 같은 변경 경로에 합치세요.
7. View는 State 렌더링과 Intent 전달만 담당하게 하세요.
8. Reducer 전이와 Effect 취소·실패 경로를 각각 테스트하세요.

## 면접에서 이어질 수 있는 질문

### MVI의 Intent는 무엇인가요

사용자가 하려는 행동이나 시스템에서 발생한 사건을 값으로 표현한 입력이에요. View가 State를 직접 바꾸지 않고 Intent를 보내게 해서 상태 변경 이유와 경로를 드러내요.

### MVI에서 Model은 도메인 Model과 같은가요

항상 같지는 않아요. MVI의 Model은 View가 렌더링할 현재 상태와 그 상태 변화까지 넓게 가리킬 수 있어요. 실무 구현에서는 혼동을 줄이기 위해 `State`라는 이름을 자주 사용해요.

### Reducer 안에서 네트워크를 호출하면 안 되나요

순수 Reducer로 설계하려면 네트워크 같은 Effect를 직접 실행하지 않는 편이 좋아요. Reducer는 필요한 Effect를 값으로 반환하고 Store가 실행한 뒤 결과를 새 Intent로 보내면 상태 계산을 빠르고 결정적으로 테스트할 수 있어요.

### MVI의 단점은 무엇인가요

작은 기능에도 State, Intent, Reducer, Effect 타입이 늘어날 수 있어요. 비동기 취소와 일회성 이벤트 규칙도 별도로 설계해야 하므로 단순한 화면에서는 비용이 장점보다 클 수 있어요.

### MVI와 MVVM의 가장 큰 차이는 무엇인가요

일반적인 MVI는 모든 입력을 Intent로 만들고 상태 변경을 Reducer 같은 한 경로로 제한한다는 점을 더 강하게 강조해요. MVVM은 View와 표현 로직의 분리가 핵심이며 상태 변경 방식은 구현에 따라 단방향 또는 양방향이 될 수 있어요.

## 참고 자료

- [Cycle.js — Model-View-Intent](https://cycle.js.org/model-view-intent.html)
- [Hannes Dorfmann — Reactive Apps with Model-View-Intent](https://hannesdorfmann.com/android/mosby3-mvi-2/)
- [Redux — Concepts and Data Flow](https://redux.js.org/tutorials/fundamentals/part-2-concepts-data-flow)
- [Point-Free — The Composable Architecture](https://github.com/pointfreeco/swift-composable-architecture)
- [Apple — Managing model data in your app](https://developer.apple.com/documentation/SwiftUI/Managing-model-data-in-your-app)
