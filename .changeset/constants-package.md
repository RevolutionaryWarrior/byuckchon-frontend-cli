---
"byuckchon-frontend-cli": minor
---

모노레포 앱의 `cacheConfig` 를 `packages/constants` 로 옮김

- `bc init`(모노레포) 가 `packages/constants`(`@<scope>/constants`) 를 만들고 `src/cacheConfig.ts` 를 그 안에 둡니다.
- 모노레포 앱(`bc init` · `bc add`) 에는 `src/lib/query/cacheConfig.ts` 를 만들지 않고,
  `src/lib/index.ts` 에서 `@<scope>/constants` 의 `cacheConfig` 를 다시 내보냅니다. (`import { cacheConfig } from '@/lib'` 그대로 사용)
- 앱 `package.json` 에 `@<scope>/constants: workspace:*` 를 넣고, Next 앱은 `next.config.ts` 의 `transpilePackages` 에 추가합니다.
- `bc add` 를 `packages/constants` 가 없는 기존 모노레포에서 실행하면 패키지를 만들어 줍니다.
- 모노레포에 Next 앱이 하나라도 있으면 `cacheConfig` 의 tier 마다 Next fetch 용 `revalidate`(초, `staleTime` 과 같은 시간 · `immutable` 은 `false`)를 넣습니다.
  - `bc init` 을 Next 로 만들거나, `bc add` 로 Next 앱을 추가하면(또는 이미 Next 앱이 있으면) 적용됩니다.
  - 기존 `cacheConfig.ts` 가 생성 당시 그대로면 자동으로 바꾸고, 수정돼 있으면 건드리지 않고 안내만 합니다.
- 단일 프로젝트는 그대로 `src/lib/query/cacheConfig.ts` 를 씁니다.
