import fs from 'node:fs/promises';
import path from 'node:path';

import { CACHE_CONFIG_TS, withNextCacheConfig } from './createFolders.js';

/**
 * 모노레포 공용 상수 폴더 packages/constants.
 *
 * 앱마다 따로 두면 어긋나는 값(React Query 캐시 정책 cacheConfig 등)을 여기 모은다.
 * Next 앱이 하나라도 있으면 cacheConfig.ts 에 Next fetch 용 nextCacheConfig 도 넣는다.
 *
 * 워크스페이스 패키지가 아니라 TS 파일만 두는 폴더다. (package.json · tsconfig 없음)
 * 앱은 src/constants/index.ts 에서 상대 경로로 가져와 `@/constants` 로 다시 내보낸다. (createApp.js)
 *
 *   packages/constants/
 *     index.ts
 *     cacheConfig.ts
 */

/** apps/<app>/src/constants/index.ts 에서 packages/constants 까지의 상대 경로 */
export const CONSTANTS_IMPORT_FROM_APP = '../../../../packages/constants';

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
