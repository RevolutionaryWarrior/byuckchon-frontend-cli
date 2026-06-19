import path from 'node:path';

import { CONFIG_PATHS } from '../config/index.js';

/**
 * 시스템 프롬프트를 만든다.
 *
 * 가능하면 bc.config.json 의 `framework` 와 `detected.*` 를 우선 사용해서
 * 모델에게 정확한 스택을 알린다. 그게 없으면 보수적인 기본 가정만 박는다.
 */
export function buildSystemPrompt({ effective, paths, project }) {
  const lines = [
    '너는 Byuckchon 프론트엔드 팀의 페어 프로그래밍 AI 다.',
    '한국어로 친근하고 간결하게 답한다. 코드 답변은 마크다운 코드블록(언어 태그 포함)으로 준다.',
    '추측 대신 모르면 모른다고 말한다. 파일 경로를 언급할 때는 백틱으로 감싼다.',
  ];

  const stack = describeStack(project);
  if (stack) {
    lines.push('', '프로젝트 스택:');
    for (const line of stack) lines.push('  ' + line);
  } else {
    lines.push(
      '',
      '프로젝트 스택을 모르면 React 19 + TypeScript 라고 가정한다.',
    );
  }

  const meta = [];
  if (paths.projectFile) {
    meta.push(
      `- 설정 파일: \`${
        path.relative(process.cwd(), paths.projectFile) || CONFIG_PATHS.projectFileName
      }\``,
    );
  }
  if (project?.design?.figma) meta.push(`- Figma: ${project.design.figma}`);
  if (project?.api?.openapi) meta.push(`- OpenAPI: ${project.api.openapi}`);
  if (project?.api?.baseUrl) meta.push(`- API base URL: ${project.api.baseUrl}`);
  if (effective?.model) meta.push(`- 사용 모델: ${effective.model}`);

  if (meta.length) {
    lines.push('', '추가 메타:', ...meta);
  }

  return lines.join('\n');
}

function describeStack(project) {
  if (!project) return null;

  const fw = project.framework;
  const d = project.detected;
  if (!fw && !d) return null;

  const out = [];
  if (fw) out.push('- 프레임워크: ' + fw);
  if (d?.language) out.push('- 언어: ' + (d.language === 'ts' ? 'TypeScript' : 'JavaScript'));
  if (d?.styling) {
    const s = Object.entries(d.styling)
      .filter(([, v]) => v)
      .map(([k]) => k);
    if (s.length) out.push('- 스타일링: ' + s.join(', '));
  }
  if (d?.packageManager && d.packageManager !== 'unknown')
    out.push('- 패키지 매니저: ' + d.packageManager);
  if (d?.routing) out.push('- 라우팅: ' + d.routing);
  if (d?.componentDirs?.length)
    out.push('- 새 컴포넌트는 다음 위치 중 하나에 만든다: ' + d.componentDirs.join(', '));
  if (d?.designTokensFiles?.length)
    out.push('- 디자인 토큰 파일: ' + d.designTokensFiles.join(', ') + ' — 색/사이즈는 가능한 한 토큰 사용');
  if (d?.hasStorybook) out.push('- Storybook 사용 중. 새 컴포넌트는 .stories.tsx 도 같이 제안.');
  if (d?.hasTests) out.push('- 테스트 도구: ' + d.hasTests + '. 새 코드는 테스트도 같이 제안.');
  return out;
}
