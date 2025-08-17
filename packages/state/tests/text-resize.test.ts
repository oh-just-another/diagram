import { describe, expect, it } from "vitest";
import { shapeId } from "@oh-just-another/types";
import {
  addShape,
  DEFAULT_LAYER_ID,
  emptyScene,
  getShapeWorldBounds,
  orderBetween,
  type TextShape,
} from "@oh-just-another/scene";
import { computeTextResize } from "../src/editor/applies/resize.js";

const text = (over: Partial<TextShape> = {}): TextShape => ({
  id: shapeId("t1"),
  layerId: DEFAULT_LAYER_ID,
  type: "text",
  position: { x: 0, y: 0 },
  rotation: 0,
  scale: { x: 1, y: 1 },
  order: orderBetween(null, null),
  style: {},
  text: "AB",
  fontFamily: "Arial",
  fontSize: 20,
  ...over,
});

const sceneWith = (shape: TextShape) => addShape(emptyScene(), shape).scene;

describe("computeTextResize (aspect-locked)", () => {
  it("corner drag scales fontSize proportionally", () => {
    const t = text();
    const scene = sceneWith(t);
    const b = getShapeWorldBounds(t); // height = 1 line * 20 * 1.2 = 24
    // Drag SE corner out by one full box → 2× scale.
    const r = computeTextResize(scene, t, "se", { x: b.width, y: b.height }, b);
    expect(r).not.toBeNull();
    const after = (r!.patch as { after: TextShape }).after;
    expect(after.fontSize).toBe(40);
    // SE anchor keeps the top-left corner fixed.
    expect(after.position).toEqual({ x: 0, y: 0 });
  });

  it("NW corner drag keeps the opposite (SE) corner fixed", () => {
    const t = text();
    const scene = sceneWith(t);
    const b = getShapeWorldBounds(t);
    const r = computeTextResize(scene, t, "nw", { x: -b.width, y: -b.height }, b);
    const after = (r!.patch as { after: TextShape }).after;
    expect(after.fontSize).toBe(40);
    // SE corner (b.width, b.height) stays put → new TL is shifted by -box.
    expect(after.position.x).toBeCloseTo(b.x + b.width - b.width * 2);
    expect(after.position.y).toBeCloseTo(b.y + b.height - b.height * 2);
  });

  it("scales maxWidth alongside fontSize when set", () => {
    const t = text({ maxWidth: 100 });
    const scene = sceneWith(t);
    const b = getShapeWorldBounds(t);
    const r = computeTextResize(scene, t, "se", { x: b.width, y: b.height }, b);
    const after = (r!.patch as { after: TextShape }).after;
    expect(after.fontSize).toBe(40);
    expect(after.maxWidth).toBeCloseTo(200);
  });

  it("top/bottom edge drag scales fontSize (no arbitrary height)", () => {
    const t = text();
    const scene = sceneWith(t);
    const b = getShapeWorldBounds(t);
    // Drag bottom edge down by one box height → 2× scale.
    const r = computeTextResize(scene, t, "s", { x: 0, y: b.height }, b);
    const after = (r!.patch as { after: TextShape }).after;
    expect(after.fontSize).toBe(40);
    expect(after.maxWidth).toBeUndefined();
  });

  it("left/right edge drag changes wrap width only (no font scale)", () => {
    const t = text();
    const scene = sceneWith(t);
    const b = getShapeWorldBounds(t);
    // Drag right edge inward → narrower wrap width, font unchanged.
    const r = computeTextResize(scene, t, "e", { x: -b.width / 2, y: 0 }, b);
    const after = (r!.patch as { after: TextShape }).after;
    expect(after.fontSize).toBe(20); // unchanged
    expect(after.maxWidth).toBeGreaterThan(0);
    expect(after.maxWidth).toBeLessThan(b.width);
  });

  it("clamps fontSize to the minimum on extreme shrink", () => {
    const t = text();
    const scene = sceneWith(t);
    const b = getShapeWorldBounds(t);
    // Drag far past the anchor → tiny / negative box; font clamps, not crashes.
    const r = computeTextResize(scene, t, "se", { x: -b.width * 0.99, y: -b.height * 0.99 }, b);
    const after = (r!.patch as { after: TextShape }).after;
    expect(after.fontSize).toBeGreaterThanOrEqual(4);
  });
});
