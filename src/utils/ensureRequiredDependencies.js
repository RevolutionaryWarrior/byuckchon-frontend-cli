import { execFile as execFileCallback } from 'node:child_process';
import { promisify } from 'node:util';

import { versions } from '../constants/versions.js';

const execFile = promisify(execFileCallback);

const COMMON_DEPENDENCIES = ['@tanstack/react-query', 'zod'];

/**
 * 스캐폴딩되는 설정 파일들이 참조하는 패키지.
 * tools/review.config.mjs, eslint.config, prettier.config, tsconfig 가 모두
 * @byuckchon-frontend/settings 를 import/extends 하므로 없으면 lint·build 가 실패한다.
 */
const COMMON_DEV_DEPENDENCIES = ['@byuckchon-frontend/settings'];

const installCommands = {
  npm: ['npm', ['install']],
  pnpm: ['pnpm', ['add']],
  yarn: ['yarn', ['add']],
  bun: ['bun', ['add']],
};

/** devDependencies 로 설치할 때 붙이는 플래그 */
const devFlags = {
  npm: '--save-dev',
  pnpm: '-D',
  yarn: '-D',
  bun: '-d',
};

export function hasDependency(pkg, packageName) {
  return Boolean(
    pkg?.dependencies?.[packageName] ||
      pkg?.devDependencies?.[packageName] ||
      pkg?.peerDependencies?.[packageName] ||
      pkg?.optionalDependencies?.[packageName],
  );
}

export function requiredDependenciesForFramework(framework) {
  return framework === 'next'
    ? COMMON_DEPENDENCIES
    : [...COMMON_DEPENDENCIES, 'axios'];
}

export async function ensureRequiredDependencies({
  cwd,
  pkg,
  framework,
  packageManager,
  run = execFile,
}) {
  const notInstalled = (packageName) => !hasDependency(pkg, packageName);
  const missing = requiredDependenciesForFramework(framework).filter(notInstalled);
  const missingDev = COMMON_DEV_DEPENDENCIES.filter(notInstalled);

  if (!missing.length && !missingDev.length) {
    return { installed: [], packageManager };
  }

  const selectedPackageManager = installCommands[packageManager]
    ? packageManager
    : 'npm';
  const [command, baseArgs] = installCommands[selectedPackageManager];
  const spec = (packageName) =>
    versions[packageName] ? `${packageName}@${versions[packageName]}` : packageName;

  if (missing.length) {
    await run(command, [...baseArgs, ...missing.map(spec)], { cwd });
  }
  if (missingDev.length) {
    await run(
      command,
      [...baseArgs, devFlags[selectedPackageManager], ...missingDev.map(spec)],
      { cwd },
    );
  }

  return {
    installed: [...missing, ...missingDev],
    packageManager: selectedPackageManager,
  };
}
