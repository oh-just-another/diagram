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
  computeCommitImageCrop,
  computeCropBodyPan,
  computeCropHandleDrag,
  computeSpawnConnectedNode,
  computeSpawnConnectedNodes,
  cropFullImageLocalRect,
  cropHandleWorldPoints,
  pickColorAt,
  type CropHandle,
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
});

describe("Excalidraw-style crop geometry (F10)", () => {
  // 100 × 80 image at the origin, scale 1, no rotation.
  const uncropped = () => image("i", 0, 0);
  // Same image already cropped to its centre half.
  const cropped = () => ({ ...uncropped(), crop: { x: 0.25, y: 0.25, width: 0.5, height: 0.5 } });

  it("cropFullImageLocalRect: uncropped image spans exactly the box", () => {
    const full = cropFullImageLocalRect(uncropped(), FULL_CROP);
    expect(full).toEqual({ x: 0, y: 0, width: 100, height: 80 });
  });

  it("cropFullImageLocalRect: cropped image extends beyond the window", () => {
    // crop covers the middle 50%, so the full bitmap is 2× the window and the
    // window sits 25% in from the top-left of the virtual full image.
    const full = cropFullImageLocalRect(cropped(), cropped().crop);
    expect(full.width).toBeCloseTo(200);
    expect(full.height).toBeCloseTo(160);
    expect(full.x).toBeCloseTo(-50); // -0.25 * 200
    expect(full.y).toBeCloseTo(-40); // -0.25 * 160
  });

  it("cropHandleWorldPoints: 8 handles around the box", () => {
    const pts = cropHandleWorldPoints(uncropped());
    expect(pts.nw).toEqual({ x: 0, y: 0 });
    expect(pts.ne).toEqual({ x: 100, y: 0 });
    expect(pts.se).toEqual({ x: 100, y: 80 });
    expect(pts.sw).toEqual({ x: 0, y: 80 });
    expect(pts.n).toEqual({ x: 50, y: 0 });
    expect(pts.e).toEqual({ x: 100, y: 40 });
  });

  it("handle drag: dragging the W edge shrinks the window, opposite edge fixed", () => {
    // Drag the west (left) edge inward to x = 20.
    const r = computeCropHandleDrag(uncropped(), FULL_CROP, "w", { x: 20, y: 40 });
    // Right edge stays at 100 → width 80, position moves to x = 20.
    expect(r.width).toBeCloseTo(80);
    expect(r.height).toBeCloseTo(80);
    expect(r.position).toEqual({ x: 20, y: 0 });
    // crop.x = 0.2 (20/100), width 0.8.
    expect(r.crop.x).toBeCloseTo(0.2);
    expect(r.crop.width).toBeCloseTo(0.8);
    expect(r.crop.y).toBeCloseTo(0);
    expect(r.crop.height).toBeCloseTo(1);
  });

  it("handle drag: source is not stretched (source-px per local unit constant)", () => {
    const img = uncropped(); // natural 100 wide maps across full 100 local units
    const r = computeCropHandleDrag(img, FULL_CROP, "e", { x: 60, y: 40 });
    // Window now 60 wide showing crop.width 0.6 → 60 source px across 60 local
    // units = 1 src-px/unit, same as before the drag (100 px / 100 units).
    const srcPxPerUnit = (r.crop.width * 100) / r.width;
    expect(srcPxPerUnit).toBeCloseTo(1);
  });

  it("handle drag: min-size clamp stops the window collapsing", () => {
    // Drag the east edge past the west edge — clamps to CROP_MIN_SIZE (10).
    const r = computeCropHandleDrag(uncropped(), FULL_CROP, "e", { x: -50, y: 40 });
    expect(r.width).toBeCloseTo(10);
    expect(r.position.x).toBeCloseTo(0);
  });

  it("handle drag: dragging back out to the full extent restores a full crop", () => {
    // Start cropped, drag the west handle back out past the virtual full edge.
    const img = cropped();
    const r = computeCropHandleDrag(img, img.crop, "w", { x: -999, y: 40 });
    // Clamped to the full-image left edge (x = -50) → crop.x → 0.
    expect(r.crop.x).toBeCloseTo(0);
    expect(r.position.x).toBeCloseTo(-50);
  });

  it("handle drag: corner moves both edges", () => {
    const r = computeCropHandleDrag(uncropped(), FULL_CROP, "se", { x: 70, y: 50 });
    expect(r.width).toBeCloseTo(70);
    expect(r.height).toBeCloseTo(50);
    expect(r.position).toEqual({ x: 0, y: 0 });
    expect(r.crop.width).toBeCloseTo(0.7);
    expect(r.crop.height).toBeCloseTo(0.625);
  });

  it("body pan: shifts crop.x/y only, bounds unchanged, clamped", () => {
    const img = cropped(); // full 200×160, window at crop (0.25,0.25,0.5,0.5)
    // Drag body right by 20 world units → source moves left → crop.x decreases.
    const r = computeCropBodyPan(img, img.crop, { x: 50, y: 40 }, { x: 70, y: 40 });
    expect(r.crop.x).toBeCloseTo(0.25 - 20 / 200); // 0.15
    expect(r.crop.y).toBeCloseTo(0.25);
    expect(r.crop.width).toBeCloseTo(0.5);
    expect(r.crop.height).toBeCloseTo(0.5);
  });

  it("body pan: clamps at the image edge", () => {
    const img = cropped();
    // Huge leftward-content drag → crop.x cannot exceed 1 - width = 0.5.
    const r = computeCropBodyPan(img, img.crop, { x: 0, y: 40 }, { x: -9999, y: 40 });
    expect(r.crop.x).toBeCloseTo(0.5);
  });

  it("computeCommitImageCrop: writes crop + box atomically, clears when full", () => {
    const s = sceneWith(uncropped());
    const committed = computeCommitImageCrop(s, elementId("i"), {
      crop: { x: 0.2, y: 0, width: 0.8, height: 1 },
      position: { x: 20, y: 0 },
      width: 80,
      height: 80,
    });
    const el = getElement(committed!.scene, elementId("i"))! as {
      crop?: unknown;
      position: { x: number };
      width: number;
    };
    expect((el.crop as { x: number }).x).toBeCloseTo(0.2);
    expect(el.position.x).toBe(20);
    expect(el.width).toBe(80);
    // A full crop clears the field but still writes the box.
    const full = computeCommitImageCrop(committed!.scene, elementId("i"), {
      crop: FULL_CROP,
      position: { x: 0, y: 0 },
      width: 100,
      height: 80,
    });
    expect((getElement(full!.scene, elementId("i"))! as { crop?: unknown }).crop).toBeUndefined();
  });

  it("handle drag honours rotation via worldToLocal", () => {
    const img = { ...uncropped(), rotation: Math.PI / 2 };
    // With a 90° rotation, world (-60, 0) maps to local (0, 60). Dragging the
    // south (bottom) handle there shrinks the LOCAL height to 60.
    const handle: CropHandle = "s";
    const r = computeCropHandleDrag(img, FULL_CROP, handle, { x: -60, y: 0 });
    expect(r.width).toBeCloseTo(100);
    expect(r.height).toBeCloseTo(60);
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

describe("computeSpawnConnectedNodes (flowchart create session)", () => {
  const idGen = (prefix: string): (() => ReturnType<typeof elementId>) => {
    let n = 0;
    return () => elementId(`${prefix}-${++n}`);
  };
  const linkGen = (prefix: string): (() => ReturnType<typeof linkId>) => {
    let n = 0;
    return () => linkId(`${prefix}-${++n}`);
  };

  it("count=1 matches the single-node placement of computeSpawnConnectedNode", () => {
    const s = sceneWith(rect("src", 0, 0));
    const single = computeSpawnConnectedNode(
      s,
      elementId("src"),
      "right",
      elementId("e-1"),
      linkId("l-1"),
    )!;
    const many = computeSpawnConnectedNodes(
      s,
      elementId("src"),
      "right",
      1,
      idGen("e"),
      linkGen("l"),
    );
    expect(many.elements).toHaveLength(1);
    expect(many.links).toHaveLength(1);
    expect(many.elements[0]!.position).toEqual(
      getElement(single.scene, elementId("e-1"))!.position,
    );
  });

  it("stacks N right-siblings vertically centred on the source", () => {
    const s = sceneWith(rect("src", 0, 0)); // width 60, height 40
    const { elements, links } = computeSpawnConnectedNodes(
      s,
      elementId("src"),
      "right",
      3,
      idGen("e"),
      linkGen("l"),
    );
    expect(elements).toHaveLength(3);
    expect(links).toHaveLength(3);
    // All offset +140 in x (width 60 + gap 80); y spread by step = height 40 + gap 80 = 120,
    // centred → -120, 0, +120.
    expect(elements.map((e) => e.position.x)).toEqual([140, 140, 140]);
    expect(elements.map((e) => e.position.y)).toEqual([-120, 0, 120]);
    // Each link connects source → its sibling (floating).
    for (let i = 0; i < 3; i++) {
      const from = links[i]!.from;
      const to = links[i]!.to;
      expect(from.kind === "point" ? null : from.elementId).toBe(elementId("src"));
      expect(to.kind === "point" ? null : to.elementId).toBe(elements[i]!.id);
    }
  });

  it("spreads down-siblings horizontally centred on the source", () => {
    const s = sceneWith(rect("src", 100, 100));
    const { elements } = computeSpawnConnectedNodes(
      s,
      elementId("src"),
      "down",
      2,
      idGen("e"),
      linkGen("l"),
    );
    // y offset +120 (height 40 + gap 80); x step = width 60 + gap 80 = 140, centred for N=2 → ±70.
    expect(elements.map((e) => e.position.y)).toEqual([220, 220]);
    expect(elements.map((e) => e.position.x)).toEqual([30, 170]);
  });

  it("does not mutate the source scene (pure)", () => {
    const s = sceneWith(rect("src", 0, 0));
    computeSpawnConnectedNodes(s, elementId("src"), "right", 3, idGen("e"), linkGen("l"));
    expect(s.elements.size).toBe(1);
    expect(s.links.size).toBe(0);
  });

  it("returns empty arrays for a missing source", () => {
    const s = sceneWith(rect("src"));
    const res = computeSpawnConnectedNodes(
      s,
      elementId("ghost"),
      "right",
      2,
      idGen("e"),
      linkGen("l"),
    );
    expect(res.elements).toHaveLength(0);
    expect(res.links).toHaveLength(0);
  });
});
