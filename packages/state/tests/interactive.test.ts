import { describe, expect, it } from "vitest";
import { registerInteractiveHitTester, getInteractiveHitTester } from "../src/interactive.js";

describe("interactive hit-tester registry", () => {
  it("getInteractiveHitTester returns undefined for an unregistered type", () => {
    expect(getInteractiveHitTester("__never_registered__")).toBeUndefined();
  });

  it("registers a tester and retrieves it by type", () => {
    const fn = () => null;
    registerInteractiveHitTester("test-shape", fn);
    expect(getInteractiveHitTester("test-shape")).toBe(fn);
  });

  it("overwrites an existing registration with the same type", () => {
    const first = () => null;
    const second = () => null;
    registerInteractiveHitTester("overwrite-shape", first);
    registerInteractiveHitTester("overwrite-shape", second);
    expect(getInteractiveHitTester("overwrite-shape")).toBe(second);
  });

  it("different types are stored independently", () => {
    const fnA = () => null;
    const fnB = () => null;
    registerInteractiveHitTester("type-a", fnA);
    registerInteractiveHitTester("type-b", fnB);
    expect(getInteractiveHitTester("type-a")).toBe(fnA);
    expect(getInteractiveHitTester("type-b")).toBe(fnB);
  });

  it("the tester is callable and forwards its arguments", () => {
    const result = { kind: "interaction" as const, type: "custom" as const };
    const fn = () => result;
    registerInteractiveHitTester(
      "callable-shape",
      fn as unknown as Parameters<typeof registerInteractiveHitTester>[1],
    );
    const retrieved = getInteractiveHitTester("callable-shape")!;
    expect(retrieved({} as never, { x: 0, y: 0 })).toBe(result);
  });
});
