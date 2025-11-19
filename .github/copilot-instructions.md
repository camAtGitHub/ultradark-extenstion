# Copilot Coding Agent — Onboarding Instructions

**Project:** UltraDark Reader — Firefox dark-mode WebExtension
**Platform / Target:** Firefox (Windows x64 Only)
**Stack:** Vite, TypeScript, esbuild, vanilla WebExtension APIs (MV2), minimal front-end (popup/options), Web Worker for optimizer

---

## High-level purpose

UltraDark Reader is a Firefox WebExtension that applies a high-quality, accessible dark theme to arbitrary websites. It includes per-site settings, regex exclusions, a Dynamic Contrast Optimizer offloaded to a Web Worker, and an extension UI (popup + options). The repo contains scripts to build the extension, bundle the background script with `esbuild` (IIFE), and produce a `dist/` tree that can be loaded via `about:debugging` or packaged for AMO.

Use these instructions to boot a development environment, build, debug, test, and produce a release `.xpi`.

---

# Quick start (Windows / WSL friendly)

### Prerequisites

* Node.js (LTS; Node 18+ recommended) and npm installed.
  On Windows: use Node installer or `nvm-windows`. WSL works fine for the commands below.
* Git to clone the repository.
* Firefox (release). You will use `about:debugging` to load the temporary add-on.

### Clone + install

```bash
git clone <repo-url> ultradark-reader
cd ultradark-reader
npm ci            # reproducible install (uses package-lock.json)
```

### Build (recommended safe sequence)

We build the Vite assets first, then bundle the background script with esbuild so `dist/` is not wiped.

```bash
npm run build     # runs: vite build && node ./scripts/build-bg.cjs
```

### Load in Firefox (temporary)

1. Open Firefox → `about:debugging#/runtime/this-firefox`.
2. Click **Load Temporary Add-on** → select `dist/manifest.json`.
3. Open the extension background console via **Inspect** to see logs.

---

# Project layout (what to expect)

```
/src
  /background
    index.ts                # background logic; context menu, alarms, storage handlers
  /content
    index.ts                # content script (injects CSS, starts worker)
    optimizer-worker.ts     # worker that computes contrast suggestions
    style-template.ts       # css builder helpers
  /popup
    index.html
    index.tsx               # optional minimal React/TS UI (or vanilla TS)
  /options
    index.html
    index.tsx
  /assets
    icons/*.png
/types
/utils
scripts/
  build-bg.cjs              # bundles background with esbuild -> dist/src/background/index.js
vite.config.ts
package.json
manifest.json               # source manifest (MV2 for dev)
README.md
```

**Dist output (what you should see after a successful build):**

```
dist/
  manifest.json
  src/
    background/index.js     # esbuild IIFE (no require)
    content/index.js        # vite output
    popup/index.html
    options/index.html
  assets/...                # other bundles (if any)
```

---

# Key development details & gotchas (be decisive)

### 1. Manifest version

* This project uses **Manifest V2** (MV2) for compatibility on current Firefox builds.
* Make sure your source `manifest.json` is MV2-compatible (use `"browser_action"` not `"action"`, `"permissions"` not `"host_permissions"` in MV2).

**Must include** for development: a stable Add-on ID to enable storage APIs properly:

```json
"browser_specific_settings": {
  "gecko": {
    "id": "@ultradark-reader@example.com",
    "strict_min_version": "115.0",
    "data_collection_permissions": { "required": ["none"], "optional": [] }
  }
}
```

* `data_collection_permissions` is required for new AMO submissions (declare `["none"]` if you collect nothing).

### 2. Background bundling — esbuild IIFE

* Background scripts must be browser-safe and cannot use CommonJS `require()`. We produce a browser IIFE via esbuild.
* We intentionally **build Vite first** then `build-bg.cjs` writes `dist/src/background/index.js` so `vite build` does not wipe it. `package.json` `build` script is:

```json
"build": "vite build && npm run build:bg",
"build:bg": "node ./scripts/build-bg.cjs"
```

* `scripts/build-bg.cjs` uses `format: 'iife'`, `platform: 'browser'`, `bundle: true`.

### 3. Web Worker bundling (content/optimizer-worker.ts)

* Use Vite worker loader so Vite knows to emit the worker bundle. **Top-level import** in `src/content/index.ts`:

```ts
import WorkerUrl from "./optimizer-worker?worker&url";  // must be top-level import
// ...
worker = new Worker(WorkerUrl);
```

* **Important:** `import` statements must be at the top level of the file (not inside functions/conditionals). If you see `import declarations may only appear at top level`, move the import above other code.

### 4. Vite output shape & config

* `vite.config.ts` uses `rollupOptions.input` for multiple entries: `content`, `popup`, `options` (do not include `background` there).
* We copy `manifest.json` into `dist/` using a small plugin (or rely on manual copy). The build script is written to ensure `dist/manifest.json` exists.

### 5. Build order / emptyOutDir

* If your `background` disappears after build, it’s because `vite build` empties `dist/`. Build order matters — **vite build** first, **esbuild** second. This is baked into scripts above.

---

# Typical developer workflow

Edit code → build → reload extension

1. Edit files under `src/`.
2. Rebuild:

   ```bash
   npm run build
   ```

   (faster: `npm run build:bg` if you only changed background; `vite build` if only popup/content)
3. Reload extension in Firefox:

   * Remove the temporary add-on and **Load Temporary Add-on** → `dist/manifest.json`
   * Or click **Reload** if the add-on is already loaded in `about:debugging`.
4. Inspect:

   * Background script console: `Inspect` in `about:debugging`.
   * Page console for content script messages (F12 on the page).

---

# Debugging checklist (fast)

If extension fails to load or errors appear:

1. **Manifest errors** (`action` / `host_permissions` etc): ensure MV2 keys only (or switch to MV3 + enable flag). For now, use MV2 manifest.
2. **`require is not defined`**: background was built as CommonJS. Ensure `build-bg.cjs` creates an IIFE and that `dist/src/background/index.js` was produced.
3. **Background exists but missing after build**: check build order (vite build may overwrite `dist`); use `vite build && npm run build:bg`.
4. **Worker not found / 404**: check the worker import uses `?worker&url`; inspect `dist/assets/` for `optimizer-worker-*.js`.
5. **`import declarations may only appear at top level`**: move all `import` statements to top of file.
6. **`storage API will not work with a temporary addon ID`**: add `"browser_specific_settings":{"gecko":{"id":"@ultradark-reader@example.com"}}` to manifest and copy to `dist/`.
7. **Context menu errors (`action` contexts)**: change `contexts: ["page","action"]` → `["page","browser_action"]` in source.
8. **If in doubt, backup dist and rebuild clean:**

```bash
mv dist dist_backup_$(date +%s)
rm -rf node_modules/.vite .vite .cache
npm ci
npm run build
```

---

# Scripts (recommended `package.json` snippets)

Add/verify these scripts in `package.json`:

```json
"scripts": {
  "dev": "vite",
  "build": "vite build && npm run build:bg",
  "build:bg": "node ./scripts/build-bg.cjs",
  "clean": "rimraf dist .vite node_modules/.vite",
  "lint": "eslint 'src/**/*.{ts,tsx,js}' --fix",
  "test": "vitest"
}
```

* `build-bg.cjs` content (already in repo): uses `esbuild.build({ entryPoints: ['src/background/index.ts'], outfile: 'dist/src/background/index.js', bundle: true, format: 'iife', platform: 'browser', target: ['es2020'] })`.

---

# Coding standards & conventions

- Ensure that full debug statements are added to the code. They should be toggle-able via the master 'development mode' flag in the extension settings. The purpose is for troubleshooting of debugging dark-theme issues, dark-theme detection logic Exac- Write unit testsfor all major functions and components, ensuring high code coverage.
- Copy existing coding styles from the project. Use consistent indentation, naming conventions, and file organization.

---
# Testing & linting

* **Unit / function tests:** If present, run with `npm test` (we recommend `vitest` for TypeScript). Add tests under `__tests__` or alongside modules with `.spec.ts`.
* **Linting & formatting:** `eslint` + `prettier`. Use `npm run lint` as configured.
* **Manual QA:** load `dist/manifest.json`, exercise:

  * global toggle on various websites (news, Gmail, streaming).
  * per-site toggles and regex exclusion (test `example.com`, `sub.example.com`).
  * contrast optimizer: enable/disable and verify CSS updates.
  * worker: check background & content console messages for worker messages.

---

# Packaging for AMO

1. Produce a clean `dist/`:

   ```bash
   npm run clean
   npm run build
   ```
2. Create a zip of `dist/` contents (not the parent folder) for upload:

   ```bash
   cd dist
   zip -r ../ultradark-reader-v1.0.0.zip *
   cd ..
   ```
3. Include a privacy policy if you declare any data collection. If you don’t collect external data, your manifest must state `"data_collection_permissions": { "required":["none"], "optional": [] }`.
4. Follow AMO submission guidelines and tests. Validate in the developer hub.

---

# Security & privacy notes

* Do not request more permissions than needed. Use `<all_urls>` only if necessary and clearly document why.
* If you send user data outside of the extension, declare it in `data_collection_permissions` and provide a privacy policy.
* Sanitize any dynamic CSS or strings to avoid injection into page contexts.
* Avoid loading remote scripts in the extension context.

---

# Emergency troubleshooting commands (copy/paste)

Clean everything and rebuild:

```bash
# backup + clean
ts=$(date +%Y%m%d-%H%M%S)
mv dist dist_backup_$ts 2>/dev/null || true
rm -rf dist node_modules/.vite .vite .cache
npm ci
npm run build
```

Show dist tree and manifest head:

```bash
ls -R dist | sed -n '1,200p'
head -n 60 dist/manifest.json
head -n 8 dist/src/background/index.js
```

Search for stray MV3 keys in source:

```bash
grep -R '"action"' || true
grep -R '"host_permissions"' || true
```

Find `import` that’s not top-level:

```bash
# quick heuristic: show files with 'import' not at top (manual review required)
awk 'FNR==1{f=FILENAME} { if(/import / && NR>5) print f ":" FNR ":" $0 }' src/*.ts || true
```

---

# Recommended README additions (for maintainers)

* Exact Node and npm versions used.
* How to run a dev iteration (build → reload).
* Manifest MV2 notes.
* Where to change Add-on ID.
* How to package a release.

---

# Final checklist before considering a change merged

* `npm run build` completes cleanly (no errors).
* `dist/manifest.json` present and MV2-compliant with `browser_specific_settings.gecko.id`.
* `dist/src/background/index.js` exists and contains no `require`.
* Worker entry emitted into `dist/assets/` (worker file present) and `content` uses `?worker&url`.
* Basic functional manual QA performed (toggle, per-site, contrast optimizer).
* Linting passed and unit tests green (if present).
