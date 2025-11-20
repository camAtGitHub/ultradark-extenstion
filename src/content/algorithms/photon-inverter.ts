// src/content/algorithms/photon-inverter.ts

/**
 * Algorithm 1: "Photon Inverter" (High Performance / CSS Filters)
 * 
 * Strategy: Simple CSS inversion with image/video re-inversion
 * Complexity: O(1) (Browser Render Engine handles complexity)
 * Use Case: Low-power devices, huge legacy static HTML pages, rapid prototyping
 * 
 * Based on the dark-theme-snippet bookmarklet approach
 */

import type { Settings } from "../../types/settings";
import { debugSync } from "../../utils/logger";

const DARK_THEME_SNIPPET_ID = "dark-theme-snippet";

/**
 * Generate CSS for the new Photon Inverter algorithm
 * Uses simple invert(100%) on :root with image/video re-inversion
 */
export function generatePhotonInverterCSS(_settings: Settings): string {
  // Simple CSS inversion approach from the bookmarklet
  // Note: settings like brightness/contrast are not used in this simplified version
  // to match the bookmarklet behavior
  return `
:root {
  background-color: #fefefe;
  filter: invert(100%);
}

* {
  background-color: inherit;
}

img:not([src*=".svg"]), video {
  filter: invert(100%);
}
  `.trim();
}

/**
 * Apply the Photon Inverter algorithm to the page
 * Uses the dark-theme-snippet approach
 */
export function applyPhotonInverter(settings: Settings): void {
  debugSync('[Photon Inverter] Applying dark theme with new CSS inversion logic');
  
  const css = generatePhotonInverterCSS(settings);

  let styleTag = document.getElementById(DARK_THEME_SNIPPET_ID) as HTMLStyleElement;
  if (!styleTag) {
    styleTag = document.createElement("style");
    styleTag.type = "text/css";
    styleTag.id = DARK_THEME_SNIPPET_ID;
    
    const head = document.head || document.querySelector('head');
    if (head) {
      head.appendChild(styleTag);
      debugSync('[Photon Inverter] Created new <style> tag with id="dark-theme-snippet"');
    } else {
      debugSync('[Photon Inverter] ⚠️ No <head> element found, cannot inject styles');
      return;
    }
  } else {
    debugSync('[Photon Inverter] Updating existing <style> tag');
  }
  
  // Set CSS content
  if (styleTag.styleSheet) {
    // IE support (legacy)
    (styleTag.styleSheet as { cssText: string }).cssText = css;
  } else {
    styleTag.textContent = css;
  }
  
  document.documentElement.setAttribute("data-udr-mode", "photon-inverter");
  debugSync('[Photon Inverter] CSS applied successfully');
}

/**
 * Remove the Photon Inverter styles
 * Called when toggling off or switching modes
 */
export function removePhotonInverter(): void {
  debugSync('[Photon Inverter] Removing dark theme snippet');
  
  const styleTag = document.getElementById(DARK_THEME_SNIPPET_ID);
  if (styleTag?.parentNode) {
    styleTag.parentNode.removeChild(styleTag);
    debugSync('[Photon Inverter] Removed <style id="dark-theme-snippet">');
  }
}
