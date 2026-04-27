// tests/regression/run.ts
//
// CLI orchestrator for UltraDark regression testing.
//
// Usage:
//   npx tsx tests/regression/run.ts perf           # Run performance benchmarks
//   npx tsx tests/regression/run.ts visual          # Run visual regression (needs Playwright)
//   npx tsx tests/regression/run.ts visual --update # Update visual baselines
//   npx tsx tests/regression/run.ts report          # Show latest comparison report
//   npx tsx tests/regression/run.ts history         # Show performance trend
//   npx tsx tests/regression/run.ts reset           # Clear all baselines

import { execSync } from "child_process";
import { existsSync, rmSync, readFileSync } from "fs";
import { resolve } from "path";
import { PATHS, ALL_ALGORITHMS, DOM_TIERS } from "./config";
import type { DomTier } from "./config";
import { readHistory, recentEntries } from "./perf/history";
import type { NormalizedMetrics } from "./perf/metrics";

const COMMANDS = ["perf", "visual", "report", "history", "reset"] as const;
type Command = (typeof COMMANDS)[number];

function usage(): void {
  console.log(`
UltraDark Regression Test Runner
═════════════════════════════════

Commands:
  perf              Run performance benchmarks (vitest, no browser needed)
  visual [flags]    Run visual regression (Playwright + Firefox)
    --update        Update baselines instead of comparing
    --site=NAME     Test specific site only
    --algo=NAME     Test specific algorithm only
  report            Display latest regression comparison
  history           Show performance trend (last 10 runs per algorithm)
  reset             Clear all baselines (you'll be prompted)

Examples:
  npx tsx tests/regression/run.ts perf
  npx tsx tests/regression/run.ts visual --update
  npx tsx tests/regression/run.ts visual --site=ubereats-au --algo=oklch-cascade
  npx tsx tests/regression/run.ts report
`);
}

function runPerf(): void {
  console.log("🏃 Running performance benchmarks...\n");
  try {
    execSync("npx vitest run tests/regression/perf/benchmarks.test.ts --reporter=verbose", {
      stdio: "inherit",
      cwd: resolve("."),
    });
  } catch {
    // vitest exits non-zero if tests fail — that's expected
    process.exitCode = 1;
  }
}

function runVisual(args: string[]): void {
  console.log("📸 Running visual regression tests...\n");
  const flags = args.filter((a) => a.startsWith("--")).join(" ");
  try {
    execSync(`npx tsx tests/regression/visual/capture.ts ${flags}`, {
      stdio: "inherit",
      cwd: resolve("."),
    });
  } catch {
    process.exitCode = 1;
  }
}

function showReport(): void {
  const history = readHistory();
  if (history.length === 0) {
    console.log("No benchmark history found. Run 'perf' first.");
    return;
  }

  console.log("📊 Latest Performance Report\n");
  console.log(`Total entries in history: ${history.length}`);
  console.log("");

  // Group by tier, show latest entry per algorithm
  for (const tier of Object.keys(DOM_TIERS) as DomTier[]) {
    const tierEntries = new Map<string, NormalizedMetrics>();

    for (const entry of history) {
      if (entry.tier === tier) {
        tierEntries.set(entry.algorithm, entry);
      }
    }

    if (tierEntries.size === 0) continue;

    console.log(`── ${tier} tier ──────────────────────────────────────────`);
    console.log(
      "  " +
        "Algorithm".padEnd(22) +
        "Apply(ms)".padEnd(12) +
        "Reset(ms)".padEnd(12) +
        "CSS(B)".padEnd(10) +
        "Mutations".padEnd(12) +
        "µs/node".padEnd(10) +
        "Git"
    );

    for (const [algo, m] of tierEntries) {
      console.log(
        "  " +
          algo.padEnd(22) +
          m.applyTimeMs.toFixed(2).padEnd(12) +
          m.resetTimeMs.toFixed(2).padEnd(12) +
          String(m.cssOutputBytes).padEnd(10) +
          String(m.domMutations).padEnd(12) +
          m.perNodeApplyUs.toFixed(1).padEnd(10) +
          (m.gitHash ?? "?")
      );
    }
    console.log("");
  }

  // Visual regression summary
  const summaryPath = resolve(PATHS.visualDir, "latest-run.json");
  if (existsSync(summaryPath)) {
    try {
      const summary = JSON.parse(readFileSync(summaryPath, "utf-8"));
      console.log("── Visual Regression ──────────────────────────────────────");
      console.log(`  Captures: ${summary.totalCaptures}`);
      console.log(`  New:      ${summary.newBaselines}`);
      console.log(`  Passed:   ${summary.passed}`);
      console.log(`  Failed:   ${summary.failed}`);
    } catch {
      /* ignore parse errors */
    }
  }
}

function showHistory(): void {
  const history = readHistory();
  if (history.length === 0) {
    console.log("No history found. Run 'perf' first.");
    return;
  }

  console.log("📈 Performance Trend (last 10 runs per algorithm/tier)\n");

  for (const algo of ALL_ALGORITHMS) {
    for (const tier of Object.keys(DOM_TIERS) as DomTier[]) {
      const entries = recentEntries(algo, tier, 10, history);
      if (entries.length === 0) continue;

      console.log(`  ${algo} / ${tier}:`);
      for (const e of entries) {
        const date = new Date(e.timestamp).toISOString().slice(0, 19);
        const trend =
          entries.length > 1 && entries.indexOf(e) > 0
            ? (() => {
                const prev = entries[entries.indexOf(e) - 1];
                const delta =
                  ((e.applyTimeMs - prev.applyTimeMs) / Math.max(prev.applyTimeMs, 0.01)) * 100;
                return delta > 5
                  ? `↑${delta.toFixed(0)}%`
                  : delta < -5
                    ? `↓${Math.abs(delta).toFixed(0)}%`
                    : "→";
              })()
            : "";

        console.log(
          `    ${date}  ${(e.gitHash ?? "?").padEnd(8)}  ` +
            `apply=${e.applyTimeMs.toFixed(2).padEnd(8)}ms  ` +
            `css=${String(e.cssOutputBytes).padEnd(6)}B  ` +
            trend
        );
      }
      console.log("");
    }
  }
}

function resetBaselines(): void {
  console.log("⚠ This will delete all stored baselines and history.");
  console.log(`  Path: ${PATHS.baselinesDir}`);

  if (!process.argv.includes("--force")) {
    console.log("\n  Pass --force to confirm, or manually delete the directory.");
    return;
  }

  if (existsSync(PATHS.baselinesDir)) {
    rmSync(PATHS.baselinesDir, { recursive: true });
    console.log("  ✅ Baselines cleared.");
  } else {
    console.log("  Nothing to clear.");
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────

const cmd = process.argv[2] as Command | undefined;
const extraArgs = process.argv.slice(3);

if (!cmd || !COMMANDS.includes(cmd)) {
  usage();
  process.exit(cmd ? 1 : 0);
}

switch (cmd) {
  case "perf":
    runPerf();
    break;
  case "visual":
    runVisual(extraArgs);
    break;
  case "report":
    showReport();
    break;
  case "history":
    showHistory();
    break;
  case "reset":
    resetBaselines();
    break;
}
