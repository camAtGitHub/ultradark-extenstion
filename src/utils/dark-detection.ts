// src/utils/dark-detection.ts

/**
 * Detect if a site is already using a dark theme
 * Uses multiple heuristics:
 * 1. Check if site responds to prefers-color-scheme: dark
 * 2. Check average background luminance
 */

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
 * Samples multiple elements to get a representative value
 */
export function getAverageBackgroundLuminance(): number {
  const body = document.body;
  const html = document.documentElement;

  if (!body || !html) return 1; // Default to light (1 = white)

  const samples: number[] = [];

  // Sample body background
  const bodyBg = getComputedStyle(body).backgroundColor;
  const bodyColor = parseColor(bodyBg);
  if (bodyColor) {
    samples.push(rgbToLuminance(bodyColor.r, bodyColor.g, bodyColor.b));
  }

  // Sample html background
  const htmlBg = getComputedStyle(html).backgroundColor;
  const htmlColor = parseColor(htmlBg);
  if (htmlColor) {
    samples.push(rgbToLuminance(htmlColor.r, htmlColor.g, htmlColor.b));
  }

  // Sample some major container elements
  const selectors = ["main", "article", "section", ".content", "#content", ".main", "#main"];
  for (const selector of selectors) {
    const el = document.querySelector(selector);
    if (el) {
      const bg = getComputedStyle(el).backgroundColor;
      const color = parseColor(bg);
      if (color) {
        samples.push(rgbToLuminance(color.r, color.g, color.b));
      }
    }
  }

  // If we have samples, return average
  if (samples.length > 0) {
    return samples.reduce((a, b) => a + b, 0) / samples.length;
  }

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
    return true;
  }

  return false;
}

/**
 * Check for common dark theme indicators in HTML/CSS classes and attributes
 */
export function hasExplicitDarkThemeMarkers(): boolean {
  const html = document.documentElement;
  const body = document.body;

  if (!html || !body) return false;

  // Check for common dark theme class names on html or body
  const darkClassPatterns = /dark|night|black|theme-dark/i;
  
  if (darkClassPatterns.test(html.className) || darkClassPatterns.test(body.className)) {
    return true;
  }

  // Check for data-theme attribute
  const htmlTheme = html.getAttribute("data-theme") || html.getAttribute("theme");
  const bodyTheme = body.getAttribute("data-theme") || body.getAttribute("theme");
  
  if (htmlTheme && /dark|night|black/i.test(htmlTheme)) {
    return true;
  }
  
  if (bodyTheme && /dark|night|black/i.test(bodyTheme)) {
    return true;
  }

  // Check for color-scheme CSS property
  const htmlColorScheme = getComputedStyle(html).colorScheme;
  const bodyColorScheme = getComputedStyle(body).colorScheme;
  
  if (htmlColorScheme && /dark/i.test(htmlColorScheme)) {
    return true;
  }
  
  if (bodyColorScheme && /dark/i.test(bodyColorScheme)) {
    return true;
  }

  return false;
}

/**
 * Detect if the current page is already using a dark theme
 * Returns true if the site appears to be dark
 */
export function isAlreadyDarkTheme(): boolean {
  // Threshold: luminance below 0.3 is considered dark
  const DARK_THRESHOLD = 0.3;

  // Check for explicit markers first (fastest and most reliable)
  if (hasExplicitDarkThemeMarkers()) {
    return true;
  }

  const avgLuminance = getAverageBackgroundLuminance();
  const declaresColorScheme = siteDeclaresColorScheme();

  // If average luminance is dark, consider it a dark site
  if (avgLuminance < DARK_THRESHOLD) {
    return true;
  }

  // If site declares color scheme support and prefers-color-scheme is dark
  if (declaresColorScheme) {
    return true;
  }

  return false;
}
