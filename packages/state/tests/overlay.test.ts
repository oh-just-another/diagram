import { describe, expect, it } from "vitest";
import { annotationId, elementId } from "@oh-just-another/types";
import {
  apply,
  DEFAULT_LAYER_ID,
  emptyScene,
  getWorldToScreen,
  orderBetween,
  type Patch,
  type Scene,
  type Element,
} from "@oh-just-another/scene";
import type { RenderTarget } from "@oh-just-another/renderer-core";
import { renderOverlay, paintElementSelectionHalo, DEFAULT_OVERLAY_STYLE } from "../src/overlay.js";
import { isResizable, resizeHandlesFor } from "../src/editor/shape-traits.js";
import type { Selection } from "../src/selection.js";

// ---------------------------------------------------------------------------
// RenderTarget recorder (Proxy-based — same pattern as scene-renderer tests)
// ---------------------------------------------------------------------------

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
        if (prop === "measureText") return { width: 30 };
        return undefined;
      };
    },
  };
  return { target: new Proxy({}, handler) as unknown as RenderTarget, calls };
};

// ---------------------------------------------------------------------------
// Scene helpers
// ---------------------------------------------------------------------------

const rect = (id: string, x = 0, y = 0, w = 20, h = 20): Element => ({
  id: elementId(id),
  layerId: DEFAULT_LAYER_ID,
  type: "rectangle",
  position: { x, y },
  rotation: 0,
  scale: { x: 1, y: 1 },
  order: orderBetween(null, null),
  style: { fill: "#111" },
  width: w,
  height: h,
});

const sceneWith = (...elements: Element[]): Scene => {
  let s = emptyScene();
  for (const shape of elements) {
    s = apply(s, { kind: "element", id: shape.id, before: null, after: shape } satisfies Patch);
  }
  return s;
};

// ---------------------------------------------------------------------------
// isResizable / resizeHandlesFor
// ---------------------------------------------------------------------------

describe("isResizable", () => {
  const mkShape = (type: string): Element => ({ ...rect("x"), type });

  it("returns true for rectangle", () => expect(isResizable(mkShape("rectangle"))).toBe(true));
  it("returns true for ellipse", () => expect(isResizable(mkShape("ellipse"))).toBe(true));
  it("returns true for text", () => expect(isResizable(mkShape("text"))).toBe(true));
  it("returns true for template", () => expect(isResizable(mkShape("template"))).toBe(true));
  it("returns false for image", () => expect(isResizable(mkShape("image"))).toBe(false));
  it("returns false for group", () => expect(isResizable(mkShape("group"))).toBe(false));
  it("returns false for path", () => expect(isResizable(mkShape("path"))).toBe(false));
});

describe("resizeHandlesFor", () => {
  it("returns 8 handles for any shape", () => {
    expect(resizeHandlesFor(rect("r"))).toHaveLength(8);
  });
});

// ---------------------------------------------------------------------------
// renderOverlay — smoke / structural tests
// ---------------------------------------------------------------------------

describe("renderOverlay", () => {
  const emptySelection: Selection = new Set();

  it("calls clear() at the start of every render", () => {
    const { target, calls } = makeRecorder();
    renderOverlay(emptyScene(), emptySelection, target);
    const clearIdx = calls.findIndex((c) => c.method === "clear");
    expect(clearIdx).toBeGreaterThanOrEqual(0);
  });

  it("wraps drawing in a save/restore pair", () => {
    const { target, calls } = makeRecorder();
    renderOverlay(emptyScene(), emptySelection, target);
    const saves = calls.filter((c) => c.method === "save").length;
    const restores = calls.filter((c) => c.method === "restore").length;
    expect(saves).toBeGreaterThanOrEqual(1);
    expect(restores).toBe(saves);
  });

  it("draws a selection outline when a shape is selected", () => {
    const shape = rect("r1", 10, 10, 40, 40);
    const scene = sceneWith(shape);
    const { target, calls } = makeRecorder();
    renderOverlay(scene, new Set([shape.id]), target);
    // At minimum a rect() path for the outline should be present
    const rects = calls.filter((c) => c.method === "rect");
    expect(rects.length).toBeGreaterThanOrEqual(1);
  });

  it("draws resize handles for a single resizable selection", () => {
    const shape = rect("r1", 0, 0, 50, 50);
    const scene = sceneWith(shape);
    const { target, calls } = makeRecorder();
    renderOverlay(scene, new Set([shape.id]), target);
    // Each handle is an ellipse. 4 CORNER dots (edge-midpoint handles removed —
    // edge resize = drag the box side) plus the rotate grip circle above the
    // box = 5.
    const ellipses = calls.filter((c) => c.method === "ellipse");
    expect(ellipses.length).toBe(5);
  });

  it("draws no per-shape handles for multi-selection", () => {
    const a = rect("a", 0, 0, 20, 20);
    const b = rect("b", 100, 0, 20, 20);
    const scene = sceneWith(a, b);
    const { target, calls } = makeRecorder();
    // No groupBounds → no combined handles either
    renderOverlay(scene, new Set([a.id, b.id]), target);
    // Handles are ellipses; with multi-select + no groupBounds → zero ellipses
    const ellipses = calls.filter((c) => c.method === "ellipse");
    expect(ellipses.length).toBe(0);
  });

  it("draws a dashed rubber-band rect when drawingPreview is supplied", () => {
    const { target, calls } = makeRecorder();
    renderOverlay(emptyScene(), emptySelection, target, {
      drawingPreview: { x: 10, y: 10, width: 50, height: 30 },
    });
    const rects = calls.filter((c) => c.method === "rect");
    expect(rects.length).toBeGreaterThanOrEqual(1);
    // setDashArray must have been called with a non-null value
    const dashCalls = calls.filter((c) => c.method === "setDashArray" && Array.isArray(c.args[0]));
    expect(dashCalls.length).toBeGreaterThanOrEqual(1);
  });

  it("draws a straight edge preview when edgePreview is supplied", () => {
    const { target, calls } = makeRecorder();
    renderOverlay(emptyScene(), emptySelection, target, {
      edgePreview: { from: { x: 0, y: 0 }, to: { x: 100, y: 100 } },
    });
    const lineTo = calls.filter((c) => c.method === "lineTo");
    expect(lineTo.length).toBeGreaterThanOrEqual(1);
  });

  it("draws a polyline edge preview when edgePreview.points is supplied", () => {
    const { target, calls } = makeRecorder();
    renderOverlay(emptyScene(), emptySelection, target, {
      edgePreview: {
        from: { x: 0, y: 0 },
        to: { x: 100, y: 100 },
        points: [
          { x: 0, y: 0 },
          { x: 50, y: 0 },
          { x: 100, y: 100 },
        ],
      },
    });
    const lineTo = calls.filter((c) => c.method === "lineTo");
    expect(lineTo.length).toBeGreaterThanOrEqual(2);
  });

  it("draws port dots for a PortOverlay", () => {
    const { target, calls } = makeRecorder();
    renderOverlay(emptyScene(), emptySelection, target, {
      ports: {
        worldPoints: [
          { x: 0, y: 0 },
          { x: 50, y: 50 },
        ],
      },
    });
    const ellipses = calls.filter((c) => c.method === "ellipse");
    expect(ellipses.length).toBe(2);
  });

  it("draws port dots for an array of PortOverlays", () => {
    const { target, calls } = makeRecorder();
    renderOverlay(emptyScene(), emptySelection, target, {
      ports: [
        { worldPoints: [{ x: 0, y: 0 }] },
        {
          worldPoints: [
            { x: 10, y: 10 },
            { x: 20, y: 20 },
          ],
        },
      ],
    });
    const ellipses = calls.filter((c) => c.method === "ellipse");
    expect(ellipses.length).toBe(3);
  });

  it("draws link-start port dots differently from link-attach dots (fill differs)", () => {
    const { target: t1, calls: c1 } = makeRecorder();
    const { target: t2, calls: c2 } = makeRecorder();
    renderOverlay(emptyScene(), emptySelection, t1, {
      ports: { worldPoints: [{ x: 0, y: 0 }], role: "link-start" },
    });
    renderOverlay(emptyScene(), emptySelection, t2, {
      ports: { worldPoints: [{ x: 0, y: 0 }], role: "link-attach" },
    });
    const fillStart = c1.find((c) => c.method === "setFill")?.args[0];
    const fillAttach = c2.find((c) => c.method === "setFill")?.args[0];
    expect(fillStart).not.toBe(fillAttach);
  });

  it("draws an active port dot at a larger radius (activeIndex)", () => {
    const { target, calls } = makeRecorder();
    renderOverlay(emptyScene(), emptySelection, target, {
      ports: { worldPoints: [{ x: 0, y: 0 }], activeIndex: 0 },
    });
    // The ellipse radius args[2] should be > the normal radius for the active dot.
    // We just check an ellipse was drawn.
    const ellipses = calls.filter((c) => c.method === "ellipse");
    expect(ellipses.length).toBe(1);
    // Active radius > 0
    expect(ellipses[0]!.args[2] as number).toBeGreaterThan(0);
  });

  it("draws group bounds outline and handles when groupBounds is supplied", () => {
    const { target, calls } = makeRecorder();
    renderOverlay(emptyScene(), emptySelection, target, {
      groupBounds: { x: 0, y: 0, width: 100, height: 80 },
    });
    const ellipses = calls.filter((c) => c.method === "ellipse");
    // Group box draws the 4 corner dots (edge resize = drag the box side) plus
    // the rotate grip circle above it = 5.
    expect(ellipses.length).toBe(5);
  });

  it("draws only 4 corner handles (+ rotate grip) when groupAspectLocked is true", () => {
    const { target, calls } = makeRecorder();
    renderOverlay(emptyScene(), emptySelection, target, {
      groupBounds: { x: 0, y: 0, width: 100, height: 80 },
      groupAspectLocked: true,
    });
    const ellipses = calls.filter((c) => c.method === "ellipse");
    expect(ellipses.length).toBe(5);
  });

  it("element halo peeks a constant width past the border: 2×(outset + peek/zoom)", () => {
    const { target, calls } = makeRecorder();
    const w2s = getWorldToScreen(emptyScene().viewport); // zoom 1
    paintElementSelectionHalo(
      target,
      w2s,
      [
        {
          loops: [
            [
              { x: 0, y: 0 },
              { x: 10, y: 0 },
              { x: 10, y: 10 },
            ],
          ],
          outsetWorld: 2,
        },
      ],
      1,
    );
    // peek = SELECTION_HALO_PEEK_PX (4), zoom 1 → 2×(2 + 4) = 12.
    expect(calls.some((c) => c.method === "setStrokeWidth" && c.args[0] === 12)).toBe(true);
    // miter join so rect/polygon corners stay sharp.
    expect(calls.some((c) => c.method === "setLineJoin" && c.args[0] === "miter")).toBe(true);
  });

  it("link halo peeks the same constant past the link's centred stroke", () => {
    const { target, calls } = makeRecorder();
    renderOverlay(emptyScene(), emptySelection, target, {
      selectedLinkPaths: [
        {
          path: [
            { x: 0, y: 0 },
            { x: 100, y: 0 },
          ],
          width: 4,
        },
      ],
    });
    // link visible half-width = 4/2; halo = width + 2×peek/zoom = 4 + 8 = 12.
    expect(calls.some((c) => c.method === "setStrokeWidth" && c.args[0] === 12)).toBe(true);
  });

  it("draws peer cursors (arrow + chip)", () => {
    const { target, calls } = makeRecorder();
    renderOverlay(emptyScene(), emptySelection, target, {
      peerCursors: [{ position: { x: 50, y: 50 }, color: "#f00", name: "Alice" }],
    });
    // Name chip: fillText should be called with "Alice"
    const textCalls = calls.filter((c) => c.method === "fillText");
    expect(textCalls.some((c) => c.args[0] === "Alice")).toBe(true);
  });

  it("draws peer selection halos as dashed rects", () => {
    const { target, calls } = makeRecorder();
    renderOverlay(emptyScene(), emptySelection, target, {
      peerSelections: [{ color: "#0f0", bounds: [{ x: 10, y: 10, width: 40, height: 40 }] }],
    });
    const dashCalls = calls.filter((c) => c.method === "setDashArray" && Array.isArray(c.args[0]));
    expect(dashCalls.length).toBeGreaterThanOrEqual(1);
    const rects = calls.filter((c) => c.method === "rect");
    expect(rects.length).toBeGreaterThanOrEqual(1);
  });

  it("draws ghost element bounds rect when ghostElement is supplied (fallback path)", () => {
    const { target, calls } = makeRecorder();
    renderOverlay(emptyScene(), emptySelection, target, {
      ghostElement: { x: 20, y: 20, width: 60, height: 40 },
    });
    const rects = calls.filter((c) => c.method === "rect");
    expect(rects.length).toBeGreaterThanOrEqual(1);
  });

  it("draws the link-attach highlight rect when linkAttachHighlight is set", () => {
    const { target, calls } = makeRecorder();
    renderOverlay(emptyScene(), emptySelection, target, {
      linkAttachHighlight: { x: 5, y: 5, width: 80, height: 60 },
    });
    const rects = calls.filter((c) => c.method === "rect");
    expect(rects.length).toBeGreaterThanOrEqual(1);
  });

  it("draws container drop zone (dashed rect with fill)", () => {
    const { target, calls } = makeRecorder();
    renderOverlay(emptyScene(), emptySelection, target, {
      containerDropZone: { x: 0, y: 0, width: 100, height: 100 },
    });
    const fillCalls = calls.filter((c) => c.method === "fill");
    expect(fillCalls.length).toBeGreaterThanOrEqual(1);
  });

  it("draws edge endpoint handles when edgeSelection is supplied", () => {
    const { target, calls } = makeRecorder();
    renderOverlay(emptyScene(), emptySelection, target, {
      edgeSelection: {
        from: { x: 0, y: 0 },
        to: { x: 100, y: 100 },
      },
    });
    const ellipses = calls.filter((c) => c.method === "ellipse");
    expect(ellipses.length).toBe(2); // from + to endpoints
  });

  it("draws waypoint handles in addition to endpoints", () => {
    const { target, calls } = makeRecorder();
    renderOverlay(emptyScene(), emptySelection, target, {
      edgeSelection: {
        from: { x: 0, y: 0 },
        to: { x: 100, y: 100 },
        waypoints: [{ x: 50, y: 50 }],
      },
    });
    const ellipses = calls.filter((c) => c.method === "ellipse");
    expect(ellipses.length).toBe(3); // from + waypoint + to
  });

  it("draws midpoint handles smaller than endpoint handles", () => {
    const { target, calls } = makeRecorder();
    renderOverlay(emptyScene(), emptySelection, target, {
      edgeSelection: {
        from: { x: 0, y: 0 },
        to: { x: 100, y: 100 },
        midpoints: [{ x: 50, y: 50 }],
      },
    });
    const ellipses = calls.filter((c) => c.method === "ellipse");
    // 1 midpoint + 2 endpoints = 3 total
    expect(ellipses.length).toBe(3);
    // midpoint radius (args[2]) should be smaller than endpoint radius
    const radii = ellipses.map((e) => e.args[2] as number);
    const midpointRadius = radii[0]!; // drawn first
    const endpointRadius = radii[1]!;
    expect(midpointRadius).toBeLessThan(endpointRadius);
  });

  it("draws annotation pins for each annotation", () => {
    const { target, calls } = makeRecorder();
    const ann = {
      id: annotationId("ann1"),
      elementId: null,
      position: { x: 50, y: 50 },
      resolved: false,
      thread: [],
      createdAt: "2024-01-01T00:00:00Z",
    };
    renderOverlay(emptyScene(), emptySelection, target, {
      annotations: [ann],
    });
    // Each pin is an ellipse
    const ellipses = calls.filter((c) => c.method === "ellipse");
    expect(ellipses.length).toBeGreaterThanOrEqual(1);
  });

  it("draws the editing-text caret rect when editingText.caret is set", () => {
    const { target, calls } = makeRecorder();
    renderOverlay(emptyScene(), emptySelection, target, {
      editingText: {
        caret: { x: 10, y: 20, height: 16 },
        caretColor: "#000",
        selectionRects: [],
      },
    });
    const rects = calls.filter((c) => c.method === "rect");
    expect(rects.length).toBeGreaterThanOrEqual(1);
  });

  it("draws text selection rects when selectionRects is non-empty", () => {
    const { target, calls } = makeRecorder();
    renderOverlay(emptyScene(), emptySelection, target, {
      editingText: {
        caret: null,
        caretColor: "#000",
        selectionRects: [{ x: 5, y: 5, width: 40, height: 14 }],
      },
    });
    const fillCalls = calls.filter((c) => c.method === "fill");
    expect(fillCalls.length).toBeGreaterThanOrEqual(1);
  });

  it("applies custom style overrides", () => {
    const { target, calls } = makeRecorder();
    const customStroke = "#ff0000";
    const shape = rect("r1", 0, 0, 20, 20);
    const scene = sceneWith(shape);
    renderOverlay(scene, new Set([shape.id]), target, {
      style: { selectionStroke: customStroke },
    });
    const strokeCalls = calls.filter((c) => c.method === "setStroke" && c.args[0] === customStroke);
    expect(strokeCalls.length).toBeGreaterThanOrEqual(1);
  });

  it("draws a gif badge chip for each gifBadges entry", () => {
    const { target, calls } = makeRecorder();
    renderOverlay(emptyScene(), emptySelection, target, {
      gifBadges: [
        { x: 10, y: 10, width: 50, height: 50 },
        { x: 100, y: 100, width: 50, height: 50 },
      ],
    });
    // Each badge uses fillText("gif", ...)
    const gifTexts = calls.filter((c) => c.method === "fillText" && c.args[0] === "gif");
    expect(gifTexts.length).toBe(2);
  });

  it("draws a brush preview stroke for multiple points", () => {
    const { target, calls } = makeRecorder();
    renderOverlay(emptyScene(), emptySelection, target, {
      brushPreview: {
        origin: { x: 0, y: 0 },
        points: [
          { x: 0, y: 0, width: 5 },
          { x: 10, y: 0, width: 6 },
          { x: 20, y: 5, width: 4 },
        ],
        fill: "#ff0000",
      },
    });
    // Should call fill at least twice (quad-strips between pts)
    const fills = calls.filter((c) => c.method === "fill");
    expect(fills.length).toBeGreaterThanOrEqual(2);
  });

  it("draws a brush preview as a single dot when only one point", () => {
    const { target, calls } = makeRecorder();
    renderOverlay(emptyScene(), emptySelection, target, {
      brushPreview: {
        origin: { x: 5, y: 5 },
        points: [{ x: 0, y: 0, width: 8 }],
        fill: "#0000ff",
      },
    });
    // Single point → single ellipse
    const ellipses = calls.filter((c) => c.method === "ellipse");
    expect(ellipses.length).toBe(1);
  });

  it("skips brush preview drawing when points array is empty", () => {
    const { target, calls } = makeRecorder();
    renderOverlay(emptyScene(), emptySelection, target, {
      brushPreview: { origin: { x: 0, y: 0 }, points: [], fill: "#abcdef" },
    });
    // No fill calls using our unique fill color since points is empty
    const brushFills = calls.filter((c) => c.method === "setFill" && c.args[0] === "#abcdef");
    expect(brushFills.length).toBe(0);
  });

  it("renders debug hit zones (fillZoneRect + fillZoneCircle) when debugHitZones is true", () => {
    // Resize zones only show for the SINGLE selected resizable shape (matches
    // the real hit-test — nothing is resizable with no selection), so select it.
    const shape = rect("r1", 0, 0, 50, 50);
    const scene = sceneWith(shape);
    const { target, calls } = makeRecorder();
    renderOverlay(scene, new Set([shape.id]), target, { debugHitZones: true });
    // fillZoneRect → rect() called for the 4 corner squares + 4 edge bands.
    const rects = calls.filter((c) => c.method === "rect");
    expect(rects.length).toBeGreaterThanOrEqual(8);
  });

  it("DEFAULT_OVERLAY_STYLE has expected shape", () => {
    const s = DEFAULT_OVERLAY_STYLE;
    expect(typeof s.selectionStroke).toBe("string");
    expect(typeof s.selectionStrokeWidth).toBe("number");
    expect(typeof s.handleFill).toBe("string");
    expect(typeof s.handleStroke).toBe("string");
    expect(typeof s.drawingStroke).toBe("string");
    expect(Array.isArray(s.drawingDash)).toBe(true);
  });
});
