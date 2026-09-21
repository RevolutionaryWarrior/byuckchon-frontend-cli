# Changesets

버전과 CHANGELOG 를 자동으로 관리합니다.

동작하는 내용을 PR 에 담을 때 아래 명령으로 changeset 을 하나 만들고 함께 커밋하세요.

```bash
npx changeset
```

- `patch` — 버그 수정
- `minor` — 기능 추가, 생성물 구조 변경
- `major` — 기존 프로젝트를 깨뜨리는 변경

main 에 머지되면 GitHub Actions 가 "Version Packages" PR 을 만들고,
그 PR 을 머지하면 npm 에 자동으로 배포됩니다.

changeset 을 깜빡했다면 나중에 추가해도 됩니다. 순서는 상관없습니다.
