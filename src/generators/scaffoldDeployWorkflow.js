import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { renderWorkflow } from './workflowPackageManager.js';

const TEMPLATE = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../templates/deploy/github/workflows/deploy.yml',
);

/**
 * `# @bc:<name>-start` ~ `# @bc:<name>-end` 구간을 남기거나 지운다. 표시 줄은 항상 지운다.
 */
function toggleBlock(template, name, keep) {
  const lines = [];
  let skipping = false;

  for (const line of template.split('\n')) {
    if (new RegExp(`^\\s*# @bc:${name}-start\\s*$`).test(line)) {
      skipping = !keep;
      continue;
    }
    if (new RegExp(`^\\s*# @bc:${name}-end\\s*$`).test(line)) {
      skipping = false;
      continue;
    }
    if (!skipping) lines.push(line);
  }
  return lines.join('\n');
}

/**
 * deploy.yml 내용을 만든다. (파일은 쓰지 않는다)
 *
 * @param {object} args
 * @param {{ enabled: boolean, version: 'date' | 'semver', tagPrefix: string, slackSecret: string | null }} args.release
 * @param {import('./workflowPackageManager.js').WorkflowPackageManager} args.packageManager
 */
export async function renderDeployWorkflow({ release, packageManager }) {
  let template = await fs.readFile(TEMPLATE, 'utf8');

  template = toggleBlock(template, 'release', release.enabled);
  template = toggleBlock(template, 'slack', Boolean(release.slackSecret));
  template = template
    .replaceAll('__TAG_PREFIX__', release.tagPrefix)
    .replaceAll('__VERSION__', release.version)
    .replaceAll('__SLACK_SECRET__', release.slackSecret ?? '');

  return renderWorkflow(template, packageManager).trimEnd() + '\n';
}

/**
 * `.github/workflows/deploy.yml` 을 쓴다. 이미 있으면 overwrite 일 때만 덮어쓴다.
 * @returns {Promise<{ target: string, written: boolean }>}
 */
export async function scaffoldDeployWorkflow({ projectRoot, release, packageManager, overwrite = false }) {
  const target = path.join(projectRoot, '.github', 'workflows', 'deploy.yml');

  if (!overwrite) {
    try {
      await fs.access(target);
      return { target, written: false };
    } catch {
      /* 없음 → 새로 쓴다 */
    }
  }

  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(target, await renderDeployWorkflow({ release, packageManager }), 'utf8');
  return { target, written: true };
}
