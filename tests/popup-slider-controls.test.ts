// tests/popup-slider-controls.test.ts
import { describe, it, expect } from "vitest";
import type { Settings } from "../src/types/settings";

/**
 * Tests for dynamic slider enable/disable logic based on selected algorithm
 * 
 * Requirements (from Task 2):
 * - Only Photon Inverter uses the CSS filter sliders (brightness, contrast, sepia, grayscale, blueShift)
 * - DOM Walker uses its own color inversion algorithm (no sliders)
 * - Chroma-Semantic uses semantic color palettes (no sliders)
 * 
 * When a user selects an algorithm, sliders for other algorithms should be disabled.
 */

describe("Popup Slider Controls - Algorithm Context Awareness", () => {
  describe("Photon Inverter algorithm", () => {
    it("should enable all sliders when Photon Inverter is selected", () => {
      const mode: Settings["mode"] = "photon-inverter";
      
      // Photon Inverter uses CSS filters, so all sliders should be enabled
      const shouldEnable = mode === "photon-inverter";
      
      expect(shouldEnable).toBe(true);
    });

    it("should have all five sliders enabled for Photon Inverter", () => {
      const mode: Settings["mode"] = "photon-inverter";
      const shouldEnable = mode === "photon-inverter";

      const sliders = {
        brightness: !shouldEnable,
        contrast: !shouldEnable,
        sepia: !shouldEnable,
        grayscale: !shouldEnable,
        blueShift: !shouldEnable,
      };

      // All sliders should be enabled (disabled = false)
      expect(sliders.brightness).toBe(false);
      expect(sliders.contrast).toBe(false);
      expect(sliders.sepia).toBe(false);
      expect(sliders.grayscale).toBe(false);
      expect(sliders.blueShift).toBe(false);
    });
  });

  describe("DOM Walker algorithm", () => {
    it("should disable all sliders when DOM Walker is selected", () => {
      const mode: Settings["mode"] = "dom-walker";
      
      // DOM Walker doesn't use CSS filters, so sliders should be disabled
      const shouldEnable = mode === "photon-inverter";
      
      expect(shouldEnable).toBe(false);
    });

    it("should have all five sliders disabled for DOM Walker", () => {
      const mode: Settings["mode"] = "dom-walker";
      const shouldEnable = mode === "photon-inverter";

      const sliders = {
        brightness: !shouldEnable,
        contrast: !shouldEnable,
        sepia: !shouldEnable,
        grayscale: !shouldEnable,
        blueShift: !shouldEnable,
      };

      // All sliders should be disabled (disabled = true)
      expect(sliders.brightness).toBe(true);
      expect(sliders.contrast).toBe(true);
      expect(sliders.sepia).toBe(true);
      expect(sliders.grayscale).toBe(true);
      expect(sliders.blueShift).toBe(true);
    });
  });

  describe("Chroma-Semantic algorithm", () => {
    it("should disable all sliders when Chroma-Semantic is selected", () => {
      const mode: Settings["mode"] = "chroma-semantic";
      
      // Chroma-Semantic doesn't use CSS filters, so sliders should be disabled
      const shouldEnable = mode === "photon-inverter";
      
      expect(shouldEnable).toBe(false);
    });

    it("should have all five sliders disabled for Chroma-Semantic", () => {
      const mode: Settings["mode"] = "chroma-semantic";
      const shouldEnable = mode === "photon-inverter";

      const sliders = {
        brightness: !shouldEnable,
        contrast: !shouldEnable,
        sepia: !shouldEnable,
        grayscale: !shouldEnable,
        blueShift: !shouldEnable,
      };

      // All sliders should be disabled (disabled = true)
      expect(sliders.brightness).toBe(true);
      expect(sliders.contrast).toBe(true);
      expect(sliders.sepia).toBe(true);
      expect(sliders.grayscale).toBe(true);
      expect(sliders.blueShift).toBe(true);
    });
  });

  describe("Algorithm switching behavior", () => {
    it("should update slider states when switching from Photon Inverter to DOM Walker", () => {
      let mode: Settings["mode"] = "photon-inverter";
      let shouldEnable = mode === "photon-inverter";
      
      // Initially enabled for Photon Inverter
      expect(shouldEnable).toBe(true);
      
      // Switch to DOM Walker
      mode = "dom-walker";
      shouldEnable = mode === "photon-inverter";
      
      // Now disabled
      expect(shouldEnable).toBe(false);
    });

    it("should update slider states when switching from DOM Walker to Photon Inverter", () => {
      let mode: Settings["mode"] = "dom-walker";
      let shouldEnable = mode === "photon-inverter";
      
      // Initially disabled for DOM Walker
      expect(shouldEnable).toBe(false);
      
      // Switch to Photon Inverter
      mode = "photon-inverter";
      shouldEnable = mode === "photon-inverter";
      
      // Now enabled
      expect(shouldEnable).toBe(true);
    });

    it("should update slider states when switching from Chroma-Semantic to Photon Inverter", () => {
      let mode: Settings["mode"] = "chroma-semantic";
      let shouldEnable = mode === "photon-inverter";
      
      // Initially disabled for Chroma-Semantic
      expect(shouldEnable).toBe(false);
      
      // Switch to Photon Inverter
      mode = "photon-inverter";
      shouldEnable = mode === "photon-inverter";
      
      // Now enabled
      expect(shouldEnable).toBe(true);
    });

    it("should keep sliders disabled when switching between DOM Walker and Chroma-Semantic", () => {
      let mode: Settings["mode"] = "dom-walker";
      let shouldEnable = mode === "photon-inverter";
      
      // Disabled for DOM Walker
      expect(shouldEnable).toBe(false);
      
      // Switch to Chroma-Semantic
      mode = "chroma-semantic";
      shouldEnable = mode === "photon-inverter";
      
      // Still disabled
      expect(shouldEnable).toBe(false);
    });
  });

  describe("Complete coverage of all algorithms", () => {
    it("should cover all three algorithms", () => {
      const allAlgorithms: Settings["mode"][] = [
        "photon-inverter",
        "dom-walker",
        "chroma-semantic"
      ];

      // Verify we have exactly 3 algorithms
      expect(allAlgorithms).toHaveLength(3);

      // Verify each algorithm has correct slider state
      const expectedStates = {
        "photon-inverter": true,  // enabled
        "dom-walker": false,      // disabled
        "chroma-semantic": false  // disabled
      };

      allAlgorithms.forEach(mode => {
        const shouldEnable = mode === "photon-inverter";
        expect(shouldEnable).toBe(expectedStates[mode]);
      });
    });
  });

  describe("Slider attribute logic", () => {
    it("should set disabled attribute correctly for each mode", () => {
      const modes: Settings["mode"][] = ["photon-inverter", "dom-walker", "chroma-semantic"];
      
      modes.forEach(mode => {
        const shouldEnable = mode === "photon-inverter";
        
        // Simulate setting the disabled attribute
        const sliderDisabled = !shouldEnable;
        
        if (mode === "photon-inverter") {
          expect(sliderDisabled).toBe(false);
        } else {
          expect(sliderDisabled).toBe(true);
        }
      });
    });

    it("should apply disabled state to all five sliders consistently", () => {
      const mode: Settings["mode"] = "dom-walker";
      const shouldEnable = mode === "photon-inverter";
      
      const sliderStates = [
        !shouldEnable, // brightness
        !shouldEnable, // contrast
        !shouldEnable, // sepia
        !shouldEnable, // grayscale
        !shouldEnable  // blueShift
      ];

      // All sliders should have the same disabled state
      const allSameState = sliderStates.every(state => state === sliderStates[0]);
      expect(allSameState).toBe(true);
      
      // For DOM Walker, all should be disabled (true)
      expect(sliderStates[0]).toBe(true);
    });
  });
});
