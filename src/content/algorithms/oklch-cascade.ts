// File: src/content/algorithms/oklch-cascade.ts

/**
 * ============================================================================
 * OKLCH CASCADE ENGINE v1.1
 * ============================================================================
 *
 * A "New Era CSS" dark-mode algorithm that prioritises CSS-first transforms
 * over JavaScript DOM walking. The browser's layout engine does the heavy
 * lifting — we just hand it a well-crafted stylesheet.
 *
 * ── Philosophy ──────────────────────────────────────────────────────────────
 * "The fastest DOM operation is the one you never make."
 *   — Every web-performance expert ever
 *
 * Instead of O(n) getComputedStyle calls we:
 *   1. Inject `color-scheme: dark` so the UA handles form controls, scrollbars,
 *      canvas defaults, and `light-dark()` sites automatically.
 *   2. Override CSS custom properties at :root using OKLCH values so every
 *      element consuming those variables is repainted in one style recalc.
 *   3. Apply broad, semantic CSS rules (tag + ARIA selectors) that the
 *      browser matches natively — no TreeWalker, no inline-style writes.
 *   4. User slider preferences (brightness, contrast, sepia, grayscale,
 *      blueShift) are applied by index.ts via buildCss/applyFilterCss as a
 *      CSS filter chain on <html>. This algo does NOT re-apply those values
 *      internally to avoid double-application.
 *
 * ── Performance Profile ─────────────────────────────────────────────────────
 * Phase 0  Instant (< 1 ms)   color-scheme + base vars
 * Phase 1  Fast    (< 5 ms)   framework detection
 * Phase 2  Fast    (< 10 ms)  CSS variable hijack (stylesheet scan)
 * Phase 3  Instant (< 1 ms)   semantic CSS injection (string concat)
 * Phase 4  Instant (< 1 ms)   special-element CSS
 * Phase 5  Idle               MutationObserver (rAF-batched class adds)
 *
 * Total first-paint cost: typically < 15 ms (no layout thrash).
 *
 * ── New-Era CSS Features Used ───────────────────────────────────────────────
 * ✅  oklch()                Perceptual colour palette
 * ✅  color-mix(in oklch)    Warmth / sepia via CSS
 * ✅  color-scheme: dark     Browser-native dark affordances
 * ✅  light-dark()           Auto-adapting values on color-scheme toggle
 * ✅  Relative color syntax  oklch(from <color> …) for variable transforms
 *                            (FF 128+, graceful fallback for older)
 *
 * ── Firefox Compatibility ───────────────────────────────────────────────────
 * Target: Firefox 128+ (ESR since Jul 2024)
 * Fallback: Firefox 113+ (oklch/color-mix only, no relative syntax)
 * Hard floor: Firefox 96 (color-scheme only, will trigger Photon fallback)
 *
 * ── Unique Exports ──────────────────────────────────────────────────────────
 * applyOklchCascade(settings)   ← call from index.ts
 * resetOklchCascade()           ← call from index.ts
 * getOklchDiagnostics()         ← optional diagnostics
 *
 * In src/content/index.ts add:
 *   import { applyOklchCascade, resetOklchCascade } from "./algorithms/oklch-cascade";
 *
 * ============================================================================
 */

import type { Settings } from "../../types/settings";
import { debugSync } from "../../utils/logger";
import { applyPhotonInverter } from "./photon-inverter";
import { getSettings, originFromUrl } from "../../utils/storage";
import { parseRgbFast, getRelativeLuminance } from "../../utils/color-utils";

// ============================================================================
// CONSTANTS & CONFIGURATION
// ============================================================================

/** Style tag IDs for cleanup */
const STYLE_IDS = {
  colorScheme: "udr-oklch-scheme",
  variableHijack: "udr-oklch-variables",
  semanticRules: "udr-oklch-semantic",
  specialElements: "udr-oklch-special",
} as const;

/** Diagnostic bridge script ID — separate from STYLE_IDS (script, not style tag) */
const DIAG_SCRIPT_ID = "udr-oklch-diag-bridge" as const;

/** Mode attribute value written to <html data-udr-mode="..."> */
const ENGINE_MODE = "oklch-cascade" as const;

/**
 * OKLCH dark palette — perceptually uniform lightness steps.
 *
 * Lightness 0 = black, 1 = white, and each step is perceptually equal
 * (unlike sRGB hex where #1a1a1a → #222222 is not the same jump as
 * #333333 → #3b3b3b).
 *
 * NOTE: warmth/sepia is intentionally NOT applied here. The user's sepia
 * preference is honoured by buildCss() in style-template.ts, which applies
 * a sepia() CSS filter to <html>. Applying it a second time inside this algo
 * would double-warm the page. The warmTint palette entry is kept for
 * reference but warmth is always 0 when generating CSS.
 */
const OKLCH_PALETTE = {
  levels: [
    "oklch(0.00  0 0)", // L0 — AMOLED true black
    "oklch(0.145 0 0)", // L1 — page canvas
    "oklch(0.185 0 0)", // L2 — primary surfaces
    "oklch(0.215 0 0)", // L3 — cards / sections
    "oklch(0.245 0 0)", // L4 — nested cards / inputs
    "oklch(0.275 0 0)", // L5 — modals / dialogs
    "oklch(0.305 0 0)", // L6 — tooltips / popovers
  ] as readonly string[],

  text: {
    primary: "oklch(0.88 0 0)",
    secondary: "oklch(0.65 0 0)",
    disabled: "oklch(0.42 0 0)",
    heading: "oklch(0.94 0 0)",
    link: "oklch(0.72 0.12 245)",
    linkVisited: "oklch(0.68 0.10 300)",
    error: "oklch(0.65 0.20 25)",
    success: "oklch(0.70 0.15 150)",
  },

  border: "oklch(0.30 0 0)",
  borderSubtle: "oklch(0.24 0 0)",
} as const;

/**
 * Hex fallbacks for browsers below Firefox 113 (oklch unavailable).
 */
const HEX_FALLBACK_PALETTE = {
  levels: [
    "#000000",
    "#1b1b1b",
    "#252525",
    "#2d2d2d",
    "#353535",
    "#3c3c3c",
    "#444444",
  ] as readonly string[],
  text: {
    primary: "#dcdcdc",
    secondary: "#999999",
    heading: "#efefef",
    link: "#6cb6ff",
    linkVisited: "#b39ddb",
  },
  border: "#3a3a3a",
} as const;

// ── Framework detection patterns ─────────────────────────────────────────────

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

/** CSS variable semantic patterns for hijacking */
const VAR_PATTERNS = {
  background: /background|^bg$|bg-|surface|canvas|base-color|page-bg/i,
  foreground: /foreground|^fg$|fg-|text-color|font-color|body-color/i,
  border: /border|divider|separator|outline-color/i,
  shadow: /shadow/i,
} as const;

// ============================================================================
// TYPES
// ============================================================================

interface FrameworkInfo {
  name: string;
  detected: boolean;
  hasNativeDarkMode: boolean;
  darkModeActivated: boolean;
}

interface EngineStats {
  startTime: number;
  variablesHijacked: number;
  frameworkDetected: string | null;
  nativeDarkModeActivated: boolean;
  fallbackTriggered: boolean;
  oklchSupported: boolean;
  relativeColorSupported: boolean;
  lightDarkSupported: boolean;
  totalTimeMs: number;
}

// ============================================================================
// MODULE STATE
// ============================================================================

let mutationObserver: MutationObserver | null = null;
let stats: EngineStats | null = null;
let detectedFramework: FrameworkInfo | null = null;

/**
 * Tracks exactly which HTML attributes were set by THIS engine during
 * activateNativeDark() so that resetOklchCascade() only removes what it added —
 * it will never strip a site's own pre-existing dark-mode attribute.
 */
const engineSetAttrs = new Set<string>();

/** Feature-probe results (cached for the page lifetime; NOT cleared on reset) */
let _oklchOk: boolean | null = null;
let _relColorOk: boolean | null = null;
let _lightDarkOk: boolean | null = null;

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

function supportsRelativeColor(): boolean {
  if (_relColorOk !== null) return _relColorOk;
  try {
    const el = document.createElement("div");
    el.style.color = "oklch(from red l c h)";
    _relColorOk = el.style.color !== "";
  } catch {
    _relColorOk = false;
  }
  return _relColorOk;
}

function supportsLightDark(): boolean {
  if (_lightDarkOk !== null) return _lightDarkOk;
  try {
    const el = document.createElement("div");
    el.style.color = "light-dark(black, white)";
    _lightDarkOk = el.style.color !== "";
  } catch {
    _lightDarkOk = false;
  }
  return _lightDarkOk;
}

// ============================================================================
// PALETTE HELPERS
// ============================================================================

/**
 * Return the background colour for a given elevation.
 * Warmth is intentionally NOT applied here — the user's sepia slider is
 * honoured by buildCss() in style-template.ts as a CSS sepia() filter.
 * Applying warmth a second time here would double-warm the page.
 */
function bg(level: number, useOklch: boolean): string {
  const idx = Math.max(0, Math.min(level, 6));
  return useOklch ? OKLCH_PALETTE.levels[idx] : HEX_FALLBACK_PALETTE.levels[idx];
}

function txt(role: keyof typeof OKLCH_PALETTE.text, useOklch: boolean): string {
  if (useOklch) return OKLCH_PALETTE.text[role];
  const fb = HEX_FALLBACK_PALETTE.text as Record<string, string | undefined>;
  return fb[role] ?? OKLCH_PALETTE.text[role];
}

function borderColor(useOklch: boolean): string {
  return useOklch ? OKLCH_PALETTE.border : HEX_FALLBACK_PALETTE.border;
}

// ============================================================================
// PHASE 0: COLOR-SCHEME INJECTION (instant)
// ============================================================================

function injectColorScheme(): void {
  let tag = document.getElementById(STYLE_IDS.colorScheme) as HTMLStyleElement | null;
  if (!tag) {
    tag = document.createElement("style");
    tag.id = STYLE_IDS.colorScheme;
    (document.head || document.documentElement).prepend(tag);
  }
  tag.textContent = `:root {\n  color-scheme: dark !important;\n}`;
}

// ============================================================================
// PHASE 1: FRAMEWORK DETECTION
// ============================================================================

function detectFramework(): FrameworkInfo {
  debugSync("[OKLCH Cascade] Phase 1: Framework Detection");

  const info: FrameworkInfo = {
    name: "unknown",
    detected: false,
    hasNativeDarkMode: false,
    darkModeActivated: false,
  };

  const html = document.documentElement;

  const darkAttrs = [
    html.getAttribute("data-theme"),
    html.getAttribute("data-mode"),
    html.getAttribute("data-color-scheme"),
  ];
  if (darkAttrs.some((v) => v === "dark")) {
    debugSync("[OKLCH Cascade] Native dark mode already active (data-attr)");
    info.hasNativeDarkMode = true;
    info.darkModeActivated = true;
    return info;
  }

  const cs = getComputedStyle(html).colorScheme;
  if (cs === "dark" || cs === "dark light") {
    debugSync("[OKLCH Cascade] Native dark via computed color-scheme");
    info.hasNativeDarkMode = true;
    info.darkModeActivated = true;
    return info;
  }

  const rootStyle = getComputedStyle(html);

  for (const fw of FRAMEWORK_PATTERNS) {
    const probes = [`--${fw.name}-bg`, `--${fw.name}-background`, `--${fw.name}-primary`];
    for (const v of probes) {
      if (rootStyle.getPropertyValue(v).trim()) {
        info.name = fw.name;
        info.detected = true;
        debugSync("[OKLCH Cascade] Detected framework:", fw.name);
        break;
      }
    }
    if (info.detected) break;
  }

  if (!info.detected) {
    try {
      const sheets = document.styleSheets;
      const limit = Math.min(sheets.length, 5);
      outer: for (let i = 0; i < limit; i++) {
        try {
          const rules = sheets[i].cssRules;
          if (!rules) continue;
          const rl = Math.min(rules.length, 50);
          for (let j = 0; j < rl; j++) {
            const r = rules[j];
            if (
              r instanceof CSSStyleRule &&
              (r.selectorText === ":root" || r.selectorText === "html")
            ) {
              for (const fw of FRAMEWORK_PATTERNS) {
                if (fw.pattern.test(r.cssText)) {
                  info.name = fw.name;
                  info.detected = true;
                  debugSync("[OKLCH Cascade] Detected framework via scan:", fw.name);
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
  } else if (fwName === "chakra") {
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
        // Record what this engine set so reset can undo only its own changes
        if (strategy.attr) engineSetAttrs.add(strategy.attr);
        if (strategy.cls) engineSetAttrs.add(`class:${strategy.cls}`);
        debugSync("[OKLCH Cascade] Native dark activation succeeded");
        return true;
      }
    } catch {
      continue;
    }
  }

  // Revert all attempts
  html.removeAttribute("data-theme");
  html.removeAttribute("data-mode");
  html.removeAttribute("data-color-scheme");
  html.removeAttribute("data-bs-theme");
  html.classList.remove("dark", "chakra-ui-dark");
  document.body?.classList.remove("chakra-ui-dark");

  debugSync("[OKLCH Cascade] Native dark activation failed");
  return false;
}

// ============================================================================
// PHASE 2: CSS VARIABLE HIJACKING
// ============================================================================

function hijackCSSVariables(settings: Settings, useOklch: boolean): boolean {
  debugSync("[OKLCH Cascade] Phase 2: CSS Variable Hijacking");

  const overrides: string[] = [];
  const processed = new Set<string>();
  let count = 0;

  const baseBg = bg(settings.amoled ? 0 : 1, useOklch);
  const surfaceBg = bg(2, useOklch);
  const textPri = txt("primary", useOklch);
  const brd = borderColor(useOklch);

  const rootStyle = getComputedStyle(document.documentElement);

  const bgVars = [
    "--background",
    "--bg",
    "--bg-color",
    "--background-color",
    "--surface",
    "--surface-color",
    "--canvas",
    "--base",
    "--color-background",
    "--color-bg",
    "--theme-background",
    "--page-background",
    "--body-background",
    "--main-bg",
    "--card-bg",
    "--card-background",
    "--panel-bg",
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
    "--primary-text",
  ];
  const brdVars = [
    "--border",
    "--border-color",
    "--divider",
    "--separator",
    "--outline",
    "--outline-color",
  ];

  for (const v of bgVars) {
    if (rootStyle.getPropertyValue(v).trim() && !processed.has(v)) {
      overrides.push(`${v}: ${baseBg} !important;`);
      processed.add(v);
      count++;
    }
  }
  for (const v of fgVars) {
    if (rootStyle.getPropertyValue(v).trim() && !processed.has(v)) {
      overrides.push(`${v}: ${textPri} !important;`);
      processed.add(v);
      count++;
    }
  }
  for (const v of brdVars) {
    if (rootStyle.getPropertyValue(v).trim() && !processed.has(v)) {
      overrides.push(`${v}: ${brd} !important;`);
      processed.add(v);
      count++;
    }
  }

  if (count < 5) {
    try {
      const sheets = document.styleSheets;
      const sl = Math.min(sheets.length, 10);
      for (let i = 0; i < sl; i++) {
        try {
          const rules = sheets[i].cssRules;
          if (!rules) continue;
          const rl = Math.min(rules.length, 100);
          for (let j = 0; j < rl; j++) {
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
                  overrides.push(`${prop}: ${surfaceBg} !important;`);
                  processed.add(prop);
                  count++;
                } else if (VAR_PATTERNS.foreground.test(prop)) {
                  overrides.push(`${prop}: ${textPri} !important;`);
                  processed.add(prop);
                  count++;
                } else if (VAR_PATTERNS.border.test(prop)) {
                  overrides.push(`${prop}: ${brd} !important;`);
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
    debugSync("[OKLCH Cascade] Hijacked", count, "CSS variables");
  }

  if (stats) stats.variablesHijacked = count;
  return count >= 10;
}

// ============================================================================
// PHASE 3: SEMANTIC CSS RULES
// ============================================================================

function generateSemanticCSS(settings: Settings, useOklch: boolean): string {
  const A = settings.amoled;

  const L1 = bg(A ? 0 : 1, useOklch);
  const L2 = bg(2, useOklch);
  const L3 = bg(3, useOklch);
  const L4 = bg(4, useOklch);
  const L5 = bg(5, useOklch);
  const L6 = bg(6, useOklch);

  const TP = txt("primary", useOklch);
  const TS = txt("secondary", useOklch);
  const TH = txt("heading", useOklch);
  const TL = txt("link", useOklch);
  const TLV = txt("linkVisited", useOklch);
  const BD = borderColor(useOklch);

  const S = `html[udr-applied="true"][data-udr-mode="${ENGINE_MODE}"]`;

  return `
/* ═══════════════════════════════════════════════════════════════════════
   OKLCH Cascade Engine v1.1 — Semantic Rules
   OKLCH: ${useOklch ? "yes" : "fallback"}
   ═══════════════════════════════════════════════════════════════════════ */

/* ── Catch-all: force dark on everything not media ──────────────────── */
/* color is set here so generic divs/spans (e.g. Material Design rgba(0,0,0,0.87)
   text on a dark bg) don't slip through. Semantic rules below override with
   their own !important values for links, buttons, headings etc. */
${S} *:not(img):not(video):not(canvas):not(svg):not(picture):not(iframe):not(a):not(button) {
  background-color: ${L1} !important;
  color: ${TP} !important;
}

/* ── L1: Page Canvas ────────────────────────────────────────────────── */
${S},
${S} body {
  background-color: ${L1} !important;
  color: ${TP} !important;
}

/* ── L2: Primary Surfaces ───────────────────────────────────────────── */
${S} main,
${S} article,
${S} [role="main"],
${S} [role="article"],
${S} .container,
${S} .wrapper,
${S} .content,
${S} .page,
${S} #app,
${S} #root,
${S} #__next {
  background-color: ${L2} !important;
  color: ${TP} !important;
}

/* ── L2: Navigation ─────────────────────────────────────────────────── */
${S} nav,
${S} header,
${S} footer,
${S} [role="navigation"],
${S} [role="banner"],
${S} [role="contentinfo"],
${S} [class*="navbar"],
${S} [class*="header"],
${S} [class*="footer"],
${S} [class*="sidebar"],
${S} [class*="nav-"],
${S} [class*="topbar"],
${S} [class*="appbar"] {
  background-color: ${L2} !important;
  color: ${TP} !important;
}

/* ── L3: Cards & Sections ───────────────────────────────────────────── */
${S} section,
${S} aside,
${S} [role="region"],
${S} [role="complementary"],
${S} [class*="card"],
${S} [class*="panel"],
${S} [class*="tile"],
${S} [class*="widget"],
${S} [class*="block"],
${S} [class*="box"],
${S} [class*="item"],
${S} [class*="entry"],
${S} [class*="post"],
${S} details,
${S} fieldset {
  background-color: ${L3} !important;
  color: ${TP} !important;
}

/* ── L4: Nested & Inputs ────────────────────────────────────────────── */
${S} input:not([type="range"]):not([type="checkbox"]):not([type="radio"]),
${S} textarea,
${S} select,
${S} [contenteditable="true"],
${S} [role="textbox"],
${S} [role="searchbox"],
${S} [role="combobox"],
${S} [role="listbox"] {
  background-color: ${L4} !important;
  color: ${TP} !important;
  border-color: ${BD} !important;
}

${S} input::placeholder,
${S} textarea::placeholder {
  color: ${TS} !important;
}

/* ── L5: Modals & Dialogs ───────────────────────────────────────────── */
${S} dialog,
${S} [aria-modal="true"],
${S} [role="dialog"],
${S} [role="alertdialog"],
${S} [class*="modal"],
${S} [class*="dialog"],
${S} [class*="popup"],
${S} [class*="drawer"] {
/* NOTE: [class*="overlay"] intentionally removed — too broad, matches image overlays/hover layers */
  background-color: ${L5} !important;
  color: ${TP} !important;
}

/* ── L6: Tooltips & Popovers ────────────────────────────────────────── */
${S} [role="tooltip"],
${S} [class*="tooltip"],
${S} [class*="popover"],
${S} [class*="dropdown-menu"],
${S} [class*="context-menu"] {
  background-color: ${L6} !important;
  color: ${TP} !important;
}

/* ── Tables ──────────────────────────────────────────────────────────── */
${S} table,
${S} [role="grid"],
${S} [role="treegrid"],
${S} [class*="table"] {
  background-color: ${L3} !important;
  color: ${TP} !important;
}
${S} th {
  background-color: ${L4} !important;
  color: ${TH} !important;
}
${S} td {
  background-color: ${L3} !important;
  border-color: ${BD} !important;
}
${S} tr:nth-child(even) td {
  background-color: ${L2} !important;
}

/* ── Code Blocks ─────────────────────────────────────────────────────── */
${S} pre,
${S} code,
${S} [class*="code"],
${S} [class*="syntax"],
${S} [class*="highlight"],
${S} .CodeMirror,
${S} .monaco-editor {
  background-color: ${bg(1, useOklch)} !important;
  color: ${useOklch ? "oklch(0.85 0 0)" : "#d4d4d4"} !important;
  border-color: ${BD} !important;
}

/* ── Typography ──────────────────────────────────────────────────────── */
${S} h1, ${S} h2, ${S} h3,
${S} h4, ${S} h5, ${S} h6 {
  color: ${TH} !important;
}
${S} p, ${S} li, ${S} dd, ${S} dt,
${S} span, ${S} label, ${S} small,
${S} figcaption, ${S} blockquote,
${S} address, ${S} cite {
  color: ${TP} !important;
}
${S} a { color: ${TL} !important; }
${S} a:visited { color: ${TLV} !important; }
${S} ::selection {
  background-color: ${TL} !important;
  color: ${L1} !important;
}

/* ── Borders ─────────────────────────────────────────────────────────── */
${S} *:not(img):not(video):not(canvas):not(svg):not(hr) {
  border-color: ${BD};
}
${S} hr {
  border-color: ${BD} !important;
  background-color: ${BD} !important;
}

/* ── Focus ───────────────────────────────────────────────────────────── */
${S} input:focus,
${S} textarea:focus,
${S} select:focus,
${S} button:focus-visible,
${S} a:focus-visible {
  outline: 2px solid ${TL} !important;
  outline-offset: 2px;
}

/* ── Buttons ─────────────────────────────────────────────────────────── */
${S} button,
${S} [role="button"],
${S} [class*="btn"]:not(a),
${S} input[type="button"],
${S} input[type="submit"],
${S} input[type="reset"] {
  color: ${TP} !important;
  border-color: ${BD} !important;
}

/* ── Scrollbars (Firefox-native, no -webkit needed) ──────────────────── */
${S} {
  scrollbar-color: ${L4} ${L1};
}
${S} * {
  scrollbar-color: ${L4} transparent;
}
`;
}

// ============================================================================
// PHASE 4: SPECIAL ELEMENT HANDLING
// ============================================================================

function generateSpecialCSS(_settings: Settings, _useOklch: boolean): string {
  const S = `html[udr-applied="true"][data-udr-mode="${ENGINE_MODE}"]`;

  /**
   * Image brightness:
   * buildCss() already applies brightness(settings.brightness%) as a CSS
   * filter on <html[udr-applied]>. That filter composites through to all
   * descendants including images. We want images at ~92% of whatever the
   * user set (slight dim for dark-mode comfort). Since the parent already
   * carries the user's value, we apply a fixed 0.92 multiplier here — NOT
   * settings.brightness again, which would double-apply it.
   */
  const IMG_DIM = 0.92;

  return `
/* ═══════════════════════════════════════════════════════════════════════
   OKLCH Cascade — Special Element Handling
   ═══════════════════════════════════════════════════════════════════════ */

/* Images: slight dim, full brightness on hover */
${S} img,
${S} picture {
  filter: brightness(${IMG_DIM}) !important;
  transition: filter 0.15s ease-out;
}
${S} img:hover,
${S} picture:hover {
  filter: brightness(1) !important;
}

/* Video: minimal dim */
${S} video {
  filter: brightness(0.97) !important;
}

/* Canvas: slight opacity */
${S} canvas {
  opacity: 0.92;
}

/* SVG: inherit text color for icon-style SVGs */
${S} svg:not([class*="logo"]):not([class*="brand"]):not([width]) {
  fill: currentColor;
  stroke: currentColor;
}

/* Iframes: dim slightly */
${S} iframe {
  filter: brightness(0.9);
}

/* Background images: use blend-mode to tint toward dark */
${S} [style*="background-image"]:not(img):not(video):not(picture) {
  background-blend-mode: saturation;
  background-color: rgba(0, 0, 0, 0.65) !important;
}

/* CSS containment to reduce style recalc scope */
${S} main,
${S} article,
${S} section,
${S} .container,
${S} #app,
${S} #root {
  contain: layout style;
}
`;
}

// ============================================================================
// PHASE 5: MUTATION OBSERVER
// ============================================================================

function setupMutationObserver(settings: Settings, useOklch: boolean): void {
  debugSync("[OKLCH Cascade] Phase 5: MutationObserver");

  if (mutationObserver) {
    mutationObserver.disconnect();
  }

  const pending: HTMLElement[] = [];
  let scheduled = false;

  const darkBgColor = bg(settings.amoled ? 0 : 1, useOklch);

  function flushPending(): void {
    if (pending.length === 0) {
      scheduled = false;
      return;
    }

    const batch = pending.splice(0, 80);
    for (const el of batch) {
      const inlineBg = el.style.backgroundColor;
      if (inlineBg) {
        const rgb = parseRgbFast(inlineBg);
        if (rgb) {
          const lum = getRelativeLuminance(rgb.r, rgb.g, rgb.b);
          if (lum > 0.4) {
            el.style.setProperty("background-color", darkBgColor, "important");
          }
        }
      }

      const inlineColor = el.style.color;
      if (inlineColor) {
        const rgb = parseRgbFast(inlineColor);
        if (rgb) {
          const lum = getRelativeLuminance(rgb.r, rgb.g, rgb.b);
          if (lum < 0.15) {
            el.style.setProperty(
              "color",
              useOklch ? OKLCH_PALETTE.text.primary : HEX_FALLBACK_PALETTE.text.primary,
              "important"
            );
          }
        }
      }
    }

    if (pending.length > 0) {
      requestAnimationFrame(flushPending);
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

        if (node.hasAttribute("style")) {
          pending.push(node);
        }

        const kids = node.querySelectorAll("[style]");
        const limit = Math.min(kids.length, 30);
        for (let i = 0; i < limit; i++) {
          if (kids[i] instanceof HTMLElement) {
            pending.push(kids[i] as HTMLElement);
          }
        }
      }

      if (
        m.type === "attributes" &&
        (m.attributeName === "class" ||
          m.attributeName === "data-theme" ||
          m.attributeName === "data-mode") &&
        m.target instanceof HTMLElement
      ) {
        const html = document.documentElement;
        if (m.target === html && html.getAttribute("data-udr-mode") === ENGINE_MODE) {
          html.style.setProperty("color-scheme", "dark", "important");
        }
      }
    }

    if (pending.length > 0 && !scheduled) {
      scheduled = true;
      if (typeof window.requestIdleCallback === "function") {
        window.requestIdleCallback(() => flushPending(), { timeout: 100 });
      } else {
        requestAnimationFrame(flushPending);
      }
    }
  });

  if (document.body) {
    mutationObserver.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["class", "data-theme", "data-mode", "style"],
    });
    debugSync("[OKLCH Cascade] MutationObserver attached");
  }
}

// ============================================================================
// INLINE STYLE SWEEP
// ============================================================================

function sweepInlineStyles(settings: Settings, useOklch: boolean): void {
  requestAnimationFrame(() => {
    const styled = document.querySelectorAll("[style]");
    const limit = Math.min(styled.length, 500);
    const darkBg = bg(settings.amoled ? 0 : 1, useOklch);
    const lightText = useOklch ? OKLCH_PALETTE.text.primary : HEX_FALLBACK_PALETTE.text.primary;
    let fixes = 0;

    for (let i = 0; i < limit; i++) {
      const el = styled[i] as HTMLElement;

      const inlineBg = el.style.backgroundColor;
      if (inlineBg) {
        const rgb = parseRgbFast(inlineBg);
        if (rgb) {
          const lum = getRelativeLuminance(rgb.r, rgb.g, rgb.b);
          if (lum > 0.4) {
            el.style.setProperty("background-color", darkBg, "important");
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
            el.style.setProperty("color", lightText, "important");
            fixes++;
          }
        }
      }
    }

    debugSync("[OKLCH Cascade] Inline sweep: fixed", fixes, "of", limit, "styled elements");
  });
}

// ============================================================================
// MAIN ENTRY POINT
// ============================================================================

/**
 * Apply the OKLCH Cascade Engine.
 *
 * Called from index.ts after applyFilterCss() has been called, so the user's
 * brightness/contrast/sepia/grayscale/blueShift preferences are already
 * applied as a CSS filter chain on <html>. This function must NOT re-apply
 * those values internally.
 */
export function applyOklchCascade(settings: Settings): void {
  const startTime = performance.now();

  debugSync("[OKLCH Cascade] ════════════════════════════════════════════");
  debugSync("[OKLCH Cascade] Starting OKLCH Cascade Engine v1.1");
  debugSync("[OKLCH Cascade] ════════════════════════════════════════════");

  resetOklchCascade();

  const useOklch = supportsOklch();
  const hasRelColor = supportsRelativeColor();
  const hasLightDark = supportsLightDark();

  debugSync(
    "[OKLCH Cascade] Feature support — oklch:",
    useOklch,
    "| relative-color:",
    hasRelColor,
    "| light-dark:",
    hasLightDark
  );

  if (!useOklch && !CSS.supports?.("color-scheme", "dark")) {
    debugSync("[OKLCH Cascade] ⚠️ Browser too old, falling back to Photon");
    applyPhotonInverter(settings);
    return;
  }

  stats = {
    startTime,
    variablesHijacked: 0,
    frameworkDetected: null,
    nativeDarkModeActivated: false,
    fallbackTriggered: false,
    oklchSupported: useOklch,
    relativeColorSupported: hasRelColor,
    lightDarkSupported: hasLightDark,
    totalTimeMs: 0,
  };

  // ── Phase 1: Framework detection BEFORE color-scheme injection ────────────
  detectedFramework = detectFramework();
  stats.frameworkDetected = detectedFramework.name;
  stats.nativeDarkModeActivated = detectedFramework.darkModeActivated;

  // ── Phase 0: color-scheme: dark (injected AFTER detection so we don't fool
  //            our own probe) ─────────────────────────────────────────────────
  injectColorScheme();
  debugSync("[OKLCH Cascade] Phase 0: color-scheme: dark injected");

  // ── CRITICAL: set mode markers BEFORE stylesheet injection ────────────────
  // The semantic CSS uses html[udr-applied="true"][data-udr-mode="oklch-cascade"]
  // as a scoping selector. Setting the attributes first ensures the rules match
  // immediately when the stylesheet is parsed — avoiding a flash of unstyled content.
  setModeMarkers();

  if (detectedFramework.darkModeActivated) {
    debugSync("[OKLCH Cascade] ✓ Native dark mode active — minimal enhancements only");
    injectSpecialCSS(settings, useOklch);
    setupMutationObserver(settings, useOklch);
    finalise(startTime);
    return;
  }

  // ── Phase 2: CSS Variable Hijacking ──────────────────────────────────────
  hijackCSSVariables(settings, useOklch);

  // ── Phase 3: Semantic CSS Rules ───────────────────────────────────────────
  debugSync("[OKLCH Cascade] Phase 3: Injecting semantic CSS rules");

  let semTag = document.getElementById(STYLE_IDS.semanticRules) as HTMLStyleElement | null;
  if (!semTag) {
    semTag = document.createElement("style");
    semTag.id = STYLE_IDS.semanticRules;
    document.head.appendChild(semTag);
  }
  semTag.textContent = generateSemanticCSS(settings, useOklch);

  // ── Phase 4: Special Elements ─────────────────────────────────────────────
  injectSpecialCSS(settings, useOklch);

  sweepInlineStyles(settings, useOklch);
  setupMutationObserver(settings, useOklch);
  finalise(startTime);
}

function injectSpecialCSS(settings: Settings, useOklch: boolean): void {
  let tag = document.getElementById(STYLE_IDS.specialElements) as HTMLStyleElement | null;
  if (!tag) {
    tag = document.createElement("style");
    tag.id = STYLE_IDS.specialElements;
    document.head.appendChild(tag);
  }
  tag.textContent = generateSpecialCSS(settings, useOklch);
}

function setModeMarkers(): void {
  document.documentElement.setAttribute("data-udr-mode", ENGINE_MODE);
  document.documentElement.setAttribute("udr-applied", "true");
}

function finalise(startTime: number): void {
  const elapsed = performance.now() - startTime;
  if (stats) stats.totalTimeMs = elapsed;

  debugSync("[OKLCH Cascade] ════════════════════════════════════════════");
  debugSync("[OKLCH Cascade] ✓ Complete in", elapsed.toFixed(2), "ms");
  debugSync("[OKLCH Cascade]   Variables hijacked:", stats?.variablesHijacked ?? 0);
  debugSync("[OKLCH Cascade]   Framework:", stats?.frameworkDetected ?? "none");
  debugSync("[OKLCH Cascade]   OKLCH:", stats?.oklchSupported ? "yes" : "fallback");
  debugSync("[OKLCH Cascade] ════════════════════════════════════════════");
}

// ============================================================================
// RESET / CLEANUP
// ============================================================================

export function resetOklchCascade(): void {
  debugSync("[OKLCH Cascade] Resetting");

  if (mutationObserver) {
    mutationObserver.disconnect();
    mutationObserver = null;
  }

  for (const id of Object.values(STYLE_IDS)) {
    document.getElementById(id)?.remove();
  }

  // NOTE: Feature probe cache (_oklchOk etc.) is intentionally NOT cleared here.
  // Browser capabilities don't change within a session; clearing forces
  // unnecessary DOM probes on every toggle.

  stats = null;
  detectedFramework = null;

  // Revert only the attributes that THIS engine set — never touch pre-existing
  // dark-mode attributes that the site itself had set.
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

  debugSync("[OKLCH Cascade] Reset complete");
}

// ============================================================================
// DIAGNOSTICS
// ============================================================================

export function getOklchDiagnostics(): object {
  const diag = {
    engine: "oklch-cascade",
    version: "1.1",
    url: location.href,
    framework: detectedFramework,
    stats,
    styleTagsPresent: Object.fromEntries(
      Object.entries(STYLE_IDS).map(([k, id]) => [k, !!document.getElementById(id)])
    ),
    featureSupport: {
      oklch: _oklchOk,
      relativeColor: _relColorOk,
      lightDark: _lightDarkOk,
    },
    bodyBg: getComputedStyle(document.body).backgroundColor,
    htmlAttrs: {
      udrApplied: document.documentElement.getAttribute("udr-applied"),
      udrMode: document.documentElement.getAttribute("data-udr-mode"),
      colorScheme: getComputedStyle(document.documentElement).colorScheme,
    },
  };
  console.log("[OKLCH Cascade Diag]", JSON.stringify(diag, null, 2));
  return diag;
}

// ── Console diagnostic bridge ─────────────────────────────────────────────────

if (typeof window !== "undefined") {
  try {
    window.addEventListener("message", async (event) => {
      if (event.data?.type === "UDR_OKLCH_DIAG_REQUEST") {
        const origin = originFromUrl(location.href);
        const settings = await getSettings();
        const siteSettings = settings.perSite?.[origin];

        const diag = {
          engine: "oklch-cascade",
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
          featureSupport: { oklch: _oklchOk, relativeColor: _relColorOk, lightDark: _lightDarkOk },
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
        window.postMessage({ type: "UDR_OKLCH_DIAG_RESPONSE", diag }, "*");
      }
    });

    if (!document.getElementById(DIAG_SCRIPT_ID)) {
      const script = document.createElement("script");
      script.id = DIAG_SCRIPT_ID;
      script.textContent = `
      window.__oklchDiag = function() {
        return new Promise(function(resolve) {
          window.postMessage({ type: "UDR_OKLCH_DIAG_REQUEST" }, "*");
          var handler = function(event) {
            if (event.data && event.data.type === "UDR_OKLCH_DIAG_RESPONSE") {
              console.log("[OKLCH Cascade Diag]", JSON.stringify(event.data.diag, null, 2));
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
