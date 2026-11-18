import fs from 'node:fs/promises';
import path from 'node:path';

import { CACHE_CONFIG_TS } from './createFolders.js';

/**
 * 모노레포 공용 상수 폴더 packages/constants.
 *
 * 앱마다 따로 두면 어긋나는 값(React Query 캐시 정책 cacheConfig 등)을 여기 모은다.
 * Next 앱이 하나라도 있으면 cacheConfig.ts 에 Next fetch 용 nextCacheConfig 도 넣는다.
 *
 * 워크스페이스 패키지가 아니라 TS 파일만 두는 폴더다. (package.json · tsconfig 없음)
 * 앱은 src/lib/index.ts 에서 상대 경로로 가져와 `@/lib` 로 다시 내보낸다. (createApp.js)
 *
 *   packages/constants/
 *     index.ts
 *     cacheConfig.ts
 */

/** apps/<app>/src/lib/index.ts 에서 packages/constants 까지의 상대 경로 */
export const CONSTANTS_IMPORT_FROM_APP_LIB = '../../../../packages/constants';

/**
 * Next fetch 캐시 정책. cacheConfig 와 같은 tier 이름 · 같은 시간이다.
 * fetch 옵션에 그대로 펼쳐 쓰도록 RequestInit 모양으로 둔다.
 */
const NEXT_CACHE_CONFIG_TS = `/**
 * Next fetch 캐시 정책. fetch 옵션에 \`...nextCacheConfig.<tier>\` 로 펼쳐 씁니다.
 *
 *   fetch(url, { ...nextCacheConfig.longLived });
 *
 * - tier 이름과 시간은 cacheConfig 의 staleTime 과 같습니다. revalidate 단위는 초입니다.
 * - 페이지 · 레이아웃의 \`export const revalidate\` 에는 쓸 수 없습니다.
 *   Next 가 빌드 때 그 값을 직접 읽어서, 다른 파일에서 가져온 값이면 빌드가 실패합니다. 숫자를 직접 쓰세요.
 */
export const nextCacheConfig = Object.freeze({
  realtime: Object.freeze({ cache: 'no-store' as const }),
  shortLived: Object.freeze({ next: { revalidate: 60 } }),
  mediumLived: Object.freeze({ next: { revalidate: 60 * 3 } }),
  longLived: Object.freeze({ next: { revalidate: 60 * 30 } }),
  immutable: Object.freeze({ next: { revalidate: false as const } }),
});
`;

/** cacheConfig.ts 내용 끝에 nextCacheConfig 를 붙인다. */
function withNextCacheConfig(source) {
  return `${source.trimEnd()}\n\n${NEXT_CACHE_CONFIG_TS}`;
}

async function exists(p) {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

async function write(filePath, content) {
  await fs.writeFile(filePath, content, 'utf-8');
}

/**
 * packages/constants 가 없으면 만든다. 이미 있으면 기존 내용은 건드리지 않는다.
 * 단, Next 앱이 있는데 cacheConfig.ts 에 nextCacheConfig 가 없으면 파일 끝에 붙인다.
 * (cacheConfig 를 수정해 뒀어도 별도 export 를 덧붙이기만 하므로 안전하다)
 *
 * @param {string} root 모노레포 루트
 * @param {object} [options]
 * @param {boolean} [options.next] 모노레포에 Next 앱이 하나라도 있는지
 * @returns {Promise<{
 *   created: boolean,
 *   hasCacheConfig: boolean,
 *   nextCache: 'none' | 'present' | 'added',
 *   nextCacheExported: boolean,
 * }>}
 *   hasCacheConfig: 기존 폴더에 cacheConfig.ts 가 있는지 (새로 만들면 항상 true)
 *   nextCache: none(필요 없음) · present(이미 있음 · 새로 만듦) · added(이번에 붙임)
 *   nextCacheExported: index.ts 가 nextCacheConfig 를 내보내는지 (nextCache 가 none 이면 true)
 */
export async function ensureConstants(root, { next = false } = {}) {
  const dir = path.join(root, 'packages', 'constants');
  const cacheConfigFile = path.join(dir, 'cacheConfig.ts');
  const indexFile = path.join(dir, 'index.ts');

  if (!(await exists(dir))) {
    await fs.mkdir(dir, { recursive: true });
    await write(cacheConfigFile, next ? withNextCacheConfig(CACHE_CONFIG_TS) : CACHE_CONFIG_TS);
    // export * 라서 nextCacheConfig 가 나중에 붙어도 index.ts 는 고칠 필요가 없다.
    await write(indexFile, "export * from './cacheConfig';\n");
    return {
      created: true,
      hasCacheConfig: true,
      nextCache: next ? 'present' : 'none',
      nextCacheExported: true,
    };
  }

  const hasCacheConfig = await exists(cacheConfigFile);
  if (!next || !hasCacheConfig) {
    return { created: false, hasCacheConfig, nextCache: 'none', nextCacheExported: true };
  }

  const source = await fs.readFile(cacheConfigFile, 'utf8');
  let nextCache = 'present';
  if (!/\bnextCacheConfig\b/.test(source)) {
    await write(cacheConfigFile, withNextCacheConfig(source));
    nextCache = 'added';
  }

  const index = (await exists(indexFile)) ? await fs.readFile(indexFile, 'utf8') : '';
  const nextCacheExported =
    /export\s*\*\s*from\s*['"]\.\/cacheConfig['"]/.test(index) || /\bnextCacheConfig\b/.test(index);

  return { created: false, hasCacheConfig, nextCache, nextCacheExported };
}
