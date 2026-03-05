// tests/regression/config.ts
//
// Central configuration for the UltraDark regression testing framework.
// Edit this file to add test sites, adjust thresholds, or tune benchmarks.

import type { Mode, Settings } from "../../src/types/settings";

// ── Algorithm registry ────────────────────────────────────────────────────────

export const ALL_ALGORITHMS: Mode[] = [
  "photon-inverter",
  "dom-walker",
  "chroma-semantic",
  "oklch-cascade",
  "perceptual-remap",
];

// ── Default settings used for benchmarks ──────────────────────────────────────

export const DEFAULT_SETTINGS: Settings = {
  enabled: true,
  mode: "oklch-cascade",
  amoled: false,
  brightness: 100,
  contrast: 105,
  sepia: 0,
  grayscale: 0,
  blueShift: 0,
  optimizerEnabled: false,
  skipDarkSites: false,
  perSite: {},
  excludeRegex: [],
  schedule: { enabled: false, start: "22:00", end: "07:00" },
};

export function settingsForMode(mode: Mode): Settings {
  return { ...DEFAULT_SETTINGS, mode };
}

// ── DOM fixture sizes ─────────────────────────────────────────────────────────
// Each tier defines a synthetic DOM complexity level.

export const DOM_TIERS = {
  small:  { nodes: 50,   depth: 3,  description: "Simple page (blog post)" },
  medium: { nodes: 500,  depth: 6,  description: "Typical page (news site)" },
  large:  { nodes: 2000, depth: 10, description: "Heavy page (dashboard)" },
  spa:    { nodes: 3000, depth: 15, description: "SPA (React/Uber Eats-like)" },
} as const;

export type DomTier = keyof typeof DOM_TIERS;

// ── Performance regression thresholds ─────────────────────────────────────────
// A metric must regress by MORE than this percentage to be flagged.
// Keeps noise from flaky timing out of regression reports.

export const REGRESSION_THRESHOLDS = {
  applyTimeMs:       0.25,  // 25% slower → flag
  resetTimeMs:       0.30,  // 30% slower → flag
  cssOutputBytes:    0.15,  // 15% larger → flag
  domMutations:      0.10,  // 10% more mutations → flag
  perNodeApplyUs:    0.25,  // 25% slower per-node → flag
  cssPerNode:        0.15,  // 15% more CSS per node → flag
} as const;

export type MetricName = keyof typeof REGRESSION_THRESHOLDS;

// ── Benchmark tuning ──────────────────────────────────────────────────────────

export const BENCH_CONFIG = {
  /** Warm-up runs discarded before measurement */
  warmupRuns:   3,
  /** Measured runs (median is taken) */
  measuredRuns: 10,
  /** Max time (ms) for a single algorithm apply before aborting */
  timeoutMs:    5000,
};

// ── Test sites for visual regression (Playwright) ─────────────────────────────
// Add entries here; the visual test runner iterates this list.

export interface TestSite {
  name: string;
  url: string;
  /** Optional: wait for this selector before capturing screenshot */
  waitFor?: string;
  /** Optional: viewport override (default 1280×800) */
  viewport?: { width: number; height: number };
  /** Tags for filtering runs, e.g. ["spa","react"] */
  tags?: string[];
}

export const TEST_SITES: TestSite[] = [
  {
    name: "imdb-top250",
    url: "https://www.imdb.com/chart/top/",
    waitFor: ".ipc-metadata-list",
    tags: ["media", "list-heavy"],
  },
  {
    name: "the-register",
    url: "https://www.theregister.com/",
    waitFor: "article",
    tags: ["news", "text-heavy"],
  },
  {
    name: "ubereats-au",
    url: "https://www.ubereats.com/au",
    waitFor: "[data-testid]",
    tags: ["spa", "react", "obfuscated"],
  },
  {
    name: "github-explore",
    url: "https://github.com/explore",
    waitFor: "main",
    tags: ["spa", "dark-native"],
  },
  {
    name: "wikipedia-main",
    url: "https://en.wikipedia.org/wiki/Main_Page",
    waitFor: "#content",
    tags: ["static", "text-heavy"],
  },
  {
    name: "stackoverflow-questions",
    url: "https://stackoverflow.com/questions",
    waitFor: "#questions",
    tags: ["list-heavy", "mixed-content"],
  },
];

// ── Baseline storage paths ────────────────────────────────────────────────────

export const PATHS = {
  baselinesDir: "tests/regression/.baselines",
  perfHistory:  "tests/regression/.baselines/perf-history.jsonl",
  visualDir:    "tests/regression/.baselines/screenshots",
};
