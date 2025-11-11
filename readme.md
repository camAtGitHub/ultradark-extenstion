// README.md

# UltraDark Reader (Firefox)

A fast, privacy-respecting dark-mode extension featuring:

- **Regex-based site exclusions** for precise control
- **Dynamic Contrast Optimizer** (WCAG-aware) to auto-tune contrast on the fly
- **Worker thread offloading** to keep pages responsive
- Per-site toggles, AMOLED mode, sliders (brightness/contrast/sepia/grayscale/blue shift)
- Schedule-based auto-enable (night hours)
- Minimal permissions, no tracking, open source

---

## Quick Start

```bash
# 1) Install deps (creates placeholder icons automatically)
npm install

# 2) Dev (writes to dist/)
npm run dev

# 3) Build production
npm run build

# 4) Zip for AMO upload
npm run zip
````

### Load in Firefox

* Go to `about:debugging` → "This Firefox" → "Load Temporary Add-on"
* Select `dist/manifest.json`

> Tip: For Android (Fenix/Nightly with debug extensions), use `about:debugging` remote setup.

---

## Features

* **Global toggle** in popup
* **Modes**: Dynamic (with optimizer) or Static
* **AMOLED**: true black backgrounds
* **Per-site**: context menu → "UltraDark: Toggle on this site" / "Exclude this site"
* **Regex exclusions**: `Options → Regex Exclusions`, supports `/pattern/flags` or plain text
* **Schedule**: Night window (local time) toggles automatically
* **Privacy**: no remote calls, persists only to `browser.storage.sync`

---

## Permissions

* `storage` for settings
* `tabs`, `activeTab` for applying changes to the current tab
* `scripting` for content script interactions
* `alarms` for schedule polling
* `contextMenus` for per-site actions
* `host_permissions: "<all_urls>"` to operate everywhere (respected by regex/per-site exclusions)

---

## Architecture

* **MV3** service worker background: menus, schedule, messaging
* **Content script**: CSS injection, media inversion, SPA robustness, optimizer trigger
* **Worker**: computes contrast ratios & suggests contrast % (keeps main thread responsive)
* **Options**: scheduling, regex editor, per-site overview
* **Popup**: quick controls & sliders

---

## Known Limitations / Edge Cases

* Extremely custom sites may require site-specific CSS overrides (future “Advanced CSS” field).
* PDFs in the browser’s viewer are not modified.
* Cross-origin iframes may not be fully stylable due to isolation.

---

## Contributing

* Code style: ESLint + Prettier
* Tests: `vitest` → `npm test`
* PRs welcome.
