---
title: Swift로 이해하는 빌드, 컴파일과 링킹
description: Xcode 빌드 시스템, Swift 컴파일러, object file, module, symbol, linker와 dyld가 소스 코드를 실행 가능한 앱으로 연결하는 과정을 설명합니다.
pageType: doc-wide
outline: false
---

# Swift로 이해하는 빌드, 컴파일과 링킹

> **면접 답변 한 줄 요약:** 컴파일러는 Swift source를 type check하고 machine code가 든 object file과 module 정보를 만들며, linker는 여러 object와 library의 symbol을 해결해 Mach-O 실행 파일을 만들고, dynamic library의 남은 연결은 실행할 때 `dyld`가 처리해요.

Xcode에서 `Command-B`를 누르면 “컴파일한다”고 말하곤 해요. 하지만 실제 **build**는 compile 하나보다 큰 작업이에요. source code를 compile하고, resource를 처리하고, library를 link하고, bundle을 조립하고, 마지막에는 code signing까지 수행해요.

이 구분을 알면 다음 오류를 서로 다른 단계에서 찾을 수 있어요.

- `Cannot find type ... in scope`는 대개 compiler가 선언을 이해하지 못한 문제예요.
- `Undefined symbols for architecture arm64`는 linker가 구현 symbol을 찾지 못한 문제예요.
- `Library not loaded: @rpath/...`는 만들어진 앱을 실행하면서 dynamic loader가 library를 찾지 못한 문제예요.

이 문서에서는 다음 내용을 배워요.

- build system, compiler, linker와 loader가 나누어 맡는 책임
- Swift source가 AST, SIL, LLVM IR과 object file로 낮아지는 과정
- `.swiftmodule`·`.swiftinterface`와 `.o`가 서로 다른 이유
- symbol의 정의와 참조를 linker가 연결하는 방법
- static link와 dynamic link가 갈라지는 지점
- Xcode build log에서 오류 발생 단계를 찾는 방법

## 먼저 알아둘 빌드 용어

| 용어           | 쉬운 뜻                                                                                                                                       |
| -------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| target         | Xcode가 하나의 product를 만들기 위해 source, resource, build setting과 dependency를 묶은 단위예요.                                            |
| build system   | 입력과 출력의 dependency graph를 만들고 compiler, linker, resource tool, code signer를 필요한 순서로 실행하는 orchestrator예요.               |
| compiler       | source의 문법과 type을 검사하고 target CPU가 실행할 code를 생성하는 도구예요. Swift에서는 `swiftc`가 driver 역할도 해요.                      |
| object file    | compile된 code와 data, symbol, relocation 정보가 들어 있지만 아직 독립적으로 실행할 수 없는 중간 산출물이에요. 보통 `.o`예요.                 |
| module         | 다른 target이 `import`해서 사용할 declaration의 단위예요. Swift module 정보는 client compiler가 API를 type check하는 데 사용해요.             |
| symbol         | function이나 global data처럼 code·data 조각을 linker가 식별하는 이름이에요. Swift 이름은 module과 type 정보가 mangling될 수 있어요.           |
| linker         | object file과 library를 읽어 symbol의 definition과 reference를 연결하고 executable이나 library image를 만드는 도구예요.                       |
| Mach-O         | Apple platform에서 object file, executable과 dynamic library가 사용하는 binary 형식이에요. 파일마다 Mach-O 종류는 다를 수 있어요.             |
| dynamic loader | process를 시작할 때 dependent dynamic library를 찾고 mapping하며 symbol을 bind하는 runtime 구성 요소예요. Apple platform은 `dyld`를 사용해요. |
| architecture   | machine code가 실행될 CPU 계열이에요. Apple device의 `arm64`, 일부 simulator의 `arm64`·`x86_64`가 예예요.                                     |
| platform       | iOS device, iOS Simulator, macOS처럼 SDK와 runtime 환경이 다른 build 목적지예요. architecture가 같아도 platform은 다를 수 있어요.             |

## Build는 여러 도구를 실행하는 dependency graph예요

Apple의 [Behind the Scenes of the Xcode Build Process](https://developer.apple.com/videos/play/wwdc2018/415/)는 build를 source와 resource에서 배포 가능한 bundle까지 가는 여러 task의 집합으로 설명해요. 각 task의 출력이 다음 task의 입력이 되기 때문에 Xcode build system은 먼저 dependency graph를 만들어요.

```text
Swift source ─┐
              ├─ compiler ─ object files ─┐
ObjC source ──┘                            │
                                           ├─ linker ─ Mach-O executable
static libraries ──────────────────────────┤
dynamic library stubs ─────────────────────┘

asset catalog ─ asset compiler ─ resource output ─┐
Info.plist ───── plist processing ─────────────────┼─ app bundle ─ code signing
embedded dynamic frameworks ───────────────────────┘
```

이 그림에서 compiler와 linker는 build를 구성하는 일부 task예요.

1. Xcode가 project, target, build setting과 dependency를 읽어요.
2. source마다 필요한 compile task와 입력·출력을 계산해요.
3. 서로 독립적인 task는 병렬로 실행할 수 있어요.
4. linker는 필요한 object file이 모두 생성된 뒤 실행돼요.
5. resource를 처리하고 product bundle의 올바른 위치로 복사해요.
6. embedded code와 최종 bundle을 signing해요.

따라서 “compiler error가 없으니 build가 성공한다”는 결론은 성립하지 않아요. compile 뒤에도 link, copy, validation과 signing이 남아 있어요.

## Compiler는 source를 machine code로 낮춰요

Swift compiler의 핵심 흐름을 학습용으로 단순화하면 다음과 같아요.

```text
.swift source
  ↓ parse
AST
  ↓ semantic analysis와 type checking
type-checked AST
  ↓ SILGen
SIL
  ↓ Swift 전용 최적화
optimized SIL
  ↓ IRGen
LLVM IR
  ↓ LLVM 최적화와 target code generation
machine code가 든 .o
```

[Swift Compiler 공식 문서](https://www.swift.org/documentation/swift-compiler/)는 parser가 AST를 만들고, semantic analysis가 type check한 AST를 만들며, SIL을 거쳐 LLVM IR과 machine code로 내려간다고 설명해요. 실제 compiler는 build mode와 최적화 설정에 따라 단계를 합치거나 별도 파일을 남기지 않을 수 있어요. 위 흐름은 각 표현의 책임을 이해하기 위한 개념도예요.

### Parse와 type check에서 프로그램의 의미를 확인해요

다음 코드는 문법에는 맞지만 type이 맞지 않아요.

```swift
let completedPages: Int = "42"
```

parser는 variable declaration의 구조를 만들 수 있지만 semantic analysis는 `String`을 `Int`에 넣을 수 없다는 오류를 기록해요. 이 단계가 실패하면 안전하게 code generation으로 갈 수 없어요.

대표적인 compile-time 문제는 다음과 같아요.

- 문법이 완성되지 않았어요.
- type을 추론하거나 변환할 수 없어요.
- access control 때문에 declaration을 볼 수 없어요.
- 현재 SDK나 deployment target에서 API를 사용할 수 없어요.
- import할 module interface를 찾거나 읽을 수 없어요.

### SIL은 Swift 의미를 보존한 최적화 표현이에요

SIL(Swift Intermediate Language)은 ARC 최적화, generic specialization과 devirtualization처럼 Swift 언어 의미를 아는 최적화에 적합해요. 그 뒤 LLVM IR로 낮아지면 LLVM이 target architecture에 맞는 machine code를 생성해요.

앱 개발자가 보통 SIL이나 LLVM IR을 직접 작성하지는 않아요. 다만 “Swift code가 곧바로 assembly 한 줄로 번역된다”는 오해를 피하고, 최적화가 source와 binary 사이 여러 단계에서 이루어진다는 사실을 이해하면 돼요.

## Module 정보와 object code는 목적이 달라요

framework를 배포할 때 자주 혼동하는 두 산출물이 있어요.

| 산출물                     | 누가 사용하나요?            | 담는 핵심 정보                                                  | 답하는 질문                                                         |
| -------------------------- | --------------------------- | --------------------------------------------------------------- | ------------------------------------------------------------------- |
| `.swiftmodule`             | client의 Swift compiler     | compiler가 빠르게 읽을 수 있는 serialized module 정보           | “어떤 public API를 어떤 type으로 호출할 수 있나요?”                 |
| `.swiftinterface`          | 다른 Swift compiler version | public API를 표현한 stable textual module interface             | “다른 compiler가 이 module의 API를 다시 읽을 수 있나요?”            |
| `.o`                       | linker                      | machine code, data, symbol과 relocation                         | “이 function 구현을 최종 binary 어디에 배치하나요?”                 |
| `.a`                       | linker                      | 여러 object file을 모은 static archive                          | “참조된 구현이 들어 있는 object를 가져올 수 있나요?”                |
| framework의 dynamic binary | linker와 `dyld`             | exported code·data와 dynamic linking metadata가 든 Mach-O image | “link 때 검증하고 runtime에 별도 image로 load할 구현은 무엇인가요?” |

예를 들어 다음 한 줄에는 compile과 link 두 문제가 모두 숨어 있을 수 있어요.

```swift
import ReadingKit

let score = ReadingScore.calculate(pages: 42)
```

client compiler는 `ReadingKit.swiftmodule`이나 `ReadingKit.swiftinterface`를 읽어 `ReadingScore.calculate`의 이름과 parameter·return type을 검사해요. 그러나 실제 function body의 machine code도 최종 product에 연결되어야 해요. interface는 있는데 library가 link input에 없으면 import와 type check는 성공해도 link가 실패할 수 있어요.

즉, `import`는 “API 선언을 compiler가 이해한다”는 의미이고, 최종 구현을 product에 연결하는 target dependency와 **Link Binary With Libraries** 설정까지 항상 대신한다는 뜻은 아니에요. Apple의 [Customizing the build phases of a target](https://developer.apple.com/documentation/xcode/customizing-the-build-phases-of-a-target)은 이 build phase가 framework, library, XCFramework와 Swift package product에 대한 참조를 해결한다고 설명해요.

## Object file에는 아직 결정하지 못한 주소가 있어요

다음처럼 한 file의 function이 다른 module의 function을 호출한다고 생각해 볼게요.

```swift
public func summary(for pages: Int) -> String {
  let score = ReadingScore.calculate(pages: pages)
  return "점수: \(score)"
}
```

compiler는 `summary`의 machine code를 만들 수 있지만 `ReadingScore.calculate`가 최종 binary의 어느 주소에 놓일지는 아직 몰라요. 그래서 object file에는 대략 다음 종류의 정보가 남아요.

- 이 object가 **정의하는 symbol**: `summary`
- 다른 object나 library에서 찾아야 할 **undefined symbol**: `ReadingScore.calculate`
- symbol의 최종 주소가 정해지면 고쳐야 할 **relocation** 위치

Apple WWDC의 설명처럼 symbol은 code나 data 조각을 가리키는 이름이에요. linker는 이름을 기준으로 definition을 찾고 reference가 실제 주소를 향하도록 code와 metadata를 patch해요.

## Linker는 symbol graph를 완성해 product image를 만들어요

linker의 주요 입력은 다음과 같아요.

- 현재 target source에서 만들어진 `.o`
- 다른 target이나 vendor가 제공한 static archive `.a`
- dynamic library와 framework의 export 정보
- Apple SDK의 text-based stub `.tbd`
- architecture, deployment target, search path와 link option

linker는 다음 일을 수행해요.

1. 각 object의 defined·undefined symbol을 읽어요.
2. 필요한 symbol definition을 다른 object와 library에서 찾아요.
3. static archive에서는 참조를 만족하는 object member를 선택해 가져와요.
4. code와 data의 최종 layout과 주소를 결정해 relocation을 적용해요.
5. dynamic library symbol은 어느 dependent image에서 찾을지 load metadata에 기록해요.
6. app executable이나 framework binary 같은 Mach-O image를 출력해요.

LLVM의 [Clang Command Guide](https://clang.llvm.org/docs/CommandGuide/clang.html)는 compile·assemble 결과인 object file을 linker가 executable이나 shared library로 합치는 단계로 구분해요. Swift의 내부 표현은 Clang과 다르지만 “object file을 만들고 linker가 최종 image로 결합한다”는 경계는 Xcode의 Swift build에도 적용돼요.

### Linker는 없는 구현을 새로 만들지 않아요

interface에는 declaration이 있지만 어느 입력에도 definition이 없다면 linker는 보통 다음과 같은 오류를 내요.

```text
Undefined symbols for architecture arm64:
  "$s10ReadingKit0A5ScoreO9calculate5pagesS2i_tF", referenced from: ...
ld: symbol(s) not found for architecture arm64
```

Swift mangled symbol은 길고 읽기 어려울 수 있지만 핵심 질문은 같아요.

1. 이 symbol을 정의하는 library가 target의 link input에 들어왔나요?
2. library가 현재 platform과 architecture용으로 build되었나요?
3. API를 `public`으로 선언하고 symbol이 실제로 export되었나요?
4. library가 의존하는 다른 library까지 연결했나요?

source code를 여러 번 clean build하는 것보다 먼저 link command와 input을 확인하는 편이 원인에 가까워요.

## Static link와 dynamic link는 구현을 가져오는 방식이 달라요

linker가 library를 만나는 지점에서 두 방식이 갈라져요.

### Static library는 필요한 object code가 product 안으로 들어가요

static archive는 object file의 모음이에요. linker는 undefined symbol을 만족시키는 member를 골라 최종 executable이나 dynamic library에 포함해요. 이제 그 code는 별도 static library file을 runtime에 찾지 않아요.

```text
App.o + ReadingKit.a
          ↓ link
App executable [App code + 선택된 ReadingKit code]
```

### Dynamic library는 별도 image에 대한 dependency를 기록해요

dynamic framework를 link할 때 linker는 client의 reference가 framework의 exported symbol로 해결될 수 있는지 검사하지만, framework machine code 전체를 app executable에 복사하지 않아요. client Mach-O에는 dependent library와 symbol binding에 필요한 정보가 남아요.

```text
App executable ── load command ──▶ ReadingKit.framework/ReadingKit
       │                                  │
       └──────── runtime에서 dyld가 load·bind ────────┘
```

정적·동적 방식의 packaging, launch와 size tradeoff는 [정적·동적 프레임워크 문서](./static-and-dynamic-frameworks)에서 자세히 비교해요.

## `dyld`는 실행할 때 dynamic dependency를 완성해요

link가 성공했다는 것은 build machine에서 필요한 symbol과 library 정보를 확인했다는 뜻이에요. 사용자의 device에서 process가 시작되면 `dyld`가 executable의 load command를 읽고 dependent dynamic library를 찾아 address space에 mapping하고 symbol을 bind해요.

embedded framework는 보통 install name에 다음과 같은 run-path 상대 경로를 사용해요.

```text
@rpath/ReadingKit.framework/ReadingKit
```

app의 run-path search path와 bundle 안의 framework 위치가 맞지 않거나 framework를 복사·sign하지 않았다면 build는 성공해도 launch가 실패할 수 있어요.

```text
dyld: Library not loaded: @rpath/ReadingKit.framework/ReadingKit
  Reason: tried: ...
```

Apple의 [Overview of Dynamic Libraries](https://developer.apple.com/library/archive/documentation/DeveloperTools/Conceptual/DynamicLibraries/100-Articles/OverviewOfDynamicLibraries.html)는 static linker가 dependent library의 install name을 기록하고 `dyld`가 이를 사용해 runtime library를 찾는 과정을 설명해요.

## 같은 API 사용도 세 단계에서 실패할 수 있어요

| 실패 시점    | 대표 message·현상                                        | 먼저 확인할 것                                                                                |
| ------------ | -------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| compile time | `No such module`, `Cannot find ... in scope`, type error | module search path, target membership, public API, SDK와 Swift compiler 호환성                |
| link time    | `Undefined symbols`, `Duplicate symbols`                 | Link Binary With Libraries, architecture·platform, static archive 중복, transitive dependency |
| bundle 단계  | framework validation·code signing 오류                   | Embed 설정, bundle 위치, code signature, framework의 supported platform                       |
| runtime      | `Library not loaded`, missing symbol, launch crash       | `@rpath`, embedded dynamic framework, ABI 호환성, 실제 device에 포함된 image                  |

이 표는 증상만으로 원인을 확정하는 규칙은 아니에요. 예를 들어 잘못된 generated module 때문에 compile이 실패할 수도 있고, API를 binary-incompatible하게 바꾸면 runtime에 symbol을 찾지 못할 수도 있어요. 중요한 점은 실패한 tool과 phase부터 범위를 줄이는 거예요.

## Xcode build log를 단계별로 읽어요

Xcode의 Report navigator에서 실패한 build를 열면 task 이름을 볼 수 있어요.

| log에서 찾을 task 예                        | 의미                                                           |
| ------------------------------------------- | -------------------------------------------------------------- |
| `SwiftCompile`, `CompileSwiftSources`       | Swift source를 type check하고 object·module 산출물을 만들어요. |
| `CompileC`, `CompileSwift`                  | C 계열 또는 Swift compile task예요.                            |
| `Ld`                                        | linker가 executable이나 library image를 만들어요.              |
| `Copy`, `CopyFiles`, `ProcessInfoPlistFile` | product bundle을 조립하고 metadata·resource를 처리해요.        |
| `CodeSign`                                  | executable code와 bundle의 signature를 만들거나 검증해요.      |

문제를 재현한 뒤 다음 순서로 읽어 보세요.

1. 첫 번째 실제 error를 낸 task를 찾고 뒤따르는 cascade error와 구분해요.
2. task를 펼쳐 실행된 `swiftc`, `clang`이나 `ld` command와 argument를 확인해요.
3. `-target`, SDK, search path, `-framework`·`-l`과 input file이 의도와 맞는지 봐요.
4. 같은 module이나 library가 두 경로에서 중복 입력되지 않았는지 확인해요.
5. runtime 문제라면 build log뿐 아니라 최종 `.app` bundle과 Mach-O dependency도 검사해요.

## 작은 command-line 실험으로 module과 object를 나눠 봐요

Xcode가 평소 자동화하는 경계를 학습하기 위한 예예요. `ReadingKit.swift`를 만들어요.

```swift
public enum ReadingScore {
  public static func calculate(pages: Int) -> Int {
    pages * 10
  }
}
```

module 정보와 object file을 함께 출력해요.

```bash
mkdir -p Build

xcrun swiftc ReadingKit.swift \
  -parse-as-library \
  -module-name ReadingKit \
  -emit-module \
  -emit-module-path Build/ReadingKit.swiftmodule \
  -emit-object \
  -o Build/ReadingKit.o
```

client인 `main.swift`는 module을 import해 type check하고 object와 link해요.

```swift
import ReadingKit

print(ReadingScore.calculate(pages: 42))
```

```bash
xcrun swiftc main.swift \
  Build/ReadingKit.o \
  -I Build \
  -o Build/ReadingApp

./Build/ReadingApp
```

여기서 `-I Build`를 빼면 compiler가 module을 못 찾고, `Build/ReadingKit.o`를 빼면 API를 이해한 뒤에도 linker가 구현을 못 찾을 수 있어요. 실제 output 이름과 option은 toolchain과 platform에 따라 달라질 수 있으므로 이 예제는 배포 script가 아니라 두 책임을 관찰하는 학습 실험으로 사용해요.

## Binary를 검사하는 기본 도구

| command                    | 확인하는 질문                                                  |
| -------------------------- | -------------------------------------------------------------- |
| `file <binary>`            | Mach-O인지 static archive인지, 어떤 architecture를 포함하나요? |
| `nm -gU <binary>`          | 외부로 보이는 defined symbol은 무엇인가요?                     |
| `nm -u <object-or-binary>` | 아직 다른 image에서 해결해야 할 undefined symbol은 무엇인가요? |
| `otool -L <mach-o>`        | 어떤 dynamic library install name을 dependency로 기록했나요?   |
| `otool -l <mach-o>`        | load command와 run path가 어떻게 기록되었나요?                 |
| `ar -t <library.a>`        | static archive에 어떤 object member가 들어 있나요?             |

결과는 Release optimization, symbol stripping과 toolchain에 따라 달라져요. `nm`에 source function이 그대로 보이지 않는다고 바로 누락으로 판단하지 말고 access level, mangling과 stripping 설정을 함께 봐야 해요.

## 적용 체크리스트

- [ ] “build”, “compile”, “link”를 같은 뜻으로 사용하지 않고 실패한 phase를 먼저 구분했나요?
- [ ] module interface와 machine code binary가 모두 client target에 연결되어 있나요?
- [ ] library의 platform과 architecture가 현재 destination과 일치하나요?
- [ ] custom target dependency를 import의 auto-link 동작에만 의존하지 않았나요?
- [ ] dynamic framework라면 최종 app bundle에 올바르게 embed·sign되었나요?
- [ ] `otool -L`의 install name과 app의 run path를 함께 확인했나요?
- [ ] 첫 error를 낸 build task와 실제 tool command를 build log에서 확인했나요?

## 자주 묻는 면접 질문

### Compiler와 linker의 차이는 무엇인가요?

compiler는 source의 문법·type을 검사하고 object code를 만들어요. linker는 여러 object와 library가 정의·참조하는 symbol을 연결해 executable이나 library image를 만들어요. 선언을 못 이해하면 compile error, 선언은 이해했지만 구현을 못 찾으면 주로 link error가 나요.

### `.swiftmodule`과 `.o`는 왜 둘 다 필요한가요?

`.swiftmodule`은 client compiler가 public API를 import하고 type check할 때 사용하고, `.o`는 linker가 실제 machine code 구현을 최종 product에 배치할 때 사용해요. 하나는 compile-time interface, 다른 하나는 link-time implementation에 가까워요.

### Link가 끝났는데 `dyld` 오류가 날 수 있는 이유는 무엇인가요?

dynamic library code는 app executable에 전부 복사되지 않고 dependency로 남아요. build machine에서 link가 성공했어도 최종 app bundle에 library가 없거나, install name·run path·signature가 맞지 않으면 device에서 `dyld`가 load하지 못해요.

### Mach-O와 XCFramework는 같은 binary 형식인가요?

아니에요. Mach-O는 개별 object, executable이나 dynamic library가 사용하는 binary 형식이고, XCFramework는 platform·architecture별 framework나 library variant를 한 디렉터리 bundle로 묶는 배포 형식이에요. 자세한 구조는 [XCFramework 문서](./xcframework)에서 설명해요.

## 참고 자료

- [Behind the Scenes of the Xcode Build Process - WWDC18](https://developer.apple.com/videos/play/wwdc2018/415/)
- [Customizing the build phases of a target - Apple Developer Documentation](https://developer.apple.com/documentation/xcode/customizing-the-build-phases-of-a-target)
- [Swift Compiler - Swift.org](https://www.swift.org/documentation/swift-compiler/)
- [Swift Compiler Driver - Swift GitHub](https://github.com/swiftlang/swift-driver)
- [Clang Command Guide - LLVM](https://clang.llvm.org/docs/CommandGuide/clang.html)
- [Overview of Dynamic Libraries - Apple Developer Archive](https://developer.apple.com/library/archive/documentation/DeveloperTools/Conceptual/DynamicLibraries/100-Articles/OverviewOfDynamicLibraries.html)
