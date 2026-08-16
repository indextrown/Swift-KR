---
title: Swift로 이해하는 Identifiable
description: Identifiable의 stable identity와 ID 범위·수명, SwiftUI List diffing, ObjectIdentifier 기본 구현과 안전한 ID 설계 기준을 설명합니다.
pageType: doc-wide
outline: false
---

# Swift로 이해하는 Identifiable

> **면접 답변 한 줄 요약:** `Identifiable`은 값의 다른 프로퍼티가 바뀌어도 같은 entity임을 추적할 수 있도록 `Hashable`한 `id`를 제공하는 프로토콜이며, ID의 고유 범위와 유지 기간은 타입과 소비자가 함께 합의해야 해요.

독서 기록의 메모나 시간이 바뀌어도 화면은 기존 row가 수정된 것인지 새 row가 생긴 것인지 알아야 해요. 값 전체를 identity로 사용하면 변경할 때마다 다른 항목으로 보이고, 배열 index를 사용하면 삽입과 정렬 때 다른 항목이 같은 identity를 차지할 수 있어요.

`Identifiable`은 entity의 stable identity를 `id` 하나로 표현해요. 하지만 프로토콜이 전 세계에서 영구히 유일한 ID를 자동으로 보장하지는 않아요. 현재 collection 안에서만 고유한 index부터 database에 영속하는 UUID까지 범위가 다양해요.

이 문서에서는 다음 내용을 설명해요.

- entity identity와 값 동등성의 차이
- `ID: Hashable`과 associated type의 의미
- SwiftUI `List`와 `ForEach`가 identity를 사용하는 이유
- UUID, database ID, 임시 ID와 `ObjectIdentifier`의 수명
- 계산할 때마다 바뀌는 ID와 `\.self` 오용
- ID를 API와 persistence 경계에서 설계하는 방법

## 먼저 알아둘 identity 용어

| 용어               | 쉬운 뜻                                                                                                                 |
| ------------------ | ----------------------------------------------------------------------------------------------------------------------- |
| entity             | 시간이 지나 프로퍼티가 바뀌어도 같은 대상으로 추적할 개체예요. 사용자, 주문과 독서 기록이 예예요.                       |
| identity           | 변화 전후의 값이 같은 entity를 나타내는지 판단하는 기준이에요.                                                          |
| stable identity    | 소비자가 추적해야 하는 기간 동안 바뀌지 않는 identity예요.                                                              |
| associated type    | 프로토콜을 따르는 각 구체 타입이 정하는 내부 타입 자리예요. `Identifiable.ID`가 한 예예요.                              |
| diffing            | 이전 collection과 새 collection을 비교해 삽입·삭제·이동·수정을 찾는 과정이에요.                                         |
| scope              | ID가 서로 겹치지 않는다고 보장하는 범위예요. 한 배열, 한 process, 한 database나 전체 service일 수 있어요.               |
| lifetime           | ID가 같은 entity를 계속 가리킨다고 보장하는 기간이에요. 화면 표시 동안, process 동안 또는 영구 저장 기간일 수 있어요.   |
| `ObjectIdentifier` | 실행 중 특정 클래스 인스턴스나 metatype의 identity를 나타내는 값이에요. 객체가 살아 있는 동안만 그 identity를 의미해요. |

## 값 전체를 identity로 사용하면 수정도 삭제·삽입처럼 보여요

```swift
struct ReadingSession: Hashable {
  var bookTitle: String
  var minutes: Int
}

let before = ReadingSession(
  bookTitle: "Swift",
  minutes: 20
)
let after = ReadingSession(
  bookTitle: "Swift",
  minutes: 30
)
```

두 값은 독서 시간이 달라 `Hashable`과 `Equatable` 관점에서 다른 값이에요. 하지만 사용자가 기존 session의 시간을 수정한 것이라면 entity 관점에서는 같은 기록이에요.

SwiftUI에서 다음처럼 `\.self`를 ID로 사용하면 모든 hashable 값이 identity가 돼요.

```swift
ForEach(sessions, id: \.self) { session in
  Text("\(session.bookTitle): \(session.minutes)분")
}
```

`minutes`가 바뀌면 ID도 바뀌므로 framework가 기존 row의 수정이 아니라 이전 row 삭제와 새 row 삽입으로 해석할 수 있어요. animation, selection과 row 내부 state가 의도와 다르게 연결될 수 있어요.

## `Identifiable`은 별도의 stable ID를 제공해요

```swift
import Foundation

struct ReadingSession: Identifiable, Equatable {
  let id: UUID
  var bookTitle: String
  var minutes: Int
}

let id = UUID()
let before = ReadingSession(
  id: id,
  bookTitle: "Swift",
  minutes: 20
)
let after = ReadingSession(
  id: id,
  bookTitle: "Swift",
  minutes: 30
)

before.id == after.id // true: 같은 entity예요.
before == after       // false: 현재 값은 달라요.
```

`id`는 수정 전후에 유지되고 나머지 값은 자유롭게 바뀔 수 있어요. 이것이 identity와 equality가 분리되는 대표적인 예예요.

프로토콜의 핵심 모양은 다음과 같아요.

```swift
protocol Identifiable<ID> {
  associatedtype ID: Hashable
  var id: ID { get }
}
```

실제 표준 라이브러리 선언은 언어 버전에 따른 세부 제약을 더 포함할 수 있어요. 중요한 점은 각 타입이 `String`, `Int`, UUID 같은 자신의 ID 타입을 선택하고, 그 ID가 `Hashable`해야 한다는 것이에요.

## SwiftUI는 ID로 row의 수명을 연결해요

원소가 `Identifiable`이면 `List`와 `ForEach`에서 `id` key path를 생략할 수 있어요.

```swift
import SwiftUI

struct ReadingListView: View {
  let sessions: [ReadingSession]

  var body: some View {
    List(sessions) { session in
      Text("\(session.bookTitle): \(session.minutes)분")
    }
  }
}
```

SwiftUI는 이전과 새 data의 ID를 비교해 어떤 row가 유지·삽입·삭제·이동됐는지 판단해요. ID가 같다고 모든 내용이 같다는 뜻은 아니며, 같은 ID의 내용 변경은 기존 view identity 안에서 다시 rendering할 근거가 돼요.

좋은 row ID는 다음 조건을 만족해요.

- 같은 collection snapshot 안에서 중복되지 않아요.
- 해당 entity를 추적해야 하는 동안 바뀌지 않아요.
- 정렬 순서나 화면 위치와 독립적이에요.
- 서버나 database가 identity를 소유한다면 그 값을 유지해요.
- 임시 entity라면 서버 ID를 받기 전후의 migration 규칙이 있어요.

## 계산할 때마다 UUID를 만들면 stable identity가 아니에요

다음 구현은 `id`를 읽을 때마다 다른 값을 반환해요.

```swift
struct UnstableSession: Identifiable {
  var id: UUID { UUID() } // 잘못된 예예요.
  var minutes: Int
}
```

같은 instance에서도 `session.id == session.id`가 `false`가 될 수 있어요. diffing은 매 update마다 모든 row를 새 항목으로 볼 수 있어요.

ID는 저장하거나 외부의 안정적인 key에서 계산해요.

```swift
import Foundation

struct DraftSession: Identifiable {
  let id = UUID()
  var minutes: Int
}
```

이 ID는 `DraftSession` value를 새로 만드는 시점에 한 번 생성돼요. 하지만 앱을 종료하고 복원할 때도 같은 entity여야 한다면 `id`도 함께 encode해 저장해야 해요.

## ID의 범위와 수명을 문서화해요

Apple의 공식 `Identifiable` 문서는 identity의 범위와 기간을 일부러 고정하지 않아요. 다음 선택이 모두 가능해요.

| ID 예시                    | 고유 범위와 수명                            | 적합한 상황                                |
| -------------------------- | ------------------------------------------- | ------------------------------------------ |
| collection index           | 현재 collection 구성과 순서가 유지되는 동안 | 변경되지 않는 정적 목록의 일시적 표시      |
| 증가하는 process 내부 번호 | 현재 process가 살아 있는 동안               | 디버깅용 작업 추적                         |
| `ObjectIdentifier`         | 해당 class instance가 살아 있는 동안        | 같은 메모리 객체인지 추적                  |
| database primary key       | database가 record를 유지하는 동안           | 저장된 entity 추적                         |
| UUID                       | 생성 충돌 가능성이 매우 낮은 넓은 범위      | client가 새 entity identity를 먼저 만들 때 |
| server가 발급한 ID         | service의 계약이 보장하는 기간과 namespace  | 여러 device가 공유하는 원격 entity         |

한 화면 안에서만 유일한 ID를 app 전체 cache key로 사용하면 충돌할 수 있어요. 반대로 짧게 표시할 값에 항상 전역 UUID가 필요한 것은 아니에요. 소비자가 요구하는 범위를 먼저 정하세요.

## 클래스의 기본 ID는 객체 수명만 보장해요

클래스는 `ObjectIdentifier` 기반 기본 구현을 사용할 수 있어요.

```swift
final class ReadingController: Identifiable {
  var minutes = 0
}

let first = ReadingController()
let alias = first
let second = ReadingController()

first.id == alias.id  // true
first.id == second.id // false
```

이 기본 ID는 같은 class instance를 추적하는 데 적합하지만 앱 재실행 뒤 같은 database record를 나타내지 못해요. 객체가 사라지면 identity의 의미도 끝나고, 나중에 메모리 주소가 재사용될 수 있어요.

도메인에 더 강한 identity가 있다면 직접 제공해요.

```swift
final class User: Identifiable {
  let id: String
  var displayName: String

  init(id: String, displayName: String) {
    self.id = id
    self.displayName = displayName
  }
}
```

## 배열 index는 변경 가능한 목록의 entity ID가 아니에요

```swift
ForEach(sessions.indices, id: \.self) { index in
  SessionRow(session: sessions[index])
}
```

첫 원소를 삭제하면 뒤 원소의 index가 모두 바뀌어요. `1`이라는 ID가 이전에는 두 번째 session을, 이후에는 원래 세 번째 session을 가리킬 수 있어요. row state가 다른 data에 붙는 문제가 생길 수 있어요.

index는 위치를 나타내지 entity를 나타내지 않아요. 목록이 삽입·삭제·정렬될 수 있다면 원소가 가진 stable ID를 사용하세요. 정말 변하지 않는 정적 범위라면 index도 해당 짧은 scope에서 유효할 수 있어요.

## 임시 ID와 서버 ID가 바뀌는 순간을 설계해요

새 기록을 offline에서 만든 뒤 server가 ID를 발급하는 앱을 생각해요.

```swift
struct SessionID: Hashable, Codable {
  enum Storage: Hashable, Codable {
    case local(UUID)
    case remote(String)
  }

  let storage: Storage
}
```

local ID를 remote ID로 단순 교체하면 UI 관점의 identity도 바뀌어요. 화면에서 새 row로 전환되어도 괜찮은지, mapping table로 local identity를 계속 유지할지, server가 client UUID를 받아 같은 ID를 쓸지 결정해야 해요.

정답은 backend 계약에 따라 달라요. 중요한 점은 ID 전환을 우연히 일어나게 두지 않고 selection, cache, navigation과 sync queue가 어떤 key를 사용하는지 함께 설계하는 것이에요.

## `Identifiable`과 다른 프로토콜을 비교해요

| 프로토콜                   | 기준                                      | 같은 ID인데 다른 값이 가능한가요? |
| -------------------------- | ----------------------------------------- | --------------------------------- |
| [`Equatable`](./equatable) | 현재 값 전체의 의미상 동등성              | 네.                               |
| [`Hashable`](./hashable)   | 동등한 값을 hash collection에서 찾는 규칙 | 네.                               |
| `Identifiable`             | entity를 추적하는 stable ID               | 네. 일반적인 변경 상황이에요.     |
| [`Codable`](./codable)     | 외부 표현으로 encode·decode 가능한지      | identity를 보장하지 않아요.       |

`Identifiable`은 `Equatable`이나 `Codable`을 상속하지 않아요. ID만 있으면 되고 나머지 값 비교와 serialization 여부는 별도의 선택이에요.

## 언제 `Identifiable`을 사용해야 하나요

- SwiftUI `List`와 `ForEach`에서 변경 가능한 entity 목록을 표시해요.
- 이전 snapshot과 새 snapshot 사이에서 같은 항목을 추적해야 해요.
- navigation destination, selection이나 cache가 entity key를 필요로 해요.
- 값의 내용과 별개로 유지되는 database 또는 server identity가 있어요.

순수 계산 결과처럼 값 동등성만 중요하고 entity 수명이 없다면 `Equatable`만으로 충분할 수 있어요. 모든 작은 value type에 UUID를 추가하면 불필요한 identity와 저장 비용이 생겨요.

## 적용 순서를 정리해요

1. 이 타입이 시간이 지나도 같은 대상으로 추적할 entity인지 판단해요.
2. ID가 고유해야 하는 scope와 유지해야 하는 lifetime을 정의해요.
3. database·server가 ID를 소유한다면 그 key를 사용해요.
4. client에서 새 entity를 만든다면 ID를 한 번 생성하고 필요한 저장 경계에 포함해요.
5. 계산 프로퍼티에서 매번 UUID를 만들거나 변경 목록에 index를 사용하지 않아요.
6. ID 변경이 불가피하면 UI, cache, navigation과 sync의 migration을 함께 설계해요.
7. equality, hashing과 encoding은 identity와 별도 계약으로 검토해요.

## 면접에서 이어질 수 있는 질문

### `Identifiable`의 `ID`는 왜 `Hashable`이어야 하나요?

framework와 collection이 ID를 key로 빠르게 저장하고 비교할 수 있어야 하기 때문이에요. ID 자체의 hash 가능성이 entity 전체가 `Hashable`이라는 뜻은 아니에요.

### `Identifiable`이면 `Equatable`도 자동으로 준수하나요?

아니요. 두 프로토콜은 독립적이에요. `Identifiable`은 같은 entity를 추적하고 `Equatable`은 현재 두 값이 의미상 같은지를 정의해요.

### SwiftUI에서 `id: \.self`는 언제 안전한가요?

원소 값 자체가 고유하고 표시되는 동안 절대 바뀌지 않을 때만 적합해요. 중복되거나 수정 가능한 값이라면 별도의 stable ID를 제공하는 편이 안전해요.

### 클래스가 제공하는 기본 `id`를 database ID로 써도 되나요?

안 돼요. 기본 `ObjectIdentifier`는 해당 객체가 살아 있는 동안의 instance identity만 나타내요. 영속 entity에는 database나 server가 보장하는 ID를 직접 구현해야 해요.

## 참고 자료

- [Apple Developer — Identifiable](https://developer.apple.com/documentation/swift/identifiable)
- [Apple Developer — ObjectIdentifier](https://developer.apple.com/documentation/swift/objectidentifier)
- [Apple Developer — ForEach](https://developer.apple.com/documentation/swiftui/foreach)
- [Apple Developer — List](https://developer.apple.com/documentation/swiftui/list)
- [Swift Evolution SE-0261 — Identifiable Protocol](https://github.com/swiftlang/swift-evolution/blob/main/proposals/0261-identifiable.md)
- [Swift-KR — Swift로 이해하는 Equatable](./equatable)
- [Swift-KR — Swift로 이해하는 Hashable](./hashable)
