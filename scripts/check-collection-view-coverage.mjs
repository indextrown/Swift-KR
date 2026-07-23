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
    headingTitles: [],
    swiftCodeCount: 0,
    asideCount: 0,
    listCount: 0,
    listItemCount: 0,
    tableCount: 0,
  };

  function hasProse(value) {
    if (Array.isArray(value)) {
      return value.some(hasProse);
    }
    if (!value || typeof value !== 'object') return false;
    if (
      value.type === 'text' ||
      value.type === 'reference' ||
      value.type === 'codeVoice'
    ) {
      return true;
    }
    if (value.type === 'image') return false;
    return Object.values(value).some(hasProse);
  }

  function visit(value, container = 'root') {
    if (Array.isArray(value)) {
      value.forEach((item) => visit(item, container));
      return;
    }
    if (!value || typeof value !== 'object') return;

    if (
      value.type === 'paragraph' &&
      container === 'root' &&
      hasProse(value.inlineContent)
    ) {
      metrics.paragraphCount += 1;
    }
    if (value.type === 'heading') {
      metrics.headingCount += 1;
      metrics.headingTitles.push(value.text);
    }
    if (value.type === 'codeListing' && value.syntax === 'swift') {
      metrics.swiftCodeCount += 1;
    }
    if (value.type === 'aside') metrics.asideCount += 1;
    if (value.type === 'unorderedList' || value.type === 'orderedList') {
      metrics.listCount += 1;
      metrics.listItemCount += value.items?.length ?? 0;
    }
    if (value.type === 'table') metrics.tableCount += 1;

    let childContainer = container;
    if (value.type === 'unorderedList' || value.type === 'orderedList') {
      childContainer = 'list';
    } else if (value.type === 'table') {
      childContainer = 'table';
    } else if (value.type === 'aside') {
      childContainer = 'aside';
    }

    Object.values(value).forEach((child) => visit(child, childContainer));
  }

  visit(doc.primaryContentSections ?? []);
  return metrics;
}

function officialBodyFromLocal(content) {
  const start = content.match(
    /^## (?:개요|설명) \((?:Overview|Discussion)\)$/m,
  );
  if (!start || start.index === undefined) return '';

  const bodyStart = start.index;
  const afterStart = content.slice(bodyStart + start[0].length);
  const end = afterStart.match(
    /^## (?:Swift-KR 보충:|선언과 지원 범위를 확인해요|공식 API 목차대로 살펴봐요|참고 자료)/m,
  );
  const bodyEnd =
    end && end.index !== undefined
      ? bodyStart + start[0].length + end.index
      : content.length;

  return content.slice(bodyStart, bodyEnd);
}

function officialSwiftCodeListings(doc) {
  const listings = [];

  function visit(value) {
    if (Array.isArray(value)) {
      value.forEach(visit);
      return;
    }
    if (!value || typeof value !== 'object') return;

    if (value.type === 'codeListing' && value.syntax === 'swift') {
      listings.push((value.code ?? []).join('\n'));
    }
    Object.values(value).forEach(visit);
  }

  visit(doc.primaryContentSections ?? []);
  return listings;
}

function localSwiftCodeListings(content) {
  return [...content.matchAll(/^```swift\n([\s\S]*?)^```$/gm)].map(
    (match) => match[1],
  );
}

function normalizeCode(content) {
  return content
    .split('\n')
    .map((line) => line.trimEnd())
    .join('\n')
    .trim();
}

function localBodyMetrics(content, subtractDeclaration = false) {
  const swiftCodeCount = content.match(/^```swift$/gm)?.length ?? 0;
  const metrics = {
    paragraphCount: 0,
    headingCount: content.match(/^#{2,6} /gm)?.length ?? 0,
    headingTitles:
      content
        .match(/^#{2,6} (.+)$/gm)
        ?.map((line) => line.replace(/^#{2,6} /, '').trim()) ?? [],
    swiftCodeCount: subtractDeclaration
      ? Math.max(0, swiftCodeCount - 1)
      : swiftCodeCount,
    asideCount:
      content.match(/^> \*\*(?!면접 답변 한 줄 요약:)/gm)?.length ?? 0,
    listCount: 0,
    listItemCount: 0,
    tableCount: 0,
  };

  let inCode = false;
  let inParagraph = false;
  let inList = false;
  let inTable = false;

  for (const line of content.split('\n')) {
    if (line.startsWith('```')) {
      inCode = !inCode;
      inParagraph = false;
      inList = false;
      inTable = false;
      continue;
    }
    if (inCode) continue;

    const trimmed = line.trim();
    const isListItem = /^(?:[-+*]|\d+\.)\s+/.test(trimmed);
    const isTableLine = /^\|.*\|$/.test(trimmed);

    if (isListItem) {
      metrics.listItemCount += 1;
      if (!inList) metrics.listCount += 1;
      inList = true;
      inParagraph = false;
      inTable = false;
      continue;
    }
    inList = false;

    if (isTableLine) {
      if (!inTable) metrics.tableCount += 1;
      inTable = true;
      inParagraph = false;
      continue;
    }
    inTable = false;

    if (
      trimmed.length === 0 ||
      /^#{1,6} /.test(trimmed) ||
      /^> /.test(trimmed) ||
      /^<!--/.test(trimmed) ||
      /^!\[/.test(trimmed)
    ) {
      inParagraph = false;
      continue;
    }

    if (!inParagraph) metrics.paragraphCount += 1;
    inParagraph = true;
  }

  return metrics;
}

function checkBodyFidelity({ doc, content, entry, localPath, errors }) {
  const official = officialBodyMetrics(doc);
  const isRichSymbol =
    entry.ref.kind === 'symbol' &&
    (official.paragraphCount >= 4 || official.swiftCodeCount > 0);
  const isRichArticle =
    entry.ref.kind !== 'symbol' &&
    (official.paragraphCount >= 8 || official.swiftCodeCount >= 2);
  const localOfficialBody =
    isRichSymbol || isRichArticle ? officialBodyFromLocal(content) : content;
  const local = localBodyMetrics(
    localOfficialBody,
    entry.ref.kind === 'symbol' && !isRichSymbol,
  );

  if (isRichSymbol || isRichArticle) {
    if (localOfficialBody.length === 0) {
      errors.push(
        `${entry.ref.title}: 설명이 풍부한 공식 문서인데 개요·설명 본문이 없습니다. (${localPath})`,
      );
    }

    const structuralMetrics = [
      ['headingCount', 'heading'],
      ['paragraphCount', '본문 문단'],
      ['listCount', '목록'],
      ['listItemCount', '목록 항목'],
      ['tableCount', '표'],
      ['asideCount', 'note/important'],
      ['swiftCodeCount', 'Swift 예제'],
    ];
    for (const [key, label] of structuralMetrics) {
      if (official[key] > local[key]) {
        errors.push(
          `${entry.ref.title}: 공식 ${label} 구조가 줄었습니다. ` +
            `(공식 ${official[key]}개, 로컬 공식 본문 ${local[key]}개)`,
        );
      }
    }

    for (const heading of official.headingTitles) {
      if (
        !local.headingTitles.some((localHeading) =>
          localHeading.includes(heading),
        )
      ) {
        errors.push(
          `${entry.ref.title}: 공식 본문 제목 "${heading}"이 로컬 공식 본문에 없습니다.`,
        );
      }
    }
    const officialCodeListings = officialSwiftCodeListings(doc);
    const localCodeListings = localSwiftCodeListings(localOfficialBody);
    for (const [index, officialCode] of officialCodeListings.entries()) {
      if (
        normalizeCode(officialCode) !==
        normalizeCode(localCodeListings[index] ?? '')
      ) {
        errors.push(
          `${entry.ref.title}: 공식 Swift 예제 ${index + 1}번의 내용이나 순서가 달라졌습니다.`,
        );
      }
    }
  } else {
    if (official.swiftCodeCount > local.swiftCodeCount) {
      errors.push(
        `${entry.ref.title}: 공식 Swift 예제가 줄었습니다. ` +
          `(공식 ${official.swiftCodeCount}개, 로컬 ${local.swiftCodeCount}개)`,
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
      const exampleSection =
        content.split(
          /^## (?:Swift-KR 보충: )?가장 작은 사용 예제(?: \(Swift-KR 보충\))?$/m,
        )[1] ?? '';
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
