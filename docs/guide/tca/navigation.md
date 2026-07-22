---
title: 내비게이션
description: TCA의 상태 기반 내비게이션 도구로 도메인을 모델링하고 reducer·뷰 계층에 기능을 통합하며 테스트하는 전체 흐름을 소개합니다.
---

# 내비게이션

원문: [Navigation](https://swiftpackageindex.com/pointfreeco/swift-composable-architecture/main/documentation/composablearchitecture/navigation)

라이브러리의 내비게이션 도구를 사용해 도메인을 가장 적절하게 모델링하고, reducer와 뷰 계층에 기능을 통합하며, 테스트를 작성하는 방법을 알아봅니다.

## 개요

상태 기반 내비게이션은 애플리케이션 개발에서 강력한 개념이지만 익히기 까다로울 수 있습니다. The Composable Architecture는 도메인을 가능한 한 간결하게 모델링하고 상태로 내비게이션을 구동하는 데 필요한 도구를 제공합니다. 다만 이를 제대로 사용하려면 몇 가지 개념을 알아야 합니다.

## 핵심

- [내비게이션이란?](./what-is-navigation.md): 상태로 내비게이션을 모델링하는 기본 원리를 설명합니다.

## 트리 기반 내비게이션

- [트리 기반 내비게이션](./tree-based-navigation.md)
- `Presents()`
- `PresentationAction`
- `Reducer.ifLet(_:action:destination:fileID:filePath:line:column:)`

## 스택 기반 내비게이션

- [스택 기반 내비게이션](./stack-based-navigation.md)
- `StackState`
- `StackAction`
- `StackActionOf`
- `StackElementID`
- `Reducer.forEach(_:action:destination:fileID:filePath:line:column:)`

## 화면 닫기

- `DismissEffect`
- `Dependencies.DependencyValues.dismiss`
- `Dependencies.DependencyValues.isPresented`
