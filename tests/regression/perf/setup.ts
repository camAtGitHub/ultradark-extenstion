// tests/regression/perf/setup.ts
//
// Installs browser API mocks required by the algorithm modules.
// Import this BEFORE importing any algorithm code.

import type { DomFixture } from "./dom-fixtures";
import { mockGetComputedStyle } from "./dom-fixtures";

/** Install minimal `browser` global so modules that import the logger don't throw */
export function installBrowserMock(): void {
  if (typeof globalThis.browser !== "undefined") return;

  (globalThis as Record<string, unknown>).browser = {
    storage: {
      local: {
        get: async () => ({ isDebugMode: false }),
        set: async () => {},
      },
    },
    runtime: {
      onMessage: { addListener: () => {}, removeListener: () => {} },
      sendMessage: async () => {},
    },
  };
}

/** Install CSS.supports mock (returns false for everything — conservative) */
export function installCssSupportsMock(): void {
  if (typeof globalThis.CSS === "undefined") {
    (globalThis as Record<string, unknown>).CSS = {};
  }
  (globalThis.CSS as Record<string, unknown>).supports = (_prop: string, _val?: string) => false;
}

/** Install requestAnimationFrame / requestIdleCallback (synchronous for benchmarking) */
export function installAnimationFrameMock(): void {
  if (typeof globalThis.requestAnimationFrame === "undefined") {
    (globalThis as Record<string, unknown>).requestAnimationFrame = (cb: FrameRequestCallback) => {
      cb(performance.now());
      return 0;
    };
  }
  if (typeof globalThis.cancelAnimationFrame === "undefined") {
    (globalThis as Record<string, unknown>).cancelAnimationFrame = () => {};
  }
  if (typeof globalThis.requestIdleCallback === "undefined") {
    (globalThis as Record<string, unknown>).requestIdleCallback = (cb: IdleRequestCallback) => {
      cb({ didTimeout: false, timeRemaining: () => 50 } as IdleDeadline);
      return 0;
    };
  }
}

/** Install NodeFilter constants (jsdom sometimes lacks these) */
export function installNodeFilterMock(): void {
  if (typeof globalThis.NodeFilter === "undefined") {
    (globalThis as Record<string, unknown>).NodeFilter = {
      SHOW_ELEMENT: 1,
      SHOW_TEXT: 4,
      SHOW_ALL: 0xFFFFFFFF,
      FILTER_ACCEPT: 1,
      FILTER_REJECT: 2,
      FILTER_SKIP: 3,
    };
  }
}

/** Install MutationObserver stub */
export function installMutationObserverMock(): void {
  if (typeof globalThis.MutationObserver === "undefined") {
    (globalThis as Record<string, unknown>).MutationObserver = class {
      observe() {}
      disconnect() {}
      takeRecords() { return []; }
    };
  }
}

/**
 * Bind a fixture's DOM to the global scope so algorithm code can
 * reference `document`, `window`, `getComputedStyle`, etc.
 */
export function bindFixtureGlobals(fixture: DomFixture): () => void {
  const prev = {
    document: globalThis.document,
    window: globalThis.window,
    getComputedStyle: globalThis.getComputedStyle,
    HTMLElement: (globalThis as Record<string, unknown>).HTMLElement,
    Element: (globalThis as Record<string, unknown>).Element,
    Node: (globalThis as Record<string, unknown>).Node,
    Text: (globalThis as Record<string, unknown>).Text,
  };

  (globalThis as Record<string, unknown>).document = fixture.document;
  (globalThis as Record<string, unknown>).window = fixture.window;
  (globalThis as Record<string, unknown>).getComputedStyle = mockGetComputedStyle(fixture);

  // Expose DOM constructors from jsdom (algorithms check `instanceof HTMLElement` etc.)
  const win = fixture.window as unknown as Record<string, unknown>;
  for (const ctor of ["HTMLElement", "Element", "Node", "Text", "HTMLStyleElement", "HTMLImageElement", "SVGElement"]) {
    if (win[ctor]) {
      (globalThis as Record<string, unknown>)[ctor] = win[ctor];
    }
  }

  // Ensure location exists
  try {
    Object.defineProperty(fixture.window, "location", {
      value: { href: "https://test.example.com", origin: "https://test.example.com", hostname: "test.example.com" },
      writable: true,
      configurable: true,
    });
  } catch { /* already defined */ }

  // Return teardown function
  return () => {
    (globalThis as Record<string, unknown>).document = prev.document;
    (globalThis as Record<string, unknown>).window = prev.window;
    (globalThis as Record<string, unknown>).getComputedStyle = prev.getComputedStyle;
    (globalThis as Record<string, unknown>).HTMLElement = prev.HTMLElement;
    (globalThis as Record<string, unknown>).Element = prev.Element;
    (globalThis as Record<string, unknown>).Node = prev.Node;
    (globalThis as Record<string, unknown>).Text = prev.Text;
  };
}

/** Full mock installation for benchmark runs */
export function installAllMocks(fixture?: DomFixture): (() => void) | void {
  installBrowserMock();
  installCssSupportsMock();
  installAnimationFrameMock();
  installNodeFilterMock();
  installMutationObserverMock();
  if (fixture) return bindFixtureGlobals(fixture);
}
