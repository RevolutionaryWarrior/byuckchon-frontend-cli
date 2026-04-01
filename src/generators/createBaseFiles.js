import fs from 'fs/promises';
import path from 'path';

async function write(filePath, content) {
  await fs.writeFile(filePath, content, 'utf-8');
}

// ─── 공통 설정 파일 ────────────────────────────────────────────────────────────

async function createPrettierConfig(rootDir) {
  const config = {
    semi: true,
    trailingComma: 'all',
    singleQuote: true,
    tabWidth: 2,
    useTabs: false,
    printWidth: 80,
    plugins: [
      '@trivago/prettier-plugin-sort-imports',
      'prettier-plugin-tailwindcss',
    ],
    importOrder: ['^@core/(.*)$', '^@server/(.*)$', '^@ui/(.*)$', '^[./]'],
    importOrderSeparation: true,
    importOrderSortSpecifiers: true,
  };
  await write(path.join(rootDir, '.prettierrc'), JSON.stringify(config, null, 2));
}

async function createEslintConfig(rootDir) {
  await write(
    path.join(rootDir, '.eslintrc.cjs'),
    `module.exports = {
  env: {
    browser: true,
    es2022: true,
    node: true,
  },
  extends: ['expo', 'eslint:recommended'],
  plugins: ['unused-imports'],
  rules: {
    'unused-imports/no-unused-imports': 'error',
    'unused-imports/no-unused-vars': [
      'warn',
      {
        vars: 'all',
        varsIgnorePattern: '^_',
        args: 'after-used',
        argsIgnorePattern: '^_',
      },
    ],
    'react/self-closing-comp': [
      'warn',
      {
        component: true,
        html: true,
      },
    ],
  },
  settings: {
    'import/resolver': {
      typescript: {},
    },
  },
};
`,
  );
}

async function createNextEslintConfig(rootDir) {
  await write(
    path.join(rootDir, '.eslintrc.cjs'),
    `// 현 파일이 eslint config type 을 따른다는 선언
/** @type {import("eslint").Linter.Config} */

module.exports = {
  root: true,

  // next.js 공식 eslint 규칙 적용
  extends: ["next/core-web-vitals", "next/typescript"],

  // import 문 자동정렬, 유효성 검사, 경로 오류 방지
  plugins: ["import"],

  rules: {
    "@typescript-eslint/no-explicit-any": "off",
    "import/order": [
      "error",
      {
        // builtin: node 내장 모듈, external: npm 패키지, internal: 프로젝트 내 모듈, parent: 상위 경로, sibling: 형제 경로, index: 인덱스 파일
        groups: ["builtin", "external", "internal", "parent", "sibling", "index"],
        // 특정 패턴 그룹에 속하는 모듈 순서 지정
        pathGroups: [
          {
            pattern: "react",
            group: "external",
            position: "before",
          },
          {
            pattern: "next/**",
            group: "external",
            position: "before",
          },
          {
            pattern: "@/**",
            group: "internal",
          },
        ],
        // 중복 정렬 방지
        pathGroupsExcludedImportTypes: ["react"],
        // 알파벳 순서대로 오름차순 정렬
        alphabetize: { order: "asc", caseInsensitive: true },
      },
    ],
  },

  // 정렬 제외 파일 목록
  ignorePatterns: ["node_modules/", ".next/", "out/", "build/", "next-env.d.ts"],
};
`,
  );
}

async function createGitignore(rootDir, framework) {
  const base = `# Dependencies
node_modules/

# Build
dist/
build/

# Env files
.env
.env.*
.env.local
.env.*.local

# OS
.DS_Store
Thumbs.db

# Editor
.vscode/
.idea/
*.suo
*.sw?

# Logs
npm-debug.log*
yarn-error.log*

# Additional ignores
node_modules
dist
dist-ssr
*.local
.env
.env.production
.history
`;

  const nextExtra = `
# Next.js
.next/
out/
`;

  await write(path.join(rootDir, '.gitignore'), base + (framework === 'next' ? nextExtra : ''));
}

async function createVscodeSettings(rootDir) {
  await fs.mkdir(path.join(rootDir, '.vscode'), { recursive: true });
  await write(
    path.join(rootDir, '.vscode/settings.json'),
    JSON.stringify(
      {
        'editor.defaultFormatter': 'esbenp.prettier-vscode',
        'editor.formatOnSave': true,
        'eslint.validate': [
          'javascript',
          'typescript',
          'javascriptreact',
          'typescriptreact',
        ],
        'editor.codeActionsOnSave': {
          'source.organizeImports': 'always',
          'source.fixAll.eslint': 'always',
        },
      },
      null,
      2,
    ),
  );
}

// ─── React (Vite) ─────────────────────────────────────────────────────────────

async function createReactBaseFiles(rootDir, config) {
  // index.html
  await write(
    path.join(rootDir, 'index.html'),
    `<!doctype html>
<html lang="ko">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${config.projectName}</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
`,
  );
  await write(path.join(rootDir, 'public/robots.txt'), `User-agent: *\nDisallow: /\n`);

  // vite.config.ts
  await write(
    path.join(rootDir, 'vite.config.ts'),
    `import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import svgr from 'vite-plugin-svgr';

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    svgr({
      svgrOptions: {
        icon: true,
      },
    }),
  ],
  resolve: {
    alias: {
      '@': '/src',
      '@icons': '/src/assets/icons',
      '@images': '/src/assets/images',
    },
  },
});
`,
  );

  // tsconfig.json
  await write(
    path.join(rootDir, 'tsconfig.json'),
    JSON.stringify(
      {
        files: [],
        references: [{ path: './tsconfig.app.json' }, { path: './tsconfig.node.json' }],
      },
      null,
      2,
    ),
  );

  // tsconfig.app.json
  await write(
    path.join(rootDir, 'tsconfig.app.json'),
    JSON.stringify(
      {
        compilerOptions: {
          tsBuildInfoFile: './node_modules/.tmp/tsconfig.app.tsbuildinfo',
          target: 'ES2020',
          useDefineForClassFields: true,
          lib: ['ES2020', 'DOM', 'DOM.Iterable'],
          module: 'ESNext',
          skipLibCheck: true,
          moduleResolution: 'bundler',
          allowImportingTsExtensions: true,
          isolatedModules: true,
          moduleDetection: 'force',
          noEmit: true,
          jsx: 'react-jsx',
          strict: true,
          noUnusedLocals: true,
          noUnusedParameters: true,
          noFallthroughCasesInSwitch: true,
          noUncheckedSideEffectImports: true,
          baseUrl: '.',
          paths: {
            '@/*': ['src/*'],
            '@icons/*': ['src/assets/icons/*'],
            '@images/*': ['src/assets/images/*'],
          },
        },
        include: ['src', 'src/svg.d.ts'],
      },
      null,
      2,
    ),
  );

  // tsconfig.node.json
  await write(
    path.join(rootDir, 'tsconfig.node.json'),
    JSON.stringify(
      {
        compilerOptions: {
          tsBuildInfoFile: './node_modules/.tmp/tsconfig.node.tsbuildinfo',
          target: 'ES2022',
          lib: ['ES2023'],
          module: 'ESNext',
          skipLibCheck: true,
          moduleResolution: 'bundler',
          allowImportingTsExtensions: true,
          isolatedModules: true,
          moduleDetection: 'force',
          noEmit: true,
          strict: true,
          noUnusedLocals: true,
          noUnusedParameters: true,
          noFallthroughCasesInSwitch: true,
          noUncheckedSideEffectImports: true,
        },
        include: ['vite.config.ts'],
      },
      null,
      2,
    ),
  );

  await createPrettierConfig(rootDir);
  await createEslintConfig(rootDir);
  await createGitignore(rootDir, 'react');
  await createVscodeSettings(rootDir);
  await write(
    path.join(rootDir, 'token.config.js'),
    `import StyleDictionary from "style-dictionary";

// kebab-case 변환
StyleDictionary.registerTransform({
  name: "name/kebab",
  type: "name",
  transform: (token) =>
    token.path
      .join("-")
      .replace(/([a-z])([A-Z])/g, "$1-$2")
      .toLowerCase(),
});

// color는 Tailwind 유틸리티로, typography는 .text-* 클래스로 생성
StyleDictionary.registerFormat({
  name: "css/tailwind-theme",
  format: ({ dictionary }) => {
    let css = "";
    const withPx = (value) =>
      typeof value === "string" && /^\\d+(\\.\\d+)?$/.test(value)
        ? \`\${value}px\`
        : value;

    css += "@theme {\\n";
    dictionary.allTokens.forEach((token) => {
      if (token.$type === "color") {
        css += \`  --color-\${token.name}: \${token.$value};\\n\`;
      }
    });
    css += "}\\n\\n";

    css += "@layer components {\\n";
    dictionary.allTokens.forEach((token) => {
      if (token.$type === "typography" && token.$value) {
        const typo = token.$value;
        css += \`  .text-\${token.name} {\\n\`;
        if (typo.fontSize) {
          css += \`    font-size: \${withPx(typo.fontSize)};\\n\`;
        }
        if (typo.lineHeight) {
          css += \`    line-height: \${withPx(typo.lineHeight)};\\n\`;
        }
        if (typo.letterSpacing) {
          css += \`    letter-spacing: \${typo.letterSpacing};\\n\`;
        }
        if (typo.fontWeight) {
          css += \`    font-weight: \${typo.fontWeight};\\n\`;
        }
        if (typo.fontFamily) {
          css += \`    font-family: \${typo.fontFamily};\\n\`;
        }
        css += "  }\\n";
      }
    });
    css += "}\\n";

    return css;
  },
});

export default {
  source: ["src/tokens.json"],
  platforms: {
    css: {
      transforms: ["name/kebab"], // 일단 attribute/cti 제거
      buildPath: "src/",
      files: [
        {
          destination: "tokens.css",
          format: "css/tailwind-theme",
        },
      ],
    },
  },
};
`,
  );

  // src/App.css
  await write(
    path.join(rootDir, 'src/App.css'),
    `@import "./tokens.css";
@import 'tailwindcss';
`,
  );
  await write(path.join(rootDir, 'src/tokens.css'), '');
  await write(path.join(rootDir, 'src/tokens.json'), '{}\n');

  // src/main.tsx
  await write(
    path.join(rootDir, 'src/main.tsx'),
    `import { createRoot } from 'react-dom/client';

import App from './App.tsx';

createRoot(document.getElementById('root')!).render(<App />);
`,
  );

  await write(
    path.join(rootDir, 'src/vite-env.d.ts'),
    `/// <reference types="vite/client" />\n`,
  );

  await write(
    path.join(rootDir, 'src/global.d.ts'),
    `declare module '*.svg' {
  import React from 'react';
  export const ReactComponent: React.FunctionComponent<
    React.SVGProps<SVGSVGElement>
  >;
  const src: string;

  export default src;
}

declare module '*.svg?react' {
  import React from 'react';
  const Component: React.FunctionComponent<React.SVGProps<SVGSVGElement>>;

  export default Component;
}

declare module '*.webp' {
  const value: any;
  export = value;
}
`,
  );

  // src/App.tsx
  await write(
    path.join(rootDir, 'src/App.tsx'),
    `import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import './App.css';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      refetchOnMount: false,
      refetchOnReconnect: false,
    },
  },
});

function App() {
  return (
    <main>
      <QueryClientProvider client={queryClient}>
        <div>Hi! Byuckchon Frontend Developer</div>
      </QueryClientProvider>
    </main>
  );
}

export default App;
`,
  );
}

// ─── Next.js (App Router) ─────────────────────────────────────────────────────

async function createNextBaseFiles(rootDir, config) {
  // next.config.ts
  await write(
    path.join(rootDir, 'next.config.ts'),
    `import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    turbo: {
      rules: {
        "*.svg": {
          loaders: ["@svgr/webpack"],
          as: "*.tsx",
        },
      },
    },
  },
  webpack(config) {
    config.module.rules.push({
      test: /\\.svg$/,
      use: ["@svgr/webpack"],
    });
    return config;
  },
};

export default nextConfig;
`,
  );
  await write(path.join(rootDir, 'public/robots.txt'), `User-agent: *\nDisallow: /\n`);

  // tsconfig.json (Next.js)
  await write(
    path.join(rootDir, 'tsconfig.json'),
    JSON.stringify(
      {
        compilerOptions: {
          target: 'ES2017',
          lib: ['dom', 'dom.iterable', 'esnext'],
          allowJs: true,
          skipLibCheck: true,
          strict: true,
          noEmit: true,
          esModuleInterop: true,
          module: 'esnext',
          moduleResolution: 'bundler',
          resolveJsonModule: true,
          isolatedModules: true,
          jsx: 'preserve',
          incremental: true,
          plugins: [{ name: 'next' }],
          paths: { '@/*': ['./src/*'] },
        },
        include: ['next-env.d.ts', '**/*.ts', '**/*.tsx', '.next/types/**/*.ts'],
        exclude: ['node_modules'],
      },
      null,
      2,
    ),
  );

  await createPrettierConfig(rootDir);
  await createNextEslintConfig(rootDir);
  await createGitignore(rootDir, 'next');
  await createVscodeSettings(rootDir);
  await write(
    path.join(rootDir, 'postcss.config.mjs'),
    `const config = {
  plugins: ["@tailwindcss/postcss"],
};

export default config;
`,
  );

  // src/app/globals.css
  await write(
    path.join(rootDir, 'src/app/globals.css'),
    `@import "../src/tokens.css";
@import 'tailwindcss';
`,
  );
  await write(path.join(rootDir, 'src/tokens.css'), '');

  // src/app/layout.tsx
  await write(
    path.join(rootDir, 'src/app/layout.tsx'),
    `import type { Metadata } from 'next';

import './globals.css';

export const metadata: Metadata = {
  title: '${config.projectName}',
  description: 'Generated by cli-test',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ko">
      <head>
        <meta charSet="utf-8" />
      </head>
      <body>{children}</body>
    </html>
  );
}
`,
  );

  // src/app/page.tsx
  await write(
    path.join(rootDir, 'src/app/page.tsx'),
    `export default function MainPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-gray-50">
      <div className="text-center">
        <h1 className="text-4xl font-bold text-gray-900">${config.projectName}</h1>
        <p className="mt-3 text-lg font-medium text-gray-700">
          Hi! Byuckchon Frontend Developer
        </p>
        <p className="mt-4 text-gray-500">Next.js + TypeScript + Tailwind</p>
      </div>
    </main>
  );
}
`,
  );

  await write(
    path.join(rootDir, 'src/app/error.tsx'),
    `'use client';

export default function Error() {
  return <div>Something went wrong.</div>;
}
`,
  );

  await write(
    path.join(rootDir, 'src/app/not-found.tsx'),
    `export default function NotFound() {
  return <div>Page not found.</div>;
}
`,
  );

  await write(
    path.join(rootDir, 'src/global.d.ts'),
    `declare module '*.svg' {
  import React from 'react';
  export const ReactComponent: React.FunctionComponent<
    React.SVGProps<SVGSVGElement>
  >;
  const src: string;

  export default src;
}

declare module '*.svg?react' {
  import React from 'react';
  const Component: React.FunctionComponent<React.SVGProps<SVGSVGElement>>;

  export default Component;
}

declare module '*.webp' {
  const value: any;
  export = value;
}
`,
  );

  await write(
    path.join(rootDir, 'src/types.d.ts'),
    `declare module "*.svg" {
  import React from "react";
  const ReactComponent: React.FC<React.SVGProps<SVGSVGElement>>;
  export default ReactComponent;
}
`,
  );
}

// ─── 진입점 ───────────────────────────────────────────────────────────────────

export async function createBaseFiles(rootDir, config) {
  if (config.framework === 'react') {
    await createReactBaseFiles(rootDir, config);
  } else if (config.framework === 'next') {
    await createNextBaseFiles(rootDir, config);
  }
}
