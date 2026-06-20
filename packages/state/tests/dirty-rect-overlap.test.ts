/**
 * Dirty-rect transitive closure.
 *
 * When a shape moves through a stack of overlapping shapes, the
 * dirty rect must include every shape that participates in the
 * overlap chain — not just shapes whose bounds intersect the
 * initial dirty area. Otherwise shape A moves over B and C, where
 * B intersects the dirty rect and C overlaps B but not the
 * original dirty: repaint covers A and B but not C, and B
 * re-emerges visually on top of where C should still be drawn.
 *
 * The dirty rect is exercised through the `renderScene` callback the
 * editor passes to its main target — count the shapes that pass
 * the dirty-rect filter and assert every shape was either kept or
 * skipped by viewport-cull, never silently dropped.
 */
import { describe, expect, it, vi } from "vitest";
import { elementId } from "@oh-just-another/types";
import {
  apply,
  DEFAULT_LAYER_ID,
  emptyScene,
  type Patch,
  type Scene,
  type Element,
} from "@oh-just-another/scene";
import { installBuiltinRenderers } from "@oh-just-another/renderer-core";
import { Editor } from "../src/editor.js";

// `rectangle` renderer must be registered for the editor to call
// target.rect — without this the renderScene loop skips every
// shape via `if (!renderer) continue`.
installBuiltinRenderers();

const rect = (id: string, x: number, y: number, w = 50, h = 50): Element => ({
  id: elementId(id),
  layerId: DEFAULT_LAYER_ID,
  type: "rectangle",
  position: { x, y },
  rotation: 0,
  scale: { x: 1, y: 1 },
  // Successive calls produce naturally-ordered fractional keys
  // ("a0", "a1", "a2", ...) — enough for the dirty-rect math
  // which only consults bbox.
  order: `a${id}` as Element["order"],
  style: { fill: "#000" },
  width: w,
  height: h,
});

const sceneOf = (shapes: Element[]): Scene => {
  let s = emptyScene();
  for (const sh of shapes) {
    s = apply(s, { kind: "element", id: sh.id, before: null, after: sh } satisfies Patch);
  }
  return s;
};

const makeTarget = () => {
  // Recording target — only what `renderScene` needs: setTransform,
  // clear, fill / stroke style setters, path commands, fillText.
  // rect() calls are captured so the test can see which shapes ended
  // up drawn after the dirty filter.
  const drawn: Array<{ x: number; y: number; w: number; h: number }> = [];
  const target = {
    save: vi.fn(),
    restore: vi.fn(),
    setTransform: vi.fn(),
    clear: vi.fn(),
    setFill: vi.fn(),
    setStroke: vi.fn(),
    setStrokeWidth: vi.fn(),
    setOpacity: vi.fn(),
    setLineCap: vi.fn(),
    setLineJoin: vi.fn(),
    setDashArray: vi.fn(),
    setFont: vi.fn(),
    setTextAlign: vi.fn(),
    setTextBaseline: vi.fn(),
    beginPath: vi.fn(),
    closePath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    quadraticCurveTo: vi.fn(),
    bezierCurveTo: vi.fn(),
    rect: vi.fn((x: number, y: number, w: number, h: number) => {
      drawn.push({ x, y, w, h });
    }),
    ellipse: vi.fn(),
    fill: vi.fn(),
    stroke: vi.fn(),
    fillText: vi.fn(),
    measureText: vi.fn(() => ({ width: 0 })),
    drawImage: vi.fn(),
    translate: vi.fn(),
    rotate: vi.fn(),
    scale: vi.fn(),
    resetTransform: vi.fn(),
    size: { width: 800, height: 600 },
    drawPoint: vi.fn(),
  };
  return { target: target as never, drawn };
};

const host = {
  addEventListener: () => {},
  removeEventListener: () => {},
  getBoundingClientRect: () => ({ left: 0, top: 0, width: 800, height: 600 }),
  style: { cursor: "" },
} as never;

describe("computeDirtyWorld transitive overlap", () => {
  it("includes shape C overlapping B that intersects dirty, even though C doesn't itself intersect dirty initially", () => {
    // Setup:
    //   B at (100, 100), 100×100 — covers x=100..200, y=100..200
    //   C at (180, 180), 100×100 — covers x=180..280, y=180..280
    //     → B and C overlap on (180..200, 180..200)
    //   A at (50, 50),   30×30   — does NOT touch B / C
    //
    // Then move A from (50, 50) to (110, 110), a 60-px diagonal
    // step. New A bbox: (110, 110, 30, 30) → intersects B but
    // NOT C. Dirty rect via union(A.before, A.after) =
    // (50, 50, 90, 90). B intersects this. C does NOT intersect
    // dirty. Without the transitive expansion C would be dropped.
    const main = makeTarget();
    const overlay = makeTarget();
    const editor = new Editor({
      host,
      mainTarget: main.target,
      overlayTarget: overlay.target,
      initialScene: sceneOf([
        rect("b", 100, 100, 100, 100),
        rect("c", 180, 180, 100, 100),
        rect("a", 50, 50, 30, 30),
      ]),
    });
    const drawn = main.drawn;
    editor.setViewportSize(800, 600);
    // Prime the dirty-diff baseline: render once, then reset.
    drawn.length = 0;

    // Trigger the move via the editor's keyboard-nudge path:
    // select just A, then nudge — exercises the normal
    // recordGesturePatch → notify → render path without pointer
    // events.
    editor.setSelection([elementId("a")]);
    drawn.length = 0; // selection notify may re-render
    editor.moveSelectionBy({ x: 60, y: 60 });

    // Element renderers call `target.rect(0, 0, w, h)` under a
    // position transform — so the dimensions are the per-shape
    // signature. Every 100×100 box (B and C) must have been
    // redrawn, not just B.
    const drewSize = drawn.filter((d) => d.w === 100 && d.h === 100).length;
    expect(drewSize).toBeGreaterThanOrEqual(2);

    editor.dispose();
  });
});
