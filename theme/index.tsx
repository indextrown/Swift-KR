/* eslint-disable react-refresh/only-export-components */
import { useFrontmatter, usePage, useSite } from '@rspress/core/runtime';
import {
  Root as ThemeRoot,
  Toc,
  type RootProps,
} from '@rspress/core/theme-original';
import { useEffect } from 'react';

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

export function Root({ children }: RootProps) {
  return (
    <ThemeRoot>
      <LayoutDividerToggles />
      {children}
    </ThemeRoot>
  );
}
