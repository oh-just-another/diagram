import { afterEach, describe, expect, it } from "vitest";
import { layerId, elementId } from "@oh-just-another/types";
import {
  getShapeLocalBounds,
  getShapeWorldBounds,
  isEllipse,
  isImage,
  isPath,
  isPolygon,
  isRectangle,
  isText,
  registerBounder,
  setTextMeasurer,
  type RectangleElement,
  type ElementBase,
} from "../src/index";
import { orderBetween } from "../src/index";

const baseProps = {
  layerId: layerId("L"),
  position: { x: 0, y: 0 },
  rotation: 0,
  scale: { x: 1, y: 1 },
  order: orderBetween(null, null),
  style: {},
};

const rect: RectangleElement = {
  ...baseProps,
  id: elementId("r"),
  type: "rectangle",
  width: 10,
  height: 20,
};

describe("shape", () => {
  describe("type guards", () => {
    it("isRectangle matches only rectangles", () => {
      expect(isRectangle(rect)).toBe(true);
      expect(isEllipse(rect)).toBe(false);
    });
    it("guards are mutually exclusive", () => {
      const guards = [isRectangle, isEllipse, isPolygon, isPath, isText, isImage];
      const matches = guards.filter((g) => g(rect));
      expect(matches).toHaveLength(1);
    });
  });

  describe("built-in bounders", () => {
    it("rectangle local bounds = (0, 0, w, h)", () => {
      expect(getShapeLocalBounds(rect)).toEqual({ x: 0, y: 0, width: 10, height: 20 });
    });
    it("translated rectangle world bounds = shifted local bounds", () => {
      const moved = { ...rect, position: { x: 5, y: 7 } };
      expect(getShapeWorldBounds(moved)).toEqual({ x: 5, y: 7, width: 10, height: 20 });
    });
    it("scaled rectangle world bounds", () => {
      const scaled = { ...rect, scale: { x: 2, y: 3 } };
      const b = getShapeWorldBounds(scaled);
      expect(b.width).toBeCloseTo(20, 5);
      expect(b.height).toBeCloseTo(60, 5);
    });
    it("rotated unit square has bounds √2 wide", () => {
      const sq: RectangleElement = { ...rect, width: 2, height: 2, position: { x: 0, y: 0 } };
      const rotated = {
        ...sq,
        position: { x: 0, y: 0 },
        rotation: Math.PI / 4,
        // shift so AABB center is the same
      };
      // Local AABB after rotation should be conservative √2 × √2 of the side,
      // since corner (0,0) stays at (0,0) and (2,2) rotates around origin.
      const b = getShapeWorldBounds(rotated);
      expect(b.width).toBeCloseTo(2 * Math.sqrt(2), 5);
      expect(b.height).toBeCloseTo(2 * Math.sqrt(2), 5);
    });
  });

  describe("registerBounder (plugin extensibility)", () => {
    it("unknown type throws, then works after registration", () => {
      const shape: ElementBase = { ...baseProps, id: elementId("custom"), type: "diamond" };
      expect(() => getShapeLocalBounds(shape)).toThrow(/no bounder/i);
      registerBounder("diamond", () => ({ x: 0, y: 0, width: 100, height: 50 }));
      expect(getShapeLocalBounds(shape)).toEqual({ x: 0, y: 0, width: 100, height: 50 });
    });
  });

  describe("text bounder + measurer opts (bold/italic width)", () => {
    afterEach(() => setTextMeasurer(null));

    it("bold text yields a wider box than regular via the measurer opts", () => {
      // Measurer: 10px/char, bold +50%. Mirrors how the editor injects a
      // renderer-backed measurer that honours weight/style.
      setTextMeasurer((text, _family, _size, opts) =>
        text.length * 10 * (opts?.bold ? 1.5 : 1),
      );
      const base = {
        ...baseProps,
        id: elementId("t"),
        type: "text" as const,
        text: "hello",
        fontFamily: "sans",
        fontSize: 16,
      };
      const regular = getShapeLocalBounds(base);
      const bold = getShapeLocalBounds({
        ...base,
        style: { fontWeight: "bold" } as unknown as ElementBase["style"],
      });
      expect(regular.width).toBeCloseTo(50);
      expect(bold.width).toBeCloseTo(75);
      expect(bold.width).toBeGreaterThan(regular.width);
    });
  });

  describe("built-in bounders for other shape types", () => {
    it("ellipse local bounds use w/h", () => {
      const e = { ...baseProps, id: elementId("e"), type: "ellipse" as const, width: 40, height: 20 };
      expect(getShapeLocalBounds(e)).toEqual({ x: 0, y: 0, width: 40, height: 20 });
    });
    it("polygon local bounds = AABB of points", () => {
      const p = {
        ...baseProps,
        id: elementId("p"),
        type: "polygon" as const,
        points: [
          { x: 0, y: 0 },
          { x: 10, y: 0 },
          { x: 5, y: 8 },
        ],
      };
      expect(getShapeLocalBounds(p)).toEqual({ x: 0, y: 0, width: 10, height: 8 });
    });
    it("path local bounds cover M/L/Q/C/Z commands", () => {
      const p = {
        ...baseProps,
        id: elementId("pa"),
        type: "path" as const,
        commands: [
          { kind: "M" as const, to: { x: 0, y: 0 } },
          { kind: "L" as const, to: { x: 10, y: 0 } },
          { kind: "Q" as const, control: { x: 15, y: 5 }, to: { x: 10, y: 10 } },
          {
            kind: "C" as const,
            control1: { x: 5, y: 12 },
            control2: { x: 0, y: 10 },
            to: { x: 0, y: 0 },
          },
          { kind: "Z" as const },
        ],
      };
      const b = getShapeLocalBounds(p);
      expect(b.x).toBe(0);
      expect(b.y).toBe(0);
      expect(b.width).toBe(15);
      expect(b.height).toBe(12);
    });
    it("text local bounds approximate from font size and length", () => {
      const t = {
        ...baseProps,
        id: elementId("t"),
        type: "text" as const,
        text: "hello",
        fontFamily: "sans-serif",
        fontSize: 10,
        style: {},
      };
      const b = getShapeLocalBounds(t);
      expect(b.width).toBeGreaterThan(0);
      expect(b.height).toBeGreaterThan(0);
    });
    it("text with maxWidth wraps into multiple line heights", () => {
      const t = {
        ...baseProps,
        id: elementId("t2"),
        type: "text" as const,
        text: "long text that wraps",
        fontFamily: "sans-serif",
        fontSize: 10,
        maxWidth: 30,
        style: {},
      };
      const b = getShapeLocalBounds(t);
      expect(b.width).toBe(30);
      expect(b.height).toBeGreaterThan(10);
    });
    it("image local bounds use w/h", () => {
      const i = {
        ...baseProps,
        id: elementId("i"),
        type: "image" as const,
        src: "data:,",
        width: 50,
        height: 30,
      };
      expect(getShapeLocalBounds(i)).toEqual({ x: 0, y: 0, width: 50, height: 30 });
    });
  });
});
