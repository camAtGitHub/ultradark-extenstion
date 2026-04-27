# UltraDark Regression Testing Framework

Catches performance regressions and visual breakage across all five algorithms before they reach users.

## Quick Start

```bash
# Run performance benchmarks (no browser needed)
npx vitest run tests/regression/perf/benchmarks.test.ts

# Or via the CLI runner
npx tsx tests/regression/run.ts perf

# View results
npx tsx tests/regression/run.ts report
```

## Why This Exists

The existing unit tests validate correctness (constants, contracts, feature flags) but don't catch:

- **Performance regressions** — a bug fix that accidentally makes `oklch-cascade` 3× slower on large DOMs
- **CSS bloat** — a new rule that doubles the injected stylesheet size
- **Cross-algorithm comparison drift** — one algorithm falling behind the others over time
- **Visual breakage** — a selector change that hides all buttons on a page

This framework fills those gaps with two tiers of testing.

## Architecture

```
tests/regression/
├── config.ts                 # Central config: sites, thresholds, algorithms
├── run.ts                    # CLI orchestrator
├── perf/
│   ├── benchmarks.test.ts    # Vitest benchmark suite (Tier 1 + Tier 2)
│   ├── dom-fixtures.ts       # Synthetic DOM generators (small → SPA-scale)
│   ├── metrics.ts            # Collection, normalization, cross-algo ranking
│   ├── history.ts            # JSONL baseline storage + regression detection
│   └── setup.ts              # Browser API mocks for jsdom
├── visual/
│   └── capture.ts            # Playwright screenshot capture + pixel diff
├── .baselines/
│   ├── perf-history.jsonl    # Append-only performance history (git-tracked)
│   └── screenshots/          # Visual baselines (git-ignored, machine-specific)
│       ├── baseline/
│       ├── current/
│       └── diff/
└── README.md
```

## Performance Benchmarks (Tier 1 + 2)

### Tier 1: CSS Generation

Always reliable, no real browser needed. Benchmarks `buildCss()` (shared by 4 algorithms) and `generatePhotonInverterCSS()` against multiple settings presets.

**What it catches:**

- Template generation time spikes
- CSS output size bloat
- Missing or extraneous rules after refactoring

### Tier 2: Algorithm Execution

Runs full `apply → reset` cycles against synthetic DOM fixtures of increasing complexity:

| Tier   | Nodes | Depth | Simulates                  |
| ------ | ----- | ----- | -------------------------- |
| small  | 50    | 3     | Blog post                  |
| medium | 500   | 6     | News site                  |
| large  | 2000  | 10    | Dashboard                  |
| spa    | 3000  | 15    | React SPA (Uber Eats-like) |

DOM fixtures use a deterministic PRNG so results are reproducible. The `spa` tier includes obfuscated classes and deep wrapper nesting to simulate real SPA structures.

**Metrics tracked per algorithm per tier:**

| Metric           | What it measures                         | Why it matters                          |
| ---------------- | ---------------------------------------- | --------------------------------------- |
| `applyTimeMs`    | Wall-clock time to apply the algorithm   | Primary user-facing latency             |
| `resetTimeMs`    | Wall-clock time to clean up              | Algorithm switching performance         |
| `cssOutputBytes` | Size of injected CSS                     | Network/parse overhead, bloat detection |
| `domMutations`   | Elements with inline style modifications | Layout thrash risk                      |
| `perNodeApplyUs` | Microseconds per DOM node (normalized)   | **Cross-tier comparable** efficiency    |
| `cssPerNode`     | CSS bytes per DOM node (normalized)      | Scaling characteristics                 |

### Regression Detection

Each run is compared against the previous baseline. Thresholds are configurable in `config.ts`:

```typescript
REGRESSION_THRESHOLDS = {
  applyTimeMs: 0.25, // 25% slower → flag
  resetTimeMs: 0.3, // 30% slower → flag
  cssOutputBytes: 0.15, // 15% larger → flag
  domMutations: 0.1, // 10% more   → flag
  perNodeApplyUs: 0.25, // 25% slower per-node → flag
  cssPerNode: 0.15, // 15% more CSS per node → flag
};
```

Results are stored in an append-only JSONL file (`perf-history.jsonl`) with git hash and timestamp, so you can trace regressions back to specific commits.

### Cross-Algorithm Ranking

After benchmarks complete, algorithms are ranked per tier on every metric. The composite rank (sum of per-metric ranks) gives a quick "which algorithm is winning" overview:

```
── medium tier rankings (lower = better) ──
#8  photon-inverter      apply=1 reset=1 css=3 mutations=3
#12 dom-walker           apply=2 reset=2 css=2 mutations=4
#15 oklch-cascade        apply=3 reset=3 css=1 mutations=1
```

### Normalized Metrics for Cross-System Comparison

Raw timing varies wildly between machines. The **per-node** metrics (`perNodeApplyUs`, `cssPerNode`) normalize by DOM size, making them comparable across tiers. The **cross-algorithm ranking** normalizes further by comparing algorithms against each other rather than against absolute numbers — so "oklch-cascade is 1.5× faster than dom-walker on medium DOMs" holds regardless of machine speed.

### jsdom Limitations

Some algorithms (especially `oklch-cascade` and `perceptual-remap`) depend on browser APIs that jsdom doesn't support (`CSS.supports()`, `document.styleSheets` iteration, real CSS cascade). When an algorithm throws in jsdom, the benchmark logs a warning and continues — it's not a test failure. These algorithms get their full coverage in Tier 3 (visual regression with real Firefox).

## Visual Regression (Tier 3)

Uses Playwright with Firefox to capture actual screenshots of test sites with each algorithm active, then pixel-diffs against stored baselines.

### Setup

```bash
npm install --save-dev playwright @playwright/test pixelmatch pngjs
npx playwright install firefox
```

### Usage

```bash
# First run: captures baselines
npx tsx tests/regression/visual/capture.ts --update

# Subsequent runs: compares against baselines
npx tsx tests/regression/visual/capture.ts

# Test specific site/algorithm
npx tsx tests/regression/visual/capture.ts --site=ubereats-au --algo=oklch-cascade
```

### Default Test Sites

Configured in `config.ts`, easy to add more:

| Site           | Tags                   | Why it's here                        |
| -------------- | ---------------------- | ------------------------------------ |
| IMDB Top 250   | media, list-heavy      | Complex list layouts, media elements |
| The Register   | news, text-heavy       | Text-heavy, traditional layout       |
| Uber Eats AU   | spa, react, obfuscated | The SPA that broke scrolling         |
| GitHub Explore | spa, dark-native       | Already-dark detection edge case     |
| Wikipedia      | static, text-heavy     | Baseline "should always look good"   |
| Stack Overflow | list-heavy, mixed      | Mixed content, user-generated styles |

### Adding a New Test Site

```typescript
// In config.ts, add to TEST_SITES:
{
  name: "my-site",
  url: "https://example.com",
  waitFor: ".main-content",      // Optional: wait for this selector
  viewport: { width: 1440, height: 900 },  // Optional
  tags: ["spa", "custom-scrollbars"],       // Optional: for filtering
}
```

## CLI Reference

```
npx tsx tests/regression/run.ts <command> [flags]

perf              Run performance benchmarks
visual [flags]    Run visual regression
  --update        Save current screenshots as new baselines
  --site=NAME     Filter to one site
  --algo=NAME     Filter to one algorithm
report            Show latest performance comparison table
history           Show trend over last 10 runs per algorithm
reset [--force]   Clear all baselines
```

## Integration with Existing Tests

The performance benchmarks run alongside existing vitest tests:

```bash
# Run everything (existing + regression)
npm test

# Run only regression benchmarks
npx vitest run tests/regression/

# Run only existing unit tests (exclude regression)
npx vitest run tests/unit/ tests/algorithms.test.ts
```

## Workflow Recommendations

1. **Before making algorithm changes:** Run `perf` to record a baseline
2. **After changes:** Run `perf` again — regression detection compares automatically
3. **For visual changes:** Run `visual --update` to set new baselines, then commit the `perf-history.jsonl`
4. **In PR review:** Check the regression report output for any flagged metrics
5. **Periodically:** Run `history` to spot gradual drift across commits

## Example of Benchmark Results

The tiers are based upon a sampling of websites the author accessed on a typical work day.

Summary of what the benchmarks reveal:

**Scaling behavior across the new tiers** (µs/node — lower is better):

| Algorithm        | small (400) | medium (2K) | large (5K) | heavy (12K) | extreme (85K) | Pattern                               |
| ---------------- | ----------- | ----------- | ---------- | ----------- | ------------- | ------------------------------------- |
| oklch-cascade    | 231.2       | 4.5         | 1.8        | 2.2         | 1.7           | Flat after warmup — **O(1) per-node** |
| photon-inverter  | 69.9        | 18.2        | 3.9        | 2.1         | 1.9           | Flat after warmup — **O(1) per-node** |
| chroma-semantic  | 449.1       | 43.5        | 17.6       | 14.8        | 10.8          | Decreasing — **CSS-only, amortized**  |
| perceptual-remap | 50.1        | 46.9        | 54.7       | 48.5        | 43.6          | Stable — **linear O(n)**              |
| dom-walker       | 478.9       | 142.7       | 67.1       | 68.9        | 60.2          | Stable at scale — **linear O(n)**     |

**no algorithm shows O(n²) behavior** — the extreme tier at 85K nodes was the key test for that, and every algorithm's per-node cost is flat or decreasing. Dom-walker is the slowest in wall-clock (5.1s at extreme) but still linear. Oklch-cascade dominates at scale with sub-2µs/node.

The small tier's inflated µs/node values (231µs for oklch-cascade vs 1.7µs at extreme) confirm exactly why we skip timing regression on that tier — it's all fixed-cost overhead being divided by a tiny node count.
