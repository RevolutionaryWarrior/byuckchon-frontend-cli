import { embedQuery, makeEmbeddingModel } from './embed.js';
import { loadIndex } from './store.js';

/**
 * 쿼리 텍스트와 모든 청크 사이 cosine similarity 를 계산해 top-K 를 돌려준다.
 *
 * @param {string} query
 * @param {object} effective
 * @param {object} [opts]
 * @param {number} [opts.topK=5]
 * @param {number} [opts.minScore=0]   너무 관련 없는 청크 컷오프 (0~1 스케일)
 */
export async function searchIndex(query, effective, { topK = 5, minScore = 0 } = {}) {
  const idx = await loadIndex();
  if (!idx || !idx.chunks?.length) return { ok: false, reason: 'no-index' };

  const model = makeEmbeddingModel(effective);
  const qVec = await embedQuery(model, query);

  const scored = idx.chunks.map((c) => ({
    chunk: c,
    score: cosine(qVec, c.embedding),
  }));
  scored.sort((a, b) => b.score - a.score);
  const top = scored.filter((s) => s.score >= minScore).slice(0, topK);
  return { ok: true, results: top, total: idx.chunks.length };
}

function cosine(a, b) {
  if (!a || !b || a.length !== b.length) return 0;
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  if (na === 0 || nb === 0) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}
