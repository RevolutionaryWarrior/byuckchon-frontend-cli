---
"byuckchon-frontend-cli": patch
---

import 정렬 충돌 수정과 AI 가이드 보강

- prettier 와 ESLint 가 서로 다른 그룹 기준으로 import 빈 줄을 요구하던 문제 수정.
  저장하면 prettier 가 빈 줄을 없애고, 그 결과를 ESLint 가 다시 지적하던 상황이었습니다.
  두 도구를 `react → next → 외부 → @/ → 상대경로` 순서, 빈 줄 없음으로 통일했습니다.
- `src/lib/utils/cn.ts` 가 `@byuckchon-frontend/utils` 의 `cn` 을 재export 하도록 변경.
  twMerge 기본 설정이 타이포그래피 유틸(`text-body-sm-regular`)을 글자 색으로 분류해
  색과 함께 쓰면 타이포가 사라지던 문제를 utils 쪽에서 고쳤습니다.
- AGENTS.md 보강
  - `basic-ui` 는 사용자가 명시적으로 요청했을 때만 사용하도록 명시
  - 전환 효과는 `duration-*` 대신 settings 의 `motion-*` 클래스를 쓰도록 안내 (표 포함)
  - 클래스 병합은 `twMerge` 직접 호출 대신 `cn` 을 쓰도록 안내
- `pr-description.yml` 의 대상 브랜치 제한 해제. `dev` 로 여는 PR 에서만 동작하던 것을
  모든 PR 에서 동작하도록 했습니다.
