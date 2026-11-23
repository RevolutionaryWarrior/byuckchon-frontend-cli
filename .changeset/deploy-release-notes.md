---
"byuckchon-frontend-cli": minor
---

`bc deploy` 추가 (프로토타입) — GitHub Release 를 만드는 release workflow 를 생성합니다. 배포는 하지 않습니다.

- Actions 에서 Run workflow 를 누르면 이전 태그 이후 커밋으로 버전을 올리고(SemVer) Release 노트를 만듭니다.
- 단일 레포는 `release.yml`(태그 `v1.2.0`), 모노레포는 앱마다 `release-<앱>.yml`(태그 `web@v1.2.0`)을 만듭니다.
- 모노레포 앱은 `apps/<앱>` · `packages` 를 건드린 커밋만 노트에 넣습니다.
- 모노레포 루트에서 실행하면 앱을 고르고, "레포 전체 하나로"는 한 번 더 확인합니다. `--yes` 면 `--app` 이 필요합니다.
- 설정은 그 앱의 `bc.config.json` 의 `release` 에 저장합니다.
- 노트는 함께 복사하는 `.github/scripts/release-notes.mjs`(의존성 없음)가 만듭니다. settings 배포 없이 바로 동작합니다.
