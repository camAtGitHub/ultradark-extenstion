// src/content/style-template.ts
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

/** Generates CSS for Static/Dynamic modes + AMOLED & image fixes using CSS variables. */
export function buildCss(vars: {
  brightness: number; // %
  contrast: number;   // %
  sepia: number;      // %
  grayscale: number;  // %
  hueRotateDeg: number;
  amoled: boolean;
  mode: "dynamic" | "static";
}) {
  const { brightness, contrast, sepia, grayscale, hueRotateDeg, amoled } = vars;

  const filter = `invert(1) hue-rotate(180deg) brightness(${brightness}%) contrast(${contrast}%) sepia(${sepia}%) grayscale(${grayscale}%) hue-rotate(${hueRotateDeg}deg)`;

  // AMOLED: force #000 backgrounds
  const amoledCss = amoled
    ? `
html, body, body *:not(img):not(video):not(canvas):not(svg):not([data-udr-skip]) {
  background-color: #000 !important;
  background-image: none !important;
}`
    : "";

  return `
/* UltraDark Reader injected CSS */
:root { --udr-filter: ${filter}; }
html[udr-applied="true"] {
  filter: var(--udr-filter) !important;
  background-color: #111 !important;
}
html[udr-applied="true"] img,
html[udr-applied="true"] video,
html[udr-applied="true"] canvas,
html[udr-applied="true"] svg,
html[udr-applied="true"] picture,
html[udr-applied="true"] [role="img"] {
  filter: invert(1) hue-rotate(180deg) !important; /* re-invert media */
}
${amoledCss}

/* Prevent double-inverting extension UIs and iframes */
html[udr-applied="true"] iframe,
html[udr-applied="true"] embed,
html[udr-applied="true"] object {
  background: transparent !important;
}
`;
}
