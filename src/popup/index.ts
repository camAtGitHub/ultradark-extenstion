// src/popup/index.ts
import type { Settings } from "../types/settings";
import { getSettings, setSettings, originFromUrl } from "../utils/storage";

const $ = (sel: string) => document.querySelector(sel) as HTMLElement;
const $$ = (sel: string) => document.querySelectorAll(sel);

// Capture active tab URL when popup opens
let activeTabUrl: string | null = null;

async function captureActiveTabUrl(): Promise<void> {
  try {
    const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
    if (tab?.url) {
      activeTabUrl = tab.url;
    }
  } catch {
    activeTabUrl = null;
  }
}

/**
 * Debounce function to limit how often a function can be called
 * @param func - The function to debounce
 * @param wait - Time to wait in milliseconds (default 250ms)
 * @returns Debounced function
 */
function debounce<T extends (...args: unknown[]) => void>(
  func: T,
  wait = 250
): (...args: Parameters<T>) => void {
  let timeout: ReturnType<typeof setTimeout> | null = null;
  
  return (...args: Parameters<T>) => {
    if (timeout) clearTimeout(timeout);
    timeout = setTimeout(() => {
      func(...args);
    }, wait);
  };
}


async function init() {
  const s = await getSettings();
  // Bind controls
  const toggle = $("#toggle") as HTMLInputElement;
  const amoled = $("#amoled") as HTMLInputElement;
  const optimizer = $("#optimizer") as HTMLInputElement;
  const detectDark = $("#detectDark") as HTMLInputElement;
  const modeButtons = $$(".mode-btn");

  const brightness = $("#brightness") as HTMLInputElement;
  const contrast = $("#contrast") as HTMLInputElement;
  const sepia = $("#sepia") as HTMLInputElement;
  const grayscale = $("#grayscale") as HTMLInputElement;
  const blueShift = $("#blueShift") as HTMLInputElement;

  const briV = $("#briV"),
    conV = $("#conV"),
    sepV = $("#sepV"),
    gryV = $("#gryV"),
    bluV = $("#bluV");

  function reflect(st: Settings) {
    toggle.checked = st.enabled;
    amoled.checked = st.amoled;
    optimizer.checked = st.optimizerEnabled;
    detectDark.checked = st.detectDarkSites;

    // Update mode buttons
    modeButtons.forEach((btn) => {
      const mode = (btn as HTMLElement).dataset.mode;
      if (mode === st.mode) {
        btn.classList.add("active");
      } else {
        btn.classList.remove("active");
      }
    });

    brightness.value = String(st.brightness);
    contrast.value = String(st.contrast);
    sepia.value = String(st.sepia);
    grayscale.value = String(st.grayscale);
    blueShift.value = String(st.blueShift);
    briV.textContent = `${st.brightness}%`;
    conV.textContent = `${st.contrast}%`;
    sepV.textContent = `${st.sepia}%`;
    gryV.textContent = `${st.grayscale}%`;
    bluV.textContent = `${st.blueShift}%`;

    // Update slider backgrounds
    updateSliderBackground(brightness, st.brightness, 50, 120);
    updateSliderBackground(contrast, st.contrast, 50, 200);
    updateSliderBackground(sepia, st.sepia, 0, 100);
    updateSliderBackground(grayscale, st.grayscale, 0, 100);
    updateSliderBackground(blueShift, st.blueShift, 0, 100);

    // Update slider enabled/disabled state based on algorithm
    updateSlidersForMode(st.mode);
  }

  function updateSlidersForMode(mode: Settings["mode"]) {
    // Only Photon Inverter uses the sliders
    // DOM Walker and Chroma-Semantic use their own color algorithms
    const shouldEnable = mode === "photon-inverter";
    
    brightness.disabled = !shouldEnable;
    contrast.disabled = !shouldEnable;
    sepia.disabled = !shouldEnable;
    grayscale.disabled = !shouldEnable;
    blueShift.disabled = !shouldEnable;
  }

  function updateSliderBackground(slider: HTMLInputElement, value: number, min: number, max: number) {
    const percent = ((value - min) / (max - min)) * 100;
    const accent = getComputedStyle(document.documentElement).getPropertyValue("--accent").trim();
    const track = getComputedStyle(document.documentElement).getPropertyValue("--slider-track").trim();
    slider.style.background = `linear-gradient(to right, ${accent} 0%, ${accent} ${percent}%, ${track} ${percent}%, ${track} 100%)`;
  }

  reflect(s);

  toggle.onchange = async () => {
    s.enabled = toggle.checked;
    reflect(s);
    await setSettings(s);
    const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
    if (tab?.id) browser.tabs.sendMessage(tab.id, { type: "udr:settings-updated" }).catch(() => {});
  };

  // Mode button click handler
  modeButtons.forEach((btn) => {
    btn.addEventListener("click", async () => {
      const mode = (btn as HTMLElement).dataset.mode as Settings["mode"];
      if (mode && mode !== s.mode) {
        s.mode = mode;
        reflect(s);
        await setSettings(s);
        const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
        if (tab?.id) browser.tabs.sendMessage(tab.id, { type: "udr:settings-updated" }).catch(() => {});
      }
    });
  });

  function bindRange(el: HTMLInputElement, key: keyof Settings, label: HTMLElement, min: number, max: number) {
    // Create a debounced version of the settings update function
    const debouncedUpdate = debounce(async (value: number) => {
      // @ts-expect-error - Settings type allows numeric values for slider keys
      s[key] = value;
      await setSettings(s);
      const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
      if (tab?.id) browser.tabs.sendMessage(tab.id, { type: "udr:settings-updated" }).catch(() => {});
    }, 250); // 250ms debounce delay

    el.oninput = () => {
      const value = Number(el.value);
      // Update UI immediately for responsive feedback
      label.textContent = `${value}%`;
      updateSliderBackground(el, value, min, max);
      // But debounce the settings save and theme update
      debouncedUpdate(value);
    };
  }

  amoled.onchange = optimizer.onchange = detectDark.onchange = async () => {
    s.amoled = amoled.checked;
    s.optimizerEnabled = optimizer.checked;
    s.detectDarkSites = detectDark.checked;
    await setSettings(s);
    const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
    if (tab?.id) browser.tabs.sendMessage(tab.id, { type: "udr:settings-updated" }).catch(() => {});
  };

  bindRange(brightness, "brightness", briV, 50, 120);
  bindRange(contrast, "contrast", conV, 50, 200);
  bindRange(sepia, "sepia", sepV, 0, 100);
  bindRange(grayscale, "grayscale", gryV, 0, 100);
  bindRange(blueShift, "blueShift", bluV, 0, 100);

  $("#openOptions").addEventListener("click", (e) => {
    e.preventDefault();
    browser.runtime.openOptionsPage();
  });

  // Reset Sliders button handler
  $("#resetSiteSettings").addEventListener("click", async () => {
    // Reset sliders to default values in the UI only (no storage changes)
    const defaultValues = {
      brightness: 90,
      contrast: 110,
      sepia: 0,
      grayscale: 0,
      blueShift: 0
    };

    // Update UI sliders and values
    brightness.value = String(defaultValues.brightness);
    contrast.value = String(defaultValues.contrast);
    sepia.value = String(defaultValues.sepia);
    grayscale.value = String(defaultValues.grayscale);
    blueShift.value = String(defaultValues.blueShift);
    
    briV.textContent = `${defaultValues.brightness}%`;
    conV.textContent = `${defaultValues.contrast}%`;
    sepV.textContent = `${defaultValues.sepia}%`;
    gryV.textContent = `${defaultValues.grayscale}%`;
    bluV.textContent = `${defaultValues.blueShift}%`;

    // Update slider backgrounds
    updateSliderBackground(brightness, defaultValues.brightness, 50, 120);
    updateSliderBackground(contrast, defaultValues.contrast, 50, 200);
    updateSliderBackground(sepia, defaultValues.sepia, 0, 100);
    updateSliderBackground(grayscale, defaultValues.grayscale, 0, 100);
    updateSliderBackground(blueShift, defaultValues.blueShift, 0, 100);

    // Update local settings object and apply to active tab
    s.brightness = defaultValues.brightness;
    s.contrast = defaultValues.contrast;
    s.sepia = defaultValues.sepia;
    s.grayscale = defaultValues.grayscale;
    s.blueShift = defaultValues.blueShift;

    // Send message to active tab to apply new settings immediately
    const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
    if (tab?.id) browser.tabs.sendMessage(tab.id, { type: "udr:settings-updated" }).catch(() => {});
  });

  // Add Active Site button handler
  $("#addActiveSite").addEventListener("click", async () => {
    if (!activeTabUrl) {
      alert("No active tab found. Please try reopening the popup.");
      return;
    }

    // Explicitly prevent moz-extension:// and other internal URLs
    if (activeTabUrl.startsWith("moz-extension://") || activeTabUrl.startsWith("about:") || activeTabUrl.startsWith("chrome://")) {
      alert("Cannot add override for internal extension/browser pages. Please navigate to a website (http:// or https://) first.");
      return;
    }

    // Only allow http:// and https:// URLs
    if (!activeTabUrl.startsWith("http://") && !activeTabUrl.startsWith("https://")) {
      alert(`Cannot add override for ${activeTabUrl.split(":")[0]}: URLs. Only http:// and https:// sites are supported.`);
      return;
    }

    const origin = originFromUrl(activeTabUrl);
    
    // Check if already exists
    if (s.perSite[origin]) {
      alert(`Override for ${origin} already exists. Open "More options" to modify it.`);
      return;
    }

    s.perSite[origin] = {};
    await setSettings(s);
    alert(`Added ${origin} to per-site overrides. Open "More options" to configure it.`);
  });
}

// Initialize popup by capturing active tab URL first, then setting up UI
(async () => {
  await captureActiveTabUrl();
  await init();
})();
