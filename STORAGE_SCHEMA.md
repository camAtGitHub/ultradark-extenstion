# UltraDark Reader - Storage Schema Documentation

This document describes all keys and data structures used by UltraDark Reader in browser storage APIs.

## Storage Types

UltraDark Reader uses two browser storage APIs:

- **`browser.storage.sync`** - Main extension settings that sync across devices
- **`browser.storage.local`** - Local-only settings (e.g., debug mode)

---

## browser.storage.sync

### Key: `settings`

**Type:** `Settings` object

**Purpose:** Stores all main extension configuration including global theme settings, per-site overrides, exclusion rules, and scheduling.

**Structure:**

```typescript
{
  enabled: boolean,           // Global on/off switch for the extension
  mode: "architect" | "surgeon",  // Theme application method
  amoled: boolean,            // Use pure black (#000) for AMOLED displays
  brightness: number,         // 0-100: Brightness adjustment percentage
  contrast: number,           // 50-200: Contrast adjustment percentage
  sepia: number,              // 0-100: Sepia filter percentage
  grayscale: number,          // 0-100: Grayscale filter percentage
  blueShift: number,          // 0-100: Blue light reduction (hue rotation)
  optimizerEnabled: boolean,  // Enable dynamic contrast optimizer
  detectDarkSites: boolean,   // Skip dark theme on sites already dark
  perSite: {                  // Per-site override configuration
    "[origin]": {
      enabled?: boolean,      // Force on/off for this site
      exclude?: boolean,      // Exclude this site from theming
      override?: Partial<Settings>,  // Site-specific theme settings
      forceDarkMode?: boolean  // Apply theme even if site is detected as dark
    }
  },
  excludeRegex: string[],     // Regex patterns to exclude URLs
  schedule: {                 // Automatic scheduling
    enabled: boolean,         // Enable automatic scheduling
    start: string,            // Start time (24h format, e.g., "21:00")
    end: string               // End time (24h format, e.g., "07:00")
  }
}
```

**Default Values:**

```javascript
{
  enabled: true,
  mode: "architect",
  amoled: false,
  brightness: 90,
  contrast: 110,
  sepia: 0,
  grayscale: 0,
  blueShift: 0,
  optimizerEnabled: true,
  detectDarkSites: true,
  perSite: {},
  excludeRegex: [],
  schedule: { enabled: false, start: "21:00", end: "07:00" }
}
```

**Example Value:**

```javascript
{
  enabled: true,
  mode: "architect",
  amoled: false,
  brightness: 85,
  contrast: 120,
  sepia: 5,
  grayscale: 0,
  blueShift: 15,
  optimizerEnabled: true,
  detectDarkSites: true,
  perSite: {
    "https://github.com": {
      enabled: true,
      forceDarkMode: false
    },
    "https://stackoverflow.com": {
      exclude: true
    },
    "https://example.com": {
      override: {
        brightness: 100,
        contrast: 90
      }
    }
  },
  excludeRegex: [
    "/^.*\\.google\\.com$/",
    "localhost"
  ],
  schedule: {
    enabled: true,
    start: "20:00",
    end: "08:00"
  }
}
```

**What it affects:**
- **enabled**: Controls whether dark theme is applied globally
- **mode**: Determines theme algorithm:
  - `architect`: CSS-based declarative approach (fast, efficient)
  - `surgeon`: DOM traversal approach (more compatible, slower)
- **amoled**: Changes background from `#1a1a1a` to pure `#000000`
- **brightness**: Adjusts overall page brightness
- **contrast**: Adjusts color contrast
- **sepia/grayscale/blueShift**: Apply color filters
- **optimizerEnabled**: Activates web worker for dynamic contrast optimization
- **detectDarkSites**: Prevents applying theme to sites already using dark mode
- **perSite**: Site-specific overrides by origin (protocol + hostname)
- **excludeRegex**: URL patterns to exclude from theming
- **schedule**: Automatically enable/disable theme based on time of day

---

## browser.storage.local

### Key: `isDebugMode`

**Type:** `boolean`

**Purpose:** Controls whether detailed debug logging is output to the browser console. This setting is local-only and does not sync across devices.

**Default Value:** `false`

**Example Value:** `true`

**What it affects:**
- When `true`: All debug logs are output to console with `[UltraDark]` prefix
- When `false`: Only info, warn, and error logs are shown (no debug logs)
- Debug logs include:
  - Content script initialization and settings updates
  - CSS/DOM modification details (before/after values)
  - Color inversion calculations (surgeon mode)
  - Site classification logic (dark site detection)
  - Background script events (context menu, alarms, messages)
  - Optimizer worker messages

**Usage:**
- Set via the "Enable debug logging" toggle in Options page
- Changes are immediately broadcast to all tabs and background script
- Useful for diagnosing theme application issues and performance problems

---

## Storage Access Patterns

### Reading Settings
```typescript
import { getSettings } from "../utils/storage";
const settings = await getSettings(); // Returns merged Settings with defaults
```

### Writing Settings
```typescript
import { setSettings } from "../utils/storage";
await setSettings(updatedSettings); // Replaces entire settings object
```

### Partial Updates
```typescript
import { updateSettings } from "../utils/storage";
await updateSettings({ brightness: 95 }); // Updates only specified fields
```

### Debug Mode
```typescript
// Read
const result = await browser.storage.local.get('isDebugMode');
const isDebug = result.isDebugMode === true;

// Write
await browser.storage.local.set({ isDebugMode: true });
```

---

## Per-Site Override Priority

Settings are resolved in this priority order (highest to lowest):

1. **Per-site override values** (`perSite[origin].override.*`)
2. **Per-site enabled/exclude flags** (`perSite[origin].enabled/exclude`)
3. **Global regex exclusions** (`excludeRegex`)
4. **Dark site detection** (`detectDarkSites`, unless `forceDarkMode` is set)
5. **Global settings** (top-level settings values)

---

## Migration Notes

- Settings are merged with defaults on every read, so adding new fields doesn't break existing installations
- The `perSite` object uses origin (protocol + hostname) as keys, not full URLs
- Regex patterns in `excludeRegex` support both plain strings and `/regex/flags` format
- Schedule uses 24-hour format strings ("HH:MM")

---

## Storage Quotas

- `browser.storage.sync`: 100KB total, 8KB per item (more than sufficient for typical usage)
- `browser.storage.local`: 10MB+ (varies by browser)

UltraDark Reader's typical storage usage: ~2-5 KB for settings, <1 KB for debug mode.
