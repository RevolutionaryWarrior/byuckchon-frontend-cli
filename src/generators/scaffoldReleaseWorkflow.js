import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const TEMPLATE_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../templates/release/github');
const TEMPLATE = path.join(TEMPLATE_DIR, 'workflows/release.yml');
const SCRIPT = path.join(TEMPLATE_DIR, 'scripts/release-notes.mjs');

/**
 * @typedef {object} ReleaseTarget
 * @property {'single' | 'app' | 'repo'} mode 단일 레포 · 모노레포 앱 · 모노레포 전체
 * @property {string | null} app 앱 이름 (mode 가 app 일 때)
 * @property {string} appDir 저장소 루트 기준 앱 경로 (단일 · 전체는 ".")
 * @property {string[]} paths 노트에 넣을 커밋 경로 (비면 전체)
 * @property {string} workflowFile `.github/workflows/` 안의 파일 이름
 */

/** 앱마다 workflow 를 따로 둔다. 단일 · 모노레포 전체는 release.yml 하나. */
export function releaseWorkflowFile(app) {
  return app ? `release-${app}.yml` : 'release.yml';
}

/**
 * release workflow 내용을 만든다. (파일은 쓰지 않는다)
 * @param {object} args
 * @param {ReleaseTarget} args.target
 * @param {{ tagPrefix: string, name: string, latest: boolean }} args.release
 */
export async function renderReleaseWorkflow({ target, release }) {
  const template = await fs.readFile(TEMPLATE, 'utf8');
  const id = target.workflowFile.replace(/\.yml$/, '');
  const pathArgs = target.paths.map((p) => ` --path "${p}"`).join('');

  return (
    template
      .replaceAll('__WORKFLOW_NAME__', target.app ? `Release ${target.app}` : 'Release')
      .replaceAll('__WORKFLOW_ID__', id)
      .replaceAll('__TAG_PREFIX__', release.tagPrefix)
      .replaceAll('__RELEASE_NAME__', release.name)
      .replaceAll('__PATH_ARGS__', pathArgs)
      .replaceAll('__LATEST__', String(release.latest))
      .trimEnd() + '\n'
  );
}

/**
 * `.github/workflows/<file>` 과 노트 스크립트 `.github/scripts/release-notes.mjs` 를 쓴다.
 * workflow 는 덮어쓸지 bc deploy 가 먼저 묻는다. 스크립트는 저장소에 하나라 항상 최신으로 덮어쓴다.
 * @returns {Promise<{ file: string, script: string }>}
 */
export async function scaffoldReleaseWorkflow({ repoRoot, target, release }) {
  const file = path.join(repoRoot, '.github', 'workflows', target.workflowFile);
  const script = path.join(repoRoot, '.github', 'scripts', 'release-notes.mjs');

  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, await renderReleaseWorkflow({ target, release }), 'utf8');
  await fs.mkdir(path.dirname(script), { recursive: true });
  await fs.copyFile(SCRIPT, script);
  return { file, script };
}

/** 저장소에 이미 있는 release workflow 파일 이름들 */
export async function existingReleaseWorkflows(repoRoot) {
  try {
    const entries = await fs.readdir(path.join(repoRoot, '.github', 'workflows'));
    return entries.filter((name) => /^release(-[^.]+)?\.yml$/.test(name));
  } catch {
    return [];
  }
}
