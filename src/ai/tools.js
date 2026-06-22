import fs from 'node:fs/promises';
import path from 'node:path';

import fg from 'fast-glob';
import { tool, jsonSchema } from 'ai';

import { searchIndex } from '../indexer/search.js';
import {
  fetchFromUrl as fetchFigmaFromUrl,
  fetchImageUrls as fetchFigmaImageUrls,
  fetchStyles as fetchFigmaStyles,
} from '../figma/api.js';
import { simplifyFetchNodes } from '../figma/simplify.js';
import { parseFigmaUrl } from '../figma/url.js';
import { getCachedOpenApi } from '../openapi/cache.js';
import { searchEndpoints, getEndpoint } from '../openapi/lookup.js';

/**
 * Agentic chat 용 툴 정의.
 *
 * 설계 원칙:
 *  - **모든 파일 경로는 projectRoot 하위로 강제** (탈출 시도는 에러).
 *  - read/list/search 는 always-allow (안전).
 *  - write/edit 는 `safeWrite` 가 디스크에 쓰고 onWrite 콜백으로 UI 에 알린다.
 *    승인 게이트를 추후 끼우려면 onWrite 안에서 await 로 막으면 된다.
 *  - 모든 결과는 plain JSON 으로 돌려준다 (모델이 다시 추론하기 좋게).
 *
 * 사용:
 *   const tools = buildTools({ projectRoot, effective, onEvent });
 *   streamText({ tools, stopWhen: stepCountIs(12), ... });
 */
export function buildTools({ projectRoot, effective, onEvent = () => {}, openapiSource = null }) {
  const root = path.resolve(projectRoot);

  // OpenAPI 스펙은 한 번만 로드해서 캐시 (큰 파일이라 반복 파싱 비쌈).
  let _openapiDocPromise = null;
  function loadOpenApiDoc() {
    if (!openapiSource) return Promise.resolve(null);
    if (!_openapiDocPromise) {
      _openapiDocPromise = getCachedOpenApi(openapiSource)
        .then((res) => res.doc ?? null)
        .catch(() => null);
    }
    return _openapiDocPromise;
  }

  function safePath(p) {
    if (!p || typeof p !== 'string') {
      throw new Error('path 가 비어있습니다');
    }
    const abs = path.isAbsolute(p) ? path.resolve(p) : path.resolve(root, p);
    const rel = path.relative(root, abs);
    if (rel.startsWith('..') || path.isAbsolute(rel)) {
      throw new Error(`프로젝트 루트(${root}) 밖의 경로는 접근할 수 없습니다: ${p}`);
    }
    return { abs, rel: rel || '.' };
  }

  async function readFile({ path: p }) {
    const { abs, rel } = safePath(p);
    let stat;
    try {
      stat = await fs.stat(abs);
    } catch {
      return { ok: false, error: `파일이 존재하지 않습니다: ${rel}` };
    }
    if (stat.isDirectory()) {
      const entries = await fs.readdir(abs, { withFileTypes: true });
      return {
        ok: true,
        kind: 'directory',
        path: rel,
        entries: entries.map((e) => (e.isDirectory() ? e.name + '/' : e.name)),
      };
    }
    if (stat.size > 256 * 1024) {
      return { ok: false, error: `파일이 너무 큽니다 (${stat.size}B). 256KB 이하만 지원.` };
    }
    const content = await fs.readFile(abs, 'utf8');
    return { ok: true, kind: 'file', path: rel, lines: content.split('\n').length, content };
  }

  async function listFiles({ pattern = '**/*', limit = 100 }) {
    const matches = await fg(pattern, {
      cwd: root,
      ignore: ['node_modules/**', 'dist/**', 'build/**', '.next/**', '.bc/**', '.git/**'],
      onlyFiles: false,
      dot: false,
      followSymbolicLinks: false,
    });
    const truncated = matches.length > limit;
    return {
      ok: true,
      total: matches.length,
      truncated,
      matches: matches.slice(0, limit),
    };
  }

  async function searchCode({ query, k = 8 }) {
    try {
      const res = await searchIndex(query, effective, { topK: Math.min(20, Math.max(1, k)), minScore: 0.15 });
      if (!res.ok) {
        return { ok: false, error: res.reason ?? 'index 없음 — /index 로 빌드하라고 안내할 것' };
      }
      return {
        ok: true,
        hits: res.results.map((r) => ({
          file: r.chunk.file,
          range: `${r.chunk.startLine}-${r.chunk.endLine}`,
          score: Number(r.score.toFixed(3)),
          snippet: r.chunk.text.slice(0, 1200),
        })),
      };
    } catch (err) {
      return { ok: false, error: err?.message ?? String(err) };
    }
  }

  async function writeFile({ path: p, content }) {
    const { abs, rel } = safePath(p);
    let existed = false;
    let prevContent = '';
    try {
      prevContent = await fs.readFile(abs, 'utf8');
      existed = true;
    } catch {
      /* 새 파일 */
    }
    if (existed && prevContent === content) {
      onEvent({ kind: 'write_skipped', path: rel, reason: '동일' });
      return { ok: true, path: rel, action: 'noop', reason: '내용 동일' };
    }
    await fs.mkdir(path.dirname(abs), { recursive: true });
    await fs.writeFile(abs, content, 'utf8');
    onEvent({
      kind: existed ? 'write_overwritten' : 'write_created',
      path: rel,
      lines: content.split('\n').length,
      bytes: Buffer.byteLength(content, 'utf8'),
    });
    return {
      ok: true,
      path: rel,
      action: existed ? 'overwritten' : 'created',
      lines: content.split('\n').length,
    };
  }

  async function editFile({ path: p, old_string, new_string }) {
    const { abs, rel } = safePath(p);
    let content;
    try {
      content = await fs.readFile(abs, 'utf8');
    } catch {
      return { ok: false, error: `편집할 파일이 없습니다: ${rel}` };
    }
    if (typeof old_string !== 'string' || old_string.length === 0) {
      return { ok: false, error: 'old_string 이 비어있습니다' };
    }
    // 정확 일치 횟수 계산
    let count = 0;
    let idx = 0;
    while ((idx = content.indexOf(old_string, idx)) !== -1) {
      count++;
      idx += old_string.length;
    }
    if (count === 0) {
      return { ok: false, error: `old_string 을 ${rel} 에서 찾지 못했습니다. 주변 라인을 더 포함해서 다시 시도.` };
    }
    if (count > 1) {
      return {
        ok: false,
        error: `old_string 이 ${rel} 에 ${count}번 등장합니다. 더 많은 컨텍스트로 유일해지게 만들어 주세요.`,
      };
    }
    const updated = content.replace(old_string, new_string);
    await fs.writeFile(abs, updated, 'utf8');
    onEvent({
      kind: 'edit',
      path: rel,
      removed: old_string.split('\n').length,
      added: new_string.split('\n').length,
    });
    return { ok: true, path: rel, action: 'edited' };
  }

  // ─────────── OpenAPI 툴 ───────────

  async function searchOpenApi({ query, limit = 40 }) {
    const doc = await loadOpenApiDoc();
    if (!doc) {
      return {
        ok: false,
        error:
          'OpenAPI 스펙을 불러올 수 없습니다. bc.config.json 의 api.openapi 가 올바른 JSON 스펙 URL 인지 확인하세요 ' +
          '(NestJS 는 보통 /api/docs 가 아니라 /api/docs-json).',
      };
    }
    const hits = searchEndpoints(doc, query, { limit });
    return {
      ok: true,
      query,
      count: hits.length,
      endpoints: hits.map((e) => ({
        method: e.method,
        path: e.path,
        summary: e.summary,
        tags: e.tags,
      })),
      hint:
        hits.length === 0
          ? '매치 없음. 다른 키워드로 재시도하거나, query 를 비워 전체 목록을 받아 path 를 직접 고르세요.'
          : '상세 스키마가 필요하면 get_openapi_endpoint(path, method) 를 호출하세요.',
    };
  }

  async function getOpenApiEndpoint({ path: epPath, method }) {
    const doc = await loadOpenApiDoc();
    if (!doc) {
      return { ok: false, error: 'OpenAPI 스펙을 불러올 수 없습니다.' };
    }
    return getEndpoint(doc, epPath, method);
  }

  // ─────────── Figma 툴 ───────────

  async function fetchFigma({ url, depth = 4 }) {
    try {
      const result = await fetchFigmaFromUrl({ url, effective, depth });
      if (result.kind === 'file') {
        return {
          ok: true,
          kind: 'file_summary',
          file: result.summary.name,
          pages: result.summary.pages,
          hint:
            'node-id 가 없는 파일 링크입니다. 디자이너에게 특정 frame 의 ' +
            '"Copy link to selection" 을 받아오면 더 정확한 코드 생성 가능.',
        };
      }
      const simple = simplifyFetchNodes(result.raw);
      return {
        ok: true,
        kind: 'nodes',
        fileKey: result.fileKey,
        nodeId: result.nodeId,
        documents: simple.documents,
        components: simple.components,
        styles: simple.styles,
      };
    } catch (err) {
      return { ok: false, error: err?.message ?? String(err), status: err?.status };
    }
  }

  async function fetchFigmaImage({ url, format = 'png', scale = 2, savePath }) {
    try {
      const parsed = parseFigmaUrl(url);
      if (!parsed?.nodeId) {
        return { ok: false, error: 'node-id 가 있는 frame 링크가 필요합니다.' };
      }
      const images = await fetchFigmaImageUrls({
        fileKey: parsed.fileKey,
        nodeIds: [parsed.nodeId],
        format,
        scale,
        effective,
      });
      const imageUrl = images[parsed.nodeId];
      if (!imageUrl) {
        return { ok: false, error: 'Figma 가 이미지 URL 을 돌려주지 않음' };
      }
      if (savePath) {
        const { abs, rel } = safePath(savePath);
        const res = await fetch(imageUrl);
        const buf = Buffer.from(await res.arrayBuffer());
        await fs.mkdir(path.dirname(abs), { recursive: true });
        await fs.writeFile(abs, buf);
        onEvent({ kind: 'write_created', path: rel, bytes: buf.byteLength });
        return { ok: true, savedTo: rel, bytes: buf.byteLength, format };
      }
      return { ok: true, url: imageUrl, format, expiresInSeconds: 60 * 60 * 24 * 14 };
    } catch (err) {
      return { ok: false, error: err?.message ?? String(err) };
    }
  }

  async function fetchFigmaStylesTool({ url }) {
    try {
      const parsed = parseFigmaUrl(url);
      if (!parsed) return { ok: false, error: 'Figma URL 형식이 아닙니다.' };
      const styles = await fetchFigmaStyles({ fileKey: parsed.fileKey, effective });
      // 모델이 디자인 토큰을 만들 때 쓸 수 있도록 styleType 별로 그룹.
      const grouped = {};
      for (const s of styles) {
        const t = s.style_type ?? s.styleType ?? 'OTHER';
        (grouped[t] ??= []).push({
          name: s.name,
          description: s.description ?? '',
          key: s.key,
          nodeId: s.node_id ?? s.nodeId,
        });
      }
      return { ok: true, fileKey: parsed.fileKey, total: styles.length, grouped };
    } catch (err) {
      return { ok: false, error: err?.message ?? String(err) };
    }
  }

  return {
    read_file: tool({
      description:
        '프로젝트 안의 파일이나 디렉터리 내용을 읽는다. 코드 짜기 전에 반드시 기존 코드 컨벤션을 먼저 읽어볼 것.',
      inputSchema: jsonSchema({
        type: 'object',
        properties: { path: { type: 'string', description: '프로젝트 루트 기준 상대 경로' } },
        required: ['path'],
        additionalProperties: false,
      }),
      execute: readFile,
    }),
    list_files: tool({
      description:
        '글롭 패턴으로 파일을 나열. 폴더 구조 파악, 비슷한 모듈 위치 찾기에 사용. 예: "src/api/**/*.ts"',
      inputSchema: jsonSchema({
        type: 'object',
        properties: {
          pattern: { type: 'string', default: '**/*' },
          limit: { type: 'number', default: 100 },
        },
        additionalProperties: false,
      }),
      execute: listFiles,
    }),
    search_code: tool({
      description:
        '코드베이스를 의미 기반(임베딩)으로 검색. "fetch 래퍼 패턴", "useQuery hook 컨벤션" 같이 자연어로 찾기. 인덱스가 없으면 에러.',
      inputSchema: jsonSchema({
        type: 'object',
        properties: {
          query: { type: 'string' },
          k: { type: 'number', default: 8 },
        },
        required: ['query'],
        additionalProperties: false,
      }),
      execute: searchCode,
    }),
    search_openapi: tool({
      description:
        '연결된 OpenAPI(Swagger) 스펙에서 엔드포인트를 검색한다. path 일부("admin/inquiries"), ' +
        '한글 summary("문의"), tag, operationId 어느 걸로도 검색 가능. ' +
        'API 코드를 짜기 전에 반드시 이 툴로 정확한 경로/메서드를 먼저 확인할 것. ' +
        '시스템 프롬프트의 요약은 잘려 있을 수 있으므로 "엔드포인트가 안 보인다" 싶으면 이 툴로 찾는다.',
      inputSchema: jsonSchema({
        type: 'object',
        properties: {
          query: { type: 'string', description: '검색어 (path 일부/summary/tag). 비우면 전체 목록' },
          limit: { type: 'number', default: 40 },
        },
        additionalProperties: false,
      }),
      execute: searchOpenApi,
    }),
    get_openapi_endpoint: tool({
      description:
        '특정 엔드포인트의 상세(parameters / requestBody / responses 스키마, $ref 인라인됨) 를 가져온다. ' +
        'search_openapi 로 찾은 정확한 path 와 method 를 넘긴다. 이 결과로 zod 스키마/타입/요청 함수를 정확히 생성.',
      inputSchema: jsonSchema({
        type: 'object',
        properties: {
          path: { type: 'string', description: '정확한 경로. 예: /api/admin/inquiries' },
          method: {
            type: 'string',
            description: 'GET/POST/... 생략 시 해당 path 의 모든 메서드',
          },
        },
        required: ['path'],
        additionalProperties: false,
      }),
      execute: getOpenApiEndpoint,
    }),
    write_file: tool({
      description:
        '새 파일을 만들거나 기존 파일을 통째로 덮어쓴다. 새 파일을 만들기 전에 반드시 1) 비슷한 기존 파일을 read_file 로 보고 2) 같은 폴더 컨벤션(barrel 파일, 네이밍, import 순서) 을 따른다.',
      inputSchema: jsonSchema({
        type: 'object',
        properties: {
          path: { type: 'string' },
          content: { type: 'string' },
        },
        required: ['path', 'content'],
        additionalProperties: false,
      }),
      execute: writeFile,
    }),
    edit_file: tool({
      description:
        '기존 파일에서 old_string 을 찾아 new_string 으로 정확히 1번 치환. old_string 은 파일 안에서 유일해지도록 충분한 컨텍스트(앞뒤 줄) 를 포함시킬 것. 여러 번 등장하면 에러로 거부.',
      inputSchema: jsonSchema({
        type: 'object',
        properties: {
          path: { type: 'string' },
          old_string: { type: 'string' },
          new_string: { type: 'string' },
        },
        required: ['path', 'old_string', 'new_string'],
        additionalProperties: false,
      }),
      execute: editFile,
    }),
    fetch_figma: tool({
      description:
        'Figma 노드 트리(컴포넌트/프레임/페이지) 를 읽는다. URL 에 node-id 가 있으면 그 frame 의 ' +
        '간소화된 디자인 정보(autoLayout, fills, text, size, children 등) 를 반환. ' +
        '없으면 파일 페이지 목록만. 컴포넌트/페이지 생성 요청을 받으면 이 툴을 먼저 호출해서 ' +
        '디자인 의도를 학습한 뒤 코드를 짠다.',
      inputSchema: jsonSchema({
        type: 'object',
        properties: {
          url: { type: 'string', description: 'Figma share/copy link' },
          depth: { type: 'number', default: 4, description: '노드 트리 탐색 깊이 (1-8)' },
        },
        required: ['url'],
        additionalProperties: false,
      }),
      execute: fetchFigma,
    }),
    fetch_figma_image: tool({
      description:
        'Figma 프레임을 PNG/JPG/SVG 이미지로 export. savePath 를 주면 프로젝트 폴더 안에 파일로 저장 ' +
        '(스토리북 배경, public asset 등). 안 주면 임시 URL 만 반환.',
      inputSchema: jsonSchema({
        type: 'object',
        properties: {
          url: { type: 'string' },
          format: { type: 'string', enum: ['png', 'jpg', 'svg', 'pdf'], default: 'png' },
          scale: { type: 'number', default: 2 },
          savePath: { type: 'string' },
        },
        required: ['url'],
        additionalProperties: false,
      }),
      execute: fetchFigmaImage,
    }),
    fetch_figma_styles: tool({
      description:
        'Figma 파일의 로컬 스타일(컬러/타이포/이펙트 토큰) 목록을 가져온다. 디자인 토큰 추출 / ' +
        'Tailwind 테마 설정 / theme.ts 생성 시 사용.',
      inputSchema: jsonSchema({
        type: 'object',
        properties: { url: { type: 'string' } },
        required: ['url'],
        additionalProperties: false,
      }),
      execute: fetchFigmaStylesTool,
    }),
  };
}
