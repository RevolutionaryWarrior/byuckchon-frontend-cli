---
"byuckchon-frontend-cli": patch
---

`api-codegen.md`의 API 파일 이름 규칙을 바꿨습니다.

- 파일 이름은 폴더명과 같은 소문자로 씁니다. 예: `post/post.api.ts`
- 종류: `api`, `zod`, `type`, `service`, `server`
- Next: 서버 호출은 `*.server.ts`, 클라이언트 호출은 `*.api.ts` (`*.api.client.ts`는 없앰)
- `mapper` 같은 보조 파일은 필요하면 둡니다.
