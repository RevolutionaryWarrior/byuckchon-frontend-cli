import chalk from "chalk";

import { createProject } from "../generators/createProject.js";
import { askInitQuestions } from "../prompts/initPrompts.js";

export async function initCommand() {
  console.log(
    chalk.bold.cyan("\n  byuckchon-frontend-cli — 프로젝트 생성기\n")
  );

  try {
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
