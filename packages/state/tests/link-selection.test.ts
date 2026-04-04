import { describe, expect, it } from "vitest";
import { elementId, linkId } from "@oh-just-another/types";
import {
  DEFAULT_LAYER_ID,
  addElement,
  addLink,
  emptyScene,
  orderBetween,
  type Scene,
  type Element,
  type Link,
} from "@oh-just-another/scene";
import { Editor } from "../src/editor.js";

const rect = (id: string, x: number): Element => ({
  id: elementId(id),
  layerId: DEFAULT_LAYER_ID,
  type: "rectangle",
  position: { x, y: 0 },
  rotation: 0,
  scale: { x: 1, y: 1 },
  order: orderBetween(null, null),
  style: { fill: "#000" },
  width: 40,
  height: 40,
});

// Bound connector A↔B (floating endpoints).
const boundLink: Link = {
  id: linkId("LB"),
  layerId: DEFAULT_LAYER_ID,
  from: { kind: "floating", elementId: elementId("a") },
  to: { kind: "floating", elementId: elementId("b") },
  routing: "straight",
  order: orderBetween(null, null),
  style: { stroke: "#000" },
};

// Free point-to-point connector, far bottom-right (no element bindings).
const freeLink: Link = {
  id: linkId("LF"),
  layerId: DEFAULT_LAYER_ID,
  from: { kind: "point", position: { x: 300, y: 300 } },
  to: { kind: "point", position: { x: 340, y: 340 } },
  routing: "straight",
  order: orderBetween(null, null),
  style: { stroke: "#000" },
};

const buildScene = (): Scene => {
  let s = emptyScene();
  s = addElement(s, rect("a", 0)).scene;
  s = addElement(s, rect("b", 200)).scene;
  s = addLink(s, boundLink).scene;
  s = addLink(s, freeLink).scene;
  return s;
};

const noopTarget = {
  save: () => {}, restore: () => {}, setTransform: () => {}, clear: () => {},
  setFill: () => {}, setStroke: () => {}, setStrokeWidth: () => {},
  setOpacity: () => {}, setLineCap: () => {}, setLineJoin: () => {},
  setDashArray: () => {}, setFont: () => {}, setTextAlign: () => {},
  setTextBaseline: () => {}, beginPath: () => {}, closePath: () => {},
  moveTo: () => {}, lineTo: () => {}, quadraticCurveTo: () => {},
  bezierCurveTo: () => {}, rect: () => {}, ellipse: () => {},
  fill: () => {}, stroke: () => {}, fillText: () => {},
  measureText: () => ({ width: 0 }), drawImage: () => {},
  translate: () => {}, rotate: () => {}, scale: () => {},
  resetTransform: () => {}, size: { width: 800, height: 600 },
} as never;

const makeEditor = () => {
  const host = {
    addEventListener: () => {}, removeEventListener: () => {},
    setPointerCapture: () => {}, releasePointerCapture: () => {},
    hasPointerCapture: () => true,
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 800, height: 600 }),
    style: { cursor: "" },
  } as never;
  return new Editor({
    host, mainTarget: noopTarget, overlayTarget: noopTarget, initialScene: buildScene(),
  });
};

const LB = linkId("LB");
const LF = linkId("LF");
const A = elementId("a");
const B = elementId("b");

describe("links as first-class selection members", () => {
  it("Cmd+A (selectAll) selects both elements AND links", () => {
    const ed = makeEditor();
    ed.selectAll();
    expect(new Set(ed.selection)).toEqual(new Set([A, B]));
    expect(new Set(ed.selectedLinks)).toEqual(new Set([LB, LF]));
  });

  it("delete after select-all removes every element and link (incl. unbound)", () => {
    const ed = makeEditor();
    ed.selectAll();
    ed.deleteSelected();
    expect(ed.scene.elements.size).toBe(0);
    expect(ed.scene.links.size).toBe(0);
  });

  it("an unbound link can be selected and deleted on its own", () => {
    const ed = makeEditor();
    ed.applyEmit({ type: "SELECT_EDGE_REPLACE", id: LF });
    expect(new Set(ed.selectedLinks)).toEqual(new Set([LF]));
    ed.deleteSelected();
    expect(ed.scene.links.has(LF)).toBe(false);
    expect(ed.scene.links.has(LB)).toBe(true); // the other link survives
  });

  it("shift-click (SELECT_EDGE_TOGGLE) accumulates multiple links", () => {
    const ed = makeEditor();
    ed.applyEmit({ type: "SELECT_EDGE_REPLACE", id: LB });
    ed.applyEmit({ type: "SELECT_EDGE_TOGGLE", id: LF });
    expect(new Set(ed.selectedLinks)).toEqual(new Set([LB, LF]));
    // toggling LB off leaves LF
    ed.applyEmit({ type: "SELECT_EDGE_TOGGLE", id: LB });
    expect(new Set(ed.selectedLinks)).toEqual(new Set([LF]));
  });

  it("links and elements coexist in one selection", () => {
    const ed = makeEditor();
    ed.applyEmit({ type: "SELECT_REPLACE", id: A });
    ed.applyEmit({ type: "SELECT_EDGE_TOGGLE", id: LB }); // shift-click link keeps element
    expect(new Set(ed.selection)).toEqual(new Set([A]));
    expect(new Set(ed.selectedLinks)).toEqual(new Set([LB]));
    // plain element click replaces everything (clears links)
    ed.applyEmit({ type: "SELECT_REPLACE", id: B });
    expect(new Set(ed.selection)).toEqual(new Set([B]));
    expect(ed.selectedLinks.size).toBe(0);
  });

  it("`selectedLink` (sole) is set only for a single link with no elements", () => {
    const ed = makeEditor();
    ed.applyEmit({ type: "SELECT_EDGE_REPLACE", id: LB });
    expect(ed.selectedLink).toBe(LB);
    // add a second link → no sole link
    ed.applyEmit({ type: "SELECT_EDGE_TOGGLE", id: LF });
    expect(ed.selectedLink).toBeNull();
    // back to one link, then add an element → still no sole link
    ed.applyEmit({ type: "SELECT_EDGE_REPLACE", id: LB });
    ed.applyEmit({ type: "SELECT_TOGGLE", id: A });
    expect(ed.selectedLink).toBeNull();
  });

  it("marquee captures a link only when its whole path is inside the box", () => {
    const ed = makeEditor();
    // Box around the free link (points 300..340) but not the bound link (0..240).
    ed.applyEmit({
      type: "SELECT_BY_BOUNDS",
      bounds: { x: 290, y: 290, width: 60, height: 60 },
      mode: "replace",
    });
    expect(new Set(ed.selectedLinks)).toEqual(new Set([LF]));
    expect(ed.selection.size).toBe(0);
  });
});
