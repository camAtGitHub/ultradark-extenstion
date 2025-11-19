// src/types/settings.d.ts
export type Mode = "photon-inverter" | "dom-walker" | "chroma-semantic";
export interface Schedule {
  enabled: boolean;
  start: string; // "22:00"
  end: string;   // "07:00"
}
export interface SiteOverride {
  enabled?: boolean;
  exclude?: boolean;
  override?: Partial<Settings>;
  forceDarkMode?: boolean; // Force UltraDark even if site is detected as dark
}
export interface Settings {
  enabled: boolean;
  mode: Mode;
  amoled: boolean;
  brightness: number; // 0..100 (%)
  contrast: number;   // 50..200 (%)
  sepia: number;      // 0..100 (%)
  grayscale: number;  // 0..100 (%)
  blueShift: number;  // 0..100 (%) -> hue rotation scaled internally
  optimizerEnabled: boolean;
  detectDarkSites: boolean; // Auto-detect if sites are already dark
  perSite: Record<string, SiteOverride>;
  excludeRegex: string[];
  schedule: Schedule;
}
export interface OptimizerSample {
  fg: string;
  bg: string;
}
export interface OptimizerResult {
  suggestedContrast: number; // 50..200
}