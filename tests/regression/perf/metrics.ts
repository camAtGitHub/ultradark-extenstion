// tests/regression/perf/metrics.ts
//
// Collects raw performance metrics from benchmark runs, normalizes them
// for cross-algorithm comparison, and produces a structured result object.

import type { Mode } from "../../../src/types/settings";
import type { DomTier, MetricName } from "../config";

// ── Raw metric snapshot from a single run ─────────────────────────────────────

export interface RawMetrics {
  algorithm: Mode;
  tier: DomTier;
  nodeCount: number;
  applyTimeMs: number;
  resetTimeMs: number;
  cssOutputBytes: number;
  domMutations: number;
  timestamp: number;
  gitHash?: string;
}

// ── Normalized metrics (per-node costs, efficiency ratios) ────────────────────

export interface NormalizedMetrics extends RawMetrics {
  /** Microseconds per DOM node to apply */
  perNodeApplyUs: number;
  /** CSS bytes generated per DOM node */
  cssPerNode: number;
}

export function normalize(raw: RawMetrics): NormalizedMetrics {
  const n = Math.max(raw.nodeCount, 1);
  return {
    ...raw,
    perNodeApplyUs: (raw.applyTimeMs / n) * 1000,
    cssPerNode: raw.cssOutputBytes / n,
  };
}

// ── Aggregation: take median of multiple runs ─────────────────────────────────

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

export function aggregateRuns(runs: RawMetrics[]): RawMetrics {
  if (runs.length === 0) throw new Error("Cannot aggregate zero runs");

  const first = runs[0];
  return {
    algorithm: first.algorithm,
    tier: first.tier,
    nodeCount: first.nodeCount,
    applyTimeMs: median(runs.map((r) => r.applyTimeMs)),
    resetTimeMs: median(runs.map((r) => r.resetTimeMs)),
    cssOutputBytes: median(runs.map((r) => r.cssOutputBytes)),
    domMutations: median(runs.map((r) => r.domMutations)),
    timestamp: Date.now(),
    gitHash: first.gitHash,
  };
}

// ── Cross-algorithm ranking ───────────────────────────────────────────────────
// Given normalized metrics for all algorithms on the SAME tier,
// produce a ranking from fastest (1) to slowest (N) for each metric.

export interface AlgorithmRanking {
  algorithm: Mode;
  tier: DomTier;
  ranks: Record<MetricName, number>;
  /** Composite score: lower is better (sum of ranks) */
  compositeRank: number;
}

const RANKED_METRICS: MetricName[] = [
  "applyTimeMs",
  "resetTimeMs",
  "cssOutputBytes",
  "domMutations",
  "perNodeApplyUs",
  "cssPerNode",
];

export function rankAlgorithms(results: NormalizedMetrics[]): AlgorithmRanking[] {
  // For each metric, sort algorithms and assign rank
  const rankMaps: Record<MetricName, Map<Mode, number>> = {} as never;

  for (const metric of RANKED_METRICS) {
    const sorted = [...results].sort((a, b) => a[metric] - b[metric]);
    const map = new Map<Mode, number>();
    sorted.forEach((r, i) => map.set(r.algorithm, i + 1));
    rankMaps[metric] = map;
  }

  return results
    .map((r) => {
      const ranks: Record<MetricName, number> = {} as never;
      let compositeRank = 0;
      for (const metric of RANKED_METRICS) {
        const rank = rankMaps[metric].get(r.algorithm) ?? results.length;
        ranks[metric] = rank;
        compositeRank += rank;
      }
      return {
        algorithm: r.algorithm,
        tier: r.tier,
        ranks,
        compositeRank,
      };
    })
    .sort((a, b) => a.compositeRank - b.compositeRank);
}

// ── Metric extraction helper ──────────────────────────────────────────────────

export function getMetricValue(m: NormalizedMetrics, name: MetricName): number {
  return m[name];
}

// ── Pretty-print a single result ──────────────────────────────────────────────

export function formatMetrics(m: NormalizedMetrics): string {
  const lines = [
    `  Algorithm:     ${m.algorithm}`,
    `  DOM tier:      ${m.tier} (${m.nodeCount} nodes)`,
    `  Apply time:    ${m.applyTimeMs.toFixed(2)} ms  (${m.perNodeApplyUs.toFixed(1)} µs/node)`,
    `  Reset time:    ${m.resetTimeMs.toFixed(2)} ms`,
    `  CSS output:    ${m.cssOutputBytes} bytes  (${m.cssPerNode.toFixed(1)} B/node)`,
    `  DOM mutations: ${m.domMutations}`,
  ];
  return lines.join("\n");
}
