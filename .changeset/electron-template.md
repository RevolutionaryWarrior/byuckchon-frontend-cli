---
"byuckchon-frontend-cli": minor
---

`bc init`, `bc add`에서 Electron을 고를 수 있습니다.

- React 템플릿에 데스크톱 앱 설정을 더한 구조입니다. 렌더러(`src/`)는 React와 같은 폴더 · 린트 · API 규칙을 씁니다.
- 추가되는 것: `electron/main.ts`, `electron/preload.ts`(`window.electron`), `electron-builder.json`
- 스크립트: `dev`(Vite + Electron), `build`, `package`(설치 파일 → `release/`)
- 의존성: `electron`, `vite-plugin-electron`(0.29, Vite 6 용), `electron-builder`
- 모노레포는 루트 `.gitignore`에 `dist-electron/`, `release/`를 넣습니다.
