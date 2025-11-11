// src/background/index.ts
/// <reference types="web-ext-types" />
import { getSettings, setSettings, updateSettings, originFromUrl } from "../utils/storage";
import { applyScheduleTick } from "./scheduler";

browser.runtime.onInstalled.addListener(() => {
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
  if (a.name === "udr-schedule") applyScheduleTick();
});

browser.contextMenus.onClicked.addListener(async (info, tab) => {
  if (!tab?.url) return;
  const origin = originFromUrl(tab.url);
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
    await setSettings(msg.payload);
    // Inform active tab to re-apply
    if (sender?.tab?.id) {
      browser.tabs.sendMessage(sender.tab.id, { type: "udr:settings-updated" }).catch(() => {});
    }
  }
  if (msg?.type === "udr:update-settings") {
    await updateSettings(msg.payload);
    if (sender?.tab?.id) {
      browser.tabs.sendMessage(sender.tab.id, { type: "udr:settings-updated" }).catch(() => {});
    }
  }
});
