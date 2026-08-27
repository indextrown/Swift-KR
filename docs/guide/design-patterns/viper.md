---
title: Swift로 이해하는 VIPER (UIKit)
description: UIKit 상품 목록 예제로 VIPER의 역할 분리, View 프로토콜과 Presenter, Router·모듈 조립, 화면 생명주기와 비동기 작업 취소 및 테스트를 설명합니다.
---

# Swift로 이해하는 VIPER (UIKit)

> **면접 답변 한 줄 요약:** VIPER는 화면 표시, 사용 사례 처리, 화면용 데이터 변환, 업무 데이터, 화면 전환을 다섯 역할로 나누어 UI 없이도 핵심 동작을 테스트하고 변경 범위를 좁히는 아키텍처 패턴이에요.

상품 목록 화면에 데이터 조회, 판매 조건 검사, 가격 표시, 오류 처리, 상세 화면 이동이 계속 추가되면 어디를 수정해야 할지 찾기 어려워져요. VIPER는 이 책임들을 분리하는 한 가지 방법이에요. 이름에 맞춰 파일 다섯 개를 만드는 것이 목적은 아니에요.

이 문서는 **UIKit 버전**이에요. VIPER의 원전과 실제 Swift 구현을 구분해서 읽고, `UITableViewController`로 상품 목록을 만드는 예제를 끝까지 연결해요. 예제 코드는 특정 VIPER 라이브러리에 의존하지 않으며, 완성 UI 예제는 iOS 17 이상을 대상으로 해요.

SwiftUI의 상태 관찰과 `NavigationStack`을 사용하는 전체 예제는 [VIPER (SwiftUI)](./viper-swiftui.md)에서 별도로 다뤄요. 두 문서는 각각 독립된 예제이므로, 같은 이름의 타입을 하나의 타깃에 중복해서 추가하지 않아요. 기존 VIPER 주소는 이 UIKit 문서로 유지해요.

## 먼저 알아둘 설계 용어

| 용어                   | 쉬운 뜻                                                                                                                       |
| ---------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| 아키텍처 패턴          | 코드의 책임과 협력 관계를 정하는 반복 가능한 설계 방식이에요. 특정 라이브러리나 폴더 구조와 같지는 않아요.                    |
| UI와 UIKit             | UI(User Interface)는 사용자가 보고 조작하는 화면이에요. UIKit은 뷰와 뷰 컨트롤러 등 iOS UI를 만드는 Apple 프레임워크예요.     |
| 사용 사례(Use Case)    | 사용자가 달성하려는 기능 단위예요. 이 문서에서는 “판매 가능한 상품 목록을 조회한다”가 사용 사례예요.                          |
| 업무 규칙과 표현 로직  | “미공개 상품은 판매 목록에서 제외한다”는 업무 규칙이고, “가격을 12,000원으로 표시한다”는 표현 로직이에요.                     |
| Entity                 | 화면 디자인과 독립적인 업무 데이터예요. 여기서는 상품의 식별자, 가격, 재고 등을 가진 `Product`예요.                           |
| 프로토콜과 의존성 주입 | 프로토콜은 필요한 동작의 계약이고, 의존성 주입은 함께 일할 객체를 외부에서 전달하는 방식이에요.                               |
| 모듈                   | 하나의 기능을 제공하는 코드 묶음이에요. 이 문서의 모듈은 기능 경계이며, 반드시 별도 Swift 패키지나 빌드 타깃일 필요는 없어요. |

이 문서에서는 다음 내용을 설명해요.

- View, Interactor, Presenter, Entity, Routing의 책임
- 뷰 컨트롤러에 모인 코드를 역할별로 분리하는 과정
- 업무 데이터와 사용 사례 결과, 화면용 데이터의 차이
- 모듈 조립과 화면 전환, 참조 관계, 비동기 작업 수명
- 화면과 서버 없이 실행하는 단위 테스트
- 다른 아키텍처와의 차이 및 VIPER를 도입하지 않아도 되는 조건

## VIPER는 다섯 책임을 나누는 패턴이에요

VIPER는 **View, Interactor, Presenter, Entity, Routing**의 약자예요. 마지막 R을 담당하는 타입은 보통 `Router` 또는 `Wireframe`이라고 불러요. `Wireframe`은 여기서 디자인 시안을 뜻하는 말이 아니라 화면을 연결하고 전환하는 객체의 이름이에요.

| 역할       | 답해야 할 질문                                             | 상품 목록 예제                                 |
| ---------- | ---------------------------------------------------------- | ---------------------------------------------- |
| View       | 무엇을 어떻게 그릴까요? 어떤 입력이 발생했나요?            | 셀·로딩·오류 표시, 상품 선택 전달              |
| Interactor | 이 사용 사례의 업무 규칙은 무엇인가요?                     | 저장소에서 상품을 가져와 판매 가능한 상품 선별 |
| Presenter  | 결과를 어떤 화면 상태로 보여주고 다음에 무엇을 요청할까요? | 가격 문자열 생성, 빈 목록 판단, 상세 이동 요청 |
| Entity     | 화면과 무관하게 어떤 업무 데이터가 있나요?                 | 상품 식별자·가격·재고·공개 여부                |
| Routing    | 다른 화면으로 어떻게 이동할까요?                           | 상세 화면 생성·연결, 내비게이션 전환           |

Jeff Gilbert와 Conrad Stoll의 2014년 [objc.io 원전](https://www.objc.io/issues/13-architecture/viper/)은 VIPER를 Clean Architecture를 iOS에 적용한 접근으로 소개해요. UIKit의 `UIViewController`를 없애는 설계가 아니라, 뷰 컨트롤러가 화면을 다루는 일에 집중하도록 해요.

### 대표 레퍼런스는 서로 다른 관점에서 읽어요

VIPER는 Apple이 하나의 구현으로 규정한 API가 아니에요. 따라서 모든 자료의 클래스 이름이나 프로토콜 개수가 같을 필요는 없어요.

| 자료                                                                                                                                                           | 이 문서에서 확인한 내용                                                                        | 읽을 때 주의할 점                                                                |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| [objc.io — Architecting iOS Apps with VIPER](https://www.objc.io/issues/13-architecture/viper/)                                                                | 다섯 역할, 기능 모듈, 데이터 경계와 테스트의 출발점                                            | Objective-C 시대의 예제와 현재 Swift 문법을 구분해요.                            |
| [Mutual Mobile의 VIPER-SWIFT 예제](https://github.com/griddynamics-archive/VIPER-SWIFT)                                                                        | Interactor의 결과를 Presenter가 표시 데이터로 바꾸고, AppDependencies에서 객체를 연결하는 모습 | 과거 Swift 예제예요. 현재 컴파일러에서 그대로 빌드되는 샘플로 소개하지는 않아요. |
| [Infinum iOS Handbook](https://infinum.com/handbook/ios/viper/viper-and-best-practices)과 [VIPER 템플릿](https://github.com/infinum/ios-viper-xcode-templates) | 팀에서 반복적으로 모듈을 만들기 위한 인터페이스·Wireframe 구성                                 | 템플릿의 세부 규칙은 Infinum의 구현 선택이지 VIPER 전체의 필수 규칙은 아니에요.  |
| [Robert C. Martin — The Clean Architecture](https://blog.cleancoder.com/uncle-bob/2012/08/13/the-clean-architecture.html)                                      | 업무 규칙이 UI나 저장 기술의 세부 사항에 의존하지 않도록 하는 원칙                             | 원칙과 VIPER의 역할 이름을 일대일로 같은 개념이라고 외우지 않아요.               |

아래 코드는 이 자료들의 책임 분리를 참고해 새로 작성한 **학습용 Swift 구현**이에요. 단발성 조회는 `async/await`로 반환하고, UI 연결에는 프로토콜을 사용해요. 원전의 모든 콜백 프로토콜을 그대로 옮긴 코드는 아니에요.

## 뷰 컨트롤러에 책임이 모이면 변경 이유도 많아져요

먼저 상품과 저장소 계약을 정의해요. `Identifiable`은 항목의 식별자를, `Equatable`은 값 비교를 제공해요. `Sendable`은 동시성 경계를 넘어 안전하게 전달할 수 있는 타입이라는 계약이에요. 이 예제는 불변 값 타입을 사용해 그 계약을 만족해요.

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

금액은 설명을 단순하게 만들기 위해 원화 정수로 표현해요. 여러 통화, 할인, 세금, 결제 시점의 가격 검증은 이 예제의 범위에서 제외해요.

다음은 분리 전 뷰 컨트롤러의 핵심 부분이에요. `async` 함수는 작업을 기다리는 동안 실행을 잠시 멈출 수 있고, `await`는 그 지점을 표시해요. `@MainActor`는 UI 관련 접근을 메인 액터라는 격리 영역으로 모아요.

```swift
import UIKit

@MainActor
final class UnsplitProductListViewController: UIViewController {
  var repository: any ProductRepository
  private let label = UILabel()

  init(repository: any ProductRepository) {
    self.repository = repository
    super.init(nibName: nil, bundle: nil)
  }

  required init?(coder: NSCoder) {
    fatalError("코드로 생성하는 예제예요.")
  }

  func load() async {
    label.text = "불러오는 중…"

    do {
      let products = try await repository.fetchProducts()
      let available = products.filter { $0.isPublished && $0.stock > 0 }
      label.text = available.isEmpty
        ? "판매 가능한 상품이 없어요."
        : available.map { "\($0.name): \($0.price)원" }.joined(separator: "\n")
    } catch {
      label.text = "상품을 불러오지 못했어요."
    }
  }

  func didSelectProduct(id: Int) {
    let detail = UIViewController()
    detail.title = "상품 \(id)"
    navigationController?.pushViewController(detail, animated: true)
  }
}
```

이 코드는 문제를 보여주기 위한 발췌라서 레이아웃·호출 시점·취소 처리를 생략했어요. 실제 목록을 표시하는 완성 예제는 뒤에서 만들어요.

짧을 때는 이 정도 구성도 괜찮아요. 하지만 위 타입에는 서로 다른 변경 이유가 있어요.

- 판매 정책이 바뀌면 `filter`를 고쳐야 해요.
- 가격 표시 형식이 바뀌면 문자열 생성 코드를 고쳐야 해요.
- 화면 이동 방식이 바뀌면 내비게이션 코드를 고쳐야 해요.
- 실패·재시도 동작을 검사하려면 UI 객체가 있는 곳까지 테스트가 들어와요.

MVC가 이런 결합을 반드시 요구하는 것은 아니에요. [MVC 문서](./mvc.md)에서 설명하듯 역할을 잘 분리한 MVC도 가능해요. VIPER는 여기서 **사용 사례, 화면 표현, 화면 전환의 분리 위치를 더 명시적으로 정하는 선택**이에요.

## 가장 먼저 Interactor로 업무 규칙을 옮겨요

저장소는 데이터를 어디에서 가져올지 담당하고, Interactor는 가져온 데이터로 어떤 사용 사례를 수행할지 담당해요. 네트워크 요청이나 데이터베이스 구현 자체를 Interactor 안에 모으지는 않아요.

또한 원본 상품을 그대로 화면으로 넘기는 대신, 이번 사용 사례의 결과를 별도 값으로 정의해요.

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

이제 “미공개 상품과 재고가 없는 상품은 제외한다”는 규칙을 UIKit 없이 검사할 수 있어요. 다만 목록에 나타난 뒤 재고가 바뀔 수 있으므로, 이 결과가 실제 구매 가능 여부를 영구히 보장하지는 않아요. 주문 시점의 검증은 별도 사용 사례가 맡아야 해요.

`any ProductRepository`는 해당 프로토콜을 따르는 구체 타입을 바꿔 넣기 위한 표현이에요. 여기서는 실행용 저장소와 테스트용 저장소를 같은 생성자에 전달하려고 사용해요. 모든 타입을 제네릭으로 연결하거나 모든 프로퍼티에 프로토콜을 만드는 것은 VIPER의 요구 사항이 아니에요.

### Entity, 사용 사례 결과, 화면용 데이터는 달라요

이 세 값은 모양이 비슷해도 변경 이유가 달라요.

| 값                 | 포함하는 정보                                         | 의도적으로 제외하는 정보           |
| ------------------ | ----------------------------------------------------- | ---------------------------------- |
| `Product`          | 상품 식별자, 원래 가격, 재고, 공개 여부               | 셀에 표시할 문자열                 |
| `AvailableProduct` | 판매 가능 목록 조회가 반환할 식별자, 이름, 가격       | 재고 검사 과정, 저장소의 내부 객체 |
| `ProductRow`       | 셀이 바로 표시할 제목과 가격 문자열, 선택에 사용할 ID | 판매 가능 여부를 판단하는 규칙     |

objc.io의 원전은 Entity를 Presenter로 그대로 전달하지 않고 단순한 결과 데이터로 경계를 넘기는 접근을 설명해요. [Mutual Mobile Swift 샘플의 ListPresenter](https://github.com/griddynamics-archive/VIPER-SWIFT/blob/master/VIPER-SWIFT/Classes/Modules/List/User%20Interface/Presenter/ListPresenter.swift)도 사용 사례 결과를 받아 별도의 표시 데이터로 바꿔요.

이 문서에서는 그 경계를 명시하기 위해 `AvailableProduct`를 두었어요. 단순한 앱에서 값 타입 하나를 공유할 수도 있지만, 그것은 경계를 합치는 선택이에요. 데이터베이스가 관리하는 객체나 서버 응답 타입을 화면까지 그대로 전달하면서 모든 계층이 독립적이라고 설명해서는 안 돼요.

## Presenter가 화면의 입력과 출력을 연결해요

이 예제에서는 아래 방향으로 요청과 결과가 흘러요. 화살표는 **실행 중 호출과 결과 전달**을 나타내며, 강한 참조 관계나 Swift 파일의 `import` 방향을 뜻하지는 않아요.

```text
[조회 요청]
View ──> Presenter ──> Interactor ──> Repository

[조회 결과와 화면 갱신]
Repository ── Product[] ──> Interactor
Interactor ── AvailableProduct[] ──> Presenter
Presenter ── ProductListViewState ──> View

View ── 상품 선택(ID) ──> Presenter ── 이동 요청 ──> Router
                                                     │
                                                     └── 상세 화면으로 전환
```

### 화면 상태와 인터페이스를 먼저 정해요

View는 가격 형식이나 실패 문구를 결정하지 않고 완성된 상태를 받아 표시해요. 이 코드에서는 로딩 중 기존 목록을 숨기는 정책을 선택했어요.

```swift
// ProductListInterfaces.swift
struct ProductRow: Equatable {
  let id: Int
  let title: String
  let priceText: String
}

enum ProductListViewState: Equatable {
  case loading
  case empty
  case content([ProductRow])
  case failed(message: String)
}

@MainActor
protocol ProductListViewing: AnyObject {
  func render(_ state: ProductListViewState)
}

@MainActor
protocol ProductListPresenting: AnyObject {
  func load() async
  func didSelectProduct(id: Int)
}

@MainActor
protocol ProductListRouting: AnyObject {
  func showProductDetail(id: Int)
}
```

`AnyObject`는 프로토콜을 클래스 타입으로 제한해요. 이 예제에서는 View를 나중에 약한 참조로 연결하기 위해 필요해요. UI와 상호작용하는 세 계약은 `@MainActor`로 맞추고, Interactor와 저장소의 계약은 UI에 묶지 않았어요.

### Presenter는 UIKit 없이 화면 상태를 만들어요

저장소에서 결과가 도착하면 표현용 데이터로 바꾸고, 선택 이벤트가 오면 Router에 이동을 요청해요.

```swift
// ProductListPresenter.swift
import Foundation

@MainActor
final class ProductListPresenter: ProductListPresenting {
  weak var view: (any ProductListViewing)?

  private let interactor: any ProductListInteracting
  private let router: any ProductListRouting
  private var requestID = 0
  private var selectableIDs: Set<Int> = []

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
    view?.render(.loading)

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

      view?.render(rows.isEmpty ? .empty : .content(rows))
    } catch is CancellationError {
      // 화면 이탈이나 새 요청 때문에 취소된 작업은 오류로 표시하지 않아요.
    } catch {
      guard !Task.isCancelled, currentRequestID == requestID else { return }
      view?.render(.failed(message: "상품을 불러오지 못했어요. 다시 시도해 주세요."))
    }
  }

  func didSelectProduct(id: Int) {
    guard selectableIDs.contains(id) else { return }
    router.showProductDetail(id: id)
  }
}
```

Presenter는 `UILabel`, `IndexPath`, `UINavigationController`를 몰라요. 화면에서 선택한 행의 위치가 아니라 상품 ID를 받으므로, UI 배치가 바뀌어도 입력 계약을 유지할 수 있어요.

또한 `requestID`는 늦게 끝난 이전 요청이 최신 화면을 덮어쓰지 못하게 해요. `@MainActor`라고 해서 `load()` 전체가 한 번에 끝나는 것은 아니에요. `await`로 기다리는 사이 다른 `load()`가 시작될 수 있으므로, 결과를 반영할 때 요청 번호를 다시 확인해요.

### 비동기 메서드를 쓴다고 모두 백그라운드 작업은 아니에요

Swift의 `async`는 “백그라운드 스레드에서 실행한다”는 표시가 아니에요. 실행 위치는 격리와 함수 선언, 프로젝트 설정의 영향을 받아요. UI 상태 변경은 `@MainActor`에 두되, 대용량 정렬·이미지 처리처럼 오래 걸리는 계산은 별도 실행 전략을 정해야 해요. [Swift Concurrency 공식 설명](https://docs.swift.org/swift-book/documentation/the-swift-programming-language/concurrency/)을 함께 참고해요.

이 예제는 Swift 6 언어 모드, 기본 액터 격리를 `nonisolated`로 둔 코드 구성을 기준으로 해요. 기본 격리가 `MainActor`인 프로젝트에서는 업무·데이터 타입의 격리 설정도 확인해야 해요. 단순히 `Sendable`을 붙이는 것만으로 작업이 다른 스레드로 이동하지는 않아요.

원전과 여러 템플릿은 `InteractorInput`·`InteractorOutput` 프로토콜로 비동기 결과를 전달해요. 이 문서의 조회는 한 번 호출해서 한 결과를 받으므로 `async throws` 반환을 선택했어요. 지속적인 이벤트라면 콜백이나 비동기 스트림 등 다른 계약이 필요할 수 있어요. 어느 문법을 쓰든 Interactor가 구체적인 View나 Presenter를 알 필요가 없다는 경계는 유지해요.

## View는 화면 표시와 사용자 입력에 집중해요

이제 실제로 동작하는 작은 목록 화면을 만들어요. 아래 View는 상태를 받으면 테이블을 갱신하고, 선택·새로고침 입력을 Presenter로 전달해요.

```swift
// ProductListViewController.swift
import UIKit

@MainActor
final class ProductListViewController: UITableViewController, ProductListViewing {
  private let presenter: any ProductListPresenting
  private var rows: [ProductRow] = []
  private var loadTask: Task<Void, Never>?
  private let messageLabel = UILabel()

  init(presenter: any ProductListPresenting) {
    self.presenter = presenter
    super.init(style: .plain)
  }

  required init?(coder: NSCoder) {
    fatalError("코드로 생성하는 예제예요.")
  }

  override func viewDidLoad() {
    super.viewDidLoad()
    title = "상품 목록"
    tableView.register(UITableViewCell.self, forCellReuseIdentifier: "Product")
    messageLabel.numberOfLines = 0
    messageLabel.textAlignment = .center
    navigationItem.rightBarButtonItem = UIBarButtonItem(
      title: "새로고침",
      style: .plain,
      target: self,
      action: #selector(reloadProducts)
    )
  }

  override func viewWillAppear(_ animated: Bool) {
    super.viewWillAppear(animated)
    reloadProducts()
  }

  override func viewDidDisappear(_ animated: Bool) {
    super.viewDidDisappear(animated)
    loadTask?.cancel()
    loadTask = nil
  }

  deinit {
    loadTask?.cancel()
  }

  @objc private func reloadProducts() {
    loadTask?.cancel()
    loadTask = Task { [presenter] in
      await presenter.load()
    }
  }

  func render(_ state: ProductListViewState) {
    rows = []
    tableView.backgroundView = messageLabel

    switch state {
    case .loading:
      messageLabel.text = "불러오는 중…"
    case .empty:
      messageLabel.text = "판매 가능한 상품이 없어요."
    case let .content(newRows):
      rows = newRows
      tableView.backgroundView = nil
    case let .failed(message):
      messageLabel.text = message
    }

    tableView.reloadData()
  }

  override func tableView(
    _ tableView: UITableView,
    numberOfRowsInSection section: Int
  ) -> Int {
    rows.count
  }

  override func tableView(
    _ tableView: UITableView,
    cellForRowAt indexPath: IndexPath
  ) -> UITableViewCell {
    let cell = tableView.dequeueReusableCell(
      withIdentifier: "Product",
      for: indexPath
    )
    let row = rows[indexPath.row]
    var content = cell.defaultContentConfiguration()
    content.text = row.title
    content.secondaryText = row.priceText
    cell.contentConfiguration = content
    return cell
  }

  override func tableView(
    _ tableView: UITableView,
    didSelectRowAt indexPath: IndexPath
  ) {
    tableView.deselectRow(at: indexPath, animated: true)
    presenter.didSelectProduct(id: rows[indexPath.row].id)
  }
}
```

UIKit의 뷰 컨트롤러도 VIPER에서는 **View 역할**을 맡아요. 셀 생성, 레이아웃, 접근성, UIKit 생명주기를 처리하는 것은 View의 일이에요. 반면 판매 조건을 검사하거나 다음 화면 객체를 생성하지는 않아요.

예제에서는 화면에 나타날 때마다 새로 조회하고, 화면이 사라지거나 새로고침을 누르면 이전 작업을 취소해요. 실서비스에서는 캐시를 유지할지, 상세 화면에서 돌아올 때도 재조회할지를 제품 요구에 맞춰 정해요. 작은 목록이라 `reloadData()`를 사용했지만, 대량 변경의 부분 갱신은 View의 데이터 소스 구현에서 별도로 다룰 수 있어요.

### 약한 참조와 작업 취소는 다른 문제예요

Swift의 ARC(Automatic Reference Counting)는 강한 참조 수를 기준으로 객체 수명을 관리해요. `weak`는 객체를 계속 살려 두지 않는 약한 참조이며, 참조 대상이 해제되면 `nil`이 돼요.

이 예제의 소유 관계는 다음과 같아요. 아래 표는 앞의 호출 흐름과 달리 **객체가 무엇을 보관하는지**를 설명해요.

| 보관하는 쪽 | 보관 대상                         | 이 예제의 선택 이유                                                                |
| ----------- | --------------------------------- | ---------------------------------------------------------------------------------- |
| View        | Presenter를 강하게 보관           | 화면이 존재하는 동안 입력을 처리할 객체가 필요해요.                                |
| Presenter   | View를 약하게 보관                | View와 서로 강하게 보관하는 순환 참조를 피하고, 화면이 사라지면 출력을 버려요.     |
| Presenter   | Interactor와 Router를 보관        | 사용 사례 실행과 화면 전환을 요청할 대상이에요. Interactor는 여기서 값 타입이에요. |
| Router      | 출발 ViewController를 약하게 보관 | 화면을 계속 붙잡아 두지 않고 현재 화면에서 전환해요.                               |

`Task`는 작업이 끝날 때까지 캡처한 Presenter를 유지할 수 있어요. View를 `weak`로 바꿨다고 실행 중인 네트워크 요청이 자동으로 취소되지는 않아요. 그래서 View가 작업 핸들을 보관하고 생명주기에 맞춰 `cancel()`을 호출해요.

반대로 `cancel()`도 작업을 강제로 즉시 종료하는 명령은 아니에요. Swift의 취소는 협력적이므로, 작업이 취소 상태를 확인하거나 취소에 반응하는 API를 사용해야 해요. 예제는 Interactor와 Presenter에서 [Task.checkCancellation()](<https://developer.apple.com/documentation/swift/task/checkcancellation()>)을 확인해 취소된 결과가 UI에 반영되지 않도록 해요.

취소를 실패 화면으로 바꾸지 않는 것도 의도적인 정책이에요. 화면이 사라진 뒤 취소되었다면 오류를 표시할 필요가 없고, 새 조회가 시작됐다면 그 조회가 다음 상태를 결정해요. 화면 안에 별도의 “취소” 버튼을 제공한다면 취소 후 돌아갈 상태도 따로 설계해야 해요.

Infinum의 템플릿은 일부 연결에 `unowned`를 사용해요. `unowned`는 접근 시 대상이 살아 있다는 수명 보장이 필요해요. 이 문서에서는 비동기 작업과 화면 수명을 분리하기 쉽게 `weak`를 선택했어요. 어느 한 참조 방식이 VIPER 전체의 규칙인 것은 아니에요.

## Router는 전환을 실행하고 Builder는 객체를 조립해요

Presenter는 “이 상품의 상세 화면을 보여 달라”고 요청하고, Router는 UIKit으로 그 전환을 실행해요. 여기서는 전환을 확인하기 위해 상품 ID를 제목으로 표시하는 최소 상세 화면을 만들어요.

```swift
// ProductListRouter.swift
import UIKit

@MainActor
final class ProductListRouter: ProductListRouting {
  weak var source: UIViewController?

  func showProductDetail(id: Int) {
    // 상품 상세 조회·레이아웃은 이 예제의 범위에서 제외해요.
    let detail = UIViewController()
    detail.title = "상품 \(id)"
    detail.view.backgroundColor = .systemBackground
    source?.navigationController?.pushViewController(detail, animated: true)
  }
}
```

실제 상세 기능이 있다면 이 위치에서 상세 모듈의 생성 함수를 호출하고 ID를 전달하면 돼요. Presenter는 상세 화면이 `push`로 나타날지 `present`로 나타날지 알 필요가 없어요.

이제 생성 책임을 한곳에 모아요. **Builder 또는 Assembly**는 필요한 객체를 만들고 연결해서 사용할 수 있는 모듈을 반환하는 코드예요. VIPER의 필수 여섯 번째 글자가 아니라 조립 위치를 분리하기 위한 구현 선택이에요.

```swift
// ProductListModule.swift
import UIKit

@MainActor
enum ProductListModule {
  static func make(repository: any ProductRepository) -> UIViewController {
    let router = ProductListRouter()
    let interactor = ProductListInteractor(repository: repository)
    let presenter = ProductListPresenter(interactor: interactor, router: router)
    let view = ProductListViewController(presenter: presenter)

    presenter.view = view
    router.source = view
    return view
  }
}

struct DemoProductRepository: ProductRepository {
  func fetchProducts() async throws -> [Product] {
    [
      Product(id: 1, name: "노트", price: 12000, stock: 3, isPublished: true),
      Product(id: 2, name: "펜", price: 3000, stock: 0, isPublished: true),
      Product(id: 3, name: "비공개 상품", price: 5000, stock: 2, isPublished: false)
    ]
  }
}

@MainActor
func makeDemoRootViewController() -> UIViewController {
  UINavigationController(
    rootViewController: ProductListModule.make(repository: DemoProductRepository())
  )
}
```

앞에서 파일명을 붙인 코드 블록들을 같은 앱 타깃에 추가하면 모듈이 연결돼요. 분리 전의 `UnsplitProductListViewController`는 완성 예제에 필요하지 않아요. 앱의 Scene 설정에서 `makeDemoRootViewController()`의 반환값을 창의 루트로 지정하면 “노트 / 12,000원” 한 행과 새로고침 버튼을 확인할 수 있어요.

실행용 저장소 대신 다른 `ProductRepository`를 넘기면 화면 코드를 바꾸지 않고 데이터 공급원을 교체할 수 있어요. 네트워크 인증, 캐싱, 실제 저장소 구현과 앱 진입점 전체 코드는 여기서 생략했어요.

### 모듈은 화면 하나와 항상 일치하지는 않아요

“상품 목록”과 “상품 편집”처럼 별도 책임이 있으면 모듈을 나눌 수 있고, 한 사용 흐름을 위해 여러 화면을 묶을 수도 있어요. 반대로 작은 셀마다 VIPER 모듈을 만들 필요는 없어요.

다른 모듈에서 편집을 완료했다는 사실을 알려야 한다면 입력 ID와 “저장 완료” 출력 계약을 정해요. 프로토콜이나 클로저로 결과를 받아 목록을 갱신할 수 있어요. 다른 모듈의 Presenter 내부 상태를 직접 수정하는 방식은 피하는 편이 경계를 유지하기 쉬워요.

Mutual Mobile의 [AppDependencies 조립 코드](https://github.com/griddynamics-archive/VIPER-SWIFT/blob/master/VIPER-SWIFT/Classes/AppDependencies.swift)와 Infinum의 Wireframe 구성은 생성 책임을 어디에 둘지 참고하기 좋아요. 이 문서에서는 화면 이동과 객체 생성을 따로 읽기 쉽도록 Router와 `ProductListModule`로 나눴어요.

## 화면과 서버 없이 핵심 동작을 테스트해요

**단위 테스트**는 작은 코드 단위의 동작을 검사해요. **테스트 대역**은 실제 협력 객체 대신 제어 가능한 동작을 제공하는 객체예요. 정해 둔 결과를 돌려주는 대역은 Stub, 받은 호출을 기록하는 대역은 Spy라고 불러요.

아래 테스트는 Apple의 [Swift Testing](https://developer.apple.com/xcode/swift-testing/)을 사용해요. `@Test`가 테스트 함수를 선언하고 `#expect`가 조건을 검사해요. Xcode 16 이상에서 사용할 수 있으며, 테스트 타깃의 `@testable import VIPERExample`은 예제 코드를 넣은 실제 모듈 이름으로 바꿔요.

### 업무 규칙과 화면 상태를 각각 확인해요

첫 테스트는 Interactor의 판매 조건을 검사해요. 나머지 테스트는 Interactor를 대역으로 바꾸고 Presenter가 내보내는 상태와 이동 요청만 검사해요.

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
private final class ViewSpy: ProductListViewing {
  var states: [ProductListViewState] = []

  func render(_ state: ProductListViewState) {
    states.append(state)
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
  view: ViewSpy,
  router: RouterSpy
) {
  let view = ViewSpy()
  let router = RouterSpy()
  let presenter = ProductListPresenter(interactor: interactor, router: router)
  presenter.view = view
  return (presenter, view, router)
}

@Test
func interactorExcludesUnpublishedAndOutOfStockProducts() async throws {
  let repository = RepositoryStub(products: [
    Product(id: 1, name: "노트", price: 12000, stock: 3, isPublished: true),
    Product(id: 2, name: "펜", price: 3000, stock: 0, isPublished: true),
    Product(id: 3, name: "비공개", price: 5000, stock: 2, isPublished: false)
  ])
  let interactor = ProductListInteractor(repository: repository)

  let products = try await interactor.fetchAvailableProducts()

  #expect(products == [AvailableProduct(id: 1, name: "노트", price: 12000)])
}

@Test @MainActor
func presenterFormatsContent() async {
  let sut = makePresenter(interactor: InteractorStub(result: .success([
    AvailableProduct(id: 1, name: "노트", price: 12000)
  ])))

  await sut.presenter.load()

  #expect(sut.view.states == [
    .loading,
    .content([ProductRow(id: 1, title: "노트", priceText: "12,000원")])
  ])
}

@Test @MainActor
func presenterShowsEmptyState() async {
  let sut = makePresenter(interactor: InteractorStub(result: .success([])))

  await sut.presenter.load()

  #expect(sut.view.states == [.loading, .empty])
}

@Test @MainActor
func presenterShowsFailureState() async {
  let sut = makePresenter(interactor: InteractorStub(result: .failure(.offline)))

  await sut.presenter.load()

  #expect(sut.view.states == [
    .loading,
    .failed(message: "상품을 불러오지 못했어요. 다시 시도해 주세요.")
  ])
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
```

`sut`는 System Under Test, 즉 검사 대상과 관련 대역을 묶은 변수 이름이에요. ViewSpy를 강하게 보관하는 이유도 중요해요. Presenter는 View를 약하게 참조하므로, 테스트에서도 누군가는 ViewSpy의 수명을 유지해야 해요.

이 테스트들은 서버나 UIKit 화면을 띄우지 않아요. 판매 규칙이 바뀌면 Interactor 테스트가, 표시 형식이 바뀌면 Presenter 테스트가 변경 지점을 알려줘요. 다만 RouterSpy로 이동 요청을 확인한 것이 실제 UIKit 화면 전환까지 검증했다는 뜻은 아니에요. 실제 화면·접근성·전환은 별도 UI 또는 통합 테스트로 확인해요.

### 응답 순서와 취소도 시간을 재지 않고 검사해요

비동기 테스트에서 임의로 1초 기다리는 방식은 실행 환경에 따라 불안정할 수 있어요. 대신 언제 응답할지 테스트에서 직접 결정해요.

**actor**는 자신의 가변 상태에 대한 접근을 격리하는 Swift 타입이에요. **continuation**은 잠시 중단한 비동기 함수의 실행을 나중에 재개하기 위한 값이에요. 아래 대역은 조회를 대기시키고 테스트가 지정한 순서로 결과를 돌려줘요. 대기한 continuation은 정확히 한 번씩 재개해야 해요.

다음 코드를 위와 **같은 테스트 파일**에 이어서 추가해요.

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

  func complete(_ id: Int, with products: [AvailableProduct]) {
    pending.removeValue(forKey: id)?.resume(returning: products)
  }
}

@Test @MainActor
func presenterIgnoresOlderResponse() async {
  let interactor = ControlledInteractor()
  let sut = makePresenter(interactor: interactor)

  let first = Task { await sut.presenter.load() }
  await interactor.waitForRequests(1)
  let second = Task { await sut.presenter.load() }
  await interactor.waitForRequests(2)

  await interactor.complete(2, with: [
    AvailableProduct(id: 2, name: "최신 상품", price: 2000)
  ])
  await second.value
  await interactor.complete(1, with: [
    AvailableProduct(id: 1, name: "이전 상품", price: 1000)
  ])
  await first.value

  #expect(sut.view.states == [
    .loading,
    .loading,
    .content([ProductRow(id: 2, title: "최신 상품", priceText: "2,000원")])
  ])
}

@Test @MainActor
func presenterDoesNotRenderCancelledResult() async {
  let interactor = ControlledInteractor()
  let sut = makePresenter(interactor: interactor)

  let request = Task { await sut.presenter.load() }
  await interactor.waitForRequests(1)
  request.cancel()

  // 취소에 즉시 반응하지 않는 의존성이 결과를 돌려주는 상황을 재현해요.
  await interactor.complete(1, with: [
    AvailableProduct(id: 1, name: "노트", price: 12000)
  ])
  await request.value

  #expect(sut.view.states == [.loading])
}
```

첫 테스트는 나중에 시작한 조회가 먼저 끝나는 상황을 만들어요. 두 번째는 취소된 작업이 결과를 반환해도 화면 성공·실패 상태를 추가하지 않는지 확인해요. 이 대역은 응답 순서를 제어하기 위한 테스트용 구현이며, 실서비스의 취소 가능한 네트워크 클라이언트를 대신하는 설계는 아니에요.

## Clean Architecture와 의존성 역전을 연결해서 이해해요

**의존성 역전 원칙(DIP, Dependency Inversion Principle)**은 중요한 정책이 외부 구현 세부 사항에 직접 매달리지 않도록 추상화에 의존하게 하는 원칙이에요. Clean Architecture에서는 소스 코드의 의존성이 업무 규칙 쪽으로 향해야 한다고 설명해요. [원전의 Dependency Rule](https://blog.cleancoder.com/uncle-bob/2012/08/13/the-clean-architecture.html)을 참고해요.

여기서 실행 순서와 소스 의존 방향을 구분해야 해요.

- 실행 중에는 Interactor가 저장소에 조회를 요청해요.
- 하지만 Interactor의 소스는 `URLSession`이나 데이터베이스 구현 대신 `ProductRepository` 계약만 알아요.
- 구체적인 저장소 구현이 그 계약을 만족하고, 조립 코드가 둘을 연결해요.
- UI 쪽은 사용 사례의 계약과 결과를 알 수 있지만, 업무 쪽은 UIKit의 화면 타입을 몰라요.

프로토콜을 데이터 구현 패키지 안에 두고 업무 패키지가 그 패키지를 통째로 가져온다면, 이름에 `Protocol`을 붙여도 의존 방향이 해결되지는 않아요. 별도 패키지로 나눌 때는 계약과 데이터 타입을 어느 쪽이 소유하는지도 확인해야 해요.

이 예제는 한 모듈 안에서 타입의 책임을 나눈 학습 코드예요. 잘못된 `import`를 빌드 단계에서 차단하는 패키지 경계까지 구성한 것은 아니에요. [의존성·DI·DIP 문서](./dependency-injection.md)와 함께 보면 “외부에서 전달한다”와 “의존 방향을 뒤집는다”의 차이를 더 자세히 이해할 수 있어요.

## MVC·MVVM·MVI·RIBs와 무엇이 다른가요

아래 비교는 이 저장소의 문서와 대표적인 구현을 기준으로 해요. 실제 팀에서는 여러 접근을 조합할 수 있어요.

| 접근                                          | 주로 명시하는 경계                                | VIPER와 비교할 때 볼 점                                                                                                                  |
| --------------------------------------------- | ------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| [MVC](./mvc.md)                               | Model, View, Controller의 역할                    | VIPER는 사용 사례·표현·전환의 책임을 더 세분화해요. MVC도 서비스나 조립 코드를 분리할 수 있어요.                                         |
| [MVVM](./mvvm.md)                             | View와 관찰·바인딩할 화면 상태 및 동작            | 이 예제의 Presenter는 View 계약을 호출해 상태를 전달해요. MVVM의 ViewModel은 구체적인 View를 모르고 상태를 노출하는 방식이 일반적이에요. |
| [MVI](./mvi.md)                               | 사용자 의도, 상태 변경, 화면 표시의 단방향 흐름   | VIPER의 핵심은 역할의 분리예요. 상태를 enum으로 만들었다고 MVI가 되지는 않고, VIPER 안에서도 단방향 상태 흐름을 설계할 수 있어요.        |
| VIPER                                         | View·Interactor·Presenter·Entity·Routing          | 기능별 역할과 테스트 경계가 명시적인 대신 타입·연결 코드가 늘어요.                                                                       |
| [Uber RIBs](https://github.com/uber/RIBs-iOS) | Router·Interactor·Builder 중심의 기능 트리와 수명 | RIBs는 패턴 이름만이 아니라 프레임워크예요. 비즈니스 로직 트리와 뷰 트리를 분리하고, View 없는 구성도 중심적으로 다뤄요.                 |

**MVP(Model-View-Presenter)**는 Presenter가 View와 Model 사이를 조정하는 패턴이에요. VIPER의 Presenter가 비슷해 보이는 이유도 이 역할 때문이에요. 다만 VIPER는 그 주변에서 사용 사례를 Interactor로, 전환을 Routing으로 구분해요. Presenter 하나만 추가했다고 모든 VIPER 경계가 생기는 것은 아니에요.

RIBs는 중첩된 기능의 수명과 의존성 범위를 프레임워크 차원에서 다룬다는 점을 비교하면 좋아요. VIPER에서 유사한 수명 관리나 화면 없는 업무 코드를 만들 수 없다는 뜻은 아니에요. RIBs를 도입할지는 팀 규모만이 아니라 상태 구조와 프레임워크 도입 비용을 보고 판단해요.

### SwiftUI 버전에서는 화면 연결 방식이 달라져요

[별도 SwiftUI 문서](./viper-swiftui.md)는 같은 상품 조회 규칙을 사용하되, View를 호출하는 프로토콜 대신 관찰 가능한 화면 상태를 제공해요. UIKit을 감싸서 사용하는 예제가 아니라 SwiftUI 화면과 경로 상태로 구성한 독립적인 구현이에요.

| 비교 기준        | 이 UIKit 문서                                                             | SwiftUI 문서                                                                           |
| ---------------- | ------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| 화면 갱신        | Presenter가 `view.render(...)`를 호출해요.                                | View가 Presenter의 관찰 가능한 상태를 읽어요.                                          |
| 화면과 객체 수명 | ViewController가 Presenter를 보관하고 Presenter는 View를 약하게 참조해요. | SwiftUI의 `@State` 저장소가 조립된 모듈을 유지하고 Presenter는 View를 참조하지 않아요. |
| 화면 전환        | Router가 `pushViewController`를 실행해요.                                 | Router가 경로를 바꾸면 `NavigationStack`이 전환해요.                                   |
| 조회 작업        | ViewController가 `Task`를 보관하고 취소해요.                              | `.task(id:)`와 `.refreshable`이 비동기 작업의 진입점이에요.                            |

업무 규칙을 Interactor에 두는 경계는 같지만, UIKit의 참조 연결과 생명주기 코드를 SwiftUI에 그대로 복사할 필요는 없어요.

## 언제 사용하고 언제 단순하게 유지하나요

VIPER를 검토할 만한 상황은 다음과 같아요.

- 한 기능에서 업무 규칙, 화면 표현, 화면 전환이 서로 다른 이유로 자주 바뀌어요.
- 실제 UI나 서버를 실행하지 않고 기능과 표현을 각각 테스트할 필요가 있어요.
- 여러 사람이 기능 단위로 작업하며 공통 경계와 조립 규칙을 합의할 수 있어요.
- 한 사용 사례를 다른 화면이나 플랫폼 UI에서 재사용하려고 해요.

반면 정적인 안내 화면이나 동작이 거의 없는 작은 화면에서는 별도 Interactor와 프로토콜들이 내용 없는 전달 코드가 될 수 있어요. 이때는 화면·서비스의 경계만 분리하거나 기존 MVC·MVVM 구성을 유지하는 편이 읽기 쉬울 수 있어요.

비용도 함께 고려해야 해요. 파일과 타입이 늘고, 기능 하나를 따라가기 위해 여러 곳을 오갈 수 있어요. 조립에서 View 연결을 빠뜨리면 이 예제처럼 약한 참조가 `nil`인 상태로 출력이 사라질 수도 있어요. 템플릿은 반복 작업을 줄이지만 책임을 잘못 나눈 설계를 고쳐 주지는 않아요.

또한 VIPER가 화면을 더 빠르게 그리거나 네트워크를 더 빠르게 만드는 것은 아니에요. 목적은 변경과 테스트의 경계를 개선하는 데 있어요. 타입 수 증가에 따른 개발·빌드 비용과 런타임 성능은 실제 프로젝트에서 각각 측정해야 해요.

## 적용 순서를 정리해요

전체 앱을 한 번에 바꾸기보다 복잡해진 기능 하나에서 다음 순서로 시도해요.

1. **업무 규칙을 적어요.** “재고가 없으면 판매 목록에서 제외한다”처럼 화면과 무관한 조건을 찾아요.
2. **저장소 계약과 사용 사례를 분리해요.** Interactor가 저장 기술이 아니라 필요한 동작만 알게 해요.
3. **화면 상태를 정해요.** 로딩, 빈 결과, 성공, 실패와 재시도 정책을 정의해요.
4. **Presenter에서 상태 변환을 테스트해요.** View와 Router를 대역으로 바꿔 출력과 이동 요청을 확인해요.
5. **View·Router·조립 코드를 연결해요.** 실제 실행에서 초기 표시, 선택, 오류와 재시도를 확인해요.
6. **수명과 비동기 경계를 검사해요.** 화면 이탈, 빠른 재시도, 늦은 응답, 순환 참조를 확인해요.

완료 전에 Interactor가 UIKit을 알고 있지는 않은지, View가 업무 규칙을 다시 계산하지는 않는지, Presenter가 모든 기능을 떠안는 새 거대 객체가 되지는 않았는지 점검해요. 역할 이름보다 **각 타입이 왜 바뀌는지**를 설명할 수 있어야 해요.

## 면접에서 이어질 수 있는 질문

### VIPER에서 ViewController는 어떤 역할인가요

일반적인 UIKit 구현에서는 View 역할이에요. 레이아웃과 UIKit 생명주기, 입력 전달을 담당하고, 사용 사례의 업무 규칙은 Interactor로 분리해요. 이름에 Controller가 있다는 이유만으로 VIPER의 Presenter 역할이 되는 것은 아니에요.

### Presenter와 Interactor를 나누는 기준은 무엇인가요

화면이 없어도 유지되어야 하는 사용 사례의 규칙은 Interactor에, 화면에 맞춰 결과를 표현하고 입력을 조정하는 로직은 Presenter에 둬요. 상품 판매 조건과 가격 문자열은 각각의 예예요. Presenter가 저장소 구현까지 직접 조작하면 그 경계가 흐려져요.

### Entity를 Presenter에 넘기면 안 되나요

원전은 단순한 사용 사례 결과로 경계를 넘기는 방식을 설명해요. 이 문서도 Entity, 사용 사례 결과, 화면 데이터를 나눴어요. 작은 앱에서 값 타입을 공유하는 변형은 가능하지만, 공유로 생기는 결합과 데이터베이스 관리 객체의 수명·격리 제약까지 숨겨서는 안 돼요.

### MVVM 대신 VIPER를 선택해야 하는 기준은 무엇인가요

사용 사례·표현·화면 전환의 독립적인 변경과 테스트가 실제로 필요한지 확인해요. MVVM에서도 사용 사례와 Router를 분리할 수 있으므로 이름만으로 우열을 정할 수는 없어요. 더 명시적인 경계의 이득이 늘어나는 연결 코드보다 큰 기능에서 검토해요.

### VIPER에서 메모리 누수와 비동기 작업은 어떻게 관리하나요

객체의 소유 관계와 작업의 수명을 따로 설계해요. 이 예제는 Presenter에서 View를 약하게 참조해 순환 참조를 피하고, View가 작업을 취소하며 Presenter가 취소·요청 번호를 검사해 늦은 결과를 버려요. `weak`만으로 작업이 취소되거나 `cancel()`만으로 즉시 종료되는 것은 아니에요.

## 참고 자료

- [objc.io — Architecting iOS Apps with VIPER, Jeff Gilbert·Conrad Stoll (2014)](https://www.objc.io/issues/13-architecture/viper/)
- [Mutual Mobile VIPER-SWIFT — 현재 리디렉션된 예제 저장소](https://github.com/griddynamics-archive/VIPER-SWIFT)
- [Infinum iOS Handbook — VIPER and best practices](https://infinum.com/handbook/ios/viper/viper-and-best-practices)
- [Infinum — iOS VIPER Xcode Templates](https://github.com/infinum/ios-viper-xcode-templates)
- [Robert C. Martin — The Clean Architecture (2012)](https://blog.cleancoder.com/uncle-bob/2012/08/13/the-clean-architecture.html)
- [Uber — RIBs for iOS](https://github.com/uber/RIBs-iOS)
- [The Swift Programming Language — Concurrency](https://docs.swift.org/swift-book/documentation/the-swift-programming-language/concurrency/)
- [Apple Developer — Task.checkCancellation()](<https://developer.apple.com/documentation/swift/task/checkcancellation()>)
- [Apple Developer — Swift Testing](https://developer.apple.com/xcode/swift-testing/)
