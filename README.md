# byuckchon-frontend-cli

[byuckchon](https://www.byuckchon.com) 프론트엔드 팀을 위한 프로젝트 스타터이자
AI 개발 어시스턴트 CLI입니다. 

```text
프로젝트 생성 또는 연결
→ 프로젝트 문맥(Figma · OpenAPI · 컨벤션) 등록
→ AI와 대화하며 코드 탐색·생성·수정
→ PR에서 기계적인 컨벤션을 자동 리뷰
```


## 요구 사항

- Node.js 18+ (LTS 권장)
- AI 사용 시: Anthropic 또는 OpenAI API 키

## 설치


`bc`는 프로젝트 내부에서 사용하는 라이브러리가 아니라 **CLI 도구**입니다.

따라서 프로젝트 의존성으로 설치하지 않고, 다음 중 한 가지 방식으로 사용합니다.

### 1. 글로벌 설치


```bash
# npm
npm install -g byuckchon-frontend-cli

# pnpm
pnpm add -g byuckchon-frontend-cli

# yarn
yarn global add byuckchon-frontend-cli
```

### 2. 설치 없이 일회성 실행

글로벌 설치를 원하지 않는다면 `npx` 또는 `pnpm dlx`로 실행할 수 있습니다.

```bash
# npm
npx byuckchon-frontend-cli adopt

# pnpm
pnpm dlx byuckchon-frontend-cli adopt
```

설치가 완료되면 다음 두 명령어를 모두 사용할 수 있습니다.

```bash
bc
byuckchon-frontend-cli
```


### 모노레포 사용 시

CLI 자체는 컴퓨터에 **한 번만 글로벌 설치**하면 됩니다.

다만 `bc`는 현재 실행한 디렉터리부터 상위 디렉터리로 이동하면서 가장 가까운 `bc.config.json`을 찾기 때문에 

각 앱이나 패키지 디렉터리마다 별도로 두어 실행도 해당 디렉터리 마다 실행하는걸 권장합니다.

앱마다 설정 파일을 분리하면 각 프로젝트에 맞는 `detected.*` 정보가 생성되므로, RAG 컨텍스트도 더 정확해집니다.


#### 모노레포 권장 사용 흐름

```bash
# 1. CLI 글로벌 설치
pnpm add -g byuckchon-frontend-cli

# 2. 앱별 설정 생성
cd apps/web && bc adopt
cd ../mobile && bc adopt

# 3. 작업할 앱에서 실행
cd ../web && bc
```


### bc 명령어 오작동 해결 방법

다음처럼 글로벌 옵션 없이 설치했다면 프로젝트 의존성으로 추가됩니다.

```bash
pnpm add byuckchon-frontend-cli
```

이 경우 터미널에서 `bc` 명령어가 바로 실행되지 않을 수 있습니다.

먼저 프로젝트 의존성에서 제거합니다.

```bash
pnpm remove byuckchon-frontend-cli
```

그다음 글로벌로 다시 설치합니다.

```bash
pnpm add -g byuckchon-frontend-cli
```

설치 후 다음 명령어로 확인할 수 있습니다.

```bash
bc
```

## 주요 기능

### 프로젝트 생성: `bc init`

`bc init`은 다음 두 형태를 지원합니다.

| 형태 | 생성 결과 | 적합한 경우 |
| --- | --- | --- |
| 단일 프로젝트 | React(Vite) 또는 Next.js(App Router)  | 하나의 웹 서비스를 빠르게 시작할 때 |
| 모노레포 | pnpm + Turborepo 루트, `apps/`, `packages/` | 여러 웹 앱과 공용 패키지를 함께 관리할 때 |

생성 프로젝트에는 TypeScript, ESLint, Prettier, Tailwind, `bc.config.json`, API 코드 가이드가
기본으로 포함됩니다.

```bash
bc init
```

### 기존 프로젝트 연결: `bc adopt`

`bc adopt`는 `package.json`과 디렉터리를 스캔하여 bc 설정만 세팅합니다.

```bash
cd <프로젝트-루트>
bc adopt
```

모노레포 앱 디렉터리에서 실행하면 앱별 `bc.config.json`을 만들고, PR 리뷰 자동화 파일은
모노레포 루트에 한 번만 둡니다.

### AI와 코드 작업하기: `bc chat`

`bc`만 입력해도 채팅을 시작할 수 있습니다.

```bash
bc

# 한글 입력이 불안정하면 단순 입력 모드 사용
bc chat --plain
```

AI는 단순히 코드 블록을 제안하는 데 그치지 않고, 다음 작업을 수행할 수 있습니다.

- 파일과 디렉터리 읽기
- 코드·OpenAPI 검색
- 파일 생성 및 부분 수정
- Figma 데이터와 이미지 조회

파일 쓰기와 수정은 `bc.config.json`이 있는 프로젝트 루트 하위에서만 허용됩니다. 작업 뒤에는
`git diff`와 `git status`로 변경 사항을 확인하는 것을 권장합니다.

### 팀 문서와 코드베이스 RAG

팀 컨벤션 문서를 `bc.config.json`의 `docs`에 등록하면, 채팅 시작 시 AI 문맥으로 자동 주입됩니다.

```json
{
  "docs": ["docs/frontend-conventions.md", "docs/api-guide.md"]
}
```

문서를 따로 등록하지 않아도 `bc.md`, `.bc/conventions.md`, `AGENTS.md`, `FRONTEND.md`,
`docs/frontend.md` 같은 관례 파일을 자동으로 찾습니다.

코드 인덱스는 채팅 시 자동으로 준비되며, 수동으로 관리할 수도 있습니다.

```bash
bc index
bc index --rebuild
bc index status
bc index search "토큰 갱신"
```

### OpenAPI와 타입 생성

`bc.config.json`의 `api.openapi`에 스펙 URL을 설정하면, AI가 채팅 중 엔드포인트와 스키마를
검색할 수 있습니다. 타입 파일이 필요할 때는 결정론적인 코드 생성 명령을 사용하세요.

```bash
# bc.config.json에 등록한 OpenAPI URL 사용
bc gen api-types

# URL 또는 파일을 직접 지정
bc gen api-types --source https://api.example.com/openapi.json
bc gen api-types --source ./openapi.yaml
```

생성 기본 경로는 `src/api/types.gen.ts`이며, `--out` 옵션으로 바꿀 수 있습니다.

### Figma 연동

Figma 파일 또는 노드 URL을 등록하고 개인 액세스 토큰을 `.env`에 넣으면, AI가 Figma 정보를
구현 맥락으로 활용할 수 있습니다.

```bash
FIGMA_TOKEN=figd_xxxxxxxxxxxxxxxx
```

채팅에서 Figma URL을 함께 전달하면 노드 구조, 이미지, 스타일 정보를 조회할 수 있습니다.

```text
이 Figma 화면을 참고해 멤버 카드 컴포넌트를 만들어줘.
https://www.figma.com/design/.../?node-id=12-34
```

#### 디자이너 협업
| 디자이너 측 작업                       | 요청 이유                                                  |
| --------------------------------------- | --------------------------------------------------------- |
| 프레임/컴포넌트에 **의미 있는 이름**     | `Frame 21` 이 아니라 `Card/Product/Sold-out` 처럼 의미별로 — AI 가 이름으로 컴포넌트 이름과 variant 를 추론합니다. |
| **Auto layout** 적용                    | 안 쓰면 픽셀 좌표만 떨어져 `position: absolute` 코드가 나옵니다. Auto layout 이면 자동으로 `flex`/`gap` 변환. |
| **로컬 스타일** 등록 (color/text)        | "Brand/Primary" 같은 스타일을 등록해두면 `fetch_figma_styles` 로 디자인 토큰을 일괄 추출해서 Tailwind 테마로 바로 박을 수 있어요. |
| **Components** 화 (♦ 마름모 아이콘)     | 반복 UI 가 component 면 모델이 "이거 디자인 시스템 컴포넌트구나" 인식 → 코드에서도 재사용 컴포넌트를 만듭니다. |
| frame 별로 **"Copy link to selection"** | 일반 share link 는 파일 전체. 특정 frame URL 을 받아야 AI 가 그것만 정확히 가져옵니다. |

### ESLint Convention Review

`bc init`과 `bc adopt`는 프로젝트 루트에 아래 파일을 준비합니다.

```text
.github/workflows/eslint-convention-review.yml
tools/eslint-rules/
tools/post-eslint-review-comments.cjs
```

PR이 `dev` 브랜치를 대상으로 할 때, workflow가 기계적으로 판별 가능한 규칙을 검사하고
변경 줄에 댓글을 게시합니다.

| 구분 | 담당 | 결과 |
| --- | --- | --- |
| 일반 lint | 기존 ESLint 규칙 | Actions annotation |
| Convention Review | 파일명, export 방식, boolean 변수명 등 | PR 인라인 `BLOCKING` 또는 `WARNING` 댓글 |
| AI 리뷰 | 설계·예외 처리·비즈니스 판단 | 별도 AI 리뷰 workflow에서 구성 |

같은 지적은 숨김 marker를 기준으로 중복 게시하지 않고, 메시지가 바뀌면 기존 댓글을 갱신합니다.
모노레포에서는 workflow와 `tools/`가 루트에 한 번만 존재하며, PR에서 변경된 TypeScript 파일을
대상으로 검사합니다.

### 설정과 세션 관리

전역 설정은 `~/.bc/config.json`, 프로젝트 설정은 `<project>/bc.config.json`에 저장됩니다.

```bash
bc config show
bc config set-model
bc config set-key anthropic
bc config set-key openai
bc config set-ui plain
```

대화 기록은 프로젝트 안에서는 `.bc/history/`에, 프로젝트 밖에서는 사용자 설정 디렉터리에
저장됩니다. 최근 대화를 이어가려면 다음 명령을 사용하세요.

```bash
bc chat -c
bc chat --list-history
bc chat --resume <session-id>
```


#### 세션 내 슬래시 명령

채팅 중 `/`를 입력하면 사용 가능한 명령이 자동완성 메뉴로 표시됩니다.

| 명령 | 설명 |
| --- | --- |
| `/clear` | 현재 대화 컨텍스트 비우기 |
| `/history` | 프로젝트의 이전 대화 목록 보기 |
| `/retry` | 마지막 사용자 요청 다시 실행 |
| `/model <id>` | 현재 세션의 모델 변경. 인자가 없으면 모델 목록 표시 |
| `/figma-link <url\|off>` | 프로젝트 Figma 링크 설정 또는 해제 |
| `/openapi-link <url\|off>` | 프로젝트 OpenAPI 링크 설정 또는 해제 |
| `/cost` | 현재 세션의 누적 토큰과 비용 확인 |
| `/image <path>` | 이미지 첨부. Finder에서 파일을 터미널로 끌어다 놓아 경로를 넣을 수도 있음 |
| `/paste` | 클립보드의 이미지 또는 스크린샷 첨부. macOS에서 `pngpaste` 필요 |
| `/attachments` | 현재 첨부 목록 보기 |
| `/clear-attach` | 현재 첨부 목록 비우기 |
| `/index` | 코드베이스 인덱스 즉시 빌드 또는 갱신 |
| `/rag on\|off` | 코드베이스 RAG 컨텍스트 사용 여부 전환 |
| `/exit` | 채팅 종료. `Ctrl+C`로도 종료 가능 |


## 지원 모델

| id                  | provider  | 추천 용도                          |
| ------------------- | --------- | ---------------------------------- |
| `claude-sonnet-5`   | anthropic | 기본 — 코드 Q&A, 리팩터, 컴포넌트   |
| `claude-sonnet-4-6` | anthropic | 안정 — 이전 세대 밸런스             |
| `claude-opus-4-8`   | anthropic | 큰 리팩터, 아키텍처 설계 (고가)     |
| `claude-fable-5`    | anthropic | 짧은 작업, 커밋 메시지 (저렴·빠름)  |
| `gpt-5`             | openai    | 일반 코드                          |
| `gpt-5-mini`        | openai    | 저렴한 OpenAI                      |


## 제한 사항

- AI의 파일 생성·수정은 현재 즉시 반영됩니다. 작업 전후로 Git을 사용해 변경 사항을 검토하세요.
- 코드베이스 RAG의 임베딩에는 OpenAI API 키가 필요합니다. Anthropic 키만으로는 인덱스를 만들 수 없습니다.
- Figma 연동에는 개인 액세스 토큰이 필요하며, 매우 큰 프레임은 작은 노드 단위로 나누어 조회하는 편이 좋습니다.
- ESLint Convention Review는 기본적으로 `dev` 대상 PR에서 실행됩니다. 다른 기본 브랜치를 쓰면
  생성된 workflow의 `branches`를 수정해야 합니다.
- 현재 `BLOCKING`은 PR 댓글 분류입니다. workflow 자체를 실패시키고 merge를 강제 차단하려면
  ESLint 종료 코드 처리와 GitHub branch protection 설정이 추가로 필요합니다.
- 외부 fork PR은 GitHub token 권한 때문에 인라인 댓글 작성이 제한될 수 있습니다.
- 기존 모노레포에 `bc adopt`를 적용할 때, 모노레포용 `review.config.mjs`는
  `packages/config-eslint/react.js` 구조를 전제로 합니다. ESLint 설정 구조가 다르면 해당 import를
  프로젝트에 맞게 조정해야 합니다.
- AI Code Review와 typecheck·lint·build·test를 담당하는 PR Check workflow는 현재 자동 생성 대상이
  아닙니다. 팀의 AI 제공자·테스트 전략에 맞춰 별도로 추가해야 합니다.

## 제품 로드맵

아래 항목은 방향성으로, 일정과 세부 구현은 변경될 수 있습니다.

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

[MIT License](LICENSE)를 따릅니다.
