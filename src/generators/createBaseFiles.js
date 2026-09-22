import fs from "fs/promises";
import { createRequire } from "node:module";
import path from "path";

// JSON import attributes 는 Node 22+ 라서, Node 18 지원을 위해 createRequire 로 읽는다.
const require = createRequire(import.meta.url);
const vscodeSettings = require("@byuckchon-frontend/settings/vscode");

import { readSettingsAsset } from "../utils/settingsAssets.js";

async function write(filePath, content) {
  await fs.writeFile(filePath, content, "utf-8");
}

const TOKEN_CONFIG_JS = `/**
 * 디자이너가 넘긴 src/tokens.json 을 src/tokens.css 로 변환하는 설정.
 *
 *   npm run tokens:build
 *
 * 변환 규칙(color / typography / motion)은 @byuckchon-frontend/settings 가
 * 관리한다. 규칙이 바뀌면 settings 버전만 올리면 되고 이 파일은 그대로 둔다.
 * 프로젝트별 예외가 필요하면 defineTokenConfig({ ... }) 에 인자를 넘긴다.
 */
import { defineTokenConfig } from "@byuckchon-frontend/settings/tokens";

export default defineTokenConfig();
`;

// ─── 공통 설정 파일 ────────────────────────────────────────────────────────────

async function createPrettierConfig(rootDir) {
  // 규칙 본체는 @byuckchon-frontend/settings 가 관리한다.
  // 프로젝트는 참조만 하므로, 팀 표준이 바뀌면 settings 버전만 올리면 된다.
  await write(
    path.join(rootDir, "prettier.config.js"),
    `import byuckchon from '@byuckchon-frontend/settings/prettier';

/** 프로젝트 예외가 필요하면 펼쳐서 덮어쓰세요. (예: printWidth: 100) */
export default byuckchon;
`
  );
}

async function createEslintConfig(rootDir) {
  await write(
    path.join(rootDir, "eslint.config.js"),
    `import byuckchon from '@byuckchon-frontend/settings/eslint/react';

/**
 * 규칙 본체는 @byuckchon-frontend/settings 가 관리합니다.
 * 프로젝트 예외는 뒤에 이어붙이세요.
 *
 *   export default [...byuckchon, { rules: { 'import/order': 'off' } }];
 */
export default byuckchon;
`
  );
}

async function createNextEslintConfig(rootDir) {
  // next/core-web-vitals 는 설치된 next 버전과 짝을 이뤄야 해서 settings 가 들고 있지 않다.
  // 프로젝트 쪽에서 합친다.
  await write(
    path.join(rootDir, "eslint.config.mjs"),
    `import { FlatCompat } from '@eslint/eslintrc';

import byuckchon from '@byuckchon-frontend/settings/eslint/next';

const compat = new FlatCompat({ baseDirectory: import.meta.dirname });

export default [
  ...compat.extends('next/core-web-vitals', 'next/typescript'),
  ...byuckchon,
];
`
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

# bc CLI
.bc/
.history

# Misc
dist-ssr/
*.local
`;

  const nextExtra = `
# Next.js
.next/
out/
`;

  await write(
    path.join(rootDir, ".gitignore"),
    base + (framework === "next" ? nextExtra : "")
  );
}

async function createVscodeSettings(rootDir) {
  // settings.json 은 extends 가 없어서 참조가 불가능하다. 실제 파일이 있어야 한다.
  // 그래서 settings 가 들고 있는 값을 "복사"하되, 나중에 팀 표준이 바뀌면
  //   npx byuckchon-settings-sync vscode
  // 로 다시 맞출 수 있게 한다. 프로젝트가 값을 고치는 것은 자유.
  await fs.mkdir(path.join(rootDir, ".vscode"), { recursive: true });
  await write(
    path.join(rootDir, ".vscode/settings.json"),
    JSON.stringify(vscodeSettings, null, 2) + "\n"
  );
}

// ─── React (Vite) ─────────────────────────────────────────────────────────────

async function createReactBaseFiles(rootDir, config) {
  // index.html
  await write(
    path.join(rootDir, "index.html"),
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
`
  );
  await write(
    path.join(rootDir, "public/robots.txt"),
    `User-agent: *\nDisallow: /\n`
  );

  // vite.config.ts
  await write(
    path.join(rootDir, "vite.config.ts"),
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
`
  );

  // tsconfig — 공통 옵션은 @byuckchon-frontend/settings 가 관리한다.
  // 프로젝트에는 경로 alias 처럼 이 프로젝트에만 해당하는 것만 남긴다.
  await write(
    path.join(rootDir, "tsconfig.json"),
    JSON.stringify(
      {
        files: [],
        references: [{ path: "./tsconfig.app.json" }, { path: "./tsconfig.node.json" }],
      },
      null,
      2
    ) + "\n"
  );

  await write(
    path.join(rootDir, "tsconfig.app.json"),
    JSON.stringify(
      {
        extends: "@byuckchon-frontend/settings/tsconfig/react.json",
        compilerOptions: {
          tsBuildInfoFile: "./node_modules/.tmp/tsconfig.app.tsbuildinfo",
          // baseUrl 은 TypeScript 7 에서 제거 대상이다.
          // 생략하면 paths 가 이 tsconfig 파일 위치 기준으로 해석되므로 ./ 을 붙인다.
          paths: {
            "@/*": ["./src/*"],
            "@icons/*": ["./src/assets/icons/*"],
            "@images/*": ["./src/assets/images/*"],
          },
        },
        include: ["src"],
      },
      null,
      2
    ) + "\n"
  );

  await write(
    path.join(rootDir, "tsconfig.node.json"),
    JSON.stringify(
      {
        extends: "@byuckchon-frontend/settings/tsconfig/node.json",
        compilerOptions: {
          tsBuildInfoFile: "./node_modules/.tmp/tsconfig.node.tsbuildinfo",
          module: "ESNext",
          moduleResolution: "Bundler",
        },
        include: ["vite.config.ts"],
      },
      null,
      2
    ) + "\n"
  );

  await write(path.join(rootDir, ".nvmrc"), await readSettingsAsset("project/nvmrc"));

  await createPrettierConfig(rootDir);
  await createEslintConfig(rootDir);
  await createGitignore(rootDir, "react");
  await createVscodeSettings(rootDir);
  await write(path.join(rootDir, "token.config.js"), TOKEN_CONFIG_JS);

  // src/App.css
  await write(
    path.join(rootDir, "src/App.css"),
    `@import 'tailwindcss';
@import "@byuckchon-frontend/settings/motion";
@import "./tokens.css";
`
  );
  await write(path.join(rootDir, "src/tokens.css"), "");
  await write(path.join(rootDir, "src/tokens.json"), "{}\n");

  // src/main.tsx
  await write(
    path.join(rootDir, "src/main.tsx"),
    `import { createRoot } from 'react-dom/client';

import App from './App.tsx';

createRoot(document.getElementById('root')!).render(<App />);
`
  );

  await write(
    path.join(rootDir, "src/vite-env.d.ts"),
    `/// <reference types="vite/client" />\n`
  );

  await write(
    path.join(rootDir, "src/global.d.ts"),
    `/// <reference types="@byuckchon-frontend/settings/types/svg-vite" />
`
  );

  // src/App.tsx
  await write(
    path.join(rootDir, "src/App.tsx"),
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
`
  );
}

// ─── Next.js (App Router) ─────────────────────────────────────────────────────

async function createNextBaseFiles(rootDir, config) {
  // next.config.ts
  await write(
    path.join(rootDir, "next.config.ts"),
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
`
  );
  await write(
    path.join(rootDir, "public/robots.txt"),
    `User-agent: *\nDisallow: /\n`
  );

  // tsconfig (Next.js) — 공통 옵션은 settings 가 관리한다.
  await write(
    path.join(rootDir, "tsconfig.json"),
    JSON.stringify(
      {
        extends: "@byuckchon-frontend/settings/tsconfig/next.json",
        compilerOptions: {
          // baseUrl 없이 paths 만 쓴다. (TypeScript 7 에서 baseUrl 제거)
          paths: { "@/*": ["./src/*"] },
        },
        include: ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
        exclude: ["node_modules"],
      },
      null,
      2
    ) + "\n"
  );

  await write(path.join(rootDir, ".nvmrc"), await readSettingsAsset("project/nvmrc"));

  await createPrettierConfig(rootDir);
  await createNextEslintConfig(rootDir);
  await createGitignore(rootDir, "next");
  await createVscodeSettings(rootDir);
  await write(
    path.join(rootDir, "postcss.config.mjs"),
    `const config = {
  plugins: ["@tailwindcss/postcss"],
};

export default config;
`
  );

  // src/app/globals.css
  await write(
    path.join(rootDir, "src/app/globals.css"),
    `@import 'tailwindcss';
@import "@byuckchon-frontend/settings/motion";
@import "../tokens.css";
`
  );
  await write(path.join(rootDir, "token.config.js"), TOKEN_CONFIG_JS);
  await write(path.join(rootDir, "src/tokens.css"), "");
  await write(path.join(rootDir, "src/tokens.json"), "{}\n");

  // src/app/layout.tsx
  await write(
    path.join(rootDir, "src/app/layout.tsx"),
    `import type { Metadata } from 'next';

import './globals.css';

export const metadata: Metadata = {
  title: '${config.projectName}',
  description: 'Generated by byuckchon-frontend-cli',
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
`
  );

  // src/app/page.tsx
  await write(
    path.join(rootDir, "src/app/page.tsx"),
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
`
  );

  await write(
    path.join(rootDir, "src/app/error.tsx"),
    `'use client';

export default function Error() {
  return <div>Something went wrong.</div>;
}
`
  );

  await write(
    path.join(rootDir, "src/app/not-found.tsx"),
    `export default function NotFound() {
  return <div>Page not found.</div>;
}
`
  );

  await write(
    path.join(rootDir, "src/global.d.ts"),
    `/// <reference types="@byuckchon-frontend/settings/types/svg-next" />
`
  );

  // src/types.d.ts 는 global.d.ts 와 *.svg 선언이 충돌해서 제거했다.
}

// ─── 진입점 ───────────────────────────────────────────────────────────────────

export async function createBaseFiles(rootDir, config) {
  await write(path.join(rootDir, ".env"), "FIGMA_TOKEN=\n");

  if (config.framework === "react") {
    await createReactBaseFiles(rootDir, config);
  } else if (config.framework === "next") {
    await createNextBaseFiles(rootDir, config);
  }
}
