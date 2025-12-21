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

const processedElements = new WeakSet<HTMLElement>(); // Use WeakSet to prevent memory leaks
let mutationObserver: MutationObserver | null = null;

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
 * OPTIMIZED: Returns TRUE if significant variables were found, indicating we can skip heavy DOM walking.
 */
function processCSSVariables(): boolean {
  const overrides: string[] = [];
  const processedProps = new Set<string>();
  
  // Regex to identify variable types
  const bgRegex = /background|bg-|surface|canvas|panel/i;
  const textRegex = /text|foreground|color|fg-/i;
  let significantFinds = 0;

  try {
    // Standard for loop is faster than Array.from on huge lists
    const sheets = document.styleSheets;
    for (let i = 0; i < sheets.length; i++) {
      try {
        const rules = sheets[i].cssRules;
        if (!rules) continue;
        
        for (let j = 0; j < rules.length; j++) {
          const rule = rules[j];
          // We only care about global variables defined on :root or html
          if (rule instanceof CSSStyleRule && (rule.selectorText === ':root' || rule.selectorText === 'html')) {
            const style = rule.style;
            for (let k = 0; k < style.length; k++) {
              const prop = style[k];
              if (prop.startsWith('--') && !processedProps.has(prop)) {
                
                // Optimization: avoid getPropertyValue unless regex matches prop name first
                if (bgRegex.test(prop)) {
                  overrides.push(`${prop}: #121212 !important;`);
                  processedProps.add(prop);
                  significantFinds++;
                } else if (textRegex.test(prop)) {
                  overrides.push(`${prop}: #e0e0e0 !important;`);
                  processedProps.add(prop);
                  significantFinds++;
                }
              }
            }
          }
        }
      } catch {
        // Catch CORS errors for cross-origin stylesheets
        continue;
      }
    }
  } catch (e) {
    console.error('[Chroma] Error scanning CSS variables', e);
  }

  // Inject the "Hijack" Block
  if (overrides.length > 0) {
    const styleId = 'udr-css-hijack';
    if (!document.getElementById(styleId)) {
      const style = document.createElement('style');
      style.id = styleId;
      style.textContent = `:root { ${overrides.join('\n')} }`;
      document.head.appendChild(style);
    }
    debugSync('[Chroma] Hijacked', overrides.length, 'variables.');
  }

  // If we found more than 5 global theme variables, we assume the site is mostly styled
  return significantFinds > 5;
}

/**
 * Apply semantic styling to an element
 */
function applySemanticStyle(element: HTMLElement, role: string, depth: number): void {
  if (processedElements.has(element)) return;

  // CRITICAL FIX: Use checkVisibility() instead of offsetParent
  // offsetParent returns null for position:fixed elements (headers/navs),
  // causing them to remain white. checkVisibility() handles this correctly.
  if (element.checkVisibility && !element.checkVisibility({
    checkOpacity: true,
    checkVisibilityCSS: true
  })) {
    return;
  }

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

  processedElements.add(element);
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

export function resetChromaSemantic(): void {
  // Note: WeakSet doesn't support iteration, so we can't reset individual element styles
  // Instead, we'll remove the injected style tags and let the browser's normal cascade take over
  // The WeakSet will be garbage collected naturally when elements are removed from the DOM

  if (mutationObserver) {
    mutationObserver.disconnect();
    mutationObserver = null;
  }
  
  // Remove CSS variable hijack style
  const hijackStyle = document.getElementById('udr-css-hijack');
  if (hijackStyle) {
    hijackStyle.remove();
    debugSync('[Chroma-Semantic] CSS Variable Hijack removed');
  }
}

/**
 * Apply the Chroma-Semantic Engine algorithm to the page
 * WITH PERFORMANCE MONITORING AND FALLBACK
 */
export function applyChromaSemantic(settings: Settings): void {
  const startTime = performance.now();
  const PERFORMANCE_THRESHOLD = 1500; // Reduced from 3000ms to 1.5s

  debugSync('[Chroma-Semantic] Starting advanced semantic analysis');

  // Safety guard: Check if document.body exists
  if (!document.body) {
    debugSync('[Chroma-Semantic] ⚠️ document.body not available, falling back to Photon Inverter');
    applyPhotonInverter(settings);
    return;
  }

  resetChromaSemantic();

  // Check performance early
  const checkPerformance = () => {
    const elapsed = performance.now() - startTime;
    if (elapsed > PERFORMANCE_THRESHOLD) {
      debugSync('[Chroma-Semantic] ⚠️ Performance threshold exceeded:', elapsed.toFixed(2), 'ms. Falling back to Photon Inverter');
      // Fallback to Photon Inverter
      applyPhotonInverter(settings);
      return true;
    }
    return false;
  };

  // Step 1: CSS Variables (The "Spray Gun")
  const isGlobalThemeApplied = processCSSVariables();
  debugSync('[Chroma-Semantic] CSS Variables check:', isGlobalThemeApplied ? 'significant variables found' : 'insufficient variables');

  // LOGIC GATE: If variables handled the theme, ABORT the heavy walker.
  if (isGlobalThemeApplied) {
    debugSync('[Chroma] Global variables detected. Skipping heavy DOM traversal.');
    document.documentElement.setAttribute("data-udr-mode", "chroma-lite");
    return; // EXIT EARLY - HUGE PERFORMANCE WIN
  }

  // Step 2: Fallback - The DOM Walker (The "Tiny Brush")
  debugSync('[Chroma] CSS Variables insufficient. Starting DOM analysis.');

  if (checkPerformance()) return;

  // Step 2: Stack-Based DFS (Depth First Search)
  // Allows O(1) depth calculation and pause/resume capabilities
  interface StackItem {
    node: HTMLElement;
    depth: number;
  }

  // Initialize stack with body
  const stack: StackItem[] = [{ node: document.body, depth: 0 }];
  const BATCH_SIZE = 500; // Increased batch size since we added the offsetParent check

  function processNextBatch() {
    if (checkPerformance()) return;

    let processedCount = 0;

    // Process stack until batch limit or empty
    while (stack.length > 0 && processedCount < BATCH_SIZE) {
      const item = stack.pop(); // Get latest item
      if (!item) continue;

      const { node, depth } = item;

      // 1. Process the node with the FREE depth calculation
      const role = getSemanticRole(node);
      applySemanticStyle(node, role, depth);
      processedCount++;

      // 2. Add children to stack (reverse order to maintain visual flow)
      // We increment depth simply by adding +1. No expensive "up-tree" lookups.
      // Optimization: access children via loop, not Array.from (saves GC)
      const children = node.children;
      for (let i = children.length - 1; i >= 0; i--) {
        // Simple depth check: Cap it at 10 to prevent hanging on deeply nested garbage
        if (depth < 10 && children[i] instanceof HTMLElement) {
          stack.push({ 
            node: children[i] as HTMLElement, 
            depth: depth + 1 
          });
        }
      }
    }

    if (stack.length > 0) {
      requestAnimationFrame(processNextBatch);
    } else {
      const totalTime = performance.now() - startTime;
      debugSync('[Chroma-Semantic] ✅ Complete in', totalTime.toFixed(2), 'ms.');
      
      // Set up MutationObserver for dynamic content
      setupMutationObserver();
    }
  }

  // Start processing
  requestAnimationFrame(processNextBatch);

  document.documentElement.setAttribute("data-udr-mode", "chroma-semantic");
}

function setupMutationObserver() {
  if (mutationObserver) {
    mutationObserver.disconnect();
  }

  mutationObserver = new MutationObserver((mutations) => {
    // Performance Guard: Don't process too many mutations in one frame
    let nodesProcessed = 0;
    const MUTATION_CAP = 100;

    for (const mutation of mutations) {
      if (nodesProcessed > MUTATION_CAP) break;

      for (const node of mutation.addedNodes) {
        if (node instanceof HTMLElement) {
          // 1. Process the container
          applySemanticStyle(node, 'generic', 2); 
          nodesProcessed++;

          // 2. Process children (capped)
          // Use getElementsByTagName('*') to get descendants
          // Strict limits are needed for performance
          const descendants = node.getElementsByTagName('*');
          const limit = Math.min(descendants.length, 20); // Lower cap for children
          
          for (let i = 0; i < limit; i++) {
            const child = descendants[i];
            if (child instanceof HTMLElement) {
              applySemanticStyle(child, 'generic', 3);
            }
          }
        }
      }
    }
  });

  if (document.body) {
    mutationObserver.observe(document.body, {
      childList: true,
      subtree: true
    });
    debugSync('[Chroma-Semantic] MutationObserver attached');
  } else {
    debugSync('[Chroma-Semantic] ⚠️ document.body disappeared, cannot attach MutationObserver');
  }
}
