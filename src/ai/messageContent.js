import fs from 'node:fs/promises';
import path from 'node:path';

const IMAGE_EXT_TO_MIME = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
};

export function isImagePath(p) {
  if (!p) return false;
  return Object.keys(IMAGE_EXT_TO_MIME).includes(path.extname(p).toLowerCase());
}

/**
 * 파일 경로 → AI SDK 가 받는 image content part 로 변환.
 *
 * AI SDK v6 의 multi-modal 메시지 형식:
 *   { role: 'user', content: [
 *       { type: 'text', text: '...' },
 *       { type: 'image', image: <Buffer|base64-data-url|URL> },
 *   ]}
 *
 * Buffer 로 넘기면 SDK 가 알아서 base64 + mime 처리해 준다.
 */
export async function imagePartFromFile(filePath) {
  const abs = path.resolve(filePath);
  const stat = await fs.stat(abs);
  if (!stat.isFile()) {
    const e = new Error(`이미지 파일이 아닙니다: ${filePath}`);
    e.code = 'BC_NOT_A_FILE';
    throw e;
  }
  if (!isImagePath(abs)) {
    const e = new Error(
      `지원 안 하는 확장자: ${path.extname(abs)} (png, jpg, jpeg, gif, webp 만)`,
    );
    e.code = 'BC_UNSUPPORTED_IMAGE';
    throw e;
  }
  const buf = await fs.readFile(abs);
  return {
    type: 'image',
    image: buf,
    // SDK 가 mediaType 을 추론해주기는 하지만 명시적으로 박아둔다.
    mediaType: IMAGE_EXT_TO_MIME[path.extname(abs).toLowerCase()],
  };
}

/**
 * UI 가 들고 있는 단순한 메시지 형태:
 *   { role, text, attachments: [{ kind:'image', path, sizeKb }] }
 * 를 AI SDK 가 받는 messages 배열로 변환한다.
 *
 * 반드시 거르는 것들 (이걸 안 거르면 SDK 가 ModelMessage[] 스키마 위반으로 거절한다):
 *   - 'system-info' / 'system-error' 같은 UI 전용 role (e.g. /help, /clear, 에러 표시)
 *   - 비어있는 assistant 메시지 (스트리밍 중단, 에러 등으로 텍스트가 한 글자도 없는 경우)
 *   - 비어있고 첨부도 없는 user 메시지 (방어적 — 정상 입력에선 일어나지 않음)
 */
export async function toSdkMessages(uiMessages) {
  const out = [];
  for (const m of uiMessages) {
    if (m.role !== 'user' && m.role !== 'assistant') continue; // UI 전용 role 제거
    if (m.role === 'assistant' && !m.text?.trim()) continue;   // 빈/실패 응답 제거

    if (m.role === 'user' && m.attachments?.length) {
      const parts = [];
      if (m.text) parts.push({ type: 'text', text: m.text });
      for (const att of m.attachments) {
        if (att.kind === 'image') {
          parts.push(await imagePartFromFile(att.path));
        }
      }
      if (parts.length === 0) continue;
      out.push({ role: 'user', content: parts });
    } else {
      if (m.role === 'user' && !m.text?.trim()) continue;
      out.push({ role: m.role, content: m.text ?? '' });
    }
  }
  return out;
}
