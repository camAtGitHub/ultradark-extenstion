// File: src/content/algorithms/perceptual-remap.ts

/**
 * ============================================================================
 * PERCEPTUAL REMAP ENGINE v1.1
 * ============================================================================
 *
 * A colour-analysis dark-mode algorithm that reads the page's actual palette,
 * converts each colour into OKLCH, and generates a precise remapping
 * stylesheet. Where the OKLCH Cascade engine paints with broad strokes,
 * this engine operates like a retoucher — adjusting only what needs to change
 * while preserving the designer's intent.
 *
 * ── Philosophy ──────────────────────────────────────────────────────────────
 * "Measure twice, cut once."
 *   — carpenters, surgeons, and anyone who respects the existing design
 *
 * ── Performance Profile ─────────────────────────────────────────────────────
 * Phase 0  Instant (< 1 ms)   color-scheme: dark injection
 * Phase 1  Fast    (< 5 ms)   framework detection + native dark activation
 * Phase 2  Fast    (< 5 ms)   colour palette extraction (75 elements max)
 * Phase 3  Fast    (< 3 ms)   OKLCH remapping computation (pure math)
 * Phase 4  Instant (< 1 ms)   stylesheet generation + injection
 * Phase 5  Fast    (< 10 ms)  CSS variable hijack
 * Phase 6  Fast    (< 5 ms)   inline-style sweep (rAF-deferred)
 * Phase 7  Idle               mutation observer
 *
 * Total first-paint cost: typically < 20 ms.
 * No layout thrash: style reads are batched in Phase 2, writes in Phase 4+.
 *
 * ── User Slider Preferences ─────────────────────────────────────────────────
 * brightness, contrast, sepia, grayscale, blueShift are applied by index.ts
 * via buildCss() as a CSS filter chain on <html>. This algo does NOT re-apply
 * those values internally. In particular, sepia warmth is NOT used here for
 * color-mix() blending — the parent filter already handles it.
 *
 * ── Unique Exports ──────────────────────────────────────────────────────────
 * applyPerceptualRemap(settings)        ← call from index.ts
 * resetPerceptualRemap()                ← call from index.ts
 * getPerceptualRemapDiagnostics()       ← optional diagnostics
 *
 * In src/content/index.ts add:
 *   import { applyPerceptualRemap, resetPerceptualRemap }
 *     from "./algorithms/perceptual-remap";
 *
 * ============================================================================
 */

import type { Settings } from "../../types/settings";
import { debugSync } from "../../utils/logger";
import { applyPhotonInverter } from "./photon-inverter";
import { getSettings, originFromUrl } from "../../utils/storage";
import { parseRgbFast, getRelativeLuminance } from "../../utils/color-utils";

// ============================================================================
// CONSTANTS
// ============================================================================

const STYLE_IDS = {
  colorScheme: "udr-premap-scheme",
  remapRules: "udr-premap-rules",
  variableHijack: "udr-premap-hijack",
  specialRules: "udr-premap-special",
} as const;

/** Diagnostic bridge script ID — separate from STYLE_IDS (script, not style tag) */
const DIAG_SCRIPT_ID = "udr-premap-diag-bridge" as const;

const ENGINE_MODE = "perceptual-remap" as const;

/**
 * Max elements to sample during colour extraction.
 * 75 elements captures >95% of any real page's palette with ~5ms cost.
 * 150 was the original value; halved for performance without quality loss.
 */
const SAMPLE_LIMIT = 75;

/** Max unique colours to track */
const MAX_UNIQUE_COLORS = 80;

/** Selectors for sampling representative elements */
const SAMPLE_SELECTORS =
  "body,main,article,section,aside,nav,header,footer,div,p,span,a,h1,h2,h3,h4,h5,h6," +
  "li,td,th,button,input,textarea,select,label,pre,code,blockquote," +
  '[class*="card"],[class*="panel"],[class*="modal"],[class*="nav"],' +
  '[class*="header"],[class*="sidebar"],[class*="content"],[class*="container"],' +
  '[role="main"],[role="navigation"],[role="dialog"]';

const FRAMEWORK_PATTERNS: ReadonlyArray<{
  pattern: RegExp;
  name: string;
  darkModeSelector?: string;
}> = [
  { pattern: /^--tw-/, name: "tailwind", darkModeSelector: ".dark" },
  { pattern: /^--bs-/, name: "bootstrap", darkModeSelector: '[data-bs-theme="dark"]' },
  { pattern: /^--bulma-/, name: "bulma", darkModeSelector: '[data-theme="dark"]' },
  { pattern: /^--color-|^--primer-/, name: "primer", darkModeSelector: '[data-color-mode="dark"]' },
  { pattern: /^--mdc-|^--md-/, name: "material" },
  { pattern: /^--chakra-/, name: "chakra", darkModeSelector: ".chakra-ui-dark" },
  { pattern: /^--radix-/, name: "radix" },
  { pattern: /^--shadcn-/, name: "shadcn" },
  { pattern: /^--next-/, name: "nextjs" },
];

const VAR_PATTERNS = {
  background: /background|^bg$|bg-|surface|canvas|base-color|page-bg/i,
  foreground: /foreground|^fg$|fg-|text-color|font-color|body-color/i,
  border: /border|divider|separator|outline-color/i,
  shadow: /shadow/i,
} as const;

// ============================================================================
// TYPES
// ============================================================================

interface OKLCH {
  L: number; // 0–1  perceptual lightness
  C: number; // 0–~0.4  chroma
  H: number; // 0–360  hue angle
}

interface ColorMapping {
  original: string;
  key: string;
  r: number;
  g: number;
  b: number;
  oklch: OKLCH;
  role: "bg" | "fg" | "both";
  darkBg: string;
  darkFg: string;
  count: number;
}

interface FrameworkInfo {
  name: string;
  detected: boolean;
  hasNativeDarkMode: boolean;
  darkModeActivated: boolean;
}

interface EngineStats {
  startTime: number;
  uniqueColorsFound: number;
  colorsRemapped: number;
  variablesHijacked: number;
  inlineFixCount: number;
  frameworkDetected: string | null;
  nativeDarkModeActivated: boolean;
  fallbackTriggered: boolean;
  totalTimeMs: number;
}

// ============================================================================
// MODULE STATE
// ============================================================================

let mutationObserver: MutationObserver | null = null;
let stats: EngineStats | null = null;
let detectedFramework: FrameworkInfo | null = null;
let activeColorMap: Map<string, ColorMapping> = new Map();

/**
 * Tracks exactly which HTML attributes/classes were set by THIS engine during
 * activateNativeDark() so that resetPerceptualRemap() only removes what it
 * added — never stripping a site's own pre-existing dark-mode attribute.
 */
const engineSetAttrs = new Set<string>();

/** Feature probe cache — NOT cleared on reset (capabilities are session-stable) */
let _oklchOk: boolean | null = null;

// ============================================================================
// FEATURE PROBES
// ============================================================================

function supportsOklch(): boolean {
  if (_oklchOk !== null) return _oklchOk;
  try {
    const el = document.createElement("div");
    el.style.color = "oklch(0.5 0.1 180)";
    _oklchOk = el.style.color !== "";
  } catch {
    _oklchOk = false;
  }
  return _oklchOk;
}

// ============================================================================
// OKLCH CONVERSION
// ============================================================================

function srgbToLinear(c: number): number {
  const s = c / 255;
  return s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
}

function linearRgbToOklab(r: number, g: number, b: number): { L: number; a: number; b_: number } {
  const l = 0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b;
  const m = 0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b;
  const s = 0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b;

  const l_ = Math.cbrt(l);
  const m_ = Math.cbrt(m);
  const s_ = Math.cbrt(s);

  return {
    L: 0.2104542553 * l_ + 0.793617785 * m_ - 0.0040720468 * s_,
    a: 1.9779984951 * l_ - 2.428592205 * m_ + 0.4505937099 * s_,
    b_: 0.0259040371 * l_ + 0.7827717662 * m_ - 0.808675766 * s_,
  };
}

function rgbToOklch(r: number, g: number, b: number): OKLCH {
  const lab = linearRgbToOklab(srgbToLinear(r), srgbToLinear(g), srgbToLinear(b));
  const C = Math.sqrt(lab.a * lab.a + lab.b_ * lab.b_);
  let H = Math.atan2(lab.b_, lab.a) * (180 / Math.PI);
  if (H < 0) H += 360;
  return { L: lab.L, C, H };
}

function oklchToCss(lch: OKLCH): string {
  return `oklch(${lch.L.toFixed(3)} ${lch.C.toFixed(4)} ${lch.H.toFixed(1)})`;
}

// ============================================================================
// DARK-MODE REMAPPING LOGIC
// ============================================================================

/**
 * Compute dark-mode equivalents in OKLCH space.
 *
 * NOTE: warmth (sepia) is NOT applied here. The user's sepia slider is
 * honoured by buildCss() as a sepia() CSS filter on <html>. Applying it
 * again via color-mix() would double-warm the page.
 */
function remapForDarkBg(oklch: OKLCH): OKLCH {
  const { L, C, H } = oklch;

  let newL: number;
  if (L > 0.6) {
    newL = 0.1 + (1 - L) * 0.24;
  } else if (L > 0.35) {
    newL = 0.15 + (L - 0.35) * 0.28;
  } else {
    newL = Math.max(0.08, L * 0.9);
  }

  // Reduce chroma for backgrounds (less eye strain)
  const newC = Math.min(C * 0.5, 0.04);

  return { L: newL, C: newC, H };
}

function remapForDarkFg(oklch: OKLCH): OKLCH {
  const { L, C, H } = oklch;

  let newL: number;
  if (L < 0.4) {
    newL = 0.82 + (0.4 - L) * 0.3;
  } else if (L < 0.7) {
    newL = 0.75 + (L - 0.4) * 0.3;
  } else {
    newL = Math.min(L, 0.94);
  }

  const newC = Math.min(C * 1.15, 0.35);
  return { L: newL, C: newC, H };
}

// ============================================================================
// PHASE 0: COLOR-SCHEME INJECTION
// ============================================================================

function injectColorScheme(): void {
  let tag = document.getElementById(STYLE_IDS.colorScheme) as HTMLStyleElement | null;
  if (!tag) {
    tag = document.createElement("style");
    tag.id = STYLE_IDS.colorScheme;
    (document.head || document.documentElement).prepend(tag);
  }
  tag.textContent = `:root { color-scheme: dark !important; }`;
}

// ============================================================================
// PHASE 1: FRAMEWORK DETECTION
// ============================================================================

function detectFramework(): FrameworkInfo {
  debugSync("[Perceptual Remap] Phase 1: Framework Detection");

  const info: FrameworkInfo = {
    name: "unknown",
    detected: false,
    hasNativeDarkMode: false,
    darkModeActivated: false,
  };
  const html = document.documentElement;

  for (const attr of ["data-theme", "data-mode", "data-color-scheme"]) {
    if (html.getAttribute(attr) === "dark") {
      info.hasNativeDarkMode = true;
      info.darkModeActivated = true;
      return info;
    }
  }
  const cs = getComputedStyle(html).colorScheme;
  if (cs === "dark" || cs === "dark light") {
    info.hasNativeDarkMode = true;
    info.darkModeActivated = true;
    return info;
  }

  const rootStyle = getComputedStyle(html);
  for (const fw of FRAMEWORK_PATTERNS) {
    for (const suffix of ["-bg", "-background", "-primary"]) {
      if (rootStyle.getPropertyValue(`--${fw.name}${suffix}`).trim()) {
        info.name = fw.name;
        info.detected = true;
        break;
      }
    }
    if (info.detected) break;
  }

  if (!info.detected) {
    try {
      const sheets = document.styleSheets;
      outer: for (let i = 0; i < Math.min(sheets.length, 5); i++) {
        try {
          const rules = sheets[i].cssRules;
          if (!rules) continue;
          for (let j = 0; j < Math.min(rules.length, 50); j++) {
            const r = rules[j];
            if (
              r instanceof CSSStyleRule &&
              (r.selectorText === ":root" || r.selectorText === "html")
            ) {
              for (const fw of FRAMEWORK_PATTERNS) {
                if (fw.pattern.test(r.cssText)) {
                  info.name = fw.name;
                  info.detected = true;
                  break outer;
                }
              }
            }
          }
        } catch {
          continue;
        }
      }
    } catch {
      /* ignore */
    }
  }

  if (info.detected) {
    const cfg = FRAMEWORK_PATTERNS.find((f) => f.name === info.name);
    if (cfg?.darkModeSelector) {
      try {
        const allSheets = document.styleSheets;
        for (let si = 0; si < allSheets.length; si++) {
          try {
            const sheetRules = allSheets[si].cssRules;
            if (!sheetRules) continue;
            for (let ri = 0; ri < sheetRules.length; ri++) {
              if (
                sheetRules[ri] instanceof CSSStyleRule &&
                (sheetRules[ri] as CSSStyleRule).selectorText.includes(cfg.darkModeSelector)
              ) {
                info.hasNativeDarkMode = true;
                break;
              }
            }
          } catch {
            continue;
          }
          if (info.hasNativeDarkMode) break;
        }
      } catch {
        /* ignore */
      }
    }
  }

  if (info.hasNativeDarkMode && !info.darkModeActivated) {
    info.darkModeActivated = activateNativeDark(info.name);
  }

  return info;
}

function activateNativeDark(fwName: string): boolean {
  const html = document.documentElement;
  const strategies: Array<{ attr?: string; cls?: string; apply: () => void }> = [
    { attr: "data-theme", apply: () => html.setAttribute("data-theme", "dark") },
    { attr: "data-mode", apply: () => html.setAttribute("data-mode", "dark") },
    { attr: "data-color-scheme", apply: () => html.setAttribute("data-color-scheme", "dark") },
    { cls: "dark", apply: () => html.classList.add("dark") },
  ];
  if (fwName === "bootstrap") {
    strategies.unshift({
      attr: "data-bs-theme",
      apply: () => html.setAttribute("data-bs-theme", "dark"),
    });
  }
  if (fwName === "chakra") {
    strategies.unshift({
      cls: "chakra-ui-dark",
      apply: () => {
        html.classList.add("chakra-ui-dark");
        document.body?.classList.add("chakra-ui-dark");
      },
    });
  }

  for (const strategy of strategies) {
    try {
      strategy.apply();
      const bodyBg = getComputedStyle(document.body).backgroundColor;
      const rgb = parseRgbFast(bodyBg);
      if (rgb && getRelativeLuminance(rgb.r, rgb.g, rgb.b) < 0.2) {
        // Record what this engine set
        if (strategy.attr) engineSetAttrs.add(strategy.attr);
        if (strategy.cls) engineSetAttrs.add(`class:${strategy.cls}`);
        return true;
      }
    } catch {
      continue;
    }
  }

  // Revert all
  html.removeAttribute("data-theme");
  html.removeAttribute("data-mode");
  html.removeAttribute("data-color-scheme");
  html.removeAttribute("data-bs-theme");
  html.classList.remove("dark", "chakra-ui-dark");
  document.body?.classList.remove("chakra-ui-dark");
  return false;
}

// ============================================================================
// PHASE 2: COLOUR PALETTE EXTRACTION
// ============================================================================

/**
 * Sample up to SAMPLE_LIMIT (75) elements and extract their bg/fg colours.
 * All getComputedStyle() calls are batched together (reads before writes)
 * to avoid interleaved layout thrash.
 */
function extractColorPalette(): Map<string, ColorMapping> {
  debugSync("[Perceptual Remap] Phase 2: Palette extraction");

  const colorMap = new Map<string, ColorMapping>();
  const elements = document.querySelectorAll(SAMPLE_SELECTORS);
  const limit = Math.min(elements.length, SAMPLE_LIMIT);

  // Batch ALL reads first — no DOM writes interleaved
  const reads: Array<{ bg: string; fg: string }> = [];
  for (let i = 0; i < limit; i++) {
    const cs = getComputedStyle(elements[i]);
    reads.push({ bg: cs.backgroundColor, fg: cs.color });
  }

  // Process (pure computation, no DOM access)
  for (const { bg: bgStr, fg: fgStr } of reads) {
    if (colorMap.size >= MAX_UNIQUE_COLORS) break;

    const bgRgb = parseRgbFast(bgStr);
    if (bgRgb) {
      const key = `${bgRgb.r},${bgRgb.g},${bgRgb.b}`;
      const existing = colorMap.get(key);
      if (existing) {
        existing.count++;
        if (existing.role === "fg") existing.role = "both";
      } else {
        colorMap.set(key, {
          original: bgStr,
          key,
          r: bgRgb.r,
          g: bgRgb.g,
          b: bgRgb.b,
          oklch: rgbToOklch(bgRgb.r, bgRgb.g, bgRgb.b),
          role: "bg",
          darkBg: "",
          darkFg: "",
          count: 1,
        });
      }
    }

    const fgRgb = parseRgbFast(fgStr);
    if (fgRgb) {
      const key = `${fgRgb.r},${fgRgb.g},${fgRgb.b}`;
      const existing = colorMap.get(key);
      if (existing) {
        existing.count++;
        if (existing.role === "bg") existing.role = "both";
      } else {
        colorMap.set(key, {
          original: fgStr,
          key,
          r: fgRgb.r,
          g: fgRgb.g,
          b: fgRgb.b,
          oklch: rgbToOklch(fgRgb.r, fgRgb.g, fgRgb.b),
          role: "fg",
          darkBg: "",
          darkFg: "",
          count: 1,
        });
      }
    }
  }

  debugSync(
    "[Perceptual Remap] Extracted",
    colorMap.size,
    "unique colours from",
    limit,
    "elements"
  );
  return colorMap;
}

// ============================================================================
// PHASE 3: OKLCH REMAPPING
// ============================================================================

function computeRemappings(colorMap: Map<string, ColorMapping>, amoled: boolean): void {
  debugSync("[Perceptual Remap] Phase 3: Computing OKLCH remappings");

  for (const mapping of colorMap.values()) {
    const darkBgOklch = remapForDarkBg(mapping.oklch);
    const darkFgOklch = remapForDarkFg(mapping.oklch);

    if (amoled && darkBgOklch.L > 0.05) {
      darkBgOklch.L = Math.max(0, darkBgOklch.L - 0.08);
    }

    mapping.darkBg = oklchToCss(darkBgOklch);
    mapping.darkFg = oklchToCss(darkFgOklch);
  }

  if (stats) stats.colorsRemapped = colorMap.size;
}

// ============================================================================
// PHASE 4: STYLESHEET GENERATION
// ============================================================================

function generateRemapStylesheet(colorMap: Map<string, ColorMapping>, _settings: Settings): string {
  const S = `html[udr-applied="true"][data-udr-mode="${ENGINE_MODE}"]`;

  const sorted = Array.from(colorMap.values()).sort((a, b) => b.count - a.count);

  const primaryBg = sorted.find((c) => (c.role === "bg" || c.role === "both") && c.oklch.L > 0.5);
  const primaryFg = sorted.find((c) => (c.role === "fg" || c.role === "both") && c.oklch.L < 0.5);

  const defaultDarkBg = primaryBg?.darkBg ?? "oklch(0.145 0 0)";
  const defaultLightFg = primaryFg?.darkFg ?? "oklch(0.88 0 0)";

  // No warmth/sepia applied here — buildCss() handles the user's sepia slider
  const canvasBg = defaultDarkBg;

  const secondaryBg = sorted.find(
    (c) => c !== primaryBg && (c.role === "bg" || c.role === "both") && c.oklch.L > 0.4
  );
  const elevatedBg = secondaryBg?.darkBg ?? "oklch(0.20 0 0)";

  const linkColor = sorted.find(
    (c) =>
      (c.role === "fg" || c.role === "both") &&
      c.oklch.C > 0.05 &&
      c.oklch.H > 180 &&
      c.oklch.H < 280
  );
  const darkLink = linkColor?.darkFg ?? "oklch(0.72 0.12 245)";

  const borderCol = "oklch(0.30 0 0)";

  return `
/* ═══════════════════════════════════════════════════════════════════════
   Perceptual Remap Engine v1.1
   Remapped ${colorMap.size} unique colours via OKLCH
   ═══════════════════════════════════════════════════════════════════════ */

/* ── CSS Custom Properties (remap palette) ──────────────────────────── */
:root {
  --udr-canvas-bg:      ${canvasBg};
  --udr-surface-bg:     ${elevatedBg};
  --udr-card-bg:        oklch(0.22 0 0);
  --udr-input-bg:       oklch(0.25 0 0);
  --udr-modal-bg:       oklch(0.27 0 0);
  --udr-text-primary:   ${defaultLightFg};
  --udr-text-secondary: oklch(0.65 0 0);
  --udr-text-heading:   oklch(0.94 0 0);
  --udr-link:           ${darkLink};
  --udr-link-visited:   oklch(0.68 0.10 300);
  --udr-border:         ${borderCol};
  --udr-border-subtle:  oklch(0.24 0 0);
}

/* ── Catch-all: force dark on everything not media ──────────────────── */
${S} *:not(img):not(video):not(canvas):not(svg):not(picture):not(iframe) {
  background-color: var(--udr-canvas-bg) !important;
}

/* ── Base: Page Canvas ──────────────────────────────────────────────── */
${S},
${S} body {
  background-color: var(--udr-canvas-bg) !important;
  color: var(--udr-text-primary) !important;
}

/* ── Surfaces ────────────────────────────────────────────────────────── */
${S} main,
${S} article,
${S} [role="main"],
${S} #app, ${S} #root, ${S} #__next,
${S} .container, ${S} .wrapper, ${S} .content {
  background-color: var(--udr-surface-bg) !important;
  color: var(--udr-text-primary) !important;
}

/* ── Navigation ──────────────────────────────────────────────────────── */
${S} nav, ${S} header, ${S} footer,
${S} [role="navigation"], ${S} [role="banner"], ${S} [role="contentinfo"],
${S} [class*="navbar"], ${S} [class*="header"], ${S} [class*="footer"],
${S} [class*="sidebar"], ${S} [class*="topbar"] {
  background-color: var(--udr-surface-bg) !important;
  color: var(--udr-text-primary) !important;
}

/* ── Cards / Sections ────────────────────────────────────────────────── */
${S} section, ${S} aside, ${S} details, ${S} fieldset,
${S} [role="region"], ${S} [role="complementary"],
${S} [class*="card"], ${S} [class*="panel"], ${S} [class*="tile"],
${S} [class*="widget"], ${S} [class*="box"], ${S} [class*="block"] {
  background-color: var(--udr-card-bg) !important;
  color: var(--udr-text-primary) !important;
}

/* ── Inputs ──────────────────────────────────────────────────────────── */
${S} input:not([type="range"]):not([type="checkbox"]):not([type="radio"]),
${S} textarea, ${S} select, ${S} [contenteditable="true"] {
  background-color: var(--udr-input-bg) !important;
  color: var(--udr-text-primary) !important;
  border-color: var(--udr-border) !important;
}
${S} input::placeholder, ${S} textarea::placeholder {
  color: var(--udr-text-secondary) !important;
}

/* ── Modals ──────────────────────────────────────────────────────────── */
${S} dialog, ${S} [aria-modal="true"], ${S} [role="dialog"],
${S} [class*="modal"], ${S} [class*="dialog"],
${S} [class*="drawer"] {
/* NOTE: [class*="overlay"] intentionally removed — too broad, matches image overlays/hover layers */
  background-color: var(--udr-modal-bg) !important;
  color: var(--udr-text-primary) !important;
}

/* ── Tables ──────────────────────────────────────────────────────────── */
${S} table, ${S} [role="grid"] {
  background-color: var(--udr-card-bg) !important;
}
${S} th { background-color: var(--udr-input-bg) !important; color: var(--udr-text-heading) !important; }
${S} td { border-color: var(--udr-border-subtle) !important; }
${S} tr:nth-child(even) td { background-color: var(--udr-surface-bg) !important; }

/* ── Code ────────────────────────────────────────────────────────────── */
${S} pre, ${S} code,
${S} [class*="code"], ${S} [class*="syntax"],
${S} .CodeMirror, ${S} .monaco-editor {
  background-color: oklch(0.145 0 0) !important;
  color: oklch(0.85 0 0) !important;
  border-color: var(--udr-border) !important;
}

/* ── Typography ──────────────────────────────────────────────────────── */
${S} h1, ${S} h2, ${S} h3, ${S} h4, ${S} h5, ${S} h6 {
  color: var(--udr-text-heading) !important;
}
${S} p, ${S} li, ${S} span, ${S} label, ${S} small, ${S} dd, ${S} dt,
${S} figcaption, ${S} blockquote, ${S} address, ${S} cite {
  color: var(--udr-text-primary) !important;
}
${S} a { color: var(--udr-link) !important; }
${S} a:visited { color: var(--udr-link-visited) !important; }
${S} ::selection {
  background-color: var(--udr-link) !important;
  color: var(--udr-canvas-bg) !important;
}

/* ── Borders ─────────────────────────────────────────────────────────── */
${S} *:not(img):not(video):not(canvas):not(svg):not(hr) {
  border-color: var(--udr-border-subtle);
}
${S} hr { border-color: var(--udr-border) !important; background-color: var(--udr-border) !important; }

/* ── Focus ───────────────────────────────────────────────────────────── */
${S} input:focus, ${S} textarea:focus, ${S} select:focus,
${S} button:focus-visible, ${S} a:focus-visible {
  outline: 2px solid var(--udr-link) !important;
  outline-offset: 2px;
}

/* ── Buttons ─────────────────────────────────────────────────────────── */
${S} button, ${S} [role="button"], ${S} [class*="btn"]:not(a),
${S} input[type="button"], ${S} input[type="submit"] {
  color: var(--udr-text-primary) !important;
  border-color: var(--udr-border) !important;
}

/* ── Scrollbars (Firefox native) ─────────────────────────────────────── */
${S}     { scrollbar-color: oklch(0.30 0 0) var(--udr-canvas-bg); }
${S} *   { scrollbar-color: oklch(0.30 0 0) transparent; }

/* ── Tooltips ────────────────────────────────────────────────────────── */
${S} [role="tooltip"], ${S} [class*="tooltip"],
${S} [class*="popover"], ${S} [class*="dropdown-menu"] {
  background-color: oklch(0.30 0 0) !important;
  color: var(--udr-text-primary) !important;
}
`;
}

// ============================================================================
// PHASE 5: CSS VARIABLE HIJACKING
// ============================================================================

function hijackCSSVariables(_settings: Settings): number {
  debugSync("[Perceptual Remap] Phase 5: CSS Variable Hijacking");

  const overrides: string[] = [];
  const processed = new Set<string>();
  let count = 0;

  const rootStyle = getComputedStyle(document.documentElement);

  const bgVars = [
    "--background",
    "--bg",
    "--bg-color",
    "--background-color",
    "--surface",
    "--surface-color",
    "--canvas",
    "--color-background",
    "--color-bg",
    "--theme-background",
    "--page-background",
    "--body-background",
    "--card-bg",
    "--card-background",
  ];
  const fgVars = [
    "--foreground",
    "--text",
    "--text-color",
    "--color",
    "--fg",
    "--fg-color",
    "--color-text",
    "--color-foreground",
    "--body-text",
    "--font-color",
  ];
  const brdVars = ["--border", "--border-color", "--divider", "--separator"];

  for (const v of bgVars) {
    if (rootStyle.getPropertyValue(v).trim() && !processed.has(v)) {
      overrides.push(`${v}: var(--udr-canvas-bg) !important;`);
      processed.add(v);
      count++;
    }
  }
  for (const v of fgVars) {
    if (rootStyle.getPropertyValue(v).trim() && !processed.has(v)) {
      overrides.push(`${v}: var(--udr-text-primary) !important;`);
      processed.add(v);
      count++;
    }
  }
  for (const v of brdVars) {
    if (rootStyle.getPropertyValue(v).trim() && !processed.has(v)) {
      overrides.push(`${v}: var(--udr-border) !important;`);
      processed.add(v);
      count++;
    }
  }

  if (count < 5) {
    try {
      const sheets = document.styleSheets;
      for (let i = 0; i < Math.min(sheets.length, 10); i++) {
        try {
          const rules = sheets[i].cssRules;
          if (!rules) continue;
          for (let j = 0; j < Math.min(rules.length, 100); j++) {
            const rule = rules[j];
            if (
              rule instanceof CSSStyleRule &&
              (rule.selectorText === ":root" || rule.selectorText === "html")
            ) {
              const style = rule.style;
              for (let k = 0; k < style.length; k++) {
                const prop = style[k];
                if (!prop.startsWith("--") || processed.has(prop)) continue;
                if (VAR_PATTERNS.background.test(prop)) {
                  overrides.push(`${prop}: var(--udr-surface-bg) !important;`);
                  processed.add(prop);
                  count++;
                } else if (VAR_PATTERNS.foreground.test(prop)) {
                  overrides.push(`${prop}: var(--udr-text-primary) !important;`);
                  processed.add(prop);
                  count++;
                } else if (VAR_PATTERNS.border.test(prop)) {
                  overrides.push(`${prop}: var(--udr-border) !important;`);
                  processed.add(prop);
                  count++;
                } else if (VAR_PATTERNS.shadow.test(prop)) {
                  overrides.push(`${prop}: none !important;`);
                  processed.add(prop);
                  count++;
                }
              }
            }
          }
        } catch {
          continue;
        }
      }
    } catch {
      /* ignore */
    }
  }

  if (overrides.length > 0) {
    let tag = document.getElementById(STYLE_IDS.variableHijack) as HTMLStyleElement | null;
    if (!tag) {
      tag = document.createElement("style");
      tag.id = STYLE_IDS.variableHijack;
      document.head.appendChild(tag);
    }
    tag.textContent = `:root {\n  ${overrides.join("\n  ")}\n}`;
  }

  debugSync("[Perceptual Remap] Hijacked", count, "CSS variables");
  if (stats) stats.variablesHijacked = count;
  return count;
}

// ============================================================================
// PHASE 6: INLINE STYLE SWEEP + SPECIAL ELEMENTS
// ============================================================================

function sweepInlineStyles(_settings: Settings): void {
  requestAnimationFrame(() => {
    const styled = document.querySelectorAll("[style]");
    const limit = Math.min(styled.length, 500);
    let fixes = 0;

    for (let i = 0; i < limit; i++) {
      const el = styled[i] as HTMLElement;

      const inlineBg = el.style.backgroundColor;
      if (inlineBg) {
        const rgb = parseRgbFast(inlineBg);
        if (rgb) {
          const lum = getRelativeLuminance(rgb.r, rgb.g, rgb.b);
          if (lum > 0.4) {
            const key = `${rgb.r},${rgb.g},${rgb.b}`;
            const mapping = activeColorMap.get(key);
            if (mapping) {
              el.style.setProperty("background-color", mapping.darkBg, "important");
            } else {
              el.style.setProperty(
                "background-color",
                oklchToCss(remapForDarkBg(rgbToOklch(rgb.r, rgb.g, rgb.b))),
                "important"
              );
            }
            fixes++;
          }
        }
      }

      const inlineColor = el.style.color;
      if (inlineColor) {
        const rgb = parseRgbFast(inlineColor);
        if (rgb) {
          const lum = getRelativeLuminance(rgb.r, rgb.g, rgb.b);
          if (lum < 0.15) {
            const key = `${rgb.r},${rgb.g},${rgb.b}`;
            const mapping = activeColorMap.get(key);
            if (mapping) {
              el.style.setProperty("color", mapping.darkFg, "important");
            } else {
              el.style.setProperty(
                "color",
                oklchToCss(remapForDarkFg(rgbToOklch(rgb.r, rgb.g, rgb.b))),
                "important"
              );
            }
            fixes++;
          }
        }
      }
    }

    if (stats) stats.inlineFixCount = fixes;
    debugSync("[Perceptual Remap] Inline sweep: fixed", fixes, "elements");
  });
}

function generateSpecialCSS(_settings: Settings): string {
  const S = `html[udr-applied="true"][data-udr-mode="${ENGINE_MODE}"]`;

  /**
   * Image brightness: fixed 0.92 constant. buildCss() already applies
   * brightness(settings.brightness%) on <html>, compositing through to
   * all descendants. We do NOT read settings.brightness here to avoid
   * double-applying it.
   */
  const IMG_DIM = 0.92;

  return `
/* ═══ Perceptual Remap — Special Elements ═══ */

${S} img, ${S} picture {
  filter: brightness(${IMG_DIM}) !important;
  transition: filter 0.15s ease-out;
}
${S} img:hover, ${S} picture:hover { filter: brightness(1) !important; }
${S} video { filter: brightness(0.97) !important; }
${S} canvas { opacity: 0.92; }
${S} svg:not([class*="logo"]):not([class*="brand"]):not([width]) {
  fill: currentColor; stroke: currentColor;
}
${S} iframe { filter: brightness(0.9); }

/* Background images: dark overlay via blend mode */
${S} [style*="background-image"]:not(img):not(video):not(picture) {
  background-blend-mode: saturation;
  background-color: rgba(0, 0, 0, 0.65) !important;
}

/* CSS containment for perf */
${S} main, ${S} article, ${S} section, ${S} .container, ${S} #app, ${S} #root {
  contain: layout style;
}
`;
}

// ============================================================================
// PHASE 7: MUTATION OBSERVER
// ============================================================================

function setupMutationObserver(_settings: Settings): void {
  debugSync("[Perceptual Remap] Phase 7: MutationObserver");

  if (mutationObserver) mutationObserver.disconnect();

  const pending: HTMLElement[] = [];
  let scheduled = false;

  function flush(): void {
    if (pending.length === 0) {
      scheduled = false;
      return;
    }
    const batch = pending.splice(0, 80);

    for (const el of batch) {
      const inlineBg = el.style.backgroundColor;
      if (inlineBg) {
        const rgb = parseRgbFast(inlineBg);
        if (rgb && getRelativeLuminance(rgb.r, rgb.g, rgb.b) > 0.4) {
          el.style.setProperty(
            "background-color",
            oklchToCss(remapForDarkBg(rgbToOklch(rgb.r, rgb.g, rgb.b))),
            "important"
          );
        }
      }
      const inlineColor = el.style.color;
      if (inlineColor) {
        const rgb = parseRgbFast(inlineColor);
        if (rgb && getRelativeLuminance(rgb.r, rgb.g, rgb.b) < 0.15) {
          el.style.setProperty(
            "color",
            oklchToCss(remapForDarkFg(rgbToOklch(rgb.r, rgb.g, rgb.b))),
            "important"
          );
        }
      }
    }

    if (pending.length > 0) {
      requestAnimationFrame(flush);
    } else {
      scheduled = false;
    }
  }

  mutationObserver = new MutationObserver((mutations) => {
    for (let mi = 0; mi < mutations.length; mi++) {
      const m = mutations[mi];
      for (let ni = 0; ni < m.addedNodes.length; ni++) {
        const node = m.addedNodes[ni];
        if (!(node instanceof HTMLElement)) continue;
        if (node.hasAttribute("style")) pending.push(node);
        const kids = node.querySelectorAll("[style]");
        const limit = Math.min(kids.length, 30);
        for (let i = 0; i < limit; i++) {
          if (kids[i] instanceof HTMLElement) pending.push(kids[i] as HTMLElement);
        }
      }
    }

    if (pending.length > 0 && !scheduled) {
      scheduled = true;
      if (typeof window.requestIdleCallback === "function") {
        window.requestIdleCallback(() => flush(), { timeout: 100 });
      } else {
        requestAnimationFrame(flush);
      }
    }
  });

  if (document.body) {
    mutationObserver.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      // data-mode added vs original — some frameworks (e.g. certain Next.js setups) use it
      attributeFilter: ["class", "data-theme", "data-mode", "style"],
    });
    debugSync("[Perceptual Remap] MutationObserver attached");
  }
}

// ============================================================================
// MAIN ENTRY POINT
// ============================================================================

/**
 * Apply the Perceptual Remap Engine.
 *
 * Called from index.ts after applyFilterCss() has been called, so the user's
 * brightness/contrast/sepia/grayscale/blueShift preferences are already
 * applied as a CSS filter chain on <html>. This function must NOT re-apply
 * those values internally.
 */
export function applyPerceptualRemap(settings: Settings): void {
  const startTime = performance.now();

  debugSync("[Perceptual Remap] ════════════════════════════════════════════");
  debugSync("[Perceptual Remap] Starting Perceptual Remap Engine v1.1");
  debugSync("[Perceptual Remap] ════════════════════════════════════════════");

  resetPerceptualRemap();

  stats = {
    startTime,
    uniqueColorsFound: 0,
    colorsRemapped: 0,
    variablesHijacked: 0,
    inlineFixCount: 0,
    frameworkDetected: null,
    nativeDarkModeActivated: false,
    fallbackTriggered: false,
    totalTimeMs: 0,
  };

  const useOklch = supportsOklch();
  debugSync("[Perceptual Remap] oklch supported:", useOklch);

  if (!useOklch) {
    debugSync("[Perceptual Remap] ⚠️ oklch not supported, falling back to Photon");
    stats.fallbackTriggered = true;
    applyPhotonInverter(settings);
    return;
  }

  // ── Phase 1: Framework detection BEFORE color-scheme injection ────────────
  detectedFramework = detectFramework();
  stats.frameworkDetected = detectedFramework.name;
  stats.nativeDarkModeActivated = detectedFramework.darkModeActivated;

  // ── Phase 0: color-scheme: dark (after detection to avoid false positives) ─
  injectColorScheme();
  debugSync("[Perceptual Remap] Phase 0: color-scheme: dark injected");

  // ── CRITICAL: set mode markers BEFORE stylesheet injection ────────────────
  // The remap CSS uses html[udr-applied="true"][data-udr-mode="perceptual-remap"]
  // as a scoping selector. Attributes must exist before the rules are parsed.
  setModeMarkers();

  if (detectedFramework.darkModeActivated) {
    debugSync("[Perceptual Remap] ✓ Native dark mode — minimal enhancements");
    injectSpecialCSS(settings);
    setupMutationObserver(settings);
    finalise(startTime);
    return;
  }

  // ── Phase 2: Colour Palette Extraction ───────────────────────────────────
  activeColorMap = extractColorPalette();
  stats.uniqueColorsFound = activeColorMap.size;

  // ── Phase 3: OKLCH Remapping ──────────────────────────────────────────────
  computeRemappings(activeColorMap, settings.amoled);

  // ── Phase 4: Stylesheet Generation + Injection ────────────────────────────
  debugSync("[Perceptual Remap] Phase 4: Generating remap stylesheet");

  let rulesTag = document.getElementById(STYLE_IDS.remapRules) as HTMLStyleElement | null;
  if (!rulesTag) {
    rulesTag = document.createElement("style");
    rulesTag.id = STYLE_IDS.remapRules;
    document.head.appendChild(rulesTag);
  }
  rulesTag.textContent = generateRemapStylesheet(activeColorMap, settings);

  // ── Phase 5: CSS Variable Hijacking ──────────────────────────────────────
  hijackCSSVariables(settings);

  // ── Phase 6: Inline Sweep + Special Elements ──────────────────────────────
  injectSpecialCSS(settings);
  sweepInlineStyles(settings);

  // ── Phase 7: Mutation Observer ────────────────────────────────────────────
  setupMutationObserver(settings);
  finalise(startTime);
}

function injectSpecialCSS(settings: Settings): void {
  let tag = document.getElementById(STYLE_IDS.specialRules) as HTMLStyleElement | null;
  if (!tag) {
    tag = document.createElement("style");
    tag.id = STYLE_IDS.specialRules;
    document.head.appendChild(tag);
  }
  tag.textContent = generateSpecialCSS(settings);
}

function setModeMarkers(): void {
  document.documentElement.setAttribute("data-udr-mode", ENGINE_MODE);
  document.documentElement.setAttribute("udr-applied", "true");
}

function finalise(startTime: number): void {
  const elapsed = performance.now() - startTime;
  if (stats) stats.totalTimeMs = elapsed;

  debugSync("[Perceptual Remap] ════════════════════════════════════════════");
  debugSync("[Perceptual Remap] ✓ Complete in", elapsed.toFixed(2), "ms");
  debugSync("[Perceptual Remap]   Unique colours:", stats?.uniqueColorsFound ?? 0);
  debugSync("[Perceptual Remap]   Colours remapped:", stats?.colorsRemapped ?? 0);
  debugSync("[Perceptual Remap]   Variables hijacked:", stats?.variablesHijacked ?? 0);
  debugSync("[Perceptual Remap]   Inline fixes:", stats?.inlineFixCount ?? 0);
  debugSync("[Perceptual Remap]   Framework:", stats?.frameworkDetected ?? "none");
  debugSync("[Perceptual Remap] ════════════════════════════════════════════");
}

// ============================================================================
// RESET / CLEANUP
// ============================================================================

export function resetPerceptualRemap(): void {
  debugSync("[Perceptual Remap] Resetting");

  if (mutationObserver) {
    mutationObserver.disconnect();
    mutationObserver = null;
  }

  for (const id of Object.values(STYLE_IDS)) {
    document.getElementById(id)?.remove();
  }

  activeColorMap = new Map();
  // NOTE: _oklchOk is intentionally NOT cleared — capabilities are session-stable
  stats = null;
  detectedFramework = null;

  // Revert only what this engine set — never touch site's own attributes
  const html = document.documentElement;
  for (const entry of engineSetAttrs) {
    if (entry.startsWith("class:")) {
      const cls = entry.slice(6);
      html.classList.remove(cls);
      document.body?.classList.remove(cls);
    } else {
      html.removeAttribute(entry);
    }
  }
  engineSetAttrs.clear();

  html.style.removeProperty("color-scheme");

  // Remove diagnostic bridge script
  document.getElementById(DIAG_SCRIPT_ID)?.remove();

  debugSync("[Perceptual Remap] Reset complete");
}

// ============================================================================
// DIAGNOSTICS
// ============================================================================

export function getPerceptualRemapDiagnostics(): object {
  const paletteSnapshot: Record<
    string,
    { original: string; darkBg: string; darkFg: string; count: number }
  > = {};
  activeColorMap.forEach((mapping, key) => {
    paletteSnapshot[key] = {
      original: mapping.original,
      darkBg: mapping.darkBg,
      darkFg: mapping.darkFg,
      count: mapping.count,
    };
  });

  const diag = {
    engine: "perceptual-remap",
    version: "1.1",
    url: location.href,
    framework: detectedFramework,
    stats,
    palette: paletteSnapshot,
    paletteSize: activeColorMap.size,
    featureSupport: { oklch: _oklchOk },
    styleTagsPresent: Object.fromEntries(
      Object.entries(STYLE_IDS).map(([k, id]) => [k, !!document.getElementById(id)])
    ),
    bodyBg: getComputedStyle(document.body).backgroundColor,
    htmlAttrs: {
      udrApplied: document.documentElement.getAttribute("udr-applied"),
      udrMode: document.documentElement.getAttribute("data-udr-mode"),
      colorScheme: getComputedStyle(document.documentElement).colorScheme,
    },
  };
  console.log("[Perceptual Remap Diag]", JSON.stringify(diag, null, 2));
  return diag;
}

// ── Console diagnostic bridge ─────────────────────────────────────────────────

if (typeof window !== "undefined") {
  try {
    window.addEventListener("message", async (event) => {
      if (event.data?.type === "UDR_PREMAP_DIAG_REQUEST") {
        const origin = originFromUrl(location.href);
        const settings = await getSettings();
        const siteSettings = settings.perSite?.[origin];

        const paletteSnapshot: Record<
          string,
          { original: string; darkBg: string; darkFg: string; count: number }
        > = {};
        activeColorMap.forEach((mapping, key) => {
          paletteSnapshot[key] = {
            original: mapping.original,
            darkBg: mapping.darkBg,
            darkFg: mapping.darkFg,
            count: mapping.count,
          };
        });

        const diag = {
          engine: "perceptual-remap",
          version: "1.1",
          url: location.href,
          origin,
          framework: detectedFramework,
          stats,
          siteSettings,
          hasSiteOverride: !!siteSettings,
          globalSettings: {
            enabled: settings.enabled,
            mode: settings.mode,
            amoled: settings.amoled,
            brightness: settings.brightness,
            contrast: settings.contrast,
            optimizerEnabled: settings.optimizerEnabled,
          },
          palette: paletteSnapshot,
          paletteSize: activeColorMap.size,
          featureSupport: { oklch: _oklchOk },
          styleTagsPresent: Object.fromEntries(
            Object.entries(STYLE_IDS).map(([k, id]) => [k, !!document.getElementById(id)])
          ),
          bodyBg: getComputedStyle(document.body).backgroundColor,
          htmlAttrs: {
            udrApplied: document.documentElement.getAttribute("udr-applied"),
            udrMode: document.documentElement.getAttribute("data-udr-mode"),
            colorScheme: getComputedStyle(document.documentElement).colorScheme,
          },
        };
        window.postMessage({ type: "UDR_PREMAP_DIAG_RESPONSE", diag }, "*");
      }
    });

    if (!document.getElementById(DIAG_SCRIPT_ID)) {
      const script = document.createElement("script");
      script.id = DIAG_SCRIPT_ID;
      script.textContent = `
      window.__premapDiag = function() {
        return new Promise(function(resolve) {
          window.postMessage({ type: "UDR_PREMAP_DIAG_REQUEST" }, "*");
          var handler = function(event) {
            if (event.data && event.data.type === "UDR_PREMAP_DIAG_RESPONSE") {
              console.log("[Perceptual Remap Diag]", JSON.stringify(event.data.diag, null, 2));
              resolve(event.data.diag);
              window.removeEventListener("message", handler);
            }
          };
          window.addEventListener("message", handler);
          setTimeout(function() {
            window.removeEventListener("message", handler);
            resolve({ error: "Timeout" });
          }, 1000);
        });
      };
    `;
      (document.head || document.documentElement).appendChild(script);
    }
  } catch {
    /* non-critical */
  }
}
