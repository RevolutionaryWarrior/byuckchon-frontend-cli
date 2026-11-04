import fs from 'node:fs/promises';
import path from 'node:path';

const PROJECT_FILE_NAMES = ['bc.config.json'];

/**
 * 프로젝트 설정 (bc.config.json) 기본 모양.
 *
 * - 팀원 모두가 공유. git 에 커밋된다.
 * - 비밀값을 두지 말 것.
 */
const DEFAULT_PROJECT = {
  api: {
    openapi: null,
    baseUrl: null,
  },
  /** bc adopt 가 채워준다. */
  framework: null,
  detected: null,
};

async function readJson(file) {
  try {
    const raw = await fs.readFile(file, 'utf8');
    return JSON.parse(raw);
  } catch (err) {
    if (err.code === 'ENOENT') return null;
    throw err;
  }
}

function deepMerge(base, patch) {
  if (patch == null) return base;
  // 한쪽이 null/원시값이거나, 한쪽만 배열이면 patch 가 우선.
  // 특히 base 가 null 인데 patch 가 객체일 때 `k in base` 가 TypeError 던지는 걸 방지.
  if (base == null) return patch;
  if (typeof base !== 'object' || typeof patch !== 'object') return patch;
  if (Array.isArray(base) || Array.isArray(patch)) return patch;
  const out = { ...base };
  for (const k of Object.keys(patch)) {
    out[k] = k in base ? deepMerge(base[k], patch[k]) : patch[k];
  }
  return out;
}

export async function findProjectConfigPath(startDir = process.cwd()) {
  let dir = path.resolve(startDir);
  const root = path.parse(dir).root;
  while (true) {
    for (const name of PROJECT_FILE_NAMES) {
      const candidate = path.join(dir, name);
      try {
        await fs.access(candidate);
        return candidate;
      } catch {
        /* keep walking */
      }
    }
    if (dir === root) return null;
    dir = path.dirname(dir);
  }
}

export async function loadProjectConfig(startDir = process.cwd()) {
  const file = await findProjectConfigPath(startDir);
  const found = file ? await readJson(file) : null;
  return {
    file,
    config: deepMerge(DEFAULT_PROJECT, found ?? {}),
  };
}

export const CONFIG_PATHS = {
  projectFileName: PROJECT_FILE_NAMES[0],
};
