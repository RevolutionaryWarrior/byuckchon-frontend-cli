import fs from 'fs/promises';
import path from 'path';
import { exec as execCallback } from 'child_process';
import { promisify } from 'util';

import { createBaseFiles } from './createBaseFiles.js';
import { createBcConfig } from './createBcConfig.js';
import { createFolders } from './createFolders.js';
import { createPackageJson } from './createPackageJson.js';
import { createReadme } from './createReadme.js';
import { scaffoldApiConventionDoc } from './apiConventionDoc.js';

const exec = promisify(execCallback);
const BYUCKCHON_PACKAGES = [
  '@byuckchon-frontend/hooks',
  '@byuckchon-frontend/utils',
  '@byuckchon-frontend/basic-ui',
  '@byuckchon-frontend/core',
];

export async function createProject(config) {
  const rootDir = path.resolve(config.projectName);

  await fs.mkdir(rootDir);
  await createFolders(rootDir, config);
  await createPackageJson(rootDir, config);
  await createBaseFiles(rootDir, config);
  await createReadme(rootDir, config);
  // API 코드 컨벤션 .md 를 프레임워크에 맞는 API 루트(src/api | src/lib/api)에 깐다.
  await scaffoldApiConventionDoc({ projectRoot: rootDir, framework: config.framework });
  await createBcConfig(rootDir, config);

  // 최신 버전(latest 포함) 의존성을 실제로 설치해 lockfile까지 생성
  await exec('npm install', { cwd: rootDir });
  await exec(`npm install ${BYUCKCHON_PACKAGES.join(' ')}`, { cwd: rootDir });
}
