import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';

import { DEFAULT_MODEL_ID } from '../ai/models.js';

const GLOBAL_DIR = path.join(os.homedir(), '.bc');
const GLOBAL_FILE = path.join(GLOBAL_DIR, 'config.json');
const PROJECT_FILE_NAMES = ['bc.config.json'];

/**
 * 글로벌 설정 (~/.bc/config.json) 의 기본 모양.
 *
 * - 사용자별·머신별. API 키 같은 비밀값은 여기에 둔다.
 * - 외부 사용자도 깔자마자 동작하도록 model 만 기본값을 채워둔다.
 */
const DEFAULT_GLOBAL = {
  ai: {
    model: DEFAULT_MODEL_ID,
    apiKeys: {
      // anthropic: 'sk-ant-...',
      // openai: 'sk-...',
      // figma: 'figd-...'   // 통상 .env(FIGMA_TOKEN) 로 둠
    },
    /** 사내 게이트웨이를 쓰는 경우 base URL. 비우면 BYOK 모드. */
    gateway: null,
  },
  limits: {
    /** 한 세션 합계가 이 토큰을 넘으면 경고. */
    warnAtTokens: 50_000,
    /** 한 요청이 이 토큰을 넘으면 사용자에게 확인. */
    confirmAtTokens: 12_000,
  },
  ui: {
    /**
     * "ink" | "plain"
     * 한글 IME 가 ink 에서 글자가 씹히면 "plain" 으로 두면 항상 readline 모드로 진입.
     * --plain 플래그를 매번 안 쳐도 됨.
     */
    mode: 'ink',
  },
};

/**
 * 프로젝트 설정 (bc.config.json) 기본 모양.
 *
 * - 팀원 모두가 공유. git 에 커밋된다.
 * - 비밀값을 두지 말 것 (FIGMA_TOKEN 같은 건 환경변수명만 적고 값은 .env).
 */
const DEFAULT_PROJECT = {
  ai: {
    /** 프로젝트가 이 모델을 강제하고 싶을 때만 채움. 비우면 글로벌 설정 따름. */
    model: null,
  },
  design: {
    figma: null,
    figmaTokenEnv: 'FIGMA_TOKEN',
  },
  api: {
    openapi: null,
    baseUrl: null,
  },
  context: {
    include: ['src/**/*.{ts,tsx,js,jsx}', 'bc.config.json'],
    exclude: ['**/*.test.*', '**/__mocks__/**', 'node_modules/**', 'dist/**'],
    maxFiles: 20,
  },
  /**
   * FE 전반 컨벤션을 적은 .md 경로들. 매 chat 세션에 시스템 프롬프트로 주입된다.
   * 비우면 bc.md / .bc/conventions.md / AGENTS.md 등을 자동 탐지.
   */
  docs: [],
  /** bc adopt 가 채워준다. systemPrompt 가 읽어 모델에 알린다. */
  framework: null,
  detected: null,
};

async function readJson(file) {
  try {
    const raw = await fs.readFile(file, 'utf8');
    return JSON.parse(raw);
  } catch (err) {
    if (err.code === 'ENOENT') return null;
    throw err;
  }
}

async function writeJson(file, data) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, JSON.stringify(data, null, 2) + '\n', 'utf8');
}

function deepMerge(base, patch) {
  if (patch == null) return base;
  // 한쪽이 null/원시값이거나, 한쪽만 배열이면 patch 가 우선.
  // 특히 base 가 null 인데 patch 가 객체일 때 `k in base` 가 TypeError 던지는 걸 방지.
  if (base == null) return patch;
  if (typeof base !== 'object' || typeof patch !== 'object') return patch;
  if (Array.isArray(base) || Array.isArray(patch)) return patch;
  const out = { ...base };
  for (const k of Object.keys(patch)) {
    out[k] = k in base ? deepMerge(base[k], patch[k]) : patch[k];
  }
  return out;
}

export async function loadGlobalConfig() {
  const found = await readJson(GLOBAL_FILE);
  return deepMerge(DEFAULT_GLOBAL, found ?? {});
}

export async function saveGlobalConfig(next) {
  await writeJson(GLOBAL_FILE, next);
  // API 키가 들어갈 수 있으니 권한 좁힘. Windows 에서는 무시될 수 있음.
  try {
    await fs.chmod(GLOBAL_FILE, 0o600);
  } catch {
    /* noop */
  }
  return next;
}

export async function findProjectConfigPath(startDir = process.cwd()) {
  let dir = path.resolve(startDir);
  const root = path.parse(dir).root;
  while (true) {
    for (const name of PROJECT_FILE_NAMES) {
      const candidate = path.join(dir, name);
      try {
        await fs.access(candidate);
        return candidate;
      } catch {
        /* keep walking */
      }
    }
    if (dir === root) return null;
    dir = path.dirname(dir);
  }
}

export async function loadProjectConfig(startDir = process.cwd()) {
  const file = await findProjectConfigPath(startDir);
  const found = file ? await readJson(file) : null;
  return {
    file,
    config: deepMerge(DEFAULT_PROJECT, found ?? {}),
  };
}

export async function saveProjectConfig(file, next) {
  await writeJson(file, next);
  return next;
}

/**
 * 글로벌 + 프로젝트 + 환경변수를 머지한 "유효 설정" 을 돌려준다.
 * - 모델은 프로젝트 우선 → 글로벌
 * - API 키는 환경변수 우선 → 글로벌 저장값
 */
export async function loadEffectiveConfig(startDir = process.cwd()) {
  const [global, projectInfo] = await Promise.all([
    loadGlobalConfig(),
    loadProjectConfig(startDir),
  ]);
  const project = projectInfo.config;

  const model = project.ai?.model || global.ai?.model || DEFAULT_MODEL_ID;
  const apiKeys = {
    anthropic:
      process.env.ANTHROPIC_API_KEY || global.ai?.apiKeys?.anthropic || null,
    openai: process.env.OPENAI_API_KEY || global.ai?.apiKeys?.openai || null,
  };

  return {
    paths: {
      globalFile: GLOBAL_FILE,
      projectFile: projectInfo.file,
    },
    global,
    project,
    effective: {
      model,
      apiKeys,
      gateway: global.ai?.gateway ?? null,
      limits: global.limits,
      design: project.design,
      api: project.api,
      context: project.context,
      docs: project.docs ?? [],
    },
  };
}

export const CONFIG_PATHS = {
  globalDir: GLOBAL_DIR,
  globalFile: GLOBAL_FILE,
  projectFileName: PROJECT_FILE_NAMES[0],
};

export const CONFIG_DEFAULTS = {
  global: DEFAULT_GLOBAL,
  project: DEFAULT_PROJECT,
};
