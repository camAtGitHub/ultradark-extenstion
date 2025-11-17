import { getSettings, setSettings } from "../utils/storage";

/** Returns true if now is within [start, end) for local time; handles overnight windows. */
export function withinWindow(start: string, end: string, now = new Date()): boolean {
  const [sh, sm] = start.split(":").map(Number);
  const [eh, em] = end.split(":").map(Number);
  const s = new Date(now), e = new Date(now);
  s.setHours(sh, sm || 0, 0, 0);
  e.setHours(eh, em || 0, 0, 0);

  if (e <= s) {
    // overnight window, e.g., 21:00 -> 07:00
    return now >= s || now < e;
  }
  return now >= s && now < e;
}

export async function applyScheduleTick() {
  const s = await getSettings();
  if (!s.schedule?.enabled) return;
  const inWindow = withinWindow(s.schedule.start, s.schedule.end);
  // Only auto-toggle the global 'enabled' bit when schedule is enabled.
  const nextEnabled = inWindow;
  if (nextEnabled !== s.enabled) {
    s.enabled = nextEnabled;
    await setSettings(s);
    // inform all tabs to refresh
    const tabs = await browser.tabs.query({});
    for (const t of tabs) {
      if (t.id) browser.tabs.sendMessage(t.id, { type: "udr:settings-updated" }).catch(() => {});
    }
  }
}
