---
title: Swift로 이해하는 XCFramework 제작과 배포
description: XCFramework의 variant 구조, device·simulator archive, xcodebuild 생성, Swift module 안정성, Xcode·SwiftPM 배포와 검증 절차를 설명합니다.
pageType: doc-wide
outline: false
---

# Swift로 이해하는 XCFramework 제작과 배포

> **면접 답변 한 줄 요약:** XCFramework는 iOS device·simulator처럼 platform과 architecture가 다른 framework나 library variant를 하나로 묶고 Xcode가 현재 build destination에 맞는 것을 고르게 하는 binary distribution bundle이며, 그 자체가 static 또는 dynamic linkage를 뜻하지는 않아요.

XCFramework를 처음 보면 “fat framework의 새 이름” 또는 “dynamic framework 묶음”이라고 생각하기 쉬워요. 하지만 핵심은 **서로 호환되지 않는 platform variant를 분리해서 한 artifact로 전달하는 것**이에요.

예를 들어 Apple silicon Mac에서 iOS Simulator도 `arm64`를 사용할 수 있어요. iPhone device binary 역시 `arm64`지만 두 binary는 같은 platform을 대상으로 하지 않아요. architecture 이름만 같다고 `lipo`로 하나의 framework에 합치면 Xcode가 올바른 SDK variant를 구분할 수 없어요. XCFramework는 이 문제를 container metadata와 variant directory로 해결해요.

이 문서에서는 다음 내용을 배워요.

- XCFramework가 해결하는 platform·architecture variant 문제
- XCFramework와 framework, static·dynamic linkage의 관계
- iOS device와 simulator archive를 만드는 build setting
- `xcodebuild -create-xcframework`로 artifact를 만드는 방법
- ABI stability, module stability와 library evolution의 차이
- Xcode와 Swift Package Manager에서 binary를 배포하는 방법
- checksum, code signature와 debug symbol을 포함한 release 검증
- 자주 만나는 variant·link·runtime 오류의 진단 순서

## 먼저 알아둘 binary distribution 용어

| 용어               | 쉬운 뜻                                                                                                                                   |
| ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------- |
| variant            | 특정 platform, environment와 architecture 조합을 위해 build한 framework 또는 library 하나예요.                                            |
| platform           | iOS, iOS Simulator, macOS, Mac Catalyst처럼 SDK와 runtime contract가 다른 실행 환경이에요.                                                |
| architecture slice | `arm64`, `x86_64`처럼 한 binary 안에서 특정 CPU용 machine code를 담은 부분이에요. 같은 platform 안에서 여러 slice를 포함할 수 있어요.     |
| universal binary   | 같은 platform을 대상으로 하는 여러 architecture slice를 하나의 Mach-O에 담은 binary예요.                                                  |
| XCFramework        | 여러 platform variant의 framework 또는 library와 header를 하나로 묶는 Xcode binary package예요.                                           |
| archive            | 특정 destination의 Release product, dSYM과 distribution 정보를 보관하는 `.xcarchive`예요.                                                 |
| ABI                | 이미 compile된 client와 library binary가 calling convention, symbol와 memory layout 수준에서 상호 작동하기 위한 binary contract예요.      |
| module stability   | 다른 Swift compiler version이 framework의 public API module interface를 읽을 수 있게 하는 성질이에요.                                     |
| library evolution  | client를 다시 compile하지 않고 library implementation과 허용된 API를 발전시킬 수 있도록 ABI flexibility를 남기는 build mode예요.          |
| checksum           | remote ZIP의 byte 내용이 package manifest에 선언한 artifact와 같은지 검증하는 hash예요. 작성자의 신원을 증명하는 code signature와 달라요. |

## XCFramework가 필요한 이유

과거에는 iOS device와 simulator binary를 하나의 framework에 합치는 비공식 배포 방식이 사용됐어요. Intel Mac 시절에는 device `arm64`와 simulator `x86_64`의 architecture가 달라 우연히 구분되는 것처럼 보였어요.

하지만 platform과 architecture는 다른 축이에요.

| destination                   | 가능한 architecture 예 | SDK·runtime environment |
| ----------------------------- | ---------------------- | ----------------------- |
| iPhone·iPad device            | `arm64`                | iOS                     |
| Apple silicon의 iOS Simulator | `arm64`                | iOS Simulator           |
| Intel Mac의 iOS Simulator     | `x86_64`               | iOS Simulator           |

device와 simulator가 모두 `arm64`일 수 있으므로 architecture slice만으로 어느 variant인지 표현할 수 없어요. Apple의 [Creating a multiplatform binary framework bundle](https://developer.apple.com/documentation/xcode/creating-a-multi-platform-binary-framework-bundle)은 iOS와 iOS Simulator static library를 별도로 만들고 `lipo`로 합치지 말라고 안내해요.

XCFramework는 다음 정보를 함께 보관해요.

- supported platform과 simulator·Mac Catalyst 같은 variant
- 각 variant가 지원하는 architecture 목록
- 실제 framework 또는 library의 상대 경로
- library를 직접 담을 때 사용할 header 경로
- code signing과 mergeable library 같은 추가 metadata

Xcode는 client의 현재 build destination을 보고 일치하는 library identifier를 선택해 link해요.

## XCFramework 내부는 variant directory의 모음이에요

`ReadingSDK.xcframework`의 단순화한 예예요.

```text
ReadingSDK.xcframework/
├── Info.plist
├── ios-arm64/
│   └── ReadingSDK.framework/
│       ├── ReadingSDK
│       ├── Info.plist
│       └── Modules/
└── ios-arm64_x86_64-simulator/
    └── ReadingSDK.framework/
        ├── ReadingSDK
        ├── Info.plist
        └── Modules/
```

root `Info.plist`의 `AvailableLibraries`에는 각 directory의 identifier, library path, supported platform, variant와 architecture가 기록돼요. directory 이름을 application code에서 직접 선택하지 않고 Xcode build system이 metadata를 읽어 선택해요.

```text
Client destination: generic/platform=iOS Simulator, arm64
                         ↓ metadata와 일치
ios-arm64_x86_64-simulator/ReadingSDK.framework
```

실제 key와 값은 Xcode version과 artifact 구성에 따라 달라질 수 있으므로 직접 plist를 수정하기보다 `xcodebuild -create-xcframework`로 생성해요.

## XCFramework는 static·dynamic 모두 담을 수 있어요

Apple 공식 문서는 XCFramework가 static 또는 dynamic framework를 포함할 수 있고, static library와 header도 묶을 수 있다고 명시해요.

```text
ReadingDynamic.xcframework
└── 각 variant의 dynamic ReadingSDK.framework

ReadingStatic.xcframework
└── 각 variant의 static ReadingSDK.framework

ReadingCLibrary.xcframework
├── 각 variant의 libReading.a
└── 각 variant의 Headers/
```

client가 XCFramework를 추가하면 Xcode가 variant를 선택한 뒤 내부 product의 방식대로 link해요.

- static variant이면 필요한 object code가 client image에 들어가요.
- dynamic variant이면 client가 별도 framework image를 dependency로 갖고 app에 embed·sign해야 해요.

즉, **XCFramework는 “어느 variant를 고를지”를 해결하고 static·dynamic은 “선택한 binary를 어떻게 연결할지”를 결정해요.** 자세한 차이는 [정적·동적 프레임워크 문서](./static-and-dynamic-frameworks)를 참고해요.

## 배포할 framework target을 준비해요

예제에서는 `ReadingSDK`라는 Swift framework를 iOS device와 simulator용으로 배포해요.

### 1. Public API를 명확히 만들어요

binary client가 사용할 declaration은 `public` 또는 필요한 경우 `open`이어야 해요.

```swift
public struct ReadingProgress: Sendable {
  public let completedPages: Int
  public let totalPages: Int

  public init(completedPages: Int, totalPages: Int) {
    self.completedPages = completedPages
    self.totalPages = totalPages
  }

  public var ratio: Double {
    guard totalPages > 0 else { return 0 }
    return min(Double(completedPages) / Double(totalPages), 1)
  }
}
```

source target 안에서 `internal` API가 동작하는 것과 외부 binary client가 import할 수 있는 것은 달라요. framework의 generated interface에서 실제 공개 surface를 확인해요.

### 2. Framework만 build하는 scheme을 준비해요

Apple은 framework target과 필요한 dependency만 build하는 scheme을 준비하라고 안내해요. CI의 `xcodebuild archive`가 scheme을 찾으려면 shared scheme으로 관리하는 것이 안전해요.

### 3. Distribution build setting을 설정해요

| build setting                    | 값          | 이유                                                                                                 |
| -------------------------------- | ----------- | ---------------------------------------------------------------------------------------------------- |
| Build Libraries for Distribution | `Yes`       | Swift library evolution을 켜고 stable module interface를 생성해 다른 compiler client를 지원해요.     |
| Skip Install                     | `No`        | archive의 install product에 framework가 포함되게 해요.                                               |
| Architectures                    | 기본값 유지 | destination과 Xcode가 지원하는 architecture를 선택하게 해요. 수동으로 오래된 목록을 고정하지 않아요. |
| Build Configuration              | `Release`   | 배포 optimization과 distribution 설정으로 archive해요.                                               |

command line에서는 `SKIP_INSTALL=NO`, `BUILD_LIBRARY_FOR_DISTRIBUTION=YES`로 명시할 수 있어요.

`BUILD_LIBRARY_FOR_DISTRIBUTION=YES`를 모든 source package나 내부 framework에 습관적으로 켜지는 마세요. Swift.org의 [Library Evolution in Swift](https://www.swift.org/blog/library-evolution/)는 client와 항상 함께 build·배포하는 library라면 library evolution이 필요하지 않고, 이 mode가 performance 특성과 enum switch 규칙에 영향을 준다고 설명해요. **다른 compiler·release schedule의 client에 Swift binary를 배포할 때** 이 비용과 호환성 계약을 받아들여 사용해요.

## Device와 simulator archive를 각각 만들어요

같은 scheme을 destination만 바꾸어 두 번 archive해요. command는 project 구조에 맞게 `-project` 대신 `-workspace`를 사용할 수 있어요.

### iOS device archive

```bash
xcodebuild archive \
  -project ReadingSDK.xcodeproj \
  -scheme ReadingSDK \
  -configuration Release \
  -destination 'generic/platform=iOS' \
  -archivePath 'Build/ReadingSDK-iOS.xcarchive' \
  SKIP_INSTALL=NO \
  BUILD_LIBRARY_FOR_DISTRIBUTION=YES
```

### iOS Simulator archive

```bash
xcodebuild archive \
  -project ReadingSDK.xcodeproj \
  -scheme ReadingSDK \
  -configuration Release \
  -destination 'generic/platform=iOS Simulator' \
  -archivePath 'Build/ReadingSDK-iOS-Simulator.xcarchive' \
  SKIP_INSTALL=NO \
  BUILD_LIBRARY_FOR_DISTRIBUTION=YES
```

`-sdk`와 `-arch`를 직접 조합하기보다 `-destination`으로 platform을 지정하는 것이 Apple의 현재 권장 방식이에요. Xcode가 destination, SDK와 build setting을 조합해 필요한 architecture를 결정해요.

archive가 만들어지면 framework가 있는지 확인해요.

```text
Build/ReadingSDK-iOS.xcarchive/
└── Products/
    └── Library/
        └── Frameworks/
            └── ReadingSDK.framework
```

`Products/Library/Frameworks`에 product가 없다면 scheme이 잘못된 target을 build했거나 `SKIP_INSTALL`이 `YES`인지 먼저 확인해요.

## `xcodebuild -create-xcframework`로 묶어요

현재 Xcode는 archive path와 framework name을 직접 받을 수 있어요.

```bash
xcodebuild -create-xcframework \
  -archive 'Build/ReadingSDK-iOS.xcarchive' \
  -framework ReadingSDK.framework \
  -archive 'Build/ReadingSDK-iOS-Simulator.xcarchive' \
  -framework ReadingSDK.framework \
  -output 'Build/ReadingSDK.xcframework'
```

archive를 사용하지 않고 framework의 전체 path를 전달할 수도 있어요.

```bash
xcodebuild -create-xcframework \
  -framework 'Build/ReadingSDK-iOS.xcarchive/Products/Library/Frameworks/ReadingSDK.framework' \
  -framework 'Build/ReadingSDK-iOS-Simulator.xcarchive/Products/Library/Frameworks/ReadingSDK.framework' \
  -output 'Build/ReadingSDK.xcframework'
```

### Static library와 header를 묶는 경우

`.a`와 C·Objective-C public header를 배포한다면 `-library`와 `-headers`를 variant마다 제공해요.

```bash
xcodebuild -create-xcframework \
  -library 'Build/iOS/libReadingCore.a' \
  -headers 'Sources/ReadingCore/include' \
  -library 'Build/iOS-Simulator/libReadingCore.a' \
  -headers 'Sources/ReadingCore/include' \
  -output 'Build/ReadingCore.xcframework'
```

static library를 `.framework`처럼 이름만 바꾸어 포장하지 말고 Apple이 제공하는 `-library` 형식을 사용해요.

### Debug symbol도 release artifact로 관리해요

crash를 symbolicate하려면 binary와 정확히 일치하는 dSYM이 필요해요. `.xcarchive` 원본과 dSYM을 release별로 보관하고, `xcodebuild -create-xcframework -help`에서 지원하는 `-debug-symbols <path>`로 해당 variant의 dSYM을 artifact에 포함할 수 있어요.

debug symbol path는 반드시 앞선 `-framework` 또는 `-library` variant와 대응해야 해요. 임의로 다른 build의 dSYM을 섞으면 UUID가 맞지 않아 symbolication에 사용할 수 없어요.

## XCFramework를 먼저 구조적으로 검증해요

### Root metadata를 확인해요

```bash
plutil -p Build/ReadingSDK.xcframework/Info.plist
```

각 `AvailableLibraries` 항목에 다음 정보가 의도대로 있는지 봐요.

- iOS와 iOS Simulator variant가 모두 있어요.
- device와 simulator의 platform variant가 구분돼요.
- 지원 architecture가 Release 정책과 맞아요.
- `LibraryPath`가 실제 directory와 일치해요.

### 각 main binary를 확인해요

```bash
file Build/ReadingSDK.xcframework/ios-arm64/ReadingSDK.framework/ReadingSDK

file Build/ReadingSDK.xcframework/ios-arm64_x86_64-simulator/ReadingSDK.framework/ReadingSDK
```

directory identifier는 실제 artifact마다 달라질 수 있어요. `Info.plist`의 identifier를 먼저 확인하세요.

### Swift module interface를 확인해요

```text
ReadingSDK.framework/Modules/ReadingSDK.swiftmodule/
├── arm64-apple-ios.swiftinterface
└── arm64-apple-ios.private.swiftinterface
```

배포할 public `.swiftinterface`가 생성됐는지 확인해요. 이 text file은 source 전체가 아니라 public API와 compiler가 import에 필요한 정보를 표현해요. `private` declaration body를 숨기는 보안 장치로 binary distribution을 선택하더라도 public API와 `@inlinable` body 등은 interface에서 볼 수 있다는 점을 고려해야 해요.

### 실제 client app으로 두 destination을 build해요

artifact directory만 검사해서는 link·embed 문제를 찾기 어려워요. 최소 client fixture를 만들어 다음을 모두 검증해요.

1. iOS Simulator Debug 또는 Release build
2. generic iOS device archive
3. framework public API import와 실제 호출
4. dynamic framework라면 final `.app/Frameworks`와 code signature
5. 최소 지원 deployment target

## Swift binary compatibility를 세 개념으로 구분해요

“Swift 5부터 binary 호환이 된다”는 한 문장으로는 부족해요.

| 개념              | 바뀔 수 있는 것                             | 보호하려는 경계                                                              |
| ----------------- | ------------------------------------------- | ---------------------------------------------------------------------------- |
| ABI stability     | OS의 Swift runtime·standard library version | compile된 App과 Swift runtime이 binary 수준에서 상호 작동해요.               |
| module stability  | client가 사용하는 Swift compiler version    | 이전 compiler가 만든 textual `.swiftinterface`를 이후 compiler가 import해요. |
| library evolution | framework의 허용된 implementation·API 변화  | 기존 binary client를 다시 compile하지 않고 새 library와 동작하게 해요.       |

Apple platform의 Swift ABI 안정성과 “내 framework가 모든 변경에 binary compatible하다”는 말은 같지 않아요. library author는 library evolution mode를 켜고 public ABI를 지키는 versioning 정책을 운영해야 해요.

### `.swiftmodule`은 빠르지만 compiler version에 묶일 수 있어요

serialized `.swiftmodule`은 compiler 내부 data structure를 담으므로 생성한 compiler보다 다른 version이 읽지 못할 수 있어요.

```text
Module compiled with Swift X cannot be imported by the Swift Y compiler
```

### `.swiftinterface`는 public API를 text로 전달해요

`BUILD_LIBRARY_FOR_DISTRIBUTION=YES`는 stable textual module interface를 만들어요. client compiler는 자신의 version에 맞는 compiled module이 없으면 이 interface를 parse해 새 module 정보를 만들 수 있어요.

module stability가 있어도 target platform, architecture, deployment target과 dependency의 module compatibility가 맞아야 해요. textual interface가 모든 binary 호환 문제를 자동으로 해결하지는 않아요.

### Library evolution은 flexibility와 최적화를 교환해요

library evolution mode에서 non-`@frozen` public struct와 enum은 client가 exact memory layout을 고정해서 가정하지 않도록 resilience boundary를 만들어요. 그래서 허용된 stored property나 enum case 추가 같은 변화가 binary compatible할 수 있어요.

```swift
public enum ReadingState {
  case idle
  case reading
}
```

client는 future case를 고려해 `@unknown default`를 처리해야 해요.

```swift
switch state {
case .idle:
  showIdle()
case .reading:
  showReading()
@unknown default:
  showFallback()
}
```

`@frozen`은 layout이나 enum case 집합이 변하지 않는다고 public ABI에 약속해 client optimization 여지를 늘려요. 대신 stored property나 case를 추가·삭제·재정렬하기 어려워지므로 profiling 없이 배포 API에 습관적으로 붙이지 않아요. Swift Evolution의 [SE-0260 Library Evolution](https://github.com/swiftlang/swift-evolution/blob/main/proposals/0260-library-evolution.md)이 허용되는 변화와 `@frozen` 계약을 자세히 설명해요.

## Xcode project에 직접 통합해요

1. `.xcframework`를 Project navigator로 추가해요.
2. 사용할 target의 **Frameworks, Libraries, and Embedded Content**에 포함됐는지 확인해요.
3. 내부 binary가 dynamic이면 **Embed & Sign**, static이면 product와 resource 방식에 맞는 Embed 설정을 사용해요.
4. source에서 module을 import하고 public API를 호출해요.
5. simulator 실행과 device archive를 모두 확인해요.

```swift
import ReadingSDK

let progress = ReadingProgress(
  completedPages: 42,
  totalPages: 100
)

print(progress.ratio)
```

XCFramework 하나를 추가해도 Xcode가 현재 destination의 variant를 선택할 뿐, binary가 의존하는 모든 transitive framework를 임의로 찾아 embed해 주는 것은 아니에요. vendor는 dependency를 문서화하고 client는 package product와 final bundle을 확인해야 해요.

## Swift Package Manager로 binary를 배포해요

Apple의 [Distributing binary frameworks as Swift packages](https://developer.apple.com/documentation/xcode/distributing-binary-frameworks-as-swift-packages)는 local path 또는 remote ZIP의 XCFramework를 `binaryTarget`으로 선언하는 방법을 제공해요. Binary target은 Apple platform에서 사용할 수 있어요.

`binaryTarget`의 `name`은 artifact가 공개하는 module 이름과 맞춰요. Package product 이름만 같고 실제 module 이름이 다르면 consumer의 `import ReadingSDK`가 실패할 수 있어요.

### Local XCFramework

```swift
// swift-tools-version: 6.0
import PackageDescription

let package = Package(
  name: "ReadingSDKPackage",
  platforms: [.iOS(.v17)],
  products: [
    .library(
      name: "ReadingSDK",
      targets: ["ReadingSDK"]
    )
  ],
  targets: [
    .binaryTarget(
      name: "ReadingSDK",
      path: "Binaries/ReadingSDK.xcframework"
    )
  ]
)
```

### Remote ZIP

XCFramework가 ZIP의 root에 오도록 압축하고 HTTPS URL로 배포해요.

```swift
.binaryTarget(
  name: "ReadingSDK",
  url: "https://example.com/releases/1.2.0/ReadingSDK.xcframework.zip",
  checksum: "<swift package compute-checksum 결과>"
)
```

checksum은 배포할 최종 ZIP을 기준으로 계산해요.

```bash
swift package compute-checksum ReadingSDK.xcframework.zip
```

ZIP을 다시 압축하면 binary 내용이 같아 보여도 archive byte가 바뀌어 checksum이 달라질 수 있어요. release URL을 immutable하게 운영하고 version마다 새 checksum을 manifest에 기록해요.

### Source wrapper와 binary target을 함께 사용할 수 있어요

public API를 source target으로 감싸고 내부에서 binary target에 의존하게 만들면 import 이름과 adapter code를 관리할 수 있어요.

```swift
.target(
  name: "ReadingSDKClient",
  dependencies: ["ReadingSDKBinary"]
),
.binaryTarget(
  name: "ReadingSDKBinary",
  url: "https://example.com/ReadingSDKBinary.zip",
  checksum: "..."
)
```

source wrapper가 closed-source binary의 platform 제한을 없애 주는 것은 아니에요. binary target이 지원하는 destination 안에서만 build할 수 있어요.

## Checksum과 code signature는 다른 위협을 막아요

| 검증                       | 무엇을 확인하나요?                                                       | 한계                                                        |
| -------------------------- | ------------------------------------------------------------------------ | ----------------------------------------------------------- |
| SwiftPM checksum           | 내려받은 ZIP byte가 manifest에 선언한 값과 같은지 확인해요.              | manifest와 ZIP을 함께 바꾼 공격자의 신원을 판단하지 못해요. |
| XCFramework code signature | artifact를 누가 sign했고 추가 뒤 signature가 바뀌지 않았는지 확인해요.   | signing identity를 신뢰할지는 consumer가 판단해야 해요.     |
| App code signing           | 최종 app bundle의 executable code가 배포 identity와 일치하는지 확인해요. | 원래 SDK 공급망의 검토를 대신하지 않아요.                   |

XCFramework를 배포 identity로 sign하려면 Apple 문서의 예처럼 실행할 수 있어요.

```bash
codesign --timestamp \
  -s 'Apple Distribution: Example Company (TEAMID)' \
  Build/ReadingSDK.xcframework
```

client는 Xcode File inspector에서 XCFramework의 signature와 signing team을 확인해요. Apple의 [Verifying the origin of your XCFrameworks](https://developer.apple.com/documentation/xcode/verifying-the-origin-of-your-xcframeworks)는 추가한 뒤 signature가 제거·변경되거나 다른 developer가 update에 sign하면 build system이 경고·오류로 알려 주는 흐름을 설명해요.

signature가 유효하다는 사실만으로 SDK의 privacy·security가 안전하다는 뜻은 아니에요. official release channel, privacy manifest, dependency, entitlement 사용과 release note를 함께 검토해요.

## Binary release를 versioning해요

binary framework의 public API와 ABI는 배포 뒤 client와의 계약이 돼요.

| 변경 예                                      | 일반적인 영향                                                    |
| -------------------------------------------- | ---------------------------------------------------------------- |
| private implementation 수정                  | public 동작 계약을 지키면 patch 후보예요.                        |
| 새 public method·type 추가                   | source·binary compatible하게 설계했다면 minor 후보예요.          |
| public function parameter나 symbol 이름 변경 | 기존 client가 symbol을 찾지 못해 major 변경이 필요할 수 있어요.  |
| `@frozen` struct stored property 추가        | binary-incompatible해요.                                         |
| 지원 platform·architecture 제거              | 기존 client build를 깨뜨릴 수 있으므로 breaking change로 다뤄요. |
| dependency version·linkage 변경              | client의 link·embed와 app size에 영향을 주므로 명시해야 해요.    |

Semantic Versioning 숫자만 올린다고 compatibility가 생기지는 않아요. release마다 이전 client fixture로 새 binary를 link·실행하고, API·ABI 검사 도구와 integration test로 계약을 확인해요.

## XCFramework가 유용한 경우와 source package가 나은 경우

### XCFramework가 유용해요

- proprietary implementation을 source로 공개할 수 없어요.
- C·C++·Objective-C를 포함한 긴 build 시간을 consumer에게 반복시키고 싶지 않아요.
- vendor가 compiler option과 binary 품질을 통제해야 해요.
- 여러 Apple platform variant를 하나의 signed artifact로 배포해야 해요.

### Source Swift package를 먼저 검토해요

- consumer가 source를 audit하고 debugger로 내부에 들어가야 해요.
- 새로운 platform·architecture를 package 사용자 toolchain에서 즉시 build해야 해요.
- library와 App이 항상 함께 compile되어 별도 ABI evolution이 필요 없어요.
- binary artifact hosting, signing, checksum과 장기 호환성 운영 비용을 피하고 싶어요.

Apple도 binary package가 artifact에 포함한 platform에만 한정되어 source package보다 portable하지 않다고 설명해요. 기술적으로 만들 수 있다는 이유만으로 XCFramework를 선택하지 말고 배포 제약이 실제 요구인지 먼저 확인해요.

## 대표 오류와 진단 순서

### `No matching library variant found`

현재 platform·architecture에 맞는 entry가 root `Info.plist`에 없어요.

1. client destination을 확인해요.
2. `AvailableLibraries`의 platform, variant와 architecture를 확인해요.
3. device와 simulator archive를 모두 생성했는지 확인해요.
4. 오래된 architecture allowlist나 excluded architecture를 제거해요.

### `building for iOS Simulator, but linking in object file built for iOS`

architecture가 같더라도 platform이 다른 binary를 직접 link했어요. device와 simulator framework를 `lipo`로 합치지 말고 별도 variant로 XCFramework를 다시 만들어요.

### `Module compiled with ... cannot be imported by ...`

client compiler가 호환되는 `.swiftmodule`이나 stable `.swiftinterface`를 읽지 못했어요.

1. `BUILD_LIBRARY_FOR_DISTRIBUTION=YES`로 Release archive했는지 확인해요.
2. 각 variant의 `Modules/<Name>.swiftmodule` 안에 public `.swiftinterface`가 있는지 봐요.
3. interface가 import하는 binary dependency도 module-stable한지 확인해요.
4. language feature가 너무 오래된 client compiler에서 parse 가능한지 지원 범위를 검토해요.

### `Undefined symbols for architecture ...`

variant 선택은 성공했지만 symbol implementation을 찾지 못했어요. public API와 actual binary version이 일치하는지, transitive static library가 누락되지 않았는지, binary가 symbol을 export하는지 확인해요. [컴파일과 링킹 문서](./build-compile-and-link)의 symbol 진단 순서를 적용해요.

### `Library not loaded: @rpath/...`

선택된 내부 product가 dynamic인데 final app에 embed되지 않았거나 run path·signature가 잘못됐어요. XCFramework root가 아니라 선택된 framework가 `.app/Frameworks`에 있는지 확인해요.

### SwiftPM checksum mismatch

서버의 ZIP byte와 `Package.swift` checksum이 달라요. download cache를 지우는 것으로 덮지 말고 release URL이 덮어써졌는지, CDN이 다른 content를 주는지, manifest가 올바른 version checksum을 가리키는지 확인해요.

## Release 자동화 예시

script를 만들 때는 단계별 output을 분리하고 실패 즉시 멈추게 해요.

```text
1. clean checkout과 고정 Xcode version 확인
2. framework unit·integration test
3. iOS device archive
4. iOS Simulator archive
5. XCFramework 생성
6. variant·module interface·symbol 검사
7. 최소 client simulator build와 device archive
8. dSYM·license·privacy manifest 수집
9. XCFramework signing
10. ZIP 생성과 checksum 계산
11. immutable release 업로드
12. Package.swift version·checksum 갱신
```

archive와 XCFramework를 source repository에 무조건 commit하지 말고 release artifact storage를 사용해요. binary, dSYM, checksum, Xcode build version과 source commit을 같은 release record로 추적하면 crash와 compatibility 문제를 재현하기 쉬워요.

## 배포 체크리스트

- [ ] 지원할 platform, variant, architecture와 최소 OS를 문서화했나요?
- [ ] device와 simulator를 각각 `-destination`으로 archive했나요?
- [ ] `SKIP_INSTALL=NO`로 archive product에 framework가 들어갔나요?
- [ ] Swift binary 배포 요구에 맞게 `BUILD_LIBRARY_FOR_DISTRIBUTION`을 결정했나요?
- [ ] XCFramework가 static인지 dynamic인지 consumer에게 명시했나요?
- [ ] public `.swiftinterface`와 generated interface를 검토했나요?
- [ ] 각 variant의 binary type과 architecture를 `file`로 확인했나요?
- [ ] simulator build와 generic device archive를 실제 client project로 검증했나요?
- [ ] dynamic dependency의 embed·`@rpath`·signature를 확인했나요?
- [ ] transitive dependency, license, privacy manifest와 entitlement 요구를 문서화했나요?
- [ ] matching dSYM과 source commit을 release별로 보관했나요?
- [ ] remote ZIP을 immutable하게 게시하고 checksum을 다시 검증했나요?
- [ ] XCFramework signature와 공급 경로를 consumer가 확인할 수 있나요?

## 자주 묻는 면접 질문

### XCFramework와 universal framework의 차이는 무엇인가요?

universal binary는 같은 platform의 여러 architecture slice를 하나의 Mach-O에 담아요. XCFramework는 iOS와 iOS Simulator처럼 platform environment가 다른 framework·library variant를 분리해 담고 metadata로 선택하게 해요. 한 XCFramework 내부의 한 variant가 universal binary일 수도 있어요.

### XCFramework는 static인가요, dynamic인가요?

둘 다 가능해요. XCFramework는 variant를 묶는 container이고 실제 linkage는 내부 framework나 library binary가 결정해요. Xcode는 destination에 맞는 variant를 고른 뒤 static 또는 dynamic 방식으로 link해요.

### `BUILD_LIBRARY_FOR_DISTRIBUTION`은 무엇을 하나요?

Swift framework target에서 module stability를 위한 `.swiftinterface`를 생성하고 library evolution mode를 켜 binary client와 compiler·release version 경계를 유지하도록 해요. 그 대가로 resilience를 위한 간접 접근과 API 제약이 생길 수 있어, 항상 함께 build하는 source dependency에는 기본값처럼 켜지 않아요.

### ABI stability와 module stability의 차이는 무엇인가요?

ABI stability는 이미 compile된 binary와 runtime·library가 호출 규약과 layout 수준에서 동작하는 계약이고, module stability는 다른 Swift compiler가 library의 public API interface를 읽어 client source를 compile할 수 있게 하는 계약이에요. binary framework 배포에는 둘 다 관련되지만 해결하는 단계가 달라요.

### SwiftPM checksum과 XCFramework signing이 모두 필요한 이유는 무엇인가요?

checksum은 manifest가 가리킨 ZIP과 download한 byte가 같은지 검증하고, code signature는 artifact의 signer identity와 이후 변경 여부를 확인해요. 하나는 content 일치, 다른 하나는 provenance와 integrity에 가까워 서로 대체하지 않아요.

## 참고 자료

- [Creating a multiplatform binary framework bundle - Apple Developer Documentation](https://developer.apple.com/documentation/xcode/creating-a-multi-platform-binary-framework-bundle)
- [Distributing binary frameworks as Swift packages - Apple Developer Documentation](https://developer.apple.com/documentation/xcode/distributing-binary-frameworks-as-swift-packages)
- [Verifying the origin of your XCFrameworks - Apple Developer Documentation](https://developer.apple.com/documentation/xcode/verifying-the-origin-of-your-xcframeworks)
- [Creating a static framework - Apple Developer Documentation](https://developer.apple.com/documentation/xcode/creating-a-static-framework)
- [Binary Frameworks in Swift - WWDC19](https://developer.apple.com/videos/play/wwdc2019/416/)
- [Distribute binary frameworks as Swift packages - WWDC20](https://developer.apple.com/videos/play/wwdc2020/10147/)
- [Library Evolution in Swift - Swift.org](https://www.swift.org/blog/library-evolution/)
- [ABI Stability and More - Swift.org](https://www.swift.org/blog/abi-stability-and-more/)
- [SE-0260 Library Evolution for Stable ABIs - Swift Evolution](https://github.com/swiftlang/swift-evolution/blob/main/proposals/0260-library-evolution.md)
