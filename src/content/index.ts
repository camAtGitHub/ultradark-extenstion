// src/content/index.ts
import WorkerUrl from "./optimizer-worker?worker&url";

import type { Settings } from "../types/settings";
import { DEFAULTS, DATA_ATTR_APPLIED } from "../utils/defaults";
import { S, g, D } from "../utils/storage.js";
import { u } from "../utils/regex.js";
import { ensureStyleTag, buildCss } from "./style-template";

let activeSettings: Settings | null = null;
let worker: Worker | null = null;
let applied = false;
let lastAppliedOrigin = "";

console.log('UltraDark Reader: content script started to load');

async function effectiveSettingsFor(url: string, base: Settings): Promise<{ use: Settings; excluded: boolean }> {
  const origin = new URL(url).origin;
  const per = base.perSite[origin] || {};
  const excluded = per.exclude === true || urlExcluded(url, base.excludeRegex);

  const merged: Settings = {
    ...base,
    ...(per.override || {})
  };

  if (typeof per.enabled === "boolean") merged.enabled = per.enabled;

  return { use: merged, excluded };
}

function applyCss(s: Settings) {
  const tag = ensureStyleTag();
  const hueDeg = Math.round((s.blueShift / 100) * 40); // 0..40deg tilt

  tag.textContent = buildCss({
    brightness: s.brightness,
    contrast: s.contrast,
    sepia: s.sepia,
    grayscale: s.grayscale,
    hueRotateDeg: hueDeg,
    amoled: s.amoled,
    mode: s.mode
  });

  document.documentElement.setAttribute("udr-applied", "true");
  (document.documentElement as any)[DATA_ATTR_APPLIED] = "1";
  applied = true;
}

function removeCss() {
  const tag = document.getElementById("udr-style");
  if (tag?.parentNode) tag.parentNode.removeChild(tag);
  document.documentElement.removeAttribute("udr-applied");
  (document.documentElement as any)[DATA_ATTR_APPLIED] = "";
  applied = false;
}

function startObserverForSpa() {
  // If the page dynamically changes, we keep media fixes healthy.
  const ob = new MutationObserver(() => {
    // Lightweight touch; heavy color analysis goes to worker
    if (applied) {
      // nothing extra: CSS handles media; optimizer tick handles contrast
    }
  });
  ob.observe(document.documentElement, { childList: true, subtree: true, attributes: false });
}

function startOptimizerIfEnabled(s: Settings) {
  if (!s.optimizerEnabled) return;
  if (!worker) {
    worker = new Worker(WorkerUrl);
    worker.onmessage = (ev) => {
      const { suggestedContrast } = ev.data as { suggestedContrast?: number };
      if (typeof suggestedContrast === "number") {
        const tag = document.getElementById("udr-style");
        if (tag) {
          // Rebuild CSS with adjusted contrast (bounded 50..200)
          const next = { ...s, contrast: Math.min(200, Math.max(50, suggestedContrast)) };
          applyCss(next);
        }
      }
    };
  }

  // Sample a limited set of text nodes
  const samples: { fg: string; bg: string }[] = [];
  const MAX = 120;
  const sel = "p,span,li,dd,dt,small,code,pre,a,td,th,h1,h2,h3,h4,h5,h6";
  document.querySelectorAll(sel).forEach((el) => {
    if (samples.length >= MAX) return;
    const cs = getComputedStyle(el as Element);
    samples.push({ fg: cs.color, bg: cs.backgroundColor || getComputedStyle((el as Element).parentElement || document.body).backgroundColor });
  });

  worker.postMessage({ type: "analyze", samples });
}

async function tick() {
  const s = await getSettings();
  const { use, excluded } = await effectiveSettingsFor(location.href, s);
  activeSettings = use;

  const origin = new URL(location.href).origin;
  lastAppliedOrigin = origin;

  if (!use.enabled || excluded) {
    if (applied) removeCss();
    return;
  }
  applyCss(use);
  if (use.mode === "dynamic") startOptimizerIfEnabled(use);
}

browser.runtime.onMessage.addListener((msg) => {
  if (msg?.type === "udr:settings-updated") {
    tick();
  }
});

(async function init() {
  await tick();
  startObserverForSpa();
})();

console.log('UltraDark Reader: content script loaded as module');
