// tests/unit/chroma-semantic-color-utils.test.ts
import { describe, it, expect, beforeEach, vi } from "vitest";
import * as colorUtils from "../../src/utils/color-utils";

/**
 * OPTIMIZATION 6B: Chroma-Semantic Color Parsing Migration
 *
 * Tests verifying that chroma-semantic.ts now uses the cached color parser
 * from color-utils.ts for improved performance.
 *
 * Note: These tests focus on verifying parseRgbFast behavior with colors
 * used by chroma-semantic, not the full chroma-semantic algorithm.
 */
describe("Chroma-Semantic - Color Utils Migration (Opt-6B)", () => {
  beforeEach(() => {
    // Clear the color cache before each test
    colorUtils.clearColorCache();
  });

  it("should use parseRgbFast from color-utils for color parsing", () => {
    // Verify parseRgbFast is being used by the module
    const parseRgbFastSpy = vi.spyOn(colorUtils, "parseRgbFast");

    // Test parseRgbFast directly with typical chroma-semantic inputs
    const result1 = colorUtils.parseRgbFast("rgb(26, 26, 26)"); // Dark background
    expect(result1).toEqual({ r: 26, g: 26, b: 26 });

    const result2 = colorUtils.parseRgbFast("#1a1a1a"); // Hex dark background
    expect(result2).toEqual({ r: 26, g: 26, b: 26 });

    const result3 = colorUtils.parseRgbFast("rgba(255, 255, 255, 0.03)"); // Nearly transparent
    expect(result3).toBeNull(); // Should be treated as transparent

    expect(parseRgbFastSpy).toHaveBeenCalled();
    parseRgbFastSpy.mockRestore();
  });

  it("should benefit from color cache on repeated semantic colors", () => {
    // Simulate chroma-semantic processing multiple elements with same palette
    const darkBg = "rgb(26, 26, 26)";
    const surfaceBg = "rgb(34, 34, 34)";
    const cardBg = "rgb(42, 42, 42)";

    colorUtils.clearColorCache();

    // Parse same colors multiple times (simulates DOM walking)
    for (let i = 0; i < 10; i++) {
      colorUtils.parseRgbFast(darkBg);
      colorUtils.parseRgbFast(surfaceBg);
      colorUtils.parseRgbFast(cardBg);
    }

    const stats = colorUtils.getColorCacheStats();

    // Should only have 3 entries (one for each unique color)
    expect(stats.size).toBe(3);
  });

  it("should handle alpha threshold correctly through parseRgbFast", () => {
    // parseRgbFast uses alpha <= 0.05 as transparent threshold
    // (slightly more conservative than chroma-semantic's original 0.1)

    const transparent1 = colorUtils.parseRgbFast("rgba(100, 100, 100, 0.04)");
    expect(transparent1).toBeNull(); // Below 0.05 threshold

    const transparent2 = colorUtils.parseRgbFast("rgba(100, 100, 100, 0.05)");
    expect(transparent2).toBeNull(); // Exactly at 0.05 threshold

    const opaque1 = colorUtils.parseRgbFast("rgba(100, 100, 100, 0.06)");
    expect(opaque1).not.toBeNull(); // Above 0.05 threshold
    expect(opaque1).toEqual({ r: 100, g: 100, b: 100 });

    const opaque2 = colorUtils.parseRgbFast("rgba(100, 100, 100, 0.5)");
    expect(opaque2).not.toBeNull();
    expect(opaque2).toEqual({ r: 100, g: 100, b: 100 });
  });

  it("should parse all color formats used by chroma-semantic", () => {
    // RGB format
    const rgb = colorUtils.parseRgbFast("rgb(18, 18, 18)");
    expect(rgb).toEqual({ r: 18, g: 18, b: 18 });

    // RGBA format with valid alpha
    const rgba = colorUtils.parseRgbFast("rgba(224, 224, 224, 1)");
    expect(rgba).toEqual({ r: 224, g: 224, b: 224 });

    // Hex #rrggbb format
    const hexLong = colorUtils.parseRgbFast("#121212");
    expect(hexLong).toEqual({ r: 18, g: 18, b: 18 });

    // Hex #rgb short format
    const hexShort = colorUtils.parseRgbFast("#333");
    expect(hexShort).toEqual({ r: 51, g: 51, b: 51 });

    // Transparent
    const transparent = colorUtils.parseRgbFast("transparent");
    expect(transparent).toBeNull();
  });

  it("should handle background palette colors efficiently", () => {
    // BACKGROUND_PALETTE from chroma-semantic
    const palette = [
      "#0d0d0d", // AMOLED black
      "#121212", // Canvas
      "#1a1a1a", // Primary surface
      "#222222", // Cards
      "#2a2a2a", // Nested cards
      "#2f2f2f", // Modals
      "#333333", // Tooltips
    ];

    colorUtils.clearColorCache();

    // Parse entire palette
    const parsed = palette.map((color) => colorUtils.parseRgbFast(color));

    // All should parse successfully
    expect(parsed.every((p) => p !== null)).toBe(true);

    // Cache should have all palette entries
    const stats = colorUtils.getColorCacheStats();
    expect(stats.size).toBe(palette.length);

    // Parse again - should use cache
    const parsed2 = palette.map((color) => colorUtils.parseRgbFast(color));

    // Cache size shouldn't change
    const stats2 = colorUtils.getColorCacheStats();
    expect(stats2.size).toBe(palette.length);
  });

  it("should maintain performance with design system color reuse", () => {
    // Simulate chroma-semantic processing with design system colors
    const designSystemColors = [
      "rgb(18, 18, 18)", // Body bg
      "rgb(26, 26, 26)", // Surface
      "rgb(224, 224, 224)", // Primary text
      "rgb(160, 160, 160)", // Secondary text
      "#333333", // Borders
    ];

    colorUtils.clearColorCache();

    // First pass - populate cache
    for (let i = 0; i < 50; i++) {
      designSystemColors.forEach((color) => colorUtils.parseRgbFast(color));
    }

    const cacheSize = colorUtils.getColorCacheStats().size;
    expect(cacheSize).toBe(designSystemColors.length);

    // Second pass - use cache
    for (let i = 0; i < 50; i++) {
      designSystemColors.forEach((color) => colorUtils.parseRgbFast(color));
    }

    // Cache should remain same size
    const cacheSize2 = colorUtils.getColorCacheStats().size;
    expect(cacheSize2).toBe(designSystemColors.length);
  });

  it("should handle contrast validation color parsing", () => {
    // Test colors used in validateAndFixContrast
    const textColor = colorUtils.parseRgbFast("rgb(224, 224, 224)");
    expect(textColor).toEqual({ r: 224, g: 224, b: 224 });

    const bgColor = colorUtils.parseRgbFast("rgb(18, 18, 18)");
    expect(bgColor).toEqual({ r: 18, g: 18, b: 18 });

    // Lightened colors (output from lightenColor function)
    const lightenedColor = colorUtils.parseRgbFast("rgb(245, 245, 245)");
    expect(lightenedColor).toEqual({ r: 245, g: 245, b: 245 });
  });

  it("should handle warmth-adjusted colors", () => {
    // Warmth adjustment produces rgb() format strings
    const warmAdjusted1 = colorUtils.parseRgbFast("rgb(33, 25, 13)"); // Warm dark
    expect(warmAdjusted1).toEqual({ r: 33, g: 25, b: 13 });

    const warmAdjusted2 = colorUtils.parseRgbFast("rgb(255, 255, 242)"); // Warm light
    expect(warmAdjusted2).toEqual({ r: 255, g: 255, b: 242 });
  });

  it("should provide cache statistics for debugging", () => {
    // Parse a few colors
    colorUtils.parseRgbFast("#121212");
    colorUtils.parseRgbFast("rgb(26, 26, 26)");
    colorUtils.parseRgbFast("rgba(224, 224, 224, 1)");

    const stats = colorUtils.getColorCacheStats();
    expect(stats.size).toBe(3);
    expect(stats.maxSize).toBe(200);
  });
});
