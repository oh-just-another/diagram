import {
  addLayer,
  getShape,
  orderForTop,
  removeLink,
  removeLayer,
  removeShape,
  updateLayer,
  updateShape,
  type Layer,
  type Scene,
  type Patch,
} from "@oh-just-another/scene";
import type { LayerId } from "@oh-just-another/types";
import { layerId as castLayerId } from "@oh-just-another/types";
import * as Selection from "../../selection.js";

/**
 * Build a fresh top-of-stack layer + the patch that adds it. Caller
 * assigns activeLayerId and pushes the patch.
 */
export const computeCreateLayer = (
  scene: Scene,
  name: string,
  newLayerId: LayerId,
): { readonly scene: Scene; readonly patch: Patch; readonly layerId: LayerId } => {
  const topOrder = orderForTop([...scene.layers.values()].map((l) => l.order));
  const layer: Layer = { id: newLayerId, name, visible: true, locked: false, order: topOrder };
  const result = addLayer(scene, layer);
  return { scene: result.scene, patch: result.patch, layerId: newLayerId };
};

/**
 * Drop a layer + every shape and edge that lived on it. Returns the
 * next scene, all patches, the next active layer id (topmost remaining
 * if the dropped one was active), and a flag for whether the selection
 * should be cleared.
 *
 * Returns `null` when the layer doesn't exist. Throws when asked to
 * remove the only layer; callers should guard against that beforehand.
 */
export const computeRemoveLayer = (
  scene: Scene,
  id: LayerId,
  currentActive: LayerId,
): {
  scene: Scene;
  patches: Patch[];
  nextActiveLayerId: LayerId;
} | null => {
  if (!scene.layers.has(id)) return null;
  if (scene.layers.size <= 1) {
    throw new Error("Cannot remove the only remaining layer.");
  }
  const patches: Patch[] = [];
  let s = scene;
  for (const shape of [...s.shapes.values()]) {
    if (shape.layerId !== id) continue;
    const r = removeShape(s, shape.id);
    s = r.scene;
    patches.push(r.patch);
  }
  for (const edge of [...s.edges.values()]) {
    if (edge.layerId !== id) continue;
    const r = removeLink(s, edge.id);
    s = r.scene;
    patches.push(r.patch);
  }
  const r = removeLayer(s, id);
  s = r.scene;
  patches.push(r.patch);

  let nextActive = currentActive;
  if (currentActive === id) {
    const top = [...s.layers.values()].sort((a, b) =>
      a.order > b.order ? -1 : a.order < b.order ? 1 : 0,
    )[0];
    if (top) nextActive = top.id;
  }
  return { scene: s, patches, nextActiveLayerId: nextActive };
};

/** Rename a layer. Returns `null` when nothing actually changes. */
export const computeRenameLayer = (
  scene: Scene,
  id: LayerId,
  name: string,
): { readonly scene: Scene; readonly patch: Patch } | null => {
  const layer = scene.layers.get(id);
  if (!layer || layer.name === name) return null;
  const r = updateLayer(scene, id, (l) => ({ ...l, name }));
  return { scene: r.scene, patch: r.patch };
};

/** Flip the `visible` flag. */
export const computeToggleLayerVisibility = (
  scene: Scene,
  id: LayerId,
): { readonly scene: Scene; readonly patch: Patch } | null => {
  if (!scene.layers.has(id)) return null;
  const r = updateLayer(scene, id, (l) => ({ ...l, visible: !l.visible }));
  return { scene: r.scene, patch: r.patch };
};

/** Flip the `locked` flag. */
export const computeToggleLayerLock = (
  scene: Scene,
  id: LayerId,
): { readonly scene: Scene; readonly patch: Patch } | null => {
  if (!scene.layers.has(id)) return null;
  const r = updateLayer(scene, id, (l) => ({ ...l, locked: !l.locked }));
  return { scene: r.scene, patch: r.patch };
};

/**
 * Move every shape in the selection to `targetLayer`. Links are left
 * alone — they stay on whichever layer they were already on;
 * cross-layer edges are valid.
 *
 * Returns `null` when the layer doesn't exist, the selection is empty,
 * or all selected shapes are already on the target layer.
 */
export const computeMoveSelectionToLayer = (
  scene: Scene,
  selection: Selection.Selection,
  targetLayer: LayerId,
): { readonly scene: Scene; readonly patches: Patch[] } | null => {
  if (!scene.layers.has(targetLayer) || selection.size === 0) return null;
  let s = scene;
  const patches: Patch[] = [];
  for (const id of selection) {
    const shape = getShape(s, id);
    if (!shape || shape.layerId === targetLayer) continue;
    const r = updateShape(s, id, (sh) => ({ ...sh, layerId: targetLayer }));
    s = r.scene;
    patches.push(r.patch);
  }
  if (patches.length === 0) return null;
  return { scene: s, patches };
};

/** Generate a fresh layer id with the editor's nextId counter. */
export const newLayerId = (next: number): LayerId =>
  castLayerId(`layer-${next}-${Date.now().toString(36)}`);
