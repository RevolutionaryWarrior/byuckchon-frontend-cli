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

// OpenAPI URL 은 묻지 않는다. 생성 단계에서는 거의 쓰지 않아서,
// 필요하면 bc.config.json 의 api.openapi 에 직접 넣거나 bc adopt 로 채운다.

/** 단일 프로젝트 vs 모노레포 선택. */
export async function askProjectType() {
  const { projectType } = await inquirer.prompt([
    {
      type: 'list',
      name: 'projectType',
      message: '무엇을 생성할까요?',
      choices: [
        { name: '단일 프로젝트  (React · Next · Mobile 중 하나)', value: 'single' },
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
        // 모노레포(bc add)에는 아직 없다. 단일 프로젝트만.
        { name: 'Mobile  (React Native + Expo)', value: 'expo' },
      ],
    },
  ]);
}

/** 번들 ID · scheme 에 쓸 수 있게 이름에서 영소문자 · 숫자만 남긴다. (my-app → myapp) */
export function toIdentifier(name) {
  return name.toLowerCase().replace(/[^a-z0-9]/g, '');
}

/**
 * Mobile(Expo) 을 골랐을 때 추가 질문.
 * 번들 ID · scheme 은 폴더 이름에서 제안하고, Enter 면 그대로 쓴다.
 * @param {string} projectName 앞에서 받은 폴더 이름
 */
export async function askExpoQuestions(projectName) {
  const id = toIdentifier(projectName) || 'app';

  return inquirer.prompt([
    {
      type: 'input',
      name: 'appName',
      message: '앱 이름 (홈 화면에 보이는 이름, 한글 가능):',
      default: projectName,
      validate: (input) => (input.trim() ? true : '앱 이름을 입력해주세요.'),
    },
    {
      type: 'input',
      name: 'bundleId',
      message: '번들 ID (iOS bundleIdentifier · Android package):',
      default: `com.byuckchon.${id}`,
      // Android package 규칙이 더 엄격해서 그쪽에 맞춘다. (하이픈 불가)
      validate: (input) =>
        /^[a-zA-Z][a-zA-Z0-9_]*(\.[a-zA-Z][a-zA-Z0-9_]*)+$/.test(input)
          ? true
          : '점(.)으로 구분된 영문 · 숫자 · _ 만 가능합니다. (예: com.byuckchon.marketd)',
    },
    {
      type: 'input',
      name: 'scheme',
      message: '딥링크 scheme (marketd://...):',
      default: id,
      validate: (input) =>
        /^[a-z][a-z0-9+.-]*$/.test(input) ? true : '영소문자로 시작하고 영소문자 · 숫자 · + . - 만 가능합니다.',
    },
    {
      type: 'confirm',
      name: 'linkEas',
      message: 'EAS 에 연결할까요? (eas 로그인돼 있으면 eas init, 아니면 건너뜀)',
      default: true,
    },
  ]);
}
