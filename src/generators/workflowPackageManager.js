import { execFile as execFileCallback } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';

const execFile = promisify(execFileCallback);

/**
 * workflow 템플릿의 패키지 매니저 자리를 프로젝트에 맞게 채운다.
 *
 * 템플릿 표기
 *   `# @bc:pm-setup`  → PM 별 준비 step (pnpm/action-setup, corepack, setup-bun) — 필요 없으면 줄 삭제
 *   `__PM_CACHE__`    → setup-node 의 cache 값 (bun 은 cache 줄 삭제)
 *   `__PM_INSTALL__`  → lockfile 고정 설치 명령
 *   `__PM_RUN__`      → 스크립트 실행 (npm run / pnpm / yarn / bun run)
 *   `__PM_EXEC__`     → 로컬 bin 실행 (npx --no-install / pnpm exec / yarn / bunx)
 *   `# @bc:note …`    → 템플릿 설명 줄. 복사본에서는 지운다.
 */

const STEP_INDENT = '      ';

/**
 * @typedef {object} WorkflowPackageManager
 * @property {'npm' | 'pnpm' | 'yarn' | 'bun'} name
 * @property {string | null} [pnpmVersion] pnpm/action-setup 에 넣을 version.
 *   루트 package.json 에 packageManager 필드가 있으면 null (액션이 그 필드를 읽는다)
 * @property {boolean} [yarnBerry] yarn 2+ 여부
 */

function setupSteps(pm) {
  switch (pm.name) {
    case 'pnpm':
      return pm.pnpmVersion
        ? [
            '- uses: pnpm/action-setup@v4',
            '  with:',
            '    # 루트 package.json 에 packageManager 필드가 없어서 버전을 직접 지정합니다.',
            `    version: ${pm.pnpmVersion}`,
          ]
        : ['- uses: pnpm/action-setup@v4'];
    case 'yarn':
      // yarn 2+ 는 packageManager 필드의 버전을 corepack 으로 켜야 setup-node 의 cache 가 동작한다.
      return pm.yarnBerry ? ['- run: corepack enable'] : [];
    case 'bun':
      return ['- uses: oven-sh/setup-bun@v2'];
    default:
      return [];
  }
}

const COMMANDS = {
  npm: { install: 'npm ci', run: 'npm run', exec: 'npx --no-install', cache: 'npm' },
  pnpm: { install: 'pnpm install --frozen-lockfile', run: 'pnpm', exec: 'pnpm exec', cache: 'pnpm' },
  yarn: { install: 'yarn install --frozen-lockfile', run: 'yarn', exec: 'yarn', cache: 'yarn' },
  bun: { install: 'bun install --frozen-lockfile', run: 'bun run', exec: 'bunx', cache: null },
};

/**
 * @param {string} template workflow 템플릿 내용
 * @param {WorkflowPackageManager} pm
 */
export function renderWorkflow(template, pm) {
  const commands = COMMANDS[pm.name] ?? COMMANDS.npm;
  const install =
    pm.name === 'yarn' && pm.yarnBerry ? 'yarn install --immutable' : commands.install;

  const lines = [];
  for (const line of template.split('\n')) {
    if (/^\s*# @bc:note\b/.test(line)) continue;

    const setup = /^(\s*)# @bc:pm-setup\s*$/.exec(line);
    if (setup) {
      const steps = setupSteps(pm);
      if (steps.length) {
        lines.push(...steps.map((step) => `${setup[1] || STEP_INDENT}${step}`));
      } else if (lines.at(-1) === '') {
        // 준비 step 이 없으면 앞의 빈 줄도 하나 정리한다.
        lines.pop();
      }
      continue;
    }

    if (line.includes('__PM_CACHE__') && !commands.cache) continue;

    lines.push(
      line
        .replaceAll('__PM_CACHE__', commands.cache ?? '')
        .replaceAll('__PM_INSTALL__', install)
        .replaceAll('__PM_RUN__', commands.run)
        .replaceAll('__PM_EXEC__', commands.exec),
    );
  }
  // 설명 줄·빈 step 을 지우며 생긴 연속 빈 줄을 하나로 줄인다.
  return lines.join('\n').replace(/\n{3,}/g, '\n\n');
}

async function localPnpmMajor(rootDir) {
  try {
    const { stdout } = await execFile('pnpm', ['--version'], {
      cwd: rootDir,
      timeout: 10_000,
      shell: process.platform === 'win32',
    });
    return Number.parseInt(stdout.trim(), 10) || null;
  } catch {
    return null;
  }
}

/**
 * packageManager 필드가 없을 때 pnpm/action-setup 에 넣을 메이저 버전.
 *
 * CI 는 `--frozen-lockfile` 로 설치하므로 lockfile 을 만든 pnpm 과 메이저가 맞아야 한다.
 *   1) lockfile 버전으로 정한다. (6.0 → 8, 5.4 → 7)
 *   2) lockfile 9.0 은 pnpm 9 · 10 이 같이 쓰므로 로컬 pnpm 이 9 이상이면 그 버전, 아니면 10
 *   3) lockfile 이 없으면 로컬 pnpm → 10
 */
export async function resolvePnpmMajor(rootDir) {
  let lockfileVersion = null;
  try {
    const raw = await fs.readFile(path.join(rootDir, 'pnpm-lock.yaml'), 'utf8');
    lockfileVersion = /lockfileVersion:\s*'?(\d+)(?:\.(\d+))?/.exec(raw);
  } catch {
    /* lockfile 없음 */
  }

  if (lockfileVersion) {
    const major = Number(lockfileVersion[1]);
    const minor = Number(lockfileVersion[2] ?? 0);
    if (major === 6) return '8';
    if (major === 5 && minor >= 4) return '7';
    if (major >= 9) {
      const local = await localPnpmMajor(rootDir);
      return String(local && local >= 9 ? local : 10);
    }
  }

  const local = await localPnpmMajor(rootDir);
  return String(local ?? 10);
}

/**
 * 감지 결과(detectPackageManagerDetails)로 workflow 에 쓸 패키지 매니저 정보를 만든다.
 * @param {object} details detect.js 의 detectPackageManagerDetails() 결과
 * @param {string} rootDir workflow 를 두는 프로젝트 루트
 * @returns {Promise<WorkflowPackageManager>}
 */
export async function workflowPackageManagerFrom(details, rootDir) {
  const name = ['npm', 'pnpm', 'yarn', 'bun'].includes(details?.name) ? details.name : 'npm';
  return {
    name,
    pnpmVersion:
      name === 'pnpm' && !details?.hasPackageManagerField
        ? await resolvePnpmMajor(rootDir)
        : null,
    yarnBerry: Boolean(details?.yarnBerry),
  };
}
