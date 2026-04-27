(async function udrDeepScan() {
  const SAMPLE_LIMIT = 300;
  const CONTRAST_FAIL_THRESHOLD = 3.0; // WCAG AA is 4.5, we flag below 3 as broken

  // ── Utilities ──────────────────────────────────────────────────────────────

  function parseRgb(str) {
    if (!str) return null;

    // ── rgb() / rgba() ──────────────────────────────────────────────────────
    const mRgb = str.match(
      /rgba?\s*\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)(?:\s*,\s*([\d.]+))?\s*\)/
    );
    if (mRgb) {
      const a = mRgb[4] !== undefined ? parseFloat(mRgb[4]) : 1;
      if (a < 0.05) return null;
      return { r: +mRgb[1], g: +mRgb[2], b: +mRgb[3], a };
    }

    // ── oklch(L C H) / oklch(L C H / A) ────────────────────────────────────
    // Used by oklch-cascade engine. L is perceptual lightness 0-1.
    // We convert to approximate greyscale RGB so luminance/isLight/isDark work.
    // For grey (C=0): OKLab L = cbrt(Y_linear), so Y_linear = L^3.
    // For coloured oklch (C>0) this underestimates saturation but lightness
    // detection (all we need here) remains accurate.
    const mOklch = str.match(/oklch\(\s*([\d.]+)\s+[\d.]+\s+[\d.]+(?:\s*\/\s*([\d.]+))?\s*\)/);
    if (mOklch) {
      const L = parseFloat(mOklch[1]);
      const alpha = mOklch[2] !== undefined ? parseFloat(mOklch[2]) : 1;
      if (alpha < 0.05) return null;
      const Ylin = Math.pow(Math.max(0, L), 3);
      const srgb = Ylin <= 0.0031308 ? Ylin * 12.92 : 1.055 * Math.pow(Ylin, 1 / 2.4) - 0.055;
      const v = Math.round(Math.max(0, Math.min(1, srgb)) * 255);
      return { r: v, g: v, b: v, a: alpha, _oklchL: L };
    }

    return null;
  }

  function luminance(r, g, b) {
    const s = [r, g, b].map((c) => {
      c /= 255;
      return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
    });
    return 0.2126 * s[0] + 0.7152 * s[1] + 0.0722 * s[2];
  }

  function contrast(rgb1, rgb2) {
    if (!rgb1 || !rgb2) return null;
    const l1 = luminance(rgb1.r, rgb1.g, rgb1.b);
    const l2 = luminance(rgb2.r, rgb2.g, rgb2.b);
    const lighter = Math.max(l1, l2);
    const darker = Math.min(l1, l2);
    return +((lighter + 0.05) / (darker + 0.05)).toFixed(2);
  }

  function isLight(rgb) {
    if (!rgb) return null;
    return luminance(rgb.r, rgb.g, rgb.b) > 0.4;
  }

  function isDark(rgb) {
    if (!rgb) return null;
    return luminance(rgb.r, rgb.g, rgb.b) < 0.15;
  }

  /**
   * Walk up the DOM to find the first non-transparent background.
   * This is what parseRgbFast misses entirely — transparent elements
   * inherit their visual background from an ancestor.
   */
  function effectiveBg(el) {
    let node = el;
    while (node && node !== document.documentElement) {
      const bg = getComputedStyle(node).backgroundColor;
      const rgb = parseRgb(bg);
      if (rgb) return { color: bg, rgb, foundOn: node.tagName + (node.id ? "#" + node.id : "") };
      node = node.parentElement;
    }
    // Fall back to html background
    const htmlBg = getComputedStyle(document.documentElement).backgroundColor;
    const rgb = parseRgb(htmlBg);
    return { color: htmlBg, rgb, foundOn: "html" };
  }

  // ── 1. ENVIRONMENT ─────────────────────────────────────────────────────────

  const env = {
    url: location.href,
    udrMode: document.documentElement.getAttribute("data-udr-mode"),
    udrApplied: document.documentElement.getAttribute("udr-applied"),
    colorScheme: getComputedStyle(document.documentElement).colorScheme,
    bodyBgComputed: getComputedStyle(document.body).backgroundColor,
    htmlBgComputed: getComputedStyle(document.documentElement).backgroundColor,
    bodyBgInline: document.body.style.backgroundColor || "(none)",
    htmlBgInline: document.documentElement.style.backgroundColor || "(none)",
    styleTagsPresent: [
      "udr-style",
      "udr-shield",
      "udr-preinject",
      "udr-passive-style",
      "udr-oklch-scheme",
      "udr-oklch-variables",
      "udr-oklch-semantic",
      "udr-oklch-special",
      "udr-premap-scheme",
      "udr-premap-rules",
      "udr-premap-hijack",
      "udr-premap-special",
      "udr-chroma-variables",
      "udr-chroma-base",
      "udr-chroma-semantic",
    ].reduce((acc, id) => {
      const el = document.getElementById(id);
      if (el) acc[id] = (el.textContent || "").slice(0, 120).replace(/\s+/g, " ").trim() + "…";
      return acc;
    }, {}),
  };

  // ── 2. CSS VARIABLES AT :ROOT ──────────────────────────────────────────────

  const rootStyle = getComputedStyle(document.documentElement);
  const cssVars = {};
  try {
    for (const sheet of document.styleSheets) {
      try {
        for (const rule of sheet.cssRules) {
          if (
            rule instanceof CSSStyleRule &&
            (rule.selectorText === ":root" || rule.selectorText === "html")
          ) {
            for (const prop of rule.style) {
              if (prop.startsWith("--")) {
                cssVars[prop] = rootStyle.getPropertyValue(prop).trim();
              }
            }
          }
        }
      } catch {
        /* CORS */
      }
    }
  } catch {}

  const cssVarCount = Object.keys(cssVars).length;
  // Flag any vars that look like background/color but are still light
  const suspectVars = Object.entries(cssVars)
    .filter(([k, v]) => {
      if (!/(bg|background|surface|canvas|color|text|fg|foreground)/i.test(k)) return false;
      const rgb = parseRgb(v);
      return rgb && isLight(rgb);
    })
    .map(([k, v]) => ({ var: k, value: v }));

  // ── 3. ELEMENT SWEEP ───────────────────────────────────────────────────────

  const sel =
    "body,main,article,section,aside,nav,header,footer," +
    "div,p,span,a,h1,h2,h3,h4,h5,h6,li,td,th,button,input,textarea,select," +
    '[class*="card"],[class*="panel"],[class*="modal"],[class*="container"],[class*="wrapper"],' +
    '[role="main"],[role="navigation"],[role="dialog"],[role="banner"],[role="contentinfo"]';

  const elements = Array.from(document.querySelectorAll(sel)).slice(0, SAMPLE_LIMIT);

  // Batch ALL reads
  const reads = elements.map((el) => {
    const cs = getComputedStyle(el);
    return {
      el,
      tag: el.tagName.toLowerCase(),
      id: el.id || null,
      classes:
        el.className && typeof el.className === "string"
          ? el.className.split(" ").filter(Boolean).slice(0, 4).join(" ")
          : null,
      bgRaw: cs.backgroundColor,
      colorRaw: cs.color,
      hasInlineBg: !!el.style.backgroundColor,
      hasInlineColor: !!el.style.color,
      hasBackgroundImage: cs.backgroundImage !== "none",
      filter: cs.filter !== "none" ? cs.filter : null,
      opacity: parseFloat(cs.opacity),
    };
  });

  // ── 4. ANALYSE EACH ELEMENT ────────────────────────────────────────────────

  const problems = [];
  const transparentCount = { bg: 0, color: 0 };
  const colourDistrib = { lightBg: 0, darkBg: 0, transparentBg: 0, lightFg: 0, darkFg: 0 };

  for (const r of reads) {
    const bgRgb = parseRgb(r.bgRaw);
    const colorRgb = parseRgb(r.colorRaw);

    if (!bgRgb) {
      transparentCount.bg++;
      colourDistrib.transparentBg++;
    } else if (isLight(bgRgb)) {
      colourDistrib.lightBg++;
    } else {
      colourDistrib.darkBg++;
    }

    if (!colorRgb) transparentCount.color++;
    else if (isLight(colorRgb)) colourDistrib.lightFg++;
    else colourDistrib.darkFg++;

    // Problem: light background remaining after dark mode
    if (bgRgb && isLight(bgRgb)) {
      const eff = effectiveBg(r.el);
      problems.push({
        issue: "🔆 LIGHT BACKGROUND",
        tag: r.tag,
        id: r.id,
        classes: r.classes,
        computedBg: r.bgRaw,
        computedColor: r.colorRaw,
        hasInlineBg: r.hasInlineBg,
        effectiveBgFoundOn: eff.foundOn,
        contrastRatio: contrast(bgRgb, colorRgb),
      });
    }

    // Problem: dark text on dark background = unreadable
    if (bgRgb && !isLight(bgRgb) && colorRgb && isDark(colorRgb)) {
      const cr = contrast(bgRgb, colorRgb);
      if (cr !== null && cr < CONTRAST_FAIL_THRESHOLD) {
        problems.push({
          issue: "🔴 LOW CONTRAST (dark text on dark bg)",
          tag: r.tag,
          id: r.id,
          classes: r.classes,
          computedBg: r.bgRaw,
          computedColor: r.colorRaw,
          contrastRatio: cr,
        });
      }
    }

    // Problem: transparent background — effective bg might be light
    if (!bgRgb && r.tag !== "body" && r.tag !== "html") {
      const eff = effectiveBg(r.el);
      if (eff.rgb && isLight(eff.rgb)) {
        problems.push({
          issue: "⚠️ TRANSPARENT BG — EFFECTIVE BG IS LIGHT",
          tag: r.tag,
          id: r.id,
          classes: r.classes,
          computedBg: r.bgRaw,
          effectiveBg: eff.color,
          effectiveBgFoundOn: eff.foundOn,
          computedColor: r.colorRaw,
        });
      }
    }
  }

  // ── 5. IMAGE ANALYSIS ─────────────────────────────────────────────────────

  const images = Array.from(document.querySelectorAll("img,video,canvas,picture")).slice(0, 50);
  const imgReads = images.map((el) => {
    const cs = getComputedStyle(el);
    return {
      tag: el.tagName.toLowerCase(),
      src: el.src ? el.src.slice(0, 60) : null,
      filter: cs.filter !== "none" ? cs.filter : null,
      opacity: parseFloat(cs.opacity),
      hasInlineFilter: !!el.style.filter,
    };
  });
  const imagesWithFilter = imgReads.filter((i) => i.filter);
  const imagesWithDoubleFilter = imgReads.filter((i) => {
    if (!i.filter) return false;
    // Two brightness() calls = double-applied
    return (i.filter.match(/brightness/g) || []).length > 1;
  });

  // ── 6. MODAL-SELECTOR FALSE POSITIVES ─────────────────────────────────────
  // Detects elements that match broad modal selectors ([class*="overlay"] etc.)
  // but are likely image covers or decorative layers — the #1 cause of images
  // being painted over with a dark background.

  const MODAL_SELECTORS = [
    '[class*="overlay"]',
    '[class*="modal"]',
    '[class*="dialog"]',
    '[class*="drawer"]',
    '[class*="popup"]',
    '[aria-modal="true"]',
    '[role="dialog"]',
  ];

  const modalFalsePositives = [];

  for (const sel of MODAL_SELECTORS) {
    let matched;
    try {
      matched = Array.from(document.querySelectorAll(sel)).slice(0, 30);
    } catch {
      continue;
    }

    for (const el of matched) {
      const cs = getComputedStyle(el);
      const pos = cs.position;
      const bg = cs.backgroundColor;
      const bgRgb = parseRgb(bg);
      const isModal = el.matches('dialog,[aria-modal="true"],[role="dialog"],[role="alertdialog"]');

      // Skip true modals (they're supposed to be dark)
      if (isModal) continue;

      // A false-positive overlay candidate: positioned, dark bg, sitting near an img
      const isPositioned = pos === "absolute" || pos === "fixed";
      const hasDarkBg = bgRgb && !isLight(bgRgb);
      const zIndex = parseInt(cs.zIndex) || 0;

      // Check if any img/video is a sibling or child-of-sibling
      const parent = el.parentElement;
      const siblingHasMedia =
        parent && Array.from(parent.querySelectorAll("img,video,picture")).length > 0;
      const selfHasMedia = el.querySelectorAll("img,video,picture").length > 0;

      if (isPositioned && hasDarkBg && (siblingHasMedia || selfHasMedia)) {
        modalFalsePositives.push({
          matchedSelector: sel,
          tag: el.tagName.toLowerCase(),
          id: el.id || null,
          classes:
            typeof el.className === "string"
              ? el.className.split(" ").filter(Boolean).join(" ")
              : null,
          position: pos,
          zIndex,
          computedBg: bg,
          mediaInParent: siblingHasMedia,
          mediaAsChild: selfHasMedia,
          diagnosis: `"${sel}" is matching a positioned layer over media — likely covering images`,
        });
      }
    }
  }

  // ── 7. BACKGROUND IMAGES ──────────────────────────────────────────────────

  const bgImageEls = reads
    .filter((r) => r.hasBackgroundImage)
    .slice(0, 20)
    .map((r) => ({
      tag: r.tag,
      id: r.id,
      classes: r.classes,
      bg: r.bgRaw,
      filter: r.filter,
    }));

  // ── 8. INLINE STYLE OFFENDERS ─────────────────────────────────────────────

  const inlineOffenders = reads
    .filter((r) => r.hasInlineBg || r.hasInlineColor)
    .slice(0, 30)
    .map((r) => ({
      tag: r.tag,
      id: r.id,
      classes: r.classes,
      inlineBg: r.hasInlineBg ? r.el.style.backgroundColor : null,
      inlineColor: r.hasInlineColor ? r.el.style.color : null,
      computedBg: r.bgRaw,
      computedColor: r.colorRaw,
      isLightBg: r.hasInlineBg ? isLight(parseRgb(r.bgRaw)) : null,
    }));

  // ── 9. SUMMARISE ──────────────────────────────────────────────────────────

  const lightBgProblems = problems.filter((p) => p.issue.includes("LIGHT BACKGROUND"));
  const contrastProblems = problems.filter((p) => p.issue.includes("LOW CONTRAST"));
  const transparentLightProblems = problems.filter((p) => p.issue.includes("TRANSPARENT"));

  // ── PHOTON-INVERTER MODE CHECK ────────────────────────────────────────────
  // Photon-inverter works by applying filter:invert() to <html> and counter-
  // inverting images. getComputedStyle() returns pre-filter values, so the
  // standard colour distribution analysis is meaningless in this mode.
  // We check the things that actually matter for this engine instead.
  const MEDIA_TAGS = new Set(["PICTURE", "SVG", "VIDEO", "CANVAS", "IFRAME"]);
  const photonChecks = (() => {
    if (env.udrMode !== "photon-inverter") return null;
    const htmlFilter = getComputedStyle(document.documentElement).filter;
    const hasInvert = htmlFilter && htmlFilter.includes("invert");

    // Check top-level media elements (not nested inside other media) for missing counter-invert
    const allMedia = Array.from(document.querySelectorAll("img,video,picture,canvas,svg,iframe"));
    const isNestedMedia = (el) => {
      let parent = el.parentElement;
      while (parent && parent !== document.documentElement) {
        if (MEDIA_TAGS.has(parent.tagName)) return true;
        parent = parent.parentElement;
      }
      return false;
    };

    const topLevelMedia = allMedia.filter((el) => !isNestedMedia(el));
    const nestedMedia = allMedia.filter((el) => isNestedMedia(el));

    const imgsMissingCounterInvert = topLevelMedia.filter((el) => {
      const f = getComputedStyle(el).filter;
      return !f || !f.includes("invert");
    }).length;

    // Nested media should have filter:none — if they still have invert, filters are stacking
    const nestedWithStaleInvert = nestedMedia.filter((el) => {
      const f = getComputedStyle(el).filter;
      return f && f.includes("invert");
    });

    // Elements with computed background-image (via stylesheet, not inline) missing counter-invert
    const bgImageEls = Array.from(document.querySelectorAll("div,span,a,section,header,footer"))
      .slice(0, 500)
      .filter((el) => {
        const cs = getComputedStyle(el);
        return cs.backgroundImage !== "none" && !cs.filter.includes("invert");
      });

    const whiteFilledOverlays = Array.from(document.querySelectorAll("[data-photon-fix]")).filter(
      (el) => {
        const pos = getComputedStyle(el).position;
        return pos === "absolute" || pos === "fixed";
      }
    ).length;

    return {
      hasInvert,
      htmlFilter,
      imgsMissingCounterInvert,
      nestedMediaWithStackedInvert: nestedWithStaleInvert.length,
      nestedMediaDetail: nestedWithStaleInvert.slice(0, 10).map((el) => ({
        tag: el.tagName.toLowerCase(),
        parent: el.parentElement?.tagName.toLowerCase(),
        src: el.src ? el.src.slice(0, 80) : null,
        filter: getComputedStyle(el).filter,
      })),
      bgImagesMissingCounterInvert: bgImageEls.length,
      bgImageDetail: bgImageEls.slice(0, 10).map((el) => ({
        tag: el.tagName.toLowerCase(),
        id: el.id || null,
        classes:
          typeof el.className === "string"
            ? el.className.split(" ").filter(Boolean).slice(0, 4).join(" ")
            : null,
        backgroundImage: getComputedStyle(el).backgroundImage.slice(0, 80),
      })),
      whiteFilledOverlays,
    };
  })();

  const report = {
    "📋 ENVIRONMENT": env,

    "🎨 CSS VARIABLES": {
      totalFound: cssVarCount,
      suspectLightVarsStillLight: suspectVars.length,
      suspectVars: suspectVars.slice(0, 20),
    },

    "📊 COLOUR DISTRIBUTION (across sampled elements)": {
      sampledElements: reads.length,
      backgrounds: {
        dark: colourDistrib.darkBg,
        light: colourDistrib.lightBg, // ← should be 0 in good dark mode
        transparent: colourDistrib.transparentBg,
      },
      foregrounds: {
        light: colourDistrib.lightFg,
        dark: colourDistrib.darkFg, // ← dark fg on dark bg = problem
      },
    },

    "🚨 PROBLEMS FOUND": {
      total: problems.length,
      lightBackgroundsRemaining: lightBgProblems.length,
      lowContrastPairs: contrastProblems.length,
      transparentWithLightEffectiveBg: transparentLightProblems.length,
      detail: problems.slice(0, 40),
    },

    "🖼️ IMAGES": {
      total: images.length,
      withFilter: imagesWithFilter.length,
      withDoubleFilter: imagesWithDoubleFilter.length, // ← double brightness = bug
      detail: imagesWithFilter.slice(0, 15),
    },

    "📌 INLINE STYLE OFFENDERS": {
      total: inlineOffenders.length,
      detail: inlineOffenders,
    },

    "🎭 MODAL-SELECTOR FALSE POSITIVES": {
      total: modalFalsePositives.length,
      detail: modalFalsePositives.slice(0, 20),
    },

    "🔦 PHOTON-INVERTER CHECKS": photonChecks || "N/A — not photon-inverter mode",

    "🖼️ BACKGROUND IMAGE ELEMENTS": {
      total: bgImageEls.length,
      detail: bgImageEls,
    },

    "💡 DIAGNOSIS HINTS": {
      "Modal selectors covering images":
        modalFalsePositives.length > 0
          ? `🚨 ${modalFalsePositives.length} element(s) matched by broad modal selectors (e.g. [class*="overlay"]) are positioned over media — they are being painted dark and covering images. Fix: narrow or remove [class*="overlay"] from modal CSS rules.`
          : "✅ OK",
      "Many transparent-bg problems":
        transparentLightProblems.length > 10
          ? "⚠️ Engine is not walking DOM to find effective backgrounds — transparent elements pass through to unmodified ancestor"
          : "✅ OK",
      "Sparse palette (<10 colors found in PR)":
        env.udrMode === "perceptual-remap" && reads.length > 0
          ? "⚠️ Check palette size — if very low, transparent bg stripping is losing most colours"
          : "N/A",
      "CSS vars not hijacked":
        cssVarCount > 0 && suspectVars.length > 5
          ? `⚠️ ${suspectVars.length} light vars still active — hijack may not be matching names`
          : "✅ OK",
      "Double filter on images":
        imagesWithDoubleFilter.length > 0
          ? `⚠️ ${imagesWithDoubleFilter.length} images have double brightness filter`
          : "✅ OK",
      "Colour distribution accuracy": (() => {
        if (env.udrMode === "oklch-cascade") {
          const allTransparent = colourDistrib.transparentBg === reads.length;
          return allTransparent
            ? "⚠️ All elements showing as transparent — likely a parseRgb format mismatch (oklch values not parsed). Update debug script."
            : "✅ oklch values parsed correctly";
        }
        if (env.udrMode === "photon-inverter") {
          return "⚠️ Colour distribution is meaningless in photon-inverter mode — getComputedStyle() returns pre-filter values. See 🔦 PHOTON-INVERTER CHECKS instead.";
        }
        return "✅ OK";
      })(),
      "Photon-inverter health": (() => {
        if (!photonChecks) return "N/A";
        const issues = [];
        if (!photonChecks.hasInvert)
          issues.push("html filter:invert() not detected — engine may not have applied");
        if (photonChecks.imgsMissingCounterInvert > 0)
          issues.push(
            `${photonChecks.imgsMissingCounterInvert} top-level media missing counter-invert filter — will appear colour-inverted`
          );
        if (photonChecks.nestedMediaWithStackedInvert > 0)
          issues.push(
            `${photonChecks.nestedMediaWithStackedInvert} nested media still have invert filter — triple-inversion bug (e.g. picture>img both counter-inverting)`
          );
        if (photonChecks.bgImagesMissingCounterInvert > 0)
          issues.push(
            `${photonChecks.bgImagesMissingCounterInvert} elements with CSS background-image lack counter-invert — hero/banner images will appear inverted`
          );
        if (photonChecks.whiteFilledOverlays > 0)
          issues.push(
            `${photonChecks.whiteFilledOverlays} positioned overlays got JS white-fill — may cover images after inversion`
          );
        return issues.length ? "🚨 " + issues.join("; ") : "✅ OK";
      })(),
    },
  };

  console.log(
    "%c UDR Deep Scan Report ",
    "background:#1a1a2e;color:#e0e0ff;font-size:14px;padding:4px 8px;border-radius:4px;"
  );
  console.log(JSON.stringify(report, null, 2));

  // Also surface the top problems directly for quick reading
  console.log("%c TOP ISSUES ", "background:#c0392b;color:white;font-size:12px;padding:2px 6px");
  if (env.udrMode === "photon-inverter") {
    console.log(
      "%c ⚠️ photon-inverter mode: colour problems above are pre-filter values and are all false positives. See 🔦 PHOTON-INVERTER CHECKS in the report above. ",
      "background:#7a4f00;color:#ffe;font-size:11px;padding:2px 6px"
    );
    if (photonChecks) {
      console.table({
        hasInvert: photonChecks.hasInvert,
        htmlFilter: photonChecks.htmlFilter,
        imgsMissingCounterInvert: photonChecks.imgsMissingCounterInvert,
        nestedMediaWithStackedInvert: photonChecks.nestedMediaWithStackedInvert,
        bgImagesMissingCounterInvert: photonChecks.bgImagesMissingCounterInvert,
        whiteFilledOverlays: photonChecks.whiteFilledOverlays,
      });
      if (photonChecks.nestedMediaDetail.length > 0) {
        console.log(
          "%c Nested media with stacked invert (triple-inversion bug): ",
          "color:#ff6b6b"
        );
        console.table(photonChecks.nestedMediaDetail);
      }
      if (photonChecks.bgImageDetail.length > 0) {
        console.log("%c CSS background-image elements missing counter-invert: ", "color:#ff6b6b");
        console.table(photonChecks.bgImageDetail);
      }
    }
  } else {
    console.table(
      problems.slice(0, 20).map((p) => ({
        issue: p.issue,
        element: `${p.tag}${p.id ? "#" + p.id : ""}`,
        classes: p.classes,
        bg: p.computedBg,
        color: p.computedColor,
        contrast: p.contrastRatio,
      }))
    );
  }

  return report;
})();
