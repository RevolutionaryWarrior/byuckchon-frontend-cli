import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';

import { findProjectConfigPath } from '../config/index.js';

/**
 * 챗 세션을 디스크에 저장/복구한다.
 *
 * 저장 위치 우선순위:
 *   1) 프로젝트 안:  <projectRoot>/.bc/history/<id>.json
 *      - bc.config.json 이 발견된 경우 그 옆 .bc 폴더 사용
 *      - 자동으로 .gitignore 에 들어감 (사용자 .gitignore 에 .bc/ 박혀있다는 가정)
 *   2) 글로벌:       ~/.bc/history/<cwdHash>/<id>.json
 *      - bc.config.json 이 없는 경우 (예: 빈 폴더에서 bc chat 실행)
 *
 * 동기 디스크 IO 는 ink 렌더에 끼지 않게 모두 await.
 */

function cwdHash(cwd) {
  return crypto.createHash('sha1').update(cwd).digest('hex').slice(0, 12);
}

function makeId(date = new Date()) {
  const pad = (n, w = 2) => String(n).padStart(w, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}_${pad(
    date.getHours(),
  )}-${pad(date.getMinutes())}-${pad(date.getSeconds())}`;
}

export async function getHistoryDir(cwd = process.cwd()) {
  const projectConfig = await findProjectConfigPath(cwd);
  if (projectConfig) {
    return path.join(path.dirname(projectConfig), '.bc', 'history');
  }
  return path.join(os.homedir(), '.bc', 'history', cwdHash(cwd));
}

export async function createSession({ model, cwd = process.cwd() } = {}) {
  const dir = await getHistoryDir(cwd);
  await fs.mkdir(dir, { recursive: true });
  const id = makeId();
  const session = {
    id,
    startedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    model,
    cwd,
    messages: [],
  };
  return { ...session, _file: path.join(dir, `${id}.json`) };
}

export async function saveSession(session) {
  const file = session._file;
  if (!file) throw new Error('session._file 누락');
  const data = {
    id: session.id,
    startedAt: session.startedAt,
    updatedAt: new Date().toISOString(),
    model: session.model,
    cwd: session.cwd,
    messages: session.messages,
  };
  await fs.writeFile(file, JSON.stringify(data, null, 2) + '\n', 'utf8');
}

export async function listSessions(cwd = process.cwd(), { limit = 20 } = {}) {
  const dir = await getHistoryDir(cwd);
  let entries = [];
  try {
    entries = await fs.readdir(dir);
  } catch (e) {
    if (e.code === 'ENOENT') return [];
    throw e;
  }
  const files = entries.filter((f) => f.endsWith('.json')).sort().reverse();
  const out = [];
  for (const name of files.slice(0, limit)) {
    const file = path.join(dir, name);
    try {
      const raw = await fs.readFile(file, 'utf8');
      const data = JSON.parse(raw);
      const firstUser = data.messages?.find((m) => m.role === 'user');
      out.push({
        id: data.id,
        file,
        startedAt: data.startedAt,
        updatedAt: data.updatedAt,
        model: data.model,
        turns: data.messages?.length ?? 0,
        preview: firstUser?.text?.slice(0, 60) ?? '(빈 세션)',
      });
    } catch {
      /* 잘못된 파일 스킵 */
    }
  }
  return out;
}

export async function loadSession(idOrFile, cwd = process.cwd()) {
  let file = idOrFile;
  if (!file.endsWith('.json') || !path.isAbsolute(file)) {
    const dir = await getHistoryDir(cwd);
    file = path.join(dir, idOrFile.endsWith('.json') ? idOrFile : `${idOrFile}.json`);
  }
  const raw = await fs.readFile(file, 'utf8');
  const data = JSON.parse(raw);
  return { ...data, _file: file };
}

export async function loadLatestSession(cwd = process.cwd()) {
  const list = await listSessions(cwd, { limit: 1 });
  if (list.length === 0) return null;
  return loadSession(list[0].id, cwd);
}
