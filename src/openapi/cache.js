import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';

import { findProjectConfigPath } from '../config/index.js';
import { loadOpenApi } from './fetch.js';

const TTL_MS = 60 * 60 * 1000; // 1시간

async function getCacheDir(cwd = process.cwd()) {
  const projectConfig = await findProjectConfigPath(cwd);
  const root = projectConfig ? path.dirname(projectConfig) : cwd;
  return path.join(root, '.bc', 'cache');
}

function keyFor(input) {
  return crypto.createHash('sha1').update(String(input)).digest('hex').slice(0, 12);
}

/**
 * URL 캐시가 있으면 그걸로, 없거나 만료되었으면 fetch 후 갱신.
 * 결과는 { doc, cached, source } 형태.
 *
 * - 네트워크 실패 시: 만료된 캐시라도 있으면 그걸로 폴백 (offline-friendly).
 * - 캐시는 .bc/cache/openapi-<hash>.json 에 저장.
 */
export async function getCachedOpenApi(input) {
  const dir = await getCacheDir();
  const file = path.join(dir, `openapi-${keyFor(input)}.json`);

  let cached = null;
  let cachedFresh = false;
  try {
    const stat = await fs.stat(file);
    const raw = await fs.readFile(file, 'utf8');
    cached = JSON.parse(raw);
    cachedFresh = Date.now() - stat.mtimeMs < TTL_MS;
  } catch {
    /* miss */
  }

  if (cachedFresh && cached) {
    return { doc: cached, cached: true, source: input };
  }

  try {
    const { doc } = await loadOpenApi(input);
    if (doc) {
      await fs.mkdir(dir, { recursive: true });
      await fs.writeFile(file, JSON.stringify(doc), 'utf8');
      return { doc, cached: false, source: input };
    }
    // doc 가 null (YAML) — 캐시 못 쓰지만 fetch 자체는 성공한 케이스
    return { doc: null, cached: false, source: input };
  } catch (err) {
    // 네트워크/파싱 실패 — 만료된 캐시라도 있으면 그걸 돌려준다.
    if (cached) return { doc: cached, cached: true, source: input, stale: true };
    throw err;
  }
}
