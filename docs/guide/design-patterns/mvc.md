---
title: Swift로 이해하는 MVC
description: UIKit 상품 목록 예제로 Model·View·Controller의 책임과 데이터 흐름을 이해하고 Massive View Controller를 피하는 분리 기준을 설명합니다.
---

# Swift로 이해하는 MVC

> **면접 답변 한 줄 요약:** MVC는 앱의 데이터와 핵심 규칙을 Model, 화면 표현을 View, 사용자 입력과 두 영역의 연결을 Controller로 나눠 변경 이유를 분리하는 UI 아키텍처 패턴이에요.

MVC(Model-View-Controller)는 앱 전체를 세 가지 역할로 나누는 오래된 UI 아키텍처 패턴이에요. Apple의 Cocoa와 UIKit도 MVC의 영향을 크게 받았지만, `UIViewController`를 사용한다는 사실만으로 책임이 잘 분리되는 것은 아니에요.

이 문서에서는 상품 목록 화면 하나를 만들며 각 역할의 경계와 데이터 흐름을 살펴봐요.

## 먼저 알아둘 설계 용어

| 용어               | 쉬운 뜻                                                                                                                     |
| ------------------ | --------------------------------------------------------------------------------------------------------------------------- |
| Model              | 화면과 무관한 데이터와 핵심 규칙을 맡는 객체예요. 서버나 저장소에서 데이터를 가져오는 코드도 Model 계층에 포함할 수 있어요. |
| View               | 사용자가 보는 내용을 그리고 입력을 받는 UI 객체예요. UIKit에서는 `UIView`, `UILabel`, `UITableView` 등이 해당해요.          |
| Controller         | 사용자 입력을 해석해 Model에 작업을 요청하고, 결과가 View에 반영되도록 조정하는 객체예요.                                   |
| UIKit              | iPhone과 iPad 앱의 화면, 이벤트, 화면 전환을 구성하는 Apple UI 프레임워크예요.                                              |
| `UIViewController` | UIKit 화면 하나의 View 계층과 생명주기를 관리하는 기본 Controller 타입이에요.                                               |
| 도메인 규칙        | 할인, 주문 가능 여부처럼 앱이 해결하는 업무 자체의 규칙이에요. 특정 버튼이나 레이블과 관계없이 성립해야 해요.               |
| 표현 로직          | 로딩 문구, 날짜 문자열, 버튼 활성화처럼 데이터를 화면에 어떤 형태로 보여줄지 정하는 로직이에요.                             |
| 결합도             | 한 코드가 다른 코드의 구체적인 구현을 얼마나 많이 아는지 나타내요. 많이 알수록 함께 수정될 가능성이 커져요.                 |

이 문서에서는 다음 내용을 설명해요.

- Model, View, Controller의 책임
- UIKit에서 사용자 입력과 화면 갱신이 흐르는 순서
- `UIViewController`가 지나치게 커지는 이유
- Model과 외부 통신을 Controller에서 분리하는 방법
- MVC, MVVM, MVI의 차이와 선택 기준

## MVC는 객체를 변경 이유에 따라 나눠요

Apple의 [Model-View-Controller 문서](https://developer.apple.com/library/archive/documentation/General/Conceptual/CocoaEncyclopedia/Model-View-Controller/Model-View-Controller.html)는 세 역할을 다음처럼 설명해요.

- Model은 앱의 데이터와 그 데이터를 다루는 동작을 캡슐화해요.
- View는 Model의 내용을 표시하고 사용자의 입력을 받아요.
- Controller는 View와 Model 사이에서 입력, 상태 변경, 화면 갱신을 조정해요.

상품 목록을 불러오는 흐름은 다음처럼 표현할 수 있어요.

```text
사용자 입력
    │
    ▼
  View ─────> Controller ─────> Model
    ▲              │               │
    └──────── 화면 갱신 <───────────┘
```

화살표는 객체가 꼭 서로를 직접 참조해야 한다는 뜻이 아니에요. 핵심은 입력을 처리하고 결과를 화면에 반영하는 책임이 어느 역할에 있는지를 보여주는 거예요.

## Model은 UIKit을 몰라도 동작해야 해요

먼저 상품 데이터와 저장소의 약속을 정의해요.

```swift
struct Product: Decodable, Equatable, Sendable {
  let id: Int
  let name: String
  let price: Int
}

protocol ProductRepository: Sendable {
  func fetchProducts() async throws -> [Product]
}
```

`Product`와 `ProductRepository`에는 `UIView`, `UITableView`, 화면 색상 같은 UI 타입이 없어요. 이들은 상품 목록이라는 앱의 데이터를 표현하므로 Model 역할에 속해요.

실제 서버 구현도 Model 계층의 세부 구현으로 둘 수 있어요.

```swift
import Foundation

struct LiveProductRepository: ProductRepository {
  let session: URLSession
  let endpoint: URL

  func fetchProducts() async throws -> [Product] {
    let (data, _) = try await session.data(from: endpoint)
    return try JSONDecoder().decode([Product].self, from: data)
  }
}
```

이 구현은 네트워크와 JSON 형식을 알지만 화면이 표인지 그리드인지는 몰라요. 같은 Model을 UIKit 목록, SwiftUI 화면, 위젯에서 다시 사용할 수 있어요.

## 모든 코드를 View Controller에 넣으면 책임이 섞여요

처음에는 다음처럼 한 파일에서 빠르게 구현하기 쉬워요.

```swift
import UIKit

final class ProductListViewController: UITableViewController {
  private var products: [Product] = []

  override func viewDidLoad() {
    super.viewDidLoad()

    Task {
      do {
        let url = URL(string: "https://example.com/products")!
        let (data, _) = try await URLSession.shared.data(from: url)
        products = try JSONDecoder().decode([Product].self, from: data)
        tableView.reloadData()
      } catch {
        let alert = UIAlertController(
          title: "불러오기 실패",
          message: error.localizedDescription,
          preferredStyle: .alert
        )
        present(alert, animated: true)
      }
    }
  }
}
```

이 Controller는 너무 많은 사실을 알아요.

- 어떤 URL을 호출하는지 알아요.
- `URLSession`과 JSON 디코딩 방법을 알아요.
- 상품 배열을 보관해요.
- 테이블을 갱신하고 오류 화면도 만들어요.
- 화면 생명주기와 비동기 작업도 함께 관리해요.

기능이 늘면 이런 타입을 흔히 **Massive View Controller**라고 불러요. 문제는 파일의 줄 수 자체보다 서로 다른 변경 이유가 한 타입에 모인다는 점이에요. API 형식 변경과 화면 디자인 변경이 모두 같은 Controller를 수정하게 만들어요.

## Controller는 조정에 집중하게 만들어요

네트워크와 디코딩을 `ProductRepository` 뒤로 옮기고 Controller는 필요한 저장소를 외부에서 받아요.

```swift
import UIKit

@MainActor
final class ProductListViewController: UITableViewController {
  private let repository: any ProductRepository
  private var products: [Product] = []

  init(repository: any ProductRepository) {
    self.repository = repository
    super.init(style: .plain)
  }

  @available(*, unavailable)
  required init?(coder: NSCoder) {
    fatalError("init(coder:) has not been implemented")
  }

  override func viewDidLoad() {
    super.viewDidLoad()
    title = "상품"

    Task {
      await loadProducts()
    }
  }

  private func loadProducts() async {
    do {
      products = try await repository.fetchProducts()
      tableView.reloadData()
    } catch {
      presentError(message: error.localizedDescription)
    }
  }

  private func presentError(message: String) {
    let alert = UIAlertController(
      title: "불러오기 실패",
      message: message,
      preferredStyle: .alert
    )
    alert.addAction(UIAlertAction(title: "확인", style: .default))
    present(alert, animated: true)
  }
}
```

Controller는 여전히 화면 생명주기, 사용자 입력, View 갱신을 담당해요. 대신 서버 주소와 데이터 해석 방법은 몰라요. 저장소를 이니셜라이저로 받는 방식은 [의존성 주입](./dependency-injection.md)이에요.

앱 시작 지점에서 실제 구현을 조립해요.

```swift
let repository = LiveProductRepository(
  session: .shared,
  endpoint: URL(string: "https://example.com/products")!
)

let viewController = ProductListViewController(
  repository: repository
)
```

객체를 조립하는 코드와 사용하는 코드를 나누면 테스트나 미리보기에서 저장소 구현을 교체하기 쉬워져요.

## View는 표시와 입력 전달에 집중해요

UIKit의 View 객체는 화면을 그리고 이벤트를 발생시켜요. 버튼을 누르는 입력은 target-action으로 Controller에 전달할 수 있어요.

```swift
private lazy var retryButton: UIButton = {
  var configuration = UIButton.Configuration.filled()
  configuration.title = "다시 시도"

  return UIButton(
    configuration: configuration,
    primaryAction: UIAction { [weak self] _ in
      Task { await self?.loadProducts() }
    }
  )
}()
```

View가 서버에 직접 요청하거나 상품 가격 규칙을 판단하기 시작하면 역할 경계가 흐려져요. 반대로 폰트, 색상, 레이아웃, 애니메이션처럼 화면 표현에만 필요한 동작은 View에 남겨도 괜찮아요.

## Controller에 어느 정도 로직을 두어도 되나요

Controller에 모든 `if`와 `switch`가 있으면 잘못된 것은 아니에요. 로직이 답하는 질문으로 위치를 판단하세요.

| 질문                                            | 적합한 위치                      |
| ----------------------------------------------- | -------------------------------- |
| 상품이 주문 가능한가요?                         | Model의 도메인 규칙              |
| 상품을 언제 불러오나요?                         | Controller의 화면 흐름           |
| 오류를 경고창과 빈 화면 중 무엇으로 보여주나요? | Controller와 View의 표현 흐름    |
| 가격을 어떤 문자열로 보여주나요?                | 작은 Formatter 또는 표현 로직    |
| 다음 화면으로 언제 이동하나요?                  | Controller 또는 별도 Coordinator |

Controller가 Model의 규칙을 대신 구현하면 같은 규칙을 다른 화면에서 복사하게 돼요. 반대로 작은 화면 흐름까지 모두 별도 객체로 빼면 파일 탐색 비용만 늘어날 수 있어요.

## MVC와 UIKit의 View Controller는 같은 말이 아니에요

`UIViewController`는 UIKit이 제공하는 화면 관리 타입이고, MVC는 책임을 나누는 설계 패턴이에요.

Apple의 Cocoa 문서는 한 객체가 View와 Controller 역할을 함께 맡는 **View Controller**를 허용하지만, 가능한 한 각 역할의 주된 책임을 분명히 하라고 설명해요. 따라서 `UIViewController` 안에 코드를 작성했다는 사실만으로 그 코드가 모두 Controller 역할이 되는 것은 아니에요.

- API 응답을 해석하는 코드는 Model 또는 데이터 계층의 책임이에요.
- 할인 가능 여부를 판단하는 코드는 도메인 Model의 책임이에요.
- View 생명주기와 버튼 입력을 연결하는 코드는 Controller의 책임이에요.
- Auto Layout과 셀 모양은 View의 책임이에요.

역할 이름보다 **왜 이 코드가 바뀌는가**를 기준으로 경계를 찾는 편이 더 정확해요.

## MVC, MVVM, MVI는 연결 방식이 달라요

| 기준           | MVC                           | MVVM                                    | MVI                           |
| -------------- | ----------------------------- | --------------------------------------- | ----------------------------- |
| 화면 중간 역할 | Controller                    | ViewModel                               | Intent를 처리하는 Store·Model |
| 사용자 입력    | View가 Controller에 전달      | View가 ViewModel의 메서드나 입력을 호출 | View가 Intent를 전송          |
| 화면 상태 전달 | Controller가 View를 갱신      | View가 ViewModel 상태를 관찰·바인딩     | View가 하나의 State를 렌더링  |
| 상태 변경 경로 | Controller마다 달라질 수 있음 | ViewModel의 공개 API를 통해 변경        | Intent와 Reducer 경로로 제한  |
| 대표적인 비용  | Controller 비대화             | ViewModel 비대화와 양방향 변경 추적     | State·Intent·Effect 타입 증가 |

[MVVM](./mvvm.md)은 화면에 필요한 상태와 표현 로직을 ViewModel로 옮기고 관찰이나 바인딩으로 View를 갱신해요. [MVI](./mvi.md)는 모든 입력을 Intent로 표현하고 이전 State에서 다음 State를 만드는 한 방향 흐름을 강조해요.

패턴 이름만으로 품질이 결정되지는 않아요. MVC도 Model과 저장소가 잘 분리되어 있다면 충분히 테스트하고 확장할 수 있어요.

## 언제 사용해야 하나요

MVC가 잘 맞는 경우는 다음과 같아요.

- UIKit의 화면 생명주기와 target-action을 직접 다루는 화면이에요.
- 화면 상태와 사용자 흐름이 단순해요.
- Controller가 조정할 Model과 View의 수가 많지 않아요.
- 팀이 UIKit 기본 구조를 유지하면서 필요한 경계부터 분리하려고 해요.

다음 신호가 보이면 MVVM, MVI, Coordinator 또는 별도 서비스 분리를 검토하세요.

- Controller에 네트워크, 디코딩, 저장, 도메인 규칙이 함께 있어요.
- 로딩·빈 화면·오류·재시도처럼 상태 조합이 많아요.
- 같은 표현 로직을 여러 화면에서 반복해요.
- Controller 테스트를 위해 UIKit 객체를 지나치게 많이 준비해야 해요.
- 화면 전환 코드가 View Controller 전체를 가려요.

작은 정적 화면이라면 추가 추상화 없이 `UIViewController` 하나로도 충분할 수 있어요.

## 적용 순서를 정리해요

1. View Controller의 코드를 Model, View, Controller 역할로 표시해 보세요.
2. 네트워크, 데이터베이스, 디코딩 코드를 별도 저장소로 옮기세요.
3. 화면과 무관한 업무 규칙을 Model로 옮기세요.
4. Controller에는 생명주기, 입력 해석, 화면 갱신 순서를 남기세요.
5. 바뀔 가능성이 있는 저장소는 이니셜라이저로 주입하세요.
6. Controller가 계속 커지면 표현 상태는 ViewModel, 화면 전환은 Coordinator처럼 실제 변경 이유에 따라 나누세요.

## 면접에서 이어질 수 있는 질문

### MVC에서 Controller의 역할은 무엇인가요

View에서 발생한 입력을 해석해 Model에 필요한 작업을 요청하고, 결과가 View에 반영되도록 조정해요. 데이터 저장 규칙이나 UI 그리기 자체를 모두 담당하는 객체는 아니에요.

### Massive View Controller는 왜 생기나요

`UIViewController`가 화면 생명주기뿐 아니라 네트워크, 디코딩, 도메인 규칙, 화면 전환까지 맡을 때 생겨요. 줄 수보다 서로 다른 변경 이유가 한 타입에 모였는지를 먼저 확인해야 해요.

### UIKit 앱은 모두 MVC인가요

아니에요. UIKit이 `UIViewController`를 제공하고 MVC의 영향을 받았지만, 앱 코드의 책임과 데이터 흐름을 어떻게 설계했는지에 따라 MVC, MVVM, MVI 또는 혼합 구조가 될 수 있어요.

### Model은 데이터 구조만 의미하나요

아니에요. Model은 데이터뿐 아니라 그 데이터를 검증하고 변경하는 핵심 규칙도 포함해요. 저장소와 서비스처럼 외부 데이터를 제공하는 객체도 넓은 Model 계층에 둘 수 있어요.

## 참고 자료

- [Apple — Model-View-Controller](https://developer.apple.com/library/archive/documentation/General/Conceptual/CocoaEncyclopedia/Model-View-Controller/Model-View-Controller.html)
- [Apple — Cocoa Design Patterns](https://developer.apple.com/library/archive/documentation/Cocoa/Conceptual/CocoaFundamentals/CocoaDesignPatterns/CocoaDesignPatterns.html)
- [Apple — UIViewController](https://developer.apple.com/documentation/uikit/uiviewcontroller)
- [The Swift Programming Language — Protocols](https://docs.swift.org/swift-book/documentation/the-swift-programming-language/protocols/)
