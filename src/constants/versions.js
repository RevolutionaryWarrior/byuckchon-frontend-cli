/**
 * 검증된 스택 버전 매트릭스.
 *
 * 본체는 @byuckchon-frontend/settings 가 관리한다.
 * 여기서는 settings 자신의 버전만 얹는다 — 자기 자신의 버전을 자기가 들고 있으면
 * 어긋나기 때문에, CLI 와 함께 설치된 settings 의 실제 버전을 읽어서 쓴다.
 */

import { versions as shared } from '@byuckchon-frontend/settings/versions';

import { settingsVersion } from '../utils/settingsAssets.js';

export const versions = {
  ...shared,
  '@byuckchon-frontend/settings': `^${settingsVersion()}`,
};
