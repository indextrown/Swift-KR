# 업스트림 문서 매핑표

이 파일은 한국어 문서 위치와 공식 원문 저장소의 관계를 정리한다. 최신화할 때 로컬 문서의 `원문:` 또는 `공식 참고:` 링크를 먼저 확인하고, 이 표는 저장소·소스 루트·예외를 판별하는 기준으로 사용한다.

## 현재 등록된 문서

| 로컬 문서 범위                                     | 공식 저장소                                                                   | 공식 원문 위치                                       | 주의 사항                                                                                       |
| -------------------------------------------------- | ----------------------------------------------------------------------------- | ---------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| `docs/guide/tca/readme.md`                         | `pointfreeco/swift-composable-architecture`                                   | `README.md`                                          | README 번역본이다.                                                                              |
| `docs/guide/tca/*.md` (`tca-dependencies.md` 제외) | `pointfreeco/swift-composable-architecture`                                   | `Sources/ComposableArchitecture/Documentation.docc/` | 각 페이지의 Swift Package Index 원문 링크에 대응하는 실제 DocC article을 Git tree에서 확인한다. |
| `docs/guide/tca/dependencies/*.md`                 | `pointfreeco/swift-dependencies`                                              | `Sources/Dependencies/Documentation.docc/`           | TCA 디렉터리 안에 있어도 원문은 Dependencies 저장소다.                                          |
| `docs/guide/tca/case-paths/readme.md`              | `pointfreeco/swift-case-paths`                                                | `README.md`                                          | CasePaths README 번역본이다.                                                                    |
| `docs/guide/tca/tca-dependencies.md`               | `pointfreeco/swift-dependencies`, `pointfreeco/swift-composable-architecture` | 참조한 공식 Dependencies 문서와 TCA README           | 이 저장소가 작성한 사용 가이드다. 직접 근거가 있는 설명·예제만 갱신한다.                        |

## 원문 경로 찾기

Swift Package Index URL은 렌더링된 API 문서 주소이므로 Git 파일 경로와 항상 같은 문자열이 아니다. 다음 절차를 사용한다.

1. URL의 패키지 소유자와 저장소를 확인한다.
2. 공식 저장소의 `Documentation.docc` tree에서 제목 또는 슬러그에 맞는 article을 찾는다.
3. 해당 파일의 최신 내용과, 기준점 이후 그 파일을 변경한 commit diff를 함께 확인한다.
4. 찾은 실제 파일 경로를 `upstream-sync` 주석에 기록한다.

`README.md`처럼 원문 GitHub URL이 명시된 문서는 URL에서 바로 파일 경로를 정한다. 원문 링크가 서로 다른 여러 저장소를 가리키는 자체 가이드는 각 주장·예제에 대응하는 원문만 비교하며, 하나의 저장소 전체 변경을 모두 반영하지 않는다.

## TCA PR 검증 표본

| PR                                                                              | 공식 원문 파일                                                                       | 연결된 한국어 문서                         | 변경 성격                                            |
| ------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ | ------------------------------------------ | ---------------------------------------------------- |
| [#3954](https://github.com/pointfreeco/swift-composable-architecture/pull/3954) | `Sources/ComposableArchitecture/Documentation.docc/Articles/TreeBasedNavigation.md`  | `docs/guide/tca/tree-based-navigation.md`  | tree-based navigation 테스트 예제의 reducer 수정     |
| [#3955](https://github.com/pointfreeco/swift-composable-architecture/pull/3955) | `Sources/ComposableArchitecture/Documentation.docc/Articles/StackBasedNavigation.md` | `docs/guide/tca/stack-based-navigation.md` | stack navigation의 path mutation 및 테스트 예제 수정 |

이 표본은 PR 제목만으로 판단하지 않고, GitHub의 `Files changed`와 commit diff를 확인해 문서 대상을 정확히 연결하는 방식을 보여 준다.
