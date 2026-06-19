import path from 'node:path';

import fg from 'fast-glob';

/**
 * bc.config.json 의 context.include / context.exclude 글롭을 따라
 * 인덱싱 대상 파일 절대경로 목록을 돌려준다.
 *
 * - 항상 node_modules / .bc / .git / dist / build / .next 는 제외
 * - 100KB 넘는 파일은 인덱싱하지 않는다 (대부분 minified/generated)
 */
export async function walkProjectFiles(projectRoot, contextCfg = {}) {
  const include =
    contextCfg.include?.length
      ? contextCfg.include
      : ['src/**/*.{ts,tsx,js,jsx}', 'app/**/*.{ts,tsx,js,jsx}', 'bc.config.json'];

  const baseExclude = [
    '**/node_modules/**',
    '**/.bc/**',
    '**/.git/**',
    '**/dist/**',
    '**/build/**',
    '**/.next/**',
    '**/.expo/**',
    '**/coverage/**',
  ];
  const userExclude = contextCfg.exclude ?? [];

  const matches = await fg(include, {
    cwd: projectRoot,
    absolute: true,
    onlyFiles: true,
    ignore: [...baseExclude, ...userExclude],
    dot: false,
    suppressErrors: true,
  });

  // 중복 제거 (include 글롭이 겹칠 수 있음).
  return Array.from(new Set(matches));
}

export function relPath(projectRoot, abs) {
  return path.relative(projectRoot, abs).split(path.sep).join('/');
}
