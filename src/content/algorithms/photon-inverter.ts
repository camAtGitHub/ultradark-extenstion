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
import { ensureStyleTag } from "../style-template";

const DARK_THEME_SNIPPET_ID = "dark-theme-snippet";
const DATA_FIX_ATTR = "data-photon-fix";

/**
 * HELPER: The "Bookmarklet" Logic (The Missing Piece)
 * 
 * The bookmarklet works because it loops through every element
 * and if it's transparent, forces it to WHITE.
 * When we apply invert(1), that White becomes BLACK.
 */
function fixTransparentBackgrounds() {
  const elements = document.querySelectorAll("body *");
  let fixedCount = 0;
  
  elements.forEach((node) => {
    const el = node as HTMLElement;
    
    if (el.hasAttribute(DATA_FIX_ATTR)) return;
    if (el.tagName === 'IMG' || el.tagName === 'VIDEO' || el.tagName === 'CANVAS' || 
        el.tagName === 'SVG' || el.tagName === 'PICTURE' || el.tagName === 'IFRAME') return;
    
    const bg = window.getComputedStyle(el).backgroundColor;
    
    if (bg === 'transparent' || 
        bg === 'rgba(0, 0, 0, 0)' || 
        (bg.includes('rgba') && bg.endsWith(', 0)'))) {
      
      el.style.backgroundColor = '#ffffff';
      el.setAttribute(DATA_FIX_ATTR, 'true');
      fixedCount++;
    }
  });
  
  debugSync(`[Photon Inverter] Fixed ${fixedCount} transparent backgrounds (JS Fallback)`);
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
