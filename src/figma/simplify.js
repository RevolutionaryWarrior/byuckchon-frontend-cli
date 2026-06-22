/**
 * Figma 노드 트리를 LLM 이 읽기 좋게 압축한다.
 *
 * Figma 원 응답은 노드 하나에 수십 KB 도 흔하다. 그대로 모델에 넣으면 토큰이 폭발하고
 * 모델도 중요한 게 뭔지 못 찾는다. 다음 정보만 남긴다:
 *   - 이름 (= 디자이너의 의도. 컴포넌트/페이지 명명 규칙)
 *   - 타입 (FRAME, COMPONENT, INSTANCE, TEXT, RECTANGLE, ...)
 *   - 위치/크기 (필요한 경우만)
 *   - autoLayout (있으면 flex/gap 변환에 핵심)
 *   - fills (색)
 *   - strokes
 *   - effects (shadow)
 *   - text 의 경우 글자 + 폰트 사양
 *   - cornerRadius, padding 같은 자주 쓰는 박스 속성
 *   - 자식들 (재귀)
 *
 * 모델은 이 압축본을 받아서 React/Tailwind/styled JSX 를 생성한다.
 */

const MAX_CHILDREN = 60;
const MAX_DEPTH = 8;

function pickColor(paint) {
  if (!paint || paint.visible === false) return null;
  if (paint.type === 'SOLID' && paint.color) {
    const { r, g, b } = paint.color;
    const a = paint.opacity ?? paint.color.a ?? 1;
    return {
      type: 'solid',
      rgba: `rgba(${Math.round(r * 255)}, ${Math.round(g * 255)}, ${Math.round(b * 255)}, ${Number(a.toFixed(3))})`,
    };
  }
  if (paint.type?.startsWith('GRADIENT')) {
    return {
      type: 'gradient',
      kind: paint.type,
      stops:
        paint.gradientStops?.map((s) => ({
          position: s.position,
          rgba:
            s.color &&
            `rgba(${Math.round(s.color.r * 255)}, ${Math.round(s.color.g * 255)}, ${Math.round(s.color.b * 255)}, ${Number((s.color.a ?? 1).toFixed(3))})`,
        })) ?? [],
    };
  }
  if (paint.type === 'IMAGE') {
    return { type: 'image', scaleMode: paint.scaleMode };
  }
  return null;
}

function describeAutoLayout(node) {
  if (!node.layoutMode || node.layoutMode === 'NONE') return null;
  return {
    direction: node.layoutMode === 'HORIZONTAL' ? 'row' : 'column',
    gap: node.itemSpacing ?? 0,
    padding: {
      top: node.paddingTop ?? 0,
      right: node.paddingRight ?? 0,
      bottom: node.paddingBottom ?? 0,
      left: node.paddingLeft ?? 0,
    },
    alignItems: node.counterAxisAlignItems,
    justifyContent: node.primaryAxisAlignItems,
    wrap: node.layoutWrap === 'WRAP',
  };
}

function describeText(node) {
  if (node.type !== 'TEXT') return null;
  const s = node.style ?? {};
  return {
    characters: node.characters ?? '',
    fontFamily: s.fontFamily,
    fontSize: s.fontSize,
    fontWeight: s.fontWeight,
    lineHeight: s.lineHeightPx,
    letterSpacing: s.letterSpacing,
    textAlign: s.textAlignHorizontal?.toLowerCase(),
  };
}

function simplifyNode(node, depth = 0) {
  if (!node) return null;
  const out = {
    id: node.id,
    name: node.name,
    type: node.type,
  };

  if (node.absoluteBoundingBox) {
    out.size = {
      w: Math.round(node.absoluteBoundingBox.width),
      h: Math.round(node.absoluteBoundingBox.height),
    };
  }

  const auto = describeAutoLayout(node);
  if (auto) out.autoLayout = auto;

  if (node.fills?.length) {
    const fills = node.fills.map(pickColor).filter(Boolean);
    if (fills.length) out.fills = fills;
  }
  if (node.strokes?.length) {
    const strokes = node.strokes.map(pickColor).filter(Boolean);
    if (strokes.length) {
      out.strokes = strokes;
      out.strokeWeight = node.strokeWeight;
    }
  }
  if (node.cornerRadius != null) out.cornerRadius = node.cornerRadius;
  if (node.rectangleCornerRadii) out.cornerRadii = node.rectangleCornerRadii;
  if (node.effects?.length) {
    out.effects = node.effects.map((e) => ({
      type: e.type,
      radius: e.radius,
      offset: e.offset,
      color: e.color &&
        `rgba(${Math.round(e.color.r * 255)}, ${Math.round(e.color.g * 255)}, ${Math.round(e.color.b * 255)}, ${Number((e.color.a ?? 1).toFixed(3))})`,
    }));
  }
  if (node.opacity != null && node.opacity < 1) out.opacity = node.opacity;

  const text = describeText(node);
  if (text) out.text = text;

  // Component / Instance — 디자인 시스템의 신호. AI 가 재사용 결정하는 단서.
  if (node.type === 'INSTANCE' && node.componentId) {
    out.componentRef = node.componentId;
  }

  if (node.children?.length && depth < MAX_DEPTH) {
    const kids = node.children.slice(0, MAX_CHILDREN);
    const truncated = node.children.length > MAX_CHILDREN;
    out.children = kids
      .map((c) => simplifyNode(c, depth + 1))
      .filter(Boolean);
    if (truncated) out.childrenTruncated = node.children.length - MAX_CHILDREN;
  }

  return out;
}

/**
 * Figma `fetchNodes` 응답을 받아서 LLM 친화적으로 압축.
 *
 * @param {object} fetchNodesResponse - Figma API `/v1/files/.../nodes` 결과
 * @returns {{ documents: Array<simpleNode>, components: Record, styles: Record }}
 */
export function simplifyFetchNodes(fetchNodesResponse) {
  const out = { documents: [], components: {}, styles: {} };
  const nodes = fetchNodesResponse?.nodes ?? {};
  for (const [id, payload] of Object.entries(nodes)) {
    if (!payload?.document) continue;
    out.documents.push({
      requestedId: id,
      ...simplifyNode(payload.document, 0),
    });
    if (payload.components) {
      Object.assign(out.components, payload.components);
    }
    if (payload.styles) {
      Object.assign(out.styles, payload.styles);
    }
  }
  return out;
}

/** 사람 눈으로 보기 좋은 한 줄 요약 (디버깅/UI 표시용) */
export function quickSummary(simple) {
  if (!simple) return '';
  const parts = [simple.name + ' [' + simple.type + ']'];
  if (simple.size) parts.push(`${simple.size.w}×${simple.size.h}`);
  if (simple.autoLayout) parts.push('auto-' + simple.autoLayout.direction);
  if (simple.children?.length) parts.push(`children=${simple.children.length}`);
  return parts.join(' · ');
}

export { simplifyNode };
