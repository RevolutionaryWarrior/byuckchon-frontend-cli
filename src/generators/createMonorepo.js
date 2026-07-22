import fs from 'node:fs/promises';
import path from 'node:path';

import { createApp } from './createApp.js';

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
        'prettier --write "**/*.{ts,tsx,js,jsx,json,md,yml,yaml}" --ignore-path .gitignore',
      'format:check':
        'prettier --check "**/*.{ts,tsx,js,jsx,json,md,yml,yaml}" --ignore-path .gitignore',
      clean: 'turbo run clean && rm -rf node_modules .turbo',
      preinstall: 'npx only-allow pnpm',
      // 최초 앱 실행 단축키 (bc add 시 앱마다 추가됨).
      [config.appName]: `pnpm --filter @${scope}/${config.appName} dev`,
    },
    devDependencies: {
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

  await writeJson(path.join(root, 'turbo.json'), {
    $schema: 'https://turborepo.org/schema.json',
    ui: 'tui',
    globalDependencies: ['tsconfig.base.json', '.env', '.env.*', '!.env*.local'],
    globalEnv: ['NODE_ENV', 'CI'],
    tasks: {
      build: {
        dependsOn: ['^build'],
        outputs: ['dist/**', 'build/**', '.next/**', '!.next/cache/**', 'out/**'],
        inputs: [
          '$TURBO_DEFAULT$',
          '!**/*.md',
          '!**/*.test.ts',
          '!**/*.test.tsx',
          '!**/*.spec.ts',
          '!**/*.spec.tsx',
        ],
      },
      dev: { cache: false, persistent: true },
      lint: { dependsOn: ['^build'], outputs: [] },
      typecheck: { dependsOn: ['^build'], outputs: ['.tsbuildinfo', '**/*.tsbuildinfo'] },
      'tokens:build': { outputs: ['src/tokens.css'] },
      clean: { cache: false },
    },
  });

  await writeJson(path.join(root, 'tsconfig.base.json'), {
    $schema: 'https://json.schemastore.org/tsconfig',
    display: `${name} Base`,
    compilerOptions: {
      target: 'ES2022',
      lib: ['ES2022'],
      module: 'ESNext',
      moduleResolution: 'Bundler',
      strict: true,
      noUncheckedIndexedAccess: true,
      noImplicitOverride: true,
      noFallthroughCasesInSwitch: true,
      useUnknownInCatchVariables: true,
      exactOptionalPropertyTypes: false,
      esModuleInterop: true,
      allowSyntheticDefaultImports: true,
      forceConsistentCasingInFileNames: true,
      resolveJsonModule: true,
      isolatedModules: true,
      verbatimModuleSyntax: false,
      skipLibCheck: true,
      incremental: true,
      composite: false,
      types: [],
    },
    exclude: ['node_modules', 'dist', 'build', '.turbo', '.next', 'coverage'],
  });

  await writeJson(path.join(root, 'tsconfig.json'), {
    extends: './tsconfig.base.json',
    files: [],
    include: [],
  });

  await write(
    path.join(root, '.npmrc'),
    `# pnpm 동작 설정
# React 버전 통일 및 (향후 Expo/RN 도입 대비) hoisted linker 사용.
node-linker=hoisted

public-hoist-pattern[]=*react*
public-hoist-pattern[]=*@types/*
public-hoist-pattern[]=*eslint*
public-hoist-pattern[]=*prettier*

strict-peer-dependencies=false
auto-install-peers=true
save-exact=false
save-prefix=^
prefer-frozen-lockfile=true
`,
  );

  await write(path.join(root, '.nvmrc'), '20\n');

  await write(
    path.join(root, 'prettier.config.mjs'),
    `/** @type {import("prettier").Config} */
export default {
  semi: true,
  singleQuote: true,
  trailingComma: 'all',
  tabWidth: 2,
  printWidth: 100,
  arrowParens: 'always',
  endOfLine: 'lf',
  bracketSpacing: true,
  bracketSameLine: false,
  jsxSingleQuote: false,
  plugins: ['prettier-plugin-tailwindcss'],
  overrides: [
    {
      files: ['*.json', '*.md', '*.yml', '*.yaml'],
      options: { tabWidth: 2 },
    },
  ],
};
`,
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

  await writeJson(path.join(dir, 'package.json'), {
    name: `@${scope}/config-typescript`,
    version: '0.0.0',
    private: true,
    description: `Shared TypeScript config presets for @${scope} apps & packages`,
    files: ['base.json', 'library.json', 'react.json', 'next.json', 'node.json'],
  });

  await writeJson(path.join(dir, 'base.json'), {
    $schema: 'https://json.schemastore.org/tsconfig',
    display: 'Base',
    extends: '../../tsconfig.base.json',
  });

  await writeJson(path.join(dir, 'react.json'), {
    $schema: 'https://json.schemastore.org/tsconfig',
    display: 'React Web (Vite)',
    extends: './base.json',
    compilerOptions: {
      lib: ['ES2022', 'DOM', 'DOM.Iterable'],
      jsx: 'react-jsx',
      moduleResolution: 'Bundler',
      module: 'ESNext',
      noEmit: true,
      allowImportingTsExtensions: true,
      useDefineForClassFields: true,
      types: ['vite/client'],
      noUncheckedIndexedAccess: false,
    },
  });

  await writeJson(path.join(dir, 'next.json'), {
    $schema: 'https://json.schemastore.org/tsconfig',
    display: 'Next.js (App Router)',
    extends: './base.json',
    compilerOptions: {
      lib: ['ES2022', 'DOM', 'DOM.Iterable'],
      jsx: 'preserve',
      module: 'ESNext',
      moduleResolution: 'Bundler',
      noEmit: true,
      allowJs: true,
      incremental: true,
      plugins: [{ name: 'next' }],
      noUncheckedIndexedAccess: false,
    },
  });

  await writeJson(path.join(dir, 'library.json'), {
    $schema: 'https://json.schemastore.org/tsconfig',
    display: 'Library (packages/*)',
    extends: './base.json',
    compilerOptions: {
      declaration: true,
      declarationMap: true,
      sourceMap: true,
      outDir: 'dist',
      rootDir: 'src',
      composite: true,
    },
  });

  await writeJson(path.join(dir, 'node.json'), {
    $schema: 'https://json.schemastore.org/tsconfig',
    display: 'Node (scripts)',
    extends: './base.json',
    compilerOptions: {
      lib: ['ES2022'],
      module: 'NodeNext',
      moduleResolution: 'NodeNext',
      types: ['node'],
    },
  });
}

async function writeConfigEslint(root, scope) {
  const dir = path.join(root, 'packages', 'config-eslint');
  await fs.mkdir(dir, { recursive: true });

  await writeJson(path.join(dir, 'package.json'), {
    name: `@${scope}/config-eslint`,
    version: '0.0.0',
    private: true,
    type: 'module',
    description: `Shared ESLint flat configs for @${scope} apps & packages`,
    main: './base.js',
    exports: {
      '.': './base.js',
      './base': './base.js',
      './react': './react.js',
    },
    files: ['base.js', 'react.js'],
    dependencies: {
      '@eslint/js': '^9.18.0',
      'eslint-config-prettier': '^10.1.8',
      'eslint-plugin-import': '^2.32.0',
      'eslint-plugin-react': '^7.37.4',
      'eslint-plugin-react-hooks': '^5.1.0',
      globals: '^15.14.0',
      'typescript-eslint': '^8.59.1',
    },
    peerDependencies: {
      eslint: '^9.0.0',
      typescript: '>=5.0.0',
    },
  });

  await write(
    path.join(dir, 'base.js'),
    `// @ts-check
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import prettier from 'eslint-config-prettier';
import importPlugin from 'eslint-plugin-import';
import globals from 'globals';

/**
 * 공통 ESLint flat config (TS 베이스).
 * @type {import("eslint").Linter.Config[]}
 */
export const baseConfig = [
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/build/**',
      '**/out/**',
      '**/.next/**',
      '**/.turbo/**',
      '**/coverage/**',
      '**/*.d.ts',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: { ...globals.es2022 },
    },
    plugins: { import: importPlugin },
    rules: {
      'no-console': ['warn', { allow: ['warn', 'error'] }],
      '@typescript-eslint/consistent-type-imports': [
        'warn',
        { prefer: 'type-imports', fixStyle: 'inline-type-imports' },
      ],
      '@typescript-eslint/no-unused-vars': [
        'warn',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
    },
  },
  prettier,
];

export default baseConfig;
`,
  );

  await write(
    path.join(dir, 'react.js'),
    `// @ts-check
import react from 'eslint-plugin-react';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';

import { baseConfig } from './base.js';

/**
 * React (Vite/Next) 앱용 ESLint config.
 * @type {import("eslint").Linter.Config[]}
 */
export const reactConfig = [
  ...baseConfig,
  {
    files: ['**/*.{js,jsx,ts,tsx}'],
    languageOptions: {
      globals: { ...globals.browser, ...globals.es2022 },
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    plugins: { react, 'react-hooks': reactHooks },
    settings: { react: { version: 'detect' } },
    rules: {
      ...react.configs.recommended.rules,
      ...react.configs['jsx-runtime'].rules,
      ...reactHooks.configs.recommended.rules,
      'react/prop-types': 'off',
      'react/react-in-jsx-scope': 'off',
      'react/no-unescaped-entities': 'off',
      'react-hooks/rules-of-hooks': 'warn',
      '@typescript-eslint/no-explicit-any': 'off',
    },
  },
];

export default reactConfig;
`,
  );
}
