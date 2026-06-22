/**
 * OpenAPI 스펙을 "쿼리" 하는 헬퍼.
 *
 * 큰 스펙(수백 개 엔드포인트, 수백 KB) 은 시스템 프롬프트 요약에 다 담을 수도 없고,
 * 캐시 파일을 통째로 모델에 읽힐 수도 없다(토큰 폭발). 그래서 모델이 필요한 부분만
 * 골라 가져갈 수 있게 검색/상세조회 함수를 제공한다.
 *
 * - searchEndpoints: path/summary/tag/operationId 부분일치로 후보 나열
 * - getEndpoint:    특정 path(+method) 의 상세를 $ref 해석해서 반환
 */
const METHODS = ['get', 'post', 'put', 'patch', 'delete', 'head', 'options'];

/** "#/components/schemas/Foo" → doc.components.schemas.Foo */
function resolveRef(doc, ref, seen = new Set()) {
  if (typeof ref !== 'string' || !ref.startsWith('#/')) return null;
  const parts = ref.slice(2).split('/');
  let cur = doc;
  for (const p of parts) {
    if (cur == null) return null;
    cur = cur[p];
  }
  return cur ?? null;
}

/**
 * 객체 안의 $ref 를 재귀적으로 해석해 인라인한다.
 * 깊이/순환 방지: maxDepth, seen(ref 경로) 로 컷.
 */
function deref(doc, node, { maxDepth = 6, depth = 0, seen = new Set() } = {}) {
  if (node == null || typeof node !== 'object') return node;
  if (depth > maxDepth) return node;

  if (node.$ref) {
    if (seen.has(node.$ref)) return { $ref: node.$ref, note: '(순환 참조 생략)' };
    const target = resolveRef(doc, node.$ref);
    if (!target) return node;
    const nextSeen = new Set(seen);
    nextSeen.add(node.$ref);
    return deref(doc, target, { maxDepth, depth: depth + 1, seen: nextSeen });
  }

  if (Array.isArray(node)) {
    return node.map((n) => deref(doc, n, { maxDepth, depth: depth + 1, seen }));
  }

  const out = {};
  for (const [k, v] of Object.entries(node)) {
    out[k] = deref(doc, v, { maxDepth, depth: depth + 1, seen });
  }
  return out;
}

/** 모든 엔드포인트의 가벼운 인덱스 (path, method, summary, tags, operationId). */
export function listEndpoints(doc) {
  const out = [];
  for (const [pathStr, methods] of Object.entries(doc?.paths ?? {})) {
    if (!methods || typeof methods !== 'object') continue;
    for (const m of METHODS) {
      const op = methods[m];
      if (!op || typeof op !== 'object') continue;
      out.push({
        method: m.toUpperCase(),
        path: pathStr,
        summary: op.summary ?? '',
        operationId: op.operationId ?? '',
        tags: op.tags ?? [],
      });
    }
  }
  return out;
}

/**
 * 부분일치 검색. query 의 각 토큰이 path/summary/operationId/tag 어딘가에
 * (대소문자 무시) 들어가면 매치. 점수 = 매치한 필드 수 + path 정확 포함 가산점.
 */
export function searchEndpoints(doc, query, { limit = 40 } = {}) {
  const all = listEndpoints(doc);
  if (!query || !query.trim()) return all.slice(0, limit);

  const tokens = query.toLowerCase().split(/[\s/]+/).filter(Boolean);
  const scored = [];
  for (const e of all) {
    const hay = [
      e.path.toLowerCase(),
      e.summary.toLowerCase(),
      e.operationId.toLowerCase(),
      e.tags.join(' ').toLowerCase(),
    ];
    let score = 0;
    for (const tok of tokens) {
      if (hay[0].includes(tok)) score += 3; // path 매치 가중
      else if (hay.some((h) => h.includes(tok))) score += 1;
    }
    if (e.path.toLowerCase().includes(query.toLowerCase())) score += 2;
    if (score > 0) scored.push({ ...e, score });
  }
  scored.sort((a, b) => b.score - a.score || a.path.localeCompare(b.path));
  return scored.slice(0, limit);
}

/**
 * 특정 path(+method) 의 상세. $ref 를 인라인해서 request/response 스키마까지 본다.
 * method 생략 시 그 path 의 모든 메서드 반환.
 */
export function getEndpoint(doc, targetPath, method) {
  const methods = doc?.paths?.[targetPath];
  if (!methods) {
    // 끝 슬래시/대소문자 보정 한 번 시도
    const found = Object.keys(doc?.paths ?? {}).find(
      (p) => p.toLowerCase() === String(targetPath).toLowerCase(),
    );
    if (!found) return { ok: false, error: `해당 path 없음: ${targetPath}` };
    targetPath = found;
  }
  const pathItem = doc.paths[targetPath];
  const wanted = method ? [method.toLowerCase()] : METHODS;
  const operations = {};
  for (const m of wanted) {
    const op = pathItem[m];
    if (!op) continue;
    operations[m.toUpperCase()] = {
      summary: op.summary,
      operationId: op.operationId,
      tags: op.tags,
      parameters: deref(doc, op.parameters),
      requestBody: deref(doc, op.requestBody),
      responses: deref(doc, op.responses),
    };
  }
  if (Object.keys(operations).length === 0) {
    return { ok: false, error: `${targetPath} 에 ${method ?? ''} 메서드 없음` };
  }
  return { ok: true, path: targetPath, operations };
}
