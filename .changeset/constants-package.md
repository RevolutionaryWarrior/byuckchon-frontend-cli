---
"byuckchon-frontend-cli": minor
---

모노레포 앱의 `cacheConfig` 를 `packages/constants` 로 옮김

- `bc init`(모노레포) 가 루트에 `packages/constants/` 를 만들고 `index.ts` · `cacheConfig.ts` 두 파일만 둡니다.
  (워크스페이스 패키지가 아니라 TS 파일만 두는 폴더 — `package.json` · `tsconfig` · `node_modules` 없음)
- 모노레포 앱(`bc init` · `bc add`) 에는 `src/lib/query/cacheConfig.ts` 를 만들지 않고,
  `src/lib/index.ts` 에서 `packages/constants` 를 상대 경로로 가져와 다시 내보냅니다. (`import { cacheConfig } from '@/lib'` 그대로 사용)
- `bc add` 를 `packages/constants` 가 없는 기존 모노레포에서 실행하면 폴더를 만들어 줍니다.
- 모노레포에 Next 앱이 하나라도 있으면 `cacheConfig.ts` 에 Next fetch 용 `nextCacheConfig` 를 함께 넣습니다.
  - `fetch(url, { ...nextCacheConfig.longLived })` 처럼 펼쳐 씁니다. (`realtime` 은 `cache: 'no-store'`, 나머지는 `next.revalidate`)
  - `bc init` 을 Next 로 만들거나, `bc add` 로 Next 앱을 추가하면(또는 이미 Next 앱이 있으면) 적용됩니다.
  - 기존 `cacheConfig.ts` 끝에 덧붙이기만 하므로 `cacheConfig` 를 수정해 뒀어도 그대로 유지됩니다.
- 단일 프로젝트는 그대로 `src/lib/query/cacheConfig.ts` 를 씁니다.
