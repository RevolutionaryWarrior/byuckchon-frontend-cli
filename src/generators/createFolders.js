import fs from 'fs/promises';
import path from 'path';

/**
 * React 폴더 구조
 * lib → store → api → hooks → context → components → layouts → pages
 * assets는 모든 레이어에서 참조 가능
 */
const REACT_FOLDERS = [
  'public',
  'src/assets',
  'src/assets/icons',
  'src/assets/images',
  'src/lib',
  'src/lib/utils',
  'src/store',
  'src/api',
  'src/hooks',
  'src/context',
  'src/components',
  'src/layouts',
  'src/pages',
];

/**
 * Next.js App Router 폴더 구조
 */
const NEXT_FOLDERS = [
  'public',
  'src/app',
  'src/api',
  'src/assets',
  'src/assets/common',
  'src/assets/pages',
  'src/components',
  'src/constant',
  'src/hooks',
  'src/lib',
  'src/lib/utils',
  'src/providers',
];

/**
 * 캐시 tier. staleTime · gcTime 은 React Query 용(ms), revalidate 는 Next fetch 용(초).
 * revalidate 는 같은 tier 의 staleTime 과 같은 시간이다. (Infinity → false: 무기한 캐시)
 */
const CACHE_TIERS = [
  { name: 'realtime', staleTime: '0', gcTime: '1000 * 60 * 5', revalidate: '0' },
  { name: 'shortLived', staleTime: '1000 * 60', gcTime: '1000 * 60 * 10', revalidate: '60' },
  { name: 'mediumLived', staleTime: '1000 * 60 * 3', gcTime: '1000 * 60 * 15', revalidate: '60 * 3' },
  { name: 'longLived', staleTime: '1000 * 60 * 30', gcTime: '1000 * 60 * 60', revalidate: '60 * 30' },
  { name: 'immutable', staleTime: 'Infinity', gcTime: '1000 * 60 * 60 * 24', revalidate: 'false' },
];

/**
 * cacheConfig.ts 내용. api-codegen.md 가 `import { cacheConfig } from '@/lib'` 로 쓴다.
 * React · Next 공통. (Next 서버 컴포넌트에서도 import 가능 — React 의존성이 없는 순수 객체)
 * 모노레포에서는 앱이 아니라 packages/constants 에 둔다. → createConstantsPackage.js
 *
 * @param {object} [options]
 * @param {boolean} [options.revalidate] tier 마다 Next fetch 용 revalidate(초)를 넣을지.
 *   모노레포에 Next 앱이 하나라도 있으면 true.
 */
export function cacheConfigTs({ revalidate = false } = {}) {
  const unitDoc = revalidate
    ? ` * - staleTime · gcTime 은 React Query 용이고 단위는 ms 입니다.
 * - revalidate 는 Next fetch 용이고 단위는 초입니다. 같은 tier 의 staleTime 과 같은 시간입니다.
 *     fetch(url, { next: { revalidate: cacheConfig.longLived.revalidate } });
 *   0 은 캐시하지 않고, false 는 무기한 캐시합니다. (useQuery 에 펼치면 React Query 는 무시합니다)
`
    : ` * - 단위는 ms 입니다. Next 의 fetch \`next: { revalidate }\`(초 단위)와는 별개이니 섞지 마세요.
`;

  const tiers = CACHE_TIERS.map(
    (tier) => `  ${tier.name}: Object.freeze({
    staleTime: ${tier.staleTime},
    gcTime: ${tier.gcTime},
${revalidate ? `    revalidate: ${tier.revalidate},\n` : ''}  }),
`,
  ).join('');

  return `/**
 * ${revalidate ? '' : 'React Query '}캐시 정책. 조회 훅에서 \`...cacheConfig.<tier>\` 로 펼쳐 씁니다.
 *
 *   useQuery({ queryKey, queryFn, ...cacheConfig.longLived });
 *
${unitDoc} * - Next 서버 컴포넌트에서 prefetchQuery 할 때는 staleTime 만 넘기세요.
 *   서버의 gcTime 기본값은 Infinity(요청이 끝나면 정리)라서, gcTime 을 넣으면
 *   그 시간만큼 서버 메모리에 캐시가 남습니다.
 *     queryClient.prefetchQuery({ queryKey, queryFn, staleTime: cacheConfig.longLived.staleTime });
 */
export const cacheConfig = Object.freeze({
${tiers}});
`;
}

async function writeFile(filePath, content) {
  await fs.writeFile(filePath, content, 'utf-8');
}

/**
 * @param {string} rootDir
 * @param {object} config
 * @param {object} [options]
 * @param {string} [options.cacheConfigFrom] cacheConfig 를 가져올 패키지 이름.
 *   주면 앱에 src/lib/query 를 만들지 않고, `@/lib` 에서 그 패키지의 cacheConfig 를 다시 내보낸다.
 *   (모노레포: `@<scope>/constants`)
 */
export async function createFolders(rootDir, config, { cacheConfigFrom } = {}) {
  const folders =
    config.framework === 'react' ? REACT_FOLDERS : NEXT_FOLDERS;

  for (const folder of folders) {
    await fs.mkdir(path.join(rootDir, folder), { recursive: true });
  }

  // 각 레이어에 placeholder 파일 생성
  await writeFile(
    path.join(rootDir, 'src/lib/utils/cn.ts'),
    `// 클래스 병합은 @byuckchon-frontend/utils 가 관리합니다.
// twMerge 기본 설정은 타이포그래피 유틸(text-body-sm-regular 등)을 글자 색으로 분류해서
// 색과 함께 쓰면 타이포가 조용히 사라집니다. utils 의 cn 은 그 부분을 고쳐둔 것입니다.
//
// 토큰 이름 체계가 기본 패턴과 다르면 createCn 으로 직접 지정하세요.
//   import { createCn } from '@byuckchon-frontend/utils';
//   export const cn = createCn({ typography: ['tab-bar', 'subtitle'] });
export { cn } from '@byuckchon-frontend/utils';
`,
  );
  await writeFile(
    path.join(rootDir, 'src/lib/utils/index.ts'),
    "export { cn } from './cn';\n",
  );
  if (cacheConfigFrom) {
    // 캐시 정책은 앱끼리 같아야 하므로 공용 패키지가 갖고, 앱은 `@/lib` 로 다시 내보내기만 한다.
    await writeFile(
      path.join(rootDir, 'src/lib/index.ts'),
      `// cacheConfig 는 packages/constants 가 관리합니다. 값을 바꾸면 모든 앱에 반영됩니다.
export { cacheConfig } from '${cacheConfigFrom}';
export * from './utils';
`,
    );
  } else {
    await fs.mkdir(path.join(rootDir, 'src/lib/query'), { recursive: true });
    await writeFile(path.join(rootDir, 'src/lib/query/cacheConfig.ts'), cacheConfigTs());
    await writeFile(
      path.join(rootDir, 'src/lib/query/index.ts'),
      "export { cacheConfig } from './cacheConfig';\n",
    );
    await writeFile(
      path.join(rootDir, 'src/lib/index.ts'),
      "export * from './query';\nexport * from './utils';\n",
    );
  }
  await writeFile(path.join(rootDir, 'src/hooks/index.ts'), '// 커스텀 훅\n');
  await writeFile(path.join(rootDir, 'src/components/index.ts'), '// 재사용 가능한 UI 컴포넌트\n');

  if (config.framework === 'react') {
    await writeFile(path.join(rootDir, 'src/store/index.ts'), '// Zustand 스토어\n');
    await writeFile(path.join(rootDir, 'src/api/index.ts'), '// Axios API 호출\n');
    await writeFile(path.join(rootDir, 'src/context/index.tsx'), '// React Context\n');
    await writeFile(path.join(rootDir, 'src/layouts/index.tsx'), '// 레이아웃 컴포넌트\n');
    await writeFile(path.join(rootDir, 'src/pages/index.tsx'), '// 페이지 컴포넌트\n');
  } else {
    await writeFile(path.join(rootDir, 'src/api/index.ts'), '// API 호출\n');
    await writeFile(path.join(rootDir, 'src/constant/index.ts'), '// 상수 정의\n');
    await writeFile(path.join(rootDir, 'src/providers/index.tsx'), '// 전역 Provider\n');
  }
}
