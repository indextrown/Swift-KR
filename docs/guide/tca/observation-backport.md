---
title: Observation backport
description: iOS 16 이하에서 TCA의 Perception 프레임워크로 Swift 5.9 Observation 도구를 사용하고 추적 문제를 해결하는 방법을 설명합니다.
---

# Observation backport

원문: [Observation backport](https://swiftpackageindex.com/pointfreeco/swift-composable-architecture/main/documentation/composablearchitecture/observationbackport)

Swift 5.9의 Observation 프레임워크를 iOS 16 이하에서도 사용하도록 backport한 방법과, backport 도구 사용 시의 주의점을 알아봅니다.

## 개요

The Composable Architecture 1.7부터 Swift 5.9의 Observation 도구를 지원하며, 이 도구를 iOS 13 이상에서도 작동하도록 backport했습니다. iOS 17 이전에서 Observation 도구를 사용하려면 몇 가지 단계를 더 거쳐야 하고 알아둘 점도 있습니다.

## Perception 프레임워크

The Composable Architecture에는 Swift 5.9 Observation을 iOS 13, macOS 12, tvOS 13, watchOS 6 이상에서 사용할 수 있도록 backport한 Perception 프레임워크가 포함되어 있습니다. Observation 프레임워크의 모든 도구에는 Perception의 대응 도구가 있습니다.

예를 들어 `@Observable` 매크로 대신 `@Perceptible` 매크로를 사용합니다.

```swift
@Perceptible
class CounterModel {
  var count = 0
}
```

하지만 뷰가 perceptible 모델의 변화를 올바르게 관찰하려면 뷰 내용을 `WithPerceptionTracking`으로 감싸야 합니다.

```swift
struct CounterView: View {
  let model = CounterModel()

  var body: some View {
    WithPerceptionTracking {
      Form {
        Text(self.model.count.description)
        Button("Decrement") { self.model.count -= 1 }
        Button("Increment") { self.model.count += 1 }
      }
    }
  }
}
```

그러면 뷰가 `@Perceptible` 모델에서 접근한 필드를 구독해, 필드가 바뀔 때 뷰를 무효화하고 다시 렌더링합니다.

`WithPerceptionTracking` 내부가 아닌 뷰에서 `@Perceptible` 모델의 필드에 접근하면 런타임 경고가 발생합니다.

> 🟣 Runtime Warning: Perceptible state was accessed but is not being tracked. Track changes to state by wrapping your view in a 'WithPerceptionTracking' view.

이 문제를 디버깅하려면 Xcode Issue Navigator(⌘5)에서 경고를 펼치고, 스택 프레임을 따라가 `WithPerceptionTracking` 밖에서 상태에 접근하는 뷰의 줄을 찾으세요.

## 바인딩

Store에서 바인딩을 만들려면([SwiftUI 바인딩](./bindings.md) 참고) 보통 SwiftUI의 `@Bindable` 프로퍼티 래퍼를 사용합니다.

```swift
struct MyView: View {
  @Bindable var store: StoreOf<MyFeature>
  // ...
}
```

하지만 `@Bindable`은 iOS 17 이상에서만 사용할 수 있습니다. 따라서 Perception 라이브러리는 iOS 17 이상만 대상으로 삼을 수 있을 때까지 대신 사용할 도구를 제공합니다. `@Bindable`에 `Perception` 네임스페이스만 붙이면 됩니다.

```swift
struct MyView: View {
  @Perception.Bindable var store: StoreOf<MyFeature>
  // ...
}
```

## 주의점

`WithPerceptionTracking`을 사용할 때 알아둘 주의점이 있습니다.

### 지연 실행되는 뷰 클로저

SwiftUI에는 뷰에서 어떤 일이 발생했을 때만 평가되어 `body`와 같은 스택 프레임에서 실행되지 않는 지연 클로저가 많습니다. 예를 들어 `ForEach`의 trailing closure는 `body`를 계산한 뒤에 호출됩니다.

따라서 다음처럼 body를 `WithPerceptionTracking`으로 감싸도,

```swift
WithPerceptionTracking {
  ForEach(store.scope(\.rows, action: \.rows), id: \.state.id) { store in
    Text(store.title)
  }
}
```

행의 `store.title` 접근은 `WithPerceptionTracking` 밖에서 일어납니다. 따라서 앞에서 설명한 런타임 경고가 발생하며 제대로 동작하지 않습니다.

trailing closure의 내용을 또 다른 `WithPerceptionTracking`으로 감싸서 해결합니다.

```swift
WithPerceptionTracking {
  ForEach(store.scope(\.rows, action: \.rows), id: \.state.id) { store in
    WithPerceptionTracking {
      Text(store.title)
    }
  }
}
```

### 레거시와 현대적 기능 함께 사용하기

`ViewStore`, `WithViewStore`를 사용하는 레거시 스타일 기능과 `ObservableState()` 매크로를 사용하는 현대적 스타일 기능을 함께 사용하면 문제가 생길 수 있습니다. 주로 뷰 body가 필요 이상으로 다시 계산되며, SwiftUI가 변경된 상태를 판별하는 데 부담을 주고 결함을 유발하거나 내비게이션 버그를 악화시킬 수 있습니다.

자세한 내용은 [1.7로 마이그레이션하기](./migration-guides.md#migrating-to-17)를 참고하세요.
