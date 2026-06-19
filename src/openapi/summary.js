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
const MAX_ENDPOINTS = 200;
const MAX_BYTES = 8 * 1024;

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

  const endpoints = [];
  for (const [pathStr, methods] of Object.entries(doc.paths ?? {})) {
    if (!methods || typeof methods !== 'object') continue;
    for (const m of METHODS) {
      const op = methods[m];
      if (!op || typeof op !== 'object') continue;
      const desc = op.summary || op.operationId || op.description || '';
      endpoints.push({
        method: m.toUpperCase(),
        path: pathStr,
        desc: desc.split('\n')[0].slice(0, 90),
      });
    }
  }

  // 너무 많으면 자른다 — 모델이 알아야 하는 건 "어떤 종류의 엔드포인트가 있다" 정도면 충분.
  const total = endpoints.length;
  const shown = endpoints.slice(0, MAX_ENDPOINTS);

  lines.push(`endpoints: (${shown.length}/${total})`);
  for (const e of shown) {
    lines.push(`  ${e.method.padEnd(6)} ${e.path}${e.desc ? '  -- ' + e.desc : ''}`);
  }
  if (shown.length < total) {
    lines.push(`  ... and ${total - shown.length} more`);
  }

  let result = lines.join('\n');
  if (Buffer.byteLength(result, 'utf8') > MAX_BYTES) {
    // 안전 장치 — desc 다 자르고 다시.
    const compact = [
      lines[0],
      servers.length ? lines[1] : null,
      `endpoints: (${shown.length}/${total})`,
      ...shown.map((e) => `  ${e.method.padEnd(6)} ${e.path}`),
      shown.length < total ? `  ... and ${total - shown.length} more` : null,
    ]
      .filter(Boolean)
      .join('\n');
    result = compact;
  }
  return result;
}
