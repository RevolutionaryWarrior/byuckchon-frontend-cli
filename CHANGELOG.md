# byuckchon-frontend-cli

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
