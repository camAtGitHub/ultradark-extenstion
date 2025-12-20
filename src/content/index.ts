// src/content/index.ts
import WorkerUrl from "./optimizer-worker?worker&url";

import type { Settings } from "../types/settings";
import { DATA_ATTR_APPLIED } from "../utils/defaults";
import { getSettings, setSettings } from "../utils/storage";
import { urlExcluded } from "../utils/regex";
import { isAlreadyDarkTheme } from "../utils/dark-detection";
import { debugSync, initDebugCache, updateDebugCache } from "../utils/logger";
import { applyPhotonInverter, removePhotonInverter } from "./algorithms/photon-inverter";
import { applyChromaSemantic, resetChromaSemantic } from "./algorithms/chroma-semantic";
import { buildCss, ensureStyleTag } from "./style-template";
import { waitForDocumentReady, isDocumentBodyReady } from "../utils/document-ready";

let worker: Worker | null = null;
let applied = false;
let preInjected = false;
let preInjectTag: HTMLStyleElement | null = null;
let currentMode: Settings["mode"] | null = null;
let shieldActive = false;

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

// THE INSTANT SHIELD
// Injects a brute-force filter immediately to prevent blinding the user
function applyShield() {
  // Prevent duplicate injection
  if (document.getElementById('udr-shield')) {
    debugSync('[Shield] Shield already active, skipping');
    return;
  }

  const shield = document.createElement('style');
  shield.id = 'udr-shield';
  // 1. Invert the whole page
  // 2. Rotate hue 180deg to restore colors (roughly)
  // 3. Set background to white (which becomes black when inverted)
  shield.textContent = `
    html { 
      filter: invert(1) hue-rotate(180deg) !important; 
      background-color: white !important;
    }
    img, video, iframe {
      filter: invert(1) hue-rotate(180deg) !important;
      opacity: 0.8;
    }
  `;
  document.documentElement.appendChild(shield);
  shieldActive = true;
  debugSync('[Shield] Instant Shield applied');
}

// THE HANDOVER
// Called when the smart algorithm (Chroma) has finished its first pass
function removeShield() {
  const shield = document.getElementById('udr-shield');
  if (shield) {
    // Optional: Add a CSS transition class to body for smooth fade
    setTimeout(() => {
      shield.remove();
      shieldActive = false;
      debugSync('[Shield] Shield removed, handover complete');
    }, 50); 
  } else {
    debugSync('[Shield] No shield to remove');
  }
}

// PASSIVE MODE
// For natively dark sites - minimal interference, just polish
function applyPassiveMode() {
  debugSync('[UltraDark] Native dark theme detected. Engaging Passive Mode.');
  
  // 1. Mark the state
  document.documentElement.setAttribute('data-udr-state', 'passive');
  
  // 2. Inject minimal enhancements (No inversion, just polish)
  const style = document.createElement('style');
  style.id = 'udr-passive-style';
  style.textContent = `
    /* Slightly dim images to match dark ambiance */
    html[data-udr-state="passive"] img,
    html[data-udr-state="passive"] video {
      filter: opacity(0.9) !important;
      transition: filter 0.3s ease;
    }
    html[data-udr-state="passive"] img:hover,
    html[data-udr-state="passive"] video:hover {
      filter: opacity(1) !important;
    }
  `;
  document.head.appendChild(style);
  
  debugSync('[UltraDark] Passive Mode applied - images dimmed, backgrounds untouched');
}

const PRE_INJECT_CSS = `
html,
body {
  background-color: #1a1a1a !important;
  color: #e0e0e0 !important;
}`;

function syncEarlyArtifacts() {
  const existingShield = document.getElementById('udr-shield');
  shieldActive = !!existingShield;

  const existingPreInject = document.getElementById('udr-preinject') as HTMLStyleElement | null;
  if (existingPreInject) {
    preInjectTag = existingPreInject;
    preInjected = true;
  }
}

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
  } else if (currentMode === "chroma-semantic") {
    resetChromaSemantic();
  }

  currentMode = null;
}

function applyCss(s: Settings) {
  debugSync('Applying CSS with mode:', s.mode);
  debugSync('[Document State] body exists:', isDocumentBodyReady(), 'readyState:', document.readyState);

  resetModeArtifacts();
  applyFilterCss(s);

  if (s.mode === "photon-inverter") {
    applyPhotonInverter(s);
  } else if (s.mode === "chroma-semantic") {
    applyChromaSemantic(s);
  } else {
    // Fallback to photon-inverter for unknown modes (including deprecated dom-walker)
    debugSync('Unknown mode or deprecated mode, falling back to photon-inverter');
    applyPhotonInverter(s);
  }
  
  // Remove the shield now that the intelligent engine is ready
  if (shieldActive) {
    removeShield();
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
  
  // Remove the instant shield if active
  if (shieldActive) {
    removeShield();
  }
  
  // Remove passive mode if active
  const passiveStyle = document.getElementById('udr-passive-style');
  if (passiveStyle) {
    passiveStyle.remove();
    document.documentElement.removeAttribute('data-udr-state');
    debugSync('Passive Mode removed');
  }

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

async function startOptimizerIfEnabled(s: Settings) {
  if (!s.optimizerEnabled) {
    debugSync('[Optimizer] Optimizer disabled in settings');
    return;
  }
  
  debugSync('[Optimizer] Starting contrast optimizer');
  
  if (!worker) {
    debugSync('[Optimizer] Creating new Web Worker');
    worker = new Worker(WorkerUrl);
    
    worker.onmessage = (ev) => {
      const data = ev.data as { type?: string; suggestedContrast?: number; message?: unknown[] };
      
      // Handle debug messages from worker
      if (data.type === 'debug' && data.message) {
        console.log('[UltraDark]', ...data.message);
        return;
      }
      
      const { suggestedContrast } = data;
      if (typeof suggestedContrast === "number") {
        debugSync('[Optimizer] Received suggestion from worker:', suggestedContrast + '%');
        const tag = document.getElementById("udr-style");
        if (tag) {
          // Rebuild CSS with adjusted contrast (bounded 50..200)
          const bounded = Math.min(200, Math.max(50, suggestedContrast));
          if (bounded !== suggestedContrast) {
            debugSync('[Optimizer] Bounded contrast value:', bounded + '% (clamped from suggested:', suggestedContrast + '%)');
          }
          if (bounded === s.contrast) {
            debugSync('[Optimizer] No contrast change needed (already at', bounded + '%)');
          } else {
            debugSync('[Optimizer] Changing contrast from', s.contrast + '% to', bounded + '%');
            const next = { ...s, contrast: bounded };
            applyCss(next);
            debugSync('[Optimizer] ✓ Contrast adjustment applied successfully');
            
            // Update settings to persist the optimizer's change and update UI sliders
            (async () => {
              try {
                const currentSettings = await getSettings();
                const origin = new URL(location.href).origin;
                const perSiteSettings = currentSettings.perSite[origin];
                
                // If there's a per-site override for contrast, update it there
                // Otherwise update the global setting
                if (perSiteSettings?.override?.contrast !== undefined) {
                  debugSync('[Optimizer] Updating per-site contrast setting for', origin);
                  currentSettings.perSite[origin].override = {
                    ...perSiteSettings.override,
                    contrast: bounded
                  };
                } else {
                  debugSync('[Optimizer] Updating global contrast setting');
                  currentSettings.contrast = bounded;
                }
                
                await setSettings(currentSettings);
                debugSync('[Optimizer] Settings updated, UI sliders will reflect new contrast value');
              } catch (error) {
                console.error('[UltraDark] [Optimizer] Failed to update settings:', error);
              }
            })();
          }
        } else {
          debugSync('[Optimizer] ⚠️ Warning: Style tag not found, cannot apply contrast adjustment');
        }
      }
    };
    
    worker.onerror = (err) => {
      console.error('[UltraDark] [Optimizer] Worker error:', err);
    };
    
    // Send debug mode to worker synchronously before sending samples
    const result = await browser.storage.local.get('isDebugMode');
    const isDebug = result.isDebugMode === true;
    worker.postMessage({ type: 'setDebugMode', debug: isDebug });
    debugSync('[Optimizer] Debug mode sent to worker:', isDebug);
  }

  // Sample a limited set of text nodes
  debugSync('[Optimizer] Starting element sampling');
  const samples: { fg: string; bg: string }[] = [];
  const MAX = 120;
  const sel = "p,span,li,dd,dt,small,code,pre,a,td,th,h1,h2,h3,h4,h5,h6";
  const elements = document.querySelectorAll(sel);
  debugSync('[Optimizer] Found', elements.length, 'potential elements to sample (max', MAX + ')');
  
  elements.forEach((el, index) => {
    if (samples.length >= MAX) return;
    const cs = getComputedStyle(el as Element);
    const fg = cs.color;
    const bg = cs.backgroundColor || getComputedStyle((el as Element).parentElement || document.body).backgroundColor;
    samples.push({ fg, bg });
    
    // Log first few samples for inspection
    if (index < 3) {
      debugSync('[Optimizer] Sample', index + 1, ':', el.tagName, '- FG:', fg, 'BG:', bg);
    }
  });

  debugSync('[Optimizer] Collected', samples.length, 'samples, sending to worker for analysis');
  worker.postMessage({ type: "analyze", samples });
  debugSync('[Optimizer] Analysis request sent to worker, waiting for response...');
}

async function tick() {
  const s = await getSettings();
  const { use, excluded } = await effectiveSettingsFor(location.href, s);

  const origin = new URL(location.href).origin;
  syncEarlyArtifacts();

  // Check if should skip due to exclusion
  if (!use.enabled || excluded) {
    debugSync('Skipping - extension disabled or URL excluded:', location.href);
    if (applied) removeCss();
    else if (preInjected) removePreInjectCss();
    else if (shieldActive) removeShield();
    return;
  }

  // Apply Instant Shield immediately to prevent white flash
  // This happens BEFORE waiting for document ready
  if (!applied && !shieldActive && !preInjected) {
    applyShield();
  }

  // Wait for document body to be ready before detection and theme application
  // This is critical for all algorithms, especially Chroma-semantic
  try {
    await waitForDocumentReady();
    debugSync('Document ready, proceeding with detection and application');
  } catch (error) {
    debugSync('⚠️ Timeout waiting for document ready, proceeding anyway:', error);
    // Proceed anyway - algorithms have their own fallback mechanisms
  }

  // Check if site is already dark (unless forceDarkMode is set for this site)
  // Only run detection if we haven't already applied our theme
  // This prevents false positives from detecting our own styles
  const per = use.perSite[origin] || {};
  const shouldDetectDark = use.detectDarkSites && !per.forceDarkMode;
  
  if (shouldDetectDark && !applied && !preInjected && !shieldActive && isAlreadyDarkTheme()) {
    debugSync('Site already uses dark theme, engaging Passive Mode');
    applyPassiveMode();
    return; // STOP. Do not run Chroma or Shield.
  }

  debugSync('Applying dark theme with mode:', use.mode);
  ensurePreInjectCss();
  applyCss(use);
  if (use.optimizerEnabled) {
    debugSync('[Optimizer] Optimizer is enabled, will start analysis');
    try {
      await startOptimizerIfEnabled(use);
    } catch (error) {
      console.error('[UltraDark] [Optimizer] Failed to start optimizer:', error);
    }
  } else {
    debugSync('[Optimizer] Optimizer is disabled, skipping');
  }
}

browser.runtime.onMessage.addListener((msg) => {
  if (msg?.type === "udr:settings-updated") {
    debugSync('Settings updated, reapplying theme');
    tick();
  } else if (msg?.type === "udr:debug-mode-changed") {
    // Update debug cache when debug mode changes
    updateDebugCache(msg.enabled);
    // Also update the worker's debug mode if it exists
    if (worker) {
      worker.postMessage({ type: 'setDebugMode', debug: msg.enabled });
      debugSync('[Optimizer] Debug mode changed, notified worker:', msg.enabled);
    }
  }
});

(async function init() {
  await tick();
  startObserverForSpa();
})();

debugSync('content script loaded as module');
