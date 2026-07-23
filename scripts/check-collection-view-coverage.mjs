import { access, readFile } from 'node:fs/promises';
import path from 'node:path';

const docsDirectory = path.resolve('docs/guide/uikit/collection-views');
const doccBaseURL = 'https://developer.apple.com/tutorials/data';
const collectionViewsURL = '/documentation/uikit/collection-views';
const layoutsURL = '/documentation/uikit/layouts';

async function fetchDoc(url) {
  const response = await fetch(`${doccBaseURL}${url}.json`);
  if (!response.ok) {
    throw new Error(`Apple DocC 요청 실패: ${url} (${response.status})`);
  }
  return response.json();
}

function directEntries(doc) {
  return doc.topicSections.flatMap((section) =>
    section.identifiers.map((identifier) => ({
      section: section.title,
      ref: doc.references[identifier],
    })),
  );
}

function slugForURL(url) {
  return url
    .split('/')
    .filter(Boolean)
    .at(-1)
    .replace(/-swift\.(?:struct|property|typealias)$/, '')
    .replace(/-9tqpa$/, '')
    .toLowerCase();
}

function localPathForURL(url, layoutURLs, collectionURLs) {
  if (url === layoutsURL) return 'layouts/index.md';
  const slug = slugForURL(url);
  if (layoutURLs.has(url) && !collectionURLs.has(url)) {
    return `layouts/${slug}.md`;
  }
  return `${slug}.md`;
}

function descriptionFrom(content) {
  return content.match(/^description:\s*["']?(.*?)["']?\s*$/m)?.[1] ?? '';
}

function characterCount(value) {
  return [...value].length;
}

function primaryContentImages(doc) {
  const identifiers = new Set();

  function visit(value) {
    if (Array.isArray(value)) {
      value.forEach(visit);
      return;
    }
    if (!value || typeof value !== 'object') return;

    if (value.type === 'image' && value.identifier) {
      identifiers.add(value.identifier);
    }
    Object.values(value).forEach(visit);
  }

  visit(doc.primaryContentSections ?? []);

  return [...identifiers]
    .map((identifier) => ({
      identifier,
      reference: doc.references?.[identifier],
    }))
    .filter(
      ({ reference }) =>
        reference?.type === 'image' && reference.alt?.trim().length > 0,
    );
}

function officialBodyMetrics(doc) {
  const metrics = {
    paragraphCount: 0,
    headingCount: 0,
    swiftCodeCount: 0,
    asideCount: 0,
  };

  function visit(value) {
    if (Array.isArray(value)) {
      value.forEach(visit);
      return;
    }
    if (!value || typeof value !== 'object') return;

    if (value.type === 'paragraph') metrics.paragraphCount += 1;
    if (value.type === 'heading') metrics.headingCount += 1;
    if (value.type === 'codeListing' && value.syntax === 'swift') {
      metrics.swiftCodeCount += 1;
    }
    if (value.type === 'aside') metrics.asideCount += 1;

    Object.values(value).forEach(visit);
  }

  visit(doc.primaryContentSections ?? []);
  return metrics;
}

function localBodyMetrics(content, kind) {
  const swiftCodeCount = content.match(/^```swift$/gm)?.length ?? 0;

  return {
    headingCount: content.match(/^#{2,6} /gm)?.length ?? 0,
    // 심볼 문서의 첫 Swift 블록은 API 선언이므로 본문 예제에서 제외해요.
    swiftCodeCount:
      kind === 'symbol' ? Math.max(0, swiftCodeCount - 1) : swiftCodeCount,
    asideCount:
      content.match(/^> \*\*(?!면접 답변 한 줄 요약:)/gm)?.length ?? 0,
  };
}

function checkBodyFidelity({ doc, content, entry, localPath, errors }) {
  const official = officialBodyMetrics(doc);
  const local = localBodyMetrics(content, entry.ref.kind);
  const isRichSymbol =
    entry.ref.kind === 'symbol' &&
    (official.paragraphCount >= 4 || official.swiftCodeCount > 0);
  const isRichArticle =
    entry.ref.kind !== 'symbol' &&
    (official.paragraphCount >= 8 || official.swiftCodeCount >= 2);

  if (isRichSymbol) {
    const marker = '## 공식 설명에서 놓치면 안 되는 동작';
    if (!content.includes(marker)) {
      errors.push(
        `${entry.ref.title}: 설명이 풍부한 공식 심볼인데 "${marker}" 본문이 없습니다. (${localPath})`,
      );
    }
  }

  if (official.swiftCodeCount > local.swiftCodeCount) {
    errors.push(
      `${entry.ref.title}: 공식 Swift 예제가 줄었습니다. ` +
        `(공식 ${official.swiftCodeCount}개, 로컬 ${local.swiftCodeCount}개)`,
    );
  }

  if (isRichArticle) {
    if (official.headingCount > local.headingCount) {
      errors.push(
        `${entry.ref.title}: 공식 본문 heading 흐름이 줄었습니다. ` +
          `(공식 ${official.headingCount}개, 로컬 ${local.headingCount}개)`,
      );
    }
    if (official.asideCount > local.asideCount) {
      errors.push(
        `${entry.ref.title}: 공식 note/important가 줄었습니다. ` +
          `(공식 ${official.asideCount}개, 로컬 ${local.asideCount}개)`,
      );
    }
  }

  const fillerPatterns = [
    '현재 값이나 설정을 읽고 필요한 경우 변경해요',
    '필요한 값을 받아 새 인스턴스를 만들어요',
    '에 정의된 값 또는 callback의 의미를 나타내요',
    '활성화 여부나 현재 상태를 나타내요',
    '전달한 초기값으로 새 인스턴스를 만들어요',
  ];
  for (const filler of fillerPatterns) {
    if (content.includes(filler)) {
      errors.push(
        `${entry.ref.title}: 의미 없는 자동 생성 설명이 남아 있습니다. ("${filler}")`,
      );
    }
  }

  return { official, local, isRichArticle, isRichSymbol };
}

async function checkContentImages({
  doc,
  content,
  absolutePath,
  title,
  errors,
}) {
  const officialImages = primaryContentImages(doc);
  let mirroredImageCount = 0;

  for (const { identifier } of officialImages) {
    const marker = `<!-- Apple DocC image: ${identifier} -->`;
    const markerIndex = content.indexOf(marker);
    if (markerIndex === -1) {
      errors.push(`${title}: 공식 본문 이미지 "${identifier}"가 없습니다.`);
      continue;
    }

    const imageMarkdown = content
      .slice(markerIndex + marker.length)
      .match(/!\[[^\]]+\]\(([^)]+)\)/);
    if (!imageMarkdown) {
      errors.push(
        `${title}: "${identifier}" 표시 뒤에 Markdown 이미지가 없습니다.`,
      );
      continue;
    }

    const imagePath = imageMarkdown[1];
    if (/^(?:https?:|data:|\/)/.test(imagePath)) {
      errors.push(
        `${title}: "${identifier}" 이미지를 로컬 상대 경로로 참조하지 않습니다.`,
      );
      continue;
    }

    try {
      await access(path.resolve(path.dirname(absolutePath), imagePath));
      mirroredImageCount += 1;
    } catch {
      errors.push(
        `${title}: "${identifier}" 이미지 파일이 없습니다. (${imagePath})`,
      );
    }
  }

  return {
    officialImageCount: officialImages.length,
    mirroredImageCount,
  };
}

const localizedLabels = new Map([
  ['View', '뷰'],
  ['Data', '데이터'],
  ['Cells', '셀'],
  ['Layouts', '레이아웃'],
  ['Selection management', '선택 관리'],
  ['Drag and drop', '드래그 앤 드롭'],
  ['Essentials', '핵심 API'],
  ['Components', '구성 요소'],
  ['Size and spacing', '크기와 간격'],
  ['Configuration', '구성'],
  ['Interaction', '상호작용'],
  ['Appearance', '모양'],
  ['Advanced layouts', '고급 레이아웃'],
  ['Layout updates', '레이아웃 업데이트'],
  ['Manual layouts', '직접 구성하는 레이아웃'],
  [
    'Updating collection views using diffable data sources',
    'Diffable Data Source로 Collection View 업데이트하기',
  ],
  ['Implementing modern collection views', '현대적인 Collection View 구현하기'],
  [
    'Building high-performance lists and collection views',
    '고성능 목록과 Collection View 만들기',
  ],
  [
    'Changing the appearance of selected and highlighted cells',
    '선택·하이라이트 셀 모양 바꾸기',
  ],
  [
    'Selecting multiple items with a two-finger pan gesture',
    '두 손가락 제스처로 여러 item 선택하기',
  ],
  [
    'Supporting Drag and Drop in Collection Views',
    'Collection View에서 드래그 앤 드롭 지원하기',
  ],
  [
    'Customizing collection view layouts',
    'Collection View Layout 사용자 정의하기',
  ],
]);

function localizedLabel(label) {
  return localizedLabels.get(label) ?? label;
}

function expectedMetaLabels(doc) {
  return doc.topicSections.flatMap((section) => [
    localizedLabel(section.title),
    ...section.identifiers.map((identifier) =>
      localizedLabel(doc.references[identifier].title),
    ),
  ]);
}

function actualMetaLabels(meta, firstGroupLabel) {
  const startIndex = meta.findIndex(
    (item) => item.type === 'custom-link' && item.label === firstGroupLabel,
  );

  if (startIndex === -1) return [];

  return meta
    .slice(startIndex)
    .filter((item) => item.type === 'custom-link' && item.items)
    .flatMap((group) => [
      group.label,
      ...group.items.map((item) => item.label),
    ]);
}

function checkCollapsibleGroups(items, location, errors) {
  for (const item of items) {
    if (!item.items) continue;
    if (item.collapsible !== true) {
      errors.push(
        `${location}의 "${item.label}" 그룹에 접기 화살표가 없습니다.`,
      );
    }
    if (typeof item.collapsed !== 'boolean') {
      errors.push(`${location}의 "${item.label}" 기본 접힘 상태가 없습니다.`);
    }
    checkCollapsibleGroups(item.items, location, errors);
  }
}

function compareLabels(expected, actual, location, errors) {
  if (JSON.stringify(expected) === JSON.stringify(actual)) return;

  errors.push(`${location}의 공식 목차 순서가 Apple DocC와 다릅니다.`);
  const max = Math.max(expected.length, actual.length);
  for (let index = 0; index < max; index += 1) {
    if (expected[index] !== actual[index]) {
      errors.push(
        `  ${index + 1}번째: 기대 "${expected[index] ?? '(없음)'}", 실제 "${actual[index] ?? '(없음)'}"`,
      );
      break;
    }
  }
}

async function main() {
  const [collectionDoc, layoutsDoc] = await Promise.all([
    fetchDoc(collectionViewsURL),
    fetchDoc(layoutsURL),
  ]);
  const collectionEntries = directEntries(collectionDoc);
  const layoutEntries = directEntries(layoutsDoc);
  const collectionURLs = new Set(
    collectionEntries.map((entry) => entry.ref.url),
  );
  const layoutURLs = new Set(layoutEntries.map((entry) => entry.ref.url));

  const entriesByURL = new Map();
  for (const entry of [...collectionEntries, ...layoutEntries]) {
    if (!entriesByURL.has(entry.ref.url)) {
      entriesByURL.set(entry.ref.url, entry);
    }
  }

  const errors = [];
  let topicSectionCount = 0;
  let memberOccurrenceCount = 0;
  let symbolExampleCount = 0;
  let officialContentImageCount = 0;
  let mirroredContentImageCount = 0;
  let richArticleCount = 0;
  let richSymbolCount = 0;
  let officialSwiftExampleCount = 0;
  let mirroredSwiftExampleCount = 0;
  const uniqueMemberURLs = new Set();

  for (const [url, entry] of entriesByURL) {
    const localPath = localPathForURL(url, layoutURLs, collectionURLs);
    const absolutePath = path.join(docsDirectory, localPath);

    try {
      await access(absolutePath);
    } catch {
      errors.push(`${entry.ref.title}: 로컬 문서가 없습니다. (${localPath})`);
      continue;
    }

    const [content, doc] = await Promise.all([
      readFile(absolutePath, 'utf8'),
      fetchDoc(url),
    ]);

    if (!content.includes(`https://developer.apple.com${url}`)) {
      errors.push(`${entry.ref.title}: Apple 공식 문서 링크가 없습니다.`);
    }

    const description = descriptionFrom(content);
    const descriptionLength = characterCount(description);
    if (descriptionLength < 50 || descriptionLength > 160) {
      errors.push(
        `${entry.ref.title}: description이 50~160자가 아닙니다. (${descriptionLength}자)`,
      );
    }

    if (entry.ref.kind === 'symbol') {
      symbolExampleCount += 1;
      const exampleSection = content.split('## 가장 작은 사용 예제')[1] ?? '';
      const exampleCode =
        exampleSection.match(/```swift\n([\s\S]*?)```/)?.[1] ?? '';
      if (!exampleCode.includes(entry.ref.title)) {
        errors.push(
          `${entry.ref.title}: 최소 사용 예제에서 대상 API를 직접 사용하지 않습니다.`,
        );
      }
    }

    const imageCoverage = await checkContentImages({
      doc,
      content,
      absolutePath,
      title: entry.ref.title,
      errors,
    });
    officialContentImageCount += imageCoverage.officialImageCount;
    mirroredContentImageCount += imageCoverage.mirroredImageCount;

    const bodyCoverage = checkBodyFidelity({
      doc,
      content,
      entry,
      localPath,
      errors,
    });
    if (bodyCoverage.isRichArticle) richArticleCount += 1;
    if (bodyCoverage.isRichSymbol) richSymbolCount += 1;
    officialSwiftExampleCount += bodyCoverage.official.swiftCodeCount;
    mirroredSwiftExampleCount += Math.min(
      bodyCoverage.official.swiftCodeCount,
      bodyCoverage.local.swiftCodeCount,
    );

    for (const topicSection of doc.topicSections ?? []) {
      topicSectionCount += 1;
      for (const identifier of topicSection.identifiers ?? []) {
        const member = doc.references?.[identifier];
        if (!member) continue;
        memberOccurrenceCount += 1;
        if (member.url) uniqueMemberURLs.add(member.url);
        if (!content.includes(`\`${member.title}\``)) {
          errors.push(
            `${entry.ref.title}: "${topicSection.title}"의 "${member.title}" 항목이 없습니다.`,
          );
        }
      }
    }
  }

  const collectionViewsIndexPath = path.join(docsDirectory, 'index.md');
  const collectionViewsIndex = await readFile(collectionViewsIndexPath, 'utf8');
  const rootImageCoverage = await checkContentImages({
    doc: collectionDoc,
    content: collectionViewsIndex,
    absolutePath: collectionViewsIndexPath,
    title: collectionDoc.metadata.title,
    errors,
  });
  officialContentImageCount += rootImageCoverage.officialImageCount;
  mirroredContentImageCount += rootImageCoverage.mirroredImageCount;

  const [rootMeta, layoutMeta] = await Promise.all([
    readFile(path.join(docsDirectory, '_meta.json'), 'utf8').then(JSON.parse),
    readFile(path.join(docsDirectory, 'layouts/_meta.json'), 'utf8').then(
      JSON.parse,
    ),
  ]);
  compareLabels(
    expectedMetaLabels(collectionDoc),
    actualMetaLabels(
      rootMeta,
      localizedLabel(collectionDoc.topicSections[0].title),
    ),
    'Collection Views/_meta.json',
    errors,
  );
  checkCollapsibleGroups(rootMeta, 'Collection Views/_meta.json', errors);
  checkCollapsibleGroups(layoutMeta, 'Layouts/_meta.json', errors);
  compareLabels(
    expectedMetaLabels(layoutsDoc),
    actualMetaLabels(
      layoutMeta,
      localizedLabel(layoutsDoc.topicSections[0].title),
    ),
    'Layouts/_meta.json',
    errors,
  );

  console.log(`Collection Views 직접 항목: ${collectionEntries.length}개`);
  console.log(`Layouts 직접 항목: ${layoutEntries.length}개`);
  console.log(`중복 제외 문서·심볼: ${entriesByURL.size}개`);
  console.log(`심볼 내부 topic section: ${topicSectionCount}개`);
  console.log(
    `심볼 내부 멤버: ${memberOccurrenceCount}건 / 고유 URL ${uniqueMemberURLs.size}개`,
  );
  console.log(`대상 API를 직접 사용하는 심볼 예제: ${symbolExampleCount}개`);
  console.log(
    `공식 본문 이미지: ${officialContentImageCount}장 / 로컬 반영: ${mirroredContentImageCount}장`,
  );
  console.log(
    `본문 보존 대상: article ${richArticleCount}개 / symbol ${richSymbolCount}개`,
  );
  console.log(
    `공식 Swift 예제: ${officialSwiftExampleCount}개 / 로컬 반영: ${mirroredSwiftExampleCount}개`,
  );

  if (errors.length > 0) {
    console.error(`\n누락 또는 불일치 ${errors.length}건:`);
    for (const error of errors) console.error(`- ${error}`);
    process.exitCode = 1;
    return;
  }

  console.log(
    '\nApple DocC 목차·본문 예제·callout·이미지와 Swift-KR 문서가 대응합니다.',
  );
}

await main();
