import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const TEMPLATE_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../templates/review-automation',
);

const ESLINT_WORKFLOW_BY_PROJECT_TYPE = {
  single: 'eslint-convention-review.single.yml',
  monorepo: 'eslint-convention-review.monorepo.yml',
};

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
 * - .github/workflows/ 는 프로젝트 유형에 맞는 ESLint workflow 하나와
 *   공통 workflow(AI Code Review, PR Check 등)를 제공한다.
 *
 * @param {object} args
 * @param {string} args.projectRoot 새로 생성한 프로젝트의 절대 경로
 * @param {'single' | 'monorepo'} args.projectType 생성할 프로젝트 유형
 * @param {boolean} [args.overwrite=true] 기존 파일을 템플릿으로 덮어쓸지
 * @returns {Promise<{ toolsDir: string, workflows: string[] }>}
 */
export async function scaffoldReviewAutomation({
  projectRoot,
  projectType,
  overwrite = true,
}) {
  const eslintWorkflow = ESLINT_WORKFLOW_BY_PROJECT_TYPE[projectType];

  if (!eslintWorkflow) {
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
  const commonWorkflows = workflowFiles.filter(
    (fileName) =>
      fileName.endsWith('.yml') &&
      !fileName.startsWith('eslint-convention-review.'),
  );
  const copiedWorkflows = [];

  for (const fileName of commonWorkflows) {
    const copied = await copyFileIfAllowed(
      path.join(workflowsTemplateDir, fileName),
      path.join(workflowsTargetDir, fileName),
      overwrite,
    );
    if (copied) copiedWorkflows.push(fileName);
  }

  const eslintWorkflowTarget = path.join(
    workflowsTargetDir,
    'eslint-convention-review.yml',
  );
  const copiedEslintWorkflow = await copyFileIfAllowed(
    path.join(workflowsTemplateDir, eslintWorkflow),
    eslintWorkflowTarget,
    overwrite,
  );
  if (copiedEslintWorkflow) {
    copiedWorkflows.push('eslint-convention-review.yml');
  }

  return { toolsDir: toolsTargetDir, workflows: copiedWorkflows };
}
