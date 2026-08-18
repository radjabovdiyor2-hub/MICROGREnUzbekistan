import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Non-app files:
    ".storybook/**",
    "_shot.js",
    "server-cached.js",
    "public/webapp/**",
    // Воркер MapLibre: минифицированный вендорный код, скопированный из
    // node_modules скриптом prebuild. Не наш исходник и линтеру не подлежит.
    "public/maplibre/**",
    "e2e/**",
  ]),
  {
    rules: {
      // React Compiler rules — downgrade to warn for patterns that are
      // standard in SSR apps (localStorage hydration in useEffect, ref sync).
      "react-hooks/set-state-in-effect": "warn",
      "react-hooks/refs": "warn",
      "react-hooks/purity": "warn",
      "react-hooks/static-components": "warn",
      "react-hooks/error-boundaries": "warn",
      // img tags are used intentionally in magazine/AR/external-content components:
      // адрес картинки задаёт владелец в админке, и хост может быть любым —
      // next/image отдал бы 400 на всё, чего нет в remotePatterns.
      "@next/next/no-img-element": "off",
      // Аудит 31.07.2026 вычистил все 96 использований any, поэтому послабление
      // снято: правило снова ошибка и не даёт `any` вернуться в код незаметно.
      "@typescript-eslint/no-explicit-any": "error",
      // `const { secret, ...rest } = obj` — штатный способ убрать поле из
      // ответа API, а `_`-префикс — признак намеренно неиспользуемого
      // аргумента. Без этих опций правило ругалось именно на такой код и
      // приучало глушить его целиком.
      "@typescript-eslint/no-unused-vars": ["warn", {
        ignoreRestSiblings: true,
        argsIgnorePattern: "^_",
        varsIgnorePattern: "^_",
        caughtErrorsIgnorePattern: "^_",
      }],
    },
  },
  // next.config.ts uses dynamic require() for optional Sentry;
  // rateLimit.ts — для необязательной зависимости ioredis (её может не быть).
  {
    files: ["next.config.ts", "src/lib/rateLimit.ts"],
    rules: {
      "@typescript-eslint/no-require-imports": "off",
    },
  },
]);

export default eslintConfig;
