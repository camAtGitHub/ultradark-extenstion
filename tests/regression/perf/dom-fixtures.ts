// tests/regression/perf/dom-fixtures.ts
//
// Generates synthetic DOM trees of controlled complexity for benchmarking.
// Each fixture mimics a real-world page archetype so regressions are caught
// against representative workloads, not toy DOMs.

import { JSDOM } from "jsdom";
import type { DomTier } from "../config";
import { DOM_TIERS } from "../config";

// ── Tag distribution modelling real pages ─────────────────────────────────────

const BLOCK_TAGS  = ["div", "section", "article", "main", "aside", "nav", "header", "footer"];
const INLINE_TAGS = ["span", "a", "strong", "em", "small", "code"];
const TEXT_TAGS   = ["p", "h1", "h2", "h3", "li", "td", "th", "label"];
const MEDIA_TAGS  = ["img", "svg", "video", "canvas"];

// Weighted pick: ~50% block, ~25% text, ~15% inline, ~10% media
function randomTag(rng: () => number): string {
  const r = rng();
  if (r < 0.50) return BLOCK_TAGS[Math.floor(rng() * BLOCK_TAGS.length)];
  if (r < 0.75) return TEXT_TAGS[Math.floor(rng() * TEXT_TAGS.length)];
  if (r < 0.90) return INLINE_TAGS[Math.floor(rng() * INLINE_TAGS.length)];
  return MEDIA_TAGS[Math.floor(rng() * MEDIA_TAGS.length)];
}

// Deterministic PRNG (mulberry32) so fixtures are reproducible across runs
function mulberry32(seed: number): () => number {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ── Inline style palette for realistic getComputedStyle mocking ───────────────

const LIGHT_BGS = [
  "rgb(255, 255, 255)",       // white
  "rgb(245, 245, 245)",       // near-white
  "rgb(250, 250, 250)",       // very light grey
  "rgba(0, 0, 0, 0)",         // transparent
  "rgb(240, 240, 240)",       // light grey
  "rgb(255, 248, 225)",       // warm cream
  "rgb(232, 245, 253)",       // light blue tint
];

const LIGHT_FGS = [
  "rgb(0, 0, 0)",
  "rgb(33, 33, 33)",
  "rgb(51, 51, 51)",
  "rgb(66, 66, 66)",
  "rgb(0, 102, 204)",         // link blue
  "rgb(204, 0, 0)",           // error red
];

// ── SPA-specific patterns (obfuscated classes, deep nesting) ──────────────────

const SPA_CLASSES = [
  "_a0", "_b1", "_c2", "_d3", "_e4", "_f5",
  "css-1dbjc4n", "css-r1dszh", "css-901oao",  // React Native Web style
  "sc-bwzfXH", "sc-bdVTJa",                    // styled-components
];

// ── Fixture builder ───────────────────────────────────────────────────────────

export interface DomFixture {
  dom: JSDOM;
  document: Document;
  window: Window;
  nodeCount: number;
  maxDepth: number;
  tier: DomTier;
  /** Map of element → simulated computed styles for mocking */
  styleMap: WeakMap<Element, { backgroundColor: string; color: string }>;
}

export function buildFixture(tier: DomTier, seed = 42): DomFixture {
  const { nodes: targetNodes, depth: maxDepth } = DOM_TIERS[tier];
  const rng = mulberry32(seed);

  const dom = new JSDOM(`<!DOCTYPE html><html><head></head><body></body></html>`);
  const doc = dom.window.document;
  const styleMap = new WeakMap<Element, { backgroundColor: string; color: string }>();

  let created = 0;

  function buildSubtree(parent: Element, currentDepth: number): void {
    if (created >= targetNodes) return;

    // Scale children to fill remaining budget — wide at top, narrowing with depth
    const remaining = targetNodes - created;
    const depthRatio = 1 - currentDepth / maxDepth;
    const baseChildren = Math.max(2, Math.ceil(8 * depthRatio));
    const childCount = Math.min(
      Math.floor(rng() * baseChildren) + 2,
      remaining,
    );

    for (let i = 0; i < childCount && created < targetNodes; i++) {
      const tag = randomTag(rng);
      const el = doc.createElement(tag);
      created++;

      // Assign simulated styles
      const bg = LIGHT_BGS[Math.floor(rng() * LIGHT_BGS.length)];
      const fg = LIGHT_FGS[Math.floor(rng() * LIGHT_FGS.length)];
      styleMap.set(el, { backgroundColor: bg, color: fg });

      // SPA tier gets obfuscated classes and deeper nesting
      if (tier === "spa") {
        el.className = SPA_CLASSES[Math.floor(rng() * SPA_CLASSES.length)];
        // SPAs have lots of wrapper divs
        if (rng() < 0.3 && currentDepth < maxDepth) {
          const wrapper = doc.createElement("div");
          wrapper.className = SPA_CLASSES[Math.floor(rng() * SPA_CLASSES.length)];
          styleMap.set(wrapper, { backgroundColor: "rgba(0, 0, 0, 0)", color: fg });
          parent.appendChild(wrapper);
          wrapper.appendChild(el);
          created++;
          if (currentDepth + 1 < maxDepth) {
            buildSubtree(el, currentDepth + 2);
          }
          continue;
        }
      }

      // Add text content to text-bearing elements
      if (TEXT_TAGS.includes(tag) || INLINE_TAGS.includes(tag)) {
        el.textContent = `Sample text node ${created}`;
      }

      // Media elements get src attributes
      if (tag === "img") {
        el.setAttribute("src", "data:image/gif;base64,R0lGODlhAQABAAAAACw=");
        el.setAttribute("alt", `img-${created}`);
      }

      parent.appendChild(el);

      // Recurse deeper — recurse on block tags always, others sometimes
      if (currentDepth + 1 < maxDepth && created < targetNodes) {
        if (BLOCK_TAGS.includes(tag) || rng() < 0.3) {
          buildSubtree(el, currentDepth + 1);
        }
      }
    }
  }

  buildSubtree(doc.body, 0);

  return {
    dom,
    document: doc,
    window: dom.window as unknown as Window,
    nodeCount: created,
    maxDepth,
    tier,
    styleMap,
  };
}

// ── getComputedStyle mock factory ─────────────────────────────────────────────
// Returns a mock that uses the fixture's styleMap for realistic colour values.

export function mockGetComputedStyle(fixture: DomFixture) {
  return (element: Element): CSSStyleDeclaration => {
    const styles = fixture.styleMap.get(element) ?? {
      backgroundColor: "rgba(0, 0, 0, 0)",
      color: "rgb(0, 0, 0)",
    };

    const mockStyles: Record<string, unknown> = {
      backgroundColor: styles.backgroundColor,
      color: styles.color,
      colorScheme: "",
      display: "block",
      position: "static",
      overflow: "visible",
      filter: "none",
      opacity: "1",
      getPropertyValue: (prop: string) => {
        const camelProp = prop.replace(/-([a-z])/g, (_, c: string) => c.toUpperCase());
        return (mockStyles[camelProp] as string) ?? "";
      },
      setProperty: () => {},
      removeProperty: () => "",
      item: () => "",
      length: 0,
    };

    return new Proxy(mockStyles, {
      get(target, prop) {
        if (prop in target) return target[prop as string];
        return "";
      },
    }) as unknown as CSSStyleDeclaration;
  };
}
