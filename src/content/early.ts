import { debugSync } from "../utils/logger";
import { applyShield, ensurePreInjectCss } from "./instant-shield";

(() => {
  const root = document.documentElement;
  if (root.hasAttribute("data-udr-early")) {
    debugSync("[Early] document_start bootstrap already applied");
    return;
  }

  root.setAttribute("data-udr-early", "1");
  applyShield();
  ensurePreInjectCss();
  debugSync("[Early] Applied shield and pre-inject CSS at document_start");
})();
