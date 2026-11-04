/**
 * 생성 직전에 "지금 npm 에 올라간 최신 settings" 의 버전 매트릭스를 쓰도록 맞춘다.
 *
 * 왜 필요한가
 *   CLI 는 매트릭스를 자기와 같이 설치된 settings 에서 읽는다. CLI 를 예전에 전역 설치했으면
 *   매트릭스도 그때 것으로 고정되는데, 생성된 package.json 의 settings 는 `^` 범위라
 *   설치 단계에선 최신 settings 가 들어온다. → 앱 의존성은 옛 매트릭스, 설정은 새 settings.
 *
 * 하는 일
 *   1) CLI 자체 버전을 npm 최신과 비교해 뒤처졌으면 멈춘다. (ensureCliUpToDate)
 *      버전표는 최신 settings 를 쓰는데 파일 템플릿은 설치된 CLI 것이라, 둘이 어긋나지 않게
 *      major · minor · patch 구분 없이 최신 CLI 로만 생성한다.
 *   2) npm 의 최신 settings 버전이 CLI 에 포함된 것보다 높으면 그 버전을 받아(npm pack)
 *      versions · nvmrc · turbo.json · vscode 등을 그 버전에서 읽는다.
 *   3) 네트워크 실패 등은 경고만 하고 CLI 에 포함된 settings 로 계속 진행한다.
 *
 * 개발·테스트용
 *   BC_SETTINGS_DIR=<settings 패키지 폴더>  그 폴더의 settings 를 쓴다.
 *   BC_SKIP_CLI_CHECK=1                     CLI 버전 검사를 건너뛴다.
 */

import { exec as execCallback } from 'node:child_process';
import fs from 'node:fs/promises';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { promisify } from 'node:util';

import chalk from 'chalk';

import { replaceVersions } from '../constants/versions.js';
import {
  bundledSettingsVersion,
  resetSettingsRoot,
  resolveSettingsAsset,
  settingsVersion,
  useSettingsRoot,
} from './settingsAssets.js';

const exec = promisify(execCallback);
const require = createRequire(import.meta.url);

const SETTINGS_PKG = '@byuckchon-frontend/settings';
const CLI_PKG = 'byuckchon-frontend-cli';

/** x.y.z 비교. a > b 이면 양수. (prerelease 는 무시) */
export function compareVersions(a, b) {
  const parse = (v) =>
    String(v)
      .replace(/^[^\d]*/, '')
      .split('-')[0]
      .split('.')
      .map((n) => Number.parseInt(n, 10) || 0);
  const pa = parse(a);
  const pb = parse(b);
  for (let i = 0; i < 3; i += 1) {
    const diff = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (diff) return diff;
  }
  return 0;
}

async function npmLatest(pkgName) {
  const { stdout } = await exec(`npm view ${pkgName} version`, { timeout: 10_000 });
  const version = stdout.trim().split('\n').pop()?.trim();
  if (!version) throw new Error(`${pkgName} 버전을 읽지 못했습니다.`);
  return version;
}

async function exists(target) {
  try {
    await fs.access(target);
    return true;
  } catch {
    return false;
  }
}

/** npm pack 으로 settings@version 을 받아 풀고, 패키지 루트 경로를 돌려준다. (임시 폴더에 캐시) */
async function downloadSettings(version) {
  const baseDir = path.join(os.tmpdir(), 'byuckchon-cli', `settings-${version}`);
  const pkgRoot = path.join(baseDir, 'package');
  if (await exists(path.join(pkgRoot, 'package.json'))) return pkgRoot;

  await fs.rm(baseDir, { recursive: true, force: true });
  await fs.mkdir(baseDir, { recursive: true });
  const { stdout } = await exec(
    `npm pack ${SETTINGS_PKG}@${version} --pack-destination "${baseDir}" --silent`,
    { timeout: 60_000 },
  );
  const tarball = stdout.trim().split('\n').pop()?.trim();
  if (!tarball) throw new Error('npm pack 결과를 찾지 못했습니다.');
  await exec(`tar -xzf "${path.join(baseDir, path.basename(tarball))}" -C "${baseDir}"`, {
    timeout: 60_000,
  });
  if (!(await exists(path.join(pkgRoot, 'package.json')))) {
    throw new Error('settings 패키지 압축을 풀지 못했습니다.');
  }
  return pkgRoot;
}

async function applySettingsRoot(root) {
  try {
    useSettingsRoot(root);
    const mod = await import(pathToFileURL(resolveSettingsAsset('versions')).href);
    const matrix = mod.versions ?? mod.default;
    if (!matrix || typeof matrix !== 'object') {
      throw new Error('settings 의 versions 를 읽지 못했습니다.');
    }
    const version = settingsVersion();
    replaceVersions(matrix, version);
    return version;
  } catch (error) {
    // 파일은 새 settings, 매트릭스는 옛 settings 로 섞이지 않도록 되돌린다.
    resetSettingsRoot();
    throw error;
  }
}

const UPDATE_HINT = `npm i -g ${CLI_PKG}@latest   또는   npx ${CLI_PKG}@latest <명령>`;

/**
 * 사용 전에 CLI 버전을 검사한다.
 * - npm 최신보다 뒤처졌으면(major · minor · patch 무관) 업데이트 명령을 보여주고 종료한다.
 * - npm 에 접속하지 못하면 경고만 하고 계속한다.
 */
export async function ensureCliUpToDate() {
  if (process.env.BC_SKIP_CLI_CHECK) return { status: 'skipped' };

  const current = require('../../package.json').version;
  let latest;
  try {
    latest = await npmLatest(CLI_PKG);
  } catch {
    console.log(
      chalk.yellow(`  ⚠ npm 에서 ${CLI_PKG} 최신 버전을 확인하지 못했습니다. 현재 ${current} 로 진행합니다.\n`),
    );
    return { status: 'unknown', current };
  }

  if (compareVersions(latest, current) > 0) {
    console.log(chalk.red(`\n  ✗ ${CLI_PKG} ${current} 은(는) 최신 버전이 아닙니다. (최신 ${latest})`));
    console.log(chalk.dim('    최신 CLI 로만 생성합니다. 업데이트 후 다시 실행하세요.'));
    console.log(chalk.white(`\n    ${UPDATE_HINT}\n`));
    process.exit(1);
  }
  return { status: 'latest', current, latest };
}

/**
 * 버전 매트릭스를 최신 settings 기준으로 맞춘다. 실패해도 throw 하지 않는다.
 * @returns {Promise<{ version: string, source: 'env' | 'latest' | 'bundled' }>}
 */
export async function prepareVersionMatrix() {
  const bundled = bundledSettingsVersion();

  if (process.env.BC_SETTINGS_DIR) {
    try {
      const version = await applySettingsRoot(path.resolve(process.env.BC_SETTINGS_DIR));
      console.log(chalk.dim(`  settings ${version} 사용 (BC_SETTINGS_DIR)\n`));
      return { version, source: 'env' };
    } catch (error) {
      console.log(chalk.yellow(`  ⚠ BC_SETTINGS_DIR 를 읽지 못했습니다: ${error.message}`));
    }
  }

  // 오래된 CLI 면 여기서 멈춘다. (템플릿과 최신 버전표가 어긋나지 않도록)
  await ensureCliUpToDate();

  const [latestSettings] = await Promise.allSettled([npmLatest(SETTINGS_PKG)]);

  if (latestSettings.status !== 'fulfilled') {
    console.log(
      chalk.yellow(
        `  ⚠ npm 에서 최신 settings 버전을 확인하지 못해 CLI 에 포함된 settings ${bundled} 기준으로 진행합니다.\n`,
      ),
    );
    return { version: bundled, source: 'bundled' };
  }

  const latest = latestSettings.value;
  if (compareVersions(latest, bundled) <= 0) {
    return { version: bundled, source: 'bundled' };
  }

  try {
    const root = await downloadSettings(latest);
    const version = await applySettingsRoot(root);
    console.log(
      chalk.dim(`  최신 settings ${version} 의 버전 매트릭스로 생성합니다. (CLI 포함: ${bundled})\n`),
    );
    return { version, source: 'latest' };
  } catch (error) {
    console.log(
      chalk.yellow(
        `  ⚠ 최신 settings ${latest} 를 받지 못해 CLI 에 포함된 ${bundled} 기준으로 진행합니다. (${error.message})`,
      ),
    );
    console.log(chalk.dim(`    CLI 를 업데이트하면 해결됩니다: npm i -g ${CLI_PKG}@latest\n`));
    return { version: bundled, source: 'bundled' };
  }
}
