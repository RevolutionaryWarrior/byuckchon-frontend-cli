import chalk from "chalk";

import { createProject } from "../generators/createProject.js";
import { createMonorepo } from "../generators/createMonorepo.js";
import { installMonorepoDeps } from "../generators/install.js";
import {
  askInitQuestions,
  askProjectType,
  askMonorepoQuestions,
} from "../prompts/initPrompts.js";

export async function initCommand() {
  console.log(
    chalk.bold.cyan("\n  byuckchon-frontend-cli — 프로젝트 생성기\n")
  );

  try {
    const projectType = await askProjectType();

    if (projectType === "monorepo") {
      await runMonorepoInit();
      return;
    }

    await runSingleInit();
  } catch (error) {
    if (error.code === "EEXIST") {
      console.error(
        chalk.red(`\n  오류: '${error.path}' 폴더가 이미 존재합니다.\n`)
      );
    } else {
      console.error(
        chalk.red("\n  프로젝트 생성 중 오류가 발생했습니다:"),
        error.message
      );
    }
    process.exit(1);
  }
}

async function runSingleInit() {
  const answers = await askInitQuestions();

  console.log(
    chalk.dim(
      `\n  ${answers.framework} 프로젝트를 생성하는 중... (${answers.projectName})\n`
    )
  );

  await createProject({ ...answers, typescript: true });

  console.log(
    chalk.bold.green(
      `\n  ✓ ${answers.projectName} 프로젝트가 생성되었습니다!\n`
    )
  );
  console.log(chalk.yellow("  다음 명령어로 시작하세요:\n"));
  console.log(chalk.white(`    cd ${answers.projectName}`));
  console.log(chalk.white("    npm run dev\n"));

  printAiHints(answers.aiModel);
}

async function runMonorepoInit() {
  const answers = await askMonorepoQuestions();

  console.log(
    chalk.dim(
      `\n  모노레포 '${answers.projectName}' 생성 중... (scope: @${answers.scope}, 첫 앱: ${answers.framework} / apps/${answers.appName})\n`
    )
  );

  const { root, scope, appName } = await createMonorepo({
    ...answers,
    typescript: true,
  });

  await installMonorepoDeps({ root, appPkgName: `@${scope}/${appName}` });

  console.log(
    chalk.bold.green(`\n  ✓ 모노레포 '${answers.projectName}' 가 생성되었습니다!\n`)
  );
  console.log(chalk.yellow("  다음 명령어로 시작하세요:\n"));
  console.log(chalk.white(`    cd ${answers.projectName}`));
  console.log(chalk.white("    pnpm install"));
  console.log(chalk.white(`    pnpm ${appName}          # ${appName} 앱 실행\n`));
  console.log(chalk.dim("  앱을 더 추가하려면 루트에서:  bc add\n"));

  printAiHints(answers.aiModel);
}

function printAiHints(aiModel) {
  console.log(chalk.dim("  AI 어시스턴트:"));
  if (aiModel) {
    console.log(
      chalk.dim(
        `    이 프로젝트의 기본 모델 = ${aiModel} (bc.config.json 에 저장됨)`
      )
    );
  } else {
    console.log(
      chalk.dim("    모델 미설정 — `bc config set-model` 로 나중에 지정")
    );
  }
  console.log(
    chalk.dim(
      "    API 키:  bc config set-key anthropic   (또는 ANTHROPIC_API_KEY 환경변수)"
    )
  );
  console.log(chalk.dim("    실행:    bc chat\n"));
}
