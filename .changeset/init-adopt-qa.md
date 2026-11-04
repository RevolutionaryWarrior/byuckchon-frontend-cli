---
"byuckchon-frontend-cli": minor
---

bc init · add · adopt QA 수정

- init · add 가 시작할 때 npm 의 최신 `@byuckchon-frontend/settings` 버전 매트릭스를 받아서 씁니다.
  CLI 를 예전에 설치했어도 옛 매트릭스로 생성되지 않습니다.
- init · add · adopt 전에 CLI 버전을 검사합니다. npm 최신보다 major · minor 가 뒤처졌으면 업데이트 명령을 보여주고 멈추고,
  patch 만 뒤처졌으면 안내만 하고 진행합니다. (npm 확인 실패 시 진행 · 개발용 `BC_SKIP_CLI_CHECK=1`)
  (네트워크 실패 시 CLI 에 포함된 settings 로 진행 · 개발용 `BC_SETTINGS_DIR`)
- 모노레포 Next 앱(`bc add`)에도 `@tanstack/react-query` 를 넣습니다.
- 새 프로젝트에 `src/lib/query/cacheConfig.ts` 를 만들고 `@/lib` 에서 export 합니다. (React · Next 공통)
- adopt
  - `.nvmrc` 가 없으면 만듭니다. (.node-version → engines.node → settings 기본값)
  - 패키지 매니저를 상위 폴더 lockfile · `packageManager` 필드까지 보고 감지합니다. `bun.lock` 도 감지합니다.
  - 패키지 매니저를 모르면 npm 으로 강행하지 않고 설치할 목록만 안내합니다.
  - 복사하는 workflow 의 설치·실행 명령을 npm · pnpm · yarn(berry 포함) · bun 에 맞춥니다.
  - pnpm 인데 루트 `packageManager` 필드가 없으면 `pnpm/action-setup` 에 lockfile 기준 version 을 넣습니다.
