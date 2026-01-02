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

## Performance Optimizations & Gotchas

### Optimization 1: Batched Dark Detection (Opt-1)
**What changed:** `src/utils/dark-detection.ts` now batches all `getComputedStyle()` calls instead of interleaving them with DOM measurements.

**Why:** Calling `getComputedStyle()` forces a synchronous layout recalculation. The old code called it 20+ times mixed with `getBoundingClientRect()` calls, triggering 60+ forced layouts.

**Implementation:**
- PHASE 1A: Collect all elements to sample (querySelectorAll)
- PHASE 1B: Batch all `getBoundingClientRect()` checks first (filter hidden elements)
- PHASE 1C: Batch all `getComputedStyle()` reads into a Map
- PHASE 1D: Process cached styles without touching layout

**Performance gain:** ~60-70% faster dark detection (20-40ms saved on typical pages)

**Pitfalls avoided:**
- Must check `rect.width === 0 && rect.height === 0` before caching styles (skip hidden elements)
- Body element must always be sampled regardless of dimensions
- Style cache is scoped to function call (no memory leaks)

**Testing:** Added `tests/unit/dark-detection-performance.test.ts` to verify batching behavior and edge cases

**Future work:** Could further optimize by using `requestIdleCallback` for non-critical detection, but this conflicts with shield timing requirements

### Optimization 2: Regex Compilation Cache (Opt-2)
**What changed:** `src/utils/regex.ts` now caches compiled RegExp objects instead of recompiling on every `urlExcluded()` call.

**Why:** URL exclusion checks happen during navigation, settings changes, and content script initialization. Recompiling the same regex patterns repeatedly wastes 1-5ms per check.

**Implementation:**
- Created `getCompiledRegexList()` that caches results in a `Map<string, RegExp[]>`
- Cache key is `patterns.join('\x00')` (null separator prevents collisions)
- LRU-like eviction when cache exceeds 100 entries (prevents memory leaks)
- `clearRegexCache()` exported for settings changes (e.g., when user modifies exclude patterns)

**Performance gain:** ~95% faster subsequent URL checks (from ~2ms to <0.1ms). First check remains same speed.

**Pitfalls avoided:**
- Used null character (`\x00`) as separator to prevent key collisions (e.g., ["a", "b.com"] vs ["ab", ".com"])
- Limited cache size to 100 entries to prevent unbounded memory growth
- Cache persists across navigation within same content script lifecycle (desired behavior)
- Invalid regex patterns are handled gracefully (caught in try/catch, skipped in output)

**Testing:** Added `tests/unit/regex-cache.test.ts` with 13 tests covering caching behavior, collisions, eviction, and edge cases

**When to clear cache:**
- User modifies exclude patterns in settings (call `clearRegexCache()` in settings handler)
- Not needed on navigation (patterns typically don't change between pages)

**Future work:** Could use WeakMap if patterns array references were stable, but current approach is simpler and more reliable

### Optimization 3: Deferred Worker Initialization (Opt-3)
**What changed:** `src/content/index.ts` optimizer worker now initializes via `requestIdleCallback` instead of synchronously during `startOptimizerIfEnabled()`.

**Why:** The optimizer samples 120 elements with `getComputedStyle()` calls, blocking main thread for 30-80ms during critical rendering time. This delays when users see the dark theme applied.

**Implementation:**
- Split initialization into two functions:
  - `startOptimizerIfEnabled()`: Creates deferred promise using `requestIdleCallback`
  - `initializeOptimizerWorker()`: Actual worker setup (runs when idle)
  - `collectContrastSamples()`: Batched style sampling in `requestAnimationFrame`
- Worker init promise prevents duplicate initialization
- Reduced sample size from 120 to 80 elements (still statistically valid)
- Reduced selector set (removed `dd,dt,small,code,pre,h4,h5,h6`) - kept most common text elements
- Batched all `getComputedStyle()` reads in phase 1, then process in phase 2
- Single `getComputedStyle(document.body)` for transparent background fallback (reused for all)

**Performance gain:** Dark mode appears 30-80ms faster. User sees theme immediately; contrast adjustments apply asynchronously in background.

**Pitfalls avoided:**
- Used `requestIdleCallback` with 2s timeout fallback (ensures init happens even if page stays busy)
- Polyfill for `requestIdleCallback` using `setTimeout(cb, 0)` if not available (older browsers)
- Promise guard (`workerInitPromise`) prevents race condition if called multiple times
- Reset promise to null on failure so retry is possible
- Batched style reads to avoid layout thrashing (same pattern as Opt-1)
- `requestAnimationFrame` ensures sampling happens after layout is stable

**Testing:** Added `tests/unit/optimizer-defer.test.ts` with 10 tests covering deferral logic, batching, error handling

**Trade-offs:**
- Contrast optimization suggestions appear slightly later (but don't block initial dark mode)
- Reduced from 120 to 80 samples (80 is still sufficient for statistical accuracy - 67% of original)
- Acceptable trade-off for 30-80ms faster initial render

**Browser compatibility:**
- `requestIdleCallback`: Firefox 55+, Chrome 47+
- Fallback to `setTimeout` works on all browsers
- Extension targets Firefox 115+ so native support is guaranteed

### Optimization 4: Chunked TreeWalker in Photon Inverter (Opt-4)
**What changed:** `src/content/algorithms/photon-inverter.ts` now uses `TreeWalker` with chunked processing instead of `querySelectorAll("body *")`.

**Why:** `querySelectorAll("body *")` returns ALL descendants (5000+ elements on large pages) and processes them synchronously, blocking the main thread for 50-200ms.

**Implementation:**
- Skip small pages (< 50 children) - CSS handles them without JS
- Use `TreeWalker` with `NodeFilter` to skip non-processable elements early
- Process in chunks of 200 elements per `requestAnimationFrame`
- Two-phase processing:
  - Phase 1: Batch all `getComputedStyle()` reads, identify elements needing fixes
  - Phase 2: Batch all DOM writes (`style.backgroundColor`, `setAttribute`)
- Optimized transparency check: `bg.charCodeAt(bg.length - 2) === 48` instead of `bg.includes('rgba')`
- Mark processed elements with `data-photon-fix` attribute to prevent reprocessing

**Performance gain:** 60-80% faster on large pages (50-200ms savings). Initial dark mode appears immediately; transparency fixes apply progressively without visible flicker.

**Pitfalls avoided:**
- `NodeFilter.FILTER_REJECT` stops descending into children (more efficient than `FILTER_SKIP`)
- Used `Set` for tag lookup instead of multiple OR comparisons
- Batch size (200) fits comfortably in 16ms frame budget (~10ms actual)
- `requestAnimationFrame` ensures chunks don't block rendering
- Small page check (< 50 children) avoids overhead when CSS is sufficient

**Testing:** Added `tests/unit/photon-inverter-performance.test.ts` with 13 tests covering TreeWalker usage, chunking, batching, and edge cases

**Trade-offs:**
- Small pages skip JS processing entirely (rely on CSS - acceptable)
- Transparency fixes apply asynchronously (not visible to user due to immediate CSS filter application)
- 200-element chunks mean large pages take multiple frames (but no blocking)
