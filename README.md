# byuckchon-frontend-cli

[byuckchon](https://www.byuckchon.com) 프론트엔드 팀의 **프로젝트 스타터 + AI 어시스턴트** CLI.
React(Vite) / Next.js(App Router) TypeScript 프로젝트를 만들고, `bc chat` 으로 AI 와 코드 이야기를 나눌 수 있습니다.

## 요구 사항

- [Node.js](https://nodejs.org/) 18+ (LTS 권장)
- AI 사용 시: Anthropic 또는 OpenAI API 키

## 설치

`bc` 는 **CLI 툴** 이라서 프로젝트 의존성으로 설치하면 안 되고, **글로벌**(또는 `npx`)로 써야 합니다.

```bash
# 글로벌 설치 (제일 흔한 방식)
npm install -g byuckchon-frontend-cli
pnpm add -g byuckchon-frontend-cli
yarn global add byuckchon-frontend-cli

# 또는 설치 없이 일회성
npx byuckchon-frontend-cli adopt
pnpm dlx byuckchon-frontend-cli adopt
```

설치되면 `bc` / `byuckchon-frontend-cli` 두 개 다 PATH 에 깔립니다.

### 모노레포에서 쓰기

`bc` 자체는 **루트에 한 번만** 글로벌 설치하면 충분합니다. 다만 `bc.config.json` 은
**각 패키지(앱) 디렉터리마다 따로** 두는 걸 권장 — Tailwind 버전, 라우팅, 스타일링이
앱마다 다르면 `detected.*` 가 달라야 RAG 컨텍스트도 정확해집니다.

```bash
# 루트에서 한 번만
npm i -g byuckchon-frontend-cli

# 각 앱마다 따로 셋업
cd apps/web    && bc adopt    # apps/web/bc.config.json 생성
cd apps/mobile && bc adopt    # apps/mobile/bc.config.json 생성

# 일할 땐 그 앱 디렉토리에서 실행
cd apps/web && bc             # apps/web/bc.config.json 을 자동으로 읽어감
```

`bc` 는 실행 디렉토리에서 위로 거슬러 올라가며 가장 가까운 `bc.config.json` 을 찾습니다.
즉 모노레포 루트에 `bc.config.json` 이 없고 `apps/web/bc.config.json` 만 있으면,
`apps/web/somewhere/deeper/...` 에서 `bc` 를 쳐도 `apps/web/bc.config.json` 이 잡힙니다.

> 만약 `pnpm add byuckchon-frontend-cli` (글로벌 플래그 없이) 한 상태에서 `bc` 가
> 안 먹는다면, 이건 패키지 의존성으로 박혀서 그래요. `pnpm remove byuckchon-frontend-cli`
> 후 위처럼 `pnpm add -g` 로 다시 설치해주세요.

## 명령

### `bc init` — 새 프로젝트 만들기

```bash
bc init
```

프로젝트 이름, 프레임워크, **기본 AI 모델, Figma URL, OpenAPI URL** 을 묻고
새 폴더에 코드 + `bc.config.json` 까지 만들어 줍니다.

### 에이전트 모드 — AI 가 실제 파일을 만들고 고친다 (v1.5+)

`bc chat` 은 더 이상 채팅창에 코드 블록을 출력만 하지 않습니다. **모델이 직접 툴을 호출해서
파일을 만들고/고칩니다** (Codex CLI / Cursor agent 와 같은 컨셉).

내장된 툴:

| 툴            | 동작                                                   |
| ------------- | ------------------------------------------------------ |
| `read_file`   | 프로젝트 내 파일/디렉터리 내용 읽기                     |
| `list_files`  | 글롭 패턴으로 파일 나열                                 |
| `search_code` | RAG 인덱스 의미 기반 검색 (인덱스 있어야 함)             |
| `search_openapi` | OpenAPI 스펙에서 엔드포인트 검색 (path/summary/tag) — 큰 스펙도 OK |
| `get_openapi_endpoint` | 특정 엔드포인트 상세 (params/requestBody/responses, `$ref` 인라인) |
| `write_file`  | 새 파일 생성 또는 통째 덮어쓰기                          |
| `edit_file`   | 유일한 `old_string → new_string` 으로 부분 수정 (안전)  |
| `fetch_figma` / `fetch_figma_image` / `fetch_figma_styles` | Figma 디자인/이미지/토큰 |

모델은 한 턴 안에서 **최대 12 step** 까지 툴을 자유롭게 호출합니다. 일반적인 흐름:
1. `list_files` 로 `src/api/` 구조 파악
2. `read_file` 로 기존 모듈 2~3개 읽고 컨벤션 학습
3. `search_code` 로 fetch 래퍼 / hook 패턴 검색
4. `write_file` 로 `api/`, `service/`, `hook/`, `schema/`, `types/` 파일들을 한꺼번에 생성
5. 마지막에 만든 파일 목록과 import 가이드를 짧게 요약

모든 파일 경로는 `bc.config.json` 이 있는 디렉터리(=프로젝트 루트) 하위로만 강제됩니다.
`../` 이나 절대경로 탈출은 에러로 거부.

> **승인 게이트 (Phase 4 예정):** 지금은 모델이 write/edit 을 호출하면 즉시 디스크에 반영됩니다.
> 안전망은 git diff. 매 작업 후 `git status` / `git diff` 로 확인하고, 마음에 안 들면 `git checkout .` 으로 되돌리세요.
> 다음 버전에서 per-file 승인(`y/n/v`) 옵션 추가 예정.

### Figma 연동 — 디자인 → 코드 (v1.6+)

채팅 안에서 모델이 직접 Figma REST API 를 호출해서 디자인 정보를 읽고 컴포넌트/페이지를 만듭니다.

#### 사용자가 한 번만 하는 셋업

```bash
# 1) Figma → Settings → Personal access tokens → "Generate new token"
#    Read 권한만 있으면 충분 (file 읽기 / image export 둘 다 read 로 됨)

# 2) 토큰을 .env 에 박기 (gitignore 됨)
echo "FIGMA_TOKEN=figd_xxxxxxxxxxxxxxxx" >> .env

# 3) bc.config.json 의 design.figma 에 파일/노드 URL 박기 (bc adopt 시점에 입력하거나 직접 편집)
```

`bc.config.json` 예시:

```json
{
  "design": {
    "figma": "https://www.figma.com/design/ABC123/Marketd-Admin?node-id=2-105",
    "figmaTokenEnv": "FIGMA_TOKEN"
  }
}
```

#### 디자이너 협업이 필요한 부분

| 디자이너 측 작업                       | 왜 필요?                                                  |
| --------------------------------------- | --------------------------------------------------------- |
| 프레임/컴포넌트에 **의미 있는 이름**     | `Frame 21` 이 아니라 `Card/Product/Sold-out` 처럼 의미별로 — AI 가 이름으로 컴포넌트 이름과 variant 를 추론합니다. |
| **Auto layout** 적용                    | 안 쓰면 픽셀 좌표만 떨어져 `position: absolute` 코드가 나옵니다. Auto layout 이면 자동으로 `flex`/`gap` 변환. |
| **로컬 스타일** 등록 (color/text)        | "Brand/Primary" 같은 스타일을 등록해두면 `fetch_figma_styles` 로 디자인 토큰을 일괄 추출해서 Tailwind 테마로 바로 박을 수 있어요. |
| **Components** 화 (♦ 마름모 아이콘)     | 반복 UI 가 component 면 모델이 "이거 디자인 시스템 컴포넌트구나" 인식 → 코드에서도 재사용 컴포넌트를 만듭니다. |
| frame 별로 **"Copy link to selection"** | 일반 share link 는 파일 전체. 특정 frame URL 을 받아야 AI 가 그것만 정확히 가져옵니다. |

#### 채팅에서 쓰는 법

```text
you › 새 멤버 카드 컴포넌트 만들어줘. 디자인은 https://www.figma.com/design/.../?node-id=12-34 이거 참고해서.

🔧 fetch_figma("https://www.figma.com/design/.../?node-id=12-34")
🔧 list_files("src/components/**/Card*")
🔧 read_file("src/components/Card/ProductCard.tsx")
🆕 생성 src/components/Card/MemberCard/MemberCard.tsx (52 lines)
🆕 생성 src/components/Card/MemberCard/index.ts (3 lines)
bc › Auto layout 이 row 였고 padding 12/16 이었어요. MemberCard 만들었습니다.
     기존 ProductCard 와 같은 폴더 컨벤션을 따랐어요.
```

내장 Figma 툴:

| 툴                    | 동작                                                          |
| --------------------- | ------------------------------------------------------------- |
| `fetch_figma`         | 노드 트리 (autoLayout / fills / text / size / children) 가져오기 |
| `fetch_figma_image`   | 프레임을 PNG/JPG/SVG 로 export — public asset 으로 저장도 가능 |
| `fetch_figma_styles`  | 파일의 컬러/타이포 토큰 목록 → 디자인 토큰 generator 만들 때    |

> Figma 응답은 자동으로 압축됩니다 (자식 60개, 깊이 8 까지). 너무 큰 프레임은 더 작은
> 자식 frame URL 을 줘서 분할 정복하세요.

### 팀 컨벤션 문서(.md) 자동 주입 (v1.8+)

FE 전반의 규칙(폴더 구조, 네이밍, 스웨거 → 코드 변환 규칙 등)을 `.md` 로 적어두면
**매 chat 세션에 시스템 프롬프트로 자동 주입**됩니다. AI 는 기존 코드 패턴보다 이 문서를 우선합니다.

**파일명은 고정이 아닙니다.** 아무 경로나 `bc.config.json` 의 `docs` 에 적으면 됩니다.
적지 않으면 관례 파일명(`bc.md`, `.bc/conventions.md`, `AGENTS.md`, `FRONTEND.md`, `docs/frontend.md`)을 자동 탐지합니다.

```json
{
  "docs": ["docs/fe-conventions.md", "docs/api-guide.md"]
}
```

- 문서당 최대 24KB, 전체 48KB 까지 (토큰 폭발 방지). 헤더에 `docs` 줄로 로드된 파일이 표시됩니다.
- (고급) 항목을 `{ "path": "...", "when": { "framework": "next" } }` 형태로 적으면 프레임워크별 조건부 주입도 가능합니다.

#### API 코드 컨벤션 .md 자동 포함

`bc init` / `bc adopt` 를 실행하면 **API 코드 생성 가이드(`api-codegen.md`)가 프레임워크에 맞는 위치에 자동으로 깔립니다.**

| 프레임워크 | 위치 |
| --- | --- |
| React (Vite/CRA 등) | `src/api/api-codegen.md` |
| Next.js | `lib/api/api-codegen.md` |

- 이 파일은 `bc.config.json` 의 `docs` 에 자동 등록되어 **chat 시작 시 주입**됩니다.
- 하나의 .md 로 React/Next 를 모두 다루며(차이는 위치뿐), 팀 규칙에 맞게 직접 다듬어 쓰면 됩니다.
- 이미 파일이 있으면 덮어쓰지 않습니다.

### OpenAPI / 코드 컨텍스트 — 자동 주입 (v1.4+)

`bc.config.json` 의 `api.openapi` 와 코드 인덱스는 **chat 시작할 때 알아서 준비됩니다.**
즉, 명령을 외울 필요 없이 그냥 `bc` 만 치고 자연어로 일을 시키면 됩니다.

- **OpenAPI**: chat 시작 시 자동 fetch + 1시간 디스크 캐시 → 엔드포인트 요약을 시스템 프롬프트에 박음.
  - 헤더에 `openapi` 줄로 표시. 캐시 hit 면 `(cached)`, fresh fetch 면 `(live)`.
- **코드 인덱스**: chat 시작 시 인덱스 파일이 없으면 **백그라운드에서 자동 빌드**.
  - 빌드 중에는 화면에 `📚 인덱싱 중 ...` 진행 표시. 끝나면 `✓` 메시지 한 줄.
  - OpenAI 키가 없으면 빌드를 건너뛰고 도움 메시지를 띄움 (Anthropic 은 임베딩 API 미제공).
- **수동 컨트롤이 필요할 때:**

| 시나리오                                | 명령                                                |
| --------------------------------------- | --------------------------------------------------- |
| 인덱스 다시 빌드 (chat 안에서)          | `/index` 또는 `/index rebuild`                       |
| 인덱스 다시 빌드 (chat 밖에서)          | `bc index` / `bc index --rebuild`                   |
| 인덱스 상태/검색                         | `bc index status` / `bc index search "토큰 갱신"`    |
| OpenAPI → `*.gen.ts` 결정론 생성         | `bc gen api-types` (필요할 때만, AI 가 권하기도 함) |
| RAG 잠시 끄기                            | chat 안에서 `/rag off`                              |

#### 예시 — 진짜로 명령 안 외우고 시키기

`bc.config.json` 에 Swagger URL 만 박혀 있으면:

```text
you › api/seller 부분 GET~POST 내 api 폴더 구조 참고해서 코드 짜줘
```

→ 모델이 자동 주입된 OpenAPI 요약 + RAG 로 가져온 `src/api/*` 컨텍스트를 보고
   해당 프로젝트 컨벤션(예: 기존 fetch 래퍼, axios 인스턴스, TanStack Query 훅 패턴)에 맞춰 코드를 짜 줍니다.
   타입이 부족하면 모델이 **"`bc gen api-types` 한 번 돌려달라"** 고 직접 안내해 줍니다.

> 비결정론적 코드 생성보다 결정론적인 타입 생성이 안전한 부분(예: `*.gen.ts`) 만 별도 명령으로 빼두고,
> 컴포넌트/엔드포인트 호출 코드는 채팅으로 처리하는 하이브리드 구조입니다.

#### `bc gen api-types` (선택) — OpenAPI → TS 타입 결정론 생성

```bash
bc gen api-types                                          # bc.config.json 의 api.openapi 사용
bc gen api-types --source https://api.dev/openapi.json    # URL 직접
bc gen api-types --source ./openapi.yaml                  # 로컬 파일
bc gen api-types --out src/api/types.gen.ts               # 출력 경로 지정 (기본값)
```

```ts
import type { paths, components } from '@/api/types.gen';

type ListUsersResponse =
  paths['/users']['get']['responses']['200']['content']['application/json'];
type User = components['schemas']['User'];
```

### `bc adopt` — 기존 프로젝트에 bc 설정만 깔기

```bash
cd 내-Expo-프로젝트
bc adopt
```

`package.json` 과 디렉터리를 스캔해서 **프레임워크/언어/스타일/라우팅/패키지 매니저** 를 자동 감지하고,
Figma·OpenAPI URL 만 추가로 묻고 `bc.config.json` 만 떨궈줍니다.
**소스 코드는 절대 건드리지 않습니다.**

지원 감지: Next.js · Expo · Electron · Vite+React · Remix · CRA · 일반 React.

### `bc chat` — AI 와 대화 (ink TUI)

```bash
bc                                         # 인자 없이도 chat 진입 (제일 짧은 단축키)
bc start                                   # chat 의 alias
bc chat                                    # ink 풀 TUI (기본)
bc chat --model claude-haiku-4             # 이번 세션만 모델 지정
bc chat --plain                            # 단순 readline 모드
bc chat --once "useEffect 의존성 배열 누락된 거 어떻게 찾아?"   # 1회성 호출 (CI/스크립트)
bc chat -c                                 # 가장 최근 세션 이어가기
bc chat --list-history                     # 저장된 세션 목록
bc chat --resume 2026-06-19_15-23-45       # 특정 세션 이어가기
```

**슬래시 명령 자동완성:** 입력창에서 `/` 만 쳐도 사용 가능한 명령이 메뉴로 펼쳐집니다.
계속 타이핑하면 필터링되고, `↑↓` 로 이동, `Enter` 또는 `Tab` 으로 자동완성, `Esc` 로 취소.

대화 세션은 자동으로 디스크에 저장됩니다:

- 프로젝트 안에서 실행 → `<projectRoot>/.bc/history/<id>.json` (`.bc/` 는 gitignore 됨)
- 그 외 → `~/.bc/history/<cwd-hash>/<id>.json`

매 턴마다 자동 저장돼서 터미널이 닫히거나 충돌해도 `bc chat -c` 로 바로 복구할 수 있습니다.

TTY 안에서 자동으로 ink 모드로 뜨고, 파이프/CI 같은 비-TTY 환경에서는
`--plain` 모드로 자동 폴백합니다.

세션 내 슬래시 명령:

| 명령                | 동작                                       |
| ------------------- | ------------------------------------------ |
| `/help`             | 도움말                                     |
| `/clear`            | 대화 컨텍스트 초기화                        |
| `/model [id]`       | 세션 모델 변경 (인자 없으면 목록)           |
| `/cost`             | 누적 토큰/비용                              |
| `/image <path>`     | 다음 메시지에 이미지 첨부 (Vision 모델 권장) |
| `/paste`            | 클립보드 이미지 첨부 (macOS, `pngpaste` 필요) |
| `/attachments`      | 현재 첨부 목록                              |
| `/clear-attach`     | 첨부 비우기                                 |
| `/index [rebuild]`  | 코드 인덱스 빌드/재빌드 (자동 빌드된 거 갱신) |
| `/rag on\|off`      | RAG 컨텍스트 주입 즉석 토글                 |
| `/exit`             | 종료 (`Ctrl+C` 도 가능)                     |

이미지 첨부는 png / jpg / jpeg / gif / webp 만 지원하며,
Claude / GPT 비전 모델에 멀티파트 메시지로 전달됩니다.

**이미지 첨부 3가지 방법:** (ink·plain 모드 모두 지원 — v1.6.1+)
1. `/image ./shot.png` — 경로 직접
2. **드래그 & 드롭** — `/image ` 까지 입력 후, Finder 에서 파일을 터미널 위로 끌어다 놓으면 절대경로가 자동 입력됩니다. Enter.
3. `/paste` — **macOS 한정**, 클립보드의 이미지(예: `Cmd+Shift+4` 스크린샷 또는 Finder 에서 `Cmd+C` 한 이미지)를 바로 첨부.
   - 사전에 `brew install pngpaste` 한 번 필요.

> **터미널에서 `Cmd+V` 로 직접 붙이기는 왜 안 되나?** 터미널 앱은 클립보드의 "이미지 바이트" 를
> 앱에 전달하지 않고 텍스트만 줍니다 (OS/터미널 공통 제약). 그래서 클립보드 이미지를 붙이려면
> `/paste` 가 `pngpaste` 로 클립보드를 직접 읽어 첨부합니다 — `Cmd+C` → 입력창에 `/paste` → Enter.

> **썸네일 미리보기:** iTerm2 · kitty · WezTerm 에서는 plain 모드에서 첨부 직후 작은 썸네일이
> 인라인으로 표시됩니다. 그 외 터미널은 파일명 + 용량만 표시됩니다 (터미널이 이미지 렌더링을
> 지원하지 않기 때문).

### 한글 입력이 자꾸 씹힐 때 (v1.6+)

`ink` 의 TextInput 은 macOS 한글 IME 의 조합 단계와 충돌해 글자가 한 박자 늦게 보이거나
빠뜨려지는 경우가 있습니다 — ink-text-input 의 알려진 한계입니다.

**가장 확실한 해결**: 입력 모드를 plain(readline) 으로 영구 전환

```bash
bc config set-ui plain    # 글로벌로 plain 모드 고정
# 한글 입력 안정, 모든 기본 기능 동작 (RAG, OpenAPI, Figma 툴 호출까지)
# 단, ink 전용 기능 일부 미지원: 슬래시 자동완성 메뉴, 인라인 이미지 첨부
```

ink 로 다시 돌아오려면:
```bash
bc config set-ui ink
```

일회성으로 plain 만 쓰고 싶으면 `bc chat --plain`.

### `bc config` — 설정

```bash
bc config show                              # 현재 적용 중인 설정 확인
bc config set-model                         # 대화형 모델 선택
bc config set-model claude-sonnet-4-5       # 직접 지정
bc config set-key anthropic                 # 키 안전 입력 (가려짐)
bc config set-key anthropic sk-ant-...      # 직접 지정
bc config set-gateway https://ai.example.com  # 사내 게이트웨이 모드
bc config set-gateway                       # 게이트웨이 해제 (BYOK 모드)
bc config set-ui plain                      # 한글 IME 안정 모드
bc config set-ui ink                        # 풀 TUI 복귀
```

## 설정 위치

```
~/.bc/config.json     # 글로벌 — API 키, 기본 모델 (chmod 600)
<project>/bc.config.json   # 프로젝트별 — Figma/OpenAPI 링크, 기본 모델 강제
.env                   # 프로젝트 — ANTHROPIC_API_KEY 등 (자동 로드)
```

우선순위: **환경변수 > 글로벌 키**, **프로젝트 모델 > 글로벌 모델**.

## 지원 모델

| id                  | provider  | 추천 용도                          |
| ------------------- | --------- | ---------------------------------- |
| `claude-sonnet-4-5` | anthropic | 기본 — 코드 Q&A, 리팩터, 컴포넌트   |
| `claude-haiku-4`    | anthropic | 짧은 작업, 커밋 메시지 (저렴)       |
| `claude-opus-4-5`   | anthropic | 큰 리팩터, 아키텍처 설계 (고가)     |
| `gpt-5`             | openai    | 일반 코드                          |
| `gpt-5-mini`        | openai    | 저렴한 OpenAI                      |

## 토큰/비용 안전장치

- 세션 누적이 `limits.warnAtTokens` 를 넘으면 경고 출력.
- 한 요청 추정 토큰이 `limits.confirmAtTokens` 를 넘으면 확인.
- BYOK 가 기본 — 외부에서 깔아도 우리 비용은 0.
- 사내에서는 게이트웨이 모드로 사용량 모니터링 가능.

## 로드맵

- [x] Phase 1: provider 추상화, 글로벌/프로젝트 설정, 스트리밍 REPL
- [x] Phase 2a: ink 기반 풀 TUI, 이미지 첨부 (`/image`)
- [x] Phase 2b: 프로젝트 자동 감지(`bc adopt`), 세션 영구 저장(`-c`/`-r`/`--list-history`)
- [x] Phase 3a: 코드베이스 RAG (`bc index`, `/rag` 토글, 자동 컨텍스트 주입)
- [x] Phase 3b: `bc gen api-types` (OpenAPI → TS 타입), `/paste` 클립보드 이미지, 한글 IME 수정
- [x] Phase 3c-1: chat 시작 시 인덱스 자동 빌드, OpenAPI 자동 fetch+캐시+시스템 프롬프트 주입
- [x] v1.4.1 — `deepMerge(null, obj)` TypeError 수정 (`bc adopt` 한 프로젝트에서 모든 명령이 터지던 버그)
- [x] v1.5.0 — 에이전트 모드 (read/list/search/write/edit 툴) — AI 가 실제 파일을 만든다
- [x] v1.6.0 — Figma 툴 (fetch_figma / image / styles), 한글 IME 안정 plain 모드 (`bc config set-ui plain`)
- [x] v1.6.1 — 툴 스키마 `jsonSchema()` 래핑 (`schema is not a function` 수정), plain 모드 이미지 첨부(`/image`·`/paste`) + iTerm2/kitty 인라인 썸네일
- [x] v1.7.0 — OpenAPI 검색 툴 (`search_openapi` / `get_openapi_endpoint`) — 큰 스펙(수백 엔드포인트)에서도 정확한 경로/스키마 조회. 요약도 path 당 1줄로 압축 + 한도 상향
- [ ] v1.8.0 — write/edit 승인 게이트 (`y/n/v/q`), diff 미리보기
- [ ] Phase 3c-2: Figma 실 fetch (URL → 노드 트리 → 컴포넌트 인텐트)
- [ ] Phase 4: `bc gen component/page` (AST 편집 + 검증 루프), `/apply` diff 미리보기

## 라이선스

MIT
