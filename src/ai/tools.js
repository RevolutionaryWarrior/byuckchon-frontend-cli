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
export function buildTools({ projectRoot, effective, onEvent = () => {} }) {
  const root = path.resolve(projectRoot);

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
