# byuckchon-frontend-cli

[byuckchon](https://www.byuckchon.com) 프론트엔드 팀을 위한 프로젝트 스타터 CLI입니다.

```text
프로젝트 생성 또는 연결
→ OpenAPI 스펙에서 TS 타입 생성
→ PR에서 기계적인 컨벤션을 자동 리뷰
```


## 요구 사항

- Node.js 18+ (LTS 권장)

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

앱마다 설정 파일을 분리하면 각 프로젝트에 맞는 `detected.*` 정보가 생성됩니다.


#### 모노레포 권장 사용 흐름

```bash
# 1. CLI 글로벌 설치
pnpm add -g byuckchon-frontend-cli

# 2. 앱별 설정 생성
cd apps/web && bc adopt
cd ../mobile && bc adopt

# 3. 작업할 앱에서 실행
cd ../web && bc gen api-types
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

설치 후 다음 명령어로 확인할 수 있습니다. 인자 없이 실행하면 사용 가능한 명령 목록이 나옵니다.

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

### OpenAPI와 타입 생성

`bc.config.json`의 `api.openapi`에 스펙 URL을 설정하거나 `--source`로 직접 지정하면,
OpenAPI 3.0 / 3.1 스펙에서 TS 타입 파일을 생성합니다.

```bash
# bc.config.json에 등록한 OpenAPI URL 사용
bc gen api-types

# URL 또는 파일을 직접 지정
bc gen api-types --source https://api.example.com/openapi.json
bc gen api-types --source ./openapi.yaml
```

생성 기본 경로는 `src/api/types.gen.ts`이며, `--out` 옵션으로 바꿀 수 있습니다.

### 디자인 토큰 빌드

`bc init`으로 생성한 프로젝트에는 토큰 변환 설정이 함께 들어갑니다.

```text
token.config.js     # @byuckchon-frontend/settings/tokens 프리셋을 사용
src/tokens.json     # 디자이너가 Figma(Tokens Studio)에서 export 한 파일을 여기에 덮어씀
src/tokens.css      # 아래 명령으로 자동 생성 (직접 수정하지 않음)
```

```bash
npm run tokens:build
```

color는 `@theme`의 `--color-*`로, typography는 `@utility text-*`로, motion 등 나머지 토큰은
`:root` 변수로 출력됩니다. duration 값이 단위 없는 숫자면 `ms`가 자동으로 붙고, settings에 없는
`--motion-*` 이름이 있으면 경고가 나옵니다. 변환 규칙은 `@byuckchon-frontend/settings`가
관리하므로, 규칙이 바뀌면 패키지 버전만 올리면 기존 프로젝트에도 그대로 반영됩니다.

### ESLint Convention Review

`bc init`과 `bc adopt`는 프로젝트 루트에 아래 파일을 준비합니다.

```text
.github/workflows/eslint-convention-review.yml   # 컨벤션 인라인 댓글
.github/workflows/pr-check.yml                   # lint / typecheck / build 통과 여부 (bc init 전용)
.github/workflows/pr-description.yml             # 커밋 내역을 PR 본문에 반영
.github/pull_request_template.md
tools/review.config.mjs
```

`pr-check.yml` 은 `bc init` 으로 생성한 프로젝트에만 추가됩니다.
스크립트 이름·대상 브랜치·패키지 매니저를 전제하기 때문에, 기존 프로젝트에
`bc adopt` 할 때는 추가하지 않습니다. 필요하면 위 파일을 참고해 직접 만드세요.

워크플로 템플릿은 프로젝트 유형에 맞는 것만 복사됩니다.
(`<이름>.single.yml` / `<이름>.monorepo.yml` → `<이름>.yml`)
단일 프로젝트는 npm, 모노레포는 pnpm + turbo 기준으로 만들어집니다.

복사된 파일이므로 **프로젝트 소유**입니다. 대상 브랜치나 단계를 자유롭게 고치세요.
settings 를 올려도 이 파일은 바뀌지 않습니다.

PR이 `dev` 브랜치를 대상으로 할 때, workflow가 기계적으로 판별 가능한 규칙을 검사하고
변경 줄에 댓글을 게시합니다.

컨벤션 규칙과 댓글 게시 스크립트는 `@byuckchon-frontend/settings`가 제공합니다.
프로젝트에 규칙 사본을 두지 않으므로, 규칙이 바뀌면 settings 버전만 올리면 됩니다.

| 구분 | 담당 | 결과 |
| --- | --- | --- |
| 일반 lint | 기존 ESLint 규칙 | Actions annotation |
| Convention Review | 파일명, export 방식, boolean 변수명 등 | PR 인라인 `BLOCKING` 또는 `WARNING` 댓글 |
| AI 리뷰 | 설계·예외 처리·비즈니스 판단 | 별도 AI 리뷰 workflow에서 구성 |

### PR 본문 자동 작성

`pr-description.yml` 이 PR 의 커밋을 타입별로 묶어 description 에 채워 넣습니다.

```markdown
### ✨ 기능
- **settings** — tsconfig 프리셋 추가 (a1b2c3d)

### 🐛 수정
- letterSpacing % → em 변환 (b2c3d4e)
```

사람이 쓴 내용은 건드리지 않고 `<!-- byuckchon:commits:start -->` 마커 사이만 갱신하며,
커밋을 추가로 푸시하면 목록도 따라 갱신됩니다. 머지 커밋은 제외하고, 컨벤션을 안 지킨
커밋은 버리지 않고 "분류 없음"으로 모읍니다.

생성되는 `.github/pull_request_template.md` 에 마커가 미리 들어 있습니다.

같은 지적은 숨김 marker를 기준으로 중복 게시하지 않고, 메시지가 바뀌면 기존 댓글을 갱신합니다.
모노레포에서는 workflow와 `tools/`가 루트에 한 번만 존재하며, PR에서 변경된 TypeScript 파일을
대상으로 검사합니다.

## 제한 사항

- ESLint Convention Review는 기본적으로 `dev` 대상 PR에서 실행됩니다. 다른 기본 브랜치를 쓰면
  생성된 workflow의 `branches`를 수정해야 합니다.
- 현재 `BLOCKING`은 PR 댓글 분류입니다. workflow 자체를 실패시키고 merge를 강제 차단하려면
  ESLint 종료 코드 처리와 GitHub branch protection 설정이 추가로 필요합니다.
- 외부 fork PR은 GitHub token 권한 때문에 인라인 댓글 작성이 제한될 수 있습니다.
- 기존 모노레포에 `bc adopt`를 적용할 때, 모노레포용 `review.config.mjs`는
  `packages/config-eslint/react.js` 구조를 전제로 합니다. ESLint 설정 구조가 다르면 해당 import를
  프로젝트에 맞게 조정해야 합니다.
- AI Code Review workflow는 자동 생성 대상이 아닙니다. 팀의 AI 제공자에 맞춰 별도로 추가해야 합니다.
- PR Check workflow는 lint · typecheck · build 만 실행합니다. 테스트는 팀의 전략에 맞춰
  생성된 `pr-check.yml` 에 단계를 추가하세요.

## 라이선스

[MIT License](LICENSE)를 따릅니다.
