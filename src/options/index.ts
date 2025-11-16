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
    container.innerHTML = `<p class="hint">No per-site overrides yet. Use the button below to add the current tab.</p>`;
    return;
  }
  for (const [origin, conf] of entries) {
    const row = document.createElement("div");
    row.className = "site";
    
    // Determine which radio should be selected
    const alwaysOn = conf.enabled === true;
    const disabled = conf.exclude === true;
    const useDefault = !alwaysOn && !disabled;
    
    row.innerHTML = `
      <code class="site-origin">${origin}</code>
      <div class="site-controls">
        <label class="radio-label">
          <input type="radio" name="mode-${origin}" value="default" ${useDefault ? "checked" : ""} />
          <span>Use global setting</span>
        </label>
        <label class="radio-label">
          <input type="radio" name="mode-${origin}" value="enabled" ${alwaysOn ? "checked" : ""} />
          <span>Always on</span>
        </label>
        <label class="radio-label">
          <input type="radio" name="mode-${origin}" value="disabled" ${disabled ? "checked" : ""} />
          <span>Disabled</span>
        </label>
        <label class="checkbox-label">
          <input type="checkbox" data-k="forceDarkMode" ${conf.forceDarkMode ? "checked" : ""} />
          <span>Force on dark sites</span>
        </label>
        <button class="delete-btn" data-origin="${origin}" title="Remove this site override">🗑️</button>
      </div>
    `;
    container.appendChild(row);

    // Auto-save on any change
    const radios = row.querySelectorAll('input[type="radio"]');
    radios.forEach((radio) => {
      radio.addEventListener("change", async () => {
        const selected = (row.querySelector(`input[name="mode-${origin}"]:checked`) as HTMLInputElement)?.value;
        const forceDarkMode = (row.querySelector('input[data-k="forceDarkMode"]') as HTMLInputElement).checked;
        const st = await getSettings();
        st.perSite[origin] ||= {};
        
        // Set mutually exclusive states
        if (selected === "enabled") {
          st.perSite[origin].enabled = true;
          st.perSite[origin].exclude = false;
        } else if (selected === "disabled") {
          st.perSite[origin].enabled = false;
          st.perSite[origin].exclude = true;
        } else {
          // Default: clear both
          st.perSite[origin].enabled = false;
          st.perSite[origin].exclude = false;
        }
        
        st.perSite[origin].forceDarkMode = forceDarkMode;
        await setSettings(st);
        showFeedback(row, "Saved");
      });
    });

    // Auto-save force dark mode checkbox
    const forceDarkCheckbox = row.querySelector('input[data-k="forceDarkMode"]');
    forceDarkCheckbox?.addEventListener("change", async () => {
      const forceDarkMode = (forceDarkCheckbox as HTMLInputElement).checked;
      const st = await getSettings();
      st.perSite[origin] ||= {};
      st.perSite[origin].forceDarkMode = forceDarkMode;
      await setSettings(st);
      showFeedback(row, "Saved");
    });

    // Delete button
    row.querySelector(".delete-btn")!.addEventListener("click", async () => {
      const st = await getSettings();
      delete st.perSite[origin];
      await setSettings(st);
      row.style.opacity = "0";
      row.style.transform = "translateX(-10px)";
      setTimeout(() => {
        row.remove();
        // If no more sites, show hint
        if (Object.keys(st.perSite).length === 0) {
          renderSiteList(st);
        }
      }, 200);
    });
  }
}

function showFeedback(element: HTMLElement, message: string) {
  const existing = element.querySelector(".save-feedback");
  if (existing) existing.remove();
  
  const feedback = document.createElement("span");
  feedback.className = "save-feedback";
  feedback.textContent = message;
  element.appendChild(feedback);
  
  setTimeout(() => {
    feedback.style.opacity = "0";
    setTimeout(() => feedback.remove(), 200);
  }, 1500);
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

  // Auto-save regex on blur or when test is clicked
  const regexList = document.getElementById("regexList") as HTMLTextAreaElement;
  regexList.addEventListener("blur", async () => {
    const raw = regexList.value.split("\n").map((x) => x.trim()).filter(Boolean);
    const s = await getSettings();
    s.excludeRegex = raw;
    await setSettings(s);
  });

  (document.getElementById("testBtn") as HTMLButtonElement).onclick = async () => {
    const raw = (document.getElementById("regexList") as HTMLTextAreaElement).value.split("\n").map((x) => x.trim()).filter(Boolean);
    const testUrl = (document.getElementById("testUrl") as HTMLInputElement).value.trim();
    const badge = document.getElementById("testResult")!;
    
    if (!testUrl) {
      badge.style.display = "block";
      badge.className = "badge error";
      badge.textContent = "Please enter a URL to test";
      return;
    }
    
    try {
      const regexes = compileRegexList(raw);
      const excluded = regexes.some((re) => re.test(testUrl));
      badge.style.display = "block";
      badge.className = excluded ? "badge success" : "badge info";
      badge.textContent = excluded ? "✓ URL matches exclusion rules" : "URL does not match any rules";
      
      // Auto-save regex patterns when testing
      const s = await getSettings();
      s.excludeRegex = raw;
      await setSettings(s);
    } catch (err) {
      badge.style.display = "block";
      badge.className = "badge error";
      badge.textContent = `Error: ${(err as Error).message || "Invalid regex pattern"}`;
    }
  };

  (document.getElementById("refreshSites") as HTMLButtonElement).onclick = async () => {
    const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
    if (!tab?.url) {
      alert("No active tab found");
      return;
    }
    
    // Explicitly prevent moz-extension:// and other internal URLs
    if (tab.url.startsWith("moz-extension://") || tab.url.startsWith("about:") || tab.url.startsWith("chrome://")) {
      alert("Cannot add override for internal extension/browser pages. Please navigate to a website (http:// or https://) first.");
      return;
    }
    
    // Only allow http:// and https:// URLs
    if (!tab.url.startsWith("http://") && !tab.url.startsWith("https://")) {
      alert(`Cannot add override for ${tab.url.split(":")[0]}: URLs. Only http:// and https:// sites are supported.`);
      return;
    }
    
    const s = await getSettings();
    const origin = originFromUrl(tab.url);
    
    // Check if already exists
    if (s.perSite[origin]) {
      alert(`Override for ${origin} already exists. Modify it below.`);
      return;
    }
    
    s.perSite[origin] ||= {};
    await setSettings(s);
    renderSiteList(await getSettings());
  };
}

loadAndReflect();
bind();
