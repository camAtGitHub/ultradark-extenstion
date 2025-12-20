import { debugSync } from "../utils/logger";

const SHIELD_ID = "udr-shield";
const PREINJECT_ID = "udr-preinject";

export const PRE_INJECT_CSS = `
html,
body {
  background-color: #1a1a1a !important;
  color: #e0e0e0 !important;
}`;

export function applyShield(): boolean {
  if (document.getElementById(SHIELD_ID)) {
    debugSync("[Shield] Shield already active, skipping");
    return false;
  }

  const shield = document.createElement("style");
  shield.id = SHIELD_ID;
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
  debugSync("[Shield] Instant Shield applied");
  return true;
}

export function removeShield(): boolean {
  const shield = document.getElementById(SHIELD_ID);
  if (shield) {
    setTimeout(() => {
      shield.remove();
      debugSync("[Shield] Shield removed, handover complete");
    }, 50);
    return true;
  }

  debugSync("[Shield] No shield to remove");
  return false;
}

export function isShieldActive(): boolean {
  return Boolean(document.getElementById(SHIELD_ID));
}

export function ensurePreInjectCss(): boolean {
  const existing = document.getElementById(PREINJECT_ID) as HTMLStyleElement | null;
  if (existing) {
    if (!existing.isConnected) {
      (document.head || document.documentElement).prepend(existing);
      debugSync("[PreInject] Re-attached existing pre-inject style");
      return true;
    }
    return false;
  }

  const preInjectTag = document.createElement("style");
  preInjectTag.id = PREINJECT_ID;
  preInjectTag.textContent = PRE_INJECT_CSS;
  const parent = document.head || document.documentElement;
  parent.prepend(preInjectTag);
  debugSync("[PreInject] Applied pre-inject CSS");
  return true;
}

export function removePreInjectCss(): boolean {
  const preInjectTag = document.getElementById(PREINJECT_ID);
  if (preInjectTag?.parentNode) {
    preInjectTag.parentNode.removeChild(preInjectTag);
    debugSync("[PreInject] Removed pre-inject CSS");
    return true;
  }
  return false;
}

export function isPreInjectApplied(): boolean {
  return Boolean(document.getElementById(PREINJECT_ID));
}
