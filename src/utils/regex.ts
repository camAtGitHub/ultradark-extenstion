// src/utils/regex.ts
export function compileRegexList(patterns: string[]): RegExp[] {
  const out: RegExp[] = [];
  for (const p of patterns) {
    if (!p || !p.trim()) continue;
    try {
      // Allow naked strings or /expr/flags
      const m = p.match(/^\/(.+)\/([gimsuy]*)$/);
      out.push(m ? new RegExp(m[1], m[2]) : new RegExp(p));
    } catch {
      // ignore invalid patterns
    }
  }
  return out;
}

export function urlExcluded(url: string, patterns: string[]) {
  const list = compileRegexList(patterns);
  const str = url;
  return list.some((re) => re.test(str));
}
