import { execFile as execFileCallback } from 'node:child_process';
import { promisify } from 'node:util';

import { versions } from '../constants/versions.js';

const execFile = promisify(execFileCallback);

const COMMON_DEPENDENCIES = ['@tanstack/react-query', 'zod'];

const installCommands = {
  npm: ['npm', ['install']],
  pnpm: ['pnpm', ['add']],
  yarn: ['yarn', ['add']],
  bun: ['bun', ['add']],
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
  const missing = requiredDependenciesForFramework(framework).filter(
    (packageName) => !hasDependency(pkg, packageName),
  );

  if (!missing.length) {
    return { installed: [], packageManager };
  }

  const selectedPackageManager = installCommands[packageManager]
    ? packageManager
    : 'npm';
  const [command, baseArgs] = installCommands[selectedPackageManager];
  const packageSpecs = missing.map(
    (packageName) => `${packageName}@${versions[packageName]}`,
  );

  await run(command, [...baseArgs, ...packageSpecs], { cwd });

  return { installed: missing, packageManager: selectedPackageManager };
}
