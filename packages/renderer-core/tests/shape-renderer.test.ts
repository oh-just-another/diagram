import { afterEach, describe, expect, it, vi } from "vitest";
import {
  getShapeRenderer,
  hasShapeRenderer,
  registerShapeRenderer,
  type ShapeRenderer,
} from "../src/index";

describe("shape-renderer registry", () => {
  afterEach(() => {
    // Each test uses a unique type so registrations don't collide.
  });

  it("registers and retrieves a renderer", () => {
    const r = vi.fn<ShapeRenderer>();
    expect(hasShapeRenderer("custom-1")).toBe(false);
    registerShapeRenderer("custom-1", r);
    expect(hasShapeRenderer("custom-1")).toBe(true);
    expect(getShapeRenderer("custom-1")).toBe(r);
  });

  it("returns undefined for unknown type", () => {
    expect(getShapeRenderer("definitely-not-registered")).toBeUndefined();
  });

  it("re-registration replaces the previous renderer", () => {
    const a = vi.fn<ShapeRenderer>();
    const b = vi.fn<ShapeRenderer>();
    registerShapeRenderer("custom-replace", a);
    registerShapeRenderer("custom-replace", b);
    expect(getShapeRenderer("custom-replace")).toBe(b);
  });
});
