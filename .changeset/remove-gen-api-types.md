---
"byuckchon-frontend-cli": major
---

`bc gen api-types`를 없앴습니다. 이제 AI가 Swagger를 직접 읽고 `api-codegen.md`대로 API 코드를 만듭니다.

- 타입은 zod 스키마에서 `z.infer`로 만듭니다. `types.gen.ts`는 더 이상 만들지 않습니다.
- Swagger는 `bc.config.json`의 `api.openapi`에서 가져옵니다.
  - 비어 있으면 AI가 물어보고 채웁니다. 다음부터는 묻지 않습니다.
  - Swagger 화면 주소(`/api/docs`)를 받으면 JSON 주소를 찾아서 넣습니다.
- 생성되는 `AGENTS.md`에 "API 코드는 `api-codegen.md`를 먼저 읽는다"를 추가했습니다.
- `openapi-typescript` 의존성을 뺐습니다. (`@redocly/*` 포함)
