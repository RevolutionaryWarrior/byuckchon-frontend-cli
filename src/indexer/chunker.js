import crypto from 'node:crypto';

/**
 * 파일을 라인 기반 슬라이딩 윈도우로 청크 분할.
 *
 * v1 정책 — 단순하고 결정론적:
 *   - 한 청크 ≈ 80 라인, 인접 청크끼리 20 라인 겹침.
 *   - 너무 짧은 파일(80라인 이하)은 통째로 1청크.
 *   - 청크 텍스트 앞에 "// FILE: <relpath>:start-end" 헤더를 붙여서
 *     임베딩이 파일 정체성에 가중치를 두도록 한다.
 *
 * 더 똑똑한 AST 기반 청킹은 v2 (ts-morph 도입 후) 에서.
 */
export function chunkFile({ relPath, content, chunkSize = 80, overlap = 20 }) {
  const lines = content.split('\n');
  const total = lines.length;
  if (total === 0) return [];

  const chunks = [];
  let start = 0;
  while (start < total) {
    const end = Math.min(start + chunkSize, total);
    const slice = lines.slice(start, end).join('\n');
    const text = `// FILE: ${relPath}:${start + 1}-${end}\n${slice}`;
    chunks.push({
      id: hashId(`${relPath}:${start + 1}-${end}`),
      file: relPath,
      startLine: start + 1,
      endLine: end,
      text,
      hash: crypto.createHash('sha1').update(text).digest('hex'),
    });
    if (end >= total) break;
    start = end - overlap;
    if (start < 0) start = 0;
  }
  return chunks;
}

function hashId(s) {
  return crypto.createHash('sha1').update(s).digest('hex').slice(0, 16);
}
