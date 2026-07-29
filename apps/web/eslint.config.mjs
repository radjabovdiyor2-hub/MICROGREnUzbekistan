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
      // img tags are used intentionally in magazine/AR/external-content components
      "@next/next/no-img-element": "off",
      // Downgrade any to warn — systematic removal requires major refactor
      "@typescript-eslint/no-explicit-any": "warn",
    },
  },
  // next.config.ts uses dynamic require() for optional Sentry
  {
    files: ["next.config.ts"],
    rules: {
      "@typescript-eslint/no-require-imports": "off",
    },
  },
]);

export default eslintConfig;
