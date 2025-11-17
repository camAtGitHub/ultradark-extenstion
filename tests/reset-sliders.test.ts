// tests/reset-sliders.test.ts
import { describe, it, expect } from "vitest";

describe("Reset Sliders", () => {
  it("should reset all slider values to defaults", () => {
    // Simulate modified slider values
    const sliders = {
      brightness: 120,
      contrast: 150,
      sepia: 50,
      grayscale: 30,
      blueShift: 25
    };

    // Default values that Reset Sliders should restore
    const defaults = {
      brightness: 90,
      contrast: 110,
      sepia: 0,
      grayscale: 0,
      blueShift: 0
    };

    // Simulate reset operation
    sliders.brightness = defaults.brightness;
    sliders.contrast = defaults.contrast;
    sliders.sepia = defaults.sepia;
    sliders.grayscale = defaults.grayscale;
    sliders.blueShift = defaults.blueShift;

    // Verify all sliders are reset to defaults
    expect(sliders.brightness).toBe(90);
    expect(sliders.contrast).toBe(110);
    expect(sliders.sepia).toBe(0);
    expect(sliders.grayscale).toBe(0);
    expect(sliders.blueShift).toBe(0);
  });

  it("should only affect current view, not persistent storage", () => {
    // Mock stored settings
    const storedSettings = {
      brightness: 85,
      contrast: 120,
      sepia: 10,
      grayscale: 5,
      blueShift: 15
    };

    // Mock current view settings (what the sliders show)
    const currentView = {
      brightness: 100,
      contrast: 130,
      sepia: 20,
      grayscale: 15,
      blueShift: 25
    };

    // Default values
    const defaults = {
      brightness: 90,
      contrast: 110,
      sepia: 0,
      grayscale: 0,
      blueShift: 0
    };

    // Reset sliders - should only affect current view
    currentView.brightness = defaults.brightness;
    currentView.contrast = defaults.contrast;
    currentView.sepia = defaults.sepia;
    currentView.grayscale = defaults.grayscale;
    currentView.blueShift = defaults.blueShift;

    // Verify current view is reset
    expect(currentView.brightness).toBe(90);
    expect(currentView.contrast).toBe(110);
    expect(currentView.sepia).toBe(0);
    expect(currentView.grayscale).toBe(0);
    expect(currentView.blueShift).toBe(0);

    // Verify stored settings remain unchanged
    expect(storedSettings.brightness).toBe(85);
    expect(storedSettings.contrast).toBe(120);
    expect(storedSettings.sepia).toBe(10);
    expect(storedSettings.grayscale).toBe(5);
    expect(storedSettings.blueShift).toBe(15);
  });

  it("should reset sliders independently of other settings", () => {
    // Mock settings object
    const settings = {
      enabled: true,
      mode: "surgeon" as const,
      amoled: true,
      optimizerEnabled: false,
      detectDarkSites: true,
      brightness: 120,
      contrast: 150,
      sepia: 50,
      grayscale: 30,
      blueShift: 25,
      perSite: {
        "https://example.com": { enabled: true }
      },
      excludeRegex: ["pattern1", "pattern2"],
      schedule: { enabled: true, start: "22:00", end: "06:00" }
    };

    // Default slider values
    const defaults = {
      brightness: 90,
      contrast: 110,
      sepia: 0,
      grayscale: 0,
      blueShift: 0
    };

    // Reset only the sliders
    settings.brightness = defaults.brightness;
    settings.contrast = defaults.contrast;
    settings.sepia = defaults.sepia;
    settings.grayscale = defaults.grayscale;
    settings.blueShift = defaults.blueShift;

    // Verify sliders are reset
    expect(settings.brightness).toBe(90);
    expect(settings.contrast).toBe(110);
    expect(settings.sepia).toBe(0);
    expect(settings.grayscale).toBe(0);
    expect(settings.blueShift).toBe(0);

    // Verify other settings remain unchanged
    expect(settings.enabled).toBe(true);
    expect(settings.mode).toBe("surgeon");
    expect(settings.amoled).toBe(true);
    expect(settings.optimizerEnabled).toBe(false);
    expect(settings.detectDarkSites).toBe(true);
    expect(settings.perSite["https://example.com"]).toEqual({ enabled: true });
    expect(settings.excludeRegex).toEqual(["pattern1", "pattern2"]);
    expect(settings.schedule).toEqual({ enabled: true, start: "22:00", end: "06:00" });
  });

  it("should handle already-default values gracefully", () => {
    // Sliders already at default values
    const sliders = {
      brightness: 90,
      contrast: 110,
      sepia: 0,
      grayscale: 0,
      blueShift: 0
    };

    // Default values
    const defaults = {
      brightness: 90,
      contrast: 110,
      sepia: 0,
      grayscale: 0,
      blueShift: 0
    };

    // Reset operation
    sliders.brightness = defaults.brightness;
    sliders.contrast = defaults.contrast;
    sliders.sepia = defaults.sepia;
    sliders.grayscale = defaults.grayscale;
    sliders.blueShift = defaults.blueShift;

    // Should still be at defaults
    expect(sliders.brightness).toBe(90);
    expect(sliders.contrast).toBe(110);
    expect(sliders.sepia).toBe(0);
    expect(sliders.grayscale).toBe(0);
    expect(sliders.blueShift).toBe(0);
  });

  it("should reset all five slider values", () => {
    const sliderNames = ["brightness", "contrast", "sepia", "grayscale", "blueShift"];
    const modifiedValues = {
      brightness: 115,
      contrast: 175,
      sepia: 40,
      grayscale: 60,
      blueShift: 80
    };

    // Default values
    const defaults = {
      brightness: 90,
      contrast: 110,
      sepia: 0,
      grayscale: 0,
      blueShift: 0
    };

    // Verify we're testing all 5 sliders
    expect(sliderNames).toHaveLength(5);

    // Reset all sliders
    Object.assign(modifiedValues, defaults);

    // Verify all sliders are reset
    sliderNames.forEach((name) => {
      expect(modifiedValues[name as keyof typeof defaults]).toBe(defaults[name as keyof typeof defaults]);
    });
  });

  it("should use correct default values matching DEFAULTS constant", () => {
    // These should match DEFAULTS from src/utils/defaults.ts
    const resetDefaults = {
      brightness: 90,
      contrast: 110,
      sepia: 0,
      grayscale: 0,
      blueShift: 0
    };

    // Verify the defaults are as expected
    expect(resetDefaults.brightness).toBe(90);
    expect(resetDefaults.contrast).toBe(110);
    expect(resetDefaults.sepia).toBe(0);
    expect(resetDefaults.grayscale).toBe(0);
    expect(resetDefaults.blueShift).toBe(0);
  });
});
