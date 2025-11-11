// tests/contrast.test.ts
import { describe, it, expect } from "vitest";

// Duplicate minimal luminance/contrast funcs used in worker (unit test only)
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

describe("contrast ratio", () => {
  it("black vs white ~ 21", () => {
    expect(contrastRatio([0,0,0],[255,255,255])).toBeGreaterThan(20);
  });
  it("grey text on grey bg lower", () => {
    const r = contrastRatio([120,120,120],[130,130,130]);
    expect(r).toBeLessThan(2);
  });
});
