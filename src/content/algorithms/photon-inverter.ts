// src/content/algorithms/photon-inverter.ts

/**
 * Algorithm 1: "Photon Inverter" (High Performance / CSS Filters)
 * 
 * Strategy: Global CSS Filter Injection
 * Complexity: O(1) (Browser Render Engine handles complexity)
 * Use Case: Low-power devices, huge legacy static HTML pages, rapid prototyping
 */

import type { Settings } from "../../types/settings";
import { debugSync } from "../../utils/logger";

/**
 * Generate CSS for the Photon Inverter algorithm
 * Uses CSS filters: invert(100%) + hue-rotate(180deg)
 */
export function generatePhotonInverterCSS(settings: Settings): string {
  const brightness = settings.brightness / 100; // Convert percentage to decimal
  const contrast = settings.contrast / 100;
  const sepia = settings.sepia / 100;
  const grayscale = settings.grayscale / 100;
  const hueRotateDeg = Math.round((settings.blueShift / 100) * 40); // Scale blue shift to hue rotation

  return `
/* UltraDark Reader - Photon Inverter Algorithm */

html {
  filter: 
    invert(100%) 
    hue-rotate(180deg)
    brightness(${brightness})
    contrast(${contrast})
    sepia(${sepia})
    grayscale(${grayscale})
    hue-rotate(${hueRotateDeg}deg);
}

/* Re-invert images and media to restore natural colors (The "Face Saver") */
img, picture, video, canvas, svg,
[style*="background-image"] {
  filter: 
    invert(100%) 
    hue-rotate(180deg);
}

/* Handle iframes */
iframe {
  filter: 
    invert(100%) 
    hue-rotate(180deg);
}
  `.trim();
}

/**
 * Apply the Photon Inverter algorithm to the page
 */
export function applyPhotonInverter(settings: Settings): void {
  debugSync('[Photon Inverter] Applying dark theme with settings:', {
    brightness: settings.brightness + '%',
    contrast: settings.contrast + '%',
    sepia: settings.sepia + '%',
    grayscale: settings.grayscale + '%',
    blueShift: settings.blueShift + '%',
    amoled: settings.amoled
  });
  
  const css = generatePhotonInverterCSS(settings);

  let styleTag = document.getElementById("udr-style") as HTMLStyleElement;
  if (!styleTag) {
    styleTag = document.createElement("style");
    styleTag.id = "udr-style";
    document.head.appendChild(styleTag);
    debugSync('[Photon Inverter] Created new <style> tag with id="udr-style"');
  } else {
    debugSync('[Photon Inverter] Updating existing <style> tag');
  }
  
  styleTag.textContent = css;
  document.documentElement.setAttribute("data-udr-mode", "photon-inverter");
  debugSync('[Photon Inverter] CSS applied successfully');
}
