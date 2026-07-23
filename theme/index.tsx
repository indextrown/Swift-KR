/* eslint-disable react-refresh/only-export-components */
import {
  useFrontmatter,
  usePage,
  useSidebar,
  useSite,
} from '@rspress/core/runtime';
import {
  Root as ThemeRoot,
  SidebarList,
  Toc,
  type RootProps,
} from '@rspress/core/theme-original';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';

export * from '@rspress/core/theme-original';

type ThemeConfigWithLayoutDividers = {
  showNavDivider?: boolean;
  showSidebarDivider?: boolean;
};

function LayoutDividerToggles() {
  const { frontmatter } = useFrontmatter();
  const { page } = usePage();
  const { site } = useSite();

  useEffect(() => {
    const isDocPage = page.pageType === 'doc' || page.pageType === 'doc-wide';
    const themeConfig = site.themeConfig as ThemeConfigWithLayoutDividers;
    const showSidebarDivider =
      frontmatter.showSidebarDivider ?? themeConfig.showSidebarDivider ?? false;
    const showNavDivider =
      frontmatter.showNavDivider ?? themeConfig.showNavDivider ?? true;

    if (isDocPage) {
      document.body.dataset.showSidebarDivider =
        showSidebarDivider === true ? 'true' : 'false';
    } else {
      delete document.body.dataset.showSidebarDivider;
    }

    document.body.dataset.showNavDivider =
      showNavDivider === true ? 'true' : 'false';

    return () => {
      delete document.body.dataset.showSidebarDivider;
      delete document.body.dataset.showNavDivider;
    };
  }, [
    frontmatter.showNavDivider,
    frontmatter.showSidebarDivider,
    page.pageType,
    site.themeConfig,
  ]);

  return null;
}

export function Outline() {
  return (
    <div className="rp-outline osd-outline">
      <div className="rp-outline__title osd-outline__title">
        이 페이지의 내용
      </div>
      <nav className="rp-outline__toc rp-scrollbar osd-outline__toc">
        <Toc />
      </nav>
    </div>
  );
}

export function Sidebar() {
  const rawSidebarData = useSidebar();
  const sidebarSource = useRef(rawSidebarData);
  const [sidebarData, setSidebarData] = useState(() =>
    structuredClone(rawSidebarData),
  );

  useLayoutEffect(() => {
    if (sidebarSource.current === rawSidebarData) return;

    sidebarSource.current = rawSidebarData;
    setSidebarData(structuredClone(rawSidebarData));
  }, [rawSidebarData]);

  return (
    <SidebarList sidebarData={sidebarData} setSidebarData={setSidebarData} />
  );
}

export function Root({ children }: RootProps) {
  return (
    <ThemeRoot>
      <LayoutDividerToggles />
      {children}
    </ThemeRoot>
  );
}
