import fs from 'node:fs/promises';
import path from 'node:path';

import { readSettingsAsset } from '../utils/settingsAssets.js';

async function readTextSafe(file) {
  try {
    return (await fs.readFile(file, 'utf8')).trim();
  } catch {
    return null;
  }
}

/**
 * engines.node 에서 메이저 버전을 뽑는다. ("20", "20.x", "^20.11", "~22", ">=20" → 20)
 * 범위가 여러 개("^18 || ^20")거나 상한만 있으면(<22) 해석하지 않는다.
 */
export function majorFromEngines(range) {
  if (typeof range !== 'string') return null;
  const value = range.trim();
  if (!value || value.includes('||') || value.startsWith('<')) return null;
  const match = /^(?:>=|\^|~|=)?\s*v?(\d+)(?:\.[\dx*]+){0,2}$/i.exec(value.split(/\s+/)[0]);
  return match ? match[1] : null;
}

/**
 * 복사하는 workflow 가 모두 `node-version-file: .nvmrc` 를 읽으므로, 없으면 만든다.
 * 이미 있으면 건드리지 않는다. (기존 프로젝트의 Node 버전을 존중)
 *
 * 값 우선순위: .node-version → package.json engines.node → settings 의 project/nvmrc
 *
 * @param {string} rootDir workflow 를 두는 루트 (모노레포면 모노레포 루트)
 * @returns {Promise<{ written: boolean, value: string | null, source: string | null }>}
 */
export async function ensureNvmrc(rootDir) {
  const target = path.join(rootDir, '.nvmrc');
  const current = await readTextSafe(target);
  if (current !== null) return { written: false, value: current, source: '.nvmrc' };

  let value = await readTextSafe(path.join(rootDir, '.node-version'));
  let source = value ? '.node-version' : null;

  if (!value) {
    try {
      const pkg = JSON.parse(await fs.readFile(path.join(rootDir, 'package.json'), 'utf8'));
      value = majorFromEngines(pkg?.engines?.node);
      source = value ? 'package.json engines.node' : null;
    } catch {
      /* noop */
    }
  }

  if (!value) {
    value = (await readSettingsAsset('project/nvmrc')).trim();
    source = '@byuckchon-frontend/settings 기본값';
  }

  await fs.writeFile(target, `${value}\n`, 'utf8');
  return { written: true, value, source };
}
