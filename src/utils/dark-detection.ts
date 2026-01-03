// File: src/utils/dark-detection.ts
import { debugSync } from "./logger";
import { parseRgbFast } from "./color-utils";

// Helper: Standard WCAG Luminance calculation
function getLuminance(r: number, g: number, b: number): number {
  const [rs, gs, bs] = [r, g, b].map(c => {
    const v = c / 255;
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs;
}

/**
 * ADVANCED DARK DETECTION
 * 
 * Fixes:
 * 1. Special handling for <body> to ensure the canvas color is always checked.
 * 2. Fallback sampling of direct body children if semantic selectors fail (prevents Valid=0).
 * 3. Robust RGBA parsing.
 */
export function isAlreadyDarkTheme(): boolean {
  const html = document.documentElement;
  const body = document.body;
  
  console.log('[UltraDark Dark Detection] ========== DETECTION START ==========');
  console.log('[UltraDark Dark Detection] URL:', window.location.href);
  
  if (!html || !body) {
    console.log('[UltraDark Dark Detection] ⛔ Body/HTML missing. Result: FALSE');
    return false;
  }

  // GUARD: Don't detect our own styles
  const hasUdrStyle = !!document.getElementById('udr-style');
  const hasUdrPreinject = !!document.getElementById('udr-preinject');
  const hasUdrShield = !!document.getElementById('udr-shield');
  const hasUdrAppliedAttr = html.getAttribute('udr-applied') === 'true';
  
  console.log('[UltraDark Dark Detection] Checking Extension Markers...');
  if (hasUdrStyle || hasUdrPreinject || hasUdrShield || hasUdrAppliedAttr) {
    console.log('[UltraDark Dark Detection] ✅ Extension styles detected. Aborting detection to prevent false positives.');
    return false;
  }

  // CHECK 1: The Official Standard
  const colorScheme = window.getComputedStyle(html).colorScheme;
  if (colorScheme === 'dark') {
    console.log('[UltraDark Dark Detection] 🎨 Browser reports "color-scheme: dark". Result: TRUE');
    return true;
  }

  // CHECK 2: Visual Reality (Sampling)
  // OPTIMIZATION: Batched style reads to prevent layout thrashing
  console.log('[UltraDark Dark Detection] 🔍 Sampling visual elements for luminance...');
  
  let darkVotes = 0;
  let validSamples = 0;
  let skippedTransparent = 0;
  let skippedHidden = 0;

  /**
   * BATCHED DARK DETECTION
   * 
   * Strategy: Read all computed styles in a single batch, THEN process.
   * This prevents forced synchronous layouts between reads.
   */
  const processElement = (el: Element, source: string, precomputedBg?: string) => {
    // Use precomputed background if provided (batch mode)
    const bg = precomputedBg ?? window.getComputedStyle(el).backgroundColor;
    const rgb = parseRgbFast(bg);
    
    if (!rgb) {
      skippedTransparent++;
      return;
    }

    const lum = getLuminance(rgb.r, rgb.g, rgb.b);
    const threshold = 0.2;
    
    console.log(`[UltraDark Dark Detection] Sample <${el.tagName.toLowerCase()}${el.className ? '.' + el.className.split(' ')[0] : ''}> (${source}): RGB(${rgb.r}, ${rgb.g}, ${rgb.b}) | Luminance: ${lum.toFixed(3)}`);
    
    if (lum < threshold) {
      darkVotes++;
    }
    validSamples++;
  };

  // PHASE 1: High-Priority Semantic Elements
  const selectors = [
    'body', // Always check body first
    'main', 
    '[role="main"]',
    'article', 
    '.container', 
    '#app', 
    '#root', 
    '.app-container',
    'header',
    '.navbar',
    '.sidebar',
    '.content',
    '.wrapper',
    '.main-content',
    '.page'
  ];

  // PHASE 1A: Collect all elements first (no style reads)
  const elementsToSample: Array<{ el: Element; source: string }> = [];
  for (const sel of selectors) {
    const elements = document.querySelectorAll(sel);
    elements.forEach(el => elementsToSample.push({ el, source: sel }));
  }

  // PHASE 1B: Batch read all computed styles (single layout pass)
  const styleCache = new Map<Element, string>();
  for (const { el, source } of elementsToSample) {
    // Visibility check is cheaper than full style computation
    // Skip obviously hidden elements before expensive style reads
    if (source !== 'body') {
      const rect = el.getBoundingClientRect();
      if (rect.width === 0 && rect.height === 0) {
        skippedHidden++;
        continue;
      }
    }
    styleCache.set(el, window.getComputedStyle(el).backgroundColor);
  }

  // PHASE 1C: Process cached styles (no layout impact)
  for (const { el, source } of elementsToSample) {
    const cachedBg = styleCache.get(el);
    if (cachedBg !== undefined) {
      processElement(el, source, cachedBg);
    }
  }

  console.log(`[UltraDark Dark Detection] PHASE 1 Stats: Valid=${validSamples}, Skipped(Transp)=${skippedTransparent}, Skipped(Hidden)=${skippedHidden}`);

  // PHASE 2: Fallback (Direct Body Children)
  // If Phase 1 yielded NO valid samples (e.g., generic structure not caught by selectors),
  // we fall back to the first 5 direct children of body.
  if (validSamples === 0) {
      console.log('[UltraDark Dark Detection] ⚠️ Phase 1 yielded 0 valid samples. Starting Phase 2 Fallback (Body Children)...');
      
      // Get direct children
      const children = Array.from(body.children);
      const limit = Math.min(children.length, 5); // Sample max 5 children to save time
      
      for (let i = 0; i < limit; i++) {
          processElement(children[i], `body-child[${i}]`);
      }
      
      console.log(`[UltraDark Dark Detection] PHASE 2 Stats: Valid=${validSamples} (Total)`);
  }

  if (validSamples === 0) {
    console.log('[UltraDark Dark Detection] ⚠️ Still no valid samples after Fallback. Defaulting to FALSE (Light).');
    return false;
  }

  const ratio = darkVotes / validSamples;
  console.log(`[UltraDark Dark Detection] 🗳️  Dark Votes: ${darkVotes}/${validSamples} (${(ratio*100).toFixed(0)}%)`);
  
  // If more than 40% of the visible structure is dark, we call it a dark site.
  if (ratio > 0.4) {
    console.log('[UltraDark Dark Detection] ✅ Result: TRUE (Dark theme detected)');
    return true;
  } else {
    console.log('[UltraDark Dark Detection] ✅ Result: FALSE (Light theme detected)');
    return false;
  }
}