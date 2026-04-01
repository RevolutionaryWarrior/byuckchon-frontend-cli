import fs from 'fs/promises';
import path from 'path';
import { exec as execCallback } from 'child_process';
import { promisify } from 'util';

import { createBaseFiles } from './createBaseFiles.js';
import { createFolders } from './createFolders.js';
import { createPackageJson } from './createPackageJson.js';
import { createReadme } from './createReadme.js';

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

  // 최신 버전(latest 포함) 의존성을 실제로 설치해 lockfile까지 생성
  await exec('npm install', { cwd: rootDir });
  await exec(`npm install ${BYUCKCHON_PACKAGES.join(' ')}`, { cwd: rootDir });
}
