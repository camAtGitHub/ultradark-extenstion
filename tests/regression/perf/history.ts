// tests/regression/perf/history.ts
//
// Append-only JSONL storage for performance baselines.
// Each line is a complete NormalizedMetrics snapshot.
// Regression detection compares current run against the last recorded baseline.

import { readFileSync, writeFileSync, appendFileSync, existsSync, mkdirSync } from "fs";
import { dirname } from "path";
import { execSync } from "child_process";
import type { NormalizedMetrics } from "./metrics";
import type { MetricName } from "../config";
import { REGRESSION_THRESHOLDS, PATHS } from "../config";

// ── Git hash helper ───────────────────────────────────────────────────────────

export function getGitHash(): string {
  try {
    return execSync("git rev-parse --short HEAD", { encoding: "utf-8" }).trim();
  } catch {
    return "unknown";
  }
}

// ── Read/write JSONL ──────────────────────────────────────────────────────────

function ensureDir(path: string): void {
  const dir = dirname(path);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
}

export function readHistory(path = PATHS.perfHistory): NormalizedMetrics[] {
  if (!existsSync(path)) return [];
  const content = readFileSync(path, "utf-8").trim();
  if (!content) return [];
  return content.split("\n").map((line) => JSON.parse(line) as NormalizedMetrics);
}

export function appendToHistory(entry: NormalizedMetrics, path = PATHS.perfHistory): void {
  ensureDir(path);
  appendFileSync(path, JSON.stringify(entry) + "\n");
}

export function writeHistory(entries: NormalizedMetrics[], path = PATHS.perfHistory): void {
  ensureDir(path);
  writeFileSync(path, entries.map((e) => JSON.stringify(e)).join("\n") + "\n");
}

// ── Baseline lookup ───────────────────────────────────────────────────────────
// Finds the most recent entry for a given algorithm+tier combination.

export function getBaseline(
  algorithm: string,
  tier: string,
  history?: NormalizedMetrics[]
): NormalizedMetrics | null {
  const entries = history ?? readHistory();
  // Walk backwards to find most recent match
  for (let i = entries.length - 1; i >= 0; i--) {
    if (entries[i].algorithm === algorithm && entries[i].tier === tier) {
      return entries[i];
    }
  }
  return null;
}

// ── Regression detection ──────────────────────────────────────────────────────

export interface RegressionResult {
  metric: MetricName;
  baseline: number;
  current: number;
  changePercent: number;
  threshold: number;
  regressed: boolean;
}

export interface ComparisonReport {
  algorithm: string;
  tier: string;
  gitHash: string;
  baselineHash: string | undefined;
  results: RegressionResult[];
  hasRegression: boolean;
  summary: string;
}

const METRIC_KEYS: MetricName[] = [
  "applyTimeMs",
  "resetTimeMs",
  "cssOutputBytes",
  "domMutations",
  "perNodeApplyUs",
  "cssPerNode",
];

export function compareToBaseline(
  current: NormalizedMetrics,
  baseline: NormalizedMetrics | null,
  skipMetrics?: MetricName[]
): ComparisonReport {
  if (!baseline) {
    return {
      algorithm: current.algorithm,
      tier: current.tier,
      gitHash: current.gitHash ?? "unknown",
      baselineHash: undefined,
      results: [],
      hasRegression: false,
      summary: `First run for ${current.algorithm}/${current.tier} — saved as baseline.`,
    };
  }

  const results: RegressionResult[] = [];
  let hasRegression = false;

  for (const metric of METRIC_KEYS) {
    const bVal = baseline[metric];
    const cVal = current[metric];
    const threshold = REGRESSION_THRESHOLDS[metric];

    // Avoid division by zero; if baseline is 0, any positive value is a regression
    const changePercent = bVal === 0 ? (cVal > 0 ? 1.0 : 0) : (cVal - bVal) / bVal;

    const regressed = changePercent > threshold && !skipMetrics?.includes(metric);
    if (regressed) hasRegression = true;

    results.push({
      metric,
      baseline: bVal,
      current: cVal,
      changePercent,
      threshold,
      regressed,
    });
  }

  const regressedMetrics = results.filter((r) => r.regressed);
  const summary = hasRegression
    ? `REGRESSION in ${current.algorithm}/${current.tier}: ${regressedMetrics
        .map(
          (r) =>
            `${r.metric} +${(r.changePercent * 100).toFixed(1)}% (threshold ${(r.threshold * 100).toFixed(0)}%)`
        )
        .join(", ")}`
    : `OK: ${current.algorithm}/${current.tier} within thresholds.`;

  return {
    algorithm: current.algorithm,
    tier: current.tier,
    gitHash: current.gitHash ?? "unknown",
    baselineHash: baseline.gitHash,
    results,
    hasRegression,
    summary,
  };
}

// ── History summary (last N entries for a given algorithm) ─────────────────────

export function recentEntries(
  algorithm: string,
  tier: string,
  count = 10,
  history?: NormalizedMetrics[]
): NormalizedMetrics[] {
  const entries = history ?? readHistory();
  return entries.filter((e) => e.algorithm === algorithm && e.tier === tier).slice(-count);
}
