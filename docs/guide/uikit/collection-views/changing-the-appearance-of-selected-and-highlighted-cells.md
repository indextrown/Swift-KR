---
title: '선택·하이라이트 셀 모양 바꾸기'
description: '셀의 선택과 하이라이트 모양은 일회성 이벤트에서 직접 바꾸기보다 configuration state를 기준으로 매번 다시 계산해야 재사용 후에도 안전해요. 주요 API, 사용 예제, 주의점을 함께 정리합니다.'
---

# 선택·하이라이트 셀 모양 바꾸기

> **면접 답변 한 줄 요약:** 셀의 선택과 하이라이트 모양은 일회성 이벤트에서 직접 바꾸기보다 configuration state를 기준으로 매번 다시 계산해야 재사용 후에도 안전해요.

Apple 공식 문서의 **Collection Views — Selection management** 영역에 대응하는 한국어 실습 문서예요. 원문의 구조와 핵심 API를 확인하되, 코드는 작은 사진 목록 예제로 다시 구성했어요.

## 먼저 알아둘 용어

| 용어                | 쉬운 뜻                                                      |
| ------------------- | ------------------------------------------------------------ |
| Highlight           | 손가락이 닿아 있는 동안 제공하는 일시적인 시각 피드백이에요. |
| Selection           | 사용자가 item을 선택했다는 지속적인 상태예요.                |
| Configuration State | 셀 모양을 결정하는 선택·하이라이트 등의 상태 값이에요.       |

## 하이라이트와 선택을 구분해요

하이라이트는 손가락이 닿은 짧은 순간이고 선택은 상호작용 뒤에도 남는 상태예요. 셀이 재사용될 수 있으므로 이벤트 메서드에서 배경색을 한 번 바꾸는 방식은 이전 상태가 남기 쉬워요.

선택되지 않은 셀을 누르면 먼저 `isHighlighted`가 `true`가 되고, 셀 안에서 손가락을 떼면 하이라이트가 끝나면서 `isSelected`가 `true`로 바뀌어요.

<!-- Apple DocC image: collection-view-selection_2x -->

![선택되지 않은 셀을 누르고 손가락을 뗄 때 하이라이트와 선택 상태가 변하는 순서](./assets/apple-docs/collection-view-selection_2x.png)

## Configuration State로 모양을 다시 계산해요

```swift
final class PhotoCell: UICollectionViewCell {
  override func updateConfiguration(using state: UICellConfigurationState) {
    var background = UIBackgroundConfiguration.listPlainCell()

    if state.isSelected {
      background.backgroundColor = .systemBlue
    } else if state.isHighlighted {
      background.backgroundColor = .systemBlue.withAlphaComponent(0.2)
    } else {
      background.backgroundColor = .secondarySystemBackground
    }

    backgroundConfiguration = background
  }
}
```

상태가 바뀌면 UIKit이 `updateConfiguration(using:)`을 다시 호출해요. 앱의 사용자 정의 상태가 추가되면 `configurationState`를 확장하고 `setNeedsUpdateConfiguration()`으로 재계산을 요청해요.

선택을 화면 전환 뒤에도 유지해야 한다면 `IndexPath`가 아니라 item 식별자를 모델에 저장하고 snapshot 적용 후 현재 위치를 다시 찾아 선택해요.

## 적용 순서를 정리해요

1. 화면에서 변하지 않는 item 식별자를 먼저 정해요.
2. 데이터, 셀, 레이아웃, 상호작용 중 이 문서가 바꾸는 책임을 구분해요.
3. 가장 작은 데이터로 정상 동작을 확인해요.
4. 삽입·삭제·이동과 셀 재사용 상황을 각각 확인해요.
5. 비동기 작업은 성공뿐 아니라 취소와 실패 경로도 검사해요.

## 참고 자료

- [Apple Developer Documentation — Changing the appearance of selected and highlighted cells](https://developer.apple.com/documentation/uikit/changing-the-appearance-of-selected-and-highlighted-cells)
- [Collection Views 한눈에 보기](./index)
