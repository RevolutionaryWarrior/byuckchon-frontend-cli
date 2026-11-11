import fs from 'fs/promises';
import path from 'path';

export async function createReadme(rootDir, config) {
  const isReact = config.framework === 'react';

  const content = `# ${config.projectName}

## 기술 스택

| 항목 | 내용 |
|------|------|
| Framework | ${isReact ? 'React 18' : 'Next.js 15 (App Router)'} |
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
├── layouts/       레이아웃 컴포넌트
└── pages/         페이지 컴포넌트`
      : `
└── app/           Next.js App Router (layout, page 등)`
  }
\`\`\`

${
  isReact
    ? `## 레이어 의존성 규칙

각 레이어는 아래 방향으로만 import 해야 합니다.

\`\`\`
lib → store → api → hooks → context → components → layouts → pages
\`\`\`

\`assets\`는 모든 레이어에서 자유롭게 참조 가능합니다.`
    : ''
}

## 에러 처리 · Sentry

API 에러는 상태 코드별 클래스로 나뉩니다. (\`src/lib/errors.ts\`)
**네트워크 끊김 · 5xx 만** 에러 화면(\`AppFallbackUI\`)으로 바꾸고 Sentry 로 보냅니다.
401 · 403 · 404 · 그 외 4xx 는 화면을 유지하고 메시지만 보여줍니다. 자세한 규칙은 \`AGENTS.md\` 7번.

Sentry 는 기본으로 들어 있지만 **DSN 을 넣기 전까지는 꺼져 있습니다.**

\`\`\`bash
cp .env.example .env.local   # ${isReact ? 'VITE_SENTRY_DSN' : 'NEXT_PUBLIC_SENTRY_DSN'} 에 DSN 입력
\`\`\`

- \`.env.local\` 은 커밋되지 않습니다. \`.env.example\` 에는 키 이름만 둡니다.
- 배포 환경에서는 GitHub Secrets 에 \`${isReact ? 'VITE_SENTRY_DSN' : 'NEXT_PUBLIC_SENTRY_DSN'}\` 을 등록하고 빌드 단계에서 주입하세요.
  (빌드 시점에 번들에 들어가는 값이라 런타임 주입으로는 반영되지 않습니다)
- 환경 구분: ${isReact ? '\`vite build --mode <환경>\` 의 MODE' : '\`NODE_ENV\`'} 가 Sentry \`environment\` 로 들어갑니다.

> 팀 결정 대기 — 프로젝트마다 Sentry 프로젝트를 하나씩 만들고 environment 로 나눌지,
> 테스트 서버 에러도 보낼지는 아직 정하지 않았습니다. 정해지면 이 절을 갱신하세요.
`;

  await fs.writeFile(path.join(rootDir, 'README.md'), content, 'utf-8');
}
