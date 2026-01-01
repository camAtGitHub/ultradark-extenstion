# Agent Guide
## Project Description
This repository is a browser extension built with TypeScript and Vite. Key areas:

- **Popup UI**: `src/popup/` controls the popup sliders and toggles. The popup sends `udr:settings-updated` messages to the active tab.
- **Content scripts**: `src/content/` contains algorithms and the main entry (`index.ts`) that reads settings and applies the selected algorithm.
- **Algorithms**: 
  - Photon inverter (`src/content/algorithms/photon-inverter.ts`) - Uses CSS filters via `generatePhotonInverterCSS()`
  - DOM walker (`src/content/algorithms/dom-walker.ts`) - DOM traversal with color inversion.
  - Chroma semantic (`src/content/algorithms/chroma-semantic.ts`) - Semantic color palettes based on DOM depth
  - **IMPORTANT**: All algorithms use the slider settings (brightness, contrast, sepia, grayscale, blueShift) through `applyFilterCss()` in `src/content/index.ts`, which is called for ALL modes before the algorithm-specific function
  - **NOTE**: DOM walker algorithm has been deprecated and removed as per architectural decision (Ticket UD-001)
- **Instant Shield (Anti-FOUW)**: 
  - `applyShield()` in `src/content/index.ts` - Applies immediate CSS filter (invert + hue-rotate) to prevent white flash
  - Shield is applied BEFORE waiting for document ready to ensure instant darkening
  - `removeShield()` is called after the intelligent algorithm completes its first pass
  - Images/videos are re-inverted while shield is active to maintain correct appearance
  - Shield uses brute-force CSS filters and is replaced by sophisticated algorithms once ready
- **Shared CSS builder**: `src/content/style-template.ts` builds the injected CSS using brightness/contrast/etc.
- **CSS Variable Hijacking**: 
  - `processCSSVariables()` in `src/content/algorithms/chroma-semantic.ts` - Scans for CSS Custom Properties on :root and html
  - Identifies color variables by pattern matching (background/bg/surface/canvas/panel for backgrounds, text/foreground/color/fg for text)
  - Injects a single `<style id="udr-css-hijack">` block that overrides all matched variables globally
  - O(1) global theming - changing one :root variable updates the entire page instantly
  - Cleaned up by `resetChromaSemantic()` when switching modes
- **Contrast Optimizer**: `src/content/optimizer-worker.ts` is a Web Worker that analyzes page contrast and automatically adjusts contrast settings:
  - Samples up to 120 text elements from the page
  - Calculates WCAG-compliant contrast ratios using relative luminance
  - Suggests contrast adjustments when median contrast is < 4.5 (too low) or > 9 (too harsh)
  - **IMPORTANT**: When optimizer is enabled, it overrides manual contrast slider values
  - The optimizer persists its changes to storage, updating both UI sliders and applied styles
  - Uses OffscreenCanvas which normalizes colors to hex format (both `#rgb` and `#rrggbb`)
  - Debug logs can be enabled via the "Enable debug logging" option to see full analysis details
  - **UX Consideration**: Contrast slider is disabled (greyed out) when optimizer is enabled to prevent user confusion
- **Dark Detection**: `src/utils/dark-detection.ts` - Lean detection strategy (no metadata guessing):
  - `isAlreadyDarkTheme()` - Main detection function using only browser standards and visual reality
  - **CHECK 1 - Browser Standards**: Reads `color-scheme` CSS property from computed styles (official standard)
  - **CHECK 2 - Visual Reality**: Calculates WCAG luminance from html/body backgroundColor (threshold: 0.3 for dark)
  - **NO REGEX MATCHING**: Does not check class names, IDs, or other metadata (too fragile)
  - **Extension Guard**: Detects if UltraDark has already applied styles to prevent false positives
  - Detection happens before application to avoid "double inversion" on native dark sites
- **Passive Mode**: 
  - `applyPassiveMode()` in `src/content/index.ts` - "Do No Harm" state for natively dark sites
  - Triggered when `isAlreadyDarkTheme()` returns true (site is already dark)
  - Sets `data-udr-state="passive"` on `<html>` element
  - Only applies minimal polish: slightly dims images/videos (opacity: 0.9) to match dark ambiance
  - Does NOT modify backgrounds, text colors, or apply any algorithms (Photon/Chroma)
  - Prevents "double inversion" that would break native dark themes
  - Cleaned up by `removeCss()` when extension is disabled or settings change

## Popup-to-Content Communication Flow
1. User changes setting in popup UI (`src/popup/index.ts`)
2. Setting is saved via `setSettings()` from `src/utils/storage.ts`
3. Popup sends message: `browser.tabs.sendMessage(tab.id, { type: "udr:settings-updated" })`
4. Content script (`src/content/index.ts`) receives message and re-applies the theme
5. Content script reads settings and calls the appropriate algorithm based on `settings.mode`

## Code style
- Use TypeScript strict mode
- Follow existing naming conventions (camelCase for functions/variables)
- Add debug statements using `debugSync()` from `src/utils/logger.ts` for troubleshooting
- Debounce slider inputs (250ms) to avoid excessive updates

## Naming Conventions
- Functions: camelCase (e.g., `applyPhotonInverter`, `updateSlidersForMode`)
- Constants: UPPER_SNAKE_CASE (e.g., `DARK_THRESHOLD`, `BATCH_SIZE`)
- Type/Interface: PascalCase (e.g., `Settings`, `Mode`)
- CSS classes: kebab-case (e.g., `slider-row`, `mode-btn`)

## Rules:
- Don't break existing functionality!
- After finishing a bug fix / completing an github issue, ensure all linting and tests pass.

## Useful commands:
- Run tests: `npm test`
- Run lint: `npm run lint`
- Build extension: `npm run build`

## Notes from initial exploration:
- No existing `AGENTS.md` files; this file applies repo-wide.
- Tests and lint already set up in `package.json`.
- Settings changes propagate through `udr:settings-updated` messages handled in `src/content/index.ts`.
- Build order is important: `vite build` first, then `build:scripts` to avoid wiping the dist folder.
- **All three algorithms use the slider settings**: `src/content/index.ts` calls `applyFilterCss(s)` for ALL modes, which applies brightness/contrast/sepia/grayscale/blueShift via CSS filters.
- **Optimizer Worker Considerations**:
  - The optimizer runs asynchronously in a Web Worker for performance
  - Race condition fixed: debug mode must be set before sending samples to worker
  - Worker uses postMessage for debug logging back to content script
  - Color parsing handles both rgba() and hex formats due to OffscreenCanvas normalization
  - Optimizer changes are persisted to storage (respects per-site vs global settings)
  - When optimizer is active, the contrast slider in popup is disabled to prevent conflicts
