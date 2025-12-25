// File: src/utils/dark-detection.ts
import { debugSync } from "./logger";

// Helper: Standard WCAG Luminance calculation
function getLuminance(r: number, g: number, b: number): number {
  const [rs, gs, bs] = [r, g, b].map(c => {
    const v = c / 255;
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs;
}

// Helper: Parse 'rgb(x, y, z)' string
function parseRGB(str: string): {r:number, g:number, b:number} | null {
  const match = str.match(/(\d+),\s*(\d+),\s*(\d+)/);
  if (!match) return null;
  return { r: parseInt(match[1]), g: parseInt(match[2]), b: parseInt(match[3]) };
}

/**
 * LEAN DARK DETECTION
 * No guessing. No metadata. Only standards and pixels.
 */
export function isAlreadyDarkTheme(): boolean {
  const html = document.documentElement;
  const body = document.body;
  
  debugSync('[Dark Detection] ========== DETECTION START ==========');
  debugSync('[Dark Detection] URL:', window.location.href);
  
  if (!html || !body) {
    debugSync('[Dark Detection] ERROR: Missing html or body element');
    debugSync('[Dark Detection] Result: FALSE (missing elements)');
    return false;
  }

  // GUARD: Don't detect our own styles
  // This is not metadata guessing - it's checking if WE modified the page
  // Return false to allow reapplication with updated settings
  const hasUdrStyle = !!document.getElementById('udr-style');
  const hasUdrPreinject = !!document.getElementById('udr-preinject');
  const hasUdrShield = !!document.getElementById('udr-shield');
  const hasUdrAppliedAttr = html.getAttribute('udr-applied') === 'true';
  const hasDataUdrApplied = html.getAttribute('data-udr-applied') === '1';
  
  debugSync('[Dark Detection] Extension markers check:');
  debugSync('[Dark Detection]   - udr-style tag:', hasUdrStyle);
  debugSync('[Dark Detection]   - udr-preinject tag:', hasUdrPreinject);
  debugSync('[Dark Detection]   - udr-shield tag:', hasUdrShield);
  debugSync('[Dark Detection]   - udr-applied attribute:', hasUdrAppliedAttr);
  debugSync('[Dark Detection]   - data-udr-applied attribute:', hasDataUdrApplied);
  
  if (hasUdrStyle || hasUdrPreinject || hasUdrShield || hasUdrAppliedAttr || hasDataUdrApplied) {
    debugSync('[Dark Detection] Extension markers found, allowing reapplication');
    debugSync('[Dark Detection] Result: FALSE (extension already applied)');
    debugSync('[Dark Detection] ========== DETECTION END ==========');
    return false;
  }

  // CHECK 1: The Official Standard
  // If the site explicitly tells the browser it is dark, believe it.
  const colorScheme = window.getComputedStyle(html).colorScheme;
  debugSync('[Dark Detection] CHECK 1 - Browser Standards:');
  debugSync('[Dark Detection]   - color-scheme property:', colorScheme || '(not set)');
  
  if (colorScheme === 'dark') {
    debugSync('[Dark Detection] "color-scheme: dark" detected.');
    debugSync('[Dark Detection] Result: TRUE (browser standard indicates dark)');
    debugSync('[Dark Detection] ========== DETECTION END ==========');
    return true;
  }

  // CHECK 2: Visual Reality (Pixels)
  // Check background color of the main containers.
  debugSync('[Dark Detection] CHECK 2 - Visual Reality (Luminance):');
  const targets = [html, body];
  
  for (const el of targets) {
    const bg = window.getComputedStyle(el).backgroundColor;
    
    debugSync(`[Dark Detection]   - <${el.tagName}> backgroundColor:`, bg);
    
    // Ignore transparent backgrounds
    if (bg === 'rgba(0, 0, 0, 0)' || bg === 'transparent') {
      debugSync(`[Dark Detection]   - <${el.tagName}>: SKIPPED (transparent)`);
      continue;
    }

    const rgb = parseRGB(bg);
    if (rgb) {
      const lum = getLuminance(rgb.r, rgb.g, rgb.b);
      const threshold = 0.3;
      
      debugSync(`[Dark Detection]   - <${el.tagName}> RGB:`, `(${rgb.r}, ${rgb.g}, ${rgb.b})`);
      debugSync(`[Dark Detection]   - <${el.tagName}> Luminance:`, lum.toFixed(4), `(threshold: ${threshold})`);
      
      // Threshold: 0.3 covers most dark gray/black themes
      if (lum < threshold) {
        debugSync(`[Dark Detection]   - <${el.tagName}>: LOW LUMINANCE (${lum.toFixed(4)} < ${threshold})`);
        debugSync(`[Dark Detection] Low luminance detected on <${el.tagName}>: ${lum.toFixed(2)}`);
        debugSync('[Dark Detection] Result: TRUE (luminance below threshold)');
        debugSync('[Dark Detection] ========== DETECTION END ==========');
        return true;
      } else {
        debugSync(`[Dark Detection]   - <${el.tagName}>: HIGH LUMINANCE (${lum.toFixed(4)} >= ${threshold})`);
      }
    } else {
      debugSync(`[Dark Detection]   - <${el.tagName}>: PARSE FAILED`);
    }
  }

  debugSync('[Dark Detection] Site is LIGHT.');
  debugSync('[Dark Detection] Result: FALSE (no dark indicators found)');
  debugSync('[Dark Detection] ========== DETECTION END ==========');
  return false;
}
