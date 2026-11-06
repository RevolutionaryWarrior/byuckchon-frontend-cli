---
"byuckchon-frontend-cli": minor
---

생성 직후 format 검사 통과 · PR Check 에 Format 단계 추가

- init · add 가 의존성 설치 뒤 생성한 파일을 팀 prettier 규칙으로 한 번 정리합니다. (`bc add` 는 새 앱 폴더만)
- 단일 프로젝트 `format` · `format:check` 가 `tools/` 의 `.mjs` 를 포함하고, 매칭 파일이 없어도 실패하지 않습니다.
  (전에는 `tools/**/*.{js,cjs,json,md}` 에 맞는 파일이 없어 `format:check` 가 항상 실패)
- 모노레포 루트에 prettier 플러그인(`@trivago/prettier-plugin-sort-imports` · `prettier-plugin-tailwindcss`)을 넣고,
  `pnpm-lock.yaml` 을 `.prettierignore` 로 뺍니다. (전에는 플러그인이 없어 `pnpm format` 이 동작하지 않음)
- PR Check workflow(단일 · 모노레포)에 `format:check` 단계를 추가합니다.
