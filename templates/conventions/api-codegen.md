# 📑 API 코드 생성 가이드 (for AI)

> 이 문서는 **Swagger(OpenAPI) JSON 을 기반으로 API 코드를 생성**할 때 따라야 하는 컨벤션이다.
> 사용자가 Swagger JSON(또는 엔드포인트)을 제공하면, AI 는 이 문서의 규칙에 맞춰
> `api / zod / type / service / index` 파일을 생성한다.
>
> 대상: React(Vite/CRA 등), Next.js App Router
> 스택: `@tanstack/react-query` + React는 `axios`, Next.js는 native `fetch`.

---

## ⛳ 사전 규칙 — 코드 짜기 전에

1. **추측 금지.** Swagger 에 없는 필드/엔드포인트를 임의로 만들지 않는다.
   스키마가 모호하면 기존 리소스 폴더(예: `user/`)를 먼저 `read_file` 로 확인하고,
   그래도 불명확하면 사용자에게 한 번 묻는다.
2. **기존 코드 우선.** 공용 유틸(`cacheConfig`, `queryKey`, `captureSentryError`, `metaSchema`,
   `PaginationParams` 등)은 새로 만들지 말고 그대로 가져다 쓴다. import 경로가 확실치 않으면
   `search_code` 로 실제 export 위치를 확인한다.
3. **계약 파일은 항상 함께.** React는 `api / zod / type / service / index`를 한 번에 생성한다.
   Next.js는 공용 `zod / type`, 서버 기본 호출 파일, 필요한 경우 Client 호출 파일과 service를 생성한다.
   이미 같은 리소스가 있으면 기존 파일 구성과 이름을 우선한다.

---

## 0. 위치 & 폴더 구조

API 루트는 React에서 `src/api`, Next.js에서 `src/lib/api`다.

리소스(도메인) 하나당 폴더 하나. 폴더명은 **소문자**(여러 단어는 kebab-case: `favorite-stores`).

```
src/api/                      # Next.js: src/lib/api/
├── instance.ts               # React: axios 인스턴스
├── index.ts                  # 모든 API 모듈 export
└── user/                     # 리소스 폴더 (소문자)
    ├── user.api.ts           # React: axios / Next.js: Server fetch 호출
    ├── user.api.client.ts    # Next.js: Client 호출이 필요할 때만 생성
    ├── user.zod.ts           # 응답/요청 zod 스키마
    ├── user.type.ts          # zod 로부터 추론한 타입 + 입력 타입
    ├── user.service.ts       # react-query 훅 (use~) — 비즈니스 로직
    └── index.ts              # 외부 노출 (service, type 만)
```

- 파일 prefix 는 폴더명과 같다 (`user/` → `user.api.ts`, `user.zod.ts` ...).
- `RESOURCE` 상수는 `/api/<path>` 형태로 `.api.ts` 상단에 둔다.

---

## Next.js 전용 규칙 — Server/Client 경계

> 이 섹션의 **Next.js**는 프레임워크다. 문서의 **next(무한스크롤)**와는 관련이 없다.

Next.js App Router는 API 코드를 생성하기 전에 실행 환경을 분류한다.

| 환경 | 사용처 | 허용 의존성 |
| --- | --- | --- |
| Server | Server Component, Route Handler, Server Action | `cookies`, `headers`, 서버 토큰, `serverAuthHttp` |
| Client | `'use client'`, React Query hook | 브라우저 API, `clientAuthHttp` |
| 공용 | type, 순수 zod schema, 직렬화 가능한 상수 | 서버/브라우저 전용 의존성 없음 |

### 공용 barrel에서 Server 모듈을 내보내지 않는다

Client Component가 공용 `index.ts`를 가져올 때 그 barrel이 Server 모듈까지 export하면 다음 오류가 발생할 수 있다.

```text
This module cannot be imported from a Client Component module.
It should only be used from a Server Component.
```

```ts
// src/lib/api/http/index.ts
export * from './httpBase';
export * from './publicHttp';
export * from './clientAuthHttp';
// 금지: export * from './serverAuthHttp';
```

`serverAuthHttp`와 Server API는 barrel을 거치지 않고 절대경로로 직접 import한다.

```ts
import { serverAuthHttp } from '@/lib/api/http/serverAuthHttp';
```

- Server 파일은 가능하면 `import 'server-only';`로 경계를 표시한다.
- 인증 호출은 Server를 기본으로 하고 Client에서도 호출해야 할 때만 `*.client.ts`를 만든다.
- Client service는 Client 호출 파일만 import하며 Server 파일을 간접 참조하지 않는다.
- `useQuery`/`useMutation`을 export하는 service는 Client 전용이다.
- type과 zod schema만 Server/Client가 공유한다.

### HTTP와 인증 컨텍스트를 분리한다

- `serverAuthHttp`: 서버 쿠키·헤더·비공개 토큰 사용. 공용 barrel export 금지.
- `clientAuthHttp`: 브라우저에 노출 가능한 인증 상태만 사용.
- `publicHttp`: 양쪽에서 안전할 때만 공용 사용.
- 기존 fetch wrapper를 먼저 찾는다. 없으면 자동 생성하지 말고 fetch/auth 방식을 사용자에게 묻는다.
- `cookies()`/`headers()`는 모듈 최상위가 아니라 요청 함수 내부에서 호출한다.
- 서버 비밀값에 `NEXT_PUBLIC_`을 붙이지 않는다.
- 기존 Route Handler/BFF, base URL, CORS, Edge Runtime 정책을 확인하고 재사용한다.

### 캐시와 전달 값을 구분한다

- React Query 무효화는 Client 캐시만 갱신한다.
- Next.js의 `fetch` cache/`next`, `revalidatePath`/`revalidateTag`, Cache Components는 기존 정책을 따른다.
- 사용자별 인증 응답을 전역 캐시하지 않는다.
- Server에서 Client로 응답 wrapper, `Headers`, `Error`, 함수 등을 전달하지 않고 JSON 직렬화 가능한 data만 전달한다.
- Server Action은 요청받았거나 기존 프로젝트가 같은 패턴을 사용할 때만 만든다.

---

## 1. 가장 먼저 — "next(무한스크롤)" 인지 판단하라

> 여기서 말하는 "next" 는 **프레임워크 Next.js 가 아니라**, **커서 기반 무한스크롤 패턴**을 가리킨다.

코드를 짜기 전에 **해당 엔드포인트가 커서 기반 무한스크롤 API 인지** 먼저 판단한다.

### "next" 로 판단하는 기준 (아래 중 하나라도 해당하면 next)

- 요청 파라미터에 `cursor`, `limit` (또는 `page`, `size` 등 페이지네이션 파라미터) 가 있다.
- 응답 본문에 `items`(배열) + `meta`(`hasNextPage`, `nextCursor`) 구조가 있다.
- "목록을 스크롤하며 더 불러오는" 리스트 조회 엔드포인트다.

| 판단 | 사용 훅 | 참고 |
| --- | --- | --- |
| **next O** (무한스크롤) | `useInfiniteQuery` | [§5](#5-next무한스크롤-템플릿) |
| **next X** (일반) | `useQuery` / `useMutation` | [§4](#4-일반next-x-템플릿) |

> 단건 조회·생성·수정·삭제, 페이지네이션 없는 전체 목록은 모두 **next X (일반)**.

---

## 2. 각 파일 작성 규칙

### 2-1. `user.api.ts` — 순수 호출 함수

- React는 `baseInstance`(axios)를 사용한다.
- Next.js는 Server 파일에서 기존 `serverAuthHttp`를 절대경로로 import한다. Client 호출이 필요할 때만
  `*.client.ts`를 만들고 기존 `clientAuthHttp`를 사용한다. wrapper가 없으면 자동 생성하지 않는다.
- React는 `const { data } = await baseInstance.X(...)` 후 `data`를 반환한다.
- Next.js는 fetch wrapper의 generic에 응답 타입을 전달하고 JSON data를 반환받는다.
- 쿼리스트링은 기존 wrapper 규칙(axios의 `{ params }`, fetch wrapper의 `searchParams` 등)을 따른다.
  path 파라미터는 템플릿 리터럴을 사용한다.
- **여기서는 zod 파싱을 하지 않는다.** (파싱은 service 의 queryFn 책임)

```ts
// React
import baseInstance from '../instance';

const RESOURCE = '/api/user';

export const getUserList = async () => {
  const { data } = await baseInstance.get(RESOURCE);

  return data;
};

export const getUser = async (userId: string) => {
  const { data } = await baseInstance.get(`${RESOURCE}/${userId}`);

  return data;
};

export const deleteUser = async (userId: string) => {
  const { data } = await baseInstance.delete(`${RESOURCE}/${userId}`);

  return data;
};
```

```ts
// Next.js Server
import { serverAuthHttp } from '@/lib/api/http/serverAuthHttp';
import type { UserItem } from './user.type';

const RESOURCE = '/api/user';

export const getUser = async (userId: string) => {
  return serverAuthHttp<UserItem>(`${RESOURCE}/${userId}`);
};
```

### 2-2. `user.zod.ts` — 스키마

- `import { z } from 'zod';`
- **단일 아이템 스키마**(`userItemSchema`)를 먼저 정의하고, 리스트는 `z.array(...)` 로 조합한다.
- 재사용 가능한 작은 스키마는 별도 `const` 로 분리.
- Swagger 타입 → zod 매핑:
  - `string` → `z.string()`, `integer/number` → `z.number()`, `boolean` → `z.boolean()`
  - `nullable: true` → `.nullable()` / `required` 에 없으면 `.optional()` (둘 다면 `.nullable().optional()`)
  - `enum` → `z.enum([...] as const)` (숫자 enum 은 `z.union([z.literal(1), ...])`)
  - `format: date-time` → `z.string().datetime()` (값은 ISO 문자열 유지)
  - 제약(min/max/length) 이 명시되면 반영
- **`$ref` / `allOf` / `oneOf`**:
  - `$ref` → 참조 대상 스키마를 먼저 정의 후 재사용
  - `allOf` → `baseSchema.merge(extraSchema)` 또는 `.and(...)`
  - `oneOf`/`anyOf` → `z.union([...])`, discriminator 있으면 `z.discriminatedUnion(...)`
- **next 응답**은 공통 `metaSchema` 사용: `import { metaSchema } from '@/lib';`

```ts
import { z } from 'zod';

export const userItemSchema = z.object({
  userId: z.string(),
  name: z.string(),
  email: z.string().nullable(),
  isActive: z.boolean(),
});

export const userListSchema = z.array(userItemSchema);
```

### 2-3. `user.type.ts` — 타입

- 응답 타입은 **zod 스키마에서 추론**: `export type X = z.infer<typeof xSchema>;`
- 입력(요청) 타입은 직접 정의. 인자가 2개 이상인 변경은 객체 입력 타입으로 묶는다.

```ts
import { z } from 'zod';
import { userItemSchema } from './user.zod';

export type UserItem = z.infer<typeof userItemSchema>;

export type UpdateUser = {
  userId: string;
  name: string;
};
```

### 2-4. `user.service.ts` — react-query 훅 (비즈니스 로직)

공통 import:

```ts
import { cacheConfig, captureSentryError, queryKey } from '@/lib';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
```

규칙:

- 훅 이름: 조회 `useGetUser` / `useGetUserList`, 변경 `useCreateUser` / `useUpdateUser` / `useDeleteUser`.
- **조회(useQuery)** 의 `queryFn` 에서 zod `safeParse` 로 검증.
  - 실패 시 `console.error(...)` 후 **원본 `data` 그대로 반환**(throw 금지).
  - 성공 시 `parsed.data` 반환.
- **변경(useMutation)** 은 `onSuccess` 에서 관련 `queryKey` 를 `invalidateQueries`.
- 모든 훅의 `onError` 에서 `captureSentryError(error, { location, action })`.
  - `location` = 훅 이름(`'useDeleteUser'`), `action` = 호출 함수명(`'deleteUser'`).
- 조회 훅은 마지막에 `...cacheConfig.<tier>` + `...options` 펼침.
- 캐시 tier: 자주 바뀜 `realtime`/`shortLived`, 보통 `mediumLived`, 잘 안 바뀜 `longLived`, 불변 `immutable`.

```ts
export const useGetUserList = (options?: Record<string, any>) => {
  return useQuery({
    queryKey: queryKey.user.list,
    queryFn: async () => {
      const data = await getUserList();
      const parsed = userListSchema.safeParse(data);

      if (!parsed.success) {
        console.error('User list validation error:', parsed.error);

        return data;
      }

      return parsed.data;
    },
    ...cacheConfig.longLived,
    ...options,
  });
};

export const useDeleteUser = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (userId: string) => deleteUser(userId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKey.user.all });
    },
    onError: (error) => {
      captureSentryError(error, { location: 'useDeleteUser', action: 'deleteUser' });
    },
  });
};
```

### 2-5. `index.ts` (리소스) — 노출

- **`service` 와 `type` 만** 재노출 (`api`, `zod` 는 노출하지 않음).
- Next.js에서는 Server 호출 파일을 Client가 접근 가능한 barrel에서 재노출하지 않는다.

```ts
export * from './user.service';
export * from './user.type';
```

### 2-6. `src/api/index.ts` (루트) — 모든 모듈 export

- 새 리소스를 추가하면 한 줄 추가한다.

```ts
export * from './user';
// export * from './order';
```

### 2-7. `src/api/instance.ts` — axios 인스턴스

- React 전용 규칙이다.
- 이미 있으면 **건드리지 않는다.** baseURL/interceptor 설정이 여기 모여 있다.
- 새 리소스는 항상 이 `baseInstance` 를 import 해서 쓴다.

---

## 3. queryKey 등록 규칙

공용 `queryKey` 객체에 리소스 항목을 추가한다.

- `all` 은 무효화(invalidate) 기준 최상위 키. 변경 훅은 보통 `queryKey.<resource>.all` 무효화.
- 하위 키는 `['<resource>', '<scope>']`. 파라미터가 들어가면 함수형으로.

```ts
user: Object.freeze({
  all: ['user'],
  list: ['user', 'list'],
  detail: (id: string) => ['user', 'detail', id],
}),
```

---

## 4. 일반(next X) 템플릿

```ts
// api
export const getUser = async (params?: SomeParams) => {
  const { data } = await baseInstance.get(RESOURCE, { params });
  return data;
};

// service
export const useGetUser = (options?: Record<string, any>) => {
  return useQuery({
    queryKey: queryKey.user.list,
    queryFn: async () => {
      const data = await getUser();
      const parsed = userSchema.safeParse(data);
      if (!parsed.success) {
        console.error('User validation error:', parsed.error);
        return data;
      }
      return parsed.data;
    },
    ...cacheConfig.mediumLived,
    ...options,
  });
};

// 변경
export const useCreateUser = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload: CreateUserPayload) => createUser(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKey.user.all });
    },
    onError: (error) => {
      captureSentryError(error, { location: 'useCreateUser', action: 'createUser' });
    },
  });
};
```

> 인자가 2개 이상이면 객체로 묶어 `*.type.ts` 에 입력 타입을 정의하고 구조분해로 받는다.
> 예: `mutationFn: ({ userId, name }: UpdateUser) => updateUser(userId, name)`

---

## 5. next(무한스크롤) 템플릿

판단 결과가 **next** 일 때만 사용. 핵심은 `useInfiniteQuery` + 공통 `metaSchema`.

```ts
// api  (cursor 기반)
import { PaginationParams } from '@/lib';

export const getUser = async (params: PaginationParams) => {
  const { data } = await baseInstance.get(RESOURCE, { params });
  return data;
};

// zod  (items + meta)
import { metaSchema } from '@/lib';

export const userItemSchema = z.object({ /* ... */ });
export const getUserResponseSchema = z.object({
  items: z.array(userItemSchema),
  meta: metaSchema, // { hasNextPage, nextCursor }
});

// type
export type GetUserResponse = z.infer<typeof getUserResponseSchema>;

// service
import { useInfiniteQuery } from '@tanstack/react-query';

export const useGetUser = (options?: Record<string, any>) => {
  const defaultParams: PaginationParams = { limit: 10, cursor: undefined };

  return useInfiniteQuery<GetUserResponse, Error, GetUserResponse['items']>({
    queryKey: queryKey.user.list,
    queryFn: async ({ pageParam }) => {
      const params: PaginationParams = { ...defaultParams, ...(pageParam || {}) };
      const data = await getUser(params);
      const parsed = getUserResponseSchema.safeParse(data);
      if (!parsed.success) {
        console.error('User validation error:', parsed.error);
        return data;
      }
      return parsed.data;
    },
    getNextPageParam: (lastPage) =>
      lastPage?.meta?.hasNextPage
        ? { ...defaultParams, cursor: lastPage.meta.nextCursor }
        : undefined,
    select: (data) => data.pages.flatMap((page) => page?.items ?? []),
    initialPageParam: defaultParams,
    ...cacheConfig.longLived,
    ...options,
  });
};
```

- `select` 로 `pages` 를 평탄화해 컴포넌트는 평평한 배열만 받는다.
- `meta.hasNextPage` 가 falsy 면 `getNextPageParam` 은 `undefined`(다음 페이지 없음).

---

## 6. 네이밍 & 스타일 요약

- 폴더: 소문자 / kebab-case (`user`, `favorite-stores`). 파일 prefix = 폴더명.
- 함수: 동사 + 리소스 (`getUserList`, `createUser`, `updateUser`).
- 훅: `use` + 함수 의미 (`useGetUserList`, `useCreateUser`).
- `RESOURCE` 상수로 baseURL 경로 관리, 동적 경로는 템플릿 리터럴.
- 조회는 zod 검증(실패 시 원본 반환), 변경은 invalidate + Sentry.
- `index.ts` 는 service/type 만 노출, 루트 `index.ts` 에 리소스 한 줄 추가.
- 들여쓰기 2칸, 세미콜론 사용, import 그룹: 외부 → `@/...` → 상대경로.

---

## 7. 생성 시 체크리스트 ✅

1. [ ] 위치를 맞췄다 (React `src/api` / Next.js `src/lib/api`).
2. [ ] 엔드포인트가 **next(무한스크롤)** 인지 판단했다. (§1)
3. [ ] `api / zod / type / service / index` 5파일을 모두 만들었다.
4. [ ] Swagger 응답을 zod 로 정확히 매핑(nullable/optional/enum/date/$ref).
5. [ ] 타입은 `z.infer` 로 추론.
6. [ ] 조회 훅 queryFn 에서 `safeParse` 후 실패 시 원본 반환.
7. [ ] 변경 훅에 `invalidateQueries` + `captureSentryError`.
8. [ ] `queryKey` 에 리소스 키(`all` 포함) 추가.
9. [ ] 리소스 `index.ts` + 루트 `index.ts` 노출 추가.
10. [ ] next 면 `useInfiniteQuery` + `metaSchema` + `select` 평탄화 적용.
11. [ ] 공용 유틸을 재사용하고, Swagger 에 없는 필드를 추측으로 만들지 않았다.
12. [ ] Next.js면 Server/Client 환경을 분류하고 Server 모듈을 공용 barrel에서 내보내지 않았다.
13. [ ] Next.js면 기존 fetch/auth wrapper와 캐시·runtime 정책을 확인했다.

---

## 8. 자주 하는 실수 (하지 말 것) 🚫

- ❌ `*.api.ts` 에서 zod 파싱 (파싱은 service 의 queryFn 책임).
- ❌ `index.ts` 에서 `api`/`zod` 노출 (service/type 만).
- ❌ 조회 훅에서 검증 실패 시 throw (원본 반환이 규칙).
- ❌ `captureSentryError` / `invalidateQueries` 누락.
- ❌ Swagger 의 `nullable` 무시하고 필수로 선언.
- ❌ 일반 목록인데 `useInfiniteQuery` 사용 (또는 그 반대).
- ❌ 공용 타입/유틸(`metaSchema`, `PaginationParams`)을 중복 재정의.
- ❌ React와 Next.js의 API 루트 또는 axios/fetch 규칙을 혼용.
- ❌ Next.js 공용 `index.ts`에서 Server 전용 API나 `serverAuthHttp`를 export.
