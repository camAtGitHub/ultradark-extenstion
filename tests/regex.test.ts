// tests/regex.test.ts
import { describe, it, expect } from "vitest";
import { compileRegexList, urlExcluded } from "../src/utils/regex";

describe("regex", () => {
  it("compiles plain and /expr/flags", () => {
    const res = compileRegexList(["example.com", "/^.*\\.news\\.site$/i", ""]);
    expect(res.length).toBe(2);
  });

  it("matches urls", () => {
    const pats = ["example.com", "/^.*\\.news\\.site$/i"];
    expect(urlExcluded("https://blog.example.com", pats)).toBe(true);
    expect(urlExcluded("https://world.NEWS.site", pats)).toBe(true);
    expect(urlExcluded("https://ok.test", pats)).toBe(false);
  });
});
