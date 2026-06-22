import fs from 'node:fs/promises';
import path from 'node:path';

/**
 * 터미널 인라인 이미지 프리뷰.
 *
 * 일반 터미널은 이미지를 못 그린다. 하지만 일부는 자체 프로토콜이 있다:
 *   - iTerm2  : OSC 1337 ; File=... (base64) BEL
 *   - kitty   : APC _G ... ST  (kitty graphics protocol)
 *   - WezTerm : iTerm2 프로토콜 호환
 *
 * 지원되면 작은 썸네일을 직접 stdout 에 그려준다. 안 되면 false 반환 → 호출측에서
 * 파일명/용량만 텍스트로 표시.
 *
 * ⚠️ ink TUI 안에서는 re-render 가 escape 시퀀스를 덮어쓰므로 쓰지 않는다.
 *    readline(plain) 모드처럼 stdout 을 직접 쓰는 곳에서만 사용.
 */
export function detectInlineImageSupport() {
  const term = process.env.TERM ?? '';
  const prog = process.env.TERM_PROGRAM ?? '';
  if (prog === 'iTerm.app' || prog === 'WezTerm') return 'iterm2';
  if (term.includes('kitty') || process.env.KITTY_WINDOW_ID) return 'kitty';
  return null;
}

const ESC = '\u001B';
const BEL = '\u0007';

/** iTerm2 inline image. heightCells 만큼만 차지하도록 제한해 작은 썸네일로. */
function itermInline(base64, { heightCells = 6 } = {}) {
  const args = [
    'inline=1',
    `height=${heightCells}`,
    'preserveAspectRatio=1',
  ].join(';');
  return `${ESC}]1337;File=${args}:${base64}${BEL}`;
}

/** kitty graphics — 한 번에 전송(a=T), 직접 표시. */
function kittyInline(base64) {
  // kitty 는 4096 바이트 청크로 쪼개야 한다.
  const CHUNK = 4096;
  let out = '';
  let first = true;
  for (let i = 0; i < base64.length; i += CHUNK) {
    const piece = base64.slice(i, i + CHUNK);
    const more = i + CHUNK < base64.length ? 1 : 0;
    if (first) {
      out += `${ESC}_Ga=T,f=100,m=${more};${piece}${ESC}\\`;
      first = false;
    } else {
      out += `${ESC}_Gm=${more};${piece}${ESC}\\`;
    }
  }
  return out;
}

/**
 * 이미지 파일을 작은 썸네일로 터미널에 그린다.
 * @returns {Promise<boolean>} 그렸으면 true, 미지원이면 false
 */
export async function printInlineThumbnail(filePath, { heightCells = 6 } = {}) {
  const kind = detectInlineImageSupport();
  if (!kind) return false;
  try {
    const buf = await fs.readFile(path.resolve(filePath));
    // 너무 크면 프리뷰 스킵 (전송 비용). 2MB 초과면 패스.
    if (buf.byteLength > 2 * 1024 * 1024) return false;
    const base64 = buf.toString('base64');
    if (kind === 'iterm2') {
      process.stdout.write('  ' + itermInline(base64, { heightCells }) + '\n');
    } else if (kind === 'kitty') {
      process.stdout.write('  ' + kittyInline(base64) + '\n');
    }
    return true;
  } catch {
    return false;
  }
}
