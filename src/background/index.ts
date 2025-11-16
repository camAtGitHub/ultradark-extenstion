// src/background/index.ts
/// <reference types="web-ext-types" />
import { getSettings, setSettings, updateSettings, originFromUrl } from "../utils/storage";
import { applyScheduleTick } from "./scheduler";
import { debugSync, initDebugCache, info } from "../utils/logger";

(async () => {
  await initDebugCache();
  debugSync('Background script initialized');
})();

browser.runtime.onInstalled.addListener(() => {
  info('Extension installed/updated');
  // Initialize context menus
  browser.contextMenus.create({
    id: "udr-toggle-site",
    title: "UltraDark: Toggle on this site",
    contexts: ["page", "browser_action"]
  });
  browser.contextMenus.create({
    id: "udr-exclude-site",
    title: "UltraDark: Exclude this site",
    contexts: ["page", "browser_action"]
  });

  // Alarm to check schedule every minute
  browser.alarms.create("udr-schedule", { periodInMinutes: 1 });
});

browser.alarms.onAlarm.addListener((a) => {
  if (a.name === "udr-schedule") {
    debugSync('Running schedule check');
    applyScheduleTick();
  }
});

browser.contextMenus.onClicked.addListener(async (info, tab) => {
  if (!tab?.url) return;
  const origin = originFromUrl(tab.url);
  debugSync('Context menu clicked:', info.menuItemId, 'for', origin);
  const s = await getSettings();
  s.perSite[origin] ||= {};
  if (info.menuItemId === "udr-toggle-site") {
    const current = s.perSite[origin].enabled ?? s.enabled;
    s.perSite[origin].enabled = !current;
  } else if (info.menuItemId === "udr-exclude-site") {
    s.perSite[origin].exclude = !(s.perSite[origin].exclude ?? false);
  }
  await setSettings(s);
  if (tab.id) browser.tabs.sendMessage(tab.id, { type: "udr:settings-updated" }).catch(() => {});
});

browser.runtime.onMessage.addListener(async (msg, sender) => {
  if (msg?.type === "udr:get-settings") {
    return getSettings();
  }
  if (msg?.type === "udr:set-settings") {
    debugSync('Settings updated via message');
    await setSettings(msg.payload);
    // Inform active tab to re-apply
    if (sender?.tab?.id) {
      browser.tabs.sendMessage(sender.tab.id, { type: "udr:settings-updated" }).catch(() => {});
    }
  }
  if (msg?.type === "udr:update-settings") {
    debugSync('Settings patched via message');
    await updateSettings(msg.payload);
    if (sender?.tab?.id) {
      browser.tabs.sendMessage(sender.tab.id, { type: "udr:settings-updated" }).catch(() => {});
    }
  }
});
