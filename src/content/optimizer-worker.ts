// src/content/optimizer-worker.ts
// Offloads contrast analysis & simple WCAG-driven adjustment
import type { OptimizerSample, OptimizerResult } from "../types/settings";

interface CanvasContext {
  fillStyle: string;
}

interface GlobalWithCanvas {
  __udr_canvas__?: CanvasContext;
}

// Debug mode is passed from the content script via message
let debugMode = false;

// Base contrast percentage used as starting point for adjustments
const BASE_CONTRAST_PERCENTAGE = 110;

// Worker-safe debug logging - sends messages back to content script
function debugLog(...args: unknown[]): void {
  if (debugMode) {
    postMessage({ type: 'debug', message: args });
  }
}

function parseColor(c: string): [number, number, number] | null {
  // Handles rgb(a) or hex
  debugLog('[Optimizer] Parsing color:', c);
  const ctx = (globalThis as GlobalWithCanvas).__udr_canvas__ || (() => {
    const cnv = new OffscreenCanvas(1, 1);
    const context = cnv.getContext("2d") as CanvasContext;
    (globalThis as GlobalWithCanvas).__udr_canvas__ = context;
    return (globalThis as GlobalWithCanvas).__udr_canvas__;
  })();
  if (!ctx) {
    debugLog('[Optimizer] Failed to get canvas context');
    return null;
  }
  ctx.fillStyle = c;
  const v = ctx.fillStyle;
  // v will be normalized like "rgba(r,g,b,a)"
  const m = v.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/i);
  if (m) {
    const parsed: [number, number, number] = [Number(m[1]), Number(m[2]), Number(m[3])];
    debugLog('[Optimizer] Parsed color:', c, '→', parsed);
    return parsed;
  }
  debugLog('[Optimizer] Failed to parse color:', c, '(normalized to:', v, ')');
  return null;
}

function relLuminance([r, g, b]: [number, number, number]) {
  const srgb = [r, g, b].map((v) => v / 255).map((v) => (v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)));
  const luminance = 0.2126 * srgb[0] + 0.7152 * srgb[1] + 0.0722 * srgb[2];
  debugLog('[Optimizer] Calculated luminance for RGB', [r, g, b], '→', luminance.toFixed(4));
  return luminance;
}

function contrastRatio(fg: [number, number, number], bg: [number, number, number]) {
  const L1 = relLuminance(fg);
  const L2 = relLuminance(bg);
  const light = Math.max(L1, L2);
  const dark = Math.min(L1, L2);
  const ratio = (light + 0.05) / (dark + 0.05);
  debugLog('[Optimizer] Contrast ratio:', ratio.toFixed(2), '(FG:', fg, 'L=' + L1.toFixed(4), ', BG:', bg, 'L=' + L2.toFixed(4) + ')');
  return ratio;
}

onmessage = (ev: MessageEvent) => {
  const { type, samples, debug } = ev.data as { type: string; samples?: OptimizerSample[]; debug?: boolean };

  // Handle debug mode updates
  if (type === "setDebugMode") {
    debugMode = debug ?? false;
    debugLog('[Optimizer] Debug mode', debugMode ? 'enabled' : 'disabled');
    return;
  }

  if (type !== "analyze" || !Array.isArray(samples) || samples.length === 0) {
    debugLog('[Optimizer] Invalid message received:', { type, samplesLength: samples?.length });
    return;
  }

  debugLog('[Optimizer] ═══════════════════════════════════════════════════════');
  debugLog('[Optimizer] Starting contrast analysis with', samples.length, 'samples');
  
  // Compute median contrast; if < 4.5, suggest raising overall contrast %
  const ratios: number[] = [];
  for (let i = 0; i < samples.length; i++) {
    const s = samples[i];
    debugLog('[Optimizer] Sample', i + 1, '/', samples.length, '- FG:', s.fg, 'BG:', s.bg);
    const fg = parseColor(s.fg);
    const bg = parseColor(s.bg);
    if (!fg || !bg) {
      debugLog('[Optimizer] Skipping sample', i + 1, '- failed to parse colors');
      continue;
    }
    const ratio = contrastRatio(fg, bg);
    ratios.push(ratio);
  }
  
  if (ratios.length === 0) {
    debugLog('[Optimizer] No valid samples - analysis aborted');
    return;
  }

  debugLog('[Optimizer] Successfully analyzed', ratios.length, 'samples out of', samples.length);
  
  ratios.sort((a, b) => a - b);
  const median = ratios[Math.floor(ratios.length / 2)];
  const min = ratios[0];
  const max = ratios[ratios.length - 1];
  const avg = ratios.reduce((sum, r) => sum + r, 0) / ratios.length;

  debugLog('[Optimizer] Contrast statistics:');
  debugLog('[Optimizer]   - Min:', min.toFixed(2));
  debugLog('[Optimizer]   - Max:', max.toFixed(2));
  debugLog('[Optimizer]   - Median:', median.toFixed(2));
  debugLog('[Optimizer]   - Average:', avg.toFixed(2));
  debugLog('[Optimizer]   - All ratios:', ratios.map(r => r.toFixed(2)).join(', '));

  let suggested: number | null = null;
  let reason = '';
  
  if (median < 4.5) {
    // naive mapping: for each 0.5 below 4.5, add +10% contrast (cap done in content)
    const deficit = 4.5 - median;
    suggested = Math.round(BASE_CONTRAST_PERCENTAGE + (deficit / 0.5) * 10);
    reason = `Median contrast ${median.toFixed(2)} is below WCAG AA threshold (4.5). Deficit: ${deficit.toFixed(2)}. Suggesting +${(suggested - BASE_CONTRAST_PERCENTAGE)}% increase to base ${BASE_CONTRAST_PERCENTAGE}%.`;
    debugLog('[Optimizer] ⚠️ LOW CONTRAST DETECTED');
    debugLog('[Optimizer]   -', reason);
  } else if (median > 9) {
    // extreme contrast, ease down a little to avoid harshness
    suggested = 100;
    reason = `Median contrast ${median.toFixed(2)} is very high (>9), which may cause harshness. Suggesting to reduce to 100% (neutral).`;
    debugLog('[Optimizer] ⚠️ EXTREMELY HIGH CONTRAST DETECTED');
    debugLog('[Optimizer]   -', reason);
  } else {
    suggested = BASE_CONTRAST_PERCENTAGE;
    reason = `Median contrast ${median.toFixed(2)} is within acceptable range (4.5-9). Using default ${BASE_CONTRAST_PERCENTAGE}%.`;
    debugLog('[Optimizer] ✓ CONTRAST IS ACCEPTABLE');
    debugLog('[Optimizer]   -', reason);
  }

  debugLog('[Optimizer] Final decision: Suggest contrast =', suggested + '%');
  debugLog('[Optimizer] ═══════════════════════════════════════════════════════');

  const res: OptimizerResult = { suggestedContrast: suggested ?? BASE_CONTRAST_PERCENTAGE };
  postMessage(res);
};
