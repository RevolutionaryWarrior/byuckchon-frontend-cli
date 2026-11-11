import fs from 'node:fs/promises';
import path from 'node:path';

import { versions } from '../constants/versions.js';
import { readSettingsAsset } from '../utils/settingsAssets.js';
import { scaffoldApiConventionDoc } from './apiConventionDoc.js';
import {
  agentsDoc,
  createEslintConfig,
  createGitignore,
  createPrettierConfig,
  createVscodeSettings,
} from './createBaseFiles.js';
import { createFolders } from './createFolders.js';

/**
 * Electron(electron-vite) 단일 프로젝트를 만든다.
 *
 *   src/main       메인 프로세스 — BrowserWindow, IPC 핸들러
 *   src/preload    contextBridge 로 window.api 만 노출
 *   src/renderer   웹 React 와 같은 구조 · 같은 규칙 (src/renderer/src 아래)
 *
 * renderer 폴더 · eslint · prettier · tokens · AGENTS.md 는 웹 React 생성기를 그대로 재사용하고,
 * Electron 에만 있는 것(main · preload · 빌드 · 패키징 설정)만 여기서 만든다.
 *
 * bc.config.json · PR 리뷰 자동화 · 의존성 설치는 호출자(createProject)가 공통으로 처리한다.
 */
export async function createElectronProject(rootDir, config) {
  const rendererRoot = path.join(rootDir, 'src/renderer');

  // renderer 는 웹 React 와 같은 폴더 구조(lib · store · api · hooks · ...)를 쓴다.
  await createFolders(rendererRoot, { ...config, framework: 'react' });
  await scaffoldApiConventionDoc({ projectRoot: rootDir, framework: 'electron' });

  await createPackageJson(rootDir, config);
  await createConfigFiles(rootDir, config);
  await createMainFiles(rootDir);
  await createPreloadFiles(rootDir);
  await createRendererFiles(rendererRoot, config);
  await createReadme(rootDir, config);
}

async function write(filePath, content) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, content, 'utf-8');
}

function json(value) {
  return JSON.stringify(value, null, 2) + '\n';
}

// ─── package.json ─────────────────────────────────────────────────────────────

const FORMAT_GLOBS =
  '"src/**/*.{ts,tsx,css}" "tools/**/*.{js,cjs,mjs,json,md}" --no-error-on-unmatched-pattern';

async function createPackageJson(rootDir, config) {
  const pkg = {
    name: config.projectName,
    version: '0.0.1',
    private: true,
    type: 'module',
    description: `${config.projectName} desktop app`,
    // electron-vite 가 빌드한 메인 프로세스 진입점
    main: './out/main/index.js',
    scripts: {
      dev: 'electron-vite dev',
      build: 'electron-vite build',
      preview: 'electron-vite preview',
      // 설치 파일을 만들기 전에 항상 새로 빌드한다. (out/ 이 오래된 채로 패키징되는 것 방지)
      'package:mac': 'npm run build && electron-builder --mac',
      'package:win': 'npm run build && electron-builder --win',
      'tokens:build': 'style-dictionary build --config token.config.js',
      // PR Check workflow 가 format:check / lint / typecheck / build 를 각각 호출한다.
      typecheck: 'tsc -b',
      lint: 'eslint .',
      format: `prettier --write ${FORMAT_GLOBS}`,
      'format:check': `prettier --check ${FORMAT_GLOBS}`,
    },
    // dependencies 는 "main 프로세스가 런타임에 require 하는 패키지"만 둔다.
    // electron-builder 는 dependencies 를 node_modules 째로 앱에 넣고,
    // renderer 쪽 패키지(react 등)는 Vite 가 번들에 이미 포함하므로 devDependencies 에 둔다.
    dependencies: {},
    devDependencies: {
      // renderer — 웹 React 와 같은 스택
      react: versions.react,
      'react-dom': versions['react-dom'],
      zustand: versions.zustand,
      '@tanstack/react-query': versions['@tanstack/react-query'],
      axios: versions.axios,
      zod: versions.zod,
      clsx: versions.clsx,
      'tailwind-merge': versions['tailwind-merge'],

      // Electron
      electron: versions.electron,
      'electron-vite': versions['electron-vite'],
      'electron-builder': versions['electron-builder'],

      // 빌드 · 린트 · 포맷 — 웹 React 와 동일
      '@byuckchon-frontend/settings': versions['@byuckchon-frontend/settings'],
      '@trivago/prettier-plugin-sort-imports':
        versions['@trivago/prettier-plugin-sort-imports'],
      '@tailwindcss/vite': versions['@tailwindcss/vite'],
      '@types/node': versions['@types/node'],
      '@types/react': versions['@types/react'],
      '@types/react-dom': versions['@types/react-dom'],
      '@vitejs/plugin-react': versions['@vitejs/plugin-react'],
      eslint: versions.eslint,
      prettier: versions.prettier,
      'prettier-plugin-tailwindcss': versions['prettier-plugin-tailwindcss'],
      'style-dictionary': versions['style-dictionary'],
      tailwindcss: versions.tailwindcss,
      typescript: versions.typescript,
      vite: versions.vite,
      'vite-plugin-svgr': versions['vite-plugin-svgr'],
    },
  };

  await write(path.join(rootDir, 'package.json'), json(pkg));
}

// ─── 루트 설정 파일 ───────────────────────────────────────────────────────────

async function createConfigFiles(rootDir, config) {
  await write(
    path.join(rootDir, 'electron.vite.config.ts'),
    `import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'electron-vite';
import { resolve } from 'node:path';
import svgr from 'vite-plugin-svgr';

// https://electron-vite.org/config/
export default defineConfig({
  main: {},
  preload: {
    build: {
      rollupOptions: {
        // sandbox: true 인 preload 는 ESM 을 못 읽는다. CommonJS 로 내보낸다.
        output: { format: 'cjs', entryFileNames: '[name].cjs' },
      },
    },
  },
  renderer: {
    plugins: [react(), tailwindcss(), svgr({ svgrOptions: { icon: true } })],
    resolve: {
      alias: {
        '@': resolve('src/renderer/src'),
        '@icons': resolve('src/renderer/src/assets/icons'),
        '@images': resolve('src/renderer/src/assets/images'),
      },
    },
  },
});
`,
  );

  await write(
    path.join(rootDir, 'electron-builder.yml'),
    `# 설치 파일 설정 — https://www.electron.build/configuration
#   npm run package:mac   → dist/*.dmg
#   npm run package:win   → dist/*.exe (NSIS)

appId: com.byuckchon.${config.projectName.replace(/[^a-z0-9]/gi, '').toLowerCase()}
productName: ${config.projectName}

directories:
  # 아이콘(icon.icns · icon.ico · icon.png)을 이 폴더에 둔다.
  buildResources: build
  output: dist

# 빌드 결과(out/)만 앱에 넣는다. 소스 · 설정 파일은 들어가지 않는다.
files:
  - out/**
  - package.json

mac:
  target: dmg
  category: public.app-category.productivity
  # TODO: 배포 전 코드 서명 · 공증 — CSC_LINK / APPLE_ID 등 환경 변수로 넣는다. (README 참고)

win:
  target: nsis

nsis:
  oneClick: false
  allowToChangeInstallationDirectory: true

# TODO: 자동 업데이트를 쓰면 publish 를 설정하고 main 에서 electron-updater 를 호출한다.
publish: null
`,
  );

  // tsconfig — node 쪽(main · preload · 빌드 설정)과 web 쪽(renderer)을 나눈다.
  // 공통 옵션은 @byuckchon-frontend/settings 프리셋이 관리한다.
  await write(
    path.join(rootDir, 'tsconfig.json'),
    json({
      files: [],
      references: [{ path: './tsconfig.node.json' }, { path: './tsconfig.web.json' }],
    }),
  );

  await write(
    path.join(rootDir, 'tsconfig.node.json'),
    json({
      extends: '@byuckchon-frontend/settings/tsconfig/node.json',
      compilerOptions: {
        tsBuildInfoFile: './node_modules/.tmp/tsconfig.node.tsbuildinfo',
        // electron-vite 가 번들하므로 Node 의 모듈 해석 대신 번들러 규칙을 쓴다.
        module: 'ESNext',
        moduleResolution: 'Bundler',
      },
      include: ['electron.vite.config.ts', 'src/main/**/*', 'src/preload/**/*'],
    }),
  );

  await write(
    path.join(rootDir, 'tsconfig.web.json'),
    json({
      extends: '@byuckchon-frontend/settings/tsconfig/react.json',
      compilerOptions: {
        tsBuildInfoFile: './node_modules/.tmp/tsconfig.web.tsbuildinfo',
        // baseUrl 없이 paths 만 쓴다. (TypeScript 7 에서 baseUrl 제거)
        paths: {
          '@/*': ['./src/renderer/src/*'],
          '@icons/*': ['./src/renderer/src/assets/icons/*'],
          '@images/*': ['./src/renderer/src/assets/images/*'],
        },
      },
      // window.api 타입(api.d.ts)은 preload 에 두고 renderer 가 함께 읽는다.
      include: ['src/renderer/src', 'src/preload/*.d.ts'],
    }),
  );

  await write(path.join(rootDir, '.nvmrc'), await readSettingsAsset('project/nvmrc'));
  await write(path.join(rootDir, 'AGENTS.md'), agentsDoc('electron'));
  await write(path.join(rootDir, 'CLAUDE.md'), '@AGENTS.md\n');

  // ESLint 는 웹 React 프리셋을 그대로 쓴다. (base 가 browser · node globals 를 모두 연다)
  await createPrettierConfig(rootDir);
  await createEslintConfig(rootDir);
  await createGitignore(rootDir, 'electron');
  await createVscodeSettings(rootDir);

  await write(
    path.join(rootDir, 'token.config.js'),
    `/**
 * 디자이너가 넘긴 src/renderer/src/tokens.json 을 tokens.css 로 변환하는 설정.
 *
 *   npm run tokens:build
 *
 * 변환 규칙은 @byuckchon-frontend/settings 가 관리한다. 경로만 renderer 로 옮겼다.
 */
import { defineTokenConfig } from '@byuckchon-frontend/settings/tokens';

export default defineTokenConfig({
  source: ['src/renderer/src/tokens.json'],
  buildPath: 'src/renderer/src/',
});
`,
  );

  await write(path.join(rootDir, 'build/.gitkeep'), '');
}

// ─── main ─────────────────────────────────────────────────────────────────────

async function createMainFiles(rootDir) {
  await write(
    path.join(rootDir, 'src/main/index.ts'),
    `import { app, BrowserWindow, ipcMain, shell } from 'electron';
import { join } from 'node:path';

function createWindow() {
  const mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    show: false,
    webPreferences: {
      preload: join(import.meta.dirname, '../preload/index.cjs'),
      // 보안 기본값 — renderer 는 OS 에 직접 접근하지 못하고 window.api 만 쓴다.
      // 끄지 마세요. 필요한 기능은 preload + ipcMain.handle 로 추가합니다. (AGENTS.md)
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
    },
  });

  mainWindow.on('ready-to-show', () => mainWindow.show());

  // window.open · target="_blank" 는 앱 안에서 열지 않고 기본 브라우저로 넘긴다.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://')) void shell.openExternal(url);
    return { action: 'deny' };
  });

  // 개발: electron-vite dev 서버(HMR) / 배포: 빌드된 파일
  const devServerUrl = process.env.ELECTRON_RENDERER_URL;
  if (!app.isPackaged && devServerUrl) {
    void mainWindow.loadURL(devServerUrl);
  } else {
    void mainWindow.loadFile(join(import.meta.dirname, '../renderer/index.html'));
  }
}

/**
 * renderer 가 window.api 로 부르는 기능들.
 * 새 기능 = 여기 handle 추가 + preload/index.ts + preload/api.d.ts. 입력값은 여기서 검증한다.
 */
function registerIpcHandlers() {
  // renderer ↔ main 연결 확인용
  ipcMain.handle('ping', () => 'pong');
}

void app.whenReady().then(() => {
  registerIpcHandlers();
  createWindow();

  // macOS: 창이 모두 닫힌 뒤 Dock 아이콘을 누르면 다시 연다.
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

// macOS 는 창을 닫아도 앱이 남아 있는 것이 관례다.
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
`,
  );
}

// ─── preload ──────────────────────────────────────────────────────────────────

async function createPreloadFiles(rootDir) {
  await write(
    path.join(rootDir, 'src/preload/index.ts'),
    `import { contextBridge, ipcRenderer } from 'electron';

/**
 * renderer 에 노출하는 기능 목록. ipcRenderer 를 통째로 넘기지 말고 기능 하나당 함수 하나만 둔다.
 * 타입을 Window['api'] 로 묶어서, api.d.ts 와 어긋나면 typecheck 가 실패한다.
 */
const api: Window['api'] = {
  ping: () => ipcRenderer.invoke('ping'),
};

contextBridge.exposeInMainWorld('api', api);
`,
  );

  await write(
    path.join(rootDir, 'src/preload/api.d.ts'),
    `/**
 * renderer 에서 쓰는 window.api 의 타입.
 * preload/index.ts 의 api 객체와 main 의 ipcMain.handle 채널이 이 모양을 따른다.
 */
declare global {
  interface Window {
    api: {
      /** main 연결 확인 — 'pong' 을 돌려준다. */
      ping: () => Promise<string>;
    };
  }
}

export {};
`,
  );
}

// ─── renderer ─────────────────────────────────────────────────────────────────

async function createRendererFiles(rendererRoot, config) {
  await write(
    path.join(rendererRoot, 'index.html'),
    `<!doctype html>
<html lang="ko">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <!--
      renderer 가 불러올 수 있는 출처를 제한한다.
      API 서버를 호출하면 connect-src 에 도메인을 추가하세요. (예: connect-src 'self' https://api.example.com)
    -->
    <meta
      http-equiv="Content-Security-Policy"
      content="default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'"
    />
    <title>${config.projectName}</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
`,
  );

  const src = path.join(rendererRoot, 'src');

  await write(
    path.join(src, 'App.css'),
    `@import 'tailwindcss';
@import "@byuckchon-frontend/settings/motion";
@import "./tokens.css";
`,
  );
  await write(path.join(src, 'tokens.css'), '');
  await write(path.join(src, 'tokens.json'), '{}\n');

  await write(
    path.join(src, 'main.tsx'),
    `import { createRoot } from 'react-dom/client';

import App from './App.tsx';

createRoot(document.getElementById('root')!).render(<App />);
`,
  );

  await write(path.join(src, 'vite-env.d.ts'), `/// <reference types="vite/client" />\n`);
  await write(
    path.join(src, 'global.d.ts'),
    `/// <reference types="@byuckchon-frontend/settings/types/svg-vite" />\n`,
  );

  await write(
    path.join(src, 'App.tsx'),
    `import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import Home from '@/pages/Home';

import './App.css';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      refetchOnMount: false,
      refetchOnReconnect: false,
    },
  },
});

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <Home />
    </QueryClientProvider>
  );
}

export default App;
`,
  );

  await write(
    path.join(src, 'pages/Home.tsx'),
    `import { useState } from 'react';

export default function Home() {
  const [reply, setReply] = useState<string | null>(null);

  // renderer 는 OS · main 에 직접 닿지 않는다. 항상 window.api 를 거친다.
  const handlePing = async () => {
    setReply(await window.api.ping());
  };

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 bg-gray-50">
      <h1 className="text-4xl font-bold text-gray-900">${config.projectName}</h1>
      <p className="text-gray-500">Electron + React + TypeScript + Tailwind</p>
      <button
        type="button"
        onClick={handlePing}
        className="motion-press rounded-md bg-gray-900 px-4 py-2 text-white"
      >
        main 연결 확인
      </button>
      {reply && <p className="text-gray-700">main 응답: {reply}</p>}
    </main>
  );
}
`,
  );
}

// ─── README ───────────────────────────────────────────────────────────────────

async function createReadme(rootDir, config) {
  await write(
    path.join(rootDir, 'README.md'),
    `# ${config.projectName}

## 기술 스택

| 항목 | 내용 |
|------|------|
| Desktop | Electron + electron-vite |
| Packaging | electron-builder (mac dmg · win nsis) |
| UI | React 18 + TypeScript + Tailwind CSS |
| State | Zustand · TanStack Query |
| Lint | ESLint + Prettier (@byuckchon-frontend/settings) |

## 시작하기

\`\`\`bash
npm install

npm run dev           # 앱 실행 (renderer HMR)
npm run build         # out/ 에 빌드
npm run package:mac   # dist/ 에 .dmg
npm run package:win   # dist/ 에 설치 .exe
\`\`\`

## 프로젝트 구조

\`\`\`
src/
├── main/          메인 프로세스 — 창 · 앱 생명주기 · IPC 핸들러 (Node / OS 접근)
├── preload/       window.api 를 renderer 에 노출 (index.ts) + 타입 (api.d.ts)
└── renderer/      화면 — 웹 React 와 같은 구조
    ├── index.html
    └── src/       lib · store · api · hooks · context · components · layouts · pages
build/             아이콘 등 패키징 리소스
\`\`\`

renderer 는 브라우저처럼 동작합니다. 파일 · OS 기능은 \`window.api\` 를 통해서만 main 에 요청합니다.
규칙은 \`AGENTS.md\` 의 "Electron IPC 규칙" 을 보세요.

## 개발자가 채우는 것

bc 가 만들어 주는 것은 안전한 기본 골격까지입니다. 아래는 프로젝트마다 직접 채웁니다.

### 1. 기능 IPC

\`ping\` 은 연결 확인용 예시입니다. 기능을 추가할 때는 세 파일을 함께 고칩니다.

1. \`src/main/index.ts\` — \`ipcMain.handle('채널', handler)\` 추가, **입력값 검증**
2. \`src/preload/index.ts\` — \`api\` 객체에 함수 추가
3. \`src/preload/api.d.ts\` — \`Window['api']\` 에 타입 추가

main 에서 런타임에 쓰는 패키지(예: DB 드라이버)만 \`dependencies\` 에 넣으세요.
네이티브 모듈을 쓰면 \`electron-builder install-app-deps\` 를 postinstall 에 추가해야 합니다.

### 2. 아이콘

\`build/\` 에 \`icon.icns\`(mac) · \`icon.ico\`(win) · \`icon.png\`(512×512 이상)를 넣으면
electron-builder 가 자동으로 씁니다. 없으면 Electron 기본 아이콘이 들어갑니다.

### 3. 코드 서명 · 자동 업데이트

- **코드 서명** — 서명하지 않은 앱은 macOS Gatekeeper · Windows SmartScreen 경고가 뜹니다.
  mac 은 Apple Developer 인증서 + 공증(\`APPLE_ID\` · \`APPLE_APP_SPECIFIC_PASSWORD\` · \`APPLE_TEAM_ID\`),
  win 은 코드 서명 인증서(\`CSC_LINK\` · \`CSC_KEY_PASSWORD\`)를 CI 비밀값으로 넣습니다.
- **자동 업데이트** — \`electron-builder.yml\` 의 \`publish\` 를 설정하고,
  \`electron-updater\` 를 설치해 main 에서 \`autoUpdater.checkForUpdatesAndNotify()\` 를 호출합니다.

참고: https://www.electron.build/code-signing · https://www.electron.build/auto-update
`,
  );
}
