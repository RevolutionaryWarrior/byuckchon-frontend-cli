#!/usr/bin/env node
import { config as loadDotenv } from 'dotenv';
import { Command } from 'commander';
import chalk from 'chalk';

import { initCommand } from '../src/commands/init.js';
import { chatCommand } from '../src/commands/chat.js';
import { adoptCommand } from '../src/commands/adopt.js';
import {
  indexBuildCommand,
  indexStatusCommand,
  indexSearchCommand,
} from '../src/commands/indexCmd.js';
import { genApiTypesCommand } from '../src/commands/genCmd.js';
import {
  configShowCommand,
  configSetModelCommand,
  configSetKeyCommand,
  configSetGatewayCommand,
  configSetUiCommand,
} from '../src/commands/config.js';

// 프로젝트 .env 가 있으면 자동 로드 (ANTHROPIC_API_KEY, OPENAI_API_KEY 등).
loadDotenv({ quiet: true });

const program = new Command();

program
  .name('bc')
  .description('Byuckchon Frontend Workbench — 프로젝트 스타터 + AI 어시스턴트')
  .version('1.6.1');

program
  .command('init')
  .description('새 프론트엔드 프로젝트 생성 (React/Next.js)')
  .action(async () => {
    await initCommand();
  });

program
  .command('adopt')
  .description('기존 프로젝트에 bc 설정만 추가 (Expo/Electron/Next/Vite/CRA 자동 감지)')
  .option('-f, --force', '기존 bc.config.json 이 있어도 묻지 않고 덮어쓰기')
  .action(async (opts) => {
    await adoptCommand(opts);
  });

const idx = program
  .command('index')
  .description('코드베이스 임베딩 인덱스 빌드 (chat 의 RAG 컨텍스트로 사용됨)')
  .option('--rebuild', '캐시 무시하고 처음부터 다시 빌드')
  .action(async (opts) => {
    await indexBuildCommand(opts);
  });

idx.command('status').description('현재 인덱스 상태').action(async () => {
  await indexStatusCommand();
});

idx
  .command('search <query>')
  .description('인덱스에서 코드 검색 (디버그용)')
  .option('-k, --top-k <n>', '상위 K 개', '5')
  .action(async (query, opts) => {
    await indexSearchCommand(query, opts);
  });

const gen = program
  .command('gen')
  .description('자동 코드 생성 (OpenAPI → TS 타입 등)');

gen
  .command('api-types')
  .description('bc.config.json 의 api.openapi 또는 --source 에서 TS 타입 생성')
  .option('--source <urlOrPath>', 'OpenAPI URL 또는 로컬 파일 경로')
  .option('--out <path>', '출력 파일 경로 (기본 src/api/types.gen.ts)')
  .action(async (opts) => {
    await genApiTypesCommand(opts);
  });

// chat 본체와 alias 들을 한 번에 등록하기 위한 헬퍼.
function registerChatCommand(name, descSuffix = '') {
  return program
    .command(name)
    .description('AI 와 대화하며 코드 묻고/고치기 (ink TUI)' + descSuffix)
    .option('-m, --model <id>', '이번 세션에 사용할 모델 id')
    .option('--once <prompt>', 'REPL 없이 한 번만 호출하고 종료')
    .option('--plain', 'ink TUI 대신 평문 readline 모드')
    .option('-c, --continue', '가장 최근 세션 이어가기', false)
    .option('-r, --resume <id>', '특정 세션 id 이어가기')
    .option('--list-history', '저장된 세션 목록 출력 후 종료', false)
    .action(async (opts) => {
      await chatCommand({ ...opts, continueLast: opts.continue });
    });
}

registerChatCommand('chat');
registerChatCommand('start', '  · chat 의 alias');

const cfg = program
  .command('config')
  .description('CLI 설정 (모델, API 키, 게이트웨이)');

cfg
  .command('show')
  .description('현재 적용 중인 설정 보기')
  .action(async () => {
    await configShowCommand();
  });

cfg
  .command('set-model [id]')
  .description('기본 AI 모델 변경 (인자 없으면 대화형)')
  .action(async (id) => {
    await configSetModelCommand(id);
  });

cfg
  .command('set-key <provider> [key]')
  .description('API 키 저장 (provider: anthropic | openai). key 생략 시 안전 입력.')
  .action(async (provider, key) => {
    await configSetKeyCommand(provider, key);
  });

cfg
  .command('set-gateway [url]')
  .description('사내 AI 게이트웨이 URL 설정 (인자 없으면 해제)')
  .action(async (url) => {
    await configSetGatewayCommand(url);
  });

cfg
  .command('set-ui <mode>')
  .description('chat 입력 모드: ink (풀 TUI) | plain (readline — 한글 IME 안정)')
  .action(async (mode) => {
    await configSetUiCommand(mode);
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

// 인자 없이 `bc` 만 친 경우엔 chat 으로 자동 진입 (codex CLI 와 같은 UX).
// 단, --version / --help 같이 명시 플래그가 있으면 commander 가 처리하도록 둔다.
const NO_ARGS = process.argv.length <= 2;

(async () => {
  try {
    if (NO_ARGS) {
      await chatCommand({});
      return;
    }
    await program.parseAsync(process.argv);
  } catch (err) {
    console.error(chalk.red('\n  실행 중 오류: ') + (err?.message ?? err) + '\n');
    process.exit(1);
  }
})();
