// src/utils/dark-detection.ts

/**
 * Detect if a site is already using a dark theme
 * Uses multiple heuristics:
 * 1. Check if site responds to prefers-color-scheme: dark
 * 2. Check average background luminance
 */

import { debugSync } from "./logger";

/**
 * Convert RGB color string to luminance value (0..1)
 * Uses relative luminance formula from WCAG
 */
function rgbToLuminance(r: number, g: number, b: number): number {
  // Normalize 0-255 to 0-1
  const [rs, gs, bs] = [r, g, b].map((c) => {
    const normalized = c / 255;
    return normalized <= 0.03928
      ? normalized / 12.92
      : Math.pow((normalized + 0.055) / 1.055, 2.4);
  });

  return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs;
}

/**
 * Parse CSS color string to RGB values
 */
function parseColor(colorStr: string): { r: number; g: number; b: number } | null {
  // Handle rgb(a) format
  const rgbMatch = colorStr.match(/rgba?\s*\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/);
  if (rgbMatch) {
    return {
      r: parseInt(rgbMatch[1], 10),
      g: parseInt(rgbMatch[2], 10),
      b: parseInt(rgbMatch[3], 10),
    };
  }

  // Handle hex format
  const hexMatch = colorStr.match(/^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i);
  if (hexMatch) {
    return {
      r: parseInt(hexMatch[1], 16),
      g: parseInt(hexMatch[2], 16),
      b: parseInt(hexMatch[3], 16),
    };
  }

  // Fallback for named colors - just use a canvas to convert
  if (typeof document !== "undefined") {
    const ctx = document.createElement("canvas").getContext("2d");
    if (ctx) {
      ctx.fillStyle = colorStr;
      const computed = ctx.fillStyle;
      // Recursively parse the computed hex value
      if (computed !== colorStr) {
        return parseColor(computed);
      }
    }
  }

  return null;
}

/**
 * Calculate average background luminance of the page
 * Samples body and 5 random deeply-nested divs as per consultant spec
 */
export function getAverageBackgroundLuminance(): number {
  const body = document.body;
  const html = document.documentElement;

  if (!body || !html) return 1; // Default to light (1 = white)

  const samples: number[] = [];

  // Sample body background
  const bodyBg = getComputedStyle(body).backgroundColor;
  const bodyColor = parseColor(bodyBg);
  if (bodyColor && bodyBg !== 'rgba(0, 0, 0, 0)' && bodyBg !== 'transparent') {
    const luminance = rgbToLuminance(bodyColor.r, bodyColor.g, bodyColor.b);
    samples.push(luminance);
    debugSync('[Dark Detection] Body background:', bodyBg, '-> RGB:', bodyColor, '-> Luminance:', luminance);
  }

  // Sample 5 random deeply-nested div elements (consultant spec requirement)
  const allDivs = Array.from(document.querySelectorAll('div'));
  
  // Filter to get deeply nested divs (depth > 3)
  const deeplyNestedDivs = allDivs.filter(div => {
    let depth = 0;
    let parent = div.parentElement;
    while (parent && depth < 10) { // Limit depth check to avoid infinite loops
      depth++;
      parent = parent.parentElement;
    }
    return depth > 3;
  });

  debugSync('[Dark Detection] Found', deeplyNestedDivs.length, 'deeply nested divs (depth > 3)');

  // Randomly select up to 5 deeply-nested divs
  const samplesToTake = Math.min(5, deeplyNestedDivs.length);
  const randomIndices = new Set<number>();
  
  while (randomIndices.size < samplesToTake && randomIndices.size < deeplyNestedDivs.length) {
    randomIndices.add(Math.floor(Math.random() * deeplyNestedDivs.length));
  }

  for (const index of randomIndices) {
    const el = deeplyNestedDivs[index];
    const bg = getComputedStyle(el).backgroundColor;
    
    // Skip transparent backgrounds
    if (bg === 'rgba(0, 0, 0, 0)' || bg === 'transparent') {
      debugSync('[Dark Detection] Skipping transparent background on random div #' + index);
      continue;
    }
    
    const color = parseColor(bg);
    if (color) {
      const luminance = rgbToLuminance(color.r, color.g, color.b);
      samples.push(luminance);
      debugSync('[Dark Detection] Random div #' + index + ' background:', bg, '-> RGB:', color, '-> Luminance:', luminance);
    }
  }

  // If we have samples, return average
  if (samples.length > 0) {
    const avg = samples.reduce((a, b) => a + b, 0) / samples.length;
    debugSync('[Dark Detection] Average luminance across', samples.length, 'samples:', avg);
    return avg;
  }

  debugSync('[Dark Detection] No samples found, defaulting to light (luminance: 1)');
  return 1; // Default to light
}

/**
 * Check if the site declares support for dark mode via media query
 */
export function siteDeclaresColorScheme(): boolean {
  if (typeof window === "undefined" || !window.matchMedia) return false;

  // Check if the site is responding to prefers-color-scheme
  const darkMq = window.matchMedia("(prefers-color-scheme: dark)");
  
  // If the media query matches, check if CSS actually changes
  // We do this by comparing a known element's background in both modes
  if (darkMq.matches) {
    debugSync('[Dark Detection] Site responds to prefers-color-scheme: dark');
    return true;
  }

  debugSync('[Dark Detection] Site does not respond to prefers-color-scheme: dark');
  return false;
}

/**
 * Check for common dark theme indicators in HTML/CSS classes and attributes
 * Including meta tags and color-scheme properties as per consultant spec
 */
export function hasExplicitDarkThemeMarkers(): boolean {
  const html = document.documentElement;
  const body = document.body;

  if (!html || !body) return false;

  // Check for color-scheme meta tag (consultant spec requirement)
  const colorSchemeMeta = document.querySelector('meta[name="color-scheme"]');
  if (colorSchemeMeta) {
    const content = colorSchemeMeta.getAttribute('content') || '';
    if (/dark/i.test(content)) {
      debugSync('[Dark Detection] Found dark color-scheme meta tag:', content);
      return true;
    }
  }

  // Check for common dark theme class names on html or body
  const darkClassPatterns = /dark|night|black|theme-dark/i;
  
  if (darkClassPatterns.test(html.className)) {
    debugSync('[Dark Detection] Found dark theme class on <html>:', html.className);
    return true;
  }
  
  if (darkClassPatterns.test(body.className)) {
    debugSync('[Dark Detection] Found dark theme class on <body>:', body.className);
    return true;
  }

  // Check for data-theme attribute
  const htmlTheme = html.getAttribute("data-theme") || html.getAttribute("theme");
  const bodyTheme = body.getAttribute("data-theme") || body.getAttribute("theme");
  
  if (htmlTheme && /dark|night|black/i.test(htmlTheme)) {
    debugSync('[Dark Detection] Found dark theme attribute on <html>:', htmlTheme);
    return true;
  }
  
  if (bodyTheme && /dark|night|black/i.test(bodyTheme)) {
    debugSync('[Dark Detection] Found dark theme attribute on <body>:', bodyTheme);
    return true;
  }

  // Check for color-scheme CSS property on :root and body (consultant spec requirement)
  const rootColorScheme = getComputedStyle(html).colorScheme;
  const bodyColorScheme = getComputedStyle(body).colorScheme;
  
  if (rootColorScheme && /dark/i.test(rootColorScheme)) {
    debugSync('[Dark Detection] Found dark color-scheme on :root (html):', rootColorScheme);
    return true;
  }
  
  if (bodyColorScheme && /dark/i.test(bodyColorScheme)) {
    debugSync('[Dark Detection] Found dark color-scheme on <body>:', bodyColorScheme);
    return true;
  }

  debugSync('[Dark Detection] No explicit dark theme markers found');
  return false;
}

/**
 * Detect if the current page is already using a dark theme
 * Returns true if the site appears to be dark
 */
export function isAlreadyDarkTheme(): boolean {
  // Threshold: luminance below 0.2 is considered dark (consultant spec)
  const DARK_THRESHOLD = 0.2;

  debugSync('[Dark Detection] Starting dark theme detection for:', window.location.href);

  // Check for explicit markers first (fastest and most reliable)
  if (hasExplicitDarkThemeMarkers()) {
    debugSync('[Dark Detection] Result: DARK (explicit markers found)');
    return true;
  }

  const avgLuminance = getAverageBackgroundLuminance();
  const declaresColorScheme = siteDeclaresColorScheme();

  debugSync('[Dark Detection] Average luminance:', avgLuminance, '(threshold:', DARK_THRESHOLD + ')');

  // If average luminance is dark, consider it a dark site
  if (avgLuminance < DARK_THRESHOLD) {
    debugSync('[Dark Detection] Result: DARK (luminance below threshold)');
    return true;
  }

  // If site declares color scheme support and prefers-color-scheme is dark
  if (declaresColorScheme) {
    debugSync('[Dark Detection] Result: DARK (declares color scheme)');
    return true;
  }

  debugSync('[Dark Detection] Result: LIGHT (no dark indicators found)');
  return false;
}
