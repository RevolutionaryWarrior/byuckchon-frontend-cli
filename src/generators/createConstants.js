import fs from 'node:fs/promises';
import path from 'node:path';

import { cacheConfigTs } from './createFolders.js';

/**
 * 모노레포 공용 상수 폴더 packages/constants.
 *
 * 앱마다 따로 두면 어긋나는 값(React Query 캐시 정책 cacheConfig 등)을 여기 모은다.
 * Next 앱이 하나라도 있으면 cacheConfig 의 tier 마다 Next fetch 용 revalidate(초)를 넣는다.
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
 * packages/constants 가 없으면 만든다. 이미 있으면 건드리지 않는다.
 * 단, revalidate 가 필요한데 cacheConfig.ts 가 생성 당시 그대로면 revalidate 가 들어간 내용으로 바꾼다.
 *
 * @param {string} root 모노레포 루트
 * @param {object} [options]
 * @param {boolean} [options.revalidate] 모노레포에 Next 앱이 하나라도 있는지
 * @returns {Promise<{
 *   created: boolean,
 *   hasCacheConfig: boolean,
 *   revalidate: 'none' | 'present' | 'added' | 'manual',
 * }>}
 *   hasCacheConfig: 기존 폴더에 cacheConfig.ts 가 있는지 (새로 만들면 항상 true)
 *   revalidate: none(필요 없음) · present(이미 있음 · 새로 만듦) · added(이번에 넣음)
 *               · manual(파일이 수정돼 있어 자동으로 못 넣음)
 */
export async function ensureConstants(root, { revalidate = false } = {}) {
  const dir = path.join(root, 'packages', 'constants');
  const cacheConfigFile = path.join(dir, 'cacheConfig.ts');

  if (await exists(dir)) {
    const hasCacheConfig = await exists(cacheConfigFile);
    return {
      created: false,
      hasCacheConfig,
      revalidate:
        revalidate && hasCacheConfig ? await addRevalidate(cacheConfigFile) : 'none',
    };
  }

  await fs.mkdir(dir, { recursive: true });
  await write(cacheConfigFile, cacheConfigTs({ revalidate }));
  await write(path.join(dir, 'index.ts'), "export { cacheConfig } from './cacheConfig';\n");

  return { created: true, hasCacheConfig: true, revalidate: revalidate ? 'present' : 'none' };
}

/**
 * 기존 cacheConfig.ts 에 revalidate 를 넣는다.
 * 사람이 고친 파일은 어디에 어떤 값을 넣어야 할지 모르므로, 생성 당시 그대로일 때만 바꾼다.
 */
async function addRevalidate(file) {
  const source = await fs.readFile(file, 'utf8');
  if (/^\s*revalidate\s*:/m.test(source)) return 'present';
  if (source !== cacheConfigTs()) return 'manual';
  await write(file, cacheConfigTs({ revalidate: true }));
  return 'added';
}
