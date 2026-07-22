---
title: Dependencies
description: Swift 애플리케이션의 외부 시스템 의존성을 제어하고 전파하며 테스트·Preview·특정 기능에서 안전하게 재정의하는 Dependencies 라이브러리를 소개합니다.
---

# Dependencies

SwiftUI의 “environment”에서 영감을 받은 의존성 관리 라이브러리예요.

원문: [Dependencies](https://swiftpackageindex.com/pointfreeco/swift-dependencies/main/documentation/dependencies)

## 추가 자료

- [GitHub 저장소](https://github.com/pointfreeco/swift-dependencies)
- [Discussions](https://github.com/pointfreeco/swift-dependencies/discussions)
- [Point-Free 동영상](http://pointfree.co)

## 개요

의존성은 애플리케이션에서 직접 제어할 수 없는 외부 시스템과 상호작용해야 하는 타입과 함수예요. 서버에 네트워크 요청을 보내는 API client가 대표적인 예지만, 겉보기에는 별것 아닌 `UUID`와 `Date` 이니셜라이저, 파일 접근, 사용자 기본값, clock과 timer도 모두 의존성으로 볼 수 있어요.

애플리케이션을 개발하면서 의존성 관리, 또는 흔히 “의존성 주입”이라고 부르는 것을 전혀 생각하지 않아도 꽤 멀리 갈 수 있어요. 하지만 결국 제어하지 않는 의존성은 코드베이스와 개발 주기에 여러 문제를 일으킬 수 있어요.

- 제어하지 않는 의존성은 파일 시스템, 네트워크 연결, 인터넷 속도, 서버 가동 시간처럼 외부 세계의 변덕에 영향을 받으므로 **빠르고 결정적인 테스트를 작성하기 어렵게** 해요.
- 위치 관리자와 음성 인식기처럼 많은 의존성은 **SwiftUI Preview에서 제대로 동작하지 않고**, motion manager처럼 **simulator에서도 동작하지 않는** 의존성도 있어요. 이런 framework를 사용하면 기능 디자인을 빠르게 반복하기 어려워져요.
- Firebase, web socket 라이브러리, 네트워크 라이브러리처럼 Apple이 아닌 서드파티 라이브러리와 상호작용하는 의존성은 무겁고 **컴파일하는 데 오래 걸리는** 경향이 있어요. 개발 주기를 느리게 만들 수 있어요.

이런 이유와 그 밖의 많은 이유 때문에 의존성이 여러분을 통제하게 두기보다 여러분이 의존성을 통제하는 것이 매우 중요해요.

하지만 의존성을 제어하는 것은 시작에 불과해요. 의존성을 제어하고 나면 새로운 문제들이 생겨요.

- 의존성을 모든 곳에 명시적으로 전달하는 것보다 편리하면서도 전역 의존성보다 안전하게, 애플리케이션 전체에 **의존성을 전파**하려면 어떻게 해야 할까요?
- 애플리케이션의 한 부분에서만 **의존성을 재정의**하려면 어떻게 해야 할까요? 테스트와 SwiftUI Preview뿐 아니라 onboarding 경험 같은 특정 사용자 흐름에서도 유용해요.
- 테스트에서 기능이 사용하는 **모든 의존성을 재정의했는지** 어떻게 확신할 수 있을까요? 일부 의존성만 mock으로 바꾸고 나머지는 외부 세계와 상호작용하게 둔다면 올바른 테스트가 아니에요.

이 라이브러리는 위의 모든 문제와 그보다 훨씬 더 많은 문제를 해결해요.

## 목차

### Getting started

- [Quick start](./quick-start.md)
- [What are dependencies?](./what-are-dependencies.md)

### Essentials

- [Using dependencies](./using-dependencies.md)
- [Registering dependencies](./registering-dependencies.md)
- [Live, preview, and test dependencies](./live-preview-test.md)
- [Testing](./testing.md)

### Advanced

- [Designing dependencies](./designing-dependencies.md)
- [Overriding dependencies](./overriding-dependencies.md)
- [Lifetimes](./lifetimes.md)
- [Single entry point systems](./single-entry-point-systems.md)

### Dependency management

- [Dependency](./dependency.md)
- [DependencyValues](./dependency-values.md)
- [DependencyKey](./dependency-key.md)
- [DependencyContext](./dependency-context.md)
