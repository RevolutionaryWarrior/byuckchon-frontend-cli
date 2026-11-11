import fs from 'node:fs/promises';
import path from 'node:path';

/**
 * 라이트/다크 테마.
 *
 * tokens.css 는 settings 의 defineTokenConfig({ themes }) 가 만든다.
 *   @theme { --color-bg-default: var(--color-gray-100); }
 *   [data-theme="dark"] { --color-bg-default: var(--color-gray-900); }
 *
 * 그래서 프로젝트가 할 일은 <html data-theme="…"> 하나를 관리하는 것뿐이다.
 *   - <head> 인라인 스크립트: 첫 페인트 전에 data-theme 을 붙여 깜빡임을 막는다.
 *   - src/lib/theme/useTheme.ts: 화면에서 읽고 바꾸는 훅.
 * 두 곳이 같은 localStorage 키를 써야 하므로 여기서 함께 관리한다.
 */

export const THEME_STORAGE_KEY = 'theme';

/**
 * <head> 에 그대로 넣는 스크립트. React 가 뜨기 전에 실행되어야 하므로 한 줄짜리 순수 JS 다.
 * 저장된 값 → 없으면 OS 설정(prefers-color-scheme) 순으로 고른다.
 */
export const THEME_INIT_SCRIPT =
  `(function(){try{var t=localStorage.getItem('${THEME_STORAGE_KEY}');` +
  `if(t!=='light'&&t!=='dark')t=matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light';` +
  `var r=document.documentElement;r.dataset.theme=t;r.style.colorScheme=t;}catch(e){}})();`;

function useThemeSource(framework) {
  const directive = framework === 'next' ? "'use client';\n\n" : '';

  return `${directive}import { useCallback, useSyncExternalStore } from 'react';

/**
 * 라이트/다크 테마를 읽고 바꾼다.
 *
 *   const { theme, setTheme } = useTheme();
 *   setTheme('dark');    // 고정
 *   setTheme('system');  // 저장값을 지우고 OS 설정을 따른다
 *
 * 상태는 <html data-theme> 하나뿐이다. 첫 값은 <head> 인라인 스크립트가 붙여두고,
 * 색은 tokens.css 의 [data-theme="dark"] 블록이 바꾼다. (화면에서 dark: 를 쓰지 않는다)
 * localStorage 키는 인라인 스크립트와 같아야 한다.
 */

export type Theme = 'light' | 'dark';

const STORAGE_KEY = '${THEME_STORAGE_KEY}';
const DARK_QUERY = '(prefers-color-scheme: dark)';

function storedTheme(): Theme | null {
  try {
    const value = localStorage.getItem(STORAGE_KEY);
    return value === 'light' || value === 'dark' ? value : null;
  } catch {
    return null;
  }
}

function systemTheme(): Theme {
  return window.matchMedia(DARK_QUERY).matches ? 'dark' : 'light';
}

function applyTheme(theme: Theme) {
  const root = document.documentElement;
  root.dataset.theme = theme;
  root.style.colorScheme = theme;
}

function subscribe(onChange: () => void) {
  const root = document.documentElement;
  const media = window.matchMedia(DARK_QUERY);

  // 어느 컴포넌트에서 바꾸든 data-theme 변경으로 모두 다시 그린다.
  const observer = new MutationObserver(onChange);
  observer.observe(root, { attributes: true, attributeFilter: ['data-theme'] });

  // 사용자가 고른 적이 없으면 OS 설정 변경을 따라간다.
  const onSystemChange = () => {
    if (!storedTheme()) applyTheme(systemTheme());
  };
  // 다른 탭에서 바꾼 값도 맞춘다.
  const onStorage = (event: StorageEvent) => {
    if (event.key === STORAGE_KEY) applyTheme(storedTheme() ?? systemTheme());
  };

  media.addEventListener('change', onSystemChange);
  window.addEventListener('storage', onStorage);
  return () => {
    observer.disconnect();
    media.removeEventListener('change', onSystemChange);
    window.removeEventListener('storage', onStorage);
  };
}

function getSnapshot(): Theme {
  return document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light';
}

// 서버에서는 알 수 없으므로 light 로 그리고, hydration 직후 실제 값으로 다시 그린다.
function getServerSnapshot(): Theme {
  return 'light';
}

export function useTheme() {
  const theme = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  const setTheme = useCallback((next: Theme | 'system') => {
    try {
      if (next === 'system') localStorage.removeItem(STORAGE_KEY);
      else localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // 저장이 막힌 환경(시크릿 모드 등)에서도 현재 화면에는 적용한다.
    }
    applyTheme(next === 'system' ? systemTheme() : next);
  }, []);

  return { theme, setTheme };
}
`;
}

/** src/lib/theme/ 를 만든다. */
export async function createThemeFiles(rootDir, framework) {
  const dir = path.join(rootDir, 'src/lib/theme');
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(dir, 'useTheme.ts'), useThemeSource(framework), 'utf-8');
  await fs.writeFile(
    path.join(dir, 'index.ts'),
    "export { useTheme, type Theme } from './useTheme';\n",
    'utf-8',
  );
}
