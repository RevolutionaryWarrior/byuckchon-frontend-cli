import { createAnthropic } from '@ai-sdk/anthropic';
import { createOpenAI } from '@ai-sdk/openai';

import { findModel } from './models.js';

/**
 * 설정에서 받은 effective 정보를 가지고 AI SDK 가 바로 쓸 수 있는
 * `model` 객체를 만들어 돌려준다.
 *
 * - gateway 가 있으면 baseURL 로 주입 (사내 프록시 / OpenRouter / LiteLLM 등).
 * - 키가 없으면 명확한 에러 메시지로 실패 (chat 명령에서 user-friendly 처리).
 */
export function resolveModel(effective) {
  const meta = findModel(effective.model);
  if (!meta) {
    const err = new Error(
      `알 수 없는 모델 '${effective.model}'. \`bc config set-model\` 으로 다시 골라주세요.`,
    );
    err.code = 'BC_UNKNOWN_MODEL';
    throw err;
  }

  const apiKey = effective.apiKeys?.[meta.provider];
  if (!apiKey && !effective.gateway) {
    const envName =
      meta.provider === 'anthropic' ? 'ANTHROPIC_API_KEY' : 'OPENAI_API_KEY';
    const err = new Error(
      `${meta.provider} API 키가 없습니다.\n` +
        `  - 환경변수 ${envName} 로 넣거나\n` +
        `  - \`bc config set-key ${meta.provider} <key>\` 로 저장하세요.`,
    );
    err.code = 'BC_NO_API_KEY';
    throw err;
  }

  if (meta.provider === 'anthropic') {
    const anthropic = createAnthropic({
      apiKey: apiKey ?? 'gateway',
      baseURL: effective.gateway ?? undefined,
    });
    return { meta, model: anthropic(meta.apiModel) };
  }
  if (meta.provider === 'openai') {
    const openai = createOpenAI({
      apiKey: apiKey ?? 'gateway',
      baseURL: effective.gateway ?? undefined,
    });
    return { meta, model: openai(meta.apiModel) };
  }

  const err = new Error(`지원하지 않는 provider: ${meta.provider}`);
  err.code = 'BC_UNKNOWN_PROVIDER';
  throw err;
}
