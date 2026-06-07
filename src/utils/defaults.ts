// File: src/utils/defaults.ts
import type { Settings } from "../types/settings";

export const DEFAULTS: Settings = {
  enabled: true,
  mode: "photon-inverter",
  amoled: false,
  brightness: 100, // Changed from 90. 100% is neutral inversion. <100 darkens an already inverted page.
  contrast: 105, // Changed from 110. 105% improves readability without being too harsh.
  sepia: 0,
  grayscale: 0,
  blueShift: 0,
  optimizerEnabled: true,
  skipDarkSites: true,
  perSite: {},
  excludeRegex: [],
  schedule: { enabled: false, start: "21:00", end: "07:00" },
};

export const STYLE_TAG_ID = "udr-style";
export const DATA_ATTR_APPLIED = "data-udr-applied";
