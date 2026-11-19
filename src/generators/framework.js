/**
 * 프레임워크 구분.
 *
 * - react    : Vite + React
 * - next     : Next.js (App Router)
 * - electron : Vite + React 렌더러(src/) + Electron 메인 · preload(electron/)
 *
 * Electron 의 렌더러는 React 템플릿과 같다. 폴더 구조 · 린트 · tsconfig · API 컨벤션을
 * 그대로 쓰고, electron/ 과 패키징 설정만 더한다.
 */

/** Vite + React 렌더러를 쓰는가 (React, Electron) */
export const isViteReact = (framework) =>
  framework === 'react' || framework === 'electron';

export const isElectron = (framework) => framework === 'electron';

/** Electron 빌드 결과 · 설치 파일 폴더. gitignore · eslint · prettier 에서 뺀다. */
export const ELECTRON_OUTPUT_DIRS = ['dist-electron', 'release'];
