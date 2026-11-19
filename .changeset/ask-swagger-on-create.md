---
"byuckchon-frontend-cli": minor
---

`bc init`, `bc add`에서 Swagger 주소를 묻습니다.

- 받은 주소는 앱의 `bc.config.json` `api.openapi`에 넣습니다.
- 건너뛰면 지금처럼 AI가 처음 API 코드를 만들 때 물어봅니다.
- 화면 주소(`/api/docs`)를 넣어도 AI가 JSON 주소를 찾아 바꿔 넣습니다.
