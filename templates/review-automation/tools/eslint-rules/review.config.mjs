// ESLint Convention Review 워크플로우 전용 config.
// 각 패키지의 eslint.config.mjs에는 internal 플러그인이 없으므로,
// CI에서는 이 config로 레포 루트에서 한 번에 실행한다.
// (리뷰 코멘트로 게시되는 룰은 internal-rdjson-formatter.js가 필터링한다.)
import { reactConfig } from '../../packages/config-eslint/react.js';

import internalPlugin from './internal-plugin.cjs';

export default [
  ...reactConfig,
  {
    files: ['**/*.{ts,tsx}'],
    plugins: {
      internal: internalPlugin,
    },
    rules: {
      'internal/blocking-conventions': 'error',
      'internal/warning-conventions': 'warn',
      'react/self-closing-comp': 'warn',
    },
  },
];
