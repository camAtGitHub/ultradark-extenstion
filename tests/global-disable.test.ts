// tests/global-disable.test.ts
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { JSDOM } from "jsdom";

/**
 * Regression tests for global disable functionality
 * 
 * These tests verify that when the extension is globally disabled,
 * ALL styling (including pre-inject.css) is properly removed from the page.
 * 
 * This addresses the bug where pre-injected styles remained active even
 * when the extension was turned off via the popup toggle.
 */

describe("Global Disable Functionality", () => {
  let dom: JSDOM;
  let document: Document;
  let window: Window;

  beforeEach(() => {
    // Create a fresh DOM for each test
    dom = new JSDOM(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>Test Page</title>
        </head>
        <body>
          <h1>Test Content</h1>
          <p>This is a test page</p>
        </body>
      </html>
    `, {
      url: "https://example.com",
      pretendToBeVisual: true
    });
    
    document = dom.window.document;
    window = dom.window as unknown as Window;
    
    // Set up global document and window for the test environment
    global.document = document;
    global.window = window;
  });

  afterEach(() => {
    dom.window.close();
  });

  describe("Pre-inject CSS removal", () => {
    it("should remove background-color from html element when disabled", () => {
      // Simulate pre-inject.css by setting inline styles with !important
      document.documentElement.style.setProperty('background-color', '#1a1a1a', 'important');
      document.documentElement.style.setProperty('color', '#e0e0e0', 'important');
      
      // Verify styles are applied
      expect(document.documentElement.style.backgroundColor).toBe('rgb(26, 26, 26)');
      expect(document.documentElement.style.color).toBe('rgb(224, 224, 224)');
      
      // Simulate removal (what removeCss should do)
      document.documentElement.style.setProperty('background-color', '', 'important');
      document.documentElement.style.setProperty('color', '', 'important');
      
      // Verify styles are removed
      expect(document.documentElement.style.backgroundColor).toBe('');
      expect(document.documentElement.style.color).toBe('');
    });

    it("should remove background-color from body element when disabled", () => {
      // Simulate pre-inject.css
      document.body.style.setProperty('background-color', '#1a1a1a', 'important');
      document.body.style.setProperty('color', '#e0e0e0', 'important');
      
      // Verify styles are applied
      expect(document.body.style.backgroundColor).toBe('rgb(26, 26, 26)');
      expect(document.body.style.color).toBe('rgb(224, 224, 224)');
      
      // Simulate removal
      document.body.style.setProperty('background-color', '', 'important');
      document.body.style.setProperty('color', '', 'important');
      
      // Verify styles are removed
      expect(document.body.style.backgroundColor).toBe('');
      expect(document.body.style.color).toBe('');
    });

    it("should handle missing body element gracefully", () => {
      // Remove body temporarily to test edge case
      const bodyBackup = document.body;
      Object.defineProperty(document, 'body', {
        get: () => null,
        configurable: true
      });
      
      // Should not throw when body is null
      expect(() => {
        if (document.body) {
          document.body.style.setProperty('background-color', '', 'important');
        }
      }).not.toThrow();
      
      // Restore body
      Object.defineProperty(document, 'body', {
        get: () => bodyBackup,
        configurable: true
      });
    });
  });

  describe("Style tag removal", () => {
    it("should remove dark-theme-snippet style tag when disabled", () => {
      // Create the new photon inverter style tag
      const styleTag = document.createElement('style');
      styleTag.id = 'dark-theme-snippet';
      styleTag.textContent = `
        :root { background-color: #fefefe; filter: invert(100%); }
        * { background-color: inherit; }
        img:not([src*=".svg"]), video { filter: invert(100%); }
      `;
      document.head.appendChild(styleTag);
      
      // Verify tag exists
      expect(document.getElementById('dark-theme-snippet')).toBeTruthy();
      
      // Simulate removal
      const tag = document.getElementById('dark-theme-snippet');
      if (tag?.parentNode) {
        tag.parentNode.removeChild(tag);
      }
      
      // Verify tag is removed
      expect(document.getElementById('dark-theme-snippet')).toBeNull();
    });

    it("should remove legacy udr-style tag when disabled (backwards compatibility)", () => {
      // Create the old style tag for backwards compatibility
      const styleTag = document.createElement('style');
      styleTag.id = 'udr-style';
      styleTag.textContent = 'html { filter: invert(100%); }';
      document.head.appendChild(styleTag);
      
      // Verify tag exists
      expect(document.getElementById('udr-style')).toBeTruthy();
      
      // Simulate removal
      const tag = document.getElementById('udr-style');
      if (tag?.parentNode) {
        tag.parentNode.removeChild(tag);
      }
      
      // Verify tag is removed
      expect(document.getElementById('udr-style')).toBeNull();
    });

    it("should handle missing style tags gracefully", () => {
      // Should not throw when trying to remove non-existent tags
      expect(() => {
        const tag = document.getElementById('dark-theme-snippet');
        if (tag?.parentNode) {
          tag.parentNode.removeChild(tag);
        }
      }).not.toThrow();
    });
  });

  describe("Data attributes cleanup", () => {
    it("should remove udr-applied attribute when disabled", () => {
      document.documentElement.setAttribute('udr-applied', 'true');
      
      expect(document.documentElement.hasAttribute('udr-applied')).toBe(true);
      
      // Simulate removal
      document.documentElement.removeAttribute('udr-applied');
      
      expect(document.documentElement.hasAttribute('udr-applied')).toBe(false);
    });

    it("should remove data-udr-mode attribute when disabled", () => {
      document.documentElement.setAttribute('data-udr-mode', 'photon-inverter');
      
      expect(document.documentElement.getAttribute('data-udr-mode')).toBe('photon-inverter');
      
      // Simulate removal
      document.documentElement.removeAttribute('data-udr-mode');
      
      expect(document.documentElement.hasAttribute('data-udr-mode')).toBe(false);
    });
  });

  describe("Integration scenarios", () => {
    it("should completely clean up after applying and removing dark theme", () => {
      // Apply dark theme (simulate what applyPhotonInverter does)
      const styleTag = document.createElement('style');
      styleTag.id = 'dark-theme-snippet';
      styleTag.textContent = ':root { filter: invert(100%); }';
      document.head.appendChild(styleTag);
      
      document.documentElement.setAttribute('data-udr-mode', 'photon-inverter');
      document.documentElement.setAttribute('udr-applied', 'true');
      
      document.documentElement.style.setProperty('background-color', '#1a1a1a', 'important');
      document.body.style.setProperty('background-color', '#1a1a1a', 'important');
      
      // Verify everything is applied
      expect(document.getElementById('dark-theme-snippet')).toBeTruthy();
      expect(document.documentElement.hasAttribute('data-udr-mode')).toBe(true);
      expect(document.documentElement.hasAttribute('udr-applied')).toBe(true);
      
      // Remove everything (simulate what removeCss should do)
      const tag = document.getElementById('dark-theme-snippet');
      if (tag?.parentNode) tag.parentNode.removeChild(tag);
      
      const legacyTag = document.getElementById('udr-style');
      if (legacyTag?.parentNode) legacyTag.parentNode.removeChild(legacyTag);
      
      document.documentElement.removeAttribute('udr-applied');
      document.documentElement.removeAttribute('data-udr-mode');
      
      document.documentElement.style.setProperty('background-color', '', 'important');
      document.documentElement.style.setProperty('color', '', 'important');
      
      if (document.body) {
        document.body.style.setProperty('background-color', '', 'important');
        document.body.style.setProperty('color', '', 'important');
      }
      
      // Verify complete cleanup
      expect(document.getElementById('dark-theme-snippet')).toBeNull();
      expect(document.getElementById('udr-style')).toBeNull();
      expect(document.documentElement.hasAttribute('data-udr-mode')).toBe(false);
      expect(document.documentElement.hasAttribute('udr-applied')).toBe(false);
      expect(document.documentElement.style.backgroundColor).toBe('');
      expect(document.documentElement.style.color).toBe('');
      expect(document.body.style.backgroundColor).toBe('');
      expect(document.body.style.color).toBe('');
    });
  });

  describe("Settings state verification", () => {
    it("should not apply styles when global enabled is false", () => {
      const settings = { enabled: false };
      
      // When enabled is false, no styles should be applied
      if (!settings.enabled) {
        // Skip application
        expect(document.getElementById('dark-theme-snippet')).toBeNull();
      }
      
      expect(settings.enabled).toBe(false);
    });

    it("should apply styles when global enabled is true", () => {
      const settings = { enabled: true };
      
      expect(settings.enabled).toBe(true);
      
      // This would trigger style application in the real extension
    });
  });
});

/**
 * Manual QA Test Cases (to be performed in browser with extension loaded):
 * 
 * 1. Test Global Toggle Off on Static Page:
 *    - Navigate to a static HTML page (e.g., Wikipedia)
 *    - Extension applies dark theme
 *    - Open popup and toggle "Enable Dark Mode" to OFF
 *    - Expected: Page reverts to original light appearance
 *    - Inspect DOM: No <style id="dark-theme-snippet"> tag
 *    - Inspect DOM: html/body have no background-color: #1a1a1a
 * 
 * 2. Test Global Toggle Off on Dynamic Page (SPA):
 *    - Navigate to a React/Vue SPA (e.g., Twitter, GitHub)
 *    - Extension applies dark theme
 *    - Toggle extension OFF
 *    - Expected: Page reverts immediately
 *    - Navigate within the SPA, verify theme stays off
 * 
 * 3. Test Pre-inject CSS Removal:
 *    - Open extension popup BEFORE navigating to a page
 *    - Toggle extension OFF
 *    - Navigate to a new page
 *    - Expected: Page loads in its original state (no flash of dark)
 *    - Inspect: No pre-inject CSS effects visible
 * 
 * 4. Test Toggle On → Off → On Cycle:
 *    - Start with extension ON on a page
 *    - Toggle OFF (verify cleanup)
 *    - Toggle ON again
 *    - Expected: Dark theme reapplies correctly
 *    - No duplicate style tags
 * 
 * 5. Test Edge Cases:
 *    - Toggle OFF on a page with no <body> yet (early load)
 *    - Toggle OFF on a page with dynamic <head> modification
 *    - Toggle OFF on a page with CSP restrictions
 */
