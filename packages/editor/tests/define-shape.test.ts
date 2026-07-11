import { describe, expect, it } from "vitest";

import {
  DEFAULT_LAYER_ID,
  getBounder,
  getElementLocalBounds,
  orderBetween,
  type ElementBase,
} from "@oh-just-another/scene";
import { getElementRenderer, type RenderTarget } from "@oh-just-another/renderer-core";
import {
  getInteractiveHitTester,
  getRotateAnchor,
  type InteractionEmit,
} from "@oh-just-another/state";
import { elementId } from "@oh-just-another/types";

import { defineShape } from "../src/define-shape";

interface StickerElement extends ElementBase {
  readonly type: `test-sticker-${string}`;
  readonly size: number;
}

let seq = 0;
const uniqueType = (): `test-sticker-${string}` => `test-sticker-${String(seq++)}`;

const makeSticker = (type: StickerElement["type"], size = 40): StickerElement => ({
  id: elementId("s1"),
  layerId: DEFAULT_LAYER_ID,
  type,
  position: { x: 10, y: 20 },
  rotation: 0,
  scale: { x: 1, y: 1 },
  order: orderBetween(null, null),
  style: {},
  size,
});

describe("defineShape", () => {
  it("registers a bounder usable by getElementLocalBounds", () => {
    const type = uniqueType();
    defineShape<StickerElement>({
      type,
      bounds: (s) => ({ x: 0, y: 0, width: s.size, height: s.size }),
      render: () => undefined,
    });

    expect(getBounder(type)).toBeDefined();
    expect(getElementLocalBounds(makeSticker(type, 64))).toEqual({
      x: 0,
      y: 0,
      width: 64,
      height: 64,
    });
  });

  it("registers a renderer that receives the shape and target", () => {
    const type = uniqueType();
    const calls: string[] = [];
    defineShape<StickerElement>({
      type,
      bounds: (s) => ({ x: 0, y: 0, width: s.size, height: s.size }),
      render: (s, target) => {
        calls.push(s.type);
        target.beginPath();
      },
    });

    const renderer = getElementRenderer(type);
    expect(renderer).toBeDefined();

    let beginPathCalls = 0;
    const target = { beginPath: () => beginPathCalls++ } as unknown as RenderTarget;
    renderer?.(makeSticker(type), target);
    expect(calls).toEqual([type]);
    expect(beginPathCalls).toBe(1);
  });

  it("skips optional registries when the spec omits them", () => {
    const type = uniqueType();
    const defaultAnchor = getRotateAnchor("no-such-type");
    defineShape<StickerElement>({
      type,
      bounds: (s) => ({ x: 0, y: 0, width: s.size, height: s.size }),
      render: () => undefined,
    });

    expect(getInteractiveHitTester(type)).toBeUndefined();
    expect(getRotateAnchor(type)).toEqual(defaultAnchor);
  });

  it("registers optional interactive hit-tester and rotate anchor", () => {
    const type = uniqueType();
    const emit: InteractionEmit = { type: "SELECT_REPLACE", id: elementId("s1") };
    defineShape<StickerElement>({
      type,
      bounds: (s) => ({ x: 0, y: 0, width: s.size, height: s.size }),
      render: () => undefined,
      interactiveHitTest: () => emit,
      rotateAnchor: { kind: "ratio", position: { x: 0.5, y: 0 } },
    });

    expect(getInteractiveHitTester(type)?.(makeSticker(type), { x: 1, y: 1 })).toBe(emit);
    expect(getRotateAnchor(type)).toEqual({ kind: "ratio", position: { x: 0.5, y: 0 } });
  });

  it("returns a dispose handle (no-op while registries are append-only)", () => {
    const type = uniqueType();
    const registration = defineShape<StickerElement>({
      type,
      bounds: (s) => ({ x: 0, y: 0, width: s.size, height: s.size }),
      render: () => undefined,
    });

    expect(() => {
      registration.dispose();
    }).not.toThrow();
    // Registries have no unregister yet — the shape stays registered.
    expect(getBounder(type)).toBeDefined();
  });
});
