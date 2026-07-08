import { describe, expect, it } from "vitest";
import { elementId, linkId } from "@oh-just-another/types";
import {
  DEFAULT_LAYER_ID,
  addElement,
  emptyScene,
  getElement,
  isEllipse,
  isImage,
  isPolygon,
  isRectangle,
  orderBetween,
  type Element,
  type Scene,
} from "@oh-just-another/scene";
import {
  FULL_CROP,
  clampCrop,
  computeConvertType,
  computeSetImageCrop,
  computeSpawnConnectedNode,
  cropRectFromWorldDrag,
  pickColorAt,
} from "../src/editor/public/tool-ops.js";

// Pure-operation coverage for the F8–F11 tool operations. Each function is a
// pure `(scene, …) → result | null`, so the tests build a scene, run the op,
// and assert on the returned scene without touching the editor / DOM.

const rect = (id: string, x = 0, y = 0, style: Element["style"] = {}): Element => ({
  id: elementId(id),
  layerId: DEFAULT_LAYER_ID,
  type: "rectangle",
  position: { x, y },
  rotation: 0,
  scale: { x: 1, y: 1 },
  order: orderBetween(null, null),
  style,
  width: 60,
  height: 40,
});

const image = (id: string, x = 0, y = 0): Element => ({
  id: elementId(id),
  layerId: DEFAULT_LAYER_ID,
  type: "image",
  position: { x, y },
  rotation: 0,
  scale: { x: 1, y: 1 },
  order: orderBetween(null, null),
  style: {},
  src: "data:image/png;base64,AAAA",
  width: 100,
  height: 80,
});

const sceneWith = (...els: Element[]): Scene => {
  let s = emptyScene();
  for (const e of els) s = addElement(s, e).scene;
  return s;
};

describe("pickColorAt (F8 eyedropper)", () => {
  it("returns the fill of the shape under the point", () => {
    const s = sceneWith(rect("r", 0, 0, { fill: "#ff0000" }));
    expect(pickColorAt(s, { x: 10, y: 10 })).toBe("#ff0000");
  });

  it("falls back to stroke when there is no fill", () => {
    const s = sceneWith(rect("r", 0, 0, { stroke: "#00ff00" }));
    expect(pickColorAt(s, { x: 10, y: 10 })).toBe("#00ff00");
  });

  it("samples stroke first when role is stroke", () => {
    const s = sceneWith(rect("r", 0, 0, { fill: "#ff0000", stroke: "#0000ff" }));
    expect(pickColorAt(s, { x: 10, y: 10 }, "stroke")).toBe("#0000ff");
  });

  it("returns null on empty canvas", () => {
    const s = sceneWith(rect("r", 0, 0, { fill: "#ff0000" }));
    expect(pickColorAt(s, { x: 500, y: 500 })).toBeNull();
  });
});

describe("computeConvertType (F9 convert)", () => {
  it("converts a rectangle to an ellipse, preserving box + style", () => {
    const s = sceneWith(rect("r", 5, 7, { fill: "#abc" }));
    const res = computeConvertType(s, [elementId("r")], "ellipse");
    expect(res).not.toBeNull();
    const el = getElement(res!.scene, elementId("r"))!;
    expect(isEllipse(el)).toBe(true);
    expect(el.position).toEqual({ x: 5, y: 7 });
    expect(el.style.fill).toBe("#abc");
    expect((el as { width: number }).width).toBe(60);
    expect((el as { height: number }).height).toBe(40);
    expect("points" in el).toBe(false);
  });

  it("converts a rectangle to a diamond polygon with 4 points", () => {
    const s = sceneWith(rect("r"));
    const res = computeConvertType(s, [elementId("r")], "polygon");
    const el = getElement(res!.scene, elementId("r"))!;
    expect(isPolygon(el)).toBe(true);
    const pts = (el as unknown as { points: { x: number; y: number }[] }).points;
    expect(pts).toHaveLength(4);
    expect(pts).toContainEqual({ x: 30, y: 0 });
    expect(pts).toContainEqual({ x: 60, y: 20 });
    expect("width" in el).toBe(false);
  });

  it("round-trips rect → diamond → rect with the same footprint", () => {
    const s = sceneWith(rect("r"));
    const toDiamond = computeConvertType(s, [elementId("r")], "polygon")!;
    const back = computeConvertType(toDiamond.scene, [elementId("r")], "rectangle")!;
    const el = getElement(back.scene, elementId("r"))!;
    expect(isRectangle(el)).toBe(true);
    expect((el as { width: number }).width).toBe(60);
    expect((el as { height: number }).height).toBe(40);
  });

  it("skips shapes already of the target type and non-convertible types", () => {
    const s = sceneWith(rect("r"), image("i"));
    expect(computeConvertType(s, [elementId("r")], "rectangle")).toBeNull();
    expect(computeConvertType(s, [elementId("i")], "ellipse")).toBeNull();
  });
});

describe("clampCrop + computeSetImageCrop (F10 crop)", () => {
  it("clamps out-of-range crop into the unit square", () => {
    expect(clampCrop({ x: -0.2, y: 0.5, width: 2, height: 0.9 })).toEqual({
      x: 0,
      y: 0.5,
      width: 1,
      height: 0.5,
    });
  });

  it("sets a crop on an image", () => {
    const s = sceneWith(image("i"));
    const crop = { x: 0.1, y: 0.1, width: 0.5, height: 0.5 };
    const res = computeSetImageCrop(s, elementId("i"), crop);
    expect(res).not.toBeNull();
    const el = getElement(res!.scene, elementId("i"))!;
    expect(isImage(el)).toBe(true);
    expect((el as { crop?: unknown }).crop).toEqual(crop);
  });

  it("clears the crop when set to the full image or null", () => {
    let s = sceneWith(image("i"));
    s = computeSetImageCrop(s, elementId("i"), { x: 0.2, y: 0.2, width: 0.5, height: 0.5 })!.scene;
    const full = computeSetImageCrop(s, elementId("i"), FULL_CROP);
    expect((getElement(full!.scene, elementId("i"))! as { crop?: unknown }).crop).toBeUndefined();
    const cleared = computeSetImageCrop(s, elementId("i"), null);
    expect(
      (getElement(cleared!.scene, elementId("i"))! as { crop?: unknown }).crop,
    ).toBeUndefined();
  });

  it("returns null for non-images and unchanged crops", () => {
    const s = sceneWith(rect("r"), image("i"));
    expect(computeSetImageCrop(s, elementId("r"), FULL_CROP)).toBeNull();
    expect(computeSetImageCrop(s, elementId("i"), null)).toBeNull();
  });

  it("maps a world drag into a normalised crop rect", () => {
    const img = image("i", 0, 0); // 100 × 80 at origin, scale 1
    // Drag from (25,20) to (75,60) → normalised (0.25,0.25)-(0.75,0.75).
    const crop = cropRectFromWorldDrag(img, { x: 25, y: 20 }, { x: 75, y: 60 });
    expect(crop.x).toBeCloseTo(0.25);
    expect(crop.y).toBeCloseTo(0.25);
    expect(crop.width).toBeCloseTo(0.5);
    expect(crop.height).toBeCloseTo(0.5);
  });
});

describe("computeSpawnConnectedNode (F11 flowchart)", () => {
  it("spawns a clone to the right and links source → clone", () => {
    const s = sceneWith(rect("src", 0, 0));
    const res = computeSpawnConnectedNode(
      s,
      elementId("src"),
      "right",
      elementId("new"),
      linkId("edge-1"),
    );
    expect(res).not.toBeNull();
    const clone = getElement(res!.scene, elementId("new"))!;
    expect(clone.type).toBe("rectangle");
    // width 60 + gap 80 = 140 to the right.
    expect(clone.position.x).toBe(140);
    expect(clone.position.y).toBe(0);
    expect(res!.scene.links.size).toBe(1);
    const link = [...res!.scene.links.values()][0]!;
    expect(link.from.kind === "point" ? null : link.from.elementId).toBe(elementId("src"));
    expect(link.to.kind === "point" ? null : link.to.elementId).toBe(elementId("new"));
  });

  it("offsets up / down / left by size + gap", () => {
    const s = sceneWith(rect("src", 100, 100));
    const up = computeSpawnConnectedNode(s, elementId("src"), "up", elementId("u"), linkId("e-u"))!;
    // height 40 + gap 80 = 120 up.
    expect(getElement(up.scene, elementId("u"))!.position).toEqual({ x: 100, y: -20 });
  });

  it("returns null for a missing source", () => {
    const s = sceneWith(rect("src"));
    expect(
      computeSpawnConnectedNode(s, elementId("ghost"), "right", elementId("n"), linkId("e")),
    ).toBeNull();
  });
});
