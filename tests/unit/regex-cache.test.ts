// tests/unit/regex-cache.test.ts
import { describe, it, expect, beforeEach } from "vitest";
import { urlExcluded, compileRegexList, clearRegexCache } from "../../src/utils/regex";

/**
 * OPTIMIZATION 2: Cache Compiled Regex Patterns
 *
 * Tests that verify regex compilation is cached and reused
 */
describe("Regex Caching (Opt-2)", () => {
  beforeEach(() => {
    // Clear cache before each test
    clearRegexCache();
  });

  it("should cache compiled regex patterns", () => {
    const patterns = ["example.com", "/^.*\\.news\\.site$/i"];

    // First call - should compile
    const result1 = compileRegexList(patterns);

    // Second call with same patterns - should return cached
    const result2 = compileRegexList(patterns);

    // Should return the exact same array reference (cached)
    expect(result1).toBe(result2);
  });

  it("should return different results for different pattern arrays", () => {
    const patterns1 = ["example.com"];
    const patterns2 = ["different.com"];

    const result1 = compileRegexList(patterns1);
    const result2 = compileRegexList(patterns2);

    // Should be different objects
    expect(result1).not.toBe(result2);
    expect(result1.length).toBe(1);
    expect(result2.length).toBe(1);
  });

  it("should handle cache correctly in urlExcluded", () => {
    const patterns = ["example.com", "/test$/"];

    // First check - compiles and caches
    const excluded1 = urlExcluded("https://example.com/page", patterns);

    // Second check - uses cached compilation
    const excluded2 = urlExcluded("https://example.com/test", patterns);

    expect(excluded1).toBe(true);
    expect(excluded2).toBe(true);
  });

  it("should correctly match URLs with cached regex", () => {
    const patterns = ["github.com", "/stackoverflow\\.com$/i"];

    // Multiple calls should all work correctly with cache
    expect(urlExcluded("https://github.com/user/repo", patterns)).toBe(true);
    expect(urlExcluded("https://stackoverflow.com", patterns)).toBe(true);
    expect(urlExcluded("https://example.com", patterns)).toBe(false);

    // Call again - should use cache
    expect(urlExcluded("https://github.com/another", patterns)).toBe(true);
  });

  it("should handle empty patterns array", () => {
    const patterns: string[] = [];

    const result1 = compileRegexList(patterns);
    const result2 = compileRegexList(patterns);

    expect(result1).toEqual([]);
    expect(result2).toEqual([]);
    expect(result1).toBe(result2); // Cached
  });

  it("should handle patterns with empty strings", () => {
    const patterns = ["", "example.com", "", "/test/"];

    const result = compileRegexList(patterns);

    // Should skip empty strings
    expect(result.length).toBe(2);
  });

  it("should cache patterns with different orderings separately", () => {
    const patterns1 = ["a.com", "b.com"];
    const patterns2 = ["b.com", "a.com"];

    const result1 = compileRegexList(patterns1);
    const result2 = compileRegexList(patterns2);

    // Different order = different cache key
    expect(result1).not.toBe(result2);
  });

  it("should clear cache when clearRegexCache is called", () => {
    const patterns = ["example.com"];

    const result1 = compileRegexList(patterns);

    clearRegexCache();

    const result2 = compileRegexList(patterns);

    // After clear, should be different object (recompiled)
    expect(result1).not.toBe(result2);
    // But should have same content
    expect(result1.length).toBe(result2.length);
  });

  it("should handle cache size limit gracefully", () => {
    // Create 101 different pattern sets to exceed limit (100)
    const results: RegExp[][] = [];

    for (let i = 0; i < 101; i++) {
      const patterns = [`pattern${i}.com`];
      results.push(compileRegexList(patterns));
    }

    // Should not crash and should still work
    expect(results[100].length).toBe(1);

    // First pattern might be evicted from cache
    const recompiled = compileRegexList(["pattern0.com"]);
    // Can't guarantee it's evicted, but should still work correctly
    expect(recompiled.length).toBe(1);
  });

  it("should handle invalid regex patterns without caching errors", () => {
    const patterns = ["valid.com", "/(invalid/"]; // Invalid regex

    // Should skip invalid pattern
    const result1 = compileRegexList(patterns);
    expect(result1.length).toBe(1);

    // Should cache successfully despite invalid pattern
    const result2 = compileRegexList(patterns);
    expect(result1).toBe(result2);
  });

  it("should use null separator for cache key to avoid collisions", () => {
    // These should be different patterns
    const patterns1 = ["a", "b.com"];
    const patterns2 = ["ab", ".com"];

    const result1 = compileRegexList(patterns1);
    const result2 = compileRegexList(patterns2);

    // Should be cached separately (different results)
    expect(result1).not.toBe(result2);
  });

  it("should maintain performance with repeated calls", () => {
    const patterns = ["example.com", "/test$/", "/^https:\\/\\/github\\.com/"];

    // First call to warm cache
    compileRegexList(patterns);

    const startTime = Date.now();

    // 100 cached calls should be very fast
    for (let i = 0; i < 100; i++) {
      compileRegexList(patterns);
    }

    const duration = Date.now() - startTime;

    // Should complete in reasonable time (much faster than recompiling)
    // This is a soft check - main goal is no errors
    expect(duration).toBeLessThan(100); // 100 cached lookups should take < 100ms
  });
});
