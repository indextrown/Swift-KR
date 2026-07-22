import * as path from 'node:path';
import { defineConfig } from '@rspress/core';

export default defineConfig({
  root: path.join(__dirname, 'docs'),
  base: '/Swift-KR/',
  siteOrigin: 'https://indextrown.github.io',
  globalStyles: path.join(__dirname, 'theme/index.css'),
  lang: 'ko',
  title: 'Swift-KR',
  description: 'Swift 라이브러리와 아키텍처·디자인 패턴을 한국어로 정리한 문서',
  icon: '/open-source-docs.svg',
  logo: {
    light: '/open-source-docs.svg',
    dark: '/open-source-docs.svg',
  },
  themeConfig: {
    darkMode: false, // 다크모드
    showNavDivider: false, // 상단 네비게이션바 가로줄
    showSidebarDivider: false, // 사이드바 구분선
    searchPlaceholderText: '검색',
    socialLinks: [
      {
        icon: 'github',
        mode: 'link',
        content: 'https://github.com/indextrown/Swift-KR',
      },
    ],
  },
});
