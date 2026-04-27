// tests/unit/dark-detection-color-utils.test.ts
import { describe, it, expect, beforeEach, vi } from "vitest";
import { JSDOM } from "jsdom";
import * as colorUtils from "../../src/utils/color-utils";

/**
 * OPTIMIZATION 6A: Dark Detection Color Parsing Migration
 *
 * Tests verifying that dark-detection.ts now uses the cached color parser
 * from color-utils.ts for improved performance.
 */
describe("Dark Detection - Color Utils Migration (Opt-6A)", () => {
  let dom: JSDOM;
  let window: any;
  let document: any;

  beforeEach(() => {
    // Clear the color cache before each test
    colorUtils.clearColorCache();

    // Set up a fresh DOM for each test
    dom = new JSDOM(
      `
      <!DOCTYPE html>
      <html>
        <head></head>
        <body>
          <main>Main content</main>
          <article>Article content</article>
        </body>
      </html>
    `,
      { url: "https://example.com/" }
    );

    window = dom.window;
    document = window.document;
    global.window = window as any;
    global.document = document;
  });

  it("should use parseRgbFast from color-utils for color parsing", async () => {
    // Spy on parseRgbFast to ensure it's called
    const parseRgbFastSpy = vi.spyOn(colorUtils, "parseRgbFast");

    // Import dark-detection module (which now uses color-utils)
    const { isAlreadyDarkTheme } = await import("../../src/utils/dark-detection");

    // Set up a light background
    document.body.style.backgroundColor = "rgb(255, 255, 255)";

    // Run detection
    const result = isAlreadyDarkTheme();

    // Verify parseRgbFast was called (should be called at least once for body background)
    expect(parseRgbFastSpy).toHaveBeenCalled();
    expect(result).toBe(false);

    parseRgbFastSpy.mockRestore();
  });

  it("should benefit from color cache on repeated color strings", async () => {
    const { isAlreadyDarkTheme } = await import("../../src/utils/dark-detection");

    // Set same background color on multiple elements
    const body = document.body;
    const main = document.querySelector("main") as HTMLElement;
    const article = document.querySelector("article") as HTMLElement;

    const sameColor = "rgb(30, 30, 30)";
    body.style.backgroundColor = sameColor;
    main.style.backgroundColor = sameColor;
    article.style.backgroundColor = sameColor;

    // Clear cache stats
    colorUtils.clearColorCache();

    // Run detection (will process multiple elements with same color)
    isAlreadyDarkTheme();

    // The cache should have fewer entries than total elements processed
    // since the same color is reused
    const stats = colorUtils.getColorCacheStats();

    // At minimum, the color should be cached (size >= 1)
    expect(stats.size).toBeGreaterThanOrEqual(1);
    // And it shouldn't exceed the number of unique colors significantly
    expect(stats.size).toBeLessThanOrEqual(10);
  });

  it("should correctly handle transparent colors through parseRgbFast", async () => {
    const { isAlreadyDarkTheme } = await import("../../src/utils/dark-detection");

    // Set transparent background
    document.body.style.backgroundColor = "transparent";
    const main = document.querySelector("main") as HTMLElement;
    main.style.backgroundColor = "rgba(0, 0, 0, 0)";

    // Detection should skip transparent colors and fall back
    const result = isAlreadyDarkTheme();

    // Should return false (no valid samples, defaults to light)
    expect(result).toBe(false);
  });

  it("should correctly parse rgba with low alpha through color-utils", async () => {
    // Verify that parseRgbFast handles nearly-transparent rgba correctly
    const result1 = colorUtils.parseRgbFast("rgba(255, 255, 255, 0.01)");
    expect(result1).toBeNull(); // Should be treated as transparent

    const result2 = colorUtils.parseRgbFast("rgba(255, 255, 255, 0.5)");
    expect(result2).not.toBeNull(); // Should be parsed
    expect(result2).toEqual({ r: 255, g: 255, b: 255 });
  });

  it("should maintain performance with cached color parsing", async () => {
    const { isAlreadyDarkTheme } = await import("../../src/utils/dark-detection");

    // Create multiple elements with the same color
    const commonColor = "rgb(40, 40, 40)";

    for (let i = 0; i < 20; i++) {
      const div = document.createElement("div");
      div.className = `container`;
      div.style.backgroundColor = commonColor;
      document.body.appendChild(div);
    }

    colorUtils.clearColorCache();

    // First run - populates cache
    const start1 = performance.now();
    isAlreadyDarkTheme();
    const time1 = performance.now() - start1;

    const cacheSize = colorUtils.getColorCacheStats().size;

    // Cache should have been populated
    expect(cacheSize).toBeGreaterThan(0);

    // Second run - uses cache (should be same or faster)
    const start2 = performance.now();
    isAlreadyDarkTheme();
    const time2 = performance.now() - start2;

    // Cache size shouldn't grow significantly (same colors)
    const cacheSize2 = colorUtils.getColorCacheStats().size;
    expect(cacheSize2).toBeLessThanOrEqual(cacheSize + 5);
  });

  it("should handle hex colors through parseRgbFast", async () => {
    const { isAlreadyDarkTheme } = await import("../../src/utils/dark-detection");

    // Set hex background (dark)
    document.body.style.backgroundColor = "#1a1a1a";

    const result = isAlreadyDarkTheme();

    // Should detect as dark theme
    expect(result).toBe(true);
  });

  it("should detect dark theme with cached RGB parsing", async () => {
    const { isAlreadyDarkTheme } = await import("../../src/utils/dark-detection");

    // Set dark background
    document.body.style.backgroundColor = "rgb(20, 20, 20)";
    const main = document.querySelector("main") as HTMLElement;
    main.style.backgroundColor = "rgb(25, 25, 25)";

    const result = isAlreadyDarkTheme();

    // Should detect as dark
    expect(result).toBe(true);
  });

  it("should resolve transparent containers from dark parent background", async () => {
    const { isAlreadyDarkTheme } = await import("../../src/utils/dark-detection");

    document.body.innerHTML = `
      <main id="shell" style="background: rgb(20, 20, 20); min-height: 100px;">
        <section style="background: transparent;">
          <div style="background: rgba(0, 0, 0, 0);">Content</div>
        </section>
      </main>
    `;

    const result = isAlreadyDarkTheme();
    expect(result).toBe(true);
  });

  it("should detect dark root canvas even when some sampled children are light", async () => {
    const { isAlreadyDarkTheme } = await import("../../src/utils/dark-detection");

    document.body.style.backgroundColor = "rgb(18, 18, 18)";
    document.body.innerHTML = `
      <main style="background-color: rgb(22, 22, 22); min-height: 200px;">Dark App Shell</main>
      <div class="card" style="background-color: rgb(250, 250, 250); width: 40px; height: 40px;">Badge</div>
    `;

    const result = isAlreadyDarkTheme();
    expect(result).toBe(true);
  });
});
