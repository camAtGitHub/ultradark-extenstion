// src/content/index.ts
import WorkerUrl from "./optimizer-worker?worker&url";

import type { Settings } from "../types/settings";
import { DATA_ATTR_APPLIED } from "../utils/defaults";
import { getSettings } from "../utils/storage";
import { urlExcluded } from "../utils/regex";
import { isAlreadyDarkTheme } from "../utils/dark-detection";
import { debugSync, initDebugCache, updateDebugCache } from "../utils/logger";
import { applyArchitectMethod } from "./algorithms/architect";
import { applySurgeonMethod } from "./algorithms/surgeon";

let worker: Worker | null = null;
let applied = false;

(async () => {
  await initDebugCache();
  debugSync('content script started to load');
})();

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
  debugSync('Applying CSS with mode:', s.mode);
  
  if (s.mode === "architect") {
    applyArchitectMethod(s);
  } else if (s.mode === "surgeon") {
    applySurgeonMethod(s);
  } else {
    // Fallback to architect for unknown modes
    debugSync('Unknown mode, falling back to architect');
    applyArchitectMethod(s);
  }

  document.documentElement.setAttribute("udr-applied", "true");
  (document.documentElement as HTMLElement & { [DATA_ATTR_APPLIED]: string })[DATA_ATTR_APPLIED] = "1";
  applied = true;
}

function removeCss() {
  const tag = document.getElementById("udr-style");
  if (tag?.parentNode) tag.parentNode.removeChild(tag);
  document.documentElement.removeAttribute("udr-applied");
  document.documentElement.removeAttribute("data-udr-mode");
  (document.documentElement as HTMLElement & { [DATA_ATTR_APPLIED]: string })[DATA_ATTR_APPLIED] = "";
  
  // Reset inline styles applied by surgeon method
  if (document.body.style.backgroundColor) {
    document.body.style.removeProperty('background-color');
    document.body.style.removeProperty('color');
  }
  
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

  const origin = new URL(location.href).origin;

  // Check if should skip due to exclusion
  if (!use.enabled || excluded) {
    debugSync('Skipping - extension disabled or URL excluded:', location.href);
    if (applied) removeCss();
    return;
  }

  // Check if site is already dark (unless forceDarkMode is set for this site)
  const per = use.perSite[origin] || {};
  const shouldDetectDark = use.detectDarkSites && !per.forceDarkMode;
  
  if (shouldDetectDark && isAlreadyDarkTheme()) {
    debugSync('Site already uses dark theme, skipping');
    if (applied) removeCss();
    return;
  }

  debugSync('Applying dark theme with mode:', use.mode);
  applyCss(use);
  if (use.mode === "architect" && use.optimizerEnabled) {
    startOptimizerIfEnabled(use);
  }
}

browser.runtime.onMessage.addListener((msg) => {
  if (msg?.type === "udr:settings-updated") {
    debugSync('Settings updated, reapplying theme');
    tick();
  } else if (msg?.type === "udr:debug-mode-changed") {
    // Update debug cache when debug mode changes
    updateDebugCache(msg.enabled);
  }
});

(async function init() {
  await tick();
  startObserverForSpa();
})();

debugSync('content script loaded as module');
