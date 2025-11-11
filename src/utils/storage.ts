// src/utils/storage.ts
import type { Settings } from "../types/settings";
import { DEFAULTS } from "./defaults";

const KEY = "settings";

export async function getSettings(): Promise<Settings> {
  const got = await browser.storage.sync.get(KEY);
  const merged = { ...DEFAULTS, ...(got[KEY] || {}) } as Settings;
  // Defensive: ensure nested objects exist
  merged.perSite ||= {};
  merged.excludeRegex ||= [];
  merged.schedule ||= { enabled: false, start: "21:00", end: "07:00" };
  return merged;
}

export async function setSettings(s: Settings) {
  return browser.storage.sync.set({ [KEY]: s });
}

export async function updateSettings(patch: Partial<Settings>) {
  const s = await getSettings();
  const next = { ...s, ...patch, perSite: { ...s.perSite, ...(patch.perSite || {}) } };
  return setSettings(next);
}

export function originFromUrl(url: string): string {
  try {
    const u = new URL(url);
    return `${u.protocol}//${u.hostname}`;
  } catch {
    return url;
  }
}
