import { afterEach, describe, expect, it, vi } from "vitest";
import { elementId, linkId } from "@oh-just-another/types";
import { ERASER_TRAIL_TTL_MS } from "../src/constants.js";
import {
  DEFAULT_LAYER_ID,
  addElement,
  addLink,
  orderBetween,
  emptyScene,
  isBrush,
  type Element,
  type Link,
  type Scene,
} from "@oh-just-another/scene";
import { installBuiltinRenderers } from "@oh-just-another/renderer-core";
import { Editor } from "../src/editor.js";
import { renderEditor, type RenderSnapshot } from "../src/editor/render-orchestrator.js";

installBuiltinRenderers();

const noopTarget = {
  save: () => {},
  restore: () => {},
  setTransform: () => {},
  clear: () => {},
  setFill: () => {},
  setStroke: () => {},
  setStrokeWidth: () => {},
  setOpacity: () => {},
  setLineCap: () => {},
  setLineJoin: () => {},
  setDashArray: () => {},
  setFont: () => {},
  setTextAlign: () => {},
  setTextBaseline: () => {},
  beginPath: () => {},
  closePath: () => {},
  moveTo: () => {},
  lineTo: () => {},
  bezierCurveTo: () => {},
  quadraticCurveTo: () => {},
  rect: () => {},
  ellipse: () => {},
  fill: () => {},
  stroke: () => {},
  fillText: () => {},
  measureText: () => ({ width: 0 }),
  drawImage: () => {},
  drawPoint: () => {},
  scale: () => {},
  translate: () => {},
  rotate: () => {},
} as never;

const makeEditor = (scene: Scene): Editor =>
  new Editor({
    host: {
      addEventListener: () => {},
      removeEventListener: () => {},
      getBoundingClientRect: () => ({ left: 0, top: 0, width: 500, height: 500 }),
      style: {},
    } as never,
    mainTarget: noopTarget,
    overlayTarget: noopTarget,
    initialScene: scene,
  });

/** Horizontal brush at y=0, points every 10px, half-width 1. */
const brush = (id: string, xs: number[]): Element => ({
  id: elementId(id),
  layerId: DEFAULT_LAYER_ID,
  type: "brush",
  position: { x: 0, y: 0 },
  rotation: 0,
  scale: { x: 1, y: 1 },
  order: orderBetween(null, null),
  style: { stroke: "#000" },
  points: xs.map((x) => ({ x, y: 0, width: 1 })),
});

const rect = (id: string, x: number, y: number): Element => ({
  id: elementId(id),
  layerId: DEFAULT_LAYER_ID,
  type: "rectangle",
  position: { x, y },
  rotation: 0,
  scale: { x: 1, y: 1 },
  order: orderBetween(null, null),
  style: {},
  width: 40,
  height: 40,
});

const sceneWith = (...els: Element[]): Scene => {
  let s = emptyScene();
  for (const e of els) s = addElement(s, e).scene;
  return s;
};

const countBrushes = (editor: Editor): number =>
  [...editor.scene.elements.values()].filter((e) => isBrush(e)).length;

describe("stroke-eraser (Shift-gated)", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("Shift cut across the middle → two brush fragments in ONE undo step", () => {
    const editor = makeEditor(sceneWith(brush("b", [0, 10, 20, 30, 40])));
    editor.setMode("erase");
    // Vertical eraser stroke crossing x=20 (Shift held → strokeErase).
    editor.beginEraseStroke({ x: 20, y: -50 }, false, true);
    editor.extendEraseStroke({ x: 20, y: 50 }, false);
    editor.commitEraseStroke();

    // Original gone; two fragment brushes remain.
    expect(editor.scene.elements.has(elementId("b"))).toBe(false);
    expect(countBrushes(editor)).toBe(2);

    // ONE undo restores the single original.
    editor.undo();
    expect(countBrushes(editor)).toBe(1);
    expect(editor.scene.elements.has(elementId("b"))).toBe(true);
  });

  it("WITHOUT Shift the same gesture deletes the whole brush", () => {
    const editor = makeEditor(sceneWith(brush("b", [0, 10, 20, 30, 40])));
    editor.setMode("erase");
    // No strokeErase: object-erase mode. Seed via a press on the brush body.
    editor.beginEraseStroke({ x: 20, y: 0 }, false, false);
    editor.extendEraseStroke({ x: 20, y: 5 }, false);
    editor.commitEraseStroke();
    expect(editor.scene.elements.has(elementId("b"))).toBe(false);
    expect(countBrushes(editor)).toBe(0);
  });

  it("a non-brush under Shift is still object-deleted (fallback)", () => {
    const editor = makeEditor(sceneWith(rect("r", 0, 0)));
    editor.setMode("erase");
    editor.beginEraseStroke({ x: 20, y: 20 }, false, true); // Shift, but over a rect
    editor.commitEraseStroke();
    expect(editor.scene.elements.has(elementId("r"))).toBe(false);
  });

  it("shows a live preview mid-drag: fragments exposed, original hidden", () => {
    const editor = makeEditor(sceneWith(brush("b", [0, 10, 20, 30, 40])));
    editor.setMode("erase");
    // Shift drag across the middle, WITHOUT committing yet.
    editor.beginEraseStroke({ x: 20, y: -50 }, false, true);
    editor.extendEraseStroke({ x: 20, y: 50 }, false);
    const snap = (
      editor as unknown as {
        buildRenderSnapshot(): {
          strokeErasePreview: { elements: readonly unknown[]; hidden: ReadonlySet<string> } | null;
          hideElements: ReadonlySet<string> | undefined;
        };
      }
    ).buildRenderSnapshot();
    expect(snap.strokeErasePreview).not.toBeNull();
    expect(snap.strokeErasePreview!.elements).toHaveLength(2);
    // The touched original is suppressed in the main pass.
    expect(snap.hideElements?.has(elementId("b"))).toBe(true);
    // Nothing committed yet — the original is still in the scene.
    expect(editor.scene.elements.has(elementId("b"))).toBe(true);
  });

  it("cutting a brush that is a link endpoint detaches the link", () => {
    let s = sceneWith(brush("b", [0, 10, 20, 30, 40]), rect("r", 200, 0));
    const link: Link = {
      id: linkId("L1"),
      layerId: DEFAULT_LAYER_ID,
      from: { kind: "floating", elementId: elementId("b") },
      to: { kind: "floating", elementId: elementId("r") },
      style: {},
      order: orderBetween(null, null),
    };
    s = addLink(s, link).scene;
    const editor = makeEditor(s);
    editor.setMode("erase");
    expect(editor.scene.links.size).toBe(1);

    editor.beginEraseStroke({ x: 20, y: -50 }, false, true);
    editor.extendEraseStroke({ x: 20, y: 50 }, false);
    editor.commitEraseStroke();

    // Brush cut into fragments; the link to the removed original is dropped.
    expect(editor.scene.elements.has(elementId("b"))).toBe(false);
    expect(countBrushes(editor)).toBe(2);
    expect(editor.scene.links.size).toBe(0);
  });

  it("keeps repainting (and regrows the trail) when resuming after a pause", () => {
    // Freeze bug: pausing with the button held let the fading trail empty; a
    // resumed move then found no active trail AND no object change, so it never
    // called notify() — the cursor froze and the cut only appeared on release.
    let clock = 0;
    vi.spyOn(performance, "now").mockImplementation(() => clock);
    const editor = makeEditor(sceneWith(brush("b", [0, 10, 20, 30, 40])));
    editor.setMode("erase");
    editor.beginEraseStroke({ x: 20, y: -50 }, false, true);
    editor.extendEraseStroke({ x: 20, y: -40 }, false);
    // Age the trail past its TTL and prune it — a paused cursor.
    clock = ERASER_TRAIL_TTL_MS + 100;
    editor.forceRender();
    expect(editor.eraserTrail.length).toBe(0);
    // Resume moving (still over empty space, no new cut) — must repaint anyway
    // so the cursor follows, and restart the trail.
    let notified = 0;
    const unsub = editor.subscribe(() => notified++);
    editor.extendEraseStroke({ x: 20, y: -35 }, false);
    expect(notified).toBeGreaterThan(0);
    expect(editor.eraserTrail.length).toBeGreaterThan(0);
    unsub();
  });

  it("only forces a full repaint on frames that changed the cut (perf gate)", () => {
    // The freeze fix: while erasing, the whole-scene repaint is forced ONLY when
    // `eraseDirty` is set (a frame that actually marked / cut). A slowly-moving
    // or stopped cursor over already-covered area leaves it false, so that frame
    // skips the full main pass (empty dirty rect → cull only). Drive the gate
    // directly — `notify()`'s render would otherwise consume the flag.
    const editor = makeEditor(sceneWith(brush("b", [0, 10, 20, 30, 40])));
    editor.setMode("erase");
    editor.setViewportSize(500, 500);
    editor.beginEraseStroke({ x: 20, y: 50 }, false, true); // erase stroke active
    const ed = editor as unknown as {
      lastRenderedScene: Scene | null;
      lastRenderedEraseActive: boolean;
      eraseDirty: boolean;
      computeDirtyWorld(): unknown;
    };
    ed.lastRenderedScene = editor.scene; // preview only → scene unchanged
    ed.lastRenderedEraseActive = false;
    // A frame that changed the cut → forced full repaint.
    ed.eraseDirty = true;
    expect(ed.computeDirtyWorld()).toBeNull();
    // An idle frame (no new cut) → NOT forced; the scene-diff is an empty rect.
    ed.eraseDirty = false;
    expect(ed.computeDirtyWorld()).not.toBeNull();
  });

  it("the live preview does not clear the overlay (eraser cursor survives)", () => {
    // Regression: the stroke-erase preview used to render via `renderScene`,
    // which CLEARS the overlay — wiping the eraser cursor ring / trail mid-drag
    // until release. The overlay must be cleared exactly once (by renderOverlay),
    // and the cursor ring (ellipse + stroke) must still be painted after the
    // preview fragments.
    interface Op {
      m: string;
    }
    const makeRec = (ops: Op[]) =>
      new Proxy(
        { measureText: () => ({ width: 0 }), size: { width: 500, height: 500 } } as Record<
          string,
          unknown
        >,
        { get: (o, k: string) => (k in o ? o[k] : () => ops.push({ m: k })) },
      ) as never;
    const overlayOps: Op[] = [];
    const editor = new Editor({
      host: {
        addEventListener: () => {},
        removeEventListener: () => {},
        getBoundingClientRect: () => ({ left: 0, top: 0, width: 500, height: 500 }),
        style: {},
      } as never,
      mainTarget: makeRec([]),
      overlayTarget: makeRec(overlayOps),
      initialScene: sceneWith(brush("b", [0, 10, 20, 30, 40])),
    });
    editor.setViewportSize(500, 500);
    editor.setMode("erase");
    editor.beginEraseStroke({ x: 20, y: -50 }, false, true); // Shift stroke-erase
    editor.extendEraseStroke({ x: 20, y: 50 }, false); // cut through the brush
    editor.lastPointerWorld = { x: 20, y: 50 }; // the pointer handler sets this live
    const snap = (
      editor as unknown as { buildRenderSnapshot(): RenderSnapshot }
    ).buildRenderSnapshot();
    // Preconditions: a live preview AND a cursor ring are both active.
    expect(snap.strokeErasePreview).not.toBeNull();
    expect(snap.eraserCursor).not.toBeNull();

    overlayOps.length = 0;
    renderEditor(snap);
    // The overlay is cleared exactly once (by renderOverlay) — the preview must
    // NOT add a second clear (the old `renderScene`-on-overlay did).
    expect(overlayOps.filter((o) => o.m === "clear")).toHaveLength(1);
    // The cursor ring's stroke is drawn AFTER the only clear (not wiped).
    const clearIdx = overlayOps.findIndex((o) => o.m === "clear");
    const lastStroke = overlayOps.map((o) => o.m).lastIndexOf("stroke");
    expect(lastStroke).toBeGreaterThan(clearIdx);
  });
});
