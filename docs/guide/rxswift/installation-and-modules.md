---
title: RxSwift 설치와 모듈 선택
description: RxSwift 6.10.2의 RxSwift, RxCocoa, RxRelay, RxTest, RxBlocking 의존 관계와 Swift Package Manager·XCFramework·Carthage 설치 기준을 설명합니다.
source: https://github.com/ReactiveX/RxSwift/tree/6.10.2
reviewed: '2026-09-06'
---

# RxSwift 설치와 모듈 선택

> **면접 답변 한 줄 요약:** RxSwift 패키지는 코어·UI·Relay·테스트 제품을 분리해 제공하므로 타깃마다 필요한 제품만 연결하고, 6.10부터 공식 지원이 폐기된 CocoaPods 대신 Swift Package Manager나 Carthage를 우선 선택해요.

RxSwift 저장소 하나를 추가해도 앱이 모든 모듈을 자동으로 import하는 것은 아니에요. 제품별 의존 관계와 타깃 역할을 먼저 정해야 빌드 시간과 계층 의존성을 불필요하게 늘리지 않을 수 있어요.

## 다섯 제품의 의존 관계

```text
RxCocoa ───────▶ RxRelay
   │                │
   └────────────┬───┘
                ▼
             RxSwift ◀──── RxTest
                ▲
                └──────── RxBlocking
```

| 제품         | 포함할 타깃                       | 역할                                                 |
| ------------ | --------------------------------- | ---------------------------------------------------- |
| `RxSwift`    | 도메인·데이터·화면 공통           | Observable, 연산자, Scheduler, Subject, Trait        |
| `RxRelay`    | 상태와 사건을 Relay로 소유하는 곳 | PublishRelay, BehaviorRelay, ReplayRelay             |
| `RxCocoa`    | UIKit·AppKit 화면 타깃            | UI 바인딩, Driver, Signal, DelegateProxy             |
| `RxTest`     | 단위 테스트 타깃                  | 가상 시간, hot·cold 테스트 Observable, 기록 Observer |
| `RxBlocking` | 제한적인 통합 테스트 타깃         | 현재 스레드를 막고 Observable 결과를 동기적으로 조회 |

`RxCocoa`는 `RxSwift`와 `RxRelay`에 의존해요. 반대로 도메인 계층이 RxCocoa를 import하면 UI 전용 타입이 아래 계층으로 새기 쉬우므로 코어 로직은 `RxSwift`만 의존하게 두는 편이 좋아요.

## Swift Package Manager로 추가해요

Xcode의 **File → Add Package Dependencies**에서 다음 URL을 입력해요.

```text
https://github.com/ReactiveX/RxSwift.git
```

버전 규칙은 앱의 배포 정책에 맞추되, 문서 예제는 `6.10.2`를 기준으로 해요. `Package.swift`에서는 제품을 타깃별로 나눠요.

```swift
// swift-tools-version: 5.9

import PackageDescription

let package = Package(
  name: "Feature",
  platforms: [.iOS(.v16)],
  products: [
    .library(name: "Feature", targets: ["Feature"]),
  ],
  dependencies: [
    .package(
      url: "https://github.com/ReactiveX/RxSwift.git",
      exact: "6.10.2"
    ),
  ],
  targets: [
    .target(
      name: "Feature",
      dependencies: [
        .product(name: "RxSwift", package: "RxSwift"),
        .product(name: "RxCocoa", package: "RxSwift"),
        .product(name: "RxRelay", package: "RxSwift"),
      ]
    ),
    .testTarget(
      name: "FeatureTests",
      dependencies: [
        "Feature",
        .product(name: "RxTest", package: "RxSwift"),
        .product(name: "RxBlocking", package: "RxSwift"),
      ]
    ),
  ]
)
```

앱 타깃에 `RxTest`와 `RxBlocking`을 넣지 않고 테스트 타깃에만 연결하세요. 코어 패키지라면 `RxCocoa`를 빼고 `RxSwift`·`RxRelay`만 선택할 수 있어요.

## XCFramework로 직접 연결할 수 있어요

RxSwift 6 릴리스는 바이너리 XCFramework를 제공해요. 릴리스 자산에서 필요한 프레임워크를 받아 Xcode의 **Frameworks, Libraries, and Embedded Content**에 추가할 수 있어요.

직접 바이너리를 관리할 때는 다음을 확인하세요.

- 동일 버전의 `RxSwift`, `RxRelay`, `RxCocoa`를 사용해요.
- 시뮬레이터와 기기 slice가 모두 포함됐는지 확인해요.
- 앱과 내부 프레임워크가 서로 다른 방식으로 RxSwift를 중복 연결하지 않게 해요.
- 새 버전의 서명 주체와 체크섬을 공식 릴리스 정보에서 확인해요.

소스 기반 의존성 해석과 자동 업데이트가 필요하면 Swift Package Manager가 더 단순하고, 네트워크 없이 검증된 바이너리를 배포해야 하는 조직이라면 XCFramework가 맞을 수 있어요.

## Carthage는 여전히 공식 선택지예요

`Cartfile`에는 버전을 명시해요.

```text
github "ReactiveX/RxSwift" == 6.10.2
```

Carthage는 기본적으로 동적 프레임워크를 빌드하며, 공식 README는 정적 라이브러리로 바꾸는 별도 절차도 안내해요. 빌드 산출물 캐시와 링킹 방식을 직접 관리할 필요가 없다면 SPM이 보통 더 간단해요.

## CocoaPods는 6.10부터 공식 지원이 폐기됐어요

RxSwift 6.10.2 릴리스 노트는 CocoaPods 지원이 공식적으로 deprecated됐고 SPM 또는 Carthage로 이동하라고 안내해요. 기존 Pod 설치가 즉시 사라진다는 뜻은 아니지만, 새 프로젝트의 기본 선택으로 삼거나 장기 유지보수를 기대하기는 어려워요.

마이그레이션할 때는 한 번에 한 의존성 관리자만 RxSwift를 공급하게 하세요. Pod와 SPM 양쪽에서 RxSwift가 링크되면 동일 심볼 중복이나 타입 정체성 문제를 만들 수 있어요.

## import 경계를 정해요

| 파일 역할                  | 권장 import                       |
| -------------------------- | --------------------------------- |
| Repository·Use Case        | `RxSwift`                         |
| 상태 Store                 | `RxSwift`, `RxRelay`              |
| UIKit View Controller      | `RxSwift`, `RxCocoa`              |
| Relay를 직접 소유하는 화면 | `RxSwift`, `RxCocoa`, `RxRelay`   |
| 가상 시간 단위 테스트      | `RxSwift`, `RxTest`, `XCTest`     |
| 동기 결과 통합 테스트      | `RxSwift`, `RxBlocking`, `XCTest` |

공개 인터페이스에 Driver나 Signal을 쓰면 그 모듈의 소비자도 RxCocoa에 의존해야 해요. 화면과 무관한 모듈은 `Observable`, `Single`, `Infallible`처럼 RxSwift 타입으로 경계를 유지할지 검토하세요.

## 자주 하는 실수

- 모든 타깃에 다섯 제품을 전부 연결해 의존 범위를 키워요.
- 앱과 사내 프레임워크가 서로 다른 RxSwift 버전을 포함해 충돌해요.
- SPM으로 옮긴 뒤 남은 Pod·수동 프레임워크를 제거하지 않아요.
- 테스트 전용 RxBlocking을 제품 코드에서 사용해 동기 대기와 교착 위험을 만들어요.
- `import RxCocoa`만으로 모든 코어 타입의 소유 모듈을 구분하지 못해요.

## 적용 체크리스트

- 각 타깃이 실제 사용하는 Rx 제품만 연결했나요?
- UI와 무관한 계층에서 RxCocoa를 제거할 수 있나요?
- 테스트 제품이 앱 산출물에 포함되지 않나요?
- 저장소 안에서 RxSwift 버전과 설치 방식이 하나로 통일됐나요?
- CocoaPods를 사용 중이라면 SPM 또는 Carthage 전환 계획이 있나요?
- 새 버전 적용 전 릴리스 노트와 지원 Xcode·Swift 버전을 확인했나요?

## 면접에서 이어질 수 있는 질문

### RxSwift와 RxCocoa를 왜 분리하나요?

RxSwift는 플랫폼 중립적인 스트림 코어이고 RxCocoa는 UIKit·AppKit 등 Apple UI 연동 계층이에요. 분리하면 도메인 로직이 UI 프레임워크에 의존하지 않게 만들 수 있어요.

### RxTest와 RxBlocking을 앱 타깃에 넣지 않는 이유는 무엇인가요?

둘은 테스트 편의를 위한 제품이고, 특히 RxBlocking은 현재 스레드를 막으므로 제품의 비동기 흐름에 사용하기 부적절해요. 테스트 타깃에만 연결하는 것이 목적과 산출물 범위를 분명하게 해요.

## 참고 자료

- [RxSwift 6.10.2 공식 저장소와 설치 안내](https://github.com/ReactiveX/RxSwift/tree/6.10.2)
- [RxSwift 6.10.2 릴리스 노트](https://github.com/ReactiveX/RxSwift/releases/tag/6.10.2)
- [Swift Package Manager Package.swift](https://github.com/ReactiveX/RxSwift/blob/6.10.2/Package.swift)
