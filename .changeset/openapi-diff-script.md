---
"byuckchon-frontend-cli": minor
---

백엔드 스펙이 바뀌면 AI가 작업 전에 알려줍니다.

- 생성되는 프로젝트(앱)에 `scripts/openapi.mjs`를 넣습니다. 의존성 없이 Node 18+로 돕니다.
  - `diff`: 마지막으로 반영한 스펙(`openapi.snapshot.json`)과 지금 스펙을 비교해 바뀐 경로와 필드를 출력
  - `show <경로>`: 그 경로와 참조 스키마(참조의 참조까지)만 출력
  - `save`: 지금 스펙을 스냅샷으로 저장 (키 정렬, 버전은 스냅샷 안의 `info.version`)
- `api-codegen.md`에 "바뀐 API 확인" 순서를 추가하고, jq 예시를 이 스크립트로 바꿨습니다.
- 모노레포 `.prettierignore`에 `openapi.snapshot.json`을 넣습니다. (`bc add`가 예전 모노레포에도 추가)
