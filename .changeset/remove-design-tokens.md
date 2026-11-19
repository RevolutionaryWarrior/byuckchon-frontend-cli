---
"byuckchon-frontend-cli": minor
---

생성되는 프로젝트에서 디자인 토큰 빌드를 뺐습니다. 디자인 값은 Figma MCP로 가져옵니다.

- 파일: `token.config.js`, `src/tokens.json`, `src/tokens.css` (CSS의 `@import`도 삭제)
- 스크립트: `tokens:build` (모노레포 루트 포함)
- 의존성: `style-dictionary`
