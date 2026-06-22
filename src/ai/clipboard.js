import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

/**
 * macOS 클립보드의 이미지(스크린샷 등)를 임시 PNG 로 떨궈 절대경로를 돌려준다.
 *
 * 터미널 앱은 Cmd+V 로 "이미지 바이트" 를 받지 못한다 (텍스트만 받음). 그래서
 * 클립보드 이미지를 붙이려면 OS 클립보드를 직접 읽는 외부 도구가 필요하다.
 *   - macOS: `pngpaste` (brew install pngpaste)
 *
 * 다른 OS 거나 도구가 없으면 도움이 되는 에러로 throw.
 */
export async function pasteClipboardImage() {
  if (process.platform !== 'darwin') {
    throw new Error(
      '클립보드 이미지 붙여넣기는 현재 macOS 만 지원합니다. 다른 OS 에서는 파일로 저장하고 /image <경로> 를 쓰세요.',
    );
  }

  const checkOk = await new Promise((resolve) => {
    const p = spawn('which', ['pngpaste']);
    p.on('close', (code) => resolve(code === 0));
    p.on('error', () => resolve(false));
  });
  if (!checkOk) {
    throw new Error(
      'pngpaste 가 필요합니다. 설치: `brew install pngpaste`  (Homebrew 가 없으면 https://brew.sh)',
    );
  }

  const tmp = path.join(os.tmpdir(), `bc-paste-${Date.now()}.png`);
  await new Promise((resolve, reject) => {
    const p = spawn('pngpaste', [tmp]);
    let stderr = '';
    p.stderr.on('data', (d) => (stderr += d.toString()));
    p.on('close', (code) => {
      if (code === 0) resolve();
      else
        reject(
          new Error(
            '클립보드에 이미지가 없거나 읽을 수 없습니다.' +
              (stderr ? ' (' + stderr.trim() + ')' : ''),
          ),
        );
    });
    p.on('error', (e) => reject(e));
  });

  const stat = await fs.stat(tmp);
  if (!stat.isFile() || stat.size === 0) {
    throw new Error('클립보드 이미지 저장 실패 (파일이 비어있음).');
  }
  return tmp;
}

/**
 * 드래그&드롭 / 붙여넣기로 들어온 경로 문자열을 정리한다.
 * - 앞뒤 따옴표 제거
 * - 백슬래시 이스케이프(`\ `) 제거
 * - 양끝 공백 제거
 */
export function cleanDroppedPath(raw) {
  if (!raw) return '';
  let s = raw.trim();
  if (
    (s.startsWith("'") && s.endsWith("'")) ||
    (s.startsWith('"') && s.endsWith('"'))
  ) {
    s = s.slice(1, -1);
  }
  s = s.replace(/\\ /g, ' ');
  return s.trim();
}
