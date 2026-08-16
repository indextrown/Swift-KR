---
title: Swift로 이해하는 Codable
description: Codable과 Encodable·Decodable의 관계, 자동 합성, CodingKeys, JSON 전략, custom decoding과 schema 변경 대응을 설명합니다.
pageType: doc-wide
outline: false
---

# Swift로 이해하는 Codable

> **면접 답변 한 줄 요약:** `Codable`은 `Encodable & Decodable`의 type alias로 Swift 값을 encoder가 다루는 외부 표현으로 내보내고 decoder로 복원하는 공통 계약이며, 실제 JSON 형식과 호환성은 `CodingKeys`, 전략과 custom 구현으로 설계해요.

서버 JSON을 dictionary로 직접 읽으면 key 오타, type 변환과 optional 처리가 앱 전체에 흩어져요. 저장할 때는 반대 변환 코드를 다시 작성해야 하고 model이 바뀔수록 두 방향이 어긋나기 쉬워요.

Swift 표준 라이브러리는 `Encodable`과 `Decodable`이라는 형식 독립적인 계약을 제공하고 Foundation은 `JSONEncoder`, `JSONDecoder`, property list encoder 같은 구체 형식 도구를 제공해요. `Codable` 자체가 JSON protocol인 것은 아니에요.

이 문서에서는 다음 내용을 설명해요.

- `Encodable`, `Decodable`, `Codable`의 관계
- 저장 프로퍼티를 이용한 자동 합성
- `CodingKeys`로 외부 key를 매핑하고 제외하는 방법
- 날짜와 snake case 같은 `JSONEncoder`·`JSONDecoder` 전략
- 누락 key, `null`, 기본값과 `DecodingError` 처리
- schema version 변경과 DTO·domain model 분리 기준

## 먼저 알아둘 serialization 용어

| 용어                   | 쉬운 뜻                                                                                                        |
| ---------------------- | -------------------------------------------------------------------------------------------------------------- |
| encoding               | 메모리의 Swift 값을 JSON, property list 같은 외부 표현으로 변환하는 과정이에요.                                |
| decoding               | 외부 표현을 읽어 Swift 값으로 복원하는 과정이에요.                                                             |
| serialization          | 값을 저장하거나 전송할 수 있는 연속된 표현으로 바꾸고 다시 복원하는 전체 과정이에요.                           |
| encoder·decoder        | 구체 형식의 container를 만들고 값을 쓰거나 읽는 객체예요.                                                      |
| schema                 | 외부 data가 어떤 key, type과 중첩 구조를 가지는지 정한 계약이에요.                                             |
| `CodingKey`            | keyed container에서 외부 field 이름이나 index를 표현하는 프로토콜이에요.                                       |
| keyed container        | JSON object처럼 이름 있는 key와 value를 읽고 쓰는 coding container예요.                                        |
| unkeyed container      | JSON array처럼 순서대로 값을 읽고 쓰는 container예요.                                                          |
| single-value container | 문자열이나 숫자처럼 하나의 값을 읽고 쓰는 container예요.                                                       |
| DTO                    | Data Transfer Object의 줄임말로 network나 저장 schema 전달에 맞춘 타입이에요. domain model과 분리할 수 있어요. |

## dictionary로 직접 읽으면 type 안전성이 사라져요

```swift
let object = try JSONSerialization.jsonObject(
  with: data
)
let dictionary = object as? [String: Any]

let title = dictionary?["book_title"] as? String
let minutes = dictionary?["minutes"] as? Int
```

`book_title` 오타와 type 불일치는 실행할 때 발견돼요. 중첩 object와 array가 늘어나면 casting code가 길어지고 어떤 field가 필수인지 타입만 보고 알기 어려워요.

`Decodable` model은 schema 기대를 Swift type으로 옮겨요.

```swift
import Foundation

struct ReadingRecord: Decodable {
  let bookTitle: String
  let minutes: Int

  enum CodingKeys: String, CodingKey {
    case bookTitle = "book_title"
    case minutes
  }
}

let record = try JSONDecoder().decode(
  ReadingRecord.self,
  from: data
)
```

필수 문자열이나 정수가 없거나 type이 다르면 decoder가 구체적인 오류를 던져요. 호출부는 optional casting 여러 개 대신 성공한 `ReadingRecord` 또는 decoding 실패를 다뤄요.

## `Codable`은 두 프로토콜을 묶은 type alias예요

표준 라이브러리의 관계는 다음과 같아요.

```swift
protocol Encodable {
  func encode(to encoder: any Encoder) throws
}

protocol Decodable {
  init(from decoder: any Decoder) throws
}

typealias Codable = Encodable & Decodable
```

실제 선언의 세부 표기는 Swift 버전에 따라 달라질 수 있지만 역할은 같아요.

| 준수        | 가능한 방향          | 예시                                     |
| ----------- | -------------------- | ---------------------------------------- |
| `Encodable` | Swift 값 → 외부 표현 | analytics event request를 보내기만 해요. |
| `Decodable` | 외부 표현 → Swift 값 | 서버 response를 읽기만 해요.             |
| `Codable`   | 두 방향 모두         | local 저장 값을 쓰고 다시 읽어요.        |

한 방향만 필요한 type에 무조건 `Codable`을 붙이면 사용하지 않는 방향까지 schema 계약으로 약속해요. request-only와 response-only DTO는 각각 필요한 protocol만 선택할 수 있어요.

## 모든 저장 값이 Codable이면 자동 합성해요

```swift
import Foundation

struct ReadingRecord: Codable, Equatable {
  let id: UUID
  let bookTitle: String
  var minutes: Int
  var tags: [String]
  var note: String?
}

let record = ReadingRecord(
  id: UUID(),
  bookTitle: "Swift",
  minutes: 30,
  tags: ["protocol"],
  note: nil
)

let data = try JSONEncoder().encode(record)
let decoded = try JSONDecoder().decode(
  ReadingRecord.self,
  from: data
)

assert(decoded == record)
```

`UUID`, `String`, `Int`, `Array`와 `Optional`의 구성 type이 모두 `Codable`이므로 compiler가 `encode(to:)`와 `init(from:)`를 합성해요. nested custom type도 같은 조건을 만족하면 계속 합성할 수 있어요.

자동 합성은 편리하지만 저장 프로퍼티 변경이 외부 schema 변경으로 이어질 수 있어요. private cache처럼 producer와 consumer를 동시에 배포하는지, 장기 저장이나 외부 API처럼 이전 data와 호환해야 하는지 구분하세요.

## `CodingKeys`로 Swift 이름과 외부 key를 분리해요

```swift
struct ReadingRecord: Codable {
  let id: UUID
  let bookTitle: String
  let minutes: Int
  var localSelection = false

  enum CodingKeys: String, CodingKey {
    case id
    case bookTitle = "book_title"
    case minutes
  }
}
```

`bookTitle`은 Swift naming convention을 유지하면서 JSON의 `book_title`과 연결해요. `localSelection`은 `CodingKeys`에 없으므로 encode와 decode 대상에서 제외돼요.

주의할 점은 제외한 non-optional property를 decoding할 때 초기값이나 custom initializer로 채울 수 있어야 한다는 것이에요. 위의 `localSelection`은 declaration 기본값이 있어 합성된 decoding 뒤 사용할 수 있어요.

외부 key가 type의 핵심 schema라면 명시적인 `CodingKeys`가 변경 review에 잘 드러나요. 모든 endpoint가 동일한 규칙을 사용한다면 encoder·decoder의 snake case 전략도 검토할 수 있어요.

## JSON 전략은 호출 경계에서 두 방향을 맞춰요

```swift
import Foundation

struct ReadingSummary: Codable {
  let bookTitle: String
  let startedAt: Date
}

let decoder = JSONDecoder()
decoder.keyDecodingStrategy = .convertFromSnakeCase
decoder.dateDecodingStrategy = .iso8601

let encoder = JSONEncoder()
encoder.keyEncodingStrategy = .convertToSnakeCase
encoder.dateEncodingStrategy = .iso8601
```

전략은 model 선언이 아니라 구체 JSON 경계에 속해요. 같은 model도 다른 server나 file format에서 날짜 표현이 다를 수 있기 때문이에요.

`convertFromSnakeCase`와 `convertToSnakeCase`는 각 key를 변환하므로 기본 key 전략보다 추가 비용이 있을 수 있어요. acronym과 기존 underscore가 섞인 API에서는 기대한 이름이 나오지 않을 수도 있으니 실제 payload로 검사하세요. 중요한 예외 key는 `CodingKeys`로 명시하는 편이 분명해요.

encoder와 decoder를 호출할 때마다 다르게 구성하지 말고 API client나 persistence boundary에서 하나의 설정을 관리해요.

## 누락 key와 `null`은 다른 입력이지만 optional은 둘 다 nil로 받을 수 있어요

다음 두 JSON을 생각해요.

```json
{}
```

```json
{ "note": null }
```

합성된 `String?` decoding은 두 경우 모두 `nil`로 처리할 수 있어요. schema에서 “field가 없음”과 “명시적으로 값을 지움”을 구분해야 한다면 synthesized optional만으로는 정보가 부족해요. custom decoding에서 `contains(_:)`와 `decodeNil(forKey:)`를 함께 확인하거나 별도 patch type을 사용하세요.

non-optional property에 declaration 기본값이 있어도 synthesized `Decodable`이 누락 key에 그 값을 자동 적용한다고 기대하면 안 돼요. 기본값 migration이 필요하면 직접 decode해요.

```swift
struct ReadingPreferences: Decodable {
  let dailyGoal: Int
  let showsNotes: Bool

  enum CodingKeys: String, CodingKey {
    case dailyGoal
    case showsNotes
  }

  init(from decoder: any Decoder) throws {
    let container = try decoder.container(
      keyedBy: CodingKeys.self
    )
    dailyGoal = try container.decode(
      Int.self,
      forKey: .dailyGoal
    )
    showsNotes = try container.decodeIfPresent(
      Bool.self,
      forKey: .showsNotes
    ) ?? true
  }
}
```

이 구현은 이전 data에 `showsNotes`가 없을 때 `true`로 migration해요. `decodeIfPresent`는 key 누락과 `null`을 모두 `nil`로 처리하므로 둘을 구분해야 하면 더 세밀한 container API를 사용하세요.

## 외부 구조가 다르면 custom decoding을 구현해요

JSON이 다음처럼 중첩되어 있다고 해 볼게요.

```json
{
  "book": {
    "title": "Swift"
  },
  "minutes": 30
}
```

앱에서는 평평한 model이 더 편할 수 있어요.

```swift
struct ReadingRecord: Decodable {
  let bookTitle: String
  let minutes: Int

  private enum CodingKeys: String, CodingKey {
    case book
    case minutes
  }

  private enum BookKeys: String, CodingKey {
    case title
  }

  init(from decoder: any Decoder) throws {
    let container = try decoder.container(
      keyedBy: CodingKeys.self
    )
    let book = try container.nestedContainer(
      keyedBy: BookKeys.self,
      forKey: .book
    )

    bookTitle = try book.decode(
      String.self,
      forKey: .title
    )
    minutes = try container.decode(
      Int.self,
      forKey: .minutes
    )
  }
}
```

custom implementation은 외부 schema와 domain-friendly shape를 분리할 수 있지만 boilerplate와 유지 비용이 생겨요. 단순 이름 변경은 `CodingKeys`, 전체 key convention은 strategy, 구조 변환과 migration은 custom decoding처럼 가장 작은 도구를 선택해요.

## custom encoding은 decoding의 반대 구조를 작성해요

```swift
extension ReadingRecord: Encodable {
  func encode(to encoder: any Encoder) throws {
    var container = encoder.container(
      keyedBy: CodingKeys.self
    )
    var book = container.nestedContainer(
      keyedBy: BookKeys.self,
      forKey: .book
    )

    try book.encode(bookTitle, forKey: .title)
    try container.encode(minutes, forKey: .minutes)
  }
}
```

양방향 round trip이 필요한 model은 encoding과 decoding 구조가 서로 맞는지 test해요. 하지만 `decode(encode(value)) == value`만으로 외부 schema 호환이 전부 증명되지는 않아요. encoder와 decoder가 같은 잘못된 key를 사용해도 round trip은 통과할 수 있으므로 실제 fixture JSON도 별도로 검사해요.

## `DecodingError`에서 실패 위치를 읽어요

```swift
do {
  _ = try decoder.decode(
    ReadingRecord.self,
    from: data
  )
} catch let DecodingError.keyNotFound(key, context) {
  print("누락 key:", key.stringValue)
  print("경로:", context.codingPath)
} catch let DecodingError.typeMismatch(type, context) {
  print("type 불일치:", type)
  print("설명:", context.debugDescription)
} catch let DecodingError.valueNotFound(type, context) {
  print("값 누락:", type, context.codingPath)
} catch let DecodingError.dataCorrupted(context) {
  print("손상된 data:", context.debugDescription)
}
```

`codingPath`는 중첩 object와 array에서 어느 key를 읽다가 실패했는지 보여 줘요. production log에 전체 payload를 무조건 기록하면 개인정보나 token이 노출될 수 있으므로 안전한 field와 request ID만 남겨요.

사용자에게는 내부 schema 메시지 대신 다시 시도, 앱 업데이트나 지원 문의처럼 해결 가능한 안내를 제공해요.

## Codable 성공은 domain validation 성공이 아니에요

```swift
enum ValidationError: Error {
  case emptyTitle
  case invalidMinutes
}

struct ReadingRecordDTO: Decodable {
  let title: String
  let minutes: Int
}

struct ReadingRecord {
  let title: String
  let minutes: Int

  init(dto: ReadingRecordDTO) throws {
    guard !dto.title.isEmpty else {
      throw ValidationError.emptyTitle
    }
    guard (1...1_440).contains(dto.minutes) else {
      throw ValidationError.invalidMinutes
    }

    title = dto.title
    minutes = dto.minutes
  }
}
```

JSON이 `String`과 `Int` type을 만족해 decode됐어도 빈 제목이나 하루보다 긴 독서 시간이 domain에서 유효하다는 뜻은 아니에요. 외부 data는 decode한 뒤 validation하고, 필요하면 DTO에서 domain model로 변환해요.

`Codable`은 암호화나 신뢰 검증 기능도 아니에요. 민감한 data의 저장 위치, 전송 보안, 서명과 접근 제어는 별도로 설계해야 해요.

## 장기 저장과 API schema는 version 변경을 견뎌야 해요

model에 non-optional property를 추가하면 이전 파일과 server response가 decode되지 않을 수 있어요. 다음 기준을 검토해요.

- 새 field가 없어도 만들 수 있으면 custom decoding에서 기본값을 제공해요.
- 이름을 바꿀 때 이전 key와 새 key를 함께 읽는 migration 기간을 둬요.
- 제거할 field를 decoder가 무시할 수 있는지 확인해요.
- enum에 server가 새 case를 추가할 가능성이 있으면 unknown fallback 정책을 정해요.
- 저장 형식에 schema version을 두고 단계별 migration을 수행해요.
- public API DTO와 앱 내부 domain model의 변경 주기가 다르면 타입을 분리해요.

자동 합성은 현재 type 구조를 편리하게 serialize하지만 장기 호환 정책을 대신 결정하지 않아요.

## Codable과 다른 프로토콜을 비교해요

| 프로토콜                         | 보장하는 질문                                  | 보장하지 않는 것                          |
| -------------------------------- | ---------------------------------------------- | ----------------------------------------- |
| `Encodable`                      | 외부 표현으로 쓸 수 있나요?                    | 다시 읽을 수 있는지는 몰라요.             |
| `Decodable`                      | 외부 표현에서 값을 만들 수 있나요?             | 다시 같은 형식으로 쓸 수 있는지는 몰라요. |
| `Codable`                        | 두 방향을 모두 지원하나요?                     | JSON 전용 형식이나 domain 유효성          |
| [`Equatable`](./equatable)       | 두 현재 값이 같은가요?                         | 저장과 전송 가능성                        |
| [`Identifiable`](./identifiable) | 같은 entity를 추적할 ID가 있나요?              | 값 전체의 serialization                   |
| [`Sendable`](./sendable)         | concurrency domain 사이에 안전하게 공유되나요? | 외부 data 형식                            |

각 프로토콜은 독립된 계약이에요. network DTO가 `Decodable & Sendable`일 수 있고, 저장 model이 `Codable & Identifiable`일 수 있어요. 실제 사용 경계에 필요한 준수만 선택하세요.

## 언제 `Codable`을 사용해야 하나요

- typed model을 JSON이나 property list로 encode·decode해요.
- local file, UserDefaults의 `Data`나 network payload에 값을 저장·전송해요.
- model 구조와 외부 schema가 비교적 명확하고 정적으로 표현돼요.
- custom encoder·decoder와 독립된 공통 계약이 필요해요.

임의 JSON 편집기처럼 schema가 실행 중 계속 달라지는 data, streaming parser나 특수 binary format에는 전용 parser가 더 적합할 수 있어요. type을 만들지 않고 JSON 일부만 잠깐 확인하는 작업에도 `JSONSerialization`이 단순할 수 있어요.

## 적용 순서를 정리해요

1. type이 encode, decode 또는 두 방향 중 무엇을 실제로 지원해야 하는지 정해요.
2. 외부 schema와 Swift property가 그대로 맞으면 자동 합성부터 사용해요.
3. field 이름 차이는 `CodingKeys`, 공통 naming과 날짜 규칙은 encoder·decoder 전략으로 처리해요.
4. 중첩 구조, 기본값과 migration이 필요할 때 custom 구현을 작성해요.
5. decoding 뒤 domain validation을 별도로 수행해요.
6. round-trip test와 실제 fixture JSON test를 함께 작성해요.
7. 장기 저장과 public API에는 version 호환·개인정보·보안 정책을 명시해요.

## 면접에서 이어질 수 있는 질문

### `Codable`은 protocol인가요?

정확히는 `Decodable & Encodable`을 묶은 type alias예요. 두 protocol을 모두 준수하는 type을 제약하거나 표현할 때 사용해요.

### `CodingKeys`는 언제 필요한가요?

Swift property 이름과 외부 key가 다르거나 일부 property를 coding에서 제외할 때 사용해요. 단순한 전체 snake case 규칙은 decoder 전략으로 처리할 수도 있지만 예외와 schema 가독성을 함께 고려해야 해요.

### non-optional property에 기본값을 쓰면 누락 key도 자동으로 decode되나요?

일반적으로 synthesized `Decodable`이 declaration 기본값을 migration fallback으로 사용한다고 기대하면 안 돼요. 누락을 허용하려면 custom `init(from:)`에서 `decodeIfPresent`와 명시적인 기본값을 사용해요.

### `Codable` model을 바로 domain model로 써도 되나요?

작고 내부적인 schema라면 가능해요. 외부 API와 앱 domain의 이름, validation과 변경 주기가 다르면 DTO를 분리하고 변환 경계에서 유효성을 검사하는 편이 안전해요.

### round-trip test만 통과하면 schema 호환이 보장되나요?

아니요. 같은 encoder와 decoder가 동일하게 잘못된 key를 사용해도 round trip은 통과할 수 있어요. 실제 외부 fixture의 key와 type을 검증하는 test도 필요해요.

## 참고 자료

- [Apple Developer — Codable](https://developer.apple.com/documentation/swift/codable)
- [Apple Developer — Encodable](https://developer.apple.com/documentation/swift/encodable)
- [Apple Developer — Decodable](https://developer.apple.com/documentation/swift/decodable)
- [Apple Developer — Encoding and Decoding Custom Types](https://developer.apple.com/documentation/foundation/encoding-and-decoding-custom-types)
- [Apple Developer — JSONEncoder](https://developer.apple.com/documentation/foundation/jsonencoder)
- [Apple Developer — JSONDecoder](https://developer.apple.com/documentation/foundation/jsondecoder)
- [Apple Developer — CodingKey](https://developer.apple.com/documentation/swift/codingkey)
- [Swift Evolution SE-0166 — Swift Archival & Serialization](https://github.com/swiftlang/swift-evolution/blob/main/proposals/0166-swift-archival-serialization.md)
- [Swift-KR — Swift로 이해하는 Identifiable](./identifiable)
- [Swift-KR — Swift로 이해하는 Sendable](./sendable)
