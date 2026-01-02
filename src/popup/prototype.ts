// src/popup/prototype.ts
import type { Settings } from "../types/settings";
import { getSettings, setSettings, originFromUrl } from "../utils/storage";

const $ = (sel: string) => document.querySelector(sel) as HTMLElement;
const $$ = (sel: string) => document.querySelectorAll(sel);

interface SiteData {
  domain: string;
  favicon: string;
  settings: {
    mode: "photon-inverter" | "dom-walker" | "chroma-semantic";
    alwaysEnabled: boolean;
    alwaysDisabled: boolean;
    brightness: number;
    contrast: number;
    sepia: number;
    grayscale: number;
    blueShift: number;
  };
}

let currentSite: string | null = null;
let allSites: SiteData[] = [];
let filteredSites: SiteData[] = [];
let currentView: "listings" | "details" = "listings";

const dummySites: SiteData[] = [
  {
    domain: "github.com",
    favicon: "🔮",
    settings: {
      mode: "chroma-semantic",
      alwaysEnabled: false,
      alwaysDisabled: false,
      brightness: 95,
      contrast: 105,
      sepia: 0,
      grayscale: 5,
      blueShift: 0,
    },
  },
  {
    domain: "stackoverflow.com",
    favicon: "🏷️",
    settings: {
      mode: "photon-inverter",
      alwaysEnabled: true,
      alwaysDisabled: false,
      brightness: 100,
      contrast: 115,
      sepia: 10,
      grayscale: 0,
      blueShift: 5,
    },
  },
  {
    domain: "youtube.com",
    favicon: "▶️",
    settings: {
      mode: "photon-inverter",
      alwaysEnabled: false,
      alwaysDisabled: false,
      brightness: 90,
      contrast: 110,
      sepia: 0,
      grayscale: 15,
      blueShift: 0,
    },
  },
  {
    domain: "reddit.com",
    favicon: "🤖",
    settings: {
      mode: "chroma-semantic",
      alwaysEnabled: false,
      alwaysDisabled: false,
      brightness: 85,
      contrast: 120,
      sepia: 0,
      grayscale: 10,
      blueShift: 0,
    },
  },
  {
    domain: "amazon.com",
    favicon: "📦",
    settings: {
      mode: "photon-inverter",
      alwaysEnabled: false,
      alwaysDisabled: true,
      brightness: 100,
      contrast: 100,
      sepia: 0,
      grayscale: 0,
      blueShift: 0,
    },
  },
  {
    domain: "docs.github.com",
    favicon: "📘",
    settings: {
      mode: "chroma-semantic",
      alwaysEnabled: true,
      alwaysDisabled: false,
      brightness: 105,
      contrast: 100,
      sepia: 0,
      grayscale: 0,
      blueShift: 0,
    },
  },
  {
    domain: "notion.so",
    favicon: "📝",
    settings: {
      mode: "photon-inverter",
      alwaysEnabled: false,
      alwaysDisabled: false,
      brightness: 110,
      contrast: 95,
      sepia: 0,
      grayscale: 20,
      blueShift: 10,
    },
  },
  {
    domain: "figma.com",
    favicon: "🎨",
    settings: {
      mode: "chroma-semantic",
      alwaysEnabled: false,
      alwaysDisabled: false,
      brightness: 100,
      contrast: 100,
      sepia: 0,
      grayscale: 0,
      blueShift: 0,
    },
  },
];

async function init() {
  await loadSites();
  setupEventListeners();
  renderSiteList();
  initCustomScrollbar();
}

async function loadSites() {
  try {
    const s = await getSettings();
    if (s.perSite && Object.keys(s.perSite).length > 0) {
      allSites = Object.entries(s.perSite).map(([domain, overrides]) => {
        const override = overrides.override || {};
        return {
          domain,
          favicon: getFaviconForDomain(domain),
          settings: {
            mode:
              (override.mode as "photon-inverter" | "chroma-semantic") ||
              "photon-inverter",
            alwaysEnabled: overrides.forceDarkMode || false,
            alwaysDisabled: overrides.exclude || false,
            brightness: override.brightness || 90,
            contrast: override.contrast || 110,
            sepia: override.sepia || 0,
            grayscale: override.grayscale || 0,
            blueShift: override.blueShift || 0,
          },
        };
      });
    } else {
      allSites = [...dummySites];
    }
  } catch {
    allSites = [...dummySites];
  }

  await captureActiveTabUrl();
  prioritizeCurrentDomain();
  filteredSites = [...allSites];
}

function getFaviconForDomain(domain: string): string {
  const faviconMap: Record<string, string> = {
    github: "🔮",
    stackoverflow: "🏷️",
    youtube: "▶️",
    reddit: "🤖",
    amazon: "📦",
    notion: "📝",
    figma: "🎨",
    google: "🔍",
    twitter: "🐦",
    linkedin: "💼",
    medium: "📰",
  };

  const subdomain = domain.split(".")[0];
  return faviconMap[subdomain] || "🌐";
}

async function captureActiveTabUrl(): Promise<void> {
  try {
    const [tab] = await browser.tabs.query({
      active: true,
      currentWindow: true,
    });
    if (tab?.url) {
      currentSite = originFromUrl(tab.url);
    }
  } catch {
    currentSite = null;
  }
}

function prioritizeCurrentDomain() {
  if (!currentSite) return;

  const currentIndex = allSites.findIndex(
    (site) => site.domain === currentSite,
  );
  if (currentIndex > 0) {
    const [current] = allSites.splice(currentIndex, 1);
    allSites.unshift(current);
  }
}

function renderSiteList() {
  const siteList = $("#siteList") as HTMLElement;
  const emptyState = $("#emptyState") as HTMLElement;
  const siteDetails = $("#siteDetails") as HTMLElement;

  if (filteredSites.length === 0) {
    siteList.innerHTML = "";
    emptyState.classList.add("visible");
    siteDetails.classList.remove("visible");
    return;
  }

  emptyState.classList.remove("visible");

  siteList.innerHTML = filteredSites
    .map(
      (site, index) => `
    <div class="site-card" data-domain="${site.domain}" tabindex="0" role="button" aria-label="Edit settings for ${site.domain}">
      <span class="site-card-icon">${site.favicon}</span>
      <div class="site-card-content">
        <div class="site-card-domain">${site.domain}</div>
        <div class="site-card-meta">
          ${site.settings.alwaysEnabled ? '<span class="badge badge-enabled">ON</span>' : ""}
          ${site.settings.alwaysDisabled ? '<span class="badge badge-disabled">OFF</span>' : ""}
          <span class="badge badge-mode">${site.settings.mode === "photon-inverter" ? "Photon" : "Chroma"}</span>
          <span>Bri: ${site.settings.brightness}%</span>
        </div>
      </div>
      <div class="site-card-badges">
      </div>
      <span class="site-card-chevron">›</span>
    </div>
  `,
    )
    .join("");

  setupSiteCardListeners();
}

function setupSiteCardListeners() {
  $$(".site-card").forEach((card) => {
    card.addEventListener("click", () => {
      const domain = (card as HTMLElement).dataset.domain;
      if (domain) selectSite(domain);
    });

    card.addEventListener("keydown", (e: Event) => {
      const keyboardEvent = e as KeyboardEvent;
      if (keyboardEvent.key === "Enter" || keyboardEvent.key === " ") {
        e.preventDefault();
        const domain = (card as HTMLElement).dataset.domain;
        if (domain) selectSite(domain);
      }
    });
  });
}

function selectSite(domain: string) {
  const site = allSites.find((s) => s.domain === domain);
  if (!site) return;

  $$(".site-card").forEach((card) => {
    const cardEl = card as HTMLElement;
    if (cardEl.dataset.domain === domain) {
      cardEl.classList.add("active");
    } else {
      cardEl.classList.remove("active");
    }
  });

  const siteDetails = $("#siteDetails") as HTMLElement;
  siteDetails.classList.add("visible");

  document.body.classList.add("modal-open");

  currentView = "details";
  const backLink = $("#backLink") as HTMLAnchorElement;
  backLink.title = "Back to site list";

  $("#detailFavicon").textContent = site.favicon;
  $("#detailDomain").textContent = site.domain;

  const modeButtons = $$(".mode-btn");
  modeButtons.forEach((btn) => {
    const btnEl = btn as HTMLElement;
    if (btnEl.dataset.mode === site.settings.mode) {
      btnEl.classList.add("active");
    } else {
      btnEl.classList.remove("active");
    }
  });

  const alwaysEnabled = $("#alwaysEnabled") as HTMLInputElement;
  const alwaysDisabled = $("#alwaysDisabled") as HTMLInputElement;
  alwaysEnabled.checked = site.settings.alwaysEnabled;
  alwaysDisabled.checked = site.settings.alwaysDisabled;

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

  brightness.value = String(site.settings.brightness);
  contrast.value = String(site.settings.contrast);
  sepia.value = String(site.settings.sepia);
  grayscale.value = String(site.settings.grayscale);
  blueShift.value = String(site.settings.blueShift);

  briV.textContent = `${site.settings.brightness}%`;
  conV.textContent = `${site.settings.contrast}%`;
  sepV.textContent = `${site.settings.sepia}%`;
  gryV.textContent = `${site.settings.grayscale}%`;
  bluV.textContent = `${site.settings.blueShift}%`;

  updateSliderBackground(brightness, site.settings.brightness, 50, 120);
  updateSliderBackground(contrast, site.settings.contrast, 50, 200);
  updateSliderBackground(sepia, site.settings.sepia, 0, 100);
  updateSliderBackground(grayscale, site.settings.grayscale, 0, 100);
  updateSliderBackground(blueShift, site.settings.blueShift, 0, 100);
}

function updateSliderBackground(
  slider: HTMLInputElement,
  value: number,
  min: number,
  max: number,
) {
  const percent = ((value - min) / (max - min)) * 100;
  const accent = getComputedStyle(document.documentElement)
    .getPropertyValue("--accent")
    .trim();
  const track = getComputedStyle(document.documentElement)
    .getPropertyValue("--slider-track")
    .trim();
  slider.style.background = `linear-gradient(to right, ${accent} 0%, ${accent} ${percent}%, ${track} ${percent}%, ${track} 100%)`;
}

function showSaveIndicator() {
  const indicator = $("#saveIndicator") as HTMLElement;
  indicator.classList.add("visible");
  setTimeout(() => {
    indicator.classList.remove("visible");
  }, 1500);
}

async function saveCurrentSiteSettings() {
  const domain = $("#detailDomain").textContent;
  const site = allSites.find((s) => s.domain === domain);
  if (!site) return;

  const modeButtons = $$(".mode-btn");
  modeButtons.forEach((btn) => {
    const btnEl = btn as HTMLElement;
    if (btnEl.classList.contains("active")) {
      site.settings.mode = btnEl.dataset.mode as
        | "photon-inverter"
        | "chroma-semantic";
    }
  });

  const alwaysEnabled = $("#alwaysEnabled") as HTMLInputElement;
  const alwaysDisabled = $("#alwaysDisabled") as HTMLInputElement;
  const brightness = $("#brightness") as HTMLInputElement;
  const contrast = $("#contrast") as HTMLInputElement;
  const sepia = $("#sepia") as HTMLInputElement;
  const grayscale = $("#grayscale") as HTMLInputElement;
  const blueShift = $("#blueShift") as HTMLInputElement;

  site.settings.alwaysEnabled = alwaysEnabled.checked;
  site.settings.alwaysDisabled = alwaysDisabled.checked;
  site.settings.brightness = Number(brightness.value);
  site.settings.contrast = Number(contrast.value);
  site.settings.sepia = Number(sepia.value);
  site.settings.grayscale = Number(grayscale.value);
  site.settings.blueShift = Number(blueShift.value);

  renderSiteList();

  setTimeout(() => {
    selectSite(domain);
  }, 0);

  showSaveIndicator();
}

function setupEventListeners() {
  const searchInput = $("#siteSearch") as HTMLInputElement;
  searchInput.addEventListener("input", () => {
    const query = searchInput.value.toLowerCase().trim();
    if (!query) {
      filteredSites = [...allSites];
    } else {
      filteredSites = allSites.filter((site) =>
        site.domain.toLowerCase().includes(query),
      );
    }
    renderSiteList();
  });

  const modeButtons = $$(".mode-btn");
  modeButtons.forEach((btn) => {
    btn.addEventListener("click", () => {
      modeButtons.forEach((b) => b.classList.remove("active"));
      (btn as HTMLElement).classList.add("active");
      saveCurrentSiteSettings();
    });
  });

  const alwaysEnabled = $("#alwaysEnabled") as HTMLInputElement;
  const alwaysDisabled = $("#alwaysDisabled") as HTMLInputElement;

  alwaysEnabled.addEventListener("change", () => {
    if (alwaysEnabled.checked && alwaysDisabled.checked) {
      alwaysDisabled.checked = false;
    }
    saveCurrentSiteSettings();
  });

  alwaysDisabled.addEventListener("change", () => {
    if (alwaysDisabled.checked && alwaysEnabled.checked) {
      alwaysEnabled.checked = false;
    }
    saveCurrentSiteSettings();
  });

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

  function bindSlider(
    el: HTMLInputElement,
    label: HTMLElement,
    min: number,
    max: number,
  ) {
    el.addEventListener("input", () => {
      const value = Number(el.value);
      label.textContent = `${value}%`;
      updateSliderBackground(el, value, min, max);
    });

    el.addEventListener("change", () => {
      saveCurrentSiteSettings();
    });
  }

  bindSlider(brightness, briV, 50, 120);
  bindSlider(contrast, conV, 50, 200);
  bindSlider(sepia, sepV, 0, 100);
  bindSlider(grayscale, gryV, 0, 100);
  bindSlider(blueShift, bluV, 0, 100);

  const deleteBtn = $("#deleteSite") as HTMLButtonElement;
  deleteBtn.addEventListener("click", async () => {
    const domain = $("#detailDomain").textContent;
    if (!domain) return;

    const confirmDelete = confirm(`Delete settings for ${domain}?`);
    if (!confirmDelete) return;

    allSites = allSites.filter((site) => site.domain !== domain);
    filteredSites = [...allSites];

    const siteDetails = $("#siteDetails") as HTMLElement;
    siteDetails.classList.remove("visible");
    document.body.classList.remove("modal-open");

    renderSiteList();
  });

  const addCurrentBtn = $("#addCurrentSite") as HTMLButtonElement;
  addCurrentBtn.addEventListener("click", async () => {
    if (!currentSite) {
      alert("No active tab found. Please navigate to a website first.");
      return;
    }

    const exists = allSites.some((site) => site.domain === currentSite);
    if (exists) {
      alert(`${currentSite} is already in your saved sites.`);
      selectSite(currentSite);
      return;
    }

    const newSite: SiteData = {
      domain: currentSite,
      favicon: getFaviconForDomain(currentSite),
      settings: {
        mode: "photon-inverter",
        alwaysEnabled: false,
        alwaysDisabled: false,
        brightness: 90,
        contrast: 110,
        sepia: 0,
        grayscale: 0,
        blueShift: 0,
      },
    };

    allSites.unshift(newSite);
    filteredSites = [...allSites];
    renderSiteList();
    selectSite(currentSite);
    showSaveIndicator();
  });

  const backLink = $("#backLink") as HTMLAnchorElement;
  backLink.addEventListener("click", (e) => {
    e.preventDefault();
    if (currentView === "details") {
      currentView = "listings";
      const siteDetails = $("#siteDetails") as HTMLElement;
      siteDetails.classList.remove("visible");
      document.body.classList.remove("modal-open");
      backLink.title = "Back to main";
    } else {
      window.location.href = "index.html";
    }
  });
}

function initCustomScrollbar() {
  const wrapper = $(".scrollbar-wrapper") as HTMLElement;
  const thumb = $(".scrollbar-thumb") as HTMLElement;
  const track = $(".scrollbar-track") as HTMLElement;

  if (!wrapper || !thumb || !track) return;

  let isDragging = false;
  let startY = 0;
  let startThumbTop = 0;

  function updateThumb() {
    const containerHeight = wrapper.clientHeight;
    const contentHeight = wrapper.scrollHeight;
    const scrollTop = wrapper.scrollTop;

    if (contentHeight <= containerHeight) {
      thumb.style.display = "none";
      return;
    }

    thumb.style.display = "block";

    const thumbHeight = Math.max(
      30,
      (containerHeight / contentHeight) * containerHeight,
    );
    const maxThumbTop = containerHeight - thumbHeight - 8;
    const scrollRatio = scrollTop / (contentHeight - containerHeight);
    const thumbTop = scrollRatio * maxThumbTop;

    thumb.style.height = `${thumbHeight}px`;
    thumb.style.top = `${thumbTop + 4}px`;
  }

  function handleScroll() {
    updateThumb();
  }

  function handleThumbMouseDown(e: MouseEvent) {
    e.preventDefault();
    isDragging = true;
    thumb.classList.add("active");
    startY = e.clientY;
    const thumbStyle = getComputedStyle(thumb);
    startThumbTop = parseInt(thumbStyle.top, 10);

    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);
  }

  function handleMouseMove(e: MouseEvent) {
    if (!isDragging) return;

    const containerHeight = wrapper.clientHeight;
    const contentHeight = wrapper.scrollHeight;
    const deltaY = e.clientY - startY;
    const trackHeight = containerHeight - 8;
    const thumbHeight = parseInt(getComputedStyle(thumb).height, 10);
    const maxThumbTop = trackHeight - thumbHeight;

    let newThumbTop = startThumbTop + deltaY;
    newThumbTop = Math.max(0, Math.min(newThumbTop, maxThumbTop));

    thumb.style.top = `${newThumbTop + 4}px`;

    const scrollRatio = newThumbTop / maxThumbTop;
    const maxScroll = contentHeight - containerHeight;
    wrapper.scrollTop = scrollRatio * maxScroll;
  }

  function handleMouseUp() {
    isDragging = false;
    thumb.classList.remove("active");
    document.removeEventListener("mousemove", handleMouseMove);
    document.removeEventListener("mouseup", handleMouseUp);
  }

  wrapper.addEventListener("scroll", handleScroll);
  thumb.addEventListener("mousedown", handleThumbMouseDown);

  const resizeObserver = new ResizeObserver(() => updateThumb());
  resizeObserver.observe(wrapper);

  updateThumb();

  (window as { __scrollbarObserver?: ResizeObserver }).__scrollbarObserver =
    resizeObserver;
}

init();
