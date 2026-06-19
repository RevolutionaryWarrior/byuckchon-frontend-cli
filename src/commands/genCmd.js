import path from 'node:path';

import chalk from 'chalk';

import { loadEffectiveConfig } from '../config/index.js';
import { generateApiTypes } from '../openapi/codegen.js';
import { loadOpenApi } from '../openapi/fetch.js';

const DEFAULT_OUT = 'src/api/types.gen.ts';

/**
 * `bc gen api-types`
 *
 * 인자 우선순위:
 *   1) --source <url|path>  명시 입력
 *   2) bc.config.json 의 api.openapi
 *
 * 출력 파일:
 *   --out <path>  (기본 src/api/types.gen.ts)
 */
export async function genApiTypesCommand(opts = {}) {
  const cfg = await loadEffectiveConfig();
  const sourceInput = opts.source || cfg.effective.api?.openapi;
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
    console.log(chalk.dim(`        import type { paths, components } from "${path.relative(process.cwd(), outFile).replace(/\.[^.]+$/, '')}";`));
    console.log(chalk.dim('    - bc index 를 다시 돌리면 RAG 컨텍스트에도 반영됨\n'));
  } catch (err) {
    console.error(chalk.red('\n  타입 생성 실패: ') + (err?.message ?? err) + '\n');
    process.exit(1);
  }
}
