import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const TEMPLATE_PATH = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../templates/conventions/api-codegen.md',
);
const OPENAPI_SCRIPT_PATH = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../templates/scripts/openapi.mjs',
);

/**
 * API 루트 폴더. React · Next 모두 src/api 로 통일한다.
 */
export function apiRootForFramework() {
  return 'src/api';
}

/**
 * API 코드 컨벤션 .md 를 프로젝트의 API 루트(`src/api`)에 깐다.
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

/**
 * Swagger 도우미 스크립트(`scripts/openapi.mjs`)를 프로젝트(앱) 루트에 깐다.
 * api-codegen.md 가 스펙 읽기(show) · 바뀐 API 확인(diff) · 스냅샷 저장(save)에 쓴다.
 * 스크립트는 자기 위치 기준 상위 폴더의 bc.config.json · openapi.snapshot.json 을 쓴다.
 *
 * @param {object} args
 * @param {string} args.projectRoot  bc.config.json 이 있는 폴더
 * @param {boolean} [args.force]     이미 있으면 덮어쓸지
 * @returns {Promise<{ relPath: string, written: boolean }>}
 */
export async function scaffoldOpenapiScript({ projectRoot, force = false }) {
  const relPath = path.join('scripts', 'openapi.mjs');
  const absPath = path.join(projectRoot, relPath);

  if (!force) {
    try {
      await fs.access(absPath);
      return { relPath, written: false };
    } catch {
      /* not there */
    }
  }

  await fs.mkdir(path.dirname(absPath), { recursive: true });
  await fs.copyFile(OPENAPI_SCRIPT_PATH, absPath);
  return { relPath, written: true };
}
