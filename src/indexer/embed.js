import { embed, embedMany } from 'ai';
import { createOpenAI } from '@ai-sdk/openai';

const DEFAULT_EMBED_MODEL = 'text-embedding-3-small';

/**
 * 임베딩은 OpenAI 만 지원 (Anthropic 은 임베딩 API 가 없다).
 *
 * effective.apiKeys.openai 또는 ENV(OPENAI_API_KEY)/gateway 를 사용.
 * 키 없으면 명확한 에러로 종료.
 */
export function makeEmbeddingModel(effective) {
  const apiKey = effective.apiKeys?.openai;
  if (!apiKey && !effective.gateway) {
    const err = new Error(
      'OpenAI API 키가 필요합니다 (임베딩 전용).\n' +
        '  - Anthropic 은 임베딩 API 를 제공하지 않습니다.\n' +
        '  - `bc config set-key openai <key>` 또는 OPENAI_API_KEY 환경변수로 등록하세요.\n' +
        '  - text-embedding-3-small 은 1M 토큰당 약 $0.02 로 매우 저렴합니다.',
    );
    err.code = 'BC_NO_OPENAI_KEY';
    throw err;
  }
  const openai = createOpenAI({
    apiKey: apiKey ?? 'gateway',
    baseURL: effective.gateway ?? undefined,
  });
  return openai.embedding(DEFAULT_EMBED_MODEL);
}

/**
 * 청크 배열을 받아 임베딩 벡터를 추가해서 돌려준다.
 * 100개 단위 배치, 각 배치 내부에선 SDK 가 다시 OpenAI 한도에 맞춰 처리.
 */
export async function embedChunks(model, chunks, { batchSize = 100, onBatch } = {}) {
  const out = [];
  for (let i = 0; i < chunks.length; i += batchSize) {
    const batch = chunks.slice(i, i + batchSize);
    const { embeddings } = await embedMany({
      model,
      values: batch.map((c) => c.text),
    });
    for (let j = 0; j < batch.length; j++) {
      out.push({ ...batch[j], embedding: embeddings[j] });
    }
    if (onBatch) onBatch({ done: out.length, total: chunks.length });
  }
  return out;
}

/** 단건 — 검색 쿼리 임베딩. */
export async function embedQuery(model, query) {
  const { embedding } = await embed({ model, value: query });
  return embedding;
}

export { DEFAULT_EMBED_MODEL };
