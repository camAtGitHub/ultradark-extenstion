// src/content/index.ts
import WorkerUrl from "./optimizer-worker?worker&url";

import type { Settings } from "../types/settings";
import { DATA_ATTR_APPLIED } from "../utils/defaults";
import { getSettings } from "../utils/storage";
import { urlExcluded } from "../utils/regex";
import { isAlreadyDarkTheme } from "../utils/dark-detection";
import { debugSync, initDebugCache, updateDebugCache } from "../utils/logger";
import { applyPhotonInverter, removePhotonInverter } from "./algorithms/photon-inverter";
import { applyDomWalker, resetDomWalker } from "./algorithms/dom-walker";
import { applyChromaSemantic, resetChromaSemantic } from "./algorithms/chroma-semantic";
import { buildCss, ensureStyleTag } from "./style-template";

let worker: Worker | null = null;
let applied = false;
let preInjected = false;
let preInjectTag: HTMLStyleElement | null = null;
let currentMode: Settings["mode"] | null = null;

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

const PRE_INJECT_CSS = `
html,
body {
  background-color: #1a1a1a !important;
  color: #e0e0e0 !important;
}`;

function ensurePreInjectCss() {
  if (!preInjectTag) {
    preInjectTag = document.createElement('style');
    preInjectTag.id = 'udr-preinject';
    preInjectTag.textContent = PRE_INJECT_CSS;
  }

  if (!preInjectTag.isConnected) {
    // Prefer head but fall back to documentElement to run as early as possible
    const parent = document.head || document.documentElement;
    parent.prepend(preInjectTag);
  }

  preInjected = true;
}

function removePreInjectCss() {
  if (preInjectTag?.parentNode) {
    preInjectTag.parentNode.removeChild(preInjectTag);
  }

  preInjected = false;
}

function hueRotateFromBlueShift(blueShift: number): number {
  return Math.round((blueShift / 100) * 180);
}

function applyFilterCss(settings: Settings) {
  const tag = ensureStyleTag();
  const css = buildCss({
    brightness: settings.brightness,
    contrast: settings.contrast,
    sepia: settings.sepia,
    grayscale: settings.grayscale,
    hueRotateDeg: hueRotateFromBlueShift(settings.blueShift),
    amoled: settings.amoled,
    invert: settings.mode === "photon-inverter"
  });

  tag.textContent = css;
}

function resetModeArtifacts() {
  if (currentMode === "photon-inverter") {
    removePhotonInverter();
  } else if (currentMode === "dom-walker") {
    resetDomWalker();
  } else if (currentMode === "chroma-semantic") {
    resetChromaSemantic();
  }

  currentMode = null;
}

function applyCss(s: Settings) {
  debugSync('Applying CSS with mode:', s.mode);

  resetModeArtifacts();
  applyFilterCss(s);

  if (s.mode === "photon-inverter") {
    applyPhotonInverter(s);
  } else if (s.mode === "dom-walker") {
    applyDomWalker(s);
  } else if (s.mode === "chroma-semantic") {
    applyChromaSemantic(s);
  } else {
    // Fallback to photon-inverter for unknown modes
    debugSync('Unknown mode, falling back to photon-inverter');
    applyPhotonInverter(s);
  }

  document.documentElement.setAttribute("data-udr-mode", s.mode);
  currentMode = s.mode;
  document.documentElement.setAttribute("udr-applied", "true");
  (document.documentElement as HTMLElement & { [DATA_ATTR_APPLIED]: string })[DATA_ATTR_APPLIED] = "1";
  applied = true;
}

function removeCss() {
  debugSync('Removing dark theme CSS');

  resetModeArtifacts();

  // Remove old style tag (backwards compatibility)
  const tag = document.getElementById("udr-style");
  if (tag?.parentNode) tag.parentNode.removeChild(tag);
  
  // Remove new photon inverter snippet
  removePhotonInverter();

  document.documentElement.removeAttribute("udr-applied");

  // Clean up mode attribute
  document.documentElement.removeAttribute("data-udr-mode");
  (document.documentElement as HTMLElement & { [DATA_ATTR_APPLIED]: string })[DATA_ATTR_APPLIED] = "";

  // Reset document element and body styles if they exist
  if (document.documentElement.style.backgroundColor) {
    document.documentElement.style.removeProperty('background-color');
  }
  if (document.body && document.body.style) {
    if (document.body.style.backgroundColor) {
      document.body.style.removeProperty('background-color');
    }
    if (document.body.style.color) {
      document.body.style.removeProperty('color');
    }
  }

  removePreInjectCss();

  // Remove pre-inject.css effects by resetting html and body styles
  // The pre-inject.css applies !important styles, so we need to override them
  if (document.documentElement) {
    document.documentElement.style.setProperty('background-color', '', 'important');
    document.documentElement.style.setProperty('color', '', 'important');
  }
  if (document.body) {
    document.body.style.setProperty('background-color', '', 'important');
    document.body.style.setProperty('color', '', 'important');
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
    else if (preInjected) removePreInjectCss();
    return;
  }

  // Check if site is already dark (unless forceDarkMode is set for this site)
  const per = use.perSite[origin] || {};
  const shouldDetectDark = use.detectDarkSites && !per.forceDarkMode;
  
  if (shouldDetectDark && isAlreadyDarkTheme()) {
    debugSync('Site already uses dark theme, skipping');
    if (applied) removeCss();
    else if (preInjected) removePreInjectCss();
    return;
  }

  debugSync('Applying dark theme with mode:', use.mode);
  ensurePreInjectCss();
  applyCss(use);
  if (use.optimizerEnabled) {
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
