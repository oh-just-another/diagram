import { describe, expect, it } from "vitest";
import { stripUndefined } from "../src/object";

describe("stripUndefined", () => {
  it("removes keys whose value is undefined", () => {
    expect(stripUndefined({ a: 1, b: undefined, c: 3 })).toEqual({ a: 1, c: 3 });
  });

  it("keeps keys with null/0/empty-string/false values", () => {
    const input = { n: null, zero: 0, empty: "", flag: false };
    expect(stripUndefined(input)).toEqual(input);
  });

  it("drops every key when all values are undefined", () => {
    expect(stripUndefined({ a: undefined, b: undefined })).toEqual({});
  });

  it("handles an empty object", () => {
    expect(stripUndefined({})).toEqual({});
  });

  it("is shallow: nested objects with undefined fields are left untouched", () => {
    const nested = { x: undefined, y: 1 };
    const result = stripUndefined({ outer: nested, gone: undefined });
    expect(result).toEqual({ outer: { x: undefined, y: 1 } });
    expect("x" in (result as { outer: typeof nested }).outer).toBe(true);
    // same nested reference preserved (shallow copy)
    expect((result as { outer: typeof nested }).outer).toBe(nested);
  });

  it("returns a new object, not the original", () => {
    const input = { a: 1 };
    const result = stripUndefined(input);
    expect(result).not.toBe(input);
    expect(result).toEqual(input);
  });

  it("does not mutate the input", () => {
    const input = { a: 1, b: undefined };
    stripUndefined(input);
    expect(input).toEqual({ a: 1, b: undefined });
    expect("b" in input).toBe(true);
  });
});
