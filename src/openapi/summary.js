/**
 * 파싱된 OpenAPI 객체를 → 모델에 주입할 "압축 요약" 텍스트로 변환.
 *
 * 목표: 토큰 폭발 방지하면서도 모델이 "이 API 스펙이 있구나, 어떤 엔드포인트가
 * 있구나" 를 알게 하는 정도. 자세한 스키마는 RAG 가 types.gen.ts 통해서 별도로
 * 가져오게 함.
 *
 * 결과 형태 (예):
 *   API: Petstore v3.0
 *   base: /api/v3
 *   endpoints:
 *     GET    /pet/{petId}        Find pet by ID
 *     POST   /pet                 Add a new pet to the store
 *     ...
 */
const METHODS = ['get', 'post', 'put', 'patch', 'delete', 'head', 'options'];
const MAX_PATHS = 400;
const MAX_BYTES = 16 * 1024;

export function summarizeOpenApi(doc) {
  if (!doc || typeof doc !== 'object') return null;

  const lines = [];
  const title = doc.info?.title ?? '(untitled)';
  const version = doc.info?.version ?? '';
  lines.push(`API: ${title}${version ? ' v' + version : ''}`);

  const servers = (doc.servers ?? []).map((s) => s.url).filter(Boolean);
  if (servers.length) {
    lines.push(`base: ${servers.slice(0, 3).join(', ')}`);
  }

  // path 하나당 한 줄로 메서드를 합친다 (줄 수 절반 + 모델이 path 단위로 보기 쉬움).
  const byPath = [];
  for (const [pathStr, methods] of Object.entries(doc.paths ?? {})) {
    if (!methods || typeof methods !== 'object') continue;
    const verbs = METHODS.filter((m) => methods[m] && typeof methods[m] === 'object').map((m) =>
      m.toUpperCase(),
    );
    if (verbs.length === 0) continue;
    byPath.push({ path: pathStr, verbs });
  }
  byPath.sort((a, b) => a.path.localeCompare(b.path));

  const total = byPath.length;
  const shown = byPath.slice(0, MAX_PATHS);

  lines.push(`paths: (${shown.length}/${total})`);
  for (const e of shown) {
    lines.push(`  ${e.verbs.join(',').padEnd(20)} ${e.path}`);
  }
  if (shown.length < total) {
    lines.push(`  ... and ${total - shown.length} more (search_openapi 로 검색하세요)`);
  }

  let result = lines.join('\n');
  // 바이트 초과 시 뒤에서부터 잘라낸다 (search_openapi 가 있으니 전부 못 담아도 안전).
  if (Buffer.byteLength(result, 'utf8') > MAX_BYTES) {
    const header = [lines[0], servers.length ? lines[1] : null].filter(Boolean);
    const out = [...header, `paths: (truncated/${total}) — 전체는 search_openapi 로 검색`];
    let bytes = Buffer.byteLength(out.join('\n'), 'utf8');
    for (const e of shown) {
      const line = `  ${e.verbs.join(',').padEnd(20)} ${e.path}`;
      bytes += Buffer.byteLength(line + '\n', 'utf8');
      if (bytes > MAX_BYTES) break;
      out.push(line);
    }
    result = out.join('\n');
  }
  return result;
}
