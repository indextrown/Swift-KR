---
title: Designing dependencies
description: protocol과 closure 기반 struct를 비교하고 @DependencyClient 매크로로 주입과 테스트 재정의에 유연한 의존성을 설계하는 방법을 설명합니다.
---

# Designing dependencies

기능에 주입하고 테스트에서 재정의하기에 가장 유연한 의존성을 설계하는 기법을 알아봐요.

원문: [Designing dependencies](https://swiftpackageindex.com/pointfreeco/swift-dependencies/main/documentation/dependencies/designingdependencies)

- [Protocol 기반 의존성](#protocol-기반-의존성)
- [Struct 기반 의존성](#struct-기반-의존성)
- [@DependencyClient 매크로](#dependencyclient-매크로)

## 개요

의존성을 제어할 수 있게 만드는 것은 기능을 격리하고 테스트할 수 있게 하는 가장 중요한 단계예요. 그다음으로 중요한 단계는 테스트와 여러 상황에서 유연성을 극대화하도록 의존성을 설계하는 것이에요.

> 팁: 의존성과 이를 가장 잘 설계하고 구성하는 방법을 다루는 [전체 에피소드 시리즈](https://www.pointfree.co/collections/dependencies)가 있어요.

## Protocol 기반 의존성

Swift에서 의존성을 설계하는 가장 널리 쓰이는 방법은 protocol을 사용하는 것이에요. 예를 들어 기능이 audio player와 상호작용해야 한다면 재생, 정지 등을 위한 메서드가 있는 protocol을 설계할 수 있어요.

```swift
protocol AudioPlayer {
  func loop(url: URL) async throws
  func play(url: URL) async throws
  func setVolume(_ volume: Float) async
  func stop() async
}
```

그런 다음 원하는 만큼 이 protocol 준수를 만들 수 있어요. AVFoundation과 실제로 상호작용하는 `LiveAudioPlayer`, 소리는 재생하지 않지만 무언가 재생되는 상황을 흉내 내기 위해 suspend하는 `MockAudioPlayer`가 그 예예요. 어떤 메서드든 호출되면 `reportIssue`를 실행하는 `UnimplementedAudioPlayer` 준수도 만들 수 있어요.

```swift
struct LiveAudioPlayer: AudioPlayer {
  let audioEngine: AVAudioEngine
  // ...
}
struct MockAudioPlayer: AudioPlayer {
  // ...
}
struct UnimplementedAudioPlayer: AudioPlayer {
  func loop(url: URL) async throws {
    reportIssue("AudioPlayer.loop is unimplemented")
  }
  // ...
}
```

이 모든 준수를 의존성의 live, Preview, test 값으로 지정할 수 있어요.

```swift
private enum AudioPlayerKey: DependencyKey {
  static let liveValue: any AudioPlayer = LiveAudioPlayer()
  static let previewValue: any AudioPlayer = MockAudioPlayer()
  static let testValue: any AudioPlayer = UnimplementedAudioPlayer()
}
```

> 팁: 의존성의 live, Preview, test 구현을 가장 잘 활용하는 방법은 [Live, preview, and test dependencies](./live-preview-test.md)를 참고하세요.

이 의존성 스타일은 충분히 잘 동작해요. 가장 익숙한 방식이라면 바꿀 필요가 없어요.

## Struct 기반 의존성

하지만 이 의존성을 조금만 바꾸면 더 강력하게 만들 수 있어요. Audio player를 protocol로 설계하는 대신 closure property를 가진 struct로 interface를 표현할 수 있어요.

```swift
struct AudioPlayerClient {
  var loop: (_ url: URL) async throws -> Void
  var play: (_ url: URL) async throws -> Void
  var setVolume: (_ volume: Float) async -> Void
  var stop: () async -> Void
}
```

그러면 protocol을 준수하는 타입을 정의하는 대신 값을 구성해요.

```swift
extension AudioPlayerClient {
  static var live: Self {
    let audioEngine: AVAudioEngine
    return Self(/*...*/)
  }

  static let mock = Self(/* ... */)

  static let unimplemented = Self(
    loop: { _ in reportIssue("AudioPlayerClient.loop is unimplemented") },
    // ...
  )
}
```

이 의존성을 등록할 때는 `AudioPlayerClient` struct가 `DependencyKey` protocol을 준수하게 만들 수 있어요. 새 타입을 정의할 필요가 없어요. 실제로 live, Preview, test 값을 protocol 준수 안에 한 번에 직접 정의할 수도 있어요.

```swift
extension AudioPlayerClient: DependencyKey {
  static var liveValue: Self {
    let audioEngine: AVAudioEngine
    return Self(/* ... */)
  }

  static let previewValue = Self(/* ... */)

  static let testValue = Self(
    loop: unimplemented("AudioPlayerClient.loop"),
    play: unimplemented("AudioPlayerClient.play"),
    setVolume: unimplemented("AudioPlayerClient.setVolume"),
    stop: unimplemented("AudioPlayerClient.stop")
  )
}

extension DependencyValues {
  var audioPlayer: AudioPlayerClient {
    get { self[AudioPlayerClient.self] }
    set { self[AudioPlayerClient.self] = newValue }
  }
}
```

> 팁: [Issue Reporting](https://github.com/pointfreeco/swift-issue-reporting) 라이브러리의 `unimplemented` 메서드를 사용해 closure가 호출되면 XCTest를 실패하게 만들고 있어요. 이 패턴에 대한 자세한 내용은 [Live, preview, and test dependencies](./live-preview-test.md)를 참고하세요.

의존성을 이런 방식으로 설계하면 기능에 필요한 의존성 endpoint만 선택할 수 있어요. 예를 들어 기능이 동작하기 위해 audio player가 필요하지만 `play` endpoint만 사용하고 loop, volume 설정, audio 정지는 필요하지 않다면 단 하나의 함수에만 의존한다고 지정할 수 있어요.

```swift
@Observable
final class FeatureModel {
  @ObservationIgnored
  @Dependency(\.audioPlayer.play) var play
  // ...
}
```

그러면 기능이 의존성에서 필요로 하는 최소 interface를 더 잘 설명할 수 있고 기능도 덜 복잡해 보여요.

테스트에서도 의존성을 꼭 필요한 만큼만 재정의할 수 있어요. 예를 들어 테스트하는 기능의 사용자 흐름 하나가 `play` endpoint를 호출하지만 다른 endpoint는 호출하지 않는다고 생각해 볼게요. 이 endpoint 하나만 재정의하는 테스트를 작성할 수 있어요.

```swift
func testFeature() {
  let isPlaying = ActorIsolated(false)

  let model = withDependencies {
    $0.audioPlayer.play = { _ in await isPlaying.setValue(true) }
  } operation: {
    FeatureModel()
  }

  await model.play()
  XCTAssertEqual(isPlaying.value, true)
}
```

이 테스트가 통과하면 테스트하는 사용자 흐름에서 의존성의 다른 endpoint를 사용하지 않는다고 보장할 수 있어요. 나중에 의존성의 다른 부분을 사용하기 시작하면 즉시 테스트가 실패하고 assertion해야 할 동작이 더 생겼다는 사실을 알려 줘요.

## @DependencyClient 매크로

라이브러리는 struct 기반 dependency interface를 더 편리하게 만드는 매크로를 제공해요. 이 매크로는 SwiftSyntax에 의존하고 빌드 시간이 약 20초 늘어나기 때문에 package 안의 별도 라이브러리로 제공돼요. 모든 사용자가 이 비용을 부담하게 만들고 싶지 않았기 때문에 매크로를 사용하려면 target에 `DependenciesMacros` product를 명시적으로 추가해야 해요.

추가한 뒤에는 dependency struct에 `@DependencyClient` 매크로를 바로 적용할 수 있어요.

```swift
import DependenciesMacros

@DependencyClient
struct AudioPlayerClient {
  var loop: (_ url: URL) async throws -> Void
  var play: (_ url: URL) async throws -> Void
  var setVolume: (_ volume: Float) async -> Void
  var stop: () async -> Void
}
```

이 매크로는 몇 가지 작업을 대신해 줘요. 먼저 각 endpoint에 단순히 오류를 던지고 XCTest 실패를 일으키는 기본 구현을 자동으로 제공해요. 별도 작업 없이 “unimplemented” client를 얻게 돼요. 따라서 `TestDependencyKey` 준수의 `testValue`를 다음과 같이 단순화할 수 있어요.

```diff
 extension AudioPlayerClient: TestDependencyKey {
-  static let testValue = Self(
-    loop: unimplemented("AudioPlayerClient.loop"),
-    play: unimplemented("AudioPlayerClient.play"),
-    setVolume: unimplemented("AudioPlayerClient.setVolume"),
-    stop: unimplemented("AudioPlayerClient.stop")
-  )
+  static let testValue = Self()
 }
```

동작은 이전과 완전히 같지만 이제 모든 코드를 매크로가 생성해 줘요.

또 client의 closure endpoint에 argument label을 제공하면 매크로가 이 정보를 argument label이 있는 메서드로 바꿔요. 따라서 `play` endpoint를 다음과 같이 호출할 수 있어요.

```swift
try await player.play(url: URL(filePath: "..."))
```

마지막으로 매크로는 client의 모든 endpoint가 포함된 public 이니셜라이저도 생성해 줘요. 의존성의 interface와 구현을 분리할 때는 일반적으로 이 이니셜라이저를 관리해야 해요. 자세한 내용은 [Interface와 구현 분리하기](./live-preview-test.md#interface와-구현-분리하기)를 참고하세요. 이제 매크로가 코드를 자동으로 제공하므로 직접 관리할 필요가 없어요.
