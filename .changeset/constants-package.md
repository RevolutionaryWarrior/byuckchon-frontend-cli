---
"byuckchon-frontend-cli": minor
---

모노레포 앱의 `cacheConfig` 를 `packages/constants` 로 옮김

- `bc init`(모노레포) 가 루트에 `packages/constants/` 를 만들고 `index.ts` · `cacheConfig.ts` 두 파일만 둡니다.
  (워크스페이스 패키지가 아니라 TS 파일만 두는 폴더 — `package.json` · `tsconfig` · `node_modules` 없음)
- 모노레포 앱(`bc init` · `bc add`) 에는 `src/lib/query/cacheConfig.ts` 를 만들지 않고,
  `src/lib/index.ts` 에서 `packages/constants` 를 상대 경로로 가져와 다시 내보냅니다. (`import { cacheConfig } from '@/lib'` 그대로 사용)
- `bc add` 를 `packages/constants` 가 없는 기존 모노레포에서 실행하면 폴더를 만들어 줍니다.
- 모노레포에 Next 앱이 하나라도 있으면 `cacheConfig` 의 tier 마다 Next fetch 용 `revalidate`(초, `staleTime` 과 같은 시간 · `immutable` 은 `false`)를 넣습니다.
  - `bc init` 을 Next 로 만들거나, `bc add` 로 Next 앱을 추가하면(또는 이미 Next 앱이 있으면) 적용됩니다.
  - 기존 `cacheConfig.ts` 가 생성 당시 그대로면 자동으로 바꾸고, 수정돼 있으면 건드리지 않고 안내만 합니다.
- 단일 프로젝트는 그대로 `src/lib/query/cacheConfig.ts` 를 씁니다.
