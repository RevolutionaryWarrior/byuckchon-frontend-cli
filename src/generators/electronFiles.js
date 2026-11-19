import fs from 'node:fs/promises';
import path from 'node:path';

/**
 * Electron 전용 파일. 렌더러(src/)는 React 템플릿이 만들고, 여기서는 그 위에 얹는다.
 *
 *   electron/main.ts        메인 프로세스 (창 · OS 기능)
 *   electron/preload.ts     렌더러에 노출할 API (contextBridge)
 *   electron-builder.json   설치 파일 패키징 설정
 *   src/global.d.ts         window.electron 타입
 */

async function write(filePath, content) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, content, 'utf-8');
}

const MAIN_TS = `import { app, BrowserWindow, ipcMain } from 'electron';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// 빌드 결과
//   dist-electron/main.js · preload.mjs  ← electron/
//   dist/index.html                      ← src/ (렌더러)
const RENDERER_DIST = path.join(__dirname, '../dist');
const DEV_SERVER_URL = process.env.VITE_DEV_SERVER_URL;

function createWindow() {
  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      preload: path.join(__dirname, 'preload.mjs'),
      // 렌더러에서 Node · Electron API 를 직접 쓰지 않는다.
      // 필요한 기능은 아래 ipcMain.handle 로 만들고 preload 에서 노출한다.
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  if (DEV_SERVER_URL) {
    void win.loadURL(DEV_SERVER_URL);
  } else {
    void win.loadFile(path.join(RENDERER_DIST, 'index.html'));
  }
}

// 렌더러가 window.electron.ping() 으로 부르는 예시. preload.ts 와 짝을 이룬다.
ipcMain.handle('ping', () => 'pong');

void app.whenReady().then(() => {
  createWindow();

  // macOS 는 창을 다 닫아도 앱이 남아 있다. Dock 아이콘을 누르면 창을 다시 연다.
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
`;

const PRELOAD_TS = `import { contextBridge, ipcRenderer } from 'electron';

// 렌더러에 노출할 API. 여기에 추가하면 src/global.d.ts 의 타입도 같이 고친다.
const api = {
  versions: {
    node: process.versions.node,
    chrome: process.versions.chrome,
    electron: process.versions.electron,
  },
  ping: (): Promise<string> => ipcRenderer.invoke('ping'),
};

contextBridge.exposeInMainWorld('electron', api);
`;

const GLOBAL_D_TS = `/// <reference types="@byuckchon-frontend/settings/types/svg-vite" />

// electron/preload.ts 가 노출하는 API. preload 를 고치면 여기도 같이 고친다.
interface Window {
  electron: {
    versions: { node: string; chrome: string; electron: string };
    ping: () => Promise<string>;
  };
}
`;

/** appId 는 영문 · 숫자 · - · . 만 쓴다. (macOS 번들 ID 규칙) */
function toAppId(scope, name) {
  const clean = (v) => String(v).toLowerCase().replace(/[^a-z0-9-]/g, '-');
  return `com.${clean(scope)}.${clean(name)}`;
}

/**
 * @param {string} rootDir 프로젝트(앱) 루트
 * @param {object} args
 * @param {string} args.name   앱 이름
 * @param {string} [args.scope] appId 앞부분 (모노레포 scope). 없으면 byuckchon
 */
export async function createElectronFiles(rootDir, { name, scope = 'byuckchon' }) {
  await write(path.join(rootDir, 'electron/main.ts'), MAIN_TS);
  await write(path.join(rootDir, 'electron/preload.ts'), PRELOAD_TS);
  await write(path.join(rootDir, 'src/global.d.ts'), GLOBAL_D_TS);
  await write(
    path.join(rootDir, 'electron-builder.json'),
    JSON.stringify(
      {
        $schema:
          'https://raw.githubusercontent.com/electron-userland/electron-builder/master/packages/app-builder-lib/scheme.json',
        appId: toAppId(scope, name),
        productName: name,
        directories: { output: 'release/${version}' },
        files: ['dist', 'dist-electron'],
        mac: { target: ['dmg'] },
        win: { target: ['nsis'] },
        linux: { target: ['AppImage'] },
      },
      null,
      2,
    ) + '\n',
  );
}
