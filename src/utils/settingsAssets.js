/**
 * @byuckchon-frontend/settings 가 관리하는 "파일로 존재해야 하는" 설정을 읽는다.
 *
 * eslint / prettier / tsconfig 는 프로젝트가 import·extends 로 참조하므로 여기 없다.
 * 아래 파일들은 참조 문법이 없어서 생성 시점에 내용을 복사해야 한다.
 * 이후 settings 가 바뀌면 프로젝트에서 `npx byuckchon-settings-sync` 로 갱신한다.
 *
 * 기본은 CLI 와 함께 설치된 settings 를 읽는다. `useSettingsRoot()` 로 다른 settings
 * (npm 최신 버전을 받아 푼 폴더)를 지정하면 그 쪽을 읽는다. → latestSettings.js
 */

import fs from 'node:fs';
import fsp from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';

const require = createRequire(import.meta.url);

/** @type {{ root: string, version: string, exports: Record<string, unknown> } | null} */
let override = null;

/**
 * 이후 읽는 settings 파일·버전을 `root` 의 settings 로 바꾼다.
 * @param {string} root settings 패키지 루트 (package.json 이 있는 폴더)
 */
export function useSettingsRoot(root) {
  const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  override = { root, version: pkg.version, exports: pkg.exports ?? {} };
}

function exportTarget(entry) {
  if (typeof entry === 'string') return entry;
  if (entry && typeof entry === 'object') {
    return exportTarget(entry.default ?? entry.import ?? entry.require);
  }
  return null;
}

/** useSettingsRoot 를 되돌려 CLI 와 함께 설치된 settings 를 다시 쓴다. */
export function resetSettingsRoot() {
  override = null;
}

/** settings 패키지 안의 파일 경로를 해석한다. */
export function resolveSettingsAsset(subpath) {
  if (override) {
    const target = exportTarget(override.exports[`./${subpath}`]);
    if (target) return path.join(override.root, target);
  }
  return require.resolve(`@byuckchon-frontend/settings/${subpath}`);
}

/** settings 가 들고 있는 파일 내용을 문자열로 읽는다. */
export async function readSettingsAsset(subpath) {
  return fsp.readFile(resolveSettingsAsset(subpath), 'utf8');
}

/** settings 가 들고 있는 JSON 파일을 읽는다. */
export async function readSettingsJson(subpath) {
  return JSON.parse(await readSettingsAsset(subpath));
}

/** CLI 와 함께 설치된 settings 의 버전 */
export function bundledSettingsVersion() {
  return require('@byuckchon-frontend/settings/package.json').version;
}

/** 생성 프로젝트가 참조할 settings 버전 (최신 settings 를 받았으면 그 버전) */
export function settingsVersion() {
  return override?.version ?? bundledSettingsVersion();
}
