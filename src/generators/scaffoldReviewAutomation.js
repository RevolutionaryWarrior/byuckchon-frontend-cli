import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const TEMPLATE_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../templates/review-automation',
);

const PROJECT_TYPES = ['single', 'monorepo'];

/**
 * 워크플로 템플릿 이름 규칙
 *   `<이름>.single.yml` / `<이름>.monorepo.yml` → 유형이 맞는 쪽만 `<이름>.yml` 로 복사
 *   `<이름>.yml`                                → 유형과 무관하게 항상 복사
 *
 * @param {string[]} fileNames 템플릿 디렉터리의 파일 목록
 * @param {'single' | 'monorepo'} projectType
 * @returns {Array<{ source: string, target: string }>}
 */
function selectWorkflows(fileNames, projectType, exclude = []) {
  const selected = [];

  for (const fileName of fileNames) {
    if (!fileName.endsWith('.yml')) continue;

    const withoutExt = fileName.slice(0, -'.yml'.length);
    const suffix = PROJECT_TYPES.find((type) => withoutExt.endsWith(`.${type}`));
    const baseName = suffix
      ? withoutExt.slice(0, -(suffix.length + 1))
      : withoutExt;

    if (exclude.includes(baseName)) continue;
    if (suffix && suffix !== projectType) continue;

    selected.push({ source: fileName, target: `${baseName}.yml` });
  }

  return selected;
}

function shouldCopyTemplateFile(source) {
  return path.basename(source) !== '.DS_Store';
}

async function pathExists(target) {
  try {
    await fs.access(target);
    return true;
  } catch {
    return false;
  }
}

async function copyFileIfAllowed(source, target, overwrite) {
  if (!overwrite && (await pathExists(target))) {
    return false;
  }

  await fs.copyFile(source, target);
  return true;
}

/**
 * 프로젝트 루트에 PR 리뷰 자동화 파일을 생성한다.
 *
 * - tools/ 는 ESLint convention rule 및 PR 댓글 게시 스크립트를 제공한다.
 * - .github/workflows/ 는 프로젝트 유형에 맞는 워크플로를 제공한다.
 *   템플릿 이름이 `<이름>.single.yml` / `<이름>.monorepo.yml` 이면 유형이 맞는 쪽만
 *   `<이름>.yml` 로 복사되고, 접미사가 없으면 유형과 무관하게 복사된다.
 *
 * @param {object} args
 * @param {string} args.projectRoot 새로 생성한 프로젝트의 절대 경로
 * @param {'single' | 'monorepo'} args.projectType 생성할 프로젝트 유형
 * @param {boolean} [args.overwrite=true] 기존 파일을 템플릿으로 덮어쓸지
 * @param {string[]} [args.exclude=[]] 제외할 워크플로 이름 (확장자·유형 접미사 제외)
 * @returns {Promise<{ toolsDir: string, workflows: string[] }>}
 */
export async function scaffoldReviewAutomation({
  projectRoot,
  projectType,
  overwrite = true,
  exclude = [],
}) {
  if (!PROJECT_TYPES.includes(projectType)) {
    throw new Error(`지원하지 않는 프로젝트 유형입니다: ${projectType}`);
  }

  const toolsTemplateDir = path.join(TEMPLATE_ROOT, 'tools');
  const workflowsTemplateDir = path.join(TEMPLATE_ROOT, 'github', 'workflows');
  const toolsTargetDir = path.join(projectRoot, 'tools');
  const workflowsTargetDir = path.join(projectRoot, '.github', 'workflows');

  await fs.cp(toolsTemplateDir, toolsTargetDir, {
    recursive: true,
    force: overwrite,
    errorOnExist: false,
    filter: shouldCopyTemplateFile,
  });
  await fs.mkdir(workflowsTargetDir, { recursive: true });

  const workflowFiles = await fs.readdir(workflowsTemplateDir);
  const copiedWorkflows = [];

  for (const { source, target } of selectWorkflows(workflowFiles, projectType, exclude)) {
    const copied = await copyFileIfAllowed(
      path.join(workflowsTemplateDir, source),
      path.join(workflowsTargetDir, target),
      overwrite,
    );
    if (copied) copiedWorkflows.push(target);
  }

  return { toolsDir: toolsTargetDir, workflows: copiedWorkflows };
}
