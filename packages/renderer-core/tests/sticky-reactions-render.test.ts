/**
 * Sticky reaction pills: canvas-side geometry (`stickyReactionPillRects`),
 * the drawSticky render pass, and the export content switches
 * (`RenderSceneOptions.content`) that gate reactions / tags / author.
 */

import { describe, expect, it, beforeAll } from "vitest";
import { elementId } from "@oh-just-another/types";
import {
  addElement,
  emptyScene,
  DEFAULT_LAYER_ID,
  orderBetween,
  type Element,
  type StickyElement,
} from "@oh-just-another/scene";
import {
  installBuiltinRenderers,
  renderScene,
  stickyReactionPillRects,
  stickyReactionAddRect,
  stickyReactionChromeVisible,
  STICKY_REACTION_GAP,
  STICKY_REACTION_HEIGHT,
  EXPORT_CONTENT_DEFAULTS,
  type RenderTarget,
  type RenderSceneOptions,
} from "../src/index";

beforeAll(() => {
  installBuiltinRenderers();
});

const makeRecorder = (): {
  target: RenderTarget;
  calls: { method: string; args: readonly unknown[] }[];
} => {
  const calls: { method: string; args: readonly unknown[] }[] = [];
  const handler: ProxyHandler<object> = {
    get: (_t, prop: string) => {
      if (prop === "size") return { width: 1000, height: 1000 };
      if (prop === "then") return undefined;
      return (...args: unknown[]) => {
        calls.push({ method: prop, args });
        if (prop === "measureText")
          return { width: typeof args[0] === "string" ? args[0].length * 7 : 0 };
        return undefined;
      };
    },
  };
  return { target: new Proxy({}, handler) as unknown as RenderTarget, calls };
};

const sticky = (overrides?: Partial<StickyElement>): StickyElement => ({
  id: elementId("s1"),
  layerId: DEFAULT_LAYER_ID,
  position: { x: 0, y: 0 },
  rotation: 0,
  scale: { x: 1, y: 1 },
  order: orderBetween(null, null),
  style: {},
  type: "sticky",
  width: 160,
  height: 160,
  ...overrides,
});

const render = (el: Element, options?: RenderSceneOptions, zoom = 1) => {
  const { target, calls } = makeRecorder();
  let scene = emptyScene();
  ({ scene } = addElement(scene, el));
  scene = { ...scene, viewport: { ...scene.viewport, zoom } };
  renderScene(scene, target, options);
  return calls;
};

const measure = (s: string) => s.length * 7;

describe("stickyReactionPillRects", () => {
  it("returns no rects without reactions", () => {
    expect(stickyReactionPillRects(sticky(), measure)).toEqual([]);
  });

  it("lays pills left-to-right under the bottom edge", () => {
    const shape = sticky({
      reactions: [
        { glyph: "👍", users: ["a", "b"] },
        { glyph: "🔥", users: ["a"] },
      ],
    });
    const pills = stickyReactionPillRects(shape, measure);
    expect(pills).toHaveLength(2);
    const [first, second] = pills;
    expect(first?.label).toBe("👍 2");
    expect(second?.label).toBe("🔥 1");
    expect(first?.y).toBe(shape.height + STICKY_REACTION_GAP);
    expect(first?.height).toBe(STICKY_REACTION_HEIGHT);
    expect(second?.x).toBe((first?.x ?? 0) + (first?.width ?? 0) + STICKY_REACTION_GAP);
  });

  it("counts legacy {glyph, count} entries without users", () => {
    const shape = sticky({
      reactions: [{ glyph: "👍", count: 3 } as unknown as { glyph: string; users: string[] }],
    });
    expect(stickyReactionPillRects(shape, measure)[0]?.label).toBe("👍 3");
  });

  it("wraps pills onto new rows instead of dropping them", () => {
    const shape = sticky({
      width: 60,
      reactions: [
        { glyph: "👍", users: ["a"] },
        { glyph: "🔥", users: ["a"] },
        { glyph: "🎉", users: ["a"] },
      ],
    });
    const pills = stickyReactionPillRects(shape, measure);
    expect(pills).toHaveLength(3);
    const rows = new Set(pills.map((p) => p.y));
    expect(rows.size).toBeGreaterThan(1);
    // Wrapped pills restart at the row origin.
    expect(pills[1]?.x ?? NaN).toBe(pills[0]?.x ?? NaN);
  });

  it("keeps a constant on-screen size: local rects shrink as zoom grows", () => {
    const shape = sticky({ reactions: [{ glyph: "👍", users: ["a"] }] });
    const at1 = stickyReactionPillRects(shape, measure, 1)[0];
    const at4 = stickyReactionPillRects(shape, measure, 4)[0];
    expect((at4?.width ?? NaN) * 4).toBeCloseTo(at1?.width ?? NaN);
    expect((at4?.height ?? NaN) * 4).toBeCloseTo(at1?.height ?? NaN);
    // Below the visibility threshold (80 px / 160 side = zoom 0.5) the
    // world size stops growing.
    const at01 = stickyReactionPillRects(shape, measure, 0.1)[0];
    const atMin = stickyReactionPillRects(shape, measure, 0.5)[0];
    expect(at01?.height).toBe(atMin?.height);
    // The clamp follows the card: a 320 px note keeps growing pills down to 0.25.
    const big = sticky({ width: 320, height: 320, reactions: [{ glyph: "👍", users: ["a"] }] });
    const big03 = stickyReactionPillRects(big, measure, 0.3)[0];
    const big05 = stickyReactionPillRects(big, measure, 0.5)[0];
    expect((big03?.height ?? NaN) * 0.3).toBeCloseTo((big05?.height ?? NaN) * 0.5);
  });

  it("chrome visibility is a screen-size gate, not a zoom gate", () => {
    const small = sticky({ width: 160, height: 160 });
    expect(stickyReactionChromeVisible(small, 0.5)).toBe(true);
    expect(stickyReactionChromeVisible(small, 0.4)).toBe(false);
    expect(stickyReactionChromeVisible(sticky({ width: 400, height: 400 }), 0.4)).toBe(true);
    expect(stickyReactionChromeVisible(sticky({ width: 60, height: 60 }), 1)).toBe(false);
  });
});

describe("drawSticky content switches", () => {
  const shape = sticky({
    reactions: [{ glyph: "👍", users: ["a"] }],
    tags: ["todo"],
    showAuthor: true,
    authorName: "Alice",
  });
  const textDrawn = (calls: { method: string; args: readonly unknown[] }[], text: string) =>
    calls.some((c) => c.method === "fillText" && String(c.args[0]).includes(text));

  it("draws reactions, tags and author by default (interactive render)", () => {
    const calls = render(shape);
    expect(textDrawn(calls, "👍 1")).toBe(true);
    expect(textDrawn(calls, "todo")).toBe(true);
    expect(textDrawn(calls, "Alice")).toBe(true);
  });

  it("draws everything under EXPORT_CONTENT_DEFAULTS", () => {
    const calls = render(shape, { content: { ...EXPORT_CONTENT_DEFAULTS } });
    expect(textDrawn(calls, "👍 1")).toBe(true);
    expect(textDrawn(calls, "todo")).toBe(true);
    expect(textDrawn(calls, "Alice")).toBe(true);
  });

  it("places the add button after the last pill", () => {
    const pills = stickyReactionPillRects(shape, measure);
    const last = pills[pills.length - 1];
    const add = stickyReactionAddRect(shape, measure);
    expect(add.x).toBe((last?.x ?? 0) + (last?.width ?? 0) + STICKY_REACTION_GAP);
    expect(add.y).toBe(shape.height + STICKY_REACTION_GAP);
    expect(add.width).toBe(STICKY_REACTION_HEIGHT);
  });

  it("draws the add button only for the hovered sticky, never in exports", () => {
    // The "+" cross bars are the only rect() calls in drawSticky (all
    // other geometry goes through rounded-rect paths).
    const crossBars = (calls: { method: string }[]) =>
      calls.filter((c) => c.method === "rect").length;
    expect(crossBars(render(shape, { hoveredElement: shape.id }))).toBe(2);
    expect(crossBars(render(shape))).toBe(0);
    expect(
      crossBars(
        render(shape, { hoveredElement: shape.id, content: { ...EXPORT_CONTENT_DEFAULTS } }),
      ),
    ).toBe(0);
    expect(
      crossBars(render(shape, { hoveredElement: shape.id, content: { stickyAddButton: false } })),
    ).toBe(0);
  });

  it("draws pill text at the BASE font size under a scale transform (zoom-stable cache key)", () => {
    const calls = render(shape, undefined, 2);
    // Every setFont stays at an integer base size — a fractional
    // per-zoom size would defeat the backend string-bitmap cache.
    const pillFonts = calls.filter(
      (c) => c.method === "setFont" && (c.args[0] as string).startsWith("system-ui"),
    );
    expect(pillFonts.length).toBeGreaterThan(0);
    for (const c of pillFonts) expect(Number.isInteger(c.args[1] as number)).toBe(true);
    // The zoom compensation happens via scale(k, k) instead.
    expect(calls.some((c) => c.method === "scale" && c.args[0] === 0.5)).toBe(true);
  });

  it("hides all reaction chrome once the card is under the screen-size threshold", () => {
    const calls = render(shape, { hoveredElement: shape.id }, 0.4);
    expect(textDrawn(calls, "👍 1")).toBe(false);
    expect(calls.filter((c) => c.method === "rect").length).toBe(0);
    // Same zoom, a note twice the size: still above the threshold → drawn.
    const big = render(
      sticky({ ...shape, width: 320, height: 320 }),
      { hoveredElement: shape.id },
      0.4,
    );
    expect(textDrawn(big, "👍 1")).toBe(true);
  });

  it("suppresses each meta layer via its content flag", () => {
    const calls = render(shape, {
      content: { stickyReactions: false, stickyTags: false, stickyAuthor: false },
    });
    expect(textDrawn(calls, "👍 1")).toBe(false);
    expect(textDrawn(calls, "todo")).toBe(false);
    expect(textDrawn(calls, "Alice")).toBe(false);
  });
});
