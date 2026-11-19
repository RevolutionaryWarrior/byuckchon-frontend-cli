import { exec as execCallback } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';

import chalk from 'chalk';

import { versions } from '../constants/versions.js';
import { readSettingsAsset, readSettingsJson } from '../utils/settingsAssets.js';
import { scaffoldApiConventionDoc } from './apiConventionDoc.js';
import { workflowSections } from './createBaseFiles.js';
import { createBcConfig } from './createBcConfig.js';
import { CACHE_CONFIG_TS } from './createFolders.js';
import { formatGeneratedFiles } from './install.js';
import { scaffoldReviewAutomation } from './scaffoldReviewAutomation.js';

const exec = promisify(execCallback);

/** create-expo-app 템플릿의 SDK. Expo 패키지 버전은 이 SDK 에 맞춰 템플릿이 정한다. */
const EXPO_SDK = '58';

/**
 * Expo(React Native) 단일 프로젝트를 만든다.
 *
 * 앱 뼈대는 공식 create-expo-app(default 템플릿)에 맡기고, 그 위에 팀 규칙을 얹는다.
 * Expo 패키지 버전은 SDK 와 짝이 맞아야 해서 settings 매트릭스로 고정하지 않는다.
 *
 *   1. create-expo-app            (SDK 고정, Expo 가 관리하는 AGENTS.md 포함)
 *   2. 데모 화면 · 에셋 정리       (아이콘 · 스플래시는 남긴다)
 *   3. 팀 파일 얹기               (src 폴더 구조, React Query, axios, ESLint · Prettier, AGENTS.md 팀 규칙)
 *      app.json 은 템플릿 그대로 둔다. (번들 ID 는 팀이 정할 때 넣는다)
 *   4. 설치 → 포맷
 *
 * EAS(로그인 · eas init · eas.json)는 넣지 않고, Expo AGENTS.md 의 EAS 안내도 지운다. 필요해지면 그때 붙인다.
 */
export async function createExpoProject(config) {
  const rootDir = path.resolve(config.projectName);
  await assertNotExists(rootDir);

  console.log(chalk.dim(`  create-expo-app 실행 중... (SDK ${EXPO_SDK})`));
  await exec(
    `npx --yes create-expo-app@latest ${config.projectName} --template default@sdk-${EXPO_SDK} --no-install --yes`,
  );

  await removeTemplateDemo(rootDir);
  await overlayTeamFiles(rootDir, config);

  console.log(chalk.dim('  의존성 설치 중... (잠시 걸릴 수 있어요)'));
  await exec('npm install', { cwd: rootDir });
  await exec(`npm install ${MOBILE_BYUCKCHON_PACKAGES.join(' ')}`, { cwd: rootDir });

  await formatGeneratedFiles({ cwd: rootDir, command: 'npm run format' });
}

/** 다른 템플릿처럼 폴더가 이미 있으면 EEXIST 로 멈춘다. (init.js 가 메시지를 낸다) */
async function assertNotExists(rootDir) {
  try {
    await fs.access(rootDir);
  } catch {
    return;
  }
  const error = new Error(`EEXIST: ${rootDir}`);
  error.code = 'EEXIST';
  error.path = rootDir;
  throw error;
}

// ─── 1. 템플릿 정리 ─────────────────────────────────────────────────────────────

/**
 * default 템플릿의 데모(탭 · 테마 · 예제 컴포넌트)를 지운다.
 * src 는 통째로 다시 만들고, assets 는 app.json 이 가리키는 아이콘 · 스플래시만 남긴다.
 */
const TEMPLATE_DEMO = [
  '.git', // create-expo-app 이 만든 저장소. 다른 템플릿처럼 git 은 사용자가 정한다.
  'LICENSE',
  'scripts', // reset-project.js
  'src',
  'assets/images/tabIcons',
  'assets/images/react-logo.png',
  'assets/images/react-logo@2x.png',
  'assets/images/react-logo@3x.png',
  'assets/images/expo-logo.png',
  'assets/images/logo-glow.png',
  'assets/images/expo-badge.png',
  'assets/images/expo-badge-white.png',
  'assets/images/tutorial-web.png',
];

async function removeTemplateDemo(rootDir) {
  for (const target of TEMPLATE_DEMO) {
    await fs.rm(path.join(rootDir, target), { recursive: true, force: true });
  }
}

// ─── 2. 팀 파일 ─────────────────────────────────────────────────────────────────

/** RN 에서 쓸 수 있는 사내 패키지. core · basic-ui 는 웹 DOM · Tailwind 기반이라 뺀다. */
const MOBILE_BYUCKCHON_PACKAGES = ['@byuckchon-frontend/hooks', '@byuckchon-frontend/utils'];

async function write(filePath, content) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, content, 'utf-8');
}

async function readJson(file) {
  return JSON.parse(await fs.readFile(file, 'utf8'));
}

async function writeJson(file, value) {
  await write(file, `${JSON.stringify(value, null, 2)}\n`);
}

async function overlayTeamFiles(rootDir, config) {
  const at = (p) => path.join(rootDir, p);

  // src — 화면은 expo-router(src/app), 나머지는 웹과 같은 레이어 이름을 쓴다.
  await write(at('src/app/_layout.tsx'), LAYOUT_TSX);
  await write(at('src/app/index.tsx'), INDEX_TSX);
  await write(at('src/api/instance.ts'), INSTANCE_TS);
  await write(at('src/api/index.ts'), '// API 호출\n');
  await write(at('src/components/index.ts'), '// 재사용 가능한 UI 컴포넌트\n');
  await write(at('src/hooks/index.ts'), '// 커스텀 훅\n');
  await write(at('src/store/index.ts'), '// Zustand 스토어\n');
  await write(at('src/constants/index.ts'), '// 상수\n');
  await write(at('src/lib/query/cacheConfig.ts'), CACHE_CONFIG_TS);
  await write(at('src/lib/query/index.ts'), "export { cacheConfig } from './cacheConfig';\n");
  await write(at('src/lib/index.ts'), "export * from './query';\n");

  await write(at('.env.example'), ENV_EXAMPLE);
  await write(at('eslint.config.mjs'), ESLINT_CONFIG_MJS);
  await write(at('prettier.config.mjs'), PRETTIER_CONFIG_MJS);
  // workflow 가 node-version-file: .nvmrc 를 읽는다.
  await write(at('.nvmrc'), await readSettingsAsset('project/nvmrc'));
  await writeJson(at('.vscode/settings.json'), await readSettingsJson('vscode'));
  await write(at('README.md'), readme(config));

  await patchPackageJson(rootDir);
  await patchTsconfig(rootDir);
  await appendGitignore(rootDir);
  await appendAgentsDoc(rootDir);

  await scaffoldApiConventionDoc({ projectRoot: rootDir, framework: 'expo' });
  await createBcConfig(rootDir, config);
  await scaffoldReviewAutomation({ projectRoot: rootDir, projectType: 'single' });
}

async function patchPackageJson(rootDir) {
  const file = path.join(rootDir, 'package.json');
  const pkg = await readJson(file);

  // reset-project 는 지운 데모용 스크립트다.
  const { 'reset-project': _resetProject, ...scripts } = pkg.scripts ?? {};
  const formatTargets = '"src/**/*.{ts,tsx}" "tools/**/*.{js,cjs,mjs,json,md}"';
  pkg.scripts = {
    ...scripts,
    lint: 'eslint .',
    typecheck: 'tsc --noEmit',
    // PR Check 의 build 단계. 네이티브 빌드 없이 JS 번들이 만들어지는지만 본다.
    build: 'expo export --platform ios --platform android',
    format: `prettier --write ${formatTargets} --no-error-on-unmatched-pattern`,
    'format:check': `prettier --check ${formatTargets} --no-error-on-unmatched-pattern`,
  };

  // Expo 와 상관없는 순수 JS 라이브러리는 웹과 같은 버전을 쓴다.
  pkg.dependencies = {
    ...pkg.dependencies,
    '@tanstack/react-query': versions['@tanstack/react-query'],
    axios: versions.axios,
    zod: versions.zod,
    zustand: versions.zustand,
  };
  pkg.devDependencies = {
    ...pkg.devDependencies,
    '@byuckchon-frontend/settings': versions['@byuckchon-frontend/settings'],
    '@trivago/prettier-plugin-sort-imports': versions['@trivago/prettier-plugin-sort-imports'],
    eslint: versions.eslint,
    prettier: versions.prettier,
  };

  await writeJson(file, pkg);
}

/** Expo tsconfig 를 기준으로 두고, settings 의 공통 규칙(strict 등)을 먼저 깐다. (뒤가 이긴다) */
async function patchTsconfig(rootDir) {
  const file = path.join(rootDir, 'tsconfig.json');
  const tsconfig = await readJson(file);
  const expoBase = tsconfig.extends ?? 'expo/tsconfig.base';
  tsconfig.extends = ['@byuckchon-frontend/settings/tsconfig/base.json', expoBase];
  await writeJson(file, tsconfig);
}

async function appendGitignore(rootDir) {
  const file = path.join(rootDir, '.gitignore');
  const current = await fs.readFile(file, 'utf8').catch(() => '');
  // 템플릿은 .env*.local 만 뺀다. 팀은 .env 도 커밋하지 않는다. (.env.example 만 커밋)
  await fs.writeFile(file, `${current.trimEnd()}\n\n# env (byuckchon)\n.env\n`, 'utf8');
}

/** Expo 가 만든 AGENTS.md 에서 EAS 안내만 빼고, 아래에 팀 규칙을 붙인다. */
async function appendAgentsDoc(rootDir) {
  const file = path.join(rootDir, 'AGENTS.md');
  const current = await fs.readFile(file, 'utf8').catch(() => '');
  await fs.writeFile(file, `${stripEasNotes(current).trimEnd()}\n\n${TEAM_AGENTS}`, 'utf8');
}

/**
 * EAS(클라우드 빌드 · 배포)는 쓰지 않으므로 Expo AGENTS.md 의 EAS 안내를 지운다.
 * 문구가 SDK 마다 조금씩 바뀌어도 없는 부분은 그냥 건너뛴다.
 */
export function stripEasNotes(text) {
  return text
    .replace(/## Building with EAS\n[\s\S]*?(?=\n## |$)/, '')
    .replace(/,? or `eas build[^`]*`/g, '')
    .replace('Expo, EAS, or React Native', 'Expo or React Native')
    .replace(/\n{3,}/g, '\n\n');
}

// ─── 템플릿 ────────────────────────────────────────────────────────────────────

const LAYOUT_TSX = `import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Stack } from 'expo-router';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      refetchOnMount: false,
      refetchOnReconnect: false,
    },
  },
});

export default function RootLayout() {
  return (
    <QueryClientProvider client={queryClient}>
      <Stack />
    </QueryClientProvider>
  );
}
`;

const INDEX_TSX = `import { StyleSheet, Text, View } from 'react-native';

export default function HomeScreen() {
  return (
    <View style={styles.container}>
      <Text>Hi! Byuckchon Frontend Developer</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
`;

const INSTANCE_TS = `import axios from 'axios';

/**
 * API 호출은 이 인스턴스를 쓴다. (api-codegen.md)
 * 서버 주소는 .env 의 EXPO_PUBLIC_API_BASE_URL. EXPO_PUBLIC_ 값은 앱 번들에 그대로 들어가니 비밀값을 넣지 않는다.
 */
export const baseInstance = axios.create({
  baseURL: process.env.EXPO_PUBLIC_API_BASE_URL,
  timeout: 10_000,
});
`;

const ENV_EXAMPLE = `# .env 로 복사해서 채운다. (.env 는 커밋하지 않는다)
# EXPO_PUBLIC_ 값은 앱 번들에 그대로 들어간다. 비밀값을 넣지 않는다.
EXPO_PUBLIC_API_BASE_URL=
`;

const ESLINT_CONFIG_MJS = `import byuckchon from '@byuckchon-frontend/settings/eslint/react';

/**
 * 규칙 본체는 @byuckchon-frontend/settings 가 관리합니다. (React 규칙을 RN 에도 씁니다)
 * 프로젝트 예외는 뒤에 이어붙이세요.
 */
export default [
  ...byuckchon,
  {
    // Expo 가 만드는 파일 · 네이티브 폴더(expo prebuild)
    ignores: ['.expo/**', 'expo-env.d.ts', 'ios/**', 'android/**'],
  },
];
`;

const PRETTIER_CONFIG_MJS = `import byuckchon from '@byuckchon-frontend/settings/prettier';

/** RN 은 Tailwind 를 쓰지 않아서 Tailwind 클래스 정렬 플러그인은 뺀다. */
export default {
  ...byuckchon,
  plugins: ['@trivago/prettier-plugin-sort-imports'],
};
`;

const TEAM_AGENTS = `---

# 팀 규칙 (byuckchon)

위는 Expo 가 관리하는 내용이고(EAS 안내는 뺐다), 아래는 우리 팀 규칙입니다.
EAS(클라우드 빌드 · 배포)는 쓰지 않는다. 네이티브 빌드는 로컬에서 \`npx expo run:ios|android\` 로 한다.

## 1. 사내 패키지를 먼저 쓴다

| 패키지 | RN 에서 |
| --- | --- |
| \`@byuckchon-frontend/utils\` | 쓴다 — formatData, validate, handleError, filterParams, dateUtils 등 |
| \`@byuckchon-frontend/hooks\` | DOM 을 쓰지 않는 훅만 — useDebounce, useThrottle, useTimer, useCheckList, usePagination 등 |
| \`@byuckchon-frontend/core\` · \`basic-ui\` | 쓰지 않는다 — 웹 DOM · Tailwind 기반 |

직접 만들기 전에 위 패키지에 있는지 먼저 확인한다. (\`node_modules/@byuckchon-frontend/<패키지>/dist/index.d.ts\`)

## 2. 폴더 구조

\`\`\`
src/app        화면 (expo-router)        src/components 컴포넌트
src/api        API 호출                  src/hooks      커스텀 훅
src/lib        공용 로직 (query 캐시)     src/store      전역 상태 (zustand)
src/constants  상수                      assets/        아이콘 · 스플래시 · 이미지
\`\`\`

경로 별칭은 \`@/\` 를 쓴다. (\`@/lib\`)

## 3. API

- API 코드를 만들 때는 **먼저 \`src/api/api-codegen.md\` 를 읽고** React 규칙대로 만든다.
- \`src/api/instance.ts\` 의 \`baseInstance\` 를 쓴다. 서버 주소는 \`.env\` 의 \`EXPO_PUBLIC_API_BASE_URL\`.
- \`EXPO_PUBLIC_\` 값은 앱 번들에 그대로 들어간다. 비밀값을 넣지 않는다.

## 4. 스타일

- \`StyleSheet.create\` 로 쓴다. 웹의 Tailwind 클래스(\`className\`)는 쓰지 않는다.
- Figma MCP 가 웹 코드(Tailwind)를 주면 RN 컴포넌트(\`View\` · \`Text\` · \`Pressable\`)와 StyleSheet 로 옮긴다.

${workflowSections(5)}`;

function readme(config) {
  return `# ${config.projectName}

## 기술 스택

| 항목 | 내용 |
|------|------|
| Framework | Expo SDK ${EXPO_SDK} (React Native) |
| Language | TypeScript |
| Routing | expo-router (\`src/app\`) |
| Styling | StyleSheet |
| State | Zustand · React Query |
| HTTP | Axios (\`EXPO_PUBLIC_API_BASE_URL\`) |
| Lint | ESLint + Prettier (@byuckchon-frontend/settings) |

## 시작하기

\`\`\`bash
npm install
cp .env.example .env     # EXPO_PUBLIC_API_BASE_URL 채우기

npm start                # Expo Go 또는 개발용 앱에서 열기
npm run ios              # iOS 시뮬레이터
npm run android          # Android 에뮬레이터
\`\`\`

패키지를 추가할 때는 \`npx expo install <패키지>\` 를 쓴다. (SDK 에 맞는 버전을 고른다)

## 프로젝트 구조

\`\`\`
src/
├── app/          화면 (expo-router, 파일 = 화면)
├── api/          API 호출 (instance.ts, api-codegen.md)
├── components/   UI 컴포넌트
├── hooks/        커스텀 훅
├── lib/          공용 로직 (React Query 캐시 정책)
├── store/        Zustand 상태
└── constants/    상수
assets/           아이콘 · 스플래시 · 이미지
\`\`\`

## 출시 전에 할 것

- \`app.json\` 에 번들 ID 넣기 — \`ios.bundleIdentifier\` · \`android.package\`
  (비어 있으면 \`npm run ios\` · \`android\` 로 네이티브 빌드할 때 물어봅니다)
- 아이콘 · 스플래시 교체 — \`assets/images/icon.png\`, \`splash-icon.png\`, \`android-icon-*\`, \`assets/expo.icon\`
`;
}
