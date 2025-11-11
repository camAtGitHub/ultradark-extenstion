// src/content/optimizer-worker.ts
// Offloads contrast analysis & simple WCAG-driven adjustment
import type { OptimizerSample, OptimizerResult } from "../types/settings";

function parseColor(c: string): [number, number, number] | null {
  // Handles rgb(a) or hex
  const ctx = (globalThis as any).__udr_canvas__ || (() => {
    const cnv = new OffscreenCanvas(1, 1);
    (globalThis as any).__udr_canvas__ = cnv.getContext("2d");
    return (globalThis as any).__udr_canvas__;
  })();
  if (!ctx) return null;
  (ctx as any).fillStyle = c;
  const v = (ctx as any).fillStyle as string;
  // v will be normalized like "rgba(r,g,b,a)"
  const m = v.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/i);
  if (m) return [Number(m[1]), Number(m[2]), Number(m[3])];
  return null;
}

function relLuminance([r, g, b]: [number, number, number]) {
  const srgb = [r, g, b].map((v) => v / 255).map((v) => (v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)));
  return 0.2126 * srgb[0] + 0.7152 * srgb[1] + 0.0722 * srgb[2];
}

function contrastRatio(fg: [number, number, number], bg: [number, number, number]) {
  const L1 = relLuminance(fg);
  const L2 = relLuminance(bg);
  const light = Math.max(L1, L2);
  const dark = Math.min(L1, L2);
  return (light + 0.05) / (dark + 0.05);
}

onmessage = (ev: MessageEvent) => {
  const { type, samples } = ev.data as { type: string; samples: OptimizerSample[] };

  if (type !== "analyze" || !Array.isArray(samples) || samples.length === 0) return;

  // Compute median contrast; if < 4.5, suggest raising overall contrast %
  const ratios: number[] = [];
  for (const s of samples) {
    const fg = parseColor(s.fg);
    const bg = parseColor(s.bg);
    if (!fg || !bg) continue;
    ratios.push(contrastRatio(fg, bg));
  }
  if (ratios.length === 0) return;

  ratios.sort((a, b) => a - b);
  const median = ratios[Math.floor(ratios.length / 2)];

  let suggested: number | null = null;
  if (median < 4.5) {
    // naive mapping: for each 0.5 below 4.5, add +10% contrast (cap done in content)
    const deficit = 4.5 - median;
    suggested = Math.round(110 + (deficit / 0.5) * 10); // base 110%
  } else if (median > 9) {
    // extreme contrast, ease down a little to avoid harshness
    suggested = 100;
  }

  const res: OptimizerResult = { suggestedContrast: suggested ?? 110 };
  (postMessage as any)(res);
};
