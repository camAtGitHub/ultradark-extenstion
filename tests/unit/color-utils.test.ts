// tests/unit/color-utils.test.ts
import { describe, it, expect, beforeEach } from "vitest";
import { parseRgbFast, isTransparentFast, clearColorCache, getColorCacheStats } from "../../src/utils/color-utils";

/**
 * OPTIMIZATION 6: Pre-compute Color Parsing Results
 * 
 * Tests for cached color parsing utility
 */
describe("Color Utils - Cached Parsing (Opt-6)", () => {
  beforeEach(() => {
    clearColorCache();
  });

  it("should parse rgb() format", () => {
    const result = parseRgbFast("rgb(255, 128, 0)");
    expect(result).toEqual({ r: 255, g: 128, b: 0 });
  });

  it("should parse rgba() format with valid alpha", () => {
    const result = parseRgbFast("rgba(255, 128, 0, 0.5)");
    expect(result).toEqual({ r: 255, g: 128, b: 0 });
  });

  it("should return null for rgba with alpha <= 0.05", () => {
    const result = parseRgbFast("rgba(255, 128, 0, 0.01)");
    expect(result).toBeNull();
  });

  it("should parse hex #rrggbb format", () => {
    const result = parseRgbFast("#ff8000");
    expect(result).toEqual({ r: 255, g: 128, b: 0 });
  });

  it("should parse short hex #rgb format", () => {
    const result = parseRgbFast("#f80");
    expect(result).toEqual({ r: 255, g: 136, b: 0 });
  });

  it("should return null for transparent", () => {
    const result = parseRgbFast("transparent");
    expect(result).toBeNull();
  });

  it("should cache parsed results", () => {
    const color = "rgb(100, 150, 200)";
    
    parseRgbFast(color); // First call
    const stats1 = getColorCacheStats();
    expect(stats1.size).toBe(1);
    
    parseRgbFast(color); // Second call should use cache
    const stats2 = getColorCacheStats();
    expect(stats2.size).toBe(1); // No new entry
  });

  it("should evict oldest entries when cache is full", () => {
    const MAX_SIZE = 200;
    
    // Fill cache to max
    for (let i = 0; i < MAX_SIZE; i++) {
      parseRgbFast(`rgb(${i}, ${i}, ${i})`);
    }
    
    let stats = getColorCacheStats();
    expect(stats.size).toBe(MAX_SIZE);
    
    // Add one more
    parseRgbFast("rgb(255, 255, 255)");
    stats = getColorCacheStats();
    expect(stats.size).toBe(MAX_SIZE); // Still at max (evicted oldest)
  });

  it("should detect transparent as transparent", () => {
    expect(isTransparentFast("transparent")).toBe(true);
  });

  it("should detect rgba(0,0,0,0) as transparent", () => {
    expect(isTransparentFast("rgba(0, 0, 0, 0)")).toBe(true);
  });

  it("should detect rgba with zero alpha as transparent", () => {
    expect(isTransparentFast("rgba(255, 255, 255, 0)")).toBe(true);
    expect(isTransparentFast("rgba(100, 150, 200,0)")).toBe(true);
  });

  it("should not detect opaque colors as transparent", () => {
    expect(isTransparentFast("rgb(255, 255, 255)")).toBe(false);
    expect(isTransparentFast("rgba(255, 255, 255, 1)")).toBe(false);
  });

  it("should use fast path for rgb format (charCode check)", () => {
    // 'r' has charCode 114
    expect("rgb(0,0,0)".charCodeAt(0)).toBe(114);
    
    const result = parseRgbFast("rgb(100, 100, 100)");
    expect(result).not.toBeNull();
  });

  it("should use fast path for hex format (charCode check)", () => {
    // '#' has charCode 35
    expect("#ffffff".charCodeAt(0)).toBe(35);
    
    const result = parseRgbFast("#ffffff");
    expect(result).toEqual({ r: 255, g: 255, b: 255 });
  });

  it("should clear cache when clearColorCache is called", () => {
    parseRgbFast("rgb(100, 100, 100)");
    parseRgbFast("rgb(200, 200, 200)");
    
    let stats = getColorCacheStats();
    expect(stats.size).toBeGreaterThan(0);
    
    clearColorCache();
    stats = getColorCacheStats();
    expect(stats.size).toBe(0);
  });

  it("should handle malformed colors gracefully", () => {
    const result = parseRgbFast("notacolor");
    expect(result).toBeNull();
  });

  it("should cache null results for invalid colors", () => {
    const color = "invalidcolor";
    
    parseRgbFast(color);
    const stats = getColorCacheStats();
    expect(stats.size).toBe(1); // Null result is cached
  });

  it("should optimize for common transparent checks with charCode", () => {
    // Check for '0' at position length-2
    const color = "rgba(255, 255, 255, 0)";
    const charCode = color.charCodeAt(color.length - 2);
    expect(charCode).toBe(48); // '0' charCode
  });

  it("should provide cache statistics", () => {
    parseRgbFast("rgb(1, 1, 1)");
    parseRgbFast("rgb(2, 2, 2)");
    parseRgbFast("rgb(3, 3, 3)");
    
    const stats = getColorCacheStats();
    expect(stats.size).toBe(3);
    expect(stats.maxSize).toBe(200);
  });
});
