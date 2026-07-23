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

## 개요 (Overview)

Collection View Controller는 다음 동작을 기본으로 제공해요.

- nib 파일이나 storyboard가 지정되어 있다면 해당 리소스에서 뷰를 불러와요. 코드로 Collection View Controller를 만들면 아직 구성되지 않은 새 Collection View를 자동으로 생성하며, `collectionView` 프로퍼티로 접근할 수 있어요.
- storyboard나 nib에서 Collection View를 불러오면 그 안에 연결된 data source와 delegate를 사용해요. 둘 중 하나가 연결되어 있지 않으면 Collection View Controller 자신이 비어 있는 역할을 맡아요.
- Collection View가 처음 나타나기 직전에 데이터를 다시 불러와요. 화면이 표시될 때마다 현재 선택도 지워요. 선택을 유지하려면 `clearsSelectionOnViewWillAppear`를 `false`로 설정해요.

관리할 Collection View마다 `UICollectionViewController`의 사용자 정의 하위 클래스를 만들어요. `init(collectionViewLayout:)`으로 컨트롤러를 초기화할 때 Collection View가 사용할 layout을 전달해요. 이때 생성되는 Collection View에는 아직 크기와 콘텐츠가 없으므로, 일반적으로 컨트롤러 자신인 data source와 delegate가 필요한 정보를 제공해야 해요.

`loadView()`나 다른 상위 클래스 메서드를 재정의할 수 있지만, 구현 안에서 반드시 `super`의 메서드를 호출해야 해요. 그렇지 않으면 Collection View Controller가 Collection View의 상태를 일관되게 유지하는 데 필요한 기본 작업을 모두 수행하지 못할 수 있어요.

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

| API                           | 하는 일                                                         |
| ----------------------------- | --------------------------------------------------------------- |
| `init(collectionViewLayout:)` | 지정한 layout을 사용하는 Collection View나 컨트롤러를 만들어요. |
| `init(nibName:bundle:)`       | 지정한 nib과 bundle에서 Collection View Controller를 만들어요.  |
| `init(coder:)`                | NSCoder에 저장된 구성으로 인스턴스를 복원해요.                  |

### collection view 확인하기 (Getting the collection view)

현재 상태에서 필요한 값이나 위치를 안전하게 조회하는 API예요.

| API                    | 하는 일                                              |
| ---------------------- | ---------------------------------------------------- |
| `collectionView`       | 현재 컨트롤러나 layout에 연결된 Collection View예요. |
| `collectionViewLayout` | 요소의 위치와 크기를 계산하는 현재 layout이에요.     |

### collection view behavior 설정하기 (Configuring the collection view behavior)

동작과 표시 방식을 요구사항에 맞게 설정하는 API예요.

| API                                             | 하는 일                                                     |
| ----------------------------------------------- | ----------------------------------------------------------- |
| `clearsSelectionOnViewWillAppear`               | 화면이 다시 나타날 때 기존 선택을 지울지 정해요.            |
| `installsStandardGestureForInteractiveMovement` | 기본 길게 누르기 재배치 gesture를 자동으로 설치할지 정해요. |

### Integrating with a navigation controller

`UICollectionViewController`에서 Integrating with a navigation controller 책임을 담당하는 API예요.

| API                                      | 하는 일                                                        |
| ---------------------------------------- | -------------------------------------------------------------- |
| `useLayoutToLayoutNavigationTransitions` | layout 전환이나 update 전후의 임시 상태를 준비하거나 정리해요. |

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
