import fs from 'node:fs/promises';
import path from 'node:path';

import { findProjectConfigPath } from '../config/index.js';
import { walkProjectFiles, relPath } from './walker.js';
import { chunkFile } from './chunker.js';
import { embedChunks, DEFAULT_EMBED_MODEL } from './embed.js';

const INDEX_VERSION = 1;

export async function getIndexPaths(cwd = process.cwd()) {
  const projectConfig = await findProjectConfigPath(cwd);
  const projectRoot = projectConfig ? path.dirname(projectConfig) : cwd;
  const dir = path.join(projectRoot, '.bc', 'index');
  return {
    projectRoot,
    dir,
    manifest: path.join(dir, 'manifest.json'),
    chunks: path.join(dir, 'chunks.json'),
  };
}

export async function loadIndex(cwd = process.cwd()) {
  const p = await getIndexPaths(cwd);
  try {
    const [manifestRaw, chunksRaw] = await Promise.all([
      fs.readFile(p.manifest, 'utf8'),
      fs.readFile(p.chunks, 'utf8'),
    ]);
    return {
      ...JSON.parse(manifestRaw),
      chunks: JSON.parse(chunksRaw),
      _paths: p,
    };
  } catch (e) {
    if (e.code === 'ENOENT') return null;
    throw e;
  }
}

async function saveIndex(p, manifest, chunks) {
  await fs.mkdir(p.dir, { recursive: true });
  await fs.writeFile(p.chunks, JSON.stringify(chunks), 'utf8');
  await fs.writeFile(
    p.manifest,
    JSON.stringify({ ...manifest, chunkCount: chunks.length }, null, 2) + '\n',
    'utf8',
  );
}

/**
 * 인덱스 빌드 — 파일 스캔, 청크 분할, 변경된 청크만 임베딩 후 저장.
 *
 * @param {object} opts
 * @param {object} opts.effective  loadEffectiveConfig().effective
 * @param {object} opts.contextCfg bc.config.json 의 context (include/exclude)
 * @param {boolean} opts.rebuild   true 면 기존 임베딩 무시하고 전부 재계산
 * @param {(s:string)=>void} opts.onProgress 진행 메시지 콜백
 */
export async function buildIndex({
  effective,
  contextCfg = {},
  rebuild = false,
  onProgress = () => {},
} = {}) {
  const p = await getIndexPaths();
  const { projectRoot } = p;

  onProgress('  파일 목록 수집 중…');
  const files = await walkProjectFiles(projectRoot, contextCfg);
  if (files.length === 0) {
    return { ok: false, reason: '인덱싱할 파일이 없습니다. bc.config.json 의 context.include 를 확인하세요.' };
  }
  onProgress(`  파일 ${files.length}개 발견. 청크 분할 중…`);

  const fileMaxBytes = 100 * 1024;
  const allChunks = [];
  for (const abs of files) {
    let content;
    try {
      const stat = await fs.stat(abs);
      if (stat.size > fileMaxBytes) continue; // 너무 큰 파일은 스킵
      content = await fs.readFile(abs, 'utf8');
    } catch {
      continue;
    }
    const r = relPath(projectRoot, abs);
    for (const c of chunkFile({ relPath: r, content })) allChunks.push(c);
  }
  onProgress(`  청크 ${allChunks.length}개 생성.`);

  // 기존 인덱스에서 hash 일치하는 청크의 임베딩을 재사용 (증분 갱신).
  let reused = 0;
  let toEmbed = allChunks;
  if (!rebuild) {
    const existing = await loadIndex(projectRoot);
    if (existing && existing.embeddingModel === DEFAULT_EMBED_MODEL) {
      const byHash = new Map(existing.chunks.map((c) => [c.hash, c.embedding]));
      toEmbed = [];
      for (const c of allChunks) {
        const cached = byHash.get(c.hash);
        if (cached) {
          c.embedding = cached;
          reused++;
        } else {
          toEmbed.push(c);
        }
      }
      onProgress(`  ${reused}개 재사용, ${toEmbed.length}개 신규 임베딩 필요.`);
    }
  }

  if (toEmbed.length > 0) {
    onProgress(`  OpenAI 임베딩 중… (model=${DEFAULT_EMBED_MODEL})`);
    const { makeEmbeddingModel } = await import('./embed.js');
    const model = makeEmbeddingModel(effective);
    const embedded = await embedChunks(model, toEmbed, {
      onBatch: ({ done, total }) => onProgress(`    배치 진행: ${done}/${total}`),
    });
    // 새로 임베딩된 청크를 allChunks 에 반영 (hash 일치하는 자리로 머지).
    const newByHash = new Map(embedded.map((e) => [e.hash, e.embedding]));
    for (const c of allChunks) {
      if (!c.embedding) c.embedding = newByHash.get(c.hash);
    }
  }

  const manifest = {
    version: INDEX_VERSION,
    embeddingModel: DEFAULT_EMBED_MODEL,
    builtAt: new Date().toISOString(),
    fileCount: files.length,
    reused,
    newlyEmbedded: toEmbed.length - reused < 0 ? toEmbed.length : toEmbed.length,
  };
  await saveIndex(p, manifest, allChunks);
  return { ok: true, manifest, paths: p };
}
