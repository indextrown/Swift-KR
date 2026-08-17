---
title: Swift로 이해하는 정적·동적 프레임워크
description: library와 framework의 차이부터 static·dynamic linking, Mach-O, embed와 dyld 동작, 앱 크기·시작 시간·배포 선택 기준을 비교합니다.
pageType: doc-wide
outline: false
---

# Swift로 이해하는 정적·동적 프레임워크

> **면접 답변 한 줄 요약:** Framework는 code·module·resource를 담는 bundle 형식이고 static·dynamic은 그 안의 binary를 client에 연결하는 방식으로, static code는 link할 때 product image에 포함되고 dynamic code는 별도 image로 embed되어 runtime에 `dyld`가 load해요.

“Framework는 dynamic이고 library는 static이다”라고 외우면 금방 예외를 만나요. `.framework`는 **포장 형식**이고, 그 안의 main binary는 static archive일 수도 있고 dynamic library일 수도 있어요. Apple은 Xcode 15부터 resource까지 담는 static framework 제작을 공식 지원해요.

반대로 `.xcframework`도 static·dynamic을 결정하지 않아요. 여러 platform·architecture용 framework 또는 library variant를 묶는 distribution container예요. 이 세 축을 먼저 나누어야 해요.

```text
포장:       .a / .framework / .xcframework
연결 방식:  static / dynamic
지원 범위:  iOS device / iOS Simulator / macOS / ...
```

이 문서에서는 다음 내용을 배워요.

- library, bundle, framework와 XCFramework의 역할 차이
- static archive와 static framework가 link되는 방식
- dynamic framework가 embed되고 `dyld`에 load되는 방식
- 실행 파일 크기, app launch, resource와 dependency의 tradeoff
- Xcode에서 Link와 Embed 설정을 구분하는 방법
- `file`, `nm`, `ar`, `otool`로 실제 binary 종류를 확인하는 방법

## 먼저 알아둘 binary packaging 용어

| 용어            | 쉬운 뜻                                                                                                                        |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| library         | 다른 code가 재사용할 function·type의 compiled implementation을 제공하는 binary예요. static archive와 dynamic library가 있어요. |
| static archive  | 여러 object file을 하나로 모은 archive예요. Apple platform에서 보통 `.a` 확장자를 사용해요.                                    |
| dynamic library | 다른 image가 runtime에 load해서 사용할 exported code·data를 담은 별도 Mach-O image예요. macOS에서는 `.dylib`도 볼 수 있어요.   |
| bundle          | code, resource와 metadata를 정해진 디렉터리 구조로 묶은 단위예요. Finder에서 file처럼 보여도 내부는 directory예요.             |
| framework       | main binary, module, header, resource와 `Info.plist` 등을 표준 구조로 묶는 bundle이에요.                                       |
| link            | client code의 symbol reference를 library가 제공하는 definition에 연결하는 과정이에요.                                          |
| embed           | runtime이나 resource 접근에 필요한 framework bundle을 app bundle 안으로 복사하는 과정이에요. Link와 같은 동작이 아니에요.      |
| install name    | dynamic library를 runtime에 찾기 위해 client Mach-O에 기록되는 식별 경로예요. embedded framework는 흔히 `@rpath`를 사용해요.   |
| dead stripping  | 최종 product에서 도달할 수 없는 code·data section을 linker가 제거하는 최적화예요. build setting과 symbol 특성에 영향을 받아요. |

## Library, framework와 XCFramework는 같은 분류가 아니에요

### Library는 compiled code의 연결 단위예요

library의 핵심은 client가 사용할 symbol definition을 제공하는 거예요.

- static library는 object file의 archive예요.
- dynamic library는 runtime에 별도 image로 존재해요.

### Framework는 code와 부속물을 담는 bundle이에요

간단한 iOS framework는 다음과 같은 구조를 가질 수 있어요.

```text
ReadingKit.framework/
├── ReadingKit
├── Info.plist
├── Modules/
│   └── ReadingKit.swiftmodule/
├── Headers/
└── Resources...
```

`ReadingKit` main binary의 Mach-O type이 static archive인지 dynamic library인지에 따라 linking 동작이 달라져요. directory 확장자가 `.framework`라는 사실만으로 판단하면 안 돼요.

### XCFramework는 variant를 선택하게 하는 상위 container예요

XCFramework는 iOS device용 framework, iOS Simulator용 framework처럼 서로 다른 variant를 한 bundle로 묶어요. 내부 framework가 static인지 dynamic인지는 각각의 main binary가 결정해요.

| 질문                                       | 답을 결정하는 축                    |
| ------------------------------------------ | ----------------------------------- |
| API와 resource를 어떤 구조로 묶나요?       | framework bundle                    |
| code가 client image 안으로 들어가나요?     | static 또는 dynamic linkage         |
| device와 simulator를 한 artifact로 주나요? | XCFramework의 platform variant 구성 |

[XCFramework 문서](./xcframework)에서는 variant 구조와 제작 과정을 자세히 설명해요.

## Static library는 필요한 object가 최종 image에 포함돼요

static archive `.a`는 여러 `.o` member의 모음이에요.

```text
libReadingKit.a
├── ReadingScore.o
├── ReadingHistory.o
└── ReadingImage.o
```

App의 `ReadingScore.calculate` reference를 해결해야 한다면 linker는 이를 정의하는 member를 archive에서 선택해 final executable이나 dynamic library에 포함해요.

```text
App.o ─────── undefined: ReadingScore.calculate
                       │
libReadingKit.a ───────┘ definition을 제공
                       ↓ static link
App executable [App.o + 선택된 ReadingKit object code]
```

최종 App process가 시작할 때 `libReadingKit.a` file 자체를 load하지 않아요. 필요한 code가 이미 App executable에 들어갔기 때문이에요.

### 모든 archive member가 무조건 복사되는 것은 아니에요

“static library 전체가 언제나 복사된다”는 설명도 정확하지 않아요. 일반적으로 linker는 현재 undefined symbol을 만족하는 object member를 archive에서 가져오고, dead stripping 설정은 사용하지 않는 section을 추가로 제거할 수 있어요.

다만 Objective-C category나 registration처럼 직접적인 symbol reference 없이 동작을 기대하는 code는 archive에서 선택되지 않을 수 있어요. 이때 `-ObjC`, `-force_load` 같은 linker flag가 필요할 수 있지만, 무조건 `-all_load`를 넣으면 duplicate symbol과 binary size가 늘 수 있어요. vendor 지침과 실제 link map을 확인한 뒤 필요한 범위만 load해요.

## Static framework는 static code에 bundle 구조를 더해요

Apple의 [Creating a static framework](https://developer.apple.com/documentation/xcode/creating-a-static-framework)는 Xcode 15 이상에서 main binary가 static archive인 framework bundle에 resource를 함께 넣을 수 있다고 설명해요.

static framework를 만들 때는 framework target의 **Mach-O Type**을 **Static Library**로 설정해요. client가 이를 link하고 embed하면 Xcode 15 이상은 이미 client에 statically linked된 main binary를 embedded framework bundle에서 제외하고 resource·metadata를 유지할 수 있어요.

따라서 다음 두 문장은 상황을 나누어 봐야 해요.

- **code 관점:** static main binary는 runtime dependency로 별도 load되지 않아요.
- **resource 관점:** static framework가 resource를 담았다면 framework wrapper를 app bundle에 복사해야 할 수 있어요.

“Static이므로 항상 Do Not Embed” 또는 “Framework이므로 항상 Embed & Sign” 같은 한 줄 규칙보다 Xcode version, product type, resource 유무와 framework metadata를 기준으로 설정해야 해요.

## Dynamic framework는 별도 Mach-O image로 남아요

dynamic framework의 main binary는 client executable과 분리된 Mach-O image예요. link 시점과 runtime의 역할이 나뉘어요.

### Link time에는 export와 dependency를 확인해요

linker는 App이 참조하는 symbol을 framework가 export하는지 확인하고 App executable에 framework dependency를 기록해요.

```text
App executable load commands
└── @rpath/ReadingKit.framework/ReadingKit
```

framework machine code 전체가 App executable 안으로 복사되는 것은 아니에요.

### Bundle 단계에는 필요한 framework를 embed하고 sign해요

직접 제공하거나 third-party에서 받은 iOS dynamic framework는 보통 App target의 **Frameworks, Libraries, and Embedded Content**에 추가하고 **Embed & Sign**으로 포함해요. Apple SDK의 system framework는 OS가 제공하므로 App bundle에 복사하지 않아요.

대략적인 App bundle은 다음처럼 보여요.

```text
ReadingApp.app/
├── ReadingApp
├── Info.plist
└── Frameworks/
    └── ReadingKit.framework/
        ├── ReadingKit
        ├── Info.plist
        └── Modules/
```

### Runtime에는 `dyld`가 load하고 bind해요

App launch 때 `dyld`는 load command와 run path를 사용해 `ReadingKit.framework/ReadingKit`을 찾고 process address space에 mapping해요. library가 없거나 architecture, signature 또는 ABI가 맞지 않으면 launch가 중단될 수 있어요.

```text
dyld: Library not loaded: @rpath/ReadingKit.framework/ReadingKit
```

Apple의 [Overview of Dynamic Libraries](https://developer.apple.com/library/archive/documentation/DeveloperTools/Conceptual/DynamicLibraries/100-Articles/OverviewOfDynamicLibraries.html)는 static linker가 dependent library의 install name을 기록하고 dynamic loader가 runtime에 이를 찾는 흐름을 설명해요.

## Static과 dynamic을 build부터 runtime까지 비교해요

| 관점                    | Static library·framework                                                                                                | Dynamic framework                                                                                                                |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| link 결과               | 선택된 object code가 client executable이나 library image에 들어가요.                                                    | client에 dependent image 정보가 남고 framework binary는 별도 image예요.                                                          |
| runtime code file       | 원래 `.a`나 static main binary를 별도로 load하지 않아요.                                                                | `dyld`가 framework binary를 찾아 load·bind해요.                                                                                  |
| app bundle              | code는 client image에 있어요. resource wrapper는 별도 복사가 필요할 수 있어요.                                          | third-party framework bundle을 보통 embed·sign해야 해요.                                                                         |
| 실행 파일 크기          | library code가 client image에 합쳐져 executable이 커질 수 있어요.                                                       | main executable은 작아질 수 있지만 framework까지 포함한 전체 app size를 같이 봐야 해요.                                          |
| 사용하지 않는 code 제거 | archive member 선택과 dead stripping의 이점을 받을 수 있어요.                                                           | dynamic binary의 export와 build 방식에 따라 client linker가 내부 code를 제거하기 어려울 수 있어요.                               |
| launch 비용             | 별도 dependent image load를 추가하지 않아요.                                                                            | image load, rebase·bind와 initializer가 launch 비용에 영향을 줄 수 있어요.                                                       |
| 여러 executable의 사용  | App과 extension 각각에 link되면 code가 각 image에 중복될 수 있어요.                                                     | packaging을 잘 구성하면 code image를 공유할 여지가 있지만 process·bundle 구조와 platform 규칙을 확인해야 해요.                   |
| library 교체            | client를 다시 link하고 배포해야 새 구현이 들어가요.                                                                     | ABI를 지키면 client를 다시 compile하지 않고 library를 교체할 수 있는 구조예요. iOS 배포에서는 결국 signed app update가 필요해요. |
| runtime 누락 위험       | code가 final image 안에 있으므로 `Library not loaded`는 없어요.                                                         | embed, `@rpath`, signature와 architecture 문제로 runtime load가 실패할 수 있어요.                                                |
| resource                | `.a`만으로 resource를 담지 못해 별도 resource bundle이 필요해요. Xcode 15 static framework는 resource를 담을 수 있어요. | framework bundle의 표준 resource 구조를 사용할 수 있어요.                                                                        |

## “어느 쪽이 더 빠르고 작나요?”에는 측정이 필요해요

static이 항상 빠르고 dynamic이 항상 작다는 식으로 결론 내리면 안 돼요.

### Static이 유리할 수 있는 상황

- 별도 dynamic image 수를 줄여 launch 작업을 줄이고 싶어요.
- 모든 module을 App과 항상 같이 build·배포해 binary compatibility가 필요하지 않아요.
- linker의 archive member 선택과 dead stripping으로 실제 사용 code만 포함하고 싶어요.
- 내부 implementation module을 단순하게 배포하고 싶어요.

하지만 같은 static code를 App, widget와 다른 extension에 각각 link하면 bundle 전체에는 code가 중복될 수 있어요. source-level generic specialization이나 `@inlinable`도 client code size를 늘릴 수 있으므로 link map과 App Store size report를 확인해요.

### Dynamic이 유리할 수 있는 상황

- framework를 client와 별도 release schedule로 발전시키고 ABI boundary를 유지해야 해요.
- 여러 module이 같은 dynamic framework를 dependency로 사용하고 packaging 구조가 이를 지원해요.
- SDK의 독립된 version과 binary identity를 유지하고 싶어요.
- resource, module과 binary를 하나의 framework bundle로 전달하고 싶어요.

반면 custom dynamic framework가 많아지면 launch 때 처리할 image와 transitive dependency가 늘 수 있어요. 실제 영향은 image 수, symbol 수, initializer와 device 상태에 따라 달라져요. Xcode Organizer와 Instruments의 App Launch template로 측정한 뒤 결정해요.

## Framework 수와 모듈 수를 같은 기준으로 잡지 않아요

code를 작은 Swift module로 나누는 것은 compile dependency와 ownership을 정리하는 데 유용해요. 그렇다고 각 module을 모두 별도 dynamic framework로 배포해야 하는 것은 아니에요.

```text
논리적 module 경계: 기능 소유권, import, compile dependency
binary image 경계:  link 방식, launch, ABI, 배포와 version 정책
```

여러 source module을 static하게 App에 합칠 수도 있고, 배포용 public facade 하나를 dynamic framework로 만들고 내부 dependency를 static하게 합칠 수도 있어요. Xcode 15 이상의 mergeable library도 이런 image 수 최적화를 지원하지만, 여기서는 기본 static·dynamic 경계를 먼저 이해하면 충분해요.

## Xcode에서 Link와 Embed를 따로 판단해요

### Link는 symbol을 연결해요

Target의 **Build Phases > Link Binary With Libraries**는 framework나 library가 제공하는 symbol을 link input으로 사용하게 해요. `import`만 추가하는 것과 같은 의미가 아니에요.

### Embed는 runtime·resource bundle을 복사해요

Target의 **General > Frameworks, Libraries, and Embedded Content**에서 Embed 설정은 product bundle에 framework를 복사할지를 정해요.

| dependency 종류                          | 일반적인 시작점                                                                        |
| ---------------------------------------- | -------------------------------------------------------------------------------------- |
| Apple system framework                   | Link하고 **Do Not Embed**예요. OS가 binary를 제공해요.                                 |
| third-party dynamic framework            | Link하고 **Embed & Sign**이 일반적이에요.                                              |
| resource 없는 static library `.a`        | Link하지만 runtime code file은 embed하지 않아요.                                       |
| Xcode 15+ resource 포함 static framework | Apple 절차에 따라 wrapper를 embed·sign하고 Xcode가 static main binary를 처리하게 해요. |

정확한 설정은 dependency manager가 생성한 product type과 vendor 문서를 우선해요. 같은 이름의 framework가 수동 추가와 package manager를 통해 중복으로 들어가면 duplicate symbol이나 multiple commands produce 오류가 생길 수 있어요.

## 실제 binary 종류와 dependency를 확인해요

확장자나 Xcode 화면만 믿지 말고 main binary를 검사할 수 있어요.

### `file`로 archive와 Mach-O 종류를 구분해요

```bash
file ReadingKit.framework/ReadingKit
file libReadingKit.a
```

결과에 `current ar archive`가 보이면 static archive예요. dynamic framework binary라면 architecture와 함께 dynamically linked shared library에 해당하는 Mach-O 정보가 보여요.

### `ar`로 static archive member를 봐요

```bash
ar -t libReadingKit.a
```

어떤 `.o` member가 archive에 들어 있는지 확인할 수 있어요.

### `otool`로 dynamic dependency를 봐요

```bash
otool -L ReadingApp.app/ReadingApp
otool -L ReadingKit.framework/ReadingKit
```

첫 줄은 검사 대상 자신이고, 그 아래에 dependent dynamic library의 install name과 compatibility version이 보여요. `@rpath/ReadingKit.framework/ReadingKit`이 있다면 client는 runtime에 그 framework를 찾아야 해요.

### `nm`으로 symbol을 확인해요

```bash
nm -gU ReadingKit.framework/ReadingKit
nm -u ReadingApp.app/ReadingApp
```

exported global symbol과 undefined reference를 확인하는 출발점이에요. Swift symbol은 mangled되어 있으므로 필요하면 `xcrun swift-demangle`을 함께 사용해요.

```bash
nm -gU ReadingKit.framework/ReadingKit | xcrun swift-demangle
```

Release build의 stripping과 optimization에 따라 결과가 줄어들 수 있어요.

## 대표 오류를 link 방식에 맞게 진단해요

| 오류                                                  | 흔한 원인                                                                     | 확인 순서                                                             |
| ----------------------------------------------------- | ----------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| `Undefined symbols for architecture ...`              | library 누락, 잘못된 variant, export되지 않은 API, transitive dependency 누락 | link phase → platform·architecture → symbol export → dependency graph |
| `duplicate symbol ...`                                | 같은 static code를 두 경로로 link, `-all_load` 과다 적용                      | 수동 framework와 package 중복 → link command → archive member         |
| `Library not loaded: @rpath/...`                      | dynamic framework가 app에 없거나 run path가 맞지 않음                         | final `.app/Frameworks` → `otool -L` → `LC_RPATH` → Embed & Sign      |
| `code signature ... not valid`                        | embedded framework가 잘못 sign되었거나 binary가 signing 뒤 변경됨             | framework signature → app signing 순서 → 원본 XCFramework의 출처      |
| `building for iOS Simulator, but linking ... for iOS` | architecture가 같아도 platform variant가 다름                                 | XCFramework variant → SDK/destination → vendor artifact               |

## 선택 기준

### Static을 먼저 검토하기 좋은 경우

- library와 App이 한 repository·release에서 항상 함께 build돼요.
- 별도 ABI 호환성을 유지할 필요가 없어요.
- 작은 내부 module이 많고 dynamic image 수를 늘리고 싶지 않아요.
- App에 실제로 사용되는 code만 link하는 것이 중요해요.

### Dynamic을 검토하기 좋은 경우

- binary framework가 client와 독립적으로 version되고 여러 binary client에 의존돼요.
- 배포 계약으로 ABI와 framework identity를 관리해야 해요.
- system framework처럼 OS가 제공하는 shared image를 사용해요.
- App 구조에서 별도 image 경계가 주는 이점이 측정으로 확인됐어요.

### 결정 전에 함께 물어볼 질문

1. source로 배포할 수 있나요, binary만 배포해야 하나요?
2. framework와 client를 항상 함께 rebuild하나요?
3. App, widget, extension에 같은 code가 어떻게 packaging되나요?
4. resource는 어느 bundle에서 찾나요?
5. transitive dependency를 누가 link·embed하나요?
6. launch time과 전체 install·download size를 실제로 측정했나요?
7. 지원할 Xcode, Swift, platform과 architecture 범위는 무엇인가요?

## 적용 체크리스트

- [ ] `.framework` 확장자만 보고 dynamic이라고 판단하지 않았나요?
- [ ] `file`이나 Mach-O Type으로 main binary의 실제 linkage를 확인했나요?
- [ ] Link와 Embed를 서로 다른 단계로 구분했나요?
- [ ] static framework의 resource wrapper와 static code 처리를 나누어 봤나요?
- [ ] dynamic framework의 `@rpath`, embed 위치와 signature를 확인했나요?
- [ ] App executable 하나가 아니라 extension을 포함한 전체 bundle size를 비교했나요?
- [ ] 성능 결론을 일반론으로 정하지 않고 실제 Release build를 측정했나요?
- [ ] library를 업데이트할 release·ABI 정책을 결정했나요?

## 자주 묻는 면접 질문

### Framework와 library의 차이는 무엇인가요?

library는 재사용할 compiled code를 제공하는 연결 단위이고, framework는 main binary와 module, header, resource, metadata를 표준 directory 구조로 묶은 bundle이에요. framework의 main binary는 static일 수도 dynamic일 수도 있어요.

### Static framework는 runtime에 framework file이 필요 없나요?

code는 client image에 statically linked되므로 main binary를 dynamic dependency로 load하지 않아요. 하지만 Xcode 15 이상의 static framework가 resource를 담았다면 resource·metadata wrapper가 app bundle에 embed될 수 있어요. code linkage와 resource packaging을 분리해서 답해야 해요.

### Dynamic framework는 왜 `Embed & Sign`이 필요한가요?

client executable에는 framework의 machine code가 전부 들어 있지 않아요. device에서 `dyld`가 별도 image를 load해야 하므로 third-party framework bundle이 app 안에 있어야 하고, 실행 가능한 code이므로 app의 signing chain에 맞게 sign되어야 해요.

### Static과 dynamic 중 어느 쪽이 성능이 더 좋나요?

static은 별도 image load를 줄이고 linker 최적화에 유리할 수 있지만 client별 code duplication으로 전체 size가 늘 수 있어요. dynamic은 image를 분리하고 binary evolution에 유리하지만 launch load·binding 비용과 embed 관리가 생겨요. 실제 module 수, code size와 launch profile로 결정해야 해요.

## 참고 자료

- [Creating a static framework - Apple Developer Documentation](https://developer.apple.com/documentation/xcode/creating-a-static-framework)
- [Bundles and frameworks - Apple Developer Documentation](https://developer.apple.com/documentation/xcode/bundles-and-frameworks)
- [Customizing the build phases of a target - Apple Developer Documentation](https://developer.apple.com/documentation/xcode/customizing-the-build-phases-of-a-target)
- [Overview of Dynamic Libraries - Apple Developer Archive](https://developer.apple.com/library/archive/documentation/DeveloperTools/Conceptual/DynamicLibraries/100-Articles/OverviewOfDynamicLibraries.html)
- [Run-Path Dependent Libraries - Apple Developer Archive](https://developer.apple.com/library/archive/documentation/DeveloperTools/Conceptual/DynamicLibraries/100-Articles/RunpathDependentLibraries.html)
- [Behind the Scenes of the Xcode Build Process - WWDC18](https://developer.apple.com/videos/play/wwdc2018/415/)
- [Configuring your project to use mergeable libraries - Apple Developer Documentation](https://developer.apple.com/documentation/xcode/configuring-your-project-to-use-mergeable-libraries)
