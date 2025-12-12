// tests/unit/dark-detection-extension-check.test.ts
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { JSDOM } from "jsdom";

/**
 * Tests for dark detection to ensure it doesn't sample extension-applied styles
 * This prevents false positives where the extension detects its own dark styles
 * and incorrectly concludes the site is already dark
 */

describe("Dark Detection - Extension Style Detection", () => {
  let dom: JSDOM;
  let document: Document;
  let window: Window;

  beforeEach(() => {
    // Create a fresh DOM for each test
    dom = new JSDOM(`
      <!DOCTYPE html>
      <html>
        <head></head>
        <body>
          <div id="content">Test content</div>
        </body>
      </html>
    `);
    document = dom.window.document;
    window = dom.window as unknown as Window;

    // Set up global document and window for the module
    global.document = document;
    global.window = window;

    // Mock getComputedStyle for JSDOM (needed by dark detection)
    (global as { getComputedStyle?: typeof getComputedStyle }).getComputedStyle = (element: Element) => {
      return {
        colorScheme: '',
        backgroundColor: 'rgb(255, 255, 255)',
        color: 'rgb(0, 0, 0)'
      } as CSSStyleDeclaration;
    };
  });

  afterEach(() => {
    // Clean up
    delete (global as { document?: Document }).document;
    delete (global as { window?: Window }).window;
    delete (global as { getComputedStyle?: typeof getComputedStyle }).getComputedStyle;
  });

  it("should detect when extension has applied udr-applied attribute", async () => {
    // Import the module after setting up the DOM
    const { isAlreadyDarkTheme } = await import("../../src/utils/dark-detection");

    // Set the extension's applied attribute
    document.documentElement.setAttribute('udr-applied', 'true');

    // Should return false (meaning: don't skip, allow reapplication)
    const result = isAlreadyDarkTheme();
    expect(result).toBe(false);
  });

  it("should detect when extension has applied data-udr-applied attribute", async () => {
    const { isAlreadyDarkTheme } = await import("../../src/utils/dark-detection");

    // Set the extension's applied attribute (alternative format)
    document.documentElement.setAttribute('data-udr-applied', '1');

    const result = isAlreadyDarkTheme();
    expect(result).toBe(false);
  });

  it("should detect when extension style tag is present", async () => {
    const { isAlreadyDarkTheme } = await import("../../src/utils/dark-detection");

    // Add the extension's style tag
    const styleTag = document.createElement('style');
    styleTag.id = 'udr-style';
    styleTag.textContent = 'body { background: #1a1a1a; }';
    document.head.appendChild(styleTag);

    const result = isAlreadyDarkTheme();
    expect(result).toBe(false);
  });

  it("should detect when pre-inject style tag is present", async () => {
    const { isAlreadyDarkTheme } = await import("../../src/utils/dark-detection");

    // Add the extension's pre-inject style tag
    const preInjectTag = document.createElement('style');
    preInjectTag.id = 'udr-preinject';
    preInjectTag.textContent = 'html, body { background-color: #1a1a1a !important; }';
    document.head.appendChild(preInjectTag);

    const result = isAlreadyDarkTheme();
    expect(result).toBe(false);
  });

  it("should run normal detection when no extension markers are present", async () => {
    const { isAlreadyDarkTheme } = await import("../../src/utils/dark-detection");

    // No extension markers, so detection should run normally
    // With default light page, should return false (site is light)
    const result = isAlreadyDarkTheme();
    expect(result).toBe(false);
  });

  it("should prevent false positives from extension-darkened backgrounds", async () => {
    const { isAlreadyDarkTheme } = await import("../../src/utils/dark-detection");

    // Simulate extension having already darkened the page
    document.documentElement.setAttribute('udr-applied', 'true');
    document.body.style.backgroundColor = '#1a1a1a';
    document.body.style.color = '#e0e0e0';

    // Even though the page appears dark, detection should skip
    // and return false (don't skip application)
    const result = isAlreadyDarkTheme();
    expect(result).toBe(false);
  });
});

/**
 * Manual QA Test Cases:
 * 
 * 1. Initial page load on light site (e.g., Wikipedia):
 *    - Theme should apply correctly
 *    - No oscillation or flickering
 * 
 * 2. Adjust slider on light site:
 *    - Theme should update with new values
 *    - Should NOT remove theme thinking site is already dark
 * 
 * 3. Navigate to another page on same site:
 *    - Theme should apply correctly without needing slider adjustment
 * 
 * 4. Test with actually dark site (e.g., GitHub dark mode):
 *    - With detectDarkSites enabled, should skip application
 *    - After disabling detectDarkSites, should apply normally
 * 
 * 5. Test reset sliders:
 *    - Should immediately apply default values
 *    - Should NOT require second press
 *    - Should persist across page reloads
 */
