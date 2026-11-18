---
"byuckchon-frontend-cli": minor
---

Next 의 API 루트를 `src/lib/api` 로 되돌림

- Next 프로젝트(단일 · 모노레포 앱)는 `src/api` 대신 `src/lib/api` 를 만들고 `api-codegen.md` 도 그 안에 둡니다. React 는 그대로 `src/api` 입니다.
- `api-codegen.md` · `AGENTS.md` 의 Next 경로를 `src/lib/api` · `@/lib/api/...` 로 바꿨습니다.
- `bc gen api-types` 의 기본 출력도 `bc.config.json` 의 `framework` 를 따라 Next 면 `src/lib/api/types.gen.ts` 로 만듭니다.
- `bc adopt` 로 Next 프로젝트에 깔리는 `api-codegen.md` 도 `src/lib/api` 에 둡니다.
