// File: src/utils/dark-detection.ts
import { debugSync } from "./logger";
import {
  parseRgbFast,
  isTransparentFast,
  getRelativeLuminance,
} from "./color-utils";

const DARK_THRESHOLD = 0.3;
const DARK_RATIO_THRESHOLD = 0.4;
const ROOT_DARK_RATIO_THRESHOLD = 0.32;
const MAX_SAMPLES = 28;
const MIN_SAMPLE_WEIGHT = 10.0; // Guard against low-confidence detections from early CSS loading

/**
 * ADVANCED DARK DETECTION
 *
 * Fixes:
 * 1. Special handling for <body> to ensure the canvas color is always checked.
 * 2. Fallback sampling of direct body children if semantic selectors fail (prevents Valid=0).
 * 3. Robust RGBA parsing.
 */
export function isAlreadyDarkTheme(): boolean {
  const html = document.documentElement;
  const body = document.body;

  console.log(
    "[UltraDark Dark Detection] ========== DETECTION START ==========",
  );
  console.log("[UltraDark Dark Detection] URL:", window.location.href);

  if (!html || !body) {
    console.log(
      "[UltraDark Dark Detection] ⛔ Body/HTML missing. Result: FALSE",
    );
    return false;
  }

  // GUARD: Don't detect our own styles
  const hasUdrStyle = !!document.getElementById("udr-style");
  const hasUdrPreinject = !!document.getElementById("udr-preinject");
  const hasUdrShield = !!document.getElementById("udr-shield");
  const hasUdrAppliedAttr = html.getAttribute("udr-applied") === "true";

  console.log("[UltraDark Dark Detection] Checking Extension Markers...");
  if (hasUdrStyle || hasUdrPreinject || hasUdrShield || hasUdrAppliedAttr) {
    console.log(
      "[UltraDark Dark Detection] ✅ Extension styles detected. Aborting detection to prevent false positives.",
    );
    return false;
  }

  // CHECK 1: The Official Standard
  const colorScheme = window.getComputedStyle(html).colorScheme;
  if (colorScheme === "dark") {
    console.log(
      '[UltraDark Dark Detection] 🎨 Browser reports "color-scheme: dark". Result: TRUE',
    );
    return true;
  }

  // CHECK 2: Visual Reality (Sampling)
  // OPTIMIZATION: Batched style reads to prevent layout thrashing
  console.log(
    "[UltraDark Dark Detection] 🔍 Sampling visual elements for luminance...",
  );

  let darkWeight = 0;
  let totalWeight = 0;
  let skippedTransparent = 0;
  let skippedHidden = 0;
  let rootDarkSignal = false;

  /**
   * BATCHED DARK DETECTION
   *
   * Strategy: Read all computed styles in a single batch, THEN process.
   * This prevents forced synchronous layouts between reads.
   */
  const resolveEffectiveBackground = (
    el: Element,
    styleMap: Map<Element, CSSStyleDeclaration>,
  ): string | null => {
    let current: Element | null = el;
    let hop = 0;
    const MAX_HOPS = 5;

    while (current && hop < MAX_HOPS) {
      const style =
        styleMap.get(current) ?? window.getComputedStyle(current as Element);
      const bg = style.backgroundColor;
      if (!isTransparentFast(bg)) {
        return bg;
      }
      current = current.parentElement;
      hop++;
    }
    return null;
  };

  const processElement = (el: Element, source: string, styleMap: Map<Element, CSSStyleDeclaration>) => {
    const bg = resolveEffectiveBackground(el, styleMap);
    if (!bg) {
      skippedTransparent++;
      return;
    }

    const rgb = parseRgbFast(bg);
    if (!rgb) {
      skippedTransparent++;
      return;
    }

    const lum = getRelativeLuminance(rgb.r, rgb.g, rgb.b);
    const rect = el.getBoundingClientRect();
    const area = Math.max(1, rect.width * rect.height);
    const viewport = Math.max(1, window.innerWidth * window.innerHeight);
    const areaWeight = Math.min(3, Math.max(0.5, area / viewport));

    console.log(
      `[UltraDark Dark Detection] Sample <${el.tagName.toLowerCase()}${el.className ? "." + el.className.split(" ")[0] : ""}> (${source}): RGB(${rgb.r}, ${rgb.g}, ${rgb.b}) | Luminance: ${lum.toFixed(3)} | Weight: ${areaWeight.toFixed(2)}`,
    );

    if (el === html || el === body) {
      rootDarkSignal = rootDarkSignal || lum < DARK_THRESHOLD;
    }

    if (lum < DARK_THRESHOLD) {
      darkWeight += areaWeight;
    }
    totalWeight += areaWeight;
  };

  // PHASE 1: High-Priority Semantic Elements
  const selectors = [
    "html",
    "body", // Always check body first
    "main",
    '[role="main"]',
    "article",
    ".container",
    "#app",
    "#root",
    ".app-container",
    "header",
    ".navbar",
    ".sidebar",
    ".content",
    ".wrapper",
    ".main-content",
    ".page",
  ];

  // PHASE 1A: Collect all elements first (no style reads)
  const elementsToSample: Array<{ el: Element; source: string }> = [];
  const seen = new Set<Element>();
  for (const sel of selectors) {
    const elements = document.querySelectorAll(sel);
    elements.forEach((el) => {
      if (seen.has(el) || elementsToSample.length >= MAX_SAMPLES) return;
      seen.add(el);
      elementsToSample.push({ el, source: sel });
    });
  }

  // Add a bounded set of direct body children for framework wrappers
  // where semantic selectors miss the visual root (e.g. div#__nuxt, div[data-reactroot]).
  for (const child of Array.from(body.children)) {
    if (elementsToSample.length >= MAX_SAMPLES) break;
    if (seen.has(child)) continue;
    seen.add(child);
    elementsToSample.push({ el: child, source: "body-child" });
  }

  // PHASE 1B: Batch read all computed styles (single layout pass)
  const styleCache = new Map<Element, CSSStyleDeclaration>();
  for (const { el, source } of elementsToSample) {
    // Visibility check is cheaper than full style computation
    // Skip obviously hidden elements before expensive style reads
    if (source !== "body") {
      const rect = el.getBoundingClientRect();
      if (rect.width === 0 && rect.height === 0) {
        skippedHidden++;
        continue;
      }
    }
    styleCache.set(el, window.getComputedStyle(el));
  }

  // PHASE 1C: Process cached styles (no layout impact)
  for (const { el, source } of elementsToSample) {
    if (styleCache.has(el)) {
      processElement(el, source, styleCache);
    }
  }

  console.log(
    `[UltraDark Dark Detection] PHASE 1 Stats: Weight=${totalWeight.toFixed(2)}, Skipped(Transp)=${skippedTransparent}, Skipped(Hidden)=${skippedHidden}`,
  );

  // PHASE 2: Fallback (Direct Body Children)
  // If Phase 1 yielded NO valid samples (e.g., generic structure not caught by selectors),
  // we fall back to the first 5 direct children of body.
  if (totalWeight === 0) {
    console.log(
      "[UltraDark Dark Detection] ⚠️ Phase 1 yielded 0 valid samples. Starting Phase 2 Fallback (Body Children)...",
    );

    // Get direct children
    const children = Array.from(body.children);
    const limit = Math.min(children.length, 5); // Sample max 5 children to save time

    for (let i = 0; i < limit; i++) {
      processElement(children[i], `body-child[${i}]`, styleCache);
    }

    console.log(
      `[UltraDark Dark Detection] PHASE 2 Stats: Weight=${totalWeight.toFixed(2)} (Total)`,
    );
  }

  if (totalWeight === 0) {
    console.log(
      "[UltraDark Dark Detection] ⚠️ Still no valid samples after Fallback. Defaulting to FALSE (Light).",
    );
    return false;
  }

  // LOW-CONFIDENCE GUARD: If we only sampled a tiny fraction of the page,
  // we can't be confident in the result. This handles the case where early
  // detection runs before CSS loads and samples only the shell (white defaults).
  // Return false to let Shield catch it and recheck after CSS loads.
  if (totalWeight < MIN_SAMPLE_WEIGHT) {
    console.log(
      `[UltraDark Dark Detection] ⚠️ Low-confidence detection: only ${totalWeight.toFixed(2)} units sampled (need ${MIN_SAMPLE_WEIGHT}+). Deferring to Shield + post-load recheck.`,
    );
    return false;
  }

  const ratio = darkWeight / totalWeight;
  console.log(
    `[UltraDark Dark Detection] 🗳️  Dark Weight/Total Weight: ${darkWeight.toFixed(2)}/${totalWeight.toFixed(2)} (${(ratio * 100).toFixed(0)}%) | RootDarkSignal=${rootDarkSignal}`,
  );

  // EARLY RETURN: If browser declares color-scheme dark but we sampled all light,
  // the page's CSS probably hasn't loaded yet. Trust the browser over our sample.
  if (colorScheme === "dark" && ratio === 0 && totalWeight > 0) {
    console.log(
      "[UltraDark Dark Detection] ⚠️ Sampled all light, but browser reports color-scheme:dark. CSS likely not loaded yet. Trusting browser. Result: TRUE",
    );
    return true;
  }

  // Normal threshold: 40% weighted darkness.
  // Root-dark fallback: if html/body is dark, allow a lower ratio to reduce false negatives
  // on transparent-layered SPA shells.
  if (ratio >= DARK_RATIO_THRESHOLD || (rootDarkSignal && ratio >= ROOT_DARK_RATIO_THRESHOLD)) {
    console.log(
      "[UltraDark Dark Detection] ✅ Result: TRUE (Dark theme detected)",
    );
    return true;
  } else {
    console.log(
      "[UltraDark Dark Detection] ✅ Result: FALSE (Light theme detected)",
    );
    return false;
  }
}
