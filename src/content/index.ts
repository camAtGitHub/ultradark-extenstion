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
  debugSync('Removing dark theme CSS and inline styles');
  
  const tag = document.getElementById("udr-style");
  if (tag?.parentNode) tag.parentNode.removeChild(tag);
  document.documentElement.removeAttribute("udr-applied");
  
  // Check which mode was applied to know what to clean up
  const mode = document.documentElement.getAttribute("data-udr-mode");
  document.documentElement.removeAttribute("data-udr-mode");
  (document.documentElement as HTMLElement & { [DATA_ATTR_APPLIED]: string })[DATA_ATTR_APPLIED] = "";
  
  // If surgeon method was used, we need to clean up inline styles on all elements
  if (mode === "surgeon") {
    debugSync('[Surgeon Cleanup] Removing inline styles from DOM elements');
    
    // Remove inline styles from all elements that were modified
    const elements = document.querySelectorAll('*');
    let cleanedCount = 0;
    
    elements.forEach((element) => {
      if (!(element instanceof HTMLElement)) return;
      
      // Only remove properties if they were set by the extension (have inline styles)
      if (element.style.length > 0) {
        element.style.removeProperty('background-color');
        element.style.removeProperty('color');
        element.style.removeProperty('border-color');
        element.style.removeProperty('filter');
        cleanedCount++;
      }
    });
    
    debugSync('[Surgeon Cleanup] Cleaned', cleanedCount, 'elements');
  }
  
  // Reset document element and body styles
  if (document.documentElement.style.backgroundColor) {
    document.documentElement.style.removeProperty('background-color');
  }
  if (document.body.style.backgroundColor) {
    document.body.style.removeProperty('background-color');
    document.body.style.removeProperty('color');
  }
  
  applied = false;
  debugSync('Dark theme removed successfully');
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
