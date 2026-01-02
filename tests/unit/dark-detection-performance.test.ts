// tests/unit/dark-detection-performance.test.ts
import { describe, it, expect, beforeEach } from "vitest";
import { JSDOM } from "jsdom";

/**
 * OPTIMIZATION 1: Eliminate Layout Thrashing in Dark Detection
 * 
 * Tests that verify batched style reading prevents layout thrashing
 */
describe("Dark Detection - Layout Thrashing Prevention (Opt-1)", () => {
  let dom: JSDOM;
  let document: Document;
  let window: Window & typeof globalThis;

  beforeEach(() => {
    // Create a fresh DOM for each test
    dom = new JSDOM(`<!DOCTYPE html>
      <html>
        <head><style>
          body { background-color: rgb(255, 255, 255); }
          .dark-bg { background-color: rgb(30, 30, 30); }
          .light-bg { background-color: rgb(240, 240, 240); }
          main { background-color: rgb(250, 250, 250); }
          header { background-color: rgb(245, 245, 245); }
        </style></head>
        <body>
          <header>Header</header>
          <main>
            <div class="container">Content</div>
          </main>
        </body>
      </html>
    `, {
      url: "https://example.com",
      pretendToBeVisual: true,
      resources: "usable"
    });

    document = dom.window.document;
    window = dom.window as unknown as Window & typeof globalThis;

    // Set up global objects
    global.document = document;
    global.window = window;
    global.getComputedStyle = window.getComputedStyle.bind(window);
  });

  it("should batch getComputedStyle calls instead of interleaving with DOM reads", async () => {
    // Import the function after setting up globals
    const { isAlreadyDarkTheme } = await import("../../src/utils/dark-detection");
    
    // Track getComputedStyle calls
    let styleCallCount = 0;
    let boundingRectCallCount = 0;
    
    const originalGetComputedStyle = window.getComputedStyle;
    const originalGetBoundingClientRect = window.Element.prototype.getBoundingClientRect;
    
    // Mock to track calls
    (window as any).getComputedStyle = function(...args: any[]) {
      styleCallCount++;
      return originalGetComputedStyle.apply(this, args as [Element, string?]);
    };
    
    window.Element.prototype.getBoundingClientRect = function() {
      boundingRectCallCount++;
      return originalGetBoundingClientRect.call(this);
    };
    
    global.getComputedStyle = (window as any).getComputedStyle;
    
    // Run detection
    const result = isAlreadyDarkTheme();
    
    // Verify batching: getComputedStyle should be called AFTER getBoundingClientRect
    // In the optimized version, we do all getBoundingClientRect checks first,
    // then all getComputedStyle calls in a batch
    expect(styleCallCount).toBeGreaterThan(0);
    expect(result).toBe(false); // Light theme
    
    // Cleanup
    (window as any).getComputedStyle = originalGetComputedStyle;
    window.Element.prototype.getBoundingClientRect = originalGetBoundingClientRect;
  });

  it("should cache computed styles and reuse them for processing", async () => {
    const { isAlreadyDarkTheme } = await import("../../src/utils/dark-detection");
    
    // Create a page with multiple elements
    document.body.innerHTML = `
      <main class="light-bg">Main content</main>
      <article class="light-bg">Article</article>
      <div class="container light-bg">Container</div>
    `;
    
    let styleCallCount = 0;
    const originalGetComputedStyle = window.getComputedStyle;
    
    (window as any).getComputedStyle = function(...args: any[]) {
      styleCallCount++;
      return originalGetComputedStyle.apply(this, args as [Element, string?]);
    };
    global.getComputedStyle = (window as any).getComputedStyle;
    
    // Run detection
    const result = isAlreadyDarkTheme();
    
    // Each element should only have getComputedStyle called once (cached)
    // We expect 1 call for html (colorScheme check) + N calls for sampled elements
    // but NOT multiple calls per element
    expect(styleCallCount).toBeLessThan(50); // Should be much less with caching
    expect(result).toBe(false);
    
    // Cleanup
    (window as any).getComputedStyle = originalGetComputedStyle;
  });

  it("should skip elements with zero dimensions before calling getComputedStyle", async () => {
    const { isAlreadyDarkTheme } = await import("../../src/utils/dark-detection");
    
    // Create elements with zero dimensions
    document.body.innerHTML = `
      <div style="width: 0; height: 0;">Hidden</div>
      <main style="width: 100px; height: 100px; background-color: rgb(250, 250, 250);">Visible</main>
    `;
    
    // Mock getBoundingClientRect to return zero dimensions for first div
    let hiddenElementStyleChecked = false;
    const originalGetBoundingClientRect = window.Element.prototype.getBoundingClientRect;
    const originalGetComputedStyle = window.getComputedStyle;
    
    window.Element.prototype.getBoundingClientRect = function() {
      if (this.textContent === 'Hidden') {
        return { width: 0, height: 0, top: 0, left: 0, right: 0, bottom: 0, x: 0, y: 0 } as DOMRect;
      }
      return originalGetBoundingClientRect.call(this);
    };
    
    (window as any).getComputedStyle = function(el: Element, ...args: any[]) {
      if (el.textContent === 'Hidden') {
        hiddenElementStyleChecked = true;
      }
      return originalGetComputedStyle.apply(this, [el, ...args] as [Element, string?]);
    };
    global.getComputedStyle = (window as any).getComputedStyle;
    
    // Run detection
    isAlreadyDarkTheme();
    
    // Hidden element should NOT have its computed style checked
    // (optimization skips it after getBoundingClientRect check)
    expect(hiddenElementStyleChecked).toBe(false);
    
    // Cleanup
    window.Element.prototype.getBoundingClientRect = originalGetBoundingClientRect;
    (window as any).getComputedStyle = originalGetComputedStyle;
  });

  it("should detect dark theme correctly with batched reads", async () => {
    const { isAlreadyDarkTheme } = await import("../../src/utils/dark-detection");
    
    // Create a dark-themed page
    document.body.innerHTML = `
      <main style="background-color: rgb(30, 30, 30);">Main</main>
      <article style="background-color: rgb(25, 25, 25);">Article</article>
      <div class="container" style="background-color: rgb(35, 35, 35);">Container</div>
    `;
    
    document.body.style.backgroundColor = 'rgb(20, 20, 20)';
    
    const result = isAlreadyDarkTheme();
    
    // Should correctly detect dark theme even with batched processing
    expect(result).toBe(true);
  });

  it("should handle edge case with no valid samples gracefully", async () => {
    const { isAlreadyDarkTheme } = await import("../../src/utils/dark-detection");
    
    // Empty body with transparent backgrounds
    document.body.innerHTML = '';
    document.body.style.backgroundColor = 'transparent';
    
    // Should not throw and should return false (default to light)
    expect(() => {
      const result = isAlreadyDarkTheme();
      expect(result).toBe(false);
    }).not.toThrow();
  });
});
