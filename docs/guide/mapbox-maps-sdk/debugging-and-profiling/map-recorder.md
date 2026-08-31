---
title: Mapbox MapRecorder로 지도 문제 재현하기
description: MapRecorder의 지도 API 기록·재생을 화면 녹화와 구분하고, 제한된 시간 창과 동일 SDK 버전으로 시각 오류 및 성능 회귀를 조사합니다.
source: https://docs.mapbox.com/ios/maps/guides/debugging-and-profiling/map-recorder/
reviewed: '2026-08-31'
---

# Mapbox MapRecorder로 지도 문제 재현하기

> **면접 답변 한 줄 요약:** MapRecorder는 지도 객체에 가해진 API 동작을 기록하고 재생해, 카메라 이동처럼 수동 재현이 어려운 문제를 같은 입력으로 조사하는 실험용 도구예요.

“핀을 누른 뒤 지도를 돌리면 잠깐 깜빡인다”는 버그는 정지 화면만으로 재현하기 어려워요. MapRecorder는 보이는 픽셀의 동영상이 아니라 지도 동작의 기록이라는 점부터 구분해요.

## 먼저 알아둘 용어

| 용어             | 쉬운 뜻                                                   |
| ---------------- | --------------------------------------------------------- |
| Recording        | 지도에 전달된 동작과 관련 상태를 보관한 기록이에요.       |
| Replay           | 기록된 동작을 지도에 다시 적용하는 일이에요.              |
| 시간 창          | 최근 일정 시간의 기록만 유지하는 범위예요.                |
| Experimental SPI | 일반 공개 API와 안정성 약속이 다른 실험용 인터페이스예요. |

## SDK 버전과 기록 범위를 함께 고정해요

공식 가이드는 MapRecorder를 개발 전용 실험 기능으로 안내하며, 기록한 SDK 버전에서의 재생만 신뢰할 수 있다고 설명해요. SDK 버전을 바꾼 뒤 오래된 기록이 계속 호환된다고 가정하지 마세요. [공식 MapRecorder 가이드](https://docs.mapbox.com/ios/maps/guides/debugging-and-profiling/map-recorder/)

`11.29.1` 소스에서 `makeRecorder()`는 던질 수 있는 함수이고, `stop()`은 기록된 `Data`를 반환해요. 기본 시간 창은 제한이 없으므로 아래에서는 최근 30초로 제한해요. [MapRecorder 구현](https://github.com/mapbox/mapbox-maps-ios/blob/11.29.1/Sources/MapboxMaps/Foundation/MapRecorder.swift), [기록 옵션](https://github.com/mapbox/mapbox-maps-ios/blob/11.29.1/Sources/MapboxMaps/Foundation/MapRecorderOptions.swift)

## 개발용 소유 객체에서 기록을 시작하고 끝내요

아래 클래스는 SDK 호출 형태를 보여 주는 작은 도구예요. 앱의 개발 전용 타깃이나 진단 빌드에만 추가하고, 파일 저장·외부 전송은 포함하지 않아요.

```swift
import Foundation
@_spi(Experimental) import MapboxMaps

@MainActor
final class DebugMapRecording {
    private let recorder: MapRecorder
    private var isRecording = false

    /// 지정한 지도에 연결된 개발용 기록기를 만듭니다.
    /// - Parameter map: 기록하려는 기존 지도 객체입니다.
    /// - Throws: SDK에서 기록기 생성에 실패하면 오류를 전달합니다.
    init(
        map: MapboxMap
    ) throws {
        recorder = try map.makeRecorder()
    }

    func start() {
        guard !isRecording else { return }
        recorder.start(options: MapRecorderOptions(
            timeWindow: 30_000,
            loggingEnabled: false,
            compressed: true
        ))
        isRecording = true
    }

    func stop() -> Data? {
        guard isRecording else { return nil }
        isRecording = false
        return recorder.stop()
    }

    /// 같은 SDK 버전에서 얻은 기록을 한 번 재생합니다.
    /// - Parameter recording: stop으로 반환받은 지도 기록입니다.
    func replayOnce(
        recording: Data
    ) {
        guard !isRecording else { return }
        recorder.replay(recordedSequence: recording) {
            print("지도 기록 재생 완료")
        }
    }
}
```

지도 화면의 개발 도구가 이 객체를 소유하고, 기록 시작·종료 버튼에서 호출하는 구조예요. 재생 중에는 버튼을 비활성화하는 UI 상태를 추가해 중복 재생을 막으세요. 오류를 무시하는 `try?` 대신 생성 실패를 개발 도구에 표시하는 편이 조사에 도움이 돼요.

## 영상·기록·성능 결과를 분리해서 첨부해요

다음은 작성자가 제안하는 버그 자료 묶음이에요.

| 자료                       | 답하는 질문                              |
| -------------------------- | ---------------------------------------- |
| 짧은 영상                  | 사용자에게 무엇이 잘못 보였나요?         |
| MapRecorder 기록           | 어떤 지도 동작을 다시 실행해야 하나요?   |
| 기기·SDK·스타일 식별자     | 어느 조건에서 재현했나요?                |
| 통계 또는 Instruments 기록 | 문제가 생긴 구간의 실행 비용은 어떤가요? |

기록에는 좌표와 스타일 등 조사에 필요한 정보가 포함될 수 있어요. 외부 이슈에 첨부하기 전 민감한 위치·사용자 데이터가 있는지 검토하세요. 임의로 JSON 필드를 지우면 재생이 깨질 수 있으므로, 공개 가능한 테스트 지역에서 새 기록을 만드는 방법도 좋아요.

## 성능 회귀 실험은 같은 기록 안에서 바꿔요

매장 라벨이 많은 지도에서 “라벨 표시 조건 추가”의 효과를 조사한다고 가정해요. 먼저 같은 SDK에서 기준 상태를 재생하고, 스타일 조건 하나만 수정한 뒤 다시 측정해요.

SDK를 업그레이드하는 실험은 기록 호환성 제한을 먼저 확인해야 해요. 호환된다는 근거 없이 서로 다른 버전에 같은 기록을 적용한 결과를 정량 비교하지 마세요. 카메라 동작이 같아도 네트워크·캐시·기기 온도까지 같아지는 것은 아니에요.

## 적용 체크리스트

- [ ] SDK 버전과 기록 형식을 함께 보관했나요?
- [ ] 긴 세션은 시간 창을 제한하고 기록을 명시적으로 종료하나요?
- [ ] 재생 입력과 실제 보이는 오류를 함께 남겼나요?
- [ ] 재생 중 사용자의 추가 조작을 통제했나요?
- [ ] 공유할 기록에서 민감한 위치를 검토했나요?
- [ ] 진단 코드가 출시 경로에서 제외되나요?

## 면접에서 이어질 수 있는 질문

### 화면 녹화보다 언제 유용한가요?

동작의 순서와 카메라 이동을 다시 실행해야 할 때 유용해요. 영상은 결과를 전달하는 데 계속 필요할 수 있어요.

### 같은 기록이면 성능도 항상 같나요?

아니에요. 기록은 지도 입력을 맞추는 도구예요. 기기·캐시·네트워크와 측정 조건은 별도로 통제해야 해요.

### 왜 기록 시간을 제한하나요?

문제 주변의 필요한 동작만 남기고 기록 비용을 통제하기 위해서예요. 시작 시점부터 무한히 모으는 방식은 긴 조사에 맞지 않을 수 있어요.

## 참고 자료

- [Mapbox: MapRecorder](https://docs.mapbox.com/ios/maps/guides/debugging-and-profiling/map-recorder/)
- [Mapbox 11.29.1: MapRecorder 구현](https://github.com/mapbox/mapbox-maps-ios/blob/11.29.1/Sources/MapboxMaps/Foundation/MapRecorder.swift)
- [Mapbox 11.29.1: MapRecorderOptions](https://github.com/mapbox/mapbox-maps-ios/blob/11.29.1/Sources/MapboxMaps/Foundation/MapRecorderOptions.swift)
