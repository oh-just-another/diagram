/**
 * "Shapes and lines" flyout backing: `armShapeTool` / `armLineTool`
 * arm the drawing modes with a shape kind / connector preset, the
 * create pipeline honours them, and any plain tool switch resets both.
 */
import { describe, expect, it } from "vitest";
import { emptyScene, type Scene } from "@oh-just-another/scene";
import { Editor } from "../src/editor.js";
import { buildElementForCreate, computeCreateLink } from "../src/editor/applies/create.js";
import { LINK_DRAW_PRESETS } from "../src/constants.js";
import { DEFAULT_LAYER_ID, addElement, orderBetween } from "@oh-just-another/scene";
import { elementId, layerId as castLayerId, linkId } from "@oh-just-another/types";

const noop = () => undefined;
const targetBase: Record<string, unknown> = { measureText: () => ({ width: 0 }) };
const noopTarget = new Proxy(targetBase, {
  get: (o, k: string) => (k in o ? o[k] : noop),
}) as never;
const host = () =>
  ({
    addEventListener: noop,
    removeEventListener: noop,
    setPointerCapture: noop,
    releasePointerCapture: noop,
    hasPointerCapture: () => true,
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 800, height: 600 }),
    style: { cursor: "" },
  }) as never;

const makeEditor = (scene: Scene = emptyScene()): Editor =>
  new Editor({
    host: host(),
    mainTarget: noopTarget,
    overlayTarget: noopTarget,
    initialScene: scene,
  });

const LAYER = castLayerId(DEFAULT_LAYER_ID);

describe("armShapeTool / armLineTool", () => {
  it("arms draw-rect with a diamond kind; a plain tool switch resets it", () => {
    const e = makeEditor();
    e.armShapeTool("diamond");
    expect(e.activeTool.type).toBe("draw-rect");
    expect(e.drawShapeKind).toBe("diamond");
    e.setActiveTool("draw-rect"); // hotkey R — stock rectangle
    expect(e.drawShapeKind).toBe("rect");
  });

  it("arms draw-edge with a line preset; switching away resets it", () => {
    const e = makeEditor();
    e.armLineTool("line");
    expect(e.activeTool.type).toBe("draw-edge");
    expect(e.linkDrawPreset).toBe("line");
    e.setActiveTool("select");
    expect(e.linkDrawPreset).toBeNull();
  });
});

describe("buildElementForCreate diamond / triangle", () => {
  const bounds = { x: 10, y: 20, width: 60, height: 40 };

  it("diamond → polygon with 4 inscribed points", () => {
    const el = buildElementForCreate(
      emptyScene(),
      "diamond",
      bounds,
      elementId("d"),
      LAYER,
      () => "",
    ) as unknown as { type: string; points: { x: number; y: number }[] };
    expect(el.type).toBe("polygon");
    expect(el.points).toHaveLength(4);
    expect(el.points).toContainEqual({ x: 30, y: 0 });
    expect(el.points).toContainEqual({ x: 60, y: 20 });
  });

  it("triangle → polygon with 3 inscribed points", () => {
    const el = buildElementForCreate(
      emptyScene(),
      "triangle",
      bounds,
      elementId("t"),
      LAYER,
      () => "",
    ) as unknown as { type: string; points: { x: number; y: number }[] };
    expect(el.type).toBe("polygon");
    expect(el.points).toEqual([
      { x: 30, y: 0 },
      { x: 60, y: 40 },
      { x: 0, y: 40 },
    ]);
  });
});

describe("computeCreateLink presets", () => {
  const sceneWithNodes = (): Scene => {
    let s = emptyScene();
    for (const id of ["a", "b"]) {
      ({ scene: s } = addElement(s, {
        id: elementId(id),
        layerId: DEFAULT_LAYER_ID,
        type: "rectangle",
        position: { x: id === "a" ? 0 : 200, y: 0 },
        rotation: 0,
        scale: { x: 1, y: 1 },
        order: orderBetween(null, null),
        style: {},
        width: 40,
        height: 40,
      }));
    }
    return s;
  };
  const ends = () =>
    [
      { kind: "point", position: { x: 0, y: 0 } },
      { kind: "point", position: { x: 100, y: 0 } },
    ] as const;

  it("line: straight routing, no arrowhead", () => {
    const [from, to] = ends();
    const r = computeCreateLink(
      sceneWithNodes(),
      from,
      to,
      linkId("l1"),
      LAYER,
      LINK_DRAW_PRESETS.line,
    );
    const edge = r.scene.links.get(linkId("l1"))!;
    expect(edge.routing).toBe("straight");
    expect(edge.arrowheads).toBeUndefined();
  });

  it("arrow: straight routing with the default arrowhead", () => {
    const [from, to] = ends();
    const r = computeCreateLink(
      sceneWithNodes(),
      from,
      to,
      linkId("l2"),
      LAYER,
      LINK_DRAW_PRESETS.arrow,
    );
    const edge = r.scene.links.get(linkId("l2"))!;
    expect(edge.routing).toBe("straight");
    expect(edge.arrowheads?.to).toBe("triangle");
  });

  it("no preset keeps the stock defaults (elbow + arrowhead)", () => {
    const [from, to] = ends();
    const r = computeCreateLink(sceneWithNodes(), from, to, linkId("l3"), LAYER);
    const edge = r.scene.links.get(linkId("l3"))!;
    expect(edge.routing).toBe("orthogonal");
    expect(edge.arrowheads?.to).toBe("triangle");
  });
});
