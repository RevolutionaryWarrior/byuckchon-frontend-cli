import fs from 'node:fs/promises';
import path from 'node:path';

/**
 * 프로젝트의 "컨벤션 문서(.md)" 를 찾아 읽어서 시스템 프롬프트에 주입할 텍스트로 만든다.
 *
 * 우선순위:
 *   1) bc.config.json 의 `docs: [...]` 에 명시된 항목 (순서대로)
 *      - 항목은 문자열(경로) 이거나, 조건부 객체일 수 있다:
 *        "docs/common.md"
 *        { "path": "docs/api-codegen.md", "when": { "frameworkNot": "next" } }
 *        { "path": "docs/api-next.md",    "when": { "framework": "next" } }
 *      - when 의 framework / frameworkNot 는 문자열 또는 문자열 배열.
 *   2) 명시가 없으면 프로젝트 루트의 관례적 파일명 자동 탐지
 *      - bc.md, .bc/conventions.md, AGENTS.md, FRONTEND.md, docs/frontend.md
 *
 * 토큰 폭발 방지: 문서당 최대 bytes, 전체 합계 최대 bytes 로 컷.
 */
const AUTO_NAMES = [
  'bc.md',
  '.bc/conventions.md',
  'AGENTS.md',
  'FRONTEND.md',
  'docs/frontend.md',
  'docs/FRONTEND.md',
];

const PER_DOC_MAX = 24 * 1024;
const TOTAL_MAX = 48 * 1024;

async function readIfExists(abs) {
  try {
    const stat = await fs.stat(abs);
    if (!stat.isFile()) return null;
    let text = await fs.readFile(abs, 'utf8');
    if (Buffer.byteLength(text, 'utf8') > PER_DOC_MAX) {
      text = text.slice(0, PER_DOC_MAX) + '\n... (이하 생략 — 문서가 너무 깁니다)';
    }
    return text;
  } catch {
    return null;
  }
}

function asArray(v) {
  if (v == null) return [];
  return Array.isArray(v) ? v : [v];
}

/** docs 항목의 when 조건이 현재 framework 에 맞는지. */
function matchesFramework(when, framework) {
  if (!when || typeof when !== 'object') return true;
  const fw = framework || 'unknown';

  const only = asArray(when.framework);
  if (only.length && !only.includes(fw)) return false;

  const not = asArray(when.frameworkNot);
  if (not.length && not.includes(fw)) return false;

  return true;
}

/** docs 항목(문자열 | 객체)을 { path, when } 로 정규화. */
function normalizeEntry(entry) {
  if (typeof entry === 'string') return { path: entry, when: null };
  if (entry && typeof entry === 'object' && typeof entry.path === 'string') {
    return { path: entry.path, when: entry.when ?? null };
  }
  return null;
}

/**
 * @param {object} args
 * @param {string} args.projectRoot  bc.config.json 이 있는 디렉터리
 * @param {Array<string|object>} [args.docs]  config 의 docs (문자열 또는 조건부 객체)
 * @param {string} [args.framework]  detect.js 의 framework (조건부 docs 판별용)
 * @returns {Promise<{ text: string|null, files: string[] }>}
 */
export async function loadConventionDocs({ projectRoot, docs, framework }) {
  if (!projectRoot) return { text: null, files: [] };

  const explicit = Array.isArray(docs) && docs.length > 0;
  const rawEntries = explicit ? docs : AUTO_NAMES;

  const entries = rawEntries
    .map(normalizeEntry)
    .filter(Boolean)
    .filter((e) => matchesFramework(e.when, framework));

  const collected = [];
  const files = [];
  let total = 0;

  for (const { path: rel } of entries) {
    const abs = path.resolve(projectRoot, rel);
    // 루트 밖 경로는 무시 (안전)
    const within = !path.relative(projectRoot, abs).startsWith('..');
    if (!within) continue;

    const content = await readIfExists(abs);
    if (!content) continue;

    const bytes = Buffer.byteLength(content, 'utf8');
    if (total + bytes > TOTAL_MAX) break;
    total += bytes;

    files.push(rel);
    collected.push(`### 문서: ${rel}\n${content}`);
  }

  if (collected.length === 0) return { text: null, files: [] };
  return { text: collected.join('\n\n'), files };
}
