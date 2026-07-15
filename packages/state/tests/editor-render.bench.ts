import { bench, describe } from "vitest";
import { elementId, linkId } from "@oh-just-another/types";
import {
  DEFAULT_LAYER_ID,
  addElement,
  addLink,
  emptyScene,
  orderBetween,
  type Element,
  type Link,
  type Scene,
} from "@oh-just-another/scene";
import { installBuiltinRenderers } from "@oh-just-another/renderer-core";
import { Editor } from "../src/editor.js";

/**
 * Bench for the editor's full render pass — snapshot build + orchestration
 * (`renderEditor`) + per-shape command recording — headless, against noop
 * render targets. Measures the CPU-side per-frame cost the Editor adds on
 * top of rasterisation (which is not exercisable in Node and is measured
 * in-browser): dirty-rect diffing, viewport culling, elbow reroute checks,
 * selection overlay geometry, and the draw-call fan-out into the targets.
 *
 * Two paths:
 *  - "dirty main pass": a 1px viewport pan invalidates the whole main
 *    layer each iteration, so the pass repaints all visible elements.
 *  - "overlay-only": the scene is unchanged between frames (empty dirty
 *    diff), only the selection toggles — pins the cost of the overlay
 *    (handles / selection chrome) repaint that runs on every pointer move.
 */

// Per-shape renderers must be registered or the main pass draws nothing.
installBuiltinRenderers();

// Swallowing rAF stub: scheduleRender() calls inside Editor defer forever,
// so each bench iteration pays exactly one render — the explicit
// forceRender() below (forceRender cancels the pending id first).
(globalThis as { requestAnimationFrame?: unknown }).requestAnimationFrame = (): number => 1;
(globalThis as { cancelAnimationFrame?: unknown }).cancelAnimationFrame = (): void => {};

/** Noop RenderTarget — every method call resolves to a no-op function. */
const noopTarget = new Proxy(
  { measureText: () => ({ width: 0 }), size: { width: 800, height: 600 } } as Record<
    string,
    unknown
  >,
  { get: (o, k: string) => (k in o ? o[k] : () => undefined) },
) as never;

const rect = (id: string, x: number, y: number): Element => ({
  id: elementId(id),
  layerId: DEFAULT_LAYER_ID,
  type: "rectangle",
  position: { x, y },
  rotation: 0,
  scale: { x: 1, y: 1 },
  order: orderBetween(null, null),
  style: { fill: "#1a73e8", stroke: "#333", strokeWidth: 1 },
  width: 40,
  height: 30,
});

const ellipse = (id: string, x: number, y: number): Element => ({
  id: elementId(id),
  layerId: DEFAULT_LAYER_ID,
  type: "ellipse",
  position: { x, y },
  rotation: 0,
  scale: { x: 1, y: 1 },
  order: orderBetween(null, null),
  style: { fill: "#e6f0ff", stroke: "#1a73e8", strokeWidth: 2 },
  width: 40,
  height: 30,
});

/**
 * ~500 mixed elements laid out on a grid that fits the 800×600 viewport
 * (so the main pass actually paints them, not culls them): 225 rects,
 * 225 ellipses, and 50 straight links chaining consecutive rects.
 */
const SHAPES_PER_KIND = 225;
const LINKS = 50;
const COLS = 25;

const makeScene = (): Scene => {
  let s = emptyScene();
  for (let i = 0; i < SHAPES_PER_KIND; i++) {
    const x = (i % COLS) * 60;
    const y = Math.floor(i / COLS) * 60;
    s = addElement(s, rect(`r-${String(i)}`, x, y)).scene;
    s = addElement(s, ellipse(`e-${String(i)}`, x + 20, y + 20)).scene;
  }
  for (let i = 0; i < LINKS; i++) {
    const link: Link = {
      id: linkId(`l-${String(i)}`),
      layerId: DEFAULT_LAYER_ID,
      order: orderBetween(null, null),
      from: {
        kind: "anchor",
        elementId: elementId(`r-${String(i)}`),
        anchor: { kind: "named", name: "right" },
      },
      to: {
        kind: "anchor",
        elementId: elementId(`r-${String(i + 1)}`),
        anchor: { kind: "named", name: "left" },
      },
      routing: "straight",
      style: { stroke: "#000" },
    };
    s = addLink(s, link).scene;
  }
  return s;
};

/** Minimal host — the bench never dispatches pointer events. */
const host = {
  addEventListener: () => undefined,
  removeEventListener: () => undefined,
  setPointerCapture: () => undefined,
  releasePointerCapture: () => undefined,
  hasPointerCapture: () => true,
  getBoundingClientRect: () => ({ left: 0, top: 0, width: 800, height: 600 }),
  style: { cursor: "" },
} as never;

// Pre-built fixture: scene construction stays OUT of the bench body.
const editor = new Editor({
  host,
  mainTarget: noopTarget,
  overlayTarget: noopTarget,
  initialScene: makeScene(),
});
editor.setViewportSize(800, 600);

// A persistent selection so both paths pay the selection-chrome cost.
const selectionA = Array.from({ length: 20 }, (_, i) => elementId(`r-${String(i)}`));
const selectionB = Array.from({ length: 20 }, (_, i) => elementId(`e-${String(i)}`));
editor.setSelection(selectionA);
// Warm caches (bounds cache, spatial index, elbow route table) so the
// bench measures steady-state frames, not first-frame cache fills.
editor.forceRender();

let flip = false;

describe("Editor render pass — ~500 mixed elements, 20 selected (noop targets)", () => {
  bench("full pass, dirty scene (1px pan per frame)", () => {
    // A pan invalidates the whole main layer: full repaint of every
    // visible element + overlay, i.e. the worst-case interactive frame.
    editor.panBy({ x: 1, y: 0 });
    editor.forceRender();
  });

  bench("overlay-only pass (selection toggles, scene unchanged)", () => {
    // Scene identity is unchanged between frames → empty dirty diff →
    // the main layer is skipped; only the overlay repaints.
    flip = !flip;
    editor.setSelection(flip ? selectionB : selectionA);
    editor.forceRender();
  });
});
