// File: src/utils/color-utils.ts

/**
 * OPTIMIZATION 6: Pre-compute Color Parsing Results
 *
 * High-performance color parser with LRU cache to avoid recompiling
 * the same color strings repeatedly.
 *
 * Optimizations:
 * 1. Result caching (same color strings are parsed repeatedly)
 * 2. Fast path for common formats (avoid regex when possible)
 * 3. Single shared implementation across all algorithms
 */

export interface RGB {
  r: number;
  g: number;
  b: number;
}

// LRU cache for parsed colors (most pages use <200 unique colors)
const colorCache = new Map<string, RGB | null>();
const MAX_CACHE_SIZE = 200;

// Pre-compiled regex (avoid recompilation)
const RGBA_REGEX = /rgba?\s*\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/;
const HEX_REGEX = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i;
const HEX_SHORT_REGEX = /^#?([a-f\d])([a-f\d])([a-f\d])$/i;

/**
 * Fast RGB color parser with caching
 *
 * Supports formats:
 * - rgb(r, g, b)
 * - rgba(r, g, b, a)
 * - #rrggbb
 * - #rgb
 *
 * Returns null for:
 * - transparent
 * - rgba with alpha <= 0.05
 * - unparseable colors
 */
export function parseRgbFast(colorStr: string): RGB | null {
  // Check cache first
  const cached = colorCache.get(colorStr);
  if (cached !== undefined) return cached;

  let result: RGB | null = null;

  // Fast path: Check for common format indicators
  const firstChar = colorStr.charCodeAt(0);

  if (firstChar === 114) {
    // 'r' - likely rgb/rgba
    const match = RGBA_REGEX.exec(colorStr);
    if (match) {
      // Check alpha if present (rgba format)
      if (colorStr.includes("rgba")) {
        const alphaMatch = colorStr.match(/,\s*([\d.]+)\s*\)$/);
        if (alphaMatch && parseFloat(alphaMatch[1]) <= 0.05) {
          // Transparent - cache as null
          result = null;
        } else {
          result = {
            r: +match[1], // Unary + is faster than parseInt for small ints
            g: +match[2],
            b: +match[3],
          };
        }
      } else {
        result = {
          r: +match[1],
          g: +match[2],
          b: +match[3],
        };
      }
    }
  } else if (firstChar === 35) {
    // '#' - hex format
    if (colorStr.length === 7) {
      // Full hex: #rrggbb
      result = {
        r: parseInt(colorStr.slice(1, 3), 16),
        g: parseInt(colorStr.slice(3, 5), 16),
        b: parseInt(colorStr.slice(5, 7), 16),
      };
    } else if (colorStr.length === 4) {
      // Short hex: #rgb
      result = {
        r: parseInt(colorStr[1] + colorStr[1], 16),
        g: parseInt(colorStr[2] + colorStr[2], 16),
        b: parseInt(colorStr[3] + colorStr[3], 16),
      };
    }
  } else if (colorStr === "transparent") {
    result = null;
  }

  // Manage cache size (LRU-like eviction)
  if (colorCache.size >= MAX_CACHE_SIZE) {
    // Remove oldest entry (first key)
    const firstKey = colorCache.keys().next().value;
    if (firstKey !== undefined) {
      colorCache.delete(firstKey);
    }
  }

  colorCache.set(colorStr, result);
  return result;
}

/**
 * Optimized transparency check (no string allocation)
 *
 * Fast paths for common transparent values:
 * - 'transparent'
 * - 'rgba(0, 0, 0, 0)'
 * - rgba with alpha = 0
 */
export function isTransparentFast(colorStr: string): boolean {
  // Common transparent values in order of frequency
  if (colorStr === "transparent") return true;
  if (colorStr === "rgba(0, 0, 0, 0)") return true;

  // Only rgba() can have alpha transparency.
  if (!colorStr.startsWith("rgba(")) {
    return false;
  }

  // Check for near-zero alpha in rgba format.
  const alphaMatch = colorStr.match(/,\s*([\d.]+)\s*\)$/);
  if (!alphaMatch) {
    return false;
  }

  return Number(alphaMatch[1]) <= 0.05;
}

/**
 * Export for testing/debugging
 */
export function clearColorCache(): void {
  colorCache.clear();
}

/**
 * Get cache statistics for debugging
 */
export function getColorCacheStats(): { size: number; maxSize: number } {
  return {
    size: colorCache.size,
    maxSize: MAX_CACHE_SIZE,
  };
}

/**
 * WCAG 2.1 relative luminance calculation
 * Uses individual parameters for JIT optimization (avoids object allocation in hot paths)
 */
export function getRelativeLuminance(r: number, g: number, b: number): number {
  const rs = r / 255;
  const gs = g / 255;
  const bs = b / 255;

  const rLin = rs <= 0.03928 ? rs / 12.92 : Math.pow((rs + 0.055) / 1.055, 2.4);
  const gLin = gs <= 0.03928 ? gs / 12.92 : Math.pow((gs + 0.055) / 1.055, 2.4);
  const bLin = bs <= 0.03928 ? bs / 12.92 : Math.pow((bs + 0.055) / 1.055, 2.4);

  return 0.2126 * rLin + 0.7152 * gLin + 0.0722 * bLin;
}

export function getContrastRatio(l1: number, l2: number): number {
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}
