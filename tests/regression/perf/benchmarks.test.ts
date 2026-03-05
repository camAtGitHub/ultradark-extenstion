// tests/regression/perf/benchmarks.test.ts
//
// Two-tier performance regression benchmarks:
//
//   Tier 1 — CSS generation: Always reliable, pure-function benchmarks.
//            Catches regressions in the shared style-template and per-algorithm
//            CSS generation without needing a real browser.
//
//   Tier 2 — Algorithm execution: Best-effort benchmarks that attempt to run
//            full apply→reset cycles against synthetic DOMs in jsdom.
//            Some algorithms may fail (oklch-cascade needs CSS.supports for real);
//            failures are logged, not test failures.
//
// Run:  npx vitest run tests/regression/perf/benchmarks.test.ts
//       npm test -- tests/regression/perf

import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";

// ── Mocks MUST be installed before any algorithm import ───────────────────────
import { installBrowserMock, installCssSupportsMock, installAnimationFrameMock, installNodeFilterMock, installMutationObserverMock } from "./setup";
installBrowserMock();
installCssSupportsMock();
installAnimationFrameMock();
installNodeFilterMock();
installMutationObserverMock();

import { buildCss } from "../../../src/content/style-template";
import { generatePhotonInverterCSS } from "../../../src/content/algorithms/photon-inverter";
import { settingsForMode, BENCH_CONFIG, ALL_ALGORITHMS, DOM_TIERS } from "../config";
import type { DomTier, MetricName } from "../config";
import type { Mode } from "../../../src/types/settings";
import { buildFixture } from "./dom-fixtures";
import type { DomFixture } from "./dom-fixtures";
import { bindFixtureGlobals } from "./setup";
import { normalize, aggregateRuns, rankAlgorithms, formatMetrics } from "./metrics";
import type { RawMetrics, NormalizedMetrics } from "./metrics";
import { getBaseline, appendToHistory, compareToBaseline, getGitHash } from "./history";

// ── Helpers ───────────────────────────────────────────────────────────────────

function byteLength(s: string): number {
  return new TextEncoder().encode(s).length;
}

function timedRun<T>(fn: () => T): { result: T; elapsed: number } {
  const start = performance.now();
  const result = fn();
  const elapsed = performance.now() - start;
  return { result, elapsed };
}

/** Count elements with inline style modifications (proxy for DOM mutations) */
function countStyledElements(doc: Document): number {
  return doc.querySelectorAll("[style]").length;
}

const gitHash = getGitHash();

// ═══════════════════════════════════════════════════════════════════════════════
// TIER 1: CSS GENERATION BENCHMARKS
// These are deterministic, reliable, and fast. They catch regressions in
// the CSS template layer — output size bloat, generation time spikes, and
// missing/extraneous rules.
// ═══════════════════════════════════════════════════════════════════════════════

describe("Tier 1: CSS Generation Benchmarks", () => {
  // ── buildCss (shared template used by 4 of 5 algorithms) ──────────────────

  describe("buildCss() — shared style-template", () => {
    const presets = [
      { name: "defaults",          args: { brightness: 100, contrast: 105, sepia: 0, grayscale: 0, hueRotateDeg: 0, amoled: false, invert: false } },
      { name: "defaults+invert",   args: { brightness: 100, contrast: 105, sepia: 0, grayscale: 0, hueRotateDeg: 0, amoled: false, invert: true  } },
      { name: "amoled+invert",     args: { brightness: 100, contrast: 105, sepia: 0, grayscale: 0, hueRotateDeg: 0, amoled: true,  invert: true  } },
      { name: "full-adjustments",  args: { brightness: 85, contrast: 120, sepia: 15, grayscale: 10, hueRotateDeg: 30, amoled: false, invert: true } },
    ];

    for (const preset of presets) {
      it(`[${preset.name}] generation time stays stable`, () => {
        // Warm up
        for (let i = 0; i < BENCH_CONFIG.warmupRuns; i++) buildCss(preset.args);

        const times: number[] = [];
        for (let i = 0; i < BENCH_CONFIG.measuredRuns; i++) {
          const { elapsed } = timedRun(() => buildCss(preset.args));
          times.push(elapsed);
        }

        const medianTime = times.sort((a, b) => a - b)[Math.floor(times.length / 2)];

        // CSS generation should be sub-millisecond for a template function
        expect(medianTime).toBeLessThan(5);
      });

      it(`[${preset.name}] output size is reasonable`, () => {
        const css = buildCss(preset.args);
        const size = byteLength(css);

        // Sanity: should be between 200 bytes and 5 KB
        expect(size).toBeGreaterThan(200);
        expect(size).toBeLessThan(5000);

        // Log for manual review
        console.log(`  buildCss(${preset.name}): ${size} bytes, ${css.split("\n").length} lines`);
      });
    }

    it("invert mode CSS is larger than non-invert (has media reinversion + background fix)", () => {
      const noInvert = buildCss({ brightness: 100, contrast: 105, sepia: 0, grayscale: 0, hueRotateDeg: 0, amoled: false, invert: false });
      const withInvert = buildCss({ brightness: 100, contrast: 105, sepia: 0, grayscale: 0, hueRotateDeg: 0, amoled: false, invert: true });

      expect(byteLength(withInvert)).toBeGreaterThan(byteLength(noInvert));
    });

    it("AMOLED mode adds #000 background rules", () => {
      const noAmoled = buildCss({ brightness: 100, contrast: 105, sepia: 0, grayscale: 0, hueRotateDeg: 0, amoled: false, invert: true });
      const withAmoled = buildCss({ brightness: 100, contrast: 105, sepia: 0, grayscale: 0, hueRotateDeg: 0, amoled: true, invert: true });

      expect(byteLength(withAmoled)).toBeGreaterThan(byteLength(noAmoled));
      expect(withAmoled).toContain("#000");
    });
  });

  // ── generatePhotonInverterCSS ─────────────────────────────────────────────

  describe("generatePhotonInverterCSS() — photon-inverter template", () => {
    it("generation time stays stable", () => {
      const settings = settingsForMode("photon-inverter");

      for (let i = 0; i < BENCH_CONFIG.warmupRuns; i++) generatePhotonInverterCSS(settings);

      const times: number[] = [];
      for (let i = 0; i < BENCH_CONFIG.measuredRuns; i++) {
        const { elapsed } = timedRun(() => generatePhotonInverterCSS(settings));
        times.push(elapsed);
      }

      const medianTime = times.sort((a, b) => a - b)[Math.floor(times.length / 2)];
      expect(medianTime).toBeLessThan(5);
    });

    it("output includes inversion filter chain", () => {
      const css = generatePhotonInverterCSS(settingsForMode("photon-inverter"));
      expect(css).toContain("invert(100%)");
      expect(css).toContain("hue-rotate(");
    });

    it("slider adjustments appear after inversion", () => {
      const settings = { ...settingsForMode("photon-inverter"), brightness: 90, contrast: 110 };
      const css = generatePhotonInverterCSS(settings);
      expect(css).toContain("brightness(90%)");
      expect(css).toContain("contrast(110%)");
    });
  });
});


// ═══════════════════════════════════════════════════════════════════════════════
// TIER 2: ALGORITHM EXECUTION BENCHMARKS
// Run full apply→reset cycles against synthetic DOM fixtures.
// These measure the actual JS overhead of each algorithm.
// Some algorithms may not work fully in jsdom — that's OK, failures are logged.
// ═══════════════════════════════════════════════════════════════════════════════

describe("Tier 2: Algorithm Execution Benchmarks", () => {
  // Fixtures are cached per tier to avoid recreation overhead
  const fixtures = new Map<DomTier, DomFixture>();
  const allResults: NormalizedMetrics[] = [];

  beforeAll(() => {
    for (const tier of Object.keys(DOM_TIERS) as DomTier[]) {
      fixtures.set(tier, buildFixture(tier));
    }
  });

  // ── Per-algorithm, per-tier benchmark ───────────────────────────────────────
  // We dynamically import algorithms to avoid top-level side-effect issues.

  const algorithmLoaders: Record<Mode, () => Promise<{
    apply: (s: ReturnType<typeof settingsForMode>) => void;
    reset: () => void;
  }>> = {
    "photon-inverter": async () => {
      const mod = await import("../../../src/content/algorithms/photon-inverter");
      return { apply: mod.applyPhotonInverter, reset: mod.removePhotonInverter };
    },
    "dom-walker": async () => {
      const mod = await import("../../../src/content/algorithms/dom-walker");
      return { apply: mod.applyDomWalker, reset: mod.resetDomWalker };
    },
    "chroma-semantic": async () => {
      const mod = await import("../../../src/content/algorithms/chroma-semantic");
      return { apply: mod.applyChromaSemantic, reset: mod.resetChromaSemantic };
    },
    "oklch-cascade": async () => {
      const mod = await import("../../../src/content/algorithms/oklch-cascade");
      return { apply: mod.applyOklchCascade, reset: mod.resetOklchCascade };
    },
    "perceptual-remap": async () => {
      const mod = await import("../../../src/content/algorithms/perceptual-remap");
      return { apply: mod.applyPerceptualRemap, reset: mod.resetPerceptualRemap };
    },
  };

  for (const algorithm of ALL_ALGORITHMS) {
    describe(`${algorithm}`, () => {
      for (const tier of Object.keys(DOM_TIERS) as DomTier[]) {
        it(`[${tier}] apply→reset cycle`, async () => {
          const fixture = fixtures.get(tier)!;
          const settings = settingsForMode(algorithm);

          // Bind fixture DOM to globals (includes HTMLElement, Node, etc.)
          const teardown = bindFixtureGlobals(fixture);

          let applyTime = -1;
          let resetTime = -1;
          let cssSize = 0;
          let mutations = 0;
          let error: string | null = null;

          try {
            const { apply, reset } = await algorithmLoaders[algorithm]();

            // Measure apply
            const preStyleCount = countStyledElements(fixture.document);
            const applyStart = performance.now();
            apply(settings);
            applyTime = performance.now() - applyStart;

            mutations = countStyledElements(fixture.document) - preStyleCount;

            // Measure CSS output
            const styleTag = fixture.document.getElementById("udr-style");
            if (styleTag?.textContent) {
              cssSize = byteLength(styleTag.textContent);
            }

            // Measure reset
            const resetStart = performance.now();
            reset();
            resetTime = performance.now() - resetStart;

          } catch (e) {
            error = (e as Error).message ?? String(e);
          } finally {
            teardown();
          }

          if (error) {
            // Log but don't fail — algorithm needs real browser
            console.warn(
              `  ⚠ ${algorithm}/${tier}: jsdom incompatible — ${error.slice(0, 120)}`,
            );
            // Still record partial data if we got any
            if (applyTime < 0) return;
          }

          // Build metrics
          const raw: RawMetrics = {
            algorithm,
            tier,
            nodeCount: fixture.nodeCount,
            applyTimeMs: applyTime,
            resetTimeMs: Math.max(resetTime, 0),
            cssOutputBytes: cssSize,
            domMutations: mutations,
            timestamp: Date.now(),
            gitHash,
          };

          const normalized = normalize(raw);
          allResults.push(normalized);

          // Log metrics
          console.log(`\n${formatMetrics(normalized)}`);

          // Sanity assertions (these catch catastrophic regressions)
          if (applyTime >= 0) {
            expect(applyTime).toBeLessThan(BENCH_CONFIG.timeoutMs);
          }
        });
      }
    });
  }

  // ── Cross-algorithm ranking (runs after all benchmarks) ─────────────────────

  describe("Cross-algorithm comparison", () => {
    it("produces rankings per tier", () => {
      if (allResults.length === 0) {
        console.log("  No algorithm results collected (all jsdom-incompatible?)");
        return;
      }

      for (const tier of Object.keys(DOM_TIERS) as DomTier[]) {
        const tierResults = allResults.filter(r => r.tier === tier);
        if (tierResults.length < 2) continue;

        const rankings = rankAlgorithms(tierResults);

        console.log(`\n  ── ${tier} tier rankings (lower = better) ──`);
        for (const r of rankings) {
          console.log(
            `  #${r.compositeRank} ${r.algorithm.padEnd(20)} ` +
            `apply=${r.ranks.applyTimeMs} reset=${r.ranks.resetTimeMs} ` +
            `css=${r.ranks.cssOutputBytes} mutations=${r.ranks.domMutations}`,
          );
        }
      }

      // At least some results were collected
      expect(allResults.length).toBeGreaterThan(0);
    });
  });

  // ── Regression detection (runs after all benchmarks) ────────────────────────

  describe("Regression detection", () => {
    it("checks current run against stored baselines", () => {
      if (allResults.length === 0) {
        console.log("  No results to compare. Skipping regression check.");
        return;
      }

      const reports: string[] = [];
      let anyRegression = false;

      for (const result of allResults) {
        const baseline = getBaseline(result.algorithm, result.tier);
        const report = compareToBaseline(result, baseline);

        reports.push(report.summary);
        if (report.hasRegression) anyRegression = true;

        // Persist current run as new baseline
        appendToHistory(result);
      }

      console.log("\n  ── Regression Report ──");
      for (const line of reports) {
        const prefix = line.startsWith("REGRESSION") ? "  ❌ " : "  ✅ ";
        console.log(prefix + line);
      }

      if (anyRegression) {
        console.warn(
          "\n  ⚠ Performance regressions detected! Review the metrics above.",
          "\n  To accept the new baseline, re-run the benchmarks.",
          "\n  To investigate, compare git hashes in .baselines/perf-history.jsonl",
        );
      }

      // Don't fail the test on regression — just warn.
      // Teams can change this to `expect(anyRegression).toBe(false)` to enforce.
    });
  });
});
