---
"byuckchon-frontend-cli": minor
---

Figma MCP · Swagger 작업 규칙 추가

- 생성 프로젝트(단일 · 모노레포 루트 · 모노레포 앱)의 `AGENTS.md` 에 `Figma → 코드` · `API` 규칙을 넣습니다.
  Figma MCP 로 프레임 링크를 읽을 때 토큰 클래스만 쓰고(임의 hex/px 금지), Auto layout 은 flex · gap,
  기존 컴포넌트 재사용. API 작업 전 `gen:api` 로 타입을 최신화하고 `src/api/types.gen.ts` 의 타입을 씁니다.
- 생성 `package.json` 에 `"gen:api": "bc gen api-types"` 스크립트를 추가합니다.
- `bc gen api-types` 가 `--source` 도 `api.openapi` 도 없으면 터미널에서 한 번 `Swagger(OpenAPI) 주소` 를 묻고
  `bc.config.json` 에 저장합니다. 다음 실행부터는 묻지 않습니다. (터미널이 아니면 지금처럼 에러)
