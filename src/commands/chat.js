import process from 'node:process';

import chalk from 'chalk';
import { streamText, stepCountIs } from 'ai';

import path from 'node:path';

import { loadEffectiveConfig } from '../config/index.js';
import { resolveModel } from '../ai/provider.js';
import { TokenMeter } from '../ai/tokenMeter.js';
import { buildSystemPrompt } from '../ai/systemPrompt.js';
import { findModel } from '../ai/models.js';
import { buildTools } from '../ai/tools.js';
import { toSdkMessages, isImagePath, imagePartFromFile } from '../ai/messageContent.js';
import { pasteClipboardImage, cleanDroppedPath } from '../ai/clipboard.js';
import { printInlineThumbnail } from '../ai/imagePreview.js';
import {
  createSession,
  saveSession,
  listSessions,
  loadSession,
  loadLatestSession,
} from '../history/store.js';
import { getCachedOpenApi } from '../openapi/cache.js';
import { summarizeOpenApi } from '../openapi/summary.js';

/**
 * `bc chat`
 *
 * - TTY (사람이 직접 띄운 터미널) → ink 기반 풀 TUI
 * - --once "질문"  또는  비-TTY (파이프/CI) → 단순 스트리밍 후 종료
 * - --continue: 마지막 세션 이어가기
 * - --resume <id>: 특정 세션 이어가기
 * - --list-history: 저장된 세션 목록만 출력
 */
export async function chatCommand(opts = {}) {
  if (opts.listHistory) {
    return printHistoryList();
  }

  let cfg;
  try {
    cfg = await loadEffectiveConfig();
  } catch (err) {
    console.error(chalk.red('설정을 읽을 수 없습니다: ') + err.message);
    process.exit(1);
  }

  if (opts.model) {
    if (!findModel(opts.model)) {
      console.error(chalk.red(`알 수 없는 모델: ${opts.model}`));
      console.error(chalk.dim('  bc config show 로 사용 가능한 모델을 확인하세요.'));
      process.exit(1);
    }
    cfg.effective.model = opts.model;
  }

  let resolved;
  try {
    resolved = resolveModel(cfg.effective);
  } catch (err) {
    console.error('\n' + chalk.red('  ' + err.message) + '\n');
    process.exit(1);
  }

  let baseSystem = buildSystemPrompt({
    effective: cfg.effective,
    paths: cfg.paths,
    project: cfg.project,
  });

  // 컨벤션 문서(.md) 자동 주입 — FE 전반 규칙, 스웨거→코드 변환 규칙 등.
  // bc.config.json 의 docs:[...] 또는 bc.md/AGENTS.md 등 관례 파일을 읽는다.
  let conventionFiles = [];
  if (cfg.paths.projectFile) {
    try {
      const { loadConventionDocs } = await import('../context/conventions.js');
      const projectRoot = path.dirname(cfg.paths.projectFile);
      const conv = await loadConventionDocs({
        projectRoot,
        docs: cfg.effective.docs,
        framework: cfg.project?.framework ?? cfg.project?.detected?.framework,
      });
      if (conv.text) {
        conventionFiles = conv.files;
        baseSystem +=
          '\n\n---\n## 팀 컨벤션 문서 (반드시 우선 준수)\n' +
          '아래는 이 프로젝트/팀의 프론트엔드 컨벤션이다. 코드 생성·수정 시 여기 규칙을 ' +
          '기존 코드 패턴보다 우선 적용한다. 충돌하면 이 문서를 따른다.\n\n' +
          conv.text;
      }
    } catch {
      /* 문서 로딩 실패는 무시 */
    }
  }

  // OpenAPI 자동 주입 — bc.config.json 의 api.openapi 가 있으면 fetch 후 요약을
  // 시스템 프롬프트에 박는다. 1시간 캐시. 실패해도 chat 은 그대로 동작.
  let openapiInfo = null;
  let system = baseSystem;
  if (cfg.effective.api?.openapi) {
    try {
      const res = await getCachedOpenApi(cfg.effective.api.openapi);
      const summary = res.doc ? summarizeOpenApi(res.doc) : null;
      if (summary) {
        openapiInfo = {
          source: cfg.effective.api.openapi,
          cached: res.cached,
          stale: !!res.stale,
          summary,
        };
        system =
          baseSystem +
          '\n\n---\nOpenAPI 스펙 개요 (아래 목록은 길면 잘려 있을 수 있음):\n' +
          summary +
          '\n\n**중요**: 위 목록은 일부만 보일 수 있다. 사용자가 특정 엔드포인트를 말하거나 ' +
          '위 목록에서 안 보이면, 추측하지 말고 반드시 `search_openapi(query)` 로 정확한 ' +
          'path/method 를 검색한 뒤 `get_openapi_endpoint(path, method)` 로 상세 스키마를 ' +
          '가져와서 zod/타입/요청 함수를 만든다. ' +
          '예: 사용자가 "inquiries" 라고 하면 search_openapi("inquiries") 로 ' +
          '`/api/admin/inquiries` 같은 실제 경로를 찾아낸다. ' +
          '이미 `*.gen.ts` 가 있으면 그걸 import 해서 쓰는 것도 좋다.';
      }
    } catch {
      /* 비정상 URL/네트워크 실패 — 무시하고 계속. */
    }
  }

  if (opts.once) {
    return runOnce({ cfg, resolved, system, prompt: opts.once });
  }

  // 세션 결정 — 새로/이어가기/특정 id 복구.
  let session;
  if (opts.resume) {
    try {
      session = await loadSession(opts.resume);
      console.log(
        chalk.dim(`  · 세션 ${session.id} 이어가기 (${session.messages.length} turns)\n`),
      );
    } catch (err) {
      console.error(chalk.red('세션을 불러올 수 없습니다: ') + err.message);
      process.exit(1);
    }
  } else if (opts.continueLast) {
    try {
      session = await loadLatestSession();
      if (!session) {
        console.log(chalk.dim('  · 이전 세션이 없습니다 — 새 세션으로 시작합니다.\n'));
      } else {
        console.log(
          chalk.dim(`  · 가장 최근 세션 ${session.id} 이어가기 (${session.messages.length} turns)\n`),
        );
      }
    } catch {
      /* 새 세션으로 폴백 */
    }
  }
  if (!session) {
    session = await createSession({ model: resolved.meta.id });
  } else {
    // 모델은 사용자가 명시했거나 글로벌 설정으로 갱신 가능 — 세션의 model 은 표시용.
    session.model = resolved.meta.id;
  }
  await saveSession(session); // 빈 파일이라도 디스크에 만들어둠

  // ink 는 stdin/stdout 둘 다 TTY 이어야 정상 동작.
  // - --plain 플래그가 명시되거나 비-TTY 면 readline 폴백.
  // - 글로벌 ui.mode 가 "plain" 이면 한글 IME 가 깨지는 케이스를 자동 회피.
  const isTTY = process.stdin.isTTY && process.stdout.isTTY;
  const wantPlain = opts.plain || cfg.global?.ui?.mode === 'plain';
  if (!isTTY || wantPlain) {
    return runReadlineFallback({ cfg, resolved, system, session, openapiInfo, conventionFiles });
  }

  return runInkApp({ cfg, resolved, system, session, openapiInfo, conventionFiles });
}

async function printHistoryList() {
  const list = await listSessions();
  if (list.length === 0) {
    console.log(chalk.dim('\n  저장된 세션이 없습니다.\n'));
    return;
  }
  console.log(chalk.bold.cyan('\n  저장된 챗 세션'));
  console.log(chalk.dim('  ─────────────────────────────────────────────────'));
  for (const s of list) {
    const when = s.updatedAt?.replace('T', ' ').slice(0, 19) ?? '';
    console.log(
      `  ${chalk.cyan(s.id)}  ${chalk.dim(when)}  ${s.turns} turns  ${chalk.dim(s.model ?? '')}`,
    );
    console.log(`    ${chalk.dim('└')} ${s.preview}`);
  }
  console.log();
  console.log(chalk.dim('  이어가기:  bc chat --resume <id>\n'));
}

/* ───────────────────────── ink 모드 ───────────────────────── */

async function runInkApp({ cfg, resolved, system, session, openapiInfo, conventionFiles = [] }) {
  // ink/React 는 무겁고 비-TTY 환경에서 import 만으로도 종종 문제 일으키므로
  // 여기서 늦게 import 한다 (--once / pipe 모드에 영향 없도록).
  const { render } = await import('ink');
  const { ChatApp } = await import('../ui/ChatApp.js');
  const React = (await import('react')).default;

  const initialConfig = { ...cfg, system, openapiInfo, conventionFiles };

  const onSessionUpdate = async (messages) => {
    session.messages = messages;
    await saveSession(session);
  };

  const { waitUntilExit } = render(
    React.createElement(ChatApp, {
      initialConfig,
      initialResolved: resolved,
      session,
      onSessionUpdate,
    }),
    { exitOnCtrlC: false },
  );
  await waitUntilExit();
}

/* ───────────────────────── --once 모드 ───────────────────────── */

async function runOnce({ cfg, resolved, system, prompt }) {
  const meter = new TokenMeter(resolved.meta, cfg.effective.limits);
  const projectRoot = cfg.paths.projectFile
    ? path.dirname(cfg.paths.projectFile)
    : process.cwd();
  const tools = buildTools({
    projectRoot,
    effective: cfg.effective,
    openapiSource: cfg.effective.api?.openapi ?? null,
    onEvent: (ev) => {
      const label =
        ev.kind === 'write_created'
          ? '🆕'
          : ev.kind === 'write_overwritten'
            ? '✏️ '
            : ev.kind === 'edit'
              ? '✏️ '
              : '·';
      console.log(chalk.dim(`  ${label} ${ev.path}`));
    },
  });
  const result = streamText({
    model: resolved.model,
    system,
    messages: [{ role: 'user', content: prompt }],
    tools,
    stopWhen: stepCountIs(12),
    onError: ({ error }) => {
      console.error(chalk.red('\n  AI 호출 에러: ') + (error?.message ?? error));
    },
  });
  for await (const part of result.fullStream) {
    if (part.type === 'text-delta') process.stdout.write(part.text);
    else if (part.type === 'tool-call')
      process.stdout.write(chalk.dim(`\n  🔧 ${part.toolName}\n`));
  }
  process.stdout.write('\n');
  try {
    meter.add(await result.usage);
    console.log(chalk.dim('  · ' + meter.format()));
  } catch {
    /* noop */
  }
}

/* ──────────────────── 비-TTY / --plain 폴백 ──────────────────── */

async function runReadlineFallback({ cfg, resolved, system, session, openapiInfo, conventionFiles = [] }) {
  const readline = await import('node:readline');
  const meter = new TokenMeter(resolved.meta, cfg.effective.limits);

  console.log();
  console.log(chalk.bold.cyan('  bc chat ') + chalk.dim('(plain mode)'));
  console.log(chalk.dim('  모델: ' + resolved.meta.label));
  if (openapiInfo) {
    console.log(
      chalk.dim('  openapi: ' + openapiInfo.source + (openapiInfo.cached ? ' (cached)' : ' (live)')),
    );
  }
  if (conventionFiles.length) {
    console.log(chalk.dim('  컨벤션 문서: ' + conventionFiles.join(', ')));
  }
  if (session?.messages?.length) {
    console.log(chalk.dim(`  세션: ${session.id} (${session.messages.length} turns 이어가기)`));
  }
  console.log(
    chalk.dim('  /image <경로> · /paste(클립보드 이미지) · /clear-attach · /exit\n'),
  );

  // 다음 메시지에 함께 보낼 이미지 첨부 목록.
  let pendingAttachments = [];

  const printAttachments = () => {
    if (!pendingAttachments.length) {
      console.log(chalk.dim('  첨부 없음.'));
      return;
    }
    console.log(chalk.dim('  현재 첨부:'));
    for (const a of pendingAttachments) {
      console.log(chalk.dim(`    - ${path.basename(a.path)} (${a.sizeKb}KB)`));
    }
  };

  const addImage = async (rawPath) => {
    const p = cleanDroppedPath(rawPath);
    if (!p) {
      console.log(chalk.red('  사용법: /image <파일 경로>'));
      return;
    }
    if (!isImagePath(p)) {
      console.log(chalk.red('  지원 확장자: png, jpg, jpeg, gif, webp'));
      return;
    }
    try {
      const { default: fsp } = await import('node:fs/promises');
      const stat = await fsp.stat(path.resolve(p));
      const sizeKb = Math.max(1, Math.round(stat.size / 1024));
      pendingAttachments.push({ kind: 'image', path: path.resolve(p), sizeKb });
      console.log(chalk.green(`  📎 첨부: ${path.basename(p)} (${sizeKb}KB)`));
      // iTerm2 / kitty / WezTerm 이면 작은 썸네일을 바로 보여준다.
      await printInlineThumbnail(path.resolve(p), { heightCells: 6 });
    } catch (e) {
      console.log(chalk.red('  이미지 읽기 실패: ' + (e?.message ?? e)));
    }
  };

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    terminal: !!process.stdin.isTTY,
    prompt: chalk.bold.magenta('  you › '),
  });
  // 세션에 들어있던 메시지를 히스토리에 그대로 적재 (attachments 는 버림 — readline 모드에선 첨부 미지원).
  const history = (session?.messages ?? [])
    .filter((m) => m.role === 'user' || m.role === 'assistant')
    .map((m) => ({ role: m.role, content: m.text ?? '' }));
  const ask = () => rl.prompt();

  rl.on('close', () => {
    console.log(chalk.dim('\n  bye 👋\n'));
    process.exit(0);
  });
  ask();

  for await (const raw of rl) {
    const line = raw.trim();
    if (!line) {
      ask();
      continue;
    }
    if (line === '/exit' || line === '/quit') {
      rl.close();
      return;
    }
    // 이미지 첨부 관련 슬래시 명령 — plain 모드에서도 지원.
    if (line.startsWith('/image')) {
      await addImage(line.slice('/image'.length).trim());
      ask();
      continue;
    }
    if (line === '/paste') {
      try {
        const file = await pasteClipboardImage();
        await addImage(file);
      } catch (e) {
        console.log(chalk.red('  ' + (e?.message ?? e)));
      }
      ask();
      continue;
    }
    if (line === '/attachments') {
      printAttachments();
      ask();
      continue;
    }
    if (line === '/clear-attach') {
      pendingAttachments = [];
      console.log(chalk.dim('  첨부를 비웠습니다.'));
      ask();
      continue;
    }

    // 일반 메시지 — 첨부가 있으면 멀티모달 content 로 구성.
    if (pendingAttachments.length) {
      const parts = [{ type: 'text', text: line }];
      try {
        for (const att of pendingAttachments) {
          parts.push(await imagePartFromFile(att.path));
        }
        history.push({ role: 'user', content: parts });
      } catch (e) {
        console.log(chalk.red('  첨부 처리 실패: ' + (e?.message ?? e)));
        history.push({ role: 'user', content: line });
      }
      pendingAttachments = [];
    } else {
      history.push({ role: 'user', content: line });
    }
    rl.pause();

    const projectRoot = cfg.paths.projectFile
      ? path.dirname(cfg.paths.projectFile)
      : process.cwd();
    const tools = buildTools({
      projectRoot,
      effective: cfg.effective,
      openapiSource: cfg.effective.api?.openapi ?? null,
      onEvent: (ev) => {
        const label =
          ev.kind === 'write_created'
            ? '🆕 생성'
            : ev.kind === 'write_overwritten'
              ? '✏️  덮어씀'
              : ev.kind === 'edit'
                ? '✏️  편집'
                : '·';
        console.log(chalk.dim(`\n  ${label} ${ev.path}`));
      },
    });
    const result = streamText({
      model: resolved.model,
      system,
      messages: history,
      tools,
      stopWhen: stepCountIs(12),
      onError: ({ error }) => {
        console.error(chalk.red('\n  AI 호출 에러: ') + (error?.message ?? error));
      },
    });
    process.stdout.write(chalk.bold.green('\n  bc › '));
    let acc = '';
    try {
      for await (const part of result.fullStream) {
        if (part.type === 'text-delta') {
          acc += part.text;
          process.stdout.write(part.text);
        } else if (part.type === 'tool-call') {
          process.stdout.write(chalk.dim(`\n  🔧 ${part.toolName}`));
        }
      }
    } catch (err) {
      console.error('\n' + chalk.red('  스트리밍 중단: ') + (err?.message ?? err));
    }
    process.stdout.write('\n');
    try {
      meter.add(await result.usage);
      console.log(chalk.dim('  · ' + meter.format()));
    } catch {
      /* noop */
    }
    if (acc) history.push({ role: 'assistant', content: acc });

    // 세션 자동 저장 — readline 모드에서도 끊김 대비.
    if (session) {
      session.messages = history.map((h) => {
        // 멀티모달(content 가 배열) 인 경우 text 파트만 추출해 저장 (이미지 바이트는 세션에 안 남김).
        if (Array.isArray(h.content)) {
          const textPart = h.content.find((p) => p.type === 'text');
          return { role: h.role, text: textPart?.text ?? '[이미지 첨부]' };
        }
        return { role: h.role, text: h.content };
      });
      try {
        await saveSession(session);
      } catch {
        /* noop */
      }
    }

    rl.resume();
    ask();
  }
}
