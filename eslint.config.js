import js from "@eslint/js";
import tseslint from "typescript-eslint";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import prettierConfig from "eslint-config-prettier";

export default tseslint.config(
  {
    ignores: ["**/dist/**", "**/node_modules/**", "graft/**", "**/coverage/**"],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      "@typescript-eslint/no-unused-vars": ["warn", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
      // Pairs with `verbatimModuleSyntax`: type-only imports must say so, which
      // keeps the types-only @jev/shared package out of the runtime bundle.
      "@typescript-eslint/consistent-type-imports": ["error", { fixStyle: "inline-type-imports" }],
      // `import { type A } from "x"` still emits a bare `import "x"` under
      // verbatimModuleSyntax; this forces `import type { A }` instead.
      "@typescript-eslint/no-import-type-side-effects": "error",
    },
  },
  {
    files: ["backend/**/*.ts", "frontend/vite.config.ts", "e2e/**/*.{js,mjs,ts}"],
    languageOptions: {
      globals: globals.node,
    },
  },
  {
    files: ["frontend/src/**/*.{ts,tsx}"],
    languageOptions: {
      globals: globals.browser,
    },
    ...reactHooks.configs.flat["recommended-latest"],
  },
  {
    files: ["frontend/src/**/*.tsx"],
    ...reactRefresh.configs.vite,
  },
  {
    // Test files export helpers alongside components; fast refresh doesn't apply.
    files: ["frontend/src/**/*.test.{ts,tsx}", "frontend/src/test/**"],
    rules: { "react-refresh/only-export-components": "off" },
  },
  // Must come last — disables stylistic ESLint rules that would otherwise
  // fight with Prettier's formatting instead of leaving it the one source
  // of truth for style.
  prettierConfig
);
