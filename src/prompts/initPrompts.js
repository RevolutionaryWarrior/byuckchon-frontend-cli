import inquirer from 'inquirer';

import { modelChoices, DEFAULT_MODEL_ID } from '../ai/models.js';

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
