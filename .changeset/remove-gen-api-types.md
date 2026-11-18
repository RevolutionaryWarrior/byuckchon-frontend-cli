---
"byuckchon-frontend-cli": major
---

`bc gen api-types` 를 제거했습니다.

- API 코드는 AI 가 Swagger 를 직접 읽고 `api-codegen.md` 컨벤션대로 만듭니다. 타입은 zod 스키마에서 `z.infer` 로 추론하므로,
  openapi-typescript 로 만들던 `types.gen.ts` 는 컨벤션에서 쓰이지 않았습니다.
- `api-codegen.md` 에 Swagger 가져오는 순서를 추가했습니다. (사용자 제공 → `bc.config.json` 의 `api.openapi` → 사용자에게 요청,
  큰 스펙은 필요한 경로와 참조 스키마만 추려 보기)
- `bc.config.json` 의 `api.openapi` 는 그대로 두고, `bc adopt` 도 계속 Swagger URL 을 묻습니다.
- 의존성 제거: `openapi-typescript` (함께 설치되던 `@redocly/*` 포함)
