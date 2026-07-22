# Swift-KR

Swift의 유명 오픈소스 라이브러리와 아키텍처·디자인 패턴을 한국어로 읽기 쉽게 정리하는 문서 저장소입니다.

현재 [The Composable Architecture (TCA)](https://github.com/pointfreeco/swift-composable-architecture)를 시작으로 Dependencies와 CasePaths 문서를 제공하며, 앞으로 다양한 Swift 라이브러리와 설계 패턴을 추가할 예정입니다.

문서 사이트: <https://indextrown.github.io/Swift-KR/>

## 개발 환경

의존성을 설치합니다.

```bash
npm install
```

개발 서버를 실행합니다.

```bash
npm run dev
```

프로덕션 빌드를 만듭니다.

```bash
npm run build
```

빌드 결과를 로컬에서 확인합니다.

```bash
npm run preview
```

## 문서 원칙

- 각 문서는 원문과 공식 저장소 링크를 명시합니다.
- 원문의 라이선스와 저작권은 각 프로젝트 권리자에게 있습니다.
- 오역, 오래된 내용, 빠진 문서는 이슈나 Pull Request로 알려 주세요.

## 배포

`main` 브랜치에 푸시하면 GitHub Actions가 빌드한 뒤 GitHub Pages에 배포합니다.  
저장소 **Settings → Pages**에서 Source를 **GitHub Actions**로 설정해야 합니다.
