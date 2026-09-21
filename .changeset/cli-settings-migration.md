---
"byuckchon-frontend-cli": minor
---

프로젝트 설정을 @byuckchon-frontend/settings 참조 방식으로 이관

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
