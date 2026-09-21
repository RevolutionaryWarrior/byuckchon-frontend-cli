import fs from 'node:fs/promises';
import path from 'node:path';

import { versions } from '../constants/versions.js';
import { readSettingsAsset } from '../utils/settingsAssets.js';
import { createApp } from './createApp.js';
import { scaffoldReviewAutomation } from './scaffoldReviewAutomation.js';

/**
 * 새 pnpm 모노레포를 스캐폴드한다. (marketd-frontend 구조 참고)
 *
 * 생성물:
 *   <root>/
 *     package.json            (turbo 스크립트 · pnpm)
 *     pnpm-workspace.yaml
 *     turbo.json
 *     tsconfig.base.json / tsconfig.json
 *     .npmrc / .nvmrc / .gitignore
 *     prettier.config.mjs / eslint.config.mjs
 *     README.md
 *     packages/config-typescript/*
 *     packages/config-eslint/*
 *     apps/<initial-app>/      (사용자가 고른 React 또는 Next 하나)
 *
 * @param {object} config { projectName, framework, appName, scope, aiModel, figmaUrl, openapiUrl }
 */
export async function createMonorepo(config) {
  const root = path.resolve(config.projectName);
  const scope = config.scope;

  await fs.mkdir(root);
  await fs.mkdir(path.join(root, 'apps'), { recursive: true });
  await fs.mkdir(path.join(root, 'packages'), { recursive: true });

  await writeRootFiles(root, config, scope);
  await writeConfigTypescript(root, scope);
  await writeConfigEslint(root, scope);
  await scaffoldReviewAutomation({ projectRoot: root, projectType: 'monorepo' });

  // 최초 앱 하나만 생성. 이후 추가는 `bc add`.
  const appName = config.appName;
  await createApp({
    appDir: path.join(root, 'apps', appName),
    config: { ...config, projectName: appName },
    scope,
  });

  return { root, scope, appName };
}

async function write(filePath, content) {
  await fs.writeFile(filePath, content, 'utf-8');
}

async function writeJson(filePath, obj) {
  await write(filePath, JSON.stringify(obj, null, 2) + '\n');
}

async function writeRootFiles(root, config, scope) {
  const name = config.projectName;

  await writeJson(path.join(root, 'package.json'), {
    name,
    version: '0.0.0',
    private: true,
    description: `${name} monorepo`,
    packageManager: 'pnpm@10.0.0',
    engines: { node: '>=20.0.0', pnpm: '>=9.0.0' },
    type: 'module',
    scripts: {
      build: 'turbo run build',
      dev: 'turbo run dev',
      lint: 'turbo run lint',
      'lint:fix': 'turbo run lint -- --fix',
      typecheck: 'turbo run typecheck',
      'tokens:build': 'turbo run tokens:build',
      format:
        'prettier --write "**/*.{ts,tsx,js,jsx,cjs,json,md,yml,yaml}" --ignore-path .gitignore',
      'format:check':
        'prettier --check "**/*.{ts,tsx,js,jsx,cjs,json,md,yml,yaml}" --ignore-path .gitignore',
      clean: 'turbo run clean && rm -rf node_modules .turbo',
      preinstall: 'npx only-allow pnpm',
      // 최초 앱 실행 단축키 (bc add 시 앱마다 추가됨).
      [config.appName]: `pnpm --filter @${scope}/${config.appName} dev`,
    },
    devDependencies: {
      // 루트의 prettier.config.mjs 와 tsconfig.base.json 이 직접 참조한다.
      '@byuckchon-frontend/settings': versions['@byuckchon-frontend/settings'],
      '@types/node': '^22.0.0',
      eslint: '^9.18.0',
      'eslint-config-prettier': '^10.1.8',
      prettier: '^3.3.0',
      turbo: '^2.9.6',
      typescript: '~5.7.0',
    },
  });

  await write(
    path.join(root, 'pnpm-workspace.yaml'),
    `# pnpm workspace 정의
# - apps/*     : 배포 대상 (React/Next 앱)
# - packages/* : 내부 공유 패키지 (@${scope}/*)
packages:
  - "apps/*"
  - "packages/*"
`,
  );

  // turbo / .npmrc / .nvmrc 는 참조 문법이 없어서 내용을 복사한다.
  // 이후 settings 가 바뀌면 `npx byuckchon-settings-sync` 로 갱신한다.
  await write(path.join(root, 'turbo.json'), await readSettingsAsset('project/turbo.json'));

  // 공통 옵션은 @byuckchon-frontend/settings 가 관리한다.
  // 이 파일은 모노레포 전용 예외를 얹는 자리로만 남긴다.
  await writeJson(path.join(root, 'tsconfig.base.json'), {
    $schema: 'https://json.schemastore.org/tsconfig',
    display: `${config.projectName} Base`,
    extends: '@byuckchon-frontend/settings/tsconfig/base.json',
    compilerOptions: {
      noUncheckedIndexedAccess: true,
      noImplicitOverride: true,
      allowSyntheticDefaultImports: true,
      incremental: true,
    },
  });

  await writeJson(path.join(root, 'tsconfig.json'), {
    extends: './tsconfig.base.json',
    files: [],
    include: [],
  });

  await write(path.join(root, '.npmrc'), await readSettingsAsset('project/npmrc'));

  await write(path.join(root, '.nvmrc'), await readSettingsAsset('project/nvmrc'));

  await write(
    path.join(root, 'prettier.config.mjs'),
    `// 포맷 규칙은 @byuckchon-frontend/settings 가 관리합니다.
// 이 모노레포 전용 예외가 필요하면 펼쳐서 덮어쓰세요.
import byuckchon from '@byuckchon-frontend/settings/prettier';

/** @type {import("prettier").Config} */
export default {
  ...byuckchon,
  overrides: [
    {
      files: ['*.json', '*.md', '*.yml', '*.yaml'],
      options: { tabWidth: 2 },
    },
  ],
};
`
  );

  await write(
    path.join(root, 'eslint.config.mjs'),
    `// 루트 레벨 ESLint config.
// 각 앱/패키지는 자체 eslint.config.mjs 를 가진다. 루트는 스크립트/설정 파일만 훑는다.
import { baseConfig } from '@${scope}/config-eslint/base';

export default [
  ...baseConfig,
  {
    ignores: [
      'apps/**',
      'packages/**',
      '**/node_modules/**',
      '**/dist/**',
      '**/build/**',
      '**/.turbo/**',
      '**/.next/**',
    ],
  },
];
`,
  );

  await write(
    path.join(root, '.gitignore'),
    `# Dependencies
node_modules/
.pnpm-store/

# Build
dist/
build/
out/
.next/
.turbo/
*.tsbuildinfo

# Env
.env
.env.*
!.env.example

# OS / Editor
.DS_Store
Thumbs.db
.idea/

# Logs
npm-debug.log*
pnpm-debug.log*

# bc
.bc/
`,
  );

  await write(
    path.join(root, 'README.md'),
    `# ${name}

pnpm + Turborepo 기반 프론트엔드 모노레포. (byuckchon-frontend-cli 로 생성)

## 구조

\`\`\`
apps/           # 배포 대상 (React / Next 앱)
  ${config.appName}/
packages/       # 내부 공유 패키지 (@${scope}/*)
  config-eslint/
  config-typescript/
\`\`\`

## 시작하기

\`\`\`bash
pnpm install            # 전체 의존성 설치
pnpm dev                # 모든 앱 dev (turbo)
pnpm ${config.appName}             # ${config.appName} 앱만 실행
\`\`\`

## 앱 추가

새 React/Next 앱을 이 모노레포에 추가하려면 루트에서:

\`\`\`bash
bc add
\`\`\`

## 스크립트

| 명령 | 설명 |
|------|------|
| \`pnpm dev\` | 전체 앱 개발 서버 (turbo) |
| \`pnpm build\` | 전체 빌드 |
| \`pnpm lint\` | 전체 lint |
| \`pnpm typecheck\` | 전체 타입체크 |
| \`pnpm format\` | Prettier 포맷 |
`,
  );
}

async function writeConfigTypescript(root, scope) {
  const dir = path.join(root, 'packages', 'config-typescript');
  await fs.mkdir(dir, { recursive: true });

  // 프리셋 본체는 @byuckchon-frontend/settings 가 관리한다.
  // 이 패키지는 모노레포 전용 예외를 얹을 자리로만 남긴다.
  await writeJson(path.join(dir, 'package.json'), {
    name: `@${scope}/config-typescript`,
    version: '0.0.0',
    private: true,
    description: 'settings 의 TypeScript 프리셋을 이 모노레포용으로 감싼 패키지',
    files: ['base.json', 'library.json', 'react.json', 'next.json', 'node.json'],
    dependencies: {
      '@byuckchon-frontend/settings': versions['@byuckchon-frontend/settings'],
    },
  });

  const preset = (display, name) => ({
    $schema: 'https://json.schemastore.org/tsconfig',
    display,
    extends: `@byuckchon-frontend/settings/tsconfig/${name}.json`,
  });

  await writeJson(path.join(dir, 'base.json'), preset('Base', 'base'));
  await writeJson(path.join(dir, 'react.json'), preset('React Web (Vite)', 'react'));
  await writeJson(path.join(dir, 'next.json'), preset('Next.js (App Router)', 'next'));
  await writeJson(path.join(dir, 'library.json'), preset('Library (packages/*)', 'library'));
  await writeJson(path.join(dir, 'node.json'), preset('Node (scripts)', 'node'));
}

async function writeConfigEslint(root, scope) {
  const dir = path.join(root, 'packages', 'config-eslint');
  await fs.mkdir(dir, { recursive: true });

  // 규칙 본체는 @byuckchon-frontend/settings 가 관리한다.
  // 이 패키지는 모노레포 전용 예외를 얹을 자리로만 남긴다.
  await writeJson(path.join(dir, 'package.json'), {
    name: `@${scope}/config-eslint`,
    version: '0.0.0',
    private: true,
    type: 'module',
    description: 'settings 의 ESLint 프리셋을 이 모노레포용으로 감싼 패키지',
    main: './base.js',
    exports: {
      '.': './base.js',
      './base': './base.js',
      './react': './react.js',
      './next': './next.js',
    },
    files: ['base.js', 'react.js', 'next.js'],
    dependencies: {
      '@byuckchon-frontend/settings': versions['@byuckchon-frontend/settings'],
    },
    peerDependencies: {
      eslint: '^9.0.0',
      typescript: '>=5.0.0',
    },
  });

  const reexport = (name, named) => `// 규칙 본체는 @byuckchon-frontend/settings 가 관리합니다.
// 이 모노레포에만 해당하는 예외는 아래 배열에 이어붙이세요.
import byuckchon from '@byuckchon-frontend/settings/eslint/${name}';

/** @type {import("eslint").Linter.Config[]} */
export const ${named} = [...byuckchon];

export default ${named};
`;

  await write(path.join(dir, 'base.js'), reexport('base', 'baseConfig'));
  await write(path.join(dir, 'react.js'), reexport('react', 'reactConfig'));
  await write(path.join(dir, 'next.js'), reexport('next', 'nextConfig'));
}
