import fs from 'node:fs/promises';
import path from 'node:path';

import chalk from 'chalk';
import inquirer from 'inquirer';

import { detectProjectContext, summarizeContext } from '../context/detect.js';
import { CONFIG_PATHS } from '../config/index.js';
import { modelChoices, DEFAULT_MODEL_ID } from '../ai/models.js';

/**
 * `bc adopt`
 *
 * 기존 프로젝트(현재 디렉터리)에 bc.config.json 만 살포시 깔아준다.
 * 소스 코드는 절대 건드리지 않는다.
 *
 * 흐름:
 *   1) 자동 감지(framework, styling, language, routing 등) 결과를 보여주고
 *   2) 모델·Figma·OpenAPI URL 만 추가로 묻고
 *   3) bc.config.json 생성/덮어쓰기 (이미 있으면 confirm)
 */
export async function adoptCommand(opts = {}) {
  const cwd = process.cwd();
  const targetFile = path.join(cwd, CONFIG_PATHS.projectFileName);

  console.log(chalk.bold.cyan('\n  bc adopt — 기존 프로젝트에 bc 설정 추가\n'));

  const ctx = await detectProjectContext(cwd);
  if (!ctx.isProject) {
    console.log(chalk.yellow('  ⚠ package.json 을 찾지 못했습니다.'));
    console.log(chalk.dim('    프로젝트 루트에서 실행해주세요. 아니면 새로 만들려면 `bc init`.\n'));
    process.exit(1);
  }

  console.log(chalk.bold('  감지된 프로젝트'));
  console.log(`    ${chalk.dim('이름     ')} ${ctx.pkg.name ?? '(이름 없음)'}`);
  console.log(`    ${chalk.dim('스택     ')} ${summarizeContext(ctx)}`);
  if (ctx.componentDirs.length) {
    console.log(`    ${chalk.dim('컴포넌트 ')} ${ctx.componentDirs.join(', ')}`);
  }
  if (ctx.designTokensFiles.length) {
    console.log(`    ${chalk.dim('토큰파일 ')} ${ctx.designTokensFiles.join(', ')}`);
  }
  if (ctx.hasStorybook) console.log(`    ${chalk.dim('스토리북 ')} 있음`);
  if (ctx.hasTests) console.log(`    ${chalk.dim('테스트   ')} ${ctx.hasTests}`);
  console.log();

  // 이미 bc.config.json 이 있으면 덮어쓰기 확인
  let existing = null;
  try {
    existing = JSON.parse(await fs.readFile(targetFile, 'utf8'));
  } catch (e) {
    if (e.code !== 'ENOENT') {
      console.log(chalk.yellow('  ⚠ 기존 bc.config.json 을 읽지 못했습니다 — 새로 작성합니다.'));
    }
  }

  if (existing && !opts.force) {
    const { ok } = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'ok',
        message: 'bc.config.json 이 이미 있습니다. 새 값으로 머지할까요?',
        default: true,
      },
    ]);
    if (!ok) {
      console.log(chalk.dim('  취소했습니다.\n'));
      return;
    }
  }

  const answers = await inquirer.prompt([
    {
      type: 'list',
      name: 'aiModel',
      message: '이 프로젝트에서 기본으로 쓸 AI 모델은?',
      choices: [
        ...modelChoices(),
        { name: '글로벌 기본값 따르기 (변경 없음)', value: null },
      ],
      default: existing?.ai?.model ?? DEFAULT_MODEL_ID,
    },
    {
      type: 'input',
      name: 'figmaUrl',
      message: 'Figma 파일/노드 URL (선택, 엔터로 건너뛰기):',
      default: existing?.design?.figma ?? '',
    },
    {
      type: 'input',
      name: 'openapiUrl',
      message: '백엔드 OpenAPI(Swagger) URL (선택):',
      default: existing?.api?.openapi ?? '',
    },
    {
      type: 'input',
      name: 'apiBaseUrl',
      message: 'API base URL (선택):',
      default: existing?.api?.baseUrl ?? '',
    },
  ]);

  const next = {
    $schema: 'https://byuckchon.dev/bc.schema.json',
    ai: {
      model: answers.aiModel ?? null,
    },
    design: {
      figma: answers.figmaUrl?.trim() || null,
      figmaTokenEnv: existing?.design?.figmaTokenEnv ?? 'FIGMA_TOKEN',
    },
    api: {
      openapi: answers.openapiUrl?.trim() || null,
      baseUrl: answers.apiBaseUrl?.trim() || null,
    },
    context: existing?.context ?? {
      include: ['src/**/*.{ts,tsx,js,jsx}', 'app/**/*.{ts,tsx,js,jsx}', 'bc.config.json'],
      exclude: ['**/*.test.*', '**/__mocks__/**', 'node_modules/**', 'dist/**', '.next/**'],
      maxFiles: 20,
    },
    framework: ctx.framework,
    detected: {
      language: ctx.language,
      styling: ctx.styling,
      packageManager: ctx.packageManager,
      routing: ctx.routing,
      componentDirs: ctx.componentDirs,
      designTokensFiles: ctx.designTokensFiles,
      hasStorybook: ctx.hasStorybook,
      hasTests: ctx.hasTests,
      detectedAt: new Date().toISOString(),
    },
  };

  await fs.writeFile(targetFile, JSON.stringify(next, null, 2) + '\n', 'utf8');

  console.log(chalk.green(`\n  ✓ ${CONFIG_PATHS.projectFileName} 작성 완료.`));
  console.log(chalk.dim(`    ${targetFile}\n`));
  console.log(chalk.dim('  다음:'));
  if (!process.env.ANTHROPIC_API_KEY) {
    console.log(chalk.dim('    bc config set-key anthropic    # API 키 등록'));
  }
  console.log(chalk.dim('    bc chat                        # 이 프로젝트 컨텍스트로 대화'));
  console.log();
}
