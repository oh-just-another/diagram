/**
 * Covers renderLinks() draw-call sequences: straight / bezier / orthogonal
 * routing, arrowheads, captions, block-arrow links, viewport culling, bitmap
 * cache path, applyStrokeStyle branches.
 */

import { describe, expect, it, vi } from "vitest";
import { linkId, elementId, layerId as layerIdFn } from "@oh-just-another/types";
import {
  addElement,
  addLayer,
  addLink,
  emptyScene,
  DEFAULT_LAYER_ID,
  orderBetween,
  type Link,
  type Element,
} from "@oh-just-another/scene";
import { renderLinks, type RenderLinksOptions } from "../src/index";

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------
const stubTarget = () => ({
  save: vi.fn(),
  restore: vi.fn(),
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
  translate: vi.fn(),
  rotate: vi.fn(),
  scale: vi.fn(),
  setTransform: vi.fn(),
  resetTransform: vi.fn(),
  beginPath: vi.fn(),
  closePath: vi.fn(),
  moveTo: vi.fn(),
  lineTo: vi.fn(),
  quadraticCurveTo: vi.fn(),
  bezierCurveTo: vi.fn(),
  rect: vi.fn(),
  ellipse: vi.fn(),
  fill: vi.fn(),
  stroke: vi.fn(),
  fillText: vi.fn(),
  measureText: vi.fn(() => ({ width: 0 })),
  drawImage: vi.fn(),
  clear: vi.fn(),
  size: { width: 800, height: 600 },
});

const rect = (id: string, x: number, y: number, w = 20, h = 20): Element => ({
  id: elementId(id),
  layerId: DEFAULT_LAYER_ID,
  type: "rectangle",
  position: { x, y },
  rotation: 0,
  scale: { x: 1, y: 1 },
  order: orderBetween(null, null),
  style: { fill: "#000" },
  width: w,
  height: h,
});

const baseLink = (from: string, to: string, overrides: Partial<Link> = {}): Link => ({
  id: linkId("e1"),
  layerId: DEFAULT_LAYER_ID,
  order: orderBetween(null, null),
  from: { kind: "anchor", elementId: elementId(from), anchor: { kind: "named", name: "right" } },
  to: { kind: "anchor", elementId: elementId(to), anchor: { kind: "named", name: "left" } },
  style: { stroke: "#000" },
  ...overrides,
});

const sceneWith = (link: Link, aPos = { x: 0, y: 0 }, bPos = { x: 200, y: 0 }) => {
  let s = emptyScene();
  s = addElement(s, rect("a", aPos.x, aPos.y)).scene;
  s = addElement(s, rect("b", bPos.x, bPos.y)).scene;
  s = addLink(s, link).scene;
  return s;
};

// ---------------------------------------------------------------------------
// renderLinks — basic lifecycle
// ---------------------------------------------------------------------------
describe("renderLinks — lifecycle", () => {
  it("calls save() and restore() around the entire render", () => {
    const s = sceneWith(baseLink("a", "b"));
    const t = stubTarget();
    renderLinks(s, t);
    expect(t.save).toHaveBeenCalled();
    expect(t.restore).toHaveBeenCalled();
  });

  it("does nothing for an empty scene (no links)", () => {
    const t = stubTarget();
    renderLinks(emptyScene(), t);
    expect(t.stroke).not.toHaveBeenCalled();
    expect(t.fill).not.toHaveBeenCalled();
  });

  it("calls setTransform with the world-to-screen matrix", () => {
    const s = sceneWith(baseLink("a", "b"));
    const t = stubTarget();
    renderLinks(s, t);
    expect(t.setTransform).toHaveBeenCalled();
  });

  it("calls onMissingEndpoint for a link referencing a non-existent element", () => {
    const onMissing = vi.fn();
    const orphan: Link = {
      id: linkId("orphan"),
      layerId: DEFAULT_LAYER_ID,
      order: orderBetween(null, null),
      from: {
        kind: "anchor",
        elementId: elementId("missing"),
        anchor: { kind: "named", name: "right" },
      },
      to: {
        kind: "anchor",
        elementId: elementId("missing2"),
        anchor: { kind: "named", name: "left" },
      },
      style: {},
    };
    let s = emptyScene();
    s = addLink(s, orphan).scene;
    renderLinks(s, stubTarget(), { onMissingEndpoint: onMissing });
    expect(onMissing).toHaveBeenCalledWith(orphan);
  });
});

// ---------------------------------------------------------------------------
// applyStrokeStyle — style fields are set on target
// ---------------------------------------------------------------------------
describe("renderLinks — stroke style", () => {
  it("sets stroke color from edge.style.stroke", () => {
    const s = sceneWith(baseLink("a", "b", { style: { stroke: "#abc" } }));
    const t = stubTarget();
    renderLinks(s, t);
    expect(t.setStroke).toHaveBeenCalledWith("#abc");
  });

  it("defaults stroke to #000 when style.stroke is not set", () => {
    const s = sceneWith(baseLink("a", "b", { style: {} }));
    const t = stubTarget();
    renderLinks(s, t);
    expect(t.setStroke).toHaveBeenCalledWith("#000");
  });

  it("sets strokeWidth from edge.style.strokeWidth", () => {
    const s = sceneWith(baseLink("a", "b", { style: { stroke: "#000", strokeWidth: 3 } }));
    const t = stubTarget();
    renderLinks(s, t);
    expect(t.setStrokeWidth).toHaveBeenCalledWith(3);
  });

  it("sets dashArray when edge has a dash pattern", () => {
    const s = sceneWith(baseLink("a", "b", { style: { stroke: "#000", dashArray: [6, 3] } }));
    const t = stubTarget();
    renderLinks(s, t);
    expect(t.setDashArray).toHaveBeenCalledWith([6, 3]);
  });

  it("sets dashArray to null when no dashArray is configured", () => {
    const s = sceneWith(baseLink("a", "b"));
    const t = stubTarget();
    renderLinks(s, t);
    expect(t.setDashArray).toHaveBeenCalledWith(null);
  });

  it("sets opacity when edge.style.opacity is configured", () => {
    const s = sceneWith(baseLink("a", "b", { style: { stroke: "#000", opacity: 0.6 } }));
    const t = stubTarget();
    renderLinks(s, t);
    expect(t.setOpacity).toHaveBeenCalledWith(0.6);
  });

  it("does not call setOpacity when opacity is not set", () => {
    const s = sceneWith(baseLink("a", "b"));
    const t = stubTarget();
    renderLinks(s, t);
    expect(t.setOpacity).not.toHaveBeenCalled();
  });

  it("sets lineCap when edge.style.lineCap is configured", () => {
    const s = sceneWith(baseLink("a", "b", { style: { stroke: "#000", lineCap: "round" } }));
    const t = stubTarget();
    renderLinks(s, t);
    expect(t.setLineCap).toHaveBeenCalledWith("round");
  });

  it("sets lineJoin when edge.style.lineJoin is configured", () => {
    const s = sceneWith(baseLink("a", "b", { style: { stroke: "#000", lineJoin: "round" } }));
    const t = stubTarget();
    renderLinks(s, t);
    expect(t.setLineJoin).toHaveBeenCalledWith("round");
  });
});

// ---------------------------------------------------------------------------
// Straight routing
// ---------------------------------------------------------------------------
describe("renderLinks — straight routing", () => {
  it("emits moveTo + lineTo for a 2-point straight edge", () => {
    const s = sceneWith(baseLink("a", "b", { routing: "straight" }));
    const t = stubTarget();
    renderLinks(s, t);
    expect(t.moveTo).toHaveBeenCalled();
    expect(t.lineTo).toHaveBeenCalled();
    expect(t.stroke).toHaveBeenCalled();
  });

  it("does NOT emit bezierCurveTo for straight routing", () => {
    const s = sceneWith(baseLink("a", "b", { routing: "straight" }));
    const t = stubTarget();
    renderLinks(s, t);
    expect(t.bezierCurveTo).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Orthogonal routing (waypointed straight — rounded corners covered elsewhere)
// ---------------------------------------------------------------------------
describe("renderLinks — orthogonal routing with routedPoints", () => {
  it("emits stroke for an orthogonal edge with routedPoints", () => {
    const link: Link = baseLink("a", "b", {
      routing: "orthogonal",
      routedPoints: [
        { x: 100, y: 10 },
        { x: 100, y: 10 },
      ],
    });
    const s = sceneWith(link);
    const t = stubTarget();
    renderLinks(s, t);
    expect(t.stroke).toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Block-arrow link (lineKind = "block-arrow")
// ---------------------------------------------------------------------------
describe("renderLinks — block-arrow lineKind", () => {
  it("emits fill for a block-arrow edge", () => {
    const link: Link = baseLink("a", "b", {
      lineKind: "block-arrow",
      blockArrow: { headLength: 20, bodyThickness: 10 },
      style: { fill: "#f00", stroke: "#c00" },
    });
    const s = sceneWith(link);
    const t = stubTarget();
    renderLinks(s, t);
    expect(t.fill).toHaveBeenCalled();
  });

  it("block-arrow emits setFill with fill color from style", () => {
    const link: Link = baseLink("a", "b", {
      lineKind: "block-arrow",
      style: { fill: "#abc", stroke: "#cba" },
    });
    const s = sceneWith(link);
    const t = stubTarget();
    renderLinks(s, t);
    expect(t.setFill).toHaveBeenCalledWith("#abc");
  });

  it("block-arrow falls back to stroke color for fill when fill not set", () => {
    const link: Link = baseLink("a", "b", {
      lineKind: "block-arrow",
      style: { stroke: "#abc" },
    });
    const s = sceneWith(link);
    const t = stubTarget();
    renderLinks(s, t);
    // fill = edge.style.fill ?? edge.style.stroke ?? "#444"
    expect(t.setFill).toHaveBeenCalledWith("#abc");
  });

  it("block-arrow emits stroke when strokeWidth > 0", () => {
    const link: Link = baseLink("a", "b", {
      lineKind: "block-arrow",
      style: { stroke: "#000", strokeWidth: 2 },
    });
    const s = sceneWith(link);
    const t = stubTarget();
    renderLinks(s, t);
    expect(t.stroke).toHaveBeenCalled();
  });

  it("block-arrow sets opacity from style", () => {
    const link: Link = baseLink("a", "b", {
      lineKind: "block-arrow",
      style: { stroke: "#000", opacity: 0.5 },
    });
    const s = sceneWith(link);
    const t = stubTarget();
    renderLinks(s, t);
    expect(t.setOpacity).toHaveBeenCalledWith(0.5);
  });
});

// ---------------------------------------------------------------------------
// Edge label / caption
// ---------------------------------------------------------------------------
describe("renderLinks — edge label", () => {
  it("emits fillText with label text when edge has a label", () => {
    const link: Link = baseLink("a", "b", {
      label: { text: "flows to", fontSize: 12 },
    });
    const s = sceneWith(link);
    const t = stubTarget();
    renderLinks(s, t);
    expect(t.fillText).toHaveBeenCalledWith("flows to", expect.any(Number), expect.any(Number));
  });

  it("does not call fillText when edge has no label", () => {
    const s = sceneWith(baseLink("a", "b"));
    const t = stubTarget();
    renderLinks(s, t);
    expect(t.fillText).not.toHaveBeenCalled();
  });

  it("draws a background rect behind the label", () => {
    const link: Link = baseLink("a", "b", {
      label: { text: "caption", fontSize: 12 },
    });
    const s = sceneWith(link);
    const t = stubTarget();
    renderLinks(s, t);
    expect(t.rect).toHaveBeenCalled();
  });

  it("label uses custom fill color when specified", () => {
    const link: Link = baseLink("a", "b", {
      label: { text: "hi", fontSize: 12, fill: "#f00" },
    });
    const s = sceneWith(link);
    const t = stubTarget();
    renderLinks(s, t);
    expect(t.setFill).toHaveBeenCalledWith("#f00");
  });

  it("label defaults fill to #222 when not set", () => {
    const link: Link = baseLink("a", "b", {
      label: { text: "hi", fontSize: 12 },
    });
    const s = sceneWith(link);
    const t = stubTarget();
    renderLinks(s, t);
    expect(t.setFill).toHaveBeenCalledWith("#222");
  });

  it("uses setTextAlign center for label", () => {
    const link: Link = baseLink("a", "b", {
      label: { text: "X", fontSize: 12 },
    });
    const s = sceneWith(link);
    const t = stubTarget();
    renderLinks(s, t);
    expect(t.setTextAlign).toHaveBeenCalledWith("center");
  });

  it("label positioned at custom position (0.25 along path)", () => {
    // position=0.25 → point 25% along the path; just verify fillText is called
    const link: Link = baseLink("a", "b", {
      label: { text: "early", fontSize: 12, position: 0.25 },
    });
    const s = sceneWith(link);
    const t = stubTarget();
    renderLinks(s, t);
    expect(t.fillText).toHaveBeenCalledWith("early", expect.any(Number), expect.any(Number));
  });
});

// ---------------------------------------------------------------------------
// Viewport culling
// ---------------------------------------------------------------------------
describe("renderLinks — viewport culling", () => {
  it("skips an edge whose AABB is outside the viewport", () => {
    const s = sceneWith(baseLink("a", "b"), { x: 0, y: 0 }, { x: 200, y: 0 });
    const t = stubTarget();
    // Viewport far away from the edge
    renderLinks(s, t, { viewportWorld: { x: 5000, y: 5000, width: 100, height: 100 } });
    expect(t.stroke).not.toHaveBeenCalled();
  });

  it("draws an edge when viewport intersects its AABB", () => {
    const s = sceneWith(baseLink("a", "b"), { x: 0, y: 0 }, { x: 200, y: 0 });
    const t = stubTarget();
    renderLinks(s, t, { viewportWorld: { x: -50, y: -50, width: 400, height: 200 } });
    expect(t.stroke).toHaveBeenCalled();
  });

  it("dirty rect culling skips edge not in dirty region", () => {
    const s = sceneWith(baseLink("a", "b"), { x: 0, y: 0 }, { x: 200, y: 0 });
    const t = stubTarget();
    renderLinks(s, t, { dirtyWorld: { x: 5000, y: 5000, width: 10, height: 10 } });
    expect(t.stroke).not.toHaveBeenCalled();
  });

  it("dirty rect culling draws edge when dirty region intersects", () => {
    const s = sceneWith(baseLink("a", "b"), { x: 0, y: 0 }, { x: 200, y: 0 });
    const t = stubTarget();
    renderLinks(s, t, { dirtyWorld: { x: -50, y: -50, width: 400, height: 200 } });
    expect(t.stroke).toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Bitmap cache fast path
// ---------------------------------------------------------------------------
describe("renderLinks — bitmap cache", () => {
  it("uses drawImage (cache hit) instead of stroke when bitmap is cached", () => {
    const s = sceneWith(baseLink("a", "b"));
    const t = stubTarget();
    const fakeBitmap = { kind: "fakeBitmap" };
    const bitmapCache = {
      get: vi.fn().mockReturnValue(fakeBitmap),
      set: vi.fn(),
    };
    const rasteriseLink = vi.fn().mockReturnValue(null);
    const opts: RenderLinksOptions = {
      edgeBitmapCache: bitmapCache as never,
      rasteriseLink: rasteriseLink as never,
      viewportWorld: { x: -100, y: -100, width: 600, height: 400 },
    };
    renderLinks(s, t, opts);
    expect(t.drawImage).toHaveBeenCalled();
    expect(t.stroke).not.toHaveBeenCalled();
  });

  it("falls back to stroke on bitmap cache miss (rasteriseLink returns null)", () => {
    const s = sceneWith(baseLink("a", "b"));
    const t = stubTarget();
    const bitmapCache = {
      get: vi.fn().mockReturnValue(undefined),
      set: vi.fn(),
    };
    const rasteriseLink = vi.fn().mockReturnValue(null);
    const opts: RenderLinksOptions = {
      edgeBitmapCache: bitmapCache as never,
      rasteriseLink: rasteriseLink as never,
      viewportWorld: { x: -100, y: -100, width: 600, height: 400 },
    };
    renderLinks(s, t, opts);
    expect(t.stroke).toHaveBeenCalled();
  });

  it("stores fresh rasterised bitmap in cache", () => {
    const s = sceneWith(baseLink("a", "b"));
    const t = stubTarget();
    const fakeBitmap = { kind: "fresh" };
    const bitmapCache = {
      get: vi.fn().mockReturnValue(undefined),
      set: vi.fn(),
    };
    const rasteriseLink = vi.fn().mockReturnValue(fakeBitmap);
    const opts: RenderLinksOptions = {
      edgeBitmapCache: bitmapCache as never,
      rasteriseLink: rasteriseLink as never,
      viewportWorld: { x: -100, y: -100, width: 600, height: 400 },
    };
    renderLinks(s, t, opts);
    expect(bitmapCache.set).toHaveBeenCalled();
    expect(t.drawImage).toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// pointAlongPath — 3-point path (walks cumulative length)
// ---------------------------------------------------------------------------
describe("renderLinks — label along multi-segment path", () => {
  it("positions label on a 3-segment path at t=0.5", () => {
    // 3 waypoints means path has 4 pts — label at midpoint uses cumulative walk
    const link: Link = {
      id: linkId("e-multi"),
      layerId: DEFAULT_LAYER_ID,
      order: orderBetween(null, null),
      from: { kind: "anchor", elementId: elementId("a"), anchor: { kind: "named", name: "right" } },
      to: { kind: "anchor", elementId: elementId("b"), anchor: { kind: "named", name: "left" } },
      routedPoints: [
        { x: 60, y: 10 },
        { x: 60, y: 100 },
        { x: 140, y: 100 },
      ],
      style: { stroke: "#000" },
      label: { text: "mid", fontSize: 12, position: 0.5 },
    };
    let s = emptyScene();
    s = addElement(s, rect("a", 0, 0)).scene;
    s = addElement(s, rect("b", 200, 100)).scene;
    s = addLink(s, link).scene;
    const t = stubTarget();
    renderLinks(s, t);
    // label should have been drawn (no throw + fillText called)
    expect(t.fillText).toHaveBeenCalledWith("mid", expect.any(Number), expect.any(Number));
  });
});

// ---------------------------------------------------------------------------
// arrowheads — from anchor (tip at start of path)
// ---------------------------------------------------------------------------
describe("renderLinks — arrowheads from anchor", () => {
  it("draws arrowhead on the from side when heads.from is set", () => {
    const link: Link = baseLink("a", "b", {
      arrowheads: { from: "triangle" },
    });
    const s = sceneWith(link);
    const t = stubTarget();
    renderLinks(s, t);
    // triangle → moveTo (tip) + 2 lineTo + closePath + stroke
    expect(t.closePath).toHaveBeenCalled();
    expect(t.stroke).toHaveBeenCalled();
  });

  it("does not emit arrowhead primitives when from is 'none'", () => {
    const link: Link = baseLink("a", "b", { arrowheads: { from: "none" } });
    const s = sceneWith(link);
    const t = stubTarget();
    renderLinks(s, t);
    expect(t.closePath).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Hidden layer — edges on hidden layers must be skipped
// ---------------------------------------------------------------------------
describe("renderLinks — hidden layer", () => {
  it("skips edges on a hidden layer", () => {
    const hiddenLayer = {
      id: layerIdFn("hidden"),
      name: "Hidden",
      visible: false,
      locked: false,
      order: orderBetween(null, null),
    };
    let s = emptyScene();
    ({ scene: s } = addLayer(s, hiddenLayer));
    s = addElement(s, { ...rect("a", 0, 0), layerId: hiddenLayer.id }).scene;
    s = addElement(s, { ...rect("b", 200, 0), layerId: hiddenLayer.id }).scene;
    const link: Link = {
      ...baseLink("a", "b"),
      layerId: hiddenLayer.id,
    };
    s = addLink(s, link).scene;
    const t = stubTarget();
    renderLinks(s, t);
    expect(t.stroke).not.toHaveBeenCalled();
  });
});
