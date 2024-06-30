import { describe, expect, expectTypeOf, it } from "vitest";
import {
  shapeId,
  type Bounds,
  type Color,
  type KeyboardEventData,
  type Modifiers,
  type PointerEventData,
  type ShapeId,
  type Transform,
  type Vec2,
  type WheelEventData,
} from "../src/index.js";

describe("shapeId", () => {
  it("preserves the underlying string", () => {
    const id = shapeId("shape-1");
    expect(id).toBe("shape-1");
  });

  it("produces a ShapeId-branded type", () => {
    const id = shapeId("x");
    expectTypeOf(id).toEqualTypeOf<ShapeId>();
    // Raw strings must not be assignable to ShapeId without the helper.
    expectTypeOf<string>().not.toEqualTypeOf<ShapeId>();
  });
});

describe("type shapes", () => {
  it("Vec2 is { x, y }", () => {
    const v: Vec2 = { x: 1, y: 2 };
    expect(v.x + v.y).toBe(3);
  });

  it("Bounds is { x, y, width, height }", () => {
    const b: Bounds = { x: 0, y: 0, width: 10, height: 20 };
    expect(b.width * b.height).toBe(200);
  });

  it("Transform is 6-component affine matrix", () => {
    const t: Transform = { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 };
    expect(t.a).toBe(1);
  });

  it("Color is a string", () => {
    const c: Color = "#ff0000";
    expectTypeOf(c).toEqualTypeOf<string>();
  });

  it("Modifiers has 4 boolean keys", () => {
    const m: Modifiers = { shift: false, ctrl: false, alt: false, meta: false };
    expect(Object.keys(m)).toHaveLength(4);
  });

  it("event types compose with Vec2 and Modifiers", () => {
    const pointer: PointerEventData = {
      kind: "mouse",
      phase: "down",
      point: { x: 10, y: 20 },
      buttons: 1,
      modifiers: { shift: false, ctrl: false, alt: false, meta: false },
      pointerId: 1,
      timestamp: 0,
    };
    expect(pointer.point.x).toBe(10);

    const kb: KeyboardEventData = {
      phase: "down",
      key: "Escape",
      code: "Escape",
      modifiers: { shift: false, ctrl: false, alt: false, meta: false },
      repeat: false,
      timestamp: 0,
    };
    expect(kb.key).toBe("Escape");

    const wheel: WheelEventData = {
      point: { x: 0, y: 0 },
      deltaX: 0,
      deltaY: -1,
      deltaZ: 0,
      modifiers: { shift: false, ctrl: false, alt: false, meta: false },
      timestamp: 0,
    };
    expect(wheel.deltaY).toBe(-1);
  });
});
