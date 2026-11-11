---
"byuckchon-frontend-cli": minor
---

`bc init` 단일 프로젝트에 Mobile(React Native + Expo) 추가

- 공식 `create-expo-app`(default 템플릿)으로 만든 뒤 bc 파일을 덮어씁니다. Expo 가 SDK 마다 바꾸는 구조는 Expo 템플릿을 따릅니다.
- 앱 이름 · 번들 ID · 딥링크 scheme 을 묻고(번들 ID · scheme 은 폴더 이름에서 제안), `app.json` 대신 `app.config.ts` 에 `// bc init` 표시와 함께 넣습니다.
- EAS 연결을 고르면 `eas whoami` 로 로그인을 확인하고 `eas init` 으로 받은 projectId 를 `app.config.ts` 에 넣습니다. 로그인 전이면 건너뜁니다.
- Expo 의 `AGENTS.md` 는 그대로 두고 아래에 팀 규칙(Figma → 코드 · API · 스타일 · 에러 · 사내 패키지)을 덧붙입니다.
- NativeWind(Tailwind v3) · React Query · axios 인스턴스 · `eas.json` · `.env.example`(`EXPO_PUBLIC_*`) · settings 의 eslint/prettier/tsconfig(base) · PR Check workflow 를 넣습니다.
- 끝나면 남은 할 일(아이콘 · 스플래시 교체, `eas credentials`, 건너뛴 EAS 연결)을 출력합니다.
- 모노레포(`bc add`)에는 아직 없습니다.
