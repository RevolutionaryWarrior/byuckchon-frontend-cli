import fs from 'fs/promises';
import path from 'path';

/**
 * React 폴더 구조
 * lib → store → api → hooks → context → components → layouts → pages
 * assets는 모든 레이어에서 참조 가능
 */
const REACT_FOLDERS = [
  'public',
  'src/assets',
  'src/assets/icons',
  'src/assets/images',
  'src/lib',
  'src/lib/utils',
  'src/store',
  'src/api',
  'src/hooks',
  'src/context',
  'src/components',
  'src/layouts',
  'src/pages',
];

/**
 * Next.js App Router 폴더 구조
 */
const NEXT_FOLDERS = [
  'public',
  'src/app',
  'src/api',
  'src/assets',
  'src/assets/common',
  'src/assets/pages',
  'src/components',
  'src/constant',
  'src/hooks',
  'src/lib',
  'src/lib/utils',
  'src/providers',
];

/**
 * React Query 캐시 정책. api-codegen.md 가 `import { cacheConfig } from '@/lib'` 로 쓴다.
 * React · Next 공통. (Next 서버 컴포넌트에서도 import 가능 — React 의존성이 없는 순수 객체)
 */
const CACHE_CONFIG_TS = `/**
 * React Query 캐시 정책. 조회 훅에서 \`...cacheConfig.<tier>\` 로 펼쳐 씁니다.
 *
 *   useQuery({ queryKey, queryFn, ...cacheConfig.longLived });
 *
 * - 단위는 ms 입니다. Next 의 fetch \`next: { revalidate }\`(초 단위)와는 별개이니 섞지 마세요.
 * - Next 서버 컴포넌트에서 prefetchQuery 할 때는 staleTime 만 넘기세요.
 *   서버의 gcTime 기본값은 Infinity(요청이 끝나면 정리)라서, gcTime 을 넣으면
 *   그 시간만큼 서버 메모리에 캐시가 남습니다.
 *     queryClient.prefetchQuery({ queryKey, queryFn, staleTime: cacheConfig.longLived.staleTime });
 */
export const cacheConfig = Object.freeze({
  realtime: Object.freeze({
    staleTime: 0,
    gcTime: 1000 * 60 * 5,
  }),
  shortLived: Object.freeze({
    staleTime: 1000 * 60,
    gcTime: 1000 * 60 * 10,
  }),
  mediumLived: Object.freeze({
    staleTime: 1000 * 60 * 3,
    gcTime: 1000 * 60 * 15,
  }),
  longLived: Object.freeze({
    staleTime: 1000 * 60 * 30,
    gcTime: 1000 * 60 * 60,
  }),
  immutable: Object.freeze({
    staleTime: Infinity,
    gcTime: 1000 * 60 * 60 * 24,
  }),
});
`;

/**
 * HTTP 에러 클래스. 상태 코드별로 나눠서 "화면을 바꿀 에러"와 "토스트로 끝낼 에러"를 구분한다.
 * React 는 api/instance.ts 의 axios 인터셉터가, Next 는 직접 만드는 fetch wrapper 가 createHttpError 로 변환한다.
 *
 * lib 에 두는 이유: 레이어 규칙상 lib 은 api 를 import 할 수 없는데,
 * errorHandler(lib)가 이 클래스로 판별해야 하기 때문.
 */
const HTTP_ERRORS_TS = `/**
 * HTTP 에러 클래스. api 레이어가 응답 실패를 이 클래스들로 바꿔서 던집니다.
 *
 *   NetworkError        응답 자체가 없음 (오프라인 · 타임아웃 · CORS)   → 치명적
 *   ServerError         5xx                                            → 치명적
 *   AuthenticationError 401
 *   AuthorizationError  403
 *   NotFoundError       404
 *   APIError            그 외 4xx (위 클래스들의 부모)
 *
 * 치명적인 것만 화면 전체를 바꾸고 Sentry 로 보냅니다. (utils/errorHandler.ts 의 isCriticalError)
 * 나머지는 화면에서 \`error.message\` 로 토스트를 띄웁니다.
 */

export class APIError extends Error {
  /** HTTP 상태 코드. 응답이 없으면(NetworkError) undefined */
  readonly status?: number;
  /** 서버가 보낸 응답 본문. 필드별 검증 메시지 등을 꺼낼 때 씁니다. */
  readonly data?: unknown;

  constructor(message: string, status?: number, data?: unknown) {
    super(message);
    // 빌드 후 클래스 이름이 축약돼도 Sentry 에서 구분되도록 이름을 직접 적는다.
    this.name = 'APIError';
    this.status = status;
    this.data = data;
  }
}

export class NetworkError extends APIError {
  constructor(message = '네트워크 연결을 확인해주세요') {
    super(message);
    this.name = 'NetworkError';
  }
}

export class AuthenticationError extends APIError {
  constructor(message = '로그인이 필요합니다', data?: unknown) {
    super(message, 401, data);
    this.name = 'AuthenticationError';
  }
}

export class AuthorizationError extends APIError {
  constructor(message = '접근 권한이 없습니다', data?: unknown) {
    super(message, 403, data);
    this.name = 'AuthorizationError';
  }
}

export class NotFoundError extends APIError {
  constructor(message = '요청한 정보를 찾을 수 없습니다', data?: unknown) {
    super(message, 404, data);
    this.name = 'NotFoundError';
  }
}

export class ServerError extends APIError {
  constructor(message = '잠시 후 다시 시도해주세요', status = 500, data?: unknown) {
    super(message, status, data);
    this.name = 'ServerError';
  }
}

/** 서버 응답 본문에 message 가 있으면 그걸 쓴다. */
function serverMessage(data: unknown): string | undefined {
  if (typeof data === 'object' && data !== null && 'message' in data) {
    const { message } = data as { message: unknown };
    if (typeof message === 'string' && message) return message;
  }
  return undefined;
}

/**
 * 상태 코드 + 응답 본문 → 에러 클래스.
 * axios 인터셉터와 fetch wrapper 가 같이 씁니다.
 *
 *   if (!res.ok) throw createHttpError(res.status, await res.json().catch(() => undefined));
 */
export function createHttpError(status: number, data?: unknown): APIError {
  const message = serverMessage(data);

  if (status === 401) return new AuthenticationError(message, data);
  if (status === 403) return new AuthorizationError(message, data);
  if (status === 404) return new NotFoundError(message, data);
  if (status >= 500) return new ServerError(message, status, data);
  return new APIError(message ?? '요청을 처리하지 못했습니다', status, data);
}
`;

/**
 * 에러 분류 · Sentry 전송. api-codegen.md 가 `import { captureSentryError } from '@/lib'` 로 쓴다.
 */
const ERROR_HANDLER_TS = `import * as Sentry from '@sentry/react';

import { NetworkError, ServerError } from '../errors';

/**
 * 화면 전체를 에러 화면으로 바꾸고 Sentry 로 보낼 에러인가.
 *
 * - QueryClient 의 throwOnError 로 쓰여서, true 면 가장 가까운 ErrorBoundary 로 올라갑니다.
 * - 401 · 403 · 404 · 그 외 4xx 는 false — 화면에서 토스트 등으로 처리합니다.
 */
export const isCriticalError = (error: unknown): boolean =>
  error instanceof NetworkError || error instanceof ServerError;

/**
 * Sentry 로 에러를 보낸다. DSN 이 없어 Sentry 가 초기화되지 않았으면 아무것도 하지 않는다.
 *
 *   captureSentryError(error, { location: 'useDeleteUser', action: 'deleteUser' });
 *   <ErrorBoundary onError={captureSentryError}>   // 두 번째 인자로 componentStack 이 들어온다
 */
export function captureSentryError(error: unknown, context?: object): void {
  if (!Sentry.getClient()) return;

  Sentry.captureException(error, context ? { extra: { ...context } } : undefined);
}
`;

async function writeFile(filePath, content) {
  await fs.writeFile(filePath, content, 'utf-8');
}

export async function createFolders(rootDir, config) {
  const folders =
    config.framework === 'react' ? REACT_FOLDERS : NEXT_FOLDERS;

  for (const folder of folders) {
    await fs.mkdir(path.join(rootDir, folder), { recursive: true });
  }

  // 각 레이어에 placeholder 파일 생성
  await writeFile(
    path.join(rootDir, 'src/lib/utils/cn.ts'),
    `// 클래스 병합은 @byuckchon-frontend/utils 가 관리합니다.
// twMerge 기본 설정은 타이포그래피 유틸(text-body-sm-regular 등)을 글자 색으로 분류해서
// 색과 함께 쓰면 타이포가 조용히 사라집니다. utils 의 cn 은 그 부분을 고쳐둔 것입니다.
//
// 토큰 이름 체계가 기본 패턴과 다르면 createCn 으로 직접 지정하세요.
//   import { createCn } from '@byuckchon-frontend/utils';
//   export const cn = createCn({ typography: ['tab-bar', 'subtitle'] });
export { cn } from '@byuckchon-frontend/utils';
`,
  );
  await writeFile(path.join(rootDir, 'src/lib/utils/errorHandler.ts'), ERROR_HANDLER_TS);
  await writeFile(
    path.join(rootDir, 'src/lib/utils/index.ts'),
    "export { cn } from './cn';\nexport { captureSentryError, isCriticalError } from './errorHandler';\n",
  );
  await writeFile(path.join(rootDir, 'src/lib/errors.ts'), HTTP_ERRORS_TS);
  await fs.mkdir(path.join(rootDir, 'src/lib/query'), { recursive: true });
  await writeFile(path.join(rootDir, 'src/lib/query/cacheConfig.ts'), CACHE_CONFIG_TS);
  await writeFile(
    path.join(rootDir, 'src/lib/query/index.ts'),
    "export { cacheConfig } from './cacheConfig';\n",
  );
  await writeFile(
    path.join(rootDir, 'src/lib/index.ts'),
    "export * from './errors';\nexport * from './query';\nexport * from './utils';\n",
  );
  await writeFile(path.join(rootDir, 'src/hooks/index.ts'), '// 커스텀 훅\n');
  await writeFile(path.join(rootDir, 'src/components/index.ts'), '// 재사용 가능한 UI 컴포넌트\n');

  if (config.framework === 'react') {
    await writeFile(path.join(rootDir, 'src/store/index.ts'), '// Zustand 스토어\n');
    await writeFile(path.join(rootDir, 'src/api/index.ts'), '// Axios API 호출\n');
    await writeFile(path.join(rootDir, 'src/context/index.tsx'), '// React Context\n');
    await writeFile(path.join(rootDir, 'src/layouts/index.tsx'), '// 레이아웃 컴포넌트\n');
    await writeFile(path.join(rootDir, 'src/pages/index.tsx'), '// 페이지 컴포넌트\n');
  } else {
    await writeFile(path.join(rootDir, 'src/api/index.ts'), '// API 호출\n');
    await writeFile(path.join(rootDir, 'src/constant/index.ts'), '// 상수 정의\n');
    await writeFile(path.join(rootDir, 'src/providers/index.tsx'), '// 전역 Provider\n');
  }
}
