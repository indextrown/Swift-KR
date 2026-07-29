import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

const docsDirectory = path.resolve('docs/guide/combine');

// Apple Publisher DocC의 연산자 이름과 ConnectablePublisher.autoconnect()을
// 이름 단위로 관리해 오버로드를 한 항목에서 함께 설명할 수 있게 해요.
const expectedOperators = [
  'allSatisfy',
  'append',
  'assertNoFailure',
  'assign',
  'autoconnect',
  'breakpoint',
  'breakpointOnError',
  'buffer',
  'catch',
  'collect',
  'combineLatest',
  'compactMap',
  'contains',
  'count',
  'debounce',
  'decode',
  'delay',
  'drop',
  'dropFirst',
  'encode',
  'eraseToAnyPublisher',
  'filter',
  'first',
  'flatMap',
  'handleEvents',
  'ignoreOutput',
  'last',
  'makeConnectable',
  'map',
  'mapError',
  'max',
  'measureInterval',
  'merge',
  'min',
  'multicast',
  'output',
  'prefix',
  'prepend',
  'print',
  'receive',
  'reduce',
  'removeDuplicates',
  'replaceEmpty',
  'replaceError',
  'replaceNil',
  'retry',
  'scan',
  'setFailureType',
  'share',
  'sink',
  'subscribe',
  'switchToLatest',
  'throttle',
  'timeout',
  'tryAllSatisfy',
  'tryCatch',
  'tryCompactMap',
  'tryContains',
  'tryDrop',
  'tryFilter',
  'tryFirst',
  'tryLast',
  'tryMap',
  'tryMax',
  'tryMin',
  'tryPrefix',
  'tryReduce',
  'tryRemoveDuplicates',
  'tryScan',
  'zip',
];

const files = (await readdir(docsDirectory))
  .filter((name) => name.endsWith('.md'))
  .map((name) => path.join(docsDirectory, name));

const contents = await Promise.all(files.map((file) => readFile(file, 'utf8')));
const combined = contents.join('\n');
const missing = expectedOperators.filter(
  (name) => !combined.includes(`<!-- combine-operator: ${name} -->`),
);

if (missing.length > 0) {
  console.error(`설명하지 않은 Combine 연산자: ${missing.join(', ')}`);
  process.exitCode = 1;
} else {
  console.log(
    `Combine 연산자 ${expectedOperators.length}개의 설명 표식을 모두 확인했습니다.`,
  );
}
