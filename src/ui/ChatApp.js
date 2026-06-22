import path from 'node:path';
import process from 'node:process';

import React, { useEffect, useState, useRef, useCallback } from 'react';
import { Box, Text, useApp, useInput, useStdout } from 'ink';
import TextInput from 'ink-text-input';
import Spinner from 'ink-spinner';
import { streamText, stepCountIs } from 'ai';

import { resolveModel } from '../ai/provider.js';
import { TokenMeter } from '../ai/tokenMeter.js';
import { findModel, MODEL_CATALOG } from '../ai/models.js';
import { toSdkMessages, isImagePath } from '../ai/messageContent.js';
import { buildTools } from '../ai/tools.js';
import { searchIndex } from '../indexer/search.js';
import { loadIndex, buildIndex } from '../indexer/store.js';

const h = React.createElement;

/** 툴 호출의 input 을 채팅 한 줄에 보여줄 수 있게 압축. content 같은 대형 필드는 길이만 표시. */
function summarizeToolInput(name, input) {
  if (!input || typeof input !== 'object') return '';
  switch (name) {
    case 'read_file':
    case 'write_file':
    case 'edit_file':
      return JSON.stringify(input.path ?? '');
    case 'list_files':
      return JSON.stringify(input.pattern ?? '**/*');
    case 'search_code':
      return JSON.stringify(input.query ?? '');
    default:
      // 일반 케이스 — 너무 긴 필드는 잘라낸다.
      try {
        const small = {};
        for (const [k, v] of Object.entries(input)) {
          if (typeof v === 'string' && v.length > 60) small[k] = v.slice(0, 60) + '…';
          else small[k] = v;
        }
        return JSON.stringify(small);
      } catch {
        return '';
      }
  }
}

/**
 * macOS 클립보드의 이미지(예: 스크린샷)를 임시 파일로 떨궈 절대경로를 돌려준다.
 *
 * - 외부 도구 `pngpaste` 가 필요 (Homebrew: `brew install pngpaste`).
 * - macOS 가 아니거나 도구가 없으면 도움이 되는 에러 메시지로 throw.
 */
async function pasteClipboardImage() {
  if (process.platform !== 'darwin') {
    throw new Error(
      '/paste 는 현재 macOS 만 지원합니다. 다른 OS 에서는 이미지를 파일로 저장하고 /image <경로> 를 쓰세요.',
    );
  }
  const { spawn } = await import('node:child_process');
  const fs = await import('node:fs/promises');
  const os = await import('node:os');
  const pathMod = await import('node:path');

  // pngpaste 가 설치되어 있는지 빠르게 확인.
  const checkOk = await new Promise((resolve) => {
    const p = spawn('which', ['pngpaste']);
    p.on('close', (code) => resolve(code === 0));
    p.on('error', () => resolve(false));
  });
  if (!checkOk) {
    throw new Error(
      'pngpaste 가 필요합니다. 설치: `brew install pngpaste`  (Homebrew 가 없으면 https://brew.sh)',
    );
  }

  const tmp = pathMod.join(
    os.tmpdir(),
    `bc-paste-${Date.now()}.png`,
  );
  await new Promise((resolve, reject) => {
    const p = spawn('pngpaste', [tmp]);
    let stderr = '';
    p.stderr.on('data', (d) => (stderr += d.toString()));
    p.on('close', (code) => {
      if (code === 0) resolve();
      else
        reject(
          new Error(
            '클립보드에 이미지가 없거나 읽을 수 없습니다.' +
              (stderr ? ' (' + stderr.trim() + ')' : ''),
          ),
        );
    });
    p.on('error', (e) => reject(e));
  });

  // 파일이 실제로 만들어졌는지 한 번 더 확인.
  const stat = await fs.stat(tmp);
  if (!stat.isFile() || stat.size === 0) {
    throw new Error('클립보드 이미지 저장 실패 (파일이 비어있음).');
  }
  return tmp;
}

/**
 * ink 기반 bc chat UI.
 *
 * 화면 구성:
 *   ┌ Header  : 로고 + 모델 + 게이트웨이/프로젝트 정보
 *   │ Messages: 사용자/어시스턴트 말풍선 (스크롤은 터미널 자체에 맡김)
 *   │ Status  : 입력중/스트리밍중/에러 한 줄
 *   │ Attach  : 다음 user 메시지에 같이 보낼 첨부 목록
 *   └ Input   : prompt + TextInput
 *
 * 슬래시 명령은 Input 컴포넌트의 onSubmit 에서 가로채서 처리.
 */

function Header({ modelMeta, projectFile, gateway, ragOn, hasIndex, openapiInfo }) {
  let ragLabel;
  if (!hasIndex) ragLabel = '(준비 중 — 자동 빌드 또는 /index)';
  else if (ragOn) ragLabel = 'on (관련 코드 자동 주입)';
  else ragLabel = 'off (/rag on 으로 켜기)';

  let openapiLabel;
  if (openapiInfo) {
    openapiLabel = openapiInfo.source + (openapiInfo.cached ? ' (cached)' : ' (live)');
  } else {
    openapiLabel = null;
  }

  return h(
    Box,
    { flexDirection: 'column', borderStyle: 'round', borderColor: 'cyan', paddingX: 1 },
    h(
      Box,
      null,
      h(Text, { bold: true, color: 'cyan' }, 'bc chat '),
      h(Text, { dimColor: true }, '·  Byuckchon Frontend Workbench'),
    ),
    h(
      Box,
      null,
      h(Text, { dimColor: true }, 'model    '),
      h(Text, null, modelMeta.label),
    ),
    h(
      Box,
      null,
      h(Text, { dimColor: true }, 'project  '),
      h(
        Text,
        { dimColor: !projectFile },
        projectFile ?? '(글로벌만 사용 — bc.config.json 없음)',
      ),
    ),
    h(
      Box,
      null,
      h(Text, { dimColor: true }, 'rag      '),
      h(Text, { dimColor: !ragOn || !hasIndex }, ragLabel),
    ),
    openapiLabel
      ? h(
          Box,
          null,
          h(Text, { dimColor: true }, 'openapi  '),
          h(Text, null, openapiLabel),
        )
      : null,
    gateway
      ? h(
          Box,
          null,
          h(Text, { dimColor: true }, 'gateway  '),
          h(Text, null, gateway),
        )
      : null,
  );
}

function MessageBubble({ message }) {
  if (message.role === 'system-info') {
    return h(
      Box,
      { marginY: 0 },
      h(Text, { dimColor: true }, '· ' + message.text),
    );
  }
  if (message.role === 'system-error') {
    return h(
      Box,
      { marginY: 0 },
      h(Text, { color: 'red' }, '✗ ' + message.text),
    );
  }
  const isUser = message.role === 'user';
  const label = isUser ? 'you' : 'bc';
  const color = isUser ? 'magenta' : 'green';

  return h(
    Box,
    { flexDirection: 'column', marginY: 0 },
    h(
      Box,
      null,
      h(Text, { color, bold: true }, label + ' › '),
      h(Text, null, message.text || (message.streaming ? '' : '')),
    ),
    message.attachments?.length
      ? h(
          Box,
          { marginLeft: 6 },
          h(
            Text,
            { dimColor: true },
            '📎 ' +
              message.attachments
                .map((a) => `${path.basename(a.path)} (${a.sizeKb}KB)`)
                .join(', '),
          ),
        )
      : null,
  );
}

function StatusLine({ state, meter, indexBusy, indexProgress }) {
  const cost = meter ? meter.format() : null;
  if (indexBusy) {
    return h(
      Box,
      null,
      h(Text, { color: 'magenta' }, h(Spinner, { type: 'dots' })),
      h(Text, { color: 'magenta' }, ' 📚 인덱싱 중 '),
      h(Text, { dimColor: true }, indexProgress || ''),
    );
  }
  if (state === 'streaming') {
    return h(
      Box,
      null,
      h(Text, { color: 'yellow' }, h(Spinner, { type: 'dots' })),
      h(Text, { color: 'yellow' }, ' 응답 받는 중…  '),
      cost ? h(Text, { dimColor: true }, cost) : null,
    );
  }
  if (state === 'thinking') {
    return h(
      Box,
      null,
      h(Text, { color: 'cyan' }, h(Spinner, { type: 'dots' })),
      h(Text, { color: 'cyan' }, ' 보내는 중…'),
    );
  }
  return h(
    Box,
    null,
    h(Text, { dimColor: true }, cost ? cost : '/help · /image <path> · /exit'),
  );
}

function AttachBar({ pending }) {
  if (!pending.length) return null;
  return h(
    Box,
    { borderStyle: 'single', borderColor: 'gray', paddingX: 1, marginTop: 0 },
    h(
      Text,
      { dimColor: true },
      '다음 메시지에 첨부됨: ' +
        pending.map((p) => path.basename(p.path)).join(', '),
    ),
  );
}

/**
 * 슬래시 명령 카탈로그 — 도움말 + 자동완성 메뉴 양쪽에서 공유한다.
 * `cmd` 는 슬래시까지 포함, `hint` 는 인자 형식, `desc` 는 설명.
 */
const SLASH_COMMANDS = [
  { cmd: '/help', hint: '', desc: '명령 도움말' },
  { cmd: '/clear', hint: '', desc: '대화 컨텍스트 비우기' },
  { cmd: '/model', hint: '<id>', desc: '세션 모델 변경 (인자 없으면 목록)' },
  { cmd: '/cost', hint: '', desc: '누적 토큰/비용' },
  { cmd: '/image', hint: '<path>', desc: '이미지 첨부 (Finder 에서 끌어다 놔도 됨)' },
  { cmd: '/paste', hint: '', desc: '클립보드의 이미지(스크린샷)를 첨부 — macOS' },
  { cmd: '/attachments', hint: '', desc: '현재 첨부 목록' },
  { cmd: '/clear-attach', hint: '', desc: '첨부 비우기' },
  { cmd: '/index', hint: '', desc: '코드베이스 인덱스 빌드/갱신 (지금 실행)' },
  { cmd: '/rag', hint: 'on|off', desc: '코드베이스 RAG on/off' },
  { cmd: '/exit', hint: '', desc: '종료 (Ctrl+C 도 가능)' },
];

const HELP_TEXT = SLASH_COMMANDS
  .map((c) => `${(c.cmd + (c.hint ? ' ' + c.hint : '')).padEnd(22)} ${c.desc}`)
  .join('\n');

/** 사용자가 친 input 으로부터 자동완성 후보를 거른다. */
function filterSlashCommands(input) {
  if (!input.startsWith('/')) return [];
  // 공백이 들어왔다면 이미 인자 입력 단계 → 메뉴 닫음.
  if (/\s/.test(input)) return [];
  const filter = input.slice(1).toLowerCase();
  return SLASH_COMMANDS.filter((c) =>
    c.cmd.slice(1).toLowerCase().startsWith(filter),
  );
}

/** 메뉴에서 선택된 항목을 실제 input 문자열로 펼친다. */
function expandSlash(item) {
  return item.cmd + (item.hint ? ' ' : '');
}

function SlashMenu({ items, activeIndex }) {
  if (items.length === 0) return null;
  return h(
    Box,
    {
      flexDirection: 'column',
      borderStyle: 'single',
      borderColor: 'gray',
      paddingX: 1,
      marginTop: 0,
    },
    ...items.map((it, i) =>
      h(
        Box,
        { key: it.cmd },
        h(
          Text,
          { color: i === activeIndex ? 'cyan' : undefined, bold: i === activeIndex },
          (i === activeIndex ? '› ' : '  ') + it.cmd,
        ),
        it.hint ? h(Text, { dimColor: true }, ' ' + it.hint) : null,
        h(Text, { dimColor: true }, '   ' + it.desc),
      ),
    ),
    h(
      Box,
      { marginTop: 0 },
      h(Text, { dimColor: true }, '   ↑↓ 선택 · Enter/Tab 자동완성 · Esc 취소'),
    ),
  );
}

export function ChatApp({ initialConfig, initialResolved, session, onSessionUpdate }) {
  const app = useApp();
  const { stdout } = useStdout();
  const [cfg, setCfg] = useState(initialConfig);
  const [resolved, setResolved] = useState(initialResolved);
  const meterRef = useRef(new TokenMeter(initialResolved.meta, initialConfig.effective.limits));

  // ── 한글/일본어 IME 대응 ────────────────────────────────────────
  // ink 는 시작 시 터미널 커서를 숨긴다. 그러면 macOS Hangul IME 가
  // 조합 중인 글자(예: '안' 조합) 미리보기를 띄울 위치를 못 찾아서 입력이
  // 한 글자씩 묵음 처리되는 것처럼 보인다. 매 렌더 후 커서를 다시 켜서
  // OS 의 IME 오버레이가 정상적으로 입력 위치 위에 뜨도록 만든다.
  useEffect(() => {
    stdout.write('\u001B[?25h'); // CSI ? 25 h  =  cursor show
  });
  useEffect(() => {
    return () => {
      stdout.write('\u001B[?25h');
    };
  }, [stdout]);

  const [input, setInput] = useState('');
  const [messages, setMessages] = useState(session?.messages ?? []);
  const [state, setState] = useState('idle'); // idle | thinking | streaming
  const [pendingAttachments, setPendingAttachments] = useState([]);
  const [hasIndex, setHasIndex] = useState(false);
  const [indexBusy, setIndexBusy] = useState(false);
  const [indexProgress, setIndexProgress] = useState('');
  const [ragEnabled, setRagEnabled] = useState(true);
  const [menuIndex, setMenuIndex] = useState(0);
  const [, force] = useState(0);
  const rerender = useCallback(() => force((n) => n + 1), []);

  // 슬래시 메뉴: input 상태에 따라 동적으로 계산.
  const slashItems = state === 'idle' ? filterSlashCommands(input) : [];
  const slashOpen = slashItems.length > 0;
  // input 이 바뀌면 선택 인덱스를 0 으로 리셋 (필터 변경 시 자연스럽게).
  useEffect(() => {
    setMenuIndex(0);
  }, [input]);

  // 인덱스 빌드 헬퍼 — 자동/수동 양쪽에서 공유.
  const runIndexBuild = useCallback(
    async ({ rebuild = false, silent = false } = {}) => {
      if (indexBusy) return false;
      if (!cfg.paths.projectFile) {
        if (!silent) {
          setMessages((m) => [
            ...m,
            { role: 'system-info', text: 'bc.config.json 이 없어 인덱싱 대상을 모릅니다. 먼저 `bc adopt` 또는 `bc init` 을 실행해주세요.' },
          ]);
        }
        return false;
      }
      if (!cfg.effective.apiKeys?.openai && !cfg.effective.gateway) {
        if (!silent) {
          setMessages((m) => [
            ...m,
            { role: 'system-info', text: 'RAG 인덱싱에는 OpenAI 키가 필요합니다. `bc config set-key openai` 후 /index 다시 실행해주세요.' },
          ]);
        }
        return false;
      }

      setIndexBusy(true);
      setIndexProgress('시작...');
      setMessages((m) => [
        ...m,
        { role: 'system-info', text: '📚 코드 인덱스 빌드 중... (RAG 활성화 준비)' },
      ]);
      try {
        const res = await buildIndex({
          effective: cfg.effective,
          contextCfg: cfg.effective.context,
          rebuild,
          onProgress: (msg) => setIndexProgress(msg.trim()),
        });
        if (!res.ok) {
          setMessages((m) => [
            ...m,
            { role: 'system-error', text: '인덱스 빌드 실패: ' + res.reason },
          ]);
          return false;
        }
        setHasIndex(true);
        setMessages((m) => [
          ...m,
          {
            role: 'system-info',
            text: `✓ 인덱스 빌드 완료 — 파일 ${res.manifest.fileCount} · 청크 ${res.manifest.chunkCount}`,
          },
        ]);
        return true;
      } catch (err) {
        setMessages((m) => [
          ...m,
          { role: 'system-error', text: '인덱스 빌드 오류: ' + (err?.message ?? String(err)) },
        ]);
        return false;
      } finally {
        setIndexBusy(false);
        setIndexProgress('');
      }
    },
    [cfg, indexBusy],
  );

  // 시작 시: 인덱스 존재 여부 확인 → 없고 조건 맞으면 자동으로 한 번 빌드.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const idx = await loadIndex().catch(() => null);
      if (cancelled) return;
      if (idx?.chunks?.length) {
        setHasIndex(true);
        return;
      }
      // 인덱스 없음 — 자동 빌드 시도
      const canAuto =
        !!cfg.paths.projectFile &&
        (!!cfg.effective.apiKeys?.openai || !!cfg.effective.gateway);
      if (!canAuto) {
        if (cfg.paths.projectFile) {
          setMessages((m) => [
            ...m,
            {
              role: 'system-info',
              text:
                '💡 RAG 코드 컨텍스트를 쓰려면 OpenAI 키가 필요합니다.\n' +
                '   `bc config set-key openai` 후 /index 또는 `bc index` 를 실행하세요.',
            },
          ]);
        }
        return;
      }
      await runIndexBuild({ silent: true });
    })();
    return () => {
      cancelled = true;
    };
    // 의도적으로 cfg 만 의존: 세션 변경 시 재실행되지 않도록.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 메시지 변경 시 세션을 자동 저장. 디스크 IO 는 비동기로 흘려보낸다.
  useEffect(() => {
    if (!onSessionUpdate) return;
    onSessionUpdate(messages).catch(() => {
      /* 저장 실패는 화면 흐름을 막지 않는다. */
    });
  }, [messages, onSessionUpdate]);

  useInput((char, key) => {
    if (key.ctrl && char === 'c') {
      app.exit();
      return;
    }
    if (!slashOpen) return;
    if (key.upArrow) {
      setMenuIndex((i) => Math.max(0, i - 1));
      return;
    }
    if (key.downArrow) {
      setMenuIndex((i) => Math.min(slashItems.length - 1, i + 1));
      return;
    }
    if (key.escape) {
      setInput('');
      return;
    }
    // Tab 자동완성 — ink-text-input 이 Tab 을 자체 처리하지 않아 충돌 없음.
    if (key.tab) {
      const sel = slashItems[Math.min(menuIndex, slashItems.length - 1)];
      if (sel) setInput(expandSlash(sel));
      return;
    }
  });

  const pushSystemInfo = useCallback((text) => {
    setMessages((m) => [...m, { role: 'system-info', text }]);
  }, []);
  const pushSystemError = useCallback((text) => {
    setMessages((m) => [...m, { role: 'system-error', text }]);
  }, []);

  const handleSlash = async (line) => {
    const [cmd, ...rest] = line.slice(1).split(/\s+/);
    const arg = rest.join(' ').trim();

    if (cmd === 'exit' || cmd === 'quit') {
      app.exit();
      return true;
    }
    if (cmd === 'help') {
      pushSystemInfo(HELP_TEXT);
      return true;
    }
    if (cmd === 'clear') {
      setMessages([]);
      pushSystemInfo('대화 컨텍스트를 비웠습니다.');
      return true;
    }
    if (cmd === 'cost') {
      pushSystemInfo(meterRef.current.format());
      return true;
    }
    if (cmd === 'model') {
      if (!arg) {
        const list = MODEL_CATALOG.map((m) => `  ${m.id.padEnd(22)} ${m.label}`).join('\n');
        pushSystemInfo('사용 가능한 모델:\n' + list);
        return true;
      }
      const next = findModel(arg);
      if (!next) {
        pushSystemError('알 수 없는 모델: ' + arg);
        return true;
      }
      try {
        const nextCfg = { ...cfg, effective: { ...cfg.effective, model: next.id } };
        const nextResolved = resolveModel(nextCfg.effective);
        meterRef.current = new TokenMeter(nextResolved.meta, nextCfg.effective.limits);
        setCfg(nextCfg);
        setResolved(nextResolved);
        pushSystemInfo('세션 모델을 ' + nextResolved.meta.label + ' 로 변경했습니다.');
      } catch (err) {
        pushSystemError(err.message);
      }
      return true;
    }
    if (cmd === 'image') {
      if (!arg) {
        pushSystemError('사용법: /image <파일 경로>  (Finder 에서 입력창 위로 끌어다 놓으면 경로가 자동 입력됩니다.)');
        return true;
      }
      // 드래그 앤 드롭 시 경로가 따옴표로 감싸지거나 백슬래시로 이스케이프되는 경우가 많아서 정리.
      const cleanedPath = arg
        .replace(/^['"]|['"]$/g, '')
        .replace(/\\ /g, ' ');
      try {
        const fs = await import('node:fs/promises');
        const abs = path.resolve(cleanedPath);
        if (!isImagePath(abs)) {
          pushSystemError('지원 안 하는 확장자: ' + path.extname(abs));
          return true;
        }
        const stat = await fs.stat(abs);
        const sizeKb = Math.max(1, Math.round(stat.size / 1024));
        setPendingAttachments((arr) => [...arr, { kind: 'image', path: abs, sizeKb }]);
        pushSystemInfo(`첨부 추가: ${path.basename(abs)} (${sizeKb}KB) · 다음 메시지와 함께 전송됨`);
      } catch (err) {
        pushSystemError('이미지를 읽을 수 없습니다: ' + err.message);
      }
      return true;
    }
    if (cmd === 'paste') {
      try {
        const attached = await pasteClipboardImage();
        const fs = await import('node:fs/promises');
        const stat = await fs.stat(attached);
        const sizeKb = Math.max(1, Math.round(stat.size / 1024));
        setPendingAttachments((arr) => [...arr, { kind: 'image', path: attached, sizeKb }]);
        pushSystemInfo(`클립보드 이미지 첨부: ${path.basename(attached)} (${sizeKb}KB)`);
      } catch (err) {
        pushSystemError(err.message);
      }
      return true;
    }
    if (cmd === 'attachments') {
      if (!pendingAttachments.length) {
        pushSystemInfo('첨부 없음.');
      } else {
        pushSystemInfo(
          '현재 첨부:\n' +
            pendingAttachments
              .map((a, i) => `  ${i + 1}. ${a.path} (${a.sizeKb}KB)`)
              .join('\n'),
        );
      }
      return true;
    }
    if (cmd === 'clear-attach') {
      setPendingAttachments([]);
      pushSystemInfo('첨부를 비웠습니다.');
      return true;
    }
    if (cmd === 'index') {
      // 명령 자체는 즉시 끝내고 빌드는 백그라운드에서 진행. 메시지로 진행 표시.
      runIndexBuild({ rebuild: arg === 'rebuild', silent: false });
      return true;
    }
    if (cmd === 'rag') {
      if (arg === 'on') {
        setRagEnabled(true);
        pushSystemInfo(hasIndex ? 'RAG on (인덱스 사용)' : 'RAG on (단, 인덱스 없음 — bc index 로 빌드)');
      } else if (arg === 'off') {
        setRagEnabled(false);
        pushSystemInfo('RAG off — 코드 컨텍스트 자동 주입 안 함.');
      } else {
        pushSystemInfo(`현재 RAG ${ragEnabled && hasIndex ? 'on' : 'off'}. 사용법: /rag on|off`);
      }
      return true;
    }
    pushSystemError('알 수 없는 명령: /' + cmd);
    return true;
  };

  const sendMessage = async (text) => {
    const userMsg = {
      role: 'user',
      text,
      attachments: pendingAttachments,
    };
    const newMessages = [...messages, userMsg];
    setMessages(newMessages);
    setPendingAttachments([]);
    setState('thinking');

    // assistant placeholder — 스트리밍하면서 채워 넣음
    const assistantIdx = newMessages.length;
    setMessages((m) => [...m, { role: 'assistant', text: '', streaming: true }]);

    // onError 와 후속 setter 가 경합하지 않게 "에러 났다" 표식을 둔다.
    // SDK 가 에러를 onError 로만 알려주는 경우도 있고, textStream throw 로 주는
    // 경우도 있어서 두 경로 모두 잡는다.
    let errorText = null;

    const replaceWithError = (msg) => {
      errorText = msg;
      setMessages((m) => {
        const next = [...m];
        next[assistantIdx] = { role: 'system-error', text: msg };
        return next;
      });
    };

    // RAG 컨텍스트 주입 — 마지막 user 메시지 기준으로 관련 코드 검색해서
    // 시스템 프롬프트에 덧붙인다 (메시지 자체는 건드리지 않아 토큰 캐싱 유지).
    let systemWithContext = cfg.system;
    if (ragEnabled && hasIndex) {
      try {
        const res = await searchIndex(text, cfg.effective, { topK: 5, minScore: 0.2 });
        if (res.ok && res.results.length > 0) {
          const block = res.results
            .map(
              (r) =>
                `// ${r.chunk.file}:${r.chunk.startLine}-${r.chunk.endLine}  (score=${r.score.toFixed(3)})\n${r.chunk.text}`,
            )
            .join('\n\n');
          systemWithContext +=
            '\n\n관련 코드 (코드베이스 인덱스에서 검색):\n```\n' + block + '\n```\n' +
            '위 코드를 우선 참조해서 답하라. 새 컴포넌트가 이미 있으면 재사용을 권장하라.';
        }
      } catch {
        /* RAG 실패는 챗 흐름을 막지 않는다 — 그냥 컨텍스트 없이 진행. */
      }
    }

    try {
      const sdkMessages = await toSdkMessages(newMessages);

      // 프로젝트 루트 결정: bc.config.json 이 있는 디렉터리, 없으면 cwd.
      const projectRoot = cfg.paths.projectFile
        ? path.dirname(cfg.paths.projectFile)
        : process.cwd();

      // 툴 실행 이벤트는 채팅에 시스템 메시지로 표시 (사용자가 무엇이 일어났는지 보게).
      const onToolEvent = (ev) => {
        const labels = {
          write_created: '🆕 생성',
          write_overwritten: '✏️  덮어씀',
          write_skipped: '⏭  스킵',
          edit: '✏️  편집',
        };
        const label = labels[ev.kind] ?? ev.kind;
        const detail =
          ev.lines != null
            ? `(${ev.lines} lines)`
            : ev.added != null
              ? `(+${ev.added} / -${ev.removed} lines)`
              : '';
        setMessages((m) => [
          ...m,
          { role: 'system-info', text: `${label} ${ev.path} ${detail}`.trim() },
        ]);
      };

      const tools = buildTools({
        projectRoot,
        effective: cfg.effective,
        onEvent: onToolEvent,
      });

      const result = streamText({
        model: resolved.model,
        system: systemWithContext,
        messages: sdkMessages,
        tools,
        stopWhen: stepCountIs(12),
        onError: ({ error }) => {
          replaceWithError('AI 호출 에러: ' + (error?.message ?? String(error)));
        },
      });

      setState('streaming');
      let acc = '';
      try {
        // fullStream 으로 tool-call / tool-result / text-delta 다 다룸.
        for await (const part of result.fullStream) {
          if (part.type === 'text-delta') {
            acc += part.text;
            setMessages((m) => {
              const next = [...m];
              next[assistantIdx] = { role: 'assistant', text: acc, streaming: true };
              return next;
            });
          } else if (part.type === 'tool-call') {
            // 모델이 툴을 호출하는 순간 — 한 줄로 표시.
            const argSummary = summarizeToolInput(part.toolName, part.input);
            setMessages((m) => [
              ...m,
              {
                role: 'system-info',
                text: `🔧 ${part.toolName}(${argSummary})`,
              },
            ]);
          } else if (part.type === 'tool-error') {
            setMessages((m) => [
              ...m,
              {
                role: 'system-error',
                text: `툴 에러 (${part.toolName ?? '?'}): ${part.error?.message ?? part.error}`,
              },
            ]);
          } else if (part.type === 'error') {
            replaceWithError('스트림 에러: ' + (part.error?.message ?? String(part.error)));
          }
        }
      } catch (streamErr) {
        replaceWithError('스트리밍 중단: ' + (streamErr?.message ?? String(streamErr)));
      }

      // 에러가 안 났을 때만 final assistant 로 마무리.
      if (!errorText) {
        if (acc.length === 0) {
          // 텍스트가 없어도 툴만 호출하고 끝났을 수 있음 — 그건 정상.
          // finishReason 으로 진짜 비정상인지 분기.
          let reason = 'unknown';
          try {
            reason = await result.finishReason;
          } catch {
            /* noop */
          }
          if (reason === 'tool-calls' || reason === 'stop') {
            // 툴만 호출하고 자연스럽게 멈춤 → placeholder 제거.
            setMessages((m) => {
              const next = [...m];
              if (next[assistantIdx]?.role === 'assistant' && !next[assistantIdx].text) {
                next.splice(assistantIdx, 1);
              }
              return next;
            });
          } else {
            replaceWithError(`빈 응답 (finishReason=${reason}). API 키/크레딧/모델을 확인하세요.`);
          }
        } else {
          setMessages((m) => {
            const next = [...m];
            next[assistantIdx] = { role: 'assistant', text: acc, streaming: false };
            return next;
          });
        }
      }

      try {
        const usage = await result.usage;
        meterRef.current.add(usage);
        rerender();
      } catch {
        /* SDK 가 usage 안 줬으면 그냥 패스 */
      }
    } catch (err) {
      replaceWithError('스트리밍 실패: ' + (err?.message ?? String(err)));
    } finally {
      setState('idle');
    }
  };

  const onSubmit = async (raw) => {
    const line = raw.trim();

    // 슬래시 메뉴가 열려 있으면 Enter 의 의미가 두 갈래:
    //   1) input 이 메뉴의 아이템 cmd 와 정확히 일치 + 인자 필요 없는 명령 → 즉시 실행
    //   2) 그 외 → 선택 항목으로 자동완성만 (실행은 Enter 한 번 더)
    if (slashOpen) {
      const sel = slashItems[Math.min(menuIndex, slashItems.length - 1)];
      const exact = slashItems.find((it) => it.cmd === line);
      if (exact && !exact.hint) {
        // 정확히 매칭 + 인자 불필요 → 바로 실행
        setInput('');
        await handleSlash(exact.cmd);
        return;
      }
      // 자동완성만 하고 멈춤 — 사용자가 인자를 더 칠 수 있게.
      if (sel) setInput(expandSlash(sel));
      return;
    }

    setInput('');
    if (!line) return;

    if (line.startsWith('/')) {
      await handleSlash(line);
      return;
    }
    await sendMessage(line);
  };

  return h(
    Box,
    { flexDirection: 'column' },
    h(Header, {
      modelMeta: resolved.meta,
      projectFile: cfg.paths.projectFile,
      gateway: cfg.effective.gateway,
      ragOn: ragEnabled,
      hasIndex,
      openapiInfo: cfg.openapiInfo,
    }),
    h(
      Box,
      { flexDirection: 'column', marginTop: 1 },
      ...messages.map((m, i) => h(MessageBubble, { key: i, message: m })),
    ),
    h(
      Box,
      { marginTop: 1 },
      h(StatusLine, {
        state,
        meter: meterRef.current,
        indexBusy,
        indexProgress,
      }),
    ),
    h(AttachBar, { pending: pendingAttachments }),
    slashOpen ? h(SlashMenu, { items: slashItems, activeIndex: menuIndex }) : null,
    h(
      Box,
      { marginTop: 0 },
      h(Text, { color: 'magenta', bold: true }, 'you › '),
      state === 'idle'
        ? h(TextInput, {
            value: input,
            onChange: setInput,
            onSubmit,
            placeholder: '질문을 입력하거나 / 로 명령 메뉴 …',
            // ink 가 그리는 가짜 커서(인버스 한 칸)를 끔. 실제 터미널 커서를
            // 위 useEffect 가 강제로 켜놓아서 입력 끝에 위치하므로
            // 가짜 커서가 있으면 한글 IME 미리보기가 한 칸 어긋나 보일 수 있다.
            showCursor: false,
          })
        : h(Text, { dimColor: true }, '(응답 받는 중 — 잠시만)'),
    ),
  );
}

export default ChatApp;
