import { exec as execCallback } from 'node:child_process';
import fs from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import { promisify } from 'node:util';

import chalk from 'chalk';
import inquirer from 'inquirer';

import { CONFIG_PATHS } from '../config/index.js';
import { detectProjectContext } from '../context/detect.js';
import { detectMonorepoRoot } from '../context/monorepo.js';
import { ensureNvmrc } from '../generators/ensureNvmrc.js';
import {
  existingReleaseWorkflows,
  releaseWorkflowFile,
  scaffoldReleaseWorkflow,
} from '../generators/scaffoldReleaseWorkflow.js';

const exec = promisify(execCallback);

const REPO_CHOICE = '__repo__';
/** workflow 의 쉘 명령에 그대로 들어가므로 따옴표 · $ · 역따옴표 · 줄바꿈은 받지 않는다. */
const UNSAFE = /["$`\\\n]/;
const TAG_PREFIX = /^[A-Za-z0-9@._/-]*$/;

function fail(message) {
  console.log(chalk.yellow(`  ⚠ ${message}\n`));
  process.exit(1);
}

async function exists(file) {
  try {
    await fs.access(file);
    return true;
  } catch {
    return false;
  }
}

/** apps/* 중 package.json 이 있는 폴더 이름 */
async function listApps(repoRoot) {
  let entries = [];
  try {
    entries = await fs.readdir(path.join(repoRoot, 'apps'), { withFileTypes: true });
  } catch {
    return [];
  }
  const apps = [];
  for (const entry of entries) {
    if (entry.isDirectory() && (await exists(path.join(repoRoot, 'apps', entry.name, 'package.json')))) {
      apps.push(entry.name);
    }
  }
  return apps.sort();
}

/** @returns {Promise<import('../generators/scaffoldReleaseWorkflow.js').ReleaseTarget>} */
async function appTarget(repoRoot, app) {
  const paths = [`apps/${app}`];
  // 공통 패키지를 고친 커밋은 그 패키지를 쓰는 앱 노트에 모두 들어간다.
  if (await exists(path.join(repoRoot, 'packages'))) paths.push('packages');
  return { mode: 'app', app, appDir: `apps/${app}`, paths, workflowFile: releaseWorkflowFile(app) };
}

const SINGLE_TARGET = { mode: 'single', app: null, appDir: '.', paths: [], workflowFile: 'release.yml' };
const REPO_TARGET = { mode: 'repo', app: null, appDir: '.', paths: [], workflowFile: 'release.yml' };

/** 모노레포 루트에서 "레포 전체 하나로"를 골랐을 때 한 번 더 확인한다. */
async function confirmRepoWide(existing) {
  console.log(chalk.yellow('\n  ⚠ 레포 전체 릴리즈는 모든 앱이 같은 버전을 씁니다. 앱마다 버전을 따로 관리할 수 없습니다.'));
  const appWorkflows = existing.filter((name) => name !== 'release.yml');
  if (appWorkflows.length) {
    console.log(
      chalk.yellow(`  ⚠ 이미 앱별 릴리즈(${appWorkflows.join(', ')})가 있어 같은 커밋이 노트에 중복으로 들어갑니다.`),
    );
  }
  const { ok } = await inquirer.prompt([
    { type: 'confirm', name: 'ok', message: '그래도 레포 전체 릴리즈로 만들까요?', default: false },
  ]);
  return ok;
}

/**
 * 어디의 릴리즈를 만들지 정한다.
 * - 단일 레포: 그 레포
 * - 모노레포 앱 폴더(apps/<앱>): 그 앱
 * - 모노레포 루트: 앱을 고르게 한다. (--app 으로 지정, --yes 면 --app 필수)
 */
async function resolveTarget({ cwd, monorepoRoot, opts, existing }) {
  if (!monorepoRoot) return SINGLE_TARGET;

  const apps = await listApps(monorepoRoot);
  const [first, second, ...rest] = path.relative(monorepoRoot, cwd).split(path.sep);

  if (first === 'apps' && second && rest.length === 0) {
    if (opts.app && opts.app !== second) fail(`지금 폴더는 apps/${second} 입니다. --app 은 모노레포 루트에서만 씁니다.`);
    return appTarget(monorepoRoot, second);
  }
  if (first !== '') {
    fail('모노레포에서는 앱 폴더(apps/<앱>)나 루트에서 실행해주세요.');
  }

  if (opts.app) {
    if (!apps.includes(opts.app)) fail(`apps/${opts.app} 이 없습니다. (있는 앱: ${apps.join(', ') || '없음'})`);
    return appTarget(monorepoRoot, opts.app);
  }
  if (opts.yes) {
    fail(`모노레포 루트에서는 앱을 정해주세요. 예: bc deploy --yes --app ${apps[0] ?? 'web'}`);
  }

  const { choice } = await inquirer.prompt([
    {
      type: 'list',
      name: 'choice',
      message: '어느 앱의 릴리즈를 만들까요?',
      choices: [
        ...apps.map((app) => ({ name: `apps/${app}`, value: app })),
        { name: '레포 전체 하나로 (모든 앱이 같은 버전)', value: REPO_CHOICE },
      ],
    },
  ]);

  if (choice !== REPO_CHOICE) return appTarget(monorepoRoot, choice);
  if (!(await confirmRepoWide(existing))) {
    console.log(chalk.dim('\n  취소했습니다.\n'));
    process.exit(0);
  }
  return REPO_TARGET;
}

async function askRelease(defaults, target) {
  return inquirer.prompt([
    {
      type: 'input',
      name: 'name',
      message: `릴리즈 이름 (Release 제목이 "<이름> v1.2.0" 이 됩니다):`,
      default: defaults.name,
      filter: (input) => input.trim(),
      validate: (input) =>
        (input.trim() !== '' && !UNSAFE.test(input)) || '비우거나 따옴표 · $ · 역따옴표는 쓸 수 없습니다.',
    },
    {
      type: 'confirm',
      name: 'latest',
      message: 'GitHub 의 Latest 표시를 이 앱 릴리즈에 붙일까요? (대표 앱 하나만 권장)',
      when: () => target.mode === 'app',
      default: defaults.latest,
    },
  ]);
}

/**
 * 쓴 파일을 프로젝트의 prettier 로 정리한다. 모노레포 루트 format:check 는 json · yml 도 검사해서,
 * JSON.stringify 로 다시 쓴 bc.config.json 이 그대로면 실패한다. prettier 가 없거나 실패하면 그대로 둔다.
 */
async function formatWithProjectPrettier(cwd, files) {
  try {
    await exec(`npx --no-install prettier --write ${files.map((f) => JSON.stringify(f)).join(' ')}`, {
      cwd,
    });
  } catch {
    /* prettier 가 없으면 넘어간다 */
  }
}

/** 설치된 settings 가 workflow 가 부르는 byuckchon-release-notes 를 갖고 있는지 */
async function releaseNotesBinStatus(dir) {
  try {
    const require = createRequire(path.join(dir, 'package.json'));
    const file = require.resolve('@byuckchon-frontend/settings/package.json');
    const pkg = JSON.parse(await fs.readFile(file, 'utf8'));
    return { installed: true, version: pkg.version, hasBin: Boolean(pkg.bin?.['byuckchon-release-notes']) };
  } catch {
    return { installed: false };
  }
}

/**
 * `bc deploy` (프로토타입)
 *
 * 릴리즈 노트 workflow 를 만든다. 배포는 하지 않는다.
 * GitHub Actions 에서 Run workflow 를 누르면 이전 태그 이후 커밋으로 버전을 올리고 Release 를 만든다.
 *
 *   단일 레포         bc.config.json          .github/workflows/release.yml       태그 v1.2.0
 *   모노레포 앱       apps/web/bc.config.json .github/workflows/release-web.yml   태그 web@v1.2.0
 *   모노레포 전체     bc.config.json          .github/workflows/release.yml       태그 v1.2.0
 */
export async function deployCommand(opts = {}) {
  const cwd = process.cwd();

  console.log(chalk.bold.cyan('\n  bc deploy — 릴리즈 노트 workflow (프로토타입)\n'));

  const ctx = await detectProjectContext(cwd);
  if (!ctx.isProject) fail('package.json 을 찾지 못했습니다. 프로젝트 루트에서 실행해주세요.');
  if (opts.prefix !== undefined && !TAG_PREFIX.test(opts.prefix)) {
    fail('--prefix 에는 영문 · 숫자 · @ . _ / - 만 쓸 수 있습니다.');
  }

  const monorepoRoot = await detectMonorepoRoot(cwd);
  const repoRoot = monorepoRoot ?? cwd;
  const existing = await existingReleaseWorkflows(repoRoot);
  const target = await resolveTarget({ cwd, monorepoRoot, opts, existing });

  if (target.mode === 'app' && existing.includes('release.yml')) {
    console.log(
      chalk.yellow('  ⚠ 레포 전체 릴리즈(release.yml)가 이미 있어 같은 커밋이 노트에 중복으로 들어갑니다.'),
    );
  }

  // 설정만 바뀌고 workflow 는 그대로면 둘이 어긋나므로, 이미 있으면 먼저 다시 만들지 정한다.
  if (existing.includes(target.workflowFile) && !opts.force) {
    const shownFile = `.github/workflows/${target.workflowFile}`;
    if (opts.yes) fail(`${shownFile} 이 이미 있습니다. 다시 만들려면 --force 를 붙여주세요.`);
    const { again } = await inquirer.prompt([
      { type: 'confirm', name: 'again', message: `${shownFile} 이 이미 있습니다. 다시 만들까요?`, default: false },
    ]);
    if (!again) {
      console.log(chalk.dim('\n  그대로 둡니다.\n'));
      process.exit(0);
    }
  }

  const appRoot = path.join(repoRoot, target.appDir);
  const configFile = path.join(appRoot, CONFIG_PATHS.projectFileName);
  let config = {};
  try {
    config = JSON.parse(await fs.readFile(configFile, 'utf8'));
  } catch {
    console.log(chalk.dim(`  ${path.relative(repoRoot, configFile)} 이 없어 새로 만듭니다.`));
  }

  // 다른 앱이 이미 릴리즈 workflow 를 갖고 있으면 Latest 는 그쪽에 두는 것을 기본으로 한다.
  const otherApps = existing.filter((name) => name !== 'release.yml' && name !== target.workflowFile);
  const defaults = {
    name: config.release?.name ?? target.app ?? 'Release',
    latest: config.release?.latest ?? (target.mode !== 'app' || otherApps.length === 0),
  };
  const answers = opts.yes ? defaults : { ...defaults, ...(await askRelease(defaults, target)) };

  const release = {
    tagPrefix: opts.prefix ?? config.release?.tagPrefix ?? (target.app ? `${target.app}@v` : 'v'),
    name: answers.name,
    latest: target.mode === 'app' ? Boolean(answers.latest) : true,
  };

  config.release = release;
  await fs.writeFile(configFile, JSON.stringify(config, null, 2) + '\n', 'utf8');
  console.log(chalk.green(`  ✓ ${path.relative(repoRoot, configFile)} 의 release 저장`));

  await ensureNvmrc(repoRoot);
  const { file } = await scaffoldReleaseWorkflow({ repoRoot, target, release });
  await formatWithProjectPrettier(repoRoot, [configFile, file]);

  console.log(chalk.green(`  ✓ release workflow 생성: ${path.relative(repoRoot, file)}`));
  console.log(chalk.dim(`    태그 ${release.tagPrefix}X.Y.Z · 제목 "${release.name} vX.Y.Z"`));
  if (target.paths.length) {
    console.log(chalk.dim(`    노트에 넣는 커밋: ${target.paths.join(', ')} 를 건드린 것`));
  }

  const bin = await releaseNotesBinStatus(appRoot);
  if (!bin.installed) {
    console.log(
      chalk.yellow('  ⚠ @byuckchon-frontend/settings 가 설치돼 있지 않습니다. devDependencies 에 추가해주세요.'),
    );
  } else if (!bin.hasBin) {
    console.log(
      chalk.yellow(
        `  ⚠ 설치된 settings(${bin.version})에는 byuckchon-release-notes 가 아직 없습니다.\n` +
          '    이 명령이 들어간 settings 가 배포되기 전까지 release workflow 는 실패합니다.',
      ),
    );
  }

  console.log();
  console.log(chalk.dim('  다음:'));
  console.log(chalk.dim(`    GitHub → Actions → "${target.app ? `Release ${target.app}` : 'Release'}" → Run workflow`));
  console.log(chalk.dim('    첫 릴리즈는 1.0.0 입니다. 다른 버전으로 시작하려면 Run workflow 에서 버전을 입력하세요.'));
  console.log();
}
