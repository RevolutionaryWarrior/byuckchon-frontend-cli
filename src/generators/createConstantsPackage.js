import fs from 'node:fs/promises';
import path from 'node:path';

import { versions } from '../constants/versions.js';
import { cacheConfigTs } from './createFolders.js';

/**
 * 모노레포 공용 상수 패키지 packages/constants (`@<scope>/constants`).
 *
 * 앱마다 따로 두면 어긋나는 값(React Query 캐시 정책 cacheConfig 등)을 여기 모은다.
 * Next 앱이 하나라도 있으면 cacheConfig 의 tier 마다 Next fetch 용 revalidate(초)를 넣는다.
 * 빌드 없이 TS 소스를 그대로 export 한다.
 *  - Vite 앱은 워크스페이스 링크를 소스로 처리하므로 설정이 필요 없다.
 *  - Next 앱은 next.config.ts 의 transpilePackages 에 이 패키지를 넣는다. (createApp.js)
 *
 *   packages/constants/
 *     package.json
 *     tsconfig.json
 *     eslint.config.mjs
 *     src/cacheConfig.ts
 *     src/index.ts
 */

export function constantsPackageName(scope) {
  return `@${scope}/constants`;
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
 * packages/constants 가 없으면 만든다. 이미 있으면 건드리지 않는다.
 * 단, revalidate 가 필요한데 cacheConfig.ts 가 생성 당시 그대로면 revalidate 가 들어간 내용으로 바꾼다.
 *
 * @param {string} root  모노레포 루트
 * @param {string} scope npm scope
 * @param {object} [options]
 * @param {boolean} [options.revalidate] 모노레포에 Next 앱이 하나라도 있는지
 * @returns {Promise<{
 *   name: string,
 *   created: boolean,
 *   hasCacheConfig: boolean,
 *   revalidate: 'none' | 'present' | 'added' | 'manual',
 * }>}
 *   hasCacheConfig: 기존 패키지에 src/cacheConfig.ts 가 있는지 (새로 만들면 항상 true)
 *   revalidate: none(필요 없음) · present(이미 있음 · 새로 만듦) · added(이번에 넣음)
 *               · manual(파일이 수정돼 있어 자동으로 못 넣음)
 */
export async function ensureConstantsPackage(root, scope, { revalidate = false } = {}) {
  const name = constantsPackageName(scope);
  const dir = path.join(root, 'packages', 'constants');
  const cacheConfigFile = path.join(dir, 'src', 'cacheConfig.ts');

  if (await exists(dir)) {
    const hasCacheConfig = await exists(cacheConfigFile);
    return {
      name,
      created: false,
      hasCacheConfig,
      revalidate:
        revalidate && hasCacheConfig ? await addRevalidate(cacheConfigFile) : 'none',
    };
  }

  await fs.mkdir(path.join(dir, 'src'), { recursive: true });

  await write(
    path.join(dir, 'package.json'),
    JSON.stringify(
      {
        name,
        version: '0.0.0',
        private: true,
        type: 'module',
        description: '앱들이 함께 쓰는 상수 (cacheConfig 등). 빌드 없이 TS 소스를 export 한다.',
        exports: {
          '.': './src/index.ts',
        },
        scripts: {
          typecheck: 'tsc --noEmit',
          lint: 'eslint .',
          clean: 'rm -rf node_modules .turbo',
        },
        devDependencies: {
          [`@${scope}/config-eslint`]: 'workspace:*',
          [`@${scope}/config-typescript`]: 'workspace:*',
          eslint: versions.eslint,
          typescript: versions.typescript,
        },
      },
      null,
      2,
    ) + '\n',
  );

  await write(
    path.join(dir, 'tsconfig.json'),
    JSON.stringify(
      {
        extends: `@${scope}/config-typescript/base.json`,
        include: ['src'],
      },
      null,
      2,
    ) + '\n',
  );

  await write(
    path.join(dir, 'eslint.config.mjs'),
    `export { default } from '@${scope}/config-eslint/base';\n`,
  );

  await write(cacheConfigFile, cacheConfigTs({ revalidate }));
  await write(
    path.join(dir, 'src', 'index.ts'),
    "export { cacheConfig } from './cacheConfig';\n",
  );

  return { name, created: true, hasCacheConfig: true, revalidate: revalidate ? 'present' : 'none' };
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
