# byuckchon-frontend-cli

## 3.1.0

### Minor Changes

- d0f2368: 생성 직후 format 검사 통과 · PR Check 에 Format 단계 추가

  - init · add 가 의존성 설치 뒤 생성한 파일을 팀 prettier 규칙으로 한 번 정리합니다. (`bc add` 는 새 앱 폴더만)
  - 단일 프로젝트 `format` · `format:check` 가 `tools/` 의 `.mjs` 를 포함하고, 매칭 파일이 없어도 실패하지 않습니다.
    (전에는 `tools/**/*.{js,cjs,json,md}` 에 맞는 파일이 없어 `format:check` 가 항상 실패)
  - 모노레포 루트에 prettier 플러그인(`@trivago/prettier-plugin-sort-imports` · `prettier-plugin-tailwindcss`)을 넣고,
    `pnpm-lock.yaml` 을 `.prettierignore` 로 뺍니다. (전에는 플러그인이 없어 `pnpm format` 이 동작하지 않음)
  - PR Check workflow(단일 · 모노레포)에 `format:check` 단계를 추가합니다.

## 3.0.0

### Major Changes

- 858f6bc: `bc chat` 과 chat 전용 기능을 제거했습니다.

  - 제거한 명령: `bc chat` · `bc start` · `bc index` · `bc config`
  - 인자 없이 `bc` 를 실행하면 chat 대신 도움말을 보여줍니다.
  - 함께 제거: AI provider · ink TUI · 대화 기록 · 코드베이스 RAG · Figma REST 연동 · OpenAPI 캐시/검색
  - 의존성 제거: `ai` · `@ai-sdk/anthropic` · `@ai-sdk/openai` · `ink` · `ink-spinner` · `ink-text-input` · `react` · `fast-glob` · `dotenv`
  - `bc.config.json` 에서 chat 전용 필드(`ai` · `design` · `context` · `docs`)를 더 이상 만들지 않습니다. `api` · `framework` · `detected` 만 남습니다.
  - 생성 질문에서 bc chat 용 값을 뺐습니다. `bc init` · `bc add` 는 AI 모델 · Figma · OpenAPI URL 을, `bc adopt` 는 AI 모델 · Figma URL 을 묻지 않습니다. (OpenAPI URL 은 필요하면 `bc.config.json` 의 `api.openapi` 에 직접 입력)
  - 새 프로젝트에 `FIGMA_TOKEN` 만 담긴 `.env` 와 `.gitignore` 의 `.bc/` 항목을 만들지 않습니다.
  - `~/.bc/config.json` (전역 설정)은 더 이상 읽지 않습니다. 필요 없으면 지워도 됩니다.

### Minor Changes

- d3a97b6: bc init · add · adopt QA 수정

  - init · add 가 시작할 때 npm 의 최신 `@byuckchon-frontend/settings` 버전 매트릭스를 받아서 씁니다.
    CLI 를 예전에 설치했어도 옛 매트릭스로 생성되지 않습니다.
  - init · add · adopt 전에 CLI 버전을 검사합니다. npm 에 배포된 최신 버전과 정확히 같을 때만 진행하고,
    낮거나 높으면(major · minor · patch 무관) 멈춥니다. (npm 확인 실패 시 진행 · CLI 개발용 `BC_SKIP_CLI_CHECK=1`)
    (네트워크 실패 시 CLI 에 포함된 settings 로 진행 · 개발용 `BC_SETTINGS_DIR`)
  - 모노레포 Next 앱(`bc add`)에도 `@tanstack/react-query` 를 넣습니다.
  - 새 프로젝트에 `src/lib/query/cacheConfig.ts` 를 만들고 `@/lib` 에서 export 합니다. (React · Next 공통)
  - adopt
    - `.nvmrc` 가 없으면 만듭니다. (.node-version → engines.node → settings 기본값)
    - 패키지 매니저를 상위 폴더 lockfile · `packageManager` 필드까지 보고 감지합니다. `bun.lock` 도 감지합니다.
    - 패키지 매니저를 모르면 npm 으로 강행하지 않고 설치할 목록만 안내합니다.
    - 복사하는 workflow 의 설치·실행 명령을 npm · pnpm · yarn(berry 포함) · bun 에 맞춥니다.
    - pnpm 인데 루트 `packageManager` 필드가 없으면 `pnpm/action-setup` 에 lockfile 기준 version 을 넣습니다.

## 2.0.1

### Patch Changes

- bf73161: import 정렬 충돌 수정과 AI 가이드 보강

  - prettier 와 ESLint 가 서로 다른 그룹 기준으로 import 빈 줄을 요구하던 문제 수정.
    저장하면 prettier 가 빈 줄을 없애고, 그 결과를 ESLint 가 다시 지적하던 상황이었습니다.
    두 도구를 `react → next → 외부 → @/ → 상대경로` 순서, 빈 줄 없음으로 통일했습니다.
  - `src/lib/utils/cn.ts` 가 `@byuckchon-frontend/utils` 의 `cn` 을 재export 하도록 변경.
    twMerge 기본 설정이 타이포그래피 유틸(`text-body-sm-regular`)을 글자 색으로 분류해
    색과 함께 쓰면 타이포가 사라지던 문제를 utils 쪽에서 고쳤습니다.
  - AGENTS.md 보강
    - `basic-ui` 는 사용자가 명시적으로 요청했을 때만 사용하도록 명시
    - 전환 효과는 `duration-*` 대신 settings 의 `motion-*` 클래스를 쓰도록 안내 (표 포함)
    - 클래스 병합은 `twMerge` 직접 호출 대신 `cn` 을 쓰도록 안내
  - `pr-description.yml` 의 대상 브랜치 제한 해제. `dev` 로 여는 PR 에서만 동작하던 것을
    모든 PR 에서 동작하도록 했습니다.
  - `bc --version` 이 package.json 의 버전을 읽도록 수정. 소스에 버전이 박혀 있어서
    changesets 가 올린 실제 버전과 어긋나 있었습니다. (설치된 건 1.10.1 인데 1.10.0 으로 표시)

- bf73161: TypeScript 7 에서 제거되는 `baseUrl` 속성 삭제

  생성되는 tsconfig 에서 `baseUrl` 을 빼고, `paths` 를 tsconfig 파일 기준
  상대경로(`./src/*`)로 바꿨습니다. 별칭 해석 동작은 이전과 같습니다.

## 2.0.0

### Major Changes

- b92ed04: baseUrl 제거

## 1.10.0

### Minor Changes

- a9faee2: 프로젝트 설정을 @byuckchon-frontend/settings 참조 방식으로 이관

  생성되는 프로젝트가 설정 규칙의 사본을 갖는 대신 settings 를 참조합니다.
  규칙이 바뀌면 settings 버전만 올리면 기존 프로젝트에도 반영됩니다.

  - ESLint / Prettier / tsconfig / 타입 선언 / Style Dictionary 설정을 settings 참조로 교체
  - 단일 프로젝트와 모노레포로 갈라져 있던 ESLint 설정을 flat config + ESLint 9 로 통일
  - 컨벤션 규칙 사본(`tools/eslint-rules/`) 제거 — settings 를 단일 출처로 사용
  - `.vscode/settings.json` / `.nvmrc` / `.npmrc` / `turbo.json` 은
    `npx byuckchon-settings-sync` 로 갱신하는 방식으로 전환
  - PR Check 워크플로 추가 (lint / typecheck / build) — `bc init` 전용
  - 단일 프로젝트에 `typecheck` 스크립트와 `.nvmrc` 추가, CI Node 버전을 `.nvmrc` 로 통일
  - `bc adopt` 가 settings 를 devDependency 로 설치하도록 수정
  - Next 프로젝트의 `*.svg` 앰비언트 선언 중복 제거
  - `.gitignore` 의 `*.md` 무시 규칙 해제
