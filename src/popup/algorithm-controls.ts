// src/popup/algorithm-controls.ts
import type { Mode } from "../types/settings";

const sliderIds = ["brightness", "contrast", "sepia", "grayscale", "blueShift"] as const;

export type SliderId = (typeof sliderIds)[number];

/**
 * Map of which sliders apply to each algorithm.
 * Only the Chroma-Semantic engine exposes fine-tuning in the current UI,
 * so sliders are disabled for the other algorithms to avoid confusion.
 */
export const sliderModeMap: Record<Mode, SliderId[]> = {
  "photon-inverter": [],
  "dom-walker": [],
  "chroma-semantic": [...sliderIds]
};

export function updateAlgorithmControlState(activeMode: Mode, root: ParentNode = document): void {
  const enabled = new Set(sliderModeMap[activeMode] || []);

  sliderIds.forEach((id) => {
    const input = root.querySelector<HTMLInputElement>(`#${id}`);
    if (!input) return;

    const shouldEnable = enabled.has(id);
    input.disabled = !shouldEnable;

    const row = input.closest<HTMLElement>(".slider-row");
    row?.classList.toggle("disabled", !shouldEnable);
  });
}
