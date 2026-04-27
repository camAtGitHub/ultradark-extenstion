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
// Each tier defines a synthetic DOM complexity level, calibrated against
// real-world DOM measurements (March 2026):
//
//   366/10   lightweight text page        →  small
//   892/14   docs site                    ┐
//   1474/19  blog                         ├─ medium
//   1787/36  deep-nested blog             ┘
//   2552/37  mid-weight SPA               ┐
//   2985/21  news site                    ├─ large
//   3460/62  Google Search (extreme depth)│
//   4146/37  heavy page                   ┘
//   5133/43  GitHub                       ┐
//   6083/22  documentation                ├─ heavy
//   6457/26  OS project docs              ┘
//   82735/38 YouTube (multi-nav)          →  extreme
//
// Depth is intentionally set to exceed chroma-semantic's MAX_DEPTH=15
// from the medium tier onwards, exposing missed deep subtrees.

export const DOM_TIERS = {
  small: {
    nodes: 400,
    depth: 10,
    spaLike: false,
    description: "Lightweight page (text blog, docs)",
  },
  medium: {
    nodes: 2000,
    depth: 22,
    spaLike: false,
    description: "Typical page (news site, Uber Eats-class)",
  },
  large: {
    nodes: 5000,
    depth: 37,
    spaLike: false,
    description: "Heavy page (IMDB, Register, deep Google-class)",
  },
  heavy: {
    nodes: 12000,
    depth: 43,
    spaLike: true,
    description: "Post-scroll SPA (GitHub, IMDB after lazy-load)",
  },
  extreme: {
    nodes: 85000,
    depth: 40,
    spaLike: true,
    description: "Stress test (YouTube after multi-page navigation)",
  },
} as const;

export type DomTier = keyof typeof DOM_TIERS;

// ── Performance regression thresholds ─────────────────────────────────────────
// A metric must regress by MORE than this percentage to be flagged.
// Keeps noise from flaky timing out of regression reports.

export const REGRESSION_THRESHOLDS = {
  applyTimeMs: 0.25, // 25% slower → flag
  resetTimeMs: 0.3, // 30% slower → flag
  cssOutputBytes: 0.15, // 15% larger → flag
  domMutations: 0.1, // 10% more mutations → flag
  perNodeApplyUs: 0.25, // 25% slower per-node → flag
  cssPerNode: 0.15, // 15% more CSS per node → flag
} as const;

export type MetricName = keyof typeof REGRESSION_THRESHOLDS;

// ── Benchmark tuning ──────────────────────────────────────────────────────────

export const BENCH_CONFIG = {
  /** Warm-up runs discarded before measurement */
  warmupRuns: 3,
  /** Measured runs (median is taken) */
  measuredRuns: 10,
  /** Default max time (ms) for a single algorithm apply before aborting */
  timeoutMs: 5000,
  /** Per-tier timeout overrides (extreme tier needs much more headroom) */
  tierTimeoutMs: {
    small: 2000,
    medium: 5000,
    large: 10000,
    heavy: 30000,
    extreme: 120000,
  } as Record<DomTier, number>,
  /** Tiers where timing-based regression comparison is skipped (jitter-dominated) */
  skipTimingRegression: ["small"] as DomTier[],
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
  perfHistory: "tests/regression/.baselines/perf-history.jsonl",
  visualDir: "tests/regression/.baselines/screenshots",
};
