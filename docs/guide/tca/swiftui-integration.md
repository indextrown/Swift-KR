---
title: SwiftUI 통합
description: TCA를 SwiftUI 앱에 통합할 때 알림·다이얼로그·프레젠테이션·내비게이션·바인딩에 사용하는 도구를 안내합니다.
---

# SwiftUI 통합

원문: [SwiftUI Integration](https://swiftpackageindex.com/pointfreeco/swift-composable-architecture/main/documentation/composablearchitecture/swiftuiintegration)

The Composable Architecture를 SwiftUI 애플리케이션에 통합하는 방법을 알아봅니다.

## 개요

The Composable Architecture는 여러 프레임워크로 만든 애플리케이션을 구동할 수 있지만, SwiftUI를 염두에 두고 설계되었습니다. 그래서 SwiftUI 애플리케이션에 통합할 수 있는 강력한 도구를 제공합니다.

## Alert와 dialog

- `AlertState`
- `ConfirmationDialogState`
- `SwiftUI.View.alert(_:)`
- `SwiftUI.View.confirmationDialog(_:)`
- `_EphemeralState`

## 프레젠테이션

- `SwiftUI.Binding.scope(_:action:fileID:filePath:line:column:)`

## 내비게이션 스택과 링크

- `SwiftUI.Binding.scope(_:action:)`
- `SwiftUI.NavigationStack.init(path:root:destination:fileID:filePath:line:column:)`
- `SwiftUI.NavigationLink.init(state:label:fileID:filePath:line:column:)`

## 바인딩

- [SwiftUI 바인딩](./bindings.md)
- `BindableAction`
- `BindingAction`
- `BindingReducer`

## 지원 중단된 API

- `SwiftUIDeprecations`
