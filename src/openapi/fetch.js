import fs from 'node:fs/promises';
import path from 'node:path';

/**
 * OpenAPI 스펙을 URL/파일경로/JSON객체 중 무엇으로 받든 정상화해서
 * `{ source, doc }` 로 돌려준다.
 *
 * - URL  ('http://' / 'https://') → fetch 후 파싱
 * - 파일 경로 (.json / .yaml / .yml) → 디스크에서 읽기
 *   - YAML 은 openapi-typescript 에 그대로 넘겨도 되지만, 우리가 endpoint 요약을
 *     뽑을 땐 JSON 객체가 필요해서 yaml 파서가 필요함. 의존성 키우지 않도록
 *     YAML 인 경우 doc 필드는 null 로 두고 source(원본 문자열)만 반환한다.
 * - 그 외 → 에러
 *
 * 반환된 source 는 openapi-typescript 의 입력으로 그대로 쓸 수 있다.
 */
export async function loadOpenApi(input) {
  if (!input) {
    const e = new Error('OpenAPI 입력이 비어있습니다 (URL 또는 파일 경로 필요).');
    e.code = 'BC_NO_OPENAPI_INPUT';
    throw e;
  }

  // URL?
  if (/^https?:\/\//.test(input)) {
    const res = await fetch(input);
    if (!res.ok) {
      const e = new Error(`OpenAPI fetch 실패: ${res.status} ${res.statusText} (${input})`);
      e.code = 'BC_OPENAPI_FETCH_FAILED';
      throw e;
    }
    const text = await res.text();
    let doc = null;
    try {
      doc = JSON.parse(text);
    } catch {
      // 서버가 YAML 을 줄 수도 있다 — 객체 추출은 포기하지만 source(URL) 는 그대로.
    }
    return { source: input, text, doc };
  }

  // 로컬 파일?
  const abs = path.resolve(input);
  let stat;
  try {
    stat = await fs.stat(abs);
  } catch {
    const e = new Error(`OpenAPI 파일을 찾을 수 없습니다: ${input}`);
    e.code = 'BC_OPENAPI_FILE_NOT_FOUND';
    throw e;
  }
  if (!stat.isFile()) {
    const e = new Error(`OpenAPI 경로가 파일이 아닙니다: ${input}`);
    e.code = 'BC_OPENAPI_NOT_A_FILE';
    throw e;
  }
  const text = await fs.readFile(abs, 'utf8');
  let doc = null;
  if (abs.endsWith('.json')) {
    try {
      doc = JSON.parse(text);
    } catch (err) {
      const e = new Error(`JSON 파싱 실패: ${err.message}`);
      e.code = 'BC_OPENAPI_PARSE_FAILED';
      throw e;
    }
  }
  return { source: abs, text, doc };
}
