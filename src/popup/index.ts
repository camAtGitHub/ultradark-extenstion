// src/popup/index.ts
import type { Settings } from "../types/settings";
import { getSettings, setSettings } from "../utils/storage";

const $ = (sel: string) => document.querySelector(sel) as HTMLElement;

async function init() {
  const s = await getSettings();
  // Bind controls
  const toggle = $("#toggle") as HTMLButtonElement;
  const amoled = $("#amoled") as HTMLInputElement;
  const optimizer = $("#optimizer") as HTMLInputElement;
  const mode = $("#mode") as HTMLSelectElement;

  const brightness = $("#brightness") as HTMLInputElement;
  const contrast = $("#contrast") as HTMLInputElement;
  const sepia = $("#sepia") as HTMLInputElement;
  const grayscale = $("#grayscale") as HTMLInputElement;
  const blueShift = $("#blueShift") as HTMLInputElement;

  const briV = $("#briV"), conV = $("#conV"), sepV = $("#sepV"), gryV = $("#gryV"), bluV = $("#bluV");

  function reflect(st: Settings) {
    toggle.textContent = st.enabled ? "On" : "Off";
    amoled.checked = st.amoled;
    optimizer.checked = st.optimizerEnabled;
    mode.value = st.mode;
    brightness.value = String(st.brightness);
    contrast.value = String(st.contrast);
    sepia.value = String(st.sepia);
    grayscale.value = String(st.grayscale);
    blueShift.value = String(st.blueShift);
    briV.textContent = `${st.brightness}%`; conV.textContent = `${st.contrast}%`; sepV.textContent = `${st.sepia}%`; gryV.textContent = `${st.grayscale}%`; bluV.textContent = `${st.blueShift}%`;
  }

  reflect(s);

  toggle.onclick = async () => {
    s.enabled = !s.enabled;
    reflect(s);
    await setSettings(s);
    const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
    if (tab?.id) browser.tabs.sendMessage(tab.id, { type: "udr:settings-updated" }).catch(() => {});
  };

  function bindRange(el: HTMLInputElement, key: keyof Settings, label: HTMLElement) {
    el.oninput = async () => {
      // @ts-expect-error - Settings type allows numeric values for slider keys
      s[key] = Number(el.value);
      label.textContent = `${el.value}%`;
      await setSettings(s);
      const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
      if (tab?.id) browser.tabs.sendMessage(tab.id, { type: "udr:settings-updated" }).catch(() => {});
    };
  }

  amoled.onchange = mode.onchange = optimizer.onchange = async () => {
    s.amoled = amoled.checked;
    s.mode = mode.value as Settings["mode"];
    s.optimizerEnabled = optimizer.checked;
    await setSettings(s);
    const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
    if (tab?.id) browser.tabs.sendMessage(tab.id, { type: "udr:settings-updated" }).catch(() => {});
  };

  bindRange(brightness, "brightness", briV);
  bindRange(contrast, "contrast", conV);
  bindRange(sepia, "sepia", sepV);
  bindRange(grayscale, "grayscale", gryV);
  bindRange(blueShift, "blueShift", bluV);

  $("#openOptions").addEventListener("click", (e) => {
    e.preventDefault();
    browser.runtime.openOptionsPage();
  });
}

init();
