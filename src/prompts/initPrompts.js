import inquirer from 'inquirer';

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
