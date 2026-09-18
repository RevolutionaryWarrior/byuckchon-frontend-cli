/**
 * @byuckchon-frontend/settings 가 관리하는 "파일로 존재해야 하는" 설정을 읽는다.
 *
 * eslint / prettier / tsconfig 는 프로젝트가 import·extends 로 참조하므로 여기 없다.
 * 아래 파일들은 참조 문법이 없어서 생성 시점에 내용을 복사해야 한다.
 * 이후 settings 가 바뀌면 프로젝트에서 `npx byuckchon-settings-sync` 로 갱신한다.
 */

import fs from 'node:fs/promises';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

/** settings 패키지 안의 파일 경로를 해석한다. */
export function resolveSettingsAsset(subpath) {
  return require.resolve(`@byuckchon-frontend/settings/${subpath}`);
}

/** settings 가 들고 있는 파일 내용을 문자열로 읽는다. */
export async function readSettingsAsset(subpath) {
  return fs.readFile(resolveSettingsAsset(subpath), 'utf8');
}

/** CLI 가 함께 배포되는 settings 의 실제 버전 (생성 프로젝트가 참조할 버전) */
export function settingsVersion() {
  return require('@byuckchon-frontend/settings/package.json').version;
}
