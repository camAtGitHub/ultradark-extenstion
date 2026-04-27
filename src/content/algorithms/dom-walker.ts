// File: src/content/algorithms/dom-walker.ts

/**
 * Algorithm 2: "DOM Walker" (Intermediate / Style Parsing)
 *
 * Strategy: Recursive DOM Traversal & Computed Style Replacement
 * Complexity: O(n) where n is DOM nodes
 * Use Case: Standard websites, blogs, documentation where readability is key
 */

import type { Settings } from "../../types/settings";
import { debugSync } from "../../utils/logger";
import { applyPhotonInverter } from "./photon-inverter";
import { parseRgbFast, isTransparentFast } from "../../utils/color-utils";

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
  let h = 0,
    s = 0;
  const l = (max + min) / 2;

  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);

    switch (max) {
      case r:
        h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
        break;
      case g:
        h = ((b - r) / d + 2) / 6;
        break;
      case b:
        h = ((r - g) / d + 4) / 6;
        break;
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
      if (t < 1 / 6) return p + (q - p) * 6 * t;
      if (t < 1 / 2) return q;
      if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
      return p;
    };

    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;

    r = hue2rgb(p, q, h + 1 / 3);
    g = hue2rgb(p, q, h);
    b = hue2rgb(p, q, h - 1 / 3);
  }

  return {
    r: Math.round(r * 255),
    g: Math.round(g * 255),
    b: Math.round(b * 255),
  };
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
 * Process a batch of elements
 */
function processBatch(elements: Element[], startIndex: number, batchSize: number): number {
  const endIndex = Math.min(startIndex + batchSize, elements.length);
  let scanned = 0;

  interface StyleRead {
    el: HTMLElement;
    computed: CSSStyleDeclaration;
  }
  interface StyleChange {
    el: HTMLElement;
    bg?: string;
    color?: string;
    borderColor?: string;
  }

  const styleReads: StyleRead[] = [];

  for (let i = startIndex; i < endIndex; i++) {
    const element = elements[i];

    // Skip if already processed
    if (!(element instanceof HTMLElement)) continue;
    if (processedElements.has(element)) continue;
    styleReads.push({ el: element, computed: getComputedStyle(element) });
    scanned++;
  }

  const changes: StyleChange[] = [];

  for (const { el, computed } of styleReads) {
    const change: StyleChange = { el };
    let hasChanges = false;

    // Process background color
    const bgColor = computed.backgroundColor;
    if (bgColor && !isTransparentFast(bgColor)) {
      const rgb = parseRgbFast(bgColor);
      if (rgb) {
        change.bg = invertLightness(rgb, true);
        hasChanges = true;
      }
    }
    // Transparent elements left as-is — overlay divs over images must stay transparent.

    // Process text color
    const textColor = computed.color;
    if (textColor) {
      const rgb = parseRgbFast(textColor);
      if (rgb) {
        change.color = invertLightness(rgb, false);
        hasChanges = true;
      }
    }

    // Process border colors
    const borderColor = computed.borderColor;
    if (borderColor && !isTransparentFast(borderColor)) {
      const rgb = parseRgbFast(borderColor);
      if (rgb) {
        change.borderColor = invertLightness(rgb, false);
        hasChanges = true;
      }
    }

    if (hasChanges) {
      changes.push(change);
    }
    processedElements.add(el);
  }

  for (const change of changes) {
    if (change.bg) change.el.style.backgroundColor = change.bg;
    if (change.color) change.el.style.color = change.color;
    if (change.borderColor) change.el.style.borderColor = change.borderColor;
  }

  return scanned;
}

export function resetDomWalker(): void {
  pruneDetachedElements();
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

  if (mutationDebounceTimer !== null) {
    clearTimeout(mutationDebounceTimer);
    mutationDebounceTimer = null;
  }

  if (scrollHandler) {
    document.removeEventListener("scroll", scrollHandler);
    scrollHandler = null;
  }
  if (inputHandler) {
    document.removeEventListener("input", inputHandler);
    inputHandler = null;
  }
}

/**
 * Apply the DOM Walker algorithm to the page
 */
export function applyDomWalker(settings: Settings): void {
  debugSync("[DOM Walker] Starting DOM traversal");

  // Safety guard: Check if document.body exists
  if (!document.body) {
    debugSync("[DOM Walker] ⚠️ document.body not available, falling back to Photon Inverter");
    applyPhotonInverter(settings);
    return;
  }

  resetDomWalker();

  // Use TreeWalker for efficient DOM traversal
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_ELEMENT, null);

  debugSync("[DOM Walker] Starting Lazy Traversal");

  const BATCH_SIZE = 500;

  /**
   * OPTIMIZATION 9: Batch Style Application
   *
   * Strategy: Separate style reads from writes to minimize reflows
   * - PHASE 1: Read all computed styles (batch reads)
   * - PHASE 2: Calculate new values (no DOM access)
   * - PHASE 3: Apply all style changes in batch (single reflow)
   */
  interface StyleChange {
    el: HTMLElement;
    bg?: string;
    color?: string;
    borderColor?: string;
  }

  // Lazy Streaming Implementation
  function processNextBatch(): void {
    let processedCount = 0;
    let node = walker.currentNode;

    // PHASE 1: Read all computed styles (batch reads)
    const styleReads: Array<{
      node: HTMLElement;
      computed: CSSStyleDeclaration;
    }> = [];

    while (node && processedCount < BATCH_SIZE) {
      if (node instanceof HTMLElement && !processedElements.has(node)) {
        styleReads.push({
          node,
          computed: getComputedStyle(node),
        });
        processedCount++;
      }
      node = walker.nextNode();
    }

    // PHASE 2: Calculate new values (no DOM access)
    const changes: StyleChange[] = [];

    for (const { node, computed } of styleReads) {
      const change: StyleChange = { el: node };
      let hasChanges = false;

      // Background
      const bgColor = computed.backgroundColor;
      if (bgColor && !isTransparentFast(bgColor)) {
        const rgb = parseRgbFast(bgColor);
        if (rgb) {
          change.bg = invertLightness(rgb, true);
          hasChanges = true;
        }
      }
      // Note: transparent elements are intentionally left transparent.
      // Applying an inherited parent colour makes overlay/decorative divs
      // opaque, which covers images sitting beneath them.

      // Text color
      const textColor = computed.color;
      if (textColor) {
        const rgb = parseRgbFast(textColor);
        if (rgb) {
          change.color = invertLightness(rgb, false);
          hasChanges = true;
        }
      }

      // Border
      const borderColor = computed.borderColor;
      if (borderColor && !isTransparentFast(borderColor)) {
        const rgb = parseRgbFast(borderColor);
        if (rgb) {
          change.borderColor = invertLightness(rgb, false);
          hasChanges = true;
        }
      }

      if (hasChanges) {
        changes.push(change);
      }

      processedElements.add(node);
    }

    // PHASE 3: Apply all style changes in batch (single reflow)
    for (const change of changes) {
      if (change.bg) change.el.style.backgroundColor = change.bg;
      if (change.color) change.el.style.color = change.color;
      if (change.borderColor) change.el.style.borderColor = change.borderColor;
    }

    debugSync(
      "[DOM Walker] Processed batch:",
      styleReads.length,
      "elements,",
      changes.length,
      "style changes"
    );

    // Continue if more elements remain
    if (node) {
      requestAnimationFrame(processNextBatch);
    } else {
      debugSync("[DOM Walker] DOM traversal complete");
      setupOptimizedMutationObserver();
    }
  }

  // Start processing
  requestAnimationFrame(processNextBatch);
}

/**
 * OPTIMIZATION 5: Smarter MutationObserver
 *
 * Key changes:
 * 1. Debounce rapid mutations (React reconciliation can trigger 10+ in one frame)
 * 2. Limit descendant depth (most UI components are shallow)
 * 3. Skip processing during user interaction (scroll, input)
 * 4. Use requestIdleCallback for non-urgent processing
 */
let pendingMutations: Element[] = [];
let mutationDebounceTimer: number | null = null;
let isUserInteracting = false;
let scrollHandler: (() => void) | null = null;
let inputHandler: (() => void) | null = null;

/** Maximum number of elements queued in pendingMutations; excess is silently dropped */
const MAX_PENDING_MUTATIONS = 2000;

function pruneDetachedElements(): void {
  for (const el of processedElements) {
    if (!el.isConnected) {
      processedElements.delete(el);
    }
  }
}

function setupOptimizedMutationObserver(): void {
  if (mutationObserver) {
    mutationObserver.disconnect();
  }

  // Register interaction listeners (stored for later removal in resetDomWalker)
  scrollHandler = () => {
    isUserInteracting = true;
    setTimeout(() => {
      isUserInteracting = false;
    }, 150);
  };
  inputHandler = () => {
    isUserInteracting = true;
    setTimeout(() => {
      isUserInteracting = false;
    }, 100);
  };
  document.addEventListener("scroll", scrollHandler, { passive: true });
  document.addEventListener("input", inputHandler, { passive: true });

  mutationObserver = new MutationObserver((mutations) => {
    // Collect new elements with limited descendant depth
    for (const mutation of mutations) {
      for (const node of mutation.addedNodes) {
        if (node instanceof HTMLElement) {
          if (pendingMutations.length >= MAX_PENDING_MUTATIONS) continue;
          pendingMutations.push(node);

          // Limit descendant collection to 2 levels deep (covers most UI patterns)
          const directChildren = node.children;
          for (let i = 0; i < directChildren.length && i < 20; i++) {
            const child = directChildren[i];
            if (child instanceof HTMLElement) {
              if (pendingMutations.length >= MAX_PENDING_MUTATIONS) break;
              pendingMutations.push(child);

              // Second level (grandchildren)
              const grandchildren = child.children;
              for (let j = 0; j < grandchildren.length && j < 10; j++) {
                if (pendingMutations.length >= MAX_PENDING_MUTATIONS) break;
                if (grandchildren[j] instanceof HTMLElement) {
                  pendingMutations.push(grandchildren[j] as HTMLElement);
                }
              }
            }
          }
        }
      }

      if (
        mutation.type === "attributes" &&
        mutation.target instanceof HTMLElement &&
        (mutation.attributeName === "style" || mutation.attributeName === "class")
      ) {
        if (pendingMutations.length < MAX_PENDING_MUTATIONS) {
          pendingMutations.push(mutation.target);
        }
      }
    }

    // Debounce processing
    if (mutationDebounceTimer !== null) {
      clearTimeout(mutationDebounceTimer);
    }

    mutationDebounceTimer = window.setTimeout(
      () => {
        processPendingMutations();
      },
      isUserInteracting ? 100 : 16
    ); // Longer delay during interaction
  });

  // Safety check before attaching observer
  if (document.body) {
    mutationObserver.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["style", "class"],
      characterData: false, // Don't observe text changes
    });

    debugSync("[DOM Walker] Optimized MutationObserver attached to body");
  } else {
    debugSync("[DOM Walker] ⚠️ document.body disappeared, cannot attach MutationObserver");
  }
}

function processPendingMutations(): void {
  if (pendingMutations.length === 0) return;

  const elements = pendingMutations;
  pendingMutations = [];
  mutationDebounceTimer = null;

  pruneDetachedElements(); // idle — safe to prune here

  // Deduplicate (same element might be added multiple times)
  const unique = [...new Set(elements)].filter((el) => !processedElements.has(el));

  if (unique.length === 0) return;

  debugSync("[DOM Walker] Processing", unique.length, "new elements");

  // FIX: Call requestIdleCallback directly on window to preserve 'this' context.
  // In Firefox content scripts, storing a reference to window.requestIdleCallback
  // and calling it later loses the Window object context, causing TypeError.
  // This direct-call approach is non-blocking and defers mutation processing until browser idle.
  if (typeof window.requestIdleCallback === "function") {
    debugSync("[DOM Walker] Scheduling work with: requestIdleCallback");
    window.requestIdleCallback(() => {
      processBatch(unique, 0, unique.length);
    });
  } else {
    debugSync("[DOM Walker] Scheduling work with: requestAnimationFrame");
    requestAnimationFrame(() => {
      processBatch(unique, 0, unique.length);
    });
  }
}
