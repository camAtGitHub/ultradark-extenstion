// tests/debounce.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

/**
 * Debounce function to limit how often a function can be called
 */
function debounce<T extends (...args: unknown[]) => void>(
  func: T,
  wait = 250
): (...args: Parameters<T>) => void {
  let timeout: ReturnType<typeof setTimeout> | null = null;
  
  return (...args: Parameters<T>) => {
    if (timeout) clearTimeout(timeout);
    timeout = setTimeout(() => {
      func(...args);
    }, wait);
  };
}

describe("Debounce Mechanism", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("should call function only once after multiple rapid calls", () => {
    const mockFn = vi.fn();
    const debouncedFn = debounce(mockFn, 250);

    // Simulate rapid slider movements
    debouncedFn();
    debouncedFn();
    debouncedFn();
    debouncedFn();
    debouncedFn();

    // Function should not be called yet
    expect(mockFn).not.toHaveBeenCalled();

    // Fast-forward time by 250ms
    vi.advanceTimersByTime(250);

    // Function should be called exactly once
    expect(mockFn).toHaveBeenCalledTimes(1);
  });

  it("should delay function execution by the specified time", () => {
    const mockFn = vi.fn();
    const debouncedFn = debounce(mockFn, 300);

    debouncedFn();

    // Should not be called before the delay
    vi.advanceTimersByTime(299);
    expect(mockFn).not.toHaveBeenCalled();

    // Should be called after the full delay
    vi.advanceTimersByTime(1);
    expect(mockFn).toHaveBeenCalledTimes(1);
  });

  it("should reset the timer on each call", () => {
    const mockFn = vi.fn();
    const debouncedFn = debounce(mockFn, 250);

    debouncedFn();
    vi.advanceTimersByTime(100);
    
    debouncedFn(); // Reset timer
    vi.advanceTimersByTime(100);
    
    debouncedFn(); // Reset timer again
    vi.advanceTimersByTime(100);

    // Total elapsed: 300ms, but function should not be called yet
    // because timer was reset twice
    expect(mockFn).not.toHaveBeenCalled();

    // Advance remaining time
    vi.advanceTimersByTime(150);
    expect(mockFn).toHaveBeenCalledTimes(1);
  });

  it("should pass arguments to the debounced function", () => {
    const mockFn = vi.fn();
    const debouncedFn = debounce(mockFn, 250);

    debouncedFn("test", 123, { key: "value" });
    vi.advanceTimersByTime(250);

    expect(mockFn).toHaveBeenCalledWith("test", 123, { key: "value" });
  });

  it("should use the last set of arguments when called multiple times", () => {
    const mockFn = vi.fn();
    const debouncedFn = debounce(mockFn, 250);

    debouncedFn(1);
    debouncedFn(2);
    debouncedFn(3);
    debouncedFn(4);
    debouncedFn(5);

    vi.advanceTimersByTime(250);

    // Should be called with the last argument (5)
    expect(mockFn).toHaveBeenCalledTimes(1);
    expect(mockFn).toHaveBeenCalledWith(5);
  });

  it("should allow multiple debounced calls after the wait period", () => {
    const mockFn = vi.fn();
    const debouncedFn = debounce(mockFn, 250);

    // First call
    debouncedFn("first");
    vi.advanceTimersByTime(250);
    expect(mockFn).toHaveBeenCalledTimes(1);
    expect(mockFn).toHaveBeenCalledWith("first");

    // Second call after wait period
    debouncedFn("second");
    vi.advanceTimersByTime(250);
    expect(mockFn).toHaveBeenCalledTimes(2);
    expect(mockFn).toHaveBeenCalledWith("second");
  });

  it("should handle default wait time when not specified", () => {
    const mockFn = vi.fn();
    const debouncedFn = debounce(mockFn); // Default 250ms

    debouncedFn();
    vi.advanceTimersByTime(249);
    expect(mockFn).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1);
    expect(mockFn).toHaveBeenCalledTimes(1);
  });

  it("should simulate slider drag scenario", () => {
    const mockUpdate = vi.fn();
    const debouncedUpdate = debounce(mockUpdate, 250);

    // Simulate continuous slider dragging (10 rapid changes)
    for (let i = 50; i <= 100; i += 5) {
      debouncedUpdate(i);
      vi.advanceTimersByTime(20); // 20ms between each change
    }

    // At this point, timer should be pending
    expect(mockUpdate).not.toHaveBeenCalled();

    // Wait for the debounce period after the last call
    vi.advanceTimersByTime(250);

    // Should be called exactly once with the final value
    expect(mockUpdate).toHaveBeenCalledTimes(1);
    expect(mockUpdate).toHaveBeenCalledWith(100);
  });

  it("should not interfere with multiple independent debounced functions", () => {
    const mockFn1 = vi.fn();
    const mockFn2 = vi.fn();
    const debouncedFn1 = debounce(mockFn1, 200);
    const debouncedFn2 = debounce(mockFn2, 300);

    debouncedFn1("fn1");
    debouncedFn2("fn2");

    // After 200ms, only fn1 should be called
    vi.advanceTimersByTime(200);
    expect(mockFn1).toHaveBeenCalledTimes(1);
    expect(mockFn2).not.toHaveBeenCalled();

    // After another 100ms (300ms total), fn2 should be called
    vi.advanceTimersByTime(100);
    expect(mockFn1).toHaveBeenCalledTimes(1);
    expect(mockFn2).toHaveBeenCalledTimes(1);
  });
});
