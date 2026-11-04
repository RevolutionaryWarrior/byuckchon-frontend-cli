import fs from 'node:fs/promises';
import path from 'node:path';

/**
 * 새 프로젝트 루트에 `bc.config.json` 을 만든다.
 *
 * - bc gen api-types 가 이 파일의 api.openapi 를 읽는다.
 * - API 키 같은 비밀값은 절대 여기 두지 말 것.
 */
export async function createBcConfig(rootDir, config) {
  const bcConfig = {
    $schema: 'https://byuckchon.dev/bc.schema.json',
    // init · add 는 OpenAPI URL 을 묻지 않으므로 비워 둔다.
    // 필요하면 파일에 직접 넣거나 bc adopt 로 채운다.
    api: {
      openapi: null,
      baseUrl: null,
    },
    framework: config.framework,
    // init 단계에선 사용자가 React/Next 중 골랐고 TS/Tailwind 가 항상 들어가니
    // 감지 결과를 미리 채워둔다 (bc adopt 의 detected 와 같은 모양).
    detected: {
      language: 'ts',
      styling: {
        tailwind: true,
        cssModules: false,
        styledComponents: false,
        emotion: false,
        vanillaExtract: false,
      },
      packageManager: 'npm',
      routing: config.framework === 'next' ? 'app-router' : null,
      componentDirs: ['src/components'],
      designTokensFiles: [],
      hasStorybook: false,
      hasTests: null,
      detectedAt: new Date().toISOString(),
    },
  };

  await fs.writeFile(
    path.join(rootDir, 'bc.config.json'),
    JSON.stringify(bcConfig, null, 2) + '\n',
    'utf8',
  );
}
