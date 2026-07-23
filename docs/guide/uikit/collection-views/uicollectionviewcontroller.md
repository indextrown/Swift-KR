---
title: 'UICollectionViewController'
description: 'UICollectionViewController는 Collection View의 생성과 생명주기, 선택 상태 복원 같은 기본 동작을 한 화면 컨트롤러에 묶어 제공해요. 주요 API, 사용 예제, 주의점을 함께 정리합니다.'
---

# UICollectionViewController

> **면접 답변 한 줄 요약:** `UICollectionViewController`는 Collection View의 생성과 생명주기, 선택 상태 복원 같은 기본 동작을 한 화면 컨트롤러에 묶어 제공해요.

Apple 공식 문서의 **Collection Views — View** 영역에 있는 클래스예요. 이 페이지는 공식 topic section 순서를 유지하면서 실제 코드에서 무엇을 선택해야 하는지 한국어로 설명해요.

## 먼저 알아둘 용어

| 용어            | 쉬운 뜻                                                 |
| --------------- | ------------------------------------------------------- |
| View Controller | 화면의 생명주기와 여러 뷰를 조정하는 객체예요.          |
| Layout          | 셀과 보조 뷰의 크기와 위치를 계산하는 객체예요.         |
| Data Source     | 표시할 item과 셀을 Collection View에 제공하는 객체예요. |

## 이 API가 맡는 역할

화면 객체는 데이터를 직접 소유하거나 배치 규칙을 모두 계산하기보다 data source와 layout에 역할을 나눠요. Collection View 자체는 스크롤, 재사용, 선택, 표시 중인 요소 조회처럼 화면 동작을 관리해요.

UICollectionViewController는 Collection View의 생성과 생명주기, 선택 상태 복원 같은 기본 동작을 한 화면 컨트롤러에 묶어 제공해요.

## 선언과 지원 범위를 확인해요

```swift
@MainActor class UICollectionViewController
```

**지원 플랫폼:** iOS 6.0+ · iPadOS 6.0+ · Mac Catalyst 13.1+ · tvOS · visionOS 1.0+

## 가장 작은 사용 예제

아래 예제에서는 이 API가 속한 역할이 전체 Collection View 구성에서 어디에 놓이는지 확인해요. 핵심 호출에 집중할 수 있도록 모델 선언과 주변 화면 구성은 생략했어요.

```swift
import UIKit

@MainActor
final class PhotosViewController: UICollectionViewController {
  init() {
    super.init(collectionViewLayout: UICollectionViewFlowLayout())
  }

  required init?(coder: NSCoder) {
    fatalError("init(coder:) has not been implemented")
  }

  override func viewDidLoad() {
    super.viewDidLoad()
    collectionView.register(
      UICollectionViewCell.self,
      forCellWithReuseIdentifier: "PhotoCell"
    )
  }
}
```

## 공식 API 목차대로 살펴봐요

### collection view controller 만들기 (Creating a collection view controller)

`UICollectionViewController`를 만들거나 필요한 구성 요소를 연결하는 API예요.

| API                           | 하는 일                                                    |
| ----------------------------- | ---------------------------------------------------------- |
| `init(collectionViewLayout:)` | 레이아웃에 필요한 값을 받아 새 인스턴스를 만들어요.        |
| `init(nibName:bundle:)`       | Collection View에 필요한 값을 받아 새 인스턴스를 만들어요. |
| `init(coder:)`                | Collection View에 필요한 값을 받아 새 인스턴스를 만들어요. |

### collection view 확인하기 (Getting the collection view)

현재 상태에서 필요한 값이나 위치를 안전하게 조회하는 API예요.

| API                    | 하는 일                                                         |
| ---------------------- | --------------------------------------------------------------- |
| `collectionView`       | Collection View의 현재 값이나 설정을 읽고 필요한 경우 변경해요. |
| `collectionViewLayout` | 레이아웃의 현재 값이나 설정을 읽고 필요한 경우 변경해요.        |

### collection view behavior 설정하기 (Configuring the collection view behavior)

동작과 표시 방식을 요구사항에 맞게 설정하는 API예요.

| API                                             | 하는 일                                                         |
| ----------------------------------------------- | --------------------------------------------------------------- |
| `clearsSelectionOnViewWillAppear`               | Collection View의 현재 값이나 설정을 읽고 필요한 경우 변경해요. |
| `installsStandardGestureForInteractiveMovement` | Collection View의 현재 값이나 설정을 읽고 필요한 경우 변경해요. |

### Integrating with a navigation controller

`UICollectionViewController`에서 Integrating with a navigation controller 책임을 담당하는 API예요.

| API                                      | 하는 일                                                  |
| ---------------------------------------- | -------------------------------------------------------- |
| `useLayoutToLayoutNavigationTransitions` | 레이아웃의 현재 값이나 설정을 읽고 필요한 경우 변경해요. |

## 타입 관계를 확인해요

| 관계              | 타입                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 상속              | `UIViewController`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| 준수하는 프로토콜 | `CVarArg`, `CustomDebugStringConvertible`, `CustomStringConvertible`, `Equatable`, `Hashable`, `NSCoding`, `NSExtensionRequestHandling`, `NSObjectProtocol`, `NSTouchBarProvider`, `Sendable`, `SendableMetatype`, `UIActivityItemsConfigurationProviding`, `UIAppearanceContainer`, `UICollectionViewDataSource`, `UICollectionViewDelegate`, `UIContentContainer`, `UIFocusEnvironment`, `UIPasteConfigurationSupporting`, `UIResponderStandardEditActions`, `UIScrollViewDelegate`, `UIStateRestoring`, `UITraitChangeObservable`, `UITraitEnvironment`, `UIUserActivityRestoring` |

## 사용할 때 주의할 점

Collection View를 만들 때 layout은 필수예요. 데이터 원본을 바꾼 뒤 화면 갱신 API를 호출하지 않거나, `IndexPath`를 데이터의 영구 식별자로 저장하면 삽입·삭제 뒤 잘못된 item을 가리킬 수 있어요.

## 함께 읽으면 좋은 문서

- [Collection Views 한눈에 보기](./index)
- [View 학습 가이드](./views)
- [공식 문서 인벤토리](./official-document-inventory)

## 참고 자료

- [Apple Developer Documentation — UICollectionViewController](https://developer.apple.com/documentation/uikit/uicollectionviewcontroller)
