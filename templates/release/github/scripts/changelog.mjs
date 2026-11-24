#!/usr/bin/env node
/**
 * 변경 기록 · 릴리즈 노트 (bc deploy 가 복사 · 의존성 없음, Node 18+)
 * -----------------------------------------------------------------------
 * .github/workflows/release*.yml 이 실행한다. bc deploy 를 다시 실행하면 이 파일도 다시 쓴다.
 *
 *   record   PR 이 머지되면 CHANGELOG.md 의 "다음 릴리즈" 에 PR 제목을 한 줄 넣는다.
 *
 *     node .github/scripts/changelog.mjs record --file apps/web/CHANGELOG.md --name web
 *     PR 정보는 환경변수로 받는다: PR_NUMBER · PR_TITLE · PR_URL · PR_LABELS(쉼표) · PR_BRANCH
 *     분류: PR 라벨 → 제목의 [feature] · feat: → 브랜치 첫 토막(feature/…) → 못 정하면 기타
 *
 *   release  "다음 릴리즈" 를 입력한 버전으로 묶고, Release 본문(notes.md)을 쓴다.
 *
 *     node .github/scripts/changelog.mjs release --file apps/web/CHANGELOG.md --name web --prefix web@v --version 1.2.0
 *     → $GITHUB_OUTPUT 에 tag=web@v1.2.0 · version=1.2.0 · title=web v1.2.0
 *     버전은 사람이 정한다. 이전 릴리즈 태그보다 커야 한다.
 *     태그는 만들지 않는다. 다음 step 의 `gh release create` 가 만든다.
 * -----------------------------------------------------------------------
 */

import { execFileSync } from 'node:child_process';
import { appendFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs';

const PENDING = '## 다음 릴리즈';
const FIRST_RELEASE = '첫 릴리즈입니다. 이후 머지되는 PR 부터 기록됩니다.';

/**
 * 섹션 순서와 그 섹션으로 보낼 타입(라벨 · 제목 · 브랜치 첫 토막).
 * 라벨이 여러 개면 위에 있는 섹션이 먼저 잡힌다. (예: hotfix + ota → 수정)
 */
const SECTIONS = [
  { heading: '### ✨ 기능', types: ['feature', 'features', 'feat'] },
  { heading: '### 🐛 수정', types: ['fix', 'hotfix', 'bugfix', 'bug'] },
  { heading: '### ♻️ 리팩터', types: ['refactor'] },
  { heading: '### 💄 스타일', types: ['style', 'design'] },
  { heading: '### ✅ 테스트', types: ['test', 'tests'] },
  { heading: '### 📝 문서', types: ['docs', 'doc', 'documentation'] },
  { heading: '### 🔧 기타', types: ['chore', 'ci', 'build', 'perf', 'release'] },
];
const OTHER = SECTIONS[SECTIONS.length - 1];

const SEMVER = /^(\d+)\.(\d+)\.(\d+)$/;

/* ============================================================
   분류
============================================================ */

function sectionOf(type) {
  const key = String(type ?? '').trim().toLowerCase();
  return SECTIONS.find((section) => section.types.includes(key)) ?? null;
}

/**
 * PR → { section, text }.
 * 제목 앞의 타입 표시([feature] · feat:)는 섹션 제목과 겹치므로 뺀다. [MKD-97] 같은 다른 대괄호는 남긴다.
 */
function classify({ labels, title, branch }) {
  const fromLabels = SECTIONS.find((section) => labels.some((label) => section.types.includes(label.toLowerCase())));

  const prefix = /^\[([^\]]+)\]\s*/.exec(title) ?? /^([a-z]+)(?:\([^)]*\))?!?:\s*/i.exec(title);
  const fromTitle = prefix ? sectionOf(prefix[1]) : null;
  const fromBranch = sectionOf(branch.split('/')[0]);

  const text = fromTitle ? title.slice(prefix[0].length).trim() : title;
  return { section: fromLabels ?? fromTitle ?? fromBranch ?? OTHER, text: text || title };
}

/* ============================================================
   CHANGELOG.md
============================================================ */

function header(name) {
  return [
    `# ${name} 변경 기록`,
    '',
    'PR 이 머지되면 "다음 릴리즈" 에 자동으로 쌓이고, Release workflow 를 실행하면 입력한 버전으로 묶입니다. (bc deploy)',
  ].join('\n');
}

function trimBlank(lines) {
  let start = 0;
  let end = lines.length;
  while (start < end && lines[start].trim() === '') start += 1;
  while (end > start && lines[end - 1].trim() === '') end -= 1;
  return lines.slice(start, end);
}

/** 각 부분의 앞뒤 빈 줄을 정리하고 빈 줄 하나로 잇는다. */
function joinParts(...parts) {
  return (
    parts
      .map((part) => trimBlank(part).join('\n'))
      .filter(Boolean)
      .join('\n\n') + '\n'
  );
}

/**
 * CHANGELOG 를 "다음 릴리즈" 앞 · 본문 · 뒤로 나눈다.
 * "다음 릴리즈" 가 없으면 첫 버전 제목(## …) 바로 앞에 빈 본문으로 둔다.
 */
function splitChangelog(content) {
  const lines = content.split('\n');
  const start = lines.findIndex((line) => line.trim() === PENDING);
  if (start !== -1) {
    let end = start + 1;
    while (end < lines.length && !lines[end].startsWith('## ')) end += 1;
    return { head: lines.slice(0, start), body: lines.slice(start + 1, end), tail: lines.slice(end) };
  }
  const first = lines.findIndex((line) => line.startsWith('## '));
  const at = first === -1 ? lines.length : first;
  return { head: lines.slice(0, at), body: [], tail: lines.slice(at) };
}

/** 본문 → 섹션 제목 앞 문단(intro)과 섹션별 줄. 사람이 고친 줄 · 만든 섹션도 그대로 둔다. */
function parseBody(lines) {
  const intro = [];
  const sections = new Map();
  let current = null;
  for (const line of lines) {
    if (line.startsWith('### ')) {
      current = line.trim();
      if (!sections.has(current)) sections.set(current, []);
    } else if (line.trim() !== '') {
      (current ? sections.get(current) : intro).push(line);
    }
  }
  return { intro, sections };
}

/** 정해진 섹션은 정해진 순서로, 사람이 만든 섹션은 그 뒤에 원래 순서로 쓴다. 빈 섹션은 뺀다. */
function renderBody({ intro, sections }) {
  const known = SECTIONS.map((section) => section.heading);
  const order = [...known.filter((h) => sections.has(h)), ...[...sections.keys()].filter((h) => !known.includes(h))];
  const out = intro.length ? [...intro, ''] : [];
  for (const heading of order) {
    const items = sections.get(heading);
    if (items.length) out.push(heading, ...items, '');
  }
  return trimBlank(out);
}

function readChangelog(file, name) {
  return existsSync(file) ? readFileSync(file, 'utf8') : header(name);
}

/* ============================================================
   버전 · 태그
============================================================ */

function git(args) {
  return execFileSync('git', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
}

/** "2.7.0" · "v2.7.0" → [2, 7, 0]. 형식이 아니면 null */
function parseVersion(text) {
  const matched = SEMVER.exec(String(text ?? '').trim().replace(/^v/, ''));
  return matched ? matched.slice(1).map(Number) : null;
}

function compareVersions(a, b) {
  for (let i = 0; i < 3; i += 1) {
    if (a[i] !== b[i]) return a[i] - b[i];
  }
  return 0;
}

/**
 * 태그 중 `<prefix>X.Y.Z` 형식에서 가장 높은 버전.
 * prefix 가 "v" 여도 `web@v1.0.0` 같은 앱 태그는 형식이 달라 섞이지 않는다.
 */
function latestTag(prefix, tags) {
  let best = null;
  for (const tag of tags) {
    if (!tag.startsWith(prefix)) continue;
    const rest = tag.slice(prefix.length);
    const version = rest.startsWith('v') ? null : parseVersion(rest);
    if (version && (!best || compareVersions(version, best.version) > 0)) best = { tag, version };
  }
  return best;
}

/** 한국 시간 기준 YYYY-MM-DD */
function today() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul' }).format(new Date());
}

/* ============================================================
   명령
============================================================ */

function record({ file, name }) {
  const number = process.env.PR_NUMBER;
  const title = (process.env.PR_TITLE ?? '').trim();
  if (!number || !title) throw new Error('PR_NUMBER · PR_TITLE 환경변수가 필요합니다.');

  const content = readChangelog(file, name);
  const ref = `#${number}`;
  // workflow 를 다시 실행해도 같은 PR 이 두 번 들어가지 않게 한다.
  if (content.includes(`[${ref}](`) || content.includes(`(${ref})`)) {
    console.log(`${ref} 는 이미 ${file} 에 있습니다.`);
    return;
  }

  const labels = (process.env.PR_LABELS ?? '')
    .split(',')
    .map((label) => label.trim())
    .filter(Boolean);
  const { section, text } = classify({ labels, title, branch: process.env.PR_BRANCH ?? '' });
  const url = process.env.PR_URL;
  const item = url ? `- ${text} ([${ref}](${url}))` : `- ${text} (${ref})`;

  const parts = splitChangelog(content);
  const body = parseBody(parts.body);
  if (!body.sections.has(section.heading)) body.sections.set(section.heading, []);
  body.sections.get(section.heading).push(item);

  writeFileSync(file, joinParts(parts.head, [PENDING, '', ...renderBody(body)], parts.tail), 'utf8');
  console.log(`${file} · ${section.heading.slice(4)} ← ${item.slice(2)}`);
}

function release({ file, name, prefix, version: input, out }) {
  const version = parseVersion(input);
  if (!version) throw new Error(`버전은 1.2.0 처럼 X.Y.Z 로 입력하세요. (받은 값: ${input ?? ''})`);

  const tags = git(['tag', '--merged', 'HEAD', '--list', `${prefix}*`]).split('\n').filter(Boolean);
  const previous = latestTag(prefix, tags);
  if (previous && compareVersions(version, previous.version) <= 0) {
    throw new Error(`${version.join('.')} 은 이전 버전 ${previous.version.join('.')} 보다 커야 합니다.`);
  }

  const versionText = version.join('.');
  const tag = `${prefix}${versionText}`;
  if (git(['tag', '--list', tag])) throw new Error(`${tag} 태그가 이미 있습니다.`);

  const parts = splitChangelog(readChangelog(file, name));
  const notes = renderBody(parseBody(parts.body));
  if (!notes.length) {
    // 첫 릴리즈는 기록이 없어도 만든다. 이미 운영 중인 프로젝트가 지금 버전을 기준점으로 삼을 수 있게.
    if (previous) throw new Error(`${previous.tag} 이후 기록된 PR 이 없습니다. (${file} 의 "다음 릴리즈" 가 비어 있음)`);
    notes.push(FIRST_RELEASE);
  }

  writeFileSync(file, joinParts(parts.head, [`## v${versionText} (${today()})`, '', ...notes], parts.tail), 'utf8');
  writeFileSync(out, notes.join('\n') + '\n', 'utf8');

  const title = `${name} v${versionText}`;
  if (process.env.GITHUB_OUTPUT) {
    appendFileSync(process.env.GITHUB_OUTPUT, `tag=${tag}\nversion=${versionText}\ntitle=${title}\n`);
  }
  console.log(`${file} · ${title} (태그 ${tag}, 이전 ${previous?.tag ?? '없음'})`);
}

/** --이름 값 형태만 받는다. 값이 없으면 빈 문자열. */
function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 1) {
    if (!argv[i].startsWith('--')) continue;
    const next = argv[i + 1];
    args[argv[i].slice(2)] = next !== undefined && !next.startsWith('--') ? argv[(i += 1)] : '';
  }
  return args;
}

function main() {
  const [command, ...rest] = process.argv.slice(2);
  const args = parseArgs(rest);
  const options = {
    file: args.file || 'CHANGELOG.md',
    name: args.name || 'Release',
    prefix: args.prefix ?? 'v',
    version: args.version,
    out: args.out || 'notes.md',
  };

  if (command === 'record') return record(options);
  if (command === 'release') return release(options);
  throw new Error('사용법: changelog.mjs record | release [--file …] [--name …] [--prefix …] [--version …]');
}

try {
  main();
} catch (error) {
  console.error(error.message);
  process.exit(1);
}
