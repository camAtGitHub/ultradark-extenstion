# Agent Guide
## Project Description
This repository is a browser extension built with TypeScript and Vite. Key areas:

- **Popup UI**: `src/popup/` controls the popup sliders and toggles. The popup sends `udr:settings-updated` messages to the active tab.
- **Content scripts**: `src/content/` contains algorithms and the main entry (`index.ts`) that reads settings and applies the selected algorithm.
- **Algorithms**: 
  - Photon inverter (`src/content/algorithms/photon-inverter.ts`) - Uses CSS filters via `generatePhotonInverterCSS()`
  - DOM walker (`src/content/algorithms/dom-walker.ts`) - DOM traversal with color inversion
  - Chroma semantic (`src/content/algorithms/chroma-semantic.ts`) - Semantic color palettes based on DOM depth
  - **IMPORTANT**: All three algorithms use the slider settings (brightness, contrast, sepia, grayscale, blueShift) through `applyFilterCss()` in `src/content/index.ts`, which is called for ALL modes before the algorithm-specific function
- **Shared CSS builder**: `src/content/style-template.ts` builds the injected CSS using brightness/contrast/etc.
- **Dark Detection**: `src/utils/dark-detection.ts` contains functions for detecting if a site is already dark-themed:
  - `isAlreadyDarkTheme()` - Main detection function that combines multiple heuristics
  - `hasExplicitDarkThemeMarkers()` - Checks for dark theme classes, attributes, and meta tags
  - `getAverageBackgroundLuminance()` - Calculates luminance from page backgrounds (threshold: 0.2 for dark)
  - Detection relies on actual DOM/CSS analysis, not user's system preferences

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
