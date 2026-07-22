---
title: UIKit 통합
description: TCA를 UIKit 앱에 통합할 때 상태 변화를 구독하고 Alert·Action Sheet·스택 내비게이션·Combine을 연결하는 도구를 안내합니다.
---

# UIKit 통합

원문: [UIKit Integration](https://swiftpackageindex.com/pointfreeco/swift-composable-architecture/main/documentation/composablearchitecture/uikit)

The Composable Architecture를 UIKit 애플리케이션에 통합하는 방법을 알아봅니다.

## 개요

The Composable Architecture는 SwiftUI를 염두에 두고 설계되었지만 UIKit으로 작성한 애플리케이션 코드에 통합할 수 있는 도구도 제공합니다.

## 상태 변화 구독하기

- `ObjectiveC.NSObject.observe(_:)`
- `ObservationToken`

## Alert와 Action Sheet 표시하기

- `UIKit.UIAlertController`

## 스택 기반 내비게이션

- `UIKitNavigation.NavigationStackController`
- `UIKitNavigation.UIPushAction`

## Combine 통합

- `Store.ifLet(then:else:)`
- `Store.publisher`
- `ViewStore.publisher`
