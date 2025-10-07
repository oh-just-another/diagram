import { afterEach, describe, expect, it, vi } from "vitest";
import {
  getShapeRenderer,
  hasShapeRenderer,
  registerElementRenderer,
  type ElementRenderer,
} from "../src/index";

describe("shape-renderer registry", () => {
  afterEach(() => {
    // Each test uses a unique type so registrations don't collide.
  });

  it("registers and retrieves a renderer", () => {
    const r = vi.fn<ElementRenderer>();
    expect(hasShapeRenderer("custom-1")).toBe(false);
    registerElementRenderer("custom-1", r);
    expect(hasShapeRenderer("custom-1")).toBe(true);
    expect(getShapeRenderer("custom-1")).toBe(r);
  });

  it("returns undefined for unknown type", () => {
    expect(getShapeRenderer("definitely-not-registered")).toBeUndefined();
  });

  it("re-registration replaces the previous renderer", () => {
    const a = vi.fn<ElementRenderer>();
    const b = vi.fn<ElementRenderer>();
    registerElementRenderer("custom-replace", a);
    registerElementRenderer("custom-replace", b);
    expect(getShapeRenderer("custom-replace")).toBe(b);
  });
});
