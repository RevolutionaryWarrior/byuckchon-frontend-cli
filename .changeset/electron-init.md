---
"byuckchon-frontend-cli": minor
---

`bc init` 단일 프로젝트에 Desktop(Electron) 선택지 추가

- electron-vite 구조(`src/main` · `src/preload` · `src/renderer`)로 생성합니다.
  BrowserWindow 는 `contextIsolation` · `sandbox` 를 켜고 `nodeIntegration` 을 끈 상태이며,
  renderer 는 preload 가 노출한 `window.api` 로만 main 에 요청합니다. (`ping` 예시 포함)
- renderer 는 웹 React 와 같은 폴더 구조 · eslint · prettier · tailwind · 디자인 토큰을 씁니다.
  tsconfig 는 node(main · preload)와 web(renderer)으로 나눠 settings 프리셋을 extends 합니다.
- `electron-builder.yml`(mac dmg · win nsis)과 `package:mac` · `package:win` 스크립트를 넣습니다.
- AGENTS.md 에 Electron IPC 규칙, README 에 "개발자가 채우는 것"(기능 IPC · 아이콘 · 코드 서명 · 자동 업데이트)을 넣습니다.
- PR Check 등 리뷰 자동화는 웹 단일 프로젝트와 같습니다.
- `bc gen api-types` 의 기본 출력이 Electron 프로젝트에서는 `src/renderer/src/api/types.gen.ts` 입니다.
- 모노레포 `bc add` 에서는 아직 Electron 을 고를 수 없습니다.
