import { describe, expect, it } from "vitest";
import { elementId, layerId, linkId } from "@oh-just-another/types";
import {
  addElement,
  addLink,
  byOrderDesc,
  DEFAULT_LAYER_ID,
  emptyScene,
  orderBetween,
  type Element,
  type Layer,
  type Link,
  type Scene,
} from "@oh-just-another/scene";
import {
  computeCreateLayer,
  computeMoveSelectionToLayer,
  computeRemoveLayer,
  computeRenameLayer,
  computeToggleLayerLock,
  computeToggleLayerVisibility,
  newLayerId,
} from "../src/editor/public/layers.js";
import type { Selection } from "../src/selection.js";

const selectionOf = (ids: ReturnType<typeof elementId>[]): Selection => new Set(ids);
const emptySelection = (): Selection => new Set();

const rect = (id: string, lid = DEFAULT_LAYER_ID): Element => ({
  id: elementId(id),
  layerId: lid,
  type: "rectangle",
  position: { x: 0, y: 0 },
  rotation: 0,
  scale: { x: 1, y: 1 },
  order: orderBetween(null, null),
  style: {},
  width: 50,
  height: 50,
});

const link = (id: string, lid = DEFAULT_LAYER_ID): Link => ({
  id: linkId(id),
  layerId: lid,
  order: orderBetween(null, null),
  from: { kind: "anchor", elementId: elementId("a"), anchor: { kind: "named", name: "right" } },
  to: { kind: "anchor", elementId: elementId("b"), anchor: { kind: "named", name: "left" } },
  style: { stroke: "#000" },
  routing: "orthogonal",
});

/** Add a second layer to a scene and return the new scene + its id. */
const withExtraLayer = (
  scene: Scene,
  id = layerId("extra"),
  patch: Partial<Layer> = {},
): { scene: Scene; id: typeof id } => {
  const top = [...scene.layers.values()].sort(byOrderDesc)[0]?.order ?? orderBetween(null, null);
  const layer: Layer = {
    id,
    name: "Extra",
    visible: true,
    locked: false,
    order: orderBetween(top, null),
    ...patch,
  };
  const layers = new Map(scene.layers);
  layers.set(id, layer);
  return { scene: { ...scene, layers }, id };
};

describe("computeCreateLayer", () => {
  it("adds a fresh top-of-stack layer above the default one", () => {
    const scene = emptyScene();
    const id = layerId("L2");
    const { scene: next, patch, layerId: returnedId } = computeCreateLayer(scene, "Sky", id);

    expect(returnedId).toBe(id);
    expect(next.layers.has(id)).toBe(true);
    const created = next.layers.get(id)!;
    expect(created.name).toBe("Sky");
    expect(created.visible).toBe(true);
    expect(created.locked).toBe(false);
    // New layer is on top of the default layer.
    const def = next.layers.get(DEFAULT_LAYER_ID)!;
    expect(created.order > def.order).toBe(true);
    // The patch describes the layer that was added.
    expect(patch.kind).toBe("layer");
    if (patch.kind === "layer") expect(patch.after?.id).toBe(id);
  });
});

describe("computeRemoveLayer", () => {
  it("returns null when the layer does not exist", () => {
    const scene = emptyScene();
    expect(computeRemoveLayer(scene, layerId("ghost"), DEFAULT_LAYER_ID)).toBeNull();
  });

  it("throws when asked to remove the only remaining layer", () => {
    const scene = emptyScene();
    expect(() => computeRemoveLayer(scene, DEFAULT_LAYER_ID, DEFAULT_LAYER_ID)).toThrow();
  });

  it("drops the layer along with its shapes and links", () => {
    let scene = emptyScene();
    const { scene: withLayer, id } = withExtraLayer(scene);
    scene = withLayer;
    // One shape + one link on the extra layer, one shape on default.
    scene = addElement(scene, rect("onExtra", id)).scene;
    scene = addElement(scene, rect("onDefault")).scene;
    scene = addLink(scene, link("edgeOnExtra", id)).scene;

    const result = computeRemoveLayer(scene, id, DEFAULT_LAYER_ID);
    expect(result).not.toBeNull();
    const { scene: next, patches, nextActiveLayerId } = result!;

    expect(next.layers.has(id)).toBe(false);
    expect(next.elements.has(elementId("onExtra"))).toBe(false);
    expect(next.links.has(linkId("edgeOnExtra"))).toBe(false);
    // The shape on the surviving layer is untouched.
    expect(next.elements.has(elementId("onDefault"))).toBe(true);
    // Patches: one per removed shape, one per removed link, one for the layer.
    expect(patches.length).toBe(3);
    // Active stays put because the removed layer was not the active one.
    expect(nextActiveLayerId).toBe(DEFAULT_LAYER_ID);
  });

  it("retargets the active layer to the topmost survivor when removing the active layer", () => {
    let scene = emptyScene();
    const { scene: withLayer, id } = withExtraLayer(scene);
    scene = withLayer;
    const result = computeRemoveLayer(scene, id, id);
    expect(result).not.toBeNull();
    // Only the default layer survives — it becomes active.
    expect(result!.nextActiveLayerId).toBe(DEFAULT_LAYER_ID);
  });
});

describe("computeRenameLayer", () => {
  it("renames an existing layer", () => {
    const scene = emptyScene();
    const result = computeRenameLayer(scene, DEFAULT_LAYER_ID, "Renamed");
    expect(result).not.toBeNull();
    expect(result!.scene.layers.get(DEFAULT_LAYER_ID)!.name).toBe("Renamed");
  });

  it("returns null when the layer is missing", () => {
    const scene = emptyScene();
    expect(computeRenameLayer(scene, layerId("ghost"), "x")).toBeNull();
  });

  it("returns null when the name is unchanged (no-op)", () => {
    const scene = emptyScene();
    const current = scene.layers.get(DEFAULT_LAYER_ID)!.name;
    expect(computeRenameLayer(scene, DEFAULT_LAYER_ID, current)).toBeNull();
  });
});

describe("computeToggleLayerVisibility", () => {
  it("flips the visible flag", () => {
    const scene = emptyScene();
    expect(scene.layers.get(DEFAULT_LAYER_ID)!.visible).toBe(true);
    const result = computeToggleLayerVisibility(scene, DEFAULT_LAYER_ID);
    expect(result).not.toBeNull();
    expect(result!.scene.layers.get(DEFAULT_LAYER_ID)!.visible).toBe(false);
  });

  it("returns null when the layer is missing", () => {
    expect(computeToggleLayerVisibility(emptyScene(), layerId("ghost"))).toBeNull();
  });
});

describe("computeToggleLayerLock", () => {
  it("flips the locked flag", () => {
    const scene = emptyScene();
    expect(scene.layers.get(DEFAULT_LAYER_ID)!.locked).toBe(false);
    const result = computeToggleLayerLock(scene, DEFAULT_LAYER_ID);
    expect(result).not.toBeNull();
    expect(result!.scene.layers.get(DEFAULT_LAYER_ID)!.locked).toBe(true);
  });

  it("returns null when the layer is missing", () => {
    expect(computeToggleLayerLock(emptyScene(), layerId("ghost"))).toBeNull();
  });
});

describe("computeMoveSelectionToLayer", () => {
  it("returns null when the target layer does not exist", () => {
    let scene = emptyScene();
    scene = addElement(scene, rect("a")).scene;
    const sel = selectionOf([elementId("a")]);
    expect(computeMoveSelectionToLayer(scene, sel, layerId("ghost"))).toBeNull();
  });

  it("returns null when the selection is empty", () => {
    const { scene, id } = withExtraLayer(emptyScene());
    expect(computeMoveSelectionToLayer(scene, emptySelection(), id)).toBeNull();
  });

  it("moves selected shapes onto the target layer", () => {
    let scene = emptyScene();
    const { scene: withLayer, id } = withExtraLayer(scene);
    scene = withLayer;
    scene = addElement(scene, rect("a")).scene;
    scene = addElement(scene, rect("b")).scene;
    const sel = selectionOf([elementId("a"), elementId("b")]);

    const result = computeMoveSelectionToLayer(scene, sel, id);
    expect(result).not.toBeNull();
    expect(result!.scene.elements.get(elementId("a"))!.layerId).toBe(id);
    expect(result!.scene.elements.get(elementId("b"))!.layerId).toBe(id);
    expect(result!.patches.length).toBe(2);
  });

  it("returns null when every selected shape already lives on the target layer", () => {
    let scene = emptyScene();
    const { scene: withLayer, id } = withExtraLayer(scene);
    scene = withLayer;
    scene = addElement(scene, rect("a", id)).scene;
    const sel = selectionOf([elementId("a")]);
    expect(computeMoveSelectionToLayer(scene, sel, id)).toBeNull();
  });
});

describe("newLayerId", () => {
  it("produces a unique, counter-tagged layer id", () => {
    const a = newLayerId(1);
    const b = newLayerId(2);
    expect(a).not.toBe(b);
    expect(String(a)).toContain("layer-1-");
    expect(String(b)).toContain("layer-2-");
  });
});
