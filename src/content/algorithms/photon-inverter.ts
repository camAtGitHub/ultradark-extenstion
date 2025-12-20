// src/content/algorithms/photon-inverter.ts

/**
 * Algorithm 1: "Photon Inverter" (High Performance / CSS Filters)
 * 
 * Strategy: Double Flip method - invert(100%) + hue-rotate(180deg) for color correction
 * Complexity: O(1) (Browser Render Engine handles complexity)
 * Use Case: Low-power devices, huge legacy static HTML pages, rapid prototyping
 * 
 * Based on the dark-theme-snippet bookmarklet approach
 */

import type { Settings } from "../../types/settings";
import { STYLE_TAG_ID } from "../../utils/defaults";
import { debugSync } from "../../utils/logger";
import { ensureStyleTag } from "../style-template";

const DARK_THEME_SNIPPET_ID = "dark-theme-snippet";

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

  // AMOLED mode: force pure black backgrounds
  const amoledCss = settings.amoled
    ? `
html, body, body *:not(img):not(video):not(canvas):not(svg):not([data-udr-skip]) {
  background-color: #000 !important;
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
