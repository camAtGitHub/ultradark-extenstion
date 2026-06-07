# AGENTS.md

Welcome, AI coding agents! This file is your canonical source of truth for repository guidelines, conventions, constraints, and scripts when operating in the **UltraDark** repository. Please follow these rules rigidly when reasoning about, exploring, or generating code safely within `src/` and `tests/`.

## 1. Scripts & Commands

### Testing

We use Vitest. Tests are stored in the `tests/` directory.

- **Run all tests:** `npm run test`
- **Run a single test file (Preferred):** `npx vitest run path/to/file.test.ts` or `npm run test -- path/to/file.test.ts`
- **Watch tests interactively:** `npx vitest`

### Linting & Formatting

- **Linter (ESLint & Stylelint):** `npm run lint` automatically checks TypeScript/JavaScript against ESLint rules and CSS files against Stylelint.
- **Formatter (Prettier):** Run `npm run format` (auto-fixes indentation, quotes, etc.) or `npm run format:check` to verify formats.
- **Type Checking strictness:** The project runs in strict mode (`"strict": true` and `"allowJs": false`).

### Build Order (Extension Packing)

- **Full Build:** `npm run build`
  - _Crucial note:_ `vite build` wipes the `dist/` directory. You must run vite build _before_ bundling background/scripts. The `"build"` pipeline handles this (`vite build && npm run build:scripts`).
- **Zip Distribution:** `npm run zip` packages everything securely into `.xpi` or `.zip`. _Distributions are zipped from inside the `dist/` folder._

---

## 2. Code Style & Architecture Guidelines

### TypeScript & Tooling Strictness

- **Any Avoidance:** The use of `any` is strictly prohibited and marked as a warning. Favor using `unknown` or strictly defining structural typing where data shapes are dynamic. Note that inside tests (`tests/**/*.{ts,tsx}`), `any` warnings are disregarded.
- **Explicit Returns:** Functions **always** explicitly state their return signature (e.g., `function isDark(): boolean { ... }`).
- **DOM Type Assertions:** Use deliberate assertions when querying the DOM instead of non-null operators (e.g. `const toggle = $("#toggle") as HTMLInputElement;`).

### Formatting Standards (Prettier Config)

- **Line Width:** 100 character maximum limit.
- **Quotes:** Prefer double quotes globally (e.g., `const style = "background-color: black";`).
- **Semicolons:** Always required at the ends of statements.
- **Indentation:** 2 spaces (no tabs).
- **Trailing Commas:** Set to ES5 mode.

### Import Constraints

- **Relative Pathing Only:** Absolutely do not use absolute aliases (`@/...`). Maintain clean nested relative paths (`../../utils/color-utils.ts`).
- **File Extensions:** Do not include `.ts` extensions inside import paths (_unless_ using Specialized Worker forms).
- **Type Separations:** Explicitly use `import type { Name } from './file'` for typings to manage bundler boundaries effectively.
- **Workers:** Web Workers must be imported via exact vite worker syntax at the top of the file: `import WorkerUrl from "./optimizer-worker?worker&url";`.

### Naming Conventions

- **Files:** `kebab-case` (e.g., `dark-detection.ts`, `color-utils.ts`).
- **Variables & Functions:** `camelCase` (e.g., `isAlreadyDarkTheme`, `darkWeight`).
- **Constants:** `UPPER_SNAKE_CASE` for file-scoped caching, numbers, config maps (e.g., `DARK_THRESHOLD`).
- **Interfaces & Types:** `PascalCase` (e.g., `Settings`, `FrameworkInfo`).
- **DOM Utility Structure:** This codebase relies structurally on vanilla DOM. Typical querying logic relies on: `const $ = (sel: string) => document.querySelector(sel) as HTMLElement`.

### Error Handling

- **Defensive Error Handling:** Do not `throw new Error(...)`. Return `null` or `false` or fall-back values robustly in place of hard crash exits.
- **Try/Catch Blocks:** Defensive coding using `try/catch` is prevalent during feature probing (such as CSS syntax/`oklch` testing and reading `browser.storage`), as older environments or cross-origin stylesheet probes often unexpectedly crash execution contexts.
- **Logging Interface:** Standard `console.log` is avoided. Centralize debugging and error logs using `/src/utils/logger.ts`, calling formats securely like `logger.warn("[UltraDark] ...")` and filtering through standard configuration options.

---

## 3. Extension Architecture & Security (Copilot Rules)

As outlined in `.github/copilot-instructions.md`, strictly obey these mandates regarding this Manifest V2 architecture:

- **Core Platform Map:** Manifest V2 is aimed primarily for Firefox compatibility. It explicitly requires stable `browser_specific_settings.gecko.id` configurations to mount and run `browser.storage` tools properly in early builds.
- **Background Scripting (ESBuild):** Bundled into an IIFE. Strictly forbidden to use CommonJS `require()`. You should utilize modern JavaScript loading forms.
- **Security:**
  1. Do not inject context strings arbitrarily as DOM components. Apply CSS formatting sanely inline or safely.
  2. Request only explicitly required permissions.
  3. Never dynamically run/fetch remote user scripts on execution contexts.

## 4. Changes, Code Edits and Commits

1. Always lint and format your code before committing (npm run lint and npm run format).
2. After every significant change, run tests to ensure nothing is broken.
3. After making changes, commit with clear, descriptive messages that explain the "what" and "why" of the change (e.g., "Fix dark mode detection logic to handle edge cases in older browsers"). (Prefer more commits than less).

_End of AI Instructions._
