import inquirer from 'inquirer';

import { deriveScope } from '../context/monorepo.js';

const NAME_RULE = (input) => {
  if (!input.trim()) return '이름을 입력해주세요.';
  if (!/^[a-z0-9\-_]+$/i.test(input)) return '영문, 숫자, -, _ 만 사용 가능합니다.';
  return true;
};

const SCOPE_RULE = (input) => {
  if (!input.trim()) return 'scope 를 입력해주세요.';
  if (!/^[a-z0-9\-]+$/i.test(input)) return '영문, 숫자, - 만 사용 가능합니다. (@ 없이)';
  return true;
};

const FRAMEWORK_CHOICES = [
  { name: 'React  (Vite + TypeScript)', value: 'react' },
  { name: 'Next.js  (App Router + TypeScript)', value: 'next' },
];

// Figma · OpenAPI URL 은 묻지 않는다. bc chat 용 컨텍스트인데 생성 단계에서는 거의 쓰지 않아서,
// 필요하면 bc.config.json 의 design.figma · api.openapi 에 직접 넣거나 bc adopt 로 채운다.
//
// init · add 는 bc chat 기본 모델도 묻지 않는다. bc.config.json 의 ai.model 은 null 로 두고,
// bc chat 은 전역 설정(bc config set-model) → 기본 모델(DEFAULT_MODEL_ID) 순서로 고른다.

/** 단일 프로젝트 vs 모노레포 선택. */
export async function askProjectType() {
  const { projectType } = await inquirer.prompt([
    {
      type: 'list',
      name: 'projectType',
      message: '무엇을 생성할까요?',
      choices: [
        { name: '단일 프로젝트  (React 또는 Next 하나)', value: 'single' },
        {
          name: '모노레포  (pnpm + Turborepo, 앱 하나로 시작 · 이후 bc add 로 추가)',
          value: 'monorepo',
        },
      ],
    },
  ]);
  return projectType;
}

/** 모노레포 생성 질문. */
export async function askMonorepoQuestions() {
  const base = await inquirer.prompt([
    {
      type: 'input',
      name: 'projectName',
      message: '모노레포(루트 폴더) 이름:',
      validate: NAME_RULE,
    },
  ]);

  return inquirer.prompt([
    {
      type: 'input',
      name: 'scope',
      message: 'npm scope (@scope/앱이름 형태로 쓰임, @ 없이):',
      default: deriveScope(base.projectName),
      validate: SCOPE_RULE,
    },
    {
      type: 'input',
      name: 'appName',
      message: '처음 만들 앱 이름 (apps/ 아래에 생성):',
      default: 'web',
      validate: NAME_RULE,
    },
    {
      type: 'list',
      name: 'framework',
      message: '이 앱의 프레임워크는?',
      choices: FRAMEWORK_CHOICES,
    },
  ]).then((rest) => ({ ...base, ...rest }));
}

/** 기존 모노레포에 앱 추가 질문. */
export async function askAddQuestions({ scope } = {}) {
  return inquirer.prompt([
    {
      type: 'input',
      name: 'appName',
      message: `추가할 앱 이름 (@${scope ?? 'scope'}/<이름> · apps/ 아래에 생성):`,
      validate: NAME_RULE,
    },
    {
      type: 'list',
      name: 'framework',
      message: '프레임워크는?',
      choices: FRAMEWORK_CHOICES,
    },
  ]);
}

export async function askInitQuestions() {
  return inquirer.prompt([
    {
      type: 'input',
      name: 'projectName',
      message: '프로젝트 이름을 입력해주세요:',
      validate: (input) => {
        if (!input.trim()) return '프로젝트 이름을 입력해주세요.';
        if (!/^[a-z0-9\-_]+$/i.test(input))
          return '영문, 숫자, -, _ 만 사용 가능합니다.';
        return true;
      },
    },
    {
      type: 'list',
      name: 'framework',
      message: '어떤 프레임워크를 사용할까요?',
      choices: [
        { name: 'React  (Vite + TypeScript)', value: 'react' },
        { name: 'Next.js  (App Router + TypeScript)', value: 'next' },
      ],
    },
  ]);
}
