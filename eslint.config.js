// eslint.config.js
import eslintJs from "@eslint/js";
import tseslint from "typescript-eslint";
import eslintConfigPrettier from "eslint-config-prettier";

export default [
  eslintJs.configs.recommended,
  ...tseslint.configs.recommended,
  eslintConfigPrettier,

  /* ---------- base settings ---------- */
  {
    languageOptions: {
      globals: {
        browser: "readonly",
        console: "readonly",
        document: "readonly",
        window: "readonly",
        setTimeout: "readonly",
        clearTimeout: "readonly",
        setInterval: "readonly",
        clearInterval: "readonly",
        URL: "readonly",
        Worker: "readonly",
        MutationObserver: "readonly",
        getComputedStyle: "readonly",
      },
    },
    rules: {
      "@typescript-eslint/no-explicit-any": "warn",
      "@typescript-eslint/no-unused-vars": ["warn", { argsIgnorePattern: "^_" }],
    },
  },

  /* ---------- test-folder overrides ---------- */
  {
    files: ["tests/**/*.{ts,tsx}"], // or just 'tests/**/*'
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-unused-vars": "off",
    },
  },

  /* ---------- ignored paths ---------- */
  {
    ignores: ["dist/**", "node_modules/**", "**/*.cjs", "**/*.js", "src/content/.temp-*.ts"],
  },
];
