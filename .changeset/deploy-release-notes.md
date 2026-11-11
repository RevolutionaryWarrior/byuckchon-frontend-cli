---
"byuckchon-frontend-cli": minor
---

`bc deploy` 추가 (프로토타입) — 배포 성공 시에만 태그 · GitHub Release 노트를 남기는 `deploy.yml` 을 만듭니다.

- 질문 4개(릴리즈 노트 · 버전 이름 · 남길 곳 · Slack)를 Enter 만으로 넘길 수 있고 `--yes` 로 묻지 않을 수 있습니다.
- `bc.config.json` 에 `release` 를 저장합니다. Slack 은 Secret 이름만 저장합니다.
- `deploy` job 의 S3 · Lightsail 단계는 TODO 로 비워둡니다.
