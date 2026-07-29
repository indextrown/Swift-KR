import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

const docsDirectory = path.resolve('docs/guide/rxswift');

// RxSwift 6.10.2 공개 심볼에서 ObservableType, ConnectableObservableType,
// 비동기 브리지와 PrimitiveSequence 전용 이름을 추출한 목록이에요.
const expectedOperators = [
  'amb',
  'andThen',
  'asCompletable',
  'asInfallible',
  'asMaybe',
  'asObservable',
  'asSingle',
  'buffer',
  'catch',
  'catchAndReturn',
  'catchError',
  'catchErrorJustReturn',
  'combineLatest',
  'compactMap',
  'concat',
  'concatMap',
  'connect',
  'create',
  'debounce',
  'debug',
  'decode',
  'deferred',
  'delay',
  'delaySubscription',
  'dematerialize',
  'distinctUntilChanged',
  'do',
  'element',
  'elementAt',
  'empty',
  'enumerated',
  'error',
  'filter',
  'first',
  'flatMap',
  'flatMapCompletable',
  'flatMapFirst',
  'flatMapLatest',
  'flatMapMaybe',
  'from',
  'generate',
  'groupBy',
  'ifEmpty',
  'ignoreElements',
  'interval',
  'just',
  'map',
  'materialize',
  'merge',
  'multicast',
  'never',
  'observe',
  'observeOn',
  'of',
  'publish',
  'range',
  'reduce',
  'refCount',
  'repeatElement',
  'replay',
  'replayAll',
  'retry',
  'retryWhen',
  'sample',
  'scan',
  'share',
  'single',
  'skip',
  'skipUntil',
  'skipWhile',
  'startWith',
  'subscribe',
  'subscribeOn',
  'switchLatest',
  'take',
  'takeLast',
  'takeUntil',
  'takeWhile',
  'throttle',
  'timeout',
  'timer',
  'toArray',
  'using',
  'value',
  'values',
  'window',
  'withLatestFrom',
  'withUnretained',
  'zip',
];

const files = (await readdir(docsDirectory))
  .filter((name) => name.endsWith('.md'))
  .map((name) => path.join(docsDirectory, name));

const contents = await Promise.all(files.map((file) => readFile(file, 'utf8')));
const combined = contents.join('\n');
const missing = expectedOperators.filter(
  (name) => !combined.includes(`<!-- rxswift-operator: ${name} -->`),
);

if (missing.length > 0) {
  console.error(`설명하지 않은 RxSwift 연산자: ${missing.join(', ')}`);
  process.exitCode = 1;
} else {
  console.log(
    `RxSwift 공개 연산자 ${expectedOperators.length}개의 설명 표식을 모두 확인했습니다.`,
  );
}
