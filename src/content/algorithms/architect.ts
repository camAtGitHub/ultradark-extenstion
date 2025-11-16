// src/content/algorithms/architect.ts

/**
 * Algorithm A: The Architect's Method (Declarative & State-Driven)
 * 
 * This approach uses CSS Custom Properties (variables) for a clean, performant,
 * and maintainable dark theme implementation. The browser's CSS engine handles
 * all the heavy lifting.
 */

import type { Settings } from "../../types/settings";

export interface ArchitectConfig {
  brightness: number;
  contrast: number;
  sepia: number;
  grayscale: number;
  hueRotateDeg: number;
  amoled: boolean;
}

/**
 * Generate CSS using the Architect's Method
 * Uses CSS variables and modern filter properties
 */
export function generateArchitectCSS(config: ArchitectConfig): string {
  const {
    brightness,
    contrast,
    sepia,
    grayscale,
    hueRotateDeg,
    amoled
  } = config;

  // Calculate filter values
  const brightnessPercent = brightness;
  const contrastPercent = contrast;
  const sepiaPercent = sepia;
  const grayscalePercent = grayscale;

  // Base colors - use AMOLED pure black if enabled
  const bgPrimary = amoled ? "#000000" : "#1a1a1a";
  const bgSecondary = amoled ? "#0a0a0a" : "#242424";
  const textPrimary = "#e0e0e0";
  const textSecondary = "#b0b0b0";

  return `
/* UltraDark Reader - Architect's Method */

:root {
  --udr-bg-primary: ${bgPrimary};
  --udr-bg-secondary: ${bgSecondary};
  --udr-text-primary: ${textPrimary};
  --udr-text-secondary: ${textSecondary};
  --udr-brightness: ${brightnessPercent}%;
  --udr-contrast: ${contrastPercent}%;
  --udr-sepia: ${sepiaPercent}%;
  --udr-grayscale: ${grayscalePercent}%;
  --udr-hue-rotate: ${hueRotateDeg}deg;
}

html {
  background-color: var(--udr-bg-primary) !important;
  color-scheme: dark !important;
}

body {
  background-color: var(--udr-bg-primary) !important;
  color: var(--udr-text-primary) !important;
}

/* Apply inversion filter to the entire page */
html {
  filter: 
    invert(1) 
    hue-rotate(180deg)
    brightness(var(--udr-brightness))
    contrast(var(--udr-contrast))
    sepia(var(--udr-sepia))
    grayscale(var(--udr-grayscale))
    hue-rotate(var(--udr-hue-rotate));
}

/* Re-invert images and media to restore natural colors */
img, picture, video, canvas, svg,
[style*="background-image"] {
  filter: 
    invert(1) 
    hue-rotate(180deg);
}

/* Handle iframes */
iframe {
  filter: 
    invert(1) 
    hue-rotate(180deg);
}

/* Preserve syntax highlighting colors in code blocks */
pre, code {
  filter: none;
}
  `.trim();
}

/**
 * Apply the Architect's Method to the page
 */
export function applyArchitectMethod(settings: Settings): void {
  const hueDeg = Math.round((settings.blueShift / 100) * 40);
  
  const css = generateArchitectCSS({
    brightness: settings.brightness,
    contrast: settings.contrast,
    sepia: settings.sepia,
    grayscale: settings.grayscale,
    hueRotateDeg: hueDeg,
    amoled: settings.amoled
  });

  let styleTag = document.getElementById("udr-style") as HTMLStyleElement;
  if (!styleTag) {
    styleTag = document.createElement("style");
    styleTag.id = "udr-style";
    document.head.appendChild(styleTag);
  }
  
  styleTag.textContent = css;
  document.documentElement.setAttribute("data-udr-mode", "architect");
}
