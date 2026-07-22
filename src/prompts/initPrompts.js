import inquirer from 'inquirer';

import { modelChoices, DEFAULT_MODEL_ID } from '../ai/models.js';
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
    {
      type: 'list',
      name: 'aiModel',
      message: 'bc chat 에서 기본으로 쓸 AI 모델은?',
      choices: [...modelChoices(), { name: '나중에 설정 (bc config set-model)', value: null }],
      default: DEFAULT_MODEL_ID,
    },
    {
      type: 'input',
      name: 'figmaUrl',
      message: 'Figma 파일 URL (선택, 엔터로 건너뛰기):',
      default: '',
    },
    {
      type: 'input',
      name: 'openapiUrl',
      message: '백엔드 OpenAPI(Swagger) URL (선택, 엔터로 건너뛰기):',
      default: '',
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
    {
      type: 'list',
      name: 'aiModel',
      message: '이 앱 bc chat 기본 모델은?',
      choices: [...modelChoices(), { name: '나중에 설정 (bc config set-model)', value: null }],
      default: DEFAULT_MODEL_ID,
    },
    {
      type: 'input',
      name: 'figmaUrl',
      message: 'Figma 파일 URL (선택):',
      default: '',
    },
    {
      type: 'input',
      name: 'openapiUrl',
      message: '백엔드 OpenAPI(Swagger) URL (선택):',
      default: '',
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
    {
      type: 'list',
      name: 'aiModel',
      message: 'bc chat 에서 기본으로 쓸 AI 모델은?',
      choices: [
        ...modelChoices(),
        { name: '나중에 설정 (bc config set-model)', value: null },
      ],
      default: DEFAULT_MODEL_ID,
    },
    {
      type: 'input',
      name: 'figmaUrl',
      message: 'Figma 파일 URL (선택, 엔터로 건너뛰기):',
      default: '',
    },
    {
      type: 'input',
      name: 'openapiUrl',
      message: '백엔드 OpenAPI(Swagger) URL (선택, 엔터로 건너뛰기):',
      default: '',
    },
  ]);
}
