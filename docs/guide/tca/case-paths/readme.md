---
title: CasePaths
description: Swift enum case를 key path처럼 추출·삽입·수정·조합하는 CasePaths의 @CasePathable, CaseKeyPath, 동적 case 조회 활용법을 설명합니다.
---

# 🧰 CasePaths

원문: [pointfreeco/swift-case-paths README](https://github.com/pointfreeco/swift-case-paths)

Case paths는 enum case까지 key path 계층을 확장합니다.

- [공식 API 문서](https://swiftpackageindex.com/pointfreeco/swift-case-paths/main/documentation/casepaths)
- [CI 상태](https://actions-badge.atrox.dev/pointfreeco/swift-case-paths/goto)
- [Point-Free Community Slack](http://pointfree.co/slack-invite)
- [지원 Swift 버전](https://swiftpackageindex.com/pointfreeco/swift-case-paths)
- [지원 플랫폼](https://swiftpackageindex.com/pointfreeco/swift-case-paths)

## 동기

Swift는 모든 struct와 class property에 [key path](https://developer.apple.com/documentation/swift/swift_standard_library/key-path_expressions)를 제공합니다.

```swift
struct User {
  let id: Int
  var name: String
}

\User.id    // KeyPath<User, Int>
\User.name  // WritableKeyPath<User, String>
```

이는 compiler가 생성하는 코드예요. 구조의 일부를 추상적으로 들여다보고 변경한 뒤, 그 변경을 전체 구조에 전파할 수 있습니다. key path는 SwiftUI [Binding](<https://developer.apple.com/documentation/swiftui/bindable/subscript(dynamicmember:)>)처럼 [dynamic member lookup](https://github.com/apple/swift-evolution/blob/master/proposals/0252-keypath-dynamic-member-lookup.md)으로 동작하는 현대 Swift API의 기반이며, SwiftUI [environment](<https://developer.apple.com/documentation/swiftui/scene/environment(_:_:)>)와 [unsafe mutable pointer](<https://developer.apple.com/documentation/swift/unsafemutablepointer/pointer(to:)-8veyb>)에서도 직접 사용돼요.

하지만 enum case에는 같은 구조가 없습니다.

```swift
enum UserAction {
  case home(HomeAction)
  case settings(SettingsAction)
}

\UserAction.home  // 🛑
```

> 🛑 key path cannot refer to static member 'home'

그래서 enum의 특정 case 데이터를 들여다보고 수정하는 제네릭 코드를 작성할 수 없어요.

## 라이브러리에서 case path 사용하기

case path는 다른 개발자에게 배포하는 라이브러리 내부 도구로 가장 많이 사용됩니다. [The Composable Architecture](http://github.com/pointfreeco/swift-composable-architecture), [SwiftUI Navigation](http://github.com/pointfreeco/swiftui-navigation), [Parsing](http://github.com/pointfreeco/swift-parsing)을 비롯한 여러 라이브러리가 case path를 사용해요.

사용자가 enum으로 domain을 모델링하리라 예상하는 라이브러리를 유지한다면, case path 도구를 제공해 domain을 더 작은 단위로 나누도록 도울 수 있습니다. 예를 들어 SwiftUI의 `Binding` 타입을 살펴보겠습니다.

```swift
struct Binding<Value> {
  let get: () -> Value
  let set: (Value) -> Void
}
```

[dynamic member lookup](https://github.com/apple/swift-evolution/blob/master/proposals/0252-keypath-dynamic-member-lookup.md)을 사용하면 값의 member로 향하는 새 binding을 dot-chaining 문법으로 만들 수 있어요.

```swift
@dynamicMemberLookup
struct Binding<Value> {
  …
  subscript<Member>(dynamicMember keyPath: WritableKeyPath<Value, Member>) -> Binding<Member> {
    Binding<Member>(
      get: { self.get()[keyPath: keyPath] },
      set: {
        var value = self.get()
        value[keyPath: keyPath] = $0
        self.set(value)
      }
    )
  }
}
```

`User` binding이 있다면 `.name`을 덧붙여 이름을 가리키는 binding을 즉시 만들 수 있습니다.

```swift
let user: Binding<User> = // ...
let name: Binding<String> = user.name
```

하지만 enum에는 이런 편의 기능이 없어요.

```swift
enum Destination {
  case home(HomeState)
  case settings(SettingsState)
}
let destination: Binding<Destination> = // ...
destination.home      // 🛑
destination.settings  // 🛑
```

단순한 dot-chaining만으로 `Destination` binding에서 `home` case만 가리키는 binding을 파생할 수는 없습니다.

SwiftUI가 CasePaths 라이브러리를 사용했다면 이 도구를 쉽게 제공할 수 있었을 거예요. enum의 한 case를 가리키는 key path인 `CaseKeyPath`를 받는 `dynamicMember` subscript를 추가해, enum binding에서 특정 case binding을 파생할 수 있습니다.

```swift
import CasePaths

extension Binding {
  public subscript<Case>(dynamicMember keyPath: CaseKeyPath<Value, Case>) -> Binding<Case>?
  where Value: CasePathable {
    Binding<Case>(
      unwrapping: Binding<Case?>(
        get: { self.wrappedValue[case: keyPath] },
        set: { newValue, transaction in
          guard let newValue else { return }
          self.transaction(transaction).wrappedValue[case: keyPath] = newValue
        }
      )
    )
  }
}
```

이제 enum에 `@CasePathable` macro를 붙이면 enum binding에서 dot-chaining으로 case binding을 파생할 수 있어요.

```swift
@CasePathable
enum Destination {
  case home(HomeState)
  case settings(SettingsState)
}
let destination: Binding<Destination> = // ...
destination.home      // Binding<HomeState>?
destination.settings  // Binding<SettingsState>?
```

이 예시는 library가 enum을 활용하는 사용자를 지원하면서도 struct가 주는 사용성을 잃지 않게 하는 방법을 보여 줍니다.

## Case path 기본

library tooling이 가장 큰 사용 사례이지만, first-party 코드에서도 case path를 사용할 수 있어요. CasePaths는 enum case용 key path인 case path를 도입해 struct와 enum 사이의 간극을 메웁니다.

`@CasePathable` macro로 enum에서 case path를 활성화할 수 있습니다.

```swift
@CasePathable
enum UserAction {
  case home(HomeAction)
  case settings(SettingsAction)
}
```

case-pathable enum은 `Cases` namespace에서 case path를 만들 수 있어요.

```swift
\UserAction.Cases.home      // CaseKeyPath<UserAction, HomeAction>
\UserAction.Cases.settings  // CaseKeyPath<UserAction, SettingsAction>
```

enum type을 추론할 수 있다면 다른 key path처럼 줄여 쓸 수 있습니다.

```swift
\.home as CaseKeyPath<UserAction, HomeAction>
\.settings as CaseKeyPath<UserAction, SettingsAction>
```

### Case path와 key path 비교

#### 값 추출·삽입·수정·검사

key path가 root 구조에서 값을 가져오고 설정하는 기능을 묶는 것처럼, case path는 root enum에서 연관 값을 선택적으로 추출하고 수정하는 기능을 묶습니다.

```swift
user[keyPath: \User.name] = "Blob"
user[keyPath: \.name]  // "Blob"

userAction[case: \UserAction.Cases.home] = .onAppear
userAction[case: \.home]  // Optional(HomeAction.onAppear)
```

case가 일치하지 않으면 추출에 실패해 `nil`을 반환할 수 있어요.

```swift
userAction[case: \.settings]  // nil
```

case path에는 연관 값을 새로운 root로 삽입하는 기능도 있습니다.

```swift
let userActionToHome = \UserAction.Cases.home
userActionToHome(.onAppear)  // UserAction.home(.onAppear)
```

case-pathable enum의 `is` method로 case를 검사할 수 있습니다.

```swift
userAction.is(\.home)      // true
userAction.is(\.settings)  // false

let actions: [UserAction] = […]
let homeActionsCount = actions.count(where: { $0.is(\.home) })
```

`modify` method로 연관 값을 제자리에서 변경할 수 있습니다.

```swift
var result = Result<String, Error>.success("Blob")
result.modify(\.success) {
  $0 += ", Jr."
}
result  // Result.success("Blob, Jr.")
```

#### 경로 조합

case path는 key path처럼 조합할 수 있어요. 익숙한 dot-chaining으로 enum 안의 enum case까지 더 깊이 들어갈 수 있습니다.

```swift
\HighScore.user.name
// WritableKeyPath<HighScore, String>

\AppAction.Cases.user.home
// CaseKeyPath<AppAction, HomeAction>
```

또는 `append(path:)`로 경로를 이어 붙일 수 있습니다.

```swift
let highScoreToUser = \HighScore.user
let userToName = \User.name
let highScoreToUserName = highScoreToUser.append(path: userToName)
// WritableKeyPath<HighScore, String>

let appActionToUser = \AppAction.Cases.user
let userActionToHome = \UserAction.Cases.home
let appActionToHome = appActionToUser.append(path: userActionToHome)
// CaseKeyPath<AppAction, HomeAction>
```

#### Identity path

case path도 key path처럼 [identity](https://github.com/apple/swift-evolution/blob/master/proposals/0227-identity-keypath.md) path를 제공해요. key path와 case path를 받는 API에서 전체 구조를 다루고 싶을 때 유용합니다.

```swift
\User.self              // WritableKeyPath<User, User>
\UserAction.Cases.self  // CaseKeyPath<UserAction, UserAction>
```

#### Property 접근

Swift 5.2부터 key path expression을 `map` 같은 method에 직접 전달할 수 있어요. dynamic member lookup을 붙인 case-pathable enum은 각 case에 property 접근과 key path expression을 사용할 수 있습니다.

```swift
@CasePathable
@dynamicMemberLookup
enum UserAction {
  case home(HomeAction)
  case settings(SettingsAction)
}

let userAction: UserAction = .home(.onAppear)
userAction.home      // Optional(HomeAction.onAppear)
userAction.settings  // nil

let userActions: [UserAction] = [.home(.onAppear), .settings(.purchaseButtonTapped)]
userActions.compactMap(\.home)  // [HomeAction.onAppear]
```

#### Dynamic case lookup

case key path는 내부적으로 실제 key path이므로 dynamic member lookup처럼 같은 용도로 사용할 수 있어요. 예를 들어 SwiftUI binding에 subscript를 추가해 enum case까지 확장할 수 있습니다.

```swift
extension Binding {
  subscript<Member>(
    dynamicMember keyPath: CaseKeyPath<Value, Member>
  ) -> Binding<Member>? {
    guard let member = self.wrappedValue[case: keyPath]
    else { return nil }
    return Binding<Member>(
      get: { self.wrappedValue[case: keyPath] ?? member },
      set: { self.wrappedValue[case: keyPath] = $0 }
    )
  }
}

@CasePathable enum ItemStatus {
  case inStock(quantity: Int)
  case outOfStock(isOnBackOrder: Bool)
}

struct ItemStatusView: View {
  @Binding var status: ItemStatus

  var body: some View {
    switch self.status {
    case .inStock:
      self.$status.inStock.map { $quantity in
        Section {
          Stepper("Quantity: \(quantity)", value: $quantity)
          Button("Mark as sold out") {
            self.item.status = .outOfStock(isOnBackOrder: false)
          }
        } header: {
          Text("In stock")
        }
      }
    case .outOfStock:
      self.$status.outOfStock.map { $isOnBackOrder in
        Section {
          Toggle("Is on back order?", isOn: $isOnBackOrder)
          Button("Is back in stock!") {
            self.item.status = .inStock(quantity: 1)
          }
        } header: {
          Text("Out of stock")
        }
      }
    }
  }
}
```

> 참고: 위 코드는 [SwiftUINavigation](https://github.com/pointfreeco/swiftui-navigation) 라이브러리가 제공하는 subscript를 단순화한 버전이에요.

#### Computed path

모든 property에는 computed property까지 포함해 key path가 생성됩니다. 그렇다면 case path의 “computed” 버전은 무엇일까요? case-pathable enum의 `AllCasePaths` type을 확장해 custom case의 `embed`과 `extract` 기능을 구현하는 property를 만들 수 있습니다.

```swift
@CasePathable
enum Authentication {
  case authenticated(accessToken: String)
  case unauthenticated
}

extension Authentication.AllCasePaths {
  var encrypted: AnyCasePath<Authentication, String> {
    AnyCasePath(
      embed: { decryptedToken in
        .authenticated(token: encrypt(decryptedToken))
      },
      extract: { authentication in
        guard
          case let .authenticated(encryptedToken) = authentication,
          let decryptedToken = decrypt(token)
        else { return nil }
        return decryptedToken
      }
    )
  }
}

\Authentication.Cases.encrypted
// CaseKeyPath<Authentication, String>
```

## 사례 연구

- [**SwiftUINavigation**](https://github.com/pointfreeco/swiftui-navigation)은 enum을 사용하는 navigation을 포함해 SwiftUI binding을 구동하는 데 case path를 사용해요.
- [**The Composable Architecture**](https://github.com/pointfreeco/swift-composable-architecture)는 큰 feature를 더 작은 feature로 나누고 key path와 case path로 다시 조립할 수 있게 해요.
- [**Parsing**](https://github.com/pointfreeco/swift-parsing)은 case path를 사용해 구조화되지 않은 데이터를 enum으로 바꾸고 다시 되돌립니다.

case path를 사용하는 프로젝트를 공유하고 싶다면 [PR을 열어](https://github.com/pointfreeco/swift-case-paths/edit/main/README.md) 링크를 추가해 주세요.

## 커뮤니티

이 라이브러리 사용법을 논의하거나 질문이 있다면 [Point-Free](http://www.pointfree.co) 사용자들과 대화할 수 있는 곳이 몇 군데 있어요.

- 긴 형식의 논의는 이 저장소의 [Discussions](http://github.com/pointfreeco/swift-case-paths/discussions)를 권장해요.
- 가벼운 대화는 [Point-Free Community Slack](http://pointfree.co/slack-invite)을 이용하세요.

## 문서

최신 CasePaths API 문서는 [Swift Package Index](https://swiftpackageindex.com/pointfreeco/swift-case-paths/main/documentation/casepaths)에서 볼 수 있어요.

## 크레딧과 감사

이 라이브러리가 이전에 case path를 구현할 때 사용한 초기 reflection 기반 해법은 [Giuseppe Lanza](https://github.com/gringoireDM)의 [EnumKit](https://github.com/gringoireDM/EnumKit)에서 영감을 받았습니다.

## 더 알아보기

이 개념과 더 많은 주제는 [Point-Free](https://www.pointfree.co)에서 깊이 다뤄요. Point-Free는 [Brandon Williams](https://github.com/mbrandonw)와 [Stephen Celis](https://github.com/stephencelis)가 진행하는 functional programming과 Swift를 다루는 비디오 시리즈입니다.

이 라이브러리의 설계는 다음 Point-Free 에피소드에서 다뤄졌어요.

- [Episode 87](https://www.pointfree.co/episodes/ep87-the-case-for-case-paths-introduction): The Case for Case Paths: Introduction
- [Episode 88](https://www.pointfree.co/episodes/ep88-the-case-for-case-paths-properties): The Case for Case Paths: Properties
- [Episode 89](https://www.pointfree.co/episodes/ep89-case-paths-for-free): Case Paths for Free

[![Episode 87: The Case for Case Paths: Introduction](https://d3rccdn33rt8ze.cloudfront.net/episodes/0087.jpeg)](https://www.pointfree.co/episodes/ep87-the-case-for-case-paths-introduction)

## 라이선스

모든 module은 MIT license로 배포됩니다. 자세한 내용은 [LICENSE](https://github.com/pointfreeco/swift-case-paths/blob/main/LICENSE)를 참고하세요.
