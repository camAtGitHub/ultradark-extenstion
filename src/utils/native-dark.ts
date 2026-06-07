// src/utils/native-dark.ts
//
// Unified framework detection and native dark mode activation.
// Extracted from duplicated logic in perceptual-remap, oklch-cascade, chroma-semantic.
//
// Exports:
// - FRAMEWORK_PATTERNS: Shared framework detection patterns
// - FrameworkInfo: Detection result type
// - detectFramework(): Detects frameworks and native dark support
// - activateNativeDark(name: string): Attempts activation, returns success boolean
// - getActivationAttrs(): Returns attrs set by this activation (for per-algo reset)

import { parseRgbFast, getRelativeLuminance } from "./color-utils";

export interface FrameworkInfo {
  name: string;
  detected: boolean;
  hasNativeDarkMode: boolean;
  darkModeActivated: boolean;
}

export const FRAMEWORK_PATTERNS: ReadonlyArray<{
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

let activationAttrs: Set<string> | null = null;

export function getActivationAttrs(): Set<string> {
  return activationAttrs ?? new Set();
}

export function clearActivationAttrs(): void {
  activationAttrs = null;
}

function activateNativeDark(fwName: string): boolean {
  const html = document.documentElement;
  activationAttrs = new Set<string>();

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
        // Record what this activation set
        if (strategy.attr) activationAttrs!.add(strategy.attr);
        if (strategy.cls) activationAttrs!.add(`class:${strategy.cls}`);
        return true;
      }
    } catch {
      /* ignore */
      /* continue */
    }
  }

  // Revert all attempts
  html.removeAttribute("data-theme");
  html.removeAttribute("data-mode");
  html.removeAttribute("data-color-scheme");
  html.removeAttribute("data-bs-theme");
  html.classList.remove("dark", "chakra-ui-dark");
  document.body?.classList.remove("chakra-ui-dark");
  return false;
}

export function detectFramework(): FrameworkInfo {
  const info: FrameworkInfo = {
    name: "unknown",
    detected: false,
    hasNativeDarkMode: false,
    darkModeActivated: false,
  };
  const html = document.documentElement;

  // Check existing dark mode indicators first (fast path)
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

  // Detect framework via CSS vars or stylesheet patterns
  const rootStyle = getComputedStyle(html);
  for (const fw of FRAMEWORK_PATTERNS) {
    // Check root CSS vars
    for (const suffix of ["-bg", "-background", "-primary"]) {
      if (rootStyle.getPropertyValue(`--${fw.name}${suffix}`).trim()) {
        info.name = fw.name;
        info.detected = true;
        break;
      }
    }
    if (info.detected) break;
  }

  // Fallback: scan stylesheets for :root vars (limited scope)
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
          /* ignore */
          continue;
        }
      }
    } catch {
      /* ignore */
    }
  }

  // Check for native dark mode support via selector scanning
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
            /* ignore */
            continue;
          }
          if (info.hasNativeDarkMode) break;
        }
      } catch {
        /* ignore */
      }
    }
  }

  // Attempt activation if supported but not active
  if (info.hasNativeDarkMode && !info.darkModeActivated) {
    info.darkModeActivated = activateNativeDark(info.name);
  }

  return info;
}
