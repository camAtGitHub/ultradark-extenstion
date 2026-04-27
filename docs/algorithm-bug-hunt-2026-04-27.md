# UltraDark Algorithm Bug Hunt (2026-04-27)

This document records the targeted bug hunt for:

- T003: `chroma-semantic`
- T004: `dom-walker`
- T005: `oklch-cascade`
- T006: `perceptual-remap`

## T003 — Chroma Semantic (`src/content/algorithms/chroma-semantic.ts`)

### Findings
- **Card-like CSS variables were flattened to a single surface tone** in variable hijacking, reducing hierarchy (cards/modals looked too close to canvas).
- **Unsafe typing in idle scheduling** (`any` usage) in mutation processing.

### Implemented fixes
- Added **card-like variable routing** (`card|panel|tile|modal|dialog|popover|dropdown`) so matching CSS variables map to a slightly elevated background color, preserving semantic depth.
- Replaced `any`-typed idle callback usage with typed `window.requestIdleCallback(...)`.
- Removed dead local variable (`tagName`) during semantic classification.

### Remaining opportunities
- Shadow DOM opt-in traversal for component libraries with encapsulated roots.
- Per-role contrast targets (e.g., stricter nav/input text floor).

---

## T004 — DOM Walker (`src/content/algorithms/dom-walker.ts`)

### Findings
- Mutation-path processing used an older path that interleaved style reads/writes, increasing reflow risk on dynamic pages.
- Observer ignored style/class attribute updates on existing nodes, missing SPA-driven visual updates that don’t add new nodes.
- Unused helper functions increased maintenance noise.

### Implemented fixes
- Refactored mutation `processBatch()` into a **3-phase read/compute/write flow** to reduce layout thrashing.
- Enabled attribute observation for `style` and `class` and enqueue changed elements for deferred processing.
- Removed unused color helper wrappers and unused parent-bg helper.

### Remaining opportunities
- Add a lightweight per-node “last processed style hash” to skip no-op rewrites.
- Add optional ShadowRoot traversal behind a budget cap.

---

## T005 — OKLCH Cascade (`src/content/algorithms/oklch-cascade.ts`)

### Findings
- `requestIdleCallback` used `any`-typed access in observer scheduling.
- Unused `settings` argument in special CSS generator added lint noise.

### Implemented fixes
- Replaced idle scheduling call with typed `window.requestIdleCallback(...)`.
- Renamed unused argument to `_settings` to make intent explicit and reduce noise.

### Remaining opportunities
- Add adaptive thresholds for inline sweeps based on site luminance distribution.
- Introduce per-role OKLCH chroma constraints for brand-heavy UIs.

---

## T006 — Perceptual Remap (`src/content/algorithms/perceptual-remap.ts`)

### Findings
- Several helper functions accepted `settings` but did not use it.
- `requestIdleCallback` used `any` in observer scheduling.

### Implemented fixes
- Renamed intentionally unused arguments to `_settings`.
- Replaced idle scheduling with typed `window.requestIdleCallback(...)`.

### Remaining opportunities
- Optional persistence of top palette clusters per-origin to warm-start remap on SPA navigations.
- Explicit handling for HDR/wide-gamut colors where supported.

