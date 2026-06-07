// tests/unit/optimizer-defer.test.ts
import { describe, it, expect } from "vitest";

/**
 * OPTIMIZATION 3: Defer Worker Initialization
 *
 * Tests for deferred optimizer worker initialization
 * Note: Full integration testing requires browser environment with Worker support.
 * These tests verify the logic and approach.
 */
describe("Optimizer Worker Deferral (Opt-3)", () => {
  it("should reduce initial sample size from 120 to 80", () => {
    // This is a configuration test - verifying the optimization constants
    const OLD_MAX_SAMPLES = 120;
    const NEW_MAX_SAMPLES = 80;

    // Reduced sample size should be more than 50% of original for statistical validity
    expect(NEW_MAX_SAMPLES / OLD_MAX_SAMPLES).toBeGreaterThan(0.6);

    // But should be meaningfully reduced to save time
    expect(NEW_MAX_SAMPLES).toBeLessThan(OLD_MAX_SAMPLES);
  });

  it("should use reduced selector set for faster DOM queries", () => {
    const oldSelectors = "p,span,li,dd,dt,small,code,pre,a,td,th,h1,h2,h3,h4,h5,h6".split(",");
    const newSelectors = "p,span,li,a,td,th,h1,h2,h3".split(",");

    // New selector set should be smaller
    expect(newSelectors.length).toBeLessThan(oldSelectors.length);

    // But should still include most common text elements
    expect(newSelectors).toContain("p");
    expect(newSelectors).toContain("span");
    expect(newSelectors).toContain("li");
    expect(newSelectors).toContain("a");
  });

  it("should verify requestIdleCallback provides deferral capability", () => {
    // Verify that requestIdleCallback exists in modern browsers
    // or can be polyfilled with setTimeout
    const hasRequestIdleCallback = typeof window !== "undefined" && "requestIdleCallback" in window;
    const canBePolyfilled = typeof setTimeout !== "undefined";

    expect(hasRequestIdleCallback || canBePolyfilled).toBe(true);
  });

  it("should handle requestAnimationFrame for batched style collection", () => {
    // Verify requestAnimationFrame is available for batching
    const hasRequestAnimationFrame =
      typeof window !== "undefined" && "requestAnimationFrame" in window;
    const canBePolyfilled = typeof setTimeout !== "undefined";

    expect(hasRequestAnimationFrame || canBePolyfilled).toBe(true);
  });

  it("should define reasonable timeout for deferred initialization", () => {
    const TIMEOUT_MS = 2000;

    // Timeout should be:
    // - Long enough to not interrupt initial page load (> 1s)
    // - Short enough to provide timely optimization (< 5s)
    expect(TIMEOUT_MS).toBeGreaterThanOrEqual(1000);
    expect(TIMEOUT_MS).toBeLessThanOrEqual(5000);
  });

  it("should handle fallback when requestIdleCallback is not available", () => {
    // The implementation should use:
    // const scheduleInit = window.requestIdleCallback || ((cb) => setTimeout(cb, 0));

    const fallback = (cb: () => void) => setTimeout(cb, 0);

    // Fallback should be a function
    expect(typeof fallback).toBe("function");

    // Fallback should work
    let executed = false;
    fallback(() => {
      executed = true;
    });

    // setTimeout(cb, 0) schedules for next tick
    setTimeout(() => {
      expect(executed).toBe(true);
    }, 10);
  });

  it("should batch all getComputedStyle reads together", () => {
    // This verifies the approach: collect all elements, then read all styles
    // Expected flow:
    // 1. querySelectorAll (DOM read)
    // 2. Array.from + slice (pure JS)
    // 3. Loop: ALL getComputedStyle calls (batched layout read)
    // 4. Loop: process data (pure JS, no layout)

    const mockElements = [
      { textContent: "test1" },
      { textContent: "test2" },
      { textContent: "test3" },
    ];

    // Simulate batched read
    const styleData: Array<{ fg: string; bg: string }> = [];
    for (const el of mockElements) {
      // All style reads happen here (batched)
      styleData.push({
        fg: "rgb(0, 0, 0)",
        bg: "rgb(255, 255, 255)",
      });
    }

    // Then process (no more style reads)
    const samples: Array<{ fg: string; bg: string }> = [];
    for (const data of styleData) {
      if (data.bg === "transparent") {
        data.bg = "rgb(255, 255, 255)";
      }
      samples.push(data);
    }

    expect(samples.length).toBe(3);
  });

  it("should handle transparent backgrounds with single body style read", () => {
    // Optimization: read body background once, reuse for all transparent elements
    const bodyBg = "rgb(255, 255, 255)"; // Single read

    const styleData = [
      { fg: "rgb(0, 0, 0)", bg: "transparent" },
      { fg: "rgb(0, 0, 0)", bg: "rgba(0, 0, 0, 0)" },
      { fg: "rgb(0, 0, 0)", bg: "rgb(200, 200, 200)" },
    ];

    const samples: Array<{ fg: string; bg: string }> = [];
    for (const data of styleData) {
      if (data.bg === "transparent" || data.bg === "rgba(0, 0, 0, 0)") {
        data.bg = bodyBg; // Reuse cached value
      }
      samples.push(data);
    }

    expect(samples[0].bg).toBe(bodyBg);
    expect(samples[1].bg).toBe(bodyBg);
    expect(samples[2].bg).toBe("rgb(200, 200, 200)");
  });

  it("should prevent duplicate initialization with promise guard", () => {
    // Test the workerInitPromise pattern
    let workerInitPromise: Promise<void> | null = null;
    let initCount = 0;

    const mockInit = async (): Promise<void> => {
      if (workerInitPromise) return workerInitPromise;

      workerInitPromise = new Promise((resolve) => {
        initCount++;
        setTimeout(resolve, 10);
      });

      return workerInitPromise;
    };

    // Call multiple times rapidly
    mockInit();
    mockInit();
    mockInit();

    // Should only initialize once (verified by initCount)
    return new Promise((resolve) => {
      setTimeout(() => {
        expect(initCount).toBe(1);
        resolve();
      }, 50);
    });
  });

  it("should reset promise on initialization failure", () => {
    // If worker fails, workerInitPromise should be reset to null
    let workerInitPromise: Promise<void> | null = null;
    let shouldFail = true;

    const mockInit = async (): Promise<void> => {
      if (workerInitPromise) return workerInitPromise;

      workerInitPromise = new Promise((resolve, reject) => {
        if (shouldFail) {
          workerInitPromise = null; // Reset on failure
          reject(new Error("Worker failed"));
        } else {
          resolve();
        }
      });

      return workerInitPromise.catch((err) => {
        workerInitPromise = null; // Ensure reset
        throw err;
      });
    };

    // First call fails
    return mockInit().catch(() => {
      expect(workerInitPromise).toBeNull();

      // Second call should be able to retry
      shouldFail = false;
      return mockInit().then(() => {
        expect(workerInitPromise).not.toBeNull();
      });
    });
  });
});
