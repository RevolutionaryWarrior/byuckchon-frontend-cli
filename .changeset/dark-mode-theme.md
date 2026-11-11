---
"byuckchon-frontend-cli": minor
---

라이트/다크 테마 기본 구성 추가

- `token.config.js` 를 `defineTokenConfig({ themes: { default: "light", dark: "dark" } })` 로 생성합니다.
  디자이너의 `light` / `dark` 세트가 같은 변수명(`--color-bg-default`)으로 출력되고, 다크 값은 `[data-theme="dark"]` 가 덮어씁니다.
- `src/lib/theme/useTheme.ts` 를 추가합니다. 테마 읽기·변경, localStorage 저장, 저장값이 없으면 OS `prefers-color-scheme` 를 따르고
  `document.documentElement.dataset.theme` 을 관리합니다. (`setTheme('system')` 으로 OS 설정 복귀)
- 첫 페인트 전에 `data-theme` 을 붙이는 인라인 스크립트를 넣어 깜빡임을 막습니다. (Vite `index.html` · Next `layout.tsx`, `suppressHydrationWarning`)
- AGENTS.md 에 "시맨틱 토큰 클래스만 쓰고 `dark:` 변형은 쓰지 않는다" 규칙을 추가했습니다.

⚠️ `themes` 옵션은 `@byuckchon-frontend/settings` 1.11.0(배포 예정 minor) 부터 동작합니다.
생성 프로젝트의 settings 버전은 init 시점의 npm 최신으로 들어가므로, settings 를 먼저 배포한 뒤 이 CLI 를 배포하세요.
(이전 settings 에서는 `themes` 가 무시되어 기존처럼 `--color-light-*` / `--color-dark-*` 로 출력됩니다)
