---
"byuckchon-frontend-cli": minor
---

`bc deploy` 추가 (프로토타입) — 머지된 PR 을 CHANGELOG 에 쌓고, 입력한 버전으로 GitHub Release 를 만드는 workflow 를 생성합니다. 배포는 하지 않습니다.

- PR 이 main 에 머지될 때마다 `CHANGELOG.md` 의 "다음 릴리즈" 에 PR 제목을 한 줄 넣습니다. (커밋이 아니라 PR 단위)
  - 분류: PR 라벨 → 제목의 `[feature]` · `[fix]` → 브랜치 첫 토막(`feature/…`) 순서, 못 정하면 기타
- Actions 에서 Run workflow 에 버전(예: `1.2.0`)을 넣으면 "다음 릴리즈" 를 그 버전으로 묶어 커밋하고 Release 를 만듭니다.
  - 버전은 사람이 정합니다. 이전 릴리즈보다 커야 합니다.
  - 첫 릴리즈는 레포 전체 기록을 읽지 않습니다. `bc deploy` 이후 머지된 PR 만 들어가고, 기록이 없어도 기준 버전으로 만들 수 있습니다.
- 단일 레포는 `CHANGELOG.md` · `release.yml`(태그 `v1.2.0`), 모노레포는 앱마다 `apps/<앱>/CHANGELOG.md` · `release-<앱>.yml`(태그 `web@v1.2.0`)을 씁니다.
- 모노레포 앱은 `apps/<앱>` · `packages` 를 건드린 PR 만 기록합니다.
- 모노레포 루트에서 실행하면 앱을 고르고, "레포 전체 하나로"는 한 번 더 확인합니다. `--yes` 면 `--app` 이 필요합니다.
- 설정은 그 앱의 `bc.config.json` 의 `release` 에 저장합니다.
- 기록은 함께 복사하는 `.github/scripts/changelog.mjs`(의존성 없음)가 합니다. settings 배포 없이 바로 동작합니다.
- 기록 · 릴리즈 모두 github-actions 가 main 에 직접 커밋합니다. main 에 보호 규칙이 있으면 예외가 필요합니다.
