import fs from 'fs/promises';
import path from 'path';

/**
 * React 폴더 구조
 * lib → store → api → hooks → context → components → layouts → pages
 * assets · constants 는 모든 레이어에서 참조 가능
 */
const REACT_FOLDERS = [
  'public',
  'src/assets',
  'src/assets/icons',
  'src/assets/images',
  'src/constants',
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
  'src/constants',
  'src/hooks',
  'src/lib',
  'src/lib/utils',
  'src/providers',
];

/**
 * React Query 캐시 정책. src/constants/cacheConfig.ts 로 만들고,
 * api-codegen.md 가 `import { cacheConfig } from '@/constants'` 로 쓴다.
 * React · Next 공통. (Next 서버 컴포넌트에서도 import 가능 — React 의존성이 없는 순수 객체)
 * 모노레포에서는 앱이 아니라 packages/constants 에 둔다. → createConstants.js
 */
export const CACHE_CONFIG_TS = `/**
 * React Query 캐시 정책. 조회 훅에서 \`...cacheConfig.<tier>\` 로 펼쳐 씁니다.
 *
 *   useQuery({ queryKey, queryFn, ...cacheConfig.longLived });
 *
 * - 단위는 ms 입니다. Next 의 fetch \`next: { revalidate }\`(초 단위)와는 별개이니 섞지 마세요.
 * - Next 서버 컴포넌트에서 prefetchQuery 할 때는 staleTime 만 넘기세요.
 *   서버의 gcTime 기본값은 Infinity(요청이 끝나면 정리)라서, gcTime 을 넣으면
 *   그 시간만큼 서버 메모리에 캐시가 남습니다.
 *     queryClient.prefetchQuery({ queryKey, queryFn, staleTime: cacheConfig.longLived.staleTime });
 */
export const cacheConfig = Object.freeze({
  realtime: Object.freeze({
    staleTime: 0,
    gcTime: 1000 * 60 * 5,
  }),
  shortLived: Object.freeze({
    staleTime: 1000 * 60,
    gcTime: 1000 * 60 * 10,
  }),
  mediumLived: Object.freeze({
    staleTime: 1000 * 60 * 3,
    gcTime: 1000 * 60 * 15,
  }),
  longLived: Object.freeze({
    staleTime: 1000 * 60 * 30,
    gcTime: 1000 * 60 * 60,
  }),
  immutable: Object.freeze({
    staleTime: Infinity,
    gcTime: 1000 * 60 * 60 * 24,
  }),
});
`;

async function writeFile(filePath, content) {
  await fs.writeFile(filePath, content, 'utf-8');
}

/**
 * @param {string} rootDir
 * @param {object} config
 * @param {object} [options]
 * @param {string} [options.constantsFrom] src/constants/index.ts 기준으로 공용 상수를 가져올 경로.
 *   주면 앱에 cacheConfig.ts 를 만들지 않고, `@/constants` 에서 그 경로의 export 를 모두 다시 내보낸다.
 *   (모노레포: 루트의 packages/constants — cacheConfig, Next 앱이 있으면 nextCacheConfig)
 */
export async function createFolders(rootDir, config, { constantsFrom } = {}) {
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
  await writeFile(path.join(rootDir, 'src/lib/index.ts'), "export * from './utils';\n");

  if (constantsFrom) {
    // 캐시 정책은 앱끼리 같아야 하므로 공용 폴더가 갖고, 앱은 `@/constants` 로 다시 내보내기만 한다.
    await writeFile(
      path.join(rootDir, 'src/constants/index.ts'),
      `// cacheConfig · nextCacheConfig 는 모노레포 루트의 packages/constants 가 관리합니다.
// 값을 바꾸면 모든 앱에 반영됩니다. 이 앱에서만 쓰는 상수는 이 폴더에 두고 아래에 export 하세요.
export * from '${constantsFrom}';
`,
    );
  } else {
    await writeFile(path.join(rootDir, 'src/constants/cacheConfig.ts'), CACHE_CONFIG_TS);
    await writeFile(
      path.join(rootDir, 'src/constants/index.ts'),
      "export * from './cacheConfig';\n",
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
    await writeFile(path.join(rootDir, 'src/providers/index.tsx'), '// 전역 Provider\n');
  }
}
