import chalk from 'chalk';
import inquirer from 'inquirer';

import {
  CONFIG_PATHS,
  loadEffectiveConfig,
  loadGlobalConfig,
  saveGlobalConfig,
} from '../config/index.js';
import { MODEL_CATALOG, modelChoices, findModel } from '../ai/models.js';

function maskKey(key) {
  if (!key) return chalk.dim('(없음)');
  if (key.length <= 10) return chalk.green('********');
  return chalk.green(`${key.slice(0, 6)}…${key.slice(-4)}`);
}

export async function configShowCommand() {
  const eff = await loadEffectiveConfig();
  const meta = findModel(eff.effective.model);

  console.log(chalk.bold.cyan('\n  bc 설정 상태\n'));
  console.log(`  ${chalk.dim('글로벌 설정 파일')}  ${eff.paths.globalFile}`);
  console.log(
    `  ${chalk.dim('프로젝트 설정 파일')}  ${
      eff.paths.projectFile ?? chalk.dim('(없음 — 프로젝트 외부에서 실행 중)')
    }`,
  );
  console.log();
  console.log(chalk.bold('  AI'));
  console.log(
    `    ${chalk.dim('모델')}        ${meta ? meta.label : eff.effective.model}`,
  );
  console.log(
    `    ${chalk.dim('Provider')}    ${meta?.provider ?? chalk.red('?')}`,
  );
  console.log(
    `    ${chalk.dim('Anthropic 키')} ${maskKey(eff.effective.apiKeys.anthropic)}`,
  );
  console.log(
    `    ${chalk.dim('OpenAI 키')}    ${maskKey(eff.effective.apiKeys.openai)}`,
  );
  console.log(
    `    ${chalk.dim('Gateway')}     ${eff.effective.gateway ?? chalk.dim('(BYOK 모드)')}`,
  );
  console.log();
  console.log(chalk.bold('  Limits'));
  console.log(
    `    ${chalk.dim('세션 경고')}    ${eff.effective.limits.warnAtTokens.toLocaleString()} tokens`,
  );
  console.log(
    `    ${chalk.dim('요청 확인')}    ${eff.effective.limits.confirmAtTokens.toLocaleString()} tokens`,
  );

  if (eff.paths.projectFile) {
    console.log();
    console.log(chalk.bold('  프로젝트'));
    console.log(
      `    ${chalk.dim('Figma')}       ${eff.effective.design?.figma ?? chalk.dim('(미설정)')}`,
    );
    console.log(
      `    ${chalk.dim('OpenAPI')}     ${eff.effective.api?.openapi ?? chalk.dim('(미설정)')}`,
    );
  }
  console.log();
}

export async function configSetModelCommand(modelId) {
  const global = await loadGlobalConfig();

  let chosen = modelId;
  if (!chosen) {
    const ans = await inquirer.prompt([
      {
        type: 'list',
        name: 'model',
        message: '기본 AI 모델을 선택하세요:',
        choices: modelChoices(),
        default: global.ai.model,
      },
    ]);
    chosen = ans.model;
  }

  if (!findModel(chosen)) {
    console.error(chalk.red(`알 수 없는 모델 id: ${chosen}`));
    console.error(
      chalk.dim(
        `  사용 가능: ${MODEL_CATALOG.map((m) => m.id).join(', ')}`,
      ),
    );
    process.exit(1);
  }

  global.ai.model = chosen;
  await saveGlobalConfig(global);
  console.log(chalk.green(`\n  ✓ 기본 모델을 '${chosen}' 로 저장했습니다.`));
  console.log(chalk.dim(`    저장 위치: ${CONFIG_PATHS.globalFile}\n`));
}

export async function configSetKeyCommand(provider, key) {
  if (!provider || !['anthropic', 'openai'].includes(provider)) {
    console.error(
      chalk.red('사용법: bc config set-key <anthropic|openai> [key]'),
    );
    process.exit(1);
  }

  let value = key;
  if (!value) {
    const ans = await inquirer.prompt([
      {
        type: 'password',
        name: 'key',
        mask: '*',
        message: `${provider} API 키를 입력하세요 (입력 가려짐):`,
        validate: (v) => (v.trim().length > 10 ? true : '키가 너무 짧아요.'),
      },
    ]);
    value = ans.key.trim();
  }

  const global = await loadGlobalConfig();
  global.ai.apiKeys = { ...(global.ai.apiKeys ?? {}), [provider]: value };
  await saveGlobalConfig(global);

  console.log(
    chalk.green(`\n  ✓ ${provider} API 키를 저장했습니다.`),
  );
  console.log(chalk.dim(`    파일: ${CONFIG_PATHS.globalFile} (chmod 600)\n`));
}

export async function configSetGatewayCommand(url) {
  const global = await loadGlobalConfig();
  global.ai.gateway = url && url.trim() ? url.trim() : null;
  await saveGlobalConfig(global);
  if (global.ai.gateway) {
    console.log(chalk.green(`\n  ✓ Gateway 를 ${global.ai.gateway} 로 설정했습니다.\n`));
  } else {
    console.log(chalk.green('\n  ✓ Gateway 를 해제했습니다 (BYOK 모드).\n'));
  }
}
