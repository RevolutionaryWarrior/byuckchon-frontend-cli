/**
 * Swagger(OpenAPI) 도우미. api-codegen.md 가 이 스크립트를 쓴다.
 * 의존성 없이 Node(18+) 만으로 돈다.
 *
 *   node scripts/openapi.mjs show <경로...>
 *     지금 스펙에서 그 경로(와 하위 경로)와, 참조하는 스키마(간접 참조 포함)만 출력한다.
 *   node scripts/openapi.mjs diff
 *     openapi.snapshot.json(마지막으로 코드에 반영한 스펙)과 지금 스펙을 비교해
 *     바뀐 경로와 바뀐 필드를 출력한다.
 *   node scripts/openapi.mjs save
 *     지금 스펙을 openapi.snapshot.json 에 저장한다. (키 정렬 → PR diff 에 바뀐 줄만 보인다)
 *
 * 스펙은 bc.config.json 의 api.openapi 에서 읽는다. `--spec <URL 또는 파일>` 로 바꿀 수 있다.
 */
import { existsSync } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CONFIG = path.join(ROOT, 'bc.config.json');
const SNAPSHOT = path.join(ROOT, 'openapi.snapshot.json');

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const print = (line = '') => process.stdout.write(`${line}\n`);

function fail(message) {
  process.stderr.write(`✗ ${message}\n`);
  process.exit(1);
}

async function readJson(file) {
  return JSON.parse(await readFile(file, 'utf8'));
}

// ── 스펙 읽기 ────────────────────────────────────────────

async function loadSpec(source, baseDir) {
  let text;
  if (/^https?:\/\//.test(source)) {
    const res = await fetch(source);
    if (!res.ok) fail(`스펙을 받지 못했습니다. (HTTP ${res.status}) ${source}`);
    if ((res.headers.get('content-type') ?? '').includes('text/html')) {
      fail(
        `Swagger 화면(HTML) 주소입니다: ${source}\n` +
          '  api-codegen.md 의 "Swagger 화면 주소를 받았을 때" 순서로 JSON 주소를 찾아 쓰세요.',
      );
    }
    text = await res.text();
  } else {
    const file = path.resolve(baseDir, source);
    if (!existsSync(file)) fail(`파일이 없습니다: ${file}`);
    text = await readFile(file, 'utf8');
  }

  let spec;
  try {
    spec = JSON.parse(text);
  } catch {
    fail(`JSON 이 아닙니다: ${source} (YAML 스펙은 지원하지 않습니다)`);
  }
  if (!spec.openapi && !spec.swagger) {
    fail(`OpenAPI 스펙이 아닙니다. (openapi · swagger 필드 없음) ${source}`);
  }
  return spec;
}

function parseArgs(argv) {
  const [command, ...rest] = argv;
  const at = rest.indexOf('--spec');
  if (at === -1) return { command, operands: rest, spec: null };
  if (!rest[at + 1]) fail('--spec 뒤에 URL 이나 파일 경로를 주세요.');
  return {
    command,
    operands: rest.filter((_, i) => i !== at && i !== at + 1),
    spec: rest[at + 1],
  };
}

async function currentSpec(specArg) {
  if (specArg) return loadSpec(specArg, process.cwd());
  if (!existsSync(CONFIG)) fail(`bc.config.json 이 없습니다: ${CONFIG}`);
  const source = (await readJson(CONFIG)).api?.openapi;
  if (!source) {
    fail(
      'bc.config.json 의 api.openapi 가 비어 있습니다. ' +
        '사용자에게 Swagger 주소를 물어 채우세요. (api-codegen.md)',
    );
  }
  return loadSpec(source, ROOT);
}

// ── $ref 따라가기 ────────────────────────────────────────

function refsIn(value, out = new Set()) {
  if (Array.isArray(value)) {
    value.forEach((v) => refsIn(v, out));
  } else if (isObj(value)) {
    if (typeof value.$ref === 'string' && value.$ref.startsWith('#/')) {
      out.add(value.$ref);
    }
    Object.values(value).forEach((v) => refsIn(v, out));
  }
  return out;
}

function resolve(spec, ref) {
  return ref
    .slice(2)
    .split('/')
    .reduce(
      (node, key) => node?.[key.replace(/~1/g, '/').replace(/~0/g, '~')],
      spec,
    );
}

/** value 가 참조하는 $ref 전부 (참조의 참조까지). */
function closure(spec, value) {
  const seen = new Set();
  const queue = [...refsIn(value)];
  while (queue.length) {
    const ref = queue.pop();
    if (seen.has(ref)) continue;
    seen.add(ref);
    queue.push(...refsIn(resolve(spec, ref)));
  }
  return seen;
}

/** '#/components/schemas/User' → 'schemas/User' */
const label = (ref) => ref.replace(/^#\/(components\/)?/, '');

// ── 비교 ────────────────────────────────────────────────

function sortKeys(v) {
  if (Array.isArray(v)) return v.map(sortKeys);
  if (isObj(v)) {
    return Object.fromEntries(
      Object.keys(v)
        .sort()
        .map((k) => [k, sortKeys(v[k])]),
    );
  }
  return v;
}

/** 키 순서와 상관없이 같은 값이면 같은 문자열. (스냅샷은 키를 정렬해 저장한다) */
const canon = (v) => JSON.stringify(sortKeys(v)) ?? 'undefined';
const show = (v) => (typeof v === 'object' ? JSON.stringify(v) : String(v));

/** 배열 원소를 맞춰 볼 키. parameters 는 in + name, 나머지는 값 자체. */
const itemKey = (item) =>
  isObj(item) && item.name ? `${item.in ?? ''}:${item.name}` : canon(item);

/** 두 값을 끝까지 내려가며 바뀐 필드를 모은다. (+ 추가 · - 삭제 · ~ 변경) */
function diffValues(a, b, at = '', out = []) {
  if (canon(a) === canon(b)) return out;
  if (Array.isArray(a) && Array.isArray(b)) {
    const before = new Map(a.map((x) => [itemKey(x), x]));
    const after = new Map(b.map((x) => [itemKey(x), x]));
    for (const [k, v] of after) {
      if (!before.has(k)) out.push(`+ ${at}[] ${show(v)}`);
    }
    for (const [k, v] of before) {
      if (!after.has(k)) out.push(`- ${at}[] ${show(v)}`);
    }
    for (const [k, v] of after) {
      if (before.has(k) && isObj(v)) {
        diffValues(before.get(k), v, `${at}[${v.name ?? k}]`, out);
      }
    }
    return out;
  }
  if (isObj(a) && isObj(b)) {
    for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) {
      const p = at ? `${at}.${k}` : k;
      if (!(k in a)) out.push(`+ ${p}: ${show(b[k])}`);
      else if (!(k in b)) out.push(`- ${p}`);
      else diffValues(a[k], b[k], p, out);
    }
    return out;
  }
  out.push(`~ ${at}: ${show(a)} → ${show(b)}`);
  return out;
}

// ── 명령 ────────────────────────────────────────────────

async function showCommand({ operands, spec: specArg }) {
  if (!operands.length) {
    fail('경로를 주세요. 예: node scripts/openapi.mjs show /api/user');
  }
  const spec = await currentSpec(specArg);
  const picked = Object.keys(spec.paths ?? {}).filter((p) =>
    operands.some((w) => p === w || p.startsWith(`${w.replace(/\/$/, '')}/`)),
  );
  if (!picked.length) fail(`스펙에 없는 경로입니다: ${operands.join(', ')}`);

  const paths = Object.fromEntries(picked.map((p) => [p, spec.paths[p]]));
  const components = Object.fromEntries(
    [...closure(spec, paths)].sort().map((r) => [label(r), resolve(spec, r)]),
  );
  print(
    JSON.stringify(
      { version: spec.info?.version ?? null, paths, components },
      null,
      2,
    ),
  );
}

async function diffCommand({ spec: specArg }) {
  if (!existsSync(SNAPSHOT)) {
    print(
      '스냅샷 없음 (처음). 작업이 끝나면 `node scripts/openapi.mjs save` 로 저장하세요.',
    );
    return;
  }
  const [before, after] = await Promise.all([
    readJson(SNAPSHOT),
    currentSpec(specArg),
  ]);
  print(`버전: ${before.info?.version ?? '-'} → ${after.info?.version ?? '-'}`);

  const changedRef = new Map();
  const isChanged = (ref) => {
    if (!changedRef.has(ref)) {
      changedRef.set(
        ref,
        canon(resolve(before, ref)) !== canon(resolve(after, ref)),
      );
    }
    return changedRef.get(ref);
  };

  const lines = [];
  const touched = new Set();
  const allPaths = new Set([
    ...Object.keys(before.paths ?? {}),
    ...Object.keys(after.paths ?? {}),
  ]);
  for (const p of [...allPaths].sort()) {
    const o = before.paths?.[p];
    const n = after.paths?.[p];
    if (!o) {
      lines.push(`추가  ${p}`);
      continue;
    }
    if (!n) {
      lines.push(`삭제  ${p}`);
      continue;
    }
    const own = diffValues(o, n);
    const refs = new Set([...closure(before, o), ...closure(after, n)]);
    const hit = [...refs].filter(isChanged).sort();
    if (!own.length && !hit.length) continue;

    lines.push(`변경  ${p}`);
    own.forEach((l) => lines.push(`      ${l}`));
    hit.forEach((r) => {
      lines.push(`      참조 ${label(r)} 바뀜`);
      touched.add(r);
    });
  }

  if (!lines.length) {
    print('바뀐 것 없음');
    return;
  }
  print();
  lines.forEach((l) => print(l));

  if (touched.size) {
    print();
    print('바뀐 참조');
    for (const r of [...touched].sort()) {
      print(`  ${label(r)}`);
      diffValues(resolve(before, r) ?? {}, resolve(after, r) ?? {}).forEach(
        (l) => print(`      ${l}`),
      );
    }
  }
}

async function saveCommand({ spec: specArg }) {
  const spec = await currentSpec(specArg);
  await writeFile(
    SNAPSHOT,
    `${JSON.stringify(sortKeys(spec), null, 2)}\n`,
    'utf8',
  );
  print(`저장: openapi.snapshot.json (${spec.info?.version ?? '버전 없음'})`);
}

const COMMANDS = { show: showCommand, diff: diffCommand, save: saveCommand };
const args = parseArgs(process.argv.slice(2));
const run = COMMANDS[args.command];
if (!run) {
  fail(
    '사용법: node scripts/openapi.mjs <show 경로... | diff | save> [--spec URL]',
  );
}
await run(args);
