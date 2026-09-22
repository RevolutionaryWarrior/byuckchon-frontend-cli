---
"byuckchon-frontend-cli": patch
---

TypeScript 7 에서 제거되는 `baseUrl` 속성 삭제

생성되는 tsconfig 에서 `baseUrl` 을 빼고, `paths` 를 tsconfig 파일 기준
상대경로(`./src/*`)로 바꿨습니다. 별칭 해석 동작은 이전과 같습니다.
