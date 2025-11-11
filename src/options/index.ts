// src/options/index.ts
import type { Settings } from "../types/settings";
import { getSettings, setSettings, originFromUrl } from "../utils/storage";
import { compileRegexList } from "../utils/regex";

const $ = (s: string) => document.querySelector(s) as HTMLElement;

async function loadAndReflect() {
  const s = await getSettings();

  (document.getElementById("schedEnabled") as HTMLInputElement).checked = s.schedule.enabled;
  (document.getElementById("schedStart") as HTMLInputElement).value = s.schedule.start;
  (document.getElementById("schedEnd") as HTMLInputElement).value = s.schedule.end;

  const regexList = document.getElementById("regexList") as HTMLTextAreaElement;
  regexList.value = s.excludeRegex.join("\n");

  renderSiteList(s);
}

function renderSiteList(s: Settings) {
  const container = document.getElementById("sites")!;
  container.innerHTML = "";
  const entries = Object.entries(s.perSite);
  if (!entries.length) {
    container.innerHTML = `<p class="hint">No per-site overrides yet. Use the context menu or the button below on an active tab.</p>`;
    return;
  }
  for (const [origin, conf] of entries) {
    const row = document.createElement("div");
    row.className = "site";
    row.innerHTML = `
      <code style="flex:1 1 auto">${origin}</code>
      <label><input type="checkbox" data-k="enabled" ${conf.enabled ? "checked": ""}/> enabled</label>
      <label><input type="checkbox" data-k="exclude" ${conf.exclude ? "checked": ""}/> exclude</label>
      <button class="save" data-origin="${origin}">Save</button>
    `;
    container.appendChild(row);

    row.querySelector(".save")!.addEventListener("click", async () => {
      const enabled = (row.querySelector('input[data-k="enabled"]') as HTMLInputElement).checked;
      const exclude = (row.querySelector('input[data-k="exclude"]') as HTMLInputElement).checked;
      const st = await getSettings();
      st.perSite[origin] ||= {};
      st.perSite[origin].enabled = enabled;
      st.perSite[origin].exclude = exclude;
      await setSettings(st);
      (document.getElementById("sites") as HTMLElement).insertAdjacentHTML("beforeend", `<div class="hint">Saved ${origin}</div>`);
    });
  }
}

function bind() {
  const schedEnabled = document.getElementById("schedEnabled") as HTMLInputElement;
  const schedStart = document.getElementById("schedStart") as HTMLInputElement;
  const schedEnd = document.getElementById("schedEnd") as HTMLInputElement;

  schedEnabled.onchange = async () => {
    const s = await getSettings();
    s.schedule.enabled = schedEnabled.checked;
    await setSettings(s);
  };
  schedStart.onchange = schedEnd.onchange = async () => {
    const s = await getSettings();
    s.schedule.start = schedStart.value;
    s.schedule.end = schedEnd.value;
    await setSettings(s);
  };

  (document.getElementById("saveRegex") as HTMLButtonElement).onclick = async () => {
    const raw = (document.getElementById("regexList") as HTMLTextAreaElement).value.split("\n").map((x) => x.trim()).filter(Boolean);
    // validate
    compileRegexList(raw); // throws ignored internally
    const s = await getSettings();
    s.excludeRegex = raw;
    await setSettings(s);
    (document.getElementById("testResult") as HTMLElement).textContent = "Saved patterns.";
  };

  (document.getElementById("testBtn") as HTMLButtonElement).onclick = async () => {
    const raw = (document.getElementById("regexList") as HTMLTextAreaElement).value.split("\n").map((x) => x.trim()).filter(Boolean);
    const testUrl = (document.getElementById("testUrl") as HTMLInputElement).value.trim();
    if (!testUrl) return;
    const regexes = compileRegexList(raw);
    const excluded = regexes.some((re) => re.test(testUrl));
    const badge = document.getElementById("testResult")!;
    badge.textContent = excluded ? "Excluded ✅" : "Not matched";
  };

  (document.getElementById("refreshSites") as HTMLButtonElement).onclick = async () => {
    const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
    if (!tab?.url) return;
    const s = await getSettings();
    const origin = originFromUrl(tab.url);
    s.perSite[origin] ||= {};
    await setSettings(s);
    renderSiteList(await getSettings());
  };
}

loadAndReflect();
bind();
