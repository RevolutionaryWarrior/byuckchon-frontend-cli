import fs from 'fs/promises';
import path from 'path';

/**
 * React 폴더 구조
 * lib → store → api → hooks → context → components → layout → page
 * assets는 모든 레이어에서 참조 가능
 */
const REACT_FOLDERS = [
  'public',
  'src/assets',
  'src/assets/icons',
  'src/assets/images',
  'src/lib',
  'src/store',
  'src/api',
  'src/hooks',
  'src/context',
  'src/components',
  'src/layout',
  'src/page',
];

/**
 * Next.js App Router 폴더 구조
 */
const NEXT_FOLDERS = [
  'public',
  'src/app',
  'src/assets',
  'src/assets/common',
  'src/assets/pages',
  'src/components',
  'src/constant',
  'src/hooks',
  'src/lib',
  'src/providers',
];

async function writeFile(filePath, content) {
  await fs.writeFile(filePath, content, 'utf-8');
}

export async function createFolders(rootDir, config) {
  const folders =
    config.framework === 'react' ? REACT_FOLDERS : NEXT_FOLDERS;

  for (const folder of folders) {
    await fs.mkdir(path.join(rootDir, folder), { recursive: true });
  }

  // 각 레이어에 placeholder 파일 생성
  await writeFile(path.join(rootDir, 'src/lib/index.ts'), '// 유틸리티 함수, 상수, 헬퍼\n');
  await writeFile(path.join(rootDir, 'src/hooks/index.ts'), '// 커스텀 훅\n');
  await writeFile(path.join(rootDir, 'src/components/index.ts'), '// 재사용 가능한 UI 컴포넌트\n');

  if (config.framework === 'react') {
    await writeFile(path.join(rootDir, 'src/store/index.ts'), '// Zustand 스토어\n');
    await writeFile(path.join(rootDir, 'src/api/index.ts'), '// Axios API 호출\n');
    await writeFile(path.join(rootDir, 'src/context/index.tsx'), '// React Context\n');
    await writeFile(path.join(rootDir, 'src/layout/index.tsx'), '// 레이아웃 컴포넌트\n');
    await writeFile(path.join(rootDir, 'src/page/index.tsx'), '// 페이지 컴포넌트\n');
  } else {
    await writeFile(path.join(rootDir, 'src/constant/index.ts'), '// 상수 정의\n');
    await writeFile(path.join(rootDir, 'src/providers/index.tsx'), '// 전역 Provider\n');
  }
}
