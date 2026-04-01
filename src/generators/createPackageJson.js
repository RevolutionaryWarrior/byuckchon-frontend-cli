import fs from 'fs/promises';
import path from 'path';

import { versions } from '../constants/versions.js';

export async function createPackageJson(rootDir, config) {
  const isReact = config.framework === 'react';

  const pkg = {
    name: config.projectName,
    version: '0.0.1',
    private: true,
    ...(isReact ? { type: 'module' } : {}),
    scripts: isReact
      ? {
          dev: 'vite',
          build: 'tsc -b && vite build',
          'tokens:build': 'style-dictionary build --config token.config.js',
          lint: 'eslint . --ext ts,tsx',
          preview: 'vite preview',
          format: 'prettier --write "src/**/*.{ts,tsx,css}"',
        }
      : {
          dev: 'next dev',
          build: 'next build',
          'tokens:build': 'style-dictionary build --config token.config.js',
          start: 'next start',
          lint: 'next lint',
          format: 'prettier --write "src/**/*.{ts,tsx,css}"',
        },
    dependencies: {
      react: isReact ? versions.react : versions['next-react'],
      'react-dom': isReact ? versions['react-dom'] : versions['next-react-dom'],
      ...(isReact ? {} : { next: versions.next }),
      zustand: versions.zustand,
      ...(isReact
        ? {
            axios: versions.axios,
            '@tanstack/react-query': versions['@tanstack/react-query'],
          }
        : {}),
      zod: versions.zod,
    },
    devDependencies: {
      '@types/react': versions['@types/react'],
      '@types/react-dom': versions['@types/react-dom'],
      '@types/node': versions['@types/node'],
      '@trivago/prettier-plugin-sort-imports':
        versions['@trivago/prettier-plugin-sort-imports'],
      eslint: versions.eslint,
      'eslint-config-expo': versions['eslint-config-expo'],
      'eslint-import-resolver-typescript':
        versions['eslint-import-resolver-typescript'],
      'eslint-plugin-import': versions['eslint-plugin-import'],
      'eslint-plugin-react': versions['eslint-plugin-react'],
      'eslint-plugin-react-hooks': versions['eslint-plugin-react-hooks'],
      'eslint-plugin-unused-imports': versions['eslint-plugin-unused-imports'],
      prettier: versions.prettier,
      'prettier-plugin-tailwindcss': versions['prettier-plugin-tailwindcss'],
      'style-dictionary': versions['style-dictionary'],
      tailwindcss: versions.tailwindcss,
      typescript: versions.typescript,
      ...(isReact
        ? {
            '@tailwindcss/vite': versions['@tailwindcss/vite'],
            '@typescript-eslint/eslint-plugin':
              versions['@typescript-eslint/eslint-plugin'],
            '@typescript-eslint/parser': versions['@typescript-eslint/parser'],
            '@vitejs/plugin-react': versions['@vitejs/plugin-react'],
            vite: versions.vite,
            'vite-plugin-svgr': versions['vite-plugin-svgr'],
          }
        : {
            '@tailwindcss/postcss': versions['@tailwindcss/postcss'],
            '@svgr/webpack': versions['@svgr/webpack'],
            'eslint-config-next': versions['eslint-config-next'],
          }),
    },
  };

  await fs.writeFile(
    path.join(rootDir, 'package.json'),
    JSON.stringify(pkg, null, 2),
    'utf-8',
  );
}
