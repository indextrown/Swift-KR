import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const directory = path.join(root, 'docs/guide/mapbox-maps-sdk');
const assetsDirectory = path.join(directory, 'assets');
const routePrefix = '/guide/mapbox-maps-sdk/';
const sourcePrefix = 'https://docs.mapbox.com/ios/maps/guides';
const pngSignature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

function frontmatter(content) {
  const header = content.match(/^---\r?\n([\s\S]*?)\r?\n---/)?.[1];
  assert.ok(header, 'frontmatter가 없습니다.');
  return Object.fromEntries(
    [...header.matchAll(/^(\w+):\s*(.*?)\s*$/gm)].map(([, key, value]) => [
      key,
      value.replace(/^(['"])(.*)\1$/, '$2'),
    ]),
  );
}

function flattenSidebar(items, parent = null) {
  return items.flatMap((item) => {
    assert.equal(item.type, 'custom-link', `${item.label}: custom-link 필요`);
    assert.ok(item.link.startsWith(routePrefix), `${item.label}: 경로 불일치`);
    assert.ok(/[가-힣]/.test(item.label), `${item.label}: 한국어 이름 필요`);
    const slug = item.link.slice(routePrefix.length);
    if (item.items?.length) {
      assert.equal(item.collapsible, true, `${slug}: 접기 기능 필요`);
      assert.equal(item.collapsed, true, `${slug}: 기본 닫힘 필요`);
    }
    return [
      { slug, label: item.label, parent },
      ...flattenSidebar(item.items ?? [], slug),
    ];
  });
}

async function markdownSlugs(relative = '') {
  const entries = await readdir(path.join(directory, relative), {
    withFileTypes: true,
  });
  const nested = await Promise.all(
    entries.map(async (entry) => {
      const name = path.posix.join(relative, entry.name);
      if (entry.isDirectory()) return markdownSlugs(name);
      return name.endsWith('.md') ? [name.slice(0, -3)] : [];
    }),
  );
  return nested.flat();
}

function assertUnique(values, name) {
  assert.equal(new Set(values).size, values.length, `${name}: 중복 항목`);
}

function imageReference(page, file) {
  const relative = path.posix.relative(
    path.posix.dirname(`${page}.md`),
    `assets/${file}`,
  );
  return relative.startsWith('.') ? relative : `./${relative}`;
}

async function checkImages(imageManifest, guideManifest) {
  assert.equal(imageManifest.owner, 'Mapbox', '이미지 권리자 표기 불일치');
  assert.equal(
    imageManifest.reviewed,
    '2026-09-01',
    '이미지 검토일을 갱신하세요.',
  );
  assert.ok(imageManifest.images.length > 0, '이미지 목록이 비었습니다.');
  assertUnique(
    imageManifest.images.map((image) => image.file),
    '이미지 파일',
  );
  assertUnique(
    imageManifest.images.map((image) => image.source),
    '이미지 원본 URL',
  );
  assertUnique(
    imageManifest.images.map((image) => image.alt),
    '이미지 대체 텍스트',
  );

  const officialPages = new Set(guideManifest.pages.map((page) => page.slug));
  const actualFiles = (await readdir(assetsDirectory))
    .filter((file) => file.endsWith('.png'))
    .toSorted();
  assert.deepEqual(
    actualFiles,
    imageManifest.images.map((image) => image.file).toSorted(),
    '매니페스트와 로컬 PNG 파일 목록이 다릅니다.',
  );

  let totalBytes = 0;
  for (const image of imageManifest.images) {
    assert.match(image.file, /^[a-z0-9-]+\.png$/, `${image.file}: 파일 이름`);
    assert.ok(officialPages.has(image.page), `${image.file}: 공식 페이지 누락`);
    assert.ok(image.alt.trim().length >= 10, `${image.file}: 대체 텍스트 부족`);
    assert.ok(
      image.source.startsWith('https://docs.mapbox.com/ios/assets/') ||
        image.source.startsWith('https://static-assets.mapbox.com/'),
      `${image.file}: 공식 이미지 URL이 아닙니다.`,
    );

    const binary = await readFile(path.join(assetsDirectory, image.file));
    assert.ok(binary.length > 24, `${image.file}: PNG 데이터 부족`);
    assert.deepEqual(
      binary.subarray(0, pngSignature.length),
      pngSignature,
      `${image.file}: PNG 서명 불일치`,
    );
    const width = binary.readUInt32BE(16);
    const height = binary.readUInt32BE(20);
    assert.ok(width > 0 && height > 0, `${image.file}: PNG 크기 불일치`);
    totalBytes += binary.length;

    const content = await readFile(
      path.join(directory, `${image.page}.md`),
      'utf8',
    );
    const reference = `![${image.alt}](${imageReference(
      image.page,
      image.file,
    )})`;
    assert.ok(content.includes(reference), `${image.file}: 문서 참조 누락`);
  }

  console.log(
    `로컬 공식 이미지: ${imageManifest.images.length}개 / ${(
      totalBytes /
      1024 /
      1024
    ).toFixed(1)}MB`,
  );
}

async function checkOnline(manifest) {
  const response = await fetch(manifest.officialIndex, {
    signal: AbortSignal.timeout(30_000),
  });
  assert.ok(response.ok, `공식 색인 요청 실패: ${response.status}`);
  const content = await response.text();
  const guides = content.match(
    /^## Guides\s*\n([\s\S]*?)(?=^## |$(?![\s\S]))/m,
  )?.[1];
  assert.ok(guides, '공식 색인의 Guides 구역을 찾을 수 없습니다.');
  const sources = [...guides.matchAll(/^- \[[^\]]+\]\(([^)]+)\)/gm)].map(
    ([, url]) => {
      assert.ok(url.startsWith(sourcePrefix), `Guides 외 URL: ${url}`);
      assert.ok(url.endsWith('.md'), `공식 색인 URL 형식 변경: ${url}`);
      return `${url.slice(0, -3)}/`;
    },
  );
  assertUnique(sources, '공식 색인');
  assert.deepEqual(
    sources.toSorted(),
    manifest.pages.map((page) => page.source).toSorted(),
    '공식 Guides 페이지와 대응표가 다릅니다. 추가·삭제된 항목을 검토하세요.',
  );
  console.log(`공식 Guides 색인 대조: ${sources.length}개 일치`);
}

async function main() {
  const options = process.argv.slice(2);
  assert.ok(
    options.every((option) => option === '--online'),
    '지원 옵션: --online',
  );
  const manifest = JSON.parse(
    await readFile(path.join(directory, 'guide-manifest.json'), 'utf8'),
  );
  const imageManifest = JSON.parse(
    await readFile(path.join(assetsDirectory, 'image-manifest.json'), 'utf8'),
  );
  const meta = JSON.parse(
    await readFile(path.join(directory, '_meta.json'), 'utf8'),
  );
  const slugs = manifest.pages.map((page) => page.slug);
  assertUnique(slugs, '공식 가이드 문서');
  assertUnique(
    manifest.pages.map((page) => page.source),
    '공식 원문 URL',
  );
  assertUnique([...slugs, ...manifest.legacyPages], '공식·보충 문서');
  assert.deepEqual(
    flattenSidebar(meta),
    manifest.pages.map(({ slug, label, parent }) => ({ slug, label, parent })),
    '좌측 목차의 이름·순서·부모가 대응표와 다릅니다.',
  );
  assert.deepEqual(
    (await markdownSlugs()).toSorted(),
    [...slugs, ...manifest.legacyPages].toSorted(),
    '대응표에 없는 문서 또는 누락된 문서가 있습니다.',
  );
  const overview = await readFile(path.join(directory, 'index.md'), 'utf8');
  for (const page of manifest.pages) {
    const content = await readFile(
      path.join(directory, `${page.slug}.md`),
      'utf8',
    );
    const metadata = frontmatter(content);
    assert.equal(
      metadata.source,
      page.source,
      `${page.slug}: 공식 원문 불일치`,
    );
    assert.equal(
      metadata.reviewed,
      manifest.reviewed,
      `${page.slug}: 검토일 불일치`,
    );
    assert.ok(metadata.title?.trim(), `${page.slug}: 제목 누락`);
    const length = [...(metadata.description ?? '')].length;
    assert.ok(
      length >= 50 && length <= 160,
      `${page.slug}: description ${length}자`,
    );
    assert.ok(/^# .+/m.test(content), `${page.slug}: H1 누락`);
    assert.ok(content.includes(page.source), `${page.slug}: 원문 링크 누락`);
    assert.ok(
      overview.includes(page.source),
      `${page.slug}: 개요의 대응표 누락`,
    );
  }
  console.log(
    `로컬 공식 가이드: ${slugs.length}개 / 보존한 보충 문서: ${manifest.legacyPages.length}개`,
  );
  await checkImages(imageManifest, manifest);
  console.log('목차 순서·부모·한글 이름·기본 접힘·frontmatter 검사 통과');
  if (options.includes('--online')) await checkOnline(manifest);
}

try {
  await main();
} catch (error) {
  console.error(error);
  process.exitCode = 1;
}
