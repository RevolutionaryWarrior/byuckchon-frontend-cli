import { exec as execCallback } from 'node:child_process';
import { promisify } from 'node:util';

import chalk from 'chalk';

const exec = promisify(execCallback);

export const BYUCKCHON_PACKAGES = [
  '@byuckchon-frontend/hooks',
  '@byuckchon-frontend/utils',
  '@byuckchon-frontend/basic-ui',
  '@byuckchon-frontend/core',
];

async function hasPnpm() {
  try {
    await exec('pnpm --version');
    return true;
  } catch {
    return false;
  }
}

/**
 * 모노레포 루트에서 pnpm install + 앱에 byuckchon 패키지 추가.
 * 네트워크/pnpm 미설치 등으로 실패해도 스캐폴딩 자체는 성공으로 둔다(경고만).
 *
 * @param {object} args
 * @param {string} args.root       모노레포 루트
 * @param {string} args.appPkgName 앱 package.json name (예: @scope/web)
 */
export async function installMonorepoDeps({ root, appPkgName }) {
  if (!(await hasPnpm())) {
    console.log(
      chalk.yellow('\n  ⚠ pnpm 이 없어 의존성 설치를 건너뜁니다.'),
    );
    console.log(chalk.dim('    npm i -g pnpm  후 루트에서  pnpm install  을 실행하세요.\n'));
    return;
  }

  try {
    console.log(chalk.dim('\n  pnpm install 중... (잠시 걸릴 수 있어요)'));
    await exec('pnpm install', { cwd: root });
  } catch (err) {
    console.log(chalk.yellow('  ⚠ pnpm install 실패 — 루트에서 직접 실행해주세요.'));
    console.log(chalk.dim(`    ${err?.message ?? err}\n`));
    return;
  }

  if (appPkgName) {
    try {
      await exec(
        `pnpm --filter ${appPkgName} add ${BYUCKCHON_PACKAGES.join(' ')}`,
        { cwd: root },
      );
    } catch (err) {
      console.log(
        chalk.yellow(
          `  ⚠ byuckchon 패키지 설치 실패 — 나중에 다음을 실행하세요:`,
        ),
      );
      console.log(
        chalk.dim(
          `    pnpm --filter ${appPkgName} add ${BYUCKCHON_PACKAGES.join(' ')}\n`,
        ),
      );
    }
  }
}
