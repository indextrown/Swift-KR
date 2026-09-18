import { readFile } from 'node:fs/promises';
import path from 'node:path';

const docsDirectory = path.resolve('docs/guide/rxswift');

const expectedGroups = {
  RxSwift: [
    'installation-and-modules',
    'rxswift-core',
    'rxswift-public-contracts',
    'observable-observer-event',
    'disposables-and-resources',
    'schedulers-and-concurrency',
    'subjects-and-traits',
    'debugging-hooks-and-custom-operators',
  ],
  RxCocoa: [
    'rxcocoa',
    'rxcocoa-public-contracts',
    'reactive-binder-control-traits',
    'driver-signal-shared-sequence',
    'uikit-control-bindings',
    'list-bindings-and-delegate-proxy',
    'foundation-bindings',
  ],
  RxRelay: [
    'rxrelay',
    'relay-types-and-replay',
    'relay-state-store-and-concurrency',
  ],
  'Rx 테스트': ['rxtest', 'rxblocking'],
  '모든 연산자': [
    'operators-create-convert',
    'operators-transform-filter',
    'operators-select-time',
    'operators-combine',
    'operators-error-lifecycle',
    'operators-share-connect',
    'operators-traits-deprecated',
  ],
};

// 2026-09-19에 RxSwift 6.10.2 태그의 다섯 제품에서 추출한 공개 타입 중
// 기존 문서에서 이름과 역할이 빠졌던 항목을 페이지별로 추적해요.
const requiredSymbolsByDocument = {
  'rxswift-public-contracts': [
    'Cancelable',
    'CompletableEvent',
    'CompletableTrait',
    'DataDecoder',
    'DisposeBase',
    'HistoricalSchedulerTimeConverter',
    'ImmediateSchedulerType',
    'InfallibleEvent',
    'InfallibleType',
    'MaybeEvent',
    'MaybeTrait',
    'PrimitiveSequenceType',
    'RxAbstractInteger',
    'RxObservable',
    'RxTime',
    'RxTimeInterval',
    'SingleEvent',
    'SingleTrait',
    'SubjectType',
    'VirtualTimeComparison',
    'VirtualTimeConverterType',
    'maxTailRecursiveSinkStackSize',
  ],
  'rxcocoa-public-contracts': [
    'ControlEventType',
    'ControlPropertyType',
    'DelegateProxyType',
    'DidEndDisplayingCellEvent',
    'HasDataSource',
    'HasDelegate',
    'HasPrefetchDataSource',
    'ItemMovedEvent',
    'KeyValueObservingOptions',
    'KVORepresentable',
    'RxCocoaError',
    'RxCocoaInterceptionMechanism',
    'RxCocoaObjCRuntimeError',
    'RxCocoaURLError',
    'RxCollectionViewDataSourceType',
    'RxPickerViewDataSourceProxy',
    'RxPickerViewDataSourceType',
    'RxTableViewDataSourceType',
    'SectionedViewDataSourceType',
    'SharedSequenceConvertibleType',
    'SharingScheduler',
    'SharingStrategyProtocol',
    'SignalSharingStrategy',
    'TextInput',
    'WillDisplayCellEvent',
  ],
  rxtest: [
    'TestableObservable',
    'TestSchedulerVirtualTimeConverter',
    'TestTime',
  ],
};

const metadataPath = path.join(docsDirectory, '_meta.json');
const metadata = JSON.parse(await readFile(metadataPath, 'utf8'));
const failures = [];

const inventory = metadata.find(
  (entry) => entry.link === '/guide/rxswift/official-api-inventory',
);

if (!inventory) {
  failures.push('공식 API 범위와 학습 순서 문서가 사이드바에 없습니다.');
}

for (const [label, slugs] of Object.entries(expectedGroups)) {
  const group = metadata.find((entry) => entry.label === label);

  if (!group) {
    failures.push(`${label} 그룹이 사이드바에 없습니다.`);
    continue;
  }

  if (group.collapsible !== true || group.collapsed !== true) {
    failures.push(`${label} 그룹은 기본으로 닫힌 접이식 목차여야 합니다.`);
  }

  const links = new Set((group.items ?? []).map((item) => item.link));

  for (const slug of slugs) {
    const documentPath = path.join(docsDirectory, `${slug}.md`);
    const content = await readFile(documentPath, 'utf8').catch(() => null);

    if (content === null) {
      failures.push(`${slug}.md 문서가 없습니다.`);
      continue;
    }

    if (!links.has(`/guide/rxswift/${slug}`)) {
      failures.push(
        `${slug}.md 문서가 ${label} 사이드바에 연결되지 않았습니다.`,
      );
    }

    if (!content.includes('description:')) {
      failures.push(`${slug}.md 문서에 description frontmatter가 없습니다.`);
    }
  }
}

for (const [slug, symbols] of Object.entries(requiredSymbolsByDocument)) {
  const documentPath = path.join(docsDirectory, `${slug}.md`);
  const content = await readFile(documentPath, 'utf8').catch(() => '');

  for (const symbol of symbols) {
    if (!content.includes(`\`${symbol}`)) {
      failures.push(`${slug}.md에 ${symbol} 공개 API 설명이 없습니다.`);
    }
  }
}

if (failures.length > 0) {
  console.error(failures.join('\n'));
  process.exitCode = 1;
} else {
  const documentCount = Object.values(expectedGroups).flat().length + 2;
  console.log(
    `Rx 문서 ${documentCount}개의 존재 여부, 기본 닫힘 목차와 공개 API 보충 범위를 확인했습니다.`,
  );
}
