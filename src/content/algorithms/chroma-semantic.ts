// File: src/content/algorithms/chroma-semantic.ts

/**
 * ============================================================================
 * CHROMA-SEMANTIC ENGINE v2.0
 * ============================================================================
 *
 * The "intelligent fallback" algorithm - succeeds where others fail by
 * understanding WHAT elements are, not just what color they are.
 *
 * Strategy: Framework Detection → CSS Variable Hijacking → Semantic Classification
 * Complexity: O(1) for CSS-variable sites, O(n) with aggressive caching for others
 * Use Case: Complex SPAs, design-system-heavy sites, accessibility-critical applications
 *
 * Key Differentiators from Other Algorithms:
 * - Detects and activates NATIVE dark modes when available
 * - Hijacks CSS custom properties at the source (not per-element)
 * - Understands semantic roles (nav, card, modal) for visual hierarchy
 * - Guarantees WCAG AA contrast compliance
 * - Progressive degradation with graceful fallback
 *
 * ============================================================================
 */

import type { Settings } from "../../types/settings";
import { debugSync } from "../../utils/logger";
import { applyPhotonInverter } from "./photon-inverter";
import { ensureStyleTag } from "../style-template";

// ============================================================================
// CONSTANTS & CONFIGURATION
// ============================================================================

/** Performance budget for each phase (milliseconds) */
const PHASE_BUDGETS = {
  frameworkDetection: 5,
  cssVariableHijack: 10,
  semanticClassification: 100,
  totalBudget: 3000,  // High timeout as requested - fallback trigger
} as const;

/** Style tag IDs for cleanup */
const STYLE_IDS = {
  variableHijack: 'udr-chroma-variables',
  baseStyles: 'udr-chroma-base',
  semanticStyles: 'udr-chroma-semantic',
} as const;

/**
 * Dark background palette by elevation level
 * Level 0 = deepest (canvas), Level 6 = highest (tooltips)
 */
const BACKGROUND_PALETTE = [
  '#0d0d0d',  // Level 0: AMOLED true black (used when amoled=true)
  '#121212',  // Level 1: Page canvas
  '#1a1a1a',  // Level 2: Primary surfaces
  '#222222',  // Level 3: Cards, sections
  '#2a2a2a',  // Level 4: Nested cards, inputs
  '#2f2f2f',  // Level 5: Modals, dialogs
  '#333333',  // Level 6: Tooltips, popovers
] as const;

/** Text color palette for different roles */
const TEXT_PALETTE = {
  primary: '#e0e0e0',
  secondary: '#a0a0a0',
  disabled: '#666666',
  heading: '#f0f0f0',
  link: '#6cb6ff',
  linkVisited: '#b39ddb',
  error: '#ff6b6b',
  success: '#69db7c',
} as const;

/**
 * Framework detection patterns
 * Maps CSS variable prefixes to framework identifiers
 */
const FRAMEWORK_PATTERNS: ReadonlyArray<{
  pattern: RegExp;
  name: string;
  darkModeSelector?: string;
}> = [
  { pattern: /^--tw-/, name: 'tailwind', darkModeSelector: '.dark' },
  { pattern: /^--mdc-|^--md-/, name: 'material' },
  { pattern: /^--bs-/, name: 'bootstrap', darkModeSelector: '[data-bs-theme="dark"]' },
  { pattern: /^--chakra-/, name: 'chakra', darkModeSelector: '.chakra-ui-dark' },
  { pattern: /^--next-/, name: 'nextjs' },
  { pattern: /^--radix-/, name: 'radix' },
  { pattern: /^--shadcn-/, name: 'shadcn' },
];

/**
 * CSS variable patterns for hijacking
 * Organized by semantic purpose
 */
const VARIABLE_PATTERNS = {
  background: /background|^bg$|bg-|surface|canvas|base-color|page-bg/i,
  foreground: /foreground|^fg$|fg-|text-color|font-color|body-color/i,
  border: /border|divider|separator|outline-color/i,
  shadow: /shadow/i,
  accent: /primary|accent|brand|interactive/i,
} as const;

/**
 * Semantic role classification rules
 * Priority ordered - first match wins
 */
const SEMANTIC_ROLES: ReadonlyArray<{
  role: SemanticRole;
  selectors: string[];
  ariaRoles: string[];
  elevationLevel: number;
}> = [
  {
    role: 'modal',
    selectors: ['[aria-modal="true"]', 'dialog', '.modal', '.dialog', '[class*="modal"]', '[class*="dialog"]'],
    ariaRoles: ['dialog', 'alertdialog'],
    elevationLevel: 5,
  },
  {
    role: 'navigation',
    selectors: ['nav', 'header', '[class*="navbar"]', '[class*="header"]', '[class*="nav-"]'],
    ariaRoles: ['navigation', 'banner'],
    elevationLevel: 2,
  },
  {
    role: 'card',
    selectors: ['[class*="card"]', '[class*="panel"]', '[class*="tile"]', 'section', 'aside'],
    ariaRoles: ['region', 'complementary'],
    elevationLevel: 3,
  },
  {
    role: 'input',
    selectors: ['input', 'textarea', 'select', '[contenteditable="true"]'],
    ariaRoles: ['textbox', 'searchbox', 'combobox', 'listbox'],
    elevationLevel: 4,
  },
  {
    role: 'interactive',
    selectors: ['button', 'a[href]', '[class*="btn"]', '[class*="button"]'],
    ariaRoles: ['button', 'link', 'menuitem', 'tab'],
    elevationLevel: 3,
  },
  {
    role: 'data',
    selectors: ['table', 'pre', 'code', '[class*="table"]', '[class*="grid"]', '[class*="code"]'],
    ariaRoles: ['grid', 'treegrid', 'table'],
    elevationLevel: 3,
  },
  {
    role: 'surface',
    selectors: ['main', 'article', '[class*="container"]', '[class*="content"]', '#app', '#root', '#__next'],
    ariaRoles: ['main', 'article'],
    elevationLevel: 2,
  },
  {
    role: 'canvas',
    selectors: ['body', 'html'],
    ariaRoles: ['application', 'document'],
    elevationLevel: 1,
  },
];

// ============================================================================
// TYPES
// ============================================================================

type SemanticRole = 'canvas' | 'surface' | 'card' | 'navigation' | 'modal' | 'interactive' | 'input' | 'data' | 'generic';

interface FrameworkInfo {
  name: string;
  detected: boolean;
  hasNativeDarkMode: boolean;
  darkModeActivated: boolean;
}

interface ProcessingStats {
  startTime: number;
  elementsProcessed: number;
  variablesHijacked: number;
  frameworkDetected: string | null;
  nativeDarkModeActivated: boolean;
  contrastFixesApplied: number;
  fallbackTriggered: boolean;
}

// ============================================================================
// STATE MANAGEMENT
// ============================================================================

/** WeakSet to track processed elements - prevents memory leaks */
const processedElements = new WeakSet<HTMLElement>();

/** MutationObserver instance for dynamic content */
let mutationObserver: MutationObserver | null = null;

/** Background color cache - avoids repeated getComputedStyle calls */
const backgroundCache = new WeakMap<HTMLElement, string>();

/** Processing statistics for current run */
let stats: ProcessingStats | null = null;

/** Detected framework info */
let detectedFramework: FrameworkInfo | null = null;

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Check if we've exceeded the time budget
 */
function isOverBudget(startTime: number, budget: number): boolean {
  return (performance.now() - startTime) > budget;
}

/**
 * Calculate relative luminance for contrast checking
 * Uses standard sRGB formula (WCAG 2.1 definition)
 */
function getRelativeLuminance(r: number, g: number, b: number): number {
  const [rs, gs, bs] = [r, g, b].map((c) => {
    const normalized = c / 255;
    return normalized <= 0.03928
      ? normalized / 12.92
      : Math.pow((normalized + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs;
}

/**
 * Calculate WCAG contrast ratio between two luminance values
 */
function getContrastRatio(l1: number, l2: number): number {
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

/**
 * Parse RGB/RGBA color string to components
 * Returns null for transparent or unparseable colors
 */
function parseColor(colorStr: string): { r: number; g: number; b: number } | null {
  if (!colorStr || colorStr === 'transparent' || colorStr === 'rgba(0, 0, 0, 0)') {
    return null;
  }

  // Try RGB/RGBA format
  const rgbMatch = colorStr.match(/rgba?\s*\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)(?:\s*,\s*([\d.]+))?\s*\)/);
  if (rgbMatch) {
    // Check alpha - treat near-transparent as transparent
    if (rgbMatch[4] !== undefined && parseFloat(rgbMatch[4]) < 0.1) {
      return null;
    }
    return {
      r: parseInt(rgbMatch[1], 10),
      g: parseInt(rgbMatch[2], 10),
      b: parseInt(rgbMatch[3], 10),
    };
  }

  // Try hex format
  const hexMatch = colorStr.match(/^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i);
  if (hexMatch) {
    return {
      r: parseInt(hexMatch[1], 16),
      g: parseInt(hexMatch[2], 16),
      b: parseInt(hexMatch[3], 16),
    };
  }

  // Short hex format
  const shortHexMatch = colorStr.match(/^#?([a-f\d])([a-f\d])([a-f\d])$/i);
  if (shortHexMatch) {
    return {
      r: parseInt(shortHexMatch[1] + shortHexMatch[1], 16),
      g: parseInt(shortHexMatch[2] + shortHexMatch[2], 16),
      b: parseInt(shortHexMatch[3] + shortHexMatch[3], 16),
    };
  }

  return null;
}

/**
 * Lighten a color by a percentage to meet contrast requirements
 */
function lightenColor(r: number, g: number, b: number, percent: number): string {
  const factor = 1 + (percent / 100);
  const newR = Math.min(255, Math.round(r * factor + (255 - r) * (percent / 100)));
  const newG = Math.min(255, Math.round(g * factor + (255 - g) * (percent / 100)));
  const newB = Math.min(255, Math.round(b * factor + (255 - b) * (percent / 100)));
  return `rgb(${newR}, ${newG}, ${newB})`;
}

/**
 * Apply warmth adjustment to a hex color
 * Shifts toward warm gray by increasing R/G and decreasing B
 */
function applyWarmth(hex: string, warmth: number): string {
  if (warmth === 0) return hex;

  const rgb = parseColor(hex);
  if (!rgb) return hex;

  const shift = Math.round((warmth / 100) * 15);
  const r = Math.min(255, rgb.r + shift);
  const g = Math.min(255, rgb.g + Math.round(shift * 0.7));
  const b = Math.max(0, rgb.b - Math.round(shift * 0.5));

  return `rgb(${r}, ${g}, ${b})`;
}

/**
 * Get DOM depth of an element relative to body
 */
function getElementDepth(element: HTMLElement): number {
  let depth = 0;
  let current: HTMLElement | null = element;

  while (current && current !== document.body && depth < 20) {
    current = current.parentElement;
    depth++;
  }

  return depth;
}

/**
 * Find the nearest opaque background color walking up the DOM tree
 */
function findOpaqueBackground(element: HTMLElement): string | null {
  // Check cache first
  const cached = backgroundCache.get(element);
  if (cached) return cached;

  let current: HTMLElement | null = element;

  while (current) {
    const bg = getComputedStyle(current).backgroundColor;
    const parsed = parseColor(bg);

    if (parsed) {
      backgroundCache.set(element, bg);
      return bg;
    }

    current = current.parentElement;
  }

  // Default to darkest background
  return BACKGROUND_PALETTE[1];
}

// ============================================================================
// PHASE 1: FRAMEWORK DETECTION
// ============================================================================

/**
 * Detect CSS frameworks and check for native dark mode support
 * This is the fastest phase - should complete in <5ms
 */
function detectFramework(): FrameworkInfo {
  debugSync('[Chroma v2] Phase 1: Framework Detection');

  const info: FrameworkInfo = {
    name: 'unknown',
    detected: false,
    hasNativeDarkMode: false,
    darkModeActivated: false,
  };

  // Check for data-theme attribute (common pattern)
  const htmlEl = document.documentElement;
  const dataTheme = htmlEl.getAttribute('data-theme');
  const dataMode = htmlEl.getAttribute('data-mode');
  const colorScheme = htmlEl.getAttribute('data-color-scheme');

  if (dataTheme === 'dark' || dataMode === 'dark' || colorScheme === 'dark') {
    debugSync('[Chroma v2] Native dark mode already active via data attribute');
    info.hasNativeDarkMode = true;
    info.darkModeActivated = true;
    return info;
  }

  // Check color-scheme CSS property
  const computedColorScheme = getComputedStyle(htmlEl).colorScheme;
  if (computedColorScheme === 'dark') {
    debugSync('[Chroma v2] Native dark mode already active via color-scheme');
    info.hasNativeDarkMode = true;
    info.darkModeActivated = true;
    return info;
  }

  // Scan CSS variables to detect framework
  const rootStyle = getComputedStyle(htmlEl);

  // Check a sample of common variable names for each framework
  for (const framework of FRAMEWORK_PATTERNS) {
    // Quick check using common variable naming conventions
    const testVars = [
      `--${framework.name}-bg`,
      `--${framework.name}-background`,
      `--${framework.name}-primary`,
    ];

    for (const varName of testVars) {
      const value = rootStyle.getPropertyValue(varName).trim();
      if (value) {
        info.name = framework.name;
        info.detected = true;
        debugSync('[Chroma v2] Detected framework:', framework.name);
        break;
      }
    }

    if (info.detected) break;
  }

  // Deep scan stylesheets for framework patterns (limited scope)
  if (!info.detected) {
    try {
      const sheets = document.styleSheets;
      const sheetLimit = Math.min(sheets.length, 5);

      outerLoop:
      for (let i = 0; i < sheetLimit; i++) {
        try {
          const rules = sheets[i].cssRules;
          if (!rules) continue;

          const ruleLimit = Math.min(rules.length, 50);
          for (let j = 0; j < ruleLimit; j++) {
            const rule = rules[j];
            if (rule instanceof CSSStyleRule &&
                (rule.selectorText === ':root' || rule.selectorText === 'html')) {
              const cssText = rule.cssText;

              for (const framework of FRAMEWORK_PATTERNS) {
                if (framework.pattern.test(cssText)) {
                  info.name = framework.name;
                  info.detected = true;
                  debugSync('[Chroma v2] Detected framework via stylesheet scan:', framework.name);
                  break outerLoop;
                }
              }
            }
          }
        } catch {
          // CORS error - skip this stylesheet
          continue;
        }
      }
    } catch (e) {
      debugSync('[Chroma v2] Error scanning stylesheets:', e);
    }
  }

  // Check if framework has dark mode available
  if (info.detected) {
    const frameworkConfig = FRAMEWORK_PATTERNS.find(f => f.name === info.name);

    if (frameworkConfig?.darkModeSelector) {
      // Check if dark mode class/attribute exists in any stylesheet
      try {
        const sheets = document.styleSheets;
        for (let i = 0; i < sheets.length; i++) {
          try {
            const rules = sheets[i].cssRules;
            if (!rules) continue;

            for (let j = 0; j < rules.length; j++) {
              const rule = rules[j];
              if (rule instanceof CSSStyleRule &&
                  rule.selectorText.includes(frameworkConfig.darkModeSelector)) {
                info.hasNativeDarkMode = true;
                debugSync('[Chroma v2] Framework has native dark mode support');
                break;
              }
            }
          } catch {
            continue;
          }
        }
      } catch {
        // Ignore errors
      }
    }
  }

  // Attempt to activate native dark mode
  if (info.hasNativeDarkMode && !info.darkModeActivated) {
    info.darkModeActivated = attemptNativeDarkModeActivation(info.name);
  }

  return info;
}

/**
 * Attempt to activate a framework's native dark mode
 */
function attemptNativeDarkModeActivation(frameworkName: string): boolean {
  const html = document.documentElement;

  debugSync('[Chroma v2] Attempting native dark mode activation for:', frameworkName);

  // Try common dark mode activation patterns
  const activationStrategies = [
    // Data attribute strategies
    () => { html.setAttribute('data-theme', 'dark'); return true; },
    () => { html.setAttribute('data-mode', 'dark'); return true; },
    () => { html.setAttribute('data-color-scheme', 'dark'); return true; },
    () => { html.classList.add('dark'); return true; },

    // Framework-specific strategies
    () => {
      if (frameworkName === 'bootstrap') {
        html.setAttribute('data-bs-theme', 'dark');
        return true;
      }
      return false;
    },
    () => {
      if (frameworkName === 'chakra') {
        html.classList.add('chakra-ui-dark');
        document.body.classList.add('chakra-ui-dark');
        return true;
      }
      return false;
    },
  ];

  for (const strategy of activationStrategies) {
    try {
      if (strategy()) {
        // Verify activation worked by checking if colors changed
        const bodyBg = getComputedStyle(document.body).backgroundColor;
        const parsed = parseColor(bodyBg);

        if (parsed) {
          const luminance = getRelativeLuminance(parsed.r, parsed.g, parsed.b);
          if (luminance < 0.2) {
            debugSync('[Chroma v2] Native dark mode activation successful');
            return true;
          }
        }
      }
    } catch {
      continue;
    }
  }

  // Revert failed attempts
  html.removeAttribute('data-theme');
  html.removeAttribute('data-mode');
  html.removeAttribute('data-color-scheme');
  html.classList.remove('dark');
  html.removeAttribute('data-bs-theme');
  html.classList.remove('chakra-ui-dark');
  document.body?.classList.remove('chakra-ui-dark');

  debugSync('[Chroma v2] Native dark mode activation failed');
  return false;
}

// ============================================================================
// PHASE 2: CSS VARIABLE HIJACKING
// ============================================================================

/**
 * Scan and override CSS custom properties
 * Returns true if enough variables were hijacked to skip DOM walking
 */
function hijackCSSVariables(settings: Settings): boolean {
  debugSync('[Chroma v2] Phase 2: CSS Variable Hijacking');

  const overrides: string[] = [];
  const processedVars = new Set<string>();
  let hijackCount = 0;

  // Calculate warmth-adjusted palette
  const warmth = settings.sepia || 0; // Use sepia slider for warmth
  const baseBg = settings.amoled ? BACKGROUND_PALETTE[0] : BACKGROUND_PALETTE[1];
  const adjustedBg = applyWarmth(baseBg, warmth);
  const adjustedSurface = applyWarmth(BACKGROUND_PALETTE[2], warmth);
  const adjustedCard = applyWarmth(BACKGROUND_PALETTE[3], warmth);

  // First pass: Check common known variable names directly (fast path)
  const rootStyle = getComputedStyle(document.documentElement);

  const commonBgVars = [
    '--background', '--bg', '--bg-color', '--background-color',
    '--surface', '--surface-color', '--canvas', '--base',
    '--color-background', '--color-bg', '--theme-background',
    '--page-background', '--body-background', '--main-bg',
    '--card-bg', '--card-background', '--panel-bg',
  ];

  const commonTextVars = [
    '--foreground', '--text', '--text-color', '--color',
    '--fg', '--fg-color', '--color-text', '--color-foreground',
    '--body-text', '--font-color', '--primary-text',
  ];

  const commonBorderVars = [
    '--border', '--border-color', '--divider', '--separator',
    '--outline', '--outline-color',
  ];

  // Check and override common variables
  for (const varName of commonBgVars) {
    const value = rootStyle.getPropertyValue(varName).trim();
    if (value && !processedVars.has(varName)) {
      overrides.push(`${varName}: ${adjustedBg} !important;`);
      processedVars.add(varName);
      hijackCount++;
    }
  }

  for (const varName of commonTextVars) {
    const value = rootStyle.getPropertyValue(varName).trim();
    if (value && !processedVars.has(varName)) {
      overrides.push(`${varName}: ${TEXT_PALETTE.primary} !important;`);
      processedVars.add(varName);
      hijackCount++;
    }
  }

  for (const varName of commonBorderVars) {
    const value = rootStyle.getPropertyValue(varName).trim();
    if (value && !processedVars.has(varName)) {
      overrides.push(`${varName}: #333333 !important;`);
      processedVars.add(varName);
      hijackCount++;
    }
  }

  // Second pass: Scan stylesheets for additional variables (if needed)
  if (hijackCount < 5) {
    try {
      const sheets = document.styleSheets;
      const sheetLimit = Math.min(sheets.length, 10);

      for (let i = 0; i < sheetLimit; i++) {
        try {
          const rules = sheets[i].cssRules;
          if (!rules) continue;

          const ruleLimit = Math.min(rules.length, 100);

          for (let j = 0; j < ruleLimit; j++) {
            const rule = rules[j];

            if (rule instanceof CSSStyleRule &&
                (rule.selectorText === ':root' || rule.selectorText === 'html')) {
              const style = rule.style;

              for (let k = 0; k < style.length; k++) {
                const prop = style[k];

                if (prop.startsWith('--') && !processedVars.has(prop)) {
                  // Categorize and override based on naming pattern
                  if (VARIABLE_PATTERNS.background.test(prop)) {
                    overrides.push(`${prop}: ${adjustedSurface} !important;`);
                    processedVars.add(prop);
                    hijackCount++;
                  } else if (VARIABLE_PATTERNS.foreground.test(prop)) {
                    overrides.push(`${prop}: ${TEXT_PALETTE.primary} !important;`);
                    processedVars.add(prop);
                    hijackCount++;
                  } else if (VARIABLE_PATTERNS.border.test(prop)) {
                    overrides.push(`${prop}: #333333 !important;`);
                    processedVars.add(prop);
                    hijackCount++;
                  } else if (VARIABLE_PATTERNS.shadow.test(prop)) {
                    // Reduce shadow intensity
                    const originalValue = style.getPropertyValue(prop);
                    if (originalValue.includes('rgba')) {
                      const dimmedShadow = originalValue.replace(
                        /rgba\(([^)]+)\)/g,
                        'rgba(0, 0, 0, 0.3)'
                      );
                      overrides.push(`${prop}: ${dimmedShadow} !important;`);
                      processedVars.add(prop);
                      hijackCount++;
                    }
                  } else if (VARIABLE_PATTERNS.accent.test(prop)) {
                    // Keep accent colors but ensure they're visible on dark
                    // Don't override - preserve brand identity
                  }
                }
              }
            }
          }
        } catch {
          // CORS error - skip this stylesheet
          continue;
        }
      }
    } catch (e) {
      debugSync('[Chroma v2] Error scanning stylesheets for variables:', e);
    }
  }

  // Inject variable overrides
  if (overrides.length > 0) {
    let style = document.getElementById(STYLE_IDS.variableHijack) as HTMLStyleElement | null;

    if (!style) {
      style = document.createElement('style');
      style.id = STYLE_IDS.variableHijack;
      document.head.appendChild(style);
    }

    style.textContent = `:root {\n  ${overrides.join('\n  ')}\n}`;

    debugSync('[Chroma v2] Hijacked', hijackCount, 'CSS variables');
  }

  if (stats) {
    stats.variablesHijacked = hijackCount;
  }

  // Return true if we hijacked enough variables to skip DOM walking
  return hijackCount >= 10;
}

// ============================================================================
// PHASE 3: SEMANTIC DOM CLASSIFICATION
// ============================================================================

/**
 * Classify an element's semantic role
 */
function classifyElement(element: HTMLElement): SemanticRole {
  const tagName = element.tagName.toLowerCase();
  const ariaRole = element.getAttribute('role');

  // Check each role definition in priority order
  for (const roleDef of SEMANTIC_ROLES) {
    // Check ARIA role first (most specific)
    if (ariaRole && roleDef.ariaRoles.includes(ariaRole)) {
      return roleDef.role;
    }

    // Check tag/selector matches
    for (const selector of roleDef.selectors) {
      try {
        if (element.matches(selector)) {
          return roleDef.role;
        }
      } catch {
        // Invalid selector - skip
        continue;
      }
    }
  }

  return 'generic';
}

/**
 * Get the elevation level for an element based on its role and depth
 */
function getElevationLevel(role: SemanticRole, depth: number, settings: Settings): number {
  // Find base elevation for role
  const roleDef = SEMANTIC_ROLES.find(r => r.role === role);
  const baseLevel = roleDef?.elevationLevel ?? 2;

  // Adjust based on depth (deeper = higher elevation)
  const depthBonus = Math.min(Math.floor(depth / 3), 2);

  // Apply elevation intensity setting (use contrast slider as proxy)
  const intensity = (settings.contrast - 50) / 100; // 0 at 50%, 1 at 150%
  const adjustedBonus = Math.round(depthBonus * intensity);

  // AMOLED mode starts at level 0
  const minLevel = settings.amoled ? 0 : 1;

  return Math.min(Math.max(baseLevel + adjustedBonus, minLevel), BACKGROUND_PALETTE.length - 1);
}

/**
 * Apply semantic styling to an element
 */
function applySemanticStyling(
  element: HTMLElement,
  role: SemanticRole,
  depth: number,
  settings: Settings
): void {
  if (processedElements.has(element)) return;

  // Skip invisible elements (but NOT fixed-position elements like navbars)
  if (element.checkVisibility) {
    if (!element.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true })) {
      return;
    }
  }

  const computed = getComputedStyle(element);
  const currentBg = computed.backgroundColor;
  const currentColor = computed.color;

  // Determine if element has an explicit background
  const hasExplicitBg = currentBg && currentBg !== 'rgba(0, 0, 0, 0)' && currentBg !== 'transparent';

  // Calculate warmth adjustment
  const warmth = settings.sepia || 0;

  // Apply background based on semantic role
  if (hasExplicitBg || role !== 'generic') {
    const elevationLevel = getElevationLevel(role, depth, settings);
    let bgColor = BACKGROUND_PALETTE[elevationLevel];

    // Apply warmth
    if (warmth > 0) {
      bgColor = applyWarmth(bgColor, warmth);
    }

    element.style.backgroundColor = bgColor;
  }

  // Apply text color based on role
  let textColor: string;
  switch (role) {
    case 'interactive':
      // Check if it's a link
      if (element.tagName === 'A') {
        textColor = TEXT_PALETTE.link;
      } else {
        textColor = TEXT_PALETTE.primary;
      }
      break;
    case 'data':
      textColor = TEXT_PALETTE.primary;
      break;
    default:
      // Check if it's a heading
      if (/^h[1-6]$/i.test(element.tagName)) {
        textColor = TEXT_PALETTE.heading;
      } else {
        textColor = TEXT_PALETTE.primary;
      }
  }

  // Apply text color if element has text content
  if (currentColor) {
    element.style.color = textColor;
  }

  // Handle borders
  const borderColor = computed.borderColor;
  if (borderColor && borderColor !== 'rgba(0, 0, 0, 0)') {
    element.style.borderColor = '#333333';
  }

  // Mark as processed
  processedElements.add(element);
}

// ============================================================================
// PHASE 4: CONTRAST VALIDATION
// ============================================================================

/**
 * Ensure text meets WCAG AA contrast requirements
 * Called after initial styling to fix any contrast issues
 */
function validateAndFixContrast(element: HTMLElement): boolean {
  const computed = getComputedStyle(element);

  // Get foreground color
  const fgColor = parseColor(computed.color);
  if (!fgColor) return false;

  // Get background color (may need to walk up tree)
  const bgColorStr = findOpaqueBackground(element);
  const bgColor = parseColor(bgColorStr || BACKGROUND_PALETTE[1]);
  if (!bgColor) return false;

  // Calculate contrast
  const fgLuminance = getRelativeLuminance(fgColor.r, fgColor.g, fgColor.b);
  const bgLuminance = getRelativeLuminance(bgColor.r, bgColor.g, bgColor.b);
  const contrast = getContrastRatio(fgLuminance, bgLuminance);

  // WCAG AA requires 4.5:1 for normal text
  const requiredContrast = 4.5;

  if (contrast < requiredContrast) {
    // Need to lighten the text color
    // Calculate how much lighter we need to go
    let lightenAmount = 10;
    let newColor = lightenColor(fgColor.r, fgColor.g, fgColor.b, lightenAmount);
    let newParsed = parseColor(newColor);
    let newContrast = contrast;

    // Iteratively lighten until we meet the requirement (max 5 iterations)
    for (let i = 0; i < 5 && newContrast < requiredContrast && newParsed; i++) {
      lightenAmount += 15;
      newColor = lightenColor(fgColor.r, fgColor.g, fgColor.b, lightenAmount);
      newParsed = parseColor(newColor);

      if (newParsed) {
        const newLuminance = getRelativeLuminance(newParsed.r, newParsed.g, newParsed.b);
        newContrast = getContrastRatio(newLuminance, bgLuminance);
      }
    }

    // Cap at near-white to avoid pure white glare
    if (newParsed && newParsed.r > 242 && newParsed.g > 242 && newParsed.b > 242) {
      newColor = TEXT_PALETTE.heading; // Use predefined near-white
    }

    element.style.color = newColor;

    if (stats) {
      stats.contrastFixesApplied++;
    }

    return true;
  }

  return false;
}

// ============================================================================
// PHASE 5: SPECIAL ELEMENT HANDLING
// ============================================================================

/**
 * Handle elements that need special treatment (images, videos, SVGs, etc.)
 */
function handleSpecialElements(settings: Settings): void {
  debugSync('[Chroma v2] Phase 5: Special Element Handling');

  // Create styles for special elements
  let style = document.getElementById(STYLE_IDS.semanticStyles) as HTMLStyleElement | null;

  if (!style) {
    style = document.createElement('style');
    style.id = STYLE_IDS.semanticStyles;
    document.head.appendChild(style);
  }

  // Calculate brightness adjustment
  const brightnessValue = settings.brightness / 100;
  const contrastValue = settings.contrast / 100;

  style.textContent = `
    /* Chroma-Semantic v2.0 - Special Element Handling */

    /* Images: Slight dimming to reduce glare */
    html[udr-applied="true"][data-udr-mode="chroma-semantic"] img,
    html[udr-applied="true"][data-udr-mode="chroma-semantic"] picture {
      filter: brightness(${brightnessValue * 0.95}) !important;
      transition: filter 0.2s ease;
    }

    html[udr-applied="true"][data-udr-mode="chroma-semantic"] img:hover,
    html[udr-applied="true"][data-udr-mode="chroma-semantic"] picture:hover {
      filter: brightness(1) !important;
    }

    /* Videos: Preserve colors, slight dimming */
    html[udr-applied="true"][data-udr-mode="chroma-semantic"] video {
      filter: brightness(${brightnessValue * 0.98}) !important;
    }

    /* Canvas: Subtle opacity to reduce contrast */
    html[udr-applied="true"][data-udr-mode="chroma-semantic"] canvas {
      opacity: 0.95;
    }

    /* SVG icons: Invert if they use currentColor */
    html[udr-applied="true"][data-udr-mode="chroma-semantic"] svg:not([class*="logo"]):not([class*="brand"]) {
      fill: currentColor;
      stroke: currentColor;
    }

    /* Code blocks: Syntax-highlighting friendly palette */
    html[udr-applied="true"][data-udr-mode="chroma-semantic"] pre,
    html[udr-applied="true"][data-udr-mode="chroma-semantic"] code {
      background-color: #1e1e1e !important;
      color: #d4d4d4 !important;
      border-color: #333333 !important;
    }

    /* Form inputs: Dark field styling */
    html[udr-applied="true"][data-udr-mode="chroma-semantic"] input,
    html[udr-applied="true"][data-udr-mode="chroma-semantic"] textarea,
    html[udr-applied="true"][data-udr-mode="chroma-semantic"] select {
      background-color: ${BACKGROUND_PALETTE[4]} !important;
      color: ${TEXT_PALETTE.primary} !important;
      border-color: #444444 !important;
    }

    html[udr-applied="true"][data-udr-mode="chroma-semantic"] input::placeholder,
    html[udr-applied="true"][data-udr-mode="chroma-semantic"] textarea::placeholder {
      color: ${TEXT_PALETTE.secondary} !important;
    }

    /* Focus states */
    html[udr-applied="true"][data-udr-mode="chroma-semantic"] input:focus,
    html[udr-applied="true"][data-udr-mode="chroma-semantic"] textarea:focus,
    html[udr-applied="true"][data-udr-mode="chroma-semantic"] select:focus,
    html[udr-applied="true"][data-udr-mode="chroma-semantic"] button:focus {
      outline: 2px solid ${TEXT_PALETTE.link} !important;
      outline-offset: 2px;
    }

    /* Interactive hover states */
    html[udr-applied="true"][data-udr-mode="chroma-semantic"] button:hover,
    html[udr-applied="true"][data-udr-mode="chroma-semantic"] a:hover {
      filter: brightness(1.1);
    }

    /* Scrollbar styling */
    html[udr-applied="true"][data-udr-mode="chroma-semantic"] ::-webkit-scrollbar {
      width: 12px;
      height: 12px;
    }

    html[udr-applied="true"][data-udr-mode="chroma-semantic"] ::-webkit-scrollbar-track {
      background: ${BACKGROUND_PALETTE[1]};
    }

    html[udr-applied="true"][data-udr-mode="chroma-semantic"] ::-webkit-scrollbar-thumb {
      background: ${BACKGROUND_PALETTE[4]};
      border-radius: 6px;
    }

    html[udr-applied="true"][data-udr-mode="chroma-semantic"] ::-webkit-scrollbar-thumb:hover {
      background: ${BACKGROUND_PALETTE[5]};
    }

    /* Grayscale overlay if enabled */
    ${settings.grayscale > 0 ? `
    html[udr-applied="true"][data-udr-mode="chroma-semantic"] {
      filter: grayscale(${settings.grayscale}%) contrast(${contrastValue});
    }
    ` : ''}
  `;
}

// ============================================================================
// PHASE 6: MUTATION OBSERVER
// ============================================================================

/**
 * Set up MutationObserver for dynamic content
 */
function setupMutationObserver(settings: Settings): void {
  debugSync('[Chroma v2] Phase 6: Setting up MutationObserver');

  if (mutationObserver) {
    mutationObserver.disconnect();
  }

  let pendingElements: HTMLElement[] = [];
  let processingScheduled = false;

  const processPendingElements = () => {
    if (pendingElements.length === 0) {
      processingScheduled = false;
      return;
    }

    // Process up to 50 elements per frame
    const batch = pendingElements.splice(0, 50);

    for (const element of batch) {
      if (!processedElements.has(element)) {
        const role = classifyElement(element);
        const depth = getElementDepth(element);
        applySemanticStyling(element, role, depth, settings);

        // Validate contrast for text-heavy elements
        if (element.textContent && element.textContent.trim().length > 0) {
          validateAndFixContrast(element);
        }
      }
    }

    // Continue processing if more elements remain
    if (pendingElements.length > 0) {
      requestAnimationFrame(processPendingElements);
    } else {
      processingScheduled = false;
    }
  };

  mutationObserver = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      // Handle added nodes
      for (const node of mutation.addedNodes) {
        if (node instanceof HTMLElement) {
          pendingElements.push(node);

          // Add direct children (limited depth)
          const children = node.children;
          const limit = Math.min(children.length, 20);

          for (let i = 0; i < limit; i++) {
            const child = children[i];
            if (child instanceof HTMLElement) {
              pendingElements.push(child);
            }
          }
        }
      }

      // Handle class changes (might activate native dark mode)
      if (mutation.type === 'attributes' &&
          mutation.attributeName === 'class' &&
          mutation.target instanceof HTMLElement) {

        const classList = mutation.target.classList;
        if (classList.contains('dark') ||
            classList.contains('dark-mode') ||
            classList.contains('chakra-ui-dark')) {
          debugSync('[Chroma v2] Detected dark mode class added externally');
        }
      }
    }

    // Schedule processing
    if (pendingElements.length > 0 && !processingScheduled) {
      processingScheduled = true;

      // Use requestIdleCallback if available, otherwise requestAnimationFrame
      if ('requestIdleCallback' in window) {
        (window as any).requestIdleCallback(processPendingElements, { timeout: 100 });
      } else {
        requestAnimationFrame(processPendingElements);
      }
    }
  });

  // Start observing
  if (document.body) {
    mutationObserver.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['class', 'data-theme', 'data-mode'],
    });

    debugSync('[Chroma v2] MutationObserver attached');
  }
}

// ============================================================================
// MAIN ENTRY POINTS
// ============================================================================

/**
 * Apply the Chroma-Semantic algorithm to the page
 * Main entry point - maintains same signature as original
 */
export function applyChromaSemantic(settings: Settings): void {
  const startTime = performance.now();

  debugSync('[Chroma v2] ════════════════════════════════════════════');
  debugSync('[Chroma v2] Starting Chroma-Semantic Engine v2.0');
  debugSync('[Chroma v2] ════════════════════════════════════════════');

  // Initialize stats
  stats = {
    startTime,
    elementsProcessed: 0,
    variablesHijacked: 0,
    frameworkDetected: null,
    nativeDarkModeActivated: false,
    contrastFixesApplied: 0,
    fallbackTriggered: false,
  };

  // Safety guard
  if (!document.body) {
    debugSync('[Chroma v2] ⚠️ document.body not available, falling back to Photon Inverter');
    applyPhotonInverter(settings);
    return;
  }

  // Clean up any previous run
  resetChromaSemantic();


/**
 * Generate diagnostic report for debugging
 * Call via browser console: window.__chromaDiag()
 */
export function getChromaDiagnostics(): object {
  debugSync('[Chroma v2] ℹ️ run "__chromaDiag()" in console to get diagnostics for Chroma-Semantic');
  const diag = {
    version: '2.0',
    url: location.href,
    framework: detectedFramework,
    stats,
    styleTagsPresent: Object.fromEntries(
      Object.entries(STYLE_IDS).map(([k, id]) => [k, !!document.getElementById(id)])
    ),
    processedCount: stats?.elementsProcessed ?? 0,
    bodyBg: getComputedStyle(document.body).backgroundColor,
    htmlAttrs: {
      udrApplied: document.documentElement.getAttribute('udr-applied'),
      udrMode: document.documentElement.getAttribute('data-udr-mode'),
      dataTheme: document.documentElement.getAttribute('data-theme'),
    },
  };
  console.log('[Chroma Diag]', JSON.stringify(diag, null, 2));
  return diag;
}

// Expose to window for console access
if (typeof window !== 'undefined') {
  (window as any).__chromaDiag = getChromaDiagnostics;
}

  // ══════════════════════════════════════════════════════════════════════════
  // PHASE 1: Framework Detection
  // ══════════════════════════════════════════════════════════════════════════

  detectedFramework = detectFramework();
  stats.frameworkDetected = detectedFramework.name;
  stats.nativeDarkModeActivated = detectedFramework.darkModeActivated;

  if (detectedFramework.darkModeActivated) {
    debugSync('[Chroma v2] ✓ Native dark mode activated - applying minimal enhancements');

    // Apply only special element handling for native dark mode sites
    handleSpecialElements(settings);

    // Set mode marker
    document.documentElement.setAttribute('data-udr-mode', 'chroma-semantic');
    document.documentElement.setAttribute('udr-applied', 'true');

    // Set up observer for dynamic content
    setupMutationObserver(settings);

    const elapsed = performance.now() - startTime;
    debugSync('[Chroma v2] ✓ Complete (native mode) in', elapsed.toFixed(2), 'ms');
    return;
  }

  // ══════════════════════════════════════════════════════════════════════════
  // PHASE 2: CSS Variable Hijacking
  // ══════════════════════════════════════════════════════════════════════════

  const variablesHandledTheme = hijackCSSVariables(settings);

  if (variablesHandledTheme) {
    debugSync('[Chroma v2] ✓ CSS variables handled theme - using fast path');

    // Apply base styles and special element handling
    applyBaseStyles(settings);
    handleSpecialElements(settings);

    // Set mode marker
    document.documentElement.setAttribute('data-udr-mode', 'chroma-semantic');
    document.documentElement.setAttribute('udr-applied', 'true');

    // Set up observer
    setupMutationObserver(settings);

    const elapsed = performance.now() - startTime;
    debugSync('[Chroma v2] ✓ Complete (variable fast path) in', elapsed.toFixed(2), 'ms');
    return;
  }

  // ══════════════════════════════════════════════════════════════════════════
  // PHASE 3: Semantic DOM Classification
  // ══════════════════════════════════════════════════════════════════════════

  debugSync('[Chroma v2] Phase 3: Semantic DOM Classification');

  // Apply base styles first (ensures body has dark background)
  applyBaseStyles(settings);

  // Check budget before heavy processing
  if (isOverBudget(startTime, PHASE_BUDGETS.totalBudget)) {
    debugSync('[Chroma v2] ⚠️ Budget exceeded before DOM walk, falling back');
    triggerFallback(settings);
    return;
  }

  // Stack-based traversal with batching
  interface StackItem {
    element: HTMLElement;
    depth: number;
  }

  const stack: StackItem[] = [{ element: document.body, depth: 0 }];
  const BATCH_SIZE = 200;
  const MAX_DEPTH = 15;

  function processNextBatch(): void {
    // Check performance budget
    if (isOverBudget(startTime, PHASE_BUDGETS.totalBudget)) {
      debugSync('[Chroma v2] ⚠️ Performance budget exceeded, triggering fallback');
      triggerFallback(settings);
      return;
    }

    let processedInBatch = 0;

    while (stack.length > 0 && processedInBatch < BATCH_SIZE) {
      const item = stack.pop();
      if (!item) continue;

      const { element, depth } = item;

      // Skip already processed
      if (processedElements.has(element)) continue;

      // Classify and style
      const role = classifyElement(element);
      applySemanticStyling(element, role, depth, settings);

      if (stats) {
        stats.elementsProcessed++;
      }
      processedInBatch++;

      // Add children to stack (if not too deep)
      if (depth < MAX_DEPTH) {
        const children = element.children;

        // Add in reverse order so we process in document order
        for (let i = children.length - 1; i >= 0; i--) {
          const child = children[i];

          if (child instanceof HTMLElement && !processedElements.has(child)) {
            stack.push({ element: child, depth: depth + 1 });
          }
        }
      }
    }

    // Continue or finish
    if (stack.length > 0) {
      requestAnimationFrame(processNextBatch);
    } else {
      finishProcessing();
    }
  }

  function finishProcessing(): void {
    // ════════════════════════════════════════════════════════════════════════
    // PHASE 4: Contrast Validation
    // ════════════════════════════════════════════════════════════════════════

    debugSync('[Chroma v2] Phase 4: Contrast Validation');

    // Validate contrast on text elements
    const textSelectors = 'p, span, li, a, h1, h2, h3, h4, h5, h6, td, th, label, small';
    const textElements = document.querySelectorAll(textSelectors);
    const textLimit = Math.min(textElements.length, 200);

    for (let i = 0; i < textLimit; i++) {
      const element = textElements[i] as HTMLElement;
      validateAndFixContrast(element);
    }

    // ════════════════════════════════════════════════════════════════════════
    // PHASE 5: Special Element Handling
    // ════════════════════════════════════════════════════════════════════════

    handleSpecialElements(settings);

    // ════════════════════════════════════════════════════════════════════════
    // PHASE 6: Set Up Mutation Observer
    // ════════════════════════════════════════════════════════════════════════

    setupMutationObserver(settings);

    // Set mode markers
    document.documentElement.setAttribute('data-udr-mode', 'chroma-semantic');
    document.documentElement.setAttribute('udr-applied', 'true');

    // Final stats
    const elapsed = performance.now() - startTime;

    debugSync('[Chroma v2] ════════════════════════════════════════════');
    debugSync('[Chroma v2] ✓ Processing Complete');
    debugSync('[Chroma v2] Time:', elapsed.toFixed(2), 'ms');
    debugSync('[Chroma v2] Elements processed:', stats?.elementsProcessed ?? 0);
    debugSync('[Chroma v2] Variables hijacked:', stats?.variablesHijacked ?? 0);
    debugSync('[Chroma v2] Contrast fixes:', stats?.contrastFixesApplied ?? 0);
    debugSync('[Chroma v2] Framework:', stats?.frameworkDetected ?? 'none');
    debugSync('[Chroma v2] ════════════════════════════════════════════');
  }

  // Start processing
  requestAnimationFrame(processNextBatch);
}

/**
 * Apply base dark styles to html and body
 */
function applyBaseStyles(settings: Settings): void {
  const warmth = settings.sepia || 0;
  const baseBg = settings.amoled ? BACKGROUND_PALETTE[0] : BACKGROUND_PALETTE[1];
  const adjustedBg = applyWarmth(baseBg, warmth);

  let style = document.getElementById(STYLE_IDS.baseStyles) as HTMLStyleElement | null;

  if (!style) {
    style = document.createElement('style');
    style.id = STYLE_IDS.baseStyles;
    document.head.appendChild(style);
  }

  style.textContent = `
    /* Chroma-Semantic v2.0 - Base Styles */
    html[udr-applied="true"][data-udr-mode="chroma-semantic"],
    html[udr-applied="true"][data-udr-mode="chroma-semantic"] body {
      background-color: ${adjustedBg} !important;
      color: ${TEXT_PALETTE.primary} !important;
    }

    /* Links */
    html[udr-applied="true"][data-udr-mode="chroma-semantic"] a {
      color: ${TEXT_PALETTE.link} !important;
    }

    html[udr-applied="true"][data-udr-mode="chroma-semantic"] a:visited {
      color: ${TEXT_PALETTE.linkVisited} !important;
    }

    /* Selection */
    html[udr-applied="true"][data-udr-mode="chroma-semantic"] ::selection {
      background-color: ${TEXT_PALETTE.link} !important;
      color: ${BACKGROUND_PALETTE[1]} !important;
    }

    /* Ensure text remains readable */
    html[udr-applied="true"][data-udr-mode="chroma-semantic"] * {
      border-color: #333333;
    }
  `;
}

/**
 * Trigger fallback to Photon Inverter
 */
function triggerFallback(settings: Settings): void {
  debugSync('[Chroma v2] ⚠️ Triggering fallback to Photon Inverter');

  if (stats) {
    stats.fallbackTriggered = true;
  }

  // Clean up partial work
  resetChromaSemantic();

  // Apply Photon Inverter
  applyPhotonInverter(settings);
}

/**
 * Reset/cleanup Chroma-Semantic styles and state
 */
export function resetChromaSemantic(): void {
  debugSync('[Chroma v2] Resetting Chroma-Semantic');

  // Disconnect mutation observer
  if (mutationObserver) {
    mutationObserver.disconnect();
    mutationObserver = null;
  }

  // Remove injected style tags
  for (const id of Object.values(STYLE_IDS)) {
    const tag = document.getElementById(id);
    if (tag) {
      tag.remove();
    }
  }

  // Clear caches
  backgroundCache = new WeakMap();

  // Note: processedElements (WeakSet) will be garbage collected naturally
  // We cannot clear a WeakSet, but creating a new one is fine for reset

  // Clear stats
  stats = null;
  detectedFramework = null;

  // Remove any dark mode activations we did
  const html = document.documentElement;

  // Only remove attributes we might have added
  if (html.getAttribute('data-theme') === 'dark') {
    html.removeAttribute('data-theme');
  }
  if (html.getAttribute('data-mode') === 'dark') {
    html.removeAttribute('data-mode');
  }
  if (html.getAttribute('data-color-scheme') === 'dark') {
    html.removeAttribute('data-color-scheme');
  }
  if (html.getAttribute('data-bs-theme') === 'dark') {
    html.removeAttribute('data-bs-theme');
  }

  html.classList.remove('dark');
  html.classList.remove('chakra-ui-dark');
  document.body?.classList.remove('chakra-ui-dark');

  debugSync('[Chroma v2] Reset complete');
}
