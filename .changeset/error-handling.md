---
"byuckchon-frontend-cli": minor
---

생성 프로젝트에 HTTP 상태별 에러 처리 · Sentry 기본 구성 추가

- `src/lib/errors.ts`: `NetworkError` · `AuthenticationError`(401) · `AuthorizationError`(403) · `NotFoundError`(404) · `ServerError`(5xx) · `APIError`(그 외 4xx) 와 `createHttpError(status, body)`.
- `src/lib/utils/errorHandler.ts`: `isCriticalError`(네트워크 · 5xx), `captureSentryError`(Sentry 미초기화 시 no-op). `@/lib` 에서 export.
- React: `src/api/instance.ts` axios 인스턴스 — 응답 인터셉터가 에러 클래스로 변환(요청 취소는 제외).
- QueryClient `throwOnError: isCriticalError` + 앱 전체 `ErrorBoundary`(`@byuckchon-frontend/core`, `AppFallbackUI`, `onError={captureSentryError}`).
  Next 는 `src/providers/AppProviders.tsx` 로 root layout 을 감싸고, `error.tsx` 가 Sentry 로 보냅니다.
- `@sentry/react` 기본 포함. `VITE_SENTRY_DSN` / `NEXT_PUBLIC_SENTRY_DSN` 이 비어 있으면 init 하지 않습니다.
- `.env.example`(키 이름만) 생성, 단일 프로젝트 `.gitignore` 가 `.env.example` 을 커밋 대상으로 둡니다.
- AGENTS.md · README · api-codegen.md 에 에러 처리 규칙(변경 훅은 치명적 에러만 Sentry, 나머지는 화면에서 토스트) 반영.
