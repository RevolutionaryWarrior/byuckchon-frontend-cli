import fs from 'node:fs/promises';
import path from 'node:path';

import chalk from 'chalk';
import inquirer from 'inquirer';

import { CONFIG_PATHS } from '../config/index.js';
import { detectProjectContext } from '../context/detect.js';
import { detectMonorepoRoot } from '../context/monorepo.js';
import { ensureNvmrc } from '../generators/ensureNvmrc.js';
import { scaffoldDeployWorkflow } from '../generators/scaffoldDeployWorkflow.js';
import { workflowPackageManagerFrom } from '../generators/workflowPackageManager.js';

/** "@acme/web" → "web@", "my-app" → "my-app@" */
export function defaultTagPrefix(packageName, fallbackDir) {
  const base = String(packageName ?? '').split('/').pop() || path.basename(fallbackDir);
  return `${base}@`;
}

/** Enter 만 눌러도 되는 기본값 (설계 문서 ⑥의 결정: 날짜 버전 · 커밋 기반 노트 · CHANGELOG.md 끔) */
function defaultAnswers(tagPrefix) {
  return {
    enabled: true,
    version: 'date',
    target: 'github-release',
    slack: false,
    slackSecret: 'SLACK_WEBHOOK_URL',
    tagPrefix,
  };
}

async function askRelease(defaults) {
  return inquirer.prompt([
    {
      type: 'confirm',
      name: 'enabled',
      message: '릴리즈 노트 단계를 남길까요? (배포 성공 시에만 태그 · Release 생성)',
      default: defaults.enabled,
    },
    {
      type: 'list',
      name: 'version',
      message: '버전 이름',
      when: (a) => a.enabled,
      default: defaults.version,
      choices: [
        { name: `날짜 (${defaults.tagPrefix}2026.11.05, 같은 날 재배포는 .2)`, value: 'date' },
        // TODO: settings 의 byuckchon-release-notes 에 SemVer 모드가 생기면 연다.
        { name: `SemVer (${defaults.tagPrefix}1.4.0)`, value: 'semver', disabled: '준비 중' },
      ],
    },
    {
      type: 'list',
      name: 'target',
      message: '남길 곳',
      when: (a) => a.enabled,
      default: defaults.target,
      choices: [
        { name: 'GitHub Release', value: 'github-release' },
        // 문서 결정: 머지 시점 CHANGELOG 는 실패한 배포까지 기록하므로 끈다.
        { name: 'CHANGELOG.md', value: 'changelog', disabled: '사용 안 함' },
      ],
    },
    {
      type: 'confirm',
      name: 'slack',
      message: 'Slack 으로 배포 완료를 알릴까요? (선택)',
      when: (a) => a.enabled,
      default: defaults.slack,
    },
    {
      type: 'input',
      name: 'slackSecret',
      message: '웹훅 URL 을 넣어둔 GitHub Secret 이름 (URL 자체는 넣지 마세요):',
      when: (a) => a.enabled && a.slack,
      default: defaults.slackSecret,
      validate: (v) =>
        /^[A-Z_][A-Z0-9_]*$/.test(v.trim()) || 'Secret 이름만 입력하세요. (예: SLACK_WEBHOOK_URL)',
    },
  ]);
}

/**
 * `bc deploy` (프로토타입)
 *
 * 운영 배포 workflow 를 만든다. 배포 job 이 성공했을 때만 release job 이 돌아
 * 태그 · GitHub Release 노트(· Slack 알림)를 남긴다.
 *
 *   bc.config.json            → "release": { "version": "date", "tagPrefix": "web@", ... }
 *   .github/workflows/deploy.yml
 *
 * 배포 단계 자체(S3 · Lightsail)는 아직 TODO 로 비워둔다.
 */
export async function deployCommand(opts = {}) {
  const cwd = process.cwd();
  const configFile = path.join(cwd, CONFIG_PATHS.projectFileName);

  console.log(chalk.bold.cyan('\n  bc deploy — 운영 배포 + 릴리즈 노트 (프로토타입)\n'));

  const ctx = await detectProjectContext(cwd);
  if (!ctx.isProject) {
    console.log(chalk.yellow('  ⚠ package.json 을 찾지 못했습니다. 프로젝트 루트에서 실행해주세요.\n'));
    process.exit(1);
  }

  let config = {};
  try {
    config = JSON.parse(await fs.readFile(configFile, 'utf8'));
  } catch {
    console.log(chalk.dim(`  ${CONFIG_PATHS.projectFileName} 이 없어 새로 만듭니다.`));
  }

  const tagPrefix =
    opts.prefix ?? config.release?.tagPrefix ?? defaultTagPrefix(ctx.pkg.name, cwd);
  const defaults = defaultAnswers(tagPrefix);
  const answers = opts.yes ? defaults : { ...defaults, ...(await askRelease(defaults)) };

  const release = {
    enabled: answers.enabled,
    version: answers.version,
    tagPrefix,
    slackSecret: answers.enabled && answers.slack ? answers.slackSecret.trim() : null,
  };

  // 비밀값은 저장하지 않는다. Slack 은 Secret 이름만 남긴다.
  config.release = release.enabled
    ? {
        version: release.version,
        tagPrefix: release.tagPrefix,
        target: 'github-release',
        changelog: false,
        ...(release.slackSecret ? { slackSecret: release.slackSecret } : {}),
      }
    : null;
  await fs.writeFile(configFile, JSON.stringify(config, null, 2) + '\n', 'utf8');
  console.log(chalk.green(`  ✓ ${CONFIG_PATHS.projectFileName} 의 release 저장`));

  // workflow 는 저장소 루트에 둔다. 모노레포 앱별 태그(web@ · admin@)는 다음 단계.
  const monorepoRoot = await detectMonorepoRoot(cwd);
  const projectRoot = monorepoRoot ?? cwd;
  if (monorepoRoot) {
    console.log(
      chalk.yellow('  ⚠ 모노레포는 아직 앱 하나 기준입니다. (앱별 태그 · 경로 필터는 다음 단계)'),
    );
  }

  await ensureNvmrc(projectRoot);
  const packageManager = await workflowPackageManagerFrom(ctx.packageManagerInfo, projectRoot);

  const { target, written } = await scaffoldDeployWorkflow({
    projectRoot,
    release,
    packageManager,
    overwrite: Boolean(opts.force),
  });

  if (written) {
    console.log(chalk.green(`  ✓ 배포 workflow 생성: ${path.relative(cwd, target) || target}`));
    console.log(chalk.dim(`    패키지 매니저: ${packageManager.name} · 태그: ${tagPrefix}YYYY.MM.DD`));
  } else {
    console.log(chalk.dim(`  배포 workflow 유지: ${target} (이미 존재 — 덮어쓰려면 --force)`));
  }

  // release job 은 settings 의 byuckchon-release-notes 를 실행한다.
  const deps = { ...ctx.pkg.dependencies, ...ctx.pkg.devDependencies };
  if (release.enabled && !deps['@byuckchon-frontend/settings']) {
    console.log(
      chalk.yellow('  ⚠ @byuckchon-frontend/settings 가 의존성에 없습니다. devDependencies 에 추가해주세요.'),
    );
  }

  console.log();
  console.log(chalk.dim('  다음:'));
  console.log(chalk.dim('    deploy.yml 의 "배포 (TODO)" 단계를 S3 · Lightsail 명령으로 채워주세요.'));
  if (release.slackSecret) {
    console.log(chalk.dim(`    GitHub 저장소 Secrets 에 ${release.slackSecret} 를 등록해주세요.`));
  }
  console.log();
}
