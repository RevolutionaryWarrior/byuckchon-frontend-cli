import chalk from 'chalk';

import { loadEffectiveConfig } from '../config/index.js';
import { buildIndex, loadIndex } from '../indexer/store.js';
import { searchIndex } from '../indexer/search.js';

/**
 * `bc index`           — 증분 빌드/갱신
 * `bc index --rebuild` — 처음부터 다시
 * `bc index status`    — 현재 상태
 * `bc index search Q`  — 디버그용 검색
 */
export async function indexBuildCommand(opts = {}) {
  const cfg = await loadEffectiveConfig();
  if (!cfg.paths.projectFile) {
    console.log(
      chalk.yellow('  ⚠ bc.config.json 을 못 찾았습니다 — 먼저 `bc adopt` 또는 `bc init` 을 실행하세요.\n'),
    );
    process.exit(1);
  }

  console.log(chalk.bold.cyan('\n  bc index — 코드베이스 임베딩 인덱싱\n'));
  try {
    const res = await buildIndex({
      effective: cfg.effective,
      contextCfg: cfg.effective.context,
      rebuild: !!opts.rebuild,
      onProgress: (msg) => console.log(chalk.dim(msg)),
    });
    if (!res.ok) {
      console.log(chalk.yellow('\n  ' + res.reason + '\n'));
      process.exit(1);
    }
    console.log();
    console.log(chalk.green('  ✓ 인덱스 빌드 완료'));
    console.log(chalk.dim(`    파일 ${res.manifest.fileCount} · 청크 ${res.manifest.chunkCount}`));
    console.log(chalk.dim(`    재사용 ${res.manifest.reused} · 신규 임베딩 ${res.manifest.newlyEmbedded}`));
    console.log(chalk.dim(`    저장 위치: ${res.paths.dir}\n`));
  } catch (err) {
    console.error('\n' + chalk.red('  ' + (err?.message ?? err)) + '\n');
    process.exit(1);
  }
}

export async function indexStatusCommand() {
  const idx = await loadIndex();
  if (!idx) {
    console.log(chalk.dim('\n  인덱스가 없습니다. `bc index` 로 빌드하세요.\n'));
    return;
  }
  console.log(chalk.bold.cyan('\n  인덱스 상태'));
  console.log(chalk.dim('  ─────────────────────────────────────'));
  console.log(`    ${chalk.dim('모델     ')} ${idx.embeddingModel}`);
  console.log(`    ${chalk.dim('파일     ')} ${idx.fileCount}`);
  console.log(`    ${chalk.dim('청크     ')} ${idx.chunkCount}`);
  console.log(`    ${chalk.dim('빌드일   ')} ${idx.builtAt}`);
  console.log(`    ${chalk.dim('저장 위치')} ${idx._paths.dir}\n`);
}

export async function indexSearchCommand(query, opts = {}) {
  if (!query) {
    console.error(chalk.red('  사용법: bc index search "검색어"'));
    process.exit(1);
  }
  const cfg = await loadEffectiveConfig();
  try {
    const res = await searchIndex(query, cfg.effective, {
      topK: Number(opts.topK ?? 5),
    });
    if (!res.ok) {
      console.log(chalk.yellow('\n  인덱스가 없습니다. `bc index` 로 빌드하세요.\n'));
      return;
    }
    console.log(chalk.bold.cyan(`\n  '${query}' 검색 결과 — ${res.results.length}개 (전체 ${res.total} 청크)\n`));
    for (const r of res.results) {
      const score = r.score.toFixed(3);
      console.log(
        `  ${chalk.cyan(r.chunk.file)}:${chalk.dim(r.chunk.startLine + '-' + r.chunk.endLine)}  ` +
          chalk.yellow(score),
      );
      const preview = r.chunk.text.split('\n').slice(0, 3).join(' ').slice(0, 110);
      console.log('    ' + chalk.dim(preview) + chalk.dim('…'));
    }
    console.log();
  } catch (err) {
    console.error('\n' + chalk.red('  ' + (err?.message ?? err)) + '\n');
    process.exit(1);
  }
}
