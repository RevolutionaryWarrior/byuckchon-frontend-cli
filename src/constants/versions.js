/**
 * 검증된 스택 버전 매트릭스.
 *
 * 본체는 @byuckchon-frontend/settings 가 관리한다.
 * 여기서는 settings 자신의 버전만 얹는다 — 자기 자신의 버전을 자기가 들고 있으면
 * 어긋나기 때문에, 실제로 읽은 settings 의 버전을 쓴다.
 *
 * 처음에는 CLI 와 함께 설치된 settings 값으로 채워진다. CLI 를 오래전에 설치했으면
 * 옛 매트릭스가 되므로, init · add · adopt 는 시작할 때 `prepareVersionMatrix()`
 * (utils/latestSettings.js)로 npm 최신 settings 의 매트릭스로 이 객체를 갈아끼운다.
 * 객체를 교체하지 않고 내용만 바꾸므로 이미 import 한 곳에도 그대로 반영된다.
 */

import { versions as shared } from '@byuckchon-frontend/settings/versions';

import { settingsVersion } from '../utils/settingsAssets.js';

/**
 * settings 매트릭스에 아직 없는 패키지. CLI 가 임시로 들고 있다.
 * settings/versions 에 같은 키가 생기면 그쪽 값이 이긴다 — 옮긴 뒤 여기서 지운다.
 */
const cliOnly = {
  // 에러 수집. bc init 기본 포함, DSN 을 넣기 전까지는 꺼져 있다. (src/lib/utils/errorHandler.ts)
  '@sentry/react': '^11.12.0',
};

export const versions = {
  ...cliOnly,
  ...shared,
  '@byuckchon-frontend/settings': `^${settingsVersion()}`,
};

/**
 * 매트릭스를 다른 settings 의 값으로 바꾼다.
 * @param {Record<string, string>} matrix settings/versions 의 versions
 * @param {string} version 그 settings 의 버전
 */
export function replaceVersions(matrix, version) {
  for (const key of Object.keys(versions)) delete versions[key];
  Object.assign(versions, cliOnly, matrix, {
    '@byuckchon-frontend/settings': `^${version}`,
  });
}
