import fs from 'fs/promises';
import path from 'path';

import { versions } from '../constants/versions.js';

export async function createPackageJson(rootDir, config) {
  const isReact = config.framework === 'react';

  const pkg = {
    name: config.projectName,
    version: '0.0.1',
    private: true,
    type: 'module',
    scripts: isReact
      ? {
          dev: 'vite',
          build: 'tsc -b && vite build',
          'tokens:build': 'style-dictionary build --config token.config.js',
          // PR Check workflow 가 lint / typecheck / build 를 각각 호출한다.
          typecheck: 'tsc -b',
          lint: 'eslint . --ext ts,tsx',
          preview: 'vite preview',
          format:
            'prettier --write "src/**/*.{ts,tsx,css}" "tools/**/*.{js,cjs,json,md}"',
          'format:check':
            'prettier --check "src/**/*.{ts,tsx,css}" "tools/**/*.{js,cjs,json,md}"',
        }
      : {
          dev: 'next dev',
          build: 'next build',
          'tokens:build': 'style-dictionary build --config token.config.js',
          typecheck: 'tsc --noEmit',
          start: 'next start',
          lint: 'eslint .',
          format:
            'prettier --write "src/**/*.{ts,tsx,css}" "tools/**/*.{js,cjs,json,md}"',
          'format:check':
            'prettier --check "src/**/*.{ts,tsx,css}" "tools/**/*.{js,cjs,json,md}"',
        },
    dependencies: {
      react: isReact ? versions.react : versions['next-react'],
      'react-dom': isReact ? versions['react-dom'] : versions['next-react-dom'],
      ...(isReact ? {} : { next: versions.next }),
      zustand: versions.zustand,
      '@tanstack/react-query': versions['@tanstack/react-query'],
      ...(isReact
        ? {
            axios: versions.axios,
            'react-router-dom': versions['react-router-dom'],
          }
        : {}),
      zod: versions.zod,
      clsx: versions.clsx,
      'tailwind-merge': versions['tailwind-merge'],
    },
    devDependencies: {
      '@types/react': versions['@types/react'],
      '@types/react-dom': versions['@types/react-dom'],
      '@types/node': versions['@types/node'],
      '@trivago/prettier-plugin-sort-imports':
        versions['@trivago/prettier-plugin-sort-imports'],
      // ESLint 플러그인은 @byuckchon-frontend/settings 가 의존성으로 들고 온다.
      eslint: versions.eslint,
      prettier: versions.prettier,
      'prettier-plugin-tailwindcss': versions['prettier-plugin-tailwindcss'],
      'style-dictionary': versions['style-dictionary'],
      tailwindcss: versions.tailwindcss,
      typescript: versions.typescript,
      ...(isReact
        ? {
            '@tailwindcss/vite': versions['@tailwindcss/vite'],
            '@vitejs/plugin-react': versions['@vitejs/plugin-react'],
            vite: versions.vite,
            'vite-plugin-svgr': versions['vite-plugin-svgr'],
          }
        : {
            '@tailwindcss/postcss': versions['@tailwindcss/postcss'],
            '@svgr/webpack': versions['@svgr/webpack'],
            'eslint-config-next': versions['eslint-config-next'],
            '@eslint/eslintrc': versions['@eslint/eslintrc'],
          }),
    },
  };

  await fs.writeFile(
    path.join(rootDir, 'package.json'),
    JSON.stringify(pkg, null, 2),
    'utf-8',
  );
}
