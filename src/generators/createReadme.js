import fs from 'fs/promises';
import path from 'path';

export async function createReadme(rootDir, config) {
  const isReact = config.framework === 'react';

  const content = `# ${config.projectName}

## 기술 스택

| 항목 | 내용 |
|------|------|
| Framework | ${isReact ? 'React 19' : 'Next.js 15 (App Router)'} |
| Language | TypeScript |
| Build Tool | ${isReact ? 'Vite' : 'Next.js built-in'} |
| Styling | Tailwind CSS |
| State | Zustand |
| HTTP | Axios |
| Lint | ESLint + Prettier |

## 시작하기

\`\`\`bash
# 의존성 설치
npm install

# 개발 서버 실행
npm run dev

# 프로덕션 빌드
npm run build

# 코드 포맷팅
npm run format
\`\`\`

## 프로젝트 구조

\`\`\`
src/
├── assets/        정적 파일 (이미지, 폰트 등)
├── lib/           유틸리티 함수, 상수
├── store/         Zustand 상태 관리
├── api/           Axios API 호출
├── hooks/         커스텀 훅
├── context/       React Context
├── components/    재사용 가능한 UI 컴포넌트${
    isReact
      ? `
├── layout/        레이아웃 컴포넌트
└── page/          페이지 컴포넌트`
      : `
└── app/           Next.js App Router (layout, page 등)`
  }
\`\`\`

${
  isReact
    ? `## 레이어 의존성 규칙

각 레이어는 아래 방향으로만 import 해야 합니다.

\`\`\`
lib → store → api → hooks → context → components → layout → page
\`\`\`

\`assets\`는 모든 레이어에서 자유롭게 참조 가능합니다.`
    : ''
}
`;

  await fs.writeFile(path.join(rootDir, 'README.md'), content, 'utf-8');
}
