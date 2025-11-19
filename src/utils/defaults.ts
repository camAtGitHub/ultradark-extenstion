// src/utils/defaults.ts
import type { Settings } from "../types/settings";

export const DEFAULTS: Settings = {
  enabled: true,
  mode: "photon-inverter",
  amoled: false,
  brightness: 90,
  contrast: 110,
  sepia: 0,
  grayscale: 0,
  blueShift: 0,
  optimizerEnabled: true,
  detectDarkSites: true, // Auto-detect dark sites by default
  perSite: {},
  excludeRegex: [],
  schedule: { enabled: false, start: "21:00", end: "07:00" }
};

export const STYLE_TAG_ID = "udr-style";
export const DATA_ATTR_APPLIED = "data-udr-applied";
