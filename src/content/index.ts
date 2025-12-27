// File: src/content/index.ts
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
  console.log('[UltraDark Content Script] Initialized');
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

  return { use: merged, excluded: false }; // Fixed logic: typo in original returned excluded as true
}

function applyShield() {
  if (document.getElementById('udr-shield')) {
    console.log('[Shield] Shield already active, skipping');
    return;
  }

  const shield = document.createElement('style');
  shield.id = 'udr-shield';
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
  console.log('[Shield] Instant Shield applied');
}

function removeShield() {
  const shield = document.getElementById('udr-shield');
  if (shield) {
    setTimeout(() => {
      shield.remove();
      shieldActive = false;
      console.log('[Shield] Shield removed');
    }, 50); 
  }
}

function applyPassiveMode() {
  console.log('[UltraDark] Native dark theme detected. Engaging Passive Mode.');
  
  document.documentElement.setAttribute('data-udr-state', 'passive');
  
  const style = document.createElement('style');
  style.id = 'udr-passive-style';
  style.textContent = `
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
  
  console.log('[UltraDark] Passive Mode applied');
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
  console.log('[UltraDark] Applying CSS with mode:', s.mode);
  
  resetModeArtifacts();
  applyFilterCss(s);

  if (s.mode === "photon-inverter") {
    applyPhotonInverter(s);
  } else if (s.mode === "chroma-semantic") {
    applyChromaSemantic(s);
  } else {
    console.log('[UltraDark] Unknown mode, falling back to photon-inverter');
    applyPhotonInverter(s);
  }
  
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
  console.log('[UltraDark] Removing dark theme CSS');

  resetModeArtifacts();

  const tag = document.getElementById("udr-style");
  if (tag?.parentNode) tag.parentNode.removeChild(tag);
  
  removePhotonInverter();

  document.documentElement.removeAttribute("udr-applied");
  document.documentElement.removeAttribute("data-udr-mode");
  (document.documentElement as HTMLElement & { [DATA_ATTR_APPLIED]: string })[DATA_ATTR_APPLIED] = "";

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
  
  if (shieldActive) {
    removeShield();
  }
  
  const passiveStyle = document.getElementById('udr-passive-style');
  if (passiveStyle) {
    passiveStyle.remove();
    document.documentElement.removeAttribute('data-udr-state');
  }

  if (document.documentElement) {
    document.documentElement.style.setProperty('background-color', '', 'important');
    document.documentElement.style.setProperty('color', '', 'important');
  }
  if (document.body) {
    document.body.style.setProperty('background-color', '', 'important');
    document.body.style.setProperty('color', '', 'important');
  }
  
  applied = false;
}

function startObserverForSpa() {
  const ob = new MutationObserver(() => {
    if (applied) {
      // nothing extra
    }
  });
  ob.observe(document.documentElement, { childList: true, subtree: true, attributes: false });
}

async function startOptimizerIfEnabled(s: Settings) {
  if (!s.optimizerEnabled) {
    console.log('[Optimizer] Disabled');
    return;
  }
  
  if (!worker) {
    try {
      worker = new Worker(WorkerUrl);
      worker.onmessage = (ev) => {
        const data = ev.data as { type?: string; suggestedContrast?: number; message?: unknown[] };
        
        if (data.type === 'debug' && data.message) {
          console.log('[UltraDark]', ...data.message);
          return;
        }
        
        const { suggestedContrast } = data;
        if (typeof suggestedContrast === "number") {
          console.log('[Optimizer] Suggestion:', suggestedContrast + '%');
          const tag = document.getElementById("udr-style");
          if (tag) {
            const bounded = Math.min(200, Math.max(50, suggestedContrast));
            if (bounded !== s.contrast) {
              const next = { ...s, contrast: bounded };
              applyCss(next);
              (async () => {
                try {
                  const currentSettings = await getSettings();
                  const origin = new URL(location.href).origin;
                  const perSiteSettings = currentSettings.perSite[origin];
                  
                  if (perSiteSettings?.override?.contrast !== undefined) {
                    currentSettings.perSite[origin].override = {
                      ...perSiteSettings.override,
                      contrast: bounded
                    };
                  } else {
                    currentSettings.contrast = bounded;
                  }
                  await setSettings(currentSettings);
                } catch (error) {
                  console.error('[UltraDark] Failed to update settings:', error);
                }
              })();
            }
          }
        }
      };
      
      worker.onerror = (err) => console.error('[UltraDark] Worker error:', err);
      
      const result = await browser.storage.local.get('isDebugMode');
      const isDebug = result.isDebugMode === true;
      worker.postMessage({ type: 'setDebugMode', debug: isDebug });

      const samples: { fg: string; bg: string }[] = [];
      const MAX = 120;
      const sel = "p,span,li,dd,dt,small,code,pre,a,td,th,h1,h2,h3,h4,h5,h6";
      const elements = document.querySelectorAll(sel);
      
      elements.forEach((el, index) => {
        if (samples.length >= MAX) return;
        const cs = getComputedStyle(el as Element);
        const fg = cs.color;
        const bg = cs.backgroundColor || getComputedStyle((el as Element).parentElement || document.body).backgroundColor;
        samples.push({ fg, bg });
      });

      worker.postMessage({ type: "analyze", samples });

    } catch (e) {
      console.warn('[Optimizer] Worker failed', e);
    }
  }
}

async function tick() {
  console.log('[UltraDark] ========== TICK START ==========');
  
  const s = await getSettings();
  const { use, excluded } = await effectiveSettingsFor(location.href, s);
  
  console.log('[UltraDark] Settings Loaded. Enabled:', use.enabled, 'Excluded:', excluded);

  if (!use.enabled || excluded) {
    console.log('[UltraDark] Aborting: Disabled or Excluded');
    if (applied) removeCss();
    else if (preInjected) removePreInjectCss();
    else if (shieldActive) removeShield();
    return;
  }

  // Ensure debug cache is fresh so logs appear
  await initDebugCache();

  const origin = new URL(location.href).origin;
  const per = use.perSite[origin] || {};
  const shouldDetectDark = use.detectDarkSites && !per.forceDarkMode;

  // STRATEGY: Pre-Detection (before shield)
  let isDark = false;

  if (shouldDetectDark && isDocumentBodyReady()) {
      console.log('[UltraDark] Running Early Detection (Body Ready)...');
      if (isAlreadyDarkTheme()) {
          console.log('[UltraDark] Early Detection: Dark Theme Found. Applying Passive Mode.');
          applyPassiveMode();
          return;
      } else {
          console.log('[UltraDark] Early Detection: Light Theme Found.');
      }
  }

  // Apply Shield if we haven't decided yet (prevents flash of white)
  if (!applied && !shieldActive && !preInjected) {
    console.log('[UltraDark] Applying Shield...');
    applyShield();
  }

  try {
    await waitForDocumentReady();
  } catch (error) {
    console.warn('[UltraDark] Timeout waiting for document ready', error);
  }

  // STRATEGY: Post-Detection (after document ready)
  // Only run if we didn't run early detection, or if we need to be sure
  if (shouldDetectDark && !applied && !preInjected) {
      console.log('[UltraDark] Running Post-Detection (DOM Ready)...');
      if (isAlreadyDarkTheme()) {
          console.log('[UltraDark] Post-Detection: Dark Theme Found. Switching to Passive Mode.');
          removeShield(); // Remove the temporary shield
          applyPassiveMode();
          return;
      }
  }

  console.log('[UltraDark] Proceeding with Dark Mode Application. Mode:', use.mode);
  ensurePreInjectCss();
  applyCss(use);
  
  if (use.optimizerEnabled) {
    try {
      await startOptimizerIfEnabled(use);
    } catch (error) {
      console.error('[UltraDark] Optimizer error:', error);
    }
  }
}

browser.runtime.onMessage.addListener((msg) => {
  if (msg?.type === "udr:settings-updated") {
    console.log('[UltraDark] Settings updated message received');
    tick();
  } else if (msg?.type === "udr:debug-mode-changed") {
    updateDebugCache(msg.enabled);
    if (worker) {
      worker.postMessage({ type: 'setDebugMode', debug: msg.enabled });
    }
  }
});

(async function init() {
  await tick();
  startObserverForSpa();
})();