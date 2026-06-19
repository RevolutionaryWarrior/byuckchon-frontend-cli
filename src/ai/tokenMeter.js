/**
 * 한 chat 세션 동안 토큰/비용을 누적한다.
 *
 * AI SDK 의 streamText 결과에서는 `await result.usage` 로 input/output 토큰을
 * 받을 수 있다. 이걸 모델 메타의 가격과 곱해 추정 비용을 계산한다.
 *
 * 캐시 히트는 SDK 가 별도 필드로 주는 경우가 있어서 들어오면 반영, 없으면 0.
 */
export class TokenMeter {
  constructor(modelMeta, limits = {}) {
    this.meta = modelMeta;
    this.limits = limits;
    this.totals = {
      input: 0,
      output: 0,
      cachedInput: 0,
      requests: 0,
      costUsd: 0,
    };
  }

  add(usage) {
    if (!usage) return;
    const inputTokens = usage.promptTokens ?? usage.inputTokens ?? 0;
    const outputTokens = usage.completionTokens ?? usage.outputTokens ?? 0;
    const cached =
      usage.cachedPromptTokens ?? usage.cachedInputTokens ?? 0;

    const billableInput = Math.max(0, inputTokens - cached);
    const p = this.meta.pricing ?? { input: 0, output: 0, cachedInput: 0 };

    const cost =
      (billableInput * p.input) / 1_000_000 +
      (cached * (p.cachedInput ?? p.input)) / 1_000_000 +
      (outputTokens * p.output) / 1_000_000;

    this.totals.input += inputTokens;
    this.totals.output += outputTokens;
    this.totals.cachedInput += cached;
    this.totals.requests += 1;
    this.totals.costUsd += cost;
  }

  /** 다음 요청을 실제로 보낼지 사용자에게 물어봐야 하는지 여부. */
  shouldConfirmNextRequest(estimatedInputTokens) {
    const cap = this.limits?.confirmAtTokens ?? Infinity;
    return estimatedInputTokens >= cap;
  }

  /** 누적이 경고선을 넘었는지. */
  shouldWarn() {
    const cap = this.limits?.warnAtTokens ?? Infinity;
    return this.totals.input + this.totals.output >= cap;
  }

  format() {
    const t = this.totals;
    const fmt = (n) => n.toLocaleString('en-US');
    const cost =
      t.costUsd >= 0.01 ? `$${t.costUsd.toFixed(3)}` : `$${t.costUsd.toFixed(5)}`;
    return `${this.meta.id} · ${fmt(t.input)} in / ${fmt(t.output)} out · cached ${fmt(
      t.cachedInput,
    )} · ${t.requests} req · ~${cost}`;
  }
}
