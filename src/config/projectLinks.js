import { parseFigmaUrl } from '../figma/url.js';
import { saveProjectConfig } from './index.js';

function normalizeUrl(raw, kind) {
  const value = raw.trim();
  if (['off', 'none', 'clear'].includes(value.toLowerCase())) return null;

  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`${kind} 링크가 올바른 URL이 아닙니다.`);
  }
  if (!['http:', 'https:'].includes(url.protocol)) {
    throw new Error(`${kind} 링크는 http 또는 https URL이어야 합니다.`);
  }
  if (kind === 'Figma' && !parseFigmaUrl(value)) {
    throw new Error('지원하는 Figma file/design/proto 링크가 아닙니다.');
  }
  return value;
}

export async function updateProjectLink(cfg, kind, rawValue) {
  if (!cfg.paths.projectFile) {
    throw new Error('bc.config.json이 없습니다. 먼저 `bc adopt` 또는 `bc init`을 실행하세요.');
  }

  const value = normalizeUrl(rawValue, kind === 'figma' ? 'Figma' : 'OpenAPI');
  const project = {
    ...cfg.project,
    design: { ...(cfg.project.design ?? {}) },
    api: { ...(cfg.project.api ?? {}) },
  };

  if (kind === 'figma') project.design.figma = value;
  else project.api.openapi = value;

  await saveProjectConfig(cfg.paths.projectFile, project);

  return {
    ...cfg,
    project,
    effective: {
      ...cfg.effective,
      design: project.design,
      api: project.api,
    },
  };
}
