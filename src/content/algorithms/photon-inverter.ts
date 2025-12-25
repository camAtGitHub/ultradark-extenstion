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

// We use this attribute to track elements we've forced to white
const DATA_FIX_ATTR = "data-photon-fix";

/**
 * HELPER: The "Bookmarklet" Logic (The Missing Piece)
 * 
 * The bookmarklet works because it loops through every element
 * and if it's transparent, forces it to WHITE.
 * When we apply invert(1), that White becomes BLACK.
 */
function fixTransparentBackgrounds() {
  // 1. Get every element in the body
  const elements = document.querySelectorAll("body *");
  
  let fixedCount = 0;
  
  elements.forEach((node) => {
    const el = node as HTMLElement;
    
    // Optimization: Skip if we already touched it or if it's media
    if (el.hasAttribute(DATA_FIX_ATTR)) return;
    if (el.tagName === 'IMG' || el.tagName === 'VIDEO' || el.tagName === 'CANVAS' || 
        el.tagName === 'SVG' || el.tagName === 'PICTURE' || el.tagName === 'IFRAME') return;
    
    // 2. Check computed background
    const bg = window.getComputedStyle(el).backgroundColor;
    
    // 3. If transparent or rgba with alpha=0, force to white
    if (bg === 'transparent' || 
        bg === 'rgba(0, 0, 0, 0)' || 
        (bg.includes('rgba') && bg.endsWith(', 0)'))) {
      
      el.style.backgroundColor = '#ffffff';
      el.setAttribute(DATA_FIX_ATTR, 'true');
      fixedCount++;
    }
  });
  
  debugSync(`[Photon Inverter] Fixed ${fixedCount} transparent backgrounds`);
}

/**
 * Generate CSS using the Bookmarklet's superior filter logic.
 * 
 * CORE DIFFERENCE:
 * We use the "Double Flip" method from the bookmarklet:
 * 1. invert(1) -> turns white to black (good) but makes colors weird (blue -> orange).
 * 2. hue-rotate(180deg) -> flips the colors back (orange -> blue).
 */
export function generatePhotonInverterCSS(settings: Settings): string {
  // Calculate hue rotation:
  // Baseline is 180deg (from bookmarklet).
  // We add the user's 'blueShift' slider on top of that.
  const baseHue = 180;
  const userHue = Math.round((settings.blueShift / 100) * 180);
  const totalHue = baseHue + userHue;

  // We respect the sliders by adding them into the filter chain
  const filters = [
    `invert(100%)`,                  // The base dark mode
    `hue-rotate(${totalHue}deg)`,    // The color correction
    settings.grayscale ? `grayscale(${settings.grayscale}%)` : '',
    settings.sepia ? `sepia(${settings.sepia}%)` : '',
    settings.contrast !== 100 ? `contrast(${settings.contrast}%)` : '',
    settings.brightness !== 100 ? `brightness(${settings.brightness}%)` : ''
  ].filter(Boolean).join(" ");

  // AMOLED mode: CRITICAL FIX
  // We must set backgrounds to WHITE (not black) because the filter will invert them
  const amoledCss = settings.amoled
    ? `
/* AMOLED: Force white backgrounds (which become black when inverted) */
html, body, body *:not(img):not(video):not(canvas):not(svg):not([data-udr-skip]) {
  background-color: #ffffff !important;
  background-image: none !important;
}`
    : "";

  return `
    /* Force the document canvas to be white so it inverts to black */
    html {
      background-color: #ffffff !important;
      filter: ${filters} !important;
      min-height: 100vh;
    }

    /* 
     * MEDIA RE-INVERSION
     * Images/Videos are already inverted by the html filter.
     * We re-invert them to restore their original colors.
     */
    img, video, picture, canvas, iframe, svg, [style*="background-image"] {
      filter: invert(100%) hue-rotate(180deg) !important;
    }

    ${amoledCss}
  `;
}

/**
 * Apply the Photon Inverter algorithm to the page
 * Uses the complete bookmarklet approach with DOM fixes
 */
export function applyPhotonInverter(settings: Settings): void {
  debugSync('[Photon Inverter] Applying dark theme with bookmarklet logic (DOM + CSS)');

  // STEP 1: Apply the CSS filter
  const css = generatePhotonInverterCSS(settings);
  const styleTag = ensureStyleTag();
  styleTag.textContent = css;

  // STEP 2: Fix transparent backgrounds (the "magic" from the bookmarklet)
  // This is what makes it actually work correctly
  fixTransparentBackgrounds();

  document.documentElement.setAttribute("data-udr-mode", "photon-inverter");
  debugSync('[Photon Inverter] CSS and DOM fixes applied successfully');
}

/**
 * Remove the Photon Inverter styles and DOM modifications
 * Called when toggling off or switching modes
 */
export function removePhotonInverter(): void {
  debugSync('[Photon Inverter] Removing dark theme snippet and DOM fixes');

  // Remove CSS
  const legacyTag = document.getElementById(DARK_THEME_SNIPPET_ID);
  if (legacyTag?.parentNode) {
    legacyTag.parentNode.removeChild(legacyTag);
    debugSync('[Photon Inverter] Removed <style id="dark-theme-snippet">');
  }

  const styleTag = document.getElementById(STYLE_TAG_ID);
  if (styleTag?.parentNode) {
    styleTag.parentNode.removeChild(styleTag);
    debugSync('[Photon Inverter] Removed <style id="udr-style">');
  }

  // Remove DOM fixes - restore original backgrounds
  const fixedElements = document.querySelectorAll(`[${DATA_FIX_ATTR}]`);
  fixedElements.forEach((el) => {
    (el as HTMLElement).style.backgroundColor = '';
    el.removeAttribute(DATA_FIX_ATTR);
  });
  
  debugSync(`[Photon Inverter] Cleaned up ${fixedElements.length} DOM fixes`);
}
