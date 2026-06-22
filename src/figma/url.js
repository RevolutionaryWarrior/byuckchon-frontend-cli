/**
 * Figma URL/링크 파서.
 *
 * 지원하는 URL 형태:
 *   https://www.figma.com/file/{fileKey}/...                     (구버전 share link)
 *   https://www.figma.com/design/{fileKey}/...                   (신버전, 2023+)
 *   https://www.figma.com/proto/{fileKey}/...                    (프로토타입)
 *   ...?node-id=123-456    또는  ...?node-id=123%3A456           (특정 노드)
 *
 * Figma 내부 노드 ID 는 "123:456" 인데 URL 에서는 보통 "123-456" 또는 인코딩됨.
 * API 호출 시엔 "123:456" 으로 다시 변환해야 함.
 */

const URL_RE = /figma\.com\/(?:file|design|proto)\/([A-Za-z0-9]+)/;

export function parseFigmaUrl(input) {
  if (!input || typeof input !== 'string') return null;
  const m = input.match(URL_RE);
  if (!m) return null;
  const fileKey = m[1];

  // node-id 추출
  let nodeId = null;
  try {
    const u = new URL(input);
    const raw = u.searchParams.get('node-id');
    if (raw) {
      // "123-456" → "123:456",  "123%3A456" → "123:456"
      nodeId = decodeURIComponent(raw).replace(/-/g, ':');
    }
  } catch {
    /* not a valid URL — fileKey 만 있으면 그것대로 ok */
  }

  return { fileKey, nodeId };
}

/** 디자이너가 도면에서 "Copy link" 한 결과인지 (= node-id 있음) */
export function hasNode(parsed) {
  return !!parsed?.nodeId;
}
