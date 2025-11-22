// src/content/algorithms/dom-walker.ts

/**
 * Algorithm 2: "DOM Walker" (Intermediate / Style Parsing)
 * 
 * Strategy: Recursive DOM Traversal & Computed Style Replacement
 * Complexity: O(n) where n is DOM nodes
 * Use Case: Standard websites, blogs, documentation where readability is key
 */

import type { Settings } from "../../types/settings";
import { debugSync } from "../../utils/logger";

const processedElements = new Set<HTMLElement>();
let mutationObserver: MutationObserver | null = null;

/**
 * Color conversion utilities
 */
interface RGB {
  r: number;
  g: number;
  b: number;
}

interface HSL {
  h: number; // 0-360
  s: number; // 0-100
  l: number; // 0-100
}

/**
 * Convert RGB to HSL
 */
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

/**
 * Convert HSL to RGB
 */
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

/**
 * Parse RGB color string to RGB object
 */
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
 * Check if color is transparent
 */
function isTransparent(colorStr: string): boolean {
  return colorStr === 'rgba(0, 0, 0, 0)' || colorStr === 'transparent';
}

/**
 * Invert lightness of a color while preserving hue and saturation
 * Backgrounds: If L > 50%, invert
 * Foregrounds: If L < 50%, invert
 */
function invertLightness(rgb: RGB, isBackground: boolean): string {
  const hsl = rgbToHsl(rgb.r, rgb.g, rgb.b);
  
  // Invert lightness based on whether it's background or foreground
  if (isBackground && hsl.l > 50) {
    hsl.l = 100 - hsl.l;
  } else if (!isBackground && hsl.l < 50) {
    hsl.l = 100 - hsl.l;
  }
  
  const newRgb = hslToRgb(hsl.h, hsl.s, hsl.l);
  return `rgb(${newRgb.r}, ${newRgb.g}, ${newRgb.b})`;
}

/**
 * Find nearest opaque parent background color
 */
function findOpaqueParentBg(element: Element): string | null {
  let parent = element.parentElement;
  while (parent) {
    const bg = getComputedStyle(parent).backgroundColor;
    if (!isTransparent(bg)) {
      return bg;
    }
    parent = parent.parentElement;
  }
  return null;
}

/**
 * Process a batch of elements
 */
function processBatch(elements: Element[], startIndex: number, batchSize: number): number {
  const endIndex = Math.min(startIndex + batchSize, elements.length);
  let processed = 0;

  for (let i = startIndex; i < endIndex; i++) {
    const element = elements[i];

    // Skip if already processed
    if (!(element instanceof HTMLElement)) continue;
    if (processedElements.has(element)) continue;
    
    const computed = getComputedStyle(element);
    
    // Process background color
    const bgColor = computed.backgroundColor;
    if (bgColor && !isTransparent(bgColor)) {
      const rgb = parseRgb(bgColor);
      if (rgb) {
        const inverted = invertLightness(rgb, true);
        element.style.backgroundColor = inverted;
      }
    } else if (isTransparent(bgColor)) {
      // For transparent backgrounds, check parent
      const parentBg = findOpaqueParentBg(element);
      if (parentBg) {
        const rgb = parseRgb(parentBg);
        if (rgb) {
          const inverted = invertLightness(rgb, true);
          element.style.backgroundColor = inverted;
        }
      }
    }
    
    // Process text color
    const textColor = computed.color;
    if (textColor) {
      const rgb = parseRgb(textColor);
      if (rgb) {
        const inverted = invertLightness(rgb, false);
        element.style.color = inverted;
      }
    }
    
    // Process border colors
    const borderColor = computed.borderColor;
    if (borderColor && !isTransparent(borderColor)) {
      const rgb = parseRgb(borderColor);
      if (rgb) {
        const inverted = invertLightness(rgb, false);
        element.style.borderColor = inverted;
      }
    }
    
    processedElements.add(element);
    processed++;
  }

  return processed;
}

export function resetDomWalker(): void {
  processedElements.forEach((el) => {
    el.style.backgroundColor = "";
    el.style.color = "";
    el.style.borderColor = "";
  });
  processedElements.clear();

  if (mutationObserver) {
    mutationObserver.disconnect();
    mutationObserver = null;
  }
}

/**
 * Apply the DOM Walker algorithm to the page
 */
export function applyDomWalker(_settings: Settings): void {
  debugSync('[DOM Walker] Starting DOM traversal');

  resetDomWalker();

  // Use TreeWalker for efficient DOM traversal
  const walker = document.createTreeWalker(
    document.body,
    NodeFilter.SHOW_ELEMENT,
    null
  );
  
  const elements: Element[] = [];
  let node: Node | null = walker.currentNode;
  
  // Collect all elements
  while (node) {
    if (node instanceof Element) {
      elements.push(node);
    }
    node = walker.nextNode();
  }
  
  debugSync('[DOM Walker] Found', elements.length, 'elements to process');
  
  const BATCH_SIZE = 500; // Process 500 nodes at a time
  let currentIndex = 0;
  
  // Process in batches using requestAnimationFrame
  function processNextBatch() {
    const processed = processBatch(elements, currentIndex, BATCH_SIZE);
    currentIndex += BATCH_SIZE;

    debugSync('[DOM Walker] Processed batch:', processed, 'elements. Total processed:', processedElements.size, '/', elements.length);
    
    if (currentIndex < elements.length) {
      requestAnimationFrame(processNextBatch);
    } else {
      debugSync('[DOM Walker] DOM traversal complete');
      
      // Set up MutationObserver for dynamic content
      if (mutationObserver) {
        mutationObserver.disconnect();
      }

      mutationObserver = new MutationObserver((mutations) => {
        const newElements: Element[] = [];
        
        mutations.forEach((mutation) => {
          mutation.addedNodes.forEach((node) => {
            if (node instanceof Element) {
              // Add the element and its descendants
              newElements.push(node);
              const descendants = node.querySelectorAll('*');
              newElements.push(...Array.from(descendants));
            }
          });
        });
        
        if (newElements.length > 0) {
          debugSync('[DOM Walker] MutationObserver detected', newElements.length, 'new elements');
          processBatch(newElements, 0, newElements.length);
        }
      });

      mutationObserver.observe(document.body, {
        childList: true,
        subtree: true
      });

      debugSync('[DOM Walker] MutationObserver attached to body');
    }
  }
  
  // Start processing
  requestAnimationFrame(processNextBatch);
  
  document.documentElement.setAttribute("data-udr-mode", "dom-walker");
}

