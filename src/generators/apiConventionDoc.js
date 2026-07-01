import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const TEMPLATE_PATH = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../templates/conventions/api-codegen.md',
);

/**
 * 프레임워크에 맞는 API 루트 폴더.
 * - Next.js → src/lib/api
 * - 그 외 React 계열 → src/api
 */
export function apiRootForFramework(framework) {
  return framework === 'next' ? 'src/lib/api' : 'src/api';
}

/**
 * API 코드 컨벤션 .md 를 프로젝트의 API 루트(`src/api` 또는 `src/lib/api`)에 깐다.
 *
 * @param {object} args
 * @param {string} args.projectRoot
 * @param {string} args.framework   'react' | 'next' | detect.js 의 framework 값
 * @param {boolean} [args.force]    이미 있으면 덮어쓸지
 * @returns {Promise<{ relPath: string, written: boolean }>}
 */
export async function scaffoldApiConventionDoc({ projectRoot, framework, force = false }) {
  const apiRoot = apiRootForFramework(framework);
  const relPath = path.join(apiRoot, 'api-codegen.md');
  const absPath = path.join(projectRoot, relPath);

  let exists = false;
  try {
    await fs.access(absPath);
    exists = true;
  } catch {
    /* not there */
  }

  if (exists && !force) {
    return { relPath, written: false };
  }

  const template = await fs.readFile(TEMPLATE_PATH, 'utf8');
  await fs.mkdir(path.dirname(absPath), { recursive: true });
  await fs.writeFile(absPath, template, 'utf8');
  return { relPath, written: true };
}
