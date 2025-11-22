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
import { STYLE_TAG_ID } from "../../utils/defaults";
import { debugSync } from "../../utils/logger";
import { buildCss, ensureStyleTag } from "../style-template";

const DARK_THEME_SNIPPET_ID = "dark-theme-snippet";

function hueRotateFromBlueShift(blueShift: number): number {
  return Math.round((blueShift / 100) * 180);
}

/**
 * Generate CSS for the new Photon Inverter algorithm
 * Uses simple invert(100%) on :root with image/video re-inversion
 */
export function generatePhotonInverterCSS(settings: Settings): string {
  return buildCss({
    brightness: settings.brightness,
    contrast: settings.contrast,
    sepia: settings.sepia,
    grayscale: settings.grayscale,
    hueRotateDeg: hueRotateFromBlueShift(settings.blueShift),
    amoled: settings.amoled,
    invert: true
  });
}

/**
 * Apply the Photon Inverter algorithm to the page
 * Uses the dark-theme-snippet approach
 */
export function applyPhotonInverter(settings: Settings): void {
  debugSync('[Photon Inverter] Applying dark theme with new CSS inversion logic');

  const css = generatePhotonInverterCSS(settings);

  const styleTag = ensureStyleTag();
  styleTag.textContent = css;

  document.documentElement.setAttribute("data-udr-mode", "photon-inverter");
  debugSync('[Photon Inverter] CSS applied successfully');
}

/**
 * Remove the Photon Inverter styles
 * Called when toggling off or switching modes
 */
export function removePhotonInverter(): void {
  debugSync('[Photon Inverter] Removing dark theme snippet');

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
}
