#!/usr/bin/env node
import { createRequire } from 'node:module';

import { Command } from 'commander';
import chalk from 'chalk';

import { initCommand } from '../src/commands/init.js';
import { addCommand } from '../src/commands/add.js';
import { adoptCommand } from '../src/commands/adopt.js';

// 버전은 package.json 에서 읽는다. 여기에 직접 적으면 changesets 가 올린 버전과
// 어긋나서, 실제로는 최신인데 옛 버전이라고 표시되는 일이 생긴다.
const require = createRequire(import.meta.url);
const { version } = require('../package.json');

const program = new Command();

program
  .name('bc')
  .description('Byuckchon Frontend Workbench — 프로젝트 스타터')
  .version(version);

program
  .command('init')
  .description('새 프론트엔드 프로젝트 생성 (단일 React/Next 또는 pnpm 모노레포)')
  .action(async () => {
    await initCommand();
  });

program
  .command('add')
  .description('기존 pnpm 모노레포에 React/Next 앱 추가 (apps/ 아래)')
  .action(async () => {
    await addCommand();
  });

program
  .command('adopt')
  .description('기존 프로젝트에 bc 설정만 추가 (Expo/Electron/Next/Vite/CRA 자동 감지)')
  .option('-f, --force', '기존 bc.config.json 이 있어도 묻지 않고 덮어쓰기')
  .action(async (opts) => {
    await adoptCommand(opts);
  });

program.exitOverride((err) => {
  if (
    err.code === 'commander.help' ||
    err.code === 'commander.helpDisplayed' ||
    err.code === 'commander.version'
  ) {
    process.exit(0);
  }
  if (err.code === 'commander.missingArgument' || err.code === 'commander.unknownCommand') {
    console.error(chalk.red('\n  ' + err.message + '\n'));
    process.exit(1);
  }
  throw err;
});

// 인자 없이 `bc` 만 친 경우엔 도움말을 보여준다.
const NO_ARGS = process.argv.length <= 2;

(async () => {
  try {
    if (NO_ARGS) {
      program.outputHelp();
      return;
    }
    await program.parseAsync(process.argv);
  } catch (err) {
    console.error(chalk.red('\n  실행 중 오류: ') + (err?.message ?? err) + '\n');
    process.exit(1);
  }
})();
