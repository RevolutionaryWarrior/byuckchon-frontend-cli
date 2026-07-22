import fs from 'node:fs/promises';
import path from 'node:path';

import chalk from 'chalk';

import { askAddQuestions } from '../prompts/initPrompts.js';
import { createApp } from '../generators/createApp.js';
import { installMonorepoDeps } from '../generators/install.js';
import {
  detectMonorepoRoot,
  detectScope,
  appExists,
} from '../context/monorepo.js';

/**
 * `bc add`
 *
 * 기존 pnpm 모노레포에 React/Next 앱을 하나 추가한다.
 * (현재 위치에서 위로 올라가며 pnpm-workspace.yaml 을 찾는다.)
 */
export async function addCommand() {
  console.log(chalk.bold.cyan('\n  bc add — 모노레포에 앱 추가\n'));

  const root = await detectMonorepoRoot(process.cwd());
  if (!root) {
    console.log(chalk.yellow('  ⚠ pnpm 모노레포를 찾지 못했습니다.'));
    console.log(
      chalk.dim(
        '    모노레포 루트(또는 그 하위)에서 실행하세요. 새로 만들려면 `bc init` → 모노레포.\n',
      ),
    );
    process.exit(1);
  }

  const scope = await detectScope(root);
  console.log(chalk.dim(`  모노레포: ${root}`));
  console.log(chalk.dim(`  scope:    @${scope}\n`));

  const answers = await askAddQuestions({ scope });

  if (await appExists(root, answers.appName)) {
    console.log(
      chalk.red(`\n  오류: apps/${answers.appName} 가 이미 존재합니다.\n`),
    );
    process.exit(1);
  }

  const config = { ...answers, projectName: answers.appName, typescript: true };
  const appDir = path.join(root, 'apps', answers.appName);
  const appPkgName = `@${scope}/${answers.appName}`;

  console.log(
    chalk.dim(`  ${answers.framework} 앱을 apps/${answers.appName} 에 생성하는 중...\n`),
  );

  await createApp({ appDir, config, scope });
  await addRootDevScript(root, answers.appName, appPkgName);
  await installMonorepoDeps({ root, appPkgName });

  console.log(chalk.bold.green(`\n  ✓ ${appPkgName} 앱을 추가했습니다!\n`));
  console.log(chalk.yellow('  실행:\n'));
  console.log(chalk.white(`    pnpm --filter ${appPkgName} dev`));
  console.log(chalk.white(`    # 또는  pnpm ${answers.appName}\n`));
}

/**
 * 루트 package.json 에 `"<app>": "pnpm --filter <pkg> dev"` 단축 스크립트를 추가.
 */
async function addRootDevScript(root, appName, appPkgName) {
  const pkgPath = path.join(root, 'package.json');
  let pkg;
  try {
    pkg = JSON.parse(await fs.readFile(pkgPath, 'utf8'));
  } catch {
    return;
  }
  pkg.scripts = pkg.scripts ?? {};
  if (!pkg.scripts[appName]) {
    pkg.scripts[appName] = `pnpm --filter ${appPkgName} dev`;
    await fs.writeFile(pkgPath, JSON.stringify(pkg, null, 2) + '\n', 'utf8');
  }
}
