import fs from 'node:fs/promises';
import path from 'node:path';

/**
 * 모노레포(pnpm workspace) 관련 감지/유틸.
 *
 * - detectMonorepoRoot: 현재 위치에서 위로 올라가며 pnpm-workspace.yaml 을 찾는다.
 * - detectScope:        기존 워크스페이스 패키지 이름에서 `@scope` 를 추출한다.
 * - deriveScope:        모노레포 이름에서 scope 후보를 만든다 (marketd-frontend → marketd).
 */

async function exists(p) {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

async function readJsonSafe(file) {
  try {
    return JSON.parse(await fs.readFile(file, 'utf8'));
  } catch {
    return null;
  }
}

/**
 * pnpm-workspace.yaml 을 기준으로 모노레포 루트를 찾는다.
 * @returns {Promise<string|null>} 루트 절대경로 또는 null
 */
export async function detectMonorepoRoot(startDir = process.cwd()) {
  let dir = path.resolve(startDir);
  // 파일시스템 루트까지 올라간다.
  while (true) {
    if (await exists(path.join(dir, 'pnpm-workspace.yaml'))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

/**
 * 모노레포에서 사용 중인 npm scope (`@marketd` 의 marketd) 를 추론한다.
 * apps/*, packages/* 의 package.json name 에서 우선 추출하고,
 * 실패하면 루트 package.json name 을 fallback 으로 쓴다.
 */
export async function detectScope(root) {
  const candidateDirs = ['packages', 'apps'];
  for (const base of candidateDirs) {
    const baseDir = path.join(root, base);
    let entries = [];
    try {
      entries = await fs.readdir(baseDir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const pkg = await readJsonSafe(path.join(baseDir, entry.name, 'package.json'));
      const name = pkg?.name;
      if (typeof name === 'string' && name.startsWith('@')) {
        const scope = name.slice(1).split('/')[0];
        if (scope) return scope;
      }
    }
  }

  const rootPkg = await readJsonSafe(path.join(root, 'package.json'));
  if (rootPkg?.name) return deriveScope(rootPkg.name);
  return 'workspace';
}

/**
 * 모노레포 이름에서 scope 를 뽑아낸다.
 *  marketd-frontend  → marketd
 *  acme-fe           → acme
 *  @acme/repo        → acme
 */
export function deriveScope(name) {
  let base = String(name || '').trim();
  if (base.startsWith('@')) base = base.slice(1).split('/')[0];
  base = base
    .replace(/-(frontend|front|fe|monorepo|mono|workspace|repo)$/i, '')
    .replace(/[^a-z0-9-]/gi, '')
    .toLowerCase();
  return base || 'workspace';
}

/**
 * apps/<name> 이 이미 존재하는지 확인.
 */
export async function appExists(root, appName) {
  return exists(path.join(root, 'apps', appName));
}

export { exists as pathExists, readJsonSafe };
