/**
 * 지원하는 AI 모델 카탈로그.
 *
 * 새 모델/프로바이더를 추가할 때는 이 파일만 수정하면 된다.
 * id: 사용자가 config 에 저장하는 안정적인 키.
 * apiModel: 실제 SDK 가 호출할 때 쓰는 모델 식별자.
 *
 * 가격은 1M 토큰 기준 USD. 토큰 카운터에서 비용 추정에 쓴다.
 */
export const MODEL_CATALOG = [
  {
    id: 'claude-sonnet-5',
    label: 'Claude Sonnet 5  (권장 · 코드 품질·속도 밸런스)',
    provider: 'anthropic',
    apiModel: 'claude-sonnet-5',
    contextWindow: 200_000,
    pricing: { input: 3, output: 15, cachedInput: 0.3 },
    tier: 'balanced',
  },
  {
    id: 'claude-sonnet-4-6',
    label: 'Claude Sonnet 4.6  (안정 · 이전 세대 밸런스)',
    provider: 'anthropic',
    apiModel: 'claude-sonnet-4-6',
    contextWindow: 200_000,
    pricing: { input: 3, output: 15, cachedInput: 0.3 },
    tier: 'balanced',
  },
  {
    id: 'claude-opus-4-8',
    label: 'Claude Opus 4.8  (고성능 · 큰 리팩터·아키텍처)',
    provider: 'anthropic',
    apiModel: 'claude-opus-4-8',
    contextWindow: 200_000,
    pricing: { input: 15, output: 75, cachedInput: 1.5 },
    tier: 'powerful',
  },
  {
    id: 'claude-fable-5',
    label: 'Claude Fable 5  (저렴·빠름 · 짧은 작업·커밋 메시지)',
    provider: 'anthropic',
    apiModel: 'claude-fable-5',
    contextWindow: 200_000,
    pricing: { input: 1, output: 5, cachedInput: 0.1 },
    tier: 'fast',
  },
  {
    id: 'gpt-5',
    label: 'GPT-5  (OpenAI · 일반 코드)',
    provider: 'openai',
    apiModel: 'gpt-5',
    contextWindow: 400_000,
    pricing: { input: 5, output: 20, cachedInput: 0.5 },
    tier: 'balanced',
  },
  {
    id: 'gpt-5-mini',
    label: 'GPT-5 mini  (OpenAI · 저렴)',
    provider: 'openai',
    apiModel: 'gpt-5-mini',
    contextWindow: 400_000,
    pricing: { input: 0.5, output: 2, cachedInput: 0.05 },
    tier: 'fast',
  },
];

export const DEFAULT_MODEL_ID = 'claude-sonnet-5';

export function findModel(id) {
  return MODEL_CATALOG.find((m) => m.id === id);
}

export function modelChoices() {
  return MODEL_CATALOG.map((m) => ({ name: m.label, value: m.id }));
}
