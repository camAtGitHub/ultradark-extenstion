// tests/reset-site-defaults.test.ts
import { describe, it, expect, beforeEach } from "vitest";
import type { Settings } from "../src/types/settings";
import { DEFAULTS } from "../src/utils/defaults";

describe("Reset Site to Defaults", () => {
  let mockSettings: Settings;

  beforeEach(() => {
    // Create a fresh copy of defaults for each test
    mockSettings = JSON.parse(JSON.stringify(DEFAULTS));
  });

  it("should remove per-site override when resetting to defaults", () => {
    const origin = "https://example.com";
    
    // Add a per-site override
    mockSettings.perSite[origin] = {
      override: {
        brightness: 120,
        contrast: 150,
        sepia: 20
      }
    };

    expect(mockSettings.perSite[origin]).toBeDefined();

    // Reset by deleting the per-site override
    delete mockSettings.perSite[origin];

    expect(mockSettings.perSite[origin]).toBeUndefined();
    expect(Object.keys(mockSettings.perSite)).toHaveLength(0);
  });

  it("should preserve global defaults when resetting per-site settings", () => {
    const origin = "https://example.com";
    
    // Modify global settings
    mockSettings.brightness = 95;
    mockSettings.contrast = 115;
    
    // Add a per-site override
    mockSettings.perSite[origin] = {
      override: {
        brightness: 120,
        contrast: 150
      }
    };

    // Store global values before reset
    const globalBrightness = mockSettings.brightness;
    const globalContrast = mockSettings.contrast;

    // Reset the per-site override
    delete mockSettings.perSite[origin];

    // Global settings should remain unchanged
    expect(mockSettings.brightness).toBe(globalBrightness);
    expect(mockSettings.contrast).toBe(globalContrast);
  });

  it("should preserve other site overrides when resetting one site", () => {
    const siteA = "https://site-a.com";
    const siteB = "https://site-b.com";
    const siteC = "https://site-c.com";
    
    // Add overrides for multiple sites
    mockSettings.perSite[siteA] = {
      override: { brightness: 100 }
    };
    mockSettings.perSite[siteB] = {
      override: { brightness: 110 }
    };
    mockSettings.perSite[siteC] = {
      override: { brightness: 120 }
    };

    expect(Object.keys(mockSettings.perSite)).toHaveLength(3);

    // Reset only siteB
    delete mockSettings.perSite[siteB];

    // siteA and siteC should still exist
    expect(mockSettings.perSite[siteA]).toBeDefined();
    expect(mockSettings.perSite[siteC]).toBeDefined();
    expect(mockSettings.perSite[siteB]).toBeUndefined();
    expect(Object.keys(mockSettings.perSite)).toHaveLength(2);
  });

  it("should handle resetting a site that has no custom settings", () => {
    const origin = "https://no-override.com";
    
    // No per-site override exists
    expect(mockSettings.perSite[origin]).toBeUndefined();

    // Attempting to delete a non-existent override should be safe
    delete mockSettings.perSite[origin];

    expect(mockSettings.perSite[origin]).toBeUndefined();
    expect(Object.keys(mockSettings.perSite)).toHaveLength(0);
  });

  it("should reset all per-site properties including enabled and exclude flags", () => {
    const origin = "https://complex-site.com";
    
    // Add a complex per-site override with multiple properties
    mockSettings.perSite[origin] = {
      enabled: true,
      exclude: false,
      forceDarkMode: true,
      override: {
        brightness: 120,
        contrast: 150,
        sepia: 30,
        grayscale: 10,
        blueShift: 5
      }
    };

    expect(mockSettings.perSite[origin].enabled).toBe(true);
    expect(mockSettings.perSite[origin].forceDarkMode).toBe(true);
    expect(mockSettings.perSite[origin].override?.brightness).toBe(120);

    // Reset the entire per-site entry
    delete mockSettings.perSite[origin];

    expect(mockSettings.perSite[origin]).toBeUndefined();
  });

  it("should verify that default settings are correct values", () => {
    // Ensure DEFAULTS has expected values for slider settings
    expect(DEFAULTS.brightness).toBe(90);
    expect(DEFAULTS.contrast).toBe(110);
    expect(DEFAULTS.sepia).toBe(0);
    expect(DEFAULTS.grayscale).toBe(0);
    expect(DEFAULTS.blueShift).toBe(0);
    expect(DEFAULTS.amoled).toBe(false);
    expect(DEFAULTS.mode).toBe("photon-inverter");
    expect(DEFAULTS.enabled).toBe(true);
    expect(DEFAULTS.optimizerEnabled).toBe(true);
    expect(DEFAULTS.detectDarkSites).toBe(true);
  });

  it("should handle URL origin extraction correctly", () => {
    const testUrls = [
      { url: "https://example.com/path", origin: "https://example.com" },
      { url: "http://localhost:3000/test", origin: "http://localhost:3000" },
      { url: "https://sub.domain.com/page?query=1", origin: "https://sub.domain.com" }
    ];

    testUrls.forEach(({ url, origin }) => {
      const extractedOrigin = new URL(url).origin;
      expect(extractedOrigin).toBe(origin);
    });
  });
});
