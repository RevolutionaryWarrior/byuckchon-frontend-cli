import fs from 'node:fs/promises';
import path from 'node:path';
import { exec as execCallback } from 'node:child_process';
import { promisify } from 'node:util';

import chalk from 'chalk';

import { versions } from '../constants/versions.js';
import { readSettingsAsset, readSettingsJson } from '../utils/settingsAssets.js';
import { scaffoldApiConventionDoc } from './apiConventionDoc.js';
import { createBcConfig } from './createBcConfig.js';
import { CACHE_CONFIG_TS } from './createFolders.js';
import { formatGeneratedFiles } from './install.js';
import { scaffoldReviewAutomation } from './scaffoldReviewAutomation.js';

const exec = promisify(execCallback);

/**
 * Mobile(React Native + Expo) 단일 프로젝트.
 *
 * 앱 뼈대는 직접 만들지 않고 공식 create-expo-app(default 템플릿)에 맡긴다.
 * Expo 는 SDK 마다 구조가 바뀌어서 우리가 따라가며 고치는 비용이 크다.
 * bc 는 그 위에 팀 파일만 덮어쓴다(overlay).
 *
 *   1. create-expo-app           — 템플릿 (+ Expo 가 관리하는 AGENTS.md)
 *   2. app.json 에 bc init 값     — 이름 · 번들 ID · scheme
 *   3. eas init (선택)           — 로그인돼 있으면 projectId 를 app.json 에 받는다
 *   4. overlay                    — app.json → app.config.ts, NativeWind, src/*, 설정 파일
 *   5. 설치 · 포맷
 *
 * eas init 을 overlay 보다 먼저 하는 이유: eas 는 app.config.ts(동적 설정)에는 projectId 를
 * 직접 써 넣지 못한다. 정적인 app.json 일 때 받아 두고, overlay 가 app.config.ts 로 옮긴다.
 *
 * @param {object} config
 * @param {string} config.projectName 폴더 이름 · slug
 * @param {string} config.appName     앱 표시 이름 (한글 가능)
 * @param {string} config.bundleId    iOS bundleIdentifier · Android package
 * @param {string} config.scheme      딥링크 scheme
 * @param {boolean} config.linkEas    EAS 프로젝트 연결 여부
 * @returns {Promise<{ todos: string[] }>} 끝나고 사람이 해야 할 일
 */
export async function createExpoProject(config) {
  const rootDir = path.resolve(config.projectName);
  await assertNotExists(rootDir);

  console.log(chalk.dim('  create-expo-app 실행 중... (default 템플릿)'));
  // 설치는 overlay 뒤에 한 번만 한다.
  await exec(
    `npx --yes create-expo-app@latest ${config.projectName} --template default --no-install --yes`,
  );

  await applyBcIdentity(rootDir, config);

  const eas = config.linkEas ? await linkEas(rootDir) : { linked: false, reason: '건너뜀' };

  await overlayExpoFiles(rootDir, config);
  await createBcConfig(rootDir, { ...config, framework: 'expo' });
  await scaffoldApiConventionDoc({ projectRoot: rootDir, framework: 'expo' });
  await scaffoldReviewAutomation({ projectRoot: rootDir, projectType: 'single' });

  await installExpoDeps(rootDir);
  await formatGeneratedFiles({ cwd: rootDir, command: 'npm run format' });

  return { todos: remainingTodos({ eas }) };
}

async function assertNotExists(rootDir) {
  try {
    await fs.access(rootDir);
  } catch {
    return;
  }
  throw Object.assign(new Error('already exists'), { code: 'EEXIST', path: rootDir });
}

async function readJson(filePath) {
  return JSON.parse(await fs.readFile(filePath, 'utf8'));
}

async function write(filePath, content) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, content, 'utf8');
}

// ─── 2. bc init 값 ─────────────────────────────────────────────────────────────

/** 템플릿 app.json 에 bc init 에서 받은 값을 넣는다. (eas init 이 이 값을 읽는다) */
export async function applyBcIdentity(rootDir, config) {
  const appJsonPath = path.join(rootDir, 'app.json');
  const appJson = await readJson(appJsonPath);
  const expo = appJson.expo ?? {};

  expo.name = config.appName;
  expo.slug = config.projectName;
  expo.scheme = config.scheme;
  expo.ios = { ...expo.ios, bundleIdentifier: config.bundleId };
  expo.android = { ...expo.android, package: config.bundleId };

  await write(appJsonPath, JSON.stringify({ ...appJson, expo }, null, 2) + '\n');
}

// ─── 3. EAS ───────────────────────────────────────────────────────────────────

/**
 * `eas whoami` 로 로그인을 확인하고, 되어 있으면 `eas init` 으로 EAS 프로젝트를 만든다.
 * eas 가 없거나 로그인 전이면 건너뛰고 남은 할 일로 넘긴다. (생성은 실패로 보지 않는다)
 * @returns {Promise<{ linked: boolean, reason?: string }>}
 */
async function linkEas(rootDir) {
  try {
    const { stdout } = await exec('eas whoami', { cwd: rootDir });
    console.log(chalk.green(`  ✓ eas whoami — ${stdout.trim().split('\n')[0]}`));
  } catch {
    console.log(chalk.yellow('  ⚠ eas CLI 가 없거나 로그인 전이라 EAS 연결을 건너뜁니다.'));
    return { linked: false, reason: '로그인 전' };
  }

  try {
    console.log(chalk.dim('  eas init 실행 중...'));
    await exec('eas init --non-interactive --force', { cwd: rootDir });
    const { expo } = await readJson(path.join(rootDir, 'app.json'));
    if (expo?.extra?.eas?.projectId) return { linked: true };
    return { linked: false, reason: 'projectId 를 받지 못함' };
  } catch (err) {
    console.log(chalk.yellow('  ⚠ eas init 실패 — 나중에 직접 연결하세요.'));
    console.log(chalk.dim(`    ${String(err?.message ?? err).split('\n')[0]}`));
    return { linked: false, reason: 'eas init 실패' };
  }
}

// ─── 4. overlay ───────────────────────────────────────────────────────────────

/** 템플릿의 데모 화면들. bc 의 첫 화면으로 바꾸므로 지운다. (reset-project 스크립트와 같은 일) */
const TEMPLATE_DEMO_PATHS = [
  'src/app/explore.tsx',
  'src/components',
  'src/constants',
  'src/hooks',
  'scripts',
  'assets/images/tabIcons',
  'assets/images/expo-badge.png',
  'assets/images/expo-badge-white.png',
  'assets/images/expo-logo.png',
  'assets/images/logo-glow.png',
  'assets/images/react-logo.png',
  'assets/images/react-logo@2x.png',
  'assets/images/react-logo@3x.png',
  'assets/images/tutorial-web.png',
];

/**
 * DOM 을 전제로 한 사내 hooks. RN 에서 쓰면 런타임에 터진다.
 * NOTE: 스냅샷이다. hooks 패키지가 RN 대응 여부를 export 에 표시하게 되면 그걸 읽는다.
 */
export const DOM_ONLY_HOOKS = [
  'useAutoFocus',
  'useDetectClose',
  'useFileUpload',
  'useImpressionRef',
  'useInfiniteScroll',
  'useInstallPWA',
  'useIntersectionObserver',
  'usePullToRefresh',
  'useScrollTop',
  'useScrollToSelectedItem',
  'useVisibilityEvent',
];

/**
 * create-expo-app 결과 위에 bc 파일을 얹는다. 네트워크를 쓰지 않는다.
 * @param {string} rootDir create-expo-app 이 만든 폴더
 * @param {object} config  createExpoProject 와 같음
 */
export async function overlayExpoFiles(rootDir, config) {
  for (const rel of TEMPLATE_DEMO_PATHS) {
    await fs.rm(path.join(rootDir, rel), { recursive: true, force: true });
  }

  // app.json → app.config.ts (값은 그대로 옮기고 app.json 은 지운다)
  const appJsonPath = path.join(rootDir, 'app.json');
  const { expo } = await readJson(appJsonPath);
  await write(path.join(rootDir, 'app.config.ts'), renderAppConfig(expo));
  await fs.rm(appJsonPath);

  await write(path.join(rootDir, 'eas.json'), JSON.stringify(EAS_JSON, null, 2) + '\n');
  await write(path.join(rootDir, '.env.example'), ENV_EXAMPLE);
  await patchGitignore(rootDir);
  await patchPackageJson(rootDir);

  // AGENTS.md — Expo 가 쓴 내용은 그대로 두고 아래에 이어붙인다.
  const expoAgents = await fs.readFile(path.join(rootDir, 'AGENTS.md'), 'utf8').catch(() => '');
  await write(
    path.join(rootDir, 'AGENTS.md'),
    (expoAgents ? `${expoAgents.trimEnd()}\n\n---\n\n` : '') + bcAgentsSection(),
  );
  await write(path.join(rootDir, 'CLAUDE.md'), '@AGENTS.md\n');

  // NativeWind
  await write(path.join(rootDir, 'tailwind.config.js'), TAILWIND_CONFIG_JS);
  await write(path.join(rootDir, 'babel.config.js'), BABEL_CONFIG_JS);
  await write(path.join(rootDir, 'metro.config.js'), METRO_CONFIG_JS);
  await write(path.join(rootDir, 'nativewind-env.d.ts'), NATIVEWIND_ENV_D_TS);
  await write(path.join(rootDir, 'src/global.css'), GLOBAL_CSS);

  // settings — eslint · prettier 는 그대로, tsconfig 는 Expo 위에 공통 규칙만 얹는다.
  await write(path.join(rootDir, 'eslint.config.mjs'), ESLINT_CONFIG_MJS);
  await write(path.join(rootDir, 'prettier.config.mjs'), PRETTIER_CONFIG_MJS);
  await patchTsconfig(rootDir);
  await write(path.join(rootDir, '.nvmrc'), await readSettingsAsset('project/nvmrc'));
  await write(
    path.join(rootDir, '.vscode/settings.json'),
    JSON.stringify(await readSettingsJson('vscode'), null, 2) + '\n',
  );

  // src
  await write(path.join(rootDir, 'src/app/_layout.tsx'), LAYOUT_TSX);
  await write(path.join(rootDir, 'src/app/index.tsx'), INDEX_TSX);
  await write(path.join(rootDir, 'src/api/instance.ts'), API_INSTANCE_TS);
  await write(path.join(rootDir, 'src/api/index.ts'), '// 리소스 폴더를 만들면 여기서 export 합니다.\nexport {};\n');
  await write(path.join(rootDir, 'src/lib/query/cacheConfig.ts'), CACHE_CONFIG_TS);
  await write(path.join(rootDir, 'src/lib/query/queryClient.ts'), QUERY_CLIENT_TS);
  await write(
    path.join(rootDir, 'src/lib/query/index.ts'),
    "export { cacheConfig } from './cacheConfig';\nexport { queryClient } from './queryClient';\n",
  );
  await write(path.join(rootDir, 'src/lib/utils/cn.ts'), CN_TS);
  await write(path.join(rootDir, 'src/lib/utils/index.ts'), "export { cn } from './cn';\n");
  await write(path.join(rootDir, 'src/lib/index.ts'), "export * from './query';\nexport * from './utils';\n");
  await write(path.join(rootDir, 'src/components/index.ts'), '// 재사용 가능한 UI 컴포넌트\nexport {};\n');
  await write(path.join(rootDir, 'src/hooks/index.ts'), '// 커스텀 훅\nexport {};\n');
  await write(path.join(rootDir, 'src/store/index.ts'), '// Zustand 스토어\nexport {};\n');
}

// ─── app.config.ts ────────────────────────────────────────────────────────────

function tsString(value) {
  return `'${String(value).replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
}

function tsKey(key) {
  return /^[A-Za-z_$][\w$]*$/.test(key) ? key : tsString(key);
}

/** JSON 값을 TS 객체 리터럴로. (줄바꿈은 대충 — 생성 뒤 prettier 가 정리한다) */
function tsValue(value, depth) {
  const pad = '  '.repeat(depth);
  if (Array.isArray(value)) {
    if (!value.length) return '[]';
    return `[\n${value.map((v) => `${pad}  ${tsValue(v, depth + 1)},`).join('\n')}\n${pad}]`;
  }
  if (value && typeof value === 'object') {
    return `{\n${tsEntries(value, depth + 1)}\n${pad}}`;
  }
  return typeof value === 'string' ? tsString(value) : JSON.stringify(value);
}

function tsEntries(obj, depth, comments = {}) {
  const pad = '  '.repeat(depth);
  return Object.entries(obj)
    .filter(([, v]) => v !== undefined)
    .map(([k, v]) => {
      const comment = comments[k] ? ` // ${comments[k]}` : '';
      return `${pad}${tsKey(k)}: ${tsValue(v, depth)},${comment}`;
    })
    .join('\n');
}

/**
 * app.json 의 expo 객체를 app.config.ts 로 옮긴다.
 * bc init 이 넣은 값에는 `// bc init`, eas init 이 넣은 값에는 `// eas init` 을 단다.
 */
export function renderAppConfig(expo) {
  const {
    name,
    slug,
    scheme,
    owner,
    ios = {},
    android = {},
    plugins = [],
    extra = {},
    ...rest
  } = expo;
  const { bundleIdentifier, ...iosRest } = ios;
  const { package: androidPackage, ...androidRest } = android;
  const { eas = {}, ...extraRest } = extra;
  const { projectId, ...easRest } = eas;

  // expo-router 는 default 템플릿에 이미 있지만, 템플릿이 바뀌어도 빠지지 않게 한다.
  const hasRouter = plugins.some((p) => (Array.isArray(p) ? p[0] : p) === 'expo-router');
  const allPlugins = hasRouter ? plugins : ['expo-router', ...plugins];

  const projectIdLine = projectId
    ? `      projectId: ${tsString(projectId)}, // eas init`
    : `      // eas init — 아직 연결 전. 연결하면 받은 projectId 를 여기에 넣으세요.
      projectId: undefined,`;

  return `import type { ConfigContext, ExpoConfig } from 'expo/config';

/**
 * 앱 설정. app.json 대신 이 파일 하나만 씁니다.
 *
 * create-expo-app 템플릿 값을 옮겨 왔고, 아래 표시가 붙은 값은 따로 들어간 것입니다.
 *   // bc init  — bc init 에서 입력한 값
 *   // eas init — EAS 프로젝트 연결로 받은 값
 *
 * 환경별로 값을 바꿔야 하면 process.env.EXPO_PUBLIC_* 를 읽어 분기하세요.
 */
export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
${tsEntries({ name, slug, scheme }, 1, { name: 'bc init', slug: 'bc init', scheme: 'bc init' })}
${owner ? `  owner: ${tsString(owner)}, // eas init\n` : ''}${tsEntries(rest, 1)}
  ios: {
${tsEntries(iosRest, 2)}
    bundleIdentifier: ${tsString(bundleIdentifier)}, // bc init
  },
  android: {
${tsEntries(androidRest, 2)}
    package: ${tsString(androidPackage)}, // bc init
  },
  plugins: ${tsValue(allPlugins, 1)},
  extra: {
${tsEntries(extraRest, 2)}
    eas: {
${tsEntries(easRest, 3)}
${projectIdLine}
    },
  },
});
`.replace(/\n\n(?= )/g, '\n'); // 비어 있는 tsEntries 가 남긴 빈 줄 제거
}

// ─── 고정 파일 ────────────────────────────────────────────────────────────────

const EAS_JSON = {
  cli: { version: '>= 16.0.0', appVersionSource: 'remote' },
  build: {
    preview: { distribution: 'internal' },
    production: { autoIncrement: true },
  },
  submit: { production: {} },
};

const ENV_EXAMPLE = `# cp .env.example .env
# EXPO_PUBLIC_* 는 앱 번들에 그대로 들어갑니다. 비밀값(서버 키 등)은 넣지 마세요.

EXPO_PUBLIC_API_BASE_URL=
EXPO_PUBLIC_SENTRY_DSN=
`;

const TAILWIND_CONFIG_JS = `/**
 * NativeWind(Tailwind for RN) 설정.
 *
 * NativeWind v4 는 Tailwind v3 를 쓴다. (웹 프로젝트는 Tailwind v4)
 * 색 · 간격 · 타이포는 theme.extend 의 토큰으로만 늘린다. hex 를 컴포넌트에 직접 쓰지 않는다.
 * TODO: settings 가 디자인 토큰을 NativeWind preset 으로도 내보내면 presets 에 추가
 *
 * @type {import('tailwindcss').Config}
 */
module.exports = {
  content: ['./src/**/*.{ts,tsx}'],
  presets: [require('nativewind/preset')],
  theme: {
    extend: {},
  },
  plugins: [],
};
`;

const BABEL_CONFIG_JS = `// NativeWind 가 className 을 RN 스타일로 바꾸려면 jsxImportSource 와 babel 프리셋이 필요하다.
module.exports = function (api) {
  api.cache(true);
  return {
    presets: [
      ['babel-preset-expo', { jsxImportSource: 'nativewind' }],
      'nativewind/babel',
    ],
  };
};
`;

const METRO_CONFIG_JS = `const { getDefaultConfig } = require('expo/metro-config');
const { withNativeWind } = require('nativewind/metro');

const config = getDefaultConfig(__dirname);

module.exports = withNativeWind(config, { input: './src/global.css' });
`;

const NATIVEWIND_ENV_D_TS = `/// <reference types="nativewind/types" />

// _layout.tsx 의 \`import '@/global.css'\` (NativeWind 진입 CSS)
declare module '*.css';
`;

const GLOBAL_CSS = `@tailwind base;
@tailwind components;
@tailwind utilities;
`;

const ESLINT_CONFIG_MJS = `import byuckchon from '@byuckchon-frontend/settings/eslint/react';

/**
 * 규칙 본체는 @byuckchon-frontend/settings 가 관리합니다. (React 규칙을 RN 에도 그대로 씁니다)
 * \`npx expo lint\` 도 이 파일을 읽습니다.
 * 프로젝트 예외는 뒤에 이어붙이세요.
 */
export default [
  ...byuckchon,
  {
    // Expo 가 만드는 파일 · CommonJS 설정 파일
    ignores: ['.expo/**', 'expo-env.d.ts', '*.config.js'],
  },
];
`;

const PRETTIER_CONFIG_MJS = `import byuckchon from '@byuckchon-frontend/settings/prettier';

/** 프로젝트 예외가 필요하면 펼쳐서 덮어쓰세요. (예: printWidth: 100) */
export default byuckchon;
`;

const LAYOUT_TSX = `import { QueryClientProvider } from '@tanstack/react-query';
import { Stack } from 'expo-router';

import '@/global.css';
import { queryClient } from '@/lib/query';

export default function RootLayout() {
  return (
    <QueryClientProvider client={queryClient}>
      <Stack />
    </QueryClientProvider>
  );
}
`;

const INDEX_TSX = `import Constants from 'expo-constants';
import * as Haptics from 'expo-haptics';
import { Pressable, Text, View } from 'react-native';

export default function HomeScreen() {
  const handlePress = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
  };

  return (
    <View className="flex-1 items-center justify-center gap-6 bg-white">
      <Text className="text-2xl font-bold">{Constants.expoConfig?.name}</Text>
      <Pressable
        onPress={handlePress}
        className="rounded-xl bg-black px-6 py-3 active:opacity-70"
      >
        <Text className="text-base font-semibold text-white">진동 확인</Text>
      </Pressable>
    </View>
  );
}
`;

const API_INSTANCE_TS = `import axios from 'axios';

/**
 * 모든 API 호출이 쓰는 axios 인스턴스. (src/api/api-codegen.md 의 React 규칙)
 * 주소는 .env 의 EXPO_PUBLIC_API_BASE_URL 에서 읽습니다.
 */
const baseInstance = axios.create({
  baseURL: process.env.EXPO_PUBLIC_API_BASE_URL,
  timeout: 10_000,
});

export default baseInstance;
`;

const QUERY_CLIENT_TS = `import { QueryClient } from '@tanstack/react-query';

// NOTE: 앱이 foreground 로 돌아올 때 refetch 하려면 AppState 로 focusManager 를 연결하세요.
//   https://tanstack.com/query/latest/docs/framework/react/react-native
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
    },
  },
});
`;

const CN_TS = `// 클래스 병합은 @byuckchon-frontend/utils 가 관리합니다. (웹 프로젝트와 같은 cn)
// twMerge 기본 설정은 타이포그래피 유틸(text-body-sm-regular 등)을 글자 색으로 분류해서
// 색과 함께 쓰면 타이포가 조용히 사라집니다. utils 의 cn 은 그 부분을 고쳐둔 것입니다.
export { cn } from '@byuckchon-frontend/utils';
`;

function bcAgentsSection() {
  return `# byuckchon (bc 가 추가)

위 Expo 안내는 Expo 가 관리하므로 고치지 않습니다. 아래는 팀 규칙입니다.
lint · typecheck 등 명령은 위 **Commands** 를 따릅니다.
앱 설정은 \`app.json\` 이 아니라 \`app.config.ts\` 입니다. 위 안내의 app.json 은 app.config.ts 로 읽으세요.

## Figma → 코드

- 색 · 간격 · 글자는 \`tailwind.config.js\` 의 **토큰 클래스만** 씁니다.
- \`#1A1A1A\` 같은 hex, \`style={{ color: ... }}\` 직접 지정은 금지입니다.
- 토큰에 없는 값이 필요하면 만들지 말고 \`// TODO:\` 로 남겨 디자이너 확인을 받습니다.

## API

- 타입은 \`bc gen api-types\` 로 \`src/api/types.gen.ts\` 에 생성합니다. 직접 고치지 말고 다시 생성합니다.
- 호출 코드는 \`src/api/api-codegen.md\` 의 **React 규칙**(axios · \`src/api/instance.ts\`)을 따릅니다.
- 서버 주소는 \`.env\` 의 \`EXPO_PUBLIC_API_BASE_URL\`. \`EXPO_PUBLIC_*\` 은 앱에 그대로 들어가니 비밀값 금지.

## 스타일

- NativeWind(\`className\`)로 씁니다. \`StyleSheet.create\` 는 className 으로 안 되는 경우(애니메이션 값 등)만.
- 클래스 병합은 \`@/lib/utils\` 의 \`cn\`.
- 웹 전용 클래스(\`hover:\`, settings 의 \`motion-*\`)는 RN 에서 동작하지 않습니다.

## 에러

- 치명적인 에러인지 \`isCriticalError\` 로 판정하고, 치명적인 것만 Sentry(\`EXPO_PUBLIC_SENTRY_DSN\`)로 보냅니다.
- 둘 중 아직 연결되지 않은 게 있으면 직접 만들지 말고 \`// TODO:\` 로 남깁니다.

## 사내 패키지

- \`@byuckchon-frontend/hooks\` · \`utils\` 는 씁니다. \`core\` · \`basic-ui\` 는 DOM 전용이라 설치하지 않았습니다.
- DOM 을 쓰는 hooks — **RN 에서 쓰지 않습니다**:
  ${DOM_ONLY_HOOKS.map((h) => `\`${h}\``).join(', ')}
- utils 의 \`sanitizeHtml\` · \`editorUtils\` · \`userAgent\` 도 브라우저 전제입니다.

## 협업

- 커밋은 \`<type>: <요약>\`, 브랜치는 \`<type>/<작업 요약>/<작업자>\`.
- 리뷰어가 봐야 할 곳은 코드 옆에 \`NOTE:\` · \`TODO:\` 주석으로 남깁니다. PR 본문 "확인 사항"에 자동으로 모입니다.
`;
}

// ─── 기존 파일 수정 ───────────────────────────────────────────────────────────

async function patchGitignore(rootDir) {
  const file = path.join(rootDir, '.gitignore');
  const current = await fs.readFile(file, 'utf8').catch(() => '');
  await write(file, `${current.trimEnd()}\n\n# env (bc)\n.env\n!.env.example\n`);
}

/**
 * Expo 의 tsconfig(expo/tsconfig.base)를 기준으로 두고, settings 의 공통 규칙을 먼저 깐다.
 * extends 배열은 뒤가 이기므로 RN 에 맞춰진 Expo 값(lib · jsx · moduleResolution 등)이 우선한다.
 * settings 의 react.json 은 DOM lib · Vite 전제라 RN 에 맞지 않아 base 만 쓴다.
 */
async function patchTsconfig(rootDir) {
  const file = path.join(rootDir, 'tsconfig.json');
  const tsconfig = await readJson(file);
  const expoBase = tsconfig.extends ?? 'expo/tsconfig.base';
  tsconfig.extends = ['@byuckchon-frontend/settings/tsconfig/base.json', expoBase];
  tsconfig.include = [...new Set([...(tsconfig.include ?? []), 'nativewind-env.d.ts'])];
  await write(file, JSON.stringify(tsconfig, null, 2) + '\n');
}

/** NativeWind v4 가 요구하는 Tailwind 버전. settings 매트릭스의 tailwindcss 는 웹용 v4 다. */
const NATIVEWIND_TAILWIND = '^3.4.17';

/** Expo SDK 와 짝이 맞아야 하는 패키지. 버전은 `npx expo install` 이 고른다. */
const EXPO_MANAGED_PACKAGES = ['nativewind', 'expo-haptics'];

const MOBILE_BYUCKCHON_PACKAGES = ['@byuckchon-frontend/hooks', '@byuckchon-frontend/utils'];

async function patchPackageJson(rootDir) {
  const file = path.join(rootDir, 'package.json');
  const pkg = await readJson(file);

  const { 'reset-project': _resetProject, ...scripts } = pkg.scripts ?? {};
  const formatTargets = '"src/**/*.{ts,tsx,css}" "*.{ts,js,mjs}" eas.json "tools/**/*.{js,cjs,mjs,json,md}"';
  pkg.scripts = {
    ...scripts,
    typecheck: 'tsc --noEmit',
    // PR Check 의 Build 단계 — 네이티브 빌드 없이 JS 번들이 만들어지는지만 본다.
    build: 'expo export --platform ios --platform android',
    format: `prettier --write ${formatTargets} --no-error-on-unmatched-pattern`,
    'format:check': `prettier --check ${formatTargets} --no-error-on-unmatched-pattern`,
  };

  pkg.dependencies = {
    ...pkg.dependencies,
    '@tanstack/react-query': versions['@tanstack/react-query'],
    axios: versions.axios,
    zustand: versions.zustand,
    zod: versions.zod,
    clsx: versions.clsx,
    'tailwind-merge': versions['tailwind-merge'],
  };
  pkg.devDependencies = {
    ...pkg.devDependencies,
    '@byuckchon-frontend/settings': versions['@byuckchon-frontend/settings'],
    '@trivago/prettier-plugin-sort-imports': versions['@trivago/prettier-plugin-sort-imports'],
    eslint: versions.eslint,
    prettier: versions.prettier,
    'prettier-plugin-tailwindcss': versions['prettier-plugin-tailwindcss'],
    tailwindcss: NATIVEWIND_TAILWIND,
  };

  await write(file, JSON.stringify(pkg, null, 2) + '\n');
}

// ─── 5. 설치 ──────────────────────────────────────────────────────────────────

async function installExpoDeps(rootDir) {
  console.log(chalk.dim('  의존성 설치 중... (잠시 걸릴 수 있어요)'));
  await exec('npm install', { cwd: rootDir });
  await exec(`npx expo install ${EXPO_MANAGED_PACKAGES.join(' ')}`, { cwd: rootDir });
  await exec(`npm install ${MOBILE_BYUCKCHON_PACKAGES.join(' ')}`, { cwd: rootDir });
}

// ─── 남은 할 일 ───────────────────────────────────────────────────────────────

function remainingTodos({ eas }) {
  const todos = [
    'cp .env.example .env  후 EXPO_PUBLIC_API_BASE_URL 채우기',
    '아이콘 · 스플래시 교체 (디자이너) — assets/images/icon.png, splash-icon.png, android-icon-*, assets/expo.icon',
    '스토어 계정 연결 — npx eas-cli@latest credentials',
  ];
  if (!eas.linked) {
    todos.push(
      `EAS 연결 (${eas.reason}) — npx eas-cli@latest init 후 projectId 를 app.config.ts 의 extra.eas.projectId 에`,
    );
  }
  return todos;
}
