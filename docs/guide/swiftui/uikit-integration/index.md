---
title: SwiftUI와 UIKit 통합 한눈에 보기
description: UIHostingController와 Representable 계열의 역할, 지원 버전, 데이터 흐름을 비교하고 UIKit 앱을 SwiftUI로 점진적으로 전환하는 기준을 설명합니다.
---

# SwiftUI와 UIKit 통합 한눈에 보기

> **면접 답변 한 줄 요약:** SwiftUI와 UIKit 통합은 한 프레임워크의 화면을 다른 프레임워크가 관리할 수 있는 컨테이너나 어댑터로 감싸고, 상태와 이벤트의 소유자를 하나로 유지해 기존 화면을 단계적으로 재사용하거나 전환하는 방법이에요.

이미 UIKit으로 만든 앱을 SwiftUI로 바꾸려면 모든 화면을 한 번에 다시 작성해야 할까요? 그렇지 않아요. Apple은 UIKit 화면 안에 SwiftUI를 넣는 **호스팅(hosting)** API와 SwiftUI 화면 안에 UIKit을 넣는 **Representable** API를 제공해요. 화면 하나나 셀 하나부터 경계를 만들 수 있으므로 기존 기능을 유지하면서 점진적으로 전환할 수 있어요.

반대로 SwiftUI 앱에서도 웹 뷰, 복잡한 UIKit 컨트롤, 기존 사내 컴포넌트를 바로 버릴 필요가 없어요. 필요한 UIKit 객체만 감싸서 SwiftUI의 상태와 레이아웃 흐름에 참여시킬 수 있어요.

이 섹션에서는 독서 목표 앱을 예로 들어 다음 내용을 배워요.

1. 통합 방향에 맞는 API를 선택해요.
2. UIKit 화면에 SwiftUI 화면과 셀을 넣어요.
3. SwiftUI 화면에서 UIKit 뷰와 뷰 컨트롤러를 재사용해요.
4. 두 프레임워크 사이의 상태, 이벤트, 크기와 생명주기를 연결해요.
5. 지원 OS를 확인하며 제스처, 환경 값, 애니메이션을 공유해요.

## 먼저 알아둘 통합 용어

| 용어                    | 쉬운 뜻                                                                                                                                                                 |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| UIKit                   | `UIView`와 `UIViewController` 같은 참조 타입을 만들고 속성을 직접 바꾸며 iOS 화면을 구성하는 Apple 프레임워크예요.                                                      |
| SwiftUI                 | 현재 상태로 화면이 어떻게 보여야 하는지를 `View` 값으로 선언하면, 상태 변화에 맞춰 필요한 부분을 갱신하는 Apple 프레임워크예요.                                         |
| 컨테이너(container)     | 다른 화면이나 객체를 안에 담고 크기와 생명주기를 관리하는 바깥 객체예요.                                                                                                |
| 호스팅(hosting)         | SwiftUI 뷰 계층을 UIKit의 뷰 컨트롤러나 셀 구성처럼 사용할 수 있는 형태로 담는 일이에요.                                                                                |
| Representable           | UIKit 뷰나 뷰 컨트롤러를 SwiftUI의 `View`처럼 사용할 수 있도록 생성·갱신·정리 방법을 알려 주는 어댑터예요.                                                              |
| 어댑터(adapter)         | 서로 다른 사용 규칙을 가진 두 대상을 연결하는 얇은 변환 계층이에요. 여기서는 UIKit의 명령형 객체를 SwiftUI의 선언형 갱신 흐름에 연결해요.                               |
| 단일 데이터 원천        | 같은 의미의 상태를 여러 곳에 따로 저장하지 않고 한 곳을 기준값으로 삼는 원칙이에요.                                                                                     |
| Coordinator             | UIKit의 delegate나 target-action 이벤트를 받아 SwiftUI의 `Binding`이나 클로저로 전달하는 객체예요.                                                                      |
| 뷰 컨트롤러 containment | 부모 `UIViewController`가 자식 뷰 컨트롤러의 추가와 제거를 생명주기 규칙에 맞게 관리하는 방식이에요. `UIHostingController`를 화면 일부에 넣을 때 이 규칙을 따라야 해요. |
| 환경 값과 trait         | SwiftUI의 environment와 UIKit의 trait은 색상 모드나 크기 등 계층 전체에 내려보내는 구성 정보예요. iOS 17부터 사용자 정의 값도 두 체계 사이에서 연결할 수 있어요.        |

## 통합은 소유권 경계를 만드는 일이에요

두 프레임워크를 섞을 때 핵심 질문은 “어느 프레임워크가 바깥 화면을 소유하나요?”예요.

```text
UIKit이 바깥 화면을 소유

UIViewController
└─ UIHostingController
   └─ SwiftUI View


SwiftUI가 바깥 화면을 소유

SwiftUI View
└─ UIViewRepresentable 또는 UIViewControllerRepresentable
   └─ UIView 또는 UIViewController
```

바깥 프레임워크가 크기와 생명주기를 주도하고, 안쪽 프레임워크는 브리지 API를 통해 그 규칙에 참여해요. 그래서 UIKit 객체의 `frame`을 SwiftUI 안에서 임의로 바꾸거나, 자식 `UIHostingController`를 containment 절차 없이 뷰만 추가하면 두 프레임워크가 같은 책임을 두고 충돌할 수 있어요.

Apple의 [UIKit integration](https://developer.apple.com/documentation/swiftui/uikit-integration) 문서도 같은 두 방향을 구분해요. SwiftUI를 UIKit에 넣을 때는 hosting controller를, UIKit 객체를 SwiftUI에 넣을 때는 representable을 사용해요.

## 바깥 화면과 재사용 대상을 기준으로 API를 골라요

| 상황                                               | 먼저 고려할 API                    | 이유                                                                                      |
| -------------------------------------------------- | ---------------------------------- | ----------------------------------------------------------------------------------------- |
| UIKit에서 SwiftUI 화면을 push, present하고 싶어요. | `UIHostingController`              | SwiftUI 계층을 일반 `UIViewController`처럼 다룰 수 있어요.                                |
| UIKit 화면 일부에 SwiftUI를 넣고 싶어요.           | 자식 `UIHostingController`         | containment와 Auto Layout으로 기존 화면 일부만 교체할 수 있어요.                          |
| UIKit 목록 셀의 내용만 SwiftUI로 만들고 싶어요.    | `UIHostingConfiguration`           | 별도 자식 컨트롤러 없이 셀의 `contentConfiguration`으로 SwiftUI 내용을 구성해요.          |
| SwiftUI에서 UIKit 뷰 하나를 쓰고 싶어요.           | `UIViewRepresentable`              | `UIView`의 생성, 상태 갱신, 이벤트 전달을 SwiftUI 흐름에 연결해요.                        |
| SwiftUI에서 UIKit 뷰 컨트롤러를 쓰고 싶어요.       | `UIViewControllerRepresentable`    | delegate와 화면 생명주기가 있는 컨트롤러 전체를 감싸요.                                   |
| SwiftUI 뷰에 UIKit 제스처 인식기를 붙이고 싶어요.  | `UIGestureRecognizerRepresentable` | iOS 18부터 인식기 생성과 좌표 변환을 직접 연결해요.                                       |
| 계층형 설정을 두 프레임워크에서 함께 읽고 싶어요.  | `UITraitBridgedEnvironmentKey`     | iOS 17부터 UIKit trait과 SwiftUI environment가 같은 값을 공유해요.                        |
| 앱의 SwiftUI scene을 UIKit 생명주기와 연결해요.    | `UIHostingSceneDelegate`           | iOS 26부터 scene 수준의 브리지를 제공해요. 일반 화면 임베딩보다 큰 마이그레이션 단위예요. |

`UIHostingController`와 `UIViewControllerRepresentable`은 이름이 비슷하지만 방향이 반대예요.

- `UIHostingController`: UIKit이 SwiftUI를 소유해요.
- `UIViewControllerRepresentable`: SwiftUI가 UIKit을 소유해요.

이 한 문장을 먼저 기억하면 API를 고르기 쉬워요.

## 지원 OS가 통합 전략을 바꿔요

공식 문서에 표시된 iOS 도입 버전을 기준으로 정리하면 다음과 같아요.

| iOS 버전 | 사용할 수 있는 대표 기능                                                          | 하위 버전에서의 선택                                                                   |
| -------- | --------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| iOS 13   | `UIHostingController`, `UIViewRepresentable`, `UIViewControllerRepresentable`     | 양방향 통합의 기본 API이므로 iOS 13 이상 앱에서 바로 사용할 수 있어요.                 |
| iOS 16   | `UIHostingConfiguration`, `UIHostingControllerSizingOptions`                      | 이전 버전 목록 셀은 UIKit content configuration이나 별도 hosting container를 사용해요. |
| iOS 17   | `UITraitBridgedEnvironmentKey`와 사용자 정의 UIKit trait                          | 직접 프로퍼티, 공유 모델, 명시적인 변환 코드를 사용해요.                               |
| iOS 18   | `UIGestureRecognizerRepresentable`, SwiftUI `Animation`을 이용한 UIKit 애니메이션 | SwiftUI 기본 gesture를 우선하고, 꼭 필요한 UIKit 인식기는 별도 어댑터로 감싸요.        |
| iOS 26   | `UIHostingSceneDelegate`                                                          | 기존 scene delegate와 화면 단위 hosting을 유지해요.                                    |

`UIHostingOrnament`와 `UIOrnament`도 공식 UIKit integration 목차에 있지만 visionOS 1.0 이상 전용이에요. 이 섹션의 iOS 예제에는 포함하지 않고, [제스처·환경·애니메이션 문서](./gestures-environment-animation)에서 플랫폼 범위를 따로 설명해요.

## UIKit 앱에는 작은 SwiftUI 경계부터 넣어요

독서 목표 앱의 대시보드가 UIKit으로 만들어져 있다고 가정할게요. 전체 화면을 다시 쓰기 전에 다음처럼 작은 경계를 선택할 수 있어요.

1. 상태 변화가 적은 진행률 카드 하나를 SwiftUI로 만들어요.
2. `UIHostingController`로 기존 `UIViewController`의 자식에 넣어요.
3. UIKit과 SwiftUI가 같은 `ReadingGoalStore`를 전달받게 해요.
4. 문제가 없다면 목록 셀을 `UIHostingConfiguration`으로 바꿔요.
5. 화면 전환과 내비게이션의 소유권은 당분간 UIKit에 둬요.

이 방식은 한 화면의 모든 책임을 동시에 옮기지 않아요. SwiftUI로 바꾼 경계가 작으므로 성능, 접근성, 상태 갱신을 확인하고 다음 범위를 결정할 수 있어요.

구현은 [UIKit에 SwiftUI 넣기](./swiftui-in-uikit)에서 단계별로 살펴봐요.

## SwiftUI 앱에서는 UIKit 기능만 좁게 감싸요

SwiftUI로 만든 목표 편집 화면에서 `UISlider`나 기존 색상 선택 컨트롤러가 필요할 수 있어요. 이때 UIKit 화면 전체를 새로 만들기보다 필요한 객체만 representable로 감싸요.

1. 뷰 하나면 `UIViewRepresentable`을 선택해요.
2. delegate와 자체 화면 생명주기가 있는 컨트롤러면 `UIViewControllerRepresentable`을 선택해요.
3. SwiftUI 상태는 `Binding`으로 어댑터에 전달해요.
4. UIKit 이벤트는 `Coordinator`가 다시 `Binding`에 기록해요.
5. `update` 메서드는 현재 상태를 여러 번 받아도 결과가 같도록 작성해요.

구현은 [SwiftUI에 UIKit 넣기](./uikit-in-swiftui)에서 이어져요.

## 화면보다 상태의 소유자를 먼저 정해요

통합 코드가 어려워지는 가장 흔한 이유는 같은 값을 UIKit과 SwiftUI가 각각 저장하기 때문이에요.

```text
피해야 할 흐름

UIKit의 completedMinutes ──┐
                          ├─ 어느 값이 최신인지 알기 어려움
SwiftUI의 completedMinutes ┘


권장 흐름

                 ┌─ UIKit이 읽고 변경
ReadingGoalStore ┤
                 └─ SwiftUI가 관찰하고 표시
```

화면 기술이 둘이어도 도메인 상태의 기준은 하나여야 해요. UIKit이 소유한 공유 모델을 SwiftUI에 전달할 수도 있고, SwiftUI의 `State`를 `Binding`으로 UIKit 어댑터에 전달할 수도 있어요. 중요한 것은 **양쪽이 모두 독립적인 원본이라고 생각하지 않게 하는 것**이에요.

자세한 갱신 규칙과 피드백 루프 방지는 [상태·레이아웃·생명주기](./data-layout-lifecycle)에서 다뤄요.

## 언제 함께 사용해야 하나요

다음 조건에서는 통합 API가 특히 유용해요.

- 큰 UIKit 앱에 SwiftUI를 화면이나 컴포넌트 단위로 점진적으로 도입할 때
- SwiftUI에 아직 같은 기능이 없거나 기존 UIKit 컴포넌트를 검증된 상태로 재사용할 때
- UIKit의 내비게이션 구조는 유지하면서 셀과 작은 화면부터 SwiftUI로 바꿀 때
- 두 프레임워크가 공유해야 하는 상태와 소유권 경계를 명확히 정할 수 있을 때

반대로 아래 상황에서는 브리지를 추가하지 않아도 돼요.

- 순수 SwiftUI나 순수 UIKit으로 짧고 명확하게 구현할 수 있는 새 화면
- 어댑터가 실제 기능보다 더 많은 상태 복제와 생명주기 코드를 만들 때
- 최소 지원 OS 때문에 핵심 API를 쓸 수 없고 하위 버전용 구현 비용이 이득보다 클 때
- 프레임워크 전환 목적 없이 단지 새로운 API를 사용해 보기 위해 경계를 늘릴 때

브리지는 영구적인 구조가 될 수도 있고 마이그레이션 중간 단계가 될 수도 있어요. 어느 쪽인지 팀이 미리 정하면 나중에 어댑터를 유지할지 제거할지 판단하기 쉬워요.

## 적용 순서를 정리해요

1. 바깥 화면을 UIKit과 SwiftUI 중 누가 소유하는지 적어요.
2. 전체 화면, 화면 일부, 셀, 뷰, 뷰 컨트롤러 중 가장 작은 통합 단위를 고르세요.
3. 최소 지원 OS에서 쓸 수 있는 API인지 확인하세요.
4. 상태의 단일 원천과 이벤트가 돌아갈 경로를 정하세요.
5. 생성, 갱신, 제거와 크기 협상의 책임을 각각 한쪽에 배정하세요.
6. 작은 경계 하나를 구현하고 갱신 횟수, 메모리 해제, 회전과 Dynamic Type을 확인하세요.
7. 효과가 확인된 다음 경계를 넓히세요.

## 어떤 문서부터 읽어야 하나요

| 목표                                            | 다음 문서                                                  |
| ----------------------------------------------- | ---------------------------------------------------------- |
| UIKit 화면이나 셀에 SwiftUI를 도입하고 싶어요.  | [UIKit에 SwiftUI 넣기](./swiftui-in-uikit)                 |
| SwiftUI에서 UIKit 뷰나 컨트롤러를 재사용해요.   | [SwiftUI에 UIKit 넣기](./uikit-in-swiftui)                 |
| 갱신 루프, 크기, 해제 문제를 예방하고 싶어요.   | [상태·레이아웃·생명주기](./data-layout-lifecycle)          |
| 최신 제스처, 환경 값, 애니메이션 브리지를 써요. | [제스처·환경·애니메이션](./gestures-environment-animation) |

## 면접에서 이어질 수 있는 질문

### `UIHostingController`와 `UIViewControllerRepresentable`은 어떻게 다른가요?

통합 방향이 반대예요. `UIHostingController`는 SwiftUI 뷰 계층을 UIKit 뷰 컨트롤러로 감싸고, `UIViewControllerRepresentable`은 UIKit 뷰 컨트롤러를 SwiftUI의 `View`로 감싸요. 바깥 화면을 어느 프레임워크가 소유하는지 먼저 보면 선택할 수 있어요.

### UIKit 앱을 SwiftUI로 한 번에 다시 작성하지 않는 이유는 무엇인가요?

동작이 검증된 화면을 유지한 채 작은 경계부터 상태, 접근성, 성능을 확인할 수 있기 때문이에요. 통합 API를 사용하면 내비게이션이나 데이터 계층을 그대로 두고 화면이나 셀 단위로 전환할 수 있어 회귀 범위를 줄일 수 있어요.

### 통합 화면에서 가장 먼저 정해야 할 것은 무엇인가요?

화면의 소유자와 상태의 단일 원천이에요. 이 둘을 정하지 않으면 UIKit과 SwiftUI가 같은 값을 따로 보관하거나 같은 크기를 동시에 제어해 갱신 루프와 레이아웃 충돌이 생길 수 있어요.

### Representable이 어댑터인 이유는 무엇인가요?

UIKit은 오래 살아 있는 참조 객체의 속성을 바꾸고, SwiftUI는 새 상태를 반영한 `View` 값을 반복해서 만들어요. Representable은 `make`, `update`, `dismantle` 단계로 두 생명주기를 연결하고 Coordinator로 이벤트 방향을 변환해요.

## 참고 자료

- [UIKit integration](https://developer.apple.com/documentation/swiftui/uikit-integration)
- [UIHostingController](https://developer.apple.com/documentation/swiftui/uihostingcontroller)
- [UIHostingConfiguration](https://developer.apple.com/documentation/swiftui/uihostingconfiguration)
- [UIViewRepresentable](https://developer.apple.com/documentation/swiftui/uiviewrepresentable)
- [UIViewControllerRepresentable](https://developer.apple.com/documentation/swiftui/uiviewcontrollerrepresentable)
- [Managing user interface state](https://developer.apple.com/documentation/swiftui/managing-user-interface-state)
