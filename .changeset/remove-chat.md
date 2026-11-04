---
"byuckchon-frontend-cli": major
---

`bc chat` 과 chat 전용 기능을 제거했습니다.

- 제거한 명령: `bc chat` · `bc start` · `bc index` · `bc config`
- 인자 없이 `bc` 를 실행하면 chat 대신 도움말을 보여줍니다.
- 함께 제거: AI provider · ink TUI · 대화 기록 · 코드베이스 RAG · Figma REST 연동 · OpenAPI 캐시/검색
- 의존성 제거: `ai` · `@ai-sdk/anthropic` · `@ai-sdk/openai` · `ink` · `ink-spinner` · `ink-text-input` · `react` · `fast-glob` · `dotenv`
- `bc.config.json` 에서 chat 전용 필드(`ai` · `design` · `context` · `docs`)를 더 이상 만들지 않습니다. `api` · `framework` · `detected` 만 남습니다.
- 생성 질문에서 bc chat 용 값을 뺐습니다. `bc init` · `bc add` 는 AI 모델 · Figma · OpenAPI URL 을, `bc adopt` 는 AI 모델 · Figma URL 을 묻지 않습니다. (OpenAPI URL 은 필요하면 `bc.config.json` 의 `api.openapi` 에 직접 입력)
- 새 프로젝트에 `FIGMA_TOKEN` 만 담긴 `.env` 와 `.gitignore` 의 `.bc/` 항목을 만들지 않습니다.
- `~/.bc/config.json` (전역 설정)은 더 이상 읽지 않습니다. 필요 없으면 지워도 됩니다.
