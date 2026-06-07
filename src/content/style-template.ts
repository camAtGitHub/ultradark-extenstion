// File: src/content/style-template.ts
import { STYLE_TAG_ID } from "../utils/defaults";

export function ensureStyleTag(): HTMLStyleElement {
  let tag = document.getElementById(STYLE_TAG_ID) as HTMLStyleElement | null;
  if (!tag) {
    tag = document.createElement("style");
    tag.id = STYLE_TAG_ID;
    document.documentElement.appendChild(tag);
  }
  return tag;
}

/**
 * OPTIMIZATION 11: CSS Containment for Style Isolation
 *
 * Generates CSS for Static/Dynamic modes + AMOLED & image fixes using CSS variables.
 * Includes performance optimizations via CSS containment and GPU compositing hints.
 */
export function buildCss(vars: {
  brightness: number; // %
  contrast: number; // %
  sepia: number; // %
  grayscale: number; // %
  hueRotateDeg: number;
  amoled: boolean;
  invert: boolean;
}) {
  const { brightness, contrast, sepia, grayscale, hueRotateDeg, amoled, invert } = vars;

  const adjustment = `brightness(${brightness}%) contrast(${contrast}%) sepia(${sepia}%) grayscale(${grayscale}%) hue-rotate(${hueRotateDeg}deg)`;
  const filter = invert ? `invert(1) hue-rotate(180deg) ${adjustment}` : adjustment;
  const mediaFilter = invert ? "invert(1) hue-rotate(180deg)" : "none";

  // Performance optimizations via CSS containment
  const containmentRules = `
/* Performance: CSS Containment */
html[udr-applied="true"] {
  contain: style;  /* Isolate style recalculations */
}

html[udr-applied="true"] main,
html[udr-applied="true"] article,
html[udr-applied="true"] section,
html[udr-applied="true"] .container,
html[udr-applied="true"] #app,
html[udr-applied="true"] #root {
  contain: layout style;  /* Contain layout and style for main content areas */
}
`;

  // Use will-change hint for filter animation (helps GPU compositing)
  const gpuHints = `
/* GPU Compositing Hints */
html[udr-applied="true"] {
  will-change: filter;
  -webkit-backface-visibility: hidden;
  backface-visibility: hidden;
}

html[udr-applied="true"] img,
html[udr-applied="true"] video,
html[udr-applied="true"] canvas {
  will-change: filter;
}
`;

  // AMOLED: force #000 backgrounds
  const amoledCss = amoled
    ? `
html[udr-applied="true"], 
html[udr-applied="true"] body,
html[udr-applied="true"] *:not(img):not(video):not(canvas):not(svg):not([data-udr-skip]) {
  background-color: #000 !important;
  background-image: none !important;
}`
    : "";

  const mediaReinvert = invert
    ? `
html[udr-applied="true"] img,
html[udr-applied="true"] video,
html[udr-applied="true"] canvas,
html[udr-applied="true"] svg,
html[udr-applied="true"] picture,
html[udr-applied="true"] iframe,
html[udr-applied="true"] [style*="background-image"],
html[udr-applied="true"] [role="img"] {
  filter: ${mediaFilter} !important; /* re-invert media */
}`
    : "";

  // For inversion mode: set white backgrounds (which become black when inverted)
  // This fixes the "white columns" issue on pages with explicit white backgrounds
  const backgroundFix = invert
    ? `
/* Set base to white (becomes black when inverted) */
html[udr-applied="true"] {
  background: #fff !important;
}

/* Fix transparent/unset backgrounds - make them white so they become dark when inverted */
html[udr-applied="true"] body,
html[udr-applied="true"] *:not(img):not(video):not(canvas):not(svg):not(picture):not(iframe):not([style*="background-image"]) {
  background-color: #fff !important;
}
`
    : "";

  return `
/* UltraDark Reader - Optimized CSS */
:root { --udr-filter: ${filter}; }

html[udr-applied="true"] {
  filter: var(--udr-filter) !important;
}

${containmentRules}
${gpuHints}
${backgroundFix}
${mediaReinvert}
${amoledCss}

/* Prevent double-inverting extension UIs and iframes */
html[udr-applied="true"] iframe,
html[udr-applied="true"] embed,
html[udr-applied="true"] object {
  background: transparent !important;
}
`;
}
