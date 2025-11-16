// src/content/algorithms/surgeon.ts

/**
 * Algorithm B: The Surgeon's Method (Imperative & DOM-Traversing)
 * 
 * This approach directly manipulates element styles via DOM traversal.
 * More intensive but works in environments where CSS control is limited.
 */

import type { Settings } from "../../types/settings";

/**
 * Color conversion utilities
 */
interface RGB {
  r: number;
  g: number;
  b: number;
}

interface HSL {
  h: number;
  s: number;
  l: number;
}

function rgbToHsl(r: number, g: number, b: number): HSL {
  r /= 255;
  g /= 255;
  b /= 255;
  
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let h = 0, s = 0;
  const l = (max + min) / 2;

  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    
    switch (max) {
      case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break;
      case g: h = ((b - r) / d + 2) / 6; break;
      case b: h = ((r - g) / d + 4) / 6; break;
    }
  }

  return { h: h * 360, s: s * 100, l: l * 100 };
}

function hslToRgb(h: number, s: number, l: number): RGB {
  h /= 360;
  s /= 100;
  l /= 100;

  let r, g, b;

  if (s === 0) {
    r = g = b = l;
  } else {
    const hue2rgb = (p: number, q: number, t: number) => {
      if (t < 0) t += 1;
      if (t > 1) t -= 1;
      if (t < 1/6) return p + (q - p) * 6 * t;
      if (t < 1/2) return q;
      if (t < 2/3) return p + (q - p) * (2/3 - t) * 6;
      return p;
    };

    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    
    r = hue2rgb(p, q, h + 1/3);
    g = hue2rgb(p, q, h);
    b = hue2rgb(p, q, h - 1/3);
  }

  return {
    r: Math.round(r * 255),
    g: Math.round(g * 255),
    b: Math.round(b * 255)
  };
}

function parseRgb(colorStr: string): RGB | null {
  const rgbMatch = colorStr.match(/rgba?\s*\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/);
  if (rgbMatch) {
    return {
      r: parseInt(rgbMatch[1], 10),
      g: parseInt(rgbMatch[2], 10),
      b: parseInt(rgbMatch[3], 10)
    };
  }
  return null;
}

/**
 * Invert a color from light to dark or vice versa
 */
function invertColor(rgb: RGB, brightnessAdjust: number, contrastAdjust: number): string {
  const hsl = rgbToHsl(rgb.r, rgb.g, rgb.b);
  
  // Invert luminance
  hsl.l = 100 - hsl.l;
  
  // Apply brightness adjustment (0-100 maps to 0.5-1.5x)
  const brightnessFactor = (brightnessAdjust / 100);
  hsl.l = Math.max(0, Math.min(100, hsl.l * brightnessFactor));
  
  // Apply contrast (boost or reduce saturation)
  const contrastFactor = (contrastAdjust / 100);
  hsl.s = Math.max(0, Math.min(100, hsl.s * contrastFactor));
  
  const newRgb = hslToRgb(hsl.h, hsl.s, hsl.l);
  return `rgb(${newRgb.r}, ${newRgb.g}, ${newRgb.b})`;
}

/**
 * Color cache to avoid recalculating the same colors
 */
const colorCache = new Map<string, string>();

/**
 * Get inverted color from cache or calculate it
 */
function getInvertedColor(colorStr: string, brightness: number, contrast: number): string {
  const cacheKey = `${colorStr}-${brightness}-${contrast}`;
  
  if (colorCache.has(cacheKey)) {
    return colorCache.get(cacheKey)!;
  }
  
  const rgb = parseRgb(colorStr);
  if (!rgb) return colorStr;
  
  const inverted = invertColor(rgb, brightness, contrast);
  colorCache.set(cacheKey, inverted);
  
  return inverted;
}

/**
 * Check if an element is likely an icon/logo (heuristic)
 */
function isLikelyIcon(img: HTMLImageElement): boolean {
  // Small images are likely icons
  if (img.width <= 64 && img.height <= 64) return true;
  
  // Check for icon-related classes or attributes
  const iconPatterns = /icon|logo|avatar|thumbnail/i;
  if (iconPatterns.test(img.className)) return true;
  if (iconPatterns.test(img.alt)) return true;
  
  return false;
}

/**
 * Apply the Surgeon's Method to traverse and modify the DOM
 */
export function applySurgeonMethod(settings: Settings): void {
  const brightness = settings.brightness;
  const contrast = settings.contrast;
  
  // Traverse all elements
  const elements = document.querySelectorAll('*');
  
  elements.forEach((element) => {
    if (!(element instanceof HTMLElement)) return;
    
    const computed = getComputedStyle(element);
    
    // Process background color
    const bgColor = computed.backgroundColor;
    if (bgColor && bgColor !== 'rgba(0, 0, 0, 0)' && bgColor !== 'transparent') {
      const inverted = getInvertedColor(bgColor, brightness, contrast);
      element.style.backgroundColor = inverted;
    }
    
    // Process text color
    const textColor = computed.color;
    if (textColor) {
      const inverted = getInvertedColor(textColor, brightness, contrast);
      element.style.color = inverted;
    }
    
    // Process border colors
    const borderColor = computed.borderColor;
    if (borderColor && borderColor !== 'rgba(0, 0, 0, 0)') {
      const inverted = getInvertedColor(borderColor, brightness, contrast);
      element.style.borderColor = inverted;
    }
    
    // Handle images
    if (element instanceof HTMLImageElement) {
      if (isLikelyIcon(element)) {
        element.style.filter = 'invert(1)';
      }
    }
  });
  
  // Set body and html backgrounds
  document.body.style.backgroundColor = settings.amoled ? '#000000' : '#1a1a1a';
  document.body.style.color = '#e0e0e0';
  document.documentElement.style.backgroundColor = settings.amoled ? '#000000' : '#1a1a1a';
  document.documentElement.setAttribute("data-udr-mode", "surgeon");
}
