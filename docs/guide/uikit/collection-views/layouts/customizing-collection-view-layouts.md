---
title: 'Collection View Layout 사용자 정의하기'
description: '사용자 정의 Collection View Layout은 prepare()에서 계산을 준비하고 각 요소의 layout attributes와 전체 콘텐츠 크기를 반환해 자유로운 배치를 만들어요. 주요 API, 사용 예제, 주의점을 함께 정리합니다.'
---

# Collection View Layout 사용자 정의하기

> **면접 답변 한 줄 요약:** 사용자 정의 Collection View Layout은 `prepare()`에서 계산을 준비하고 각 요소의 layout attributes와 전체 콘텐츠 크기를 반환해 자유로운 배치를 만들어요.

Apple 공식 문서의 **Layouts — Manual layouts** 영역에 대응하는 한국어 실습 문서예요. 원문의 구조와 핵심 API를 확인하되, 코드는 작은 사진 목록 예제로 다시 구성했어요.

## 먼저 알아둘 용어

| 용어    | 쉬운 뜻                                                        |
| ------- | -------------------------------------------------------------- |
| Item    | 셀 하나가 차지할 크기와 간격을 정의하는 레이아웃 단위예요.     |
| Group   | 여러 item을 가로·세로 또는 사용자 정의 방식으로 묶는 단위예요. |
| Section | group을 반복하고 헤더·배경·스크롤 동작을 설정하는 단위예요.    |

## 사용자 정의 레이아웃의 네 책임을 구분해요

1. `prepare()`에서 현재 데이터와 컨테이너 크기로 attributes를 계산해요.
2. `collectionViewContentSize`로 전체 스크롤 영역을 알려 줘요.
3. `layoutAttributesForElements(in:)`로 주어진 rect와 겹치는 결과만 반환해요.
4. bounds나 데이터가 바뀌면 필요한 범위만 무효화해요.

공식 예제의 Mosaic Layout은 한 행을 단일 셀, 같은 크기의 두 셀, 큰 셀과 작은 셀 두 개를 조합한 형태 등 네 가지 방식으로 배치해요.

<!-- Apple DocC image: CellLayouts -->

![단일 셀부터 큰 셀과 작은 셀을 조합한 형태까지 네 가지 Mosaic Layout 행 배치](../assets/apple-docs/CellLayouts.png)

```swift
final class MosaicLayout: UICollectionViewLayout {
  private var cachedAttributes: [UICollectionViewLayoutAttributes] = []
  private var contentHeight: CGFloat = 0

  override var collectionViewContentSize: CGSize {
    CGSize(
      width: collectionView?.bounds.width ?? 0,
      height: contentHeight
    )
  }

  override func prepare() {
    super.prepare()
    guard let collectionView, cachedAttributes.isEmpty else { return }
    // 각 item의 frame을 계산해 cachedAttributes에 저장해요.
  }

  override func layoutAttributesForElements(
    in rect: CGRect
  ) -> [UICollectionViewLayoutAttributes]? {
    cachedAttributes.filter { $0.frame.intersects(rect) }
  }

  override func layoutAttributesForItem(
    at indexPath: IndexPath
  ) -> UICollectionViewLayoutAttributes? {
    cachedAttributes.first { $0.indexPath == indexPath }
  }
}
```

Compositional Layout으로 표현할 수 있는 배치라면 먼저 그 방식을 선택해요. 완전한 사용자 정의 레이아웃은 자유도가 높은 대신 무효화, 애니메이션, self-sizing, 접근성 방향까지 직접 책임져야 해요.

## 적용 순서를 정리해요

1. 화면에서 변하지 않는 item 식별자를 먼저 정해요.
2. 데이터, 셀, 레이아웃, 상호작용 중 이 문서가 바꾸는 책임을 구분해요.
3. 가장 작은 데이터로 정상 동작을 확인해요.
4. 삽입·삭제·이동과 셀 재사용 상황을 각각 확인해요.
5. 비동기 작업은 성공뿐 아니라 취소와 실패 경로도 검사해요.

## 참고 자료

- [Apple Developer Documentation — Customizing collection view layouts](https://developer.apple.com/documentation/uikit/customizing-collection-view-layouts)
- [Collection Views 한눈에 보기](./../index)
