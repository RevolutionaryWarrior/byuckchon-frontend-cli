import fs from 'node:fs/promises';
import path from 'node:path';

/**
 * 프로젝트 디렉터리를 분석해서 "AI 가 알아야 할 사실들" 을 뽑아낸다.
 *
 * 입력: projectDir (절대 경로)
 * 출력:
 *   {
 *     framework: 'next' | 'expo' | 'electron' | 'vite-react' | 'cra' | 'react' | 'remix' | 'unknown',
 *     language:  'ts' | 'js',
 *     styling:   { tailwind, cssModules, styledComponents, emotion, vanillaExtract },
 *     packageManager: 'npm' | 'yarn' | 'pnpm' | 'bun' | 'unknown',
 *     routing:   'app-router' | 'pages-router' | 'expo-router' | 'react-router' | null,
 *     componentDirs: string[],            // 후보 컴포넌트 폴더 (있는 것만)
 *     designTokensFiles: string[],        // tailwind.config / theme 토큰 파일들
 *     hasStorybook: boolean,
 *     hasTests: 'jest' | 'vitest' | 'playwright' | null,
 *     pkg: { name, version, dependencies, devDependencies },
 *   }
 *
 * 모든 값은 best-effort. 못 찾으면 보수적으로 unknown / null / [] 로 채운다.
 */
export async function detectProjectContext(projectDir = process.cwd()) {
  const root = path.resolve(projectDir);

  const pkg = await readJsonSafe(path.join(root, 'package.json'));
  if (!pkg) {
    return {
      framework: 'unknown',
      language: 'js',
      styling: emptyStyling(),
      packageManager: await detectPackageManager(root),
      routing: null,
      componentDirs: [],
      designTokensFiles: [],
      hasStorybook: false,
      hasTests: null,
      pkg: null,
      isProject: false,
    };
  }

  const deps = { ...(pkg.dependencies ?? {}), ...(pkg.devDependencies ?? {}) };
  const has = (name) => Object.prototype.hasOwnProperty.call(deps, name);

  // ── 프레임워크 ─────────────────────────────────────────────
  let framework = 'unknown';
  if (has('expo') || has('expo-router')) framework = 'expo';
  else if (has('electron')) framework = 'electron';
  else if (has('next')) framework = 'next';
  else if (has('@remix-run/react') || has('@remix-run/dev')) framework = 'remix';
  else if (has('vite') && has('react')) framework = 'vite-react';
  else if (has('react-scripts')) framework = 'cra';
  else if (has('react')) framework = 'react';

  // ── 언어 ────────────────────────────────────────────────
  const hasTsConfig = await exists(path.join(root, 'tsconfig.json'));
  const language = hasTsConfig || has('typescript') ? 'ts' : 'js';

  // ── 스타일 ─────────────────────────────────────────────
  const styling = {
    tailwind:
      has('tailwindcss') ||
      (await anyExists(root, [
        'tailwind.config.js',
        'tailwind.config.ts',
        'tailwind.config.cjs',
        'tailwind.config.mjs',
      ])),
    cssModules: false, // 모듈 css 는 파일 패턴으로 추정 (아래에서 처리)
    styledComponents: has('styled-components'),
    emotion: has('@emotion/react') || has('@emotion/styled'),
    vanillaExtract: has('@vanilla-extract/css'),
  };

  // ── 라우팅 ─────────────────────────────────────────────
  let routing = null;
  if (framework === 'next') {
    if (await exists(path.join(root, 'app'))) routing = 'app-router';
    else if (await exists(path.join(root, 'src/app'))) routing = 'app-router';
    else if (await exists(path.join(root, 'pages'))) routing = 'pages-router';
    else if (await exists(path.join(root, 'src/pages'))) routing = 'pages-router';
  } else if (framework === 'expo') {
    routing = (await exists(path.join(root, 'app'))) ? 'expo-router' : null;
  } else if (has('react-router-dom') || has('react-router')) {
    routing = 'react-router';
  }

  // ── 컴포넌트 디렉터리 후보 ─────────────────────────────
  const componentCandidates = [
    'src/components',
    'src/ui',
    'app/components',
    'app/_components',
    'components',
    'ui',
  ];
  const componentDirs = [];
  for (const c of componentCandidates) {
    if (await exists(path.join(root, c))) componentDirs.push(c);
  }
  // .module.css 파일이 한 개라도 있으면 cssModules = true 로 추정.
  if (componentDirs.length) {
    styling.cssModules = await hasFileWithExt(
      path.join(root, componentDirs[0]),
      '.module.css',
    );
  }

  // ── 디자인 토큰 후보 파일 ─────────────────────────────
  const tokenCandidates = [
    'tailwind.config.js',
    'tailwind.config.ts',
    'tailwind.config.cjs',
    'tailwind.config.mjs',
    'src/styles/tokens.ts',
    'src/styles/tokens.css',
    'src/styles/theme.ts',
    'src/theme.ts',
    'theme.config.ts',
    'token.config.js',
  ];
  const designTokensFiles = [];
  for (const f of tokenCandidates) {
    if (await exists(path.join(root, f))) designTokensFiles.push(f);
  }

  // ── 테스트/스토리북 ─────────────────────────────────
  const hasStorybook = has('@storybook/react') || has('@storybook/nextjs') || has('storybook');
  let hasTests = null;
  if (has('vitest')) hasTests = 'vitest';
  else if (has('jest') || has('@testing-library/react')) hasTests = 'jest';
  if (has('@playwright/test')) hasTests = hasTests ? hasTests : 'playwright';

  return {
    framework,
    language,
    styling,
    packageManager: await detectPackageManager(root),
    routing,
    componentDirs,
    designTokensFiles,
    hasStorybook,
    hasTests,
    pkg: {
      name: pkg.name,
      version: pkg.version,
      dependencies: pkg.dependencies ?? {},
      devDependencies: pkg.devDependencies ?? {},
    },
    isProject: true,
  };
}

function emptyStyling() {
  return {
    tailwind: false,
    cssModules: false,
    styledComponents: false,
    emotion: false,
    vanillaExtract: false,
  };
}

async function exists(p) {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

async function anyExists(root, files) {
  for (const f of files) {
    if (await exists(path.join(root, f))) return true;
  }
  return false;
}

async function readJsonSafe(file) {
  try {
    const raw = await fs.readFile(file, 'utf8');
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

async function detectPackageManager(root) {
  if (await exists(path.join(root, 'pnpm-lock.yaml'))) return 'pnpm';
  if (await exists(path.join(root, 'yarn.lock'))) return 'yarn';
  if (await exists(path.join(root, 'bun.lockb'))) return 'bun';
  if (await exists(path.join(root, 'package-lock.json'))) return 'npm';
  return 'unknown';
}

async function hasFileWithExt(dir, ext) {
  try {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    for (const e of entries) {
      if (e.isFile() && e.name.endsWith(ext)) return true;
      if (e.isDirectory()) {
        if (await hasFileWithExt(path.join(dir, e.name), ext)) return true;
      }
    }
  } catch {
    /* noop */
  }
  return false;
}

/** 사람이 읽기 좋은 라벨로 압축. */
export function summarizeContext(ctx) {
  if (!ctx?.isProject) return '(package.json 없음 — 프로젝트 외부)';
  const styling = Object.entries(ctx.styling)
    .filter(([, v]) => v)
    .map(([k]) => k);
  const parts = [
    ctx.framework,
    ctx.language === 'ts' ? 'TypeScript' : 'JavaScript',
    styling.length ? styling.join('+') : 'no styling detected',
    ctx.packageManager,
  ];
  if (ctx.routing) parts.push(ctx.routing);
  return parts.join(' · ');
}
