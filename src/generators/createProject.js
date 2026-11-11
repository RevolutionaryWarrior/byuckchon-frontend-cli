import fs from "fs/promises";
import path from "path";
import { exec as execCallback } from "child_process";
import { promisify } from "util";

import { createBaseFiles } from "./createBaseFiles.js";
import { createBcConfig } from "./createBcConfig.js";
import { createElectronProject } from "./createElectronProject.js";
import { createFolders } from "./createFolders.js";
import { createPackageJson } from "./createPackageJson.js";
import { createReadme } from "./createReadme.js";
import { scaffoldApiConventionDoc } from "./apiConventionDoc.js";
import { scaffoldReviewAutomation } from "./scaffoldReviewAutomation.js";
import { BYUCKCHON_PACKAGES, formatGeneratedFiles } from "./install.js";

const exec = promisify(execCallback);

export async function createProject(config) {
  const rootDir = path.resolve(config.projectName);

  const isElectron = config.framework === "electron";

  await fs.mkdir(rootDir);
  if (isElectron) {
    // main · preload · renderer 구조라 파일 배치가 달라서 따로 만든다.
    // renderer 는 내부에서 웹 React 생성기(createFolders 등)를 재사용한다.
    await createElectronProject(rootDir, config);
  } else {
    await createFolders(rootDir, config);
    await createPackageJson(rootDir, config);
    await createBaseFiles(rootDir, config);
    await createReadme(rootDir, config);
    // API 코드 컨벤션 .md 를 API 루트(src/api)에 깐다.
    await scaffoldApiConventionDoc({
      projectRoot: rootDir,
      framework: config.framework,
    });
  }
  await createBcConfig(rootDir, config);
  await scaffoldReviewAutomation({
    projectRoot: rootDir,
    projectType: "single",
  });

  // 최신 버전(latest 포함) 의존성을 실제로 설치해 lockfile까지 생성
  await exec("npm install", { cwd: rootDir });
  // Electron 은 renderer 패키지를 Vite 가 번들하므로 devDependencies 로 둔다.
  // (dependencies 에 있으면 electron-builder 가 node_modules 째로 앱에 넣는다)
  await exec(
    `npm install ${isElectron ? "-D " : ""}${BYUCKCHON_PACKAGES.join(" ")}`,
    { cwd: rootDir }
  );

  // 생성한 파일을 팀 prettier 규칙으로 한 번 정리한다.
  // 템플릿 문자열(따옴표 · import 줄바꿈 등)이 규칙과 조금만 달라도 첫 PR 의 format:check 가 실패한다.
  await formatGeneratedFiles({ cwd: rootDir, command: "npm run format" });
}
