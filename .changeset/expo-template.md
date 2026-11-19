---
"byuckchon-frontend-cli": minor
---

`bc init`(단일 프로젝트)에서 Expo(React Native)를 고를 수 있습니다.

- 공식 `create-expo-app`(default 템플릿, SDK 58 고정) 위에 팀 규칙을 얹습니다.
- 데모 화면은 지우고 `src/`를 팀 폴더 구조로 만듭니다. 아이콘 · 스플래시 · `app.json`은 그대로 둡니다.
- React Query, axios(`EXPO_PUBLIC_API_BASE_URL`), zustand, zod, `@byuckchon-frontend/hooks` · `utils`
- 팀 ESLint · Prettier · tsconfig, `.nvmrc`, PR 리뷰 자동화, `api-codegen.md`, `bc.config.json`
- Expo가 만든 `AGENTS.md`는 그대로 두고 팀 규칙을 아래에 붙입니다.
- 스크립트: `lint`, `typecheck`, `build`(`expo export`), `format`
- 스타일은 StyleSheet, EAS는 넣지 않습니다. 모노레포(`bc add`)는 아직 지원하지 않습니다.
