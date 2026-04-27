// File: src/content/algorithms/photon-inverter.ts

/**
 * Algorithm 1: "Photon Inverter" (Bookmarklet Logic with DOM Fixes)
 * 
 * Strategy: Double Flip method + DOM manipulation to fix transparent backgrounds
 * Complexity: O(n) for initial DOM walk, but necessary for visual correctness
 * Use Case: The "magic" from the bookmarklet - fixes transparency issues
 * 
 * Based on the dark-theme-snippet bookmarklet approach
 */

import type { Settings } from "../../types/settings";
import { STYLE_TAG_ID } from "../../utils/defaults";
import { debugSync } from "../../utils/logger";
import { isTransparentFast } from "../../utils/color-utils";
import { ensureStyleTag } from "../style-template";

const DARK_THEME_SNIPPET_ID = "dark-theme-snippet";
const DATA_FIX_ATTR = "data-photon-fix";

/**
 * HELPER: The "Bookmarklet" Logic (The Missing Piece)
 * 
 * OPTIMIZATION 4: Chunked TreeWalker Processing
 * 
 * The bookmarklet works because it loops through every element
 * and if it's transparent, forces it to WHITE.
 * When we apply invert(1), that White becomes BLACK.
 * 
 * Old approach: querySelectorAll("body *") returns ALL descendants (5000+ on large pages)
 * New approach: TreeWalker with chunked processing to avoid blocking main thread
 */
function fixTransparentBackgrounds(): void {
  // Skip if CSS-only approach is sufficient (small pages)
  // The CSS rule handles most cases; JS is only for edge cases
  if (document.body.children.length < 50) {
    debugSync('[Photon Inverter] Small page, skipping JS transparency fix');
    return;
  }

  const BATCH_SIZE = 200;
  const SKIP_TAGS = new Set(['IMG', 'VIDEO', 'CANVAS', 'SVG', 'PICTURE', 'IFRAME', 'SCRIPT', 'STYLE', 'NOSCRIPT']);
  
  const walker = document.createTreeWalker(
    document.body,
    NodeFilter.SHOW_ELEMENT,
    {
      acceptNode: (node) => {
        const el = node as HTMLElement;
        // Early rejection of non-processable elements
        if (SKIP_TAGS.has(el.tagName)) return NodeFilter.FILTER_REJECT;
        if (el.hasAttribute(DATA_FIX_ATTR)) return NodeFilter.FILTER_SKIP;
        return NodeFilter.FILTER_ACCEPT;
      }
    }
  );

  let fixedCount = 0;
  let node: Node | null;
  
  function processChunk(): void {
    let processed = 0;
    const elementsToFix: HTMLElement[] = [];
    
    // PHASE 1: Identify elements needing fix (batch style reads)
    while ((node = walker.nextNode()) && processed < BATCH_SIZE) {
      const el = node as HTMLElement;
      processed++;
      
      // Check computed style
      const cs = window.getComputedStyle(el);
      const bg = cs.backgroundColor;

      // Skip positioned elements (absolute/fixed) — these are overlay/decorative
      // layers whose transparency is intentional. Forcing them to white causes
      // the global invert() to paint them black, covering any <img> beneath them.
      const pos = cs.position;
      if (pos === 'absolute' || pos === 'fixed') continue;
      
      // Transparent backgrounds need a white fallback before inversion.
      // IMPORTANT: never treat opaque rgb(0,0,0) as transparent.
      if (bg === "transparent" || isTransparentFast(bg)) {
        elementsToFix.push(el);
      }
    }
    
    // PHASE 2: Apply fixes (batch DOM writes)
    for (const el of elementsToFix) {
      el.style.backgroundColor = '#ffffff';
      el.setAttribute(DATA_FIX_ATTR, 'true');
      fixedCount++;
    }
    
    // Continue if more elements remain
    if (node) {
      requestAnimationFrame(processChunk);
    } else {
      debugSync(`[Photon Inverter] Fixed ${fixedCount} transparent backgrounds`);
    }
  }
  
  // Start processing on next frame (don't block initial render)
  requestAnimationFrame(processChunk);
}


/**
 * Generate CSS using the Bookmarklet's superior filter logic.
 * 
 * UPDATE: Includes slider settings (brightness, contrast, etc.) 
 * applied AFTER the initial inversion to preserve colors while allowing user customization.
 */
export function generatePhotonInverterCSS(settings: Settings): string {
  // 1. Calculate Base Inversion
  const baseHue = 180;
  const userHue = Math.round((settings.blueShift / 100) * 180);
  
  // 2. Calculate Slider Adjustments
  // We build the adjustment string to append AFTER the inversion.
  const adjustments = [];
  
  if (settings.brightness !== 100) adjustments.push(`brightness(${settings.brightness}%)`);
  if (settings.contrast !== 100) adjustments.push(`contrast(${settings.contrast}%)`);
  if (settings.sepia > 0) adjustments.push(`sepia(${settings.sepia}%)`);
  if (settings.grayscale > 0) adjustments.push(`grayscale(${settings.grayscale}%)`);
  
  // Construct final filter: Invert -> Hue-Rotate -> Sliders
  // This order ensures we invert first, then tweak.
  const filters = `invert(100%) hue-rotate(${baseHue + userHue}deg) ${adjustments.join(' ')}`;

  // 3. AMOLED / Background Handling
  // We force white backgrounds so they invert to black.
  const backgroundFix = `
/* Brute Force Background Fix */
html, body, body *:not(img):not(video):not(canvas):not(svg):not(picture):not(iframe):not([style*="background-image"]) {
  background-color: #ffffff !important;
}`;

  const amoledCss = settings.amoled
    ? `
/* AMOLED: Ensure absolute black after inversion */
html, body {
  background-color: #000000 !important;
}
`
    : "";

  debugSync('[Photon Inverter] Applying Global Filter Sliders...');
  return `
    /* Apply the Filter Chain */
    html {
      filter: ${filters} !important;
      min-height: 100vh;
    }

    /* Media Re-Inversion */
    img, video, picture, canvas, iframe, svg, [style*="background-image"] {
      filter: invert(100%) hue-rotate(180deg) !important;
    }

    /* Cancel for media nested inside media — parent already counter-inverted */
    :is(picture, svg, video, canvas, iframe) :is(img, video, picture, canvas, svg) {
      filter: none !important;
    }

    ${backgroundFix}
    ${amoledCss}
  `;
}

/**
 * Apply the Photon Inverter algorithm to the page
 */
export function applyPhotonInverter(settings: Settings): void {
  debugSync('[Photon Inverter] Applying dark theme (Bookmarklet Logic + Sliders)');

  // STEP 1: Apply CSS
  const css = generatePhotonInverterCSS(settings);
  const styleTag = ensureStyleTag();
  styleTag.textContent = css;

  // STEP 2: JS Fallback for transparency
  fixTransparentBackgrounds();

  document.documentElement.setAttribute("data-udr-mode", "photon-inverter");
  debugSync('[Photon Inverter] Applied successfully');
}

/**
 * Remove the Photon Inverter styles and DOM modifications
 */
export function removePhotonInverter(): void {
  debugSync('[Photon Inverter] Removing dark theme');

  const legacyTag = document.getElementById(DARK_THEME_SNIPPET_ID);
  if (legacyTag?.parentNode) {
    legacyTag.parentNode.removeChild(legacyTag);
  }

  const styleTag = document.getElementById(STYLE_TAG_ID);
  if (styleTag?.parentNode) {
    styleTag.parentNode.removeChild(styleTag);
  }

  const fixedElements = document.querySelectorAll(`[${DATA_FIX_ATTR}]`);
  fixedElements.forEach((el) => {
    (el as HTMLElement).style.backgroundColor = '';
    el.removeAttribute(DATA_FIX_ATTR);
  });
  
  debugSync(`[Photon Inverter] Cleaned up`);
}
