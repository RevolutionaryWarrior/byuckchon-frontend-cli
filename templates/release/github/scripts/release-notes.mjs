#!/usr/bin/env node
/**
 * 릴리즈 노트 만들기 (bc deploy 가 복사 · 의존성 없음, Node 18+)
 * -----------------------------------------------------------------------
 * 이전 릴리즈 태그 이후 커밋으로 다음 버전과 노트를 만든다.
 * .github/workflows/release*.yml 이 실행한다. bc deploy 를 다시 실행하면 이 파일도 다시 쓴다.
 *
 *   node .github/scripts/release-notes.mjs --prefix "web@v" --name web --path apps/web --path packages
 *     → 이전 web@v* 태그 이후, apps/web · packages 를 건드린 커밋만 모아 notes.md 작성
 *     → 버전 자동 계산: feat → minor, 그 외 → patch, feat! · BREAKING CHANGE → major
 *     → $GITHUB_OUTPUT 에 tag=web@v2.7.0 · version=2.7.0 · title=web v2.7.0
 *
 *   --bump 2.7.0 | major | minor | patch   버전을 직접 정한다. (비우면 자동)
 *   --initial 1.0.0                         이전 태그가 없을 때 첫 버전 (기본 1.0.0)
 *
 * 커밋 기록이 필요하므로 checkout 에 `fetch-depth: 0` 이 있어야 한다.
 * 태그는 만들지 않는다. 다음 step 의 `gh release create` 가 만든다.
 * -----------------------------------------------------------------------
 */

import { execFileSync } from 'node:child_process';
import { appendFileSync, writeFileSync } from 'node:fs';

/** 노트에 남기는 섹션. 나머지(refactor · chore …)는 사용자에게 의미가 없어 뺀다. */
const SECTIONS = [
  ['feat', '✨ 기능'],
  ['fix', '🐛 수정'],
];

const CONVENTIONAL = /^(?<type>[a-z]+)(?:\((?<scope>[^)]*)\))?(?<breaking>!)?:\s*(?<subject>.+)$/;
const SEMVER = /^(\d+)\.(\d+)\.(\d+)$/;
const BUMPS = ['major', 'minor', 'patch'];

/* ============================================================
   커밋 · 버전
============================================================ */

/** 커밋 메시지 → { type, subject, breaking }. 컨벤션을 안 지켰으면 type 이 null */
function parseCommit(message) {
  const subjectLine = String(message).split('\n')[0].trim();
  const matched = CONVENTIONAL.exec(subjectLine);
  const breakingBody = /^BREAKING[ -]CHANGE:/m.test(message);

  if (!matched) return { type: null, subject: subjectLine, breaking: breakingBody };
  const { type, breaking, subject } = matched.groups;
  return { type, subject: subject.trim(), breaking: Boolean(breaking) || breakingBody };
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

/** BREAKING 이 있으면 major, feat 가 있으면 minor, 나머지는 patch */
function bumpOf(commits) {
  let bump = 'patch';
  for (const commit of commits) {
    const parsed = parseCommit(commit.message);
    if (parsed.breaking) return 'major';
    if (parsed.type === 'feat') bump = 'minor';
  }
  return bump;
}

function nextVersion({ previous, requested, commits, initial }) {
  const wanted = String(requested ?? '').trim();
  const exact = parseVersion(wanted);

  if (exact) {
    if (previous && compareVersions(exact, previous) <= 0) {
      throw new Error(`${exact.join('.')} 은 이전 버전 ${previous.join('.')} 보다 커야 합니다.`);
    }
    return exact.join('.');
  }
  if (wanted && !BUMPS.includes(wanted)) {
    throw new Error(`버전은 비우거나 2.7.0 · major · minor · patch 중 하나로 입력하세요. (받은 값: ${wanted})`);
  }

  if (!previous) {
    const first = parseVersion(initial);
    if (!first) throw new Error(`--initial ${initial} 이 X.Y.Z 형식이 아닙니다.`);
    return first.join('.');
  }

  const [major, minor, patch] = previous;
  const bump = wanted || bumpOf(commits);
  if (bump === 'major') return `${major + 1}.0.0`;
  if (bump === 'minor') return `${major}.${minor + 1}.0`;
  return `${major}.${minor}.${patch + 1}`;
}

/* ============================================================
   노트
============================================================ */

/** 커밋 제목에 PR 번호가 없으면 짧은 sha 를 붙인다. (squash 머지는 보통 "(#123)" 이 이미 있다) */
function itemOf(subject, sha) {
  return /\(#\d+\)\s*$/.test(subject) ? `- ${subject}` : `- ${subject} (${sha.slice(0, 7)})`;
}

/** 커밋 → notes.md. 제목은 Release 제목에 있으므로 본문에 다시 쓰지 않는다. */
function renderNotes({ previousTag, commits }) {
  const grouped = new Map(SECTIONS.map(([type]) => [type, []]));
  const breaking = [];

  for (const commit of commits) {
    const parsed = parseCommit(commit.message);
    if (parsed.breaking) breaking.push(itemOf(parsed.subject, commit.sha));
    if (grouped.has(parsed.type)) grouped.get(parsed.type).push(itemOf(parsed.subject, commit.sha));
  }

  const lines = [SECTIONS.map(([type, label]) => `${label} ${grouped.get(type).length}`).join(' · '), ''];

  if (breaking.length) lines.push('### ⚠️ Breaking Changes', ...breaking, '');
  for (const [type, label] of SECTIONS) {
    const items = grouped.get(type);
    if (items.length) lines.push(`### ${label}`, ...items, '');
  }
  if (!grouped.get('feat').length && !grouped.get('fix').length) {
    lines.push('_사용자에게 보이는 변경(feat · fix)이 없습니다._', '');
  }

  lines.push(
    previousTag
      ? `<sub>이전 ${previousTag} 이후 커밋 ${commits.length}개</sub>`
      : `<sub>첫 릴리즈 — 커밋 ${commits.length}개</sub>`,
  );
  return lines.join('\n') + '\n';
}

/* ============================================================
   git · 실행
============================================================ */

function git(args) {
  return execFileSync('git', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
}

const SEPARATOR = '\u001e';

/** 이전 태그 이후 커밋 (머지 커밋 제외, 오래된 순). paths 가 있으면 그 경로를 건드린 커밋만 */
function collectCommits(previousTag, paths) {
  const range = previousTag ? [`${previousTag}..HEAD`] : ['HEAD'];
  const pathArgs = paths.length ? ['--', ...paths] : [];
  const raw = git(['log', '--no-merges', '--reverse', `--format=%H%n%B${SEPARATOR}`, ...range, ...pathArgs]);

  return raw
    .split(SEPARATOR)
    .map((chunk) => chunk.trim())
    .filter(Boolean)
    .map((chunk) => {
      const [sha, ...rest] = chunk.split('\n');
      return { sha, message: rest.join('\n') };
    });
}

/** --path 는 여러 번 줄 수 있다. 값이 빈 문자열이어도 그 값으로 받는다. */
function parseArgs(argv) {
  const args = { path: [] };
  for (let i = 0; i < argv.length; i += 1) {
    if (!argv[i].startsWith('--')) continue;
    const name = argv[i].slice(2);
    const next = argv[i + 1];
    const value = next !== undefined && !next.startsWith('--') ? argv[(i += 1)] : '';
    if (name === 'path') {
      if (value) args.path.push(value);
    } else {
      args[name] = value;
    }
  }
  return args;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const prefix = args.prefix ?? 'v';
  const name = args.name || 'Release';
  const out = args.out || 'notes.md';

  const tags = git(['tag', '--merged', 'HEAD', '--list', `${prefix}*`]).split('\n').filter(Boolean);
  const previous = latestTag(prefix, tags);
  const commits = collectCommits(previous?.tag ?? null, args.path);

  if (previous && commits.length === 0) {
    const where = args.path.length ? ` (${args.path.join(', ')})` : '';
    throw new Error(`${previous.tag} 이후 새 커밋이 없습니다${where}. 릴리즈할 내용이 없습니다.`);
  }

  const version = nextVersion({
    previous: previous?.version ?? null,
    requested: args.bump,
    commits,
    initial: args.initial || '1.0.0',
  });
  const tag = `${prefix}${version}`;
  const title = `${name} v${version}`;

  if (git(['tag', '--list', tag])) {
    throw new Error(`${tag} 태그가 이미 있습니다. 버전을 직접 입력해 주세요.`);
  }

  writeFileSync(out, renderNotes({ previousTag: previous?.tag ?? null, commits }), 'utf8');
  if (process.env.GITHUB_OUTPUT) {
    appendFileSync(process.env.GITHUB_OUTPUT, `tag=${tag}\nversion=${version}\ntitle=${title}\n`);
  }
  console.log(`${out} 작성 — ${title} (태그 ${tag}, 이전 ${previous?.tag ?? '없음'}, 커밋 ${commits.length}개)`);
}

try {
  main();
} catch (error) {
  console.error(error.message);
  process.exit(1);
}
