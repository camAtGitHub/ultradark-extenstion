// File: src/utils/regex.ts

/**
 * OPTIMIZATION 2: Cached Regex Compilation
 *
 * Memoization cache to avoid recompiling regex patterns on every URL check.
 * Cache is limited to 100 entries to prevent memory leaks.
 */

// Memoization cache with string key (array joined with null separator)
const regexCache = new Map<string, RegExp[]>();

function getCompiledRegexList(patterns: string[]): RegExp[] {
  // Create cache key from patterns (fast string join)
  const cacheKey = patterns.join("\x00"); // Null separator unlikely in patterns

  const cached = regexCache.get(cacheKey);
  if (cached) return cached;

  // Compile and cache
  const compiled: RegExp[] = [];
  for (const p of patterns) {
    if (!p || !p.trim()) continue;
    try {
      // Allow naked strings or /expr/flags
      const m = p.match(/^\/(.+)\/([gimsuy]*)$/);
      compiled.push(m ? new RegExp(m[1], m[2]) : new RegExp(p));
    } catch {
      // ignore invalid patterns
    }
  }

  // Limit cache size to prevent memory leaks (LRU-like eviction)
  if (regexCache.size >= 100) {
    const firstKey = regexCache.keys().next().value;
    regexCache.delete(firstKey);
  }

  regexCache.set(cacheKey, compiled);
  return compiled;
}

export function compileRegexList(patterns: string[]): RegExp[] {
  // Maintain backward compatibility - just return compiled list
  return getCompiledRegexList(patterns);
}

export function urlExcluded(url: string, patterns: string[]) {
  const list = getCompiledRegexList(patterns); // Now cached
  const str = url;
  return list.some((re) => re.test(str));
}

// Export for settings changes to invalidate cache
export function clearRegexCache(): void {
  regexCache.clear();
}
