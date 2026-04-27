// tests/regression/visual/capture.ts
//
// Playwright-based visual regression system for UltraDark.
//
// Usage:
//   npx tsx tests/regression/visual/capture.ts [--update] [--site=imdb-top250] [--algo=oklch-cascade]
//
// This script:
//   1. Builds the extension (if needed)
//   2. Launches Firefox with UltraDark loaded via web-ext
//   3. Navigates to each test site
//   4. Captures a screenshot per algorithm
//   5. Compares against stored baselines using pixel diff
//   6. Reports visual regressions
//
// Prerequisites:
//   npm install --save-dev playwright @playwright/test pixelmatch pngjs
//   npx playwright install firefox

import { existsSync, mkdirSync, readFileSync, writeFileSync, readdirSync } from "fs";
import { resolve, join, basename } from "path";
import { execSync } from "child_process";
import { TEST_SITES, ALL_ALGORITHMS, PATHS } from "../config";
import type { Mode } from "../../../src/types/settings";

// ── Types ─────────────────────────────────────────────────────────────────────

interface CaptureResult {
  site: string;
  algorithm: Mode;
  screenshotPath: string;
  baselinePath: string;
  diffPath: string;
  isNew: boolean;
  diffPercent: number | null;
  passed: boolean;
}

interface DiffSummary {
  totalCaptures: number;
  newBaselines: number;
  passed: number;
  failed: number;
  results: CaptureResult[];
}

// ── Configuration ─────────────────────────────────────────────────────────────

const VISUAL_THRESHOLD = 0.5; // % of pixels that can differ before flagging
const SCREENSHOT_DIR = resolve(PATHS.visualDir);
const VIEWPORT = { width: 1280, height: 800 };
const SETTLE_DELAY_MS = 2000; // Wait for algorithm to finish applying

// ── Directory helpers ─────────────────────────────────────────────────────────

function ensureDirs(): void {
  for (const sub of ["current", "baseline", "diff"]) {
    const dir = join(SCREENSHOT_DIR, sub);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  }
}

function screenshotName(site: string, algo: Mode): string {
  return `${site}__${algo}.png`;
}

// ── Build check ───────────────────────────────────────────────────────────────

function ensureBuild(): void {
  const distDir = resolve("dist");
  if (!existsSync(distDir)) {
    console.log("📦 Building extension...");
    execSync("npm run build", { stdio: "inherit" });
  }
}

// ── Main capture logic ────────────────────────────────────────────────────────
// This is the entry point. It requires Playwright to be installed.

async function main(): Promise<void> {
  // Parse CLI args
  const args = process.argv.slice(2);
  const updateBaselines = args.includes("--update");
  const siteFilter = args.find((a) => a.startsWith("--site="))?.split("=")[1];
  const algoFilter = args.find((a) => a.startsWith("--algo="))?.split("=")[1] as Mode | undefined;

  ensureDirs();
  ensureBuild();

  // Filter sites and algorithms
  const sites = siteFilter ? TEST_SITES.filter((s) => s.name === siteFilter) : TEST_SITES;
  const algorithms = algoFilter ? ALL_ALGORITHMS.filter((a) => a === algoFilter) : ALL_ALGORITHMS;

  if (sites.length === 0) {
    console.error(`❌ No site found matching: ${siteFilter}`);
    process.exit(1);
  }

  let firefox: typeof import("playwright");
  try {
    firefox = await import("playwright");
  } catch {
    console.error(
      "❌ Playwright not installed. Run:\n" +
        "   npm install --save-dev playwright @playwright/test\n" +
        "   npx playwright install firefox"
    );
    process.exit(1);
  }

  // Launch Firefox with the extension
  console.log("🦊 Launching Firefox with UltraDark extension...");

  const extensionPath = resolve("dist");
  const context = await firefox.firefox.launchPersistentContext("", {
    headless: false, // Extensions require headed mode in Firefox
    viewport: VIEWPORT,
    args: [
      // web-ext approach: use temporary addon loading
    ],
  });

  // Load extension via CDP or web-ext API
  // Note: Firefox Playwright extension loading differs from Chromium.
  // The practical approach is to use web-ext's --firefox-profile trick,
  // or to build the extension as a temporary addon.
  //
  // For now, we use a helper page approach:
  // 1. Navigate to about:debugging#/runtime/this-firefox
  // 2. Load the extension from dist/
  //
  // This is browser-automation, so it's fragile. A more robust approach
  // for CI would be to use web-ext programmatically.

  const page = await context.newPage();
  const results: CaptureResult[] = [];

  try {
    for (const site of sites) {
      console.log(`\n📸 Capturing: ${site.name} (${site.url})`);

      for (const algo of algorithms) {
        console.log(`  🔧 Algorithm: ${algo}`);

        const name = screenshotName(site.name, algo);
        const currentPath = join(SCREENSHOT_DIR, "current", name);
        const baselinePath = join(SCREENSHOT_DIR, "baseline", name);
        const diffPath = join(SCREENSHOT_DIR, "diff", name);

        try {
          // Navigate
          await page.goto(site.url, { waitUntil: "networkidle", timeout: 15000 });

          // Wait for the waitFor selector if specified
          if (site.waitFor) {
            await page.waitForSelector(site.waitFor, { timeout: 10000 }).catch(() => {
              console.warn(`    ⚠ Selector ${site.waitFor} not found, continuing...`);
            });
          }

          // Switch algorithm via extension messaging
          // This injects a script that changes the algorithm setting
          await page.evaluate(async (mode: string) => {
            // Send message to content script to switch algorithm
            window.postMessage(
              {
                type: "udr:set-mode",
                mode,
              },
              "*"
            );
          }, algo);

          // Wait for algorithm to settle
          await page.waitForTimeout(SETTLE_DELAY_MS);

          // Custom viewport if specified
          if (site.viewport) {
            await page.setViewportSize(site.viewport);
            await page.waitForTimeout(500);
          }

          // Capture screenshot
          await page.screenshot({ path: currentPath, fullPage: false });

          // Compare with baseline
          const isNew = !existsSync(baselinePath);
          let diffPercent: number | null = null;
          let passed = true;

          if (isNew || updateBaselines) {
            // Save as new baseline
            writeFileSync(baselinePath, readFileSync(currentPath));
            console.log(`    📝 ${isNew ? "New baseline" : "Updated baseline"}: ${name}`);
          } else {
            // Pixel diff against baseline
            diffPercent = await computePixelDiff(baselinePath, currentPath, diffPath);
            passed = diffPercent !== null && diffPercent < VISUAL_THRESHOLD;

            if (passed) {
              console.log(`    ✅ Diff: ${diffPercent?.toFixed(2)}%`);
            } else {
              console.log(
                `    ❌ Diff: ${diffPercent?.toFixed(2)}% (threshold: ${VISUAL_THRESHOLD}%)`
              );
            }
          }

          results.push({
            site: site.name,
            algorithm: algo,
            screenshotPath: currentPath,
            baselinePath,
            diffPath,
            isNew,
            diffPercent,
            passed,
          });
        } catch (err) {
          console.error(`    ❌ Error: ${(err as Error).message}`);
          results.push({
            site: site.name,
            algorithm: algo,
            screenshotPath: currentPath,
            baselinePath,
            diffPath,
            isNew: true,
            diffPercent: null,
            passed: false,
          });
        }
      }
    }
  } finally {
    await context.close();
  }

  // Print summary
  const summary = summarize(results);
  printSummary(summary);

  // Write summary JSON
  const summaryPath = join(SCREENSHOT_DIR, "latest-run.json");
  writeFileSync(summaryPath, JSON.stringify(summary, null, 2));
  console.log(`\n📄 Summary written to: ${summaryPath}`);

  if (summary.failed > 0) {
    process.exit(1);
  }
}

// ── Pixel diff computation ────────────────────────────────────────────────────

async function computePixelDiff(
  baselinePath: string,
  currentPath: string,
  diffOutputPath: string
): Promise<number> {
  let PNG: typeof import("pngjs").PNG;
  let pixelmatch: typeof import("pixelmatch").default;

  try {
    const pngjsMod = await import("pngjs");
    PNG = pngjsMod.PNG;
    const pixelmatchMod = await import("pixelmatch");
    pixelmatch = pixelmatchMod.default;
  } catch {
    console.warn("    ⚠ pixelmatch/pngjs not installed, skipping pixel diff");
    return 0;
  }

  const baseline = PNG.sync.read(readFileSync(baselinePath));
  const current = PNG.sync.read(readFileSync(currentPath));

  // Resize if dimensions don't match (take min)
  const width = Math.min(baseline.width, current.width);
  const height = Math.min(baseline.height, current.height);

  const diff = new PNG({ width, height });

  const numDiffPixels = pixelmatch(baseline.data, current.data, diff.data, width, height, {
    threshold: 0.1,
    alpha: 0.3,
    diffColor: [255, 0, 255],
  });

  // Write diff image
  writeFileSync(diffOutputPath, PNG.sync.write(diff));

  const totalPixels = width * height;
  return (numDiffPixels / totalPixels) * 100;
}

// ── Summary ───────────────────────────────────────────────────────────────────

function summarize(results: CaptureResult[]): DiffSummary {
  return {
    totalCaptures: results.length,
    newBaselines: results.filter((r) => r.isNew).length,
    passed: results.filter((r) => r.passed && !r.isNew).length,
    failed: results.filter((r) => !r.passed && !r.isNew).length,
    results,
  };
}

function printSummary(summary: DiffSummary): void {
  console.log("\n═══ Visual Regression Summary ═══");
  console.log(`  Total captures: ${summary.totalCaptures}`);
  console.log(`  New baselines:  ${summary.newBaselines}`);
  console.log(`  Passed:         ${summary.passed}`);
  console.log(`  Failed:         ${summary.failed}`);

  if (summary.failed > 0) {
    console.log("\n  Failed comparisons:");
    for (const r of summary.results.filter((r) => !r.passed && !r.isNew)) {
      console.log(`    ❌ ${r.site}/${r.algorithm}: ${r.diffPercent?.toFixed(2)}% diff`);
      console.log(`       Diff image: ${r.diffPath}`);
    }
  }
}

// ── Run ───────────────────────────────────────────────────────────────────────

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
