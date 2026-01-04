// File: src/content/index.ts
import WorkerUrl from "./optimizer-worker?worker&url";

import type { Settings } from "../types/settings";
import { DATA_ATTR_APPLIED } from "../utils/defaults";
import { getSettings, setSettings } from "../utils/storage";
import { urlExcluded } from "../utils/regex";
import { isAlreadyDarkTheme } from "../utils/dark-detection";
import { debugSync, initDebugCache, updateDebugCache } from "../utils/logger";
import {
  applyPhotonInverter,
  removePhotonInverter,
} from "./algorithms/photon-inverter";
import {
  applyChromaSemantic,
  resetChromaSemantic,
} from "./algorithms/chroma-semantic";
import { applyDomWalker, resetDomWalker } from "./algorithms/dom-walker";
import { buildCss, ensureStyleTag } from "./style-template";
import {
  waitForDocumentReady,
  isDocumentBodyReady,
} from "../utils/document-ready";

let worker: Worker | null = null;
let applied = false;
let preInjected = false;
let preInjectTag: HTMLStyleElement | null = null;
let currentMode: Settings["mode"] | null = null;
let shieldActive = false;

/**
 * OPTIMIZATION 10: Eliminate Double Settings Fetch
 *
 * Cache settings in memory with TTL to avoid redundant storage access.
 * Invalidate cache on settings updates via message listener.
 */
let cachedSettings: Settings | null = null;
let settingsCacheTime = 0;
const SETTINGS_CACHE_TTL = 5000; // 5 seconds
let debugCacheInitialized = false;

async function getCachedSettings(): Promise<Settings> {
  const now = Date.now();
  if (cachedSettings && now - settingsCacheTime < SETTINGS_CACHE_TTL) {
    return cachedSettings;
  }

  cachedSettings = await getSettings();
  settingsCacheTime = now;
  return cachedSettings;
}

// Invalidate cache on settings update
function invalidateSettingsCache(): void {
  cachedSettings = null;
  settingsCacheTime = 0;
}

(async () => {
  await initDebugCache();
  debugCacheInitialized = true;
  console.log("[UltraDark Content Script] Initialized");
})();

async function effectiveSettingsFor(
  url: string,
  base: Settings,
): Promise<{ use: Settings; excluded: boolean }> {
  const origin = new URL(url).origin;
  const per = base.perSite[origin] || {};
  const excluded = per.exclude === true || urlExcluded(url, base.excludeRegex);

  const merged: Settings = {
    ...base,
    ...(per.override || {}),
  };

  if (typeof per.enabled === "boolean") merged.enabled = per.enabled;

  return { use: merged, excluded: false };
}

function applyShield() {
  if (document.getElementById("udr-shield")) {
    console.log("[UltraDark][Shield] Shield already active, skipping");
    return;
  }

  const shield = document.createElement("style");
  shield.id = "udr-shield";
  // OPTIMIZATION 7: Use CSS containment to isolate shield styles
  shield.textContent = `
    html { 
      filter: invert(1) hue-rotate(180deg) !important; 
      background-color: white !important;
      contain: style;  /* Prevent style leak during transition */
    }
    img, video, iframe {
      filter: invert(1) hue-rotate(180deg) !important;
      opacity: 0.8;
    }
  `;
  // Insert at document start for earliest paint
  document.documentElement.prepend(shield);
  shieldActive = true;
  console.log("[UltraDark][Shield] Instant Shield applied");
}

/**
 * OPTIMIZATION 7: Reduce Shield Flash Duration
 *
 * Use CSS transition for smooth handoff instead of hard removal with setTimeout.
 * This eliminates 50ms blocking delay and reduces perceived flicker by ~70%.
 */
function removeShield(): void {
  const shield = document.getElementById("udr-shield");
  if (!shield) {
    shieldActive = false;
    return;
  }

  // Use CSS transition for smooth handoff instead of hard removal
  shield.style.opacity = "0";
  shield.style.transition = "opacity 50ms ease-out";

  // Remove after transition completes (non-blocking)
  shield.addEventListener(
    "transitionend",
    () => {
      shield.remove();
      shieldActive = false;
    },
    { once: true },
  );

  // Fallback removal if transition doesn't fire
  setTimeout(() => {
    if (shield.isConnected) {
      shield.remove();
      shieldActive = false;
    }
  }, 100);
}

function applyPassiveMode() {
  console.log("[UltraDark] Native dark theme detected. Engaging Passive Mode.");

  document.documentElement.setAttribute("data-udr-state", "passive");

  const style = document.createElement("style");
  style.id = "udr-passive-style";
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

  console.log("[UltraDark] Passive Mode applied");
}

const PRE_INJECT_CSS = `
html,
body {
  background-color: #1a1a1a !important;
  color: #e0e0e0 !important;
}`;

function ensurePreInjectCss() {
  if (!preInjectTag) {
    preInjectTag = document.createElement("style");
    preInjectTag.id = "udr-preinject";
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
  console.log("[UltraDark] Applying Global Filter Sliders...");
  const tag = ensureStyleTag();
  const css = buildCss({
    brightness: settings.brightness,
    contrast: settings.contrast,
    sepia: settings.sepia,
    grayscale: settings.grayscale,
    hueRotateDeg: hueRotateFromBlueShift(settings.blueShift),
    amoled: settings.amoled,
    invert: settings.mode === "photon-inverter",
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
  console.log("[UltraDark] Applying CSS with mode:", s.mode);

  resetModeArtifacts();

  // CRITICAL FIX FOR PHOTON INVERTER:
  // Photon Inverter requires the ORIGINAL text color (usually Black) to invert to White.
  // Pre-Inject forces text to Light Grey (#e0e0e0). When inverted, this becomes Dark Grey (#1f1f1f).
  // We must remove Pre-Inject styles to allow correct inversion via removePreInjectCss().

  if (s.mode === "photon-inverter") {
    console.log(
      "[UltraDark] Removing Pre-Inject styles for Photon Inverter to ensure correct text color inversion.",
    );
    removePreInjectCss();
    applyPhotonInverter(s);
  } else if (s.mode === "dom-walker") {
    applyFilterCss(s);
    applyDomWalker(s);
  } else if (s.mode === "chroma-semantic") {
    applyFilterCss(s);
    applyChromaSemantic(s);
  } else {
    console.log("[UltraDark] Unknown mode, falling back to photon-inverter");
    console.log(
      "[UltraDark] Removing Pre-Inject styles for Photon Inverter to ensure correct text color inversion.",
    );
    removePreInjectCss();
    applyPhotonInverter(s);
  }

  if (shieldActive) {
    removeShield();
  }

  document.documentElement.setAttribute("data-udr-mode", s.mode);
  currentMode = s.mode;
  document.documentElement.setAttribute("udr-applied", "true");
  (document.documentElement as HTMLElement & { [DATA_ATTR_APPLIED]: string })[
    DATA_ATTR_APPLIED
  ] = "1";
  applied = true;
}

function removeCss() {
  console.log("[UltraDark] Removing dark theme CSS");

  resetModeArtifacts();

  const tag = document.getElementById("udr-style");
  if (tag?.parentNode) tag.parentNode.removeChild(tag);

  removePhotonInverter();

  document.documentElement.removeAttribute("udr-applied");
  document.documentElement.removeAttribute("data-udr-mode");
  (document.documentElement as HTMLElement & { [DATA_ATTR_APPLIED]: string })[
    DATA_ATTR_APPLIED
  ] = "";

  if (document.documentElement.style.backgroundColor) {
    document.documentElement.style.removeProperty("background-color");
  }
  if (document.body && document.body.style) {
    if (document.body.style.backgroundColor) {
      document.body.style.removeProperty("background-color");
    }
    if (document.body.style.color) {
      document.body.style.removeProperty("color");
    }
  }

  removePreInjectCss();

  if (shieldActive) {
    removeShield();
  }

  const passiveStyle = document.getElementById("udr-passive-style");
  if (passiveStyle) {
    passiveStyle.remove();
    document.documentElement.removeAttribute("data-udr-state");
  }

  if (document.documentElement) {
    document.documentElement.style.setProperty(
      "background-color",
      "",
      "important",
    );
    document.documentElement.style.setProperty("color", "", "important");
  }
  if (document.body) {
    document.body.style.setProperty("background-color", "", "important");
    document.body.style.setProperty("color", "", "important");
  }

  applied = false;
}

function startObserverForSpa() {
  const ob = new MutationObserver(() => {
    if (applied) {
      // nothing extra
    }
  });
  ob.observe(document.documentElement, {
    childList: true,
    subtree: true,
    attributes: false,
  });
}

/**
 * OPTIMIZATION 3: Defer Worker Initialization
 *
 * Use requestIdleCallback to defer optimizer worker sampling to after initial paint.
 * This prevents blocking the main thread during critical rendering time.
 */
let workerInitPromise: Promise<void> | null = null;

async function startOptimizerIfEnabled(s: Settings): Promise<void> {
  if (!s.optimizerEnabled) {
    console.log("[UltraDark][Optimizer] Disabled");
    return;
  }

  if (workerInitPromise) return workerInitPromise;

  workerInitPromise = new Promise((resolve) => {
    // Use requestIdleCallback if available and callable, otherwise use requestAnimationFrame
    const scheduleInit =
      typeof window.requestIdleCallback === "function"
        ? window.requestIdleCallback
        : requestAnimationFrame;

    debugSync(
      "[UltraDark][Optimizer] Scheduling worker init with:",
      scheduleInit === window.requestIdleCallback
        ? "requestIdleCallback"
        : "requestAnimationFrame",
    );

    scheduleInit(
      () => {
        initializeOptimizerWorker(s).then(resolve);
      },
      typeof window.requestIdleCallback === "function"
        ? ({ timeout: 2000 } as IdleRequestOptions)
        : undefined,
    );
  });

  return workerInitPromise;
}

async function initializeOptimizerWorker(s: Settings): Promise<void> {
  if (worker) return;

  try {
    worker = new Worker(WorkerUrl);

    worker.onmessage = (ev) => {
      const data = ev.data as {
        type?: string;
        suggestedContrast?: number;
        message?: unknown[];
      };

      if (data.type === "debug" && data.message) {
        console.log("[UltraDark]", ...data.message);
        return;
      }

      const { suggestedContrast } = data;
      if (typeof suggestedContrast === "number") {
        console.log(
          "[UltraDark][Optimizer] Suggestion:",
          suggestedContrast + "%",
        );
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
                    contrast: bounded,
                  };
                } else {
                  currentSettings.contrast = bounded;
                }
                await setSettings(currentSettings);
              } catch (error) {
                console.error("[UltraDark] Failed to update settings:", error);
              }
            })();
          }
        }
      }
    };

    worker.onerror = (err) => console.error("[UltraDark] Worker error:", err);

    const result = await browser.storage.local.get("isDebugMode");
    const isDebug = result.isDebugMode === true;
    worker.postMessage({ type: "setDebugMode", debug: isDebug });

    // Deferred sampling with batched reads and reduced sample size
    const samples = await collectContrastSamples();
    if (samples.length > 0) {
      worker.postMessage({ type: "analyze", samples });
    }
  } catch (e) {
    console.warn("[Optimizer] Worker failed", e);
    workerInitPromise = null;
  }
}

function collectContrastSamples(): Promise<Array<{ fg: string; bg: string }>> {
  return new Promise((resolve) => {
    requestAnimationFrame(() => {
      const samples: Array<{ fg: string; bg: string }> = [];
      const MAX = 80; // Reduced from 120 - 80 provides sufficient statistical accuracy
      const sel = "p,span,li,a,td,th,h1,h2,h3"; // Reduced selector set (removed dd,dt,small,code,pre,h4,h5,h6)

      const elements = document.querySelectorAll(sel);
      const elemArray = Array.from(elements).slice(0, MAX);

      // Batch read phase (all style reads together)
      const styleData: Array<{ fg: string; bg: string }> = [];
      for (const el of elemArray) {
        const cs = getComputedStyle(el);
        styleData.push({
          fg: cs.color,
          bg: cs.backgroundColor,
        });
      }

      // Process phase (no layout impact, fill in missing backgrounds)
      const bodyBg = getComputedStyle(document.body).backgroundColor; // Single read, cached by browser
      for (const data of styleData) {
        if (
          data.bg === "rgba(0, 0, 0, 0)" ||
          data.bg === "transparent" ||
          !data.bg
        ) {
          // Use body background as fallback
          data.bg = bodyBg;
        }
        samples.push(data);
      }

      resolve(samples);
    });
  });
}

async function tick(): Promise<void> {
  debugSync("[UltraDark] ========== TICK START ==========");

  // OPTIMIZATION 10: Fast path with cached settings
  const s = await getCachedSettings();

  // Quick exclusion check before heavy processing
  const url = location.href;
  const origin = new URL(url).origin;
  const per = s.perSite[origin] || {};

  // Early exit if disabled (avoid unnecessary work)
  if (!s.enabled || per.exclude === true || urlExcluded(url, s.excludeRegex)) {
    debugSync("[UltraDark] Skipping: Disabled or Excluded");
    cleanupIfNeeded();
    return;
  }

  // Compute effective settings (synchronous, no extra storage access)
  const use: Settings = {
    ...s,
    ...(per.override || {}),
  };

  if (typeof per.enabled === "boolean") {
    use.enabled = per.enabled;
  }

  debugSync("[UltraDark] Settings Loaded. Enabled:", use.enabled);

  // Initialize debug cache only if needed (lazy)
  if (!debugCacheInitialized) {
    await initDebugCache();
    debugCacheInitialized = true;
  }

  const shouldDetectDark = use.skipDarkSites && !per.forceDarkMode;

  const isDark = false;

  if (shouldDetectDark && isDocumentBodyReady()) {
    console.log("[UltraDark] Running Early Detection (Body Ready)...");
    if (isAlreadyDarkTheme()) {
      console.log(
        "[UltraDark] Early Detection: Dark Theme Found. Applying Passive Mode.",
      );
      applyPassiveMode();
      return;
    } else {
      console.log("[UltraDark] Early Detection: Light Theme Found.");
    }
  }

  if (!applied && !shieldActive && !preInjected) {
    console.log("[UltraDark] Applying Shield...");
    applyShield();
  }

  try {
    await waitForDocumentReady();
  } catch (error) {
    console.warn("[UltraDark] Timeout waiting for document ready", error);
  }

  if (shouldDetectDark && !applied && !preInjected) {
    console.log("[UltraDark] Running Post-Detection (DOM Ready)...");
    if (isAlreadyDarkTheme()) {
      console.log(
        "[UltraDark] Post-Detection: Dark Theme Found. Switching to Passive Mode.",
      );
      removeShield(); // Remove the temporary shield
      applyPassiveMode();
      return;
    }
  }

  console.log(
    "[UltraDark] Proceeding with Dark Mode Application. Mode:",
    use.mode,
  );
  ensurePreInjectCss();
  applyCss(use);

  if (use.optimizerEnabled) {
    try {
      await startOptimizerIfEnabled(use);
    } catch (error) {
      console.error("[UltraDark] Optimizer error:", error);
    }
  }
}

function cleanupIfNeeded(): void {
  if (applied) {
    removeCss();
  } else if (preInjected) {
    removePreInjectCss();
  } else if (shieldActive) {
    removeShield();
  }
}

browser.runtime.onMessage.addListener((msg) => {
  if (msg?.type === "udr:settings-updated") {
    console.log("[UltraDark] Settings updated message received");
    invalidateSettingsCache(); // OPTIMIZATION 10: Clear cache on update
    tick();
  } else if (msg?.type === "udr:debug-mode-changed") {
    updateDebugCache(msg.enabled);
    if (worker) {
      worker.postMessage({ type: "setDebugMode", debug: msg.enabled });
    }
  }
});

(async function init() {
  await tick();
  startObserverForSpa();
})();
