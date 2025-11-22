// tests/popup-algorithm-controls.test.ts
import { describe, it, expect, beforeEach } from "vitest";
import { JSDOM } from "jsdom";
import { updateAlgorithmControlState, sliderModeMap } from "../src/popup/algorithm-controls";

const sliderTemplate = `
  <div class="sliders">
    <div class="slider-row"><input type="range" id="brightness" /></div>
    <div class="slider-row"><input type="range" id="contrast" /></div>
    <div class="slider-row"><input type="range" id="sepia" /></div>
    <div class="slider-row"><input type="range" id="grayscale" /></div>
    <div class="slider-row"><input type="range" id="blueShift" /></div>
  </div>
`;

describe("popup algorithm control state", () => {
  let dom: JSDOM;

  beforeEach(() => {
    dom = new JSDOM(sliderTemplate);
  });

  it("enables sliders for the Chroma-Semantic engine", () => {
    const { document } = dom.window;

    updateAlgorithmControlState("chroma-semantic", document);

    sliderModeMap["chroma-semantic"].forEach((id) => {
      const input = document.querySelector<HTMLInputElement>(`#${id}`)!;
      const row = input.closest<HTMLElement>(".slider-row")!;

      expect(input.disabled).toBe(false);
      expect(row.classList.contains("disabled")).toBe(false);
    });
  });

  it("disables all sliders for Photon Inverter", () => {
    const { document } = dom.window;

    updateAlgorithmControlState("photon-inverter", document);

    document.querySelectorAll<HTMLInputElement>("input[type='range']").forEach((input) => {
      const row = input.closest<HTMLElement>(".slider-row")!;

      expect(input.disabled).toBe(true);
      expect(row.classList.contains("disabled")).toBe(true);
    });
  });

  it("disables all sliders for DOM Walker", () => {
    const { document } = dom.window;

    updateAlgorithmControlState("dom-walker", document);

    document.querySelectorAll<HTMLInputElement>("input[type='range']").forEach((input) => {
      const row = input.closest<HTMLElement>(".slider-row")!;

      expect(input.disabled).toBe(true);
      expect(row.classList.contains("disabled")).toBe(true);
    });
  });
});

