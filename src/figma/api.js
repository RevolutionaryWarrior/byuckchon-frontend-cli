import { parseFigmaUrl } from './url.js';

/**
 * Figma REST API 클라이언트.
 *
 * 인증: Personal Access Token 을 `X-Figma-Token` 헤더로 보냄.
 * 토큰은 https://www.figma.com/settings 에서 "Personal access tokens" 로 발급.
 *
 * effective.figmaToken (또는 process.env[figmaTokenEnv]) 에서 키를 가져옴.
 */
const BASE = 'https://api.figma.com/v1';

export class FigmaError extends Error {
  constructor(message, { status, body } = {}) {
    super(message);
    this.status = status;
    this.body = body;
  }
}

function tokenFromEnv(effective) {
  // 1) bc.config.json design.figmaTokenEnv 로 지정한 환경변수
  const envName = effective?.design?.figmaTokenEnv ?? 'FIGMA_TOKEN';
  return process.env[envName] ?? process.env.FIGMA_TOKEN ?? null;
}

async function call(pathAndQuery, { token }) {
  if (!token) {
    throw new FigmaError(
      'Figma 토큰이 없습니다. https://www.figma.com/settings 에서 Personal access token 을 발급받고 ' +
        '`.env` 에 `FIGMA_TOKEN=figd_...` 로 등록하세요.',
    );
  }
  const res = await fetch(BASE + pathAndQuery, {
    headers: { 'X-Figma-Token': token },
  });
  if (!res.ok) {
    let body = null;
    try {
      body = await res.text();
    } catch {
      /* noop */
    }
    throw new FigmaError(`Figma API ${res.status} ${res.statusText}: ${pathAndQuery}`, {
      status: res.status,
      body,
    });
  }
  return res.json();
}

/** 파일의 상위 메타 (페이지 목록만 — 노드 트리는 안 가져옴). */
export async function fetchFileSummary({ fileKey, effective }) {
  const token = tokenFromEnv(effective);
  const data = await call(`/files/${fileKey}?depth=1`, { token });
  return {
    fileKey,
    name: data.name,
    lastModified: data.lastModified,
    pages:
      data.document?.children?.map((c) => ({
        id: c.id,
        name: c.name,
        type: c.type,
      })) ?? [],
  };
}

/** 특정 노드들의 상세 트리를 가져옴 (가장 자주 쓰는 API). */
export async function fetchNodes({ fileKey, nodeIds, effective, depth }) {
  const token = tokenFromEnv(effective);
  const ids = (Array.isArray(nodeIds) ? nodeIds : [nodeIds])
    .filter(Boolean)
    .map(encodeURIComponent)
    .join(',');
  const depthQ = depth ? `&depth=${depth}` : '';
  const data = await call(`/files/${fileKey}/nodes?ids=${ids}${depthQ}`, { token });
  return data;
}

/** 노드를 이미지(PNG/JPG/SVG)로 export 하는 임시 URL 을 받아옴 */
export async function fetchImageUrls({ fileKey, nodeIds, format = 'png', scale = 2, effective }) {
  const token = tokenFromEnv(effective);
  const ids = nodeIds.map(encodeURIComponent).join(',');
  const data = await call(
    `/images/${fileKey}?ids=${ids}&format=${format}&scale=${scale}`,
    { token },
  );
  // 응답: { images: { "1:2": "https://...", ... } }
  return data.images ?? {};
}

/** 파일에 정의된 로컬 스타일 (color/typography/effect/grid) */
export async function fetchStyles({ fileKey, effective }) {
  const token = tokenFromEnv(effective);
  const data = await call(`/files/${fileKey}/styles`, { token });
  return data.meta?.styles ?? data.styles ?? [];
}

/** URL 한 줄로 시작하는 헬퍼 — chat 의 툴에서 가장 흔히 쓰임. */
export async function fetchFromUrl({ url, effective, depth }) {
  const parsed = parseFigmaUrl(url);
  if (!parsed) {
    throw new FigmaError(`Figma URL 형식이 아닙니다: ${url}`);
  }
  if (!parsed.nodeId) {
    // node-id 없으면 파일 요약만
    return { kind: 'file', summary: await fetchFileSummary({ fileKey: parsed.fileKey, effective }) };
  }
  const data = await fetchNodes({
    fileKey: parsed.fileKey,
    nodeIds: [parsed.nodeId],
    effective,
    depth,
  });
  return { kind: 'nodes', fileKey: parsed.fileKey, nodeId: parsed.nodeId, raw: data };
}
