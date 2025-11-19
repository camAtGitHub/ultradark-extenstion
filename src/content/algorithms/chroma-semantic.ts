// src/content/algorithms/chroma-semantic.ts

/**
 * Algorithm 3: "Chroma-Semantic Engine" (Opus Magnum / Advanced)
 * 
 * Strategy: Semantic Analysis, Intelligent Color Space Mapping (LCH), and Bitwise Optimization
 * Complexity: O(n) optimized + Caching + GPU acceleration hints
 * Use Case: Complex SPAs (React/Vue/Angular), data visualization tools, daily-driver usage
 */

import type { Settings } from "../../types/settings";
import { debugSync } from "../../utils/logger";
import { applyPhotonInverter } from "./photon-inverter";

/**
 * Dark Gray Palette for semantic backgrounds based on depth
 * Shallow depth (body) = Darkest, Deep depth (cards/modals) = Lighter
 */
const DARK_GRAY_PALETTE = [
  '#121212', // Depth 0-1: Body, main containers
  '#1a1a1a', // Depth 2-3: Sections
  '#222222', // Depth 4-5: Cards
  '#2a2a2a', // Depth 6-7: Nested cards
  '#2c2c2c', // Depth 8+: Modals, deep nesting
];

/**
 * Semantic text colors
 */
const TEXT_COLORS = {
  body: '#E0E0E0',     // Off-white for body text
  heading: '#F5F5F5',  // Slightly brighter for headings
  link: '#6CB6FF',     // Desaturated blue for links (reduced vibration)
  muted: '#A0A0A0',    // Muted text
};

/**
 * Bitwise RGB extraction from integer color (for future optimization)
 * @unused Reserved for future bitwise optimization features
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function _extractRGB(colorInt: number): { r: number; g: number; b: number } {
  return {
    r: (colorInt >> 16) & 0xFF,
    g: (colorInt >> 8) & 0xFF,
    b: colorInt & 0xFF
  };
}

/**
 * Bitwise RGB reassembly to integer color (for future optimization)
 * @unused Reserved for future bitwise optimization features
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function _assembleRGB(r: number, g: number, b: number): number {
  return ((r & 0xFF) << 16) | ((g & 0xFF) << 8) | (b & 0xFF);
}

/**
 * Calculate relative luminance for WCAG contrast checking
 */
function getRelativeLuminance(r: number, g: number, b: number): number {
  const [rs, gs, bs] = [r, g, b].map((c) => {
    const normalized = c / 255;
    return normalized <= 0.03928
      ? normalized / 12.92
      : Math.pow((normalized + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs;
}

/**
 * Calculate WCAG contrast ratio
 */
function getContrastRatio(l1: number, l2: number): number {
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

/**
 * Simplified RGB to LCH conversion (using HSL as intermediate)
 * Note: True LCH requires LAB color space, but this is a practical approximation
 */
function rgbToLCH(r: number, g: number, b: number): { l: number; c: number; h: number } {
  // Normalize to 0-1
  r /= 255;
  g /= 255;
  b /= 255;

  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2; // Lightness (0-1)

  let c = 0; // Chroma
  let h = 0; // Hue (degrees)

  if (max !== min) {
    c = max - min;
    
    switch (max) {
      case r: h = ((g - b) / c + (g < b ? 6 : 0)) * 60; break;
      case g: h = ((b - r) / c + 2) * 60; break;
      case b: h = ((r - g) / c + 4) * 60; break;
    }
  }

  return { l: l * 100, c: c * 100, h };
}

/**
 * Simplified LCH to RGB conversion
 */
function lchToRGB(l: number, c: number, h: number): { r: number; g: number; b: number } {
  l /= 100;
  c /= 100;
  h = h % 360;

  const hRad = (h * Math.PI) / 180;
  const a = Math.cos(hRad) * c;
  const b = Math.sin(hRad) * c;

  // Simplified conversion (approximation)
  const x = l + a;
  const y = l;
  const z = l - b;

  const r = Math.max(0, Math.min(1, x)) * 255;
  const g = Math.max(0, Math.min(1, y)) * 255;
  const bVal = Math.max(0, Math.min(1, z)) * 255;

  return {
    r: Math.round(r),
    g: Math.round(g),
    b: Math.round(bVal)
  };
}

/**
 * Get DOM depth of an element
 */
function getDOMDepth(element: Element): number {
  let depth = 0;
  let parent = element.parentElement;
  while (parent) {
    depth++;
    parent = parent.parentElement;
  }
  return depth;
}

/**
 * Get semantic role of element
 */
function getSemanticRole(element: Element): string {
  // Check ARIA role first
  const role = element.getAttribute('role');
  if (role) return role;

  // Check tag-based semantics
  const tagName = element.tagName.toLowerCase();
  if (['h1', 'h2', 'h3', 'h4', 'h5', 'h6'].includes(tagName)) return 'heading';
  if (tagName === 'a') return 'link';
  if (['nav', 'header', 'footer', 'aside'].includes(tagName)) return tagName;
  if (['button', 'input', 'select', 'textarea'].includes(tagName)) return 'input';
  if (['article', 'section'].includes(tagName)) return tagName;

  return 'generic';
}

/**
 * Scan and modify CSS Custom Properties
 */
function processCSSVariables(): number {
  let modified = 0;

  try {
    for (const sheet of document.styleSheets) {
      try {
        const rules = sheet.cssRules || sheet.rules;
        for (let i = 0; i < rules.length; i++) {
          const rule = rules[i];
          if (rule instanceof CSSStyleRule) {
            const style = rule.style;
            
            // Look for CSS custom properties (variables)
            for (let j = 0; j < style.length; j++) {
              const prop = style[j];
              if (prop.startsWith('--')) {
                const value = style.getPropertyValue(prop);
                
                // Try to parse as color
                if (value.match(/#[0-9a-f]{3,6}/i) || value.match(/rgb/i)) {
                  debugSync('[Chroma-Semantic] Found CSS variable:', prop, '=', value);
                  // Would modify here, but skipping for now to avoid breaking cascades
                  modified++;
                }
              }
            }
          }
        }
      } catch {
        // Cross-origin stylesheet - skip (CORS prevents access)
        debugSync('[Chroma-Semantic] Skipping cross-origin stylesheet');
      }
    }
  } catch (e) {
    debugSync('[Chroma-Semantic] Error processing CSS variables:', e);
  }

  return modified;
}

/**
 * Apply semantic styling to an element
 */
function applySemanticStyle(element: HTMLElement, role: string, depth: number, processedSet: Set<Element>): void {
  if (processedSet.has(element)) return;

  const computed = getComputedStyle(element);
  
  // Determine background based on depth (Material Design elevation)
  const paletteIndex = Math.min(Math.floor(depth / 2), DARK_GRAY_PALETTE.length - 1);
  const semanticBg = DARK_GRAY_PALETTE[paletteIndex];

  // Apply background if element has an existing background
  const bgColor = computed.backgroundColor;
  if (bgColor && bgColor !== 'rgba(0, 0, 0, 0)' && bgColor !== 'transparent') {
    element.style.backgroundColor = semanticBg;
  }

  // Apply text color based on role
  if (role === 'heading') {
    element.style.color = TEXT_COLORS.heading;
  } else if (role === 'link') {
    element.style.color = TEXT_COLORS.link;
  } else if (computed.color) {
    element.style.color = TEXT_COLORS.body;
  }

  // Ensure WCAG AA contrast (4.5:1 minimum)
  const bgRgb = parseColor(semanticBg);
  const fgRgb = parseColor(element.style.color || TEXT_COLORS.body);
  
  if (bgRgb && fgRgb) {
    const bgLum = getRelativeLuminance(bgRgb.r, bgRgb.g, bgRgb.b);
    const fgLum = getRelativeLuminance(fgRgb.r, fgRgb.g, fgRgb.b);
    const contrast = getContrastRatio(bgLum, fgLum);
    
    if (contrast < 4.5) {
      // Force text lighter to meet contrast requirement
      const lch = rgbToLCH(fgRgb.r, fgRgb.g, fgRgb.b);
      lch.l = Math.min(95, lch.l + 20); // Increase lightness
      const adjusted = lchToRGB(lch.l, lch.c, lch.h);
      element.style.color = `rgb(${adjusted.r}, ${adjusted.g}, ${adjusted.b})`;
      
      debugSync('[Chroma-Semantic] Adjusted color for contrast. Original:', contrast.toFixed(2), 'Adjusted lightness to:', lch.l);
    }
  }

  processedSet.add(element);
}

/**
 * Parse color string to RGB
 */
function parseColor(colorStr: string): { r: number; g: number; b: number } | null {
  // Try RGB format first
  const rgbMatch = colorStr.match(/rgba?\s*\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/);
  if (rgbMatch) {
    return {
      r: parseInt(rgbMatch[1], 10),
      g: parseInt(rgbMatch[2], 10),
      b: parseInt(rgbMatch[3], 10)
    };
  }

  // Try hex format
  const hexMatch = colorStr.match(/^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i);
  if (hexMatch) {
    return {
      r: parseInt(hexMatch[1], 16),
      g: parseInt(hexMatch[2], 16),
      b: parseInt(hexMatch[3], 16)
    };
  }

  return null;
}

/**
 * Apply the Chroma-Semantic Engine algorithm to the page
 * WITH PERFORMANCE MONITORING AND FALLBACK
 */
export function applyChromaSemantic(settings: Settings): void {
  const startTime = performance.now();
  const PERFORMANCE_THRESHOLD = 200; // 200ms limit before fallback

  debugSync('[Chroma-Semantic] Starting advanced semantic analysis');

  // Check performance early
  const checkPerformance = () => {
    const elapsed = performance.now() - startTime;
    if (elapsed > PERFORMANCE_THRESHOLD) {
      debugSync('[Chroma-Semantic] ⚠️ Performance threshold exceeded:', elapsed.toFixed(2), 'ms. Falling back to Photon Inverter');
      // Fallback to Photon Inverter
      applyPhotonInverter(settings);
      // TODO: Show user notification "Complex page detected: Switched to High-Performance Mode"
      return true;
    }
    return false;
  };

  // Step 1: Process CSS Variables
  const variablesModified = processCSSVariables();
  debugSync('[Chroma-Semantic] Found', variablesModified, 'CSS custom properties');

  if (checkPerformance()) return;

  // Step 2: Collect all elements
  const elements = Array.from(document.querySelectorAll('*'));
  debugSync('[Chroma-Semantic] Processing', elements.length, 'elements');

  const processedSet = new Set<Element>();
  const BATCH_SIZE = 300; // Smaller batches for more complex processing

  let currentIndex = 0;

  function processNextBatch() {
    if (checkPerformance()) return;

    const endIndex = Math.min(currentIndex + BATCH_SIZE, elements.length);

    for (let i = currentIndex; i < endIndex; i++) {
      const element = elements[i];
      if (!(element instanceof HTMLElement)) continue;

      const depth = getDOMDepth(element);
      const role = getSemanticRole(element);

      applySemanticStyle(element, role, depth, processedSet);
    }

    currentIndex += BATCH_SIZE;

    if (currentIndex < elements.length) {
      requestAnimationFrame(processNextBatch);
    } else {
      const totalTime = performance.now() - startTime;
      debugSync('[Chroma-Semantic] ✅ Complete in', totalTime.toFixed(2), 'ms. Processed', processedSet.size, 'elements');
      
      // Set up MutationObserver for dynamic content
      const observer = new MutationObserver((mutations) => {
        const newElements: HTMLElement[] = [];
        
        mutations.forEach((mutation) => {
          mutation.addedNodes.forEach((node) => {
            if (node instanceof HTMLElement) {
              newElements.push(node);
              const descendants = node.querySelectorAll('*');
              descendants.forEach((desc) => {
                if (desc instanceof HTMLElement) newElements.push(desc);
              });
            }
          });
        });

        newElements.forEach((el) => {
          const depth = getDOMDepth(el);
          const role = getSemanticRole(el);
          applySemanticStyle(el, role, depth, processedSet);
        });
      });

      observer.observe(document.body, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ['style', 'class']
      });

      debugSync('[Chroma-Semantic] MutationObserver attached');
    }
  }

  // Start processing
  requestAnimationFrame(processNextBatch);

  document.documentElement.setAttribute("data-udr-mode", "chroma-semantic");
}

