import fs from 'node:fs/promises';
import path from 'node:path';

/**
 * 새 프로젝트 루트에 `bc.config.json` 을 만든다.
 *
 * - bc chat / bc gen 등이 이 파일을 읽어 프로젝트 컨텍스트(Figma, API, 컨벤션)를
 *   AI 에게 자동 주입한다.
 * - API 키 같은 비밀값은 절대 여기 두지 말 것 (글로벌 설정 또는 .env 사용).
 */
export async function createBcConfig(rootDir, config) {
  const bcConfig = {
    $schema: 'https://byuckchon.dev/bc.schema.json',
    ai: {
      // null 이면 글로벌 기본 모델(=~/.bc/config.json) 을 따름.
      model: config.aiModel ?? null,
    },
    design: {
      figma: config.figmaUrl?.trim() || null,
      figmaTokenEnv: 'FIGMA_TOKEN',
    },
    api: {
      openapi: config.openapiUrl?.trim() || null,
      baseUrl: null,
    },
    context: {
      include: ['src/**/*.{ts,tsx,js,jsx}', 'bc.config.json'],
      exclude: ['**/*.test.*', '**/__mocks__/**', 'node_modules/**', 'dist/**'],
      maxFiles: 20,
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
