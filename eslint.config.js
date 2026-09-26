import js from "@eslint/js";
import tseslint from "typescript-eslint";
import globals from "globals";
import prettierConfig from "eslint-config-prettier";

export default tseslint.config(
  {
    ignores: ["dist/**", "node_modules/**", "graft/**", "coverage/**"],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["src/**/*.ts"],
    languageOptions: {
      globals: globals.node,
    },
    rules: {
      "@typescript-eslint/no-unused-vars": ["warn", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
    },
  },
  {
    files: ["public/**/*.js"],
    languageOptions: {
      globals: globals.browser,
      sourceType: "script",
    },
  },
  // Must come last — disables stylistic ESLint rules that would otherwise
  // fight with Prettier's formatting instead of leaving it the one source
  // of truth for style.
  prettierConfig
);
