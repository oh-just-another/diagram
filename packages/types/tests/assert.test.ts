import { describe, expect, it } from "vitest";
import { req } from "../src/assert";

describe("req", () => {
  it("returns the value when defined", () => {
    expect(req(42)).toBe(42);
    expect(req("hello")).toBe("hello");
  });

  it("passes through falsy values that are not undefined", () => {
    expect(req(0)).toBe(0);
    expect(req("")).toBe("");
    expect(req(false)).toBe(false);
    expect(req(Number.NaN)).toBeNaN();
  });

  it("passes through null (null is not undefined)", () => {
    expect(req(null)).toBeNull();
  });

  it("returns the same reference for objects", () => {
    const obj = { a: 1 };
    expect(req(obj)).toBe(obj);
    const arr = [1, 2, 3];
    expect(req(arr)).toBe(arr);
  });

  it("throws when the value is undefined", () => {
    expect(() => req(undefined)).toThrow("required value is undefined");
  });

  it("throws for a missing in-range lookup result", () => {
    const map = new Map<string, number>();
    expect(() => req(map.get("absent"))).toThrow();
  });
});
