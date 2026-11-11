import fs from 'node:fs/promises';
import path from 'node:path';

import chalk from 'chalk';
import inquirer from 'inquirer';

import { loadProjectConfig } from '../config/index.js';
import { generateApiTypes } from '../openapi/codegen.js';
import { loadOpenApi } from '../openapi/fetch.js';

const DEFAULT_OUT = 'src/api/types.gen.ts';

/**
 * `bc gen api-types`
 *
 * 인자 우선순위:
 *   1) --source <url|path>  명시 입력
 *   2) bc.config.json 의 api.openapi
 *   3) 둘 다 없고 터미널이면 한 번 묻고 api.openapi 에 저장 (다음부턴 안 물음)
 *
 * 출력 파일:
 *   --out <path>  (기본 src/api/types.gen.ts)
 */
export async function genApiTypesCommand(opts = {}) {
  const { file: configFile, config } = await loadProjectConfig();
  let sourceInput = opts.source || config.api?.openapi;
  // 프롬프트로 받은 주소만 저장한다. --source 는 일회성 입력이라 config 를 건드리지 않는다.
  let askedSource = null;

  if (!sourceInput && process.stdin.isTTY) {
    askedSource = await askOpenApiSource();
    sourceInput = askedSource;
  }

  if (!sourceInput) {
    console.error(chalk.red('\n  OpenAPI 출처를 못 찾았습니다.'));
    console.error(chalk.dim('    --source <url|path> 로 직접 주거나'));
    console.error(chalk.dim('    bc.config.json 의 api.openapi 를 채우세요.\n'));
    process.exit(1);
  }
  const outFile = path.resolve(opts.out ?? DEFAULT_OUT);

  console.log(chalk.bold.cyan('\n  bc gen api-types\n'));
  console.log(chalk.dim(`    source  ${sourceInput}`));
  console.log(chalk.dim(`    out     ${outFile}\n`));

  // 먼저 fetch/load 단계로 입력이 유효한지 검증 (네트워크 에러 등 빠르게 잡음).
  try {
    await loadOpenApi(sourceInput);
  } catch (err) {
    console.error(chalk.red('  ' + (err?.message ?? err)) + '\n');
    process.exit(1);
  }

  // 읽히는 주소인 걸 확인한 뒤에 저장한다. (오타가 config 에 남지 않도록)
  if (askedSource) {
    await saveOpenApiSource(configFile, askedSource);
  }

  try {
    const res = await generateApiTypes({
      input: sourceInput,
      outFile,
      sourceLabel: sourceInput,
    });
    const kb = (res.bytes / 1024).toFixed(1);
    console.log(chalk.green(`  ✓ 타입 파일 생성 완료 (${kb}KB)`));
    console.log(chalk.dim(`    ${res.outFile}\n`));
    console.log(chalk.dim('  다음:'));
    console.log(chalk.dim('    - 코드에서 import 해서 사용:'));
    console.log(chalk.dim(`        import type { paths, components } from "${path.relative(process.cwd(), outFile).replace(/\.[^.]+$/, '')}";\n`));
  } catch (err) {
    console.error(chalk.red('\n  타입 생성 실패: ') + (err?.message ?? err) + '\n');
    process.exit(1);
  }
}

async function askOpenApiSource() {
  const { source } = await inquirer.prompt([
    {
      type: 'input',
      name: 'source',
      message: 'Swagger(OpenAPI) 주소:',
      validate: (v) => (v.trim() ? true : 'URL 또는 파일 경로를 입력하세요.'),
    },
  ]);
  return source.trim();
}

/**
 * bc.config.json 의 api.openapi 만 갱신한다. 나머지 필드는 그대로 둔다.
 * config 파일이 없으면 저장하지 않고 안내만 한다. (이번 실행은 계속 진행)
 */
async function saveOpenApiSource(configFile, source) {
  if (!configFile) {
    console.log(chalk.yellow('  ⚠ bc.config.json 이 없어 주소를 저장하지 못했습니다.'));
    console.log(chalk.dim('    bc adopt 로 만들면 다음부터는 묻지 않습니다.\n'));
    return;
  }
  const raw = JSON.parse(await fs.readFile(configFile, 'utf8'));
  raw.api = { ...(raw.api ?? {}), openapi: source };
  await fs.writeFile(configFile, JSON.stringify(raw, null, 2) + '\n', 'utf8');
  console.log(chalk.green(`  ✓ bc.config.json 의 api.openapi 에 저장했습니다.`));
  console.log(chalk.dim('    다음부터는 묻지 않습니다. 바꾸려면 이 값을 고치세요.\n'));
}
