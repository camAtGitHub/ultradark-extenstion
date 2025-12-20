import type { Settings } from "../types/settings";
import { getSettings } from "../utils/storage";
import { urlExcluded } from "../utils/regex";
import { debugSync, initDebugCache } from "../utils/logger";

const PRE_INJECT_CSS = `
html,
body {
  background-color: #1a1a1a !important;
  color: #e0e0e0 !important;
}`;

function shouldEnable(settings: Settings): boolean {
  const origin = new URL(location.href).origin;
  const per = settings.perSite[origin] || {};
  const excluded = per.exclude === true || urlExcluded(location.href, settings.excludeRegex);

  const enabled = typeof per.enabled === "boolean" ? per.enabled : settings.enabled;
  return enabled && !excluded;
}

function applyEarlyShield() {
  if (document.getElementById("udr-shield")) {
    return;
  }

  const shield = document.createElement("style");
  shield.id = "udr-shield";
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
}

function applyPreInjectCss() {
  if (document.getElementById("udr-preinject")) {
    return;
  }

  const style = document.createElement("style");
  style.id = "udr-preinject";
  style.textContent = PRE_INJECT_CSS;
  (document.head || document.documentElement).prepend(style);
}

async function initEarly() {
  await initDebugCache();
  debugSync("[Early] content script starting");

  const settings = await getSettings();
  if (!shouldEnable(settings)) {
    debugSync("[Early] Skipping early apply (disabled or excluded)");
    return;
  }

  applyPreInjectCss();
  applyEarlyShield();
  debugSync("[Early] Pre-inject and shield applied");
}

initEarly().catch((error) => {
  console.error("[UltraDark][Early] Failed to initialize early script", error);
});
