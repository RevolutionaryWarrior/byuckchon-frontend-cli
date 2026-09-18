// ESLint Convention Review 워크플로 전용 config.
//
// 규칙 본체(internal 플러그인 + 컨벤션 규칙)는 @byuckchon-frontend/settings 가
// 관리합니다. 규칙이 바뀌면 settings 버전만 올리면 되고 이 파일은 그대로 둡니다.
//
// 이 프로젝트에만 해당하는 예외가 필요하면 아래에 이어붙이세요.
//   import review from '@byuckchon-frontend/settings/eslint/review';
//   export default [...review, { ignores: ['src/legacy/**'] }];
export { default } from '@byuckchon-frontend/settings/eslint/review';
