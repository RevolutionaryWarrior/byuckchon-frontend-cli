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
 * React Query 캐시 정책. api-codegen.md 가 `import { cacheConfig } from '@/lib'` 로 쓴다.
 * React · Next 공통. (Next 서버 컴포넌트에서도 import 가능 — React 의존성이 없는 순수 객체)
 */
const CACHE_CONFIG_TS = `/**
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

export async function createFolders(rootDir, config) {
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
  await fs.mkdir(path.join(rootDir, 'src/lib/query'), { recursive: true });
  await writeFile(path.join(rootDir, 'src/lib/query/cacheConfig.ts'), CACHE_CONFIG_TS);
  await writeFile(
    path.join(rootDir, 'src/lib/query/index.ts'),
    "export { cacheConfig } from './cacheConfig';\n",
  );
  await writeFile(
    path.join(rootDir, 'src/lib/index.ts'),
    "export * from './query';\nexport * from './utils';\n",
  );
  await writeFile(path.join(rootDir, 'src/hooks/index.ts'), '// 커스텀 훅\n');
  await writeFile(path.join(rootDir, 'src/components/index.ts'), '// 재사용 가능한 UI 컴포넌트\n');

  if (config.framework === 'react') {
    await writeFile(path.join(rootDir, 'src/store/index.ts'), '// Zustand 스토어\n');
    await writeFile(path.join(rootDir, 'src/api/index.ts'), '// Axios API 호출\n');
    await writeFile(path.join(rootDir, 'src/context/index.tsx'), '// React Context\n');
    await writeFile(path.join(rootDir, 'src/layouts/index.tsx'), '// 레이아웃 컴포넌트\n');
    await writeFile(path.join(rootDir, 'src/pages/index.tsx'), '// 페이지 컴포넌트\n');
  } else {
    await writeFile(path.join(rootDir, 'src/constant/index.ts'), '// 상수 정의\n');
    await writeFile(path.join(rootDir, 'src/providers/index.tsx'), '// 전역 Provider\n');
  }
}
