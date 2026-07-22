import fs from 'node:fs/promises';
import path from 'node:path';

import { versions } from '../constants/versions.js';
import { createFolders } from './createFolders.js';
import { createBaseFiles } from './createBaseFiles.js';
import { createBcConfig } from './createBcConfig.js';
import { scaffoldApiConventionDoc } from './apiConventionDoc.js';

/**
 * 모노레포(pnpm workspace) 안의 apps/<name> 으로 React/Next 앱을 하나 만든다.
 *
 * 단일 프로젝트용 createProject 와 달리:
 *  - package.json name 이 `@<scope>/<app>` 로 스코프됨
 *  - 공유 프리셋(@<scope>/config-eslint, @<scope>/config-typescript)을 workspace 로 참조
 *  - eslint / tsconfig 를 모노레포 프리셋을 extends 하도록 재작성
 *  - .gitignore / .vscode / .prettierrc 는 루트가 담당하므로 앱에서는 제거
 *  - 의존성 설치(pnpm install)는 호출자가 루트에서 일괄 수행
 *
 * @param {object} args
 * @param {string} args.appDir     앱 절대경로 (…/apps/<name>)
 * @param {object} args.config     { projectName, framework, aiModel, figmaUrl, openapiUrl }
 * @param {string} args.scope      npm scope (예: 'marketd' → @marketd/<app>)
 */
export async function createApp({ appDir, config, scope }) {
  await fs.mkdir(appDir, { recursive: true });

  await createFolders(appDir, config);
  await createBaseFiles(appDir, config);
  await scaffoldApiConventionDoc({ projectRoot: appDir, framework: config.framework });
  await createBcConfig(appDir, config);

  await createAppPackageJson(appDir, config, scope);
  await applyMonorepoConventions(appDir, config, scope);
}

async function write(filePath, content) {
  await fs.writeFile(filePath, content, 'utf-8');
}

async function rm(target) {
  await fs.rm(target, { recursive: true, force: true });
}

/**
 * 워크스페이스 앱용 package.json. 모노레포에서는 React 버전을 하나로 통일하려고
 * (pnpm hoist 충돌 방지) react/react-dom 모두 19 계열로 맞춘다.
 */
async function createAppPackageJson(appDir, config, scope) {
  const isReact = config.framework === 'react';
  const name = `@${scope}/${config.projectName}`;

  const scripts = isReact
    ? {
        dev: 'vite',
        build: 'vite build',
        typecheck: 'tsc --noEmit',
        lint: 'eslint .',
        preview: 'vite preview',
        'tokens:build': 'style-dictionary build --config token.config.js',
        clean: 'rm -rf dist node_modules .turbo',
      }
    : {
        dev: 'next dev',
        build: 'next build',
        start: 'next start',
        typecheck: 'tsc --noEmit',
        lint: 'eslint .',
        'tokens:build': 'style-dictionary build --config token.config.js',
        clean: 'rm -rf .next node_modules .turbo',
      };

  const pkg = {
    name,
    version: '0.0.0',
    private: true,
    type: 'module',
    scripts,
    dependencies: {
      react: versions['next-react'],
      'react-dom': versions['next-react-dom'],
      ...(isReact ? {} : { next: versions.next }),
      zustand: versions.zustand,
      ...(isReact
        ? {
            axios: versions.axios,
            '@tanstack/react-query': versions['@tanstack/react-query'],
          }
        : {}),
      zod: versions.zod,
    },
    devDependencies: {
      [`@${scope}/config-eslint`]: 'workspace:*',
      [`@${scope}/config-typescript`]: 'workspace:*',
      '@types/react': versions['@types/react'],
      '@types/react-dom': versions['@types/react-dom'],
      '@types/node': versions['@types/node'],
      // 모노레포 앱은 flat config(@scope/config-eslint) 를 쓰므로 ESLint 9 필요.
      // (단일 프로젝트의 eslintrc + eslint 8 과 별개)
      eslint: '^9.18.0',
      'eslint-plugin-unused-imports': versions['eslint-plugin-unused-imports'],
      prettier: versions.prettier,
      'prettier-plugin-tailwindcss': versions['prettier-plugin-tailwindcss'],
      'style-dictionary': versions['style-dictionary'],
      tailwindcss: versions.tailwindcss,
      typescript: versions.typescript,
      ...(isReact
        ? {
            '@tailwindcss/vite': versions['@tailwindcss/vite'],
            '@vitejs/plugin-react': versions['@vitejs/plugin-react'],
            vite: versions.vite,
            'vite-plugin-svgr': versions['vite-plugin-svgr'],
          }
        : {
            '@tailwindcss/postcss': versions['@tailwindcss/postcss'],
            '@svgr/webpack': versions['@svgr/webpack'],
          }),
    },
  };

  await write(path.join(appDir, 'package.json'), JSON.stringify(pkg, null, 2) + '\n');
}

/**
 * createBaseFiles 가 깔아둔 단일 프로젝트용 설정 파일을 모노레포 규칙으로 교체한다.
 */
async function applyMonorepoConventions(appDir, config, scope) {
  const isReact = config.framework === 'react';

  // 루트에서 관리하는 설정들은 앱 레벨에서 제거.
  await rm(path.join(appDir, '.eslintrc.cjs'));
  await rm(path.join(appDir, '.prettierrc'));
  await rm(path.join(appDir, '.gitignore'));
  await rm(path.join(appDir, '.vscode'));

  // 공유 ESLint 프리셋을 extends 하는 flat config.
  await write(
    path.join(appDir, 'eslint.config.mjs'),
    `import { reactConfig } from '@${scope}/config-eslint/react';
import unusedImports from 'eslint-plugin-unused-imports';

export default [
  ...reactConfig,
  {
    plugins: { 'unused-imports': unusedImports },
    rules: {
      'no-unused-vars': 'off',
      '@typescript-eslint/no-unused-vars': 'off',
      'unused-imports/no-unused-imports': 'error',
      'unused-imports/no-unused-vars': [
        'warn',
        { vars: 'all', varsIgnorePattern: '^_', args: 'after-used', argsIgnorePattern: '^_' },
      ],
    },
  },
];
`,
  );

  if (isReact) {
    // createBaseFiles 의 프로젝트 레퍼런스형 tsconfig 3종을 공유 프리셋 extends 로 교체.
    await rm(path.join(appDir, 'tsconfig.app.json'));
    await rm(path.join(appDir, 'tsconfig.node.json'));
    await write(
      path.join(appDir, 'tsconfig.json'),
      JSON.stringify(
        {
          extends: `@${scope}/config-typescript/react.json`,
          compilerOptions: {
            tsBuildInfoFile: './node_modules/.tmp/tsconfig.tsbuildinfo',
            noUnusedLocals: true,
            noUnusedParameters: true,
            noUncheckedSideEffectImports: true,
            moduleDetection: 'force',
            baseUrl: '.',
            paths: {
              '@/*': ['src/*'],
              '@icons/*': ['src/assets/icons/*'],
              '@images/*': ['src/assets/images/*'],
            },
          },
          include: ['src', 'vite.config.ts'],
        },
        null,
        2,
      ) + '\n',
    );
  } else {
    await write(
      path.join(appDir, 'tsconfig.json'),
      JSON.stringify(
        {
          extends: `@${scope}/config-typescript/next.json`,
          compilerOptions: {
            baseUrl: '.',
            paths: { '@/*': ['./src/*'] },
          },
          include: [
            'next-env.d.ts',
            '**/*.ts',
            '**/*.tsx',
            '.next/types/**/*.ts',
          ],
          exclude: ['node_modules'],
        },
        null,
        2,
      ) + '\n',
    );
  }
}
